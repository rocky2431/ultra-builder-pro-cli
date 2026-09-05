# Delivery: chg-ultra-5-0-2-authority-reconciliation

## Outcome Reconciliation

`.ultra/changes/archive/chg-ultra-5-0-2-authority-reconciliation/intent.md#outcome`
要求把 Ultra Builder Pro 当前维护面统一到已经实现的六 Host、Skill-local、ACP-first
执行事实，同时保留 typed CLI fallback、Host-owned trust 和显式 external-effect 边界。
这个结果已在本地 5.0.2 candidate 中实现：产品与架构规格、双语 README、模型指令、
CLI help、package identity、Host compatibility 文档和回归测试现在描述同一条执行路径；
运行时选择逻辑与 transport maturity 没有被这次 authority reconciliation 改写。

该结果兑现了
`.ultra/specs/product.md#requirement-fr-06-bounded-delegation`、
`.ultra/specs/product.md#requirement-fr-07-honest-host-adaptation` 和
`.ultra/specs/product.md#requirement-fr-08-release-evidence`，并保持
`.ultra/changes/archive/chg-ultra-5-0-2-authority-reconciliation/intent.md#north-star-trace`
中的 `north-star-v2-r3`、`FP-1/2/5/6/7`、`NS-01..04` 与
`HC-1/3/4/5/6` 不变。交付姿态是“本地、未提交、未发布的 5.0.2 candidate”；
`npm pack --dry-run --json` 仅检查 package surface，没有创建 release package。

## Specification and Documentation Updates

- `.ultra/specs/product.md#requirement-fr-06-bounded-delegation` 与
  `.ultra/specs/architecture.md#delegation-boundary` 对齐 installed Skill-local
  `AgentExecutionDriver`、ACP-first selection 和 typed result-compatible CLI fallback。
- `.ultra/specs/research-distillate.md#observed` 分离当前六 Host Doctor 事实、provider
  配置事实与 dated ZCode 0.16.5 conformance，不把旧 observation 提升为普遍保证。
- `README.md#delegation`、`README.zh-CN.md#委派`、
  `docs/RUNTIME-COMPAT-MATRIX.md#agent-execution-driver-selection` 和
  `docs/WORKFLOW-LIFECYCLE.md#delegation` 统一 Host、trust、
  evidence dimensions、ZCode acknowledgement 与恢复语义。
- `CHANGELOG.md#502-2026-08-26`、`package.json` 和 `package-lock.json` 建立一致的
  5.0.2 本地 candidate identity；`bin/install.js` 的 help surface 使用准确的
  `ZCode Desktop` 名称。
- `.ultra/contexts/task-v502-authority-reconciliation.md#planned-path-inventory`、
  `.ultra/contexts/task-v502-authority-reconciliation.md#completion` 和
  `.ultra/evidence/v502-authority-reconciliation/evidence.json` 完成 file-first
  evidence lifecycle。两次真实 closeout failure 均被显式 reopen：先补齐
  `evidence.json`/`verification.log` 的精确 Planned Path，再按 repository sensor
  的精确 Acceptance-section bytes 重新绑定；没有削弱测试或静默修改 ledger。

## Verification

| Command | Exit | Evidence | Freshness |
|---|---:|---|---|
| `node skills/ultra-test/scripts/worktree_digest.cjs --project . --change-id chg-ultra-5-0-2-authority-reconciliation` | 0 | HEAD `adb7bfe8...`; intent `c1f6f802...`; product digest `ec938773875ecc1f53ba71eae4e99c531d9fd498fc69ef51f9c1a8b0d661e528` | terminal pre-delivery product seal |
| `node skills/ultra-plan/scripts/validate_task_evidence.cjs .ultra/evidence/v502-authority-reconciliation/evidence.json --projection` | 0 | `current-v2`; evidence `45743f37...`; task Review `c9f2a08a...` | immediately before finalization |
| first post-close `node --test tests/project-artifacts.test.cjs` | 1 | rejected unplanned `verification.log`; task explicitly reopened | historical failed close, not reused as pass |
| second post-close `node --test tests/project-artifacts.test.cjs` | 1 | rejected stale Acceptance-section binding; task explicitly reopened | historical failed close, not reused as pass |
| final `node --test tests/project-artifacts.test.cjs` | 0 | 80/80; exact path and Acceptance bindings accepted | current completed ledger/evidence |
| `npm run verify:release` | 0 | 663/663 Node, 89/89 Hooks, 0 production vulnerabilities | fresh finalization run |
| Skill Creator `quick_validate.py` for `ultra-delegate` and `ultra-status` | 0 | both changed Skills valid | current Skill bytes; offline validator |
| isolated `--all` install, Doctor, uninstall under `/tmp/ubp-v502-doctor.6W5X4F` | 0 | six healthy 5.0.2 Hosts; all ACP-selected; null fallback; isolated root cleaned | retained candidate lifecycle; no real-HOME write |
| `npm pack --dry-run --json` | 0 | `ultra-builder-pro-cli@5.0.2`; 141 entries; 381113 packed bytes; shasum `85ebf158...` | fresh finalization run; no tarball written |
| `node bin/install.js --all --global --doctor --json` | 2 | expected `degraded`: six installed 5.0.1/expected 5.0.2 mismatches; Codex also `HOST_PLUGIN_NOT_DISCOVERED`; all six still select ACP with null fallback | fresh read-only real-HOME observation |
| aggregate `review_wait.py ... summary --packet-digest a60401c4...` | 0 | `APPROVE`; P0=0, P1=0, P2=2, P3=0; SUMMARY `b20ade69...` | final admitted Change subject |
| `node skills/ultra-test/scripts/validate_review_transport.cjs --summary .ultra/reviews/chg-ultra-5-0-2-aggregate-review-final-20260901/SUMMARY.json --report .ultra/test-report.json` | 0 | `valid: true`; two exact findings transported | immediately before finalization |
| `git diff --check` | 0 | no whitespace errors | immediately before finalization |

