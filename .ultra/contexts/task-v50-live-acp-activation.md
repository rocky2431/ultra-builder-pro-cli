# Task v50-live-acp-activation: Activate and prove all six live ACP transports

## Context

**What**: Replace the six provisional fallback rows with executable, pinned/native ACP
v1 candidates, build the independently distributed ZCode bridge, and prove one real
read-only provider session per Host without changing the isolated Git subject.

**Why**: Fake-protocol coverage proves Ultra's shared driver, but it cannot prove Host
authentication, adapter compatibility, streamed message shapes, or ZCode's installed
runtime bridge. A Host may claim passed conformance only after its own receipt exists.

**Constraints**:
- ACP remains transport only; `.ultra` files and Git retain authority.
- One smallest read-only task per Host; no purchase, credential capture, or writable root.
- Official ACP registry commands are version-pinned where the Host lacks a native server.
- `zcode-acp` is built from v0.1.0 commit `42fe149d...` plus the retained,
  digest-bound ZCode 0.16.5 runtime-preferences patch; no ZCode byte is copied.
- CLI fallback remains reachable when a compatible ACP executable is absent.

## Implementation

**Layers touched**: Host profiles, execution-driver process cleanup, conformance harness,
delegate/Doctor assertions, runtime documentation, redacted Host receipts.

**Pattern**: Use the existing `AcpDriver` and exact delegation result validator. Keep
per-Host commands declarative and select ACP only from executable + protocol + receipt.

## Planned Path Inventory

`CREATE`:

- `skills/ultra-delegate/scripts/acp-conformance.cjs`
- `skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch`
- `docs/evals/ultra-5-0-live-acp-conformance.md`
- `.ultra/evidence/v50-live-acp-activation/verification.log`
- `.ultra/evidence/v50-live-acp-activation/zcode-bridge.json`
- `.ultra/evidence/v50-live-acp-activation/receipts-manifest.json`
- `.ultra/evidence/v50-live-acp-activation/host-claude.json`
- `.ultra/evidence/v50-live-acp-activation/host-codex.json`
- `.ultra/evidence/v50-live-acp-activation/host-opencode.json`
- `.ultra/evidence/v50-live-acp-activation/host-kimi.json`
- `.ultra/evidence/v50-live-acp-activation/host-grok.json`
- `.ultra/evidence/v50-live-acp-activation/host-zcode.json`

`MODIFY`:

- `skills/ultra-delegate/scripts/host-profile.cjs`
- `skills/ultra-delegate/scripts/agent-execution-driver.cjs`
- `skills/ultra-delegate/scripts/delegate.cjs`
- `skills/ultra-delegate/scripts/delegate-worker.cjs`
- `skills/ultra-delegate/scripts/acp-driver.cjs`
- `skills/ultra-delegate/SKILL.md`
- `skills/ultra-delegate/references/delegation-contract.md`
- `tests/acp-driver.test.cjs`
- `tests/delegate.test.cjs`
- `tests/install.test.cjs`
- `docs/RUNTIME-COMPAT-MATRIX.md`
- `docs/ARCHITECTURE.md`
- `README.md`
- `README.zh-CN.md`

## Public Seams

- six `hostProfile(...).acp` command/version/conformance rows
- `ubp delegate run/status/cancel` selected driver and fallback reason
- optional `zcode-acp` bridge discovery
- redacted real-Host conformance receipt schema and harness

## Narrow Verification

- RED/GREEN: `node --test tests/acp-driver.test.cjs tests/delegate.test.cjs tests/install.test.cjs`
- upstream: `cargo test --locked` and fake bridge E2E at pinned ZCode bridge commit
- live: one bounded `acp-conformance.cjs` run for each of six Hosts

## Acceptance Criteria

