---
name: ultra-review
description: "Run two independent review axes over one current diff, using bounded specialist workers and file-based evidence without context pollution."
user-invocable: true
runtime: all
mcp_tools_required:
  - change.list
  - change.get
  - change.context
  - change.breadcrumb
  - task.list
---

# /ultra-review - Ultra Review System

Review one explicit diff at the current HEAD. The top-level gates are independent:

1. `spec_fidelity`: does the implementation satisfy intent, acceptance, delta,
   documentation impact, and public seam?
2. `engineering_standards`: is the implementation correct, safe, maintainable,
   tested, observable, and recoverable?

One axis cannot compensate for the other. The coordinator may deduplicate the same
root cause but must preserve each source finding's severity, confidence, file/line,
and axis; it may not silently downgrade or rerank findings.

## Usage

```text
/ultra-review              # applicable specialists
/ultra-review all          # all five specialists; delivery gate
/ultra-review quick        # review-code only
/ultra-review security     # review-code + review-errors
/ultra-review tests        # review-tests only
/ultra-review recheck      # unresolved P0/P1 scope
/ultra-review delta        # files changed since last review
/ultra-review --range <range> | --pr <number>
```

## Phase 1: Scope and Context

1. Resolve one diff range and `DIFF_FILES`. Include staged and unstaged changes for
   default working-tree review.
2. Bind to the single matching change through `change.list`/`task.list`; require an
   explicit id if ambiguous.
3. Compile `change.context` with `role=review`, `gate=review`, spec/delta/test refs,
   current diff paths, and the public-seam execution contract.
4. Stop on stale HEAD, blocked readiness, empty scope, or missing acceptance evidence.
5. Create `.ultra/reviews/<session-id>/` and an index entry with reviewed HEAD,
   change id, mode, range, and `verdict=pending`.

The spec-fidelity axis reads only the bounded intent/delta/baseline/acceptance packet;
the engineering axis reads the bounded diff and test evidence. Do not load unrelated
project history or external provider payloads.

## Phase 2: Specialist Selection

Five engineering specialists feed the two-axis result:

| Worker | Scope |
|---|---|
| `review-code` | correctness, security, live-path reachability |
| `review-tests` | meaningful coverage, mocks, red/green evidence |
| `review-errors` | swallowed failures, recovery, observability |
| `review-design` | types, boundaries, complexity, coupling |
| `review-comments` | stale or misleading comments/docs |

`all` always runs all five. Other modes may skip a worker only when its scope is
provably absent, and the skip reason is written to the session. Spec fidelity is never
skipped for a change-linked review.

## Phase 3: Background Execution (Zero Context Pollution)

Launch selected workers in background mode using multiple Task tool calls in a single
message when the current host supports it. Each bounded worker must:

1. read its installed worker instructions;
2. inspect only `DIFF_FILES`, `DIFF_RANGE`, and supplied role context;
3. write `{SESSION_PATH}/{worker}.json` following
   `$CLAUDE_PLUGIN_ROOT/skills/ultra-review/references/unified-schema.md`;
4. return at most 12 findings with confidence >= 75, ordered by its own severity;
5. output only a one-line file acknowledgement after the artifact exists.

Do not copy worker transcripts into the parent context. Findings flow through files.

## Phase 4: Wait & Coordinate (File-Based)

Validate worker files:

```bash
python3 "$CLAUDE_PLUGIN_ROOT/skills/ultra-review/scripts/review_wait.py" {SESSION_PATH} agents {AGENT_COUNT}
```

Then run the installed `review-coordinator` over valid artifacts plus the independent
spec-fidelity assessment. It writes `SUMMARY.json` and `SUMMARY.md`. Validate:

```bash
python3 "$CLAUDE_PLUGIN_ROOT/skills/ultra-review/scripts/review_wait.py" {SESSION_PATH} summary
```

Partial worker completion is explicit. Zero valid worker files blocks the engineering
axis. A coordinator may merge duplicate root causes but must retain source ids and the
highest original severity/confidence without reinterpreting priorities.

## Phase 5: Report to User

`SUMMARY.json` must contain:

- session/change id, reviewed HEAD/range, workers run/skipped;
- `axes.spec_fidelity` and `axes.engineering_standards`, each with its own verdict and
  evidence refs;
- unchanged source findings with axis/source provenance;
- overall verdict: `REQUEST_CHANGES` when either axis has P0/P1 or fails;
- incomplete/partial status and exact rerun command.

Report the two axis verdicts first, then P0/P1 findings and the report path. Fixes are a
separate implementation action; review itself is read-only except for review artifacts.
After fixes, use `recheck` or `delta` rather than rerunning unrelated scope.

## Convergence handoff

At the final HEAD, recompile `change.context` with `role=review` and a next action of
`Converge and deliver the verified change`. The delivery workflow must submit two
separate `review` evidence rows: one with `axis=spec_fidelity`, one with
`axis=engineering_standards`. A single aggregate “review passed” row is invalid.
