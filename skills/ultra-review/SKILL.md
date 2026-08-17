---
name: ultra-review
description: Review one task diff or aggregate Change through owner-selected independent lenses, synthesize file-backed findings, and perform evidence-justified refactoring. Use when another skill needs task-level or delivery-level review without loading worker investigation into the main context.
---

# Review through selected lenses without polluting the main context

The parent owns scope and synthesis. Lens workers are read-only sensors. Refactoring
happens here, after several slices make a useful structure visible, not inside TDD.

## Before you start

1. Resolve the review scope first. For task or active-Change review, read
   `../ultra-change/references/change-contract.md` and apply its **Active Change
   authority resolution** before reading any active `intent.md`, resolving the current
   `change_id` or task, reading context or acceptance, or creating a packet. A stable
   zero result stops with no current review scope; any typed diagnostic, including
   non-unique authority, stops with its repair before any `.ultra/reviews` packet write.
   After one valid authority, read its intent and `.ultra/tasks.json`, select only
   matching tasks, then read the scoped task's `context_file` and `## Resume Note`.
   Historical review must name its archived Change explicitly and never infer scope
   from unfinished status.
2. Read `CONTEXT.md`, relevant `.ultra/decisions/`, acceptance, evidence and exact diff.
   Task-review admission comes from the ledger `in_progress` row, task context,
   immutable packet, and actual pre-review evidence such as retained command output,
   inspected source, owner records, and external receipts. The first task review must
   not require the final `ultra-task-evidence-v2` record that it helps produce. For an
   aggregate Change review, require every completed task's current v2 record. Treat any
   legacy context Status, Complexity, or v1 evidence as a migration diagnostic rather
   than current completion truth. The ledger remains the sole task-status authority.
   Resolve the scope's `FP-*`, `NS-*`, and `HC-*` IDs against the accepted North Star
   revision; pass IDs and causal evidence, never a copied North Star prose mirror.
3. Create `.ultra/reviews/<session>/` and one immutable packet naming HEAD, scope,
   output path, acceptance and public seams. Follow `references/worker-packet.md` and
   record the exact ordered v2 `subject_observations` for the validated Change,
   acceptance sources, and canonical validator decision/snapshot sources. Then compute
   the SHA-256 of the exact packet bytes and do not edit it.
4. Before launching a lens, run `scripts/review_wait.py <session> packet
   --packet-digest <digest>`. A typed subject or byte mismatch requires a corrected new
   session; never repair the frozen packet in place. Success atomically writes the
   derived packet-bound `ADMISSION.json`; do not launch from copied stdout alone. This
   publication is create-once: the exact existing bytes are an idempotent success, while
   different existing bytes are an `admission_conflict` requiring a fresh session.

## Definition of done

- The complete six-worker roster is dispositioned; every selected lens artifact and one
  summary exist, while skipped or failed lenses are explicit.
- Each selected lens preserves every evidence-backed finding it can establish inside
  the authorized physical resource budget. A finding or file count never decides what
  is included, whether quality is sufficient, or whether the review has converged.
- Findings preserve independent `spec_fidelity` and `engineering_standards` axes.
- Every v4 finding carries `north_star_trace.first_principles`, `.serves`, and `.touches`
  arrays preserving the applicable `FP-*`/`NS-*`/`HC-*` trace and identifies a stale or
  contradictory trace without mechanically deciding semantic alignment.
- `SUMMARY.json` records `execution_mode: isolated | sequential-shared-context`.
- A task review's validated final summary precedes publication of its one canonical v2
  evidence record; review admission never invents a second evidence or status authority.
- Refactors are justified by observed duplication or coupling and all affected checks rerun.

## Run the lenses

Use the host's native bounded subagents, in the background where available; otherwise
run them sequentially. The owner chooses the review topology per stage — one reviewer
or several, which providers, which write scopes; the default is one reviewer, the
current Agent. Lens selection follows the review kind, never a fixed count:

- An **initial task review** always selects `review-spec` plus only the lenses
  justified by the current risk and the touched seams; a major or high-risk task may
  select the full six-lens roster only with recorded owner approval.
- A **delta review** reruns only the lenses the exact blocking repair set can affect;
  it never re-audits the whole task and runs only inside the active review budget.
- An **aggregate Change review** may default to all six only when the cross-task
  wiring justifies it; that is a selection reason, never a mandatory count or a
  quality proxy, and it never writes non-blocking refactor findings back into a
  completed task.

Skipping a lens requires a stated reason recorded in `SUMMARY.json`; the rationale is
evidence for the selection actually made, never a way to run less work. Give each
worker the packet path and digest, `references/unified-schema.md`, and exactly one lens:

- `references/code.md`
- `references/design.md`
- `references/errors.md`
- `references/tests.md`
- `references/spec.md`
- `references/comments.md`

Apply **Zero Context Pollution**: start the workers, immediately run
`scripts/review_wait.py <session> agents --packet-digest <digest> <selected-stems>`,
then read only the stable JSON files it returns. Validate `SUMMARY.json` with
`scripts/review_wait.py <session> summary --packet-digest <digest>`. Do not read
intermediate worker output or treat background notifications as completion. The sole
information path is wait script to JSON artifact. These guards prevent partial results
from becoming a semantic verdict.

