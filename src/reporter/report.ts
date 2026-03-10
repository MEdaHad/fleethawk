import Table from 'cli-table3';
import chalk from 'chalk';
import { FleetHawkConfig, AgentScanResult } from '../config/types';
import { AgentScanner } from '../scanner/agent-scanner';
import { parseDuration, formatDuration } from '../utils/duration';
import { statusEmoji } from '../alerter/alerter';

export async function generateReport(
  config: FleetHawkConfig,
  since: Date,
  format: string
): Promise<void> {
  const idleMs = parseDuration(config.idle_threshold);
  const results: AgentScanResult[] = [];

  for (const agent of config.agents) {
    const scanner = new AgentScanner(agent, null, idleMs);
    const result = await scanner.scan();
    results.push(result);
  }

  switch (format) {
    case 'json':
      printJsonReport(results, since);
      break;
    case 'markdown':
      printMarkdownReport(results, since);
      break;
    default:
      printTableReport(results, since);
  }
}

function printTableReport(results: AgentScanResult[], since: Date): void {
  console.log(`\n🦅 ${chalk.bold('Fleet Report')} — Since ${since.toLocaleString()}\n`);

  const table = new Table({
    head: [
      chalk.bold('Agent'),
      chalk.bold('Files'),
      chalk.bold('Commits'),
      chalk.bold('Messages'),
      chalk.bold('Zero-Byte'),
      chalk.bold('Status'),
    ],
    style: { head: [], border: [] },
  });

  for (const r of results) {
    table.push([
      r.agent_name,
      String(r.files_modified),
      String(r.git_commits),
      String(r.session_messages),
      String(r.zero_byte_files.length),
      `${statusEmoji(r.status)} ${r.status}`,
    ]);
  }

  console.log(table.toString());
  console.log('');
}

function printJsonReport(results: AgentScanResult[], since: Date): void {
  const report = {
    generated_at: new Date().toISOString(),
    since: since.toISOString(),
    agents: results.map((r) => ({
      name: r.agent_name,
      status: r.status,
      files_modified: r.files_modified,
      git_commits: r.git_commits,
      session_messages: r.session_messages,
      zero_byte_files: r.zero_byte_files,
      idle_duration_ms: r.idle_duration_ms,
      last_output_at: r.last_output_at?.toISOString() || null,
    })),
  };
  console.log(JSON.stringify(report, null, 2));
}

function printMarkdownReport(results: AgentScanResult[], since: Date): void {
  console.log(`# Fleet Report — Since ${since.toLocaleDateString()}\n`);

  for (const r of results) {
    const emoji = statusEmoji(r.status);
    console.log(`## ${emoji} ${r.agent_name}`);
    console.log(`- Files modified: ${r.files_modified}`);
    console.log(`- Git commits: ${r.git_commits}`);
    console.log(`- Session messages: ${r.session_messages}`);

    if (r.zero_byte_files.length > 0) {
      console.log(`- ⚠️ ${r.zero_byte_files.length} zero-byte outputs: ${r.zero_byte_files.slice(0, 3).join(', ')}`);
    }

    if (r.idle_duration_ms > 0) {
      console.log(`- Idle: ${formatDuration(r.idle_duration_ms)}`);
    }

    if (r.status === 'silent_fail' || r.status === 'no_output') {
      console.log(`- 🔴 **No deliverables produced**`);
    }

    console.log('');
  }
}
