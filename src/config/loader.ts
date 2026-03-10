import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { FleetHawkConfig, AgentConfig } from './types';

const CONFIG_NAMES = ['fleethawk.config.yaml', 'fleethawk.config.yml', '.fleethawkrc.yaml'];
const GLOBAL_CONFIG_DIR = path.join(process.env.HOME || '~', '.config', 'fleethawk');

export async function loadConfig(opts: Record<string, any>): Promise<FleetHawkConfig> {
  // 1. Explicit config path
  if (opts.config) {
    const config = parseConfigFile(opts.config);
    return mergeCliOpts(config, opts);
  }

  // 2. If --fleet is given, use auto-discovery (skip config file search)
  if (opts.fleet) {
    return buildFromFlags(opts);
  }

  // 3. Search CWD then global
  const configPath = findConfigFile();
  if (configPath) {
    const config = parseConfigFile(configPath);
    return mergeCliOpts(config, opts);
  }

  // 4. Build config from CLI flags only
  return buildFromFlags(opts);
}

function findConfigFile(): string | null {
  // Check CWD
  for (const name of CONFIG_NAMES) {
    const p = path.join(process.cwd(), name);
    if (fs.existsSync(p)) return p;
  }
  // Check global
  for (const name of CONFIG_NAMES) {
    const p = path.join(GLOBAL_CONFIG_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseConfigFile(filePath: string): FleetHawkConfig {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(raw) as FleetHawkConfig;

  // Resolve env vars in strings like ${FLEETHAWK_TG_TOKEN}
  return resolveEnvVars(parsed);
}

function resolveEnvVars<T>(obj: T): T {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || '') as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars) as unknown as T;
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = resolveEnvVars(val);
    }
    return result as T;
  }
  return obj;
}

function mergeCliOpts(config: FleetHawkConfig, opts: Record<string, any>): FleetHawkConfig {
  if (opts.fleet) config.fleet_dir = opts.fleet;
  if (opts.idleThreshold) config.idle_threshold = opts.idleThreshold;
  if (opts.pollInterval) config.poll_interval = opts.pollInterval;
  return config;
}

function buildFromFlags(opts: Record<string, any>): FleetHawkConfig {
  const fleetDir = opts.fleet || opts.dir;
  if (!fleetDir) {
    console.error('Error: --fleet or --dir required when no config file found');
    process.exit(1);
  }

  const agents = opts.fleet
    ? discoverAgents(opts.fleet)
    : opts.dir
      ? [buildSingleAgent(opts.dir)]
      : [];

  return {
    fleet_dir: fleetDir,
    idle_threshold: opts.idleThreshold || '30m',
    poll_interval: opts.pollInterval || '5m',
    agents,
    alerts: {
      stdout: true,
      ...(opts.alert === 'telegram' ? { telegram: { bot_token: '', chat_id: '' } } : {}),
      ...(opts.alert === 'discord' ? { discord: { webhook_url: '' } } : {}),
    },
    report: {
      format: 'table',
      include_idle: true,
      include_zero_output: true,
    },
  };
}

/**
 * Auto-discover agents by scanning subdirectories of a fleet directory.
 * Reads config.yaml from each agent dir (if present) to get the agent name.
 */
export function discoverAgents(fleetDir: string): AgentConfig[] {
  const agents: AgentConfig[] = [];

  if (!fs.existsSync(fleetDir)) return agents;

  const entries = fs.readdirSync(fleetDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const agentDir = path.join(fleetDir, entry.name);
    let agentName = entry.name;

    // Read agent name from config.yaml if it exists
    const configPath = path.join(agentDir, 'config.yaml');
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = yaml.load(raw) as Record<string, any>;
        if (parsed?.name) {
          agentName = parsed.name;
        }
      } catch {
        // Fall back to directory name
      }
    }

    agents.push({
      name: agentName,
      dir: path.join(agentDir, 'agent'),
      workspace: path.join(fleetDir.replace('/agents', ''), `workspace-${entry.name}`),
      output_signals: [
        { files: '*.ts,*.tsx,*.js,*.json,*.md,*.py' },
        { git_commits: true },
        { session_activity: true },
        { file_size: true },
      ],
    });
  }

  return agents;
}

function buildSingleAgent(dir: string): AgentConfig {
  return {
    name: path.basename(dir),
    dir,
    workspace: dir,
    output_signals: [
      { files: '*' },
      { git_commits: true },
      { file_size: true },
    ],
  };
}
