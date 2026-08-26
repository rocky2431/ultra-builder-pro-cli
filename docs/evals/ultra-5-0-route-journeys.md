# Ultra 5.0 Route Contract journey 评测 — 2026-08-25

## 结论

本轮以当前 Skill source 和 adapter policy 做静态 journey inspection。九个 public/router
Skill 已共享一个 Route Contract；Greenfield、existing project、owner revision、early
value、fresh session、degraded diagnosis 和 grant continuation 都有可达入口、可观察
exit、material checkpoint 与 next/repair path。

这不是 Host/provider 实跑。它验证的是模型拿到 Skill 后是否拥有一致的导航合同，不证明
任何特定模型一定会生成高质量 Route Card，也不证明后续 ACP transport 已完成。live
cross-host journey 留在 `v50-migration-journeys`。

## 判定方法

每个场景检查五个问题：

1. 入口文件能否唯一判断 Route 与 Mode；
2. Owner 能否看到 Why、Outcome、Accepted boundary、Position、Exit condition、Reality、
   Decision needed、Next 与 Not done；
3. 停止是否由 material checkpoint 或可观察 evidence 触发，而非计数器；
4. 没有授权时是否推荐下一 route，有有效 Execution Grant 时是否只继续 covered mode；
5. authority 损坏时是否仍有 read-only diagnosis 和最便宜恢复路径。

`PASS` 表示当前 source 明确提供上述行为；它不是对业务语义或 live model output 的自动
判定。

## J1 — Greenfield baseline

- 起点：无 `.ultra/`，Owner 给出一个原始产品想法。
- 预期路线：`ultra-init/create` → 推荐 `ultra-research/baseline` → 推荐
  `ultra-change/intake`。
- 可观察 exit：Init read-back skeleton 与 raw Project Brief；Research read-back selected
  reports、accepted North Star、specifications、vocabulary 与 synthesis。
- material checkpoint：Owner 确认 raw outline；Research 的方向、scope、synthesis 和
  North Star acceptance。
- 禁止行为：Init 写 North Star；Research 没有 selected coverage/stop condition；任一
  Skill 自动打开 Change。
- source evidence：`skills/ultra-init/SKILL.md`、`skills/ultra-research/SKILL.md`。
- 结果：`PASS (source inspection)`。

## J2 — Existing project bounded evidence

- 起点：已有 accepted baseline，无 active Change，Owner 提一个新 feature/fix。
- 预期路线：`ultra-change/intake` → `evidence-needed` →
  `ultra-research/change-scoped` → 同一 `change_id` 的 `ultra-change/reconcile` →
  `accepted` → `ultra-plan/decompose`。
- 可观察 exit：Change 先固定 bounded question 与 named exit evidence；Research 只完成该
  question；Change 再决定 evidence 是否改变 intent；Plan 只消费 accepted Change。
- 禁止行为：原始需求先自动进入 Research；Research 打开第二个 Change；Plan 直接打开
  Research 或自己改变 product contract。
- source evidence：`skills/ultra-change/SKILL.md`、`skills/ultra-research/SKILL.md`、
  `skills/ultra-plan/SKILL.md`。
- 结果：`PASS (source inspection)`。

## J3 — Owner revision、拒绝选项与 history

- 起点：Owner 修改尚未接受的 Change，或推翻一个已接受的 consequential decision。
- 预期路线：draft 在同一 `intent.md` 内修订；accepted decision 以新的
  `.ultra/decisions/<id>.md` 和 `supersedes` 保留历史；`ultra-status/history` 可按需解释
  当前答案、被拒绝选项与旧边界。
- Decision needed：只保留一个会实质改变 outcome/boundary 的问题；Owner 拒绝当前选项
  时，Change 保持 draft/evidence-needed 并补证据或新选项，不假装 accepted，不进入 Plan。
- 禁止行为：覆盖旧 accepted decision、用 event log 代替 authority、因 Owner 没选现有
  选项就制造默认答案。
- source evidence：`skills/ultra-change/SKILL.md`、`skills/ultra-status/SKILL.md`、
  `docs/ARTIFACT-AUTHORITY.md#decisions-and-reductions`。
- 结果：`PASS (source inspection)`。

## J4 — Earliest observable value

- 起点：accepted/evidenced Change 已进入 Plan。
- 预期路线：`ultra-plan/decompose` 明确第一个 executable slice 的 real consumer、real
  data path 与 owner-visible observation，再把 exact task 交给 `ultra-dev/execute`。
