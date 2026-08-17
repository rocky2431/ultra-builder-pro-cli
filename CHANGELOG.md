# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.1] — 2026-08-18

### Added

- Implemented the r3 North Star projection under a verified primary transfer:
  North Star revision `north-star-v2-r3` with the new `FP-8` (Agent handover is
  exclusive, verified, and recoverable), a new acceptance decision and immutable
  snapshot, and the exact ZCode sole-writer durable grant
  `ubp3-r3-zcode-2026-08-17` recorded in `.ultra/decisions/`.
- Added the primary-transfer contract between Agents
  (`skills/ultra-change/references/primary-transfer.md`): an owner-granted
  OFFER → verified ACK → sole-writer execution → frozen terminal RESULT protocol
  over canonical files and Git, mutually exclusive with delegated workers,
  with derived receipts under `.ultra/.runtime/handoffs/` and a mechanical
  validator (`skills/ultra-change/scripts/validate_primary_transfer.cjs`) plus
  authority, permission, effect, stale/revoke/interrupt/resume/cancel, and
  missing-receipt recovery regressions (`tests/primary-transfer.test.cjs`).
  `ultra-change`, `ultra-status`, and `ultra-delegate` consume the contract.
- Added the versioned closeout-transition contract
  (`ultra-primary-transfer-closeout-v1` in
  `skills/ultra-change/references/primary-transfer.md`): the immutable
  reviewed subject of a newest completed v2 RESULT is separated from exactly
  one uncommitted prescribed post-review closeout (final evidence record,
  task-context closeout sections, ledger `completed`) through a CLOSEOUT
  receipt that starts no review or handoff and never commits, while
  implementation, Acceptance, PPI, pre-review-evidence, and unrelated-ledger
  drift stays typed-stale; owner-authorized continuations between freeze and
  closeout are recorded, bounded, and pinned. The closed task's ledger row is
  bound ex-status (unique, `in_progress` → `completed`, every other field
  structure-equivalent, re-read live), and `authorized_by` binds the existing
  `ultra-external-review-receipt-v1` semantics (read-only reviewer, exact
  task/change identity, authority and reviewed-contract refs by stable bytes,
  subject equal to the closeout start, `approve` with no P0/P1). Regressions
  cover the terminal
  green path without RESULT edit or commit, structural and citation
  rejections, drift during/after closeout (including current-row field drift),
  continuation bounds, and preserved
  history (`tests/primary-transfer.test.cjs`).
- Repaired the contract in the owner-authorized Round 1 pass
  (`ubp3-r3-zcode-desktop-r1`): transfer validation is now phase-correct (an
  ACK is a pre-write boundary record, so expected receiver edits never
  self-invalidate an active or completed transfer; a superseded or v1 terminal
  receipt stays historical), all receipt and bound-input reads are bounded
  ordinary-file no-follow identity-checked reads (typed rejection for symlinks,
  FIFOs, directories, oversize, and replacement), and a v2 terminal RESULT
  binds the recomputed final HEAD, product worktree digest, exact full product
  path inventory, and final frozen-input digests. Review-budget precedence is
  one rule — an exact current owner grant overrides the versioned product
  default (one initial review plus at most two P0/P1 delta reviews); P2/P3
  never auto-extend, and the same root surviving three failed fixes stops
  point-patching as an architecture problem. The ZCode delegate transport now
  requires visible `--ack-experimental` acknowledgment and stamps
  `transport_maturity`/`transport_surface` truth on every receipt and result,
  so an app-internal CLI run can never be presented as the documented ZCode
  Desktop interactive surface.
- Closed the two Round 2 misses on the same roots: transfer validation is now
  fail-closed (an unobservable HEAD/Git is a typed `git_unavailable` error
  instead of a green warning) and every read goes through the worktree-digest
  tool's one shared stable snapshot primitive with parent-chain walks, exact
  handoff-directory replay, same-subject supersession, and one finite coherent
  digest×manifest terminal observation; every delegated ZCode terminal result
  (finished, failed, cancelled, interrupted) now mechanically carries
  `experimental_ack: true` when `--ack-experimental` authorized the run.
