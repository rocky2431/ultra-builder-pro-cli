# Task ledger, context, and evidence v2

Use this contract when Plan creates a task or when Dev refreshes completion evidence.
The ledger owns mechanical task status. A task context contains meaning and resume
information but does not repeat `status`, `priority`, or `complexity` in a metadata
header. A legacy header is readable only as an observation; the ledger wins and the
reader reports a migration diagnostic.

## Ledger and context

The ledger root is exactly `$schema` plus `tasks`, with `$schema` set to
`ultra-task-ledger-v2`. A current task row has these fields:

```text
id, title, type, priority, status, dependencies, context_file, trace_to, change_id
```

Legacy rows may retain `complexity`; do not use it to decide task, file, question,
finding, repair-round, or quality limits. The Acceptance section in every current
context starts with the Change Acceptance IDs and this exact table:

```markdown
| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
```

Criterion IDs are unique inside one task. Verification type is exactly `command`,
`inspection`, `owner-judgment`, or `external-observation`. The required-evidence cell
names evidence that can actually establish the criterion; it is not a second status.

## Evidence root

`.ultra/evidence/<task-id>/evidence.json` is the one final completion record. It uses
`ultra-task-evidence-v2` and the exact ordered root fields below:

The product-worktree digest has one fixed boundary: it excludes `.ultra/evidence/**`,
whose command and external-observation entries bind raw bytes as
`raw_evidence_sha256` before stable exact record bytes are bound as `evidence_digest` by
aggregate Test. This makes evidence publication and refresh non-self-referential without
hiding provenance. No workflow supplies an additional exclusion.

```text
$schema, task_id, change_id, context, subject, acceptance, dimensions,
task_review, artifacts, limitations, timestamp
```

`context` is exactly `{path, acceptance_sha256}`. Hash the UTF-8 bytes beginning with
the `## Acceptance Criteria` heading and ending immediately before the next level-two
heading. Do not bind the whole mutable task context. `subject` is exactly
`{git_head, worktree_digest, observed_at}`. The `subject` is an independently captured
completion-snapshot freshness observation: capture it after the final strict task Review
validates and immediately before evidence publication. `task_review` separately binds
the retained strict summary. Worker Packet v1 carries no worktree digest and its
`SUMMARY.json` records `worktree_digest: null`, so neither review artifact proves or
cryptographically binds `subject.worktree_digest`. The subject is not rebound to a later
aggregate Change worktree.

Each acceptance item is exactly:

```json
{
  "criterion_id": "A-01",
  "verification_type": "inspection",
  "evidence": {
    "source": "path/to/source",
    "observation": "The observable fact.",
    "revision": "the observed revision"
  },
  "disposition": {
    "authority": "model",
    "result": "satisfied",
    "rationale": "Why the evidence supports this disposition."
  }
}
```

`result` is `satisfied`, `gap`, or `not_applicable`. The validator checks the record's
shape and authority token. It never infers the result from an exit code, digest,
counter, validator success, or model assertion.

## Typed evidence

Use exactly one evidence object for each criterion:

- `command`: `{command, cwd, exit_code, raw_evidence_ref, raw_evidence_sha256,
  freshness_identity}`, where freshness identity is
  `{git_head, worktree_digest, observed_at}`.
- `inspection`: `{source, observation, revision}`.
- `owner-judgment`: `{owner_record_ref, owner_statement_or_disposition}`. Its
  disposition authority must be `owner`; the model and validator cannot satisfy it.
- `external-observation`: `{provider, run_id, observed_at, raw_evidence_ref,
  raw_evidence_sha256, observation}`.

`raw_evidence_sha256` is the lowercase SHA-256 of the exact bytes named by
`raw_evidence_ref`. The structural validator requires a normalized, mechanically safe
repository-relative ref and an exact 64-hex digest; structural mode does not dereference
the ref. Dev, Test, Status, and Deliver resolve it below the real repository root, require
every parent and the final file to remain repository-contained and non-symlink, open the
final ordinary regular file nonblocking and no-follow, cap the snapshot at 8 MiB, and
compare path and descriptor identity before and after reading. They hash only that one
bounded stable byte snapshot. A missing, special, symlinked, escaped, oversized, or
replaced ref is a typed evidence gap with retry or owning-task repair, never accepted
provenance.

`dimensions` contains exactly `tests_written`, `tests_passed`, `persistence_real`,
`feature_flags_audit`, `vertical_slice`, and `spec_trace`. Each dimension is an explicit
`{status, evidence_refs, rationale}` observation; its status uses the same three result
tokens and is not a semantic score.

## Task review

