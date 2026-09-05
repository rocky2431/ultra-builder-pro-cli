# ZCode Task Packet: D1 runtime safety boundary

## Mission

Implement task `vnext-d1-runtime-safety-boundary` as the sole implementation-code
writer. Close the current shared delegation boundary's descendant-environment and
writer-truth defects without starting Supervisor, wake, orchestration, durable workflow,
or Host qualification work.

This is the first task of Change `chg-ultra-vnext-d1-delegation-safety`. The target is
the accepted R2 architecture, not an isolated MVP and not a new execution engine.

## Authority and roles

- Owner has authorized this exact local implementation task and asked that recoverable
  test, tool, process, or transport accidents be diagnosed and recovered instead of
  abandoning the three-stage goal.
- ZCode is the sole implementation writer for this attempt.
- Codex owns coordination, review, verification, evidence and any P0/P1 repair request.
- Do not spawn subagents or delegate any part of the implementation.
- Do not commit, push, tag, publish, deploy, install into real HOME, change credentials,
  access production/business systems, purchase/top-up, fetch packages, or perform any
  external effect.
- Provider transport for this ZCode call is already authorized; it does not authorize
  Worker web, shell-to-network, business, or other external effects.
- If a recoverable command/test problem occurs, diagnose and continue within this packet.
  Stop only for an actual digest/authority mismatch, need for an unlisted path, credential
  or external effect, or an unprovable pre-existing writer on the affected roots.

## Frozen authority and plan

| Artifact | SHA-256 |
|---|---|
| `.ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md` | `95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9` |
| `.ultra/changes/active/chg-ultra-vnext-d1-delegation-safety/intent.md` | `facd82839282352c100e432c4d13720de98bcc1a6d17f8a9e57c01d659a6e437` |
| `.ultra/contexts/task-vnext-d1-runtime-safety-boundary.md` | `2cd6399df1626171dd98d6e45b97dcd10ce7e7764e22296901a4334d94cf9471` |
| `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md` | `f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7` |
| final Plan Review `vnext-d1-plan-review-delta-2-20260901/SUMMARY.json` | `67685cc5f099539b7147db0ea8332d8d9e0fcbb73416d05b225e2951c148178d` |

Before editing, verify these exact bytes and HEAD
`adb7bfe89f40e107d0c9c490076a6e74294b9337`. Read the active intent and complete
Task context. If any frozen digest or HEAD differs, do not guess; return the exact mismatch.

## Allowed implementation paths

Only these ten paths may be modified. They are currently clean relative to HEAD and their
pre-attempt SHA-256 values are frozen below. You may modify a subset; do not create, delete,
rename, format, or touch any other path.

| Path | Pre-attempt SHA-256 |
|---|---|
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `ae1c97660941e6c5847e9655b1f1fd7680c1f1b509444340527ec8550e1376c4` |
| `skills/ultra-delegate/scripts/delegate.cjs` | `9febe5759886e0e87be56630e506bc58a9728fdbef6eaf5115fe2148b9fa1769` |
| `skills/ultra-delegate/scripts/delegate-worker.cjs` | `274f13984f3e0c697bf06d61e2f7561de251018c740b2e58441a216552fad536` |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `179789c3aac0052862b1b2dcb5790357e2b3cbda2a865059338974c2964e7ca5` |
| `skills/ultra-delegate/scripts/cli-driver.cjs` | `28a6a0df1f3f8ad1cf441257525f8b286823bb41c053ed7de67dce51434cf74e` |
| `skills/ultra-delegate/scripts/host-profile.cjs` | `5301bf72778b6971a08452825e09cb28790c79ff7b9c41d9d89e4e287f8e9ad9` |
| `tests/acp-driver.test.cjs` | `698f22dea39e6ab045fdc4a432c47ae60f64cecc8207ee2174e3e7b2d8eb0369` |
| `tests/acp-conformance.test.cjs` | `fbd76edcd2a966fc5bcefc4431223f2a0abe62875387e87bde0aab5a42d3dc37` |
| `tests/delegate.test.cjs` | `4aa0ec47478e353e5cfc248ad761014ad4e26d09a0870dcf7b2d832927ecee41` |
| `tests/fixtures/fake-acp-agent.cjs` | `1dc183afbe0c50df5b2b2422db9119dbcda75e74304bba35577630eef1ccfdc2` |

