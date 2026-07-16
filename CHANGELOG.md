# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.2] — 2026-07-16

### Fixed

- Preserved Codex hook entry points for already-running tasks across plugin
  refreshes, including cache versions whose adapter file or entire cache
  directory had already disappeared. Historical cache versions are now kept in
  the managed runtime manifest and restored as validated forwarders to the
  current adapter.

## [0.5.1] — 2026-07-16

### Changed

- Made task lifecycle workflows fail closed when MCP state is unavailable or
  reports an authority conflict. Removed the nonexistent task create/update/list
  CLI fallbacks from Claude Code, OpenCode, and Codex workflow assets.
- Advanced the state schema to `8A.2` so `estimated_days` is authoritative and
  survives MCP create/update, projection, and legacy migration.

### Fixed

- Fixed the v4.4→v4.5 migration for the real Ultra task shape: top-level
  `version`, `dependencies`, relative `contexts/...` paths, date-only project
  timestamps, and task rows without individual timestamps.
- Added a state-authority gate that returns `LEGACY_STATE_MIGRATION_REQUIRED`
  when a non-empty v4.4 task projection meets an empty state database, instead
  of returning a misleading empty task list.
- Made migration task/event inserts atomic, refused merges into a non-empty task
  table, projected immediately after success, and preserved context bodies while
  removing obsolete duplicate status banners and retired memory-hook references.
- Added deterministic projection-write guards for Claude Code `Edit|Write`,
  OpenCode `tool.execute.before`, and Codex `Edit|Write|apply_patch` during active
  Ultra workflows.

## [0.5.0] — 2026-07-16

### Added

- Added first-class native Claude Code and OpenCode plugin builders alongside
  the Codex personal plugin. All hosts build from one explicit runtime asset
  allowlist; Gemini remains a compatibility extension using the same boundary.
- Added `ubp-handbook` for previewed, backed-up managed-block integration with
  user-level Claude `CLAUDE.md`, Codex `AGENTS.md`, and OpenCode `AGENTS.md`.
- Added `ultra-tools legacy-memory inspect|archive|prune`; prune requires the
  exact `DELETE_ULTRA_LEGACY_MEMORY` confirmation token and never runs during
  install or update.
- Added release verification for a freshly packed npm consumer, including
  executable CLI links and live Claude Code, OpenCode, and Codex MCP round trips.

### Changed

- Reduced the package to ten Ultra-owned public workflows, four internal
  agent-rule skills, and host-specific collaboration companions. The internal
  `code-review-expert` skill is no longer implicitly user-invocable.
- Replaced the imported hook suite with seven workflow-only hooks that are
  no-ops outside an active `.ultra/workflow-state.json`. OpenCode uses native
  JavaScript lifecycle hooks; Claude Code and Codex use native plugin manifests.
- Upgraded `@anthropic-ai/sdk` to the patched `^0.111.0` line.
- Reduced the published MCP contract to the 21 tools the server actually
  exposes; review, impact, skill discovery, and user interaction use native
  Host surfaces.

### Fixed

- Made MCP database initialization lazy, synchronized the handshake version
  with the npm package, and fixed `session.subscribe_events` sid filtering.
- Aligned session/plan input schemas with runtime behavior, including circuit
  breaker output, session spawn intent semantics, and removal of ignored inputs.
- Bundled Gemini's compatibility MCP runtime durably and restored project-local
  `.ultra/state.db` ownership across all adapters.
- Exported the documented `ultra-tools` executable and included every README
  documentation target in the npm tarball.

### Removed

- Removed Ultra's memory MCP tools, store, wrapper, recall skill, memory-capture
  and summary hooks, and private agent-memory declarations. Persistent memory is
  now solely the responsibility of a separate cloud-mem/claude-mem plugin.
- Removed bundled copies of `agent-browser`, `find-skills`, `use-railway`, the
  three Vercel skill packs, and all Impeccable-derived assets from Ultra output.
