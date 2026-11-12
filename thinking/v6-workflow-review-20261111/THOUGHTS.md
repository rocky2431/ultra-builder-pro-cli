# v6 整体流程再评审：写入什么、谁写谁改、机械约束会不会挡住模型

## Current position

<!-- current-state -->
- 问题：Owner 2026-11-11 要求换视角重新评审 v6 整个流程，并以之前遇到的情况为依据；评审完再决定改不改、怎么改。
- 起因：Owner 先问 spec、文档和 research 环节；“research”被语音识别成 “architecture”，上一轮回答顺着 architecture 查，偏离了原问题。Owner 因此怀疑其他地方也有问题。
- 阶段：执行合同（`RESULT.md`“执行合同”）。状态：active。Owner 2026-11-12：“确认，确认”（含上限 2050、门后装进 `~/.claude`）。
- 走法：本仓库 `.ultra` 里程碑 M-P6，4 条 REQ（knowledge、status、close、method），检查 `C-engine-p6`、`C-method-p6`，节点 `N-P6-engine`（Codex）、`N-P6-method`（主会话）。提交：`e6e41c0` 合同，`085f959` 先写验收，`0d88c19` 开 M-P6。
- 先红已确认（2026-11-12）：C-engine、C-engine-p2、C-package、C-release、C-engine-p6、C-method-p6 红，p3/p4/p5 绿。
- N-P6-method：方法、`skills/ultra/references/{drive,merge}.md`、示例脚本、README、CHANGELOG 已写回；交接 `.ultra/records/handoffs/N-P6-method.md`。SKILL.md 393 行；两版 Skill Creator 校验通过。
- N-P6-engine：Codex（delegation `e9c94e60556f448ea3988cbda7803ddf`）完成，核验通过（范围内、未碰测试和真相文件、引擎 2011/2050 行）；`ubp merge` 通过，合并提交 `453eff4`。Codex 交接注明：drive 不把 `design.md` 放进真相快照（交评审判断）。
- A7 两次实测已跑，记录在 `.ultra/records/acceptance/a7-start-trials/`：已有代码库产出 System、不变量 `C-suite`、特征检查、带 `Done when` 的规格、gate 通过；新项目走到访谈。局限：Shortlink 原本就有过期功能；克隆保留了旧 `.ultra` 历史。
- 实测查出方法原有错误：`^ℹ pass [1-9][0-9]*$` 在 Node 22/25 上对“一个测试都没跑”也通过；已改方法和 FORMATS.md 的示例并记裁决；本仓库已关闭里程碑的检查未改（演示时告诉 Owner）。
- 从合并起记账和状态改用仓库引擎 `node engine/cli.cjs`（A3 要在本仓库实时状态行上看到“待复核”）。
- `check --all`（合并后、仓库引擎）9/9 绿，`8aeead6`。第 1 轮评审：accept、无阻断，存为 `.ultra/records/milestones/M-P6-review-1.md`；其中给 Owner 的方法缺口（改已有测试固定的行为、红/慢的基线、已有 spec 无 design、`待复核` 措辞、`^\s*✔`、Claude Code 用 Monitor 转发 drive、`all-done` 等）已在门口修掉，所以门从第 1 步重来、第 2 轮做完整评审（合同上限 2 轮）。
- 交 Owner 决定、不在本次做：本仓库自己补 Direction/design/逐测试 `expect`；`references/review.md` 合并三份评审说明、状态表 drive 行挪进 drive.md、`milestone close` 去掉 `--review`（都要改已关闭验收或 CLI）；版本号（`tests/v6-package.test.cjs` 钉在 6.0.0）。
- 未完成：`check --all`；门第 1 步干净检出和 `retro`；第 2 轮评审；演示；Owner 本人放行；合入 main；release 检查；装进真实 `~/.claude`。不 push、不打 tag。
- 结果文件：`RESULT.md`。
<!-- /current-state -->

## Owner 原话

