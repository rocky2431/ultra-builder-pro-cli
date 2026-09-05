# ZCode Task 2 execution packet: qualify and enforce exact Host effects

## Mission

Complete only task `vnext-d1-host-enforcement-qualification` after Codex has consumed
the one separately authorized selected-Host no-production qualification call and
published its mechanically derived attempt/receipt. Convert only observed enforcement
facts into provider-neutral Host capability admission, focused tests, and maintained
contract text. ZCode is the sole implementation/product-surface writer; Codex owns the
qualification dispatch, attempt/receipt, workflow state, evidence and Review.

Do not launch a provider, consume or retry the qualification call, invoke another Agent,
or create/edit any `.ultra` task, decision, evidence, Review, runtime, progress, Change or
recovery artifact. If the retained receipt proves only an unsupported dimension, the
correct implementation is a typed pre-launch unavailable route, not a claim of support.

## Authority and immutable bindings

- HEAD: `adb7bfe89f40e107d0c9c490076a6e74294b9337`.
- Goal decision: `.ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md`,
  SHA-256 `95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9`.
- Active intent: `.ultra/changes/active/chg-ultra-vnext-d1-delegation-safety/intent.md`,
  SHA-256 `facd82839282352c100e432c4d13720de98bcc1a6d17f8a9e57c01d659a6e437`.
- R2: `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md`,
  SHA-256 `f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7`.
- Task context: `.ultra/contexts/task-vnext-d1-host-enforcement-qualification.md`,
  SHA-256 `099d21a6e5595d016da5dc4089d791dfbf8715163ddab1c3adfd5c27aec459ab`;
  Acceptance-section SHA-256
  `da405318b36064564d9c9906aaaba12fd79f641d0d6d7f20ef4f80b6104692f9`.
- Predecessor evidence: `.ultra/evidence/vnext-d1-runtime-safety-boundary/evidence.json`,
  SHA-256 `6c3801b1f46e14bb0dc02c183ea4a4f376dadb1c8b5387528d915a1febab8891`.
- Final admitted Plan Review: `vnext-d1-plan-review-delta-2-20260901`, summary
  SHA-256 `67685cc5f099539b7147db0ea8332d8d9e0fcbb73416d05b225e2951c148178d`.
- The ledger must still say Task 1 `completed` and Task 2 `in_progress`; the active
  Change must be the sole active Change.
- This is the task's one initial implementation attempt, bounded to 7200 active seconds.
  One active ZCode writer only; recover ordinary tool/test/process accidents inside this
  attempt, but do not create a second writer or another provider call.

Allowed local effects are edits to only the twelve paths below and local tests/validators.
Never commit, push, tag, publish, deploy, install into real HOME, inspect/change/export
credentials, fetch packages, access production/business endpoints, purchase/top up, or
perform any other external effect.

## Qualification evidence precondition

Before editing, stably read:

- `.ultra/evidence/vnext-d1-host-enforcement-qualification/host-enforcement-attempt.json`;
- `.ultra/evidence/vnext-d1-host-enforcement-qualification/host-enforcement-receipt.json`.

The attempt must name the exact immutable attempt id, packet digest, instruction and
permission digests, exact installed ZCode bridge/runtime identity, isolated worktree,
loopback sink and marker identities, and must show the one call as consumed. The receipt
must bind the attempt and raw product-delegation artifacts, redact all values, distinguish
provider transport from Worker effects, and classify every dimension as supported,
unsupported or unobserved from coordinator-owned facts. Never infer support from Host
self-report, exit zero, absent side effects, README text, or a fake test. A missing,
malformed, symlinked, digest-mismatched, reserved-only, indeterminate or unbound record is
a blocker; do not dispatch or fabricate it.

## Writable paths and exact start hashes

| Path | SHA-256 |
|---|---|
| `.ultra/specs/architecture.md` | `3dfa456a64d67b90a8ecdedb09c9372811719596860ec7ad316f6b77c9dae0a7` |
| `.ultra/specs/product.md` | `37deb2bcdac3c032fa6d774280d04b4638fc1fc05712af05b8f5f3180116f450` |
| `docs/ARCHITECTURE.md` | `8e0771dcbe645c95e07cac35373ccb4772a034a2251a388a82935a05a4a9956a` |
| `docs/ARTIFACT-AUTHORITY.md` | `9a71b6dc9e3fb8ef7bf52a90a6e6f70450d8039febf3ca33dbd4e5ffb9787581` |
| `docs/RUNTIME-COMPAT-MATRIX.md` | `6980a0e253cd94fe324f0ea649576ffc331d12edbba4a9fee8ce00f0be63d1e9` |
| `skills/ultra-delegate/SKILL.md` | `86863ffbbb63363a066df4ed212cc14c5d3acd1f5fe6cb713571b492d7a29c27` |
| `skills/ultra-delegate/references/delegation-contract.md` | `07f820c8f766035343951b7860a73adf36cdc93e019716d4511b8f947bcc0d62` |
| `skills/ultra-delegate/scripts/delegate.cjs` | `984dfb047840e6a34a1b37c133d8c1864a60630943242f11526ef51b9cdae6ef` |
| `skills/ultra-delegate/scripts/host-profile.cjs` | `f74d9012b902e820c03547b72c7585c1aba05f2739ac3fcd046f7d72b8bd163c` |
| `tests/acp-driver.test.cjs` | `0e836f9c9ed3fb38337111cc480c30479e76446b48a0812fe62dec4573084e8c` |
| `tests/delegate.test.cjs` | `ba3d06a5aaf99626f0c2752a8f6a2eedb84bf332ff0cf308747de53a865c43c9` |
| `tests/v026-contract.test.cjs` | `54587ed81fc77cc4ff43b8a155c0aeab59fc5bb5e9cdaa1b1dd222432b9dcd9f` |

