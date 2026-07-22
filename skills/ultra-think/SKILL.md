---
name: ultra-think
description: Resolve a consequential product or technical question through evidence-first analysis or a resumable one-decision-at-a-time owner dialogue. Use when tradeoffs, ambiguity, diagnosis, or failure risk require shared understanding before research, planning, or implementation proceeds.
---

# Align on a consequential question

Use the smallest reasoning structure that resolves the user's actual decision. Answer a
simple self-contained question directly. For a project-bound or multi-turn decision,
read `references/decision-dialogue.md` and use its durable protocol.

## Establish evidence

1. State the decision, observed symptom, or disputed claim and the constraints that
   could change the answer.
2. Gather evidence from the most authoritative available source:
   - current checkout and runtime for repository claims;
   - official primary documentation for product or API behavior;
   - current web sources for unstable external facts.
3. Separate verified facts, evidence-backed inferences, and unresolved assumptions.
   Cite the supporting file, command, runtime result, or source near each consequential
   claim.
4. For a decision, compare only credible alternatives. Do not invent a fixed number of
   options or assign arbitrary numeric scores. Name the criteria that actually drive
   the choice and explain the tradeoffs.
5. For a diagnosis, form falsifiable hypotheses and identify the smallest observation
   that distinguishes them. Do not recommend implementation before the earliest
   incorrect state is supported by evidence.
6. Stress-test the leading conclusion with the techniques that fit the problem:
   - strongest counterargument;
   - likely failure scenario and recovery;
   - load-bearing assumption;
   - meaningful second-order effect.
7. Decide whether the question is now answerable or still requires owner authority.

## Route the result

- For an answerable read-only question, return the recommendation or diagnosis,
  decisive evidence, uncertainty, what would change the conclusion, and one smallest
  verification step.
- For a load-bearing owner decision, bind or resume a decision thread, open the one
  earliest decision, present it using the shared protocol, and STOP.
- After an answer, normalize it through `decision.resolve`, `decision.delegate`, or
  `decision.defer`; never store the conversation transcript.
- At a phase boundary, prepare the checkpoint, obtain approval, bind current artifact
  digests when project-bound, and only then return control to the invoking workflow.

## Output

Adapt the response to the question. Include:

- the conclusion first;
- the decisive evidence and tradeoffs;
- unresolved uncertainty without false precision;
- one concrete verification or follow-up action.

Use a comparison table only when several alternatives share the same decision
criteria. Comparisons are an analysis tool, not a required output section.

Unbound analysis is read-only. A project-bound dialogue may write only decision state
and explicitly approved checkpoint artifacts. It does not implement the decision or
replace research, planning, testing, or independent review. After a confirmed
checkpoint, return to the exact invoking `ultra-init`, `ultra-research`, `ultra-change`,
`ultra-plan`, `ultra-dev`, `ultra-test`, `ultra-review`, or `ultra-deliver` run and
current step; never choose a new route from conversation history.
