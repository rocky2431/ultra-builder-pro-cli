# ZCode Task 2 Repair 1 execution packet

## Mission

Repair only the P1 findings from the admitted initial Task Review for
`vnext-d1-host-enforcement-qualification`. ZCode remains the sole
implementation/product-surface writer. Codex owns Task state, Review, evidence,
ledger and delivery artifacts.

The selected installed Host qualification is terminal and consumed. Do not launch a
provider, retry that qualification, invoke another Agent, or infer support from the
absence of effects. Preserve the truthful `host_enforcement_unavailable` route and fix
the three Review-proven root causes with the smallest existing-path change.

## Authority and immutable bindings

- HEAD: `adb7bfe89f40e107d0c9c490076a6e74294b9337`.
- Goal decision: `.ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md`,
  SHA-256 `95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9`.
- Active intent: `.ultra/changes/active/chg-ultra-vnext-d1-delegation-safety/intent.md`,
  SHA-256 `facd82839282352c100e432c4d13720de98bcc1a6d17f8a9e57c01d659a6e437`.
- R2: `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md`,
  SHA-256 `f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7`.
- Task context: `.ultra/contexts/task-vnext-d1-host-enforcement-qualification.md`,
  SHA-256 `1c233b81163172eda8d52d9ade3809e9540a2e7ee04554c5de8695ebddba78ed`;
  canonical Acceptance-section SHA-256
  `e5a8b33d17c7b2bed30fa351f59f83b5d0169418d16eecc977e6f18987ff2914`.
- Qualification attempt:
  `.ultra/evidence/vnext-d1-host-enforcement-qualification/host-enforcement-attempt.json`,
  SHA-256 `87b71b641d204907b8368b834db2093fb3cbb384e6023f8181c236d7972e0897`.
- Qualification receipt:
  `.ultra/evidence/vnext-d1-host-enforcement-qualification/host-enforcement-receipt.json`,
  SHA-256 `936c77949630c52a7ca128c0f780cc98b2f3a046e5ff8d500bb41cd145bdde01`.
- Initial ZCode packet: `work/vnext-d1-zcode-host-enforcement-qualification.md`,
  SHA-256 `a93efec08cff4e6678eb983d18653586384cf0cc2f593858378d9179de90e945`.
- Initial ZCode delegation: `47f5eac1e75142d3a3f6e0451983d2ca`; local result
  `/Users/rocky243/.local/state/agent-delegation/runs/20260901T144329Z-47f5eac1e75142d3a3f6e0451983d2ca/result.json`,
  SHA-256 `cb502a4cacf0f9ca4fa3c166fa53f8a086a65fe0f9237bb41b38c2ce9ab9d48a`.
- Initial Review session: `vnext-d1-host-enforcement-initial-review-20260901`.
  - `WORKER-PACKET.json`: `f2780051c8682ab43caffddd685db0ee49ab902b0bee5e80f35ab10e7bad2b48`
  - `ADMISSION.json`: `305abd7f7b8b9033d896af1fd4f77346fde6df13ec5dd0e8e75b60147df7304a`
  - `SUMMARY.json`: `92fc4435ff5a4c1be4d492be4e7b19e6ef5e589cc0b0fea53c417e783d60c5bc`
  - verdict: `REQUEST_CHANGES`; P0 `0`, P1 `10`, P2 `5`.
- The ledger must still say Task 1 `completed` and Task 2 `in_progress`; this D1
  Change must remain the sole active Change.
- This is Repair attempt 1 of at most 2 for Task 2, bounded to 7200 active seconds.
  One active ZCode writer only. Recover ordinary tool, test, transport and process
  accidents inside this attempt, but do not create another writer or consume another
  provider call.

Allowed effects are local edits to only the fifteen paths below plus local tests and
validators. Never commit, push, tag, publish, deploy, install into real HOME, inspect or
change credentials, fetch packages, access production/business endpoints, purchase or
top up, or perform any other external effect.

