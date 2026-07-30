# User-agent interaction contract

Use this protocol only when evidence and accepted intent do not resolve a material
choice. The goal is shared understanding with low cognitive load, not a mandatory
interview.

## Authority split

The user owns:

- product intent and accepted outcomes;
- material scope, compatibility, security, cost, and recovery tradeoffs;
- semantic route selection and risk acceptance;
- authorization for destructive or external effects.

The model owns:

- fact finding and synthesis;
- reversible implementation detail inside accepted constraints;
- research coverage and risk-profile recommendations;
- technical decomposition, verification selection, and route recommendation.

MCP owns durable state, evidence references, digests, freshness, locks, valid
transitions, and hard invariants. It does not choose semantic intent.

## Follow the common selection flow

1. **Inspect** repository authority, source, runtime, tests, and relevant primary
   sources.
2. **Suggest** one recommendation and only credible alternatives, with their effects.
3. **Ask** through the host-native structured question surface only when current user
   intent does not already resolve the material choice.
4. **Normalize** a direct choice, modified route, delegation, or deferral. Treat a
   dismissed question as unanswered.
5. **Persist** the normalized result through MCP, then trust the DB record as current
   authority across sessions.
6. **Apply** the result to its owning baseline, change, workflow, task, specification,
   or artifact when that authority has a corresponding field or content boundary.
7. **Read back** the normalized decision and every changed owning authority before
   continuing.

The DB treats normalized intent as current authority. It does not prove that the user
selected it, store a host interaction receipt, or judge whether the choice was wise.
The host interaction is the semantic gate; MCP validates state shape, bindings,
freshness, and legal transitions.

When an unanswered material question must survive interruption, `decision.open` stores
that pending question before the host presents it. A pending question is recovery
state, not accepted user intent. Only the normalized resolution becomes intent
authority.

## Decide whether to ask

Before asking:

1. Separate `Observed`, `Verified`, `Decided`, `Delegated`, and `Unknown`.
2. Resolve evidence-answerable unknowns autonomously.
3. Normalize clear decisions already present in the user's current request.
4. Ask only if the remaining choice changes accepted intent, public behavior,
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
contract when it exists. If that surface is unavailable but normal conversation is
permitted, ask one concise direct question instead of inventing a tool or foreign-host
syntax. If the host mode forbids interaction entirely, keep the choice unanswered and
stop before any route-dependent write. Do not convert host unavailability into
delegated authority.

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
A dismissed or unavailable response is not acceptance of the recommendation.

## Persist normalized authority

For a project-bound material decision:

1. Read breadcrumb `accepted_intent`, call `decision.list`, and resume a matching active
   decision thread, or use `decision.thread_start` for one new baseline-, change-, or
   workflow-bound thread.
2. Use `decision.open` before presenting only the current decision, with evidence refs,
   recommendation, credible alternatives, effects, and its real blocking consequence.
   A non-blocking follow-up must not become a global workflow gate.
3. After the answer:
   - `decision.resolve` for a direct user choice;
   - `decision.delegate` for explicit model delegation;
   - `decision.defer` with consequence and revisit condition;
   - `decision.supersede` when accepted intent actually changed.
4. Apply the normalized result through the owning MCP operation or update the smallest
   relevant semantic artifact. Do not leave a material answer only in conversation.
5. Read back the owning baseline, change, workflow, task, specification digest, or
   artifact record. If another authority changed, pass its typed reference in
   `decision.complete.applied_refs`.
6. Call `decision.complete` only after that read-back. This closes lifecycle state; it
   is not another user approval. If the decision record itself is the complete durable
   authority, `applied_refs` may remain empty.
7. Use `decision.checkpoint` instead only for the digest-bound recovery boundary
   described below.

Keep fact acquisition autonomous and decision authority explicit.
Never store raw prompts or transcripts; store normalized decisions, not internal
chain of thought.
Do not require a redundant confirmation after an unambiguous answer.
An answered thread with no open or blocking deferred decision does not require a
checkpoint merely to prove intent.

Use a checkpoint only when a coherent decision cluster changes a durable contract or
artifact and interruption recovery requires a digest-bound boundary. Present the
compact effect once, obtain any missing approval, update the artifact, and confirm its
digest. Do not create ceremonial checkpoints for routine implementation detail or an
already explicit current instruction.

Every checkpoint binds the normalized decision digest. Change- and workflow-bound
checkpoints also require at least one current artifact digest. A standalone baseline
thread may instead record a specific `no_artifact_reason` when no durable artifact
exists; that exception does not create interaction proof.

## Return to the capability graph

After alignment, re-read `ultra.context` for the invoking scope. The host model
recommends the next explicit capability from the user's goal, accepted intent,
evidence, recovery cost, and current warnings or blockers. MCP diagnostics describe
mechanical facts; they do not encode a semantic route or persist the recommendation
as authority. Only corruption, unsafe paths, true concurrency conflicts, permissions,
or irreversible external effects are hard blockers.
