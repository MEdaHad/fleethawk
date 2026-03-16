import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CheckResult, ModelVerificationResult, OpenClawAgentConfig, OpenClawConfig } from '../config/types';
import { getOpenClawAgents, openclawGatewayStatus, probeAgent, resolveAgentDir, resolveWorkspace, runCommand } from './openclaw';

const KNOWN_PROVIDERS = [
  'anthropic', 'openai', 'openai-codex', 'google', 'google-gemini', 'nvidia-kimi', 'nvidia-glm',
  'nvidia-minimax', 'nvidia-deepseek', 'nvidia', 'ollama', 'deepseek', 'groq', 'together', 'fireworks', 'mistral',
];

export function checkModelValidity(agent: OpenClawAgentConfig): CheckResult {
  const model = agent.model?.primary ?? '';
  if (!model) return { name: `${agent.name}: model`, status: 'fail', message: 'no primary model configured' };
  const provider = model.split('/')[0];
  const known = KNOWN_PROVIDERS.includes(provider);
  return known
    ? { name: `${agent.name}: model`, status: 'pass', message: model }
    : { name: `${agent.name}: model`, status: 'warn', message: `unknown provider prefix: ${provider} (${model})` };
}

export function checkAgentDir(agent: OpenClawAgentConfig): CheckResult {
  const dir = resolveAgentDir(agent);
  if (!fs.existsSync(dir)) return { name: `${agent.name}: agentDir`, status: 'fail', message: `missing: ${dir}` };
  const hasAuth = fs.existsSync(path.join(dir, 'auth.json')) || fs.existsSync(path.join(dir, 'auth-profiles.json'));
  return hasAuth
    ? { name: `${agent.name}: agentDir`, status: 'pass', message: dir }
    : { name: `${agent.name}: agentDir`, status: 'warn', message: `exists but no auth files: ${dir}` };
}

export function checkWorkspaceBleed(agents: OpenClawAgentConfig[], config: OpenClawConfig | null): CheckResult[] {
  const workspaceMap = new Map<string, string[]>();
  for (const agent of agents) {
    const workspace = resolveWorkspace(agent, config);
    workspaceMap.set(workspace, [...(workspaceMap.get(workspace) ?? []), agent.name]);
  }
  const results: CheckResult[] = [];
  for (const [workspace, names] of workspaceMap.entries()) {
    if (names.length > 1) {
      results.push({ name: 'workspace bleed', status: 'warn', message: `agents share workspace ${workspace}: ${names.join(', ')}` });
    }
  }
  return results.length > 0 ? results : [{ name: 'workspace bleed', status: 'pass', message: 'no shared workspaces detected' }];
}

export function checkIdentityBleed(agents: OpenClawAgentConfig[]): CheckResult[] {
  const files = ['SOUL.md', 'IDENTITY.md', 'SYSTEM.md'];
  const results: CheckResult[] = [];
  for (const agent of agents) {
    const workspace = resolveWorkspace(agent, null);
    const agentDir = resolveAgentDir(agent);
    const foundInWorkspace = files.filter((file) => fs.existsSync(path.join(workspace, file)));
    const foundInAgentDir = files.filter((file) => fs.existsSync(path.join(agentDir, file)));
    if (foundInWorkspace.length > 1) {
      results.push({ name: `${agent.name}: identity bleed`, status: 'warn', message: `workspace contains identity files: ${foundInWorkspace.join(', ')}` });
    }
    if (foundInAgentDir.length === 0 && agent.name !== 'main') {
      results.push({ name: `${agent.name}: identity`, status: 'info', message: 'no identity files in agentDir' });
    }
  }
  return results.length > 0 ? results : [{ name: 'identity files', status: 'pass', message: 'identity layout looks healthy' }];
}

