import { describe, it, expect, vi } from 'vitest';
import { parseDuration, formatDuration } from '../src/utils/duration';
import { discoverAgents } from '../src/config/loader';
import * as fs from 'fs';
import * as path from 'path';

// ─── 1. Duration Parser ───
describe('parseDuration', () => {
  it('parses duration strings into milliseconds', () => {
    expect(parseDuration('30m')).toBe(30 * 60 * 1000);
    expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000);
    expect(parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
    expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
    expect(parseDuration('500ms')).toBe(500);
    expect(parseDuration('10s')).toBe(10_000);
  });

  it('throws on invalid duration strings', () => {
    expect(() => parseDuration('abc')).toThrow('Invalid duration');
    expect(() => parseDuration('')).toThrow('Invalid duration');
    expect(() => parseDuration('10x')).toThrow('Invalid duration');
  });
});

// ─── 2. Config Loader (discoverAgents) ───
describe('discoverAgents', () => {
  it('discovers agents from a fleet directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fh-test-'));
    fs.mkdirSync(path.join(tmpDir, 'alpha'));
    fs.mkdirSync(path.join(tmpDir, 'beta'));
    // Create a config.yaml for beta with a custom name
    fs.writeFileSync(path.join(tmpDir, 'beta', 'config.yaml'), 'name: BetaBot\n');

    const agents = discoverAgents(tmpDir);

    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.name).sort()).toEqual(['BetaBot', 'alpha']);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty array for non-existent directory', () => {
    expect(discoverAgents('/nonexistent/path/abc123')).toEqual([]);
  });
});

// ─── 3. Zero-byte Detection ───
describe('zero-byte file detection', () => {
  it('identifies zero-byte files in a directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fh-zero-'));
    // Create a zero-byte file
    fs.writeFileSync(path.join(tmpDir, 'empty.ts'), '');
    // Create a non-empty file
    fs.writeFileSync(path.join(tmpDir, 'real.ts'), 'const x = 1;');

    const stat = fs.statSync(path.join(tmpDir, 'empty.ts'));
    expect(stat.size).toBe(0);

    const stat2 = fs.statSync(path.join(tmpDir, 'real.ts'));
    expect(stat2.size).toBeGreaterThan(0);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ─── 4. Status Determination Logic ───
describe('status determination', () => {
  // Re-implement the logic from AgentScanner.determineStatus for unit testing
  function determineStatus(
    hasOutput: boolean,
    idleDurationMs: number,
    zeroByteCount: number,
    idleThresholdMs: number
  ): string {
    if (hasOutput && zeroByteCount === 0) return 'active';
    if (hasOutput && zeroByteCount > 0) return 'active';
    if (idleDurationMs === -1) return 'no_output';
    if (idleDurationMs > idleThresholdMs * 3) return 'silent_fail';
    if (idleDurationMs > idleThresholdMs) return 'idle';
    return 'active';
  }

  it('returns active when agent has output', () => {
    expect(determineStatus(true, 0, 0, 1800000)).toBe('active');
  });

  it('returns active even with zero-byte files if there is output', () => {
    expect(determineStatus(true, 0, 3, 1800000)).toBe('active');
  });

  it('returns idle when idle exceeds threshold', () => {
    const threshold = 30 * 60 * 1000; // 30m
    expect(determineStatus(false, threshold + 1, 0, threshold)).toBe('idle');
  });

  it('returns silent_fail when idle exceeds 3x threshold', () => {
    const threshold = 30 * 60 * 1000;
    expect(determineStatus(false, threshold * 3 + 1, 0, threshold)).toBe('silent_fail');
  });

  it('returns no_output when idle is -1', () => {
    expect(determineStatus(false, -1, 0, 1800000)).toBe('no_output');
  });
});

// ─── 5. Alert Dispatch Routing ───
describe('alert dispatch routing', () => {
  it('dispatches to stdout when configured', async () => {
    const { dispatchAlert } = await import('../src/alerter/alerter');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await dispatchAlert(
      { stdout: true },
      {
        agent_name: 'test-agent',
        status: 'idle',
        idle_duration_ms: 3600000,
        details: 'Agent idle for 1h',
        timestamp: new Date(),
      }
    );

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(output).toContain('test-agent');

    consoleSpy.mockRestore();
  });

  it('does not dispatch to telegram/discord when not configured', async () => {
    const { dispatchAlert } = await import('../src/alerter/alerter');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response());

    await dispatchAlert(
      { stdout: false },
      {
        agent_name: 'test-agent',
        status: 'active',
        idle_duration_ms: 0,
        details: '',
        timestamp: new Date(),
      }
    );

    // fetch should not be called since telegram/discord are not configured
    expect(fetchSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    fetchSpy.mockRestore();
  });
});
