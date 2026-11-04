<!-- Subagent research report (multi-agent orchestration), saved verbatim 2026-10-31. Model output: claims marked [摘要] are unverified search snippets. -->

# 多智能体与图编排用于软件工程：证据与模式

范围：Cursor、Claude Code、Codex/OpenAI、Cognition、Anthropic、LangGraph 为主；社区项目只看编排模式。[直读] 表示取回了正文（个别长页只读到主要章节）；[摘要] 表示只看到搜索摘要，未打开原页。方括号数字指向文末来源。

## 结论

1. 并行只在可分解、以读为主、完成标准可机器验证的工作上划算（综合判断）；顺序或同文件任务上，多代理普遍变差 [1][2]。你们 ~10 次小样本的结果与此一致，但分不清"慢"和"贵"各来自哪里。
2. 写入保持单写者，并行的是探索、审查和测试 [3]。
3. Cursor 最终保留的是"规划者不写代码、worker 单任务交接"，删掉的是 judge、integrator，以及兼任全部职责的单一 executor [4]。独立验证的收益来自 Cognition 与 Google 的数据 [3][7]。
4. 没有稳定证据表明"跨厂商评审必然多抓缺陷"：唯一受控实验中，同一对模型的两个方向效果相反 [5]。
5. 成本上，Anthropic 报告多代理约为聊天的 15 倍 token [6]。

## 1. 何时胜过单代理

- Anthropic 内部研究评测中，Opus 4 主代理加 Sonnet 4 子代理比单个 Opus 4 高 90.2%；token 用量解释了 BrowseComp 方差的 80%。作者也写明，编码任务"可并行的部分比研究少" [6]。[直读]
- 260 配置、6 个基准的实验：可分解的财务推理 +80.8%，顺序规划 −70.0%，"架构与任务对齐决定成败" [1]。[直读] 正文称规划任务上所有多代理变体降 39–70%，单代理准确率超约 45% 后协调收益转负 [7]。[摘要]
- Cursor 报告峰值约 1,000 commits/小时、1,000 万次工具调用，但没有同成本单代理基线 [4]。[直读] Cognition 指出这类演示都有"简单、可验证的成功标准"，多数真实软件没有 [3]。[直读]

## 2. 分解、并行与合并

- 扁平协同加锁失败：20 个 agent 的有效吞吐降到约 1–3 个。乐观并发"降低了开销，但没有消除混乱" [8][4]。[直读] Cursor 称数百个 worker 推同一分支"冲突很少"，未给冲突率 [8]。
- 依赖图加人工派发：吞吐上升，结果"没有好多少"，因为 agent 之间既不沟通，也得不到全局反馈 [4]。[直读] 对"工作图"而言，图本身不够，还需要交接和合并协议。
- 合并门（gstack /captain）：lane 只产出未盖章的 READY；controller 组成 train，对 train head 跑一次完整 gate，按 slot 盖章并以 expected head 合并，红了就 bisect [10]。[直读] 盖章提交若含额外改动会冻结队列 [11]。[摘要] controller 也是合并单点，而 Cursor 正因单点闸门成为瓶颈才删去 integrator [4]。gstack 未公布吞吐，无法判断是否重演。
- Codex 文档警告，并行改代码会带来冲突和协调开销 [12]。[直读] Claude Code 的 agent teams 不把 teammate 隔离到 worktree，需按文件分工 [9]。[直读]

## 3. 角色：保留与删除

- 保留：规划者不写代码，子规划者递归拥有子范围，worker 只完成一项任务并交 handoff [4]。[直读] 有中心验证的编排器把错误放大压到 4.4×，独立多代理为 17.2× [7]。[摘要] superpowers 的做法是每任务新 implementer，加规格和质量两道评审，再加全分支评审 [13]。[直读]
- 删除：judge 循环（Cursor 认为 agent 大体能把指令执行到底，于是删去）；integrator（"所有工作都要经过的一道闸门"成为瓶颈）；兼任规划、派发、评审、编辑、合并和判断完成的 executor，它出现了过早宣告完成、不合并等病态行为 [4]。[直读]

## 4. 异步、恢复与失败

