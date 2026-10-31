<!-- Subagent research report (spec-driven workflows and change handling), saved verbatim 2026-10-31. Model output: 摘要/片段 entries are not byte-checked. -->

调研报告：spec-driven 与规划类工作流（截至 2026-10-31，只读，未修改任何文件）

标记：直读 = gh api 原文、发布说明或仓库页；摘要 = WebFetch 小模型抽取，引号不保证逐字；片段 = 仅搜索摘要，未打开。

## 结论
- 我读到的材料中没有可验证的 spec、代码、测试自动同步。Kiro 称 specs "stay synced"，但其描述的机制是请求或手动更新 [16]。Tessl 的生成机制只见于注册表页描述 [26]。
- 演进以删减和合并为主，且常附原因 [1][19][23]。Spec Kit 2026 年则以新增原语为主 [7]。
- 与你们的失败最相关的三条：派生计数会静默出错 [1]；"找不到即通过"会造成假阳性 [13]；analyze 在相关行未载入时报告 clean（issue 作者观察）[8]。

## 逐项
**GSD**（旧仓迁至 open-gsd/gsd-core；"GSD 2" 迁至 gsd-pi）
- 源与进度：ROADMAP、CONTEXT.md 决策、PLAN.md 验收、REQ-ID；STATE.md 的 progress.* 由 plan 文件数派生 [2][1]。
- 改向与一致：discuss 记录决策；verifier 检查 REQ 与决策覆盖并生成修复计划；是否运行测试未说明 [2]。
- 演进：删除"过度工程"的代码智能子系统（1.9.2）与已漂移的 13 份 prompt 副本（1.38.4）[1]。gsd-core 最早发布为 v1.0.0（2026-05-22），旧仓最后为 v1.43.0-rc2，迁移原因未找到 [4][1]。GSD Pi 是独立终端 agent [3]。
- 失败：派生计数曾静默回退（1.42.1）；worktree 中的 git clean 曾可能误删前一波产出，后加禁令（1.35.0）[1]。

**Spec Kit**（v1.2.5）
- 源与进度：spec、plan、tasks 与 constitution；tasks.md 为 `- [ ] T001` 复选框；文档未描述 N/M 显示 [5][6]。
- 改向与一致：analyze 只读；converge 为评估式，只能追加 tasks.md，不重写意图；核心无自动调和命令；棕地为三条路径之一 [5][7]。
- 演进：文档称"三种持久化模型，都不是默认"（PR #4945，v1.2.0）[7]。1.0.0 说明称破坏性变更的适配已是 "it is a sentence" [8]。Fowler 2025-10 当时称其为 "spec-first only" [9]。
- 失败：#620（open）中逐功能 spec 累积后过期；#4164（open）指出 grep 式对齐会漏掉活需求 [8]。

**OpenSpec**（最新 v1.16.0）
- 源与进度：openspec/specs 为当前行为，changes 装提案与 delta；status 为 artifact 级（文档示例 "2/4 artifacts complete"）；validate --archived 检查 tasks.md 复选框是否全勾。这查的是勾选，不是运行结果（推断）[10]。
- 改向与一致：任意 artifact 可随时编辑，无审批门；archive 合并 delta；verify "without blocking anything" [11]。
- 演进：1.0.0 以动作式图替换"刚性的 proposal → apply → archive"[12]；1.11.0 要求 explore 写文件前明确同意 [12]；1.14.2 在基线无法恢复时把 REMOVED 判为"未验证"而非通过 [13]。
- 失败：MODIFIED 必须重述整段需求，评审噪声大 [12]；README 与 config 重复导致不同步（#800，open）[14]。

**Kiro**
- 源与进度：requirements（EARS）、design、tasks，任务链接需求；未见任务状态标记 [15][16]。
- 改向与同步：靠请求或手动更新来刷新 tasks；hooks 可在保存时更新测试，未见 spec 示例 [16][17]。未见审批门；版本史未查。

**BMAD**（v6.12.x；v7 预览）
- 角色与进度：Sofia（PO）拆分与追踪；tickets.toml 中的稳定 id；build 结束为 built，done 由人或编排器决定 [18]。
- 改向：需求变化时先改需求并保持 id，标记过期项，重切分，记 Decision 行；已建成的不重写 [18]。
- 演进：v6.11.0 删除 bmad-shard-doc 与 bmad-index-docs（"Retired with no replacement"），核心缩为 8 个 skill [19]。README 写 v7 ETA 为 2026-10-16，但最新发布 v6.12.4（2026-10-14）之后未见 v7 标签 [20]。
- 失败：文件名 glob 漏检 SPEC.md 与 DESIGN.md，后改为按内容识别 [19]。

