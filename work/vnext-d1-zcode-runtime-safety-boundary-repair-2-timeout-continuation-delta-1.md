# ZCode delta 1: preserve unknown outer-worker recovery truth

## Mission

Resolve only the six current P1 findings from Codex initial Task Review
`vnext-d1-runtime-safety-initial-review-20260901`. They describe one shared recovery
root plus one exact lock-claim readback omission. This is a resume of the same
Owner-authorized `repair-2-timeout-continuation` using only its unused cumulative time;
it is not a new design repair, a new attempt budget, or Step 1 factory work.

ZCode remains the sole implementation-code writer. Codex owns review, evidence, and
acceptance. Do not self-approve, change workflow artifacts, or start Host qualification.

## Authority and remaining time

- Exact continuation grant:
  `.ultra/decisions/2026-09-01-vnext-d1-repair-2-timeout-continuation-grant.md`,
  SHA-256 `2a789557172bead69f84000ff423798cbc63eb0d1d5b40b0e435c0f19c2109ce`.
- Cumulative continuation maximum: `7200` active provider seconds.
- Already consumed by delegation `e3c55e45222941a9a4f0bb684985e007`:
  `1499.904` seconds.
- Remaining cumulative ceiling: `5700.096` seconds; this dispatch must use a timeout
  no greater than `5700` seconds. Recoverable test, tool, process, or transport accidents
  may resume only inside that remaining cumulative amount and never with an overlapping
  writer.
- Initial Task Review packet SHA-256:
  `2aec0ea50836b8c208695ff27a34d2567b21d96645186ab42b3995dc50f9ff75`.
- Initial Task Review summary SHA-256:
  `4bed8a428078d50bb21a29846876526ab666dc97750fa72895bfe73f03140cc7`;
  verdict `REQUEST_CHANGES`, P0=0, P1=6.
- Delta outside-scope baseline:
  `work/vnext-d1-repair-2-timeout-continuation-delta-1-outside-baseline.md`,
  SHA-256 `ac94afcae4aef978ea3a072c1951888bec71f9f1fa9a582bba148b52065f106a`.

Allowed local effects are edits to only the three writable paths below and focused local
tests. Do not commit, push, tag, publish, deploy, install into real HOME, inspect or
change credentials, fetch packages, access production/business systems, purchase or
top up, or perform any other external effect. Do not spawn subagents or delegate work.

Stop only for a genuine authority/digest mismatch, a required implementation path
outside the three listed paths, an unprovable pre-existing active writer on these roots,
or a forbidden external-effect requirement. Ordinary failures must be diagnosed and
recovered within the unused cumulative time.

## Frozen authority and subject

- HEAD: `adb7bfe89f40e107d0c9c490076a6e74294b9337`.
- Goal decision:
  `95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9`.
- Active intent:
  `facd82839282352c100e432c4d13720de98bcc1a6d17f8a9e57c01d659a6e437`.
- Current task context:
  `183f0dd1e8e8337ccf2964d9f90954f2a886b2f24907532a95187919da95450e`.
  Its acceptance bytes are unchanged; the later bytes only record the admitted initial
  Task Review and next recovery action. The Review itself remains bound to its retained
  pre-update context digest.
- R2 architecture:
  `f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7`.
- Final Plan Review summary:
  `67685cc5f099539b7147db0ea8332d8d9e0fcbb73416d05b225e2951c148178d`.

The three writable paths and their exact delta-start SHA-256 values are:

| Path | SHA-256 |
|---|---|
| `skills/ultra-delegate/scripts/delegate.cjs` | `9f15584c4cb6fc7a303285b5d0aebdf39e020d237f74a70569538bdfef542a75` |
| `skills/ultra-delegate/scripts/delegate-worker.cjs` | `88ba773ddbd653d8af5d5115f449f5d1a1094b393c91e5605b28548b45bd3d5e` |
| `tests/delegate.test.cjs` | `a0f26db7abcebdb1dffeb45c646704ea4405e24b1ce4508d9d7b8a38cb049e25` |

The other seven original task paths are review-subject inputs and must remain byte
identical:

