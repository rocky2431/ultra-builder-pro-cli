# Stage E 独立最终评审

## 结论

- **总评：INCOMPLETE**
- **当前机制：INCOMPLETE**
- **Step 7 退出验收：INCOMPLETE**

当前实现没有在本次源码复核中发现新的 P0/P1 缺陷。实现已具备有限的一次 fresh turn、显式 grant、源哈希绑定、撤销/过期/截止时间复核、持久 event claim、未知效果不重放、进程/PID 观察、原生工具逐次权限判定，以及大小写和符号链接 protected-path 防护。相关机制可见 `skills/ultra-delegate/scripts/durable-run.cjs`、`pi-durable-primary.cjs`、`pi-native-permissions.cjs` 和 `run-slice.cjs`。

但这不足以宣布 Step 7 或完整 Step 3 通过。

## 关键缺口

1. **缺少机器重启和完整网络中断的 live proof。** 作者明确未执行这两项试验。现有源码测试与同机 retained journey 不能替代架构 12.4 要求的真实 truthful recovery 证明。
2. **最终修复后的 fresh 独立生命周期证据不足。** R60vX2 的消费证据明确来自最终 P1 修复之前的源码版本；不得将其与后续修复合并描述为当前版本的通过。
3. **Step 8 Owner 决策仍缺失。** 候选评估完成不等于 Owner promote/reject；12.4 明确要求显式决定及 rollback-ready。没有该决定，完整 Step 3 不能接受。
4. **Stage D repeated-benefit acceptance 仍开放。** 这是单独的未闭合验收项。

## 已观察的保留限制

- 同机 PID 重用可能保守地延迟恢复，但不构成重放证据。
- macOS 通知只记录 OS request accepted，不能证明用户看到了通知；既有故障旅程 `/private/var/folders/cm/zpwxmr512rq1qz4_0_ryz8t80000gn/T/ubp-durable-native-nQKQo2` 观察到 notification=false。
- 资格边界不是 OS 级 read sandbox，也未证明能抵抗同用户进程进行的目录替换 race。
- 本次未能执行指定 narrow tests；`stage-e-release-current.json` 中的 826 passed、5 skipped、104 hooks 和 audit 0 是作者保留证据，非本轮执行结果。

## 证据边界

我检查了当前产品源及 retained raw evidence，包括：

- 最新正常 native journey：`/private/var/folders/cm/zpwxmr512rq1qz4_0_ryz8t80000gn/T/ubp-durable-native-zBL41n`；
- `work/trellis-eight-step-20260909/stage-e-current-native-index.json`；
- `work/trellis-eight-step-20260909/stage-e-pi-qualification-raw-index.json`；
- 三轮 source-review disposition 与其 raw roots；
- `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md` 第 12.4 节及 accepted Step 7 计划。

未运行 native probe、未启动 provider 或 delegated agent、未安装、未改产品源码/测试/依赖/配置，也未制造新一轮评审。

完整结构化报告见 `review-output/final-review.json`。