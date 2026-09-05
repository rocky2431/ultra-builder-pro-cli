# Proposed D1 aggregate-P1 supplemental grant

> **State**: `PROPOSED — INACTIVE`
>
> This file is an owner-readable proposal, not authority. It cannot activate a
> workflow, consume a provider call, widen a path inventory, or authorize any effect.

## Bound subject

- Goal: Ultra Builder Pro vNext three-stage cumulative delivery.
- Change: `chg-ultra-vnext-d1-delegation-safety`.
- Repository HEAD: `adb7bfe89f40e107d0c9c490076a6e74294b9337`.
- Aggregate Review: `vnext-d1-aggregate-review-20260902`.
- Aggregate Review summary SHA-256:
  `1ce9dfed3700a1d743cdfdac6ac3dad562cf5d44fe7902cbd3f68767a064b558`.
- Current verdict: `REQUEST_CHANGES`, P0=0, P1=3, P2=8, P3=1.
- Reopened Task 1 evidence SHA-256:
  `a5009b75c0f5e100348494d4b2df278557b508eb164a6808b6cc7a33705bb2c4`.
- Reopened Task 2 evidence SHA-256:
  `640412cf281819b89e0a370efc82f30a98314860356d13ccf18d23a5e5bb0ac7`.

## Exact incremental authority proposed

### Task 1 aggregate-P1 repair

Authorize one new ZCode implementation attempt, cumulative maximum 7200 active provider
seconds, solely for `review-tests-001` and `review-errors-001` on
`vnext-d1-runtime-safety-boundary`.

The only implementation/test paths added to this attempt are:

- `skills/ultra-delegate/scripts/delegate.cjs`
- `skills/ultra-delegate/scripts/delegate-worker.cjs`
- `tests/delegate.test.cjs`

The repair must:

1. observe the actual detached worker process receiving the worker-scoped environment,
   including the three packet paths, while proving Primary controls and unrelated-provider
   keys/values are absent;
2. treat `EPERM` from outer-worker `kill(pid, 0)` as existent or unprovable, and treat only
   `ESRCH` as a stop proof;
3. prove through a focused recovery regression that `EPERM` cannot synthesize a terminal,
   delete `run.lock`, or release the worktree fence.

The preferred minimal test seam is a programmatic worker-entry wrapper that records key
names and then executes the real `delegate-worker` in the same detached child process. It
must not add a product environment variable, daemon, supervisor, dependency, or new public
CLI option.

Authorize exactly one fresh Codex P0/P1-only Task 1 delta Review after the repair. P2/P3
remain report-only.

### Task 2 existing Repair 2 inventory extension and qualification

Do not create another Task 2 repair budget. Permit the already-unused Task 2 Repair 2,
cumulative maximum 7200 active provider seconds, to use its existing Planned Path Inventory
plus only these additions:

- `skills/ultra-delegate/scripts/acp-driver.cjs`
- `skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch`
- `tests/fixtures/fake-acp-agent.cjs`
- an isolated local `zcode-acp` worktree at exact upstream commit
  `42fe149d4b501469343c01f23ba3801832306d53`, limited to:
  - `src/acp_translator.rs`
  - `src/agent.rs`
  - `tests/acp_client.py`
  - `tests/fake-app-server.cjs`

`skills/ultra-delegate/scripts/host-profile.cjs` and `tests/acp-driver.test.cjs` are already
inside the Task 2 inventory and may consume the changed canonical patch digest and focused
regression respectively.

The repair must:

1. extract ZCode native `file_path` as an ACP `ToolCallLocation` and carry the same bounded
   locations into the ACP permission `ToolCallUpdate`;
2. keep every rejected ACP operation rejected and journaled without resolving transport
   fatal immediately, allowing the same bounded turn to request the remaining independent
   denial probes; if any denial occurred, the final Ultra projection remains
   `failure_type: permission_denied` rather than success;
3. add bridge and Ultra multi-denial regressions before changing the implementation;
4. update the canonical bridge patch and its SHA binding so the tested source is
   reproducible.

The local bridge checkout was verified before this proposal:

- HEAD is `42fe149d4b501469343c01f23ba3801832306d53`;
- its six current compatibility changes produce SHA-256
  `174dfd0feafe84320556a84b5ae08b10e44c5515fea4992fd1d58af54cee4e3d`, exactly matching
  the current canonical Ultra patch;
- `cargo test --offline` passed 6/6;
- the retained checkout has unrelated dirty compatibility files, so repair must use a fresh
  isolated local worktree rather than edit it in place.

Authorize offline-only bridge tests and build artifacts in that isolated worktree. Package
fetch and network dependency resolution remain denied; an offline cache miss is a reported
precondition, not permission to fetch.

After the repair and independent local verification, authorize one new exact selected-ZCode
Host no-production qualification call, maximum 1800 active provider seconds, using the
temporary release binary through `ULTRA_ZCODE_ACP_COMMAND`. Dispatch consumes this call.
There is no automatic retry, fallback, purchase, login, credential mutation, maturity
upgrade, real-HOME installation, or replacement of
`/Users/rocky243/.local/bin/zcode-acp`.

Task 2 retains only its existing unused P0/P1 Repair 2 and Task 2 delta Review. The existing
aggregate D1 P0/P1 delta Review budget may be consumed only after both Task Reviews approve
and fresh Task Evidence v2 records close their exact gaps.

## Recovery and ordering

- ZCode remains the sole implementation-code writer; only one ZCode attempt may be active.
- Codex remains coordinator, independent validator, Review and evidence writer.
- Recoverable test, process, tool or transport accidents continue within the same named
  cumulative attempt budget. They do not create a second repair, Review or qualification
  call.
- Order is Task 1 Repair -> Task 1 delta Review/evidence -> Task 2 Repair 2 -> independent
  offline validation -> one qualification call -> Task 2 delta Review/evidence -> aggregate
  delta Review -> aggregate Test/Deliver reconciliation only after `APPROVE`.
- Any required unlisted implementation path, source-identity drift, overlapping writer,
  online fetch, authority mismatch, or indeterminate dispatched provider call returns to the
  Owner without pretending closure.

## Effects still excluded

This proposal does not authorize Step 1 implementation, a new Change, finalization/archive,
commit, push, force-push, tag, publish, deploy, production/business access, credential or
identity access/change, login, purchase/top-up, real-HOME installation, external messaging,
or any other external effect. The eight P2 and one P3 aggregate findings remain visible and
are not auto-repaired.