First-review admission does not consume this final record. It consumes the ledger's
`in_progress` row, the task context and acceptance bytes, the immutable review packet,
and actual pre-review evidence already observed at the four typed authorities. Raw
outputs and citations may exist before review, but they do not form another evidence
schema, completion record, or task-status authority. Do not write `evidence.json` before the task's validated final `SUMMARY.json` exists.

`task_review` is exactly:

```json
{
  "execution_packet": {
    "state": "available",
    "digest": "<sha256>",
    "limitation": null
  },
  "session_id": "<review-session>",
  "summary_ref": ".ultra/reviews/<review-session>/SUMMARY.json",
  "summary_digest": "<sha256>",
  "blocking_findings": [
    {
      "id": "<finding-id>",
      "resolution": "<what changed>",
      "disposition": "<resolved, accepted risk, or still a gap>",
      "evidence_refresh_refs": ["<fresh evidence>"]
    }
  ],
  "retention": "<when the derived review may be removed>"
}
```

For work that predates Execution Packet v1, use `state: pre-v1-unavailable`, a null
digest, and a non-empty limitation. Never manufacture a bootstrap digest. Keep the task
`in_progress` through implementation and blocking review repair. If a repair changes
implementation or evidence in review scope, create and validate a new immutable review
session before closeout; do not claim that Worker Packet v1 binds the resulting worktree.

### Task-review provenance branches

`task_review` carries exactly one of two discriminated provenance branches. Records
with no `review_mode` field remain the strict-v4 branch, so every existing v2 record
and aggregate projection stays valid without migration.

The **strict-v4 branch** (`review_mode: "strict-v4"` or absent) is exactly the shape
above: a real retained `.ultra/reviews/<session>/SUMMARY.json` identity consumed by
the review waiter and the transport validator.

The **external-manual branch** (`review_mode: "external-manual"`) binds one real
repository-relative JSON receipt published by the owner-designated external reviewer
under `.ultra/evidence/<task-id>/`, never under `.ultra/reviews/`:

```json
{
  "review_mode": "external-manual",
  "execution_packet": { "state": "pre-v1-unavailable", "digest": null, "limitation": "..." },
  "receipt_ref": ".ultra/evidence/<task-id>/external-review.json",
  "receipt_sha256": "<sha256-of-exact-receipt-bytes>",
  "blocking_findings": [],
  "retention": "Retain the exact external receipt bytes; it is a reconstructable observation, never semantic authority."
}
```

The receipt itself uses `$schema: ultra-external-review-receipt-v1` with exactly
`reviewer` (identity), `reviewer_role: "read-only"`, `task_id`, `change_id`,
`reviewer_authority` (`ref` + `sha256` of the owner record authorizing the external
review mode/reviewer), `reviewed_contract` (`ref` + `sha256` of the reviewed
contract bytes), `subject` (`git_head` 40-hex + `worktree_digest` 64-hex of the
reviewed product worktree), `verdict` (`approve | request_changes`), `findings` (an
exact array of `{id, severity, title}` with severity P0–P3 and unique ids), and an
RFC 3339 `timestamp`. It is a reconstructable observation of who reviewed what bytes
with what result — it is not semantic authority, not owner acceptance, and never a
fabricated strict SUMMARY/ADMISSION/session. Only current P0/P1 (or owner-promoted)
receipt findings may appear in `blocking_findings`, and the blocking disposition id
set must equal exactly the receipt's P0/P1 id set: `approve` is rejected with any
unresolved P0/P1, `request_changes` with none, and P2/P3 stay recorded and
non-blocking.

Receipt verification is mandatory: the normal canonical sensor invocation below
verifies an external-manual record's receipt automatically, and
`--verify-external-receipt` remains a compatible alias:

```bash
node skills/ultra-plan/scripts/validate_task_evidence.cjs \
  .ultra/evidence/<task-id>/evidence.json
```

The sensor reuses one canonical stable bounded no-follow repository-chain snapshot
for the receipt, the reviewed contract, and the reviewer-authority record: the real
repository root and every managed parent must stay ordinary non-symlink directories
(identities rechecked after reading), and the final entry must be an ordinary
regular file. It checks only authority/provenance facts: safe normalized receipt
location inside the task's evidence directory and outside `.ultra/reviews/`, exact
stable bytes against `receipt_sha256`, the exact receipt schema, task/change
identity equality with the evidence, reviewed HEAD and product-worktree digest
equality with the completion subject, exact stable bytes and digests for the
reviewed contract and the reviewer-authority record, well-formed severities, the
exact blocker/verdict set, and that every blocking disposition binds a P0/P1
finding that actually exists in the receipt. A missing, malformed, symlinked,
special, escaped, oversized, replaced, digest-mismatched, identity- or
subject-mismatched, unbound-contract, unbound-authority, or substituted receipt
returns typed reachable repair and is never treated as accepted. It never infers
semantic acceptance: an `approve` verdict is a recorded observation, and owner
acceptance remains a separate owner-judgment.

