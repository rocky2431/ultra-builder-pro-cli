# Stage D 固定 V2 比较结果

十次预先固定的运行全部保留。源码功能验收 10/10；正式 Task Review／Evidence／Test／Deliver 链可复核 9/10；原生 Primary 正常结束 8/10。第六步仍未通过：balanced Profile 的 Manifest Factory 只有一次正式成功，适用任务的可重复收益没有建立。

| Shape / Profile | 重复 | 模式 | 秒 | 估算成本 | Model calls | 正式交付 | 原生结束 |
|---|---:|---|---:|---:|---:|---|---|
| expense / pi-foundation-v1 | 1 | factory | 1750.913 | 5.937148 | 104 | 已观察 | 正常 settled |
| expense / pi-foundation-v1 | 1 | solo | 1317.774 | 4.291545 | 74 | 已观察 | 正常 settled |
| expense / pi-foundation-v1 | 1 | step1 | 1800.774 | 5.345805 | 99 | 已观察 | 正常 settled |
| expense / pi-foundation-v1 | 2 | factory | 1783.917 | 4.798149 | 93 | 已观察 | 正常 settled |
| expense / pi-foundation-v1 | 2 | solo | 1583.288 | 5.005366 | 83 | 已观察 | 正常 settled |
| expense / pi-foundation-v1 | 2 | step1 | 1681.158 | 4.881824 | 93 | 已观察 | 正常 settled |
| manifest / pi-balanced-v1 | 1 | factory | 2100.107 | 5.819354 | 109 | 未完成 | watchdog |
| manifest / pi-balanced-v1 | 1 | solo | 1234.833 | 4.046358 | 72 | 已观察 | 正常 settled |
| manifest / pi-balanced-v1 | 2 | factory | 1966.414 | 6.090392 | 123 | 已观察 | 正常 settled |
| manifest / pi-balanced-v1 | 2 | solo | 2100.237 | 6.898029 | 123 | 已观察 | watchdog |

## 能支持的结论

- Expense 的 Factory、Solo 和手工 Step 1 两次都有正式交付。Factory 两次均慢于 Solo；相对手工 Step 1 的第一轮小幅提速在第二轮没有重复，成本差异也反向。不能把相互抵消的不同单次指标拼成“重复收益”。
- Expense 第 1 次，Factory 相对 solo：耗时变化 +32.87%，成本变化 +38.35%。
- Expense 第 1 次，Factory 相对 step1：耗时变化 -2.77%，成本变化 +11.06%。
- Expense 第 2 次，Factory 相对 solo：耗时变化 +12.67%，成本变化 -4.14%。
- Expense 第 2 次，Factory 相对 step1：耗时变化 +6.11%，成本变化 -1.71%。
- Manifest 第一轮 Factory 源码 14/14，但缺少正式 Task Review 收据而超时；第二轮 Factory 正式交付并正常结束。第二轮 Solo 的归档、验证与最终提交在 watchdog 前完成，提交命令结束比停止早 19.685 秒，但 Primary 没有正常 settled。不得把它误写成未交付，也不能隐藏运行超时。
- 固定比较保留全部失败、修复、原生调用、缓存 token 和费用。模型选择下一步；Root 没有运行中提示、补交收据、修复源码或延长时限。第二轮全部 21 个委派 Writer 与五个 Primary 已通过实际进程/收据观察确认停止。

## 阶段处置

D 的 Git 生命周期、packet 编译和 W3 独立 IPC 已实现，并有当前窄检查、817 Node／104 Hook／audit0、pack、Skill、隔离安装与真实 W3 故障观察。它们不替代产品条件 D-04／D-05。现阶段不能完成 D 的 canonical Task Evidence／Review／Deliver，也不将第六步标记 done。

第七步依赖第六步的稳定合同。W4 Host API 已完成有限预检；durable Grant、撤销／过期、机器丢失和产品级恢复仍未实现或验证，见 stage-e-durable-preflight.zh-CN.md。第八步可使用这些真实失败记录做固定离线候选评测；它不改变此处的验收，也不自动晋升策略。

不根据结果临时添加“替换成功”、放宽验收或把更多 Agent 数量当收益。后续需要针对观察到的协调成本和交付失败提出有具体依据的修正，再在明确版本和预算内验证；本报告自身不创建新执行授权。

## 证据及限制

逐次 SHA、独立 native Review 来源、所有命令、最终 source diff、Worker 重叠和原始归档引用见 stage-d-product-v2-final-observations.json 及各 audit JSON；timeout 的完整交付证明见 stage-d-product-v2-deadline-closeout-observation.json。v1、无效夹具和两次 handoff 方法的原结果均未覆盖。

这些小任务不估计总体性能，shape 与 Profile 固定对应，匹配组共用 provider 环境。原生估算费用不等同独立账单。正式材料完成与原生回合正常结束是两个观察维度，均保留。
