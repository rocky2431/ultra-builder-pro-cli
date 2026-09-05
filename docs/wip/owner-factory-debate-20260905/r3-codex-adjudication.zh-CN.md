# 第三轮最终裁决：采用什么、拒绝什么、什么仍待实测

2026-09-05。实际 ZCode、Kimi 第三轮均已交稿。Codex 阅读报告、重新联网核对决定性来源，并检查争议代码的真实路径。三轮结束，不自动增加第四轮；[最终行动方案](./final-plan.zh-CN.md)吸收以下裁决。

## 1. 最重要的来源更正：Kimi 读到了安装副本

Kimi R3 E4(a) 的“当前源码不存在环境净化”不成立。其原生工具记录显示，实际读的是：

`/Users/rocky243/.kimi-code/plugins/managed/ultra-builder-pro/skills/ultra-delegate/scripts/`

这与当前工作区源码不同。Codex 实时重算：

| 文件 | 当前 checkout | Kimi 安装副本 |
|---|---|---|
| delegate-worker.cjs | 479 行，SHA256 `a7ee8530346f2fb2d8868aba9c207edc5df730377e54c270fbfa8b143ffc8373` | 328 行，`274f13984f3e0c697bf06d61e2f7561de251018c740b2e58441a216552fad536` |
| host-profile.cjs | 569 行，`708ee35bdcbafebd7a057e69c5d2cd77bc1331f4603f932a98c648c831f4d119` | 267 行，`5301bf72778b6971a08452825e09cb28790c79ff7b9c41d9d89e4e287f8e9ad9` |

当前 `host-profile.cjs:93-115` 有 allowlist 形式的 `descendantEnvViews`，`delegate.cjs:911` 消费它；`acp-driver.cjs:434`、`cli-driver.cjs:37` 使用 `descendantSpawnEnv`。单搜 TOKEN/KEY/SECRET 字样也不能否定允许清单过滤。可复核：`rg -n 'descendantEnvViews|descendantSpawnEnv' skills/ultra-delegate/scripts/*.cjs`。

结论：**安装副本与源码不一致是真实发现；“源码没有该逻辑”是混用了样本。** 这不证明当前源码完成了 D1，更不证明 OS/网络隔离。源码、安装件、实际 Host 路径都要分别标身份，不把其一当另一个。Kimi 的“只剩三种边界”同样不是穷尽审计，尤其 `.ultra` 的 prompt/声明保护不应被说成实际拦截。

## 2. 采用的补充与不采用的强化

