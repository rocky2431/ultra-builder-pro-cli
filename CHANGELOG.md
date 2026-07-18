# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.12.0] — 2026-07-18

### Added

- Added schema 11.0 project baselines and four `baseline.*` MCP contracts for
  greenfield initialization, brownfield adoption, evidence recording, explicit
  approval, re-adoption history, and archive reconciliation.
- Added automatic new/existing repository detection, neutral baseline templates,
  metadata-only provider references, and cross-host baseline status/doctor output.

### Changed

- Reclassified file count, token estimate, and context-share limits as advisory
  attention warnings. Necessary incident context and active work are no longer
  rejected or repaired by arbitrarily raising a threshold.
- Made incomplete or stale baseline state advisory during an active bounded change,
  requiring approved adoption at `change.converge` and complete revision/spec
  reconciliation in the atomic archive transaction.
- Changed the Stop hook from a workflow-completion denial into a lifecycle advisory;
  direct writes to the authoritative task projection remain blocked.

### Fixed

- Prevented old projects from being initialized as empty greenfield products or
  using generated `tasks.json` as project metadata authority.
- Updated Claude Code, Codex, OpenCode, and Kimi presentation so hooks expose
  warnings without turning them into edit, stop, or workflow refusal gates.
- Removed the convergence deadlock where normal HEAD or tracked-spec changes made by
  the active change were rejected before archive could reconcile them; incomplete
  archive declarations now fail with full state and artifact rollback.

## [0.11.0] — 2026-07-18

### Added

- Added a portable Skill authoring contract aligned with OpenAI Skills guidance
  and the Agent Skills progressive-disclosure model, plus regression coverage for
  source prompts, commands, agents, generated runtimes, and package contents.
- Added an independent `review-spec` worker and the `ultra-review-findings-v2` /
  `ultra-review-summary-v2` evidence contracts so specification fidelity and
  engineering standards remain separate release-gate axes.
- Added focused research and code-review references that are loaded only when the
  active workflow needs them.

### Changed

- Rewrote the nineteen packaged source Skills as concise, English, host-neutral
  procedures with portable `name` and `description` frontmatter. Runtime metadata,
  invocation policy, and MCP dependencies now belong to host adapters.
- Reduced all eleven command documents to thin workflow launchers and rewrote the
  bundled workers as bounded, evidence-based roles without arbitrary confidence,
  coverage, severity, or option-count thresholds.
- Simplified Claude Code, Codex, OpenCode, and Kimi Code adaptation by removing
  stale prompt rewriting branches while preserving each host's native invocation,
  MCP, hook, and agent contracts.

### Fixed

- Made the review waiter validate exact named v2 artifacts, reject partial or stale
  schemas, derive severity counts from evidence, and fail inconsistent two-axis
  summaries closed.
- Isolated read-only collaboration commands from user configuration and repository
  rules, and passed the review schema by an explicit absolute path instead of
  guessing an installed plugin root.
- Prevented Python caches and retired prompt/runtime artifacts from entering the npm
  tarball.

### Removed

- Removed the duplicate `ai-collab-base` prompt framework, the seventeen-step
  research prompt tree, redundant review checklists, learned-Skill placeholder, and
  obsolete v1 verdict updater.

## [0.10.0] — 2026-07-18

### Added

- Added Context Manifest v2 and a DB-derived Context Spine across planning,
  implementation, checking, review, convergence, and recovery. Context snapshots
  now carry role, gate, readiness blockers, bounded references and digests,
  fresh-context budgets, a public seam, an exact verification command, and one
  deterministic next action.
- Added `change.breadcrumb`, `change.learning_propose`, and
  `change.learning_resolve`, advancing the live MCP contract to 32 tools and
  `.ultra/state.db` to schema 10.0 with 16 tables.
- Added approval-gated specification-learning candidates. Proposed or approved
  discoveries block convergence until rejected or applied to a declared baseline
  target, and `change.get` exposes their authoritative state.
- Added independent `spec_fidelity` and `engineering_standards` review evidence,
  plus public-seam and exact red/green signal fields for convergence.

### Changed

- Rebuilt the daily harness around one status router, one highest-value alignment
  question, fresh-context tracer bullets, explicit expand contracts, independent
  check/review contexts, and convergence before release.
