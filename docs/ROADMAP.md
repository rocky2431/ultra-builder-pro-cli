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
| 2     | Authoritative state — SQLite + WAL             | next          |
| 3     | Command thin-shells (skill + MCP + CLI)        | pending       |
| 4     | Cross-runtime distribution + 4.6a smoke flow   | pending       |
| 4.5   | Execution-lite (session + admission + events)  | pending → v0.1 gate |
| 5     | Recovery + staleness + auto-routing            | pending → v0.2 |
| 6     | Monitoring + code-review-graph live watcher    | pending → v0.2 |
| 4.6b  | Full conformance suite                         | pending → v0.2 |
| 7     | hindsight wrapper + tagged tasks + skill mining| pending → v0.3 |
| 8A    | Plan automation (parse / topo / expand + artifact + human gate) | pending → v0.3 |
| 8B    | Execution automation (dispatch / parallel worktree / merge) | pending → v0.3 |
| 9     | Release pipeline (npm / Homebrew / pip)        | pending → v1.0 |

## What is in the repo today

```
spec/             ← Phase 1 single source of truth (this milestone)
├── mcp-tools.yaml         (30 tools across 8 families)
├── cli-protocol.md        (CLI ↔ MCP mapping table)
├── schemas/
│   ├── state-db.sql       (7-table SQLite authoritative schema)
│   ├── tasks.v4.5.schema.json
│   ├── context-file.v4.5.schema.json
│   ├── mcp-tools.schema.json
│   └── skill-manifest.schema.json
├── fixtures/{valid,invalid}/  (machine-checked samples)
└── scripts/test-all.cjs   (npm run test:spec — 5 validators)

bin/install.js    ← Phase 0 skeleton; per-runtime adapters fleshed out in Phase 4
adapters/         ← Phase 0 stubs; Phase 4 implements install/uninstall
ultra-tools/      ← Phase 0 stubs; Phase 3 implements the CLI fallback layer
skills/           ← 17 existing skills, all conformant to skill-manifest.schema
hooks/            ← 15 Python hooks; Phase 3 splits into core + per-runtime
docs/
├── PLAN.zh-CN.md         ← authoritative plan (1607 lines)
├── ARCHITECTURE.md       ← Phase 1 — single-page architecture entry point
└── ROADMAP.md            ← this file
```

## How to verify Phase 1

```
npm install
npm run test:spec
```

Expected: `5 passed, 0 failed, 0 skipped`.

## Out of scope for v1.0 (deferred)

PLAN §13 lists Copilot / Cursor / Windsurf / 7 more runtimes, web
dashboard / TUI, LLM provider abstraction, team-collab server, plugin
marketplace.
