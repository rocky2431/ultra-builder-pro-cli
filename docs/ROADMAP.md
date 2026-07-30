# Ultra Builder Pro roadmap

The current product is a five-host adaptive delivery harness with a seven-tool
persistence and safety kernel. `docs/DECISIONS.md` defines durable decisions;
schemas, source, and contract tests define executable behavior.

## Current release boundary

- First-class hosts: Claude Code, OpenCode, Codex, Kimi Code, and Grok Build.
- Distribution: npm package plus host-native generated plugins.
- Public semantic workflows: 11 explicit Skills.
- Public MCP surface: exactly 7 tools.
- Local authority: `.ultra/.runtime/state.db`.
- Team handoff: `.ultra/tasks/tasks.json` and tracked semantic/evidence artifacts.
- General memory, code graph, browser, deployment, and framework guidance: external.

## Current repository

```text
spec/
├── mcp-tools.yaml
├── cli-protocol.md
├── schemas/
└── fixtures/

mcp-server/
├── server.cjs
├── hook-context.cjs
└── lib/
    ├── ultra-facade.cjs
    ├── context-envelope.cjs
    ├── decision-records.cjs
    ├── stage-checkpoints.cjs
    ├── worker-packet.cjs
    ├── task-ledger.cjs
    ├── state-db.cjs
    ├── state-ops.cjs
    ├── artifact-registry.cjs
    ├── baseline-workflow.cjs
    ├── change-workflow.cjs
    ├── doctor.cjs
    └── projector.cjs

adapters/
├── claude.js
├── opencode.js
├── codex.js
├── kimi.js
└── grok.js

hooks/
├── active_task_context.py
├── context_envelope.py
├── health_check.py
├── pre_stop_check.py
├── runtime_paths.py
├── subagent_tracker.py
├── workflow_checkpoint.py
├── workflow_context.py
└── workflow_resume.py

skills/                 # 11 public, 4 internal, explicit collab companions
agents/                 # bounded Worker Packet consumers
ultra-tools/            # CLI diagnostics, migration, and recovery
orchestrator/           # optional approved Worker Packet dispatch
```

Retired semantic-supervisor modules remain only in source migration/regression history
and are excluded from the npm package. They do not authorize current Stage
Checkpoints, Sessions, Skills, or archive.

## Completed product invariants

- MCP does not select semantic routes or pre-authorize reasoning steps.
- Draft Stage Checkpoints are mutable; accepted revisions are immutable and
  supersedable.
- Context, accepted decisions, and evidence are visible across sessions and Git
  checkout sync.
- Every delegated worker receives an immutable Worker Packet.
- All five host installers stage, preflight, and atomically swap complete native
  runtimes.
- v4.4/v4.5 and v0.22/v0.23 authority migrates backup-first.
- Hooks are observation/injection/protection only.
- `.runtime` stays local while reviewed intent and evidence remain team-trackable.

## Verification

```bash
npm run verify:release
npm pack --dry-run --json
node bin/install.js --all --global --doctor --json
```

The release gate also installs the tarball into a clean consumer and exercises public
write/read/backup/reopen through every generated host launcher.

## Deferred product directions

A web dashboard or TUI, a collaboration server, Homebrew/pip distribution, and an
independent marketplace remain uncommitted product directions. They must enter through
a new explicit decision and Change rather than this roadmap silently promising them.
