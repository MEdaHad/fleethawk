import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { AgentConfig, OpenClawAgentConfig, OpenClawConfig } from '../config/types';

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

export function runCommand(command: string, timeout = 30_000): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execSync(command, {
      timeout,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: '/bin/zsh',
    }).trim();
    return { ok: true, stdout, stderr: '' };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: String(err.stdout ?? '').trim(),
      stderr: String(err.stderr ?? err.message ?? 'unknown error').trim(),
    };
  }
}

export function getOpenClawConfigPath(explicitPath?: string): string {
  return explicitPath ? expandHome(explicitPath) : DEFAULT_CONFIG_PATH;
}

export function loadOpenClawConfig(explicitPath?: string): { path: string; config: OpenClawConfig | null } {
  const configPath = getOpenClawConfigPath(explicitPath);
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return { path: configPath, config: JSON.parse(raw) as OpenClawConfig };
  } catch {
    return { path: configPath, config: null };
  }
}

export function getOpenClawAgents(config: OpenClawConfig | null): OpenClawAgentConfig[] {
  return config?.agents?.list ?? [];
}

export function resolveAgentDir(agent: OpenClawAgentConfig): string {
  if (typeof agent.agentDir === 'string' && agent.agentDir.length > 0) {
    return expandHome(agent.agentDir);
  }
  return path.join(os.homedir(), '.openclaw', 'agents', agent.name);
}

export function resolveWorkspace(agent: OpenClawAgentConfig, config: OpenClawConfig | null): string {
  if (typeof agent.workspace === 'string' && agent.workspace.length > 0) {
    return expandHome(agent.workspace);
  }
  const defaultWorkspace = config?.agents?.defaults?.workspace;
  if (typeof defaultWorkspace === 'string' && defaultWorkspace.length > 0) {
    return expandHome(defaultWorkspace);
  }
  return path.join(os.homedir(), '.openclaw', 'workspace');
}

export function buildAgentConfigsFromOpenClaw(config: OpenClawConfig | null): AgentConfig[] {
  return getOpenClawAgents(config).map((agent) => ({
    name: agent.name,
    dir: resolveAgentDir(agent),
    workspace: resolveWorkspace(agent, config),
    output_signals: [
      { files: '*.ts,*.tsx,*.js,*.jsx,*.json,*.md,*.py,*.yaml,*.yml' },
      { git_commits: true },
      { session_activity: true },
      { file_size: true },
    ],
    model: agent.model,
    fallback_chain: agent.model?.fallbacks ?? [],
    raw: agent,
  }));
}

export function expandHome(input: string): string {
  return input.startsWith('~') ? path.join(os.homedir(), input.slice(1)) : input;
}

export function isOpenClawInstalled(): boolean {
  const result = runCommand('which openclaw', 5_000);
  return result.ok && result.stdout.length > 0;
}

export function openclawDoctor(): { ok: boolean; output: string } {
  const result = runCommand('openclaw doctor', 60_000);
  return { ok: result.ok, output: result.stdout || result.stderr };
}

export function openclawGatewayStatus(): { ok: boolean; output: string } {
  const result = runCommand('openclaw gateway status', 15_000);
  return { ok: result.ok, output: result.stdout || result.stderr };
}

export function probeAgent(agentName: string, prompt: string, timeoutSeconds = 30): { ok: boolean; output: string; error: string; latency_ms: number } {
  const start = Date.now();
  const result = runCommand(`openclaw invoke ${agentName} ${JSON.stringify(prompt)} --timeout ${timeoutSeconds} 2>&1`, (timeoutSeconds + 5) * 1000);
  return {
    ok: result.ok,
    output: result.stdout,
    error: result.stderr,
    latency_ms: Date.now() - start,
  };
}
