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
checkout-local unless a team uses an explicit synchronization or artifact handoff.

## Artifact classes

| Class | Examples | Authority |
|---|---|---|
| Lifecycle and index | `.ultra/.runtime/state.db` | Sole authority for identifiers, normalized accepted intent, status, legal transitions, references, digests, freshness, provenance, locks, leases, transactions, recovery, and coordination |
| Digest-bound semantic artifacts | specifications, research reports, Change intent/delta/plan, context manifests | Authoritative semantic bodies only while registered by the owning DB row or workflow step and matching its recorded digest |
| Digest-bound evidence artifacts | test, review, delivery, and verification reports | Authoritative evidence bodies only while registered, immutable where required, and matching the recorded digest and scope |
| Generated projections | `tasks/tasks.json`, generated task-status headers, activity exports | Read-only views derived from DB authority; manual edits are overwritten and never become authority |
| Advisory recovery | `.ultra/.runtime/checkpoint.json` | Compact recovery hint derived from DB authority; stale or missing content never overrides the DB |
| Working scratch | `.ultra/.runtime/collab/`, temporary session output, incomplete drafts | Non-authoritative working material until verified and promoted through a supported workflow write |
| External provider references | memory or code-graph provider name, scope, version, stable reference, freshness metadata | Metadata-only context stored by Ultra; the provider remains authority for its payload |

The DB is not expected to contain every semantic paragraph. It owns the lifecycle and
the binding between a fact and its current content. A digest-bound file owns the
registered semantic or evidence body. Neither surface is a parallel lifecycle source.

## Human, model, and mechanical responsibilities

| Actor | Responsible for | Must not do |
|---|---|---|
| Owner | Goals, acceptance, non-goals, material choices, risk acceptance, and authorization for irreversible or external effects | Supply facts the checkout or runtime can establish directly |
| Host model | Inspect evidence, recommend a route, ask only for unresolved owner choices, normalize the answer, call the owning write, update semantic artifacts, read back the result, and present the next recommendation | Fabricate evidence, infer owner authorization, or bypass legal transitions |
| Ultra MCP | Persist normalized inputs, validate structure and current digests, record lifecycle and provenance, enforce legal transitions, project views, and expose recovery | Choose product direction, prove a UI click, force a semantic route, or replace model judgment |
| Host adapter | Render the shared interaction contract through the host-native question and tool surfaces | Become a second workflow authority |
| Hook | Observe lifecycle, inject compact DB-derived recovery context, and protect generated projections | Select a semantic route or block ordinary development |

## Intent persistence

The interaction sequence is:

```text
inspect -> suggest -> host-native ask -> normalize -> persist -> apply -> read back
```

The host-native ask is conditional. An explicit owner instruction can already resolve
a choice, so the model must not ask
again merely to manufacture proof. When interaction is needed, the adapter uses the
host-native question surface. Once the model writes the normalized result through
`decision.resolve`, `decision.delegate`, or `decision.defer`, the DB treats that result
as current cross-session intent authority. It does not store or verify a UI receipt,
raw prompt, or transcript.

If the accepted decision changes another Ultra authority, the model applies that change
through its owning MCP tool or digest-bound artifact, reads the result back, and passes
typed `applied_refs` to `decision.complete`. A decision whose normalized record is
itself the complete authority may have no applied reference. Breadcrumb and decision
read paths recall accepted intent only after the dialogue thread is completed or
confirmed. A row-backed applied reference names an exact field and canonical value,
with an optional digest of that value. A specification or artifact reference names
the exact file digest. Row existence alone never proves that intent was applied.

## Promotion and evidence

Working material becomes durable only when all applicable conditions hold:

1. the active workflow permits the write;
2. consequential claims are verified against the checkout, runtime, test result, or
   primary source;
3. the model writes through the owning MCP operation or immutable artifact path;
4. the DB records the owning baseline, change, workflow, task, or artifact reference;
5. content-bearing files match the recorded SHA-256 digest and scope;
6. the model reads back the resulting state before reporting completion.

The durable evidence trail may include normalized decisions, delegation source,
durable effects, typed applied references, workflow-step evidence, artifact hashes,
verification commands and results, provenance, events, and recovery state. It must not
include chain-of-thought, UI-click proof, raw prompts, or conversation transcripts.

Verified conclusions from `.ultra/.runtime/collab/` or other scratch locations must be promoted
into the invoking DB-bound workflow artifact or report. Keeping a file in the scratch
directory is not promotion.

## Change overlay authority

An active Change is an isolated overlay below
`.ultra/changes/active/<change-id>/`. Its intent, adaptive research, `findings.md`,
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

