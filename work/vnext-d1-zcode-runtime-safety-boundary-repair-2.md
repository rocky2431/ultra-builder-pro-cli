# ZCode Repair Packet 2: D1 runtime safety boundary

## Mission

Close the remaining blocking P1 findings in task
`vnext-d1-runtime-safety-boundary`. This is the second and final authorized P0/P1
repair attempt for this task. Keep the repair at the existing shared delegation
boundary: one writer-observation state machine, one launch-bound recovery view and one
physical fence. Do not add a Supervisor, daemon, database, lease service, workflow
engine, dependency, retry loop, Host qualification or Step 1 factory behavior.

ZCode remains the sole implementation-code writer. Codex owns continuous review,
evidence and acceptance.

## Authority and effects

- Durable grant: `ubp-vnext-d1-zcode-safety-2026-09-01`.
- Allowed local effects: edit only the ten paths listed below and run local focused
  tests.
- Preserve every pre-existing dirty path and every Codex coordination artifact outside
  those ten paths byte-for-byte.
- Do not commit, push, tag, publish, deploy, install into real HOME, change or inspect
  credentials, fetch packages, access production/business systems, purchase/top-up, or
  perform any other external effect.
- Do not spawn subagents or delegate implementation.
- Recover ordinary tool, test and process accidents inside this packet. Do not create a
  duplicate writer. Stop only for an authority/digest mismatch, an unlisted required
  path, an unprovable pre-existing active writer on these roots, or a credential/external
  effect requirement.

## Frozen authority and current implementation subject

| Artifact | SHA-256 |
|---|---|
| `.ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md` | `95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9` |
| `.ultra/changes/active/chg-ultra-vnext-d1-delegation-safety/intent.md` | `facd82839282352c100e432c4d13720de98bcc1a6d17f8a9e57c01d659a6e437` |
| `.ultra/contexts/task-vnext-d1-runtime-safety-boundary.md` | `2cd6399df1626171dd98d6e45b97dcd10ce7e7764e22296901a4334d94cf9471` |
| `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md` | `f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7` |
| final Plan Review `SUMMARY.json` | `67685cc5f099539b7147db0ea8332d8d9e0fcbb73416d05b225e2951c148178d` |
| initial Task packet | `ca6d70cbe6badf5ea95c5059ae3d1759f7ddfb55456eec1567981a2ad9bbb457` |
| Repair Packet 1 | `fc0f8bab8f2a60e599d9f3a0f196101e6bee500b908c4d86645e38c8cd38c8cd` |

Expected HEAD remains `adb7bfe89f40e107d0c9c490076a6e74294b9337`.

The current pre-repair hashes of the only writable paths are:

| Path | SHA-256 |
|---|---|
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `7641eede01dec240a7628d31759627e0d8358fa749f283749d418205d76a5a4c` |
| `skills/ultra-delegate/scripts/delegate.cjs` | `7640badebced0e633b80921bfa510903cc0081f136cbf4523616779ac01630e6` |
| `skills/ultra-delegate/scripts/delegate-worker.cjs` | `552eff0e0a1901ca8346f1db692040d90c570807578ab742fd0978f97aa89a25` |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `0619ad209a659396b7d79beec6b13c9df81167d236028378aad6152a74c1dec0` |
| `skills/ultra-delegate/scripts/cli-driver.cjs` | `36136f1430e1ce8812190a0fd433824fa14791ea07b2a8754fe36db6d02a30a3` |
| `skills/ultra-delegate/scripts/host-profile.cjs` | `f74d9012b902e820c03547b72c7585c1aba05f2739ac3fcd046f7d72b8bd163c` |
| `tests/acp-driver.test.cjs` | `dd5fa293ecabe6575d40755a62518476a8ac0f437bc16d21ff5ba02105e29fa3` |
| `tests/acp-conformance.test.cjs` | `70c681e1ba8a620e8c655dac0c7e615a096958f03ea5e673a1642136c5be3245` |
| `tests/delegate.test.cjs` | `c451c36356497b40923c11ec87f840a37a42735a62b0d6b15d53f92f959d5de9` |
| `tests/fixtures/fake-acp-agent.cjs` | `4de5803813614ed5309a5b580580cbc59bbe55b20e1e97d9c6c7f30135b6e534` |

Verify every digest and prove no other implementation attempt is active before editing.