## Writable paths and exact Repair 1 start hashes

| Path | SHA-256 |
|---|---|
| `.ultra/specs/architecture.md` | `5ca919e219ba40ae916ab0bd5b5bf6edafaf2b4d464079273af9967cc404a862` |
| `.ultra/specs/product.md` | `db44d0cad34ff780a8fc211e300522a9e02529d08c5bd9c996f335826b66a594` |
| `.ultra/specs/research-distillate.md` | `153eddd5e46b67bdcf51e385eee63c5a991bda0857e8ae1dfa2185ef3ff2f7af` |
| `bin/install.js` | `14fbcfab9b3e0933030887d78724ae1c7442fd481a9975db6bbd8b06f83aa798` |
| `docs/ARCHITECTURE.md` | `e86b824639f839d9cc41797431f4b6be415582ba1e5374978326cfd3b795c605` |
| `docs/ARTIFACT-AUTHORITY.md` | `a85cba010a67be8f42c925f9efc953db6bce954851afe9f3325c5adb6af42553` |
| `docs/RUNTIME-COMPAT-MATRIX.md` | `1e3518b442a5a5287cecbc34f4cdcb2d88a56d60f099739be87a325edf3bff57` |
| `skills/ultra-delegate/SKILL.md` | `a58ae1229150cd793a30cab4c7cc76c2fe7e1e234951e8146cf41ff789238416` |
| `skills/ultra-delegate/references/delegation-contract.md` | `9adbe6be0f69da60bd4a207b66d73cdf10cb7d80c694fb9df9dfb8370ccbf9e2` |
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `e2a5b2f06da57a8765ced0a05a42febe533a2c5fe0e45bb89df4833d1a45dd8f` |
| `skills/ultra-delegate/scripts/delegate.cjs` | `1ebf2ea07a6769287a74b19f2dc695b9f4e8fbeb21868821dacc845f0f0bde97` |
| `skills/ultra-delegate/scripts/host-profile.cjs` | `708ee35bdcbafebd7a057e69c5d2cd77bc1331f4603f932a98c648c831f4d119` |
| `tests/acp-driver.test.cjs` | `1b809c82bfb64124dd9213822c789dd5d98c5de007d8ae02f29396e846ba4818` |
| `tests/delegate.test.cjs` | `d7fabb464125ae65c6601cdceda5e519ccfd70172fc11139faef6f4666f2f687` |
| `tests/v026-contract.test.cjs` | `5232b1aec265b7a6495e9e15304d5b57f1069b296a2e1f3e6d1c84e5eac4592d` |

No other implementation or maintained product path is writable. The
`agent-execution-driver.cjs` path is optional and may remain unchanged; use it only if
the smallest correct provider-neutral repair must separate pure transport choice from
process-backed identity attestation. All `.ultra` task, decision, evidence, Review,
runtime, progress and Change files are read-only except the three maintained spec paths
explicitly listed above.

## Frozen outside-scope state

Read and verify
`work/vnext-d1-host-enforcement-repair-1-outside-baseline.md`, SHA-256
`9908daa5aa69b03210dff666b428b593552eceb9833f222268a849c63d4c662c`.
It contains 55 canonical Git-visible lines whose digest, including one trailing LF, is
`bd3afd1a5aa00d891fdc64cb11724b605e1c9ddf0baac1512f7210779d38d35a`.
Every line must remain byte-identical. The baseline itself and this exact packet are the
only permitted new Git-visible files relative to that snapshot.

## Required RED-first repair

Before editing, trace every caller of Host admission, driver/candidate selection,
identity probes, the direct `delegate.cjs` process boundary, and the `ubp delegate`
compatibility boundary. Reuse the existing profile, admission error, result projection,
CLI parsing and fixtures. Add no dependency, provider-brand policy branch, second
orchestration/policy engine, generic sandbox, daemon, database, credential broker,
fallback, package installer or Step 1 behavior.