- Closed the final Round 3 miss on the same root: repo-wide handoff-root
  discovery reuses the one stable directory observation — a symlinked,
  unreadable, malformed, drifting, or oversize handoffs root (or entry) fails
  typed and closed instead of silently reading as zero handoffs with
  `valid: true`, while an absent root still legitimately means no transfers.
- Implemented the accepted Ultra Builder Pro 3.0 design as one Mode B durable
  work-package projection: North Star revision `north-star-v2-r2` with seven first
  principles, five observable outcomes (`NS-01`-`NS-05`), and eight hard constraints;
  the provider-neutral Ultra Core Protocol naming across public docs; the
  owner-facing checkpoint contract (why, outcome, accepted boundary, delta, reality,
  decision needed, next bounded action, not-done); the per-fact artifact-authority
  matrix with an explicit Execution Grant row and four effect classes; and the
  optional Graph/Loop control-plane boundary documented as not integrated.
- Added dual-mode execution grants: session-local by default, `durable work-package`
  by exact owner record, with stable verification, invalidation, and portable
  handoff semantics in `skills/ultra-change/references/execution-grant.md`;
  Status reports a recorded durable grant as inactive data awaiting verification.
- Added work-package review convergence bounded by an owner-visible budget: the
  released default is at most one initial Review plus two P0/P1 delta Reviews per
  coherent package, with explicit terminal outcomes, no self-extended budget, and
  mandatory stop signals when repairs expose distinct root causes. Exact defaults
  live in the versioned product contract; exact overrides in owner grants.
- Added ZCode as a sixth native host with fourteen Skills, five hook registrations, a
  managed local marketplace, inline-plugin activation, Doctor, update, uninstall, and
  bounded source/target delegation profiles. The App-bundled headless CLI transport
  is recorded `experimental` in the shared host profile until official documentation
  plus a full recovery drill meet the support bar.
- Added canonical North Star traces from Research through Change, Plan, review, Test,
  and delivery, plus adversarial challenges at Research checkpoints 04, 21, and 99.
- Added review coverage references, recorded isolated-versus-sequential execution mode,
  mandatory Plan and aggregate Test reviews, blind cross-family probes, and a seeded
  adversarial evaluation fixture.

### Changed

- Made review topology owner-selected per stage with a one-reviewer default: initial
  task review selects `review-spec` plus risk/touched-seam lenses, delta reviews rerun
  only affected lenses, and the aggregate full-roster default applies only when
  cross-task wiring justifies it — never a mandatory count or a quality proxy.
- Split `ultra-deliver` entry by invocation kind: a model-selected Deliver run under a
  grant may reconcile, review, and report, then stops before finalization; writing
  `delivery.md`, version/package posture, and archiving require a current explicit
  owner invocation in every grant mode.
- Replaced the Change-scoped same-session Autonomy Envelope (superseded name,
  historical) with the dual-mode
  Execution Grant contract (`## Execution Grant` in every intent, `session-local`
  default); renamed `AUTONOMY_CONTINUABLE_SKILLS` to `GRANT_CONTINUABLE_SKILLS` and
  removed the unused `requiresAutonomyEnvelope` policy field.
- Closed the superseded `chg-v027-lifecycle-closure` Change with an exact
  abandonment record citing the Mode B grant and successor `chg-ultra-3-0-mode-b`;
  its pending v0.27 task rows remain inert append-only history.
- Made `validate_repo_path` in the review waiter reject symlink and non-directory
  path components at validation time (Python 3.13 `resolve(strict=False)` no longer
  raises on symlink loops).
- Made the task-evidence audit and review-wait fixtures derive the repository
  North Star decision, snapshot, revision, and trace IDs dynamically instead of
  locking revision r1.
- Raised the Grok delegation turn ceiling to twelve and retained launcher-side strict
  result validation; Kimi delegation can now select a model explicitly.
- Made Claude delegation rely on strict launcher validation instead of a native schema
  option rejected by current Claude Code.
