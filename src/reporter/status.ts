import Table from 'cli-table3';
import chalk from 'chalk';
import { FleetHawkConfig, AgentScanResult } from '../config/types';
import { AgentScanner } from '../scanner/agent-scanner';
import { parseDuration, formatDuration } from '../utils/duration';
import { statusEmoji } from '../alerter/alerter';

export async function printStatus(config: FleetHawkConfig): Promise<void> {
  const idleMs = parseDuration(config.idle_threshold);
  const results: AgentScanResult[] = [];

  for (const agent of config.agents) {
    const scanner = new AgentScanner(agent, null, idleMs);
    const result = await scanner.scan();
    results.push(result);
  }

  const now = new Date();
  console.log(`\n🦅 ${chalk.bold('FleetHawk Status')} — ${now.toLocaleString()}\n`);

  const table = new Table({
    head: [
      chalk.bold('Agent'),
      chalk.bold('Last Output'),
      chalk.bold('Idle Time'),
      chalk.bold('Files'),
      chalk.bold('Commits'),
      chalk.bold('Status'),
    ],
    colWidths: [12, 14, 12, 8, 9, 18],
    style: { head: [], border: [] },
  });

  for (const r of results) {
    const lastOutput = r.last_output_at
      ? formatTimeAgo(now.getTime() - r.last_output_at.getTime())
      : 'never';

    const idleTime = r.idle_duration_ms > 0
      ? formatDuration(r.idle_duration_ms)
      : '—';

    const statusStr = `${statusEmoji(r.status)} ${r.status}`;

    table.push([
      r.agent_name,
      lastOutput,
      idleTime,
      String(r.files_modified),
      String(r.git_commits),
      statusStr,
    ]);
  }

  console.log(table.toString());

  // Zero-byte warnings
  for (const r of results) {
    if (r.zero_byte_files.length > 0) {
      console.log(chalk.yellow(`\n⚠️  ${r.agent_name}: ${r.zero_byte_files.length} zero-byte files:`));
      for (const f of r.zero_byte_files.slice(0, 5)) {
        console.log(chalk.yellow(`   - ${f}`));
      }
    }
  }

  console.log('');
}

function formatTimeAgo(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
