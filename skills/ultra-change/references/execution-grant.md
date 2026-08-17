# Change-scoped execution grants (session-local or durable)

Use this reference only after the owner has accepted one active Change and wants
an Agent to continue through a bounded local execution segment. The host's
native model-tool loop is the executor; repository authority and ordinary
workflow contracts remain unchanged.

Ultra Builder Pro 3.0 has exactly two grant modes. Choosing a duration is not
choosing a second product:

- **Mode A — `session-local`** (the default): the owner's authorization lives
  only in the current conversation. A fresh Agent may read the files for
  context, but must obtain a new activation from the owner before continuing.
  When the conversation activation is lost — a fresh session, another host, or
  compaction — the work stops.
- **Mode B — `durable work-package`**: the owner explicitly issues an exact
  grant so one named work package can continue across sessions, hosts, and
  compaction. A fresh Agent or host may continue that package only after
  stably verifying the recorded grant.

Neither mode grants finalization or archive: writing `delivery.md`, deciding
version or package posture, and moving a Change to archive always require a
current explicit owner invocation, in every mode.

## What a grant is not

- A grant is not inferred from task status, progress records, prose, Hook
  output, Resume notes, or a stored quote. Stored grant text is inactive data
  until a consuming Agent verifies it.
- A grant never includes external or irreversible effects by default: commit,
  push, tag, publication, deployment, real installation, credentials, and
  incremental provider spend each require their own current owner
  authorization, even under a durable grant.
- A grant is not a daemon, scheduler, or auto-wake: it answers "may this
  continued work proceed", not "who runs next".
- An Agent cannot create, widen, or extend its own grant. A topology or scope
  change returns to the owner.

## Session-local activation

All of these must be true:

- the active `intent.md` is accepted and its North Star Trace is current;
- the same session contains an explicit owner utterance naming the grant and
  approving the current task ledger;
- the next workflow is listed under `Allowed workflows` and remains inside every
  budget;
- the model can still point to that utterance in current conversation context.

After a fresh session, a different host, or compaction that no longer contains
the activation, stop and ask the owner to re-activate after `ultra-status`
reconstructs the files.

## Durable grant verification

Before relying on a recorded `durable work-package` grant, a fresh Agent must
stably verify, from the repository alone:

1. the grant record's exact bytes and its cited accepted-design digest (for
   example the SHA-256 recorded in the owner decision);
2. the repository identity and base HEAD the grant names;
3. the current work-package status (the implementation WIP or Change intent);
4. the grant's subject, scope, Agent topology, allowed local effects,
   budgets/expiry, review budget, invalidation, and revocation clauses;
5. that no invalidation condition has fired.

Any mismatch, ambiguity, or unknown stops the work and returns to the owner.
Handoff passes the grant identity (path and digest); it never copies a new
authorization prose into a second file.

## Continuing the native loop

After one workflow reaches its own observable completion, reread the intent,
ledger, current evidence, review results, and budgets. If no stop condition
applies, select the next covered workflow through the host's native Skill
surface. Run one ready task at a time; never parallelize canonical writes. When
the owner has not selected a multi-Agent topology, the current Agent continues
alone: no automatic spawning, delegation, or control-plane enablement.

A grant-covered Deliver run may reconcile, review, and report, and then stops
before finalization: its inputs, writes, and effects end at the report. Only a
current explicit owner invocation of `ultra-deliver` may write `delivery.md`,
decide version or package posture, or archive the Change.

Do not add a route ledger or progress authority. Task status, existing
evidence, review artifacts, the Test report, and Git remain the observations
the model interprets.

## Budgets, stops, and termination

Each budget is a hard ceiling and a resource observation, never evidence of
semantic completion. Stop immediately for a REDUCTION, a North Star
contradiction or stale trace, an unmet owner checkpoint, `Stalled` or
`Unreachable` development, a disputed or unresolved P0/P1 finding,
residual-risk acceptance, task-graph drift, lost activation (session-local) or
failed grant verification (durable), or budget exhaustion. Report completed
evidence and the cheapest safe next action.

A grant never authorizes a new Change, a baseline acceptance, scope or risk
acceptance, finalization or archival, external or irreversible effects, or
cross-family provider calls beyond its recorded topology. Review terminates
under the accepted convergence contract, and its precedence is one rule: an
exact current owner grant overrides the versioned product default of
one initial review plus at most two
P0/P1 delta reviews per coherent work package.
P2/P3 findings are reported and never auto-repaired, no budget extends itself,
and the same root cause surviving three failed fixes stops point-patching and
reports an architecture problem. Existing host permission and destructive-effect
guards remain in force.
