# Owner interaction boundary

Use this reference only when a material choice remains after inspecting current
authority and observable facts. Ultra does not require a ceremonial question before
every write.

## Responsibility split

- The owner controls product intent, acceptance, non-goals, material tradeoffs, risk
  acceptance, irreversible actions, external effects, and real-money commitments.
- The host model investigates facts, recommends a direction, makes reversible
  implementation judgments, and explains uncertainty.
- Use the host-native question surface declared by the installed interaction contract;
  prefer its structured form when the host exposes one.
- `ultra.record` persists only the normalized result and its provenance.
- MCP validates structure, identity, digests, CAS, leases, paths, and recovery. It does
  not decide whether a product answer is good.

## Interaction sequence

1. Read `ultra.context` for the relevant scope.
2. Inspect source, runtime, tests, accepted artifacts, and primary documentation.
3. Reuse an explicit choice already present in the current request or an accepted
   Decision Record.
4. Decide a reversible delegated detail without asking.
5. When owner authority is still required, ask one unresolved owner choice at a time
   with:
   - the recommendation;
   - the discriminating evidence;
   - the meaningful cost or failure mode;
   - what changes when the answer changes.
6. Normalize the answer into a deterministic Decision Record and persist it with
   `ultra.record` using `kind: decision`, `action: accept`.
7. Read `ultra.context` back and verify that the accepted decision is visible before
   relying on it.

## Decision Record

Persist only:

- normalized question;
- recommendation and selected answer;
- effects and non-goals;
- owner, source, and bounded provenance;
- applied artifact references;
- supersession link when revising an earlier answer.

Never persist raw transcripts, hidden reasoning, full prompts, UI receipts, or copied
memory-provider payloads.

## Revisions and interruptions

Accepted decisions are immutable history. A changed answer creates a new Decision
Record that supersedes the prior record. A cancelled question writes nothing. If a
decision cannot be obtained, preserve the unresolved issue as a diagnostic or bounded
event; do not invent an answer or block unrelated work.
