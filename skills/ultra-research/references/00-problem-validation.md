# Problem validation

Use for workflow step `00-problem-validation`.

## Objective

Establish the problem, affected actor, current workaround, consequence, and available
demand evidence. In brownfield adoption, describe the behavior the current system
already serves before discussing future intent.

## Evidence

- Inspect existing product documents, user-facing entry points, support evidence, and
  runtime behavior before asking the owner for facts already present.
- Treat an owner statement as a decision or claim, not as observed user evidence.
- Record absent evidence as `Unknown`; do not invent demand, urgency, or a target user.
- Use external research only when a consequential claim depends on current facts.

## Record

Update `discovery.md` with `Observed`, `Verified`, `Decided`, and `Unknown` entries for:

- problem and affected actor;
- current workaround and consequence;
- demand or usage evidence;
- the narrowest owner-approved problem boundary;
- unresolved validation needs.

Link the updated specification anchor from the immutable step report required by the
orchestrator. A missing load-bearing fact becomes a blocker or baseline gap, not a
guessed answer.

## Semantic record

Use kind `problem`. Record `actor`, `current_workaround`, `consequence`, and
`evidence_status`.
