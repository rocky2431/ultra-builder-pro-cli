# ultra-builder-pro-cli — Roadmap

> **Current roadmap**. [`DECISIONS.md`](./DECISIONS.md) defines the current
> authority and package boundaries. Executable contracts live in `spec/`,
> `AGENT-CONTEXT.md`, and `RUNTIME-COMPAT-MATRIX.md`; source and contract tests
> win when roadmap text drifts.

**Goal**: distribute the Ultra Builder Pro engineering loop as native Claude
Code, OpenCode, Codex, and Kimi Code plugins, and run it with isolated sessions
sharing one authoritative workflow store.

**First-class runtimes**: Claude Code · OpenCode · Codex · Kimi Code.

**Distribution channels (v1.0)**: npm · Homebrew · pip.

**Release line**: the `package.json` version; every release is gated by
`npm run verify:release`.

---

## Milestones

| Release | Week | Contents                                                                  |
|---------|-----:|---------------------------------------------------------------------------|
| **v0.1**| 8    | Rule layer + execution-lite (session isolation + admission + event subscribe + active-session visibility) — solves the core "independent conversations don't pollute each other" pain |
| **v0.2**| 11   | Auto-recovery + monitoring + full conformance |
| **v0.3**| 16   | PRD → execution-plan artifact → parallel dispatch / merge — coding factory |
| **v1.0**| 17–18| Three-channel publish (npm + Homebrew + pip)                              |

## Phase status

| Phase | Title                                          | Status        |
|-------|------------------------------------------------|---------------|
| 0     | Skeleton                                       | ✅ done (`da69a7a`) |
| 1     | Three-layer interface contracts (`spec/`)      | ✅ done (D38) |
| 2     | Authoritative state — SQLite + WAL             | ✅ done (D39, `e286e41`) |
| 3     | Command thin-shells (skill + MCP + CLI)        | ✅ done (D40, `b3d1797`) |
| 4     | Cross-runtime distribution + 4.6a smoke flow   | ✅ done (D41, `5aa1fd0`) |
| 4.5   | Execution-lite (session + admission + events)  | ✅ done (D42, `0d3e5ed`) — **v0.1 ready** |
| 5     | Recovery + staleness + auto-routing            | ✅ done (D43) → v0.2 |
| 6     | Monitoring + telemetry                          | ✅ done (D44) → v0.2 |
| 4.6b  | Full conformance suite                         | ✅ done (D45) — 20 conformance + 21 resolveTarget tests |
| 7     | tagged tasks + skill mining; retired Ultra memory delegated to external providers | ✅ superseded by the package-boundary cleanup |
| 8A    | Plan automation (parse / topo / expand + artifact + human gate) | ✅ done (D47, `a932cb8`) → v0.3 |
| 8B    | Execution automation (dispatch / parallel worktree / merge) | ✅ done (D48, `8224159`) — **v0.3 ready** |
| 8C    | Continuous change packets + context compiler + convergence + doctor | ✅ done (D52) |
| 10    | Context Manifest v3 + breadcrumb + fresh-context budget + spec learning + two-axis review | ✅ done |
| 11    | Greenfield/brownfield baseline adoption + advisory context budgets + convergence gate | ✅ done |
| 12    | Repository evidence snapshots + gap ledger + migration re-adoption + incident governance | ✅ done |
| 13    | Durable init-to-delivery workflows + task execution contracts + immutable stage evidence | ✅ done |
| 16    | Resumable one-question owner-agent decisions + artifact checkpoints + workflow gates | ✅ done |
| 9     | Release pipeline                               | npm tag publishing live; Homebrew / pip not implemented |

## What is in the repo today

```
spec/                       ← Phase 1 single source of truth
├── mcp-tools.yaml          (50 live tools across 8 families)
├── cli-protocol.md         (CLI ↔ MCP mapping table)
├── schemas/                (state-db.sql + 4 JSON schemas)
├── fixtures/{valid,invalid}/  (+ v4.4-project for migration)
└── scripts/test-all.cjs    (npm run test:spec — 7 validation stages)

mcp-server/                 ← Phase 2 authoritative state layer
├── server.cjs              (stdio MCP server, 50 task/session/baseline/change/decision/workflow/system/plan tools)
├── lib/
│   ├── state-db.cjs        (SQLite + WAL + pragmas)
│   ├── state-ops.cjs       (full write API, status state machine)
│   ├── baseline-workflow.cjs (project adoption + approval + reconciliation)
│   ├── decision-dialogue.cjs (one-question authority + checkpoint gates)
│   ├── workflow-state.cjs  (ordered stage runs, evidence, output digests, and gates)
│   └── projector.cjs       (state.db → tasks.json + context md)
└── tests/                  (npm run test:state)

ultra-tools/                ← CLI fallback, migration, and diagnostics
├── cli.cjs
└── commands/
    ├── db.cjs              (init/checkpoint/vacuum/integrity/backup)
    ├── migrate.cjs         (v4.4 projection → v4.5 authority; v4.5 projection → current schema; dry/rollback)
    └── legacy-memory.cjs   (explicit inspect/archive/confirmed prune)

bin/install.js              ← multi-runtime installer
adapters/                   ← native Claude/OpenCode/Codex plugin builders
skills/                     ← allowlisted Ultra workflows, internal rules, and collab companions
hooks/                      ← 7 executable workflow hooks + shared Context Spine helper; OpenCode uses native JavaScript hooks
docs/
├── DECISIONS.md                 current authority and package boundaries
├── ARCHITECTURE.md              Phase 1 single-page entry point
├── WORKFLOW-LIFECYCLE.md        baseline classification + DB transition contract
├── AGENT-CONTEXT.md             Phase 3 canonical runtime context contract
├── PLUGIN-ISOLATION-CONTRACT.md install, activation, idle, and ownership contract
├── RUNTIME-COMPAT-MATRIX.md     Phase 4 runtime capability matrix
├── STATE-DB-ACCESS-POLICY.md    Phase 2 multi-process write contract
├── COMMIT-HASH-BACKFILL.md      Phase 2.8 two-commit completion flow
└── ROADMAP.md                   this file
```

## How to verify

```
npm install
npm run test:all
python3 -m pytest hooks/tests -q
npm audit
```

## Out of scope for v1.0 (deferred)

Additional runtimes, a web dashboard or TUI, a team-collaboration server, and
an independent plugin marketplace remain deferred until a current product
decision brings them into scope.
