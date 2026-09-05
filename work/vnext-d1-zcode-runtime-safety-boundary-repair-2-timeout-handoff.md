# D1 Task 1 Repair 2 Timeout Handoff

## State

- Task: `vnext-d1-runtime-safety-boundary`
- ZCode delegation: `145ed685bc1f4eb192f4e8615f09bc0c`
- Receipt directory:
  `/Users/rocky243/.local/state/agent-delegation/runs/20260901T093008Z-145ed685bc1f4eb192f4e8615f09bc0c`
- Terminal: `status=error`, `exit_code=3`, protocol error
  `Timed out after 7200000ms`
- Repair Packet 2 SHA-256:
  `78666b660d91528fb3e2d260ed32da4d971d3fcac5090049e7b9f87fe824af54`
- HEAD remains `adb7bfe89f40e107d0c9c490076a6e74294b9337`.
- No ZCode, `agent-delegate`, `delegate-worker`, fake ACP or fake Host process
  remained after terminal recovery.
- The original 45-entry pre-task dirty manifest still has `mismatch_count=0`.
- No commit, push, tag, publish, deploy, real-HOME installation, credential mutation,
  production/business access or other authorized external effect occurred.

This is a recoverable partial implementation, not a Task Review subject and not task
completion. ZCode remains the only implementation-code writer.

## Valid RED and current partial GREEN

Before product repair, ZCode recorded a valid targeted RED of `89 tests / 71 pass /
19 fail`. The failures were behavior assertions covering phase invariants, failed
writer-start observation, spawn failure, fallback gating, post-spawn recovery identity,
spec drift cancellation, conflicting recovery facts, reused PID, worker lock claim,
stale cancel artifacts, frozen `outcome_unknown`, fast-cancel fence recreation,
non-absolute fence roots and cancel-request symlinks.

After the timeout, Codex independently ran:

```bash
node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs
```

Observed result: `89 tests / 78 pass / 11 fail`, exit `1`.

The following Repair 2 behavior is now green:

- exact writer-observation phase invariants and legal transitions;
- CLI and ACP started-observation failures terminate the known child boundary and do
  not publish success;
- CLI and ACP no-PID spawn failures restore a releasable `not_started` proof;
- ACP fallback consumes only a proven-stopped launch boundary;
- all 75 pre-Repair-2 targeted cases remain green inside the current 78 passes.

The current partial implementation passes syntax checks and:

```bash
git diff --check -- skills/ultra-delegate/scripts tests/delegate.test.cjs \
  tests/acp-driver.test.cjs tests/acp-conformance.test.cjs \
  tests/fixtures/fake-acp-agent.cjs
```

## Current ten-path hashes

| Path | SHA-256 | Repair 2 state |
|---|---|---|
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `e2a5b2f06da57a8765ced0a05a42febe533a2c5fe0e45bb89df4833d1a45dd8f` | partial product repair |
| `skills/ultra-delegate/scripts/delegate.cjs` | `7640badebced0e633b80921bfa510903cc0081f136cbf4523616779ac01630e6` | unchanged from Repair 1 |
| `skills/ultra-delegate/scripts/delegate-worker.cjs` | `552eff0e0a1901ca8346f1db692040d90c570807578ab742fd0978f97aa89a25` | unchanged from Repair 1 |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `99bafe22d0953c391ccbf050c70dad84a0399d4c347e5d4c6a15917ea550d843` | partial product repair |
| `skills/ultra-delegate/scripts/cli-driver.cjs` | `d301ce7df4eb617a8f700bf8454cc9c70bb7d216e49517914ab22a34698f658b` | partial product repair |
| `skills/ultra-delegate/scripts/host-profile.cjs` | `f74d9012b902e820c03547b72c7585c1aba05f2739ac3fcd046f7d72b8bd163c` | unchanged from Repair 1 |
| `tests/acp-driver.test.cjs` | `0e836f9c9ed3fb38337111cc480c30479e76446b48a0812fe62dec4573084e8c` | Repair 2 tests |
| `tests/acp-conformance.test.cjs` | `70c681e1ba8a620e8c655dac0c7e615a096958f03ea5e673a1642136c5be3245` | unchanged from Repair 1 |
| `tests/delegate.test.cjs` | `faefddd9d38b37fd98cba630203b0a4fb5c3da1164e7c0521e9de39b3e3d6f75` | Repair 2 tests |
| `tests/fixtures/fake-acp-agent.cjs` | `4de5803813614ed5309a5b580580cbc59bbe55b20e1e97d9c6c7f30135b6e534` | unchanged from Repair 1 |

## Remaining failures

Nine failures currently reach genuine missing product behavior in `delegate.cjs` and
`delegate-worker.cjs`:

1. `spec drift blocks synthesized terminal fields but never the cancel signal`
2. `spec drift never blocks signalling a live worker`
3. `recovery fails closed on conflicting or malformed lock and receipt facts`
4. `a worker that cannot bind its identity to the launch-bound lock never launches the host`
5. `a pre-existing cancel request is a prior-run artifact that blocks a new launch`
6. `outcome_unknown stays frozen when the descendant dies after the first boundary proof`
7. `a fast pre-host cancel leaves no recreated or partial fence behind`
8. `fence entries with non-absolute roots are invalid and block admission`
9. `cancel refuses a symlinked cancel request and never touches the external target`

Two failures are test-authoring accidents and are not yet valid product RED:

- `a reused bound pid is not trusted or held through a raw liveness fallback` uses
  `spawn(...)`, but `tests/delegate.test.cjs` still imports only `execFileSync` and
  `spawnSync` from `node:child_process`.
- `post-spawn launcher loss retains a bound lock and never trusts the launcher pid`
  sets `UBP_DELEGATE_TEST_FAULT_LAUNCHER`, but the separate launcher invokes the public
  CLI and no production path consumes that variable. Both seams therefore return
  success before reaching the assertions. Repair the test helper so the separate Node
  process imports `run()` and passes the existing `faults` option. Do not add an
  environment-triggered test backdoor to production code. Once the seam is real, the
  underlying lock/spec/worker-recovery assertions remain required product behavior.

## Exact continuation

A continuation must keep the same ten writable paths and finish Repair Packet 2 without
redesigning it:

1. Correct the missing `spawn` test import. Replace the unused launcher-fault environment
   variable with a test-only separate Node launcher that imports `run()` and passes the
   existing `faults` option; confirm both tests then fail for product behavior rather
   than setup. Do not add a production test hook.
2. In `delegate.cjs`, derive one conservative recovery view from lock/receipt facts;
   persist spec digest before spawn; never store launcher PID as worker; reject identity
   conflicts; signal cancel before consuming spec; make runtime atomic writes no-follow;
   expose repair from status without a receipt; reject stale cancel artifacts and
   non-absolute fence roots; delete the unused post-spawn fence PID rewrite.
3. In `delegate-worker.cjs`, bind the worker PID/start identity to the launch/spec before
   any Host launch; refuse an unbound claim; retain lock and fence for terminal
   `outcome_unknown`; never auto-release that terminal in `finally`.
4. Run the exact targeted suite and diff check from Repair Packet 2, then report final
   hashes and outside-scope drift. Do not self-approve.

The accepted durable grant allowed one initial attempt plus two P0/P1 repair attempts,
each at most two active hours. That budget is now exhausted. Resuming implementation
requires an explicit Owner grant for one bounded `repair-2-timeout-continuation` ZCode
attempt; it does not authorize Codex/Claude implementation, a third design repair,
commit, push, tag, publish, deploy, real-HOME installation, credentials or other external
effects.
