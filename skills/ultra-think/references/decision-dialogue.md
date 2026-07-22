# Decision dialogue protocol

Use this protocol when an Ultra workflow reaches a load-bearing owner decision. Keep
fact acquisition autonomous and decision authority explicit. Do not use it for facts
that repository, runtime, tests, or primary sources can answer.

## Select the interaction depth

- `guided`: ask every unresolved decision that changes accepted product intent, scope,
  public behavior, security, material cost, compatibility, delivery semantics, or
  recovery. Use for initial research and major changes.
- `fast`: ask only unresolved one-way-door or materially expensive decisions. Decide
  reversible implementation detail inside accepted constraints. Use for bounded daily
  work.
- `autonomous`: use only after the owner explicitly delegates reversible decisions.
  Preserve the delegation, selected result, rationale, and guardrails.
- `diagnostic`: acquire evidence and distinguish falsifiable hypotheses before asking
  for a recovery or product decision.

Do not ask a meta-question about mode when the user's request or current change profile
already determines the appropriate depth.

## Separate evidence from decisions

Before asking:

1. Inspect current authority, repository, runtime, tests, and relevant primary sources.
2. Resolve factual unknowns yourself when evidence is obtainable.
3. Separate `Observed`, `Verified`, `Decided`, and `Unknown`.
4. Identify the earliest unresolved decision on which later decisions depend.
5. Form a private candidate queue, but expose only its current item. Do not dump the
   backlog, a questionnaire, or every research step.

If more evidence can resolve the current uncertainty, perform that research first. If
the user says they do not know, convert the gap into a bounded validation action rather
than pressuring them to guess.

## Bind durable authority

For a project-bound dialogue:

1. Call `decision.list` and resume the matching `active` or `checkpoint_ready` thread.
2. Otherwise call `decision.thread_start` with one baseline, change, or workflow
   binding, a concise purpose, and the selected mode. Never store raw prompts or
   transcripts.
3. Call `decision.open` for exactly one decision. Include:
   - why it must be decided now;
   - the evidence-backed recommendation;
   - zero to three credible alternatives with their net tradeoff;
   - evidence references;
   - the contract, artifact, gate, or task effects;
   - whether deferral blocks progress.

Do not encode future questions as open decisions. Re-evaluate the next candidate after
each answer so the dialogue adapts instead of following a static questionnaire.

## Present one decision and stop

Use a compact shape adapted to the user's language:

```text
Decision <position when known>: <question>
Why now: <one sentence>
Recommendation: <choice or next validation> — <reason>
Options: <only credible alternatives and their net tradeoff>
Effect: <what this answer changes>
```

Ask one question only. Do not combine dependent questions, append a second request, or
continue into analysis, planning, edits, or another workflow step. End the turn and
wait. This STOP is mandatory even when the likely answer seems obvious.

## Normalize the answer

On the next turn:

- When the answer is unambiguous, briefly reflect the normalized decision and its
  durable effect, then call `decision.resolve` with the decision, rationale, and owner.
- When the user says "you decide", select the reversible result within stated bounds
  and call `decision.delegate` with the explicit delegation, result, rationale, and
  guardrails. Never represent delegation as a direct owner decision.
- When the user defers, call `decision.defer` with the reason, consequence, and revisit
  condition. A blocking deferral remains a gate.
- When the answer is ambiguous, ask one clarification for the same decision; do not
  infer a product choice from tone or partial wording.
- When evidence or owner intent changes a resolved decision, call
  `decision.supersede`. Preserve the prior record and open one replacement question.

Do not require a redundant confirmation after a clear answer. The owner can correct
the compact reflection; phase checkpoint approval is the durable confirmation.

## Checkpoint before projection

After a coherent cluster of decisions or a phase boundary:

1. Call `decision.checkpoint` with `action: "prepare"` and a compact shared
   understanding. Open or blocking-deferred decisions must prevent preparation.
2. Present only accepted decisions, unresolved consequences, and the artifacts that
   will change. Ask for one checkpoint approval and STOP.
3. After approval, update the target specification, Change Contract, delta, or plan
   from normalized decisions. Do not write conversation transcripts.
4. Call `decision.checkpoint` with `action: "confirm"`, owner approval, and the current
   artifact paths. MCP binds their digests. A change- or workflow-bound thread must
   bind at least one artifact. When a shared specification will continue evolving,
   bind a stable decision projection under `.ultra/docs/decisions/<thread-id>.md`
   instead of a mutable draft that would immediately become stale. Only a standalone
   baseline thinking thread may use an explicit no-artifact reason.
5. Re-read the confirmed thread. Only then may the linked workflow complete the gated
   step or move to another phase.

If a bound artifact changes while the normalized decisions remain valid, prepare the
same thread again, show the changed effect, obtain one new checkpoint approval, and
confirm the current digest. Do not invent a replacement decision merely to refresh an
artifact. If the decision itself changed, use supersession instead.

Start a new thread for a new decision cluster. Supersede an old item only when the old
decision itself changed.

## Keep the user surface small

At each turn show only:

- the current decision or checkpoint;
- the decisive evidence and recommendation;
- the effect of the answer;
- optionally the number of already resolved decisions.

Provide the hidden evidence inventory, all semantic steps, or full report paths only
when requested. Context and token budgets are advisory; they never justify omitting
load-bearing evidence or refusing legitimate work.
