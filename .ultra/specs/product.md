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

## Decisions

| Decision | Rationale | Acceptance impact | Owner |
|---|---|---|---|
| Use native Skills as the common product surface. | All five hosts discover Skills; custom-agent APIs and routing metadata differ. | Reusable methods must live in Skills or references. | Owner |
| Keep project truth in owner-readable files and Git. | Cross-session and cross-host recovery must not depend on Ultra runtime availability. | Every canonical artifact needs a writer, consumer, freshness signal, and repair. | Owner |
| Keep public workflows explicit and model disciplines implicit. | The owner selects outcomes; the model selects reusable reasoning inside authorized scope. | Adapters express native policy where supported and document limits where not. | Owner |
| Accept no external-effect authority through delegation. | A child CLI must not widen the parent's authority. | External effects remain blocked by contract and require a separate primary-host action. | Owner |

## Actors and Jobs

| Actor | Job | Entry point | Constraint |
|---|---|---|---|
| Owner | Select an outcome, confirm material trade-offs, accept risk, authorize external effects. | Native Skill picker or direct request. | Must not be replaced by model or mechanical routing. |
| Host model | Interpret intent, design, implement, evaluate evidence, and express results. | Selected owner workflow. | Operates inside owner authority and repository guidance. |
| Model discipline | Supply a focused reusable method such as TDD, review, or domain modeling. | Implicit selection by the host model inside an active task. | Is not a standalone owner route or authority holder. |
| Delegate CLI | Execute one immutable instruction in a clean registered worktree. | `ubp delegate run`. | May write only declared worktree roots and returns a validated receipt. |
| Maintainer | Install, diagnose, update, uninstall, validate, and package Ultra. | `ultra-builder-pro-cli` and repository scripts. | Managed files only; release effects remain separate. |

## User Scenarios

| ID | Trigger and flow | Observable outcome | Failure and recovery |
|---|---|---|---|
| S-01 | Maintainer installs one host or `--all --global`. | Native managed plugin/bundle contains fourteen Skills, five Hooks, provenance, and init assets. | Preflight or atomic publication fails without overwriting unmanaged files; Doctor reports repair. |
| S-02 | Owner selects `ultra-init` in a project. | Missing canonical files are copied, intent is captured, existing authority is preserved, and Git exists. | Partial initialization can rerun idempotently; unknown semantics stay explicit. |
| S-03 | Owner proceeds through change, plan, development, audit, and delivery. | Each route updates its canonical artifact and recommends, but does not launch, the next route. | `ultra-status` reconstructs position from files and Git. |
| S-04 | Host model encounters ambiguity, a seam, review need, or consequential decision. | It uses grilling, domain modeling, TDD, review, or think as an internal method. | If host routing metadata cannot enforce visibility, descriptions and docs state the limitation. |
| S-05 | Primary host delegates bounded implementation to another CLI. | Terminal result binds inputs, actual Git changes, process state, and recovery. | Invalid scope, mutation, timeout, cancellation, or nonzero exit produces a typed terminal failure. |
| S-06 | A fresh session or another host resumes. | Reading task context, Resume Note, canonical specs, active Change, evidence, and Git reconstructs work. | Derived snapshots may be deleted and rebuilt. |

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
with an exact authorization repair. Verification: Python Hook suite.

### Requirement FR-06: Bounded delegation

Delegation uses immutable input digests, strict permission and result schemas, a clean
registered worktree, native host permission mode, observed Git changes, timeout,
cancellation, and atomic terminal receipt. Verification: delegation regression suite.

### Requirement FR-07: Honest host adaptation

Adapters translate paths, manifests, event wires, and invocation policy, never workflow
meaning. Unsupported local scope, routing bits, Hook trust, and native sandbox limits
remain observable. Verification: compatibility matrix and adapter tests.

### Requirement FR-08: Release evidence

Completion requires Skill validation, Codex plugin validation, isolated five-host
install/Doctor/uninstall, complete repository tests and audit, and exact tarball
inspection. Publishing, real HOME installation, provider calls, commit, and push are
separate effects.

## Artifact Lifecycle

| Canonical artifact | Format | Primary writer | Required consumers | Freshness and recovery |
|---|---|---|---|---|
| `.ultra/north-star.md` | Markdown, exact `One-line` and `Hard Constraints` headings | `ultra-init` and owner | session Hook and all workflows | Owner correction; Git restore |
| `.ultra/specs/*.md` | Markdown facts, decisions, unknowns, contracts, and trace tables | init skeleton; research/change/delivery reconciliation | change, plan, dev, test, review, delivery | Source/evidence conflict; explicit reconciliation |
| `CONTEXT.md` | Markdown term and relationship tables | `ultra-domain-modeling` | every workflow and test naming | Source use reveals ambiguity; new accepted wording |
| `.ultra/changes/active/<id>/intent.md` | Exact Change Contract Markdown | `ultra-change`; posture updated by `ultra-plan` | plan, dev, test, review, status, delivery | Scope or acceptance change; reconcile before plan |
| `.ultra/tasks.json` | JSON task graph | `ultra-plan` and `ultra-dev` | every owner workflow and context Hooks | Context status mismatch; repair both and read back |
| `.ultra/contexts/task-<id>.md` | Markdown execution and resume contract | `ultra-plan` and `ultra-dev` | dev, test, review, status, delivery, session resume | Ledger mismatch or source drift; explicit Resume Note |
| `.ultra/evidence/<task-id>/evidence.json` | `ultra-task-evidence-v1` JSON plus cited logs | `ultra-dev` | test, review, delivery | Git or command mismatch; rerun evidence |
| `.ultra/test-report.json` | `ultra-test-report-v1` JSON | `ultra-test` | status and delivery | HEAD/worktree digest mismatch; rerun audit |
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
| Project workflow | Intent, specs, task contexts, evidence, review, delivery, recovery | General chat memory or product-management database |
| Host adaptation | Native paths, manifests, metadata, events, lifecycle | Lowest-common-denominator emulation of missing host features |
| Safety | Path, permission, schema, process, digest, exact effect and recovery facts | Semantic scoring or automated risk acceptance |
| Delegation | One bounded child CLI process and validated worktree result | Autonomous orchestration, external-effect authority, automatic integration |

## Release Evidence

The canonical current result is `.ultra/test-report.json`. It must name the current
HEAD, worktree digest, exact commands, all six audit areas, omissions, residual risks,
and owner disposition. A package or provider effect is never inferred from that report.

## Architecture Traceability

| Requirement | Architecture path | Verification |
|---|---|---|
| FR-01, FR-02, FR-03, FR-07 | `.ultra/specs/architecture.md#adaptation-and-routing` | adapter and role tests |
| FR-04 | `.ultra/specs/architecture.md#authority-and-recovery` | artifact audit and package boundary tests |
| FR-05 | `.ultra/specs/architecture.md#hook-boundary` | Hook tests |
| FR-06 | `.ultra/specs/architecture.md#delegation-boundary` | delegate tests |
| FR-08 | `.ultra/specs/architecture.md#verification-and-release` | validators, release gate, package dry run |