**Superpowers**（最新 v7.0.x）
- 源与进度：spec 为 "binding authority"，plan 为其论证；步骤为先红后绿，完成写入 ledger；未见 N/M [21][22]。
- 改向：代理自行裁决并记为 `Ruling: … — … — what it costs if wrong`，仅四类情形停下 [22]。
- 一致：每个 plan 复制 Global Constraints；结束时做整分支评审 [21][22]。
- 演进：v6.0.0 把两个 reviewer 合为一个并删除全局 worktree 目录；v7.0.0 重写 brainstorming，以 builder check 取代 spec 审查员 [23]。
- 失败：双 reviewer 曾 "expensive and easy to game"（作者自报 eval）；一次会话 "never asked about platform, and built a web app" [23]。

**Compound Engineering**（最新 v3.34.0）
- brainstorm → plan → work → review → compound；一份 plan 同时管 scope、决策、单元与测试；host 保留验证与提交；Compound Packs 规则在规划时引用、评审时执行 [24]。进度展示未找到。
- 演进：36 个 skill；破坏性更名为 ce- 前缀；移除 coding-tutor [25]。

**Tessl**（摘要）：注册表页称 4.0.0，"built on OpenSpec"；生成文件带 "# GENERATED FROM SPEC"；spec-verify 为四项机械检查（进 CI）加一项语义漂移审查；缺 [@test] 即未完成 [26]。页面未标 beta，第三方 beta 说法仅见片段，未核实。

**Taskmaster**：0.30.1 至 0.43.1（2026-03-31），最后 push 2026-04-28；0.37.0 起接入托管的 Hamster brief；未见 spec 与代码同步 [27]。

## 跨项目 Q1–Q6
1. 真相来源：持久 spec、每单元 plan 或 ticket、决策记录三者并存；链接主要靠名称或 ID 搜索，未见确定性追踪 [11][12][18]。
2. 进度分母：取自清单（tasks.md、tickets.toml、plan 步骤）；converge 追加任务会改变分母；只有 OpenSpec 给出 artifact 级 N/M [5][10]。
3. 改方向与审批：人改文件或请求 agent 改，随后重切分或追加；未见自动失效级联。Spec Kit 每步人工复核 [5]；BMAD 人审 breakdown [18]；Superpowers 只在"go"之前和四类情形中介入 [22]；OpenSpec 无审批门 [11]。
4. 防熵：机械门（OpenSpec validate；GSD 的 drift-guard 测试仅见 issue 标题，片段 [1]）加语义审查（verify、analyze）加删减与合并。没有可验证的架构约束证据。
5. 演进与失败：高频失败是"自报完成"和"派生状态不准"。

## 收敛的做法（8 项）
1. 优先级明确：spec > plan > task，全局约束复制进每个单元 [21][22]。
2. 决策落盘：CONTEXT.md、ledger 的 Ruling、带日期的 Decision 行 [2][22][18]。
3. 构建者与验证者分离，验证输出为 verdict [2][22][5]。
4. 稳定 ID 链：requirement → task → test [2][18][6][26]。
5. 仪式随规模缩放，小改动直接做 [18][10]。
6. 机械门优先，语义审查兜底 [26][10]。
7. 归档或合并进活文档以防累积（OpenSpec archive [10]；Spec Kit 的 flow-forward 以重复为代价 [7]）。
8. 每单元在隔离 worktree 或文件夹中执行，并防误删 [1][22]。

**试过后放弃**：重复的 prompt 副本、时间估算与定时错峰派发（GSD 1.38.4、1.36.0、1.32.0）；代码智能子系统（GSD 1.9.2）；文档分片（BMAD 6.11.0）；每 task 两个 reviewer 与独立 spec 审查员（Superpowers 6.0.0、7.0.0）；刚性的 propose → apply → archive（OpenSpec 1.0.0）；无同意的 explore 写入（OpenSpec 1.11.0）；文件名 glob 发现（BMAD 6.11.0）。

**未收敛**：审批门（OpenSpec 无，Spec Kit 每步，Superpowers 执行中无）；自动 spec↔code 同步（未见）；N/M 显示（仅 OpenSpec 为 artifact 级）。

## 批评与实践者报告
- Böckeler 2025-10（摘要）："Kiro also was way too verbose for the small bug"；"I'd rather review code than all these markdown files" [9]。截至搜索，未找到 2026 年的后续文章。
- DevOpsKev（单人笔记，直读）：plan 被"隐式批准"后，agent 直接在规划期实现；结论 "The spec is the artifact." [28]。
- 搜索得到的泛化综述（"spec rot" 等，仅片段）未采信为证据。

## 对你们五个已知失败的映射（Claude 判断，非调研结论）
- 局部完美、全局坏：借鉴 Superpowers 的全局约束复制与整分支终审，不要只做单 task 审查。
- 任务完成靠模型声明：复选框不是完成门；完成判据应是命令与测试的真实输出。
- 无 N/M：分母取自 ID 清单，计数从权威状态派生并加测试（吸取 GSD 1.42.1 的教训）。
- 风险：Superpowers 的自主裁决换来速度，错误裁决的成本由人事后承担；需先定义哪些决策可以自裁。

