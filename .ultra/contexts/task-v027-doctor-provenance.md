# Task v027-doctor-provenance: Separate installation integrity, candidate parity, and readiness

## Context

**What**: Add git-worktree/npm-tarball provenance identity and make Doctor independently
report own-manifest integrity, current-source/candidate parity, and activation/provider
readiness for every Host.

**Why**: A stale but internally intact install is not corrupted, and a healthy plugin is
not necessarily an authenticated headless provider.

**Constraints**:
- Null Git fields are valid for tarball identity and cannot alone mean unhealthy.
- Report byte mutation, missing and extra managed assets, wrong expected build, registry,
  trust, and provider states independently.
- Overall status must preserve distinctions, not flatten them into one green boolean.

## Implementation

**Layers touched**: source/tarball identity, installed manifest, parity comparator, native
activation probe, CLI JSON, release evidence, and documentation.

**Pattern**: externally verifiable dimensions with typed repair guidance.

## Planned Path Inventory

`MODIFY`:

- `adapters/_shared/provenance.cjs`
- `adapters/_shared/plugin-core.cjs`
- `adapters/_shared/runtime-assets.cjs`
- `adapters/_shared/tests/provenance.test.cjs`
- `adapters/_shared/tests/plugin-isolation.test.cjs`
- `adapters/claude.js`
- `adapters/codex.js`
- `adapters/opencode.js`
- `adapters/kimi.js`
- `adapters/grok.js`
- `adapters/zcode.js`
- `bin/install.js`
- `docs/PLUGIN-ISOLATION-CONTRACT.md`
- `docs/RUNTIME-COMPAT-MATRIX.md`
- `tests/install.test.cjs`
- `tests/package-smoke.test.cjs`
- `tests/v026-adapters.test.cjs`

`CREATE`:

- `tests/doctor-v2.test.cjs`

Any later addition, removal, or rename in this inventory is plan-critical and requires
a rebuilt Execution Packet plus owner reapproval before implementation continues.

## Public Seams

- installed provenance JSON with `origin.kind: git-worktree | npm-tarball` and projected asset digest.
- Doctor `integrity`, `parity`, and `readiness` dimensions for every Host.
- Doctor `overall: healthy_current | healthy_other_build | degraded | broken`.
- Doctor `parity.status: current | other_build | unknown`.
- `node bin/install.js --<host>|--all --global --doctor --json` output and exit behavior.

## Narrow Verification

- `node --test tests/doctor-v2.test.cjs adapters/_shared/tests/provenance.test.cjs`
- `node --test adapters/_shared/tests/plugin-isolation.test.cjs tests/install.test.cjs`
- `node --test tests/package-smoke.test.cjs tests/v026-adapters.test.cjs`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC-07`, `AC-08`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| A-01 | Worktree and tarball provenance positive cases pass. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-02 | Mutation, missing, orphan, wrong-build, unknown-identity, and registry cases classify correctly. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-03 | Overall status distinguishes current, other-build, degraded, and broken without using a semantic score. | `inspection` | Doctor sources, observed classifications, and revision |
| A-04 | Six real installs report integrity, parity, and readiness separately. | `external-observation` | provider, run id, timestamp, raw evidence ref, and observation |

## Definition of Drift

- Equating provenance with Git only, parity with integrity, or plugin health with provider auth.
- Adding a semantic quality score to Doctor.

## Trace

**Source**: `.ultra/specs/product.md#release-evidence`

**First principles**: [`FP-1`, `FP-2`, `FP-5`]

**Serves**: [`NS-01`]

**Causal contribution**: Separate installed-byte integrity, candidate parity, and live
Host readiness so a green local check cannot masquerade as native activation truth.

**Hard constraints**: [`HC-1`, `HC-4`, `HC-6`]

**Decisions**: `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md#12-doctor-与-provenance-v2`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-15 | — | Initial task contract | — | Phase 0 planning only |

## Open Questions

- _(none)_

## Resume Note

Not started. Capture current stale-first-five/current-ZCode Doctor behavior as tests.

## Completion

_Not completed._

## Task Review

- Execution Packet state/digest/limitation: `not_run`
- Review session identity and summary digest: `not_run`
- Blocking findings with resolution/disposition/evidence refresh refs: `not_run`
- Retention: retain the current strict review session until both aggregate Test and
  Deliver consume it. Premature loss requires a fresh Review and Test; never reconstruct
  the old receipt.
