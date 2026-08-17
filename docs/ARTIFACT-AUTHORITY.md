# Ultra artifact authority

This document defines which project artifacts carry semantic authority, who may change
them, how staleness is detected, and how recovery works in Ultra Builder Pro. Since the
accepted 3.0 design it is the per-fact expression of the Ultra Core Protocol: one
canonical representation per semantic fact, explicit authorization, bounded effects,
and reachable recovery, on files plus Git alone.

## Rules

1. One semantic fact has one canonical representation.
2. Owner intent and accepted reductions require owner authority.
3. The model may interpret, decompose, investigate, and edit inside the authorized frame.
4. Generated observations are disposable and never silently promoted.
5. Git supplies revision identity, history, archive moves, comparison, and rollback.
6. A Change keeps one stable `change_id`; directory position records lifecycle, not identity.

## Routing precedence

When workflow-route signals conflict, consumers resolve them in this order:

1. the current explicit owner instruction, accepted decisions, and external-effect
   authorization;
2. the current accepted North Star and the active Change intent;
3. the current owner-issued Execution Grant — `session-local` while its conversation
   activation is live, or a `durable work-package` grant a fresh Agent has stably
   verified — its scope, budget, and allowed workflows;
4. the task ledger, task acceptance, planned paths, and dependencies;
5. the current validated Review SUMMARY verdict;
6. current evidence and Test observations;
7. the Resume Note;
8. Hooks, progress records, compact snapshots, historical reviews, and other
   derived observations.

A lower layer never overrides a higher one. A conflict produces a typed diagnostic,
preserves the original bytes, and routes to the nearest repair or owner checkpoint;
nothing silently selects the "safer" semantic result. The Resume Note is
navigational context — the current checkpoint, the next action a higher authority
has already allowed, unresolved prerequisites, and the cheapest safe resume command
or path — and never route authority: it cannot rewrite acceptance, a Review verdict,
scope, or budget, and it cannot promote P2/P3 findings into blockers or reopen a
review that returned a current verdict. Historical reviews, progress records, and
Hook observations are provenance only.

A formal terminal outcome — an accepted result, an owner decision, an external
blocker, a review-budget stop, or an abandonment — outranks every Resume, Hook, or
Status suggestion that appears to continue the same work. Review stays inside the
budget accepted for the work package, under one precedence rule: an exact current
owner grant overrides the versioned product default — the released default is one
initial Review plus two P0/P1 delta Reviews. Budget exhaustion with a remaining
blocker returns the choice to the owner instead of another round; no Agent,
reviewer, Hook, or control plane extends a budget itself, and the same root
surviving three failed fixes stops point-patching and reports an architecture
problem.

## Effect classes

Every action belongs to exactly one class, and the class fixes who may perform it:

| Effect class | Examples | Default rule |
|---|---|---|
| `observation` | read-only source inspection, search, test listing | an Agent may act freely inside its task scope |
| `local-reversible` | editing files inside the authorized worktree, running local tests, creating deletable temporary files | allowed inside an accepted work package with a recovery point |
| `canonical-authority` | modifying the North Star, an active intent, task status, or an evidence verdict | one designated writer per fact; material semantic deltas return to the owner |
| `external-or-irreversible` | commit, push, tag, publish, deploy, real installation, provider spend, credential or production mutation | one separate owner authorization per effect; capability or readiness never implies permission |

A durable work-package grant may cover exact `local-reversible` execution and the
canonical status writes it names explicitly. It never inherits
`external-or-irreversible` effects by default; those require the owner to list each
one in the grant and the consuming Agent to verify the listing is current.

## Owner checkpoint semantics

Every owner-facing checkpoint — the WIP at a stop, a task's closing Resume Note, a
delivery report, or a review's owner handoff — answers eight fixed semantics, in
whatever length keeps the owner able to judge:

1. **Why** — the real problem being solved.
2. **Outcome** — what difference the owner will see.
3. **Accepted boundary** — what is accepted, and what explicitly is not.
4. **Delta** — what materially changed since the last checkpoint.
5. **Reality** — how far the live path actually works; what is still fake, unknown,
   or unverified.
6. **Decision needed** — what the owner must decide now; omit the section when
   nothing is genuinely blocking.
7. **Next bounded action** — the smallest authorized next step.
8. **Not done** — what remains owed when stopping or pausing.

