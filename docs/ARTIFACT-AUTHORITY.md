# Ultra artifact authority

This document defines what `.ultra/` remembers across sessions, which surface owns
each fact, and how working output becomes durable Ultra authority.

## Boundary

`.ultra/` is the project-local cross-session workflow-memory envelope for Ultra
Builder Pro. It retains normalized intent, lifecycle progress, tasks, bounded execution
context, specifications, evidence, provenance, recovery state, and external provider
references. It is not a general conversational-memory system and does not retain raw
prompts, transcripts, chain-of-thought, general episodic summaries, or code-graph
payloads.

Semantic and evidence artifacts under `.ultra/` are trackable so reviewed intent and
verification can travel with the repository. `.ultra/.runtime/` is always ignored:
the SQLite authority, leases, worktrees, local telemetry, and recovery snapshots remain
checkout-local. `.ultra/tasks/tasks.json` is the narrow MCP-owned Git handoff for
portable baseline, Change, Decision, accepted Stage Checkpoint, and durable Task
records; it is not a copy of live runtime state.

## Artifact classes

| Class | Examples | Authority |
|---|---|---|
| Checkout-local persistence and safety | `.ultra/.runtime/state.db` | Operational authority for identifiers, normalized accepted intent, accepted Stage Checkpoints, references, digests, freshness, provenance, locks, leases, transactions, recovery, and coordination in one checkout; never semantic route selection |
| Git team checkpoint | `.ultra/tasks/tasks.json` | MCP-published, digest-chained handoff of portable baseline, Change, Decision summary/reference, accepted Stage Checkpoint, Task contract, dependency, and durable outcome records; never live Session or lease authority |
| Digest-bound semantic artifacts | specifications, research reports, Change intent/delta/plan, Context Envelopes, Decision Records | Authoritative semantic bodies only while registered by the owning record or Stage Checkpoint and matching its recorded digest |
| Digest-bound evidence artifacts | test, review, delivery, and verification reports | Authoritative evidence bodies only while registered, immutable where required, and matching the recorded digest and scope |
| Generated projections | `.ultra/.runtime/projections/tasks.json`, generated task contexts, activity exports | Checkout-local read-only views derived from DB authority; manual edits are overwritten and never become authority |
| Advisory recovery | `.ultra/.runtime/checkpoint.json` | Compact recovery hint derived from DB authority; stale or missing content never overrides the DB |
| Working scratch | `.ultra/.runtime/collab/`, temporary session output, incomplete drafts | Non-authoritative working material until verified and promoted through a supported workflow write |
| External provider references | memory or code-graph provider name, scope, version, stable reference, freshness metadata | Metadata-only context stored by Ultra; the provider remains authority for its payload |

The DB is not expected to contain every semantic paragraph. It owns checkout-local
lifecycle and the binding between a fact and its current content. A digest-bound file
owns the registered semantic or evidence body. The team checkpoint moves a reviewed
portable subset through Git and is merged into the receiving DB through MCP. None of
these surfaces independently owns all three roles.

## Human, model, and mechanical responsibilities

| Actor | Responsible for | Must not do |
|---|---|---|
| Owner | Goals, acceptance, non-goals, material choices, risk acceptance, and authorization for irreversible or external effects | Supply facts the checkout or runtime can establish directly |
| Host model | Inspect evidence, recommend a route, ask only for unresolved owner choices, normalize the answer, call the owning write, update semantic artifacts, read back the result, and present the next recommendation | Fabricate evidence, infer owner authorization, or bypass mechanical safety |
| Ultra MCP | Persist normalized inputs, validate structure/current bytes/digests, record facts and provenance, commit caller-declared Stage Checkpoints, project local views, publish/import the Git checkpoint, and expose recovery | Judge semantic completeness, choose product direction, prove a UI click, pre-authorize reasoning steps, force a semantic route, or replace model judgment |
| Host adapter | Render the shared interaction contract through the host-native question and tool surfaces | Become a second workflow authority |
| Hook | Observe lifecycle, inject compact DB-derived recovery context, and protect MCP-owned checkpoint and generated projection paths | Select a semantic route or block ordinary development |

