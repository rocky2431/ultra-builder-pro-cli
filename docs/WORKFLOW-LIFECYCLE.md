# Ultra Builder Pro workflow lifecycle

Ultra v0.26 has no fixed runtime state machine. Skills define checkable entry and exit
criteria; repository files record facts; the host model chooses the route.

## Capability flow

```text
ultra-init ──raw Project Brief──► ultra-research ──accepted baseline──► ultra-change
                                      ▲                                  │
                                      └──── scoped consequential evidence gap ────┘

ultra-change ─► ultra-plan ─► ultra-dev (per task) ─► ultra-test ─► ultra-deliver
                     ▲                 │                    │
                     └── replan ◄──────┘                    └── findings return to owner/model

ultra-status    read-only router at any point
ultra-delegate  orthogonal bounded execution on another CLI
```

Arrows are recommendations, not automatic invocation. The owner explicitly selects
each public workflow. Delivery archives one stable `change_id`; the next request opens
a new active id while prior task rows remain in the append-only ledger.

## Common entry contract

Every user-invoked Skill reads, in order:

1. zero or one `.ultra/changes/active/<change_id>/intent.md`; more than one is a conflict;
2. `.ultra/tasks.json`, selecting only tasks whose `change_id` matches that active id;
3. the matching frontier task's `context_file` and closing `## Resume Note`;
4. `.ultra/project-brief.md`, the accepted `.ultra/north-star.md`, `CONTEXT.md`, and
   relevant `.ultra/decisions/`, where those artifacts already exist;
5. the active Change, specifications, evidence, maintained documentation, and Git state
   relevant to its scope.

Missing files produce a precise recovery or initialization recommendation. They do not
cause the Skill to invent a state transition.

## Initialization

Init writes the raw Project Brief and stable empty skeleton. `ultra-init` preserves the
owner's one-line request, broad outline, explicit inputs, and open questions without
turning them into validated product truth. It initializes Git when absent and may
preserve repository-observable brownfield facts as Research inputs. It does not define
success, establish the North Star, create `CONTEXT.md`, populate specifications, or
launch another workflow.

## Research

Research turns the brief into an accepted North Star and evidence-backed baseline.
`ultra-research` uses Wayfinding only when a multi-lens path is unclear, then maps the
question to the smallest useful subset of seventeen focused references. The first six
are semantic lenses with real dependencies: `00` precedes `01`; conditional `02` and
`03` may fan out after the boundary is known; `04` consumes their relevant conclusions
and is the first owner checkpoint; `05` extracts assumptions from `00` through `04`.
Grilling controls how missing owner inputs are asked, Think tests one consequential
decision, and Domain Modeling writes settled vocabulary; none owns the Research route.
The final synthesis promotes accepted conclusions into the North Star, `CONTEXT.md`,
three specifications, and a source-hash-bound distillate.

## Change reconciliation

Change updates only the touched baseline rather than rebuilding it. `ultra-change`
first compares requested behavior with accepted product truth and current code. It
classifies changes by the resulting commitments:

- expansion and correction may proceed inside accepted intent;
- a reduction waits for explicit owner authority.

The output is one active Change intent with observable outcome, acceptance, seams,
non-goals, trace anchors, and an explicit Research Disposition. `none` cites sufficient
existing evidence; `bounded` or `required` names the exact question, lenses, and exit
evidence. Unsatisfied exit evidence routes to Research, then back through Change
reconciliation before planning when the accepted contract needs an update.

A micro edit that makes no specification sentence false stays outside the Ultra
lifecycle and uses ordinary repository TDD/verification. Once an active Change exists,
even a `quick` profile receives one minimal Plan task so evidence and delivery remain
bound to its id. A separate request cannot open a second active Change: finish or
deliver the current one, abandon it with owner authority, or explicitly reconcile the
new request into the same stable id.

## Planning

`ultra-plan` confirms a material scope posture and records public seams, then appends a
current-Change task graph and one context file per task without deleting historical
rows. The model chooses ordinary technical seams; the owner is asked only when a seam
changes a public contract, accepted risk, or another material trade-off. Every task
stores the stable `change_id`; dependencies stay inside that Change and ids remain
globally unique. Feature tasks are tracer bullets. A contract task precedes cross-process
or cross-top-level-boundary implementations; integration checkpoints appear after
several slices. Cycles and broken trace paths are repaired before handoff.

## Task development

`ultra-dev` writes the implementation plan into the task context before code. It uses
`ultra-tdd` on confirmed seams, records six evidence dimensions, and keeps ledger and
context status synchronized. The closing Resume Note is rewritten even when work stops
early.

Task review uses six independent lenses. Findings move through stable JSON artifacts,
not intermediate worker chatter. Refactoring happens after the evidence makes real
duplication or coupling visible.

## Whole-system audit

`ultra-test` runs once after tasks for the active Change are complete. It checks anti-patterns, coverage,
wiring, E2E behavior, performance, and security. It names the exact Git commit and
binds the report to `change_id`, exact current task ids, intent SHA-256, and the
product-worktree digest. `passed: true` implies complete current tasks and no required
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
- raw brief without an accepted baseline, or a consequential evidence gap → research;
- requested outcome without active Change → change;
- draft or blocking active intent → change;
- unsatisfied Research Disposition → research;
- active Change without matching executable tasks → plan;
- matching pending or in-progress task → dev;
- completed current-Change tasks without a matching fresh report → test;
- false report → route by finding and owner disposition, not by the boolean alone;
- fresh, dispositioned report and unarchived Change → deliver.

It also checks installation provenance, stale reports, old in-progress work, and
unresolved markers. It does not mutate artifacts.

## Delegation

`ultra-delegate` is orthogonal to the lifecycle and requires explicit owner authority.
Its immutable instruction selects task execution/continuation, scoped Research evidence,
or aggregate Change review/verification. Task execution reads one matching task context;
the latter two may be read-only and do not require a task, so both pre-Plan evidence and
post-task review remain reachable. Every scope still binds the one active `change_id`, a
clean isolated worktree, strict permission/result schemas, and primary-host inspection.
The worker cannot write canonical `.ultra` files or perform external effects.

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
  by active `change_id`, while task evidence feeds
  review, whole-system audit, and delivery;
- the current test report is consumed by status and delivery;
- delivery moves with the Change into archive and remains historical evidence.

`ultra-status` intentionally writes nothing. Review, Hook, compact, and delegation
files are derived observations with explicit rebuild or rerun paths. No route creates
an unowned drift log, Change plan, technical-debt report, or second delivery summary.

## Interruption and cross-host continuation

There is one primary writer for canonical `.ultra` files. Review workers are read-only;
delegated source edits use isolated worktrees and return results for explicit
integration. Parallel canonical writes are unsupported because silently merging intent,
task, evidence, or report authority would lose meaning.

Before stopping, the active task context records current facts, exact verification,
open questions, Completion, and a closing Resume Note. The next session or host repeats
the common entry contract and compares the working tree with those claims.

This path remains valid when hooks and `ubp` are disabled. A compact snapshot may be
used as a hint, then checked against canonical files and Git.

An authenticated Claude-to-Codex continuation using this path passed on 2026-08-03;
the exact scope, provenance, results, and limitations are recorded in the
[runtime compatibility matrix](RUNTIME-COMPAT-MATRIX.md#authenticated-cross-host-continuation-evidence).
