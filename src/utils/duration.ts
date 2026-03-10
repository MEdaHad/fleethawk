const UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parse a duration string like "30m", "2h", "24h", "1d" into milliseconds.
 */
export function parseDuration(input: string): number {
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i);
  if (!match) {
    throw new Error(`Invalid duration: "${input}". Use format like 30m, 2h, 1d`);
  }
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  return Math.floor(value * UNITS[unit]);
}

/**
 * Format milliseconds into a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.round((ms % 3_600_000) / 60_000);
    return m > 0 ? `${h}h${m}m` : `${h}h`;
  }
  const d = Math.floor(ms / 86_400_000);
  const h = Math.round((ms % 86_400_000) / 3_600_000);
  return h > 0 ? `${d}d${h}h` : `${d}d`;
}
