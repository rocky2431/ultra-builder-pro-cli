---
name: ultra-dev
description: Carry one planned task from a written implementation plan through red-green development to recorded evidence and a task-level review. Use when a task in the ledger is ready to execute, was interrupted partway, or has to be picked up in a fresh session or on another host.
---

# Take one task from plan to recorded evidence

The model owns code reasoning and edits; repository files own the resumable contract.

## Before you start

1. If model-selected, verify the live execution grant in `../ultra-change/references/execution-grant.md` — a current session-local activation or a stably verified durable work-package grant; without either, stop.
2. Read `../ultra-change/references/change-contract.md` and apply its **Active Change
   authority resolution** before reading any active `intent.md` or resolving a current
   `change_id`. Require its one valid authority; otherwise stop with its typed repair.
   Then read `.ultra/tasks.json`. Without an exact task id in the owner invocation,
   select only the uniquely current `in_progress` task and read its full
   `context_file`, especially `## Resume Note`; if none exists, stop and ask
   the owner to invoke Dev naming one exact task id — a `pending` row is a frontier
   candidate, not active work, and Hooks will not have injected its acceptance or
   Resume. An invocation that names one exact task id supplies invocation-local
   selection authority for this Dev run only. If more than one row claims
   `in_progress`, do not manufacture a unique current task; use the explicit recovery
   below or stop with the Hook diagnostic. The ledger is the sole task-status authority;
   legacy Status or Complexity never overrides it. A `completed` task with a current
   invalidation observation may be selected only for the explicit reopen below; record
   and read back that transition before repair.
3. Read `CONTEXT.md` for vocabulary, and the `.ultra/decisions/` entries the task
   context names.
4. Validate `.ultra/north-star.md` with the shipped Research structural sensor. Resolve
   every listed `FP-*`, `NS-*`, and `HC-*` in the task and active Change against that
   accepted authority. Compare the active Change's recorded **North Star revision** and
   **North Star digest** with the accepted file's revision and current Git blob digest.
   A missing ID, revision mismatch, or digest mismatch is a stale-plan observation: stop
   before editing and recommend explicit owner invocation of `ultra-change` to reconcile
   the active Change. Never inherit approval or silently rewrite the trace.
5. Read the task's acceptance criteria. If you cannot state that acceptance in one
   sentence, you are not ready to start.

### Activating one named pending task

When the owner invocation names a dependency-ready `pending` task, perform its
canonical activation before any implementation work: write that row from
`pending` to `in_progress` in `.ultra/tasks.json` and read the row back before
the first implementation edit. This one canonical ledger write is what makes
the named task live for the task-aware Hooks; without it Hooks correctly remain
task-silent while you edit, because a trusted invocation is visible only to the
invocation that carried it. The activation adds no selector, activation flag,
or workflow state — the ledger row is the only authority — and it must respect
the single-writer boundary: resolve any conflicting `in_progress` rows through
the recovery below or an owner decision before writing.

### Recover one exact task from an ambiguous ledger

An explicit owner invocation with one exact task id supplies invocation-local selection
authority for this Dev run even when multiple ledger rows claim `in_progress`. Before
editing, read that exact canonical ledger row and context, especially its Resume Note,
then inspect current Git/worktree evidence for the named task. Do not persist a new
current-task selector, status, or workflow state to manufacture uniqueness. Hooks remain
task-silent and progress-silent while the ledger is ambiguous.

Only an explicit owner/Plan correction that establishes a conflicting task never started
may return that row to `pending`. If multiple tasks contain real partial work, keep every
task with real partial work `in_progress` and preserve each task's bytes. Recover them by
separate exact task-id owner invocations or obtain owner-authorized Plan reconciliation;
use a separate worktree when needed to keep their writes isolated. Completing the
selected task still requires final review, canonical v2 evidence, context publication,
ledger write, and readback.

When this task starts from an observed error, failing check or unexpected behavior,
read `references/debugging.md` and establish the earliest incorrect state before editing.

## Definition of done

- All six evidence dimensions carry honest, current observations under the typed v2
  evidence contract; a real limitation remains a gap rather than becoming a pass.
- `.ultra/tasks.json` remains the sole task-status authority after write/read-back.
- The task still names the active `change_id`; historical unfinished work stays out.
- The context file carries a Completion entry and a rewritten Resume Note.
- A task-level review runs while the ledger task remains `in_progress`; its blocking
  findings are resolved or owner-dispositioned as required and affected evidence is
  refreshed before the model writes `completed` to the ledger.

## Write the implementation plan before the code