- Reduced the seven core execution workflow prompts from 1,922 to 758 lines and
  added a 220-line ceiling for every public Ultra skill so host prompts cannot
  silently accumulate duplicated procedure. All twelve public workflows are now
  explicitly user-invocable; four rule skills remain agent-only.
- Session-start, pre-edit, and recovery hooks now share one read-only
  `context_spine.py` helper and inject only the compact DB breadcrumb. Intent,
  transcript, memory-provider, and graph-provider payloads never enter hook context.
- OpenCode now consumes the DB-generated Context Manifest v2 projection, strips
  provider/intent content, and fails context readiness when its compiled HEAD
  differs from the current repository.
- Updated Claude Code, Codex, OpenCode, and Kimi Code native renderings, managed
  handbook blocks, MCP mapping, architecture, and compatibility documentation.

### Fixed

- Prevented plan-role task context from becoming ready without an execution
  contract, public seam, and verification command.
- Prevented breadcrumbs from reusing a snapshot after task state or git HEAD
  changed, and made an explicitly missing change id fail closed.
- Added auditable 9.1 → 10.0 migration history while preserving existing runtime
  rows, references, projections, and foreign-key integrity.
- Corrected hook conformance to package `context_spine.py` as an imported helper
  without registering it as a duplicate lifecycle hook.

## [0.9.0] — 2026-07-17

### Added

- Added Kimi Code 0.26+ as a fourth native plugin host with namespaced commands,
  twenty allowlisted skills including its session bootstrap, lifecycle hooks,
  bundled review-worker prompt templates, native plugin registration, and
  read-only install diagnostics.
- Added packed-package and live MCP conformance coverage for the Kimi-managed
  plugin layout while preserving unrelated registry entries and `config.toml`.

### Changed

- Advanced `.ultra/state.db` to schema `9.1` so Kimi is a valid runtime for
  events and sessions. Existing databases rebuild only the constrained tables
  transactionally while preserving rows, foreign keys, telemetry, incidents,
  and migration history.
- Extended CLI, handbook, orchestrator runtime selection, package metadata, and
  runtime compatibility documentation to include Kimi without reintroducing
  Ultra-owned memory, graph, browser, deployment, or framework capabilities.

### Fixed

- Made the Kimi MCP launcher recover the active project from the inherited
  working-directory contract even though Kimi starts plugin MCP processes from
  the managed plugin root. It fails closed instead of creating `.ultra` inside
  the installed plugin.
- Avoided Kimi's embedded Node native-module ABI mismatch by launching the
  bundled MCP with the installer-compatible Node executable from `PATH`.

## [0.8.1] — 2026-07-17

### Fixed

- Removed a retired-surface name accidentally reintroduced in the D53 decision
  note. The unchanged retirement contract caught it before `v0.8.0` reached npm;
  this immutable patch release carries the complete harness closure forward.

## [0.8.0] — 2026-07-17

### Added

- Added a first-class incident debug lane: incident changes now create a
  registered `diagnosis.md` artifact whose reproduction, hypotheses, root
  cause, regression-test, and recovery sections are required by convergence.
- Added normalized install-provenance manifests for Claude Code, OpenCode, and
  Codex plus read-only `ubp --doctor [--json]` checks for asset hashes and
  host-specific plugin, hook, MCP, launcher, and runtime entry points.

### Fixed

- Turned workflow compaction checkpoints into a real recovery consumer:
  resume now rejects malformed or terminal checkpoints, selects the newest
  valid live/checkpoint state, and atomically restores missing or older live
  workflow state before re-injecting context.

## [0.7.0] — 2026-07-17

### Added

- Added `ultra-change` and `ultra-doctor` as native workflows on Claude Code,
  OpenCode, and Codex. Daily fixes, features, redesigns, and incidents now stay
  attached to an explicit change packet after the initial baseline delivery.
- Added seven `change.*` MCP tools and `system.doctor`, advancing the live MCP
  contract to 29 tools and `.ultra/state.db` to schema `9.0` with 15 tables for
  changes, artifacts, context snapshots, trace links, incidents, projection
  jobs, and durable event-consumer cursors.
- Added deterministic convergence and archive gates for task completion, spec
  deltas, tests, documentation impact, review evidence, context freshness, and
  baseline reconciliation.

### Changed

- `task.init_project` now initializes `state.db` immediately and creates active
  and archived change roots. `tasks.json` remains a generated projection.