For v4, the waiter verifies the exact packet bytes, binds every requested stem to the
packet worker and scope, resolves each finding trace as a packet subset, reloads all
completed specialist artifacts in packet order, and rejects a summary that omits,
rewrites, reorders, or injects any finding. It also verifies axis evidence refs and
derives axis and overall verdicts from that immutable evidence. These are provenance and
transport checks, never a replacement for a specialist's semantic judgment.
Validator success therefore means only that the immutable transport and exact schemas
agree. It never supplies a specialist finding, accepts an `owner-judgment`, or decides
semantic pass.
The `packet` command is the one admission boundary that checks current Git HEAD and
reads current context, the exact active/archive/abandoned Change path already validated
from `north_star_trace.path`, acceptance-source, and North Star bytes.
It sends the already captured North Star bytes through the canonical Research
validator's native stdin seam and requires that report to receipt the identical input;
it does not implement a second Markdown grammar or interpret Change/acceptance prose.
Admission atomically records those observations in `ADMISSION.json`. Strict v4 `agents`
and `summary` require that packet-bound receipt. Every current specialist artifact and
`SUMMARY.json` records the SHA-256 of the receipt's exact bytes as `admission_digest`
plus its exact `subject_digest`; the waiters pin both values across every poll and final reload.
They then reread only the exact packet and its frozen artifacts, so later task
completion, Change archival, or North Star revision cannot erase historical review
evidence. Packet, receipt, artifact, and canonical
summary inputs are bounded stable regular-file snapshots; a fresh root rewalk verifies
every recorded path-component and file identity after reading. A special file,
replacement, oversize input, skipped admission, or invalid UTF-8/JSON returns typed
repairable `incomplete` output rather than becoming evidence. Canonical validator stdout
and stderr share one incremental byte ceiling; exceeding it terminates and reaps that
attempt immediately.
`ADMISSION.json` is derived and non-authoritative, but it is retained mechanical
evidence until the session has completed its Test and Deliver consumption. If it is
lost after any specialist artifact or `SUMMARY.json` exists, the strict session is
`INCOMPLETE`; start a fresh review session instead of reconstructing or replacing the
receipt. Before any output exists, packet mode may recreate a missing v2 receipt only
when every packet-recorded byte length and SHA-256 still matches. A retained strict v1
packet is read-compatible only with its exact existing receipt; packet mode never creates
or recreates a v1 receipt. A newly published receipt is accepted only after a fresh
canonical root rewalk confirms the session and exact receipt identity. When publication itself succeeded but
one or more durability operations did not, packet mode returns `status: complete` with
a typed `durability_warning`; multiple unresolved warnings are preserved together, and
a temporary cleanup failure resolved by the final retry is not reported.
It resolves the repository only from the canonical session path; packet paths and
artifact file scope cannot be absolute, non-normalized, symlink-escaping, or broader
than `diff_files`. Worker Packet v1 summaries use the packet-derived context digest and
an explicit `worktree_digest: null` because v1 binds no exact worktree observation.

Those commands require admission-contract v2 artifacts for every new session. Use `--legacy-v4`
immediately after the packet digest only to read an immutable v4 session created before
admission receipts and therefore lacking the current packet `admission_contract`
marker. Use `--legacy-v3` only for an immutable historical v3 session. Either legacy
flag rejects every packet marked strict v1 or v2; only truly historical unmarked
packets, or packet-absent v3 history, enter compatibility mode.
Neither flag permits new legacy artifacts, automatically falls back, or mutates history.

Record `isolated` only when selected lenses had separate native contexts; otherwise
record `sequential-shared-context`. A zero-finding artifact must cite real coverage or
an explicit limitation; without either, record the review as `INCOMPLETE`.
When an axis has no completed artifact, keep its exact evidence union as `[]` and mark it
`INCOMPLETE`; never invent a placeholder artifact merely to satisfy the summary shape.

## Synthesize, repair and recheck

Preserve findings unchanged in `SUMMARY.json`; group duplicates by root cause only in
the human summary.

Verdicts are terminal for the current subject. `APPROVE` ends the current task review
even when P2 or P3 findings are retained — they stay in the report and go to the
owner-selected backlog, and no fresh review of the same subject may be opened after a
current `APPROVE`. `REQUEST_CHANGES` routes only the exact current P0/P1 finding ids
(or a P2 the owner explicitly promoted); repair them as one in-scope repair set, then
run one affected-lens delta review of that exact repair set inside the active review
budget. When another `REQUEST_CHANGES` would exceed the active budget — or a delta
that returns `INCOMPLETE` on evidence the budget cannot cover — return to the owner
checkpoint: report the exact blocking set and stop instead of starting another
automatic repair. When evidence proves a P2 actually blocks
acceptance, reclassify it as P1 in the current review rather than routing a P2 label
as a blocker. A finding outside the packet's `diff_files` is a scope-change proposal:
record it, do not edit that path, and return it to the owner or Plan as a new subject.

