# v6 剩余问题：先想清楚再修

## Current position

<!-- current-state -->
- 问题与目的：Owner 2026-11-02 用四问分诊 v6 剩余问题；2026-11-04 批准“机械约束的尺度”这一批修改，并要求合并进 main、不再用 v6 分支。判断与交接见 `RESULT.md`（含“更新（2026-11-04）”一节）；2026-11-02 的修改、安装和两个 HTML 页见文末“历史”。
- 阶段：released（2026-11-04，6.0.0 已推送、打 tag、发布）。Owner 原话：“肯定是要改的，这个东西都要改得很完善”；“改完之后是不是要合并到主分支来？不要用 V6 的分支”；“按照你觉得推荐的来就好……就按你的打算来吧”（proxy: no）；预算：“按真实行数计（推荐）”（proxy: no）。
- 已完成：
  - 引擎、方法、示例和文档改动在原 v6 上依次为 `937b6f2` → `7d9871a`（Codex）→ `c4f1798` → `8736647` → `fef9923` → `97e94dd`（评审第 1 轮）→ `1bb9e75`（第 2 轮）→ `694ed07`（证据：`check --all` 7/7，发布检查 386/386，审计 0）。
  - main 合并提交 `5fe3d9b`，树与 `694ed07` 相同；从它的干净工作树装进 `~/.claude`：healthy，dirty: false，7 项检查 pass；装好的 hook 实测会打出进度行，在 `UBP_DRIVE` 下不出声。PATH 上的 `ubp` 现在就是 v6。
  - 已删：v6 工作树、`v6-scale`（`c4f1798`），以及 `v6` `694ed07`、`v6-p3` `fc094f5`、`v6-p4` `abef67f`、`v6-p5-drive` `0e73ba7`（-D；4 个提交在 v6 里有同名重放，drive 代码、测试和 FORMATS 逐字相同）、`v6-p5-drive-int` `9ba1dd5`、`v6-p5-pkg` `37430e7`。
  - 运行证据搬到 main 的 `.ultra/.runtime/v6/` 和 `.ultra/.runtime/checks/`（1555 个文件）。v6 里一条已提交记录引用的旧路径 `v6-p5-pkg/.ultra/.runtime/v6/p5/pkg-r2-receipt/` 现在在 `.ultra/.runtime/v6/archive/phase-worktrees/v6-p5-pkg/` 下。
  - 两个 HTML 页已更新到 `5fe3d9b`，check.py 通过，截图都看过（未提交，按约定；`.git/info/exclude` 本地忽略 `/html/`、`/docs/wip/*.html`）。
  - 收尾与发布（Owner：“我授权你，你帮我把这些收尾的工作给清理干净……并且 push tag 发布，安装不需要你安装先”，proxy: no）：发布提交 `d0466b0`（CHANGELOG 标题定为 `[6.0.0] — 2026-11-04`）；附注 tag `v6.0.0` → `d0466b0`；main 与 tag 已推送。推送 tag 触发 `.github/workflows/release.yml`（run 41868010684）：CI 上 386/386、审计 0，npm 以 trusted publishing 发布 `ultra-builder-pro-cli@6.0.0`（带 provenance，`latest` = 6.0.0），并建了 GitHub Release `v6.0.0`。下载的 npm 包 37 个文件与 `d0466b0` 逐字节相同，文件权限与本地打包相同；压缩包 shasum（`26dfc80`）与本地打包（`e8b15a0`）不同，推测是打包环境的压缩差异（CI Node 24，本地 Node 25），未深究。
