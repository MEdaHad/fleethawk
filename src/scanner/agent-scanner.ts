import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import simpleGit from 'simple-git';
import { AgentConfig, AgentScanResult, AgentState, AgentStatus } from '../config/types';
import { log } from '../utils/logger';

export class AgentScanner {
  constructor(
    private agent: AgentConfig,
    private previousState: AgentState | null,
    private idleThresholdMs: number
  ) {}

  async scan(): Promise<AgentScanResult> {
    const now = new Date();
    const lastCheck = this.previousState?.last_output_at
      ? new Date(this.previousState.last_output_at)
      : null;

    const [filesResult, gitResult, sessionResult, zeroByteResult] = await Promise.allSettled([
      this.scanFiles(lastCheck),
      this.scanGitCommits(lastCheck),
      this.scanSessionActivity(),
      this.scanZeroByteFiles(),
    ]);

    const filesModified = filesResult.status === 'fulfilled' ? filesResult.value.modified : 0;
    const filesCreated = filesResult.status === 'fulfilled' ? filesResult.value.created : 0;
    const gitCommits = gitResult.status === 'fulfilled' ? gitResult.value : 0;
    const sessionMessages = sessionResult.status === 'fulfilled' ? sessionResult.value : 0;
    const zeroByteFiles = zeroByteResult.status === 'fulfilled' ? zeroByteResult.value : [];

    const hasOutput = filesModified > 0 || filesCreated > 0 || gitCommits > 0 || sessionMessages > 0;

    let lastOutputAt: Date | null = null;
    if (hasOutput) {
      lastOutputAt = now;
    } else if (lastCheck) {
      lastOutputAt = lastCheck;
    }

    const idleDurationMs = lastOutputAt ? now.getTime() - lastOutputAt.getTime() : Infinity;
    const status = this.determineStatus(hasOutput, idleDurationMs, zeroByteFiles.length);

    return {
      agent_name: this.agent.name,
      timestamp: now,
      files_modified: filesModified,
      files_created: filesCreated,
      zero_byte_files: zeroByteFiles,
      git_commits: gitCommits,
      session_messages: sessionMessages,
      last_output_at: lastOutputAt,
      idle_duration_ms: idleDurationMs === Infinity ? -1 : idleDurationMs,
      status,
    };
  }

  private resolveHome(p: string): string {
    if (p.startsWith('~')) {
      return path.join(process.env.HOME || '', p.slice(1));
    }
    return p;
  }

  private async scanFilesInDir(dir: string, patterns: string[], since: Date | null): Promise<{ modified: number; created: number }> {
    let modified = 0;
    let created = 0;

    for (const pattern of patterns) {
      const files = await glob(pattern, { cwd: dir, absolute: true, nodir: true });
      for (const file of files) {
        try {
          const stat = fs.statSync(file);
          if (since) {
            if (stat.mtimeMs > since.getTime()) modified++;
            if (stat.birthtimeMs > since.getTime()) created++;
          } else {
            const oneHourAgo = Date.now() - 3_600_000;
            if (stat.mtimeMs > oneHourAgo) modified++;
          }
        } catch {
          // File may have been deleted between glob and stat
        }
      }
    }

    return { modified, created };
  }

  private async scanFiles(since: Date | null): Promise<{ modified: number; created: number }> {
    const signalConfig = this.agent.output_signals.find((s) => s.files);
    if (!signalConfig?.files) return { modified: 0, created: 0 };

    const patterns = signalConfig.files.split(',').map((p) => p.trim());
    let modified = 0;
    let created = 0;

    // Scan workspace
    const workspace = this.agent.workspace;
    if (fs.existsSync(workspace)) {
      const result = await this.scanFilesInDir(workspace, patterns, since);
      modified += result.modified;
      created += result.created;
    }

    // Scan extra_paths
    if (this.agent.extra_paths) {
      for (const ep of this.agent.extra_paths) {
        const resolved = this.resolveHome(ep);
        if (fs.existsSync(resolved)) {
          const result = await this.scanFilesInDir(resolved, patterns, since);
          modified += result.modified;
          created += result.created;
        }
      }
    }

    return { modified, created };
  }