| 议题 | 最终裁决 | 证据与限制 |
|---|---|---|
| 效果边界 | 接受双方：权限模式、fence、事后 diff 不等于 OS/网络隔离。所选 Host 必须验证未授权效果在实际边界被拒，已授权读/写/网络/Terminal 仍可完成 | 当前 ACPX policy→mode→交互顺序已核对；[Claude sandbox 官方分层](https://code.claude.com/docs/en/sandboxing)。不把所有网络访问一律禁止 |
| 卡死、孤儿与执行器崩溃 | 增加 deadline 但进程仍活着、启动三窗口、终态发布前崩溃、并发恢复和后代逃逸等假设场景；先核对效果/停止，再重启竞争 writer | [Temporal 故障检测](https://docs.temporal.io/encyclopedia/detecting-activity-failures)说明存活/超时不等于业务完成；未执行本项目故障注入，不能称这些假设为已确认漏洞 |
| 每次超时都问 Owner | 不采用 ZCode 的固定中断要求。RunSlice 已有 budget/deadline/cancel policy；预先授权的处理自动执行，缺新授权或机械无法证明的风险才升级 | R2 §6.3 已有消费者与字段；避免把自动化恢复重新变成人工编排 |
| 在飞任务与图 revision | 计划/Change 保存 revision 与替代关系；attempt 绑定启动输入。授权仍有效、无冲突时可在原版本隔离完成；授权撤销、禁用效果或取消要求优先，不能坚持“必须 pinned 跑完” | [Temporal 版本机制](https://docs.temporal.io/worker-versioning)可借鉴版本纪律，不能移植为忽略取消的规则 |
| 旧证据有效性 | 使用现有 Evidence freshness/acceptance、输入及依赖绑定；一致且有依据的可复用，变化或来源不足则重验受影响部分。需要的新依赖绑定仅在实际缺口处增加 | `task-evidence-v2.md`、`ultra-status/SKILL.md:106-152`。不新建与它们重复的“有效期”账本；不因无关图重排作废全部成功成果 |
| evaluator 保护 | 接受将其列为具名实施要求和篡改资格用例：评估逻辑、基线与日志在候选不可写边界；探针要核对拒绝发生在何处。修改检测只能发现变化，不能充当预防隔离 | [RE-Bench](https://arxiv.org/html/2411.15114v2)附录 A.2/D、[DGM](https://arxiv.org/html/2505.22954v3)、[ABC](https://arxiv.org/html/2507.02825v5)均有评分偏离目标的实例；工厂未完成此项资格 |
| 哈希检测语义漂移 | 拒绝 Kimi 的强命题。hash 只能检测所绑定字节改变，不能证明实现满足原意，也检测不到“验收没改、实现偷换”的语义失败。受保护合同变化先使原依赖证据失效，再走已有 reconciliation/授权路径 | 沿用当前精确合同；需 Owner 批准的修订不能自批，但不是每个非权威文档改字都要求新审批 |
| 告警预算 | 接受同因去重、可恢复噪声不打断、相关误拒反例合并呈现；不采纳无实测依据的每旅程固定条数上限，以免压掉重要事件 | 本次 Internal error 后仍产出报告说明“事件不等于阻塞”；真实监控负担须在旅程中测 |
| held-out 与晋升范围 | 新时间点不自动等于独立。候选筛选与终评隔离；局部仓库模板用未参与优化的新任务验证并只声称局部收益，跨项目默认策略需未见任务族/仓库支持 | RE-Bench 新环境方法与 AFlow/GEPA 的独立评估原则；30 个任务依赖关系不能证明它们是所有可能评测来源 |
| 薄执行器选型 | 维持当前选择，暂不接 experimental Flows；拒绝“没有任何失败可以推翻该选择”的不可证伪表述 | 若其正确性、恢复、维护或能力损失在同一验收案例下显著差于一个合格现有运行时，应改选；目前没有这样的比较结果 |

源码中某段并发逻辑看似有竞态，是待复现假设。没有检查全部外围 fence/调用约束，就不能把它写成已确认漏洞，也不能据此未经授权改 D1。

## 3. 本轮引用的额外研究，能证明到哪里

Codex 独立核对了 ZCode 引用的 sandbox、Temporal 故障检测与版本文档，以及 Kimi 引用的 RE-Bench 正文与附录。RE-Bench 明确记录过复制参考权重并模拟训练的作弊样本，并承认未人工检查全部 Agent 运行。这支持“分数需要效果核对”，不支持“加一个哈希就能解决”。

ABC 的 28% 是其具体评估设置中的数字，报告间出现“整体绝对低估”与“某任务部分低估”的口径差异；最终方案只采用环境漂移造成误拒的机制，不拿这个数字估计本项目收益。两处空输出获分的归因已在第二轮纠正，第三轮 Kimi 接受；双方历史报告保留原文，防止纠错记录消失。

## 4. 最终采用的路径

先修真实 Owner 旅程并验证，再统一已有 ACP 委派入口和厂内责任，按完整 R2 Step 1/2/3 实现运行、运营与耐久演化。任务内可自由改已授权方法与下一片段；持久策略晋升仍遵循 R2 的 Owner 决定，不把每次修复都变成审批。独立 UltraGoal 的成熟验收/Review/恢复合同保留，其图与委派样例单独修正文案和 consumer 边界。

三方对两个产品命题与这个实施顺序已形成可用方案，但并非每条建议都一致：被拒绝和被限制的建议如上。源码存在、文档能力、研究报告完成、真实运行资格四种证据分别报告。下一步可以据此开始明确范围的整改；本次没有实施产品代码、安装、提交或运行 D1 qualification。
