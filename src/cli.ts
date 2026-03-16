#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from './config/loader';
import { FleetWatcher } from './watcher/fleet-watcher';
import { printStatus } from './reporter/status';
import { generateReport } from './reporter/report';
import { generateConfigYaml } from './config/generator';
import { parseDuration } from './utils/duration';
import { doctorCommand, releaseCheckCommand, verifyAgentCommand, verifyDbCommand, verifyModelsCommand } from './doctor';
import { checkConfigShape } from './utils/checks';
import { printCheck, printSummary, printTable } from './utils/display';
import { getOpenClawAgents, resolveAgentDir, resolveWorkspace, runCommand } from './utils/openclaw';

const program = new Command();

program
  .name('fleethawk')
  .description('AI fleet diagnostics, monitoring, and release safety CLI')
  .version('1.0.0');

program
  .option('--openclaw-config <path>', 'Path to openclaw.json');

program
  .command('watch')
  .description('Continuously monitor agents and alert on failures')
  .option('--fleet <dir>', 'Root directory containing agent subdirs')
  .option('--dir <dir>', 'Watch a single agent directory')
  .option('--idle-threshold <duration>', 'Alert after this idle duration', '30m')
  .option('--poll-interval <duration>', 'Check frequency', '5m')
  .option('--config <path>', 'Path to config file')
  .action(async (opts, cmd) => {
    const config = await loadConfig({ ...program.opts(), ...opts, openclawConfig: cmd.parent?.opts().openclawConfig });
    await new FleetWatcher(config).start();
  });

program
  .command('monitor')
  .description('Combined watch + doctor with deduped alerts')
  .option('--fleet <dir>')
  .option('--config <path>')
  .option('--idle-threshold <duration>', 'Alert after this idle duration', '30m')
  .option('--poll-interval <duration>', 'Check frequency', '5m')
  .option('--doctor-interval <duration>', 'How often to rerun doctor checks', '30m')
  .action(async (opts, cmd) => {
    const config = await loadConfig({ ...program.opts(), ...opts, openclawConfig: cmd.parent?.opts().openclawConfig });
    await new FleetWatcher(config).startMonitorMode();
  });

program
  .command('status')
  .description('One-shot health check of all agents')
  .option('--fleet <dir>')
  .option('--config <path>')
  .option('--idle-threshold <duration>', 'Alert after this idle duration', '30m')
  .action(async (opts, cmd) => {
    const config = await loadConfig({ ...program.opts(), ...opts, openclawConfig: cmd.parent?.opts().openclawConfig });
    await printStatus(config);
  });

program
  .command('report')
  .description('Generate accountability report')
  .option('--fleet <dir>')
  .option('--since <duration>', 'Report period', '24h')
  .option('--format <type>', 'Output format: table, json, md', 'table')
  .option('--config <path>')
  .action(async (opts, cmd) => {
    const config = await loadConfig({ ...program.opts(), ...opts, openclawConfig: cmd.parent?.opts().openclawConfig });
    await generateReport(config, new Date(Date.now() - parseDuration(opts.since)), opts.format);
  });

program
  .command('doctor')
  .description('Full fleet diagnostic')
  .option('--config <path>')
  .option('--json', 'Output as JSON')
  .action(async (opts, cmd) => {
    const config = await loadConfig({ ...program.opts(), ...opts, openclawConfig: cmd.parent?.opts().openclawConfig });
    await doctorCommand(config, process.cwd(), Boolean(opts.json));
  });

const verify = program.command('verify').description('Verify fleet components');
verify.command('models').option('--json', 'Output as JSON').action(async (opts) => {
  const config = await loadConfig({ ...program.opts(), ...opts, openclawConfig: program.opts().openclawConfig });
  await verifyModelsCommand(config, Boolean(opts.json));
});
verify.command('agent <id>').action(async (id, opts) => {
  const config = await loadConfig({ ...program.opts(), ...opts, openclawConfig: program.opts().openclawConfig });
  await verifyAgentCommand(config, id);
});
verify.command('db').action(async () => {
  await verifyDbCommand(process.cwd());
});