- 产品或 contract evidence gap：返回 `ultra-change/reconcile`，由 Change 决定是否记录
  bounded Research Disposition。
- ordinary technical uncertainty：模型解决，或用 bounded spike/tracer task；不重新打开
  product Research。
- 禁止行为：先完成整层基础设施、用 task count 代表价值、Plan 直接启动 Research。
- source evidence：`skills/ultra-plan/SKILL.md`。
- 结果：`PASS (source inspection)`。

## J5 — Fresh-session recovery

- 起点：对话上下文丢失，但 repository 与 Git 仍在。
- 预期路线：先读 root/HEAD，再唯一解析 active `change_id`，读取 matching task ledger、
  context 与 closing Resume Note，然后核对 Brief、North Star、decisions、specs、evidence
  和 worktree，重新推导 Route Card。
- 可观察 exit：Owner 能看到当前 boundary、真实 diff/evidence、下一 exact task 或 repair；
  已完成 Research 不被重跑。
- context pressure：在最近 safe write 更新 Resume Note，显示 stop card，并建议 fresh
  session；token/file count 不成为 semantic gate。
- source evidence：`skills/ultra-status/references/route-contract.md`、
  `skills/ultra-status/SKILL.md`、`skills/ultra-dev/SKILL.md`。
- 结果：`PASS (source inspection)`。

## J6 — Degraded authority diagnosis

- 起点：两个 active Change、malformed intent、stale trace 或暂时不可读 authority。
- 预期路线：`ultra-status/recovery` 停止从 ambiguous Change 做 semantic routing/write，
  但仍用 typed diagnostic、安全的 Git/directory observations 和未冲突的 canonical files
  显示原因与 repair/retry/cancel/abandon 路径。
- 禁止行为：选第一个目录、把“不能写”表达为永久 in-progress、因为 authority 损坏而
  关闭 Status/Review 的只读诊断。
- source evidence：`skills/ultra-status/SKILL.md`、
  `skills/ultra-status/references/route-contract.md`。
- 结果：`PASS (source inspection)`。

## J7 — Grant-aware continuation

- 起点：同一 accepted Change 有当前有效 Execution Grant，覆盖 Plan、一个 exact Dev task、
  Test 与 Deliver-reconcile 的 local reversible effects。
- 预期路线：每次 public transition 先显示 Route Card；Skill 重新核对 Mode、`change_id`、
  effects、budget 与 stop conditions，再继续 covered mode。
- 必停点：Change acceptance/reduction、primary transfer、unresolved P0/P1、Deliver
  finalization/archive，以及任何 commit/push/publish/deploy/provider spend。
- 无 grant：同一路径在当前 Skill exit 停止，并把 `Next` 表达为 recommendation。
- 禁止行为：Host implicit bit 授权 Change intake/acceptance 或 Deliver finalization；grant
  自动扩展 scope；Route Card 自己成为 permission。
- source evidence：`adapters/_shared/runtime-assets.cjs`、九个 public/router Skills、
  `skills/ultra-status/references/route-contract.md`。
- 结果：`PASS (source inspection)`。

## J8 — Delegation event versus semantic route

- 起点：Owner 显式授权一个 bounded task/research/aggregate worker slice。
- 预期路线：`ultra-delegate` launch 前显示 primary Route Card；运行时 permission、tool、
  plan、usage、process 或 ACP update 只进入 Position/Delta/Reality；terminal result 经验证
  后回到原 primary Skill，由 primary writer 解释和集成。
- 禁止行为：worker event 写 canonical `.ultra`、terminal `finished` 自动完成 task、
  delegation 升级为 primary transfer。
- source evidence：`skills/ultra-delegate/SKILL.md`、Route Contract。
- 结果：`PASS (source inspection; ACP driver not implemented in this task)`。

## Route Contract 冻结时本轮未证明

- 尚未在六个真实 Host 上比较同一 fixture 的 Route Card 质量。
- 本次 Route Contract inspection 没有证明 ACP v1 driver、CLI fallback、Skill-local
  runner 或 ZCode bridge；这些能力必须由各自后续任务提供独立 evidence。
- 尚未执行 3.x byte-preservation migration journey。
- 尚未完成 5.0 package/release verification。

这些缺口分别路由到 `v50-acp-execution-drivers`、`v50-skill-local-delegation`、
`v50-migration-journeys` 与 `v50-release-candidate`，不会被本次 source inspection
冒充为通过。
