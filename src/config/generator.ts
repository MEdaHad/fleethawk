import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { discoverAgents } from './loader';

export function generateConfigYaml(fleetDir: string, outputPath: string): void {
  const resolvedFleet = path.resolve(fleetDir);
  const agents = discoverAgents(resolvedFleet);

  if (agents.length === 0) {
    console.error(`No agents found in ${resolvedFleet}`);
    process.exit(1);
  }

  const config = {
    fleet_dir: resolvedFleet,
    idle_threshold: '30m',
    poll_interval: '5m',
    agents: agents.map((a) => ({
      name: a.name,
      dir: a.dir,
      workspace: a.workspace,
      output_signals: [
        { session_activity: true },
        { git_commits: true },
        { files: '*.ts,*.js,*.json,*.md,*.py' },
        { file_size: true },
      ],
    })),
    alerts: {
      stdout: true,
    },
    report: {
      format: 'table',
      include_idle: true,
      include_zero_output: true,
    },
  };

  const content = `# FleetHawk Config — Auto-generated\n# ${agents.length} agents discovered from ${resolvedFleet}\n\n${yaml.dump(config, { lineWidth: 120, noRefs: true })}`;

  fs.writeFileSync(outputPath, content);
  console.log(`Config written to ${outputPath} with ${agents.length} agents:`);
  for (const a of agents) {
    console.log(`  - ${a.name}`);
  }
}
