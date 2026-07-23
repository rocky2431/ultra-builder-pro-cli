# User-agent interaction contract

Use this protocol only when evidence and accepted intent do not resolve a material
choice. The goal is shared understanding with low cognitive load, not a mandatory
interview.

## Authority split

The user owns:

- product intent and accepted outcomes;
- material scope, compatibility, security, cost, and recovery tradeoffs;
- authorization for destructive or external effects.

The model owns:

- fact finding and synthesis;
- reversible implementation detail inside accepted constraints;
- research coverage and risk-profile recommendations;
- technical decomposition, verification selection, and route recommendation.

MCP owns durable state, evidence references, digests, freshness, locks, valid
transitions, and hard invariants. It does not choose semantic intent.

## Decide whether to ask

Before asking:

1. Inspect repository authority, source, runtime, tests, and relevant primary sources.
2. Separate `Observed`, `Verified`, `Decided`, `Delegated`, and `Unknown`.
3. Resolve evidence-answerable unknowns autonomously.
4. Normalize clear decisions already present in the user's current request.
5. Ask only if the remaining choice changes accepted intent, public behavior,
   compatibility, security, material cost, external effects, or recovery.

Do not ask about a reversible implementation detail already delegated by the contract.
If the user does not know, recommend a bounded validation action instead of forcing a
guess.

## Choose interaction depth

- `guided`: material initial product or major-change choices;
- `fast`: only one-way-door or costly choices in routine work;
- `autonomous`: reversible choices explicitly delegated by the user;
- `diagnostic`: gather discriminating evidence before asking about recovery.

Infer the depth from the request and risk. Do not ask a meta-question about mode unless
that choice itself changes the outcome.

## Present questions

Use the host-native structured question surface declared by the installed interaction
contract when it exists. If that surface is unavailable in the current mode, ask one
concise direct question instead of inventing a tool or foreign-host syntax.

Ask one question only for a dependent decision. STOP is mandatory after presenting
that question: do not perform writes whose meaning depends on an unanswered choice.

For one dependent decision, present:

```text
Decision: <question>
Why now: <decision effect>
Recommendation: <choice> — <decisive reason>
Alternatives: <only credible alternatives and their net tradeoff>
```

Ask dependent decisions one at a time. A host may group up to three independent,
low-cognitive-load facts when seeing them together improves consistency. Never dump a
questionnaire, hidden queue, or every research area.

The question tool or direct question ends the current interaction naturally.

## Persist only when recovery needs it

For a project-bound material decision:

1. Call `decision.list` and resume a matching active decision thread, or use
   `decision.thread_start` for one new baseline-, change-, or workflow-bound thread.
2. Use `decision.open` for only the current decision with evidence refs, recommendation, credible
   alternatives, effects, and blocking consequence.
3. After the answer:
   - `decision.resolve` for a direct user choice;
   - `decision.delegate` for explicit model delegation;
   - `decision.defer` with consequence and revisit condition;
   - `decision.supersede` when accepted intent actually changed.
4. Use `decision.checkpoint` only for the digest-bound recovery boundary described
   below.

Keep fact acquisition autonomous and decision authority explicit.
Never store raw prompts or transcripts; store normalized decisions, not internal
chain of thought.
Do not require a redundant confirmation after an unambiguous answer.

Use a checkpoint only when a coherent decision cluster changes a durable contract or
artifact and interruption recovery requires a digest-bound boundary. Present the
compact effect once, obtain any missing approval, update the artifact, and confirm its
digest. Do not create ceremonial checkpoints for routine implementation detail or an
already explicit current instruction.

## Return to the capability graph

After alignment, re-read the invoking workflow and breadcrumb. A
`required_transition` is authoritative only for a hard invariant. Otherwise the host
model recommends among `allowed_transitions` based on the user's goal and current
evidence. Do not persist that semantic recommendation as MCP authority.
