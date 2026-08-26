# Delivery: chg-ultra-5-0

## Outcome Reconciliation

Ultra Builder Pro 5.0 已完成为一个 provider-neutral、file-first 的工作流与执行层：
Host model 继续拥有意图解释、路线选择、分解、语义完整性和最终表达；Ultra 只机械化
owner-readable authority、权限、外部 effect、协议安全、证据、恢复和物理边界。

本 Change 解决了两个同源问题：一是 Init、Research、Change、Plan、Status 等 Skill 的
职责和衔接不再模糊，每个公开工作流都通过一个 artifact-derived Route Contract 暴露
Mode、Position、Exit、Checkpoint、Next 和 Not done；二是 agent 间任务派送使用安装在
`ultra-delegate/scripts` 内的 Skill-local `AgentExecutionDriver`，ACP v1 是首选的
replaceable execution transport，CLI 只保留为显式、typed 的恢复路径。Ultra 没有因此
变成 ACP service、daemon、database、MCP orchestrator 或 semantic state machine。

Claude Code、Codex、OpenCode、Kimi Code、Grok Build 和 ZCode 均完成真实 ACP
conformance，并通过发布包在真实用户目录中健康安装。ZCode 的准确拓扑是 ZCode
Desktop → independently built `zcode-acp` v0.1.0 bridge → installed app-server → 国内
智谱 BigModel Coding Plan；国际 Z.AI OAuth 不属于本次实现或验收路径。

## Specification and Documentation Updates

- `.ultra/north-star.md` 继续保持 accepted `north-star-v2-r3` authority；
  `.ultra/changes/archive/chg-ultra-5-0/intent.md` 记录 AC5-01 至 AC5-18 的完整 Change
  acceptance。
- `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md`、`docs/WORKFLOW-LIFECYCLE.md`、
  `docs/ARCHITECTURE.md`、`docs/RUNTIME-COMPAT-MATRIX.md` 和
  `docs/ARTIFACT-AUTHORITY.md` 承载 5.0 的公开产品、生命周期、执行和证据边界。
- `README.md`、`README.zh-CN.md` 与 `CHANGELOG.md` 记录 5.0.0 的安装、六 Host ACP、
  ZCode maturity、真实验证和限制。
- `docs/evals/ultra-5-0-route-journeys.md`、
  `docs/evals/ultra-5-0-journey-results.md` 与
  `docs/evals/ultra-5-0-live-acp-conformance.md` 保留路线、迁移和真实 transport 的
  owner-readable 评估。
- `docs/wip/ultra-builder-pro-5.0.md` 已在 durable 内容完成 reconciliation 后删除；
  release-candidate evidence 不再把这个临时导航文件误列为永久交付 artifact。

## Verification

| Command / observation | Exit / result | Evidence |
|---|---:|---|
| `node skills/ultra-test/scripts/worktree_digest.cjs --project . --change-id chg-ultra-5-0` | 0 | HEAD `bd3214e5...`; intent `eba84013...`; final product digest `5b7f153d...` |
| `validate_task_evidence.cjs ... --projection` for all nine v50 tasks | 0 | all `current-v2`; exact ordered projections retained in `.ultra/test-report.json` |
| first terminal `npm run verify:release` after WIP deletion | 1 | 660/661; correctly exposed the stale permanent-artifact claim |
| refreshed release-candidate evidence plus `node --test tests/project-artifacts.test.cjs` | 0 | artifact audit 80/80 without recreating the WIP |
| final `npm run verify:release` | 0 | 661/661 Node, 89/89 Hook, 0 vulnerabilities |
| `npm pack --dry-run --json` | 0 | 5.0.0, 141 files, 378744 packed bytes, shasum `e42591f5...`; no tarball written |
| terminal aggregate Review waiter | 0 | `APPROVE`, both axes `PASS`, P0/P1/P2/P3 all zero |
| `validate_review_transport.cjs --summary ... --report .ultra/test-report.json` | 0 | `valid: true`, zero findings |
| `node --test tests/project-artifacts.test.cjs tests/review-transport.test.cjs` | 0 | 110/110 against the terminal report |
| GitHub Actions source run `32937491706` | success | macOS job `98081505849`, Windows job `98081505980`, Ubuntu job `98081506041` |
| tag-triggered Release run `32937733160` | success | complete release gate, npm trusted publish, GitHub Release |
| independent npm tarball download | match | SHA-1 `94ec0287...` and exact SHA-512 match registry; 141 entries |
| `npx --yes ultra-builder-pro-cli@5.0.0 --all --global --doctor --json` | 0 | six healthy Hosts, six ACP selections, null fallback, exact published source commit |
| unrelated Host sentinel comparison | match | all six non-Ultra semantics preserved; ZCode config byte-identical and mode `0600` |
| `git diff --check` | 0 | no whitespace errors before finalization |

