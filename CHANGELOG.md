# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.21.0] — 2026-07-29

### Added

- Added a trackable semantic artifact registry with digest, provenance,
  ownership, freshness, and orphan detection while keeping mutable SQLite,
  leases, telemetry, backups, and worktrees under the ignored
  `.ultra/.runtime/` boundary.
- Added typed Change deltas, documentation reconciliation records, immutable
  task and role context snapshots, transactional plan publication, and
  self-contained delivery archives with crash-safe recovery journals.
- Added workflow revision and supersession contracts so accepted intent can
  evolve without rewriting history or leaving active documents detached from
  their owning workflow.
- Added schema 20 migration and backup-first recovery for legacy
  `.ultra/state.db` projects, including safe runtime relocation and inode-pinned
  archive finalization on supported POSIX platforms.

### Changed

- Published one exact eleven-capability graph across all four host interaction
  contracts. Every adapter now presents the same
  `inspect -> suggest -> host-native ask -> normalize -> persist -> apply -> read back`
  flow, owns no semantic authority, and waits for explicit invocation before another
  public capability starts.
- Updated current workflow, authority, runtime, and project templates for the separate
  greenfield, brownfield-adoption, and migrated-authority paths.
- Made every Change converge through a current plan, DB-backed task contract,
  bounded context, risk-selected verification, review, documentation
  reconciliation, and local delivery archive. Research remains adaptive and
  may be omitted when current evidence is sufficient.
- Defined `.ultra/` as project-local cross-session workflow memory: registered
  specifications and evidence carry semantic bodies, while MCP and SQLite own
  lifecycle state, references, digests, legal transitions, and recovery.
- Extended packed-package conformance to cover prompt hygiene, native interaction
  parity, exact public capabilities, user-handbook byte preservation, and project
  inertness before `ultra-init`.

### Fixed

- Fixed archive, plan, session-close, worktree, and migration mutations so
  partial failures recover the prior files and state instead of reporting false
  success or leaving split authority.
- Fixed context and delivery gates accepting stale, cross-project, symlinked,
  malformed, unowned, or digest-mismatched artifacts.
- Fixed draft baselines exempting arbitrary files under `.ultra/specs/`; only
  the four reserved baseline scaffold files are provisional before baseline
  readiness, and every additional spec is diagnosed as an orphan immediately.
- Fixed host hooks and adapters resolving legacy state paths or becoming a
  second semantic authority. Hooks now observe active workflow state, protect
  projections, and surface recovery without forcing a semantic route.

### Removed

- Removed the non-Ultra `learn` command and Skill, automatic session-to-Skill mining,
  and both global output-style personas from source, host adapters, and npm
  distribution. Ultra no longer creates user Skills or controls communication style.

## [0.20.0] — 2026-07-28

### Added

- Added schema 19 and `decision.complete` so settled normalized intent reaches a
  terminal lifecycle state without fabricating a second user approval or an
  artifact checkpoint. Existing settled schema-18 threads migrate safely.

### Changed

- Unified semantic selection across Claude Code, Codex, OpenCode, and Kimi Code
  as `inspect -> suggest -> ask if unresolved -> normalize -> persist`, using
  each host's native structured question surface with a direct-question
  fallback.
- Made research coverage and planning posture owner-selected after model
  recommendation while preserving autonomous fact finding, synthesis,
  decomposition, and reversible implementation judgment.
- Stopped requiring a ceremonial decision checkpoint after every normalized
  answer. Artifact checkpoints remain explicit digest-bound freshness gates.
- Made unanswered non-blocking follow-ups advisory instead of global workflow
  gates; unanswered blocking choices and blocking deferrals still fail closed.

## [0.19.1] — 2026-07-26

### Fixed

- Made the four-host handbook-isolation release test hermetic so a clean CI
  runner does not require the Codex CLI merely to prove that installation and
  uninstallation preserve user-owned instruction files byte for byte.

