# Ultra Context Spine execution plan

## Tracer bullet

Compile one task-scoped Context Manifest v2 into state.db, read it back as a
compact breadcrumb, inject that breadcrumb through a real lifecycle hook, and
block convergence when its readiness, public seam, review axes, red signal, or
specification learning is incomplete.

## Slices

1. `context-spine-contract`: schema 10.0, compiler, MCP tools, learning state,
   convergence gates, fixtures, and regression tests.
2. `context-spine-hooks`: DB-derived session/edit/resume breadcrumb and health
   validation without memory/provider payload injection.
3. `context-spine-workflows`: concise public workflows for alignment, planning,
   implementation, checking, review, and delivery.
4. `context-spine-hosts`: Claude, Codex, OpenCode, and Kimi native packaging,
   rendering, handbook, and conformance.
5. `context-spine-release`: docs, full verification, package smoke, provenance
   doctor, version, commit, push, npm publish, and GitHub release verification.

## Public seam

`change.context` -> `.ultra/.runtime/state.db/context_snapshots` ->
`change.breadcrumb` -> installed host lifecycle context -> one workflow action.

## Verification command

`npm run verify:release`

## Recovery

Schema upgrades are additive and transactional. Installed plugins retain
provenance and can be reinstalled symmetrically. Context artifacts are
projections and can be regenerated from state.db; workflow checkpoints remain
minimal recovery artifacts, not a second authority.
