---
name: ultra-status
description: Infer the current Ultra route, baseline gaps, stale evidence, task risk, and installation health from repository files and host manifests. Use when the owner asks what is complete, blocked, stale, unhealthy, or useful to do next.
---

# Route from artifacts without changing them

This router is read-only. It separates verified files, model inference, and unavailable
evidence, then recommends one explicit public capability without invoking it. It never
persists a workflow-position field.

## Route modes

| Mode | Entry | Observable exit | Next |
|---|---|---|---|
| `route` | Owner asks what is current or what to do next | One artifact-derived Route Card names the matched facts, unavailable evidence, and one recommended route | The named explicit route, or `idle` |
| `history` | Owner asks what changed, was rejected, or was superseded | Relevant decisions, Git revisions, archived/abandoned Changes, and unresolved contradictions are summarized without becoming authority | Return to `route` or the owner-selected revision route |
| `installation` | Owner asks whether Ultra is discovered and healthy on a Host | Installed version, provenance, Skill/hook discovery, drift, and reachable repair are reported read-only | Recommend the exact install/update/Doctor repair |
| `delegation` | Owner asks about a worker, handoff, ACP/CLI event, or terminal result | Transport observations and canonical authority are shown separately with a retry/cancel/integration path | Return to the requesting primary route |
| `recovery` | Authority is absent, ambiguous, stale, malformed, or temporarily unreadable | The earliest unsafe or unavailable fact and cheapest safe repair, retry, cancel, abandon, or fresh-session path are named | Recommend only the repair-capable explicit route |

Follow `references/route-contract.md` and use its `UBP Route Card` as the default output,
not an optional appendix. Expand history, installation, delegation, or recovery details
only when requested or needed to explain why the normal route is unavailable. Status is
a `router`: the Owner invokes it for read-only diagnosis, its Host implicit bit remains
off, and it supplies no continuation authority. Other public Skills derive their own
cards from the shared reference rather than invoking Status.

## Before you start

1. Read `../ultra-change/references/change-contract.md` and apply its **Active Change
   authority resolution** before reading any active `intent.md` or relying on a current
   `change_id`. A positively observed absent `.ultra` uses the existing `ultra-init`
   route. Otherwise continue only from the rule's stable zero-or-one result. A typed
   diagnostic stops semantic routing from an ambiguous active Change, but it does not
   stop Status: switch to `recovery` mode and report the diagnostic plus safe Git and
   directory observations without reading any ambiguous `intent.md` as authority. With
   one valid active Change, read `.ultra/tasks.json`, then tasks whose `change_id` matches it and the
   frontier task's `context_file` and `## Resume Note`. `.ultra/tasks.json` is the sole
   task-status authority. A Status or Complexity header in a legacy context is a
   migration diagnostic; the ledger wins. Historical and abandoned tasks never define
   the frontier.
2. After stable authority resolution, read `.ultra/project-brief.md`,
   `.ultra/north-star.md`, `CONTEXT.md`, relevant `.ultra/decisions/`, specifications,
   active, archived, or abandoned Changes, and evidence. In `recovery` mode, read only
   unaffected canonical files and safe directory/Git observations; do not interpret an
   ambiguous active intent. An abandoned Change supplies historical boundary and
   recovery context; it never defines the current route.
3. Inspect Git `HEAD`, worktree status, and installed host manifests without repair.
4. When the active Change records a `durable work-package` Execution Grant, report it
   as recorded authorization data — grant id, cited decision, and its recorded
   subject, scope, topology, allowed effects, budgets, and invalidation — and state
   plainly that stored grant text is inactive until a consuming Agent stably
   verifies it per `../ultra-change/references/execution-grant.md`. Status itself
   neither activates nor continues the grant; a `session-local` grant is reported as
   requiring fresh owner activation.

## Definition of done

- Emit the current Route Card with an exact mode, observable exit, unfinished work, and
  one next route or safe recovery path.
- Evaluate the artifact route in order and name the evidence supporting the match.
- Keep stale test evidence, dirty worktree state, baseline gaps, and task graph risks
  visible without converting them into semantic failure.
- Report exact installation drift and a reachable repair without mutating it.
- Recommend one route and why; never launch it.

## Infer the route

