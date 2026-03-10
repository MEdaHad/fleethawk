#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig, discoverAgents } from './config/loader';
import { FleetWatcher } from './watcher/fleet-watcher';
import { printStatus } from './reporter/status';
import { generateReport } from './reporter/report';
import { generateConfigYaml } from './config/generator';
import { parseDuration } from './utils/duration';

const program = new Command();

program
  .name('fleethawk')
  .description('Silent failure detection for multi-agent AI fleets')
  .version('0.1.0');

// ─── watch ───
program
  .command('watch')
  .description('Continuously monitor agents and alert on failures')
  .option('--fleet <dir>', 'Root directory containing agent subdirs')
  .option('--dir <dir>', 'Watch a single agent directory')
  .option('--idle-threshold <duration>', 'Alert after this idle duration', '30m')
  .option('--poll-interval <duration>', 'Check frequency', '5m')
  .option('--alert <channel>', 'Alert channel: telegram, discord, stdout', 'stdout')
  .option('--config <path>', 'Path to config file')
  .option('--daemon', 'Run as background process')
  .action(async (opts) => {
    const config = await loadConfig(opts);
    const watcher = new FleetWatcher(config);
    await watcher.start();
  });

// ─── status ───
program
  .command('status')
  .description('One-shot health check of all agents')
  .option('--fleet <dir>', 'Root directory containing agent subdirs')
  .option('--config <path>', 'Path to config file')
  .action(async (opts) => {
    const config = await loadConfig(opts);
    await printStatus(config);
  });

// ─── report ───
program
  .command('report')
  .description('Generate accountability report')
  .option('--fleet <dir>', 'Root directory containing agent subdirs')
  .option('--since <duration>', 'Report period', '24h')
  .option('--format <type>', 'Output format: table, json, markdown', 'table')
  .option('--config <path>', 'Path to config file')
  .action(async (opts) => {
    const config = await loadConfig(opts);
    const since = Date.now() - parseDuration(opts.since);
    await generateReport(config, new Date(since), opts.format);
  });

// ─── init ───
program
  .command('init')
  .description('Auto-generate fleethawk.config.yaml from discovered agents')
  .option('--fleet <dir>', 'Root directory containing agent subdirs')
  .option('-o, --output <path>', 'Output path for config file', 'fleethawk.config.yaml')
  .action(async (opts) => {
    if (!opts.fleet) {
      console.error('Error: --fleet is required for init');
      process.exit(1);
    }
    generateConfigYaml(opts.fleet, opts.output);
  });

program.parse();