- 2026-11-11 第一问：“我们目前在里面还要写 spec 文档吗？文档这块是怎么处理的？现在还有原来那个 research 的环节吗，还是说已经没有了？”（原文的 research 被识别成 arch）
- 2026-11-11 第二问：“我本来说的就是 research……我合理怀疑其他地方也有问题。所以我希望你能重新以不同的视角，review 一下我们整个流程。包括：流程怎么写入？写入什么？谁来写入？谁来改？中间的机械设置会不会阻碍模型的智能？……针对我们之前遇到的情况……之后我们再看是不是需要改、具体怎么改。”

## 评审依据的局限

- v6 从没在真实 Owner 在场时跑过：样本 R 的访谈 4 题全部代答（R `.ultra/records/owner-touches.md`），本仓库自举时 Owner 中途委托“中间不太需要我了”。所以凡是“Owner 会看到什么”的判断，都是推断。
- 真实运行只有三处：本仓库自举（P0–P5）、样本 R（Shortlink，src 454 行，3 个里程碑）、drive 冒烟。都是新建或自举项目，没有已有代码库的样本。
- R 的 drive 写者日志只存了最终 JSON（`.ultra/.runtime/drive/*/N-*.log`），看不出写者读过哪些文件。

## 助手判断（独立评审回来之前写下，2026-11-11）

按对 Owner 的伤害排序。每条注明：真实发生 / 推断。

1. **获取知识这一步整段没有了，而且删除它没有留下决定。**
   - v5 的 `ultra-research` 有 baseline（开工前）和 change-scoped（变更中证据不足时）两种模式（`git show 5fe3d9b^1:skills/ultra-research/SKILL.md`）。v6 的 `skills/ultra/SKILL.md` 里没有调研、探索或基线这一步；RESULT 里也没有一句话决定去掉它（grep `research|调研` 只命中 RESULT 自己的调研来源）。
   - 历史问题是 research “没有终点、太重”（`research/01` 表 A：V1 五轮四星门“注意力被稀释”，V2 “no checkable object defines done”），不是“不该有”。v6 从“太重”直接跳到“没有”。
   - 连带：已有代码库没有入口。`SKILL.md:17` 只要没有 `spec.md` 就走 0→1 访谈。棘轮只保护有检查覆盖的行为，所以接入已有项目时，现有行为既不受保护、也不进进度。本仓库自举时，5.x 代码就是这样被忽略的（`rulings.md:6` 把 v5 文档算作代码）。
   - 性质：缺失是事实；伤害是推断（没有已有代码库的样本）。
2. **写者拿不到 Direction、Interface 和裁决。**
   - brief 只编译需求块、检查、scope、直接依赖的交接和固定规则（`engine/FORMATS.md:594` 起，`engine/context.cjs` 不读共享文本，`SKILL.md:297` 写明 “A brief carries requirement text only”）。示例写者的提示词是“下面的 brief 就是你得到的全部”（`docs/examples/drive/claude-writer.sh`）。
   - 和 `SKILL.md:85`（“检查需要的约定写进 spec 的 Interface，写者才能做到”）自相矛盾。
   - R 的“优雅”是零 npm 依赖、代码一次读完，但 R 的 12 条检查里没有不变量（`checks.json`）。所以这条方向只靠写者碰巧去读 spec。
   - 性质：矛盾是事实；写者有没有读 spec 未验证。最便宜的检验：用 stream-json 跑一个写者，看它的工具调用。
3. **L2 设计没有当前态的家。**
   - `SKILL.md:197`、`:269` 说“改 design”，但没有任何文件叫 design。RESULT §3.1 设计的 L2 是“ADR + 架构不变量”；落地后不变量有了，ADR 变成了 `rulings.md` 里按时间追加的行。
   - R 有 70 条裁决，其中 49 条 L2，很多是写者在节点里定的（存储格式、短码生成等）。想知道“现在的设计是什么”，要按时间读完 49 行，并自己判断哪些被后来的覆盖了。
   - 性质：事实；伤害是推断（评审和清理者要自己重建设计）。
4. **状态行把“过期”说成“未绿”，任何提交都让全部检查过期。**
   - 实时：本仓库此刻 `ubp status` 显示“已关闭里程碑 13 项未绿”，15 条需求的原因全是 `code-changed`；最近几个提交只改了 `thinking/` 笔记和发布文件。
   - 原因：代码指纹覆盖除引擎自有文件外的全部已提交文件（`FORMATS.md:213-217`、`:424`）。这是文档里写明的上限，目的是不让坏检查留绿。
   - Owner 每次开会话都会看到一条像回归的警报，而 `next: 检查` 要求先跑完整发布检查（本机 Node 25 约 6 分钟）。
   - 性质：真实，正在发生。
