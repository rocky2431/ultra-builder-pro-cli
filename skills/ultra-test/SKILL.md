---
name: ultra-test
description: Audit whole-system integrity after tasks for the active Change are complete by finding anti-patterns, coverage gaps, broken wiring, E2E failures, performance risk, and security risk. Use when preparing delivery or when locally green tasks may not form a working product.
---

# NOT for running unit tests (that's `ultra-dev`). This audits whole-system integrity before delivery.

This is the one end-of-change sensor allowed by PHILOSOPHY C4: an export cannot be
called orphaned while a later task may still wire it. It is a terminal sensor, never a gate;
the owner decides what to fix or accept.

## Before you start

1. If model-selected, verify the live execution grant in `../ultra-change/references/execution-grant.md` — a current session-local activation or a stably verified durable work-package grant; without either, stop.
2. Read `../ultra-change/references/change-contract.md` and apply its **Active Change
   authority resolution** before reading any active `intent.md` or resolving a current
   `change_id`. This workflow requires its one valid active authority; any zero result
   or typed diagnostic stops before audit input is read until the stated repair or retry
   succeeds. Read `.ultra/tasks.json` and only tasks whose `change_id` matches the active
   Change. Every matching task must be `completed` in that sole task-status authority.
   Read each task's `context_file` Acceptance, Completion, Task Review and closing
   `## Resume Note`.
   Historical tasks are not part of this audit snapshot. For every current Change task,
   require a current `ultra-task-evidence-v2` record whose context, subject, acceptance,
   and task-review bindings satisfy `../ultra-plan/references/task-evidence-v2.md`.
   A legacy context Status or Complexity header and v1 evidence remain migration
   diagnostics only; recommend Dev repair rather than treating them as current Test input.
3. Read `CONTEXT.md` for vocabulary and the relevant `.ultra/decisions/` entries.
4. Read the active Change intent, the task evidence directories and the current Git
   `HEAD`; old output is evidence only for the commit it names.
   Resolve Change and task `FP-*`, `NS-*`, and `HC-*` IDs against the accepted North
   Star revision. A stale trace is an explicit finding requiring reconciliation, not a
   silent rewrite or automatic failure verdict.
5. Resolve this loaded Skill's directory and run
   `node <ultra-test-skill-dir>/scripts/worktree_digest.cjs --project <repository-root> --change-id <change_id>`
   before and after the audit. It returns the stable Change id, exact intent SHA-256,
   HEAD, and product-worktree digest. The product-worktree digest has one fixed boundary:
   it excludes `.ultra/evidence/**`, whose command and external-observation entries bind
   raw bytes as `raw_evidence_sha256` before stable exact record bytes are bound as
   `evidence_digest`. It also excludes the report and
   all active/archive/abandoned Change-directory metadata. Intent freshness is checked
   separately, so publishing or refreshing evidence, writing delivery metadata, or moving
   the same Change cannot self-invalidate its tested product snapshot. Exact task-evidence
   and review-receipt digests remain mandatory through their existing consumers; this is
   not a caller-configurable exclusion. This digest defines the aggregate Change subject
   for the current whole Change; it is distinct from each task's earlier
   completion-snapshot freshness observation.

## Definition of done

- All six audit areas have an evidence-backed result or an explicit material omission.
- Wiring lists each changed export and its non-test consumers; zero matches are visible
  as orphan findings.
- `.ultra/test-report.json` records `change_id`, the exact current-Change `task_ids`,
  `intent_digest`, `git_commit`, commands, findings, omissions and the owner's
  disposition without rewriting a finding into a pass.
- Every current task's v2 evidence and retained task-review summary is consumed; blocking
  findings, resolutions, disagreements, and refresh references remain attributable.
- One current aggregate Change review is referenced by session, packet digest, exact
  admission and subject digests, execution mode, coverage, summary path, exact summary
  SHA-256, and verdict.
- The report names `ultra-review-findings-v4` and copies every review finding unchanged,
  including `north_star_trace.first_principles`, `.serves`, and `.touches`, so each
  finding carries its resolving `FP-*`/`NS-*`/`HC-*` IDs and Deliver can
  test evidence against outcome without copying the North Star prose.

## Audit six areas

1. **Anti-patterns**: find tautological or empty tests and internal collaborators mocked
   instead of exercising a public seam.
2. **Coverage gaps**: map changed public behavior to tests and list behavior with no
   exercising test.
3. **Wiring Verification**: list changed exported symbols, then search each name in
   non-test source. `0 matches = orphan` until a framework registration or generated
   consumer is evidenced. Also trace Component→API, API→DB, Form→Handler and
   State→Render where those boundaries exist.