- LangGraph 在每个 super-step 保存 checkpoint，以 thread_id 为键；节点失败时，同一 super-step 中已成功节点的写入被保留，恢复时不重跑 [14]。[直读] 官方文档注明 async 持久化模式在进程崩溃时可能漏写 checkpoint [14]。（持久化模式条目经 WebFetch 摘录）
- Anthropic 写道 agent 有状态、错误会叠加，因此要能从出错处恢复；同步执行是瓶颈，异步会带来结果协调、状态一致性和错误传播问题 [6]。[直读] Cursor 承认规划者"应在任务完成时被唤醒"，但尚未做到 [8]。[直读]
- Claude Code：subagent 被打断会重启该轮，teammate 继续运行，workflow 可在会话内恢复 [15]。[直读] agent teams 在 `-p` 和 Agent SDK 的非交互模式下不派生 teammate [2]。[直读] 对无人值守的工厂，这是硬约束；SDK 的 Workflow 工具在 v0.3.149 及以上可用 [16]。[摘要]
- OpenAI Agents API（2026-09-10，public beta）提供长会话自动压缩和子代理并发 [17]。[直读] Codex cloud 每个任务有独立工作区，电脑睡眠时仍可运行 [18]。[直读] Cursor 云代理在隔离 VM 中运行，不需要本机在线 [30]。[直读]

## 5. 跨厂商评审

- 唯一受控实验（arXiv 2607.21656，备注为 KDD'26 Agentic SE 研讨会录用；116 个 LiveCodeBench 任务；评审者不能运行测试）：Claude 评审 Codex 草稿，通过率 71.6%→89.7%；Codex 评审 Claude 草稿，91.4%→82.8%；Claude 自评不变 [5]。[摘要] 作者结论是配对"不对称"。局限：单一基准、静态评审、两个模型版本。
- LLM 评审会偏爱自己的输出 [19]。[摘要] Cognition 报告，同模型但上下文干净的评审效果更好，对其自家 Devin 写的 PR 平均抓到约 2 个 bug，其中约 58% 为严重问题；这是内部数据，无对照 [3]。[直读] Cursor 的 pstack 规定验证者须用不同模型家族，这是实践规则，不是实验证据 [23][27]。[直读/摘要]
- 从业者报告都是自述：一位作者约 160 次 Codex 交叉检查，作为安全复审时"大体同意"Claude，8 次中有 2 次发现审计者漏掉的问题 [20]。[摘要] 一篇 LinkedIn 帖称"快 35%"，未给可核查的原始数据，已排除 [21]。[摘要]

## 6. 成本与上下文

- Anthropic：agent 约为聊天的 4 倍 token，多代理约 15 倍 [6]。[直读] Codex 文档写明子代理消耗更多 token [12]。[直读]
- 子代理在独立窗口中探索，只把摘要返回主会话，这是主要的上下文收益；其请求计入同一用量上限 [22]。[直读] Google 数据中，集中式协调的开销约 285% [7]。[摘要]
- 未找到厂商公布的同成本单代理对照数字。

## 7. 综合：何时并行划算；反模式

- 划算的条件（综合判断，越多越好）：单元可独立分解；工作以读、搜、审为主，写入单点化；单个上下文或工具面装不下；单代理基线不高；有合并门和失败恢复；任务价值能覆盖 token 倍数 [6][1][7]。
- 反模式：扁平协同加共享锁文件 [8]；多个 agent 并发写同一分支且不校验 head [12]；非结构化 swarm，即任意 agent 网络互相协商，Cognition 认为"大多是干扰" [3]；一个 agent 兼任规划与合并；阻塞式批次，每批代价等于最慢的子任务 [23]；上游上下文不随 brief 传递，worker 只能猜 [6][23]；小而顺序的任务派多代理 [1][2]；只数发现的问题，不数评审引入的回归 [5]。

## 8. 我的判断与建议

1. 你们的"慢而不省钱"可能来自四处：协调等待、上下文重建、评审返工、合并冲突。先按 unit 记录这四项、wall-clock 和 token，再定并行度；否则 10 次小样本无法定位收益缺口。
2. 把图的节点设为单写者单元的 DAG，并行只放在读、审、测试节点上。合并走 expected-head 校验的门 [10][24]。Cursor 接受稳定的小错误率，但要定期快照并做修复 pass 形成绿色分支 [4]，这条可直接写进你们的验收策略。
3. 把跨厂商评审当作待测假设。在你们自己的 8–12 个可测 unit 上做三臂实验：A 单代理端到端；B 单写者加并行只读探索和测试；C 为 B 加异厂商评审。指标包括返工后可合并率、wall-clock、每个合并单元的成本，以及合并后逃逸的缺陷，且评审引入的回归要计入。先写停止条件。A 对 B 测并行价值，B 对 C 测评审价值。两家的规则文件要同源生成，否则评审标准会漂移 [24]。
4. 无人值守时避开 agent teams，改用 workflow 脚本或 SDK 会话 [2][15][16]。这是基于文档约束的推断，未经实测。

