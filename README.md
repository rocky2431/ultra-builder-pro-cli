# ultra-builder-pro-cli

Multi-runtime plugin suite + autonomous coding factory for the Ultra Builder Pro
agent engineering system. It ships native plugins for **Claude Code · OpenCode ·
Codex**, retains a compatibility adapter for Gemini CLI, and orchestrates PRD →
dependency graph → parallel session execution → auto-merge with a single
authoritative `.ultra/state.db`.

<div align="center">

[![Version](https://img.shields.io/badge/version-0.5.1-blue)](./CHANGELOG.md)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](#verification)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-informational)](./package.json)

</div>

---

> *(30-second demo GIF placeholder — to be added before v1.0)*

## What it does

- **Builds host-native plugins from one allowlist.** Claude Code, OpenCode, and
  Codex receive their own command/skill, agent, hook, and MCP representation.
  Gemini remains a compatibility adapter; uninstall is symmetric.
- **Shares state across runtimes.** `.ultra/state.db` (SQLite + WAL) is the
  authoritative source for tasks, sessions, events, and telemetry. `tasks.json`
  and context markdown are generated projections, not handwritten.
- **Keeps memory ownership explicit.** Ultra Builder Pro does not collect
  prompts, transcripts, observations, summaries, or cross-session memory.
  Install cloud-mem/claude-mem separately if persistent memory is wanted.
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

After install, start a new host session/task and point it at the project.
Claude Code and OpenCode expose native command forms. Codex exposes the same workflows as namespaced plugin
skills such as `$ultra-builder-pro:ultra-init`, `$ultra-builder-pro:ultra-plan`,
and `$ultra-builder-pro:ultra-dev`; `command-map.json` records the nine legacy
command mappings (`ultra-review` remains a directly invocable skill). Gemini
retains its compatibility command form.
See [`docs/RUNTIME-COMPAT-MATRIX.md`](./docs/RUNTIME-COMPAT-MATRIX.md)
for per-runtime capabilities.

## Three-layer architecture

| Layer | Purpose | When it's used |
|-------|---------|----------------|
| **skill** (`skills/ultra-*/`) | Knowledge — prompts, workflows, prose | Runtime's native skill/prompt loader picks them up after install |
| **MCP** (`mcp-server/`) | Authoritative state — reads/writes `.ultra/state.db` via stdio JSON-RPC | Primary path for task / session / event / plan operations |
| **CLI** (`ultra-tools`, `bin/*`) | Shell fallback for CI and non-MCP contexts | `ultra-tools task init-project`, `ubp-orchestrator run`, `ultra-tools status --cost` |

The three layers share one `.ultra/state.db`. See
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full contract and
[`spec/cli-protocol.md`](./spec/cli-protocol.md) for the 21 live contracts.
Review, impact discovery, skill resolution, and user interaction stay on each
Host's native surfaces; the generated Codex capability map documents those
replacements without advertising non-existent MCP tools.

The package boundary is deliberate: ten public Ultra workflow skills, four
internal review-rule skills, and host-specific collaboration companions. Browser,
deployment, skill-discovery, and framework guidance belong to their original plugins.

## Runtime capability matrix

| Feature                      | Claude Code | OpenCode | Codex CLI | Gemini CLI |
|------------------------------|:-----------:|:--------:|:---------:|:----------:|
| Custom commands              | ✅          | ✅       | ✅        | ✅         |
| Skill loader                 | ✅          | ✅       | ✅ (personal plugin) | ✅ |
| MCP server (stdio)           | ✅          | ✅       | ✅ (plugin `.mcp.json`) | ✅ |
| Workflow hooks               | ✅ (native plugin) | ✅ (native JS plugin) | ✅ (native plugin) | ⚠︎ compatibility only |
| Sub-agents                   | ✅          | ✅       | ✅ (9 native TOML agents) | ⚠︎ |
| Session worktree isolation   | ✅ (all runtimes; driven by `orchestrator/session-runner.cjs`) | ✅ | ✅ | ✅ |
| Parallel dispatch + auto-merge | ✅ (`ubp-orchestrator run`) | ✅ | ✅ | ✅ |

Full details in [`docs/RUNTIME-COMPAT-MATRIX.md`](./docs/RUNTIME-COMPAT-MATRIX.md)
(10 sections, with per-runtime deviations called out).

## Typical workflow

```bash
# 1. Initialize a project (writes .ultra/ skeleton; state.db stays lazy)
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

Or let the skills drive it. In Codex, invoke
`$ultra-builder-pro:ultra-plan` → `$ultra-builder-pro:ultra-dev` →
`$ultra-builder-pro:ultra-status`; other runtimes retain their native command form.

## CLI surface

| Binary | Purpose |
|--------|---------|
| `ultra-builder-pro-cli` / `ubp` | Installer — `--claude / --opencode / --codex / --gemini / --all`, `--local / --global`, `--uninstall`, `--skip-rtk` |
| `ubp-orchestrator` | Session dispatch daemon — `run`, `start`, `stop`, `status` |
| `ultra-tools` | State-layer CLI — `task`, `session`, `status`, `db`, `migrate`; explicit `legacy-memory` archive/prune migration |
| `ubp-handbook` | Preview/apply the managed Ultra contract in `CLAUDE.md` / `AGENTS.md`, with backup |

## Verification

```bash
npm install
npm run test:all
python3 -m pytest hooks/tests -q
npm audit
# Or run the complete publish gate:
npm run verify:release
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
  install log prints the exact target path. Restart Claude Code/OpenCode or
  start a new Codex task after changing an installed plugin.
- **Legacy Ultra memory data remains on disk**: inspect first with
  `ultra-tools legacy-memory inspect`, archive with
  `ultra-tools legacy-memory archive`, then prune only with the explicit
  confirmation token printed by the command. Nothing is deleted implicitly.
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
| [`docs/USER-HANDBOOK-CONTRACT.md`](./docs/USER-HANDBOOK-CONTRACT.md) | Shared user-handbook policy and host renderings |
| [`docs/RUNTIME-COMPAT-MATRIX.md`](./docs/RUNTIME-COMPAT-MATRIX.md) | Per-runtime capability matrix |
| [`docs/STATE-DB-ACCESS-POLICY.md`](./docs/STATE-DB-ACCESS-POLICY.md) | Multi-process write contract |
| [`docs/COMMIT-HASH-BACKFILL.md`](./docs/COMMIT-HASH-BACKFILL.md) | Two-commit task-completion flow |
| [`docs/LEGACY-HERMES.md`](./docs/LEGACY-HERMES.md) | Archived pre-CLI "Hermes 6.6" documentation |
| [`CHANGELOG.md`](./CHANGELOG.md) | v0.1 → current release notes |

## License

MIT — see [`LICENSE`](./LICENSE).
