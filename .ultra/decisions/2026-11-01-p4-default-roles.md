# Decision: the default division of labour per node (P4 A/B/C)

Date: 2026-11-01. Made by the assistant under the pre-registered rule in
`.ultra/records/experiments/p4-abc/PROTOCOL.md`; the Owner delegated the touchpoints on
2026-11-01 and has not reviewed it. Evidence: `.ultra/records/experiments/p4-abc/RESULTS.md`.

## Decision

Per node, the default is arm A: one fresh writer, then the controller's verification (scope,
plan gate, every stale check for the ratchet, `node done`). No per-node explorer, tester or
second reviewer. A reviewer from another vendor, when one is available, reviews the whole
branch at the milestone gate instead.

## Evidence (directional, three pairs)

- Hidden checks: the three arms scored the same on every task (T1 6/6, T2 3/4 with a
  hidden-test defect shared by all arms, T3 6/6). The rule needed B or C to score higher on
  at least two of three tasks.
- Cost: B used 3.3–3.8× and C 3.6–5.2× the tokens of A (C without Codex's own tokens), against
  a limit of 2×; critical-path time was 2.7–3.5× (B) and 2.7–4.5× (C).
- What the extra roles found: six tester runs found nothing; one of three Codex reviews found
  one real defect (T3-C, a trimmed form value missed a deduplication match), fixed in one
  rework; one explorer map flagged a conflict between two requirements that the acceptance
  author had written.

## Consequences for the method

- "Roles" says the default per node is one writer and the controller's verification.
- The planner reads the requirements against each other before the plan gate (the conflict
  the T3-C explorer found is a planner's job, not a per-node one).
- Reads, reviews and test runs may still run in parallel at any time when the controller
  judges a node risky; that is a choice, not the default.

## Reopen when

On the Owner's first real sample, A misses a defect of a kind that B's or C's extra role
would have caught, and the same kind appears twice (pre-registered in `PROTOCOL.md`).