- Embedded each digest-bound instruction and permission packet in the worker prompt so
  OpenCode can keep external-directory access denied, and projected a Codex-compatible
  native result schema while retaining stronger launcher validation.

### Fixed

- Made the release gate reproducible from a clean checkout: installer integration
  tests use an isolated Codex CLI fixture, and completed-task audits consume canonical
  evidence after Review and Handoff receipts have reached their documented GC boundary.
- Made no-op ZCode hook adapters emit an actually empty stdout response, matching the
  host's strict hook parser instead of intermittently failing a benign tool call on `{}`.
- Shared the macOS App-bundled ZCode CLI fallback between native plugin lifecycle
  checks and delegated target launches when `zcode` is not available on `PATH`.
- Removed a delegated-result prompt contradiction by listing `$schema` in the exact
  required field set, matching the launcher's fail-closed result validator.
- Added a resident entry guard to every implicitly discoverable public workflow so a
  missing live execution grant stops before workflow work begins: a session-local grant
  requires current conversation activation, and a durable work-package grant requires
  stable verification by the consuming Agent.
- Raised the direct `js-yaml` floor to 4.3.1 so the release dependency audit no longer
  includes the high-severity `!!omap` quadratic-consumption advisory.

### Verified

- Completed authenticated read-only target delegation with Claude Code, Codex,
  OpenCode, Kimi Code, and ZCode; Grok Build's malformed terminal output failed closed.
- Re-ran ZCode target delegation without a binary override on a machine where `zcode`
  is absent from `PATH`; the App-bundled fallback returned a validated empty-diff result.
- Completed one bounded ZCode automatic-coding run through Plan, adversarial reviews,
  TDD, and Test with 3/3 tests passing, then stopped before ungranted delivery, commit,
  push, publication, or deployment.

## [0.26.2] — 2026-08-04

### Added

- Added `.ultra/project-brief.md` as the raw owner-intake artifact and optional
  Research `wayfinding.md` navigation for unclear multi-lens paths, without adding a
  fifteenth Skill or another semantic authority.
- Expanded Research alternatives beyond direct competitors and made a single North
  Star metric optional when an observable outcome plus guardrails is more honest.

### Changed

- Narrowed `ultra-init` to the Project Brief and empty skeleton, made
  `ultra-research` own the first accepted North Star, domain language, and
  specification baseline, and limited `ultra-change` to touched baseline sections.
- Made the first six Research lenses dependency-aware and kept Grilling, Think, and
  Domain Modeling as caller-bounded reusable methods rather than Research stages or
  owner routes.
- Routed `ultra-status` from semantic file contents instead of a Research completion
  bit or any single unresolved marker.
- Gave every Change one stable id across active, archive, and abandoned positions;
  made the task ledger append-only and every current reader active-id scoped.
- Added explicit `none`, `bounded`, and `required` Research Disposition contracts,
  one-task planning for quick Changes, and two-pass delivery against a fresh semantic
  plus product snapshot.
- Gave the exact Change Contract explicit Profile rationale and Risk flags fields so
  its required blast-radius decision has one stable representation.
- Kept ordinary technical seam selection model-owned and made delegation reachable for
  task execution, scoped Research evidence, and aggregate Change review without
  manufacturing task rows.

### Fixed

- Made session context prefer the accepted North Star, fall back to the Project Brief
  before Research, retain legacy one-line compatibility, and always append active task
  acceptance when present.
- Bound Research distillates to the actual `git hash-object` value of all three
  baseline specifications so staleness is mechanically observable.
- Prevented archived or abandoned unfinished tasks, invalid Change ids, blocked
  dependencies, and ambiguous multiple `in_progress` rows from being injected as the
  current Hook acceptance.
- Made canonical `change_id` override a conflicting legacy `change_ref`, so migration
  compatibility cannot revive a historical task.
- Bound Test reports to exact Change id, ordered task ids, intent digest, HEAD, and a
  product-worktree digest that excludes the report and Change-directory metadata while
  binding current intent separately, so product reconciliation requires retest while
  delivery metadata and archive finalization do not self-invalidate.