5. **“Owner 确认 spec”没有对应的步骤；规格大部分是规划者写的接口细节；评审在门口实际上在写需求。**
   - `FORMATS.md:17` 写着 “planner (model); Owner confirms”，方法里却没有确认这一步。
   - R 的 spec 里只有 `Done when:` 这一行来自访谈（而且是代答）；其余是 HTTP 状态码、JSON 形状和报错文字。spec 被改了 8 次，其中三次直接来自评审发现（`cba0066`、`6b44a26`、`2960061`）。
   - REQ-persist 的修改实际缩小了范围，却没有走批准（`.ultra/records/deviations.md` 第 4 条；上限第 1 条：只有结构性缩小会被拦）。
   - 性质：真实。
6. **没人独立检查“spec 是否抓住了意图”。**
   - 方法允许一个代理同时当控制者、代答 Owner、规划者、验收作者和分诊者（`SKILL.md:40`）。门评审的标准是“产品违背 spec 文字或 Direction”（`SKILL.md:223-227`），衡量的是代码对不对得上 spec，不检查 spec 对不对得上意图。唯一检查 spec 对不对得上意图的人是门口的 Owner，而 Owner 实际上委托了。
   - 真实例子：偏差 9（验收作者出的题越过了 R 的 Direction），以及 `M3-review-2.md` 第 5 条（“spec is silent”的行为只能落成 L2 裁决）。
   - 性质：真实；上一轮问题记录已把“角色合一”列为根因 2，但方法没变。
7. **方法正文的注意力分配。**
   - `SKILL.md` 395 行。drive 停止后的处理（`:147-188`）和合并被拒的处理（`:326-367`）约 85 行，大多针对真实运行里从未触发过的情况（上一轮问题记录：15 类构造场景，0 次在真实写者身上发生）。
   - P5b 实验里，多加指令的增益为 0，token 是原来的 1.31 倍（上一轮 THOUGHTS 证据表）。
   - 性质：内容占比是事实；“稀释注意力”是推断。
8. **长时间运行时 Owner 看不到进度。**
   - REQ-P5-package 说的“status line”其实只是 SessionStart hook 打出的一行（`.ultra/spec.md:86-91`）。
   - 本仓库自举时 Owner 主动来问了 4 次“现在什么情况了”（`.ultra/records/owner-touches.md` 的两条 `unplanned`）。
   - 性质：真实。
9. **产品文档没人负责。**
   - 方法里没有 README 或用户文档这一步；R 没有 README。
   - 历史上 V1 删掉文档同步后，契约表就过期了（`research/01` §C）。
   - 修法方向：给用户看的文档当成一条需求，有自己的 `Done when`，而不是加一个单独的文档环节。
   - 性质：缺失是事实；伤害是推断。

### 机械约束会不会挡住模型（助手判断）

- 引擎本身现在很少挡路：11-04 那一批之后，只在不可逆处硬拦，裁决行也改成宽读。真实运行里挡过模型的，只有裁决格式（已修）和行数预算（Owner 已定，不重开）。
- 更大的问题方向相反：**该给模型的信息没给**（第 2、3 条），以及**方法文字太多**（第 7 条）。
- 还有一处是机械规则替模型做了错的判断：整树指纹让所有检查一起过期（第 4 条）。这是为了安全故意选的，代价是显示和重跑。

### 做得对、不该动的

- 进度由引擎算，模型不能自己宣布完成（历史头号问题）。
- 结构性缩小要批准（R 演示过 REQ-delete-page）。
- 评审标准（11-02）解决了评审不收敛。
- 默认单写者加控制者核验（9 个节点的对比证据，`SKILL.md:45-48`）。
- 裁决行宽读；只在不可逆处硬拦。

## 待对照

- Codex 独立评审结果。
- 写者到底读不读 spec（需要一次 stream-json 运行）。
