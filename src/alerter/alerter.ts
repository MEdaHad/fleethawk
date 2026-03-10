import { AlertsConfig, AlertPayload, AgentStatus } from '../config/types';
import { sendTelegramAlert } from './telegram';
import { sendDiscordAlert } from './discord';
import { printStdoutAlert } from './stdout';
import { log } from '../utils/logger';

export async function dispatchAlert(config: AlertsConfig, payload: AlertPayload): Promise<void> {
  const promises: Promise<void>[] = [];

  if (config.stdout) {
    promises.push(printStdoutAlert(payload));
  }

  if (config.telegram?.bot_token && config.telegram?.chat_id) {
    promises.push(sendTelegramAlert(config.telegram, payload));
  }

  if (config.discord?.webhook_url) {
    promises.push(sendDiscordAlert(config.discord, payload));
  }

  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === 'rejected') {
      log.error(`Alert dispatch failed: ${result.reason}`);
    }
  }
}

export function statusEmoji(status: AgentStatus): string {
  switch (status) {
    case 'active': return '✅';
    case 'idle': return '⚠️';
    case 'silent_fail': return '🔴';
    case 'no_output': return '🔴';
    default: return '❓';
  }
}