- 留给 Owner：`/tmp` 里本会话的临时文件（`/tmp/ubp-*`、`/tmp/formats-*.cjs`、`/tmp/drive-0888404.cjs`、`/tmp/ruling-timing.cjs`、`/tmp/b59d-result.json`、`/tmp/b333-result.json`、`/tmp/b2-submit.*`、`/tmp/v6-tracked.txt`、`/tmp/main-ignored.txt`），自动权限判断拦下了我的清理，可自行删除。9 月 5.x 实验留下的 56 个未跟踪文件已归档到被忽略的 `.ultra/.runtime/archive/untracked-5x-work-20261104/`（仓库公开，其中有从程序导出的原始字符串和本机快照，不提交）。
- 未做：任何安装（Owner：“安装不需要你安装先”），包括从 npm 装 6.0.0 和 Codex 安装；合并后没有再跑真实的无头会话（上次在 `21d0314`）。
- 下一步：等 Owner 在新项目里用 `/ultra` 开始 0→1；按 RESULT“交接”第 44 行，观察三件事。
- 结果文件：`thinking/v6-remaining-problems-20261102/RESULT.md`。
<!-- /current-state -->

## Problem structure and current judgment

四问分别检验三件事：问题是否真实发生过（1）、修法是否在替模型做判断（2）、修了能否惠及以后的项目（3）、根因是缺标准还是别的（4）。

### 按“怎么暴露的”分三类（问 1）

| 来源 | 条目（编号沿用上一条回复） | 说明 |
|---|---|---|
| 真实运行中出现 | 1 检查弱、10 评审不收敛、11 裁决行格式、14 Node 22 计时、6 写者没启动、2 缩小（REQ-persist） | 6 是控制者路径没加引号；2 是控制者以规划者身份做的 |
| 评审或引擎作者构造 | 3 被忽略文件、4 批准伪造、5 amend、8 两个 drive、9 清理节点手写、12 L2 两档、15 合并临时树 | 没有任何一条在真实写者身上发生过 |
| 读代码发现、未运行 | 13 安装器不带示例、17 v6 的 `.gitignore` | 13 对任何 npm 安装的用户都成立 |
| 未验证 | 7 子进程残留、16 每节点全量重跑的耗时 | R 很快，没测出 16 |

### 修法会不会限制模型（问 2）

- 会限制、应撤回：示例写者禁止 amend/rebase/reset（amend 是正常 Git 用法）；“每句需求先列输入类别”写进方法（P5b 同类指令增益 0）；给裁决行加模板（在格式税上再加规则）。
- 不限制：安装器带示例；Node 22 计时测试改写；把写者交接里已经写出的“没钉住/注意到没改”送进门记录（用模型已有的输出）。
- 限制的是评审的否决权而不是搜索：评审按 Owner 确认的“怎么算做到”判拦不拦，其余发现照写、交 Owner。
- 反方向的问题：裁决行要求破折号两侧各一个空格，这条规则不补偿模型的任何弱点（RESULT §2 第 11 条要求每个部件写明补偿哪个弱点），却是唯一真实反复触发的规则。修法是放宽解析或不因语法拦 `node done`，需要引擎行数。

### 共性还是个性（问 3）

- 共性（每个真实项目都会遇到）：检查强度没有标准、评审不收敛、写者交接里的发现没有去处、裁决格式税、慢测试套件每节点全量重跑、安装器不带示例。
- 个性（这次、这台机器、这种角色安排）：路径有空格没加引号、v6 自己的 `.gitignore`、v6 自己的计时测试、误提交、N1。
- 原理上共性、实际罕见：所有构造出来的攻击路径。

### 根因（问 4）

1. 缺标准，最大的一类：R 的“为谁做、怎么算做到、边界”全是代答，制定标准的和实现的是同一个代理；评审另有一个没写出来的更高标准。即使 Owner 在场，他会用人话说“怎么算做到”，不会定“检查要杀死多少坏副本”——设计里根本没有这个槽位。所以是“Owner 缺席”加“设计缺一个标准位置”。
2. 角色合一加赶工：控制者同时是代答 Owner、规划者、核验者、评审分诊者，目标是“快速地全部做完”。写者在交接里报过 M2 的重复记录丢数据、M3 的组合输入，规划者没有把它们变成检查或裁决。正常使用里宿主模型也同时是规划者和控制者，所以“交接发现没有去处”是共性；赶工是个性。
3. 评审分诊没有威胁模型：评审按“找问题”布置、xhigh 强度，助手几乎全部采纳，引擎变成防作弊系统，2000 行预算被填满，现在挡住真修复。这与 Owner 是否在场无关，是助手的分诊策略。
4. 普通工程缺陷：计时测试、路径引号。