A checkpoint is a cognitive interface, not a mechanical stage marker: no line count,
token budget, or coverage percentage gates it, and alignment failure ("I don't know
what you are doing", or the same concept re-explained repeatedly) stops execution and
review until the owner re-accepts an outcome.

## Canonical artifacts

| Artifact | Canonical content | Primary writer | Required readers | Staleness or conflict signal |
|---|---|---|---|---|
| `.ultra/project-brief.md` | Raw owner intake, broad outline, explicit inputs, and open Research questions | `ultra-init`, owner correction | research, status; session Hook before an accepted baseline exists | owner correction or a recovered legacy one-line; never rewritten as researched truth |
| `.ultra/north-star.md` | Accepted project direction, outcome or metric decision, hard constraints, and exclusions | `ultra-research` after owner acceptance; owner correction | every workflow; session Hook | accepted correction, superseding decision, or evidence conflict |
| `.ultra/specs/product.md` | Product behavior and acceptance | research establishes; change/delivery reconcile touched sections | change, plan, dev, test, review, delivery | source/evidence conflict or unresolved marker |
| `.ultra/specs/architecture.md` | Boundaries, authority, consumers, failure and recovery | research establishes; change/delivery reconcile touched sections | change, plan, dev, test, review, delivery | live-path evidence conflicts with text |
| `.ultra/specs/discovery.md` | observations, unknowns, drift, and evidence queue | research; change for its scoped delta | research, change, status | evidence resolves or overturns an entry |
| `.ultra/specs/research-distillate.md` | bounded synthesis of specification state | `ultra-research` | change, plan, delivery | stored source blob hash differs from Git blob hash |
| `CONTEXT.md` | ubiquitous language and relationships | `ultra-domain-modeling`, first called by research and later by any qualifying workflow | every workflow and test naming | source/product use reveals ambiguity |
| `.ultra/changes/{active,archive,abandoned}/<id>/intent.md` | one bounded requested outcome, reconciliation, Research Disposition, stable identity, and exact Abandonment closure when abandoned | `ultra-change`; Planning Posture by `ultra-plan` | active: research through delivery; all states: status and future Change history | more than one active Change, duplicate id across positions, missing Abandonment closure, or acceptance/scope change |
| `.ultra/tasks.json` | `ultra-task-ledger-v2`: append-only task identity, stable `change_id`, same-Change graph, sole task status, trace, and context path | `ultra-plan` / `ultra-dev` | every user workflow and context Hook | dependency crosses Change, row shape is invalid, or a named context cannot be resolved |
| task `context_file` | typed acceptance, seams, implementation, evidence pointers, Completion, Task Review, Resume Note; no v2 task status | plan/dev | dev, test, review, status, delivery, resume | acceptance identity, evidence pointer, or implementation differs from current source; a legacy Status or Complexity field is a migration diagnostic |
| `.ultra/decisions/<id>.md` | durable consequential owner decision | `ultra-think` after acceptance | every workflow in scope | superseded by a newer decision file |
| active Change `## Execution Grant` | the current work package's execution authorization: mode (`session-local` default or `durable work-package`), scope, Agent topology, allowed local effects, budgets/expiry, invalidation, and revoke; the exact durable grant bytes live in the cited owner decision, never in a second prose mirror | owner issues; `ultra-change` records the exact reference and fields; no workflow may widen it | executor, handoff, Status | a new Change, a recorded owner revocation, or a fired invalidation condition; stored grant text alone never activates |
| `.ultra/evidence/<task-id>/...` | one final `ultra-task-evidence-v2` record: typed acceptance evidence, six dimensions, independent completion-snapshot freshness observation, separate task-review provenance, raw-output refs, and limitations | `ultra-dev` after validated task review | test, delivery; review consumes actual pre-review evidence instead | context acceptance, completion observation, cited artifacts, or review binding differs, or a legacy record has not been migrated |
| `.ultra/test-report.json` | whole-system audit, ordered task-evidence identities, strict aggregate-review provenance, findings, and owner disposition for one Change/task/intent/product snapshot | `ultra-test`; `ultra-deliver` may add owner disposition without changing findings or `passed` | status and delivery | root identity, ordered task-evidence projection, or packet/admission/subject/summary review binding differs |
| `.ultra/changes/active/<id>/delivery.md` | outcome, docs, verification, review, debt, risk, recovery, effects | `ultra-deliver` | owner and archived Change history | active evidence or accepted scope changes |
| `.ultra/research/<run-id>/<step-id>.md` | cited investigation report for one selected lens | `ultra-research` | specs, change, plan, delivery | newer sources or later superseding run |

The repository files may use prose, tables, or JSON as appropriate. The format is not
authority by itself; the canonical path and accepted writer contract are.

The append-only task ledger preserves sequential Change history. Current readers select
only rows whose `change_id` matches the one unique active Change. Moving its directory
to archive or abandoned never rewrites task identity, and an unfinished historical row
never becomes current merely because of its status. Before an abandoned move,
`ultra-change` appends `## Abandonment` with the owner decision, reason, reusable
evidence, and recovery or successor. Future Change reconciliation and Status consume
that record as history, not as accepted current intent.

Every current completed task has exactly one final
`.ultra/evidence/<task-id>/evidence.json` with schema `ultra-task-evidence-v2`. The
canonical field and type contract lives in
`skills/ultra-plan/references/task-evidence-v2.md`; this document does not duplicate it.
The record binds the task and Change, context acceptance bytes, typed acceptance
evidence and dispositions, all six evidence dimensions,
task-review provenance, artifacts, limitations, and timestamp. `command`, `inspection`,
`owner-judgment`, and `external-observation` retain separate evidence authorities. The
owner alone supplies an owner-judgment result. The CLI establishes only JSON shape,
token syntax, and authority designation; it does not prove current identity, provenance,
freshness, or semantic acceptance. Test takes stable bytes independently, recomputes the
Acceptance-section SHA-256, aligns exact criterion IDs and verification types with the
current context, and aligns task-review session and summary digest with the retained strict summary. The `subject` is an independently captured completion-snapshot freshness observation made after the final strict task Review validates and immediately before
evidence publication. Its `task_review` separately binds the retained strict summary.
Worker Packet v1 and its summary's null `worktree_digest` do not prove or
cryptographically bind the completion subject. Test separately binds its report to the
current whole Change, then rechecks the current Acceptance, criterion IDs and verification
types, owner record, review summary, and cited affected artifacts instead of demanding
digest equality with the earlier task observation.
For `owner-judgment`, the durable owner record must exist and its cited statement and
disposition must remain readable. Any mismatch is an evidence gap returned to Dev or,
for missing owner judgment, to the owner. Optional raw logs live beside the record and
do not create another summary. Historical v1 records stay readable evidence but produce
a migration diagnostic and cannot satisfy a current Change's Test or Deliver input.

Task-review provenance has two discriminated branches with one authority rule: a
strict-v4 record binds its retained strict session artifacts, while an
`external-manual` record binds a real external-reviewer receipt under
`.ultra/evidence/<task-id>/` by exact stable bytes and SHA-256 through the task
evidence sensor's verify mode. The external receipt is a reconstructable observation
of reviewer identity, reviewed subject, verdict, and exact findings — never semantic
authority, never owner acceptance, and never a substitute strict
SUMMARY/ADMISSION/session. Consumers recheck whichever branch a record declares and
never rewrite one into the other.

## Mutable workflow state

Pure file state uses three mechanisms:

- directory position, such as `changes/active/` versus `changes/archive/`;
- an explicit field, such as task status in `.ultra/tasks.json`;
- an on-the-spot model judgment that is not persisted as state.

A state field records a mechanically checkable fact. Route selection remains a model
judgment. Do not add a workflow-position field merely to decide which Skill should run.

At most one Change is active in one worktree. Zero active Changes is valid before a new
request and after delivery; completed current tasks may remain active while awaiting
Test or Deliver. More than one active directory is a conflict for owner/model repair,
not a reason for code to select the first entry.

Task status has one writer and one authority: `.ultra/tasks.json`. New contexts carry no
Status field. A legacy context Status or Complexity header is preserved as a migration
diagnostic, but the ledger wins. During implementation the row remains `in_progress`.
Task-review admission uses that row, task context, an immutable review packet, and
actual pre-review evidence; it does not require the final record it is helping create.
After the final summary validates, Dev writes the one canonical evidence record with
every blocking finding, resolution or authoritative disposition, and affected evidence
refresh. Only after that record and the context review facts are current may the primary
model write `completed` to the ledger and read the row back. A validator may check this
ordering and its references; it cannot decide that a finding is semantically resolved.

Later invalidation uses one explicit recovery edge. The ledger-authoritative row changes
from `completed` to `in_progress`; Dev must never silently demote it. Before the write,
Dev records the affected criterion IDs and reason in the task context Change Log and Resume Note.
It preserves the old frozen review as history, then writes and reads back the ledger
transition. New evidence and review close the task again through the same path.

## Single-writer boundary

One primary host model writes canonical `.ultra` files in a worktree. Native review
workers are read-only sensors, and delegated CLIs write only declared non-`.ultra`
roots in isolated registered worktrees; their findings return to the primary writer.
Parallel implementation uses separate worktrees and explicit Git integration. Ultra
does not add a lock service or semantic state machine to make concurrent canonical
writes appear safe.

The primary writer of a work package changes only through an owner-granted primary
transfer (`skills/ultra-change/references/primary-transfer.md`): a derived OFFER
binding canonical refs/hashes, HEAD, and worktree digest; a receiver ACK that is
ready only on full stable-read match; sole-writer execution; and a frozen terminal
RESULT. A delegated worker never becomes the canonical writer, and a delegation
receipt never serves as an ACK or RESULT. While an ACK-ready transfer is open, at
most that one receiver may write canonical files.

## Decisions and reductions

Write a durable decision only when it is difficult to reverse, surprising without
context, and the result of a real trade-off. All three conditions are required.

An accepted decision file is append-only history. A changed answer creates a new file
with `supersedes`; it does not rewrite the prior decision.

Classification of a specification change is outcome-based:

- `EXPANSION`: adds a commitment while all prior commitments remain true;
- `CORRECTION`: changes an inaccurate description while every prior product commitment
  still holds in the result;
- `REDUCTION`: any prior commitment stops holding, regardless of the justification.

Only the owner may accept a reduction.

## Evidence promotion

Tool output, source inspection, external sources, and runtime observations begin as
evidence. The model may use them to update a canonical specification when their scope
and provenance support the claim. The evidence is retained or cited; it is not copied
into a second semantic ledger.

A test result is current only for the code and environment it exercised. A report must
carry the exact command, exit code, stable Change id, exact current task ids, intent
SHA-256, Git commit, product-worktree digest, ordered v2 task-evidence identities, and
strict aggregate-review packet, admission, subject, and summary bindings. Delivery
metadata and moving the same Change between active and archive do not alter the product
digest. The product-worktree digest has one fixed boundary: it excludes
`.ultra/evidence/**`, whose command and external-observation entries bind exact raw bytes
as `raw_evidence_sha256` before stable record bytes are bound as `evidence_digest`
through the ordered task-evidence projection. Test, Status, and Deliver independently
recompute both bindings from bounded stable repository-contained regular non-symlink
files; exact review receipts retain their own digest and consumer checks. No writer may
add a caller-selected exclusion. Changing intent bytes does alter `intent_digest`.
Missing or stale evidence remains
`not_run`, `unknown`, or `stale`; it is never inferred as passing.

## Derived artifacts

These paths are intentionally non-authoritative:

| Path | Purpose | Recovery |
|---|---|---|
| `.ultra/research/<run-id>/brief.md` | optional Wayfinding question map for a multi-lens Research run | rebuild from Project Brief, accepted authority, evidence needs, and owner checkpoints |
| `.ultra/.runtime/compact-snapshot.md` | compaction acceleration | rebuild from files and Git |
| `.ultra/.runtime/delegations/` | delegated process receipts and logs | inspect result or rerun with new id |
| `.ultra/.runtime/handoffs/` | primary-transfer OFFER/ACK/RESULT receipts, plus the optional CLOSEOUT receipt of the one prescribed post-review closeout | create a fresh handoff id from canonical authority; never reconstruct an old ACK or RESULT; close out a newest completed v2 RESULT by publishing its CLOSEOUT receipt, never by refreshing the RESULT or opening a handoff for the closeout |
| `.ultra/.runtime/worktrees/` | delegated checkout locations | inspect Git worktrees and remove safely |
| `.ultra/progress/<task-id>.json` | mechanical evidence observations | rerun sensors or inspect current diff |
| `.ultra/reviews/<session>/` | `WORKER-PACKET.json`, `ADMISSION.json`, selected specialist artifacts, and `SUMMARY.json` | retain a current strict session through successful aggregate Test and Deliver consumption; after premature loss, run a fresh Review and Test and never reconstruct the old receipt |

The canonical template's nested `.ultra/.gitignore` ignores `.runtime/`, `progress/`,
and `reviews/` without rewriting the owner's repository-level ignore rules. A current
strict review session contains `WORKER-PACKET.json`, `ADMISSION.json`, every selected
specialist artifact, and `SUMMARY.json`; it may be garbage-collected only after aggregate Test and
Deliver have both consumed it successfully. Premature loss requires a fresh Review and
Test, never reconstruction of the old receipt. Subject to that retention window,
deleting derived paths cannot delete accepted product intent, task contracts, or
decisions.

## Recovery order

After interruption or host change:

1. identify the repository root and current `HEAD`;
2. resolve zero or one active `change_id`, then read `.ultra/tasks.json`;
3. select only matching tasks and read the frontier task's full context and closing Resume Note;
4. read the Project Brief, accepted North Star, `CONTEXT.md`, relevant decisions, active
   Change, specifications, and evidence;
5. inspect the working tree and compare it with Completion and evidence claims;
6. rely only on ledger task status; preserve any legacy context Status or Complexity as
   a migration diagnostic, and use the explicit recorded reopen before repairing an
   invalid completed task's current v2 evidence or task-review bindings;
7. continue through the next observable acceptance boundary.

Hooks and the `ubp` executable may be unavailable. Recovery must still work through
these files and Git alone.
