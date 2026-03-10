# FleetHawk 🦅

**Silent failure detection for multi-agent AI fleets.**

FleetHawk monitors your AI agent fleet for the failures nobody tells you about: agents that received tasks but produced nothing, models that timed out silently, rate limits that killed work without alerting anyone.

Built by [MedaXP](https://github.com/medahad) — born from running a 6-agent fleet on [OpenClaw](https://openclaw.ai) in production.

## The Problem

You assign 6 agents to work overnight. You wake up and ask: "What did everyone produce?"

The answer is usually: only 1 agents did its tasks. Three agents timed out silently. One produced a 0-byte file.

No framework tells you this. Process monitors say "running." Orchestrators say "task dispatched." But **nobody checks if actual output was produced.**

FleetHawk does.

## What It Does

- **Watches agent output directories** for actual deliverables (files, commits, artifacts)
- **Detects silent failures**: zero-byte outputs, model timeouts, rate limit cooldowns, idle agents
- **Alerts you** via Telegram, Discord webhook, or stdout when an agent has been "active" but produced nothing
- **Generates accountability reports**: agent → tasks received → output produced → time idle
- **Framework-agnostic**: works with OpenClaw, Claude Code, Codex CLI, CrewAI, or any directory-based agent setup

## Install

```bash
npm install -g fleethawk
```

Or with npx:

```bash
npx fleethawk watch --fleet ~/.openclaw/agents/
```

## Quick Start

```bash
# Watch a single agent directory
fleethawk watch --dir ~/.openclaw/agents/neok/agent --idle-threshold 30m

# Watch an entire fleet
fleethawk watch --fleet ~/.openclaw/agents/ --idle-threshold 30m --alert telegram

# Generate accountability report
fleethawk report --fleet ~/.openclaw/agents/ --since 24h

# Check fleet health right now
fleethawk status --fleet ~/.openclaw/agents/
```

## Configuration

Create `fleethawk.config.yaml` in your project root or `~/.config/fleethawk/`:

```yaml
fleet_dir: ~/.openclaw/agents
idle_threshold: 30m
poll_interval: 5m

agents:
  - name: echo
    dir: ~/.openclaw/agents/main/agent
    workspace: ~/.openclaw/workspace
    output_signals:
      - files: "*.md,*.json,*.ts,*.tsx"
      - git_commits: true
      - session_activity: true

  - name: neok
    dir: ~/.openclaw/agents/neok/agent
    workspace: ~/.openclaw/workspace-neok
    output_signals:
      - files: "*.ts,*.tsx,*.js,*.json"
      - git_commits: true

  - name: spark
    dir: ~/.openclaw/agents/spark/agent
    workspace: ~/.openclaw/workspace-spark
    output_signals:
      - files: "*.tsx,*.css,*.html"

alerts:
  telegram:
    bot_token: ${FLEETHAWK_TG_TOKEN}
    chat_id: ${FLEETHAWK_TG_CHAT}
  discord:
    webhook_url: ${FLEETHAWK_DISCORD_WEBHOOK}
  stdout: true

report:
  format: table
  include_idle: true
  include_zero_output: true
```

## Output Signals

FleetHawk doesn't just check "is the process running." It checks for **evidence of actual work**:

| Signal | What It Checks |
|--------|---------------|
| `files` | New or modified files matching glob patterns in workspace |
| `git_commits` | New commits in the workspace git repo |
| `session_activity` | New entries in session JSONL files |
| `outbox` | Files appearing in agent Outbox directories |
| `file_size` | Detects 0-byte outputs (agent wrote but produced nothing) |

## Commands

### `fleethawk watch`
Daemon mode. Continuously monitors agents and alerts on failures.

```
Options:
  --fleet <dir>          Root directory containing agent subdirs
  --dir <dir>            Watch a single agent directory
  --idle-threshold <dur> Alert after this duration of no output (default: 30m)
  --poll-interval <dur>  Check frequency (default: 5m)
  --alert <channel>      Alert channel: telegram, discord, stdout (default: stdout)
  --config <path>        Path to config file
  --daemon               Run as background process
```

### `fleethawk status`
One-shot health check of all agents.

```
$ fleethawk status --fleet ~/.openclaw/agents/

🦅 FleetHawk Status — 2026-03-10 23:45 CET
┌──────────┬────────────┬──────────────┬─────────────────┐
│ Agent    │ Last Output│ Idle Time    │ Status          │
├──────────┼────────────┼──────────────┼─────────────────┤
│ Echo     │ 2min ago   │ —            │ ✅ Active        │
│ NeoK     │ 45min ago  │ 45m          │ ⚠️ Idle          │
│ Spark    │ 3hr ago    │ 3h           │ 🔴 Silent fail  │
│ Apex     │ never      │ —            │ 🔴 No output    │
│ Cipher   │ 1hr ago    │ 1h           │ ⚠️ Idle          │
└──────────┴────────────┴──────────────┴─────────────────┘
```

### `fleethawk report`
Generate an accountability report for a time period.

```
$ fleethawk report --fleet ~/.openclaw/agents/ --since 24h --format markdown

# Fleet Report — Last 24 Hours

## Echo (main)
- Files modified: 14
- Git commits: 6
- Session messages: 89
- Idle periods: 1 (45min, 03:00-03:45)

## NeoK
- Files modified: 2
- Git commits: 1
- Session messages: 12
- Idle periods: 3 (total 4h20m)
- ⚠️ 2 zero-byte outputs detected

## Spark
- Files modified: 0
- Git commits: 0
- Session messages: 3
- 🔴 No deliverables produced in 24h
```

## Failure Detection Patterns

FleetHawk recognizes these failure modes:

1. **Silent timeout** — Agent received task, model timed out, no error surfaced
2. **Zero-byte output** — Agent wrote a file but it's empty (common with batch generation)
3. **Rate limit death** — Model provider in cooldown, agent retries exhausted silently
4. **Orphan task** — Task dispatched to agent with no routing/channel binding
5. **Session bloat stall** — Agent context window full, every new message fails

## Use With Any Framework

FleetHawk is framework-agnostic. It watches directories, not APIs.

```bash
# OpenClaw
fleethawk watch --fleet ~/.openclaw/agents/

# Claude Code workspaces
fleethawk watch --dir ~/projects/my-app --idle-threshold 10m

# CrewAI output dirs
fleethawk watch --dir ./crew_output/

# Any directory where agents write files
fleethawk watch --dir /path/to/agent/output
```

## License

MIT

## Contributing

Issues and PRs welcome. Built by operators who got tired of waking up to discover their agents did nothing overnight.
