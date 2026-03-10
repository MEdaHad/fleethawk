# FLEETHAWK BUILD DIRECTIVE — TONIGHT
# Send this entire block to Echo via Telegram

```
Echo — new project: FleetHawk.
Open-source CLI tool for multi-agent silent failure detection.
Public repo, MIT license. This ships tonight.

SETUP (Echo — 10 min):
1. Create GitHub repo:
   cd ~/MedaXP
   mkdir fleethawk && cd fleethawk
   git init
   gh repo create medahad/fleethawk --public \
     --description "Silent failure detection for multi-agent AI fleets" \
     --license MIT
   git remote add origin git@github.com:medahad/fleethawk.git

2. Copy scaffold from /Users/echoenv/fleethawk-scaffold/
   (I will drop the scaffold files there — see below)
   cp -r /Users/echoenv/fleethawk-scaffold/* ~/MedaXP/fleethawk/
   cd ~/MedaXP/fleethawk
   npm install
   git add -A && git commit -m "init: fleethawk scaffold" && git push -u origin main

TASK SPLIT — PARALLEL WORK:

═══ NEOK TASKS (coding — use /model codex) ═══

Task N1 (15 min): Fix imports and make it compile.
  cd ~/MedaXP/fleethawk
  npx tsc --noEmit
  Fix all type errors. Every file must compile clean.
  Commit: "fix: resolve all TypeScript compilation errors"

Task N2 (15 min): Wire up the CLI commands end-to-end.
  Test: npx ts-node src/cli.ts status --fleet ~/.openclaw/agents/
  Test: npx ts-node src/cli.ts report --fleet ~/.openclaw/agents/ --since 24h
  Fix any runtime errors. Must produce output (even if empty table).
  Commit: "feat: wire CLI commands end-to-end"

Task N3 (15 min): Add auto-discovery mode.
  When --fleet is given with no config file, auto-discover agents
  by scanning subdirectories. Read agent name from config.yaml
  in each agent dir if it exists.
  Test with: npx ts-node src/cli.ts status --fleet ~/.openclaw/agents/
  Should list all 5 agents (main, neok, spark, apex, cipher).
  Commit: "feat: auto-discover agents from fleet directory"

Task N4 (15 min): Add --init command.
  fleethawk init --fleet ~/.openclaw/agents/
  Auto-generates fleethawk.config.yaml with discovered agents.
  Commit: "feat: init command generates config from fleet"

Task N5 (15 min): Write 5 unit tests with vitest.
  Test duration parser, config loader, zero-byte detection,
  status determination logic, alert dispatch routing.
  npx vitest run
  Commit: "test: core unit tests"

═══ ECHO TASKS (orchestration + docs + polish) ═══

Task E1 (15 min): Review NeoK's N1 output.
  Run npx tsc --noEmit. If errors remain, fix them yourself.
  Verify the status command works against our actual fleet.

Task E2 (15 min): Create fleethawk.config.yaml for OUR fleet.
  Write a real config for MedaXP's OpenClaw setup:
  - 5 agents: main/echo, neok, spark, apex, cipher
  - Real workspace paths
  - Telegram alert with our bot token
  - Discord webhook to #alerts
  Save to ~/.config/fleethawk/fleethawk.config.yaml
  Test: npx ts-node src/cli.ts status
  Commit: "docs: add real-world OpenClaw config example"

Task E3 (15 min): Run fleethawk against our actual fleet.
  Capture output of status and report commands.
  Screenshot/paste to Telegram for boss review.
  If any agent shows "no_output" or "silent_fail" — that's correct,
  it proves the tool works.

Task E4 (10 min): Final polish.
  - Verify README examples match actual CLI output
  - Add CONTRIBUTING.md (short: fork, branch, PR)
  - npm run build must succeed
  - Push all to main
  - Create GitHub release v0.1.0
  Commit: "release: v0.1.0"

═══ EXECUTION ORDER ═══

1. Echo: setup repo (E0)
2. NeoK: N1 → N2 → N3 (sequential, each 15min)
3. Echo: E1 (review after N2)
4. NeoK: N4 → N5 (parallel with Echo E2-E3)
5. Echo: E2 → E3 → E4

═══ RULES ═══
- All commits go to main via git push origin main
- NeoK: use /model codex for all coding
- Every task is 15 minutes MAX. If stuck, skip and move on.
- Zero idle time. If waiting on NeoK, work on E2/E3.
- Post progress to Telegram after each commit.
- Final deliverable: working CLI that runs against our fleet.
```
