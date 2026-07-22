# Architecture context

Use for workflow step `30-architecture-context`.

## Objective

Establish current system boundaries, quality goals, constraints, actors, external
systems, and data flows.

## Evidence

- Inspect code entry points, configuration, schemas, deployment assets, tests, and
  runtime evidence.
- Separate observed architecture from intended architecture.
- Record permissions, data sensitivity, compliance, and organizational constraints
  when they affect the design.
- Do not infer a greenfield architecture over an existing system.

## Record

Update `architecture.md` with system context, external dependencies, trust boundaries,
data flows, quality goals, constraints, and evidence. Record documentation drift when
the current checkout contradicts an existing diagram or claim.

Complete the step with source or runtime evidence and the updated output path.

## Semantic record

Use kind `architecture_context`. Record `boundary`, `inputs_outputs`,
`trust_authority`, and `consumers`.
