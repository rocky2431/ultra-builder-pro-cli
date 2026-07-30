---
name: ultra-deliver
description: Reconcile and archive an explicitly accepted Ultra Change with recoverable local evidence. Use when the caller is ready to make a local delivery handoff with current managed evidence and an explicit rationale for any omitted capability.
---

# Converge and archive local authority

Delivery closes local Ultra authority. It never grants commit, push, tag, registry
publication, deployment, or another external effect.

## Prepare the packet

1. Call `ultra.context { stage: deliver, scope: { change_id }, detail: full }`.
2. Import a newer team checkpoint with `ultra.sync`; stop on a real conflict.
3. Inspect current task outcomes, tests, both review axes, accepted decisions, typed
   delta, documentation reconciliation, and checkout evidence. Decide whether the
   actual Change is sufficiently complete; explicitly record any omitted stage and its
   evidence-based rationale instead of inventing a fixed recipe.
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
reconciliation fields, delivery evidence steps, explicit omissions, and report output.
The model's report is the semantic handoff. MCP validates its current registered
authority, paths, digests, reconciliation structure, and idempotency; applies the
overlay and archive through the recoverable filesystem/DB transaction; rebinds
registered artifacts into a self-contained archive; and publishes the updated team
checkpoint. It does not require a hard-coded Plan/Dev/Test/Review/Deliver sequence.

Semantic warnings remain in the archive history but do not reject an explicit local
handoff. Corruption, unsafe paths, digest/CAS conflicts, permissions, or recovery
failure remain fail-closed and route to `ultra-doctor`.

Verify the archived packet, baseline, checkpoint, and rollback state. Handle any
separately authorized Git or release effect only after local delivery and report it as
external evidence, not Ultra delivery authority. Do not invoke another capability
automatically.