## Intent persistence

The interaction sequence is:

```text
inspect -> suggest -> host-native ask -> normalize -> persist -> apply -> read back
```

The host-native ask is conditional. An explicit owner instruction can already resolve
a choice, so the model must not ask
again merely to manufacture proof. When interaction is needed, the adapter uses the
host-native question surface. Once the model batches the normalized result through
`ultra.record`, the DB treats that result as current cross-session intent authority. It
does not store or verify a UI receipt, raw prompt, or transcript.

If the accepted decision changes another Ultra authority, the model applies that change
through `ultra.record` or a digest-bound artifact and reads the result back. A decision whose normalized record is
itself the complete authority may have no applied reference. Breadcrumb and decision
read paths recall accepted intent only after the dialogue thread is completed or
confirmed. A row-backed applied reference names an exact field and canonical value,
with an optional digest of that value. A specification or artifact reference names
the exact file digest. Row existence alone never proves that intent was applied.

## Promotion and evidence

Working material becomes durable only when all applicable conditions hold:

1. the current Change and owner authority permit the write;
2. consequential claims are verified against the checkout, runtime, test result, or
   primary source;
3. the model writes through the owning MCP operation or immutable artifact path;
4. the DB records the owning baseline, Change, Stage Checkpoint, Task, Decision, or artifact reference;
5. content-bearing files match the recorded SHA-256 digest and scope;
6. the model reads back the resulting state before reporting completion.

The durable evidence trail may include normalized decisions, delegation source,
durable effects, typed applied references, Stage Checkpoint evidence, artifact hashes,
verification commands and results, provenance, events, and recovery state. It must not
include chain-of-thought, UI-click proof, raw prompts, or conversation transcripts.

Public kernel inputs are exact at their owning kind/action boundary. SQLite constraints
remain defense in depth, not the first definition of a business vocabulary: wrong
types, unsupported enums, unknown fields, malformed references, and invalid digests
are rejected as typed mutable diagnostics before any row or file write. The rejected
attempt is retained as audit evidence but never becomes semantic authority.

An accepted mutation and its durable idempotency receipt form one logical transaction.
DB-only operations commit them together. Operations that also publish managed files,
the Git team checkpoint, a Session worktree/Worker Packet, or an archive packet use a
recoverable journal or verified compensation. Failure restores the exact prior file
bytes, rows, ledger generation, lease, packet, and worktree where applicable; an
unprovable rollback becomes an explicit recovery condition rather than false success.

Verified conclusions from `.ultra/.runtime/collab/` or other scratch locations must be promoted
into the invoking DB-bound workflow artifact or report. Keeping a file in the scratch
directory is not promotion.

## Change overlay authority

An active Change is an isolated overlay below
`.ultra/changes/active/<change-id>/`. Its intent, normalized decisions, adaptive research,
typed delta payloads, plan, contexts, documentation payloads, progress projection,
test reports, review artifacts, and delivery evidence remain below that root. Change
research never edits baseline specifications.

`change.delta` registers exact baseline id, repository revision, specification
digests, accepted decisions, non-goals, acceptance, documentation impact, unknowns,
and every semantic mutation's before/after digest. A no-semantic-change result is an
explicit typed delta, not an absent file. `progress.md` is a deterministic projection
of the registered delta and documentation state; it is never an independent status
authority.

`change.documentation_reconcile` binds the current delta id and digest, every changed
document's before/after digest, delta and acceptance references, verification, and a
verified consumer or explicit no-consumer reason. Standard and major delivery require
one current reconciliation even when its document set is empty.

The Deliver Skill owns the evidence-based semantic handoff and records any deliberate
stage omission. `change.archive` does not infer completeness or require a fixed
Plan/Dev/Test/Review/Deliver sequence. It preflights the caller-declared target set
before writing, validates reconciliation structure, applies overlay bytes through a
recoverable local transaction, refreshes baseline digests, moves the complete Change
root to its archive location, and rebinds registry paths. A conflict, crash, or DB
failure must roll back or resume the whole packet; no subset is reported as delivered.

