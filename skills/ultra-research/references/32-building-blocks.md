# Building blocks and runtime paths

Use for workflow step `32-building-blocks`.

## Objective

Map responsibilities, contracts, data ownership, consumers, and runtime behavior across
the current or accepted architecture.

## Method

- Start from real modules and live entry points in brownfield adoption.
- Define boundaries by responsibility and authority, not by an imposed layer diagram.
- Trace key scenarios through validation, domain behavior, persistence, integrations,
  observable output, failure, and recovery.
- Identify unreachable scaffolding, duplicate authority, and undocumented coupling.

## Record

Update `architecture.md` with building blocks, public contracts, ownership, dependencies,
runtime paths, error paths, and evidence. Link each proposed block to a consumer.

Complete the step with source evidence and the updated output path.

## Report trace

In the area report, record `entry_point`, `state_side_effects`, `observable_result`,
`failure_recovery`, and `consumers`, then link the architecture heading.
