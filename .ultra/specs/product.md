# Product Specification

## Scope

- **Product**: Ultra Builder Pro v0.26, a file-first engineering workflow plugin for
  Claude Code, Codex, OpenCode, Kimi Code, Grok Build, and ZCode.
- **Outcome**: one portable fourteen-Skill workflow, five optional Hooks, one bounded
  cross-CLI delegate, and one canonical project artifact lifecycle.
- **Non-goals**: general memory, browsing, deployment, code-graph storage, a semantic
  supervisor, or uniform emulation of host capabilities.

## Observed

| Current fact | Evidence | Product impact |
|---|---|---|
| The package allowlist contains eight owner workflows, five model disciplines, and one router. | `adapters/_shared/runtime-assets.cjs` | The installed product is exactly fourteen Skills. |
| Each adapter installs the common Skill and Hook allowlists into a native managed surface. | `adapters/*.js`, `tests/v026-adapters.test.cjs` | Six hosts consume the same workflow meaning. |
| The accepted v0.26 checkout contains no MCP server, runtime database, orchestration daemon, commands, or installed agents. | `tests/v026-contract.test.cjs` | Files and Git are sufficient for recovery. |
| Kimi, Grok, and ZCode expose user-scoped plugin installation; OpenCode lacks a native owner/model Skill routing bit; Codex requires separate Hook trust. | `docs/RUNTIME-COMPAT-MATRIX.md` | Limitations remain explicit rather than being hidden behind a semantic shim. |
| Init previously mixed raw owner intake with North Star and baseline semantics. | pre-change `skills/ultra-init/SKILL.md`, `.ultra-template/north-star.md`, and owner review on 2026-08-03 | Init, Research, and Change need separate writer boundaries. |

## Decisions

| Decision | Rationale | Acceptance impact | Owner |
|---|---|---|---|
| Use native Skills as the common product surface. | All six hosts discover Skills; custom-agent APIs and routing metadata differ. | Reusable methods must live in Skills or references. | Owner |
| Keep project truth in owner-readable files and Git. | Cross-session and cross-host recovery must not depend on Ultra runtime availability. | Every canonical artifact needs a writer, consumer, freshness signal, and repair. | Owner |
| Keep public workflows explicit by default and allow only Change-scoped grant continuation — session-local by default, durable work-package when the owner issues one. | The owner selects outcomes; a live execution grant may authorize bounded local continuation, while stored text grants nothing. | Adapters expose only the five continuable workflows implicitly; each resident Skill stops without a live session-local activation or a stably verified durable grant. | Owner |
| Accept no external-effect authority through delegation. | A child CLI must not widen the parent's authority. | External effects remain blocked by contract and require a separate primary-host action. | Owner |
| Separate raw intake, baseline maturation, and bounded deltas. | Init questions were consuming Research before Research began. | Init owns the Project Brief and empty skeleton; Research owns the first accepted North Star, domain language, and specifications; Change reconciles only touched baseline sections. | Owner |
| Keep sequential Change identity stable and scope every current reader explicitly. | A movable `intent.md` path and global unfinished-task scan made archived or abandoned work look current and made the next Change overwrite history. | `change_id` survives active/archive/abandoned moves; `tasks.json` is append-only; current readers filter by the unique active id. | Owner |

## Actors and Jobs

| Actor | Job | Entry point | Constraint |
|---|---|---|---|
| Owner | Select an outcome, confirm material trade-offs, accept risk, authorize external effects. | Native Skill picker or direct request. | Must not be replaced by model or mechanical routing. |
| Host model | Interpret intent, design, implement, evaluate evidence, and express results. | Selected owner workflow. | Operates inside owner authority and repository guidance. |
| Model discipline | Supply a focused reusable method such as TDD, review, or domain modeling. | Implicit selection by the host model inside an active task. | Is not a standalone owner route or authority holder. |
| Delegate CLI | Execute one immutable task, Research-evidence, or aggregate-review instruction in a clean registered worktree. | `ubp delegate run`. | May write only declared worktree roots and returns a validated receipt. |
| Maintainer | Install, diagnose, update, uninstall, validate, and package Ultra. | `ultra-builder-pro-cli` and repository scripts. | Managed files only; release effects remain separate. |