4. **E2E**: run the smallest real primary flow through its deployed or local boundary.
5. **Performance**: measure the paths whose acceptance or risk makes latency, resource
   use or scale material; record why anything else was omitted.
6. **Security**: run the repository's dependency and security checks, then inspect the
   trust boundaries changed by this Change.

The six are independent read-only audits and may run in parallel through the host's
native bounded subagents. Each returns its findings; the parent writes the one report.
A worker never writes `.ultra/test-report.json` itself — six writers on one canonical
file is how a report loses findings.

Read `references/export-syntax.md` before collecting exports. The table finds
candidates; repository conventions and real consumers decide what is public.

After the six areas, follow `../ultra-review/SKILL.md` for an aggregate Change review.
Read only its validated summary, preserve its findings, and carry the review session,
packet digest, admission digest, subject digest, execution mode, coverage refs, summary
ref, verdict, and limitations into the report. Record
`review.finding_schema: "ultra-review-findings-v4"`; copy each finding
object unchanged from the v4 summary, including `north_star_trace`. An incomplete review
stays an omission; it never becomes a silent pass. Historical v3 review is evidence only:
run a fresh v4 aggregate review before a current Test claim.

Before accepting copied review metadata or findings, replay the exact frozen
`SUMMARY.json` through the sibling `ultra-review/scripts/review_wait.py` v4 summary
validator. Strict v4 replay is the default and requires the same session's valid
`ADMISSION.json`; `--legacy-v4` is an explicit read mode only for immutable historical
pre-admission evidence and cannot support a current Test claim. Then bind its
`change_id`, ordered `task_ids`, `head`, `admission_digest`, `subject_digest`,
`context_digest`, and
honest nullable `worktree_digest` to the Test report's root identity and `review`
provenance fields. The transport sensor accepts only canonical
`.ultra/test-report.json` and the normalized repository-relative
`.ultra/reviews/<session>/SUMMARY.json` it names. Both use the same bounded stable
raw-byte snapshot rule: every managed path component below the real repository root is
non-symlink, the final entry is a repository-contained regular file, and an 8 MiB + 1
byte observation returns a typed oversize diagnostic before JSON parsing or hashing.
The final file is opened with `O_NONBLOCK` and `O_NOFOLLOW`; its descriptor is
immediately required to be a regular file with the inspected path identity. A type or
identity replacement returns the existing retryable snapshot diagnostic instead of
waiting on a special file.
The sensor uses one report snapshot for report parsing and subject comparisons, and one
summary snapshot for summary parsing, SHA-256, comparisons, and the waiter's stdin
validation. After writing those exact values and findings, run
`node <ultra-test-skill-dir>/scripts/validate_review_transport.cjs --summary <validated-summary-path> --report .ultra/test-report.json`.
Record that exact command, exit code, and evidence reference in `commands`. A nonzero
result is a typed transport observation: repair the report copy and rerun it; never drop,
merge, inject, or rewrite a finding to obtain a pass. This sensor compares exact summary
bytes, review metadata, and finding objects only. It does not reinterpret a finding or
decide the audit verdict.

Validate each task evidence record with the shipped v2 structural sensor before using
it. For every record whose `task_review.review_mode` is `external-manual`, rerun the
sensor with `--verify-external-receipt` and recheck the declared receipt branch — the
bounded stable receipt bytes, its recorded SHA-256, and its task/change/subject
identity — instead of replaying a strict summary; strict-v4 records keep their exact
waiter and transport replay. A task's declared branch is preserved as-is in the
ordered `task_evidence` projection, consuming each item from the sensor's
`--projection` output verbatim: an external-manual item carries `task_review_mode`,
`task_review_receipt_ref`, and `task_review_receipt_digest` where a strict item
carries its session and summary digest. Never rewrite one branch into the other. The CLI establishes only JSON shape, token syntax, and
authority designation; it does not prove current identity, provenance, freshness,
or semantic acceptance. Test
takes each command and external-observation `raw_evidence_ref` to bounded stable
repository-contained bytes from an ordinary regular non-symlink file opened nonblocking
and no-follow, with an 8 MiB ceiling and path/descriptor identity checks around the read.
Recompute `raw_evidence_sha256` from that one snapshot and require an exact match. Then
recompute the stable exact `evidence.json` bytes as `evidence_digest` before copying the
ordered `task_evidence` projection; a raw or record mismatch is an evidence gap returned
to Dev.
Test
takes stable bytes independently, then rechecks and recomputes the current Acceptance-section SHA-256, aligns exact criterion IDs and verification types with the current context, and aligns the task-review session and summary digest with the retained strict summary. For `owner-judgment`, require that the durable owner record exists with its cited statement and disposition readable before rechecking all cited affected artifacts.
The `subject` is an independently captured completion-snapshot freshness observation made after the final strict task Review validates and immediately before evidence publication; `task_review` separately binds the retained strict summary. Worker Packet v1 carries no task worktree digest and its summary records `worktree_digest: null`, so Test never claims that those review artifacts prove or cryptographically bind `subject.worktree_digest`. It also never replaces that earlier observation with the later aggregate Change digest.
The owner alone supplies an owner-judgment result. A later task may change the aggregate
worktree without invalidating an earlier task, but any changed acceptance, owner record,
review binding, or cited artifact that no longer supports its criterion is a mismatch.
Any mismatch is an evidence gap: return the affected task and criterion IDs to Dev, or
return a missing owner judgment to the owner. Test never edits task status. Dev records the reason and performs
the explicit ledger `completed` to `in_progress` reopen; no silent demotion is allowed.
Never turn structural sensor success into any of those consumer conclusions.