## Review

当前 aggregate Review 是
`.ultra/reviews/chg-ultra-5-0-2-aggregate-review-final-20260901/SUMMARY.json`，
packet digest `a60401c4bc2cb7b971df8387ff0277e28d81a777ec15331a6b1222007367f792`，
admission digest `cb8b6184d1eec0fd4d691186aeb22a067e09bf994f47e7caf6d0a17a910ed37c`，
subject digest `999bfcfaccb9398523e400a48477973b186128d205fb49bebc4d4f770b5e4a39`，
SUMMARY digest `b20ade69c9ede3dc1017af17e6e0ebb635e68e985691b28c42c17104c5295281`。
Verdict 为 `APPROVE`；`spec_fidelity` 与 `engineering_standards` 均为 `PASS`，
P0=0、P1=0、P2=2、P3=0。执行模式为 `sequential-shared-context`，因此不声称
independent model-family isolation。两个 P2 已由
`.ultra/decisions/2026-09-01-v502-deliver-finalization.md#finding-disposition`
明确保留，未被修复、降级或隐藏。

## Technical Debt

- `review-spec-001`（P2）：`.ultra/specs/architecture.md#scope` 仍把当前 5.0.2
  candidate 的 Revision 写成 0.26.2 base `fc055021...`，而 recovery HEAD 是
  `adb7bfe8...`。后果：fresh Agent 可能选错 provenance baseline。Owner：Ultra
  Builder Pro。升级路径：仅在新的 owner-scoped documentation Change 中明确区分
  historical base 与 current recovery HEAD。
- `review-comments-001`（P2）：`README.md#documentation` 与
  `README.zh-CN.md#文档` 的 versioned/frozen 文档链接使用 mutable `blob/main`。
  后果：后续 main 漂移或文件移动时，5.0.2 consumer 可能读到新内容或 404。
  Owner：Ultra Builder Pro。升级路径：在新的 owner-scoped documentation Change
  中改为 immutable commit/tag URL，或把目标文件纳入 package，并保持双语镜像一致。

## Residual Risks and Omissions

- `.ultra/test-report.json` 记录的两个 P2 是 Owner 接受的非阻断 residual risk；
  它们不是自动修复授权，也不因 archive 消失。
- `docs/RUNTIME-COMPAT-MATRIX.md#agent-execution-driver-selection` 中 ZCode transport
  仍为 `experimental`、installed-runtime-only；本 Change 不提升 maturity，也未进行
  新的 live provider call。
- 当前真实 HOME 仍安装 5.0.1，且 Codex 仍报告
  `HOST_PLUGIN_NOT_DISCOVERED`。本地 archive 不改变该外部状态，也不声称修复它。
- task 与 aggregate Review 均使用一个 Codex shared context；它们提供严格 admitted
  artifact review，但不提供跨 model-family 的独立性。
- 未运行新的 Windows 或 live-provider drill，因为本 Change 没有修改 runtime path；
  这些 omission 已保留在 `.ultra/test-report.json`，未被表述为已验证能力。

## Recovery

当前候选基于 HEAD `adb7bfe89f40e107d0c9c490076a6e74294b9337`，仍是未提交的本地 dirty
worktree。若 Owner 拒绝本地 closeout，可将
`.ultra/changes/archive/chg-ultra-5-0-2-authority-reconciliation` 用普通 `git mv`
移回 `active`，按
`.ultra/contexts/task-v502-authority-reconciliation.md#resume-note` 恢复，并重新运行
task evidence、aggregate Test 和 Deliver。产品回退应通过审阅并正常撤销这组未提交
diff，或在未来提交后使用普通 Git revert；不得 force-push 或改写历史。由于没有发布、
部署、安装、credential 或 provider effect，本次交付没有外部 rollback 动作。

## External Effects

| Effect | Authorization | Observed status |
|---|---|---|
| 本地 `delivery.md` 与 Change archive | Owner explicitly authorized for this Change | performed only after final local seals |
| Commit | not authorized | not performed |
| Push / merge | not authorized | not performed |
| Tag | not authorized | not created or changed |
| npm publish / GitHub Release / other publication | not authorized | not performed; `npm pack --dry-run` wrote no tarball |
| Deploy | not authorized; repository has no selected deployment target for this Change | not performed |
| Real-HOME install/update/uninstall | not authorized | not performed; Doctor was read-only |
| Credentials, login, provider purchase, or live provider call | not authorized | not performed |
| Any other external effect | not authorized | not performed |
