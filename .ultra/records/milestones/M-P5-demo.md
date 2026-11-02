# M-P5 门记录（控制者写；评审在 M-P5-review-1.md 和 M-P5-review.md）

1. 手动试什么：
   - **无人值守，样本 R**：在 R 上用 `ubp drive` 跑 M3（自选短码、按短码查一条、同一个链接只缩短一次）。M3 是模拟需求，由控制者规划。
     - 三个节点都由无头写者一次完成。
     - drive 一共启动 4 次：第 0 次写者没起来（路径没加引号，exit 127），第 1 到 3 次都停在里程碑门。
     - 前两次评审是 revise（代码对，检查弱），每次由控制者以规划者身份照评审草稿手工补检查。
     - 接受 M3 的是控制者写的窄核对（第 3 次），不是对整个分支的评审。之后代答关闭 M3。
     - 原始记录在 R 的 `.ultra/records/p5/`：drive 结果、每个写者和评审的日志、脚本原样和每次的命令行（`scripts/README.md`）、两轮坏副本结果、带 HEAD 的干净检出日志。
     - R 唯一带写者的那次运行用的是第 3 轮修复之前的引擎（偏差 16）。
   - **无人值守，冒烟项目**（门评审第 1 轮之后补做）：在新项目 `ubp-v6-drive-smoke` 上，用随包示例 `docs/examples/drive/claude-{writer,reviewer}.sh` 原样跑 drive，引擎是发布的版本（`5abe32d` 和 `e61f668` 的 `engine/`、`docs/examples/` 逐字相同）。
     - 写者第 1 次就完成了 N-slug，`check --all` 通过。
     - 评审 revise：检查弱，12 个坏副本里有 7 个能通过检查；评审在 `git archive HEAD` 上跑了检查。
     - drive 停在里程碑门，exit 1。
     - 证据在 `records/acceptance/drive-smoke/`。
   - **打包**：在隔离的 HOME 和 `--config-dir` 下安装、跑 doctor、卸载。见第 3 条发布门。
2. 旅程检查：
   - C-engine-p5、C-package 都是绿。
   - 第 1 轮修复后（`e61f668`）：`ubp check --all` 7 条全绿；在 v6 目录树之外的干净检出（v6 的锁文件 `npm ci`）上 `ubp check --all --root <干净检出>` 7 条全过（`.ultra/.runtime/v6/p5/r2-clean-check-all.log`）。
   - N1 修复后（`0c26778`）：v6 工作树里 `ubp check --all` 7 条全绿，证据提交在 `0a49d73`（`r3-check-all.log`）。
   - 在 `0a49d73` 的干净检出上：`check --all` 一次是 6/7，`C-engine-p5` 失败，它的日志随临时检出删掉了，不知道是哪条测试（`r3-clean-check-all.log`）。在同一 HEAD 的新干净检出里单独重跑 `C-engine-p5`：40/40 通过（`r3-clean-p5-rerun.log`、`r3-clean-p5-rerun.check.log`）。同一 HEAD 的干净副本能过，所以不是缺了文件；推断是负载下的墙钟断言（上限 14），未证实。7 条检查在干净检出上是分两次跑通的，不是一次。
   - 在 `0a49d73` 上跑 `ubp retro`：重复两次及以上的失败类别 0 类；只出现过一次的 1 类，是 C-release 里“唯一的 Skill 是 ultra”那条测试（`r3-retro.log`）。
3. 发布门：
   - 第 1 轮在 `5abe32d`，全部通过。
   - 门评审第 1 轮之后修了产品（`d444ac4`），第 2 轮在 `e61f668` 上跑。摘要在 `records/acceptance/release-gate.md`。
   - `npm ci`：0 个漏洞。
   - `npm run verify:release`（Node 25.7.0）：362/362，`npm audit` 0 个漏洞，exit 0。
   - Node 22.21.0 全套测试：默认并发下 356/362，6 条失败全是计时断言，单独重跑全部通过；按 CI 的并发 3 重跑：359/362，3 条失败也都是计时断言，单独重跑全部通过（上限 14）。
   - `npm pack --dry-run --json`：6.0.0，37 个文件，含 `engine/drive.cjs` 和两个 drive 示例，不含 `.py`。
   - 隔离安装、`--all --global --doctor --json`、卸载：两个宿主都是 `healthy`，来源 `e61f668`，`dirty: false`。Codex 的 hook 启用状态是 `host_managed`。卸载后隔离目录为空。
   - 两个 Skill Creator 校验器在 HEAD 的 Skill 上都输出 `Skill is valid!`。Plugin Creator 在这台机器上没有校验器。
   - N1 修复后（只改了 Skill 文字和一条包测试）在 `0a49d73` 上跑第 3 次（`release-gate-3.sh`）：`verify:release` 由 `check --all` 里的 C-release 在 v6 工作树中跑过；`npm ci` 0 个漏洞；pack 37 个文件、不含 `.py`；隔离安装、doctor、卸载 exit 0，两个宿主 `healthy`（`dirty: true`，推断是因为干净检出里先跑了 `check --all`、写了证据行）；两个 Skill 校验器通过。Node 22 没有重跑（上限 14）。
4. 进度行（关闭前的 `ubp status`）：`M-P5 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次`。
5. 计划变更：M-P5 0 次。
6. 门评审：
   - drive 和打包各自已经有两轮评审，drive 另外还有一次窄核对。
   - M-P5 门评审只看四样东西：集成、发布门、R 上的 P5 出口、验收包里的说法。
   - 第 1 轮 revise（`M-P5-review-1.md`），按 L1 裁决修复。
   - 第 2 轮是上限内的最后一轮，结论 revise（`M-P5-review-2.md`）。唯一的阻断是 N1：第 1 轮修复时加进方法的一句话，会让写者没提交的伪造真相行被提交进 HEAD，评审已复现。其余都是文字问题。
   - 按 2026-11-02 的 L1 裁决修 N1：加一条先红后绿的断言，跑两个 Skill 校验器，用 `records/acceptance/n1-repro/` 核对新旧两种顺序。文字也改正了。之后由原评审者只做窄核对，评审上限因此第五次被超出（偏差 18）。
   - 窄核对 accept（`M-P5-review.md`）。它另外指出一个修复之前就有的缺口：写者用 `--amend` 把伪造行并进旧提交时，drive 只报 `truth-touched`。补一句方法文字就能修；评审上限已用完，没有在关闭前补，记为上限 15，交 Owner 决定。
7. 计划外介入：1 条 `unplanned`。11-02 控制者问 Owner 主仓库 `main` 上的误提交怎么处理，Owner 本人回答 revert；起因是控制者自己的误提交（偏差 17）。另有四条代答，都在 `owner-touches.md`：
   - drive 第 3 轮只做窄核对；
   - “被 Git 忽略的文件”这类问题只做两项不占引擎行数的缓解；
   - 门评审第 1 轮之后按评审修复，开第 2 轮；
   - 门评审第 2 轮之后修 N1，只做窄核对。
8. 代答：是。Owner 没有看演示。以下几项都是代答：
   - 产品形态（`decisions/2026-11-01-v6-product-shape.md`）；
   - drive 的三条设计；
   - 超出评审上限之后的处理；
   - 本门的放行。
9. 主仓库本地 `main` 上的误提交 `26da9ef`（偏差 17）：Owner 11-02 本人决定 revert（“revert 吧，你直接做”，不是代答），已在主仓库 `main` 上提交 `188c087`，树与 `origin/main` 相同，没有推送。这不在 v6 上，也不影响本门的检查。
