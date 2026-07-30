---
name: ultra-review
description: Independently review one current Ultra plan, task diff, or aggregate Change on specification fidelity and engineering standards. Use when current evidence needs review or focused risk analysis.
---

# Review one bounded scope

Keep two independent verdict axes:

- `spec_fidelity`: accepted intent, behavior, docs, and public seams;
- `engineering_standards`: correctness, safety, tests, integration,
  maintainability, observability, and recovery.

## Bind and review

1. Read `references/review-modes.md`.
2. Call `ultra.context { stage: review, scope: { change_id, task_id? }, detail: full }`.
3. Import a newer team checkpoint with `ultra.sync`; stop on a real conflict.
4. Bind one explicit diff or Plan, full HEAD, worktree digest, task set, acceptance,
   decisions, and current evidence. Empty or stale scope cannot pass.
5. Always run `review-spec`. Select the smallest engineering worker set that covers
   actual risk; record selected and excluded roles with rationale.

Use the current host's native bounded-worker mechanism. Workers are read-only and
receive one immutable Worker Packet containing the exact Context Envelope, HEAD/diff,
decisions, acceptance, output path/schema, and `packet_digest`. Validate their artifacts with `scripts/review_wait.py` and
`references/unified-schema.md`; reject any output that does not echo the exact packet
digest. Preserve every finding unchanged in `SUMMARY.json`; group duplicates only in
the human summary.

Register specialist and summary artifacts through one `ultra.record` batch using
`artifact / bind`.

## Checkpoint

Call `ultra.checkpoint` once with `stage: review`, exact scope, evidence, and outputs
tagged `spec_review`, `engineering_review`, or summary. The checkpoint compiles or
reuses review context and derives both axes from registered artifacts.

A rejected checkpoint leaves the draft mutable. Fix stale scope or evidence and retry;
do not open a replacement run or suppress a finding.

Return both axes, findings, reviewed scope, worker rationale, digests, and the model's
recommended next explicit capability. Do not invoke it automatically.
