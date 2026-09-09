# 第七步当前证据与未完成项

这是 Codex 的证据盘点，不是独立 Reviewer 的结论或 canonical 交付。当前冻结源代码已完成 Owner 追加的一次最终评审，原结论 INCOMPLETE，未报告新 P0/P1；原始回执的权限拒绝及一个错误旧哈希另见 stage-e-final-review-disposition.zh-CN.md；原始预算决定见 `.ultra/decisions/2026-09-10-stage-e-final-review-budget.md`。第八步的 Owner 决定单独待答。

| 退出条件 | 已观察 | 当前边界 |
| --- | --- | --- |
| 旧 Primary 与 Supervisor 均结束后，在有效 durable Grant 下产生 fresh turn | zBL41n 的原生注册、进程终止、fresh session、两份原 Worker 结果及真实输出、consumed；全部当前绑定源码匹配 | 普通当前生命周期通过；较长 QA 成功 R60vX2 早于最后 P1 修复，不拼成同一源版本 |
| revoke/expiry/invalidation 在重启边界 fail closed | 真实 fresh 前后撤销；当前单元反例覆盖到期、引用／源码改变、注册篡改、机器身份改变、最终消费前 revoke/expiry/deadline | 不宣称实际物理 reboot 测过 |
| duplicate attention 不产生 duplicate semantic turn/writer | 真实重复 wake 返回原 consumed、原回执不变；两个真实 claimant 进程和第二 grant 的同事件去重检查 | unknown 不重投会损失自动恢复可用性，不能删除 claim 解锁 |
| unknown writer、网络分区、Host unavailable、machine restart 的 truthful recovery | 真实 conductor 死亡 unknown/不重投；修复后一次 OS 通知接受；Host policy 漂移实际被 gate 拒绝；机器／boot 不符反例拒绝 | 完整网络分区及物理重启的原生演练缺失；不能用 source test 冒充该证据 |
| bounded checkpoint、预算和通知 | 一个明确检查点／一个 fresh turn、expiry、超时、显式 macOS 通知及故障保留 | 无无限续跑；新检查点需要它自己的授权；OS 接受不代表用户看到 |
| 没有把 trace/memory/evaluator 变成授权 | 明确 Owner/grant 引用及逐效果／provider／最终 outcome 核验；未知 claim 保留事实而不授予重试 | Owner 自然语言的语义解释仍由模型负责 |
| 公共入口、安装、测试及真实交付消费 | 826 Node、104 Hook、audit0；pack、Skill、Plugin validator、134 资产隔离 Codex 安装 healthy；公开 Pi gate 合法任务 finished | HOME 只读 doctor 为原有 degraded；无真实安装。正式 E Task/aggregate/Test/Deliver 尚未完成 |

当前不能把第七步或整个 Stage E 标记 done。D 的固定十次比较继续保留：源码10/10、正式交付链9/10、自然结束8/10，重复收益未建立。第八步完整候选比较已完成，建议拒绝两个候选但 Owner 尚未作最终决定；本次追加源码评审不等于该决定。
