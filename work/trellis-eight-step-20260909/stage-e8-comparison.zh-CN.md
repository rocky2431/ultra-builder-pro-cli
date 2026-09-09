# 第八步：Pi 结果提示候选固定评测

2026-09-09。24 次原生尝试全部结束，零重投、零运行中干预，所有 writer 已停止，任务源与产品源未改变。开发和 held-out 各两个独立 QA 数据样本，每方案每样本两次；模型和权限相同。当前行为、附加完整 canonical schema、仅说明数组类型三个方案按冻结顺序比较。

| 分区 | 方案 | 有效且事实正确 | 总耗时秒 | 估算成本 |
|---|---|---:|---:|---:|
| development | current | 1/4 | 133.817 | 0.150336 |
| development | candidate | 1/4 | 103.952 | 0.162824 |
| development | simpler | 0/4 | 123.016 | 0.151496 |
| held-out | current | 1/4 | 97.762 | 0.135399 |
| held-out | candidate | 4/4 | 79.395 | 0.110424 |
| held-out | simpler | 1/4 | 155.025 | 0.154368 |

独立盲审逐份确认 24 个最终文本的任务事实均正确。冻结自动评分要求 `affected_services=2`，但原任务要求“which services”，服务名单也是合理且更具体的回答。因此原始严格分数保留，另列独立事实判定；没有重写任务、输出或原评分，也没有把权限失败改为成功。全部样本中 15 次 permission_denied、1 次 invalid_result；这些原生失败仍然计入分母。有效结果合计 current 2/8、candidate 5/8、simpler 1/8。

完整 schema 在 held-out 组观察较好，但开发组有效率与 current 相同且成本更高，未达到预注册“开发与 held-out 均有改善”的资格条件。样本较小，不能据此推广效果，也不能把此比较算作 Stage D 的产品收益。

**建议：拒绝此次完整 schema 候选和更简单候选，保留当前默认；最终 reject 由 Owner 明确决定，尚未记录。** 没有应用候选或改变默认。单行 patch 已在隔离 Git 目录实际 apply/reverse 并恢复原字节，仅证明 rollback-ready；并非已采用策略后的实际回滚。

原始证据：`stage-e8-campaign.json`、`stage-e8-attempts.jsonl`、`stage-e8-independent-adjudication.json`、`stage-e8-final-audit.json`、`stage-e8-raw.tar.gz`。最后一份 audit 包含原评分、逐条盲审、生命周期及完整 SHA 文件索引。最初泄露答案的 QA 材料已在运行前拒绝并留档；改正只改变任务提示，未改变数据或答案。

步骤八仅完成此次候选评测与回滚准备，不代表整个 Stage E 或八步完成。第七步已独立实施并取得原生 W4 观察，但正式验收仍未完成，第六步的重复成功及收益门槛仍未通过。
