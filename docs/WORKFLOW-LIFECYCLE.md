# Ultra Builder Pro workflow lifecycle

Skills define checkable entry and exit criteria; repository files record facts;
the host model chooses the route. A clear, bounded fix can stay ordinary work.
The lifecycle below applies when the request needs project-level coordination;
it is not a mandatory sequence for every task. For examples and commands, see
the [usage guide](USAGE.md).

## Capability flow

```text
ultra-init/create|recover ──raw Project Brief──► ultra-research/baseline
                                                       │
                                                       ▼
                                               ultra-change/intake
                                                       │
                   ┌── ultra-research/change-scoped ◄──┤ evidence-needed
                   └── ultra-change/reconcile ─────────┘
                                                       │ accepted
                                                       ▼

ultra-change ─► ultra-plan ─► ultra-dev (per task) ─► ultra-test ─► ultra-deliver
                     ▲                 │                    │
                     └── replan ◄──────┘                    └── findings return to owner/model

ultra-status    read-only router at any point
ultra-delegate  orthogonal bounded execution on another Agent runtime via ACP-first transport and typed CLI fallback
```

Arrows are recommendations unless a live owner-activated Execution Grant authorizes the
exact next mode. Public modes are either `explicit-entry`, `grant-continuable`, or
read-only `router`; model-only methods are `model-discipline`. Scoped Research,
same-Change reconciliation, Plan, Dev, Test, and Deliver reconciliation may continue
only when the grant covers the same `change_id`, mode, effects, and stop conditions.
Init, Change intake/evidence/acceptance/abandonment/primary transfer, Delegate, Deliver
finalization, archive, and every external effect remain explicit-entry. Status remains
owner-invoked, read-only, and supplies no continuation authority. Delivery archives one stable
`change_id`; the next request opens a new active id while prior task rows remain in the
append-only ledger.

## Topology and checkpoints

The owner chooses the Agent topology at every stage: one Agent or several, which
providers, which write scopes, serial or parallel. The unspecified default is the
current Agent continuing alone — no automatic spawning, delegation, or control-plane
enablement, and no provider permanently bound to a role. One primary writer owns the
canonical `.ultra` files in a worktree; parallel source writes use isolated worktrees
with explicit integration. Moving the primary-writer role itself to another Agent is
an owner-granted primary transfer — OFFER, verified ACK, sole-writer execution,
frozen terminal RESULT — and never a widened delegation
(`skills/ultra-change/references/primary-transfer.md`).

