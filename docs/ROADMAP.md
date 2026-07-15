# ultra-builder-pro-cli — Roadmap

> **Authoritative roadmap**: [`PLAN.zh-CN.md`](./PLAN.zh-CN.md) (v0.3.1).
> This file is a one-page summary; details, decisions, and time estimates
> live in PLAN. If they disagree, PLAN wins.

**Goal**: distribute the Ultra Builder Pro engineering loop as native Claude
Code, OpenCode, and Codex plugins, retain a Gemini compatibility extension, and
run the loop with isolated sessions sharing one authoritative workflow store.

**First-class runtimes**: Claude Code · OpenCode · Codex.

**Distribution channels (v1.0)**: npm · Homebrew · pip.

**Confidence**: 86% (PLAN §10).

**Timeline**: 14–18 weeks AI-assisted (PLAN §11).

---

## Milestones

| Release | Week | Contents                                                                  |
|---------|-----:|---------------------------------------------------------------------------|
| **v0.1**| 8    | Rule layer + execution-lite (session isolation + admission + event subscribe + active-session visibility) — solves the core "independent conversations don't pollute each other" pain |
| **v0.2**| 11   | Auto-recovery + monitoring + real-time code-review-graph + full conformance |
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
| 6     | Monitoring + code-review-graph live watcher    | ✅ done (D44) → v0.2 |
| 4.6b  | Full conformance suite                         | ✅ done (D45) — 20 conformance + 21 resolveTarget tests |
| 7     | tagged tasks + skill mining; retired Ultra memory handed to cloud-mem/claude-mem | ✅ superseded by D50 boundary cleanup |
| 8A    | Plan automation (parse / topo / expand + artifact + human gate) | ✅ done (D47, `a932cb8`) → v0.3 |
| 8B    | Execution automation (dispatch / parallel worktree / merge) | ✅ done (D48, `8224159`) — **v0.3 ready** |
| 9     | Release pipeline (npm / Homebrew / pip)        | pending → v1.0 |

## What is in the repo today

```
spec/                       ← Phase 1 single source of truth
├── mcp-tools.yaml          (30 declared tools across 7 families; 21 live)
├── cli-protocol.md         (CLI ↔ MCP mapping table)
├── schemas/                (state-db.sql + 4 JSON schemas)
├── fixtures/{valid,invalid}/  (+ v4.4-project for migration)
└── scripts/test-all.cjs    (npm run test:spec — 5 validators)

mcp-server/                 ← Phase 2 authoritative state layer
├── server.cjs              (stdio MCP server, 21 task/session/plan tools)
├── lib/
│   ├── state-db.cjs        (SQLite + WAL + pragmas)
│   ├── state-ops.cjs       (full write API, status state machine)
│   └── projector.cjs       (state.db → tasks.json + context md)
└── tests/                  (npm run test:state — 44 tests)

ultra-tools/                ← CLI fallback, migration, and diagnostics
├── cli.cjs
└── commands/
    ├── db.cjs              (init/checkpoint/vacuum/integrity/backup)
    ├── migrate.cjs         (v4.4 → v4.5 + dry/rollback)
    └── legacy-memory.cjs   (explicit inspect/archive/confirmed prune)

bin/install.js              ← multi-runtime installer
bin/handbook.js             ← explicit managed user-handbook sync
adapters/                   ← native Claude/OpenCode/Codex plugin builders + Gemini compatibility
skills/                     ← allowlisted Ultra workflows, internal rules, and collab companions
hooks/                      ← 7 workflow-only Python hooks; OpenCode uses native JavaScript hooks
docs/
├── PLAN.zh-CN.md                authoritative plan (1670+ lines)
├── ARCHITECTURE.md              Phase 1 single-page entry point
├── AGENT-CONTEXT.md             Phase 3 canonical runtime context contract
├── USER-HANDBOOK-CONTRACT.md    managed CLAUDE.md / AGENTS.md boundary
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

PLAN §13 lists Copilot / Cursor / Windsurf / 7 more runtimes, web
dashboard / TUI, LLM provider abstraction, team-collab server, plugin
marketplace.
