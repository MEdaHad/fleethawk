import chalk from 'chalk';
import { FleetHawkConfig } from '../config/types';
import { collectStatus } from './status';

export async function generateReport(config: FleetHawkConfig, since: Date, format: string): Promise<void> {
  const results = await collectStatus(config);
  const report = {
    generated_at: new Date().toISOString(),
    since: since.toISOString(),
    summary: {
      total_agents: results.length,
      active: results.filter((item) => item.status === 'active').length,
      idle: results.filter((item) => item.status === 'idle').length,
      failures: results.filter((item) => item.status === 'silent_fail' || item.status === 'no_output').length,
    },
    agents: results.map((item) => ({
      name: item.agent_name,
      model: item.model ?? null,
      status: item.status,
      files_modified: item.files_modified,
      git_commits: item.git_commits,
      session_messages: item.session_messages,
      zero_byte_files: item.zero_byte_files,
      idle_duration_ms: item.idle_duration_ms,
      last_output_at: item.last_output_at?.toISOString() ?? null,
      last_task: item.last_task ?? null,
      error_breakdown: item.errors ?? [],
    })),
  };

  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (format === 'markdown' || format === 'md') {
    console.log(`# FleetHawk Report\n`);
    console.log(`Generated: ${report.generated_at}`);
    console.log(`Window start: ${report.since}\n`);
    for (const agent of report.agents) {
      console.log(`## ${agent.name}`);
      console.log(`- Model: ${agent.model ?? 'unknown'}`);
      console.log(`- Status: ${agent.status}`);
      console.log(`- Files modified: ${agent.files_modified}`);
      console.log(`- Git commits: ${agent.git_commits}`);
      console.log(`- Session messages: ${agent.session_messages}`);
      console.log(`- Last task: ${agent.last_task ?? 'n/a'}`);
      console.log(`- Errors: ${agent.error_breakdown.length > 0 ? agent.error_breakdown.join(', ') : 'none'}`);
      console.log('');
    }
    return;
  }

  console.log(`\n🦅 ${chalk.bold('FleetHawk Report')} — Since ${since.toLocaleString()}\n`);
  for (const agent of report.agents) {
    console.log(`${chalk.bold(agent.name)} (${agent.model ?? 'unknown'})`);
    console.log(`  status: ${agent.status}`);
    console.log(`  activity: ${agent.files_modified} files, ${agent.git_commits} commits, ${agent.session_messages} session events`);
    console.log(`  last task: ${agent.last_task ?? 'n/a'}`);
    console.log(`  errors: ${agent.error_breakdown.length > 0 ? agent.error_breakdown.join(', ') : 'none'}`);
    console.log('');
  }
}
