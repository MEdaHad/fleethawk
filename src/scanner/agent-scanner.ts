import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import simpleGit from 'simple-git';
import { AgentConfig, AgentScanResult, AgentState, AgentStatus } from '../config/types';

export class AgentScanner {
  constructor(
    private agent: AgentConfig,
    private previousState: AgentState | null,
    private idleThresholdMs: number,
  ) {}

  async scan(): Promise<AgentScanResult> {
    const now = new Date();
    const lastCheck = this.previousState?.last_output_at ? new Date(this.previousState.last_output_at) : null;

    const [filesResult, gitResult, sessionResult, zeroByteResult, taskResult] = await Promise.allSettled([
      this.scanFiles(lastCheck),
      this.scanGitCommits(lastCheck),
      this.scanSessionActivity(),
      this.scanZeroByteFiles(),
      this.readLastTask(),
    ]);

    const filesModified = filesResult.status === 'fulfilled' ? filesResult.value.modified : 0;
    const filesCreated = filesResult.status === 'fulfilled' ? filesResult.value.created : 0;
    const gitCommits = gitResult.status === 'fulfilled' ? gitResult.value : 0;
    const sessionMessages = sessionResult.status === 'fulfilled' ? sessionResult.value : 0;
    const zeroByteFiles = zeroByteResult.status === 'fulfilled' ? zeroByteResult.value : [];
    const lastTask = taskResult.status === 'fulfilled' ? taskResult.value : null;

    const hasOutput = filesModified > 0 || filesCreated > 0 || gitCommits > 0 || sessionMessages > 0;
    const lastOutputAt = hasOutput ? now : lastCheck;
    const idleDurationMs = lastOutputAt ? now.getTime() - lastOutputAt.getTime() : -1;
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
      idle_duration_ms: idleDurationMs,
      status,
      model: this.agent.model?.primary,
      last_task: lastTask,
      errors: [],
    };
  }

  private determineStatus(hasOutput: boolean, idleDurationMs: number, zeroByteCount: number): AgentStatus {
    if (!this.previousState?.last_output_at && !hasOutput) return 'no_output';
    if (hasOutput) return zeroByteCount > 0 ? 'idle' : 'active';
    if (idleDurationMs >= this.idleThresholdMs) return 'silent_fail';
    return 'idle';
  }

  private async scanFiles(since: Date | null): Promise<{ modified: number; created: number }> {
    const signal = this.agent.output_signals.find((item) => item.files);
    if (!signal?.files) return { modified: 0, created: 0 };
    const patterns = signal.files.split(',').map((item) => item.trim());
    let modified = 0;
    let created = 0;
    for (const dir of [this.agent.workspace, ...(this.agent.extra_paths ?? [])]) {
      if (!fs.existsSync(dir)) continue;
      for (const pattern of patterns) {
        const files = await glob(pattern, { cwd: dir, absolute: true, nodir: true });
        for (const file of files) {
          try {
            const stat = fs.statSync(file);
            const sinceMs = since?.getTime() ?? Date.now() - 3_600_000;
            if (stat.mtimeMs > sinceMs) modified += 1;
            if (stat.birthtimeMs > sinceMs) created += 1;
          } catch {
            // ignore disappearing files
          }
        }
      }
    }
    return { modified, created };
  }

  private async scanGitCommits(since: Date | null): Promise<number> {
    if (!this.agent.output_signals.some((item) => item.git_commits)) return 0;
    const dirs = [this.agent.workspace, ...(this.agent.extra_paths ?? [])];
    let total = 0;
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const git = simpleGit(dir);
        const result = await git.log({ '--after': (since ?? new Date(Date.now() - 86_400_000)).toISOString(), maxCount: 100 });
        total += result.total;
      } catch {
        // ignore non-git dirs
      }
    }
    return total;
  }

  private async scanSessionActivity(): Promise<number> {
    if (!this.agent.output_signals.some((item) => item.session_activity)) return 0;
    const sessionsDir = path.join(this.agent.dir, 'sessions');
    if (!fs.existsSync(sessionsDir)) return 0;
    const files = fs.readdirSync(sessionsDir)
      .filter((file) => file.endsWith('.jsonl'))
      .map((file) => ({ file, mtimeMs: fs.statSync(path.join(sessionsDir, file)).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (files.length === 0) return 0;
    const latest = path.join(sessionsDir, files[0].file);
    const lines = fs.readFileSync(latest, 'utf8').split('\n').filter(Boolean);
    const previousLine = this.previousState?.last_session_line ?? 0;
    return Math.max(0, lines.length - previousLine);
  }

  private async scanZeroByteFiles(): Promise<string[]> {
    const zeroFiles: string[] = [];
    for (const dir of [this.agent.workspace, ...(this.agent.extra_paths ?? [])]) {
      if (!fs.existsSync(dir)) continue;
      const files = await glob('**/*', { cwd: dir, absolute: true, nodir: true, ignore: ['node_modules/**', '.git/**'] });
      for (const file of files) {
        try {
          const stat = fs.statSync(file);
          if (stat.size === 0 && stat.birthtimeMs > Date.now() - 3_600_000) {
            zeroFiles.push(path.relative(dir, file));
          }
        } catch {
          // ignore
        }
      }
    }
    return zeroFiles;
  }

  private async readLastTask(): Promise<string | null> {
    const sessionsDir = path.join(this.agent.dir, 'sessions');
    if (!fs.existsSync(sessionsDir)) return null;
    const files = fs.readdirSync(sessionsDir)
      .filter((file) => file.endsWith('.jsonl'))
      .map((file) => ({ file, mtimeMs: fs.statSync(path.join(sessionsDir, file)).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (files.length === 0) return null;
    const lines = fs.readFileSync(path.join(sessionsDir, files[0].file), 'utf8').split('\n').filter(Boolean).slice(-50).reverse();
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as { text?: string; content?: string; role?: string };
        const text = parsed.text ?? parsed.content;
        if (parsed.role === 'user' && typeof text === 'string' && text.trim()) {
          return text.trim().replace(/\s+/g, ' ').slice(0, 80);
        }
      } catch {
        continue;
      }
    }
    return null;
  }
}
