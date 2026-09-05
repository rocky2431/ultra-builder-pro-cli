# D1 Repair 2 timeout continuation delta 1 outside-scope baseline

This is the byte baseline for every dirty repository file outside the ten writable
runtime-safety paths at delta dispatch time. `M` means tracked-modified; `U` means
untracked. Paths are sorted bytewise. The delta packet and this baseline are separately
protected by their dispatch-time SHA-256 values.

```text
U  facd82839282352c100e432c4d13720de98bcc1a6d17f8a9e57c01d659a6e437  .ultra/changes/active/chg-ultra-vnext-d1-delegation-safety/intent.md
U  6321e58c5ac54afba4637c8b4b3c5de346342dacb5a29819c92710f8cfe2e0ab  .ultra/changes/archive/chg-ultra-5-0-2-authority-reconciliation/delivery.md
U  c1f6f80265a33bd3e462a1407c75447517acb00011ca4ea07d91fe632daa81ec  .ultra/changes/archive/chg-ultra-5-0-2-authority-reconciliation/intent.md
U  5bf5a12dfacd1614b0062466d411ec062df82b1cb64e59f5683ac3c9a13c7bf0  .ultra/contexts/task-v502-authority-reconciliation.md
U  af53197252d42550887b24bc53436d146bc2a5b11acc20eccbc6936df75f05a4  .ultra/contexts/task-vnext-d1-host-enforcement-qualification.md
U  183f0dd1e8e8337ccf2964d9f90954f2a886b2f24907532a95187919da95450e  .ultra/contexts/task-vnext-d1-runtime-safety-boundary.md
U  71df3e0dca71a04de7dcbaa452c6dd98e1ca9456ca1f79bb4eec0b46938f747a  .ultra/decisions/2026-09-01-v502-deliver-finalization.md
U  c7bc58e853c0883f4cbbe32471391a81bb468c648432387f556b11d8442778d1  .ultra/decisions/2026-09-01-v502-zcode-closeout-grant.md
U  2a789557172bead69f84000ff423798cbc63eb0d1d5b40b0e435c0f19c2109ce  .ultra/decisions/2026-09-01-vnext-d1-repair-2-timeout-continuation-grant.md
U  95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9  .ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md
U  45743f378a16fb1472f37d5a05d20a4578e84b5bb8484a51cbf627b5ef9d822a  .ultra/evidence/v502-authority-reconciliation/evidence.json
U  3488ab9d4f74e670edf07244abd9e392600764c0b07efb8dabeb11f63b623a5c  .ultra/evidence/v502-authority-reconciliation/verification.log
M  3dfa456a64d67b90a8ecdedb09c9372811719596860ec7ad316f6b77c9dae0a7  .ultra/specs/architecture.md
M  37deb2bcdac3c032fa6d774280d04b4638fc1fc05712af05b8f5f3180116f450  .ultra/specs/product.md
M  153eddd5e46b67bdcf51e385eee63c5a991bda0857e8ae1dfa2185ef3ff2f7af  .ultra/specs/research-distillate.md
M  34d486f44bfd3c7cdaad16f3c4563f38a4f74a1a3a490a725178c4afa5c5d2f0  .ultra/tasks.json
M  947285d986ca0639771bb6859b61aa393faf1b45e4601745d8086bcc620acd87  .ultra/test-report.json
M  ba7f9ef5ca6e404580d3430d2c75dd8bf265870d06d24844216343a591dfdcbc  AGENTS.md
M  dc9bbe9931bdf6a382c6944a839175b6f957d434ee3ed260c5c2bfe9680d9fe9  CHANGELOG.md
M  87a410547cbf95c6d62cbb24223365783a5d2311e8e17a301fdb07f0a50a7b7a  CLAUDE.md
M  62f3fdcc36ae47e92414a7cf7f2562aed3ede81484565756b86dc93e0e2c4068  CONTEXT.md
M  63ffc1049add4c796998d3a544e6b57a248e406eab14f52d5c488a274ea0b81a  README.md
M  1cba768b0866b1133f0cefe95d58dd93e61c002cd52717447864d5f842eb53ec  README.zh-CN.md
M  14fbcfab9b3e0933030887d78724ae1c7442fd481a9975db6bbd8b06f83aa798  bin/install.js
M  8e0771dcbe645c95e07cac35373ccb4772a034a2251a388a82935a05a4a9956a  docs/ARCHITECTURE.md
M  9a71b6dc9e3fb8ef7bf52a90a6e6f70450d8039febf3ca33dbd4e5ffb9787581  docs/ARTIFACT-AUTHORITY.md
M  d10fcdd81af09ed9d66de515c76714d82c179099c2ff465b2201991cf64159c6  docs/DECISIONS.md
M  7bd131e5f293d70946c2af1a059fc0db4aa2a188301a1c6d34c4e144b63c4fd6  docs/PHILOSOPHY.md
M  6980a0e253cd94fe324f0ea649576ffc331d12edbba4a9fee8ce00f0be63d1e9  docs/RUNTIME-COMPAT-MATRIX.md
M  8cf17b31b6112be2f455ee0e23f5fe92a8792c15782e2331c135d7cf45fedef5  docs/WORKFLOW-LIFECYCLE.md
U  f69a5883aa3846032f29aed17c99220443cbad63f981e9e10c370b759d024268  docs/wip/ultra-builder-pro-vnext-agentic-software-factory-candidate.zh-CN.md
U  7f628a4c6120908dc72178d4281c7ca45eba00f9afee526240a2b87d85362f63  docs/wip/ultra-builder-pro-vnext-independent-multi-agent-review-2026-08-31.zh-CN.md
U  f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7  docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md
U  9b56393c2ff421d0bea28affc23201916cc67664d93aa6a4fb99662a29ba127e  docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md
M  13ce9e33bb04fe98d275fee774931299a785042ec23a4931824725cfb4c1bf51  package-lock.json
M  14d646ad9e1c79106e30d23f79fa67f589b7aad6edbc99180eec31ab4b4ebe5f  package.json
M  86863ffbbb63363a066df4ed212cc14c5d3acd1f5fe6cb713571b492d7a29c27  skills/ultra-delegate/SKILL.md
M  b7506a6813602b24d80638c310ba32325356c0023a22bcf688c8c4984c6b1aa8  skills/ultra-status/SKILL.md
M  643501c0d0dc50e4935fdc38298aa6065315a5b66469c18d015f927b8f505351  tests/package-smoke.test.cjs
M  54587ed81fc77cc4ff43b8a155c0aeab59fc5bb5e9cdaa1b1dd222432b9dcd9f  tests/v026-contract.test.cjs
U  38b34550afc28b2c0535e9d306c9825748cc64a0548c4b816c44239ef752fccf  work/claude-stage-zero-discussion.md
U  8bdce8214198dd203740ea6f96feefb2b3879462607ebb7b7138a557f446fd3f  work/task-state.ref
U  f49235040c56dac08088b436b409f0a26baf4218027acddac0f7417a76de1850  work/vnext-d1-repair-2-timeout-continuation-outside-baseline.md
U  fc0f8bab8f2a60e599d9f3a0f196101e6bee500b908c4d86645e38c8cd38c8cd  work/vnext-d1-zcode-runtime-safety-boundary-repair-1.md
U  0d15977e88fe716115b48d309470ce26452508d119298d477ae69661a4e09520  work/vnext-d1-zcode-runtime-safety-boundary-repair-2-timeout-continuation.md
U  f2a192dc00d6eabb7a3c052d5fbec3afea7bf050f2c01c775c87d5fa691996da  work/vnext-d1-zcode-runtime-safety-boundary-repair-2-timeout-handoff.md
U  78666b660d91528fb3e2d260ed32da4d971d3fcac5090049e7b9f87fe824af54  work/vnext-d1-zcode-runtime-safety-boundary-repair-2.md
U  ca6d70cbe6badf5ea95c5059ae3d1759f7ddfb55456eec1567981a2ad9bbb457  work/vnext-d1-zcode-runtime-safety-boundary.md
U  05e16c3b2c90c91c895828ade640a757502c9057693f04ecdd6f16fa13781c46  work/vnext-step1-claude-architecture-discussion.md
U  f705ea22ed5fd71560ecd9686f2e2747a5f27fb568ffeacb7d82ce13eb9fbd1a  work/zcode-lifecycle-smoke.md
U  3ce2c32e2394be90538a3f6e017a1d4f41fe951397d432e52bc1a7cc02d64603  work/zcode-v502-review-round-1-delta.md
U  01411dcce292e52abcfe84a3d02f1754bde2d10bdbc61b09779a3577fdab284c  work/zcode-v502-review-round-1.md
```