No other implementation or maintained product path is writable. In particular,
`skills/ultra-delegate/scripts/acp-driver.cjs`, `delegate-worker.cjs`,
`agent-execution-driver.cjs`, `cli-driver.cjs`, Task 1 files and all `.ultra`
authority/evidence/review files are read-only.

## Frozen pre-existing outside scope

Before this packet and the planned Task 2 attempt/receipt were published, 55 Git-visible
outside-scope entries produced the canonical sorted digest
`cb573a0258eb46c771aa18da0a732ef084b32e74eeebe3076b139be6950107fb`. At dispatch time, the only permitted additions are this exact
packet plus the exact attempt and receipt named above. Every line below must remain
byte-identical; additions other than those three exact planned files are scope drift.

Canonical line format is `<porcelain status><two spaces><sha256><two spaces><path>`:

```text
??  facd82839282352c100e432c4d13720de98bcc1a6d17f8a9e57c01d659a6e437  .ultra/changes/active/chg-ultra-vnext-d1-delegation-safety/intent.md
??  6321e58c5ac54afba4637c8b4b3c5de346342dacb5a29819c92710f8cfe2e0ab  .ultra/changes/archive/chg-ultra-5-0-2-authority-reconciliation/delivery.md
??  c1f6f80265a33bd3e462a1407c75447517acb00011ca4ea07d91fe632daa81ec  .ultra/changes/archive/chg-ultra-5-0-2-authority-reconciliation/intent.md
??  5bf5a12dfacd1614b0062466d411ec062df82b1cb64e59f5683ac3c9a13c7bf0  .ultra/contexts/task-v502-authority-reconciliation.md
??  099d21a6e5595d016da5dc4089d791dfbf8715163ddab1c3adfd5c27aec459ab  .ultra/contexts/task-vnext-d1-host-enforcement-qualification.md
??  28d486acadf42f7f8f89f77a324a6d2784730aba931d491b40df094394086fd0  .ultra/contexts/task-vnext-d1-runtime-safety-boundary.md
??  71df3e0dca71a04de7dcbaa452c6dd98e1ca9456ca1f79bb4eec0b46938f747a  .ultra/decisions/2026-09-01-v502-deliver-finalization.md
??  c7bc58e853c0883f4cbbe32471391a81bb468c648432387f556b11d8442778d1  .ultra/decisions/2026-09-01-v502-zcode-closeout-grant.md
??  2a789557172bead69f84000ff423798cbc63eb0d1d5b40b0e435c0f19c2109ce  .ultra/decisions/2026-09-01-vnext-d1-repair-2-timeout-continuation-grant.md
??  95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9  .ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md
??  45743f378a16fb1472f37d5a05d20a4578e84b5bb8484a51cbf627b5ef9d822a  .ultra/evidence/v502-authority-reconciliation/evidence.json
??  3488ab9d4f74e670edf07244abd9e392600764c0b07efb8dabeb11f63b623a5c  .ultra/evidence/v502-authority-reconciliation/verification.log
??  6c3801b1f46e14bb0dc02c183ea4a4f376dadb1c8b5387528d915a1febab8891  .ultra/evidence/vnext-d1-runtime-safety-boundary/evidence.json
??  db18ded83068a4d2067b6fd76ed5632dcb33f45bafc1a7be2db88d05db5b4994  .ultra/evidence/vnext-d1-runtime-safety-boundary/verification.log
 M  153eddd5e46b67bdcf51e385eee63c5a991bda0857e8ae1dfa2185ef3ff2f7af  .ultra/specs/research-distillate.md
 M  cfb19ffa5f324b5daae7c9dc134a20aaa6299ce10dd1024797c0a69171626fbe  .ultra/tasks.json
 M  947285d986ca0639771bb6859b61aa393faf1b45e4601745d8086bcc620acd87  .ultra/test-report.json
 M  ba7f9ef5ca6e404580d3430d2c75dd8bf265870d06d24844216343a591dfdcbc  AGENTS.md
 M  dc9bbe9931bdf6a382c6944a839175b6f957d434ee3ed260c5c2bfe9680d9fe9  CHANGELOG.md
 M  87a410547cbf95c6d62cbb24223365783a5d2311e8e17a301fdb07f0a50a7b7a  CLAUDE.md
 M  62f3fdcc36ae47e92414a7cf7f2562aed3ede81484565756b86dc93e0e2c4068  CONTEXT.md
 M  63ffc1049add4c796998d3a544e6b57a248e406eab14f52d5c488a274ea0b81a  README.md
 M  1cba768b0866b1133f0cefe95d58dd93e61c002cd52717447864d5f842eb53ec  README.zh-CN.md
 M  14fbcfab9b3e0933030887d78724ae1c7442fd481a9975db6bbd8b06f83aa798  bin/install.js
 M  d10fcdd81af09ed9d66de515c76714d82c179099c2ff465b2201991cf64159c6  docs/DECISIONS.md
 M  7bd131e5f293d70946c2af1a059fc0db4aa2a188301a1c6d34c4e144b63c4fd6  docs/PHILOSOPHY.md
 M  8cf17b31b6112be2f455ee0e23f5fe92a8792c15782e2331c135d7cf45fedef5  docs/WORKFLOW-LIFECYCLE.md
??  f69a5883aa3846032f29aed17c99220443cbad63f981e9e10c370b759d024268  docs/wip/ultra-builder-pro-vnext-agentic-software-factory-candidate.zh-CN.md
??  7f628a4c6120908dc72178d4281c7ca45eba00f9afee526240a2b87d85362f63  docs/wip/ultra-builder-pro-vnext-independent-multi-agent-review-2026-08-31.zh-CN.md
??  f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7  docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md
??  354c8cf5ae81f7d6c475c0597a019c6945e3e63515d8354da28c948973553a2f  docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md
 M  13ce9e33bb04fe98d275fee774931299a785042ec23a4931824725cfb4c1bf51  package-lock.json
 M  14d646ad9e1c79106e30d23f79fa67f589b7aad6edbc99180eec31ab4b4ebe5f  package.json
 M  99bafe22d0953c391ccbf050c70dad84a0399d4c347e5d4c6a15917ea550d843  skills/ultra-delegate/scripts/acp-driver.cjs
 M  e2a5b2f06da57a8765ced0a05a42febe533a2c5fe0e45bb89df4833d1a45dd8f  skills/ultra-delegate/scripts/agent-execution-driver.cjs
 M  d301ce7df4eb617a8f700bf8454cc9c70bb7d216e49517914ab22a34698f658b  skills/ultra-delegate/scripts/cli-driver.cjs
 M  a7ee8530346f2fb2d8868aba9c207edc5df730377e54c270fbfa8b143ffc8373  skills/ultra-delegate/scripts/delegate-worker.cjs
 M  b7506a6813602b24d80638c310ba32325356c0023a22bcf688c8c4984c6b1aa8  skills/ultra-status/SKILL.md
 M  70c681e1ba8a620e8c655dac0c7e615a096958f03ea5e673a1642136c5be3245  tests/acp-conformance.test.cjs
 M  4de5803813614ed5309a5b580580cbc59bbe55b20e1e97d9c6c7f30135b6e534  tests/fixtures/fake-acp-agent.cjs
 M  643501c0d0dc50e4935fdc38298aa6065315a5b66469c18d015f927b8f505351  tests/package-smoke.test.cjs
??  38b34550afc28b2c0535e9d306c9825748cc64a0548c4b816c44239ef752fccf  work/claude-stage-zero-discussion.md
??  8bdce8214198dd203740ea6f96feefb2b3879462607ebb7b7138a557f446fd3f  work/task-state.ref
??  ac94afcae4aef978ea3a072c1951888bec71f9f1fa9a582bba148b52065f106a  work/vnext-d1-repair-2-timeout-continuation-delta-1-outside-baseline.md
??  f49235040c56dac08088b436b409f0a26baf4218027acddac0f7417a76de1850  work/vnext-d1-repair-2-timeout-continuation-outside-baseline.md
??  fc0f8bab8f2a60e599d9f3a0f196101e6bee500b908c4d86645e38c8cd38c8cd  work/vnext-d1-zcode-runtime-safety-boundary-repair-1.md
??  3adc1d16f21a4806d2593704b142500071285fec4a3f27b24d7c3bc7aa4a5fbe  work/vnext-d1-zcode-runtime-safety-boundary-repair-2-timeout-continuation-delta-1.md
??  0d15977e88fe716115b48d309470ce26452508d119298d477ae69661a4e09520  work/vnext-d1-zcode-runtime-safety-boundary-repair-2-timeout-continuation.md
??  f2a192dc00d6eabb7a3c052d5fbec3afea7bf050f2c01c775c87d5fa691996da  work/vnext-d1-zcode-runtime-safety-boundary-repair-2-timeout-handoff.md
??  78666b660d91528fb3e2d260ed32da4d971d3fcac5090049e7b9f87fe824af54  work/vnext-d1-zcode-runtime-safety-boundary-repair-2.md
??  ca6d70cbe6badf5ea95c5059ae3d1759f7ddfb55456eec1567981a2ad9bbb457  work/vnext-d1-zcode-runtime-safety-boundary.md
??  05e16c3b2c90c91c895828ade640a757502c9057693f04ecdd6f16fa13781c46  work/vnext-step1-claude-architecture-discussion.md
??  f705ea22ed5fd71560ecd9686f2e2747a5f27fb568ffeacb7d82ce13eb9fbd1a  work/zcode-lifecycle-smoke.md
??  3ce2c32e2394be90538a3f6e017a1d4f41fe951397d432e52bc1a7cc02d64603  work/zcode-v502-review-round-1-delta.md
??  01411dcce292e52abcfe84a3d02f1754bde2d10bdbc61b09779a3577fdab284c  work/zcode-v502-review-round-1.md
```

