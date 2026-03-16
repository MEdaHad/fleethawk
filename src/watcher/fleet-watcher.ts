import * as fs from 'fs';
import * as path from 'path';
import { dispatchAlert } from '../alerter/alerter';
import { FleetHawkConfig, FleetState, AgentScanResult, AlertPayload } from '../config/types';
import { AgentScanner } from '../scanner/agent-scanner';
import { parseDuration, formatDuration } from '../utils/duration';
import { log } from '../utils/logger';
import { runDoctorChecks } from '../doctor';

const STATE_FILE = '.fleethawk-state.json';

export class FleetWatcher {
  private state: FleetState;
  private statePath: string;
  private idleThresholdMs: number;
  private pollIntervalMs: number;
  private doctorIntervalMs: number;

  constructor(private config: FleetHawkConfig) {
    this.statePath = path.join(config.fleet_dir || process.cwd(), STATE_FILE);
    this.state = this.loadState();
    this.idleThresholdMs = parseDuration(config.idle_threshold);
    this.pollIntervalMs = parseDuration(config.poll_interval);
    this.doctorIntervalMs = parseDuration(config.doctor_interval || '30m');
  }

  async start(): Promise<void> {
    log.info(`Watching ${this.config.agents.length} agents`);
    await this.runScanCycle(false);
    setInterval(() => {
      void this.runScanCycle(false);
    }, this.pollIntervalMs);
  }

  async startMonitorMode(): Promise<void> {
    log.info(`Monitor mode active for ${this.config.agents.length} agents`);
    await this.runScanCycle(true);
    setInterval(() => {
      void this.runScanCycle(true);
    }, this.pollIntervalMs);
  }

  private async runScanCycle(includeDoctor: boolean): Promise<void> {
    for (const agent of this.config.agents) {
      const previousState = this.state.agents[agent.name] || null;
      const scanner = new AgentScanner(agent, previousState, this.idleThresholdMs);
      const result = await scanner.scan();
      this.state.agents[agent.name] = {
        last_output_at: result.last_output_at?.toISOString() ?? null,
        last_commit_hash: null,
        last_session_line: (previousState?.last_session_line ?? 0) + result.session_messages,
        alerted_at: this.state.agents[agent.name]?.alerted_at ?? null,
      };
      await this.evaluateAndAlert(result);
    }

    if (includeDoctor && shouldRunDoctor(this.state.last_doctor_check, this.doctorIntervalMs)) {
      const doctorResults = await runDoctorChecks(this.config, process.cwd());
      for (const check of doctorResults) {
        if (check.status === 'fail' || check.status === 'warn') {
          await this.sendDedupedAlert(`doctor:${check.name}:${check.message}`, {
            agent_name: 'fleet',
            status: check.status === 'fail' ? 'silent_fail' : 'idle',
            idle_duration_ms: 0,
            details: `${check.name}: ${check.message}`,
            timestamp: new Date(),
          });
        }
      }
      this.state.last_doctor_check = new Date().toISOString();
    }

    this.state.last_check = new Date().toISOString();
    this.saveState();
  }

  private async evaluateAndAlert(result: AgentScanResult): Promise<void> {
    if (result.status === 'active') {
      if (this.state.agents[result.agent_name]) this.state.agents[result.agent_name].alerted_at = null;
      return;
    }

    const details = result.status === 'idle'
      ? `Agent idle for ${formatDuration(Math.max(result.idle_duration_ms, 0))}`
      : result.status === 'silent_fail'
        ? `Agent silent for ${formatDuration(Math.max(result.idle_duration_ms, 0))}`
        : 'Agent has never produced output';

    await this.sendDedupedAlert(`agent:${result.agent_name}:${result.status}:${details}`, {
      agent_name: result.agent_name,
      status: result.status,
      idle_duration_ms: result.idle_duration_ms,
      details,
      timestamp: new Date(),
    });
  }

  private async sendDedupedAlert(key: string, payload: AlertPayload): Promise<void> {
    const alertsSeen = this.state.alerts_seen ?? {};
    const last = alertsSeen[key];
    if (last && Date.now() - new Date(last).getTime() < this.idleThresholdMs) return;
    await dispatchAlert(this.config.alerts, payload);
    this.state.alerts_seen = { ...alertsSeen, [key]: new Date().toISOString() };
  }

  private loadState(): FleetState {
    try {
      if (fs.existsSync(this.statePath)) {
        return JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as FleetState;
      }
    } catch {
      // ignore
    }
    return { last_check: new Date().toISOString(), last_doctor_check: null, agents: {}, alerts_seen: {} };
  }

  private saveState(): void {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }
}

function shouldRunDoctor(lastRun: string | null | undefined, intervalMs: number): boolean {
  if (!lastRun) return true;
  return Date.now() - new Date(lastRun).getTime() >= intervalMs;
}