- Prevented a separate request from opening a second active Change, and gave abandoned
  intents an exact owner decision, reason, reusable-evidence, and recovery closure read
  by future Change and Status workflows.
- Kept non-publishing package inspection diagnostic while the explicit Deliver gate
  blocks release-package creation only for an undispositioned changed export with no
  non-test consumer.
- Made that gate's authorization path use the finding disposition in the current Test
  report and carry the accepted decision into `delivery.md`.
- Aligned `.npmignore` with the explicit package allowlist and locked all eight
  maintained product documents into the tarball smoke contract.

### Verified

- Passed 119 Node tests, 21 Hook tests, 14 Skill Creator validations, five isolated
  host install/Doctor/uninstall lifecycles, a 115-entry package dry-run inspection, and
  an audit with zero vulnerabilities.

## [0.26.1] — 2026-08-03

### Added

- Added reframing to `ultra-grilling`, five bounded framing questions, and checkable
  resolved, stalled, and unavailable exits so a literal request can be translated
  into the role and outcome the owner actually means.
- Added `HC-<n>` hard-constraint identifiers, task-level constraint mapping,
  executable Change verification, and a supported `changes/abandoned/` exit.
- Added owner-authorized cross-model-family review for major or security-relevant
  Changes, plus optional native fan-out inside independent research and test regions.

### Changed

- Made `ultra-dev` converge on each task's mapped Change acceptance IDs, track the
  best-ever passing set, and stop after two no-progress rounds or three repair rounds.
- Expanded delivery reconciliation to every repository document and kept its wiring
  gate local to an explicitly invoked `ultra-deliver`; ordinary npm lifecycle commands
  never depend on project `.ultra/` evidence.
- Made `ultra-change` read relevant archive history before opening intent, preferring
  `delivery.md` while supporting legacy archive summaries and verification records.
- Made all six review lenses the default and required every skipped lens to preserve
  its reason in the aggregate result.

### Fixed

- Prevented delegated workers from modifying `.ultra/`, including when `.` grants the
  rest of an isolated checkout.
- Made dangerous-command authorization reachable by hashing the protected effect
  independently of its retry spelling.
- Kept additive protected-branch publication on the host's native authority path instead
  of hard-blocking an already owner-authorized release, retained exact-digest guards for
  history rewrites and branch deletion, and stopped treating inert searches as effects.
- Kept expandable interpreter heredocs inside dangerous-effect inspection while
  continuing to treat quoted commit-message heredocs as data.
- Required explicit owner authority before `ultra-review` can launch a cross-host
  model-family recheck.
- Bound `ultra-dev` convergence to the active Change acceptance IDs, with explicit
  stalled and unreachable exits instead of an open-ended repair loop.
- Made `ultra-change` recover archived intent from legacy archive evidence when the
  preferred delivery record is absent.
- Kept the `ultra-deliver` wiring gate local to an owner-invoked delivery workflow;
  ordinary package commands remain independent of project `.ultra/` state.
- Added the missing `changes/abandoned/` template directory and migrated completed WIP
  evidence links to their canonical runtime document.

### Verified

- Completed an authenticated Claude-to-Codex continuation on one isolated
  file-first task: Claude banked the failing test and Resume Note without changing
  implementation, and Codex resumed from Git plus `.ultra/`, reached green, and
  closed the ledger and canonical evidence without conversation transfer.
- Verified the release candidate with 111 Node tests, 10 Hook tests, 14 Skill Creator
  validations, five healthy host Doctor reports, and zero audit vulnerabilities.

## [0.26.0] — 2026-08-01

### Added

- Added `ultra-delegate`, five source-backed CLI profiles, and a background worker with
  bounded instruction, permission, worktree, logs, and three terminal result states.
- Added five file-first hooks for session context, acceptance recall, compact recovery,
  mechanical evidence observation, and exact-command dangerous-effect protection.

### Changed

- Rebuilt the product around fourteen portable Skills: eight owner workflows, five
  model-invoked disciplines, and one router. Repository files and Git are now the
  complete cross-session and cross-host authority.
- Replaced all five host adapters with managed, provenance-checked file-first plugin
  artifacts and isolated install/doctor/update/uninstall behavior.
