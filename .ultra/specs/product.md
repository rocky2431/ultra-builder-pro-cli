# Product Specification

## Scope

- **Product**: Ultra Builder Pro v0.26, a file-first engineering workflow plugin for
  Claude Code, Codex, OpenCode, Kimi Code, and Grok Build.
- **Outcome**: one portable fourteen-Skill workflow, five optional Hooks, one bounded
  cross-CLI delegate, and one canonical project artifact lifecycle.
- **Non-goals**: general memory, browsing, deployment, code-graph storage, a semantic
  supervisor, or uniform emulation of host capabilities.

## Observed

| Current fact | Evidence | Product impact |
|---|---|---|
| The package allowlist contains eight owner workflows, five model disciplines, and one router. | `adapters/_shared/runtime-assets.cjs` | The installed product is exactly fourteen Skills. |
| Each adapter installs the common Skill and Hook allowlists into a native managed surface. | `adapters/*.js`, `tests/v026-adapters.test.cjs` | Five hosts consume the same workflow meaning. |
| The accepted v0.26 checkout contains no MCP server, runtime database, orchestration daemon, commands, or installed agents. | `tests/v026-contract.test.cjs` | Files and Git are sufficient for recovery. |
| Kimi and Grok expose user-scoped plugin installation; OpenCode lacks a native owner/model Skill routing bit; Codex requires separate Hook trust. | `docs/RUNTIME-COMPAT-MATRIX.md` | Limitations remain explicit rather than being hidden behind a semantic shim. |
| Init previously mixed raw owner intake with North Star and baseline semantics. | pre-change `skills/ultra-init/SKILL.md`, `.ultra-template/north-star.md`, and owner review on 2026-08-03 | Init, Research, and Change need separate writer boundaries. |

## Decisions

| Decision | Rationale | Acceptance impact | Owner |
|---|---|---|---|
| Use native Skills as the common product surface. | All five hosts discover Skills; custom-agent APIs and routing metadata differ. | Reusable methods must live in Skills or references. | Owner |
| Keep project truth in owner-readable files and Git. | Cross-session and cross-host recovery must not depend on Ultra runtime availability. | Every canonical artifact needs a writer, consumer, freshness signal, and repair. | Owner |
| Keep public workflows explicit and model disciplines implicit. | The owner selects outcomes; the model selects reusable reasoning inside authorized scope. | Adapters express native policy where supported and document limits where not. | Owner |
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
| S-03 | Owner selects Research, then proceeds through change, plan, development, audit, and delivery. | Research establishes the accepted baseline; each later route updates only its owned artifact or touched baseline and recommends, but does not launch, the next route. Deliver reconciles first and archives only against a fresh Test snapshot. | `ultra-status` reconstructs position from semantic file contents and Git, not a workflow state bit. |
| S-04 | Host model encounters ambiguity, a seam, review need, or consequential decision. | It uses grilling, domain modeling, TDD, review, or think as an internal method. | If host routing metadata cannot enforce visibility, descriptions and docs state the limitation. |
| S-05 | Primary host delegates task execution, scoped Research evidence, or aggregate Change review to another CLI. | Terminal result binds the active Change, selected scope, inputs, actual Git changes, process state, and recovery; read-only Research/review needs no synthetic task. | Invalid scope, mutation, timeout, cancellation, or nonzero exit produces a typed terminal failure. |
| S-06 | A fresh session or another host resumes. | Resolving the unique active `change_id`, then reading only matching task contexts, Resume Note, canonical specs, evidence, and Git reconstructs work. | More than one active Change is diagnosed; archived or abandoned unfinished tasks remain historical. |
| S-07 | The owner completes or abandons one Change and later opens another. | Prior task/evidence rows remain intact while the new Change receives globally unique tasks bound to its own stable id. | Cross-Change dependencies are rejected; Git can restore any directory move. |

## 20 Behavioral Requirements and Acceptance

### Requirement FR-01: Five native installation surfaces

