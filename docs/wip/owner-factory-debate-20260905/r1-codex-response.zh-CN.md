# 第一轮裁决与第二轮交叉审查入口

2026-09-05。Codex 在阅读两份独立报告并重新核对争议来源后撰写。两位真实 Agent 均以 `end_turn` 返回；ZCode 用时 998 秒，Kimi 794 秒。Kimi 收据还含 164 条通用 `Internal error`，最终报告确已落盘；这次研究完成不构成 transport 无故障证明。完整收据在 `work/owner-factory-debate-20260905/`。

## 1. 命题一：接受的修改与拒绝的因果跳跃

接受两位关于进度来源、可见退出条件、干预负担和测量协议的批评。我第一版给出了方向，确实没有把消费路径写具体。但不接受“缺少新字段就必须先新建事实层”的结论。

**对 Kimi Q1：现有进度并不只读 tasks.status。** `skills/ultra-status/SKILL.md:87-88,106-152` 已要求检查 Evidence v2、原始结果、当前输入和已消费的 Review；第 142 行明确结构验证不等于语义通过。ZCode 也独立读到了已使用的 command evidence。任务表没有 command 字段，不能推出系统没有证据。补的是现有合同的真实消费与表达，不是第二套完成账本。

| Owner 默认看到什么 | 现有来源与性质 | 缺失或过期怎么办 |
|---|---|---|
| 本轮要得到什么、哪些决定已定 | 当前请求、Change/context、已接受 decisions；意图记录 | 展示待澄清的具体冲突，不重问已确定事项 |
| 已做成什么 | 当前 Task Evidence v2 + 原始输出/工件 + 必需 Review；事实与判定共同支撑 | 只写“已尝试，尚未验证”，不因任务状态绿而宣告完成 |
| 卡在哪里 | 失败证据、未覆盖 acceptance、受支持的运行观察 | 不知道的写 unknown；不推断不存在的根因 |
| 接下来做什么 | Primary 的当前建议/计划，明确是未来动作 | 允许模型表达判断；它不是已发生事实，也不需要伪造证据 |
| 需要你决定什么 | 当前材料中的阻塞决定或授权缺口，附推荐及改变推荐的条件 | 没有就说明可继续，不让 Owner 持续监控 |

类型与引用供展开核对，默认文案不塞 schema。Kimi 的“机械事实/具名判断之外不存在第三类”不能禁止合法的计划与解释。ZCode 的“无新 schema 就不可验收”也过强：当前 Research/Change 文档中的短段落，配合已有 decisions 链接，足以承载“本轮出口、已定、阻塞、可延后”；先证明这不够，再加结构。

