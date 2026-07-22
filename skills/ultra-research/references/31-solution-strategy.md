# Solution strategy

Use for workflow step `31-solution-strategy`.

## Objective

Record architecture decisions that satisfy accepted behavior and constraints while
preserving current repository patterns where they remain valid.

## Method

- Search for existing implementations and dependencies before proposing new ones.
- Evaluate alternatives only when more than one credible choice remains and the choice
  materially affects the contract.
- Record decision drivers, chosen direction, consequences, compatibility, and recovery.
- Do not force a new stack, fixed option count, scoring model, or arbitrary preference.

## Record

Update `architecture.md` with accepted strategy decisions and their evidence. Preserve
unresolved decisions as blockers rather than selecting on the owner's behalf.

Complete the step with decision evidence and the updated output path.

## Semantic record

Use kind `architecture_decision`. Record `drivers`, `direction`, `consequences`,
`compatibility`, and `recovery`.
