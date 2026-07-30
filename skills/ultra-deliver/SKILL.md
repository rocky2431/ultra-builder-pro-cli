---
name: ultra-deliver
description: Converge a verified Ultra Change, reconcile baseline specifications, and archive it with recoverable local evidence. Use when implementation, testing, and review are current.
---

# Converge and archive local authority

Delivery closes local Ultra authority. It never grants commit, push, tag, registry
publication, deployment, or another external effect.

## Prepare the packet

1. Call `ultra.context { stage: deliver, scope: { change_id }, detail: full }`.
2. Import a newer team checkpoint with `ultra.sync`; stop on a real conflict.
3. Require current task outcomes, test report, both review axes, accepted decisions,
   typed delta, documentation reconciliation, and current checkout evidence.
4. Resolve every specification-learning candidate. Keep updates inside the Change
   overlay until archive.
5. Write and register documentation reconciliation and an
   `ultra-delivery-report-v1` report. The report binds Change, baseline, HEAD,
   worktree/context digests, local checks, rollback guidance, and timestamp; it contains
   no release decision.

Use one typed `ultra.record` batch for `artifact / bind`, any normalized
`decision / accept`, and bounded `event / append` facts.

## Archive once

Call `ultra.archive` once with the Change id, stable idempotency key, archive summary,
reconciliation fields, delivery evidence steps, and report output. The operation
internally:

- compiles or reuses convergence context;
- checks the deliver draft;
- derives convergence from current dev, test, review, delta, docs, and checkout;
- applies the overlay and archive through the recoverable filesystem/DB transaction;
- rebinds registered artifacts into a self-contained archive;
- accepts one immutable delivery checkpoint revision;
- publishes the updated team checkpoint.

A semantic rejection returns mutable blockers. Repair the same packet and retry. A
hard corruption, path, concurrency, or recovery error remains fail-closed and routes to
`ultra-doctor`.

Verify the archived packet, baseline, checkpoint, and rollback state. Handle any
separately authorized Git or release effect only after local delivery and report it as
external evidence, not Ultra delivery authority. Do not invoke another capability
automatically.
