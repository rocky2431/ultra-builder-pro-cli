# 结论：v6 能不能用到真实项目

2026-11-02。依据：本目录 `THOUGHTS.md`，Owner 当天的两条回复，以及下面的验证。

## 答案

能用。用之前先改一处：把 Owner 定下的评审标准写进方法和示例评审脚本。之后装进真实的 `~/.claude`（这一步需要 Owner 授权），就可以开始新项目。

Owner 原话（2026-11-02）：问题是“评审发现‘代码是对的，只是检查还能更强’时，要不要拦住里程碑？”，回答是“那就不来吧”，理解为**不拦**。

## 必须改的一处

| 改什么 | 为什么必须 | 怎么验证 |
|---|---|---|
| 方法 `skills/ultra/SKILL.md`“Milestone gate”第 2 步，以及 `docs/examples/drive/claude-reviewer.sh`：评审只在两种情况下给 `revise`：产品违反了 Owner 确认过的“怎么算做到”，或者通过真实接口能复现错误行为。“检查还能更强”（故意改坏的副本能通过检查，但 HEAD 是对的）照样写出，放进“What must be said to the Owner”，结论仍是 `accept`。`revise` 修完后的复评，只核对上一轮的 revise 项和有没有回归。 | 不改的话，第一个真实项目会重演 R 的过程：每轮都能找到新一批，评审不收敛；Owner 的决定也就没有生效。 | 包测试新增一条断言，先红后绿；跑 `npm run verify:release`；两个 Skill 校验器；交一位没写过这段的评审看一次。 |
| 同一步的第 3 步（演示）：把评审列出的“检查还能更强”，以及写者交接里“注意到但没改、没有检查钉住”的条目，列给 Owner，由 Owner 决定补不补。 | 写者早就报过 M2 的丢数据问题和 M3 的组合输入，当时没有去处。 | 同上。 |
| 上手说明随之更新：删掉“两轮后需要你叫停”，删掉已撤回的“每条需求先列输入类别”建议。 | 避免和方法矛盾。 | 人工核对。 |

这一处只改方法文字、一个示例脚本的提示词、一条测试，不碰引擎，可以回退。

更正（2026-11-02 晚，实现后）：上表第一行“复评只核对上一轮的 revise 项和有没有回归”在第一版实现（v6 `768556d`）里被我写成“复评新发现的缺陷也只交 Owner”。独立评审指出，这会让真缺陷经代答关闭、Owner 看不到；这一条也不是 Owner 的决定。第二版改为：每一轮用同一个标准，真缺陷照样拦；把缺口算作“只是检查还能更强”之前，评审要先在 HEAD 上试过那个输入；清单里有缺陷时不能代答放行。细节记在 v6 的 `.ultra/rulings.md`。第三版 `9bdfda8`：同一位评审复核后指出，方法里 `delegation` 一句“从此代答”可能被读成覆盖门第 4 步，已加上“门第 4 步清单里有缺陷时除外”，并补了三条测试断言。

## 不用改的，以及原因

- 上限 15（amend）：是评审构造出来的场景，上手说明第 6 节写了手工处理办法。
- 裁决行格式：偶尔会挡一次，写者改正后就能通过，代价是重试一轮。
- 安装器不带 drive 示例：从本地 v6 安装时，示例就在 v6 工作树里；第一个项目也建议先不用 drive。
- Node 22 计时测试：只影响 v6 推送后自己的 CI，不影响使用。
- 引擎预算和其余上限：保持原样。

## 已验证（2026-11-02）