- MCP mutations now commit authority first, enqueue a durable projection job,
  process it, and expose projection status in MCP metadata instead of silently
  swallowing projection failures.
- Session-start and edit hooks now understand initialized baselines and active
  changes. Health checks surface incidents, projection lag, orphan sessions,
  and missing change artifacts; direct writes to the task projection remain
  blocked even outside a command-scoped workflow.
- Memory and code-graph content are exclusively owned by separately installed
  providers. Ultra accepts only provider metadata references in compiled change
  contexts and never stores recalled content, graph payloads, or embeddings.

### Fixed

- Wired spec-staleness consumption, crash recovery, projection processing, and
  durable cursors into the real orchestrator loop instead of leaving production
  helpers unconsumed.
- Kept `intent.md` synchronized with authoritative change updates, linked task
  status events to their newly assigned change, and included `plan.export`
  events in projection accounting.
- Added atomic projection claims and backup-first recovery for failed or stale
  interrupted jobs so a crashed projector cannot remain invisibly `running`.
- Kept all three native plugin bundles, MCP launchers, agents, hooks, commands,
  and user-handbook renderings on one explicit Ultra-owned asset allowlist.

### Removed

- Removed the internal filesystem graph watcher and its dependency; external
  graph providers own indexing and refresh.
- Removed the retired command-proxy detector, installer option, managed handbook
  block, cache artifacts, prompts, configuration, and documentation surface.
- Stopped publishing the archived pre-CLI manual in the npm package; it remains
  repository history and cannot be mistaken for an active plugin contract.

## [0.6.0] — 2026-07-17

### Changed

- Reduced the supported host matrix to Claude Code, OpenCode, and Codex.
- Reworked `ultra-verify` into independent two-model verification: the current
  host remains primary, one read-only external advisor supplies a second view,
  and evidence rather than model voting determines confidence.
- Restricted orchestrator routing, MCP session/event inputs, telemetry writes,
  state schema enums, installer flags, package metadata, and handbooks to the
  three supported runtimes.

### Removed

- Removed the retired fourth-runtime adapter, installer surface, extension and
  conformance packaging, pricing entries, collaboration companion, and all
  active Ultra prompts and documentation that offered it as an advisor.

### Fixed

- Added a retirement regression contract so unsupported runtimes cannot
  re-enter active source, package, schema, prompt, or generated plugin surfaces.
- Rejects unsupported runtime labels before state, event, or telemetry writes,
  including old databases whose historical SQLite constraints were broader.

## [0.5.3] — 2026-07-17

### Fixed

- Removed the final bundled agent instruction that asked workers to update and
  consult project memory. Test workers now return reusable findings to the
  parent agent, while persistent memory remains owned by a separately installed
  host provider.
- Added a release regression guard that rejects private memory ownership,
  `.ultra/memory`, and retired `/recall` instructions from every bundled agent.

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
  allowlist; the then-supported compatibility extension used the same boundary.
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
- Bundled the compatibility MCP runtime durably and restored project-local
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
  messages; `docs/ROADMAP.md` status table synchronized.

### Tests

- **397 tests total** across state (182) + orch (103) + spec (6) + rest
  (106). Zero regressions from v0.2.

## [0.2.0] — 2026-04-17

### Added

- **Phase 6 — monitoring + live code graph** (D44): token / cost telemetry
  with per-runtime pricing table, `telemetry` table +
  daily `.ultra/telemetry/YYYY-MM-DD.jsonl`; `ultra-tools status --cost`
  panel with by-runtime / by-task / by-session aggregation; chokidar-based
  then-experimental incremental graph watcher with debounce and batch thresholds.
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
  (21 tests) covering `configDir > env > home/cwd` precedence and extension
  root resolution; schema bump 5.2 → 7.1 alongside memory store.

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
  path-rewrite / md-to-toml); the initial runtime adapters (Claude sentinel-block
  settings.json merge; OpenCode `opencode.json.mcp`; Codex `config.toml`
  marker-block + prompts/; plus the then-supported compatibility package);
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

[Unreleased]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.5.3...v0.6.0
[0.5.3]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.5.0
[0.4.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.4.0
[0.3.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.3.0
[0.2.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.2.0
[0.1.0]: https://github.com/rocky2431/ultra-builder-pro-cli/releases/tag/v0.1.0