First add and run deterministic RED coverage for all three root causes:

1. A fake executable identity-probe canary proves zero probe invocations when retained
   capability facts already make every available transport unavailable. The stable
   unavailable decision must happen before any process-backed identity probe, fence,
   worker spec, worker process or Host process. Keep the decision capability-driven and
   provider-neutral; preserve exact positive-path attestation ordering for any future
   qualified route.
2. Exercise both real public process entry points: direct installed Skill
   `delegate.cjs` and `bin/install.js ... delegate`. Each must preserve nonzero exit and
   emit one stable, parseable, redacted typed diagnostic containing
   `host_enforcement_unavailable`, the bounded human recovery message and the admission
   object. Do not require an automated caller to parse English prose, and do not expose
   environment or secret values. Reuse one shared projection rather than duplicating
   error policy in both launchers.
3. Run the canonical project-artifact binding check and prove the two existing
   `research-distillate.md` source-blob rows are stale before changing them.

Then implement the smallest root repair:

- Decide the retained all-transports-unavailable case from pure, version-bound capability
  facts before executable identity probes. Do not weaken the fail-closed dimension set,
  change ZCode's `experimental` maturity, retry the qualification, or silently fallback.
- Preserve the typed unavailable state at both process boundaries with one redacted
  machine-readable projection plus the existing useful human recovery. Keep all other
  existing error/result behavior compatible.
- Refresh only the two canonical `research-distillate.md` source-blob rows made stale by
  the already-admitted product and architecture spec changes. Do not distill or rewrite
  any other source.

Resolve these initial Review findings together:

- pre-admission executable probes: `review-spec-001`, `review-code-001`,
  `review-tests-001`, `review-errors-002`, `review-design-001`;
- typed process diagnostic loss: `review-spec-003`, `review-code-002`,
  `review-tests-002`, `review-errors-001`;
- stale canonical distillate binding: `review-spec-002`.

Retain and report, but do not auto-repair, the five P2 findings
`review-code-003`, `review-code-004`, `review-tests-003`, `review-design-002` and
`review-design-003`. Also do not touch the separate Task 1 Acceptance-hash evidence
error; Codex must explicitly reopen and republish that completed task after this writer
stops.

## Verification and return

Run at minimum:

```bash
node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/v026-contract.test.cjs
/opt/anaconda3/bin/python /Users/rocky243/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/ultra-delegate
npm run verify:release
npm pack --dry-run --json
git diff --check -- .ultra/specs/architecture.md .ultra/specs/product.md .ultra/specs/research-distillate.md bin/install.js docs/ARCHITECTURE.md docs/ARTIFACT-AUTHORITY.md docs/RUNTIME-COMPAT-MATRIX.md skills/ultra-delegate/SKILL.md skills/ultra-delegate/references/delegation-contract.md skills/ultra-delegate/scripts/agent-execution-driver.cjs skills/ultra-delegate/scripts/delegate.cjs skills/ultra-delegate/scripts/host-profile.cjs tests/acp-driver.test.cjs tests/delegate.test.cjs tests/v026-contract.test.cjs
```

The full release gate may still report only the known, coordinator-owned Task 1
Acceptance-hash evidence mismatch. Do not edit Task 1 artifacts to make it green.

Return: exact observed RED assertions before product edits; exact changed paths and final
hashes; focused/full/pack/validator/diff results and exit codes; proof that all immutable
bindings and 55 outside-scope lines stayed unchanged; a mapping from every P1 id to its
repair and refreshed evidence; retained P2s and any genuine blocker. Do not self-approve,
start Review, write Task evidence, update context/ledger, finalize/archive D1, begin
Step 1, or perform an external effect.

Stop only for a real authority/hash mismatch, required path outside this inventory,
unprovable active writer, forbidden effect, or an unsafe need to fail open. Ordinary
tool/test/process/transport accidents must be diagnosed and recovered inside this one
attempt rather than abandoning the goal.