All five supported hosts receive the same canonical Skills, Hooks, and initialization
asset through their native managed plugin or bundle layout. `--config-dir` contains all
host sidecars. Verification: isolated adapter lifecycle and package-smoke tests.

### Requirement FR-02: Explicit owner routes

The eight public workflows and `ultra-status` are owner-invocable and not implicitly
selected where the host supports that policy. A public workflow only recommends the
next route. Verification: generated metadata and role-boundary tests.

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

Completion requires Skill validation, Codex plugin validation, isolated five-host
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
Change, and current workflows/Hooks select only rows matching the active id. A Test
report binds exact current task ids, `intent_digest`, HEAD, and product-worktree digest.
Deliver uses a reconcile pass and a fresh-snapshot finalization pass so delivery
metadata or archive movement cannot invalidate its own evidence. Verification:
sequential-Change contracts, Hook abandoned-task regression, artifact audit, and
delivery freshness regression.

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
| `.ultra/north-star.md` | Markdown Project Direction, North Star Outcome, Hard Constraints, exclusions, and Research trace | `ultra-research` after owner acceptance | session Hook and all workflows | Accepted correction or evidence conflict; Git restore |
| `.ultra/specs/*.md` | Markdown facts, decisions, unknowns, contracts, and trace tables | init creates empty skeleton; research establishes; change/delivery reconcile touched sections | change, plan, dev, test, review, delivery | Source/evidence conflict; explicit reconciliation |
| `CONTEXT.md` | Markdown term and relationship tables | `ultra-domain-modeling`, first called by Research | every workflow and test naming | Source use reveals ambiguity; new accepted wording |
| `.ultra/changes/{active,archive,abandoned}/<id>/intent.md` | Exact Change Contract Markdown with stable id, Research Disposition, and exact Abandonment closure when abandoned | `ultra-change`; posture updated by `ultra-plan` | active: research through delivery; all states: status and future Change history | Duplicate/ambiguous active id, missing Abandonment closure, scope or acceptance change; reconcile before plan |
| `.ultra/tasks.json` | Append-only JSON task graph with globally unique id and stable `change_id` | `ultra-plan` and `ultra-dev` | every owner workflow and context Hooks after active-id filtering | Cross-Change dependency or context status mismatch; repair and read back |
| `.ultra/contexts/task-<id>.md` | Markdown execution and resume contract | `ultra-plan` and `ultra-dev` | dev, test, review, status, delivery, session resume | Ledger mismatch or source drift; explicit Resume Note |
| `.ultra/evidence/<task-id>/evidence.json` | `ultra-task-evidence-v1` JSON plus cited logs | `ultra-dev` | test, review, delivery | Git or command mismatch; rerun evidence |
| `.ultra/test-report.json` | `ultra-test-report-v1` JSON | `ultra-test`; `ultra-deliver` may add owner disposition without changing findings or `passed` | status and delivery | Change id, task ids, `intent_digest`, HEAD, or product-worktree digest mismatch; rerun audit |
| `.ultra/changes/active/<id>/delivery.md` | Exact Delivery Contract Markdown | `ultra-deliver` | owner and archived Change history | Evidence or scope changes; reconcile before archive |
| `.ultra/decisions/<id>.md` | Markdown decision with supersession link | `ultra-think` after owner acceptance | all workflows in scope | New decision supersedes; never rewrite history |
| `.ultra/research/<run-id>/<step-id>.md` | Cited Markdown report | `ultra-research` | specs, change, plan, delivery | Newer evidence; superseding run and spec update |

`ultra-status` writes no semantic document. `ultra-delegate` writes only derived runtime
receipts and an isolated Git diff; the primary host decides whether to integrate it.
Review packets and Hook progress are disposable observations, not additional ledgers.
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

The canonical current result is `.ultra/test-report.json`. It must name the active
Change id, exact current task ids, intent digest, current HEAD, product-worktree digest,
exact commands, all six audit areas, omissions, residual risks, and owner disposition.
A package or provider effect is never inferred from that report.

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