## Context and plan authority

The canonical Context Envelope generator reads accepted Change, Task, baseline,
Decision, checkout, evidence, execution, and provider-reference authority and writes
one immutable manifest plus its DB snapshot row when persistence is requested. It
never updates provider references or semantic Change fields. Each snapshot is
identified by its exact scope, stage, content digest, and selected execution seam;
consumers must not substitute a snapshot from another scope.

Context refs preserve `expected_digest`, `anchor`, `scope`, and `freshness_policy`.
Digest-bound refs are revalidated at the consuming gate, existence-bound implementation
targets may change while remaining present, and advisory drift is retained as a
warning. File bodies stay lazy. Implementation manifests inline only the selected task,
its direct dependency/integration neighborhood, and its task-context contract.

A current plan is a Change-owned pair:

- `<artifact_root>/plan.json` is the machine-readable topology and exact planning
  context binding;
- `<artifact_root>/plan.md` is the deterministic human projection of the same plan and
  task contracts.

The Plan checkpoint selects both paths from the owning Change and accepts no arbitrary
output path. The model owns decomposition and semantic coverage. MCP binds the JSON
digest and the preceding `plan/planning` snapshot;
the artifact registry records both plan files with that context provenance. Publication
preflights both path authorities and prior digests, rejects symlinked ancestors or
targets, and journals the two file replacements so a registry or event failure restores
both prior files while the SQLite transaction rolls back. The global
`.ultra/execution-plan.json` remains readable only for explicit legacy migration and is
never current write or dispatch authority.

## Registry contract

`ultra.record` is the public writer for a semantic or evidence file that is not
already registered by its owning typed record or Stage Checkpoint. Every managed registry row has:

- a typed `owner_type` and `owner_id`;
- an artifact `kind`, project-relative `path`, lifecycle `status`, and SHA-256
  `digest`;
- `before_digest` and `after_digest` values for optimistic write validation and
  change evidence;
- structured `provenance` and optional metadata;
- normalized source and consumer edges in `artifact_edges`.

The write replaces all edges for the artifact in one immediate SQLite transaction.
It never accumulates stale edges with `INSERT OR IGNORE`. If an existing digest
changes, the same transaction emits `spec_changed`, marks only reachable artifact
and Task consumers stale through typed artifact, Task, checkpoint, and Change intermediates,
and records the exact invalidated endpoints. Self-edges and dependency cycles are
rejected without changing prior authority. A caller can provide
`expected_before_digest`; a mismatch fails without changing the row or its edges.

`artifact.get` reads by unique ID or unambiguous path. It fails closed when a path
has multiple active authorities and reports whether the row satisfies the managed
registry contract. A canonical path can have only one non-archived authority across
all owners and kinds. Runtime, scratch, the MCP-owned team checkpoint, and generated
task contexts cannot be promoted through this API.

Owning internal writers use the same transaction contract. Change intent, delta and
documentation packets, Context Envelopes, adaptive research, incident diagnosis,
plan, test, review, delivery, archive reconciliation, and specification learning
cannot update a managed digest or provenance through a parallel SQL path.

Rows migrated from pre-20 schemas remain readable and preserve their original IDs,
paths, hashes, timestamps, and legacy change/task ownership. They are marked
`managed = 0` until an owning current record or `artifact.record` supplies complete
provenance and dependency edges. This compatibility state preserves data without
pretending that an old row satisfies the current registry contract.

## Dependency and orphan diagnosis

`ultra.doctor` compares the registry, dependency graph, filesystem, and owner
tables. It reports:

- unregistered semantic or evidence files;
- registered files that are missing or whose digest/status is stale;
- missing typed owners;
- current managed artifacts without a consumer, unless explicitly terminal;
- dangling source or consumer endpoints;
- graph cycles that cannot become consumer evidence;
- more than one active authority for the same canonical path;
- legacy compatibility rows that remain unmanaged;
- legacy generated task contexts left outside the runtime projection root.