  private buildGitLogOpts(since: Date | null): Record<string, any> {
    const logOpts: Record<string, any> = { maxCount: 100 };
    if (since) {
      logOpts['--after'] = since.toISOString();
    } else {
      logOpts['--after'] = new Date(Date.now() - 86_400_000).toISOString();
    }
    return logOpts;
  }

  private async countGitCommitsIn(dir: string, since: Date | null): Promise<number> {
    const gitDir = path.join(dir, '.git');
    if (!fs.existsSync(gitDir)) {
      const parentGit = path.join(path.dirname(dir), '.git');
      if (!fs.existsSync(parentGit)) return 0;
    }

    try {
      const git = simpleGit(dir);
      const result = await git.log(this.buildGitLogOpts(since));
      return result.total;
    } catch (err) {
      log.debug(`Git scan failed for ${this.agent.name} in ${dir}: ${err}`);
      return 0;
    }
  }

  private async scanGitCommits(since: Date | null): Promise<number> {
    const hasGitSignal = this.agent.output_signals.some((s) => s.git_commits);
    if (!hasGitSignal) return 0;

    let total = await this.countGitCommitsIn(this.agent.workspace, since);

    if (this.agent.extra_paths) {
      for (const ep of this.agent.extra_paths) {
        const resolved = this.resolveHome(ep);
        if (fs.existsSync(resolved)) {
          total += await this.countGitCommitsIn(resolved, since);
        }
      }
    }

    return total;
  }

  private async scanSessionActivity(): Promise<number> {
    const hasSessionSignal = this.agent.output_signals.some((s) => s.session_activity);
    if (!hasSessionSignal) return 0;

    const sessionsDir = path.join(this.agent.dir, 'sessions');
    if (!fs.existsSync(sessionsDir)) return 0;

    try {
      // Find the most recent session file
      const files = fs.readdirSync(sessionsDir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => ({
          name: f,
          mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length === 0) return 0;

      const latestSession = path.join(sessionsDir, files[0].name);
      const content = fs.readFileSync(latestSession, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      // Compare against previous line count
      const previousLine = this.previousState?.last_session_line || 0;
      const newMessages = Math.max(0, lines.length - previousLine);

      return newMessages;
    } catch (err) {
      log.debug(`Session scan failed for ${this.agent.name}: ${err}`);
      return 0;
    }
  }

  private async scanZeroBytesInDir(dir: string): Promise<string[]> {
    const zeroFiles: string[] = [];
    const allFiles = await glob('**/*', {
      cwd: dir,
      absolute: true,
      nodir: true,
      ignore: ['node_modules/**', '.git/**', '*.log'],
    });

    const oneHourAgo = Date.now() - 3_600_000;

    for (const file of allFiles) {
      const stat = fs.statSync(file);
      if (stat.size === 0 && stat.birthtimeMs > oneHourAgo) {
        zeroFiles.push(path.relative(dir, file));
      }
    }

    return zeroFiles;
  }

  private async scanZeroByteFiles(): Promise<string[]> {
    const hasSignal = this.agent.output_signals.some((s) => s.file_size);
    if (!hasSignal) return [];

    const zeroFiles: string[] = [];

    try {
      const workspace = this.agent.workspace;
      if (fs.existsSync(workspace)) {
        zeroFiles.push(...await this.scanZeroBytesInDir(workspace));
      }

      if (this.agent.extra_paths) {
        for (const ep of this.agent.extra_paths) {
          const resolved = this.resolveHome(ep);
          if (fs.existsSync(resolved)) {
            zeroFiles.push(...await this.scanZeroBytesInDir(resolved));
          }
        }
      }
    } catch (err) {
      log.debug(`Zero-byte scan failed for ${this.agent.name}: ${err}`);
    }

    return zeroFiles;
  }

  private determineStatus(
    hasOutput: boolean,
    idleDurationMs: number,
    zeroByteCount: number
  ): AgentStatus {
    if (hasOutput && zeroByteCount === 0) return 'active';
    if (hasOutput && zeroByteCount > 0) return 'active'; // has output but some are empty
    if (idleDurationMs === -1) return 'no_output';
    if (idleDurationMs > this.idleThresholdMs * 3) return 'silent_fail';
    if (idleDurationMs > this.idleThresholdMs) return 'idle';
    return 'active';
  }
}