| Observable files and current need | Recommendation |
|---|---|
| No `.ultra/` | `ultra-init` |
| Project Brief has no usable one-line and no legacy `## One-line` exists | `ultra-init` |
| Project Brief or legacy seed exists and North Star status is `unresearched`, legacy, invalid, or not accepted for the current boundary | `ultra-research` |
| A new request exists and no active Change exists | `ultra-change` |
| More than one active Change exists | Diagnose the conflicting directories and ask the owner which one remains active; do not route or move either automatically |
| A primary-transfer handoff directory exists under `.ultra/.runtime/handoffs/` | Report its protocol state read-only (`offered`, `blocked`, `active`, or a terminal state) from `OFFER.json`/`ACK.json`/`RESULT.json`, verified with `node <ultra-change-skill-dir>/scripts/validate_primary_transfer.cjs <repository-root>`; receipts are derived observations, never authority |
| An ACK-ready handoff has no terminal RESULT | The accepted receiver is the sole canonical writer for that work package; report the in-flight transfer and never route canonical writes to another Agent |
| A handoff is `blocked` or its live re-verification is stale | Report the mismatched observation and the recovery path (fresh handoff id after owner re-confirmation); do not repair receipts |
| The active intent is `draft` or has a blocking unresolved decision | `ultra-change` to finish and accept the contract |
| The active `Research Disposition` names required exit evidence that is not satisfied | `ultra-research` for the named question and selected lenses |
| Research evidence exists but the accepted intent has not reconciled it | `ultra-change` to update the bounded contract |
| The accepted North Star revision or digest differs from the active intent trace | `ultra-change`; report the stale observation, preserve old evidence, and reconcile IDs before execution |
| An active Change exists and `.ultra/tasks.json` has no tasks whose `change_id` matches it | `ultra-plan` |
| The Change has exactly one `in_progress` task | `ultra-dev`, naming that task |
| Only `pending` tasks remain (the frontier) | Report them as frontier candidates with their unresolved dependencies and recommend one exact task id for an explicit owner invocation of `ultra-dev`; a pending row is not active work and never auto-selects a route |
| A ledger row says `completed` but its current `ultra-task-evidence-v2` record or task-review binding is missing, stale, or structurally invalid | `ultra-dev` to repair evidence and completion provenance; do not infer a context status or silently demote the row |
| All matching tasks are completed, each has current `ultra-task-evidence-v2` plus a consumed task review, and no current report matches this Change | `ultra-test` |
| A current false report has implementation, test, or wiring findings selected for repair | `ultra-dev` after owner disposition |
| A current false report has missing external or product evidence selected for collection | `ultra-research` after owner disposition |
| A current false report has an acceptance, scope, or existing-promise change selected for reconciliation | `ultra-change` after owner disposition; use `ultra-think` internally for one consequential trade-off |
| Every current finding is explicitly accepted, deferred, or otherwise dispositioned | `ultra-deliver`, subject to its one orphan-export gate |
| Report passed and all report identities match current files | `ultra-deliver` |
| No active Change and no new request | Report the idle state; do not manufacture work |

An explicit `[NEEDS CLARIFICATION]` is evidence of an unresolved field, not proof that
the entire project requires Research. Judge whether it can change the current boundary.
Do not add `research_complete`, a score, or another state bit to replace that judgment.

A test-report is stale when its `change_id` is not the active Change, its `task_ids` are not
the exact ordered ids of tasks whose `change_id` matches that Change, `git_commit`
differs from `HEAD`, or its `worktree.diff_digest` or `intent_digest` differs from
running
`node <ultra-test-skill-dir>/scripts/worktree_digest.cjs --project <repository-root> --change-id <change_id>`.
A dirty worktree is a warning, not evidence of failure.
The product-worktree digest has one fixed boundary: it excludes `.ultra/evidence/**`,
whose command and external-observation entries bind raw bytes as
`raw_evidence_sha256` before stable exact record bytes are bound as `evidence_digest`.
Status must therefore use the exact ordered `task_evidence` projection and strict receipt
consumers below for evidence provenance; it never adds another exclusion or treats
excluded publication bytes as absent evidence.

Freshness also requires the exact ordered `task_evidence` projection. Its
`evidence_digest`, `task_review_session`, and `task_review_summary_digest` must match the
current record and retained review — or, for an `external-manual` record, its
`task_review_receipt_ref` and `task_review_receipt_digest` must match the current
record and the bounded stable receipt bytes reverified through the sensor's
`--verify-external-receipt` mode, and take its `--projection` output verbatim.
Recheck whichever branch the record declares and never rewrite one branch into the
other. For each item, take every command and
external-observation `raw_evidence_ref` to bounded stable
repository-contained bytes from an ordinary regular non-symlink file opened nonblocking
and no-follow, with an 8 MiB ceiling and path/descriptor identity checks around the read.
Recompute `raw_evidence_sha256` from that one snapshot and require an exact match, then
recompute the stable exact `evidence.json` bytes as `evidence_digest` before comparing
the projection. A raw or record mismatch routes to the owning task's explicit Dev repair.
Run
`node <ultra-plan-skill-dir>/scripts/validate_task_evidence.cjs <evidence-ref>`, and
compare `task_id`, `schema`, `evidence_ref`, `task_review_session`, and
`task_review_summary_digest` with the current ledger row, final evidence record, and
retained strict task-review summary. The task evidence `subject` is an independently
captured completion-snapshot freshness observation made after validated task Review and
immediately before evidence publication. Its `task_review` separately binds the retained strict summary; neither Worker Packet v1 nor its nullable summary worktree digest proves
the subject. Do not require that earlier observation to equal the report's later
aggregate worktree digest. Recheck current Acceptance, criterion and verification type,
owner record, review summary, and cited affected artifacts independently.