## User Scenarios

| ID | Trigger and flow | Observable outcome | Failure and recovery |
|---|---|---|---|
| S-01 | Maintainer installs one host or `--all --global`. | Native managed plugin/bundle contains fourteen Skills, five Hooks, provenance, and init assets. | Preflight or atomic publication fails without overwriting unmanaged files; Doctor reports repair. |
| S-02 | Owner selects `ultra-init` in a project. | Missing canonical files are copied, raw intake is preserved in the Project Brief, baseline skeletons stay empty, existing authority is preserved, and Git exists. | Partial initialization can rerun idempotently; unknown semantics remain Research inputs. |
| S-03 | Owner selects Research, then proceeds through change, plan, development, audit, and delivery. | Research establishes the accepted baseline; each later route updates only its owned artifact or touched baseline. By default it recommends and stops; a live Change-scoped grant may continue only to its next named boundary. Deliver archives only against a fresh Test snapshot. | `ultra-status` reconstructs position from semantic file contents and Git, not a workflow state bit; lost activation stops continuation. |
| S-04 | Host model encounters ambiguity, a seam, review need, or consequential decision. | It uses grilling, domain modeling, TDD, review, or think as an internal method. | If host routing metadata cannot enforce visibility, descriptions and docs state the limitation. |
| S-05 | Primary host delegates task execution, scoped Research evidence, or aggregate Change review to another CLI. | Terminal result binds the active Change, selected scope, inputs, actual Git changes, process state, and recovery; read-only Research/review needs no synthetic task. | Invalid scope, mutation, timeout, cancellation, or nonzero exit produces a typed terminal failure. |
| S-06 | A fresh session or another host resumes. | Resolving the unique active `change_id`, then reading only matching task contexts, Resume Note, canonical specs, evidence, and Git reconstructs work. | More than one active Change is diagnosed; archived or abandoned unfinished tasks remain historical. |
| S-07 | The owner completes or abandons one Change and later opens another. | Prior task/evidence rows remain intact while the new Change receives globally unique tasks bound to its own stable id. | Cross-Change dependencies are rejected; Git can restore any directory move. |
| S-08 | Owner activates a bounded execution grant for one accepted Change — session-local, or durable for an exact work package. | The native model-tool loop performs covered Research, Plan, Dev, Test, and reconcile-only Deliver work one canonical writer at a time, including mandatory reviews; a model-selected Deliver run stops before finalization. | Semantic stops, budgets, residual-risk acceptance, and every external effect return control to the owner; a lost conversation activation stops a session-local grant, a fresh Agent or host continues a durable grant only after exact durable verification, and neither mode grants finalization or archive. |

## North Star v2 Outcome Relations

| Scenario ID | Existing scenarios | North Star relation | Requirement anchors | Research evidence |
|---|---|---|---|---|
| `SCN-V027-01` | `S-03`, `S-06`, `S-08` | `NS-01`; `FP-1` through `FP-5`; `HC-1` through `HC-4`, `HC-6` | `FR-02`, `FR-04`, `FR-05`, `FR-08`, `FR-09`, `FR-10` | `.ultra/research/2026-08-15-v027-north-star/22-success-metrics.md#trace` |

## 20 Behavioral Requirements and Acceptance

### Requirement FR-01: Six native installation surfaces

All six supported hosts receive the same canonical Skills, Hooks, and initialization
asset through their native managed plugin or bundle layout. `--config-dir` contains all
host sidecars. Verification: isolated adapter lifecycle and package-smoke tests.

### Requirement FR-02: Explicit owner routes

The eight public workflows and `ultra-status` are owner-invocable. Init, Change,
Delegate, and Status are never implicitly selected. Research, Plan, Dev, Test, and
reconcile-only Deliver may be selected only when their resident entry guard verifies a
live Change-scoped execution grant — a current session-local activation or a stably verified durable work-package grant; otherwise they stop. Verification:
generated metadata, entry-guard, and role-boundary tests.

### Requirement FR-03: Model-owned disciplines