## [0.19.0] — 2026-07-26

### Changed

- Made every public Ultra workflow explicitly activated. Claude Code and Kimi
  Code disable model invocation, Codex keeps implicit invocation disabled, and
  OpenCode commands load private plugin workflow assets instead of exposing
  public workflows through its model skill catalog.
- Limited lifecycle context, health, checkpoint, stop, and subagent hooks to
  DB-authoritative active workflows. Initialized idle projects retain only
  generated-projection protection.
- Changed workflow handoff to return allowed transitions and a host-owned
  recommendation without launching another public workflow.

### Removed

- Removed `ubp-handbook`, the shared handbook renderer, Kimi session bootstrap,
  and every package path capable of creating or rewriting user-level
  `CLAUDE.md` or `AGENTS.md` files.

## [0.18.0] — 2026-07-25

### Added

- Added explicit `ubp-handbook --full` preview and apply modes that render one
  complete engineering contract with native Claude Code, Codex, OpenCode, and
  Kimi semantics, preserve supported provider-managed marker blocks, require a
  content-bound preview confirmation, and back up every replaced user handbook.

### Changed

- Replaced the duplicated legacy root prompts with concise host-native
  repository guides. General engineering doctrine now has one renderer, while
  workflow detail remains in portable Skills and host wiring remains in adapters.
- Changed research coverage from a catalog-wide checklist to a model-selected
  evidence set. MCP persists only selected or explicitly recorded exclusions
  while retaining synthesis and evidence invariants.
- Codex hook manifests now call the stable managed plugin adapter, so new tasks
  do not retain an evictable cache-version path.
- Corrected Claude Code namespaced invocation, OpenCode Skill loading, and
  installation-doctor syntax in every rendered handbook.
- Full handbook convergence now preserves repeated and nested external provider
  regions, normalizes duplicate Ultra regions, follows dotfile symlinks, and
  retains the target POSIX mode.
- Extended prompt conformance checks so external Skill declarations cannot enter
  packaged Ultra Skills or worker prompts.
- Source installations now record dirty state and a deterministic worktree
  digest without inheriting an enclosing consumer repository.
- The npm package now ships a current decision contract and excludes the
  repository-only historical implementation plan.

### Removed

- Removed stale external graph declarations, foreign interaction-tool, old context-budget,
  outdated version, and invalid path instructions from the active repository
  handbooks. External graph and memory capabilities remain separately owned.

## [0.17.1] — 2026-07-24

### Fixed

- Fixed the broad `templates/` ignore rule excluding the two generated-project
  report templates from clean npm packages. Both templates are now tracked
  explicitly, and the release suite rejects any locally present project
  template that is absent from Git.

## [0.17.0] — 2026-07-24

### Added

- Added deterministic Git bootstrap for initialization and resume, including
  explicit `auto`, `initialize`, and `skip` modes, persisted unborn-HEAD state,
  and an owner-authorized first-checkpoint gate.
- Added a source-backed compatibility crosswalk against the original
  `rocky2431/ultra-builder-pro` workflow and a shell-free `execute-plan`
  consumer for current completed-plan dependency waves.
- Added schema 18 adaptive transition state, migration of active legacy
  init/change/plan/deliver runs, Context Manifest v3 Change-authority digests,
  and one host-specific interaction contract for every supported runtime.
- Added research coverage dispositions (`execute`, `verify_existing`, `reuse`,
  `not_applicable`, and accepted `deferred`) and risk-selected verification
  profiles with rationale for every excluded dimension.

### Changed

- Changed plan execution into a resumable wave state machine. A wave pauses
  until its DB tasks converge, later dependencies remain pending, and reruns
  skip completed work.
- Changed MCP session spawning to create the single authoritative Git worktree
  and session record. Session close now preserves work by default, and
  change-owned auto-merge requires current dev and review evidence.