Fill in the task context's Implementation section as prose a person can read:
which modules change, how the interfaces move, which seam the tests will use.
Confirm that, then write code. Deciding the design while typing implementation
buries the design decisions in the details.

## Develop through red then green

Follow `../ultra-tdd/SKILL.md`, writing tests only on the seams the plan already
confirmed, one slice at a time. `ultra-review` owns evidence-backed refactoring when
observed duplication, coupling, or a boundary defect justifies it; a slice count does
not make that decision.

## Converge on the task-scoped acceptance set

Development ends when every task-scoped criterion has its required current evidence and
responsible semantic disposition, not merely when commands pass or the code looks
finished. Resolve the context's **Change Acceptance IDs** against the active `intent.md`
for `<change_id>`. For each named row consume its exact `Verification type` and
`Required evidence`. When one outcome needs more than one authority, split it into
independent criteria with unique IDs and preserve each authority separately; every row
has exactly one verification type. Task-local acceptance may add evidence requirements,
but it does not replace or narrow the Change mapping.

Handle the four verification types without converting one authority into another:

- Execute only `command` observations. Record the exact command, working directory,
  exit status, retained raw output reference, and its exact SHA-256.
- For `inspection`, cite the exact source and revision or digest, then refresh the
  observation after any touched source changes.
- For `owner-judgment`, preserve the cited owner decision. The owner alone supplies its
  semantic result; a model statement, validator, score, or command cannot proxy it.
- For `external-observation`, preserve the provider or system receipt without proxying it
  with a local command, model claim, or synthetic fixture, and bind its exact bytes by
  SHA-256.

- Missing `owner-judgment` stops at its named owner gate.
- Missing `external-observation` stops at its named external or authorization gate.
- If an inspection exists but its semantic implication is unresolved, stop at the
  responsible model or owner gate; a structural citation is not an automatic acceptance
  verdict.

Run one baseline before repairing anything. Track a best-ever evidence set keyed by
criterion, verification type, and source identity to make progress visible, plus the
current evidence set used for convergence. Stale or regressed evidence remains history
but cannot satisfy the current set. Do not infer semantic progress or failure from a
round count. The loop has three explicit exits:

| Exit | Condition | Action |
|---|---|---|
| Converged | Every mapped and task-local criterion has current required evidence of every named type, and the responsible model or owner has made any semantic disposition | Close out below |
| Stalled | An in-scope repair yields no new or refreshed evidence and no further evidence-producing repair is justified inside the approved task | Stop; report the missing evidence, the attempted repair, and the responsible next gate |
| Unreachable | Required evidence cannot be observed because an executable, fixture, provider, service, declared environment prerequisite, or required authorization is unavailable | Stop that criterion; report the unavailable prerequisite or gate and its reachable repair path |

A nonzero command exit is an observation, not automatically `Unreachable`; inspect its
output and repair within scope when justified. None of these exits mechanically decides
semantic sufficiency, owner acceptance, or external truth.

## Answer the six evidence dimensions

Each has a rule you can check against the work rather than assert:

| Dimension | Answered when |
|---|---|
| `tests_written` | This diff adds or changes at least one assertion — touching a test file is not enough |
| `tests_passed` | The last test run exited zero and covered the files this diff touched |
| `persistence_real` | On any path that stores data, the test uses real storage or a container |
| `feature_flags_audit` | No flag on this change's execution path defaults to off, including flags this task did not add but now depends on |
| `vertical_slice` | One test's execution path runs from the entry point through to persistence |
| `spec_trace` | The anchor the task's `trace_to` names exists in the specification |

Before task review, retain the actual criterion evidence, raw logs, owner records,
external receipts, and cited artifacts without inventing another completion record.
Do not write `evidence.json` before the task's validated final `SUMMARY.json` exists.
The review packet admits those actual pre-review observations together with the ledger,
context acceptance, and packet-defined task scope. A structural validator may check
exact fields, types, digests, paths, and freshness observations. It never supplies an
acceptance disposition, turns a model claim into command evidence, or decides semantic pass.
Evidence is a sensor: a gap or legacy v1 record is reported with a migration
diagnostic, never rewritten as v2 truth.

## When implementation and the specification disagree

This is the one backward edge in the whole workflow. Classify before touching the
specification, and classify by outcome rather than reason: does every commitment
the specification already made still hold afterwards? If even one no longer holds
it is a REDUCTION — stop and ask the owner, however good the argument. Log the
classification in the context file's Change Log.

## Close out