- Moved rule-side research, review, TDD, and autonomy material into focused Skill
  references and reduced the project skeleton to one canonical `.ultra-template/`.

### Removed

- Removed the MCP server, SQLite runtime dependency, workflow state machine,
  orchestrator, operational CLI, command projections, custom-agent projections, and
  their obsolete schemas and tests.

### Fixed

- Made `--config-dir` the isolation home for Codex plugin and personal-marketplace
  sidecars, and registered the plugin through Codex with the same isolated `HOME` and
  `CODEX_HOME`, preventing sandbox installs from mutating the real home directory.
- Namespaced multi-host `--config-dir` installs by runtime so one host cannot replace
  another host's `skills/` or `plugins/` tree.
- Made failed Codex registration restore the previous managed plugin and marketplace,
  or remove a fresh partial install.
- Rejected project-escaping task context and spec paths before hooks read them.
- Rejected delegated writable roots outside the named worktree and readable roots
  outside the current project before launching another CLI.
- Restored independent plan, development-evidence, and final-wiring checks so a locally
  green layer cannot stand in for an end-to-end product path.

## [0.25.1] — 2026-07-31

### Fixed

- Published state-migration lock ownership atomically from a fully written and
  synchronized candidate inode, so concurrent Node 22 processes cannot mistake a
  valid publication or release window for a malformed lock. Stable malformed locks
  remain fail-closed.

## [0.25.0] — 2026-07-31

### Added

- Added `task_outcome / attest_commit` as the sole model-facing path for recording
  checkout-local integrated commit proof after durable Task completion.

### Changed

- Published exact Task identifier, numeric, array, object, digest, and runtime-field
  boundaries in the seven-tool MCP contract while keeping repository-defined Task,
  Change, priority, risk, research, and slice labels under model ownership.
- Applied the same exact-input boundary to Baseline, Change, Decision, Artifact, Event,
  Context, Checkpoint, Sync, Session, Archive, and Doctor calls. Unknown fields and
  wrong scalar, enum, array, object, digest, or scope types are rejected before SQLite
  affinity or downstream consumers can reinterpret them.
- Made Dev delivery publish durable completion before one integration commit, then
  attest that commit locally without changing the Git-facing team ledger.

### Fixed

- Removed arbitrary Task patches and model-supplied commit hashes from
  `task_outcome / complete`, eliminating the remaining self-referential or
  bookkeeping-commit path.
- Fixed malformed semantic input and idempotency attempts escaping as transport or raw
  SQLite errors. Correctable requests now return mutable diagnostics and enter bounded
  rejected-attempt audit history without creating semantic authority.
- Fixed record, checkpoint, team-checkpoint publication, Session lease, Worker Packet,
  and archive receipt failures leaving database rows, managed files, worktrees, or Git
  checkpoint bytes partially committed. Each public mutation now commits its durable
  receipt with the owned state or compensates the external effect before retry.
- Fixed Task deletion reporting a generic draft-state error before identifying the
  exact durable Session, Artifact, checkpoint, Context, workflow-history, or recovery
  reference that must be resolved.
- Added a linked active successor path for immutable archived or cancelled Changes
  instead of requiring history mutation or direct SQLite repair.
- Removed the public Kernel's runtime dependency on the retired workflow supervisor;
  the legacy Change implementation remains compatibility-only and is absent from all
  five bundled host runtimes.
- Revoked an assigned Worker Packet when a parallel reservation is unwound, ensuring
  the abandoned capability cannot later complete a Task without a live Session.

## [0.24.2] — 2026-07-31

### Changed

- Made the production Change facade single-mode and Kernel-only. The pre-v0.24
  Change implementation is explicitly isolated for compatibility, while retired
  workflow and dialogue rows remain read-only history with no public artifact owner
  or invalidation writer.
- Made review and debug agents evidence-only: delegated workers can write only their
  assigned report, while the primary host owns source remediation and final judgment.

### Fixed

- Preserved rejected semantic calls as bounded `ultra_kernel_attempt` audit history
  visible through `ultra.context`, without creating the rejected semantic authority.