program.command('release-check').description('Pre-merge safety gate').action(async () => {
  await releaseCheckCommand(process.cwd());
});

const audit = program.command('audit').description('Security and dependency audits');
audit.command('security').description('Check secrets, exposed routes, rate limits, npm audit').action(async () => {
  console.log(chalk.bold.cyan('\n🦅 FleetHawk — Security Audit\n'));
  const results = [
    ['Potential secrets', runCommand("rg -n --hidden --glob '!node_modules' --glob '!.git' '(AIza|sk_live|ghp_|BEGIN RSA PRIVATE KEY|postgresql://postgresql://)' .", 15000).stdout || 'none found'],
    ['Debug routes', runCommand("rg -n --hidden --glob '!node_modules' --glob '!.git' '/debug|debug=true|x-debug' .", 15000).stdout || 'none found'],
    ['Rate limit mentions', runCommand("rg -n --hidden --glob '!node_modules' --glob '!.git' 'rateLimit|ratelimit|throttle' .", 15000).stdout || 'none found'],
    ['npm audit', runCommand('npm audit --audit-level=high --json', 30000).stdout || runCommand('npm audit --audit-level=high', 30000).stderr || 'audit unavailable'],
  ];
  printTable(['Check', 'Result'], results.map(([name, output]) => [name, String(output).slice(0, 200)]));
});

audit.command('deps').description('Dependency health audit').action(async () => {
  console.log(chalk.bold.cyan('\n🦅 FleetHawk — Dependency Audit\n'));
  printTable(['Check', 'Result'], [
    ['npm audit', (runCommand('npm audit --audit-level=moderate', 30000).stdout || runCommand('npm audit --audit-level=moderate', 30000).stderr || 'unavailable').slice(0, 200)],
    ['npm outdated', (runCommand('npm outdated', 30000).stdout || 'none').slice(0, 200)],
    ['dep hints', (runCommand("rg -n 'dependencies|devDependencies' package.json", 5000).stdout || 'package.json not found').slice(0, 200)],
  ]);
});

program.command('fleet-map').description('Visual fleet topology').action(async () => {
  const config = await loadConfig({ ...program.opts(), openclawConfig: program.opts().openclawConfig });
  const agents = getOpenClawAgents(config.openclaw ?? null);
  console.log(chalk.bold.cyan('\n🦅 FleetHawk — Fleet Map\n'));
  if (agents.length === 0) {
    console.log(chalk.yellow('No agents found in openclaw.json'));
    return;
  }
  printTable(['Agent', 'Primary Model', 'Fallbacks', 'AgentDir', 'Workspace'], agents.map((agent) => [
    agent.name,
    agent.model?.primary ?? '(none)',
    (agent.model?.fallbacks ?? []).join(' -> ') || 'none',
    resolveAgentDir(agent),
    resolveWorkspace(agent, config.openclaw ?? null),
  ]));
});

const cfg = program.command('config').description('Config tools');
cfg.command('validate').description('Validate openclaw.json').action(async () => {
  const config = await loadConfig({ ...program.opts(), openclawConfig: program.opts().openclawConfig });
  const checks = checkConfigShape(config.openclaw ?? null);
  for (const check of checks) printCheck(check);
  printSummary(checks);
});

program
  .command('init')
  .description('Auto-generate fleethawk.config.yaml from discovered agents')
  .option('--fleet <dir>', 'Root directory containing agent subdirs')
  .option('-o, --output <path>', 'Output path for config file', 'fleethawk.config.yaml')
  .action((opts) => generateConfigYaml(opts.fleet || process.cwd(), opts.output));

program.parseAsync().catch((error) => {
  console.error(chalk.red(`FleetHawk error: ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
});