| Path | SHA-256 |
|---|---|
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `e2a5b2f06da57a8765ced0a05a42febe533a2c5fe0e45bb89df4833d1a45dd8f` |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `99bafe22d0953c391ccbf050c70dad84a0399d4c347e5d4c6a15917ea550d843` |
| `skills/ultra-delegate/scripts/cli-driver.cjs` | `d301ce7df4eb617a8f700bf8454cc9c70bb7d216e49517914ab22a34698f658b` |
| `skills/ultra-delegate/scripts/host-profile.cjs` | `f74d9012b902e820c03547b72c7585c1aba05f2739ac3fcd046f7d72b8bd163c` |
| `tests/acp-driver.test.cjs` | `0e836f9c9ed3fb38337111cc480c30479e76446b48a0812fe62dec4573084e8c` |
| `tests/acp-conformance.test.cjs` | `70c681e1ba8a620e8c655dac0c7e615a096958f03ea5e673a1642136c5be3245` |
| `tests/fixtures/fake-acp-agent.cjs` | `4de5803813614ed5309a5b580580cbc59bbe55b20e1e97d9c6c7f30135b6e534` |

Before editing, verify every digest, the 52 Git-visible outside-scope entries and eight
separately frozen strict Review artifacts in the baseline, and prove there is no other
active ZCode implementation, `agent-delegate`, `delegate-worker`, fake ACP, or fake Host
process for this task.

## Exact P0/P1-only delta

1. Add deterministic RED coverage before product changes:
   - a post-spawn/pre-claim recovery state with a launch-bound lock whose `pid` and
     `worker_start_identity` are `null` must remain outer-worker `unknown`; cancel may
     write `cancel.request` but must not synthesize `cancelled`, delete the lock, or
     release the fence;
   - a live PID with a recorded known identity whose current identity is unavailable,
     and an unknown identity type, must never be treated as stopped. Unknown identity
     types must fail closed as malformed facts; a known but currently unobservable
     identity must yield `unknown` and retain lock/fence;
   - the worker lock-claim readback must refuse a persisted identity that is omitted or
     differs from the value just written. Use an existing test seam or a test-scoped
     separate process/filesystem fixture; add no production environment hook or public
     testing API.
2. Replace the boolean outer-worker recovery view with the smallest conservative
   three-state result: `alive`, `stopped`, or `unknown`.
   - `pid:null` in a launch-bound recovery record is `unknown`, never stopped;
   - a dead PID is stopped;
   - an unbound non-Linux worker with no recorded identity may continue using raw PID
     liveness as the already-retained P2;
   - a recorded known start identity with an exact current match is alive;
   - a recorded known identity with a valid current identity of the same type and a
     different value proves PID reuse and is stopped;
   - unavailable current identity or a type mismatch is unknown;
   - accept only known identity schema types in recovery facts. Do not invent a new
     portable identity mechanism in this delta.
3. Update every existing caller of that shared view once:
   - `status` must expose a conservative non-terminal state for `unknown`;
   - non-terminal `cancel` must create the signal first, then synthesize a terminal,
     remove the lock, or release the fence only when both required outer and inner
     boundaries are proven stopped;
   - terminal frozen recovery must likewise release its fence and lock only when both
     boundaries are proven stopped. `unknown` never authorizes cleanup.
4. In `claimWorkerLock`, compare the read-back `worker_start_identity` exactly with the
   claimed value, including exact `null` on platforms where no stronger identity exists.
   Any omitted, malformed, or changed value refuses Host launch.
5. Preserve all other green behavior and the three retained P2s: Host-created sessions,
   weaker non-Linux identity, and a stale registry `.lock` after crash. Add no daemon,
   database, lease, TTL, workflow engine, retry loop, dependency, Host qualification,
   Supervisor, wake path, or Step 1 behavior.

## Completion evidence

Run exactly:

```bash
node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs
git diff --check -- skills/ultra-delegate/scripts/delegate.cjs \
  skills/ultra-delegate/scripts/delegate-worker.cjs tests/delegate.test.cjs
```

The targeted suite must be fully green with no leaked process. Report:

- the RED assertions observed before the product change;
- exact test counts and command exit codes;
- every changed writable path and final SHA-256;
- proof that the seven read-only subject paths, 52 outside-scope entries, eight Review
  artifacts, packet, baseline, and authority files remained byte-identical;
- remaining P2s and any genuine P0/P1 blocker.

Do not modify evidence, task state, decisions, Review files, this packet, or the baseline.
Return the frozen candidate to Codex for the one direct-parent delta Task Review.