- Renamed misleading `_ultra.state_commit` response metadata to
  `_ultra.projection_commit`; projection processing no longer resembles a semantic
  acceptance receipt.
- Removed current Change-packet decisions and artifact invalidation from retired
  workflow/dialogue tables while retaining safe migration and historical reads.

## [0.24.1] — 2026-07-31

### Changed

- Kept semantic completeness, route selection, baseline sufficiency, and delivery
  acceptance in Skills and the host model. The MCP kernel now records those conclusions
  as advisory diagnostics while retaining hard failures only for structural authority,
  current bytes, digests, scope ownership, concurrency, permissions, and recovery.
- Made local delivery follow the evidence required by the actual Change route. Explicit
  omissions and their rationale are preserved without imposing a fixed
  Plan/Dev/Test/Review sequence on every archive.
- Made completed Tasks explicitly reopenable without erasing their prior completion
  commit or accepted history.

### Fixed

- Fixed nonexistent or mismatched Task/Change checkpoint scopes creating ghost
  checkpoint authority; invalid scopes now fail before any Context or checkpoint write.
- Fixed shallow or contradictory evidence declarations being accepted without checking
  current managed artifact authority and stable file bytes.
- Fixed baseline semantic gaps, missing optional research, and `not_run` verification
  being misrepresented as mechanical authority failures.
- Fixed installed Change revision paths depending on source-only semantic supervisor
  modules excluded from the npm package.
- Fixed Hooks, Skills, templates, and packaged documentation disagreeing about advisory
  diagnostics, adaptive delivery, and the persistence/safety-kernel boundary.

## [0.24.0] — 2026-07-30

### Added

- Added normalized Decision Records, reversible Stage Checkpoints, bounded Context
  Envelopes, and immutable Worker Packets as the shared evidence and handoff model
  across Skills, Hooks, agents, SQLite, and tracked `.ultra` artifacts.
- Added a native Grok Build plugin so Claude Code, Codex, OpenCode, Kimi Code, and
  Grok Build share the same eleven explicit workflows and seven-tool MCP kernel.
- Added schema 22 backup-first migration and real-history compatibility for v4.4,
  v4.5, v0.22, and v0.23 state and team-ledger formats.
- Added packaged `better-sqlite3` provenance, platform and Node ABI verification,
  and durable Doctor and archive workers for every supported host.

### Changed

- Completed the MCP boundary reduction: Skills own adaptive semantic procedure;
  MCP owns persistence, identity, transactions, leases, paths, recovery, and
  irreversible safety; Hooks only observe or inject bounded context; agents consume
  immutable Worker Packets without writing SQLite authority.
- Folded Plan artifact publication into the accepted Plan checkpoint so a later
  export cannot invalidate its own authority.
- Replaced semantic supervisor failures with mutable diagnostics and repairable
  drafts. Only corruption, unsafe paths, concurrency conflicts, permission failures,
  and irreversible external effects remain hard blockers.
- Made `ultra.context`, `ultra.sync`, and `ultra.doctor` own their inspection and
  repair preflight so an older valid ledger cannot block the tools required to
  migrate it.
- Reduced packaged and documented MCP contracts to the exact seven public tools;
  removed the retired fine-grained schemas, fixtures, and command bypasses.

### Fixed

- Fixed accepted or stale workflow runs becoming permanently self-locked after an
  artifact changed, and made reversible stages reopenable without rewriting
  immutable accepted history.
- Fixed v0.23 team ledgers using `research_run_id` being rejected under the newer
  `research_checkpoint_id` digest contract.
- Fixed native SQLite drivers and Doctor workers being absent or unresolved in
  installed plugins.
- Fixed session acquisition, archive recovery, Context identity, and Worker Packet
  cleanup paths leaving partial authority after failure.
- Fixed installed interaction guidance failing to render each host's native question
  surface while keeping canonical Skills host-neutral.

## [0.23.0] — 2026-07-30

### Added

- Added a seven-tool public MCP kernel: `ultra.context`, `ultra.record`,
  `ultra.checkpoint`, `ultra.sync`, `ultra.session`, `ultra.archive`, and
  `ultra.doctor`.
