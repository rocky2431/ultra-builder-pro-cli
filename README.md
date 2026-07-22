# ultra-builder-pro-cli

Multi-runtime plugin suite + autonomous coding factory for the Ultra Builder Pro
agent engineering system. It ships native plugins for **Claude Code · OpenCode ·
Codex · Kimi Code** and orchestrates PRD →
dependency graph → parallel session execution → auto-merge with a single
authoritative `.ultra/state.db`.

<div align="center">

[![Version](https://img.shields.io/badge/version-0.15.0-blue)](./CHANGELOG.md)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](#verification)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-informational)](./package.json)

</div>

---

## What it does

- **Builds host-native plugins from one allowlist.** Claude Code, OpenCode,
  Codex, and Kimi Code receive their own command/skill, agent, hook, and MCP
  representation.
  Install and uninstall are symmetric on every supported host; `ubp --doctor`
  verifies the installed asset hashes and host entry points without mutation.
- **Shares state across runtimes.** `.ultra/state.db` (SQLite + WAL) is the
  authoritative source for baselines, changes, tasks, sessions, events, incidents,
  projection jobs, and telemetry. `tasks.json` and context markdown are
  generated projections, not handwritten.
- **Keeps memory ownership explicit.** Ultra Builder Pro does not collect
  prompts, transcripts, observations, summaries, or cross-session memory.
  Install cloud-mem/claude-mem separately if persistent memory is wanted.
- **Runs real PRDs end-to-end without a second model credential.** The current
  host derives task objects; `task.parse_prd` validates them → `lib/topo.cjs` waves →
  `.ultra/execution-plan.json` → parallel worktree sessions → auto-merge back.
- **Keeps daily work convergent.** `/ultra-change` creates a bounded delta and
  complete Change Contract, classifies risk, records whether bounded research is
  required, and creates immutable Context Manifest v2 snapshots; the Context Spine assigns a role/gate, verifies required
  references, reports fresh-context budget pressure as advisory warnings, exposes one DB-derived breadcrumb, and
  routes a single next action. Research stores typed, source-digested semantic records;
  planning proves Change acceptance coverage; `/ultra-deliver` requires applied specification
  learning plus docs/test/mode-bound two-axis review evidence and a schema-validated
  baseline reconciliation manifest before archive. `/ultra-doctor` reports incidents,
  projection lag, orphan sessions, and backup-first mechanical recovery.
  Incident changes additionally require a five-section `diagnosis.md` covering
  reproduction, hypotheses, root cause, regression test, and recovery.
- **Adopts existing repositories without pretending they are new.** `ultra-init`
  classifies greenfield, brownfield, and monorepo scope. Brownfield adoption records
  current specifications, repository/runtime evidence, worktree snapshot, known-red
  verification, categorized gaps, unknowns, and explicit approval without rewriting
  application code. v4.4 and v4.5 projection-only projects have backup-first imports.
- **Keeps external context external.** Memory and code-graph providers retain
  their own content; Ultra stores only provider/project/revision/status metadata
  references in a compiled change context.

## Quickstart

```bash
# Install into one runtime (local = current project's config dir)
npx ultra-builder-pro-cli --claude   --local
npx ultra-builder-pro-cli --opencode --local
npx ultra-builder-pro-cli --codex    --local
npx ultra-builder-pro-cli --kimi     --local

# Or blanket-install to every supported runtime you have
npx ultra-builder-pro-cli --all --local

# Global (into the runtime's ~/.config-style dir)
npx ultra-builder-pro-cli --claude --global
npx ultra-builder-pro-cli --kimi   --global

# Uninstall (symmetric)
npx ultra-builder-pro-cli --all --local --uninstall

# Read-only installation provenance and drift diagnosis
npx ultra-builder-pro-cli --all --local --doctor
npx ultra-builder-pro-cli --all --local --doctor --json
```

After install, start a new host session/task and point it at the project.
Claude Code and OpenCode expose native command forms. Codex exposes the same workflows as namespaced plugin
skills such as `$ultra-builder-pro:ultra-init`, `$ultra-builder-pro:ultra-plan`,
and `$ultra-builder-pro:ultra-dev`; `command-map.json` records the eleven legacy
command mappings (`ultra-review` remains a directly invocable skill). Kimi Code
uses native namespaced commands such as `/ultra-builder-pro:ultra-init` and
`/ultra-builder-pro:ultra-plan`; run `/reload` or start a new Kimi session after
install or update.
See [`docs/RUNTIME-COMPAT-MATRIX.md`](./docs/RUNTIME-COMPAT-MATRIX.md)
for per-runtime capabilities.

Start with `ultra-init` in both new and existing projects. Auto classification is
based on delivered-system evidence: application source, tests, deployment, or
persisted-state/schema signals make a repository brownfield; a Git repository,
manifest, README, or starter documentation alone remains greenfield. An empty project
opens a `draft` greenfield baseline and an existing system opens an `adopting`
brownfield baseline. Both execute all seventeen research steps before
`baseline.record` and explicit `baseline.converge`; initialization never treats blank
templates as a trusted baseline and never selects an MVP. Existing active work may
continue only when its durable change workflow was bound to a healthy ready baseline;
the expected HEAD, worktree, spec, and source-evidence drift created by that change is
advisory until delivery reconciliation. Loss of approved-ready status or structural
baseline evidence blocks ordinary work. An incident requires an explicit break-glass
approver and leaves a blocking reconciliation gap at archive; new ordinary work always
requires a healthy ready baseline. See
[`docs/WORKFLOW-LIFECYCLE.md`](./docs/WORKFLOW-LIFECYCLE.md) for exact write,
transition, invalidation, and recovery semantics.

## Three-layer architecture

| Layer | Purpose | When it's used |
|-------|---------|----------------|
| **skill** (`skills/ultra-*/`) | Knowledge — prompts, workflows, prose | Runtime's native skill/prompt loader picks them up after install |
| **MCP** (`mcp-server/`) | Authoritative state — reads/writes `.ultra/state.db` via stdio JSON-RPC | Primary path for task / session / event / plan operations |
| **CLI** (`ultra-tools`, `bin/*`) | Selected initialization, recovery, diagnostics, and orchestration surfaces | `ultra-tools task init-project`, `ultra-tools system doctor`, `ubp-orchestrator run` |

The layers share one `.ultra/state.db`, but the CLI is not a mirror of every MCP
tool: continuous change mutations are MCP-only and fail closed. See
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full contract and
[`spec/cli-protocol.md`](./spec/cli-protocol.md) for the 41 live contracts.
Review, impact discovery, skill resolution, and user interaction stay on each
Host's native surfaces; the generated Codex capability map documents those
replacements without advertising non-existent MCP tools.

The package boundary is deliberate: twelve public Ultra workflow skills, four
internal review-rule skills, host-specific collaboration companions, and the
minimal host bootstrap required by Kimi. Browser, deployment, skill-discovery,
and framework guidance belong to their original plugins.

## Runtime capability matrix

| Feature                      | Claude Code | OpenCode | Codex CLI | Kimi Code 0.26+ |
|------------------------------|:-----------:|:--------:|:---------:|:---------------:|
| Custom commands              | ✅          | ✅       | ✅        | ✅ (namespaced) |
| Skill loader                 | ✅          | ✅       | ✅ (personal plugin) | ✅ (native plugin) |
| MCP server (stdio)           | ✅          | ✅       | ✅ (plugin `.mcp.json`) | ✅ (`mcpServers`) |
| Workflow hooks               | ✅ (native plugin) | ✅ (native JS plugin) | ✅ (native plugin) | ✅ with documented compact limitation |
| Sub-agents                   | ✅          | ✅       | ✅ (9 native TOML agents) | ✅ via `Agent` / `AgentSwarm` prompt templates |
| Session worktree isolation   | ✅ (driven by `orchestrator/session-runner.cjs`) | ✅ | ✅ | ✅ |
| Parallel dispatch + auto-merge | ✅ (`ubp-orchestrator run`) | ✅ | ✅ | ✅ |

Full details in [`docs/RUNTIME-COMPAT-MATRIX.md`](./docs/RUNTIME-COMPAT-MATRIX.md)
(10 sections, with per-runtime deviations called out).

## Typical workflow

```bash
# 1. Bootstrap project state (the ultra-init skill completes adoption and approval)
ultra-tools task init-project --project-name myapp --mode auto

# Projection-only projects from prior releases use one backup-first import:
ultra-tools migrate --from=4.4 --to=4.5 --source-dir .
ultra-tools migrate --from=4.5 --to=15.0 --source-dir .

# 2. Complete all 17 research steps, record current evidence, and obtain explicit
#    baseline approval. Then open an initial change and persist its task contracts
#    (normally driven by ultra-research/change/plan).

# 3. Run the plan — parallel sessions, auto-merge back to main on success
ubp-orchestrator run

# 4. Monitor cost, progress, and runtime health
ultra-tools status
ultra-tools status --cost --since 24h
ultra-tools session list --json
ultra-tools system doctor
```

Or let the skills drive it. In Codex, invoke
`$ultra-builder-pro:ultra-init` → `$ultra-builder-pro:ultra-research` →
`$ultra-builder-pro:ultra-change` → `$ultra-builder-pro:ultra-plan` →
`$ultra-builder-pro:ultra-dev` → `$ultra-builder-pro:ultra-test` →
`$ultra-builder-pro:ultra-review` → `$ultra-builder-pro:ultra-deliver`; after the
baseline is delivered, daily work starts with `$ultra-builder-pro:ultra-change`, while
`$ultra-builder-pro:ultra-status` reads the compact authoritative breadcrumb.
Kimi uses the corresponding
`/ultra-builder-pro:ultra-*` namespace. Other runtimes retain their native
command form.

## CLI surface

| Binary | Purpose |
|--------|---------|
| `ultra-builder-pro-cli` / `ubp` | Installer — `--claude / --opencode / --codex / --kimi / --all`, `--local / --global`, `--uninstall`; read-only install checks via `--doctor [--json]` |
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
  dir (`ultra-builder-pro-cli --<runtime> --local` writes to the host-specific
  project dir such as `./.claude`, `./.opencode`, or `./.kimi-code`;
  `--global` writes to the user-level dir). The
  install log prints the exact target path. Restart Claude Code/OpenCode or
  start a new Codex task after changing an installed plugin. In Kimi Code,
  run `/reload` or start a new session.
- **Kimi MCP reports a native-module ABI error**: Kimi 0.26/0.27 embeds a different
  Node ABI from the package installer. The generated plugin intentionally runs
  the MCP with `env node`; keep a Node.js `>=22` executable on `PATH` when
  starting Kimi.
- **Installed hook/MCP path is missing or stale**: run
  `npx ultra-builder-pro-cli --<runtime> --local --doctor` first. It compares
  the recorded install provenance with current asset hashes and validates the
  host-specific hook, MCP, plugin, and runtime-manifest entry points. Reinstall
  only after preserving the degraded report as evidence.
- **Projection tasks exist but state.db has no tasks**: run the exact v4.4 or v4.5
  `ultra-tools migrate` command returned by MCP, verify the backup and imported counts,
  then run `ultra-init` to replace the compatibility row with a reviewed brownfield
  baseline.
- **Old or corrupt state.db**: `ultra-tools system doctor` is read-only;
  `ultra-tools system doctor --repair` upgrades supported schemas with two backup
  checkpoints. A corrupt database is never overwritten automatically. After explicit
  owner approval, restore a verified managed copy with
  `ultra-tools system restore --backup <path> --confirm REPLACE_CORRUPT_ULTRA_STATE`,
  or preserve the corrupt DB and legacy projection before rebuilding authority with
  `ultra-tools system rebaseline --project-name <name> --confirm REBASELINE_CORRUPT_ULTRA_STATE`.
- **Legacy Ultra memory data remains on disk**: inspect first with
  `ultra-tools legacy-memory inspect`, archive with
  `ultra-tools legacy-memory archive`, then prune only with the explicit
  confirmation token printed by the command. Nothing is deleted implicitly.
- **MCP model credentials**: Ultra MCP does not require `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, or another provider key. The active host uses its existing
  model session to derive PRD tasks or child tasks; `task.parse_prd` and
  `task.expand` only validate ownership, graph shape, and atomic persistence.

## Documentation

| Doc | What's in it |
|-----|--------------|
| [`docs/PLAN.zh-CN.md`](./docs/PLAN.zh-CN.md) | Historical 12-phase plan and decision log with a current-boundary overlay |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | One-page English roadmap + phase status |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Single-page system architecture |
| [`docs/WORKFLOW-LIFECYCLE.md`](./docs/WORKFLOW-LIFECYCLE.md) | Baseline classification, DB writes, status machines, gates, invalidation, and recovery |
| [`docs/AGENT-CONTEXT.md`](./docs/AGENT-CONTEXT.md) | Canonical runtime context contract |
| [`docs/USER-HANDBOOK-CONTRACT.md`](./docs/USER-HANDBOOK-CONTRACT.md) | Shared user-handbook policy and host renderings |
| [`docs/RUNTIME-COMPAT-MATRIX.md`](./docs/RUNTIME-COMPAT-MATRIX.md) | Per-runtime capability matrix |
| [`docs/STATE-DB-ACCESS-POLICY.md`](./docs/STATE-DB-ACCESS-POLICY.md) | Multi-process write contract |
| [`docs/COMMIT-HASH-BACKFILL.md`](./docs/COMMIT-HASH-BACKFILL.md) | Two-commit task-completion flow |
| [`CHANGELOG.md`](./CHANGELOG.md) | v0.1 → current release notes |

## License

MIT — see [`LICENSE`](./LICENSE).
