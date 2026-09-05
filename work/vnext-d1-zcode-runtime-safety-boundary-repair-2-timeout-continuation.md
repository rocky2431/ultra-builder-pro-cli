# ZCode continuation: D1 Repair 2 timeout partial diff

## Mission

Finish only the existing partial implementation for
`vnext-d1-runtime-safety-boundary`. This is the Owner-authorized bounded
`repair-2-timeout-continuation`, not a new design repair. Preserve the already-green
P1-06 behavior and close the remaining P1-07/P1-08 recovery failures described in the
original Repair 2 packet and the corrected timeout handoff.

ZCode is the sole implementation-code writer. Codex owns continuous review, evidence,
and acceptance. Do not self-approve or start Step 1 factory implementation.

## Authority and time

- Exact continuation grant:
  `.ultra/decisions/2026-09-01-vnext-d1-repair-2-timeout-continuation-grant.md`
  SHA-256 `2a789557172bead69f84000ff423798cbc63eb0d1d5b40b0e435c0f19c2109ce`.
- Original Repair 2 packet:
  `work/vnext-d1-zcode-runtime-safety-boundary-repair-2.md`
  SHA-256 `78666b660d91528fb3e2d260ed32da4d971d3fcac5090049e7b9f87fe824af54`.
- Corrected timeout handoff:
  `work/vnext-d1-zcode-runtime-safety-boundary-repair-2-timeout-handoff.md`
  SHA-256 `f2a192dc00d6eabb7a3c052d5fbec3afea7bf050f2c01c775c87d5fa691996da`.
- Cumulative active provider budget for this logical continuation: at most 7200 seconds.
- Recover ordinary tool, test, and exactly owned local process accidents without
  abandoning the goal. Never create an overlapping writer or exceed the unused
  cumulative budget.

Allowed local effects are edits to only the ten paths below and focused local tests.
Do not commit, push, tag, publish, deploy, install into real HOME, inspect/change
credentials, fetch packages, access production/business systems, purchase/top-up, or
perform any other external effect. Do not spawn subagents or delegate implementation.

Stop only for a genuine authority/digest mismatch, an unlisted required implementation
path, an unprovable pre-existing active writer on these roots, or a forbidden external
effect requirement. Report that exact hard stop without broadening scope.

## Frozen authority and subject

- HEAD: `adb7bfe89f40e107d0c9c490076a6e74294b9337`.
- Goal decision:
  `95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9`.
- Active intent:
  `facd82839282352c100e432c4d13720de98bcc1a6d17f8a9e57c01d659a6e437`.
- Task context:
  `2cd6399df1626171dd98d6e45b97dcd10ce7e7764e22296901a4334d94cf9471`.
- R2 architecture:
  `f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7`.
- Final Plan Review summary:
  `67685cc5f099539b7147db0ea8332d8d9e0fcbb73416d05b225e2951c148178d`.

The only writable paths and their continuation-start SHA-256 values are:

| Path | SHA-256 |
|---|---|
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `e2a5b2f06da57a8765ced0a05a42febe533a2c5fe0e45bb89df4833d1a45dd8f` |
| `skills/ultra-delegate/scripts/delegate.cjs` | `7640badebced0e633b80921bfa510903cc0081f136cbf4523616779ac01630e6` |
| `skills/ultra-delegate/scripts/delegate-worker.cjs` | `552eff0e0a1901ca8346f1db692040d90c570807578ab742fd0978f97aa89a25` |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `99bafe22d0953c391ccbf050c70dad84a0399d4c347e5d4c6a15917ea550d843` |
| `skills/ultra-delegate/scripts/cli-driver.cjs` | `d301ce7df4eb617a8f700bf8454cc9c70bb7d216e49517914ab22a34698f658b` |
| `skills/ultra-delegate/scripts/host-profile.cjs` | `f74d9012b902e820c03547b72c7585c1aba05f2739ac3fcd046f7d72b8bd163c` |
| `tests/acp-driver.test.cjs` | `0e836f9c9ed3fb38337111cc480c30479e76446b48a0812fe62dec4573084e8c` |
| `tests/acp-conformance.test.cjs` | `70c681e1ba8a620e8c655dac0c7e615a096958f03ea5e673a1642136c5be3245` |
| `tests/delegate.test.cjs` | `faefddd9d38b37fd98cba630203b0a4fb5c3da1164e7c0521e9de39b3e3d6f75` |
| `tests/fixtures/fake-acp-agent.cjs` | `4de5803813614ed5309a5b580580cbc59bbe55b20e1e97d9c6c7f30135b6e534` |

The 50 outside-scope dirty files are frozen in
`work/vnext-d1-repair-2-timeout-continuation-outside-baseline.md`, SHA-256
`f49235040c56dac08088b436b409f0a26baf4218027acddac0f7417a76de1850`.
Preserve every entry byte-for-byte. Also preserve the baseline and this packet.

Before editing, verify every digest and prove there is no other active ZCode,
`agent-delegate`, `delegate-worker`, fake ACP, or fake Host implementation process.

## Exact continuation work

1. Repair two invalid test setups first, within `tests/delegate.test.cjs` only:
   - import `spawn` from `node:child_process` for the reused-PID test;
   - replace `UBP_DELEGATE_TEST_FAULT_LAUNCHER` with a test-only separate Node launcher
     that imports `run()` and passes its existing `faults` option. Do not add a
     production environment hook. Prove both cases then reach product assertions.
2. In `delegate.cjs`, finish the one conservative recovery view from all lock/receipt
   facts; reject malformed/conflicting launch, delegation, digest, PID and start-identity
   facts. Persist the launch-bound spec digest before spawn and never store the launcher
   PID as worker identity. Do not fall back to raw PID liveness after a bound start
   identity mismatch.
3. Write/refuse the canonical `cancel.request` without following symlinks and before
   consuming mutable spec fields. Spec drift may prevent synthesized terminal fields,
   but must not prevent signalling a live worker. Make only the required runtime atomic
   writes no-follow; do not redesign all filesystem I/O.
4. Make `status` truthful without a receipt, expose the canonical cancel repair, reject
   stale cancel artifacts and non-absolute fence roots, and delete the unused post-spawn
   fence PID update/helper rather than adding another reader.
5. In `delegate-worker.cjs`, claim the exact launch/spec lock with worker PID/start
   identity before Host launch. Refuse the Host if the claim cannot be persisted. Once
   `outcome_unknown` is published, retain its lock and fence until explicit matching
   recovery proves stop; never release it in `finally`.
6. Reuse current helpers and schemas. Keep the three retained P2s from Repair 2 as P2:
   Host-created sessions, cross-platform start-identity strength, and stale registry
   `.lock`. Add no daemon, database, lease service, workflow engine, dependency, retry
   loop, Supervisor, Host qualification, or Step 1 behavior.

## Completion evidence

Run exactly:

```bash
node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs
git diff --check -- skills/ultra-delegate/scripts tests/delegate.test.cjs \
  tests/acp-driver.test.cjs tests/acp-conformance.test.cjs \
  tests/fixtures/fake-acp-agent.cjs
```

The targeted suite must be fully green with no leaked process. Report:

- exact test counts and command exit codes;
- every changed writable path and final SHA-256;
- outside-scope baseline comparison and any incident cleanup;
- remaining P2s and any genuine P0/P1 blocker.

Do not run release publication/deployment/install effects and do not modify evidence,
Task State, grant, handoff, or review files. Return the frozen candidate to Codex for
independent Task Review.
