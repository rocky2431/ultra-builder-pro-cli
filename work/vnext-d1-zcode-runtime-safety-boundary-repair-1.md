# ZCode Repair Packet 1: D1 runtime safety boundary

## Mission

Repair the blocking P1 findings from Codex's continuous review of the first
`vnext-d1-runtime-safety-boundary` implementation attempt. Keep the existing design
small: one descendant-environment policy, one launch/writer observation state machine,
and one physical fence registry. Do not add a Supervisor, daemon, database, lease
service, workflow engine, dependency, retry loop, or Host qualification work.

This is repair attempt 1 for the same task. ZCode remains the sole implementation-code
writer. Codex owns review, evidence, and acceptance.

## Authority and effects

- Durable grant: `ubp-vnext-d1-zcode-safety-2026-09-01`.
- Allowed local effects: edit only the ten paths listed below and run local focused tests.
- Preserve every pre-existing dirty path and every coordination artifact outside those
  ten paths byte-for-byte.
- Do not commit, push, tag, publish, deploy, install into real HOME, change credentials,
  fetch packages, access production/business systems, purchase/top-up, or perform any
  other external effect.
- Do not spawn subagents or delegate implementation.
- Recover ordinary tool/test/process accidents inside this packet. Stop only for an
  authority/digest mismatch, an unlisted required path, an unprovable pre-existing active
  writer on these repository roots, or a credential/external-effect requirement.

## Frozen authority and current implementation subject

| Artifact | SHA-256 |
|---|---|
| `.ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md` | `95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9` |
| `.ultra/changes/active/chg-ultra-vnext-d1-delegation-safety/intent.md` | `facd82839282352c100e432c4d13720de98bcc1a6d17f8a9e57c01d659a6e437` |
| `.ultra/contexts/task-vnext-d1-runtime-safety-boundary.md` | `2cd6399df1626171dd98d6e45b97dcd10ce7e7764e22296901a4334d94cf9471` |
| `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md` | `f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7` |
| final Plan Review `SUMMARY.json` | `67685cc5f099539b7147db0ea8332d8d9e0fcbb73416d05b225e2951c148178d` |
| initial Task packet | `ca6d70cbe6badf5ea95c5059ae3d1759f7ddfb55456eec1567981a2ad9bbb457` |

Expected HEAD remains `adb7bfe89f40e107d0c9c490076a6e74294b9337`.

The current pre-repair hashes of the only writable paths are:

| Path | SHA-256 |
|---|---|
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `77848bfa1cd4f9344180e4637a012a7858bac559d350de3ae6d3a2033ebe9889` |
| `skills/ultra-delegate/scripts/delegate.cjs` | `651a12b618c2c0618ff237927951d56cb9a1be41445efe1feddc63e595397386` |
| `skills/ultra-delegate/scripts/delegate-worker.cjs` | `ab73dbbd5b90b5af10e6e5037f88338f41205ac1b94b30f6cec39b18b83ba1a7` |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `0a4f38937e4af39e3de249eb6bf55116fb1a2e8c1d44150d94ae8d8f68508824` |
| `skills/ultra-delegate/scripts/cli-driver.cjs` | `f9a69fed0fa794d24ea381d32e7f1e55ee1d56bbc2268e06098ef93367e60aa3` |
| `skills/ultra-delegate/scripts/host-profile.cjs` | `e2e644719f370dd42a51a36c7da9948640007b8f474409edfb49a2f699f4e011` |
| `tests/acp-driver.test.cjs` | `2112a6be28cafe038cfc828b2d9de0e07f33b9b3d587d93ba71a3fa204ecd1a9` |
| `tests/acp-conformance.test.cjs` | `35e70863578ca01387fd7145db9c82b2fef63de0604a685ae86e860b43f0b1c2` |
| `tests/delegate.test.cjs` | `e29e4b5dbac1e8c50ff5dba71e440a15b8c3550c1deef35b14789b9722c2ca6a` |
| `tests/fixtures/fake-acp-agent.cjs` | `1abdb10cae2690dcfb017541e7899f7dfbdb6987d91cb1d367a6335cf91ea1ee` |

