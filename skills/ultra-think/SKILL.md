---
name: ultra-think
description: Produce an evidence-bounded recommendation or diagnosis for a consequential technical or product question. Use when the decision has material tradeoffs, uncertainty, or failure risk that benefits from explicit stress testing.
---

# Analyze a consequential question

Use the smallest reasoning structure that resolves the user's actual decision. Answer
simple questions directly; do not turn every request into a framework exercise.

## Workflow

1. State the decision, observed symptom, or disputed claim and the constraints that
   could change the answer. Ask only for missing information that materially affects
   the result.
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
7. Return the recommendation or diagnosis, evidence, uncertainty, what would change
   the conclusion, and the smallest verification step.

## Output

Adapt the response to the question. Include:

- the conclusion first;
- the decisive evidence and tradeoffs;
- unresolved uncertainty without false precision;
- one concrete verification or follow-up action.

Use a comparison table only when several alternatives share the same decision
criteria. Comparisons are an analysis tool, not a required output section.

This skill is read-only unless the user separately authorizes writing an analysis
artifact. It does not update Ultra state, implement the recommendation, or replace an
independent review.