The five disciplines are available for model selection inside an authorized task and
have at least two canonical callers. They do not become standalone owner routes.
Verification: Skill reference graph and installed metadata tests.

### Requirement FR-04: File-first recovery

Canonical project meaning is recoverable from `.ultra/`, `CONTEXT.md`, source, and Git
without Hooks, Ultra CLI, MCP, a database, or a daemon. Verification: package boundary,
artifact audit, and resume contracts.

### Requirement FR-05: Narrow Hooks

Hooks are idle when `.ultra/` is absent. Context Hooks inject bounded canonical facts;
observation Hooks write only derived data; only named destructive effects can be denied,
with an exact authorization repair. Recoverable additive protected-branch publication
stays advisory when trusted host authority is not projected into the portable Hook;
history rewrites and branch deletion remain guarded. Verification: Python Hook suite.

### Requirement FR-06: Bounded delegation

Delegation uses immutable input digests, strict permission and result schemas, a clean
registered worktree, native host permission mode, observed Git changes, timeout,
cancellation, and atomic terminal receipt. Its instruction selects task execution,
scoped Research evidence, or aggregate Change review/verification; only the first
requires a task row. Verification: delegation and workflow-entry regression suites.

### Requirement FR-07: Honest host adaptation

Adapters translate paths, manifests, event wires, and invocation policy, never workflow
meaning. Unsupported local scope, routing bits, Hook trust, and native sandbox limits
remain observable. Verification: compatibility matrix and adapter tests.

### Requirement FR-08: Release evidence

Completion requires Skill validation, Codex plugin validation, isolated six-host
install/Doctor/uninstall, complete repository tests and audit, and exact tarball
inspection. Publishing, real HOME installation, provider calls, commit, and push are
separate effects.

### Requirement FR-09: Non-overlapping baseline maturation

Init writes only the raw Project Brief and empty canonical skeleton. Research may use an
optional derived Wayfinding brief, selects dependency-correct semantic lenses, and owns
the first accepted North Star, `CONTEXT.md`, and specification baseline. Change writes
one requested delta and reconciles only the baseline sections it touches. Verification:
Skill, template, documentation, session-context fallback, and artifact contract tests.

### Requirement FR-10: Sequential lifecycle continuity

At most one Change is active per worktree. Its stable `change_id` is stored in every
task; the append-only ledger preserves prior Changes, dependencies remain within one
Change, and current workflows/Hooks select only rows matching the active id. The v2
ledger is the sole mechanical task-status authority. Current contexts carry an exact
typed Acceptance table but no duplicate Status or Complexity header; a legacy header
is a migration observation and the ledger wins. A Test report binds exact current task
ids, ordered v2 task-evidence identities, `intent_digest`, HEAD, and product-worktree digest.
Deliver uses a reconcile pass and a fresh-snapshot finalization pass so delivery
metadata or archive movement cannot invalidate its own evidence. Verification:
sequential-Change contracts, Hook abandoned-task regression, artifact audit, and
delivery freshness regression.

Each current acceptance criterion declares `command`, `inspection`, `owner-judgment`,
or `external-observation` plus the evidence its authority requires. Structural
CLI validation establishes only JSON shape, token syntax, and authority designation; it
does not prove current identity, provenance, freshness, or semantic pass. Command and
external-observation evidence each carry a mechanically safe repository-relative
`raw_evidence_ref` plus the exact `raw_evidence_sha256`. Dev hashes one bounded stable,
repository-contained, ordinary regular non-symlink receipt snapshot before publishing
the record. Test, Status, and Deliver independently recheck that raw digest, then hash
the stable `evidence.json` bytes for the aggregate `evidence_digest`. The product-worktree
digest excludes `.ultra/evidence/**`, so publication is non-self-referential while those
two exact provenance bindings remain mandatory. Test takes
stable bytes independently, recomputes the Acceptance-section SHA-256, aligns exact
criterion IDs and verification types with the current context, and aligns the task-review session and summary digest with the retained strict summary. The task evidence `subject`
is an independently captured completion-snapshot freshness observation made after the
validated task Review and immediately before evidence publication. Its `task_review`
separately binds the retained strict summary; Worker Packet v1 and a summary whose
`worktree_digest` is null do not prove or cryptographically bind the completion subject.
Aggregate Test independently binds the current whole Change and rechecks the current
Acceptance, criterion IDs and verification types, owner record, review summary, and cited
affected artifacts without requiring an earlier task worktree digest to equal the
aggregate digest. For `owner-judgment`, Test requires the durable owner record to exist
and its cited statement and disposition to remain readable. Any mismatch is an evidence gap returned to Dev or, for missing owner judgment, to the owner. A task remains
`in_progress` until blocking findings have dispositions and the relevant evidence is
refreshed. Historical v1 evidence and legacy complexity remain readable but cannot
silently support a new v2 completion claim.

