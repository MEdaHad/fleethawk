export { FleetWatcher } from './watcher/fleet-watcher';
export { AgentScanner } from './scanner/agent-scanner';
export { loadConfig, discoverAgents } from './config/loader';
export { dispatchAlert } from './alerter/alerter';
export { printStatus } from './reporter/status';
export { generateReport } from './reporter/report';
export { doctorCommand, verifyModelsCommand, verifyAgentCommand, verifyDbCommand, releaseCheckCommand, runDoctorChecks } from './doctor';
export type {
  FleetHawkConfig,
  AgentConfig,
  AgentScanResult,
  AgentStatus,
  AlertPayload,
  FleetState,
  CheckResult,
  DoctorSummary,
  ModelVerificationResult,
} from './config/types';
