# ultra-builder-pro-cli — Roadmap

> **Authoritative roadmap**: [`PLAN.zh-CN.md`](./PLAN.zh-CN.md) (v0.3.1).
> This file is a one-page summary; details, decisions, and time estimates
> live in PLAN. If they disagree, PLAN wins.

**Goal**: distribute the Ultra Builder Pro engineering loop to four agent
runtimes — Claude Code, OpenCode, Codex CLI, Gemini CLI — and run that
loop with isolated sessions sharing one authoritative state store.

**First-release runtimes**: Claude Code · OpenCode · Codex CLI · Gemini CLI.

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
| 6     | Monitoring + code-review-graph live watcher    | pending → v0.2 |
| 4.6b  | Full conformance suite                         | pending → v0.2 |
| 7     | hindsight wrapper + tagged tasks + skill mining| pending → v0.3 |
| 8A    | Plan automation (parse / topo / expand + artifact + human gate) | pending → v0.3 |
| 8B    | Execution automation (dispatch / parallel worktree / merge) | pending → v0.3 |
| 9     | Release pipeline (npm / Homebrew / pip)        | pending → v1.0 |

## What is in the repo today

```
spec/                       ← Phase 1 single source of truth
├── mcp-tools.yaml          (30 tools across 8 families)
├── cli-protocol.md         (CLI ↔ MCP mapping table)
├── schemas/                (state-db.sql + 4 JSON schemas)
├── fixtures/{valid,invalid}/  (+ v4.4-project for migration)
└── scripts/test-all.cjs    (npm run test:spec — 5 validators)

mcp-server/                 ← Phase 2 authoritative state layer
├── server.cjs              (stdio MCP server, 7 task.* tools)
├── lib/
│   ├── state-db.cjs        (SQLite + WAL + pragmas)
│   ├── state-ops.cjs       (full write API, status state machine)
│   └── projector.cjs       (state.db → tasks.json + context md)
└── tests/                  (npm run test:state — 44 tests)

ultra-tools/                ← CLI fallback layer (db init / migrate done)
├── cli.cjs
└── commands/
    ├── db.cjs              (init/checkpoint/vacuum/integrity/backup)
    └── migrate.cjs         (v4.4 → v4.5 + dry/rollback)

bin/install.js              ← Phase 0 skeleton; Phase 4 fleshes out adapters
adapters/                   ← Phase 0 stubs; Phase 4 implements install/uninstall
skills/                     ← 17 skills, conformant to skill-manifest.schema
hooks/                      ← 15 Python hooks; Phase 3 splits core + per-runtime
docs/
├── PLAN.zh-CN.md                authoritative plan (1640+ lines)
├── ARCHITECTURE.md              Phase 1 single-page entry point
├── STATE-DB-ACCESS-POLICY.md    Phase 2 multi-process write contract
├── COMMIT-HASH-BACKFILL.md      Phase 2.8 two-commit completion flow
└── ROADMAP.md                   this file
```

## How to verify Phase 1 + Phase 2

```
npm install
npm run test:spec     # 5 passed, 0 failed
npm run test:state    # 44 passed, 0 failed
```

## Out of scope for v1.0 (deferred)

PLAN §13 lists Copilot / Cursor / Windsurf / 7 more runtimes, web
dashboard / TUI, LLM provider abstraction, team-collab server, plugin
marketplace.
