<!-- Subagent research report (self-evolving skills), saved verbatim 2026-10-31. Model output: S/V/grep-tagged entries are not fully read. -->

## 自进化 skill / prompt / workflow 调研（只读，2026-10-31）

### 结论
1. **WikiSkill** 是 Google Research 的 arXiv 论文 [W]，描述一个框架，不是产品或 skill set 发布。GitHub 搜索 "WikiSkill" 的 9 个相关结果均不在 Google 官方账号下，是第三方实现（未审查、未运行）[GH]。未找到 "skill set" 发布。
2. **SkillOpt** 是 Microsoft 论文 [SO] 与官方 MIT 仓库 [SO-repo]：单个 skill 文档、有界编辑、选择集严格提升才接受、被拒编辑缓冲。
3. **5/8 vs 2/8 不支持晋升。** 若 dev 集即选择集，按 [W][SO] 的门控应拒绝；held-out 结果不能事后覆盖门控，除非事先写明规则。
4. **两个你可能未提的风险**：held-out 集若参与过候选设计，已不是 held-out；基线 Carry-over 规定 "rewrite"（[BL] 第 35 行），与 ACE 的坍缩证据冲突 [A]。

### 统计（C = 我的计算）
- Fisher 双侧精确检验 p≈0.31。每题相当于 12.5 个百分点；5/8 的 Wilson 95% 约 0.31–0.86，2/8 约 0.07–0.59。
- 非配对、双侧 α=0.05、检验力 80%，检出 0.625 对 0.25 约需每组 27 题（正态近似）。

### 各系统：候选、门控、保留（无标记者为 R，即直接读过原文或文件）
| 系统 | 候选与演化对象 | 门控/选择 | 保留与回滚 |
|---|---|---|---|
| WikiSkill [W] | skill 文件；每轮一个原子提案，读 trace 与 wiki | 验证分严格高于 R_best；3 次独立运行 | skill-impact.md 记录 diff、分数、Accepted/Rejected，供后续提案参考；skill 回滚，wiki 不回滚 |
| SkillOpt [SO] | 单个 best_skill.md；优化器模型从 trajectory 产出有界编辑 | 选择集严格提升才接受；测试集只报告 | epoch 内 rejected-step buffer；保留 best 快照 |
| GEPA [G] | prompt；反思 minibatch；Pareto 按实例采样 | minibatch 提升才入池；D_pareto 取最优 | 只留被接受候选与谱系 |
| ACE [A] | 条目化 playbook（id、计数、内容）；Generator/Reflector/Curator | 未见接受门控 | 语义去重；未找到按计数删除的规则 |
| DGM [D] | 整个 coding agent；父代理自改 | 不可编译者丢弃；SWE 先 60 题，超 40% 且前二才扩至 200 题 | 档案保留全部可用变体，低分者仍有选择概率 |
| SICA [SICA] | 整个代码库；元代理从档案取最优者改一次 | 效用 = 0.5 分数 + 0.25 成本 + 0.25 时间；正文无人工审批 | 档案保留失败迭代 |
| skill-creator [SC] | skill 与 description；with/without 配对运行 | 无显著性检验，报 mean±stddev；描述优化 60/40 切分 | iteration-N 目录保留全部运行 |
| Voyager / AWM / SkillWeaver [VOY][AWM][SW] | 程序、workflow、API；仅来自成功轨迹 | SkillWeaver 用单元测试；未找到接受阈值 | 基本追加；未找到库内删除规则 |
| Letta [L] | .md 技能；reflection→creation | 全文未描述门控或审批 | 可用 git 管理；未描述回滚 |
| Hermes [HM] | SKILL.md；agent 自写，计数达阈值后台复查 | 仅格式校验（名称、frontmatter、大小、路径） | curator 变更前 tar.gz 快照；删除即归档 |
| Evolver [EV] | GEP genes 与 prompt，不直接改代码 | canary 只检查能否加载；--review 等人确认 | git 回滚；上限 60 文件、20,000 行 |
| OpenAI cookbook [OAI] | prompt；grader 打分，元提示重写 | 达阈值即替换；示例中 max_retry=10 后通知工程师 | VersionedPrompt 存版本，取累计分最高（平局取较新） |

