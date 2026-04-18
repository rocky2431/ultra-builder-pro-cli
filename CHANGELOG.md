# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.3.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.3.0
[0.2.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.2.0
[0.1.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.1.0