## Factors and evidence

| 判断 | 来源 | 观察 |
|---|---|---|
| 防作弊核验从没在真实写者身上触发 | R `.ultra/records/p5/` 的 drive 结果；冒烟 `records/acceptance/drive-smoke/` | R：`attempts-exhausted` 1（exit 127）、`milestone-gate` 3；冒烟：`milestone-gate` |
| 裁决格式是最常见首轮失败 | v6 `.ultra/records/experiments/p5-evolution/RESULTS.md` 第 46 行 | 14 次里 6 次被计划门挡下，“破折号前后少空格，或括号写法不符合格式” |
| 加指令没有增益 | 同上，第 7、44 行 | 增益 0；token 1.31×/1.27×；“当前组的写者在没有这段话的情况下，也都主动做了手工探测” |
| 代码对、检查弱 | R `M3-review-1.md`、`M3-review-2.md`（每条 “On HEAD” 都正确）；`M3-review-2.md` 第 6 条 | “the revise pinned exactly the reviewer's drafts, and the next sweep found the next batch” |
| 真实代码缺陷随里程碑减少 | R `M1-review-1.md`（单斜杠跳回、约 54 MB 崩溃）；`M2-review-1.md` #1（重复记录丢数据，写者已报“noticed and not changed”） | M1 2 个、M2 1 个、M3 0 个；之后的发现都是检查强度 |
| 规格没写的行为留到评审 | `M3-review-2.md` 第 5 条 | 大小写、“给回最老的”是“spec is silent”的 L2 裁决 |
| 标准位置在 Owner | 主仓库 `thinking/back-to-essentials-20261030/RESULT.md` §3.9 | 0→1 访谈“用人话确认每条需求‘怎么算做到’” |
| 访谈全是代答 | R `.ultra/records/owner-touches.md` 第 3–6 行 | 4 题都是“你替我定（代答）” |
| 评审花费高于写者 | 验收包第 2 节 | M3：写者 1.76 美元，三次评审 9.63 美元 |
| 外壳部件要写明补偿什么 | RESULT §2 第 11 条 | “每个 harness 部件都写明它在补偿模型的哪个弱点，并且能一次拆掉一个” |

缺口：没有逐行统计引擎 2000 行里多少属于防御；“预算被防御填满”是从采纳记录推断的。

## Alternatives, Alpha, and objections

- 反方：防作弊核验没触发，也可能正因为它们在（写者知道有核验）。R 的写者提示里写了不能碰真相文件，所以无法区分“没意图”和“被吓住”。这不改变分诊规则：不为没发生过的攻击继续加引擎代码，已有的保留。
- 反方：M1 的两个真实缺陷说明“绿不等于对”确实发生过。成立；但它们是评审找到的，说明评审有价值，问题在评审没有停止标准，而不是要更多评审。
- 候选做法（助手提议，未采纳）：给评审一条声明过的标准——违反 Owner 确认的 Done-when 才拦；“检查还能更强”照写，进门记录交 Owner；写者交接里的“没钉住/注意到没改”也进门记录。
- 候选分诊规则（助手提议，未采纳）：评审发现进引擎的条件是“在真实运行中发生过”或“不需要恶意就会发生”；否则记为上限。

## Meaningful changes and parked branches

- 2026-11-02 撤回上一条回复的建议：
  - 第 5 条（上限 15）不再建议在第一个真实样本前修，验收包第 20 条建议改为“确认”；如果以后修，只补“先查祖先”那一句，不禁止 amend。依据：构造出来的、需要写者同时伪造和改写历史；禁止 amend 限制正常用法。
  - 第 11 条不加模板，改为“不因语法拦”。依据：P5b 失败全是标点。
  - 第 1 条不先做“列输入类别”或“坏副本测量”。依据：P5b 同类指令增益 0；没有标准时，坏副本测量会重现评审不收敛。
  - 第 18 条不先放宽预算。依据：第 6 条是控制者自己的错，第 3 条是构造的且已有方法补救；放宽前先按 RESULT §2 第 11 条复核已有部件。
  - 保留：第 13 条（安装器）、第 14 条（推送前）。

