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

┌──────────┬──────────────────────────┬────────────┬──────┬───────┬─────────┬────────────────────────────┬──────────────┐
│ Agent    │ Model                    │ Last Output│ Idle │ Files │ Commits │ Last Task                  │ Status       │
├──────────┼──────────────────────────┼────────────┼──────┼───────┼─────────┼────────────────────────────┼──────────────┤
│ neok     │ openai-codex/gpt-5.4     │ 2m ago     │ 2m   │ 14    │ 2       │ Merge ClawGuard into FH    │ ✅ active    │
│ memo     │ ollama/qwen3.5:9b        │ 51m ago    │ 51m  │ 0     │ 0       │ Summarize ops notes        │ ⚠️ idle      │
│ apex     │ nvidia-minimax/.../m2.5  │ never      │ n/a  │ 0     │ 0       │ —                          │ ❌ no_output │
└──────────┴──────────────────────────┴────────────┴──────┴───────┴─────────┴────────────────────────────┴──────────────┘
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

## neok
- Model: openai-codex/gpt-5.4
- Status: active
- Files modified: 14
- Git commits: 2
- Session messages: 8
- Last task: Merge ClawGuard into FleetHawk
- Errors: none
```

### `fleethawk doctor`
Full fleet diagnostic: model validity, provider mapping, stale gateway, agentDir existence, workspace collisions, identity bleed, ghost agents, repo hygiene, and DB env mismatch checks.

```bash
fleethawk doctor
fleethawk doctor --json
```

### `fleethawk verify models`
Probe each configured agent and compare configured vs responding model.

```bash
fleethawk verify models
```

### `fleethawk verify agent <id>`
Deep inspection for one agent.

```bash
fleethawk verify agent neok
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
- Model misrouting: NeoK running on kimi instead of GPT-5.4
- 86 broken production labs found via automated QA
- Ghost agents in monitoring config
- Workspace identity bleed between Echo and MEMO
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