export function checkFallbackDrift(agents: OpenClawAgentConfig[]): CheckResult[] {
  const results: CheckResult[] = [];
  for (const agent of agents) {
    const fallbacks = agent.model?.fallbacks ?? [];
    if (fallbacks.length === 0) {
      results.push({ name: `${agent.name}: fallbacks`, status: 'info', message: 'no fallback chain configured' });
    }
    for (const fallback of fallbacks) {
      if (/deepseek|deprecated/i.test(fallback)) {
        results.push({ name: `${agent.name}: fallback`, status: 'warn', message: `potentially risky fallback: ${fallback}` });
      }
    }
  }
  return results.length > 0 ? results : [{ name: 'fallback chains', status: 'pass', message: 'all fallback chains look healthy' }];
}

export function checkGhostAgents(config: OpenClawConfig | null): CheckResult[] {
  const agents = getOpenClawAgents(config);
  const known = new Set(agents.map((agent) => agent.name.toLowerCase()));
  known.add('main');
  known.add('echo');
  const paths = [
    path.join(os.homedir(), '.config', 'fleethawk', 'fleethawk.config.yaml'),
    path.join(os.homedir(), 'MedaXP', 'fleethawk', 'fleethawk.config.yaml'),
  ];
  const results: CheckResult[] = [];
  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = content.match(/- name:\s*(\w+)/g) ?? [];
    for (const match of matches) {
      const name = match.replace('- name:', '').trim().toLowerCase();
      if (!known.has(name)) {
        results.push({ name: 'ghost agent', status: 'warn', message: `${name} exists in monitoring config but not OpenClaw` });
      }
    }
  }
  return results.length > 0 ? results : [{ name: 'ghost agents', status: 'pass', message: 'no ghost agents in monitoring config' }];
}

export function checkGatewayStale(): CheckResult {
  const status = openclawGatewayStatus();
  if (!status.ok) return { name: 'gateway', status: 'warn', message: 'could not check gateway status' };
  if (/not running|stopped/i.test(status.output)) return { name: 'gateway', status: 'fail', message: 'gateway is not running' };
  return { name: 'gateway', status: 'pass', message: 'gateway running' };
}

export function checkSqlArtifacts(repoDir: string): CheckResult {
  const gitResult = runCommand(`cd ${JSON.stringify(repoDir)} && git ls-files '*.sql' 2>/dev/null`, 5000);
  const files = gitResult.ok ? gitResult.stdout.split('\n').filter(Boolean) : [];
  return files.length === 0
    ? { name: 'SQL artifacts', status: 'pass', message: 'no tracked SQL files in repo' }
    : { name: 'SQL artifacts', status: 'warn', message: `${files.length} tracked SQL file(s): ${files.slice(0, 5).join(', ')}` };
}