`change.archive` preflights the complete target set before writing, applies overlay
bytes through a recoverable local transaction, refreshes baseline digests, moves the
complete Change root to its archive location, and rebinds registry paths. A conflict,
crash, or DB failure must roll back or resume the whole packet; no subset is reported
as delivered.

## Context and plan authority

`change.context` is a pure compiler. It reads accepted Change, task, baseline, checkout,
and provider-reference authority and writes one immutable manifest plus its DB snapshot
row. It never updates provider references or semantic Change fields. Each snapshot is
identified exactly by `change_id`, nullable `task_id`, `role`, and `gate`; consumers
must not substitute a newer snapshot from a different tuple.

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

`plan.export` selects both paths from the owning Change and accepts no arbitrary output
path. `verify-plan` binds the JSON digest and the preceding `plan/planning` snapshot;
the artifact registry records both plan files with that context provenance. Publication
preflights both path authorities and prior digests, rejects symlinked ancestors or
targets, and journals the two file replacements so a registry or event failure restores
both prior files while the SQLite transaction rolls back. The global
`.ultra/execution-plan.json` remains readable only for explicit legacy migration and is
never current write or dispatch authority.

## Registry contract

`artifact.record` is the public writer for a semantic or evidence file that is not
already registered by its owning workflow operation. Every managed registry row has:

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
and task consumers stale through typed artifact/task/workflow/change intermediates,
and records the exact invalidated endpoints. Self-edges and dependency cycles are
rejected without changing prior authority. A caller can provide
`expected_before_digest`; a mismatch fails without changing the row or its edges.

`artifact.get` reads by unique ID or unambiguous path. It fails closed when a path
has multiple active authorities and reports whether the row satisfies the managed
registry contract. A canonical path can have only one non-archived authority across
all owners and kinds. Runtime, scratch, `tasks.json`, and generated task contexts
cannot be promoted through this API.

Owning internal writers use the same transaction contract. Change intent, delta and
documentation packets, contexts, adaptive research, findings, incident diagnosis,
plan, test, review, delivery, archive reconciliation, and specification learning
cannot update a managed digest or provenance through a parallel SQL path.

Rows migrated from pre-20 schemas remain readable and preserve their original IDs,
paths, hashes, timestamps, and legacy change/task ownership. They are marked
`managed = 0` until an owning workflow or `artifact.record` supplies complete
provenance and dependency edges. This compatibility state preserves data without
pretending that an old row satisfies the current registry contract.

## Dependency and orphan diagnosis

`system.doctor` compares the registry, dependency graph, filesystem, and owner
tables. It reports:

- unregistered semantic or evidence files;
- registered files that are missing or whose digest/status is stale;
- missing typed owners;
- current managed artifacts without a consumer, unless explicitly terminal;
- dangling source or consumer endpoints;
- graph cycles that cannot become consumer evidence;
- more than one active authority for the same canonical path;
- legacy compatibility rows that remain unmanaged;
- generated task contexts whose task no longer exists.

`.ultra/.runtime/**`, `.ultra/scratch/**`, and fixed scaffold support files are outside
orphan diagnosis. Current generated projections are recognized from the DB task set,
not from a blanket directory exemption. Before a baseline is ready, only the reserved
`discovery.md`, `product.md`, `architecture.md`, and `research-distillate.md` scaffold
paths under `.ultra/specs/` are provisional; every additional specification is subject
to orphan diagnosis immediately. Completion cannot be manufactured by registering
empty templates. Doctor and status expose registered, managed, and unmanaged counts,
and compatibility remains unhealthy until every retained row is deliberately promoted
or retired.

## Task-context projection

`.ultra/tasks/contexts/<task-id>.md` is fully generated from current DB authority.
The projector replaces the whole file, including its execution contract and stale
banner, and marks it with `generated_by: ultra-projector`. It never preserves arbitrary
prose inserted into an earlier projection.

Before replacing an existing authored context, the projector promotes the exact legacy
body bytes once into a digest-bound `legacy_context_findings` artifact owned and
consumed by the task. Legacy frontmatter, stale banners, and generated contract marker
regions are removed first; any remaining authored body is retained exactly, even when
an older projector had preserved it after a generated contract. Replacement is skipped
without promotion only when no authored content remains. If promotion cannot be
registered, projection fails without deleting the authored body. A context target must
remain lexically and physically below
`.ultra/tasks/contexts/`; traversal and symlink ancestors are rejected by projection and
migration. When a task disappears, only an orphan carrying the generated marker may be
pruned, and the removal emits `projection_pruned`; unknown authored files are retained
for diagnosis.

Model findings, decisions, or evidence discovered during development must be written
below the owning Change root and registered through the workflow or `artifact.record`.
The next context projection references that authority. Editing the task-context body
or an accepted baseline specification directly is neither persistence nor promotion.