- Removed generic dangerous-command and post-edit governance hooks from the
  Ultra plugin; unrelated user/repository hooks remain outside this package.

## [0.4.0] — 2026-07-15

### Changed

- Replaced the deprecated Codex `prompts/` and `config.toml` marker projection
  with a complete personal plugin: 25 adapted skills, nine legacy-command maps,
  plugin MCP registration, and current native hook events.
- Converted all nine Ultra agents to native `.codex/agents/*.toml` definitions.
- Renamed the cross-model skill from `codex-collab` to `cc-collab`; Codex remains
  the primary agent and Claude Code is an explicitly requested, read-only advisor.
- Made hook memory, compaction, health, subagent, transcript, and summary behavior
  runtime-aware. Codex no longer writes fallback state under `~/.claude` or
  launches a nested model CLI for session summaries.
- Bundled the Codex MCP and status CLI with `@vercel/ncc`, preserving the active
  task cwd for project-local state. Generated Codex plugins now distinguish the
  24 live MCP tools from nine upstream scheduled contracts and document each
  Codex-native replacement.

### Fixed

- Preserved live Codex task hooks across plugin cache refreshes by restoring
  retired adapter paths as forwarding shims to the current cached adapter.
  Failed refreshes recover through the managed plugin source, and corrupt
  runtime manifests now stop uninstall before managed assets are removed.

## [0.3.0] — 2026-04-18

### Added

- **Phase 8B — executor line** (D48, `8224159`): parallel session orchestrator
  that consumes `.ultra/execution-plan.json` waves, spawns sessions per
  `dispatch-rules.cjs` (declarative priority-sorted rule table, GSD-2 pattern),
  manages N concurrent git worktrees via `worktree-manager.cjs`, and auto-merges
  session branches back to `main` with conflict detection via `auto-merge.cjs`.
  Events: `wave_started` / `wave_completed` / `plan_completed` / `merged_back` /
  `merge_conflict`. Opt-in `autoMerge` on `runPlan` and `closeSession`.
- **Phase 8A — planner line** (D47, `a932cb8`): `task.parse_prd` with dual-provider
  LLM client (official `@anthropic-ai/sdk` + `openai`); `lib/topo.cjs`
  Kahn + Tarjan SCC for dependency waves; `task.expand` atomic subtask creation;
  `lib/plan-store.cjs` for atomic `.ultra/execution-plan.json` write / section
  projection; `skills/ultra-plan` PRD-Direct workflow with human-gate via
  `dry_run` parameter. Schema bump 7.1 → 8A.1 for `tasks.parent_id`.
- **Phase 7 — intelligence layer** (D46): `memory_entries` FTS5 store with
  auto-recall on session spawn and auto-retain on close (event-type heuristic,
  zero LLM cost); tagged task lists per git branch (`deriveBranchTag`);
  skill mining to `skills/learned/*_unverified.md` on task completion /
  breaker trip / session crash.

### Changed

- `STATUS_TRANSITIONS` contract now strictly requires `pending → in_progress
  → completed` — parallel-orchestrator transitions tasks to `in_progress`
  before the child's exit code may flip them to completed/pending.
- `daemon.routeTask` is now a thin wrapper over `dispatch-rules.evaluate`
  (6 default rules: breaker-blocked / deps-not-ready / no-runtimes /
  wave-conflict / by-preference / fallback-first-available).
- `closeSession` gains `autoMerge` / `mergeBaseBranch` opt-in params.

### Fixed

- D49 tech-debt sweep: stale Phase comments (`"scheduled for Phase 1"`,
  `"not implemented in Phase 3.1"`) replaced with accurate `unknown verb`
  messages; `docs/ROADMAP.md` status table synchronized; `.gitignore`
  excludes `.rtk/` local filter cache.

### Tests

- **397 tests total** across state (182) + orch (103) + spec (6) + rest
  (106). Zero regressions from v0.2.

## [0.2.0] — 2026-04-17

### Added

