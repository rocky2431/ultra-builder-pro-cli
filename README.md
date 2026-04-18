# ultra-builder-pro-cli

Multi-runtime distributor + autonomous coding factory for the Ultra Builder Pro
agent engineering system. Installs commands, agents, skills, hooks, and an MCP
server to **Claude Code · OpenCode · Codex CLI · Gemini CLI**, then orchestrates
PRD → dependency graph → parallel session execution → auto-merge with a single
authoritative `.ultra/state.db`.

<div align="center">

[![Version](https://img.shields.io/badge/version-0.3.0-blue)](./CHANGELOG.md)
[![Tests](https://img.shields.io/badge/tests-397_passing-brightgreen)](#verification)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-informational)](./package.json)

</div>

---

> *(30-second demo GIF placeholder — to be added before v1.0)*

## What it does

- **Distributes one toolkit to four runtimes.** One `npx ubp --all` call
  lands commands, skills, an MCP server, and hooks into every installed
  agent runtime's config dir; uninstall is symmetric.
- **Shares state across runtimes.** `.ultra/state.db` (SQLite + WAL) is the
  authoritative source for tasks, sessions, events, and telemetry. `tasks.json`
  and context markdown are generated projections, not handwritten.
- **Runs real PRDs end-to-end.** `task.parse_prd` → `lib/topo.cjs` waves →
  `.ultra/execution-plan.json` → parallel worktree sessions → auto-merge back.
- **Observes without overhead.** Per-task / per-session / per-runtime token
  and cost telemetry; live code-review-graph watcher on file save;
  subscribe-events cursor for real-time dashboards.

## Quickstart

```bash
# Install into one runtime (local = current project's config dir)
npx ultra-builder-pro-cli --claude   --local
npx ultra-builder-pro-cli --opencode --local
npx ultra-builder-pro-cli --codex    --local
npx ultra-builder-pro-cli --gemini   --local

# Or blanket-install to every supported runtime you have
npx ultra-builder-pro-cli --all --local

# Global (into the runtime's ~/.config-style dir)
npx ultra-builder-pro-cli --claude --global

# Uninstall (symmetric)
npx ultra-builder-pro-cli --all --local --uninstall
```

After install, point your runtime at this project and the new commands
(`/ultra-init`, `/ultra-plan`, `/ultra-dev`, `/ultra-status`, …) appear.
See [`docs/RUNTIME-COMPAT-MATRIX.md`](./docs/RUNTIME-COMPAT-MATRIX.md)
for per-runtime capabilities.

## Three-layer architecture

| Layer | Purpose | When it's used |
|-------|---------|----------------|
| **skill** (`skills/ultra-*/`) | Knowledge — prompts, workflows, prose | Runtime's native skill/prompt loader picks them up after install |
| **MCP** (`mcp-server/`) | Authoritative state — reads/writes `.ultra/state.db` via stdio JSON-RPC | Primary path for task / session / event / memory / plan operations |
| **CLI** (`ultra-tools`, `bin/*`) | Shell fallback for CI and non-MCP contexts | `ultra-tools task init-project`, `ubp-orchestrator run`, `ultra-tools status --cost` |

The three layers share one `.ultra/state.db`. See
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full contract and
[`spec/cli-protocol.md`](./spec/cli-protocol.md) for the 33 CLI ↔ MCP mappings.

## Runtime capability matrix

| Feature                      | Claude Code | OpenCode | Codex CLI | Gemini CLI |
|------------------------------|:-----------:|:--------:|:---------:|:----------:|
| Custom commands              | ✅          | ✅       | ✅        | ✅         |
| Skill loader                 | ✅          | ✅       | ✅ (via prompts) | ✅ |
| MCP server (stdio)           | ✅          | ✅       | ✅ (marker-block TOML) | ✅ |
| Hooks (pre/post tool-use)    | ✅          | ✅       | ✅ (2-event subset) | ⚠︎ no-op |
| Sub-agents                   | ✅          | ✅       | ⚠︎ skills-as-agents | ⚠︎ |
| Session worktree isolation   | ✅ (all runtimes; driven by `orchestrator/session-runner.cjs`) | ✅ | ✅ | ✅ |
| Parallel dispatch + auto-merge | ✅ (`ubp-orchestrator run`) | ✅ | ✅ | ✅ |

Full details in [`docs/RUNTIME-COMPAT-MATRIX.md`](./docs/RUNTIME-COMPAT-MATRIX.md)
(10 sections, with per-runtime deviations called out).

## Typical workflow

```bash
# 1. Initialize a project (writes .ultra/ skeleton, seeds state.db)
ultra-tools task init-project --name myapp

# 2. Turn a PRD into a task graph + execution plan (human-gate via dry-run)
#    (invoked by /ultra-plan skill or via MCP task.parse_prd + plan.export)

# 3. Run the plan — parallel sessions, auto-merge back to main on success
ubp-orchestrator run --with-graph-watcher

# 4. Monitor cost and progress
ultra-tools status
ultra-tools status --cost --since 24h
ultra-tools session list --json
```

Or let the skills drive it: type `/ultra-plan` → `/ultra-dev` → `/ultra-status`
inside any installed runtime.

## CLI surface

| Binary | Purpose |
|--------|---------|
| `ultra-builder-pro-cli` / `ubp` | Installer — `--claude / --opencode / --codex / --gemini / --all`, `--local / --global`, `--uninstall`, `--skip-rtk` |
| `ubp-orchestrator` | Session dispatch daemon — `run`, `start`, `stop`, `status` |
| `ultra-tools` | State-layer CLI — `task`, `session`, `status`, `db`, `migrate` |

## Verification

```bash
npm install
npm run test:all
# test:state 182 · test:orch 103 · test:spec 6 · rest 106 — 397 passing
```

Individual suites: `test:state`, `test:orch`, `test:spec`, `test:rest`.

## Troubleshooting

- **`state.db` locked**: close any `ubp-orchestrator` daemon, then
  `ultra-tools db integrity`. SQLite WAL tolerates readers + one writer;
  two writers require orchestrated access (see
  [`docs/STATE-DB-ACCESS-POLICY.md`](./docs/STATE-DB-ACCESS-POLICY.md)).
- **`git/config.lock` contention during parallel run**: Node's single-thread
  `execFileSync` serializes worktree creation, so this shouldn't happen —
  but if you see it, `ubp-orchestrator status` will list stale worktrees
  and `node -e "require('./orchestrator/worktree-manager.cjs').releaseAll(process.cwd())"`
  cleans them up.
- **Installed commands don't show up**: check the runtime's actual config
  dir (`ultra-builder-pro-cli --<runtime> --local` only writes to `./.claude`
  or `./.opencode` etc.; `--global` writes to the user-level dir). The
  install log prints the exact target path.
- **MCP tool errors with `ANTHROPIC_API_KEY` missing**: `task.parse_prd` and
  `task.expand` need a real LLM key at runtime. Set `ANTHROPIC_API_KEY` or
  `OPENAI_API_KEY` before invoking those tools; all other MCP tools work
  without any LLM credential.

## Documentation

| Doc | What's in it |
|-----|--------------|
| [`docs/PLAN.zh-CN.md`](./docs/PLAN.zh-CN.md) | Authoritative 12-phase execution plan (zh-CN) — decisions, risks, timeline |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | One-page English roadmap + phase status |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Single-page system architecture |
| [`docs/AGENT-CONTEXT.md`](./docs/AGENT-CONTEXT.md) | Canonical runtime context contract |
| [`docs/RUNTIME-COMPAT-MATRIX.md`](./docs/RUNTIME-COMPAT-MATRIX.md) | Per-runtime capability matrix |
| [`docs/STATE-DB-ACCESS-POLICY.md`](./docs/STATE-DB-ACCESS-POLICY.md) | Multi-process write contract |
| [`docs/COMMIT-HASH-BACKFILL.md`](./docs/COMMIT-HASH-BACKFILL.md) | Two-commit task-completion flow |
| [`docs/LEGACY-HERMES.md`](./docs/LEGACY-HERMES.md) | Archived pre-CLI "Hermes 6.6" documentation |
| [`CHANGELOG.md`](./CHANGELOG.md) | v0.1 → v0.3 release notes |

## License

MIT — see [`LICENSE`](./LICENSE).