Verify all hashes and the absence of another active implementation process before editing.

## Blocking P1 findings

### P1-01 — Missing or invalid runtime evidence currently fails open

Observed facts:

- `boundaryProof()` and `writerBoundaryState()` classify a missing `writer.json` as
  `stopped`.
- `observeWriterStart()` silently returns `null` when its atomic write fails, while the
  Host continues running.
- `deriveWriterState()` accepts any object with an integer PID; it does not require the
  exact schema, delegation/launch identity, platform, or matching observation generation.
- A parseable but semantically invalid fence such as `{}` holds no roots and is ignored.
- `acquireWorktreeFence()` skips an existing fence with the same delegation id. Codex
  reproduced a second acquisition as `{"same_id_reacquire":"admitted"}`.

Required outcome:

- Introduce the minimum explicit launch phases needed to remove the ambiguous window.
  Before the outer worker may exist, persist a valid identity-bound `not_started`
  observation; before either ACP or CLI Host spawn, atomically transition it to a
  conservative `launching` state; only after a valid PID/process-group observation may it
  become `started`. Missing, unreadable, invalid, mismatched, or `launching` evidence is
  `unknown`, never `stopped`.
- Bind observation, lock/receipt, worker spec, and fence to one random launch identity (or
  an equally strong existing digest-bound identity). Readers must validate the exact
  schema and matching delegation/launch identity before using a PID or releasing a fence.
- Treat an existing fence as held even when its delegation id matches. No normal run path
  needs to reacquire its own already-persisted fence.
- Valid JSON with missing/extra/wrong-typed fence fields must block admission. Do not
  delete or ignore it by age.
- Record and validate the outer worker's start identity as well as its PID so a stale or
  reused `run.lock` PID cannot be reported as the active worker indefinitely.

### P1-02 — Errors after worker spawn can delete the only physical fence

At `delegate.cjs`'s current post-spawn sequence, failure while updating the fence,
receipt, or lock enters the common catch block, deletes the fence/spec/lock, and returns
an error even though the detached worker or Host may already be running.

Required outcome:

- Distinguish pre-spawn cleanup from post-spawn uncertainty. Once worker spawn may have
  succeeded, never delete its fence/spec/launch evidence merely because a later write
  failed.
- Leave a mechanically discoverable `status`/`cancel` recovery path. If a terminal result
  can be published without racing the worker, use `status: failed` plus
  `failure_type: outcome_unknown`; otherwise retain the exact artifacts and return an
  error that points to the canonical recovery command. In either case, a second writer
  remains blocked.
- Add deterministic fault injection at the post-spawn fence/receipt/lock write seams and
  at writer-observation transition. Prove the Host cannot run without a retained fence.

### P1-03 — A live descendant can coexist with a published `finished` result

`delegate-worker.cjs` gates only `cancelled` and `timeout` through `boundaryProof()`.
For a normal Host exit, a valid model result is published as `finished` even if its
process group still contains a live writer; the finally block only keeps the fence. That
lets semantic consumers integrate changing files while status returns the raw success.

The ACP-auth CLI fallback has the same ownership gap: it starts the CLI fallback and
overwrites `writer.json` without first proving the ACP launch boundary stopped.

Required outcome:

- After any Host launch, gate every terminal publication that could imply safe
  completion/retry on the matching boundary proof. A live or unprovable writer overrides
  success, ordinary failure, timeout, or cancellation with launcher-side
  `failure_type: outcome_unknown` and retains the fence. Only an explicit valid
  `not_started` state or a matching proven-stopped boundary may release it.
- Before ACP-to-CLI fallback, prove the first ACP boundary stopped. If it is alive or
  unknown, do not launch the fallback and return `outcome_unknown`. Do not erase the only
  observation of an unproved first launch.
- For terminal `outcome_unknown`, `status` must expose a freshly derived current writer
  state without rewriting the immutable terminal result; a later `cancel` may release
  only after matching stop proof.
