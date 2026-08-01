# Change chg-converge: Complete the v0.26 file-first product

> **Status**: accepted
> **Profile**: major

## Outcome

An owner can install Ultra Builder Pro on each of the five supported CLIs, initialize
one canonical `.ultra/` lifecycle, use every workflow or model discipline through its
intended routing boundary, delegate bounded work to another CLI, and recover from files
and Git without an Ultra database or orphan semantic document.

## Acceptance

| ID | Criterion | Verification | Trace |
|---|---|---|---|
| AC-01 | All five adapters install the same fourteen Skills, five hooks, and canonical init template without escaping an isolated config root. | `node --test tests/v026-adapters.test.cjs tests/install.test.cjs tests/package-smoke.test.cjs` | `.ultra/specs/product.md#20-behavioral-requirements-and-acceptance` |
| AC-02 | Owner, model, and router roles remain distinct on every host; native limitations are reported rather than emulated by a semantic supervisor. | `node --test tests/v026-contract.test.cjs tests/v026-adapters.test.cjs` | `.ultra/specs/architecture.md#adaptation-and-routing` |
| AC-03 | The ten retired custom-agent methods remain reachable as Skill references or parent-Skill coordination, with no installed `agents/` projection. | `node --test tests/skill-authoring.test.cjs tests/v026-contract.test.cjs` | `.ultra/specs/architecture.md#agent-to-skill-convergence` |
| AC-04 | Hooks are idle outside Ultra, inject only bounded file context, normalize malformed observations, and hard-deny only named destructive effects with recovery. | `pytest hooks/tests -q` | `.ultra/specs/architecture.md#hook-boundary` |
| AC-05 | Delegation validates a clean registered worktree, strict permission and result schemas, immutable digests, actual Git writes, timeout, cancellation, and terminal recovery. | `node --test tests/delegate.test.cjs` | `.ultra/specs/architecture.md#delegation-boundary` |
| AC-06 | Every canonical `.ultra` artifact has one named lifecycle and this repository contains no v0.25 DB projection, duplicate report template, or orphan semantic ledger. | `node --test tests/skill-authoring.test.cjs tests/v026-contract.test.cjs tests/project-artifacts.test.cjs` | `.ultra/specs/product.md#artifact-lifecycle` |
| AC-07 | Every Skill and the generated Codex plugin pass their native validators, and the complete release gate, package dry run, and isolated five-host Doctor succeed. | validator commands, `npm run verify:release`, `npm pack --dry-run --json`, isolated `node bin/install.js --all --global --doctor --json` | `.ultra/specs/product.md#release-evidence` |

## Non-goals

- Publishing v0.26, pushing Git commits, installing into the real HOME, or spending
  provider quota without separate owner authorization.
- Recreating identical custom-agent APIs on hosts that do not provide them.
- Mechanically deciding semantic completeness, route selection, risk acceptance, or
  final expression.

## Public Seams

- `npx ultra-builder-pro-cli --<host> --<scope>` and `--doctor --json`
- each host's native Skill picker or invocation syntax
- `node skills/ultra-init/scripts/init_project.cjs --project <repository-root>`
- `ubp delegate run|status|cancel`
- canonical repository files listed in `docs/ARTIFACT-AUTHORITY.md`

## Reconciliation

### Promised and Missing

- The file-first migration existed in Skills and package wiring but this repository's
  own `.ultra/` still contained v0.25 DB projections and duplicate report templates.
- Delegate lacked a strict permission schema, immutable digest binding, actual Git diff
  enforcement, cancellation, timeout, and terminal recovery.
- Kimi and Grok user-only scope and Codex hook trust were not fully represented.

### Built and Unpromised

- None. Each implementation path traces to the owner's completeness request or an
  observable recovery/safety requirement.

### Contradictory

- Historical documentation described an MCP/SQLite supervisor while the accepted
  v0.26 product is file-first. Historical plans remain evidence; current product docs
  and installed assets must not present those retired paths as live.

## Planning Posture

`EXPAND`, explicitly selected by the owner through “一次性全部完善”: close every
identified product, adapter, artifact, review, hook, and delegation gap in this Change.
No product commitment is reduced.

## Recovery

All repository changes remain uncommitted against base `3f99189bc68697262cd90444685ac2d4857139c4`.
Recover individual files from the Git diff or revert a future bounded commit. Isolated
install tests use temporary roots and uninstall their managed assets; no real HOME
mutation is part of this Change.

## Unresolved Decisions

- None blocking local completion. Real HOME installation, authenticated provider
  invocations, commit, push, and publication await separate owner authorization.
