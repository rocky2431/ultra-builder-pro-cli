# Task v026-artifact-lifecycle: Close the file-first artifact lifecycle

> **Status**: completed | **Priority**: P0 | **Complexity**: 7

## Context

**What**: Make the packaged template and all workflow writers/readers agree on one
file-first artifact lifecycle.

**Why**: Five-host resume is only reliable when every semantic document has one path,
one owner, a consumer, a freshness signal, and a repair route.

**Constraints**:
- Keep semantic authority in files and Git.
- Preserve existing healthy files during initialization.
- Do not create duplicate plan, drift, debt, delivery, or report ledgers.

## Implementation

**Target Files**: `.ultra-template/`, `skills/ultra-{init,status,change,plan,dev,test,deliver}/`,
`docs/ARTIFACT-AUTHORITY.md`, `tests/skill-authoring.test.cjs`, and contract tests.

**Layers touched**: packaged asset, Skill workflow, project artifact, adapter distribution,
and release test.

**Pattern**: one canonical file plus progressive Skill references and deterministic
scripts only for copy, digest, schema, and path facts.

## Acceptance Criteria

- [x] Installed `ultra-init` carries a byte-identical canonical project template.
- [x] Initialization copies only missing files and preserves existing authority.
- [x] Change, plan, task evidence, test report, and delivery have exact canonical paths.
- [x] No live Skill names an orphan semantic ledger.

## Verification

- `node --test tests/skill-authoring.test.cjs tests/v026-contract.test.cjs tests/package-smoke.test.cjs`
- Focused artifact and package checks passed; the final release gate repeats them.

## Definition of Drift

- Reintroducing an alternate `.ultra` template, DB projection, unnamed report, or
  artifact no workflow reads.

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-01 | CORRECTION | Unified template distribution and artifact contracts | product, architecture | Repair incomplete v0.26 wiring without reducing scope |

## Completion

- **Completed**: 2026-08-01
- **Commit**: Uncommitted working tree at base HEAD `3f99189`; commit requires owner authorization.
- **Summary**: Canonical file lifecycle, nested derived-path ignore rules, deterministic init and worktree digest, and orphan checks are implemented.

## Resume Note

Completed locally; release verification must re-run the whole package after repository self-migration.