## Blocking P1 findings

### P1-06 — The writer-observation state machine still accepts impossible states

Codex independently reproduced both of these current classifications:

```json
{
  "not_started_with_live_pgid": "stopped",
  "started_with_non_group_pgid": "stopped"
}
```

`validateWriterObservation()` checks field types but not phase invariants. A
`not_started`/`launching` observation may carry a PGID or start identity and still prove
`stopped`; a POSIX `started` observation may point at a PGID other than its detached PID
and let a surviving real group disappear from the proof. Transition helpers also accept
the wrong preceding phase.

`observeWriterStart()` still returns `null` after a post-spawn persistence failure while
both drivers ignore the result and let the Host complete. The current test explicitly
accepts a successful Host result behind a permanently `launching` observation. This is
the original fail-open execution defect, not merely a diagnostic limitation.

Required outcome:

- Validate the exact phase semantics and transitions. `not_started` has no PID, PGID,
  command, argv digest or start identity. `launching` has command/argv identity but no
  PID, PGID or start identity. `started` has a real PID, command/argv identity, a null
  PGID on Windows and `pgid === pid` for the detached POSIX launch. Any impossible,
  skipped or mismatched transition is `unknown`/refused, never stop proof.
- A failure to persist the `started` observation after a PID exists must immediately
  terminate the known child boundary and return a driver failure; it must not continue
  useful Host work or publish success. Because identity was not durably recorded, retain
  `outcome_unknown`/the fence unless a valid matching observation subsequently proves
  stop.
- Preserve ordinary missing-executable behavior: an OS-confirmed spawn failure with no
  child PID may restore an explicit valid `not_started` proof (or an equally exact
  existing representation), publish `spawn_error`, and release safely instead of
  freezing an impossible writer forever.
- Reuse the current observation helpers. Do not add a second journal or process manager.

Required RED/GREEN coverage:

- table-driven phase-invariant cases, including non-null pre-start PGID/start identity,
  POSIX `pgid !== pid`, Windows non-null PGID, missing command/argv identity and illegal
  phase transitions;
- CLI and ACP started-observation fault cases where the Host cannot complete useful work
  and no success is published;
- CLI/ACP no-PID spawn failure remains a truthful, releasable `spawn_error` path.

### P1-07 — Recovery still trusts an unbound gap between launcher and worker

`run.lock` is first persisted before `worker-spec.json` exists and therefore contains no
spec digest. The spec digest is optional in `loadRecoverySpec()`. After worker spawn,
receipt/lock failure can leave only that launcher PID in the lock; `cancel()` prefers it
over the real receipt worker PID. Once the launcher exits it can synthesize `cancelled`
and release a `not_started` fence while the detached worker is alive and may still launch
the Host. Conversely, a reused PID identity mismatch is followed by raw `processAlive`,
which reintroduces an unbounded false-running state.

`launchIdentityOf()` silently prefers receipt over lock without rejecting conflicting
launch identities. `status()` calls a no-receipt post-spawn run `not_started` and offers
no repair command. `cancel()` validates the mutable spec before writing the one canonical
cancel signal, so spec drift prevents a live worker from being told to stop.

Required outcome:

- Persist a valid 64-hex spec digest and exact delegation/launch identity in the lock
  before worker spawn. Never label the launcher PID as the worker PID.
- Before any Host launch, the worker must durably bind its own PID/start identity to that
  same lock/spec/launch (or an equally small existing artifact). If this claim cannot be
  persisted, do not launch the Host. Record the same worker identity in the receipt when
  one is written.
- Derive one conservative recovery view from all available lock/receipt facts. Reject
  malformed facts and any delegation, launch, spec-digest or worker-identity conflict.
  Missing worker identity in the post-spawn window is `unknown`, not stopped. Never let
  a launcher PID or an identity-unaware raw PID fallback authorize synthesis or release.
- A recovery spec is consumable only when at least one valid launch-bound 64-hex digest
  exists, all available bound digests/identities agree, and the current bytes match.
- Create the canonical `cancel.request` signal before consuming mutable spec fields.
  Create/read it without following a symlink or non-regular target. Spec drift may block
  synthesized terminal fields, but it must not block signalling a live worker or release
  the fence.
- With spec/lock/writer artifacts but no receipt, `status` must expose a conservative
  running/unknown/stalled state and the canonical cancel repair, never `not_started` with
  no repair.

