# Behavioral requirements and acceptance

Use for workflow step `20-user-stories`.

## Objective

Translate accepted scenarios into testable behavior without prematurely designing the
implementation.

## Method

- Use stable requirement identifiers.
- State preconditions, action, observable result, error behavior, and recovery where
  relevant.
- Trace every requirement to a scenario, constraint, or owner decision.
- Preserve current delivered behavior separately from proposed behavior.
- Do not use priority labels as a substitute for explicit scope decisions.

## Record

Update `product.md` with requirements and acceptance criteria that can map to an
executable check or deliberate manual evidence. Record unknown behavior instead of
writing vague acceptance.

Complete the step with evidence references and the updated output path.

## Semantic record

Use kind `requirement`. Record `preconditions`, `action`, `observable_result`,
`error_recovery`, and `verification`. Link it to its accepted scenario or decision.