## 2026-11-04 机械约束的尺度（已批准，已完成）

复核（v6 `0888404`）：
- 不会像 MCP 那样卡死：引擎不调模型、不联网，`engine/*.cjs` 里没有 `process.stdin`、`readline`；唯一的 hook 是 SessionStart（读输入 ≤1 s，`ubp status` ≤8 s，manifest `timeout: 10`，出错静默）；没有 Stop、PreToolUse hook。
- 模型必须按格式写的地方：裁决行（`engine/formats.cjs:170`，`rulings.md` 里任何 `- ` 行都要匹配；P5 14 次里 6 次、P4 9 次里 1 次首交被挡，都自愈，各多一轮，见 v6 `.ultra/records/experiments/p5-evolution/candidates.md:16`）；评审首行 `Reviewer:` 加恰好一行 `Verdict:`（`engine/milestone.cjs:18`，真实运行未撞）；spec 标题与 `Done when:`、`checks.json`、`plan.json`、expect 正则（门报具体行）；账本只有引擎写。
- drive 没有“正在运行”的锁（`engine/drive.cjs` 无 run 级锁）；放后台后，第二个 drive 或手动写者同树提交会变得容易发生。
- 示例写者 `docs/examples/drive/claude-writer.sh`：`--permission-mode acceptEdits --allowedTools "Bash,…"`，`git push` 等对外操作只靠提示词挡。
- 主机前台超时后的实际行为（杀掉还是转后台）未实测。

尺子：RESULT §2 第 9 条（事实交引擎、意义交模型）、第 11 条（每个部件写明补偿哪个弱点，宿主有了就删）、§3.7（能恢复只提示，不可逆才拦）；助手补：格式只放在机器必须读处，且宽读。

提案清单：保留硬拦（改检查或真相文件、棘轮、未批准缩小、改写历史、脏树证据、每节点 3 次、门必停）；放宽裁决行；drive 方法写后台启动 + 引擎运行锁 + `ubp status` 显示运行中；示例写者用宿主 `--disallowedTools` 拦对外不可逆操作。5.x 砍掉的：三个注入 hook、`post_edit_guard`、执行授权与模式守卫按尺子砍得对；`block_dangerous_commands` 是唯一本该留的一类，由上一条用宿主权限补。

合并事实：main 比 v6 多 2（`26da9ef` 与其 revert `188c087`，净零），v6 多 43；主仓库 9 个未跟踪文件与 v6 已跟踪内容逐字节相同，合并前需移开；PATH `ubp` → 主仓库 `bin/install.js`，合并后变 v6（5.x `run`、`delegate` 消失）；5.x 恢复点 `211143d`。计划：v6 上改完测完 → 普通合并提交进 main → 搬运行证据 → 删 v6 工作树、`v6` 与 5 个 `v6-p*` 分支 → 从 main 重装；push、tag、发布不在内。

## 历史（从 current-state 移出，2026-11-04）