- Added idempotent batched recording, content-addressed Context snapshots, and
  semantic checkpoints that commit accepted workflow authority in one model
  round trip.
- Added mutable diagnostic envelopes for rejected draft checkpoints and
  archive preflights so the host model can correct or abandon the same draft.

### Changed

- Moved workflow sequencing and semantic judgment back into the eleven public
  Skills. MCP now owns persistence, schema, transaction, concurrency, path,
  recovery, and irreversible-effect boundaries instead of directing the model.
- Reduced the unconditional `tools/list` surface from 60 fine-grained tools to
  seven high-level tools. The 0.22 fine-grained contracts remain callable but
  hidden for one compatibility release.
- Made draft Changes and nonterminal workflows reversible while keeping
  accepted revisions immutable and replaceable through a new draft.
- Updated Claude Code, Codex, OpenCode, and Kimi assets to use the same narrow
  capability graph while preserving each host's native question and bounded
  worker surfaces.

### Fixed

- Fixed Plan drafts becoming permanently self-locked when a task or exported
  artifact changed after validation.
- Fixed semantic validation failures surfacing as MCP transport errors and
  forcing models into repeated repair calls.
- Fixed duplicate Context compilation creating competing snapshots for the
  same semantic inputs.
- Fixed `ultra.context` creating `.ultra` state merely by inspecting an
  uninitialized project.

## [0.22.0] — 2026-07-30

### Added

- Added a versioned, digest-chained Git team checkpoint at
  `.ultra/tasks/tasks.json` for portable baseline, Change, task-contract,
  dependency, and durable task-status handoff.
- Added `task.ledger_get`, `task.ledger_publish`, and `task.ledger_import` with
  per-record revisions, bounded ancestry, transactional fast-forward imports,
  and typed baseline, Change, task, deletion, and active-session conflicts.
- Added exact-byte backup and deterministic upgrade of matching legacy v4.4
  and v4.5 task projections during project resume.

### Changed

- Moved generated task and context views under
  `.ultra/.runtime/projections/`; SQLite remains checkout-local operational
  authority while the Git checkpoint is the narrow team handoff.
- Updated all public workflow Skills, project templates, hooks, adapters, and
  documentation to inspect and synchronize the team checkpoint without
  turning hooks or host adapters into semantic authorities.
- Made imported ready baselines require checkout-local revalidation before
  they may publish a descendant checkpoint.

### Fixed

- Fixed tracked task projections creating a self-referential
  `BASELINE_HEAD_STALE` treadmill after every Ultra operation or metadata-only
  commit. Baseline freshness now uses scoped source content plus Git ancestry
  while continuing to detect specification and source drift.
- Fixed task completion requiring a second bookkeeping commit. The completion
  SHA is now backfilled only into local SQLite and generated views after the
  single real completion commit.
- Fixed resume, doctor, status, and four-host install paths disagreeing about
  legacy task projections, team checkpoints, generated views, and protected
  files.
- Replaced the daemon's machine-speed-dependent 500ms release assertion with a
  bounded observable-session wait while preserving the immediate-poll
  behavior requirement.

## [0.21.1] — 2026-07-29

### Fixed

- Increased the packed four-host integration-test timeout to preserve the same
  release gate on slower clean Linux runners instead of cancelling a healthy
  tarball installation and MCP round-trip near the previous limit.

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

[Unreleased]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v3.0.1...HEAD
[3.0.1]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.26.2...v3.0.1
[0.26.2]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.26.1...v0.26.2
[0.26.1]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.26.0...v0.26.1
[0.26.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.25.1...v0.26.0
[0.25.1]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.25.0...v0.25.1
[0.25.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.24.2...v0.25.0
[0.24.2]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.24.1...v0.24.2
[0.24.1]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.24.0...v0.24.1
[0.24.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.21.1...v0.22.0
[0.21.1]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.21.0...v0.21.1
[0.21.0]: https://github.com/rocky2431/ultra-builder-pro-cli/compare/v0.20.0...v0.21.0
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