The same invocation with `--projection` emits, after successful verification, the
exact branch-specific aggregate Test projection item for the record. A strict-v4
record keeps the byte-compatible
`{task_id, schema, evidence_ref, evidence_digest, task_review_session,
task_review_summary_digest}` shape; an external-manual record carries
`{task_id, schema, evidence_ref, evidence_digest, task_review_mode:
"external-manual", task_review_receipt_ref, task_review_receipt_digest}` instead.
Test, Status, and Deliver consume that mechanical result verbatim; a strict session
identity can never substitute for the receipt fields and neither branch's
projection is rewritten into the other's. The projection is withheld whenever any
diagnostic is present.

Aggregate Test, Status, and Deliver preserve and recheck the declared branch: strict
items replay the retained strict summary through the existing waiter and transport
consumers; external-manual items take the bounded stable receipt bytes, recompute
`receipt_sha256`, and rerun the sensor's verify mode instead. An aggregate
projection item for an external-manual task substitutes
`task_review_mode: "external-manual"` plus `task_review_receipt_ref` and
`task_review_receipt_digest` for the strict `task_review_session` and
`task_review_summary_digest` fields; strict items keep their existing exact shape.
No consumer may rewrite one branch into the other or accept a strict SUMMARY where
the branch declares an external receipt.
When the newest current-subject summary returns `REQUEST_CHANGES`, consume its exact
validated `findings` array rather than a count or list copied from any historical summary.
Preserve every finding id, resolve or authoritatively disposition every current P0/P1,
and refresh each affected evidence reference before creating one fresh subject and
review. The blocking disposition set binds only current P0/P1 findings (or a P2 the
owner promoted after the current review reclassified it as P1 on evidence); P2 and P3
findings stay recorded in the retained summary as non-blocking backlog and never block
closeout, and no consumer may implicitly promote them to blockers inside the same task.
A later summary may contain a different set; that current exact set controls
recovery.
After the final validated `SUMMARY.json`, independently capture the completion subject and immediately write one canonical `ultra-task-evidence-v2` record with its separate exact task-review binding.
Write `completed` to the ledger only after every blocking finding has a disposition,
relevant evidence is refreshed, the canonical record and context review facts are
durable, and both are read back.

If later work invalidates a completed task, reopening is an explicit recovery action.
A reopen changes the ledger-authoritative row from `completed` to `in_progress`; there
is no silent demotion. Before the transition, record the affected criterion IDs and reason in both the context Change Log and Resume Note. Preserve the prior frozen review
as historical evidence, read the ledger write back, refresh only the affected evidence,
obtain a new final review, then capture and publish a new completion subject.

## Aggregate Test projection

The v2 Test template carries ordered `task_evidence` immediately after `task_ids`.
Every item is exactly:

```json
{
  "task_id": "<task-id>",
  "schema": "ultra-task-evidence-v2",
  "evidence_ref": ".ultra/evidence/<task-id>/evidence.json",
  "evidence_digest": "<sha256>",
  "task_review_session": "<review-session>",
  "task_review_summary_digest": "<sha256>"
}
```

The evidence digest already binds `context.acceptance_sha256`; do not copy that field
into the Test projection. Historical `ultra-task-evidence-v1` remains readable and is
classified `legacy-v1`, but it cannot support a new v2 completion claim without an
honest migration.

The projection preserves each task's independently captured completion-snapshot
freshness observation and its separate task-review provenance. Aggregate Test binds its
report subject independently to the current whole Change; it never requires an earlier
task `subject.worktree_digest` to equal that aggregate digest and never treats the
retained task-review summary as proof of the completion subject. Instead it independently
rechecks the current Acceptance bytes, typed criterion IDs and verification types,
retained strict task-review summary, durable owner records, and every cited affected
artifact. An invalidated item uses the explicit reopen path above.

Run the structural sensor with:

```bash
node skills/ultra-plan/scripts/validate_task_evidence.cjs \
  .ultra/evidence/<task-id>/evidence.json
```

The sensor resolves one input path and captures at most 8 MiB from a regular,
non-symlink file opened nonblocking and no-follow where the platform supports it. It
compares path and descriptor identity before and after the read, decodes the captured
bytes as strict UTF-8, and parses JSON from that same snapshot. Typed `input_*`
diagnostics return control for retry when the path is missing, replaced, oversized,
non-regular, a symlink, invalid UTF-8, or invalid JSON.
