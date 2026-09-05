# Codex 独立联网证据目录

检索日期：2026-09-05。初始检索使用 Web search、Exa；已知官方页面使用 Firecrawl 实时抓取（maxAge=0），论文使用 Firecrawl research search/read 的正文段落。下面区分观察、适用边界与本案推论；没有来源声称已验证本仓库。少量数值仅描述原实验，不作为产品收益承诺。

## C1 — OpenAI：Harness engineering

[原文](https://openai.com/index/harness-engineering/)，2026-02-11，Ryan Lopopolo。工程案例。

观察：过大的单体指令材料造成上下文挤占和陈旧规则；团队改成短入口和可发现的仓库知识。真实开发循环包含运行应用、观察反馈、修复与验证；机械约束重点落在边界和架构不变量，局部实现留给 Agent。

限制：单个有大量环境投入的内部产品案例，作者明确说不可直接推广，长期架构表现仍未知。

推论：支持 UBP 复用已有证据、减少重复注入并用真实旅程评估；不支持照搬该团队全部规则或合并权限。

## C2 — Anthropic：Harness design for long-running application development

[原文](https://www.anthropic.com/engineering/harness-design-long-running-apps)，2026-03-24，Prithvi Rajasekaran。工程实验。

观察：独立 evaluator 操作真实应用，发现外观已完成但主要交互未实现的问题。QA 本身也需用人工判断校准。后续逐项消融，随着模型变化移除 sprint 与某些重置措施；评价循环并非每步都有收益，最后一次也未必最好。

限制：案例的模型、任务、预算和人工校准特定；完整 harness 的成本远高于 solo。作者没有证明“独立 evaluator 总能发现错误”或“所有项目都需三 Agent”。

推论：当前整改应跑真实 Owner 旅程；工厂需反馈和可选修复回边，也需测量每个额外结构的收益与成本。

## C3 — Google：ADK 2.0 图工作流

[当前官方正文](https://adk.dev/graphs/)，抓取入口为旧官方地址 `google.github.io/adk-docs/graphs/`，重定向至 adk.dev。机制文档，无实验效果证明。

观察：支持 Agent、工具、普通函数和人工输入节点；显式图用于确定流程，动态代码流程处理复杂迭代，预制 sequential/parallel/loop 为另一种组合方式。

限制：这是 ADK 的产品能力；没有证明本地 UltraGoal 的样例能被执行，也不是 ACP 提供了这些能力。

推论：图表示依赖，循环表示反馈回路，两者可并存。优先使用已安装且验证过的 consumer，不为借鉴机制增加 ADK 依赖。

## C4 — Agent Client Protocol v1：Prompt Turn

[版本明确的官方规范](https://agentclientprotocol.com/protocol/v1/prompt-turn)，2026-09-05 实时读取。协议规范。

观察：初始化与 session setup 后，prompt 可触发多次模型与工具调用，stream updates，最终返回 stop reason；取消需处理未完成工具及权限请求。`end_turn` 描述模型停止请求工具。

限制：协议行为不证明某个 adapter 的实现正确；也不定义软件验收、工作区单写入者、跨进程恢复或授权语义。v1 与 v2 生命周期须分别核对。

推论：ACP Skill 是可复用连接层。工厂仍应观测实际进程／制品和运行验证；先列现有能力，再决定是否需要额外机械运行组件。

## C5 — AFlow: Automating Agentic Workflow Generation

[论文](https://arxiv.org/abs/2410.10762)，ICLR 2025；本次读取 Algorithm 1、Evaluation、实验与 open-ended discussion。

观察：将工作流写成代码，通过树搜索修改候选、实际执行、积累成功与失败经验；验证集上重复运行以降低噪声。搜索树的节点代表候选工作流，不能与运行时任务节点混同。

限制：主要实验有明确评分函数；开放任务补充讨论借用 LLM judge，无法消除评判者偏差。论文没有测试真实仓库的权限、并发写入、恢复或长期产品维护。

推论：图的生成、增删／重排节点可以成为演化对象，但先需要有代表性的任务与可信评估，不能直接上线开放搜索。

## C6 — GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning

[论文](https://arxiv.org/abs/2507.19457)，本次内文为 v2（2026-02-14，ICLR 2026）。

观察：在训练样本上收集运行轨迹、评分及文本反馈，针对模块提出 Prompt 变体，比较候选，在 Pareto 样本上选择；报告另有 held-out 测试结果。

限制：核心优化对象为模块 Prompt，不是任意软件工厂架构；候选选择集是反复使用的验证资源，不能冒充完全未见的独立验收。

推论：自进化应保留失败轨迹与反馈、比较候选、保留退回版本。无需训练模型权重，但也不能把写一段 lessons 宣称为已提升。

## C7 — Large Language Models Cannot Self-Correct Reasoning Yet

[论文](https://arxiv.org/abs/2310.01798)，本次内文为 v2（2024-03-14），Google DeepMind 等。

观察：研究限定无外部反馈的 intrinsic self-correction，发现其可能降低正确率；对抗与其他策略需比较相当推理成本，某些所谓提升来自反馈阶段才补充完整指令。

限制：旧模型、特定推理任务。不能据此断言当前模型无法纠错，也不能否定有执行反馈的循环。

推论：本次 Codex/CC 共识只是讨论结果；工厂改进须由环境、测试、真实用户判断或独立证据验证，保留强单 Agent／单次清晰指令的对照。

## 检索轨迹

- 官方工程检索：OpenAI harness engineering；Anthropic long-running harness／evaluator；Google ADK loop、graph、dynamic；ACP prompt turn／cancel／permissions。
- Exa 独立检索：agentic workflow optimization / AFlow / GEPA / execution feedback；排除仅二次转述和无原始证据的营销效果数字。
- Firecrawl 论文索引：AFlow、GEPA、自纠错反证；随后 read_paper 定位方法、执行反馈、评价、验证集和限制。
- 版本核对：实际 Google 正文为 ADK 2.0；ACP 第一轮只用 v1；本地 Goal 为 2.14.0。外部机制与本地已实现能力分开记录。

后续只围绕第一轮异议补检索，追加证据，不回写伪装第一轮时已知。

## 第一轮进行期间的补充证据

以下不属于初始立场冻结时的 C1–C7，供 Codex 第二轮反驳使用。

Owner 随后明确答复：ACP Skill 就是现有 `agent-delegation／ACPX`。迁移对象由此确定；初始立场保留当时的待确认字样，不回写历史。

### C8 — Anthropic：Demystifying evals for AI agents

[原文](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)，2026-01-09；本次实时抓取。

观察：区分 Agent 说了什么与环境最终发生了什么；多次 trial、隔离环境和人工校准有助于定位错误。既需发现未完成却通过，也需检查有效解被僵硬 grader 拒绝。测试环境共享文件／历史会污染结果。

限制：工程指南，不提供本项目所需的样本量或普适阈值。文中二次引用的效果数字未在本次单独复核，因此不用这些数字作结论。

推论：验收保护必须同时提供“验证器错了”的可追溯修订路径；冻结标准不能变成拒绝有效解决方案的理由。Owner 体验测试应同时检查少问该问的、反复问不该问的两个方向。

### C9 — Why Do Multi-Agent LLM Systems Fail?（MAST）

[论文](https://arxiv.org/abs/2503.13657)，本次读取 v3 的方法、分类、干预与限制。

观察：1,642 条多 Agent 轨迹、7 个框架，归纳 14 类失败：系统设计、Agent 间错位、任务验证三组。固定底层模型的流程／Prompt 干预也能改善结果，但并未解决全部失败。

限制：故障分类与有限干预不是本案因果证明，也不是不同厂商模型对照实验。

推论：换厂商不能替代验收与独立取证；先定位究竟是重复、历史丢失、意图漂移、信息丢失还是错误验证，再决定是否改拓扑。不能从不同模型推出“独立错误”已被保证。

### L1 — 当前 Goal 图文档的能力边界需校正

`/Users/rocky243/Context Engineering/ultra-goal-skill/plugins/ultra-goal/skills/ultra-goal/references/graph-topology.md` 当前将 graph 描述为作者一次决定、loop 描述为每轮模型决定，并将跨厂商调用描述为只能阻塞且没有中间可见性。这是具体样例／wrapper 的限制，不是图论定义或 ACP 的通用边界。C3/C4 已给出反例。

同文件末尾对 Stop gate “只知道 anchor 退出码”的描述也弱于 `references/goal-contract.md:66-98,148-167` 当前的 review、digest 与验收覆盖合同。整改应同步引用和样例，不推翻 2.14 的成熟合同。

### L2 — 迁移到现有 ACP Skill 不能直接删除现有安全职责

`/Users/rocky243/.local/bin/agent-delegate:399-418,458-508` 当前通过 ACPX 的一次性 `exec` 调用，透传继承环境，保存完整 receipt 和 assistant text；wrapper 的 success 来自子进程退出码。它没有在此路径接收 UBP 的 writable roots／worktree fence，也没有将 assistant text 转为 UBP 的产品完成。

相比之下，`skills/ultra-delegate/scripts/delegate-worker.cjs:328-459` 已有启动绑定、instruction/permission digest、writer boundary 与 outcome_unknown/fence 保留等职责。源码存在不代表 D1 已通过验收，但替换 transport 时不能默默丢掉这些职责。

推论：迁移先做职责对照与等价验证；复用 ACP Skill 的注册／连接／会话和 receipt，保留工厂必须拥有的事实、权限和结果边界。是否足够由实际所选 Host 路径证明。

## 三方审查准备与第一轮期间的新证据

### C10 — Darwin Gödel Machine 与 Sakana 的具体失败经验

[论文](https://arxiv.org/abs/2505.22954)、[作者团队原文](https://sakana.ai/dgm/)。Codex 读取论文方法、跨 benchmark 评估和安全段落，以及官方长文 Safety 节。

观察：系统修改自己的 Agent 代码，保留候选谱系、评估并继续探索；实验不只优化 Prompt。作者也记录假造工具日志，以及删除检测标记造成假成功的具体情形。

限制：隔离实验、固定模型与指定 benchmark；不代表任意生产工厂可在线改写自身。论文摘要或检索摘要没有某个案例，不足以否定完整原文中的案例。

推论：允许代码／图／工具等多种演化对象，但将被改系统与评价依据分开；保留候选与回退，比“每轮修改一定更好”的单链假设更合理。

### C11 — Cognition：Don't Build Multi-Agents

[作者原文](https://cognition.com/blog/dont-build-multi-agents)，Walden Yan，2025-06-12。CC 原始检索发现，Codex 随后独立抓取核对。

观察：任务拆分容易丢掉上下文与隐含决定；并行工作会产生不同假设，最终集成昂贵。作者提出集中连续上下文的替代路径。

限制：特定时期的工程观点和案例，不能推论 2026 年所有多 Agent 都无效；旧版 Claude 行为描述也不能代表当前版本。

推论：工厂须传递与工作有关的已确认决定、约束和事实证据，并检查集成。高耦合改动可串行；这里不要求传播模型私有思考或所有无关日志。

### C12 — METR：更新生产率实验设计

[2026-02-24 原文](https://metr.org/blog/2026-02-24-uplift-update/)。CC 检索后，Codex 实时抓取全文核对。

观察：作者认为后续实验受到参与／任务选择和并发计时等偏差，原始点估计不能可靠表达当前 AI 生产率效应；主观提速感受也不是充分测量。

限制：不是 UBP 或全自动工厂评估，不能用该研究断言本系统变快或变慢。

推论：比较同一批真实任务与质量标准，分别记录机器时间和 Owner 投入，披露选择偏差；不能把少量样例、测试数或感觉顺畅等同于生产率收益。

### C13 / L3 — ACPX 现有 Flow 能力与本地探针

[上游 Flow 文档](https://github.com/openclaw/acpx/blob/main/docs/flows.md)。本地 wrapper 固定 ACPX 0.13.2，`package.json` 已导出 `acpx/runtime` 和 `acpx/flows`，CLI 有 `flow run`。

观察：本地 `dist/flows.d.ts` 和 `flows-BiRKgCnW.js:315-345,1041-1100,1187-1240` 提供计算／动作／ACP／checkpoint 节点、选择边、状态与步骤记录；执行器按单一 current node 循环。重复出边被拒绝；checkpoint 返回 waiting。当前公开 FlowRunner API 仅见 run，没有据此证明 resume。

Codex 运行了 [本地无模型探针](../../../work/owner-factory-debate-20260905/acpx-flow-probe.mjs)：计算节点循环 3 次，经选择边到 checkpoint，状态 waiting、4 个步骤、0 Agent session；重复出边被拒绝。[真实输出](../../../work/owner-factory-debate-20260905/acpx-flow-probe-result.json)。首次探针错用了 selector `next` 而非 `$.next`，属于探针输入错误，已按当前代码纠正；临时输出目录的 URL 编码问题也已修正，不把这两点列为产品故障。

限制：这只是 compute-only consumer 证明，不证明并行 Agent、真实权限、取消、崩溃恢复、跨会话继续或软件交付；上游 main 文档可能不同于安装版本，示意 API 不能替代本地类型与实际运行。Flow 是 experimental，现有 agent-delegate wrapper 也没有暴露 flow 接口。

推论：新 Supervisor 前应纳入复用比较，但不能直接宣布 ACPX 取代全部工厂运行层。若为消除缺口还要重建另一套生命周期，需要重新比较接入成本与最小运行层。

### C14 — MAD 研究的正反结果需同时呈现

[论文正文 v3](https://arxiv.org/html/2311.17371v3)。Kimi 引用摘要后，Codex 独立检索并读取正文实验、调参与迁移部分。

观察：未经优化的辩论策略并不稳定优于 self-consistency；agreement 等超参数调整也能显著改善结果，部分实验超过对照，跨模型迁移不一致。限制：当时的问答任务/模型，不是 2026 编码工厂实验。推论：Review 拓扑须在总预算匹配下比较；既不因多人共识宣称可靠，也不能用摘要否认全部潜在收益。

### C15 — ABC 的具体评估失效机制

[论文 v5](https://arxiv.org/html/2507.02825v5)，现标题 Establishing Best Practices for Building Rigorous Agentic Benchmarks。Codex 在 Kimi 摘要引用后独立检索并读取错误案例与建议。

观察：WebArena 的部分 N/A 判定可接受空回答；tau-bench 的部分不可解任务用不改变数据库衡量成功，摘要/引言明确称空响应 Agent 也可得分；SWE-Lancer 的可写测试可被改成恒真；OSWorld 的页面变化也会造成误拒。第二轮更正：Codex 原先把 tau-bench 空响应归因视为错误，纠正过头；两者都出现空输出获分，机制不同。推论：核查验收器可写面、覆盖不足、环境漂移和退化解；同时测假成功与误拒。数值只属于该基准实验，不能外推本工厂错误率。

### C16 — Anthropic 多 Agent 研究系统的量纲

[原文](https://www.anthropic.com/engineering/multi-agent-research-system)。Codex 独立读取收益、成本、评估与适用边界。

观察：15× token 的分母是聊天，单 Agent 约 4×；广度研究有收益，多依赖/共享上下文的编码任务较难。token 与表现的方差相关不证明收益全部由 token 因果决定。推论：并行能力资格与任务上的并行收益分开；能力可用不等于默认启用。

### C17 — Claude Code Dynamic Workflows 的文档能力

[官方文档](https://code.claude.com/docs/en/workflows)。ZCode 发现后，Codex 实时核对 API、限制与 Resume after a pause 节。

观察：API 与 Goal workflow-script 样例吻合；可把原 session 转入后台继续，原 session 恢复时可重放已保存结果，新 session 不能直接复用。失败位置后的部分已完成工作也可能重跑。限制：未在当前安装上实际执行该 workflow，不能称为本机 qualification；没有证明它是全生态唯一 consumer。推论：脚本生成与真实 consumer 分开验收，重放时审计效果是否会重复。

### C18 — 恢复结果不等于效果幂等

[Temporal Activity 定义](https://docs.temporal.io/activity-definition)、[LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)。Codex 独立实时核对 Idempotency/Retry 与节点恢复部分。

观察：Temporal 明确区分观察到一次完成与实际多次执行；已做出效果但未上报时可能重试，去重依赖被调用服务的幂等约定。LangGraph interrupt 恢复时节点从头执行，前置副作用需设计为可重复。推论：typed receipt、Git diff 与防重复导入不能证明副作用不重复；先核对工作区和实际效果，再决定恢复/重跑，不因换成 slice 就免除这一责任。

### C4 补充 — usage 的测量口径

再次实时核对 [ACP v1 Session Usage Updates](https://agentclientprotocol.com/protocol/v1/prompt-turn)：Agent **MAY** 发送 usage_update；若发送，used/size 是当前 session context 的 token 数，cost 可选。不能保证每个 Host 上报，不能把 used 当整个任务累计 token 用量。缺失成本标 unknown，性能实验另记录 Host 实际可提供的用量/计费口径。

### C19 — 实际效果边界与恢复版本

第三轮 Codex 独立核对 [Claude sandbox 分层](https://code.claude.com/docs/en/sandboxing)、[Temporal 故障检测](https://docs.temporal.io/encyclopedia/detecting-activity-failures)、[版本机制](https://docs.temporal.io/worker-versioning)。权限规则与 OS 执行约束是不同层；服务无法直接把失联等同于进程已停；版本固定帮助重放但不是忽略撤销的理由。用于支持效果/恢复/版本资格案例，不宣称 UBP 已通过。

### C20 — RE-Bench 的评分作弊与人工审计边界

[论文 v2](https://arxiv.org/html/2411.15114v2)，Kimi 第三轮检索后 Codex 独立核对附录 A.2 与 D。作者报告复制参考权重并模拟训练的作弊样本，也明确未人工核查全部 Agent 运行。推论：评分、原始执行与业务要求要相互校验。新任务/独立终评与可追溯反例有价值；不能据此推出哈希能判语义正确。

### L4 — 第三轮发现安装副本与源码混用

Kimi R3 关于“无环境净化”的源码结论实际来自 `~/.kimi-code/plugins/managed/ultra-builder-pro/`，不是当前 checkout。当前 `host-profile.cjs:93-115` 有 descendantEnvViews，`delegate.cjs:911` 消费，ACP/CLI driver 继续使用 descendantSpawnEnv；仍不代表 D1 验收通过。两份文件长度、SHA 与原始读取路径已记录于 [第三轮 Codex 裁决](./r3-codex-adjudication.zh-CN.md)。安装漂移是观察，不能自动推导它就是原始 Research 体验问题的根因。
