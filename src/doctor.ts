import chalk from 'chalk';
import { FleetHawkConfig, CheckResult } from './config/types';
import { printCheck, printHeader, printSummary, printTable } from './utils/display';
import {
  checkAgentDir,
  checkConfigShape,
  checkDbEnvFiles,
  checkFallbackDrift,
  checkGhostAgents,
  checkGatewayStale,
  checkIdentityBleed,
  checkModelValidity,
  checkRepoHygiene,
  checkSqlArtifacts,
  checkWorkspaceBleed,
  verifyModels,
} from './utils/checks';
import { getOpenClawAgents, isOpenClawInstalled, loadOpenClawConfig, openclawDoctor, probeAgent, resolveAgentDir, resolveWorkspace } from './utils/openclaw';

export async function runDoctorChecks(config: FleetHawkConfig, repoDir: string): Promise<CheckResult[]> {
  const openclawLoaded = loadOpenClawConfig(config.config_path);
  const ocConfig = config.openclaw ?? openclawLoaded.config;
  const agents = getOpenClawAgents(ocConfig);
  const results: CheckResult[] = [];

  results.push(...checkConfigShape(ocConfig));
  for (const agent of agents) results.push(checkModelValidity(agent));
  for (const agent of agents) results.push(checkAgentDir(agent));
  results.push(...checkWorkspaceBleed(agents, ocConfig));
  results.push(...checkIdentityBleed(agents));
  results.push(...checkFallbackDrift(agents));
  results.push(...checkGhostAgents(ocConfig));
  results.push(checkGatewayStale());
  results.push(checkSqlArtifacts(repoDir));
  results.push(...checkDbEnvFiles(repoDir));
  results.push(...checkRepoHygiene(repoDir));

  return results;
}

export async function doctorCommand(config: FleetHawkConfig, repoDir: string, json = false): Promise<void> {
  const checks = await runDoctorChecks(config, repoDir);
  if (json) {
    console.log(JSON.stringify({ generated_at: new Date().toISOString(), checks }, null, 2));
    return;
  }

  console.log(chalk.bold.cyan('\n🦅 FleetHawk Doctor\n'));
  printHeader('OpenClaw Doctor (upstream)');
  if (!isOpenClawInstalled()) {
    console.log(chalk.yellow('  openclaw CLI not found; skipping upstream doctor.'));
  } else {
    const result = openclawDoctor();
    const lines = result.output.split('\n').filter(Boolean).slice(0, 20);
    for (const line of lines) console.log(`  ${line}`);
  }

  printHeader('Fleet Checks');
  for (const check of checks) printCheck(check);
  printSummary(checks);
}

export async function verifyModelsCommand(config: FleetHawkConfig, json = false): Promise<void> {
  const results = verifyModels(getOpenClawAgents(config.openclaw ?? null));
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  console.log(chalk.bold.cyan('\n🦅 FleetHawk — Verify Models\n'));
  printHeader('Agent Model Probe');
  printTable(['Agent', 'Configured', 'Responding', 'Fallback?', 'Latency', 'Status', 'Error'], results.map((item) => [
    item.agent,
    item.configured_model,
    item.responding_model || '—',
    item.fallback_triggered ? 'yes' : 'no',
    `${item.latency_ms}ms`,
    item.status,
    item.error ?? '',
  ]));
  if (results.some((item) => item.status === 'fail')) process.exitCode = 1;
}

export async function verifyAgentCommand(config: FleetHawkConfig, agentId: string): Promise<void> {
  const agents = getOpenClawAgents(config.openclaw ?? null);
  const agent = agents.find((item) => item.name === agentId);
  console.log(chalk.bold.cyan(`\n🦅 FleetHawk — Verify Agent: ${agentId}\n`));
  if (!agent) {
    console.log(chalk.red(`Agent not found: ${agentId}`));
    process.exitCode = 1;
    return;
  }

  const workspace = resolveWorkspace(agent, config.openclaw ?? null);
  const agentDir = resolveAgentDir(agent);
  const probe = probeAgent(agent.name, 'Respond with exactly: PROBE_OK; MODEL=<your current model name>', 30);

  printHeader('Configuration');
  printTable(['Field', 'Value'], [
    ['Primary model', agent.model?.primary ?? '(none)'],
    ['Fallbacks', (agent.model?.fallbacks ?? []).join(' -> ') || 'none'],
    ['Workspace', workspace],
    ['Agent directory', agentDir],
  ]);

  printHeader('Filesystem');
  printTable(['Check', 'Status'], [
    ['Workspace exists', requireStatus(workspace)],
    ['AgentDir exists', requireStatus(agentDir)],
  ]);

  printHeader('Live Probe');
  printTable(['Probe', 'Result'], [[
    `${probe.latency_ms}ms`,
    probe.ok ? (probe.output || 'ok') : (probe.error || 'failed'),
  ]]);
  if (!probe.ok) process.exitCode = 1;
}

export async function verifyDbCommand(repoDir: string): Promise<void> {
  console.log(chalk.bold.cyan('\n🦅 FleetHawk — Verify DB\n'));
  const checks = checkDbEnvFiles(repoDir);
  for (const check of checks) printCheck(check);
  printSummary(checks);
}

export async function releaseCheckCommand(repoDir: string): Promise<void> {
  console.log(chalk.bold.cyan('\n🦅 FleetHawk — Release Check\n'));
  const checks = [
    ...checkRepoHygiene(repoDir),
    checkSqlArtifacts(repoDir),
    ...checkDbEnvFiles(repoDir),
  ];
  for (const check of checks) printCheck(check);
  printSummary(checks);
}

function requireStatus(targetPath: string): string {
  const fs = require('fs') as typeof import('fs');
  return fs.existsSync(targetPath) ? 'exists' : 'missing';
}