- Changed session worktrees to bind their ignored `.ultra` entry to the central
  authority and pass non-overridable DB, checkout, and authority-root paths to
  explicit workers.
- Changed initialization to complete after classification, local Git/scaffold
  setup, and read-back verification. It never starts research implicitly;
  baseline research begins only through an explicit invocation.
- Changed the workflow from a canonical next-action pipeline to an adaptive
  capability graph. MCP exposes valid alternatives and unique hard-recovery
  transitions; the active host owns semantic recommendations and native user
  interaction.
- Changed change capture to end after the accepted intent contract, made plan
  approval conditional on a material owner decision, selected test/review work
  by risk, and limited Ultra delivery to local convergence and archive.

### Fixed

- Fixed process exit zero, worker spawn errors, and daemon failures bypassing
  task gates or losing session-linked failure and circuit-breaker evidence.
- Fixed daemon dispatch of stale tasks, unresolved dependencies, or overlapping
  declared files, and made explicit takeover terminate the prior worker before
  replacing its lease.
- Fixed initialization resume leaving corrected metadata or projections behind
  after a late failure; DB state, generated projections, and newly bootstrapped
  Git now roll back together.
- Fixed cleanup paths that could remove uncommitted or unintegrated worktrees,
  and fixed dependency waves that could start before prior task convergence.
- Fixed change-owned auto-merge trusting task status alone; integration now
  requires the exact completion commit, ready dev evidence, and current task review.
- Fixed `execute-plan` accepting empty, cyclic, duplicate-task, stale, or
  incomplete change plans. Change-owned execution now requires the exact healthy
  completed plan workflow and current DB task graph.
- Fixed direct MCP and daemon session creation bypassing the plan workflow.
  Admission and spawn now share the same current task-contract, dependency, and
  staleness gate before takeover or worktree mutation.
- Fixed plan-authority drift between wave selection and spawn being counted as a
  worker failure, and fixed isolated workers creating a second project DB.
- Fixed an isolated worker recursively spawning, taking over, or prematurely
  closing its parent-owned session; the supervising process now remains the only
  transport-settlement authority.
- Fixed late resume failure after a schema upgrade restoring the migrated
  intermediate DB instead of the exact pre-migration backup.
- Fixed the directory-only `.ultra/` Git ignore form failing to protect an
  authority symlink from `git add -A`; fresh initialization uses the symlink-safe
  `.ultra` rule, while legacy repositories receive a repository-local
  `info/exclude` rule without changing their tracked baseline.
- Fixed semantic `change.update` operations leaving derived tasks and compiled
  contexts apparently current. A changed intent contract now marks tasks stale,
  invalidates Context v3, and records the exact invalidation evidence.
- Fixed stale tasks remaining usable through plan completion, dev startup,
  verification, delivery, or orchestrator admission after semantic invalidation.
- Fixed marker-only task reconciliation bypassing semantic invalidation. Clearing
  `stale` now requires a complete execution-contract rebind and records the current
  Change authority digest.
- Fixed review convergence accepting incomplete or fabricated worker provenance;
  every specialist is now selected or skipped with rationale, and completed workers
  must exactly match persisted specialist artifacts.
- Fixed MCP workflow contracts omitting public freshness, recovery, review, testing,
  and delivery failure codes needed by host adapters.
- Fixed runtime specification templates and workflow prompts retaining rigid-route
  wording or omitting durable step and decision-tool handoffs.

## [0.16.0] — 2026-07-23

### Added

- Added schema 16 durable decision threads and items with exactly one current
  question, normalized owner answers, explicit reversible delegation, consequence-
  bearing deferral, supersession history, and artifact-bound checkpoints.
- Added nine `decision.*` MCP contracts, CLI mappings, events, valid/invalid contract
  fixtures, status/breadcrumb recovery, doctor health checks, and workflow gates.
- Added one canonical progressive-disclosure decision protocol shared by init,
  research, thinking, change, and planning without copying questionnaires into each
  Skill.