- Add a fake CLI and a real fake-ACP conformance scenario where the adapter/root returns a
  syntactically valid `finished` result but a same-group nested process remains alive.
  Both must produce `outcome_unknown`, keep the fence, and block a second writer. The ACP
  conformance receipt must consume the literal `outcome_unknown` branch and retain no
  provider content or canary value.

Host processes that intentionally create a new session can escape portable PID/PGID
observation; do not invent a daemon or dependency here and do not claim that limitation is
solved. Exact selected-Host escape/effect enforcement remains Task 2. This repair must at
least be truthful for every process identity it has observed and must never turn missing
evidence into proof.

### P1-04 — Fence and cancel paths are not fail-closed trust boundaries

Observed facts:

- The registry path and deterministic fence file can be symlinks. The general
  `writeAtomic()` intentionally follows a valid symlink, so a crafted fence path can write
  outside the project.
- Launcher-side `cancel()` trusts `worker-spec.json` without checking the receipt/lock
  spec digest, then unlinks `spec.fence`. A changed spec can therefore name an arbitrary
  path for deletion.

Required outcome:

- Fence-registry creation/read/write/release must be no-follow and physically contained
  in the canonical project root. Refuse a symlinked registry component, symlinked fence
  entry, or semantically invalid fence; never mutate its external target.
- Launcher recovery must validate the current worker-spec digest against the
  launch-bound receipt/lock identity before consuming fields. Derive the only fence path
  from canonical project root plus delegation id/launch identity; never unlink an
  arbitrary path read from a mutable spec.
- Release must verify the exact fence schema and matching delegation/launch identity
  under the registry lock or an equivalent atomic boundary.
- Add tests with an external sentinel, a symlinked registry/fence entry, a changed spec
  fence path, and valid-but-incomplete JSON. The sentinel must remain byte-identical and
  admission/release must fail closed.

### P1-05 — Provider-prefix matching is not a minimum environment allowlist

The current policy forwards every key under broad prefixes such as `OPENAI_` and
`ANTHROPIC_`. Codex reproduced a Codex Host view containing
`OPENAI_WEBHOOK_SECRET`; it is same-provider-namespaced but is neither Host launch auth nor
runtime discovery and must not cross this boundary.

Required outcome:

- Replace broad provider-prefix grants with maintained exact per-Host authentication,
  endpoint/config-root, and bridge-discovery keys evidenced by this repository's existing
  profiles/docs. Keep `HOME`'s documented file-credential limitation explicit. When an
  exact env key is not evidenced, rely on the existing HOME/config path and let Task 2
  qualify it; do not admit a whole namespace for convenience.
- At minimum retain the currently exercised selected auth path (`OPENAI_API_KEY`) and the
  exact config-root/bridge keys already named by repository adapters, while continuing to
  exclude Primary `CLAUDE_CODE_*` / `CODEX_*` session, thread, socket, notifier, app-tools,
  and unrelated-provider controls except an explicitly allowed config root such as
  `CODEX_HOME`.
- Add same-provider decoys such as `OPENAI_WEBHOOK_SECRET` and
  `ANTHROPIC_ADMIN_API_KEY`. Assert their names and values are absent from probe, worker,
  final Host, and every retained artifact.

## Test discipline and completion

1. Add valid failing regression cases for the findings above before changing product
   behavior. Report the failing assertions; syntax/fixture failures do not count as RED.
2. Reuse current helpers and the existing fake ACP fixture. No new test framework,
   dependency, public result status, or semantic workflow state.
3. Keep actual Git-diff enforcement, digest checks, ACP-first selection, safe typed
   fallback, and proven-stopped N=1 cancellation/timeout behavior green.
4. Run exactly:

```bash
node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs
git diff --check -- skills/ultra-delegate/scripts tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs tests/fixtures/fake-acp-agent.cjs
```

5. Return one report containing: valid RED names/counts; root-cause repairs mapped to
   P1-01..P1-05; exact GREEN counts/exit codes; final ten-path hashes; outside-scope drift
   check; and any residual P2/P3 limitation. Do not self-approve the task.

