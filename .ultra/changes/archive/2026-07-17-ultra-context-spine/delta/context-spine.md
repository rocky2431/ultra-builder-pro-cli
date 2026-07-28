# Context Spine v2 delta

## State and MCP

- Advance `.ultra/.runtime/state.db` to schema 10.0.
- Extend `context_snapshots` with role, gate, readiness, blockers, next action,
  bounded context, token budget, public seam, and verification command.
- Add approval-gated `spec_learning_candidates`.
- Add `change.breadcrumb`, `change.learning_propose`, and
  `change.learning_resolve`; extend `change.context` and convergence evidence.

## Harness behavior

- Use one DB-derived breadcrumb across session start, pre-edit, and recovery.
- Treat git/digest staleness, missing required references, and fresh-context
  budget overflow as readiness blockers.
- Keep prompts, transcripts, memory, and graph payloads outside Ultra.
- Require tracer-bullet/public-seam/exact-command execution contracts.
- Require observed red/green evidence for fixes and incidents.
- Require independent `spec_fidelity` and `engineering_standards` review axes.
- Require every specification-learning candidate to be rejected or applied
  before convergence.

## Workflow and host presentation

- Make `ultra-status` the single router and keep one next action.
- Make `ultra-change`, `ultra-plan`, `ultra-dev`, `ultra-test`,
  `ultra-review`, and `ultra-deliver` role-scoped and fresh-context safe.
- Preserve twelve public workflows, four internal rule skills, host-specific
  collaboration companions, and native Claude/Codex/OpenCode/Kimi rendering.
- Remove prompt sediment through a 220-line public-skill validation ceiling.

## Exclusions

- No Gemini or RTK integration or prompt references.
- No Ultra-owned memory, journal, transcript capture, or code graph.
- No bundled third-party general skills and no direct Trellis code reuse.
