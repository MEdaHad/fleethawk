# **FleetHawk** — Trust your AI fleet before you trust its output.

## What is FleetHawk
FleetHawk is a CLI for AI fleet diagnostics, monitoring, and release safety. It works with OpenClaw, Claude Code, Codex, and any agent framework that leaves useful config, workspace, or session artifacts behind.

## Why it exists
AI agents fail silently. Wrong models, stale configs, broken prompts, localhost DBs in production, and ghost monitoring entries all look harmless until they become incidents; FleetHawk catches them before that happens.

## Quick start
```bash
npm install -g fleethawk
fleethawk doctor
```

## All commands

### `fleethawk status`
One-shot fleet health view with model names, last activity, last task, and colored status.

```bash
fleethawk status
```

Sample output:
```text
🦅 FleetHawk Status

┌──────────┬──────────────────────────────┬────────────┬──────┬───────┬─────────┬────────────────────────────┬──────────────┐
│ Agent    │ Model                        │ Last Output│ Idle │ Files │ Commits │ Last Task                  │ Status       │
├──────────┼──────────────────────────────┼────────────┼──────┼───────┼─────────┼────────────────────────────┼──────────────┤
│ atlas    │ anthropic/claude-sonnet-4-6  │ 2m ago     │ 2m   │ 14    │ 2       │ Refactor auth module       │ ✅ active    │
│ nova     │ openai/gpt-5.4              │ 15m ago    │ 15m  │ 8     │ 1       │ Fix payment webhook        │ ✅ active    │
│ scout    │ google/gemini-2.5-pro        │ 1h ago     │ 1h   │ 3     │ 0       │ Research API docs          │ ⚠️ idle      │
│ forge    │ anthropic/claude-opus-4-6    │ 3h ago     │ 3h   │ 0     │ 0       │ Deep code review           │ 🔴 silent    │
│ pixel    │ ollama/qwen3.5-35b-a3b          │ never      │ n/a  │ 0     │ 0       │ —                          │ 🔴 no output │
│ sage     │ moonshot/kimi-k2.5        │ 45m ago    │ 45m  │ 2     │ 0       │ Summarize meeting notes    │ ⚠️ idle      │
└──────────┴──────────────────────────────┴────────────┴──────┴───────┴─────────┴────────────────────────────┴──────────────┘
```

### `fleethawk watch`
Continuous monitoring with configurable thresholds and deduped alerts.

```bash
fleethawk watch --idle-threshold 20m --poll-interval 2m
```

### `fleethawk monitor`
Combined watch + periodic doctor checks.

```bash
fleethawk monitor --poll-interval 2m --doctor-interval 30m
```

### `fleethawk report`
Accountability report with table, markdown, or JSON output.

```bash
fleethawk report --format md
fleethawk report --format json
```

Sample markdown excerpt:
```md
# FleetHawk Report

## atlas
- Model: anthropic/claude-sonnet-4-6
- Status: active
- Files modified: 14
- Git commits: 2
- Session messages: 8
- Last task: Refactor auth module
- Errors: none

## nova
- Model: openai/gpt-5.4
- Status: active
- Files modified: 8
- Git commits: 1
- Session messages: 5
- Last task: Fix payment webhook
- Errors: none

## scout
- Model: google/gemini-2.5-pro
- Status: idle
- Files modified: 3
- Git commits: 0
- Session messages: 12
- Last task: Research API docs
- Errors: none
```

### `fleethawk doctor`
Full fleet diagnostic: model validity, provider mapping, stale gateway, agentDir existence, workspace collisions, identity bleed, ghost agents, repo hygiene, and DB env mismatch checks.

```bash
fleethawk doctor
fleethawk doctor --json
```

Sample output:
```text
🦅 FleetHawk Doctor

✅ atlas — model anthropic/claude-sonnet-4-6 valid
✅ nova — model openai/gpt-5.4 valid
✅ scout — model google/gemini-2.5-pro valid
✅ forge — model anthropic/claude-opus-4-6 valid
⚠️ pixel — model ollama/llama-3.2:8b (local model, cannot verify remotely)
✅ sage — model nvidia-kimi/kimi-k2.5 valid
✅ Gateway running (pid 4821, port 18789)
✅ No workspace collisions detected
✅ No identity bleed between agents
⚠️ pixel workspace dir does not exist: ~/.agents/workspace-pixel
✅ DB env check passed — NEON_DATABASE_URL set, no localhost in production
✅ No ghost agents in monitoring config

Results: 10 passed, 2 warnings, 0 critical
```

### `fleethawk verify models`
Probe each configured agent and compare configured vs responding model.

```bash
fleethawk verify models
```

### `fleethawk verify agent <id>`
Deep inspection for one agent.

```bash
fleethawk verify agent atlas
```

### `fleethawk verify db`
Database target safety check for the current repo.

```bash
fleethawk verify db
```

### `fleethawk release-check`
Pre-merge safety gate for branch hygiene, SQL artifacts, and DB env risks.

```bash
fleethawk release-check
```

### `fleethawk audit security`
Searches for common secret leaks, debug routes, missing rate-limit clues, and runs `npm audit`.

```bash
fleethawk audit security
```

### `fleethawk audit deps`
Dependency health snapshot.

```bash
fleethawk audit deps
```

### `fleethawk fleet-map`
Prints fleet topology in a clean table.

```bash
fleethawk fleet-map
```

### `fleethawk config validate`
Validates `openclaw.json` for missing models, missing agent dirs, and workspace collisions.

```bash
fleethawk config validate
```

### `fleethawk init`
Generate a starter `fleethawk.config.yaml` from a fleet directory.

```bash
fleethawk init --fleet ~/agents
```

## Configuration
FleetHawk reads from `~/.openclaw/openclaw.json` by default. You can also point it at a FleetHawk YAML config via `--config`, or a custom OpenClaw config via `--openclaw-config`.

## Real issues caught
These are the kinds of failures FleetHawk is designed to catch:
- Model misrouting: an agent configured for GPT-5.4 silently running on a fallback model
- Broken production resources found via automated QA
- Ghost agents in monitoring config that no longer exist
- Workspace identity bleed between agents sharing directories
- Malformed database URLs (double `postgresql://` prefix)
- Stale gateway state after config changes

## Works with
- OpenClaw
- Claude Code
- Codex
- Any agent framework with readable config, workspaces, sessions, or repo artifacts

## Contributing
PRs welcome, issues on GitHub.

## License
MIT