Keep the ledger row `in_progress` while running task review through
`../ultra-review/SKILL.md`. Build its immutable packet from the ledger, task context,
packet-defined task scope, and actual pre-review evidence; the final v2 record is not an
admission prerequisite. Route only the exact current P0/P1 findings (or a P2 the owner
explicitly promoted) as one in-scope repair set, followed by one affected-lens delta
review per repair set inside the active review budget — an exact current owner grant
overrides the versioned product default of one initial review plus at most two
P0/P1 delta reviews per package. When another `REQUEST_CHANGES` would exceed the
active budget, return to the owner checkpoint with the exact blocking set instead of
an automatic repair; the same root surviving three failed fixes stops point-patching
and reports an architecture problem. Budget exhaustion stops execution at `owner checkpoint` /
`budget_exhausted` and keeps the ledger row `in_progress`.
It never yields `APPROVE`, `REQUEST_CHANGES`, `INCOMPLETE`, pass, fail, accept, or
abandon. If a repair changes implementation or evidence in review scope, use a new
immutable packet and validated review summary before closeout rather than rebinding the
old review. Worker Packet v1 and its summary do not bind a task worktree digest.

After the final validated `SUMMARY.json`, write one canonical `ultra-task-evidence-v2` record only after completing the raw-receipt binding below.
When the task's owner-designated review mode is external manual, the final review
product is instead the external reviewer's real receipt, bound through the
`review_mode: "external-manual"` branch of
`../ultra-plan/references/task-evidence-v2.md`: publish that receipt under
`.ultra/evidence/<task-id>/`, record its exact stable-byte SHA-256, and verify it
with the sensor's `--verify-external-receipt` mode instead of inventing a strict
session. Never fabricate one branch's artifacts to satisfy the other's shape.
The `subject` is an independently captured completion-snapshot freshness observation.
Before writing `evidence.json`, resolve every
command and external-observation `raw_evidence_ref` below the real repository root and
take bounded stable repository-contained bytes from an ordinary regular non-symlink file
opened nonblocking and no-follow. Reject a missing, escaped, symlinked, special,
oversized, or replaced file; otherwise compute `raw_evidence_sha256` from that one byte
snapshot. Publish that canonical record at `.ultra/evidence/<task-id>/evidence.json`,
read back the stable record and each raw ref,
and require the same ref bytes and digest before continuing.
Follow `../ultra-plan/references/task-evidence-v2.md`: `task_review` separately binds the retained strict summary; record one typed acceptance entry per criterion, all
six dimensions, the exact Execution Packet and review identities, blocking-finding
dispositions, evidence refresh refs, artifacts, limitations, and retention without
claiming that the review summary proves `subject.worktree_digest`. Read the record back, then update context
`## Task Review`, Completion, and `## Resume Note`; the context has no second status.
Only after those facts are durable may the primary model write `completed` to the
ledger and read the row back. When the task's work package sits under an
ACK-ready primary transfer whose newest terminal receipt is a completed v2
RESULT, this sequence is that contract's prescribed closeout: publish the
handoff's `CLOSEOUT.json` beside the frozen RESULT — citing the review receipt,
the closeout-start/end observations, and any recorded owner-authorized
continuation — instead of refreshing the RESULT or opening a new handoff; the
closeout starts no review and no repair round
(`../ultra-change/references/primary-transfer.md`).

If later work invalidates a completed task's criterion evidence, Dev performs an
explicit reopen. A reopen changes the ledger row from `completed` to `in_progress`;
Dev must never silently demote the row. Before that write, record the affected criterion IDs and reason in both the context Change Log and Resume Note, preserve the prior review as
historical evidence, then write and read back the ledger transition. Refresh the named
evidence, run task review for the new snapshot, and repeat this closeout sequence.

Report the changed paths, the seam, the exact checks run, the review result, the
evidence gaps and the residual risk. Recommend the next capability from what the
files now say; do not invoke it.

## When the owner decides

The owner decides any REDUCTION and each external effect separately. At most one
authorized local task commit happens here; push, tag, publish and deploy need separate
authority. An interruption leaves the worktree as-is and names it in the Resume Note.

## References

- `../ultra-change/references/change-contract.md` — canonical Active Change authority resolution.
- `../ultra-tdd/SKILL.md` — read before the first test, for the seam and mock boundary.
- `../ultra-think/references/autonomy-boundary.md` — read when spec and code disagree.
- `../ultra-review/SKILL.md` — read when implementation evidence is ready for review.
- `../ultra-change/references/execution-grant.md` — read only for grant-activated continuation.
- `../ultra-plan/references/task-evidence-v2.md` — canonical evidence, disposition, and task-review shape.
- `references/debugging.md` — read for a reproduced failure before selecting a repair.