## Required implementation outcome

1. Build one canonical target-aware environment policy at the existing delegate boundary.
   Derive immutable role-scoped views:
   - Host selection/identity probe: minimum discovery/runtime and selected-Host auth/config.
   - delegate-worker: the sanitized base plus exactly the launcher-local packet variables it
     must consume.
   - final ACP/CLI Host: selected-Host minimum inputs only; no Primary control variables and
     no canonical instruction/permission/schema path variables.
   No spawn call may merge full `process.env` back into a descendant.

2. Preserve enough exact selected-Host authentication/config discovery to keep all six
   existing Host profiles compatible, but do not pass unrelated providers' env-carried
   secrets. Do not claim isolation from file-based credentials reachable through `HOME`.

3. Persist a bounded atomic inner-writer observation using existing file/process helpers:
   PID/process group, platform, command identity and start identity. Derive
   `stopped | alive | unknown`; a PID or dead outer worker alone is never stop proof.

4. Add one atomic physical worktree/root writer fence before launch. It must reject exact
   aliases and overlapping parent/child roots, including symlink/filesystem aliases and
   Windows case/separator aliases. Disjoint registered worktrees remain admissible. No TTL,
   stale-by-age deletion, daemon, database, lease service, new dependency, or automatic
   relaunch.

5. For cancel, timeout, outer-worker loss, stale/reused identity, or an unprovable nested
   writer:
   - retain `status: failed`;
   - use launcher-side `failure_type: outcome_unknown`;
   - keep the affected fence;
   - never synthesize safe `cancelled`/`timeout` or admit a second writer.
   Preserve current `cancelled` or `timeout` only when the complete matching writer
   boundary is proven stopped. Do not add a new model-facing result status.

6. Keep ACP-first selection, typed CLI fallback, actual changed-path enforcement, result
   schema and existing N=1 behavior compatible. Check the ACP conformance consumer of
   `failure_type`.

## Test-first requirements

Obtain valid RED failures caused by the current product before behavior repair. A test
syntax/escaping failure is not acceptable RED; fix the test itself first if necessary.

Add the smallest table-driven coverage that proves:

- role-scoped env-key visibility at probe, worker, ACP and CLI seams;
- unique non-production canaries for a Primary control key, unrelated provider key and
  selected-Host auth input, with required presence asserted without printing values and
  byte scans proving prohibited canaries absent from spec/result/receipt/output/event
  artifacts;
- nested writer after outer-worker death, cancel and timeout: alive/unprovable becomes
  `outcome_unknown`, proven stopped retains the compatible terminal failure;
- stale/reused process identity;
- exact worktree conflict, parent/child root overlap, symlink/filesystem alias, Windows
  case/separator alias, and disjoint-worktree positive case;
- ACP conformance receipt/diagnostic consumption of `outcome_unknown`;
- existing N=1 success, fallback, changed-path, cancel and timeout paths remain green.

Reuse current helpers and `tests/fixtures/fake-acp-agent.cjs`; do not add a new test
framework or dependency.

## Required verification

Run and report exact commands, exit codes and counts:

```bash
node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs
git diff --check -- skills/ultra-delegate/scripts tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs tests/fixtures/fake-acp-agent.cjs
```

Before changing behavior, record the valid RED command and the failing assertions in your
final response. After implementation, run the full targeted command above. Do not run
`npm install`, provider qualification, real-HOME Doctor, release, or deployment.

## Dirty-worktree preservation

The repository already has unrelated local candidate and coordination changes. Every entry
below is pre-existing and outside your write authority, including all `.ultra/**`,
documentation, package metadata and Skill prose. Do not reset, restore, stage, rewrite or
touch them. Codex will compare these hashes after your attempt.