Resource budgets — time, tools, cost, review counts — stop execution only. Budget
exhaustion returns `owner checkpoint` / `budget_exhausted` and keeps the task
`in_progress` without disposing findings.
It never yields `APPROVE`, `REQUEST_CHANGES`, `INCOMPLETE`, pass, fail, accept, or
abandon, and a round, count, or budget number never measures semantic quality.

### Work-package convergence

Review budget precedence is one rule: an exact current owner grant for this work
package overrides the versioned product default; the released default is one initial
review plus at most two P0/P1 delta reviews per coherent work package. Both are
finite, owner-visible budgets, never a semantic quality measure.

Only actual P0/P1 findings — or a P2 the owner explicitly promoted as a direct North
Star blocker — trigger a delta review; P2/P3 findings are reported and never
auto-repair or auto-extend any budget. Zero findings is never the completion
condition — completion is the owner accepting the real result. A finding outside the
current subject is a scope-change proposal for the owner or a future Change, never a
reason to enlarge this package.

When the same root cause survives three failed repair attempts, stop point-patching
and report an architecture boundary problem. A remaining blocker at budget
exhaustion returns the choice to the owner with the exact blocking set; never open
an automatic round beyond the active grant, and never extend a budget yourself. The
legal terminal outcomes are: owner risk acceptance, owner scope reduction or reset,
a new explicitly authorized work package, an external blocker, a budget stop, or
abandonment.

Stop repairing and return to the owner when three repairs expose three distinct
root causes, the same path keeps gaining validators, counters, mirrors, or
replays, a formal terminal verdict conflicts with Resume/Hook/Status suggestions,
the owner-visible outcome has materially drifted, the reviewer contract and the
reviewed subject are the same changing thing, or you cannot name the concrete
harm the next round would remove.

The parent model judges `stalled` from the actual repair/evidence history, not
from repair rounds, finding counts, or the number of files involved. Zero findings is
never a completion condition: a zero-finding artifact must cite real coverage or an
explicit limitation, and convergence is judged by evidence, never by an empty findings
array. When repair is no longer justified, preserve an unresolved report that
separates a possibly over-tight constraint, an insufficient fix, unavailable evidence,
and an observed shared structural root. Return the reachable repair, retry,
owner-disposition, or abandon path.

Report both axes, exact scope, checks, residual findings and any refactor performed.

## Self-hosting review boundary

Touching any of these paths makes the reviewed subject self-hosting:

- `skills/ultra-review/**`, including `scripts/review_wait.py`;
- review routing inside `skills/ultra-dev/**`, Review consumption inside
  `skills/ultra-test/**`, or Review/Test bounce inside `skills/ultra-deliver/**`;
- the Review packet, schema, and transport tests;
- Hook route or Resume authority under `hooks/`.

A self-hosting review must pin its semantic baseline — the owner-accepted contract
digest — and use a stable external reviewer boundary instead of judging its own
changes with the changing reviewer. During the v0.27 H0 closure that boundary is one
read-only external manual review by the owner-named reviewer; never use the local
changing `ultra-review` implementation to approve itself, and treat a released tag
only as a historical behavior reference, never as the current verdict authority.

## Recheck across model families

Six lenses are six angles from one model family, so they share blind spots: what all
six miss, a seventh angle from the same family misses too. Independence comes from a
different model, not from another lens.

When concrete effects make authorization, payments, personal data, migrations, or
another accepted risk material, recommend a cross-family recheck and wait for the
owner's decision. A profile label alone is not a semantic risk verdict. Do not
invoke `ultra-delegate` unless the owner has explicitly asked for another model or host
for this review. Once that authority exists, follow `../ultra-delegate/SKILL.md`.

- For a **finding audit**, send `SUMMARY.json` plus the diff and ask which findings lack
  support. For a **blind adversarial probe**, send the Worker Packet, North Star Trace,
  and diff without `SUMMARY.json`, and ask what the local review missed.
- Ask two things: which findings the evidence does not actually support, and what this
  diff gets wrong that no finding mentions. The second question is why the recheck is
  worth its cost.
- A worker finding no local lens raised is a candidate, not a verdict. Verify it
  against the source exactly as a lens finding is verified, and record its origin.
- Disagreement is information, not a tie to break. `ultra-delegate` already forbids
  turning a vote or a score into truth; record both readings with their evidence.

## When the owner decides

The owner chooses risk acceptance, a scope reduction, or which stuck path to take.
Workers never edit source, task state or another lens artifact.

## References

- `../ultra-change/references/change-contract.md` — canonical Active Change authority resolution.
- `references/unified-schema.md` — JSON contract shared by all lenses.
- `references/worker-packet.md` — exact immutable input packet and digest procedure.
- `references/review-modes.md` — choose task, Change, full, or delta scope.
- `references/adversarial-evaluation.md` — use before adding or removing a review lens.
- `../ultra-plan/references/task-evidence-v2.md` — current task evidence and task-review provenance.
- `../ultra-delegate/SKILL.md` — read after the owner authorizes a cross-family recheck.
- `../ultra-think/references/autonomy-boundary.md` — read before a fix reduces intent.