A separate request never creates a second active Change. It waits for delivery,
owner-authorized abandonment, or explicit reconciliation into the same stable id.
Planning leaves ordinary technical seam selection to the model and asks the owner only
when the choice changes a public contract, accepted risk, or another material trade-off.

Abandonment is an owner-authorized terminal move, not deletion. Before moving the
stable id to `changes/abandoned/`, Change appends exact `## Abandonment` fields for the
decision, reason, reusable evidence, and recovery or successor. Future Change
reconciliation and Status read that record as history; its unfinished tasks cannot
become the active frontier.

## Artifact Lifecycle

| Canonical artifact | Format | Primary writer | Required consumers | Freshness and recovery |
|---|---|---|---|---|
| `.ultra/project-brief.md` | Markdown raw one-line, outline, explicit inputs, and open Research questions | `ultra-init` and owner correction | research, status, pre-baseline session Hook | Owner correction or exact legacy migration; never rewrite it as researched truth |
| `.ultra/north-star.md` | `north-star-v2` Markdown with acceptance/revision, problem reality, `FP-*` definitions, causal chains, `NS-*` outcomes, `HC-*` constraints, exclusions, uncertainty, and Research trace | `ultra-research` after owner acceptance | strict SessionStart classifier and all workflows by stable IDs | Decision anchor plus content SHA-256, Git blob digest, and immutable accepted snapshot mismatch; preserve last accepted bytes and reconcile through Research |
| `.ultra/specs/*.md` | Markdown facts, decisions, unknowns, contracts, and trace tables | init creates empty skeleton; research establishes; change/delivery reconcile touched sections | change, plan, dev, test, review, delivery | Source/evidence conflict; explicit reconciliation |
| `CONTEXT.md` | Markdown term and relationship tables | `ultra-domain-modeling`, first called by Research | every workflow and test naming | Source use reveals ambiguity; new accepted wording |
| `.ultra/changes/{active,archive,abandoned}/<id>/intent.md` | Exact Change Contract Markdown with stable id, Research Disposition, North Star Trace, required Execution Grant (`session-local` by default), and exact Abandonment closure when abandoned | `ultra-change`; posture updated by `ultra-plan` | active: research through delivery; all states: status and future Change history | Duplicate/ambiguous active id, stale North Star revision, missing Abandonment closure, scope or acceptance change; reconcile before plan |
| `.ultra/tasks.json` | `ultra-task-ledger-v2` append-only JSON task graph with globally unique id, stable `change_id`, and sole task Status | `ultra-plan` creates rows; `ultra-dev` changes only ledger Status after review/evidence closure | every owner workflow and context Hook after active-id filtering | Cross-Change dependency or malformed row; repair the ledger and read back; legacy complexity is diagnostic only |
| `.ultra/contexts/task-<id>.md` | Markdown execution/resume contract with exact typed Acceptance table and no duplicate Status | `ultra-plan`; `ultra-dev` updates Resume, Completion, and Task Review without owning Status | dev, test, review, status, delivery, session resume | Acceptance-section hash or source drift; refresh evidence; legacy Status mismatch reports a migration diagnostic and ledger wins |
| `.ultra/evidence/<task-id>/evidence.json` | `ultra-task-evidence-v2` JSON with typed criterion evidence, exact raw receipt SHA-256 for command/external evidence, Acceptance-section SHA-256, an independent completion-snapshot subject observation, six dimensions, and separate strict task-review provenance | `ultra-dev` after model/owner disposition | test, review, status, delivery | Raw receipt, Acceptance, subject, or review drift or missing authority; refresh exact evidence; v1 remains classified historical compatibility |
| `.ultra/test-report.json` | `ultra-test-report-v2` JSON with ordered task-evidence projection plus aggregate review identity and verdict; retained v1 stays readable until the next aggregate Test | `ultra-test`; `ultra-deliver` may add owner disposition without changing findings or `passed` | status and delivery | Change id, task ids/evidence digests, `intent_digest`, HEAD, product-worktree digest, or review mismatch; rerun audit |
| `.ultra/changes/active/<id>/delivery.md` | Exact Delivery Contract Markdown | `ultra-deliver` | owner and archived Change history | Evidence or scope changes; reconcile before archive |
| `.ultra/decisions/<id>.md` | Markdown decision with supersession link | `ultra-think` after owner acceptance | all workflows in scope | New decision supersedes; never rewrite history |
| `.ultra/research/<run-id>/<step-id>.md` | Cited Markdown report | `ultra-research` | specs, change, plan, delivery | Newer evidence; superseding run and spec update |

