<!-- Subagent research report (public skill collections), saved verbatim 2026-10-31. Model output: [检索] entries are search snippets only. -->

## 公开 agent skill 集合调研（截至 2026-10-31）

**方法与标记**
- 9 个仓库克隆到 `mktemp -d` 目录，只读，未运行任何脚本；读取 README、SKILL.md 与 git 历史。发现阶段用 WebSearch 与 `gh`。
- [读] 打开过文件或提交；[API] 仅 `gh` 元数据；[检索] 仅搜索摘要。
- 文件引用为仓库 `main` 分支下的相对路径。仓库：[MP](https://github.com/mattpocock/skills)、[AO](https://github.com/addyosmani/agent-skills)、[PC](https://github.com/michael-denyer/pstack-claude)、[CP](https://github.com/cursor/plugins/tree/main/pstack)（路径前缀 `pstack/`）、[AN](https://github.com/anthropics/skills)、[OA](https://github.com/openai/skills)、[VA](https://github.com/vercel-labs/agent-skills)、[GO](https://github.com/google/skills)、[MS](https://github.com/microsoft/skills)。

### 1. 清单与分发

| 集合 | SKILL.md | 入口与分层 | 分发 |
|---|---|---|---|
| MP | 38 | `ask-matt` 路由；`engineering/`、beta 的 `in-progress/`、空的 `deprecated/` 分桶 [读] | `npx skills`；Claude、Copilot 插件；Gemini CLI `skills install` [读] |
| AO | 25 | `using-agent-skills` 元技能；9 个 lifecycle 命令；4 个 agents [读] | `npx skills add`；Claude、Cursor、Gemini CLI、Antigravity [读] |
| PC | 67 | `poteto-mode` 路由；24 个 principle；多 harness 端口 [读] | Claude、Codex、Pi、Muse、Copilot 原生 manifest [读] |
| CP | 61 | `poteto-mode` 23 个 playbook；24 个 principle [读] | Cursor 插件；Claude 安装生成的副本 [读] |
| AN | 20 | 未找到路由；19 个独立 skill 目录，另有 `spec/`、`template/` [读] | `/plugin marketplace add anthropics/skills` [读] |
| OA | 44 | 已弃用；`.system` 5 个自动装，`.curated` 39 个按名装 [读] | `$skill-installer`，迁向 openai/plugins [读] |
| VA | 9 | 未找到路由；流程型 `vercel-optimize` 加规则库 [读] | skills.sh 徽章 [读]；`npx skills` 命令 [检索] |
| GO | 183 | 按产品分目录；生成的 `index.json`；`finding-google-skills` 路由 [读] | `npx skills add google/skills` [读] |
| MS | 213 | 按语言分层（Core、Foundry、Python、.NET、TS、Java、Rust）[读] | `npx skills add microsoft/skills` [读]；README 同时写 174 和 175 [读] |

其他：Google 另有 [gemini-skills](https://github.com/google-gemini/gemini-skills)（Gemini API，[API]）与 [jules-skills](https://github.com/google-labs-code/jules-skills)（Jules SDK，[API]）。[AWS 官方集合](https://github.com/aws/agent-toolkit-for-aws)（[检索]）。Cloudflare、HashiCorp、Supabase 有仓库（[API]，未读内容）。OpenAI 现行目录是 [openai/plugins](https://github.com/openai/plugins)（[API]）。已确认 Anthropic、OpenAI、Google、Microsoft、Vercel、AWS、Cursor 有官方集合；其他公司未穷举。

### 2. 工作流、计划、验证、变更、上下文、组合

**MP**
- 意图与路由：`ask-matt` 推荐步骤前要求先读该 SKILL.md。意图靠 `grill-with-docs` 逐题访谈，其正文只有 `Call the Skill tool twice, for "grilling" and "domain-modeling".` [读]
- 计划与完成：`to-spec` 只综合、不访谈；`to-tickets` 写阻塞边；`implement-spec` 把票当 task graph，沿 frontier 并行，落到 integration branch，每票按 tracker 的关闭方式 resolved。无百分比进度 [读]。
- 验证：`tdd` 红绿；1.3.2 起 `diagnosing-bugs` 要求对 forced mutation 做 diff 后才信任 red；`code-review` 由 Standards、Spec 两个子代理出意见 [读 CHANGELOG]。跟踪文件中无 eval 命名文件 [读]。
- 变更：`setup-matt-pocock-skills` 把 tracker、标签、文档路径写进 `docs/agents/`，改动后重跑；`retro` 把机械错误变成确定性检查，只改环境不改代码 [读]。交付后的方向变更未找到专门流程。
- 上下文与组合：阶段边界写在 `PHASE-BOUNDARIES.md`，按需读；"smart zone" 约 150k token 指导 clear 或 compact；子代理用全新窗口而非 fork [读]。用户调用的 skill 不被其他 skill 调用（#880）[读]。

**AO**
- 意图与路由：`using-agent-skills` 用流程图按阶段路由；`interview-me` 一次一问；`spec-driven-development` 先出 capability map，模块 id 稳定，人审门 [读]。
- 计划与完成：`/build auto` 要求 spec 在已知路径、工作区干净、计划一次性审批；之后每任务 TDD 并单独 commit；遇 spec 含糊或无法 `git revert` 撤销的动作即停 [读 `.claude/commands/build.md`]。
- 验证：TDD 先发现项目自己的测试命令；Prove-It 复现 bug；`evals/cases/` 每个 skill 一个 case，共 25 个 [读]。
- 变更与上下文：spec 为真源；交付后变更未找到流程。references 按需加载；单 skill 安装不带 repo 级 references（README，#361）[读]。

**PC 与 CP（pstack）**
- 意图与路由：`poteto-mode` 是唯一入口，先复述目标与问题，再选 playbook，把步骤原样写入 todo 列表 [读 CP]。
- 计划与完成：`check-plan.mjs` 强制每个 PR 单元含 `Verify, unit`、`Verify, live`、`Verify, perf` 与 `Review gate`，规则句为 "Tests alone are not sufficient verification" [读]。
- 验证：`principle-prove-it-works` 要求检查真实产物并保留可复跑输出；`interrogate` 只保留可复跑确认的发现；`no-comments` 对无法核实的依赖规则保留 `HOLD` [读；PC CHANGES 0.9.105、0.9.106]。
- 变更：`Attack the Premise`（两次修复共享前提失败，就先测前提）；`Never Block on the Human`（可逆工作直接做）[读]。
- 上下文与组合：principle 叶子按需读；port 的 SessionStart hook 常驻注入路由指令 [读 PC README]。port 保留"merge 前停在人工点击"，不采纳上游自动 merge [PC CHANGES 0.9.105]。

**AN**：`doc-coauthoring` 先提问、再信息倾倒，末段 Reader Testing 由子代理扮演读者 [读]。`skill-creator` 含评测循环，并建议"可客观验证的 skill 配测试用例" [读]。

**OA**：已弃用。`.curated` 含厂商 skill（cloudflare-deploy、sentry、notion-* 等）。README 提到的 `.experimental/` 目录不存在 [读]。未找到路由或计划机制。

**VA**：`vercel-optimize` 先采集 metrics；`scripts/gate-investigations.mjs` 决定调查哪些路由；只读候选文件；引用只能来自版本化文档库 [读]。其余是规则库，`react-best-practices` 的 `rules/` 有 72 个文件。

**GO**：`finding-google-skills` 运行时取 `index.json`，要求逐字节一致、必须是含 `skills` 数组的 JSON；证书错误视为失败且不重试 [读]。

**MS**：`Agents.md` 首条原则 "Fresh Information First"，先查官方文档、校验 SDK 版本 [读]。README 写 "Loading all skills causes context rot" [读]。`tests/scenarios/`（423 个文件）与 CI `skill-evaluation.yml` 存在，内容未读 [读文件名]。

### 3. 演化（重点）
- **MP**（2026-02 至 10）：04-17 删 prd-to-plan；04-28 加 `setup-matt-pocock-skills`；07-02 "unify planning skills into /to-spec + /to-tickets" 删两个 skill；07-16 删 batch-grill-me；08-05 删 6 个未用 skill；09-24 删 resolving-merge-conflicts；1.3.0 把 implement-spec、pr、retro 升入正式桶，CONTEXT.md 改名为 GLOSSARY.md。方向是从散 skill 收敛为"路由加主线加 on-ramp"。[读 git log；CHANGELOG]
- **AO**（2026-02 至 10）：2 月当月入库 25 个 skill 中的 18 个，首批提交集中在 02-15；之后只加不删，SKILL.md 无删除记录。10 月：#714 "make the lifecycle commands user-invoked only"；`725c328` "treat context capacity as a host heuristic"。月提交量 32 增至 197。
- **PC**（05-26 起）：05-26 初始导入，上游 05-22 已有插件；0.9.95 删 10 个为 effort 参数而生成的 agent，因 Claude Code 2.1.292 已支持该参数；0.9.98 至 0.9.101 修 `CLAUDE_CONFIG_DIR` 路径；0.9.105 同步上游 v0.15.35；0.9.106 加 HOLD。每版都列出未跑通的路径。
- **CP**（05-22 起）：一周内版本从 0.2.0 升到 0.6.0；10-18 "drop the rewritten-prompt ban from sharpen"，10-19 "restore /sharpen to the original prompt"，即回滚；10-26 statechart 编译器替换脚本；10-27 `c742dd6` "make Orchestrate agentic and delete the orch scripts"（0.15.36）。协调改由 agent 执行，验证门仍是脚本。
- **AN**（2025-10 起）：12-01 示例移入 `skills/`；12-16 与 12-20 规范拆分并指向 agentskills.io；2026 年提交以 claude-api 为主，随 Opus 4.8、Sonnet 5、Opus 5、Fable 5、Haiku 5.5 更新。
- **OA**（2025-11 起）：12 月大量加入厂商 curated；2026-02-07 "Remove experimental skills except wrapped (#126)"；4 月删 Sora、前端与网页游戏、表格与幻灯片；06-22 "Deprecate skills repository (#496)"，"Move users towards Plugins directory"。
- **VA**（2025-12 起）：01-04 CLAUDE.md 改名为 AGENTS.md，理由是 "for universal agent compatibility"；01-06 与 01-14 迁出并改名 design guidelines；08 月 view-transition 技能多次 Consolidate、Split、Restore。
- **GO**（2026-04 起）：月提交从 28 增至 114；47 个提交标题为 "No public description"，推断为导出同步，未证实。
- **MS**（2026-01 起）：1 月 145、2 月 236 个提交，建骨架；10 月近期提交多为 `sync/copilot-for-azure-*` 分支的自动同步 PR。

### 4. 值得借鉴（3 项）
1. **计划门，而非计划提示**（CP `check-plan.mjs`）：计划单元缺少验证框就不执行。
2. **信号门，而非全库扫描**（VA `vercel-optimize`）：指标决定调查范围，读文件只限候选的 import 链。适合 1→100 的运维阶段。
3. **调用性硬分层加每仓库适配器**（MP）：`disable-model-invocation` 与 `setup-matt-pocock-skills` 把 tracker、标签、文档路径写进仓库，而不是写死在 skill 中。与 Ultra 的 explicit-only、grant 门控同构。

备选：AO `/build auto` 的停止条件；PC 的 HOLD（无法核实则保留，不删除）。

### 5. 弱点
- MP：无 eval；CHANGELOG 记录跨 skill 的 prose 引用"不会可靠地加载"（#878）。
- AO：表面积大（25 个 skill、9 个命令、4 个 agents）；单 skill 安装丢失共享 references。
- PC 与 CP：为多个 harness 维护 substitution 规则与 sync，冲突需手工解决；触发清单常驻上下文。
- AN：README 写明"仅供演示与教育"；维护重心偏向 claude-api。
- OA：已弃用，目录迁移中。VA：只有一个流程型 skill。
- GO：SKILL.md 写 "about 75 KB"，实际 `index.json` 为 121,512 字节，文档漂移。
- MS：README 自称 Work in Progress；174、175、213 三个数字不一致，差额未核对。

### 6. 跨集合综合
- **共同约定**：SKILL.md 加 YAML frontmatter 是可移植单元；`npx skills add` 是事实分发方式（MP、AO、GO、MS、VA）；AGENTS.md 作为跨 harness 指导（MP、AO、VA、MS）；`disable-model-invocation` 标记用户调用（MP、CP，AO 的命令同）；references 按需加载；阶段为 spec、plan、tasks、implement、review、ship。
- **独特做法**：MP 的 task graph、frontier 与 integration branch；PC 的 HOLD；CP 的计划门与 rerun 确认的发现；AO 的单检查点自动执行；VA 的信号门；MS 的 context rot 警告与 CI 评测；GO 的运行时 catalog 与逐字节校验；AN 的 Reader Testing。
- **进度可见性**：CP 把步骤写入 todo；MP 用 frontier 表示可领取的票；AO 以 plan 为分母。未找到统一的进度文件格式。
- **没人解决**：(a) 交付后方向变更的显式流程，最接近的是 PC 的 Attack the Premise；(b) skill 效果的可比评测，AO 与 MS 有 eval，MP 没有，也没有跨集合基准；(c) 从 0→1 到 1→100 的状态衔接，状态分散在 tracker、markdown、store 或仓库文件中；(d) 跨 harness 等价性的可验证证明。
- **对 Ultra 的判断**（基于 CLAUDE.md，未读其 skill 正文）：Ultra 的门控与 MP、CP 同向。最值得补的是执行前的计划结构门、自动执行的停止条件，以及交付后的变更路径。后者无人解决，是机会。

### 限制
- 未运行任何仓库脚本。MP 未读 tdd 与 implement 全文；PC 的 SKILL 正文以上游 CP 代替；MS 的 `tests/harness` 只看了文件名；Gemini、Jules、AWS、Cloudflare 等仅有 API 元数据或搜索摘要。
- 克隆位于 `/var/folders/cm/zpwxmr512rq1qz4_0_ryz8t80000gn/T/` 下的 `tmp.*` 目录，可删除。
