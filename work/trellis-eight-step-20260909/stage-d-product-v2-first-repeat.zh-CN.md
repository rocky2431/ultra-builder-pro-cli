# Stage D V2 第一轮观察

固定十次比较中的前五次已结束；第二轮仍在运行。这里记录第一轮，不能据此宣称可重复收益或 D 完成。

| Shape | 模式 | 秒 | 原生估算成本 | Model calls | 正式交付链 |
|---|---|---:|---:|---:|---|
| expense | factory | 1750.913 | 5.937148 | 104 | 通过机械复核及真实独立收据来源 |
| expense | solo | 1317.774 | 4.291545 | 74 | 通过机械复核及真实独立收据来源 |
| expense | step1 | 1800.774 | 5.345805 | 99 | 通过机械复核及真实独立收据来源 |
| manifest | factory | 2100.107 | 5.819354 | 109 | 未完成 |
| manifest | solo | 1234.833 | 4.046358 | 72 | 通过机械复核及真实独立收据来源 |

Expense Factory 与 Solo 都有当前正式交付：Factory 耗时增加 32.87%，估算成本增加 38.35%。与手工 Step 1 相比耗时减少 2.77%，成本增加 11.06%。这只是一组观察；小幅时间差不建立可重复收益。

Manifest Factory 被固定 35 分钟 watchdog 停止，原验收 14/14，但 Task Evidence 的外部 review receipt 路径缺失；ledger 未完成，也未归档 Deliver。完整交付时间是未观察值，不能把 2100.107 秒当作成功完成耗时。Solo 在 1234.833 秒完成正式交付。

第一次无效 Challenger 和手工路径失败 Worker 均保留；它们的成本计入对应模式。全部五次的目标与验收原字节不变，运行期间六个核心源码指纹不变，没有 Root 运行中提示或修复。权限、收据与预算没有放宽。此轮仍不能支持两个 shape/Profile 的重复成功条件。

成本来自原生 session usage 估算，未独立核对账单；并行发起匹配组存在 provider contention，shape 与 Profile 对应固定，不能作因果 Profile 排名。所列命令、逐字节 review 来源、最终 source diff、raw SHA 与归档引用均可在对应 audit JSON 中复核。

## 原始审计索引

- `stage-d-product-v2-expense-r1-factory-YeRGol-audit.json`
- `stage-d-product-v2-expense-r1-solo-uczt6B-audit.json`
- `stage-d-product-v2-expense-r1-step1-rRJ80M-audit.json`
- `stage-d-product-v2-manifest-r1-factory-jiJb9M-audit.json`
- `stage-d-product-v2-manifest-r1-solo-GFQKWH-audit.json`
