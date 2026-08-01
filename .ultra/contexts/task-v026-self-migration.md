# Task v026-self-migration: Migrate this repository to the canonical v0.26 artifacts

> **Status**: completed | **Priority**: P0 | **Complexity**: 5

## Context

**What**: Replace this checkout's v0.25 DB-derived projections, placeholder contexts,
duplicate templates, and stale research paths with the canonical v0.26 artifact tree.

**Why**: The product cannot claim file-first recovery while its own repository resumes
through retired files and unresolved generated projections.

**Constraints**:
- Preserve the owner's active Change intent by reconciling it, not deleting it.
- Keep valid archived Changes as historical authority.
- Deleted legacy artifacts remain recoverable through Git history.

## Implementation

**Target Files**: `.ultra/`, root `CONTEXT.md`, and canonical project specifications.

**Layers touched**: owner intent, product and architecture truth, task ledger, contexts,
test evidence, and repository recovery.

**Pattern**: replace invalid projections with current canonical files; remove duplicates
whose only source was the retired database; bind current claims to source and tests.

## Acceptance Criteria

- [x] Root north star, task ledger, contexts, test report, specifications, and `CONTEXT.md` exist and cross-resolve.
- [x] No `.ultra/tasks/`, `.ultra/reports/templates/`, `.ultra/docs/research/`, or `state.db` authority remains.
- [x] Every unfinished task has one matching context and a precise Resume Note.
- [x] Current artifact audit finds no dangling task, trace, Change, evidence, or canonical path.

## Verification

- `node --test tests/skill-authoring.test.cjs tests/v026-contract.test.cjs tests/project-artifacts.test.cjs tests/package-smoke.test.cjs`
- Result: 22 passed, 0 failed on 2026-08-01.

## Definition of Drift

- A canonical fact exists at two paths, a completed legacy projection becomes current
  authority, or an artifact has no writer or consumer.

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-01 | CORRECTION | Began self-migration from v0.25 projections | product, architecture, discovery | Make current checkout prove the shipped lifecycle |

## Completion

- **Completed**: 2026-08-01
- **Commit**: Uncommitted working tree at base HEAD `3f99189`; commit requires owner authorization.
- **Summary**: Current repository authority now uses only the canonical v0.26 file tree, with cross-resolving tasks, contexts, traces, and evidence.

## Resume Note

Completed locally; release verification is the only unfinished repository task.