### Changed

- Changed research to preserve all seventeen semantic steps as an internal coverage
  contract while exposing only the current owner decision or compact checkpoint.
- Changed change and plan formation to inspect facts autonomously, present one
  evidence-backed choice at a time, stop for the owner, and reuse one approved
  checkpoint instead of requesting equivalent confirmations.
- Changed dev, test, review, deliver, status, doctor, user handbooks, and lifecycle
  documentation to recover through the same decision authority and exact next route.

### Fixed

- Prevented a decision thread for one change from blocking unrelated changes on the
  same baseline while preserving baseline-only and matching workflow gates.
- Prevented workflow steps or completion from advancing on an open, blocking-deferred,
  checkpoint-ready, stale, or superseded owner decision.
- Prevented prompt transcripts, static question queues, large research dumps, and
  repeated owner approvals from becoming project authority.

## [0.15.0] — 2026-07-22

### Added

- Added schema 15 typed semantic records for selected research areas, including
  step-specific attributes, stable ids, evidence links, source anchors, stored source
  digests, synthesis trace validation, and current-source health checks.
- Added complete Change Contracts with executable acceptance, non-goals, public seams,
  recovery, unresolved decisions, profile rationale/risk flags, and explicit bounded
  research disposition.
- Added plan acceptance coverage and traceability gates, one-task enforcement for quick
  changes, verified specification-learning application, and a published
  `ultra-baseline-reconciliation-v1` schema.
- Added task/change/plan review modes and machine-validated worker selection or skip
  provenance while preserving independent specification-fidelity and engineering axes.

### Changed

- Unified every greenfield, brownfield, migrated, and daily route through
  `ultra-change` before planning. Initial planning can no longer bypass durable intent,
  risk, research, recovery, or acceptance authority.
- Reworked the workflow Skills into compact host-neutral execution contracts with
  focused references for research semantics, Change profiles, planning preflight,
  review modes, and delivery reconciliation.
- Made context budgets advisory while keeping evidence, authority, acceptance,
  specification freshness, review, and recovery gates deterministic and blocking.

### Fixed

- Fixed research completion that previously stored prose and file hashes without a
  machine-consumable semantic index or stale-source detection.
- Fixed planning that could complete without proving every Change acceptance criterion
  had an executable owner or that each task traced to accepted evidence.
- Fixed approved learning and delivery reconciliation that could record status without
  verifying the applied target, before/after content, source anchor, and archive replay
  provenance.
- Fixed review artifacts that did not distinguish task, aggregate change, and plan
  scope or preserve why each bounded worker was selected or skipped.
- Fixed host review-prompt adaptation across intentional Markdown line wrapping and
  excluded tests, test fixtures, and generated Python bytecode from installed and
  published plugin payloads.

## [0.14.0] — 2026-07-19

### Added

- Added one read-only JavaScript Context Spine reader and renderer for the
  authoritative `.ultra/state.db`, plus a packaged breadcrumb CLI shared by
  Claude Code, Codex, OpenCode, Kimi Code, and the MCP server.
- Added cross-host regression coverage proving stale JSON projections and
  context manifests cannot override the active database change or task.

### Changed

- Changed `task.parse_prd` and `task.expand` to validate and atomically persist
  task objects derived by the active host model. Ultra MCP no longer starts a
  second model client or requires an Anthropic, OpenAI, or other provider key.
- Reduced Python lifecycle hooks and the generated OpenCode plugin to thin
  adapters over the canonical breadcrumb reader. Checkpoint and resume data is
  advisory recovery evidence rather than a second workflow authority.
- Made collaboration and verification Skills host-neutral, kept the current
  host responsible for delivery, and generated Codex metadata from the source
  Skill instead of maintaining duplicated prompt bodies.

### Fixed

