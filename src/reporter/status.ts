import chalk from 'chalk';
import Table from 'cli-table3';
import { FleetHawkConfig, AgentScanResult } from '../config/types';
import { AgentScanner } from '../scanner/agent-scanner';
import { parseDuration, formatDuration } from '../utils/duration';
import { statusEmoji } from '../alerter/alerter';

export async function collectStatus(config: FleetHawkConfig): Promise<AgentScanResult[]> {
  const idleMs = parseDuration(config.idle_threshold);
  const results: AgentScanResult[] = [];
  for (const agent of config.agents) {
    const scanner = new AgentScanner(agent, null, idleMs);
    results.push(await scanner.scan());
  }
  return results;
}

export async function printStatus(config: FleetHawkConfig): Promise<void> {
  const results = await collectStatus(config);
  const now = new Date();
  console.log(`\n🦅 ${chalk.bold('FleetHawk Status')} — ${now.toLocaleString()}\n`);

  if (results.length === 0) {
    console.log(chalk.yellow('No agents found. If you use OpenClaw, make sure ~/.openclaw/openclaw.json exists.'));
    return;
  }

  const table = new Table({
    head: ['Agent', 'Model', 'Last Output', 'Idle', 'Files', 'Commits', 'Last Task', 'Status'].map((value) => chalk.bold(value)),
    style: { head: [], border: [] },
    wordWrap: true,
    colWidths: [12, 26, 14, 10, 8, 9, 28, 16],
  });

  for (const result of results) {
    const statusText = colorForStatus(result.status, `${statusEmoji(result.status)} ${result.status}`);
    table.push([
      result.agent_name,
      result.model ?? '—',
      result.last_output_at ? formatTimeAgo(now.getTime() - result.last_output_at.getTime()) : 'never',
      result.idle_duration_ms >= 0 ? formatDuration(result.idle_duration_ms) : 'n/a',
      String(result.files_modified),
      String(result.git_commits),
      result.last_task ?? '—',
      statusText,
    ]);
  }

  console.log(table.toString());
  console.log('');
}

function formatTimeAgo(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function colorForStatus(status: AgentScanResult['status'], value: string): string {
  switch (status) {
    case 'active': return chalk.green(value);
    case 'idle': return chalk.yellow(value);
    case 'silent_fail':
    case 'no_output':
      return chalk.red(value);
  }
}