Every owner-facing checkpoint — a WIP at a stop, a closing Resume Note, a delivery
report — carries the eight fixed semantics defined in
[artifact authority](ARTIFACT-AUTHORITY.md#owner-checkpoint-semantics): why, outcome,
accepted boundary, delta, reality, decision needed, next bounded action, and not-done.
The shared [Route Contract](../skills/ultra-status/references/route-contract.md) adds
Route, Mode, Position, and Exit condition as navigation around those semantics. Every
public Skill shows the card at entry, a material checkpoint, pause/blocked exit, normal
exit, and before a public transition. Cards are derived observations, not stage markers,
permission, or persisted route state; alignment failure stops work until the owner
re-accepts an outcome.

## Common mode-aware entry contract

Every user-invoked Skill reads, in order:

1. zero or one `.ultra/changes/active/<change_id>/intent.md`; more than one is a conflict;
2. `.ultra/tasks.json`, selecting only tasks whose `change_id` matches that active id
   and treating its v2 row as the sole task-status authority;
3. the matching frontier task's `context_file` and closing `## Resume Note`;
4. `.ultra/project-brief.md`, the accepted `.ultra/north-star.md`, `CONTEXT.md`, and
   relevant `.ultra/decisions/`, where those artifacts already exist;
5. the active Change, specifications, evidence, maintained documentation, and Git state
   relevant to its scope.

Missing files produce a precise recovery or initialization recommendation. They do not
cause the Skill to invent a state transition.

After reading these facts, the Skill chooses only one mode declared in its own Route
table and emits the entry Route Card. If model-selected, it revalidates that this mode is
grant-continuable and that the grant covers the same Change and effects. Host metadata
is only coarse discovery; it never substitutes for this runtime check.

## Initialization

Init writes the raw Project Brief and stable empty skeleton. `ultra-init` preserves the
owner's one-line request, broad outline, explicit inputs, and open questions without
turning them into validated product truth. It initializes Git when absent and may
preserve repository-observable brownfield facts as Research inputs. It does not define
success, establish the North Star, create `CONTEXT.md`, populate specifications, or
launch another workflow.

## Research

Research has two modes. `baseline` explicitly turns the brief into an accepted North
Star and evidence-backed baseline. `change-scoped` answers only one active Change's
recorded Research Disposition and returns named evidence to that same Change for
reconciliation. `ultra-research` uses Wayfinding only when a multi-lens path is unclear,
then records entry question, selected lenses, omissions, dependencies, source plan,
material checkpoints, observable stop condition, and return route before mapping the
question to the smallest useful subset of seventeen focused references. The first six
are semantic lenses with real dependencies: `00` precedes `01`; conditional `02` and
`03` may fan out after the boundary is known; `04` consumes their relevant conclusions
and is the first owner checkpoint; `05` extracts assumptions from `00` through `04`.
Grilling controls how missing owner inputs are asked, Think tests one consequential
decision, and Domain Modeling writes settled vocabulary; none owns the Research route.
The baseline synthesis promotes accepted conclusions into the North Star, `CONTEXT.md`,
three specifications, and a source-hash-bound distillate. A change-scoped run updates
only its mapped sections and never changes Change acceptance on its own. Lens counts are
navigation facts, not semantic progress or a completion signal.

## Change reconciliation

Change updates only the touched baseline rather than rebuilding it. Its visible modes
are `intake`, `evidence-needed`, `reconcile`, and `accepted`. `ultra-change` first
compares requested behavior with accepted product truth and current code. It classifies
changes by the resulting commitments:

- expansion and correction may proceed inside accepted intent;
- a reduction waits for explicit owner authority.

The output is one active Change intent with observable outcome, acceptance, seams,
non-goals, trace anchors, and an explicit Research Disposition. `none` cites sufficient
existing evidence; `bounded` or `required` names the exact question, lenses, and exit
evidence. Unsatisfied exit evidence routes to Research, then back through Change
reconciliation before planning when the accepted contract needs an update.

Draft intent is mutable. Revising a consequential accepted answer creates a superseding
decision record so Status can reconstruct history without treating an event log as
authority. Only same-Change, non-material `reconcile` may continue under a valid grant;
opening or accepting a boundary, abandoning it, reducing a commitment, or changing the
canonical writer is an explicit owner checkpoint.

If the owner rejects the offered options as inadequate, Change preserves that answer,
keeps the draft unresolved, and returns to evidence or materially different options. It
never selects the closest rejected option or advances to Plan by default.

A micro edit that makes no specification sentence false stays outside the Ultra
lifecycle and uses ordinary repository TDD/verification. Once an active Change exists,
Plan creates the smallest graph justified by the real seams, evidence, review, and
recovery needs so delivery remains bound to its id; a profile never fixes task count. A
separate request cannot open a second active Change: finish or deliver the current one,
abandon it with owner authority, or explicitly reconcile the new request into the same
stable id.

## Planning

`ultra-plan` confirms a material scope posture and records public seams, then appends a
current-Change task graph and one context file per task without deleting historical
rows. The model chooses ordinary technical seams; the owner is asked only when a seam
changes a public contract, accepted risk, or another material trade-off. Every task
stores the stable `change_id`; dependencies stay inside that Change and ids remain
globally unique. Feature tasks are tracer bullets. A contract task precedes dependent
implementations when a shared contract must remain valid across independently changed
boundaries; integration checkpoints appear where slices first compose or observed
coupling and recovery risk justify a whole-path check. Cycles and broken trace paths are
repaired before handoff. Complexity, file, task, line, and context counts are
observations rather than plan-quality gates.

Plan names the earliest executable tracer bullet's real consumer, real data path, and
owner-visible observation. A product or contract evidence gap returns to
`ultra-change/reconcile`; Change decides whether bounded Research is required. Ordinary
technical uncertainty remains model-owned or becomes a bounded spike/tracer task, so
Plan never bypasses Change by opening product Research directly.

## Task development

`ultra-dev` writes the implementation plan into the task context before code. It uses
`ultra-tdd` on confirmed seams and records `ultra-task-evidence-v2`: typed acceptance,
six evidence dimensions, subject/context identity, limitations, and task-review
provenance. `.ultra/tasks.json` is the sole task-status authority; a new context has no
Status field, while legacy Status/Complexity values are migration diagnostics and the
ledger wins. The closing Resume Note is rewritten even when work stops early.
Before publishing that record, Dev hashes bounded stable repository-contained bytes for
every command or external `raw_evidence_ref` into `raw_evidence_sha256` and reads both
the raw receipt and written record back. Structural validation checks ref/digest shape
without dereferencing the receipt.

Task review selects lenses by risk and touched seams while the ledger row remains `in_progress`.
Its first admission binds the ledger, task context, immutable packet scope, and actual
pre-review evidence. It does not require a final v2 record or claim a task worktree
digest that Worker Packet v1 does not carry.
Findings move through stable JSON artifacts, not intermediate worker chatter. Verdicts
are terminal for the current subject: `APPROVE` ends the task review even when P2/P3
findings are retained — they become report entries or owner-selected backlog, never a
fresh review of the same subject. `REQUEST_CHANGES` routes only the exact current
P0/P1 findings as one in-scope repair set followed by one affected-lens delta review
per repair set inside the active review budget — an exact current owner grant
overrides the versioned product default of one initial review plus at most two
P0/P1 delta reviews per package; a `REQUEST_CHANGES` that would exceed the active
budget is an owner checkpoint, not another automatic repair, and the same root
surviving three failed fixes stops point-patching and reports an architecture
problem. Lens selection follows the review kind, never a fixed count: an initial task
review selects `review-spec` plus the lenses justified by risk and touched seams, a
delta review reruns only the affected lenses, and an aggregate Change review may
default to all six only when cross-task wiring justifies it. Budget exhaustion keeps the row `in_progress` and returns
`owner checkpoint` / `budget_exhausted` without any semantic verdict.
After the final summary validates, Dev independently captures the `subject`
as a completion-snapshot freshness observation and immediately writes the one canonical
v2 record; its `task_review` separately binds the retained strict summary, which does not
prove the subject worktree digest. Only then may the primary model write `completed` to
the ledger. Refactoring happens
when evidence makes real duplication, coupling, or a boundary defect visible, never
because a slice, finding, file, or repair-round count crossed a threshold.

If later work invalidates completed evidence, Dev records the affected criterion IDs and reason in the context Change Log and Resume Note before changing the
ledger-authoritative row from `completed` to `in_progress`; there is no silent demotion.
The old frozen review remains historical evidence while the reopened task refreshes the
affected observations, obtains a new final review, and captures a new completion subject.

## Whole-system audit

`ultra-test` runs once after tasks for the active Change are completed in the ledger
with current v2 evidence and retained task-review provenance. Historical v1 evidence is
a migration diagnostic, not current Test input. It checks anti-patterns, coverage,
wiring, E2E behavior, performance, and security. It names the exact Git commit and
binds the report to `change_id`, exact current task ids, intent SHA-256, and the
product-worktree digest for the current whole Change. Each task evidence subject remains
its independently captured completion-snapshot freshness observation rather than being
rebound to this aggregate identity. Test independently rechecks current Acceptance bytes,
criterion IDs and verification types, retained task-review summary, durable owner record,
and cited affected artifacts. For command and external evidence it independently takes
the bounded stable non-symlink raw bytes, recomputes `raw_evidence_sha256`, then recomputes
the containing record's `evidence_digest`. `.ultra/evidence/**` is excluded from the
product-worktree digest, so these separate exact bindings prevent a self-referential
receipt. An invalidated task returns to the explicit Dev reopen
path. `passed: true` implies complete current tasks and no required
area left `not_run`; task completion does not force a pass, and dispositioned gaps stay
visible. It never turns an orphan,
failed command, stub, or omission into permission to alter scope.

## Delivery

`ultra-deliver` uses two observable passes. The first reconciles actual outcome,
specifications, documentation, aggregate review, omissions, and rollback; if semantic
or product files change, it stops and recommends a fresh Test. The second begins only
when report Change/task/intent/HEAD/product identities match, applies the changed-export
gate, runs build and non-publishing package inspection, records version impact, writes
delivery metadata, and archives the same stable id with `git mv`. Delivery metadata and
the directory move do not invalidate their own product snapshot. Producing a release
package remains blocked while a changed export has neither a non-test consumer nor an
owner disposition. That disposition is recorded against the finding in the current
test report without changing the finding or `passed`, then carried into `delivery.md`.

Commit, push, tag, publication, release, and deployment are independent external
effects. Readiness grants none automatically.

## Status routing

`ultra-status` infers the smallest next route from observable files:

- no healthy skeleton or usable raw brief → init;
- raw brief without an accepted baseline → baseline research;
- requested outcome without active Change → change;
- draft or blocking active intent → change;
- unsatisfied Research Disposition → change-scoped research, then the same Change reconciliation;
- active Change without matching executable tasks → plan;
- the unique matching `in_progress` task → dev;
- only `pending` tasks remaining → report them as frontier candidates and recommend
  one exact task id for an explicit owner invocation of dev;
- a completed ledger row with missing, stale, or invalid v2 evidence/task review → dev
  to record affected criteria and reason, explicitly reopen, and repair provenance;
- completed current-Change tasks with current v2 evidence and no matching fresh report → test;
- false report → route by finding and owner disposition, not by the boolean alone;
- fresh, dispositioned report and unarchived Change → deliver.

It also checks installation provenance, unresolved markers, broken resume paths, and
report freshness by root Change identity, exact ordered v2 task-evidence/review
identities, and strict aggregate Review packet/admission/subject/summary bindings. It
replays the existing structural validators; they observe transport and freshness but
never decide semantic acceptance. Age, complexity, and file/task counts may be reported
as context but never decide staleness or quality. It does not mutate artifacts.

Status outputs the Route Card by default and expands `history`, `installation`,
`delegation`, or `recovery` on request. An ambiguous or malformed active authority stops
semantic routing and writes, but not diagnosis: recovery mode reports the typed fact,
safe Git/directory observations, and the cheapest repair/retry/cancel/abandon path
without selecting an ambiguous intent as truth.

## Delegation

`ultra-delegate` is orthogonal to the lifecycle and requires explicit owner authority.
Its immutable instruction selects task execution/continuation, scoped Research evidence,
or aggregate Change review/verification. Task execution reads one matching task context;
the latter two may be read-only and do not require a task, so both pre-Plan evidence and
post-task review remain reachable. Every scope still binds the one active `change_id`, a
clean isolated worktree, strict permission/result schemas, and primary-host inspection.
The worker cannot write canonical `.ultra` files or perform external effects.
Delegation itself is explicit-entry. Tool calls, plans, usage, permissions, process
output, ACP updates, and terminal transport state remain execution observations; only
the primary writer interprets the validated result against Research, task, review, or
Test acceptance and selects the semantic route.

## Artifact closure

Every durable output has a later reader:

- init's Project Brief is consumed by Research, Status, and the pre-baseline session
  Hook fallback; its empty skeleton supplies stable paths rather than product claims;
- Research's accepted North Star and domain/specification baseline are read by every
  later workflow, while selected reports trace into Change reconciliation, planning,
  and delivery;
- active Change intent and its touched specification deltas are consumed through
  planning, development, audit, review, status, and delivery; an abandoned intent has
  an exact `## Abandonment` closure consumed by future Change reconciliation and Status;
- the append-only task ledger and contexts are the common resume input after filtering
  by active `change_id`, while typed v2 task evidence and retained task-review
  provenance feed review, whole-system audit, and delivery;
- the current test report is consumed by status and delivery;
- delivery moves with the Change into archive and remains historical evidence.

`ultra-status` intentionally writes nothing. Review, Hook, compact, and delegation
files are derived observations rather than semantic authority. A current strict review
session contains `WORKER-PACKET.json`, `ADMISSION.json`, every selected specialist
artifact, and `SUMMARY.json`; retain it until aggregate Test and Deliver have both consumed it
successfully, then it may be garbage-collected. Premature loss requires a fresh Review
and Test; never reconstruct the old receipt. Other derived observations keep their
explicit rebuild or rerun paths. No route creates an unowned drift log, parallel planning file,
technical-debt report, or second delivery summary.

## Interruption and cross-host continuation

There is one primary writer for canonical `.ultra` files. Review workers are read-only;
delegated source edits use isolated worktrees and return results for explicit
integration. Parallel canonical writes are unsupported because silently merging intent,
task, evidence, or report authority would lose meaning.

Before stopping, the active task context records current facts, exact verification,
open questions, Completion, and a closing Resume Note. The next session or host repeats
the common entry contract, compares the working tree with those claims, and derives a
fresh Route Card. It does not rerun completed Research merely because conversation
memory is gone. When context pressure threatens a reliable continuation, the current
Agent finishes the nearest safe write, refreshes the Resume Note, shows a stop card, and
recommends a fresh session; context size does not become route authority.

This path remains valid when hooks and `ubp` are disabled. A compact snapshot may be
used as a hint, then checked against canonical files and Git.

Continuing on a different Agent — not merely a different host — additionally
requires a primary transfer: an exact owner grant, a derived OFFER binding the
canonical refs, HEAD, and worktree digest, the receiver's stable-read ACK, and a
frozen terminal RESULT (`skills/ultra-change/references/primary-transfer.md`).
Receipts are derived state; when they are lost, the owner confirms and a fresh
handoff id is issued rather than reconstructing an old ACK. The post-review
task closeout never refreshes that RESULT or opens a handoff for itself: beside
a newest completed v2 RESULT it publishes the handoff's CLOSEOUT receipt — the
one prescribed, uncommitted, review-and-handoff-free closeout transition of the
same contract.

An authenticated Claude-to-Codex continuation using this path passed on 2026-08-03;
the exact scope, provenance, results, and limitations are recorded in the
[runtime compatibility matrix](RUNTIME-COMPAT-MATRIX.md#authenticated-cross-host-continuation-evidence).