## 未找到与未验证

- 没有独立、有对照组的多代理软件工程基准。gstack、pstack、oh-my-opencode、superpowers、Ruflo 未见独立吞吐或质量数据；Ruflo 的共识机制等属于 README 声明 [10][13][25][26][27][28]。[摘要为主]
- Google 论文 v1 写 180 个配置，v3 写 260 个；MAST 的各类失败百分比也因版本而异（FM-1.5 在 v2 为 9.82%，较新版本为 12.4%）。本报告只引用定性结论 [1][29]。
- Cognition 的跨前沿模型 smart-friend 只有定性描述，没有数字 [3]。

## 更正此前摘要中的说法

- Anthropic 原文是 "about 15×"，不是 "up to" [6]。
- Codex 子代理默认启用，但仅在被直接要求或 AGENTS.md/skill 指令要求时派生 [12]。
- Cognition 2026 原文并未把子代理描述为 "stateless workers"，那是 X 帖的二手概括；原文结构是单写者，加上提供智能的其他 agent [3]。
- Agents API 是 public beta，不是 GA [17]。

## 来源

[1] https://arxiv.org/abs/2512.08296 （v3 摘要）[直读]
[2] https://code.claude.com/docs/en/agent-teams [直读]
[3] https://cognition.com/blog/multi-agents-working （2026-04-22）[直读]
[4] https://cursor.com/blog/self-driving-codebases （2026-02-05）[直读]
[5] https://arxiv.org/abs/2607.21656 [摘要]
[6] https://www.anthropic.com/engineering/built-multi-agent-research-system （2025-06-13）[直读]
[7] https://arxiv.org/html/2512.08296v2 [摘要]
[8] https://cursor.com/blog/scaling-agents （2026-01-14）[直读]
[9] https://code.claude.com/docs/en/agents [直读]
[10] https://raw.githubusercontent.com/garrytan/gstack/master/docs/captain.md [直读]
[11] https://raw.githubusercontent.com/garrytan/gstack/master/docs/recommended-harness.md [摘要]
[12] https://developers.openai.com/codex/subagents [直读]
[13] https://github.com/obra/superpowers/blob/HEAD/skills/subagent-driven-development/SKILL.md [直读]
[14] https://docs.langchain.com/oss/python/langgraph/checkpointers [直读；持久化模式经 WebFetch 摘录]
[15] https://code.claude.com/docs/en/workflows [直读]
[16] https://code.claude.com/docs/en/agent-sdk/subagents [摘要]
[17] https://openai.com/index/introducing-the-agents-api/ （2026-09-10）[直读]
[18] https://developers.openai.com/codex/cloud [直读]
[19] https://arxiv.org/abs/2404.13076 [摘要]
[20] https://khamsouk.souvanlasy.com/insights/codex-cross-model-review/ [摘要]
[21] https://www.linkedin.com/posts/rakesh-maheswaran_aigovernance-multiagent-llm-activity-7499450811173748737-GEol [摘要，已排除]
[22] https://code.claude.com/docs/en/sub-agents [直读]
[23] https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/orchestrate.md [直读]
[24] https://dev.to/iliyaoblakov/what-is-in-my-two-engines-kit-for-claude-code-and-codex-and-the-numbers-behind-each-part-kk5 [摘要]
[25] https://github.com/code-yeongyu/oh-my-opencode/blob/1c7eb55f/docs/guide/orchestration.md [摘要]
[26] https://github.com/ruvnet/ruflo [摘要]
[27] https://github.com/cursor/plugins/blob/main/pstack/skills/arena/SKILL.md [摘要]
[28] https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/swarm/SKILL.md [直读]
[29] https://arxiv.org/abs/2503.13657 （v3 摘要；百分比见 v2 HTML 摘要）[直读]
[30] https://cursor.com/docs/cloud-agent [直读]
