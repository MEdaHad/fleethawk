import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AgentConfig, FleetHawkConfig } from './types';
import { buildAgentConfigsFromOpenClaw, expandHome, loadOpenClawConfig } from '../utils/openclaw';

const CONFIG_NAMES = ['fleethawk.config.yaml', 'fleethawk.config.yml', '.fleethawkrc.yaml'];
const GLOBAL_CONFIG_DIR = path.join(process.env.HOME || '~', '.config', 'fleethawk');

export async function loadConfig(opts: Record<string, unknown>): Promise<FleetHawkConfig> {
  const explicitConfig = typeof opts.config === 'string' ? opts.config : undefined;
  const explicitOpenClaw = typeof opts.openclawConfig === 'string' ? opts.openclawConfig : undefined;
  const openclawLoaded = loadOpenClawConfig(explicitOpenClaw);

  if (explicitConfig) {
    const config = parseConfigFile(explicitConfig);
    return enrichConfig(mergeCliOpts(config, opts), openclawLoaded.path, openclawLoaded.config);
  }

  const configPath = findConfigFile();
  if (configPath) {
    const config = parseConfigFile(configPath);
    return enrichConfig(mergeCliOpts(config, opts), openclawLoaded.path, openclawLoaded.config);
  }

  return enrichConfig(buildFromFlags(opts, openclawLoaded.config), openclawLoaded.path, openclawLoaded.config);
}

function enrichConfig(config: FleetHawkConfig, openclawPath: string, openclawConfig: ReturnType<typeof loadOpenClawConfig>['config']): FleetHawkConfig {
  const openclawAgents = buildAgentConfigsFromOpenClaw(openclawConfig);
  const agents = config.agents.length > 0
    ? config.agents.map((agent) => {
        const match = openclawAgents.find((item) => item.name.toLowerCase() === agent.name.toLowerCase());
        return match ? { ...match, ...agent, model: match.model, fallback_chain: match.fallback_chain, raw: match.raw } : agent;
      })
    : openclawAgents;
  return {
    ...config,
    agents,
    config_path: openclawPath,
    openclaw: openclawConfig,
  };
}

function findConfigFile(): string | null {
  for (const name of CONFIG_NAMES) {
    const localPath = path.join(process.cwd(), name);
    if (fs.existsSync(localPath)) return localPath;
  }
  for (const name of CONFIG_NAMES) {
    const globalPath = path.join(GLOBAL_CONFIG_DIR, name);
    if (fs.existsSync(globalPath)) return globalPath;
  }
  return null;
}

function parseConfigFile(filePath: string): FleetHawkConfig {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = (yaml.load(raw) as FleetHawkConfig | null) ?? {} as FleetHawkConfig;
  return resolveEnvVars(parsed);
}

function resolveEnvVars<T>(obj: T): T {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || '') as unknown as T;
  }
  if (Array.isArray(obj)) return obj.map((item) => resolveEnvVars(item)) as unknown as T;
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value);
    }
    return result as T;
  }
  return obj;
}

function mergeCliOpts(config: FleetHawkConfig, opts: Record<string, unknown>): FleetHawkConfig {
  return {
    ...config,
    fleet_dir: (typeof opts.fleet === 'string' ? opts.fleet : config.fleet_dir) || process.cwd(),
    idle_threshold: (typeof opts.idleThreshold === 'string' ? opts.idleThreshold : config.idle_threshold) || '30m',
    poll_interval: (typeof opts.pollInterval === 'string' ? opts.pollInterval : config.poll_interval) || '5m',
    doctor_interval: (typeof opts.doctorInterval === 'string' ? opts.doctorInterval : config.doctor_interval) || '30m',
    report: {
      format: config.report?.format ?? 'table',
      include_idle: config.report?.include_idle ?? true,
      include_zero_output: config.report?.include_zero_output ?? true,
    },
    alerts: config.alerts ?? { stdout: true },
    agents: config.agents ?? [],
  };
}

function buildFromFlags(opts: Record<string, unknown>, openclawConfig: ReturnType<typeof loadOpenClawConfig>['config']): FleetHawkConfig {
  const fleetDir = typeof opts.fleet === 'string' ? opts.fleet : process.cwd();
  const dir = typeof opts.dir === 'string' ? opts.dir : undefined;
  const discovered = dir ? [buildSingleAgent(dir)] : typeof opts.fleet === 'string' ? discoverAgents(fleetDir) : [];
  return {
    fleet_dir: expandHome(fleetDir),
    idle_threshold: typeof opts.idleThreshold === 'string' ? opts.idleThreshold : '30m',
    poll_interval: typeof opts.pollInterval === 'string' ? opts.pollInterval : '5m',
    doctor_interval: typeof opts.doctorInterval === 'string' ? opts.doctorInterval : '30m',
    agents: discovered.length > 0 ? discovered : buildAgentConfigsFromOpenClaw(openclawConfig),
    alerts: {
      stdout: true,
    },
    report: {
      format: 'table',
      include_idle: true,
      include_zero_output: true,
    },
  };
}

export function discoverAgents(fleetDir: string): AgentConfig[] {
  const dir = expandHome(fleetDir);
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  return entries.map((entry) => ({
    name: entry.name,
    dir: path.join(dir, entry.name, 'agent'),
    workspace: path.join(dir, entry.name),
    output_signals: [
      { files: '*.ts,*.tsx,*.js,*.jsx,*.json,*.md,*.py,*.yaml,*.yml' },
      { git_commits: true },
      { session_activity: true },
      { file_size: true },
    ],
  }));
}

function buildSingleAgent(dir: string): AgentConfig {
  return {
    name: path.basename(dir),
    dir: expandHome(dir),
    workspace: expandHome(dir),
    output_signals: [{ files: '*' }, { git_commits: true }, { session_activity: true }, { file_size: true }],
  };
}