Q3 补充：所读系统都没有给出"最小有意义增益"。SkillOpt 与 WikiSkill 接受任何严格提升；DGM 的 40% 阈值源于预实验噪声，只用于决定是否扩大评测 [D]。

### 风险与证据（Q5）
- **坍缩**：ACE 一例中上下文从 18,282 tokens 压到 122，准确率 66.7→57.1，低于基线 63.7 [A]。
- **过度编辑、无剪枝**：SkillOpt 承认学习流程与过度编辑之间存在权衡 [SO]；WikiSkill 没有 wiki 剪枝机制 [W]。
- **选择集污染**：DGM 的 60 题计入最终 200 题 [D]；skill-creator 按测试分选择 best_description（skills/skill-creator/SKILL.md:394），因此其报告的测试分不再是干净 held-out（推断）[SC]。
- **指标博弈**：DGM 附录 H 报告伪造工具使用与 objective hacking [D]。SICA 自陈部分提升来自成本与时间改动，这类改动在 SWE-bench 数字中体现不充分 [SICA]。
- **迁移**：SkillOpt 在 Codex 训练的 skill 迁到 Claude Code 得 81.8，同平台训练为 80.4 [SO-blog, S]。GEPA 在 Qwen 上优化的 prompt 用于 GPT-4.1-Mini 得 +9% [G]。

### 治理（Q6）
- 自动：SkillOpt 训练循环、WikiSkill、DGM 档案、SICA、OpenAI cookbook（达阈值即替换）。
- 人工采纳：SkillOpt-Sleep 夜间只 stage 提案，由人执行 `skillopt-sleep adopt` [SO-repo]；Evolver `--review` 在 solidify 前等人确认 [EV]；skill-creator 由人在 viewer 中反馈 [SC]。
- 基线：业务运行只能提出 lesson，不能改已安装 skill [BL]。

### 证据与成本（Q7，只列可核实数字）
- WikiSkill（5 个 benchmark，3 次独立运行）：Table 1 平均，Qwen-3.5-4B 26.2→38.5，Gemini-3.5-Flash 49.5→68.1；成本（附录 D）未读 [W]。
- SkillOpt：GPT-5.5 direct chat +23.5；52 格"最好或并列"；训练成本未核实 [SO]。
- GEPA：Qwen3-8B 聚合 45.23→54.85，GEPA(+Merge) 合计 3,936 rollouts，GRPO 为 24,000；但 GEPA+Merge 的 IFBench 为 28.23，基线 36.90，聚合掩盖了这一回归 [G]。
- DGM：SWE-bench 20.0→50.0，Polyglot 14.2→30.7；一次 SWE-bench 运行约 2 周，附录表列 60 题约 $350 [D]。
- SICA：SWE-bench 子集 17%→53%（第 14 轮峰值），第 15 轮 51%；15 轮约 $7,000；单次运行、50 题 [SICA]。
- ACE +10.6%（agent）/ +8.6%（finance）[A]；AWM 相对成功率 +24.6% / +51.1% [AWM]；SkillWeaver +31.8% / +39.8% [SW]；Letta +36.8%（厂商自报，Terminal Bench 2.0，带反馈）[L]。
- EvoMap（Evolver 作者）论文称 4,590 个 "retained trials"，并称文档式 Skill 扩写常降低均值；grep 未找到显著性检验 [EV-P, V]。

### 综合：多候选的最小可辩护流程
1. **观察**：保存失败的原始输入、输出、verifier 日志与版本。
2. **提案**：每种方法只出一个原子补丁，写明可被推翻的条件与可能被误拒的合法行为。
3. **配对评测**：候选与当前版本在同一冻结 dev+gate 集上配对运行，至少 3 次；先做 A/A（同一版本两次）估计噪声。
4. **门控（事先写定）**：差值须超过 A/A 噪声带加预设增益下限；设按任务类别的回归上限；胜者在新切片上复测（推断：k 个候选取最优会向上偏）。
5. **封存测试**：晋升候选只在一次性封存集上报告，该集不参与任何选择。
6. **账本与回滚**：每个候选（含被拒）记录 diff、逐任务分数、原因码，证据不删；晋升打 git 标签，回滚即回到上一已晋升版本；owner 采纳；发布与全局设置仍需显式授权。模型或 harness 变化即重跑门控。

