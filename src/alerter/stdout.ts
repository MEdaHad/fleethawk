import { AlertPayload } from '../config/types';
import { statusEmoji } from './alerter';
import { formatDuration } from '../utils/duration';

export async function printStdoutAlert(payload: AlertPayload): Promise<void> {
  const emoji = statusEmoji(payload.status);
  const idle = payload.idle_duration_ms > 0 ? ` (idle ${formatDuration(payload.idle_duration_ms)})` : '';
  console.log(`${emoji} ${payload.agent_name}: ${payload.status}${idle} — ${payload.details}`);
}