- 最新变化：撤回上一条回复里的几项建议（见“Meaningful changes”）。
- 结论（RESULT.md）：能用；先改一处（评审标准写进方法和示例评审），再装进真实 `~/.claude`（需授权）。真实 Claude Code 2.1.316 已验证能发现并加载插件、hook 打出进度行。
- Owner 授权（2026-11-02）：“可以可以，现在改完之后就装进来吧”（proxy: no）：在 v6 本地提交、装进真实 `~/.claude`（只装 Claude Code）。
- 实施：v6 `768556d` → `f7434db`（撤回助手自加的“复评新发现交 Owner”）→ `9bdfda8`（委托条款不覆盖门第 4 步的“有缺陷不代答”，补 3 条断言）。
- 已完成（2026-11-02）：`9bdfda8` 上 `check --all` 7/7，证据提交为 `21d0314`；已装进真实 `~/.claude/skills/ultra-builder-pro`（来源 `21d0314`，dirty: false），doctor healthy、host_plugin pass；冒烟项目里不带 `--plugin-dir` 的真实无头会话：插件来源 `ultra-builder-pro@skills-dir`，Skill 和 `/ultra` 已加载，hook 打出进度行，模型调用 Skill 成功，冒烟项目无改动。PATH 上的 `ubp` 仍是 5.x（未动）。
- 新手讲解页（2026-11-02，Owner 要求“把我当成一个小白，做一个完整的 HTML 解释”）：`html/ubp-v6-build-flow.html`（未提交）。写页时发现方法里一处不一致：Plan 一节说需求冲突交 Owner，Escalation 表把它列在 planner 下；页面按 Plan 一节写。Owner：“那就改呗，改完之后重新安装呗”（proxy: no）。已改：v6 `5400699`（Escalation 表拆成两行，需求冲突归 Owner，测试先红后绿），`check --all` 7/7，证据 `0888404`；已重新装进 `~/.claude`（来源 `0888404`，dirty: false，doctor healthy），装好的方法文本已含新行；讲解页同步更新。
- 对比页（2026-11-02，Owner：“把我们现在最老版本的 Ultra Builder Pro，以及……拆出来的 Ultragoal、Deep Thinking，还有 Task 的那个 Skill，这几个放在一起做个对比”，“都装到 HTML 里”）：`html/ubp-family-compare.html`（未提交）。依据：老 UBP 取自本仓库 `6deca47`（9 命令、18 Skill 目录、9 代理、15 个 hook 文件）；三个 Skill 取自已安装插件的 SKILL.md 和各自仓库的首次提交日期。“拆出来”只有 Owner 的说法加时间线佐证，页面已注明。check.py 全过，400/1280 两种主题共 34 张截图都看过。
- worktree 清理（2026-11-04，Owner：“那些 worktree 你是不是要清理一下？”）：移除 5 个 v6 阶段 worktree（p3、p4、p5-drive、p5-drive-int、p5-pkg，都干净；p5-drive 的 4 个“未合入”提交在 v6 里有同名重放版）和 7 个 9 月 5.x 实验 worktree（`.ultra/.runtime/` 下，都干净，提交都在 main 上；唯一未跟踪文件已复制到其 run 目录）；`git worktree prune` 清掉 13 条目录已不存在的登记。保留 main、v6 两个 worktree 和全部 `v6-p*` 分支。阶段 worktree 的 `.ultra/.runtime/` 先存档到 v6 的 `.ultra/.runtime/v6/archive/phase-worktrees/<名>/`（157 个文件）。
- 收尾（2026-11-04）：删除合并前暂存目录（只剩 29 个 5.x `.pyc`）；`work/` 等 56 个未跟踪文件归档而不提交；本地发布尝试（`npm publish`，本地 386/386、审计 0）因 EOTP 失败，事后发现 `release.yml` 在推送 tag 时已自动发布，本地那次本不需要；`gh release create` 返回 422（已由工作流创建），没有产生重复。旧 main 的周期 CI 在 macOS 上失败的是 5.x 测试（`journey C fixture`），`d0466b0` 里已没有这条测试。
- 起点原话（2026-11-02）：“在这些之前你都要再反复想一想：1. 这个事情是怎么暴露出来的？2. 你想要去修改的部分，有没有限制到模型的发挥？3. 你认为这是一个共性问题，还是一个个性问题？4. 是因为没有我参与，这中间没有定出明确的标准，还是因为什么？”范围：Owner：“sample 我觉得无关紧要”。第二问：“我们当前到底能不能投入到真实项目里去应用？1. 如果要改，需要改什么？2. 如果不改，具体到底怎么去用？”对待决问题：“那就不来吧”（代码对、只是检查还能更强时，评审不拦里程碑）。proxy: no。
