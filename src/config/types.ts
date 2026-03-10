// ─── Config Types ───

export interface FleetHawkConfig {
  fleet_dir: string;
  idle_threshold: string; // e.g. "30m", "2h"
  poll_interval: string;  // e.g. "5m"
  agents: AgentConfig[];
  alerts: AlertsConfig;
  report: ReportConfig;
}

export interface AgentConfig {
  name: string;
  dir: string;
  workspace: string;
  output_signals: OutputSignal[];
  extra_paths?: string[];
}

export interface OutputSignal {
  files?: string;        // glob pattern: "*.md,*.json,*.ts"
  git_commits?: boolean;
  session_activity?: boolean;
  outbox?: boolean;
  file_size?: boolean;   // detect 0-byte
}

export interface AlertsConfig {
  telegram?: {
    bot_token: string;
    chat_id: string;
  };
  discord?: {
    webhook_url: string;
  };
  stdout?: boolean;
}

export interface ReportConfig {
  format: 'table' | 'json' | 'markdown';
  include_idle: boolean;
  include_zero_output: boolean;
}

// ─── Runtime Types ───

export type AgentStatus = 'active' | 'idle' | 'silent_fail' | 'no_output';

export interface AgentScanResult {
  agent_name: string;
  timestamp: Date;
  files_modified: number;
  files_created: number;
  zero_byte_files: string[];
  git_commits: number;
  session_messages: number;
  last_output_at: Date | null;
  idle_duration_ms: number;
  status: AgentStatus;
}

export interface FleetState {
  last_check: string; // ISO timestamp
  agents: Record<string, AgentState>;
}

export interface AgentState {
  last_output_at: string | null;
  last_commit_hash: string | null;
  last_session_line: number;
  alerted_at: string | null; // prevent duplicate alerts
}

export interface AlertPayload {
  agent_name: string;
  status: AgentStatus;
  idle_duration_ms: number;
  details: string;
  timestamp: Date;
}

export interface ReportEntry {
  agent_name: string;
  files_modified: number;
  git_commits: number;
  session_messages: number;
  zero_byte_outputs: number;
  idle_periods: { start: Date; end: Date; duration_ms: number }[];
  total_idle_ms: number;
  status: AgentStatus;
}
