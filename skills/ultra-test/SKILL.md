---
name: ultra-test
description: Independently verify an Ultra task set or Change with an evidence-backed, risk-selected test profile. Use when implementation or current acceptance and recovery evidence needs independent verification.
---

# Verify current behavior

Testing independently checks the current checkout. Implementation conclusions and
generated projections are not evidence.

## Bind and execute

1. Call `ultra.context { stage: test, scope: { change_id, task_id? }, detail: full }`.
2. Import a newer team checkpoint with `ultra.sync`; stop on a real conflict.
3. Bind exact acceptance, task set, HEAD, worktree, decisions, dev evidence, and public
   seams.
4. Select a risk-based profile from acceptance, regression, integration, static
   analysis, build, performance, security, and recovery. Acceptance is mandatory;
   explain every material exclusion.
5. Run repository-native commands and real boundaries. A bug or incident needs one
   deterministic red-to-green regression signal.

When delegated, use the immutable Worker Packet supplied by the parent and echo its
`packet_digest` in the report. Write an `ultra-test-report-v1` report below the owning
Change. Bind exact acceptance
ids, task ids, HEAD, worktree/context digests, commands, seams, failures, recovery,
profile, timestamp, blockers, and evidence-derived verdict. Register it with
`ultra.record` using `artifact / bind`.

## Checkpoint

Call `ultra.checkpoint` once with `stage: test`, exact scope, evidence, and an output
for the report (`kind: test-report`). The model owns the evidence-derived verdict and
material exclusions. The checkpoint compiles or reuses checking context, verifies the
declared report authority and digest, and records that verdict without re-judging it.

If rejected, keep the same draft and repair the structural, digest, path, or
concurrency fault. Never weaken an assertion, hide a skip, or turn a warning into
proof.

Return the profile, exact results, verified seams, blockers, report digest, and the
model's recommended next explicit capability. Do not invoke it automatically.
