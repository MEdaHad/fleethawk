export interface FleetHawkConfig {
  fleet_dir: string;
  idle_threshold: string;
  poll_interval: string;
  doctor_interval?: string;
  config_path?: string;
  agents: AgentConfig[];
  alerts: AlertsConfig;
  report: ReportConfig;
  openclaw?: OpenClawConfig | null;
}

export interface AgentConfig {
  name: string;
  dir: string;
  workspace: string;
  output_signals: OutputSignal[];
  extra_paths?: string[];
  model?: AgentModel;
  fallback_chain?: string[];
  raw?: OpenClawAgentConfig;
}

export interface OutputSignal {
  files?: string;
  git_commits?: boolean;
  session_activity?: boolean;
  outbox?: boolean;
  file_size?: boolean;
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
  format: 'table' | 'json' | 'markdown' | 'md';
  include_idle: boolean;
  include_zero_output: boolean;
}

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
  model?: string;
  last_task?: string | null;
  errors?: string[];
}

export interface FleetState {
  last_check: string;
  last_doctor_check?: string | null;
  agents: Record<string, AgentState>;
  alerts_seen?: Record<string, string>;
}

export interface AgentState {
  last_output_at: string | null;
  last_commit_hash: string | null;
  last_session_line: number;
  alerted_at: string | null;
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
  total_idle_ms: number;
  status: AgentStatus;
  model?: string;
  last_task?: string | null;
  errors?: string[];
}

export interface AgentModel {
  primary: string;
  fallbacks?: string[];
}

export interface OpenClawAgentConfig {
  name: string;
  model?: AgentModel;
  agentDir?: string;
  workspace?: string;
  [key: string]: unknown;
}

export interface OpenClawConfig {
  agents?: {
    defaults?: {
      model?: AgentModel;
      workspace?: string;
    };
    list?: OpenClawAgentConfig[];
  };
  [key: string]: unknown;
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  details?: string[];
}

export interface DoctorSummary {
  generated_at: string;
  config_path?: string;
  checks: CheckResult[];
}

export interface ModelVerificationResult {
  agent: string;
  configured_model: string;
  responding_model: string;
  latency_ms: number;
  fallback_triggered: boolean;
  status: 'ok' | 'warn' | 'fail';
  error?: string;
}
