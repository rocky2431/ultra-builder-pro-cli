# Task v026-host-adapters: Align installation and routing on all five CLIs

> **Status**: completed | **Priority**: P0 | **Complexity**: 7

## Context

**What**: Install one product boundary natively on Claude Code, Codex, OpenCode, Kimi
Code, and Grok Build with honest scope, routing, Hook, and Doctor behavior.

**Why**: A source Skill is not delivered until the installed artifact, host metadata,
sidecars, provenance, update, and uninstall paths agree.

**Constraints**:
- `--config-dir` must contain every managed sidecar.
- Kimi and Grok reject unsupported local plugin scope before any mutation.
- Codex Doctor must not report untrusted Hooks as active.

## Implementation

**Target Files**: `adapters/*.js`, `adapters/_shared/`, `bin/install.js`,
`docs/RUNTIME-COMPAT-MATRIX.md`, package scripts, and adapter/package tests.

**Layers touched**: installer CLI, host adapter, native registry/manifest, installed
Skills and Hooks, provenance Doctor, and uninstall.

**Pattern**: stage complete managed tree, validate ownership, publish atomically, keep
host-specific policy in adapter metadata.

## Acceptance Criteria

- [x] Five runtimes receive the exact fourteen-Skill and five-Hook allowlists.
- [x] The canonical init template is byte-identical in every installed Skill tree.
- [x] Install, Doctor, reinstall, rollback, and uninstall stay inside isolated roots.
- [x] Host-native routing limits and Codex Hook trust remain visible.

## Verification

- `node --test adapters/_shared/tests/file-ops.test.cjs tests/install.test.cjs tests/v026-adapters.test.cjs`
- Result: 31 passed, 0 failed; an independent five-host CLI lifecycle ended with empty isolated config and HOME roots.

## Definition of Drift

- A host receives different workflow meaning, escapes `--config-dir`, silently accepts
  unsupported scope, or reports a native capability it cannot enforce.

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-01 | CORRECTION | Aligned five native install and invocation surfaces | product, architecture | Make package claims match installed artifacts |

## Completion

- **Completed**: 2026-08-01
- **Commit**: Uncommitted working tree at base HEAD `3f99189`; commit requires owner authorization.
- **Summary**: Five isolated native layouts share one managed product contract with explicit limitations, ownership-safe shell cleanup, and transactional OpenCode publication.

## Resume Note

Completed locally; final validators and release gates remain in the release-verification task.