Required RED/GREEN coverage:

- run each post-spawn fault through a separate launcher process that actually exits; an
  in-process test process must not mask the launcher-PID bug;
- cover receipt-write and lock-write loss while the worker remains alive/not-started,
  status truth, cancel signalling, retained fence and blocked second writer;
- mutate the bound spec while a worker is live and prove `cancel.request` is still
  created, the worker is signalled, no synthetic safe result/fence release occurs and an
  external sentinel remains byte-identical;
- conflict receipt vs lock launch/spec/worker identities and prove recovery fails closed;
- prove a reused bound PID cannot be trusted or held indefinitely through a raw fallback.

### P1-08 — `outcome_unknown` is not actually a frozen terminal state

After the first three-second boundary proof publishes `outcome_unknown`, the worker's
`finally` performs a second proof and releases the fence if the descendant exits during
that later window. The immutable result remains unknown while the root is silently
admitted to another writer. The worker also deletes the only lock even when a missing
receipt leaves no launch identity for explicit repair.

The post-spawn fence PID update has no reader. A fast terminal worker can release the
fence before that update; `updateWorktreeFence()` then spreads `null` and recreates an
invalid `{pid}` fence. A pre-existing `cancel.request` is not included in the prior-run
artifact guard, which makes that race reachable without a Host.

Required outcome:

- Once the terminal result is `failure_type: outcome_unknown`, neither worker `finally`
  nor elapsed time may release its fence. Retain enough launch-bound lock/recovery
  identity for a later explicit `cancel`/reconcile. The immutable result stays unknown;
  only explicit recovery may release after current matching stop proof.
- Delete the unused post-spawn fence PID rewrite and its helper/field if they have no
  remaining consumer. The fence needs launch/root identity, not a second copy of worker
  liveness. At minimum, a missing fence must never be recreated as a partial object.
- Treat an existing `cancel.request` as a prior run artifact before launch.
- Fence entries with non-absolute/impossible root paths are semantically invalid and
  block admission. Runtime atomic writes used by cancel/recovery must replace or refuse
  symlinks rather than follow them to external targets.

Required RED/GREEN coverage:

- use a same-group child whose lifetime ends after the first proof but before the old
  finally proof would finish; assert `outcome_unknown`, worker exit, retained lock/fence
  and blocked second writer, then explicit cancel releases after stop proof without
  rewriting the terminal result;
- force a fast pre-Host terminal/cancel path and prove no post-spawn action recreates an
  invalid fence;
- pre-existing cancel request, relative-path fence and symlinked cancel request/sentinel
  cases fail closed without touching the sentinel.

## Scope guard and retained P2s

Do not expand this repair into any of the following:

- Hosts that intentionally create a new session can still escape portable PID/PGID
  observation; exact Host file/network/secret/effect enforcement remains Task 2.
- Linux has a stronger start identity than macOS/Windows in the current implementation;
  report the cross-platform false-positive/availability limitation without inventing a
  daemon.
- A process crash while holding the fence-registry `.lock` can leave a stale registry
  lock. Retain this as P2 unless the required P1 repair already removes that lock path;
  do not add leases, TTLs or a lock service.
- Exact additional provider env-auth keys are qualified in Task 2. Preserve the current
  exact allowlist and `HOME` limitation here unless a new failing compatibility test in
  these ten paths proves a direct regression.

## Test discipline and completion

1. Add valid failing regressions for every P1 group above before changing behavior.
   Report exact failing test names/assertions; syntax, fixture or timeout failures do not
   count as RED.
2. Reuse current helpers and fake ACP fixture. No new test framework, dependency, public
   result status, workflow state, daemon or persistent artifact without a live recovery
   consumer.
3. Keep environment isolation, actual Git-diff enforcement, digest checks, ACP-first
   selection, typed fallback and all current proven-stopped N=1 behavior green.
4. Run exactly:

```bash
node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs
git diff --check -- skills/ultra-delegate/scripts tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs tests/fixtures/fake-acp-agent.cjs
```

5. Return one report containing valid RED names/counts; root-cause repairs mapped to
   P1-06..P1-08; exact GREEN counts/exit codes; final ten-path hashes; outside-scope
   drift check; and retained P2/P3 limitations. Do not self-approve the task.
