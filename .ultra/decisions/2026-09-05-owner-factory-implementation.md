# Owner 批准方案实施与阶段提交

日期：2026-09-05。范围：本地开发与验收。方案：`docs/wip/owner-factory-debate-20260905/final-plan.zh-CN.md`，SHA-256 `25242b914e74958725c6780b548be5e1cb3b9632f40984c1088e50eae86b0db9`。

## 当前 Owner 指令

> 这个方案可以，这样，你让 Zcode去写，你不写代码。写完之后你来改、你来 review，全部完成了和我说，好吗？
>
> 先把当前的 commit。然后我觉得每个阶段改完、确定可以进入下一个阶段的时候，都必须 commit，并且需要留下详细的 commit 信息。因为你会负责 review，通过之后统一由你来做 commit，能理解吗？

## 本次执行解释

- ZCode 是实现代码的唯一写入者；Codex 协调、审查、独立验证、给修改意见，并创建提交。代码修正也交回 ZCode。
- 先保存当前快照，再按已接受方案完成体验整改、ACP/D1 前置、R2 Step 1、Step 2、Step 3；每阶段验收通过并由 Codex 提交后才进入下一阶段。完整 R2 出口不缩成首条样例。
- 允许为该目标进行必要的本地代码、测试、设计与证据修改，使用现有配置的 ZCode 和讨论中已接受的 Agent 做任务执行、独立审查及真实本地资格验证。普通 Terminal、网络检索与工具能力保留。
- UltraGoal 与 agent-delegate-skill 仅修改方案指定的图/委派接口及必要 consumer；先核对各自源码与并发改动，分别审查提交。它们不并入 UBP。
- 每次委派只激活一个具名阶段或修复任务，记录任务文件、基线、结果和后续动作；沿用项目初轮 Review 加至多两次 P0/P1 delta Review 的默认收敛预算。不得让 Worker 自行拓宽 effect 或开启无限修复循环。
- D1 当前 REQUEST_CHANGES 和两个 reopened task 保留。当前指令提供新的本地实施授权，不把旧研究状态当成永久禁令，也不倒填旧 supplemental proposal 已被逐字接受。D1 的独立阶段记录须在实际修复和资格验证前明确当前范围与预算；旧预算不互借。
- 当前快照提交：`2e3273bf12f6493b3201fad3d9d1b802ae367a4f`。它是基线，未宣称 D1 或工厂阶段通过。

## 未授权效果

不含 push、tag、发布、部署、购买/充值、身份或凭据变更、生产数据修改、真实 HOME 安装或替换 Host binary。可使用隔离的本地构建/临时配置进行测试。自进化候选可研究与比较；持久策略晋升仍按 R2 的 Owner 接受合同处理，不能替用户宣布接受。

授权来源是本轮 Owner 指令；本文件是记录，不是自行扩权的许可。旧证据与历史 grant 保留，可由上述基线恢复；状态、测试绿色和 Agent 结论均不能替代阶段验收。

## 2026-09-05 阶段 A 收敛预算处置

初轮 Review、repair 1 后 delta Review 1、repair 2 后 final delta Review 2 均已完成。最后一轮仍为 REQUEST_CHANGES：A-R5 的约束来源错误尚未全部修复，新增 A-R6 当前请求被旧流程阻断，以及 A-R7 真实评测隔离缺口。审查见 `work/owner-factory-implementation-20260905/stage-a-review-delta-2.zh-CN.md`。

现返回 `owner checkpoint / budget_exhausted`，不自行新增修复轮次、不把阶段 A 问题换名移入 B。当前完整实施与按阶段 commit 的授权保持；追加一次修复和 final delta 的具体提案已写在 `stage-a-additional-repair-proposal.zh-CN.md`，尚未由 Owner 接受、也未派发。此处不是新的授权、阶段失败 commit 或任务放弃。

## Owner 当前完整实施授权 — 覆盖上述预算停点

Owner 后续明确说：

> 给到你全部的方案，也给到你全部的权限，你把它改完，只要不偏差，能不能理解？
>
> “改完不偏差”是什么意思？就是照着我们要的这个方案全部落地。完了和我说，知道吗？你不写代码，你让 zCode 或者是 Kimi 或者是 Cc 都行。然后反正这是一个规定，好吗？

当前执行据此恢复：在已接受完整方案内完成必要修复、验证、Review 与阶段提交，不再为阶段修复/Review 次数索取重复确认。此前“初轮加两次 delta 后必须再申请一次”的本次执行限制已被这条当前 Owner 指令覆盖；历史 verdict 和计数照常保留，不能据此宣布通过。每次具体 Worker 回合仍有有限时限、明确写入范围和可核对回执，避免无意义重复；发现反复失败应追查共享根因、改变有效方法，而非无限点补。

实现和测试代码可以由实际 ZCode、Kimi、Claude Code 写；Codex 不写实现或测试代码，负责协调、独立审查与验收、Owner 文档和详细 commit。可把独立任务交给不同 Worker，但同一路径仅有一个写入者。先闭合 A-R5/A-R6/A-R7 并接受 Stage A，再推进 B/C/D/E；已通过且未受新改动影响的检查不重复。

“全部权限”用于完整落地当前方案，不新增无关产品目标或生产效果，不把未知新候选伪称 Owner 已接受。真实 HOME 业务数据不作为评测目标，历史事故的前状态未知继续披露；验收工厂权限边界使用隔离目标。阶段通过后由 Codex commit，ZCode/Kimi/CC 不提交。