`.ultra/.runtime/**`, `.ultra/scratch/**`, and fixed scaffold support files are outside
orphan diagnosis. Current generated projections are local runtime files and are not
semantic artifacts. A retired `.ultra/tasks/contexts/**` entry is diagnosed and any
generated marker is reported as a ghost projection. Before a baseline is ready, only
the reserved
`discovery.md`, `product.md`, `architecture.md`, and `research-distillate.md` scaffold
paths under `.ultra/specs/` are provisional; every additional specification is subject
to orphan diagnosis immediately. Completion cannot be manufactured by registering
empty templates. Doctor and status expose registered, managed, and unmanaged counts,
and compatibility remains unhealthy until every retained row is deliberately promoted
or retired.

## Team checkpoint

`.ultra/tasks/tasks.json` has kind `ultra-team-task-ledger` and a versioned schema. It
contains:

- one portable baseline record, when present;
- every Change summary, including a Change that has not yet produced Tasks;
- normalized Decision summaries, artifact references, digests, and supersession;
- accepted Stage Checkpoint summaries and evidence references;
- durable Task contracts, dependencies, acceptance mappings, and outcomes;
- per-record revisions, parent digests, the checkpoint state digest, and bounded
  checkpoint ancestry.

It excludes `in_progress` ownership, session ids, leases, worktrees, telemetry,
projection jobs, recovery scratch, and `completion_commit`. Those fields are meaningful
only in the checkout that owns the active process or Git object.

MCP publishes a new generation at semantic handoff points: baseline convergence,
Change creation or update, plan acceptance, durable task-contract or status change,
task expansion or deletion, and Change convergence or archive. A direct edit is
rejected by host hooks and fails digest validation even without hooks.

`ultra.sync { action: import }` validates schema, full and per-record digests, bounded ancestry,
Change ownership, task parents, and local active sessions. A clean record fast-forwards.
A record changed on both sides, a non-descendant checkpoint, or a remote update to a
locally active task stops with a typed conflict. Re-importing the same checkpoint
performs no DB write. A ready imported baseline becomes `draft` or `adopting` with a
blocking checkout-local revalidation gap; Git cannot prove the receiving checkout's
HEAD, scope bytes, verification, or accepted dirty state. Publication remains blocked
until that local baseline converges, preventing one unvalidated checkout from
downgrading team authority.

Legacy v4.4/v4.5 projections are replaced only through
`ultra.sync { action: publish }`. The
publisher first compares every available durable field with SQLite, writes the exact
legacy bytes to `.ultra/.runtime/backups/task-ledger/`, and refuses any mismatch.
Doctor diagnoses this state but never performs the semantic replacement.

## Task-context projection

`.ultra/.runtime/projections/contexts/<task-id>.md` is fully generated from current DB
authority. The projector replaces the whole file, including its execution contract and
stale banner, and marks it with `generated_by: ultra-projector`. It never preserves
arbitrary prose inserted into an earlier projection.

Before retiring an existing `.ultra/tasks/contexts/<task-id>.md`, the projector
promotes its exact authored body bytes once into a digest-bound
`legacy_context_findings` artifact owned and consumed by the task. Legacy frontmatter,
stale banners, and generated contract marker regions are removed first; any remaining
authored body is retained exactly, even when an older projector had preserved it after
a generated contract. Migration fails without deleting the authored body if promotion
cannot be registered. Both legacy reads and runtime projection writes reject traversal,
symlink ancestors, and path escape. When a task disappears, only a runtime projection
carrying the generated marker may be pruned, and the removal emits
`projection_pruned`.

Model findings, decisions, or evidence discovered during development must be written
below the owning Change root and registered through its typed record, checkpoint, or
`artifact.record`.
The next context projection references that authority. Editing the task-context body
or an accepted baseline specification directly is neither persistence nor promotion.