export function checkDbEnvFiles(dir: string): CheckResult[] {
  const envFiles = ['.env', '.env.local', '.env.production', '.env.development'];
  const dbVars = ['DATABASE_URL', 'NEON_DATABASE_URL', 'POSTGRES_URL', 'DB_URL'];
  const found: Array<{ file: string; variable: string; value: string; isLocal: boolean }> = [];
  for (const envFile of envFiles) {
    const filePath = path.join(dir, envFile);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [rawKey, ...rest] = trimmed.split('=');
      const key = rawKey.trim();
      if (!dbVars.includes(key)) continue;
      const value = rest.join('=').replace(/^['"]|['"]$/g, '');
      const isLocal = /localhost|127\.0\.0\.1|::1/.test(value);
      found.push({ file: envFile, variable: key, value, isLocal });
    }
  }
  if (found.length === 0) return [{ name: 'DB env vars', status: 'info', message: 'no database URLs found in env files' }];

  const results: CheckResult[] = [];
  for (const entry of found) {
    if (entry.value.includes('postgresql://postgresql://')) {
      results.push({ name: `${entry.file}: ${entry.variable}`, status: 'fail', message: 'double postgresql:// prefix detected' });
    }
  }
  const locals = found.filter((entry) => entry.isLocal);
  const remotes = found.filter((entry) => !entry.isLocal);
  if (locals.length > 0 && remotes.length > 0) {
    results.push({ name: 'DB target mismatch', status: 'warn', message: 'mixed localhost and remote database targets detected' });
  }
  const variableMap = new Map<string, string[]>();
  for (const entry of found) {
    variableMap.set(entry.variable, [...(variableMap.get(entry.variable) ?? []), entry.file]);
  }
  for (const [variable, files] of variableMap.entries()) {
    if (files.length > 1) {
      results.push({ name: 'env precedence', status: 'warn', message: `${variable} defined in multiple files: ${files.join(', ')}` });
    }
  }
  return results.length > 0
    ? results
    : found.map((entry) => ({ name: `${entry.file}: ${entry.variable}`, status: 'pass', message: entry.isLocal ? 'localhost' : 'remote (production)' }));
}

export function checkRepoHygiene(repoDir: string): CheckResult[] {
  const status = runCommand(`cd ${JSON.stringify(repoDir)} && git status --porcelain`, 5_000);
  const branch = runCommand(`cd ${JSON.stringify(repoDir)} && git branch --show-current`, 5_000);
  const results: CheckResult[] = [];
  if (branch.ok) {
    const branchName = branch.stdout.trim();
    results.push({
      name: 'deploy branch',
      status: branchName === 'main' || branchName === 'staging' ? 'pass' : 'info',
      message: branchName || 'unknown',
    });
  }
  if (status.ok) {
    const changes = status.stdout.split('\n').filter(Boolean);
    results.push({
      name: 'working tree',
      status: changes.length > 0 ? 'warn' : 'pass',
      message: changes.length > 0 ? `${changes.length} uncommitted change(s)` : 'clean',
    });
  }
  return results;
}

export function checkConfigShape(config: OpenClawConfig | null): CheckResult[] {
  if (!config) return [{ name: 'openclaw.json', status: 'fail', message: 'config not found or unreadable' }];
  const agents = getOpenClawAgents(config);
  if (agents.length === 0) return [{ name: 'agents.list', status: 'warn', message: 'no agents configured' }];
  const results: CheckResult[] = [{ name: 'agents.list', status: 'pass', message: `${agents.length} configured agents` }];
  const workspaceMap = new Map<string, string[]>();
  for (const agent of agents) {
    const workspace = resolveWorkspace(agent, config);
    workspaceMap.set(workspace, [...(workspaceMap.get(workspace) ?? []), agent.name]);
    if (!agent.model?.primary) {
      results.push({ name: `${agent.name}: model`, status: 'fail', message: 'missing primary model' });
    }
    if (!fs.existsSync(resolveAgentDir(agent))) {
      results.push({ name: `${agent.name}: agentDir`, status: 'warn', message: 'agentDir missing on disk' });
    }
  }
  for (const [workspace, names] of workspaceMap.entries()) {
    if (names.length > 1) {
      results.push({ name: 'workspace collision', status: 'warn', message: `${workspace}: ${names.join(', ')}` });
    }
  }
  return results;
}

export function verifyModels(agents: OpenClawAgentConfig[]): ModelVerificationResult[] {
  return agents.map((agent) => {
    const configured = agent.model?.primary ?? '(none)';
    const probe = probeAgent(agent.name, 'Respond with exactly: MODEL=<your current model name>; STATUS=OK', 30);
    if (!probe.ok) {
      return {
        agent: agent.name,
        configured_model: configured,
        responding_model: '',
        latency_ms: probe.latency_ms,
        fallback_triggered: false,
        status: 'fail',
        error: probe.error || 'probe failed',
      };
    }
    const match = probe.output.match(/MODEL=([^;\n]+)/i);
    const responding = match?.[1]?.trim() ?? probe.output.trim().slice(0, 80);
    const fallback = Boolean(responding && configured !== '(none)' && !responding.includes(configured));
    return {
      agent: agent.name,
      configured_model: configured,
      responding_model: responding,
      latency_ms: probe.latency_ms,
      fallback_triggered: fallback,
      status: fallback ? 'warn' : 'ok',
    };
  });
}