**限制**：Kiro、Tessl、Böckeler 只读到摘要，引号需回原文核对；未核实 Kiro 版本史与审批门、CE 与 Taskmaster 的进度展示；GSD 迁移原因未找到（#3897 为社区抱怨，无维护者回应）。

## 来源（直读，除非标注）
[1] GSD 仓库、CHANGELOG 与 issue 标题 https://github.com/gsd-build/get-shit-done ；https://github.com/gsd-build/get-shit-done/blob/main/CHANGELOG.md ；https://github.com/gsd-build/get-shit-done/issues/3897 ；https://github.com/gsd-build/get-shit-done/issues/2907 ；https://github.com/gsd-build/get-shit-done/issues/3373（后两者仅标题，片段）
[2] GSD Core 阶段循环 https://github.com/open-gsd/gsd-core/blob/main/docs/explanation/the-phase-loop.md
[3] GSD Pi https://github.com/open-gsd/gsd-pi
[4] GSD Core 发布列表与 1.7.0 说明 https://github.com/open-gsd/gsd-core/releases ；https://github.com/open-gsd/gsd-core/blob/main/docs/whats-new-1.7.0.md
[5] Spec Kit 命令参考与 README https://github.com/github/spec-kit/blob/main/docs/reference/agentic-sdd.md ；https://github.com/github/spec-kit
[6] Spec Kit tasks 模板 https://github.com/github/spec-kit/blob/main/templates/tasks-template.md
[7] Spec Kit 持久化模型、history、PR #4945、v1.2.0 说明 https://github.com/github/spec-kit/blob/main/docs/concepts/spec-persistence.md ；https://github.com/github/spec-kit/blob/main/docs/history.md ；https://github.com/github/spec-kit/pull/4945 ；https://github.com/github/spec-kit/releases/tag/v1.2.0
[8] Spec Kit 1.0.0、发布列表、issues #620 与 #4164 https://github.com/github/spec-kit/releases/tag/v1.0.0 ；https://github.com/github/spec-kit/releases ；https://github.com/github/spec-kit/issues/620 ；https://github.com/github/spec-kit/issues/4164
[9] Böckeler 文章（摘要）https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html
[10] OpenSpec CLI 与概念 https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md ；https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md
[11] OpenSpec 编辑文档 https://github.com/Fission-AI/OpenSpec/blob/main/docs/editing-changes.md
[12] OpenSpec 1.0.0 与 1.11.0 说明 https://github.com/Fission-AI/OpenSpec/releases/tag/v1.0.0 ；https://github.com/Fission-AI/OpenSpec/releases/tag/v1.11.0
[13] OpenSpec CHANGELOG 与发布列表 https://github.com/Fission-AI/OpenSpec/blob/main/CHANGELOG.md ；https://github.com/Fission-AI/OpenSpec/releases
[14] OpenSpec #800 https://github.com/Fission-AI/OpenSpec/issues/800
[15] Kiro 规格文档（摘要）https://kiro.dev/docs/specs/feature-specs/
[16] Kiro 发布博客（摘要）https://kiro.dev/blog/introducing-kiro/
[17] Kiro hooks 文档（摘要）https://kiro.dev/docs/hooks/
[18] BMAD 故事追踪文档 https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/plan/break-work-into-stories-and-track-it.md
[19] BMAD CHANGELOG https://github.com/bmad-code-org/BMAD-METHOD/blob/main/CHANGELOG.md
[20] BMAD README 与发布列表 https://github.com/bmad-code-org/BMAD-METHOD ；https://github.com/bmad-code-org/BMAD-METHOD/releases
[21] Superpowers writing-plans https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md
[22] Superpowers 子代理驱动开发 https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md
[23] Superpowers 发布说明 https://github.com/obra/superpowers/releases/tag/v6.0.0 ；https://github.com/obra/superpowers/releases/tag/v7.0.0 ；https://github.com/obra/superpowers/releases
[24] Compound Engineering README 与 ce-work 指南 https://github.com/EveryInc/compound-engineering-plugin ；https://github.com/EveryInc/compound-engineering-plugin/blob/main/docs/guides/ce-work.md ；https://github.com/EveryInc/compound-engineering-plugin/releases
[25] Compound Engineering CHANGELOG https://github.com/EveryInc/compound-engineering-plugin/blob/main/CHANGELOG.md
[26] Tessl 注册表页（摘要）https://tessl.io/registry/spec-driven-development/spec-as-source
[27] Taskmaster CHANGELOG 与仓库元数据 https://github.com/eyaltoledano/claude-task-master/blob/main/CHANGELOG.md
[28] DevOpsKev 实践笔记 https://github.com/DevOpsKev/spec-driven-development-book/blob/main/notes/2026-02-19-lessons-learned.md