Replay the report's strict aggregate review summary with the existing Review summary
waiter, then run
`node <ultra-test-skill-dir>/scripts/validate_review_transport.cjs --summary <summary-path> --report .ultra/test-report.json`.
Require the exact `packet_digest`, `admission_digest`, `subject_digest`, and `summary_digest` bindings, plus session, summary path, execution mode, ordered findings, and report root subject.
Each structural validator or sensor reports identity and provenance observations and never decides semantic acceptance, review quality, or `passed`.
Any mismatch makes the report stale and routes repair to the responsible workflow.

`passed: false` does not itself select a repair. Preserve each finding, ask for owner
disposition where scope or risk changes, then route by the accepted response above.
For a current task-review `REQUEST_CHANGES`, consume the exact validated current
`SUMMARY.json.findings` array and preserve every finding id. Route every current P0/P1
to resolution or authoritative disposition and refresh its affected evidence; never
reuse a finding count or list from an older summary. P2 and P3 findings remain report
entries or owner-selected backlog and never re-open a task on their own.
Likewise, ledger completion and structurally valid v2 evidence are necessary for a
current Test claim but never sufficient to manufacture `passed: true`. A validator
reports schema, identity, provenance, and freshness observations only. It cannot decide
whether an inspection supports a criterion, supply an `owner-judgment`, or turn an
external receipt into product truth.

Status remains read-only when later work invalidates a completed task. It names the
affected criterion IDs and reason and recommends Dev. Dev records both in the context
Change Log and Resume Note before the ledger-authoritative `completed` to `in_progress`
transition; Status never silently demotes a task.

A budget stop or `owner checkpoint` is displayed as-is: report the exhausted budget,
the in-progress task it stopped, and the reachable owner decision (extend, retry,
cancel, or abandon). Status never infers continuation, extension, or any semantic
verdict from a budget stop, and never treats a pending frontier row as the active
task behind one.

The repository has one primary writer for canonical `.ultra` files. Native review
workers and delegated CLIs may inspect or write isolated source roots, but their results
return to that writer. Concurrent canonical writes require separate worktrees and
explicit integration; this router does not invent locks or silently merge ledgers.

Report the accepted North Star revision and digest, every active Change trace mismatch,
and unresolved `FP-*`/`NS-*`/`HC-*` reference. A mismatch is stale evidence, never a
mechanical verdict about truth or permission; supersession does not delete prior task,
review, Test, or delivery evidence.

On a fresh session, use the current Change's exact matching contexts and closing Resume
Note to reconstruct the card. Do not rerun completed Research or infer route from chat
memory. In `history` mode, distinguish mutable draft edits from superseding accepted
decision records and keep rejected or abandoned alternatives visible when they explain
the current boundary.

## Surface risk and installation health

List unmet task dependencies, more than one matching `in_progress` task under the
single-writer contract, broken `trace_to` or `context_file` paths, stale subject or
acceptance identities, unresolved task-review findings, and concrete evidence that a
task can no longer resume reliably. A timestamp, complexity value, file count, or task
count is context for the model, never a staleness or quality verdict.

Compare the selected host's plugin path, skill inventory, version, provenance, and hook
manifest with installed files. Recommend `ubp install` or `ubp update` as the repair;
this read-only Skill never performs it.

## When the owner decides

The owner chooses the next public workflow, risk disposition, and any reinstall.
Contradictory facts remain visible instead of being resolved by routing heuristics.

## References

- `../ultra-change/references/change-contract.md` — canonical Active Change authority resolution.
- `references/route-contract.md` — canonical Route Card, checkpoint, continuation, and recovery contract.
- `../ultra-think/SKILL.md` — read only when contradictory evidence creates one real
  decision rather than a mechanical repair.
- `../ultra-think/references/autonomy-boundary.md` — read before recommending a route
  that would reduce an accepted commitment.
