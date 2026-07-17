---
name: ultra-review
description: Run independent specification-fidelity and engineering reviews over one current diff using bounded workers and file-based evidence. Use when implementation needs a read-only review gate before task completion or delivery.
---

# Review one current diff

Keep two verdict axes independent:

1. `spec_fidelity`: intent, acceptance, delta, documentation impact, and public seam;
2. `engineering_standards`: correctness, safety, maintainability, testing,
   observability, and recovery.

One axis cannot compensate for the other. Preserve each finding's source, severity,
file and line, and axis during coordination.

## Scope and context

1. Resolve one explicit diff range and file set. Include staged and unstaged changes
   for a default working-tree review.
2. Bind the single matching change through `change.list` and `task.list`; require an id
   when ambiguous.
3. Compile `change.context` for the review role and gate with only the intent, delta,
   acceptance, tests, diff paths, and public-seam contract needed for this review.
4. Stop on stale HEAD, blocked readiness, empty scope, or missing acceptance evidence.
5. Create `.ultra/reviews/<session-id>/` with the reviewed HEAD, range, change id,
   selected workers, and a pending verdict.

## Run the independent fidelity axis

Always dispatch `review-spec` with only the accepted intent, delta, acceptance criteria,
public-seam context, current HEAD, and diff scope. Do not give it engineering findings
or an implementation rationale that is not part of the accepted contract. It writes
`spec-fidelity.json` with `axis: spec_fidelity`.

## Select engineering specialists

Use the smallest set that covers the diff. The delivery gate runs all five:

- `review-code`: correctness, security, and live-path reachability;
- `review-tests`: behavioral coverage and feedback-loop evidence;
- `review-errors`: hidden failures, recovery, and observability;
- `review-design`: types, boundaries, complexity, and coupling;
- `review-comments`: stale or misleading comments and documentation.

Record why any engineering specialist is skipped. The independent specification
worker is required for every change-linked review.

## Execute bounded workers

Use the current host's native bounded-worker mechanism. Dispatch `review-spec` and the
selected engineering workers independently. Each worker must inspect only the supplied
diff and role context. Resolve `references/unified-schema.md` from this
Skill directory and pass that absolute path as `SCHEMA_PATH`; never make a worker infer
the plugin installation root. Each worker writes `<session>/<worker>.json` following
that contract, limits output to actionable findings, and returns only a short file
acknowledgement to the parent context.

Resolve bundled paths relative to this skill directory. Validate the exact expected
artifacts before coordination:

```bash
python3 scripts/review_wait.py <session-path> agents spec-fidelity review-code review-tests
```

Pass only the engineering worker stems actually selected. Missing or invalid required
artifacts make the corresponding axis incomplete; a partial set is never a pass.

Run `review-coordinator` only after validation. It may merge duplicate root causes but
must retain source identifiers and the highest original severity.
Validate its summary with the same waiter.

## Report and handoff

Report both axis verdicts first, followed by blocking findings and artifact paths.
Review is read-only except for review artifacts; fixes are a separate implementation
action. Recheck only unresolved or changed scope after fixes.

At the final HEAD, compile review context with one convergence action. Delivery must
submit separate review evidence rows for `spec_fidelity` and
`engineering_standards`; a single aggregate pass is invalid.