## Required RED-first implementation

1. Trace every current caller of `hostProfile`, `readPermission`, delegate admission,
   driver selection and receipt projection before editing. Reuse the existing permission
   schema, Host profile, typed launcher failures and test fixtures; add no dependency or
   second policy engine.
2. Add deterministic RED fixtures proving:
   - Packet-required enforcement dimensions are compared with exact Host capability
     facts before fence/spec/worker/Host launch;
   - a missing, unknown, unsupported or version-mismatched dimension produces one stable
     typed unavailable diagnostic, creates no Host process, and cannot silently fall back;
   - a positive fixture is admitted only when all exact required dimensions are supported;
   - provider brand never becomes semantic policy and experimental maturity is unchanged;
   - adapter preinstallation/runtime-fetch and provider-transport/Worker-effect facts
     remain separate; receipt and diagnostics expose no secret value.
3. Implement the smallest provider-neutral capability/admission representation with a
   real delegate consumer. It may describe dimensions such as writable scope, outside-root
   denial, shell/tool/network denial, env-key isolation, runtime fetch, receipt redaction
   and point-of-use effects, but must use the exact retained observation to decide which
   values are supported. Unattempted or mechanically unobservable dimensions stay
   unsupported. Do not add a generic sandbox, effect workflow, credential broker, daemon,
   database, lease, package installer, retry/fallback route or Step 1 Supervisor behavior.
