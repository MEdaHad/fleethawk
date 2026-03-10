import { AlertPayload } from '../config/types';
import { statusEmoji } from './alerter';
import { formatDuration } from '../utils/duration';
import { log } from '../utils/logger';

export async function sendTelegramAlert(
  config: { bot_token: string; chat_id: string },
  payload: AlertPayload
): Promise<void> {
  const emoji = statusEmoji(payload.status);
  const text = [
    `${emoji} *FleetHawk Alert*`,
    `Agent: \`${payload.agent_name}\``,
    `Status: ${payload.status}`,
    payload.idle_duration_ms > 0 ? `Idle: ${formatDuration(payload.idle_duration_ms)}` : '',
    payload.details,
    `_${payload.timestamp.toISOString()}_`,
  ].filter(Boolean).join('\n');

  const url = `https://api.telegram.org/bot${config.bot_token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chat_id,
        text,
        parse_mode: 'Markdown',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram API ${res.status}: ${body}`);
    }

    log.debug(`Telegram alert sent for ${payload.agent_name}`);
  } catch (err) {
    log.error(`Telegram alert failed: ${err}`);
    throw err;
  }
}