- **Phase 6 — monitoring + live code graph** (D44): RTK soft-dependency hook
  (`adapters/_shared/rtk-detect.cjs`) with `--skip-rtk` flag and install hint;
  token / cost telemetry with per-runtime pricing table, `telemetry` table +
  daily `.ultra/telemetry/YYYY-MM-DD.jsonl`; `ultra-tools status --cost`
  panel with by-runtime / by-task / by-session aggregation; chokidar-based
  code-graph watcher with debounce / awaitWriteFinish / batch thresholds,
  opt-in via `--with-graph-watcher`.
- **Phase 5 — execution resilience** (D43): `recovery.cjs` boot-time orphan
  scan using live PID probe; `circuit_breaker` table with `recordTaskFailure`
  counter and `resetCircuitBreaker` escape hatch; spec-change staleness
  propagation via cursor-consumed `spec_changed` events; `orchestrator/daemon.cjs`
  polling loop with `routeTask` by complexity hint; `bin/orchestrator.js`
  `run`/`start`/`stop`/`status` subcommands, gated by
  `settings.json#orchestrator.auto_dispatch`.
- **Phase 4.6b — full conformance suite** (D45): 4 runtime × 5 capability
  (command / skills / hooks / MCP + no `env._source` leak / install idempotency)
  = 20 additional conformance tests; table-driven `resolve-target.test.cjs`
  (21 tests) covering `configDir > env > home/cwd` precedence + Gemini
  extensionRoot append; schema bump 5.2 → 7.1 alongside memory store.

### Changed

- `_source` leak fix (D45 P2 #9): four adapters now emit a sibling
  `_ubp: {source}` envelope instead of polluting `env._source`; Codex uses
  a marker-fence instead of nested TOML object.

## [0.1.0] — 2026-04-17

### Added

- **Phase 4.5 — execution-lite** (D42, `0d3e5ed`): 7 `session.*` MCP tools
  (spawn / close / get / list / admission_check / heartbeat / subscribe_events);
  `orchestrator/session-runner.cjs` creates real git worktree + child process;
  `sessions` table holds lease / heartbeat (no lease.json file — D32);
  admission control with takeover / resume / abandon strategies (D33).
- **Phase 4 — cross-runtime distribution** (D41, `5aa1fd0`): shared adapter
  toolkit (`adapters/_shared/` — file-ops / frontmatter / settings-merge /
  path-rewrite / md-to-toml); 4 runtime adapters (Claude sentinel-block
  settings.json merge; OpenCode `opencode.json.mcp`; Codex `config.toml`
  marker-block + prompts/; Gemini `extensions/ultra-builder-pro/` package);
  `docs/RUNTIME-COMPAT-MATRIX.md` with 10-section capability matrix;
  install / uninstall round-trip tests + idempotency.
- **Phase 3 — thin-shell commands** (D40, `b3d1797`): 9 commands migrated
  to skill + MCP + CLI three-layer (36-54 LOC per command); 7 new skills
  under `skills/ultra-*/`; `task.init_project` MCP tool with
  `.ultra-template/`; `docs/AGENT-CONTEXT.md` canonical runtime contract.
- **Phase 2 — authoritative state** (D39, `e286e41`): `.ultra/state.db` SQLite
  + WAL with 7 tables; `mcp-server/lib/{state-db, state-ops, projector}.cjs`
  write API and state machine; `mcp-server/server.cjs` stdio MCP server with
  7 `task.*` tools; `ultra-tools db` (init/checkpoint/vacuum/integrity/
  backup) and `migrate` (v4.4→v4.5 with dry-run + rollback).
- **Phase 1 — spec contracts** (D38): `spec/` locks the three-layer
  contract — 30 MCP tools in `mcp-tools.yaml`, 7-table SQLite schema,
  skill manifest, CLI protocol + mapping table; 5 spec validators.
- **Phase 0 — skeleton**: multi-runtime installer scaffolding.

[Unreleased]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.5.0
[0.4.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.4.0
[0.3.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.3.0
[0.2.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.2.0
[0.1.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.1.0