4. Preserve current Task 1 environment and writer-truth behavior, ACP-first selection,
   typed CLI fallback where already allowed, result schema, actual diff enforcement,
   cancellation and worktree fencing. Do not change ACP permission mechanics in this task.
5. Update the maintained Skill, delegation contract, specs and compatibility/architecture
   docs only to the exact observed truth. Never promote ZCode from `experimental`, claim
   a durable/per-root guarantee, or imply the provider call granted Worker Web/business
   effects. If the exact Host is unavailable for the required Packet, say so plainly and
   keep analysis/other qualified profiles available.

## Verification and return

Run at minimum:

```bash
node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/v026-contract.test.cjs
git diff --check -- .ultra/specs/architecture.md .ultra/specs/product.md docs/ARCHITECTURE.md docs/ARTIFACT-AUTHORITY.md docs/RUNTIME-COMPAT-MATRIX.md skills/ultra-delegate/SKILL.md skills/ultra-delegate/references/delegation-contract.md skills/ultra-delegate/scripts/delegate.cjs skills/ultra-delegate/scripts/host-profile.cjs tests/acp-driver.test.cjs tests/delegate.test.cjs tests/v026-contract.test.cjs
```

Validate the changed Skill with the repository's installed Skill Creator validator. Run
the full release gate only if time remains after the targeted gate; Codex will independently
run the mandatory full gate and package dry-run before evidence.

Return: observed RED assertions before product edits; exact changed paths/final hashes;
focused counts and exit codes; receipt-derived supported/unsupported/unobserved matrix;
proof that all frozen bindings and outside-scope lines stayed unchanged; remaining P2/P3
and any genuine P0/P1 blocker. Do not self-approve, write task evidence, update the
ledger/context, start Review, archive/finalize D1, or begin Step 1.

Stop only for a real authority/hash mismatch, required path outside the twelve-path
inventory, unprovable active writer, unavailable/malformed qualification evidence,
forbidden effect, or an unsafe need to fail open. Ordinary failures are diagnosed and
recovered inside this attempt rather than abandoning the goal.