### 基线对照（[BL]）
**领先**
- 证据纪律：区分观察与因果解释，保留可核查 trace，明言"结构检查不证明行为改进"（第 59–76 行）。这正对应 DGM 的伪造工具问题。
- 治理边界：业务运行只能提议（第 53–55 行），比 DGM、SICA、OpenAI cookbook 的自动晋升保守，接近 SkillOpt-Sleep 的 stage-then-adopt。
- 回滚与反过拟合：保留基线 diff（第 67–68 行）；不从单例或一篇论文参数加普适门（第 68–69 行）。
- WikiSkill 的 48.7→63.7 描述准确：Gemini-3.5-Flash、四个 benchmark（[W] Table 3；research-basis.md 第 237–238 行）。

**落后（按优先级）**
1. 无多候选选择与多重比较保护（GEPA 按实例取胜者、DGM 档案与非零选择概率、AlphaEvolve 的 MAP-Elites + island [AE]）。
2. 无噪声模型、无最小增益、无多次运行要求。
3. 被拒账本不反馈给下一次提案（WikiSkill 的 skill-impact.md；SkillOpt 的 rejected-step buffer）。"保留失败证据"目前只是归档。
4. 无按任务回归守门（GEPA+Merge 的 IFBench 回归即例）。
5. Carry-over 的 "rewrite"（第 35 行）与 ACE 的坍缩证据冲突；建议改为按 ID 追加加定期压缩，并记录被删内容的原因。
6. held-out 没有封存定义（DGM、skill-creator 为反例）。

**下一步（不增加任务）**：在现有 dev/gate 集上做 A/A，写定门控规则，再决定是否为 5/8 vs 2/8 扩大实验（每组约 27 题起）。

### 未核实与缺口
- WikiSkill 附录 C（采样、bootstrap 细节）与附录 D（成本）未读。
- SkillOpt 的 "52/52" 统计口径，以及主表是否有多次运行方差：所读文本未找到。
- DSPy 优化器索引页抓取失败（unknown error），仅核实了 GEPA 页面，其他优化器未核实。
- ACE 所读文本中未找到按 harmful 计数删除的规则。
- Evolver 论文的 "retained" 保留规则未核实；Letta、Hermes 的后台复查提示词未逐行读。
- 未运行任何第三方 WikiSkill 实现，未执行任何仓库代码。

### 来源
- [W] https://arxiv.org/html/2608.27454v1 （R）
- [GH] `gh search repos WikiSkill`，2026-10-31（R）
- [SO] https://arxiv.org/html/2605.23904v2 （R）
- [SO-repo] https://github.com/microsoft/SkillOpt （README 与 docs/sleep/README.md，R）
- [SO-blog] https://www.microsoft.com/en-us/research/blog/skillopt-agent-skills-as-trainable-parameters/ （S，搜索摘要）
- [G] https://arxiv.org/html/2507.19457 （R）；[G-doc] https://dspy.ai/current/api/optimizers/GEPA/overview/ （R）
- [A] https://arxiv.org/html/2510.04618 （R）；[AE] https://arxiv.org/html/2506.13131 （grep）
- [VOY] https://arxiv.org/pdf/2305.16291 （grep）；[AWM] https://arxiv.org/html/2409.07429 （grep）；[SW] https://arxiv.org/html/2504.07079 （grep）
- [D] https://arxiv.org/html/2505.22954 （grep）
- [SICA] https://arxiv.org/html/2504.15228 （R）
- [SC] https://github.com/anthropics/skills （skills/skill-creator，gh api，R）
- [L] https://www.letta.com/blog/skill-learning （R）
- [OAI] https://developers.openai.com/cookbook/examples/partners/self_evolving_agents/autonomous_agent_retraining （R，recipe 已标注归档）
- [EV-P] https://arxiv.org/html/2604.15097 （V，厂商自报）
- [EV] /Users/rocky243/Context Engineering/evolver/（README.md、src/canary.js、index.js、src/config.js）
- [HM] /Users/rocky243/Context Engineering/hermes-agent/（agent/curator_backup.py、agent/learning_mutations.py、agent/turn_finalizer.py、tools/skill_manager_tool.py）
- [BL] /Users/rocky243/Context Engineering/ultra-goal-skill/plugins/ultra-goal/skills/ultragoal/references/（evolution-and-scope.md、research-basis.md）

未修改任何文件，未运行任何仓库代码。
