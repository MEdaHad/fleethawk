import * as fs from 'fs';
import * as path from 'path';
import { FleetHawkConfig, FleetState, AgentScanResult, AlertPayload } from '../config/types';
import { AgentScanner } from '../scanner/agent-scanner';
import { dispatchAlert } from '../alerter/alerter';
import { parseDuration, formatDuration } from '../utils/duration';
import { log } from '../utils/logger';

const STATE_FILE = '.fleethawk-state.json';

export class FleetWatcher {
  private state: FleetState;
  private statePath: string;
  private idleThresholdMs: number;
  private pollIntervalMs: number;

  constructor(private config: FleetHawkConfig) {
    this.statePath = path.join(config.fleet_dir, STATE_FILE);
    this.state = this.loadState();
    this.idleThresholdMs = parseDuration(config.idle_threshold);
    this.pollIntervalMs = parseDuration(config.poll_interval);
  }

  async start(): Promise<void> {
    log.info(`FleetHawk watching ${this.config.agents.length} agents`);
    log.info(`Idle threshold: ${this.config.idle_threshold} | Poll: ${this.config.poll_interval}`);

    // Initial scan
    await this.runScanCycle();

    // Poll loop
    setInterval(() => this.runScanCycle(), this.pollIntervalMs);

    // Graceful shutdown
    process.on('SIGINT', () => {
      log.info('Shutting down FleetHawk...');
      this.saveState();
      process.exit(0);
    });
  }

  private async runScanCycle(): Promise<void> {
    log.debug('Starting scan cycle...');

    for (const agentConfig of this.config.agents) {
      try {
        const previousState = this.state.agents[agentConfig.name] || null;
        const scanner = new AgentScanner(agentConfig, previousState, this.idleThresholdMs);
        const result = await scanner.scan();

        // Update state
        this.state.agents[agentConfig.name] = {
          last_output_at: result.last_output_at?.toISOString() || null,
          last_commit_hash: null, // TODO: track from git signal
          last_session_line: result.session_messages + (previousState?.last_session_line || 0),
          alerted_at: this.state.agents[agentConfig.name]?.alerted_at || null,
        };

        // Check if alert needed
        await this.evaluateAndAlert(result);
      } catch (err) {
        log.error(`Failed to scan agent ${agentConfig.name}: ${err}`);
      }
    }

    this.state.last_check = new Date().toISOString();
    this.saveState();
  }

  private async evaluateAndAlert(result: AgentScanResult): Promise<void> {
    const { agent_name, status, idle_duration_ms, zero_byte_files } = result;

    if (status === 'active') {
      // Reset alert state if agent recovered
      if (this.state.agents[agent_name]) {
        this.state.agents[agent_name].alerted_at = null;
      }
      return;
    }

    // Don't re-alert for the same idle period
    const lastAlerted = this.state.agents[agent_name]?.alerted_at;
    if (lastAlerted) {
      const timeSinceAlert = Date.now() - new Date(lastAlerted).getTime();
      if (timeSinceAlert < this.idleThresholdMs) return;
    }

    let details = '';
    if (status === 'idle') {
      details = `Agent idle for ${formatDuration(idle_duration_ms)}`;
    } else if (status === 'silent_fail') {
      details = `Agent silent for ${formatDuration(idle_duration_ms)} — likely failed`;
    } else if (status === 'no_output') {
      details = 'Agent has never produced output';
    }

    if (zero_byte_files.length > 0) {
      details += ` | ${zero_byte_files.length} zero-byte files: ${zero_byte_files.slice(0, 3).join(', ')}`;
    }

    const payload: AlertPayload = {
      agent_name,
      status,
      idle_duration_ms,
      details,
      timestamp: new Date(),
    };

    await dispatchAlert(this.config.alerts, payload);

    // Mark as alerted
    if (this.state.agents[agent_name]) {
      this.state.agents[agent_name].alerted_at = new Date().toISOString();
    }
  }

  private loadState(): FleetState {
    try {
      if (fs.existsSync(this.statePath)) {
        return JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
      }
    } catch (err) {
      log.warn(`Failed to load state file, starting fresh: ${err}`);
    }
    return { last_check: new Date().toISOString(), agents: {} };
  }

  private saveState(): void {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      log.error(`Failed to save state: ${err}`);
    }
  }
}