The current strict Review session is Git-ignored operational evidence, so it is frozen
separately rather than silently omitted from the protection boundary:

```text
d9cc6313dd147482bb22124f2165d341cbf8638a34d389327d14e328b15dd2dc  .ultra/reviews/vnext-d1-runtime-safety-initial-review-20260901/ADMISSION.json
4bed8a428078d50bb21a29846876526ab666dc97750fa72895bfe73f03140cc7  .ultra/reviews/vnext-d1-runtime-safety-initial-review-20260901/SUMMARY.json
2aec0ea50836b8c208695ff27a34d2567b21d96645186ab42b3995dc50f9ff75  .ultra/reviews/vnext-d1-runtime-safety-initial-review-20260901/WORKER-PACKET.json
c35cc60a29f0aefa34c3db9ef27a4b73ca0b897336f8d6eab804551c55312cdc  .ultra/reviews/vnext-d1-runtime-safety-initial-review-20260901/review-code.json
e31a43b0b64570f4e8b97199a137a4f7b0c35726ad4ea5f23b994195428433ac  .ultra/reviews/vnext-d1-runtime-safety-initial-review-20260901/review-design.json
814c2bb6d96d4b0de8381aa041132eb2300377050d18cd447aeffcf96ddcf426  .ultra/reviews/vnext-d1-runtime-safety-initial-review-20260901/review-errors.json
e5ae87750894ada36a018f579134e0c9b6189fe9aaf0ebfe7ac0cb75fcc4b816  .ultra/reviews/vnext-d1-runtime-safety-initial-review-20260901/review-spec.json
9ac3d0ceb3c3c6a900bd582c1c4841320f9e1059d14c44fc2b101ac857eeb59c  .ultra/reviews/vnext-d1-runtime-safety-initial-review-20260901/review-tests.json
```