- 真实的 `~/.claude` 和 `~/.codex` 里没有装任何版本的 UBP 插件。PATH 上的 `ubp` 是指向主仓库 5.x 的 npm 链接。
- Claude Code 2.1.316 用隔离配置目录执行 `claude plugin list --json`：能看到 `ultra-builder-pro@skills-dir`，已启用。
- 用 `--plugin-dir` 在冒烟项目里跑了一次无头会话：Skill `ultra-builder-pro:ultra` 和 `/ultra` 都已加载；SessionStart hook 输出了 `M1 · 1/1 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次`。冒烟项目没有被改动。证据在 v6 的 `.ultra/.runtime/v6/p5-work/hostcheck.O9Z5g2/`（被 Git 忽略，只在本机）。
- `Context Engineering` 下只有 v6 自己的几个项目含 `.ultra/spec.md`；5.x 项目不会触发 v6 的 hook。
- 安装后（2026-11-02 晚）：v6 `21d0314` 已装进真实 `~/.claude/skills/ultra-builder-pro`，doctor healthy；不带 `--plugin-dir` 的真实无头会话里插件来源是 `ultra-builder-pro@skills-dir`，`ultra-builder-pro:ultra` 加载并被模型成功调用，hook 打出进度行。证据在 v6 的 `.ultra/.runtime/v6/p5-work/realhost/`（被 Git 忽略）。
- 再次安装（2026-11-02 晚）：Owner 同意把方法里 Escalation 表的“需求冲突”改归 Owner 后，v6 `0888404` 重新装进 `~/.claude`，doctor healthy；这次没有再跑无头会话，之后只改了方法里的一行表格。
- 未验证：交互式（非无头）`/ultra` 会话；Codex（未安装）。

## 交接

- 目标：改完上面一处，装好，Owner 在新项目里用 `/ultra` 开始 0→1。
- 不做：push、tag、npm 发布、`npm install -g`（会替换 PATH 上指向 5.x 的 `ubp`），以及修改引擎。
- 需要 Owner 授权：(1) 在 v6 分支上做这处修改并提交；(2) 执行 `node "<v6>/bin/install.js" --claude --global`，用 Codex 时再加 `--codex`。
- 第一个真实项目要观察三件事：门评审能不能在两轮内收敛；评审发现属于“违反标准”还是“还能更强”；除了四个介入点之外，Owner 有没有被打扰。

## 更新（2026-11-04）：机械约束的尺度、合并进 main

Owner：“肯定是要改的，这个东西都要改得很完善”；“不要用 V6 的分支”；讨论后：“按照你觉得推荐的来就好……就按你的打算来吧”（proxy: no）。尺子：事实交引擎、意义交模型；每条规则写明补偿什么；能恢复只提示、不可逆才拦；格式只放在机器必须读的地方，并且宽读。

- 引擎没有会让模型卡住的地方：不调模型、不联网、不读 stdin；唯一的 hook（SessionStart）有 1 s 读入和 8 s 上限，出错静默。
- 裁决行宽读：日期、层、决定、理由、代价都要有，破折号、空格、冒号随意。一条约 3600 字的格式错误行，读取从 6752 ms 降到约 3 ms（`status` 会读裁决）。
- drive 有运行锁，`ubp status` 显示 `drive 运行中`；方法写明 drive 在后台启动，并说明锁残留时怎么判断、怎么处理；drive 的写者和评审看不到 hook 的提示。
- 示例写者和评审用 Claude Code 权限规则拦 `git push`、`npm publish`、`gh`。上限：`git -C … push` 和脚本里的推送拦不住；`git * push *` 这种中间通配会误拦消息里含“push”的提交（评审实测），所以没用。
- 引擎预算：Owner 选“按真实行数计”，上限 2000 不变；现在 1998 行。
- 两轮独立评审（xhigh），共 9 条发现全部采纳；`ubp check --all` 7/7，发布检查 386/386，审计 0 个问题。
- v6 已普通合并进 main（`5fe3d9b`，父提交 `188c087`、`694ed07`），并从这个提交重新装进 `~/.claude`：doctor healthy，dirty: false。PATH 上的 `ubp` 链接到主仓库，现在就是 v6。v6 工作树与 `v6`、`v6-p*` 分支已删，SHA 记在 `THOUGHTS.md`。
- 已发布（同日，Owner 授权“push tag 发布，安装不需要你安装先”）：发布提交 `d0466b0`，tag `v6.0.0`；推送 tag 后 `release.yml` 在 CI 上跑完 386/386、审计 0，发布 npm `ultra-builder-pro-cli@6.0.0`（带 provenance，`latest`），并建 GitHub Release `v6.0.0`。npm 包的 37 个文件与 `d0466b0` 逐字节相同。
- 仍未做：任何安装（包括从 npm 装 6.0.0 和 Codex 安装）；合并后没有再跑真实的无头会话（上次在 `21d0314`）。
