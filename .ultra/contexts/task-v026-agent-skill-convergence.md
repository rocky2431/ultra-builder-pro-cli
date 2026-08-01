# Task v026-agent-skill-convergence: Preserve custom-agent methods as portable Skill assets

> **Status**: completed | **Priority**: P0 | **Complexity**: 5

## Context

**What**: Remove host-specific installed custom agents while preserving every reusable
review, debugging, and test-execution method in portable Skill assets.

**Why**: All five CLIs support Skills, but they do not share one custom-agent API or
identical delegation semantics.

**Constraints**:
- Do not weaken the old methods' evidence, read-only, schema, or recovery boundaries.
- The parent Skill owns scope, synthesis, mutations, and final judgment.

## Implementation

**Target Files**: `skills/ultra-review/references/`,
`skills/ultra-dev/references/debugging.md`,
`skills/ultra-tdd/references/test-execution.md`, and Skill authoring tests.

**Layers touched**: reusable method, caller routing, installed package, and validation.

**Pattern**: six review lenses plus immutable Worker Packet; focused debugging and test
execution references; parent-Skill coordination.

## Acceptance Criteria

- [x] All six review specializations are routed from `ultra-review`.
- [x] Debugging and test-execution procedures are routed from their canonical Skills.
- [x] Every non-catalog reference has a live caller.
- [x] No `agents/` directory is packaged or installed.

## Verification

- `node --test tests/skill-authoring.test.cjs tests/v026-contract.test.cjs`
- Focused contract checks passed; the final release gate repeats them.

## Definition of Drift

- Copying a lens into host metadata, installing custom-agent projections, or leaving a
  reference with no canonical caller.

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-01 | CORRECTION | Converged retired agent methods into Skill references | architecture | Preserve behavior through the portable five-host surface |

## Completion

- **Completed**: 2026-08-01
- **Commit**: Uncommitted working tree at base HEAD `3f99189`; commit requires owner authorization.
- **Summary**: Retired agent behavior is reachable through portable Skill assets and parent coordination.

## Resume Note

Completed locally; validator and packaged-artifact checks remain in release verification.
