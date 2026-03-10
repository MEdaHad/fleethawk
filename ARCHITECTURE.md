# FleetHawk Architecture

## Module Map

```
src/
├── cli.ts              # Entry point — Commander.js CLI
├── index.ts            # Programmatic API exports
├── config/
│   ├── loader.ts       # Load & validate fleethawk.config.yaml
│   └── types.ts        # TypeScript interfaces for config
├── scanner/
│   ├── agent-scanner.ts    # Core: scan agent dirs for output signals
│   ├── file-signal.ts      # Detect new/modified files via glob + mtime
│   ├── git-signal.ts       # Detect new commits via simple-git
│   ├── session-signal.ts   # Parse JSONL session files for activity
│   └── zero-byte.ts        # Detect 0-byte output files
├── watcher/
│   ├── fleet-watcher.ts    # Poll loop: runs scanners on interval
│   └── daemon.ts           # Background process mode
├── alerter/
│   ├── alerter.ts          # Alert dispatcher (routes to channels)
│   ├── telegram.ts         # Telegram Bot API alerts
│   ├── discord.ts          # Discord webhook alerts
│   └── stdout.ts           # Terminal output alerts
├── reporter/
│   ├── status.ts           # One-shot status table
│   ├── report.ts           # Time-range accountability report
│   └── formatters.ts       # Table / JSON / Markdown output
└── utils/
    ├── duration.ts         # Parse "30m", "2h", "24h" strings
    └── logger.ts           # Minimal logger with levels
```

## Data Flow

```
[Agent Directories]
        │
        ▼
   AgentScanner (runs per agent)
   ├── FileSignal   → glob workspace, compare mtime vs last check
   ├── GitSignal    → simple-git log --since=<last_check>
   ├── SessionSignal → tail JSONL, count new entries
   └── ZeroByte     → find files with size === 0
        │
        ▼
   FleetWatcher (aggregates all agents)
   ├── Compares current scan vs previous scan
   ├── Calculates idle duration per agent
   └── Triggers alerts when threshold exceeded
        │
        ▼
   Alerter (dispatches to configured channels)
   ├── Telegram → POST /sendMessage
   ├── Discord  → POST webhook
   └── Stdout   → chalk-formatted terminal output
```

## Key Design Decisions

1. **Poll-based, not watch-based**: chokidar is available for file watching
   but the primary loop is a poll interval. File watching is unreliable
   across networked filesystems and Docker volumes. Poll is predictable.

2. **Signal-based detection**: Each output signal type is a separate module.
   Easy to add new signal types (e.g., API call logs, database writes).

3. **State file**: FleetHawk writes `.fleethawk-state.json` in the config
   dir to track last-seen timestamps per agent. This survives restarts.

4. **Zero dependencies on agent frameworks**: FleetHawk reads files and
   git repos. It does not import OpenClaw, CrewAI, or any agent SDK.

5. **Alerts are idempotent**: Same failure state doesn't re-alert until
   the agent produces new output (then goes idle again).