```json
[
  {
    "status": " M",
    "path": ".ultra/specs/architecture.md",
    "type": "file",
    "byte_length": 22760,
    "sha256": "3dfa456a64d67b90a8ecdedb09c9372811719596860ec7ad316f6b77c9dae0a7"
  },
  {
    "status": " M",
    "path": ".ultra/specs/product.md",
    "type": "file",
    "byte_length": 24680,
    "sha256": "37deb2bcdac3c032fa6d774280d04b4638fc1fc05712af05b8f5f3180116f450"
  },
  {
    "status": " M",
    "path": ".ultra/specs/research-distillate.md",
    "type": "file",
    "byte_length": 19263,
    "sha256": "153eddd5e46b67bdcf51e385eee63c5a991bda0857e8ae1dfa2185ef3ff2f7af"
  },
  {
    "status": " M",
    "path": ".ultra/tasks.json",
    "type": "file",
    "byte_length": 14064,
    "sha256": "34d486f44bfd3c7cdaad16f3c4563f38a4f74a1a3a490a725178c4afa5c5d2f0"
  },
  {
    "status": " M",
    "path": ".ultra/test-report.json",
    "type": "file",
    "byte_length": 14657,
    "sha256": "947285d986ca0639771bb6859b61aa393faf1b45e4601745d8086bcc620acd87"
  },
  {
    "status": " M",
    "path": "AGENTS.md",
    "type": "file",
    "byte_length": 5242,
    "sha256": "ba7f9ef5ca6e404580d3430d2c75dd8bf265870d06d24844216343a591dfdcbc"
  },
  {
    "status": " M",
    "path": "CHANGELOG.md",
    "type": "file",
    "byte_length": 86770,
    "sha256": "dc9bbe9931bdf6a382c6944a839175b6f957d434ee3ed260c5c2bfe9680d9fe9"
  },
  {
    "status": " M",
    "path": "CLAUDE.md",
    "type": "file",
    "byte_length": 2145,
    "sha256": "87a410547cbf95c6d62cbb24223365783a5d2311e8e17a301fdb07f0a50a7b7a"
  },
  {
    "status": " M",
    "path": "CONTEXT.md",
    "type": "file",
    "byte_length": 4563,
    "sha256": "62f3fdcc36ae47e92414a7cf7f2562aed3ede81484565756b86dc93e0e2c4068"
  },
  {
    "status": " M",
    "path": "README.md",
    "type": "file",
    "byte_length": 28402,
    "sha256": "63ffc1049add4c796998d3a544e6b57a248e406eab14f52d5c488a274ea0b81a"
  },
  {
    "status": " M",
    "path": "README.zh-CN.md",
    "type": "file",
    "byte_length": 27280,
    "sha256": "1cba768b0866b1133f0cefe95d58dd93e61c002cd52717447864d5f842eb53ec"
  },
  {
    "status": " M",
    "path": "bin/install.js",
    "type": "file",
    "byte_length": 12321,
    "sha256": "14fbcfab9b3e0933030887d78724ae1c7442fd481a9975db6bbd8b06f83aa798"
  },
  {
    "status": " M",
    "path": "docs/ARCHITECTURE.md",
    "type": "file",
    "byte_length": 16019,
    "sha256": "8e0771dcbe645c95e07cac35373ccb4772a034a2251a388a82935a05a4a9956a"
  },
  {
    "status": " M",
    "path": "docs/ARTIFACT-AUTHORITY.md",
    "type": "file",
    "byte_length": 23219,
    "sha256": "9a71b6dc9e3fb8ef7bf52a90a6e6f70450d8039febf3ca33dbd4e5ffb9787581"
  },
  {
    "status": " M",
    "path": "docs/DECISIONS.md",
    "type": "file",
    "byte_length": 13551,
    "sha256": "d10fcdd81af09ed9d66de515c76714d82c179099c2ff465b2201991cf64159c6"
  },
  {
    "status": " M",
    "path": "docs/PHILOSOPHY.md",
    "type": "file",
    "byte_length": 17976,
    "sha256": "7bd131e5f293d70946c2af1a059fc0db4aa2a188301a1c6d34c4e144b63c4fd6"
  },
  {
    "status": " M",
    "path": "docs/RUNTIME-COMPAT-MATRIX.md",
    "type": "file",
    "byte_length": 22875,
    "sha256": "6980a0e253cd94fe324f0ea649576ffc331d12edbba4a9fee8ce00f0be63d1e9"
  },
  {
    "status": " M",
    "path": "docs/WORKFLOW-LIFECYCLE.md",
    "type": "file",
    "byte_length": 22441,
    "sha256": "8cf17b31b6112be2f455ee0e23f5fe92a8792c15782e2331c135d7cf45fedef5"
  },
  {
    "status": " M",
    "path": "package-lock.json",
    "type": "file",
    "byte_length": 1377,
    "sha256": "13ce9e33bb04fe98d275fee774931299a785042ec23a4931824725cfb4c1bf51"
  },
  {
    "status": " M",
    "path": "package.json",
    "type": "file",
    "byte_length": 2609,
    "sha256": "14d646ad9e1c79106e30d23f79fa67f589b7aad6edbc99180eec31ab4b4ebe5f"
  },
  {
    "status": " M",
    "path": "skills/ultra-delegate/SKILL.md",
    "type": "file",
    "byte_length": 12752,
    "sha256": "86863ffbbb63363a066df4ed212cc14c5d3acd1f5fe6cb713571b492d7a29c27"
  },
  {
    "status": " M",
    "path": "skills/ultra-status/SKILL.md",
    "type": "file",
    "byte_length": 16280,
    "sha256": "b7506a6813602b24d80638c310ba32325356c0023a22bcf688c8c4984c6b1aa8"
  },
  {
    "status": " M",
    "path": "tests/package-smoke.test.cjs",
    "type": "file",
    "byte_length": 11170,
    "sha256": "643501c0d0dc50e4935fdc38298aa6065315a5b66469c18d015f927b8f505351"
  },
  {
    "status": " M",
    "path": "tests/v026-contract.test.cjs",
    "type": "file",
    "byte_length": 156833,
    "sha256": "54587ed81fc77cc4ff43b8a155c0aeab59fc5bb5e9cdaa1b1dd222432b9dcd9f"
  },
  {
    "status": "??",
    "path": ".ultra/changes/active/chg-ultra-vnext-d1-delegation-safety/intent.md",
    "type": "file",
    "byte_length": 12052,
    "sha256": "facd82839282352c100e432c4d13720de98bcc1a6d17f8a9e57c01d659a6e437"
  },
  {
    "status": "??",
    "path": ".ultra/changes/archive/chg-ultra-5-0-2-authority-reconciliation/delivery.md",
    "type": "file",
    "byte_length": 9375,
    "sha256": "6321e58c5ac54afba4637c8b4b3c5de346342dacb5a29819c92710f8cfe2e0ab"
  },
  {
    "status": "??",
    "path": ".ultra/changes/archive/chg-ultra-5-0-2-authority-reconciliation/intent.md",
    "type": "file",
    "byte_length": 8658,
    "sha256": "c1f6f80265a33bd3e462a1407c75447517acb00011ca4ea07d91fe632daa81ec"
  },
  {
    "status": "??",
    "path": ".ultra/contexts/task-v502-authority-reconciliation.md",
    "type": "file",
    "byte_length": 13212,
    "sha256": "5bf5a12dfacd1614b0062466d411ec062df82b1cb64e59f5683ac3c9a13c7bf0"
  },
  {
    "status": "??",
    "path": ".ultra/contexts/task-vnext-d1-host-enforcement-qualification.md",
    "type": "file",
    "byte_length": 10986,
    "sha256": "af53197252d42550887b24bc53436d146bc2a5b11acc20eccbc6936df75f05a4"
  },
  {
    "status": "??",
    "path": ".ultra/contexts/task-vnext-d1-runtime-safety-boundary.md",
    "type": "file",
    "byte_length": 11573,
    "sha256": "2cd6399df1626171dd98d6e45b97dcd10ce7e7764e22296901a4334d94cf9471"
  },
  {
    "status": "??",
    "path": ".ultra/decisions/2026-09-01-v502-deliver-finalization.md",
    "type": "file",
    "byte_length": 1047,
    "sha256": "71df3e0dca71a04de7dcbaa452c6dd98e1ca9456ca1f79bb4eec0b46938f747a"
  },
  {
    "status": "??",
    "path": ".ultra/decisions/2026-09-01-v502-zcode-closeout-grant.md",
    "type": "file",
    "byte_length": 3762,
    "sha256": "c7bc58e853c0883f4cbbe32471391a81bb468c648432387f556b11d8442778d1"
  },
  {
    "status": "??",
    "path": ".ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md",
    "type": "file",
    "byte_length": 10186,
    "sha256": "95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9"
  },
  {
    "status": "??",
    "path": ".ultra/evidence/v502-authority-reconciliation/evidence.json",
    "type": "file",
    "byte_length": 10451,
    "sha256": "45743f378a16fb1472f37d5a05d20a4578e84b5bb8484a51cbf627b5ef9d822a"
  },
  {
    "status": "??",
    "path": ".ultra/evidence/v502-authority-reconciliation/verification.log",
    "type": "file",
    "byte_length": 4349,
    "sha256": "3488ab9d4f74e670edf07244abd9e392600764c0b07efb8dabeb11f63b623a5c"
  },
  {
    "status": "??",
    "path": "docs/wip/ultra-builder-pro-vnext-agentic-software-factory-candidate.zh-CN.md",
    "type": "file",
    "byte_length": 58453,
    "sha256": "f69a5883aa3846032f29aed17c99220443cbad63f981e9e10c370b759d024268"
  },
  {
    "status": "??",
    "path": "docs/wip/ultra-builder-pro-vnext-independent-multi-agent-review-2026-08-31.zh-CN.md",
    "type": "file",
    "byte_length": 24869,
    "sha256": "7f628a4c6120908dc72178d4281c7ca45eba00f9afee526240a2b87d85362f63"
  },
  {
    "status": "??",
    "path": "docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md",
    "type": "file",
    "byte_length": 50787,
    "sha256": "f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7"
  },
  {
    "status": "??",
    "path": "docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md",
    "type": "file",
    "byte_length": 8380,
    "sha256": "2ae3b695b87db533043dfff8678c828a50219a38895c3d70754caecea82c815a"
  },
  {
    "status": "??",
    "path": "work/claude-stage-zero-discussion.md",
    "type": "file",
    "byte_length": 1632,
    "sha256": "38b34550afc28b2c0535e9d306c9825748cc64a0548c4b816c44239ef752fccf"
  },
  {
    "status": "??",
    "path": "work/task-state.ref",
    "type": "file",
    "byte_length": 69,
    "sha256": "8bdce8214198dd203740ea6f96feefb2b3879462607ebb7b7138a557f446fd3f"
  },
  {
    "status": "??",
    "path": "work/vnext-step1-claude-architecture-discussion.md",
    "type": "file",
    "byte_length": 2876,
    "sha256": "05e16c3b2c90c91c895828ade640a757502c9057693f04ecdd6f16fa13781c46"
  },
  {
    "status": "??",
    "path": "work/zcode-lifecycle-smoke.md",
    "type": "file",
    "byte_length": 1313,
    "sha256": "f705ea22ed5fd71560ecd9686f2e2747a5f27fb568ffeacb7d82ce13eb9fbd1a"
  },
  {
    "status": "??",
    "path": "work/zcode-v502-review-round-1-delta.md",
    "type": "file",
    "byte_length": 2009,
    "sha256": "3ce2c32e2394be90538a3f6e017a1d4f41fe951397d432e52bc1a7cc02d64603"
  },
  {
    "status": "??",
    "path": "work/zcode-v502-review-round-1.md",
    "type": "file",
    "byte_length": 3101,
    "sha256": "01411dcce292e52abcfe84a3d02f1754bde2d10bdbc61b09779a3577fdab284c"
  }
]
```

## Return contract

Return:

1. concise root-cause and implementation summary;
2. valid RED command plus the product assertions that failed;
3. GREEN verification commands, exit codes and counts;
4. exact changed-file list;
5. any unresolved limitation or reason an acceptance item could not be proven.

Do not claim completion from setup, compilation or a partial test. Do not edit workflow,
decision, context, review, evidence or state artifacts; Codex owns those.