- Fixed authoritative-state and injected-prompt divergence caused by hooks
  reading `.ultra/workflow-state.json` or context manifests after
  `.ultra/state.db` had advanced.
- Fixed stale or incomplete state routing: missing projects route to
  `ultra-init`, prior schemas route to migration, and corrupt current schemas
  route to `ultra-doctor` without fabricating active workflow context.
- Fixed installed OpenCode context injection so it reads the bundled runtime
  with the installer-selected Node executable and remains portable outside the
  source checkout.
- Fixed Codex collaboration invocation and generated metadata quoting while
  preserving the bounded read-only advisor contract.

### Removed

- Removed the private LLM client, planner prompt builders, and the
  `@anthropic-ai/sdk` and `openai` runtime dependencies.

## [0.13.0] — 2026-07-18

### Added

- Added schema 12 repository snapshots, branch and dirty-worktree evidence,
  classification metadata, and a categorized baseline gap ledger with explicit
  blocker, ownership, acceptance, and resolution state.
- Added safe `task.init_project` resume semantics, bounded monorepo scope
  detection, projection-only import routing, explicit migrated-baseline
  replacement, and backup-first recovery for old state databases.
- Added explicit corrupt-state restore and rebaseline commands that quarantine
  the original database, WAL, SHM, and task projection and restore every moved
  artifact when recovery fails.
- Added approved incident break-glass records and mandatory post-incident
  baseline reconciliation gaps, plus durable archive-journal crash recovery.

### Changed

- Made `ultra-init` the single route for empty repositories, existing
  codebases, healthy installations, incomplete adoptions, prior Ultra state,
  and corrupt databases. Existing application and baseline files are preserved;
  resume installs only missing current scaffold assets.
- New ordinary changes now require a healthy ready baseline. Already-active
  work remains executable with visible drift warnings, while convergence still
  requires current approved authority.
- Ready-baseline replacement now requires durable owner identity and rationale;
  a bare `replace_ready` boolean is rejected and cannot erase provenance.
- Reworked baseline templates and host-neutral Skills around
  `Observed`/`Verified`/`Decided`/`Unknown` evidence, characterization results,
  owner approval, and one deterministic next action.

### Fixed

- Prevented prior-version projects from being treated as approved after a
  schema upgrade; compatibility baselines remain `migrated/adopting` until an
  evidence-backed brownfield replacement is approved.
- Made status and doctor report old or corrupt state as structured recovery
  guidance, retain pre-migration backup paths on failure, and close failed
  database handles safely.
- Prevented maintenance CLI telemetry from opening corrupt authority before
  evidence-preserving recovery checks, and made task creation enforce the same
  baseline boundary as change creation.
- Closed bulk-parse and task-expansion task-creation bypasses; persisted PRD
  tasks now carry their active change id, and expanded children inherit the
  parent task's authorized change ownership.
- Rejected task writes against missing or terminal changes even when the
  baseline is healthy, and enforced parent-child change ownership for generic
  task creation and reassignment paths.
- Fixed installed npm tarballs so direct `ultra-tools task init-project` calls
  can locate the packaged scaffold outside a source checkout.

## [0.12.1] — 2026-07-18

### Fixed

- Fixed the published project scaffold so its task projection and neutral context
  template are tracked on fresh checkouts instead of being hidden by a broad ignore
  rule; the seed projection now uses the authoritative v4.5 state contract.

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
  retired internal memory paths, and obsolete recall instructions from every
  bundled agent.

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
- Removed bundled external browser, discovery, deployment, framework, and
  inherited design-skill assets from Ultra output.
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
  `dispatch-rules.cjs` (declarative priority-sorted rule table),
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

[Unreleased]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.20.0...HEAD
[0.20.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.19.1...v0.20.0
[0.19.1]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.19.0...v0.19.1
[0.19.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.17.1...v0.18.0
[0.17.1]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.12.1...v0.13.0
[0.12.1]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.12.0...v0.12.1
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