This is a cooperative-workspace drift sensor, not an operating-system isolation
primitive. Use one fixed closing protocol: one complete primary observation followed by
one terminal seal. A persistent mismatch observed inside or before that terminal seal
returns typed `ULTRA_SNAPSHOT_CHANGED_DURING_OBSERVATION` recovery instead of publishing
the tuple. A cooperative write after the completed terminal seal belongs to the next
consumer, which must perform a fresh recapture before using the tuple. Hostile writers or
interleavings require a native Host sandbox or an isolated worktree. Never add an
unbounded success-seeking replay.

Aggregate finding disposition is bounded: P2 and P3 findings are recorded as backlog or
residual risk and never automatically returned to Dev, and this audit writes
non-blocking refactor observations into the report instead of reopening a completed
task. An implementation P0/P1 found here returns to Dev as at most one new
owner-approved repair task; there is no unbounded Test ↔ Deliver bounce, and any
re-entry through Test after a report is consumed requires an explicit owner
disposition.

The receipt is non-authoritative derived evidence, but retain it until both Test and
Deliver have consumed the review. If it is missing, the current session and Test claim
are `INCOMPLETE`; start a fresh review session. Do not reconstruct it or use
`--legacy-v4` to bypass loss from a current strict session.

## Detect substantive stubs

Report an empty return with no IO, a log-only function, a handler that only prevents
default, or a component that only renders placeholder text. Pair every finding with
the smallest real boundary or implementation that would make it observable.

## Write the report

Store the exact `change_id`, ordered current-Change `task_ids`, `intent_digest`,
`git_commit`, timestamp, run count, commands and exit codes, the six area results,
findings with paths, verified seams, material omissions, residual risk, and `passed` as
the model's evidence-derived summary in the one canonical
`.ultra/test-report.json`. Each command records `command`, `exit_code`, and an
`evidence_ref`; each area records `status`, `evidence_refs`, and `omissions`. Copy the
worktree script's `head`, `dirty`, `diff_digest`, and `intent_digest` into the report.
That worktree identity binds the current whole Change, while ordered `task_evidence`
items preserve each task's distinct completion-snapshot freshness observation and
separate task-review identity.
Copy the validated review summary's exact SHA-256 into `review.summary_digest`; the
transport validator recomputes it before the report can be current evidence. A stale
commit, product digest, intent digest, Change id, or task-id snapshot is labelled stale;
it is never reused as current proof.

`passed` is a one-way claim: `true` requires every current-Change task completed in the
ledger, current v2 task evidence and task-review provenance, and no required area left
`not_run`. Completed rows do not force `passed: true`; findings, omitted evidence, or a
failed command may keep it false, while an explicitly dispositioned gap remains visible
even if the model's evidence summary passes. Preserve the finding and the owner's
disposition as separate fields. No validator result is itself semantic acceptance.

Present the findings by consequence and recommend the highest-leverage response. The
owner may fix all, fix selected findings, accept recorded risk, or reduce scope through
the normal REDUCTION decision. Recommend the next capability; do not invoke it.

## When the owner decides

The owner decides disposition and risk acceptance. A failed command, orphan or stub is
an observation, not permission to auto-fix, weaken a test or silently change scope.

## References

- `../ultra-change/references/change-contract.md` — canonical Active Change authority resolution.
- `references/export-syntax.md` — read during Wiring Verification to find exported
  symbol candidates in TypeScript/JavaScript, Python, Go, Rust and Java.
- `scripts/worktree_digest.cjs` — deterministic HEAD plus worktree evidence identity.
- `../ultra-review/SKILL.md` — read for aggregate Change review after the six-area audit.
- `../ultra-plan/references/task-evidence-v2.md` — canonical current task evidence and task-review contract.
- `../ultra-change/references/execution-grant.md` — read only for grant-activated continuation.
- `../ultra-think/references/autonomy-boundary.md` — read when a proposed response
  would make an existing specification commitment stop holding.
