import { AlertPayload } from '../config/types';
import { statusEmoji } from './alerter';
import { formatDuration } from '../utils/duration';
import { log } from '../utils/logger';

export async function sendDiscordAlert(
  config: { webhook_url: string },
  payload: AlertPayload
): Promise<void> {
  const emoji = statusEmoji(payload.status);
  const color = payload.status === 'active' ? 0x00ff00
    : payload.status === 'idle' ? 0xffaa00
    : 0xff0000;

  const embed = {
    title: `${emoji} FleetHawk — ${payload.agent_name}`,
    color,
    fields: [
      { name: 'Status', value: payload.status, inline: true },
      ...(payload.idle_duration_ms > 0
        ? [{ name: 'Idle Duration', value: formatDuration(payload.idle_duration_ms), inline: true }]
        : []),
      { name: 'Details', value: payload.details || 'No additional details' },
    ],
    timestamp: payload.timestamp.toISOString(),
    footer: { text: 'FleetHawk 🦅' },
  };

  try {
    const res = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord webhook ${res.status}: ${body}`);
    }

    log.debug(`Discord alert sent for ${payload.agent_name}`);
  } catch (err) {
    log.error(`Discord alert failed: ${err}`);
    throw err;
  }
}