## Review

Terminal aggregate Review:
`.ultra/reviews/chg-ultra-5-0-terminal-review-v2/SUMMARY.json`，packet digest
`fc63772a60aad9cc8c470d20b989937fce9929d88a1b1c4c3f4fdf21fdf66454`，
admission digest `11caf57ed61dcaba51ddb90382e8ad1eb36ce8e5517afb4f78f2bedd105a3596`，
SUMMARY digest `81d584e1b8630bbbcbca00c5c5d238a010ee95d4e2d77b76abf6d9b11f47daff`。
Verdict 为 `APPROVE`，`spec_fidelity` 和 `engineering_standards` 均为 `PASS`，
P0=0、P1=0、P2=0、P3=0。Review 使用 `sequential-shared-context`，因此不声称拥有
independent model-family isolation。

## Technical Debt

- ZCode transport 保持 `experimental`。原因是 installed ZCode Desktop app-server 没有
  public stability contract，且 compatibility patch 绑定 bridge v0.1.0 / ZCode 0.16.5。
  Owner: Ultra Builder Pro。升级路径：Host 版本变化后重新 build、identity check、六步
  conformance 和 interruption/recovery drill，通过后才能提升 maturity。
- Codex `hook_activation` 保持 `user_review_required`。安装和 ACP delegation 已健康，
  但 installer 不能代表 Owner 授予 native Hook trust。Owner: Codex user。
- Windows 在 `taskkill` 不可用时只能使用 reachable direct-child fallback，不能承诺清理
  descendant tree。Owner: Ultra Builder Pro / Host platform。

## Residual Risks and Omissions

- 本仓库没有 service deployment target；npm registry 与 GitHub Release 是完整 public
  delivery surface，没有执行或虚构 Railway、Vercel、Docker 或其他服务部署。
- `v5.0.0` 是 annotated 但 unsigned 的 tag；GitHub Release 没有 binary assets，npm 是
  provenance-bearing package artifact。
- 真实 conformance receipts 故意不保存 credential、private prompt、model output 或完整
  provider log；它们证明 transport wiring 和 terminal behavior，不证明模型质量。
- Team Pack、remote shared assets、A2A、daemon、workflow service 与 shared semantic
  authority 仍为 deliberate non-goals。

## Recovery

发布前状态可通过正常 Git revert 恢复。发布后 `v5.0.0` 和 npm 5.0.0 均不可变：发现
缺陷时创建 successor version，或让 consumer 重新安装先前稳定版本
`npx ultra-builder-pro-cli@3.0.2 ...` 并运行同一 `--doctor --json`；不得 force-push、
重写 tag 或 unpublish。ZCode bridge 恢复使用 retained source commit、patch digest 和本地
build receipt 重建，不能从仓库分发 ZCode proprietary bytes。Change archive 是正常目录
移动；其 metadata 和 `delivery.md` 不改变已测试的 product digest。

## External Effects

| Effect | Authorization | Observed result |
|---|---|---|
| 5.0 implementation commits | Owner-authorized 2026-08-26 | `870644c`, `710484a`, `19ab5be`, `c39fbcd`, `bd3214e`; no history rewrite |
| Push to `origin/main` | Owner-authorized | `origin/main=bd3214e5d4bedff1e84e07ad532b9efd213426f1` before tag |
| Annotated tag `v5.0.0` | Owner-authorized | tag object `2af62bbe...` peels to `bd3214e...` |
| npm trusted publication | Owner-authorized | `ultra-builder-pro-cli@5.0.0`, registry shasum `94ec0287...`, two npm/SLSA attestations |
| GitHub Release | Owner-authorized | release `376918074`, published, non-draft, non-prerelease |
| Real global install on all six Hosts | Owner-authorized | install exit 0; aggregate Doctor healthy; every Host selects ACP |
| Real provider calls | Owner-authorized | six redacted ACP receipts, including domestic-Zhipu ZCode path |
| Service deployment | no target exists | not performed and not claimed |
| Post-release closeout commit/push | Owner-authorized | final remaining effect after this archive; it does not move `v5.0.0` or republish npm |

## Archive State

All nine `chg-ultra-5-0` task rows are `completed`; `.ultra/test-report.json` is terminal
`passed: true`; strict Review-to-Test transport is valid; WIP is absent; this delivery
record is present. The Change is therefore finalized from `active` to `archive` without
rewriting task evidence, public tags, package bytes, or owner authority.