**Change Acceptance IDs**: [`AC5-13`, `AC5-14`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| LA-01 | All six profiles expose stable ACP v1 stdio candidates with exact pinned/native commands, and capability inspection never starts a provider | `command` | profile/selection unit tests and source inspection |
| LA-02 | The pinned `zcode-acp` source plus digest-bound 0.16.5 compatibility patch passes locked tests and fake E2E, builds locally, identifies both source inputs, and resolves the installed ZCode Desktop runtime | `command` | source/patch test-build log plus bridge receipt |
| LA-03 | Each Host completes one real read-only ACP session, returns the exact Ultra result, leaves the isolated Git tree unchanged, and reaches a terminal child state | `external-observation` | six redacted Host receipts and raw-log digests |
| LA-04 | Only rows backed by their own current receipt select ACP; missing executable/version/auth or failed conformance returns a typed CLI fallback reason | `command` | selection/Doctor tests and conformance receipt inspection |
| LA-05 | The harness and stored receipts exclude prompts, responses, hidden reasoning, credential values, and unbounded provider output | `inspection` | conformance script, receipt schema, and secret-pattern scan |

## Definition of Drift

- Marking a Host passed from fake tests or another Host's receipt.
- Treating ACP `StopReason` as semantic task completion.
- Bundling `zcode.cjs`, storing provider text/credentials, or removing CLI recovery.
- Adding a daemon, provider registry, or runtime semantic ledger.

## Trace

**Source**: `.ultra/decisions/2026-08-26-ultra-5-0-live-activation.md`

**First principles**: [`FP-1`, `FP-2`, `FP-5`, `FP-6`]

**Serves**: [`NS-02`, `NS-04`, `NS-05`]

**Causal contribution**: Real Host receipts turn a structurally complete driver into a
usable transport while preserving the same bounded result and file/Git authority.

**Hard constraints**: [`HC-1`, `HC-2`, `HC-3`, `HC-5`, `HC-6`]

**Decisions**: `.ultra/decisions/2026-08-26-ultra-5-0-live-activation.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-26 | boundary expansion | Initial live-activation task | Change intent | Owner activated all six real transports |
| 2026-08-26 | evidence repair | Named the source/build/install bridge receipt separately from the Host provider receipt | Planned Path Inventory | LA-02 requires both the upstream command log and a bridge identity receipt |
| 2026-08-26 | provider correction | Replaced the mistaken international Z.AI OAuth assumption with the existing domestic BigModel Coding Plan provider | Constraints, evidence | Owner clarified the account/provider boundary and the Desktop config verified it |
| 2026-08-26 | compatibility repair | Added a digest-bound 0.16.5 runtime-preferences patch after reproducing the upstream session/create deadlock | Planned path, LA-02 evidence | Installed ZCode CLI 0.16.5 sends a required server request absent from the upstream 0.15.2 validation target |
| 2026-08-26 | strict Review repair | Added bounded bridge/runtime identity probes and a one-time pre-prompt authentication fallback | LA-01, LA-02, LA-04, runtime contract | Initial strict Review found that executable presence did not prove the patched bridge and that `acp_auth_required` did not reach the documented CLI recovery |
| 2026-08-26 | evidence closeout | Published and validated one current v2 completion record after the affected-lens Review approved | LA-01 through LA-05, Task Review | Six live receipts, bridge identity, focused tests, privacy scan, and all four blocking dispositions are durably bound |

## Open Questions

- _(none; an absent/expired Host login is a typed live prerequisite, not a design choice)_

## Resume Note

Why: prove the six real ACP boundaries. Outcome: completed; every executable supported
Host selects ACP from its own receipt, with typed identity/auth recovery. Reality: local
5.0 candidate is recovery commit `8be6f6d`; all six real Host receipts pass, ZCode uses
the domestic BigModel provider through the digest-bound 0.16.5 compatibility patch, and
final evidence validates as `current-v2`. Decision needed: none. Next bounded action:
activate the verified package in the real user Host directories. Not done: real HOME
activation, Windows CI, push, tag, or publication.

## Task Review

- Execution Grant state/limitation: consumed for this task; all six current live Host
  receipts, the repair Review, and final v2 evidence validate. The ledger completion
  write remains the sole mechanical closeout authority.
- Initial Review: `.ultra/reviews/v50-live-acp-activation-initial-review-v1/SUMMARY.json`,
  SHA-256 `bafd446a97dd311f6379cbd5595c44310c67ef337f3c248597103bd2210dd375`,
  verdict `REQUEST_CHANGES`.
- Blocking repair set: `review-spec-001`, `review-code-001`, `review-tests-001`, and
  `review-errors-001`. Current source adds exact build/runtime identity probes plus the
  one-time pre-prompt auth fallback; focused verification is 75/75 and the final ZCode
  domestic BigModel receipt is
  `156080f88ed84a013fb26d93e5138230732d2ef0e2b5b10a7c3deb501d3548e9`.
- Review session and Summary digest:
  `.ultra/reviews/v50-live-acp-activation-delta-review-v3/SUMMARY.json`, SHA-256
  `7b5c5375c7d99f6a2866821cc477a9292bf039a22a46864da7c30cc84cad4281`,
  verdict `APPROVE`, both axes `PASS`, no current findings.
- Blocking findings and dispositions: all four initial P1 ids are `resolved` by the
  final marker, runtime probe, typed pre-prompt fallback, focused 75/75 suite, and
  refreshed domestic BigModel receipt.
- Final evidence: `.ultra/evidence/v50-live-acp-activation/evidence.json`, SHA-256
  `c94a44bf297a51566ff8ea5cc200a9ed24282cd0b808b2d7e61e319c87845c6b`,
  classification `current-v2`, diagnostics `[]`.
- Retention: retain every redacted live receipt and the exact final strict Review session
  through aggregate Test and Deliver; premature loss requires a fresh Review and Test.
