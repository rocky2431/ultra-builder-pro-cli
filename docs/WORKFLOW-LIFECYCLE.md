# Ultra Builder Pro workflow lifecycle

Ultra v0.26 has no fixed runtime state machine. Skills define checkable entry and exit
criteria; repository files record facts; the host model chooses the route.

## Capability flow

```text
ultra-init
    ├─ unresolved external claims ─► ultra-research
    └─ bounded requested outcome ──► ultra-change

ultra-change ─► ultra-plan ─► ultra-dev (per task) ─► ultra-test ─► ultra-deliver
                     ▲                 │                    │
                     └── replan ◄──────┘                    └── findings return to owner/model

ultra-status    read-only router at any point
ultra-delegate  orthogonal bounded execution on another CLI
```

Arrows are recommendations, not automatic invocation. The owner explicitly selects
each public workflow.

## Common entry contract

Every user-invoked Skill reads, in order:

1. `.ultra/tasks.json`;
2. the unfinished task's `context_file` and closing `## Resume Note`;
3. `CONTEXT.md` and relevant `.ultra/decisions/`;
4. the active Change, specifications, evidence, and Git state relevant to its scope.

Missing files produce a precise recovery or initialization recommendation. They do not
cause the Skill to invent a state transition.

## Initialization

`ultra-init` distinguishes owner authorization from claims requiring evidence. It
creates the file skeleton, preserves unknowns as `[NEEDS CLARIFICATION]`, initializes
Git when absent, and records only repository-observable brownfield facts. It does not
perform research or launch another workflow.

## Research

`ultra-research` maps unresolved claims to the smallest useful subset of seventeen
focused references. Reports are written immediately. Three material checkpoints can
change later scope; the owner resolves those checkpoints. The final distillate records
Git blob hashes of the specifications it summarizes.

## Change reconciliation

`ultra-change` first compares requested behavior with product truth and current code.
It classifies changes by the resulting commitments:

- expansion and correction may proceed inside accepted intent;
- a reduction waits for explicit owner authority.

The output is one active Change intent with observable outcome, acceptance, seams,
non-goals, and trace anchors.

## Planning

`ultra-plan` confirms the scope posture and public seams, then writes a task graph and
one context file per task. Feature tasks are tracer bullets. A contract task precedes
cross-process or cross-top-level-boundary implementations; integration checkpoints
appear after several slices. Cycles and broken trace paths are repaired before handoff.

## Task development

`ultra-dev` writes the implementation plan into the task context before code. It uses
`ultra-tdd` on confirmed seams, records six evidence dimensions, and keeps ledger and
context status synchronized. The closing Resume Note is rewritten even when work stops
early.

Task review uses six independent lenses. Findings move through stable JSON artifacts,
not intermediate worker chatter. Refactoring happens after the evidence makes real
duplication or coupling visible.

## Whole-system audit

`ultra-test` runs once after the ledger is complete. It checks anti-patterns, coverage,
wiring, E2E behavior, performance, and security. It names the exact Git commit and
never turns an orphan, failed command, stub, or omission into permission to alter scope.

## Delivery

`ultra-deliver` reconciles actual outcome, specifications, documentation, current test
report, aggregate review, build, version impact, omissions, and rollback. It archives
the Change with `git mv` after local reconciliation.

Commit, push, tag, publication, release, and deployment are independent external
effects. Readiness grants none automatically.

## Status routing

`ultra-status` infers the smallest next route from observable files:

- no healthy skeleton → init;
- unresolved evidence-bearing claim → research;
- requested outcome without active Change → change;
- active Change without executable ledger → plan;
- pending or in-progress task → dev;
- completed ledger without current report → test;
- current report and unarchived Change → deliver.

It also checks installation provenance, stale reports, old in-progress work, and
unresolved markers. It does not mutate artifacts.

## Artifact closure

Every durable output has a later reader:

- init's north star and specification skeletons are read by all later workflows;
- research reports are traced into specifications, Change reconciliation, planning,
  and delivery;
- Change intent is consumed through planning, development, audit, review, status, and
  delivery;
- task ledger and contexts are the common resume input, while task evidence feeds
  review, whole-system audit, and delivery;
- the current test report is consumed by status and delivery;
- delivery moves with the Change into archive and remains historical evidence.

`ultra-status` intentionally writes nothing. Review, Hook, compact, and delegation
files are derived observations with explicit rebuild or rerun paths. No route creates
an unowned drift log, Change plan, technical-debt report, or second delivery summary.

## Interruption and cross-host continuation

Before stopping, the active task context records current facts, exact verification,
open questions, Completion, and a closing Resume Note. The next session or host repeats
the common entry contract and compares the working tree with those claims.

This path remains valid when hooks and `ubp` are disabled. A compact snapshot may be
used as a hint, then checked against canonical files and Git.

An authenticated Claude-to-Codex continuation using this path passed on 2026-08-03;
the exact scope, provenance, results, and limitations are recorded in the
[runtime compatibility matrix](RUNTIME-COMPAT-MATRIX.md#authenticated-cross-host-continuation-evidence).