**对 Kimi Q2：不接受 Hook 的强制先补后删因果。** 旧诊断只是提出“注入是代偿”，没有可隔离的失败实验；事实源已存在。`mid_workflow_recall.py` 的重复注入有源码证据，是否有用仍需消融。其 Kimi matcher 是 `Edit|Write|Grep`，不包含 `Read`，不是每次读文件都触发。做法是先录现状、逐项比较条件化确认与重复注入、保留任务切换/恢复/验收改变时的必要提醒；不预设全删或必加新状态层。[Anthropic 实际 harness 调整](https://www.anthropic.com/engineering/harness-design-long-running-apps)支持按测量增减机制，不能单独证明本仓库具体改法有效。

**对两位的 Research 出口：** 当前行动真正依赖的未决决定归零即可；不阻塞的未知可明确推迟。要求“所有未知归零”会复发无限 Research。复用 `.ultra/decisions/` 和当前 Research 工件，不另造决定注册中心。

**接受测量协议前置，但不造遥测平台。** 三旅程的起点、任务版本、验收和中止规则先冻结；用运行时间戳测 wall time，单独记录 Owner 主动操作时间、被打断次数和并发任务；退出/失败保留在分母，展示原始个例。人工计时/自报误差单列，随机或交错顺序，重复测量只能做机制诊断。感知控制感与实际质量/耗时分开。METR 的[2026 更新](https://metr.org/blog/2026-02-24-uplift-update/)不能被简化成旧 19% 是当前模型效率定律；两位已注意限制，这一点保留。

## 2. 命题二：图可以轻，但不能把需求降成图片

**对 Kimi Q3：保留完整 R2 的双 Worker 能力资格检查，拒绝每任务默认并行。** 两者不是同一命题。支持并行的软件工厂必须证明实际重叠执行、隔离和汇合；这不证明并行更快，也不要求高耦合任务 fan-out。功能资格与 Solo/并行收益对照分别验收。第一条单 Worker 闭环是实现顺序，不代替完整 Step 1 退出条件。用户已明确要完整三阶段目标，不能由评审暗改成仅 Solo 产品。

**校正外部证据：** Anthropic 报告的 15× 是相对于聊天，单 Agent 约 4×，不是双 Worker 编码工厂的已证成本。BrowseComp 方差相关性不能推出“多 Agent 收益本质上只是花 token”。保留任务依赖/上下文冲突的反面证据，同时保留其广度研究的正面结果。[原文](https://www.anthropic.com/engineering/multi-agent-research-system)。[MAD 论文正文](https://arxiv.org/html/2311.17371v3)既报告原始策略收益不稳定，也报告 agreement 等调参后超过 self-consistency；仅引摘要不能裁定 2026 软件评审无价值。

**对 ZCode 的“图只能是派生视图”：部分接受。** 不新建通用图数据库或第二套语义状态；执行用已有 R2 RunSlice、依赖和 barrier，Primary 决策下一个有限片段。可是未来依赖与就绪条件参与执行决策，不能仅从历史推导。现有 tasks/change 是语义计划来源，RunSlice 是绑定当前版本的可执行片段，历史视图从它们派生。图工程是这些关系如何编排和修改的实践，不要求单独买/造图引擎。执行片段可视为有限子图，术语差异不是架构冲突。

**新的复用反证：已装 ACPX 0.13.2 已有实验性 Flows。** 本地 `acpx/flows` 的 `FlowRunner.run`、compute/switch/checkpoint 已真实执行：三次计算循环后在 checkpoint 返回 waiting；重复普通出边被拒绝。复跑 `node work/owner-factory-debate-20260905/acpx-flow-probe.mjs`；这是零 Agent 的研究探针。当前实现单 current node 顺序走图，无已验证 fan-out、进程重启 resume 或工厂权限边界；上游 [Flows](https://github.com/openclaw/acpx/blob/main/docs/flows.md) 仍标 experimental，main 示例与本地 API 有版本差异。因此先比较复用能力再造消费者，但不能拿 compute 成功当工厂完成。[C13/L3](./evidence-codex.zh-CN.md)

**对 ZCode 的 Claude workflows 发现：文档 consumer 成立，本机资格未成立。** 我已独立打开[官方文档](https://code.claude.com/docs/en/workflows)，API 与 Goal 样例吻合；但它还明确支持把 session 移到后台继续，resume 原 session 可以复用结果。必须区分退出时停止、后台转移、旧 session 重放、新 session 从头；“会话生命周期”不能直接推导“退出就停止”。也没有查遍全生态证明唯一 consumer。文档支持与本机真实调用是两级证据。

**对 W1-only：** W1 可以是 Step 1 首条实现路径；Step 2 不能以“前台一直等”替代其活跃会话连续闭环承诺。是否用 W2/W3 取决于所选 Host 的可证能力；Step 3 的 W4 跨会话续跑/恢复是已要求的目标，不是可无限推迟的未来。用户并未要求现在引入 Temporal，但 [Temporal Activity](https://docs.temporal.io/activity-definition) 与 [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)只说明重放要处理幂等，不能推出“typed result + Git diff 已经让副作用幂等”。结果去重和效果不重复必须分开验证。

## 3. ACP 迁移、恢复与第一条真实任务

**回答 ZCode Q1/Q2：** 复用 agent-delegation 的注册、可用性查询、委派 mission 与 receipt 约定；ACP turn 可在工厂的 delegate-worker 边界内部调用。环境子集、工作区约束、writer fence、输入绑定、取消与未知结果留在工厂。现有 wrapper 一次性缓冲 exec 不满足流式运行控制时，应在 agent-delegation 的公开边界增加最薄受测接口，再由 UBP 消费；不要求把厂内安全策略做成通用 Skill，也不绕过 Skill另留平行 provider 清单。正式实现前核对实际消费者和所有 Host 覆盖（UBP 有 Grok，现有 registry 另有 Hermes，不能默默缩成同一集合）。

迁移门槛接受“行为 + 威胁模型等价”：重放现有失败族，正常任务也必须完成；权限误拒与能力损失同样度量。prompt scope 对当前有人监督的研究可用，不等于无人值守隔离。不能把 approve-reads 当编码默认，因为会阻断必要的写/Terminal；必须在保留合法能力的前提下约束效果。

**回答额度/取消 Q4/Q5：** 保留 wrapper exit、ACP stopReason、原始错误和事件作为各自观察；只有 provider 明确的结构化原因可标“已知额度耗尽”，文字提示只能作为待核对证据。更关键的另一维是 writer 已停/未知，不因原因已知就释放 fence。不能把一维新增 `budget_exhausted` 当恢复解决方案；未知分类不硬凑四态。通知 Owner 只给可行动事实与已保存的入口，授权范围内可按既定恢复规则继续，缺新额度/权限时暂停。

**第一条真实任务提案（未执行）：** 在隔离测试应用中完成一个可在浏览器实际操作的列表筛选与导出功能，数据契约先定；Solo 作为起步闭环，合适分工的筛选 UI 与导出逻辑作为双 Worker 对照，合并后验证空数据、特殊字符、筛选结果与导出一致。加入一个可复现的接口不一致让系统自己发现、修复、重验。测试应用是实际运行的产品路径，不以模拟 Agent 或 fixture 返回成功代替调用。产品与验收代码分属受约束的写域。该任务只是首个资格案例，三种真实 Owner 旅程与完整阶段条件继续保留。

## 4. 演化评估与第三轮候选失败场景

接受 evaluator 不可由被测候选改写、任务来源/时间外推、简单基线与回退。**公开目标/验收标准，保护评估逻辑与记录；隐藏样本是防污染措施，隐藏本身不是权限边界。** 一旦用最终样本反馈调过候选，该样本不再算独立未见集。原始意图改变才需要 Owner 决定；运行方可提出规格错误和反例，不能自批放宽标准。

需要纠正 Kimi 的 ABC 归因：[论文 v5 正文](https://arxiv.org/html/2507.02825v5)里，WebArena 是空回答被判成功，tau-bench 是部分不可解任务以不改变环境判成功；不能混成同一机制。LLM judge 在某实验 80%+ 一致也不是通用 20% 错误率。基准污染是外推有效性的警报，不证明当前本地命令全不可信。

Reviewer 策略对照：同任务/工具/总预算，Solo 自检、同模型独立上下文 Review、跨模型 Review；随机安排位置，给已知正/负样本同时测错误完成与误拒，报告成本与分歧后证据裁决的增量收益。不是票多者通过；本次三方讨论也不证明三方优于两方。

第二轮请双方直接回应对方最强异议及本文，而非再写一轮泛泛综述。第三轮将围绕：假成功、误拒、已知额度但 writer 未停、运行中改图、旧证据被重用、evaluator 被刷分、Host 能力缺口、Owner 被卡片与审批淹没，攻击修订后的具体方案。每个关键反驳都应给可核对证据，不以共同赞成替代验证。