`ultra-status` writes no semantic document. `ultra-delegate` writes only derived runtime
receipts and an isolated Git diff; the primary host decides whether to integrate it.
Review packets and Hook progress are disposable observations, not additional ledgers.
Retain the exact current strict v4 review session, especially `ADMISSION.json` and
`SUMMARY.json`, until Test and Deliver have both successfully consumed its bound packet,
admission, subject, and summary identities; garbage collection is allowed only after
both consumers succeed. V3 and pre-admission v4 sessions remain read-only historical
evidence and cannot back a current Test or Deliver claim. If a current receipt is lost
before both consumers finish, run a fresh Review and Test rather than reconstructing it.
The nested `.ultra/.gitignore` excludes `.runtime/`, `progress/`, and `reviews/` while
leaving every canonical artifact trackable.

## Capability and Scope Boundary

| Capability | Included | Excluded |
|---|---|---|
| Project workflow | Raw Project Brief, accepted baseline, bounded Change deltas, task contexts, evidence, review, delivery, recovery | General chat memory or product-management database |
| Host adaptation | Native paths, manifests, metadata, events, lifecycle | Lowest-common-denominator emulation of missing host features |
| Safety | Path, permission, schema, process, digest, exact effect and recovery facts | Semantic scoring or automated risk acceptance |
| Delegation | One bounded child CLI process and validated worktree result | Autonomous orchestration, external-effect authority, automatic integration |

## Release Evidence

The canonical current result is `.ultra/test-report.json`. A new v2 report must name the
active Change id, exact ordered current task ids and task-evidence identities, intent
digest, current HEAD, product-worktree digest, exact commands, all six audit areas,
omissions, residual risks, and owner disposition. The retained v1 report for the prior
Change remains byte-stable history until the next aggregate Test writes v2. A package or
provider effect is never inferred from either report.
Each v2 projection's `evidence_digest` covers the exact record that names every command
or external receipt's separately verified `raw_evidence_sha256`; evidence publication is
excluded from the product-worktree digest rather than made self-referential.

## Architecture Traceability

| Requirement | Architecture path | Verification |
|---|---|---|
| FR-01, FR-02, FR-03, FR-07 | `.ultra/specs/architecture.md#adaptation-and-routing` | adapter and role tests |
| FR-04 | `.ultra/specs/architecture.md#authority-and-recovery` | artifact audit and package boundary tests |
| FR-05 | `.ultra/specs/architecture.md#hook-boundary` | Hook tests |
| FR-06 | `.ultra/specs/architecture.md#delegation-boundary` | delegate tests |
| FR-08 | `.ultra/specs/architecture.md#verification-and-release` | validators, release gate, package dry run |
| FR-09 | `.ultra/specs/architecture.md#authority-and-recovery` | Init/Research/Change boundary and artifact contract tests |
| FR-10 | `.ultra/specs/architecture.md#authority-and-recovery` | sequential Change, Hook scope, report freshness, and artifact tests |
