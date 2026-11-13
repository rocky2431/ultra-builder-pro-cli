# M-P6 里程碑门演示（第 2 版，2026-11-12）

里程碑：Project knowledge and a status the Owner can trust。合同：`thinking/v6-workflow-review-20261111/RESULT.md`“执行合同”。

第 1 版演示（`M-P6-demo-1.md`，`a814f6c`）之后，你在门第 4 步答“先修 准确地说，全部修复完成了之后，我才会去做测试”。之后的修复中，不变量机制又出过问题，你选了方案 A（“选A吧”）。这一版是全部修完后的演示。

## 1. 可以亲手试的

### 怎么装来测

合同规定门通过后才装进真实的 `~/.claude`。下面的测试安装不碰它，那里现在还是 11-04 从 `5fe3d9b` 装的 6.0.0。

```sh
cd <你要试的项目>
claude --setting-sources project --plugin-dir /tmp/ubp-owner-test/config/skills/ultra-builder-pro
```

- `/tmp/ubp-owner-test` 是从干净提交 `44498b8` 装出来的 6.1.0-rc.0，doctor 报 `healthy`。
- `--setting-sources project` 不加载你用户级的设置和插件，旧版插件也不会加载，是一个干净环境。
- 想在平时的环境里测，就要提前装进 `~/.claude`。这一步在合同之外，要你点头；回退办法是从 `5fe3d9b` 重装一次 6.0.0。

### 试什么

1. **空目录。** 调用 `/ultra`，应依次看到：
   - `git init`，空目录用 `git commit --allow-empty` 做第一次提交；
   - `ubp status` 报“has not started: .ultra/spec.md does not exist”，不出现 `ENOENT`；
   - 摸底，写出 `.ultra/design.md`；
   - 只问调查解决不了的问题；
   - 请你确认 Direction 和每条 `Done when`。
2. **已有代码库**（方案 A 的效果）。在一个里程碑里，先加一个新行为，再改一个已被现有测试钉住的行为。应看到：
   - 项目自己的测试命令登记成不变量；
   - 新写的和改写成红的测试放进这个里程碑自己的测试目录（例如 `test/m4/`）；
   - 提交验收后，原来绿的不变量仍然是绿的；
   - 每个节点一次 `node done` 就过；
   - 到里程碑门第 1 步，这个目录并入项目的测试命令，之后 `npm test` 也跑这些新测试。

   A7 第 4 轮无头实测就是这个场景：1097 秒、6.20 美元。验收提交后不变量仍是绿的，两个节点都没被拒；到门第 1 步，会话自己记了一条裁决，把 `test/m4/` 并进了 `npm test` 和不变量，59/59。记录在 `.ultra/records/acceptance/a7-start-trials-4/`。
3. **`ubp context <节点>`。** brief 在 `## Requirements` 之前有 `## Project`，包含 spec 的 Direction、Interface 和 `design.md`。
4. **`ubp status`。** 做一条只改笔记的提交，已关闭里程碑应显示“待复核”，而不是“未绿”。
5. **`ubp milestone close`。** 只接受 `.ultra/records/milestones/<id>-review.md`，给别的路径会报 `review-not-for-milestone`。
6. **`ubp drive`。**
   - Claude Code：drive 打出的每一行都会逐条转给你，drive 结束时停止监视。
   - Codex：没有逐行通知，你需要自己 `tail -f .ultra/.runtime/drive.err`。

## 2. 主旅程检查

`C-engine-p6`：通过，12/12。主工作区日志：`.ultra/.runtime/checks/94110b8a-0cd7-4a8a-bc3e-6072f3b84b15.log`。

## 3. 进度行

`M-P6 · 5/5 绿 · 下一项 里程碑门 · 本里程碑计划变更 18 次`

门第 1 步在 `44498b8` 上（代码与 `75321d3` 相同）做了两遍：主工作区 `check --all` 9/9；同一提交的干净检出也是 9/9，代码指纹相同，C-release 用时 372 秒。

## 4. 上次关闭（M-P5，2026-11-02）以来

### 计划变更：18 次

- 18 次全部来自三次改 spec 的共享文字：一次是加上 Direction 草稿，第 3 轮评审后改写一次，第 1 次核对后又改写一次。
- 引擎每改一次共享文字，就给 M-P1 到 M-P6 每个里程碑各记一条 `change`，所以三次共 18 条。
- 其中 M-P6 那几条还记了：
  - 新增 REQ-P6-docs；
  - 修改 REQ-P6-status 一次、REQ-P6-method 三次；
  - 修改 C-engine-p6 和 C-method-p6 的 `expect`。
- 已关闭里程碑没有一条需求或检查被改。
- “本里程碑计划变更”从 M-P3 起就把上次关闭以来所有里程碑的变更都算进去，这次没改这个行为，只在这里说明。

### 裁决：29 条

L0 3 条，L1 11 条，L2 15 条，从 `.ultra/rulings.md` 第 21 行开始。最该看的几条：

- **L0**：Direction 草稿只用你记录过的原话，并按核对意见补了出处，等你确认。
- **L1**：
  - “全部修完”的范围；
  - 按你选的方案 A 改 REQ-P6-method；
  - 新增 REQ-P6-docs；
  - 改写已关闭 M-P5 的 C-package 断言，强度不变；
  - 第 3 轮之后不开完整的第 4 轮，由第 3 轮评审者核对两次。
- **L2**：
  - 版本 6.1.0-rc.0；
  - README 安装行在发布前仍写 6.0.0，并加了检查防止发布时忘改；
  - D2 只加诊断。

### `retro`

重复两次及以上的失败类有 4 类，都是有意先写成红的那几次，不是代码回归，所以环境没有为它们另做改动：

| 失败类 | 检查 | 来自 |
|---|---|---|
| closed milestones keep counting | C-engine、C-release | M-P6 开头的先红 |
| after a drive stop … truth files back | C-package | M-P6 开头的先红 |
| a project without .ultra/spec.md | C-engine-p6 | 第 2 轮评审之后的修复 |
| a test this work turns red waits outside the invariant … | C-method-p6 | 核对 2 及其确认之后两次给同一用例加断言 |

最后一类是我两次给同一个用例加新断言造成的，引擎分不出这和回归，方法要求如实计入。它对应的环境改动就是方案 A：不再列举“测试可以怎么放”，改为检查结果（验收提交后看 `run` 和颜色）。

### `unplanned` Owner 触点：6 次

11-02 关闭 M-P5 之后 3 次，11-04 2 次，11-11 1 次。第 1 版演示写成 3 次，漏了 11-02 的 3 次。

## 5. 评审

| 轮次 | 文件 | 读的提交 | 结论 |
|---|---|---|---|
| 第 1 轮 | `M-P6-review-1.md` | `e5db85e` | accept |
| 第 2 轮 | `M-P6-review-2.md` | `b289adc` | accept |
| 第 3 轮（你批准的） | `M-P6-review.md` | `1f25cee` | accept |
| 第 3 轮评审者核对 1 | `M-P6-recheck-1.md` | `a3ca72f` | accept |
| 第 3 轮评审者核对 2 | `M-P6-recheck-2.md` | `ef37b09` | accept |
| 核对 2 所列措辞的确认 | `M-P6-recheck-2-confirm.md` | `591b45d..04fd380` | accept |

## 6. 要你知道的（缺陷在前）

### 门口查出、已修的缺陷

1. **不变量会把还没实现的红测试算进去，前面的节点全被拒。** 这个问题三轮各出现一次，每次路径不同，最后按你选的方案 A 改了：
   - 第 2 轮：被钉住的测试改红后留在不变量里；
   - 第 3 轮：glob 不变量跑到新需求的红测试，这一条是我引入的；
   - 核对 1：跳过过滤挡不住一加载就失败的新测试文件。

   现在的做法：
   - 新写或改写成红的测试只放进里程碑自己的目录；
   - 验收提交后检查原来绿的不变量是否仍绿，所以不论运行器有什么怪癖，任何节点开工前都能发现；
   - 门第 1 步把这个目录并入项目的测试命令。
2. **新测试永远进不了项目自己的测试命令**（核对 1）。方案 A 的门第 1 步解决了这一点：
   - 我在 A7 第 3 轮的项目副本上手工走了一遍，`npm test` 从 50 个测试变成 59 个；
   - A7 第 4 轮的会话只看方法文字，自己完成了这一步，同样是 59/59；
   - 评审者在探针项目上也复现了。
3. **方案 A 的四处措辞**（核对 2，已改）：
   - 直接 `node --test`、pytest 默认、`go test ./...` 会递归找到里程碑目录，方法现在写明用运行器自己的路径手段排除；
   - 红基线由清理节点修时，“原来绿的仍绿”看不出放错位置的红测试，现在还要看 `run` 里有没有新加或改写成红的测试；
   - 红基线那句自相矛盾，已改；
   - drive 下评审在并入之前，看不到这次改动，所以并入时的裁决要写出改前和改后的 `run`。

   评审者确认时又指出一处是它自己提议的措辞：“新加的测试文件”会把绿的特征测试也挡在外面。已按它的建议改成“新加或改写成红的测试”。这是它原话的写法，所以没有再请它确认。
4. **复制出去的示例评审脚本找不到评审说明**，drive 会停在 `review-invalid`。现在 `drive.md` 写明要设 `UBP_REVIEW_GUIDE`，评审者复测可用。
5. **文档检查的 `run` 直接写了 `README.md`**，结果所有 drive 写者都不能改 README。现在改成在测试文件里读 README，评审者在 drive 下复测通过。
6. **本仓库 `design.md` 写错了“没有运行时 npm 依赖”**，实际有 `js-yaml`。已改正。每个 brief 都带着这一行，所以要改。
7. **其他小项：**
   - 空目录初始化要用 `--allow-empty`；
   - 清理节点“不做大重构”的规则，给第一个修红基线的节点留了余地；
   - 状态表 drive 行的措辞；
   - 没有提交的仓库，报错补了用例，故意改坏的副本现在会被抓住。

### 你要决定或知道的

1. **Direction 是我起草的，要你确认或改正。** 全文见第 7 节。
   - 引号里都是你的原话；
   - “优雅”和“放弃条件”你没说过，写的是“Owner 未说”；
   - “进度看不见”“越改越乱”标成了我对你抱怨的解读；
   - “不做 daemon、runner、Python hook”注明来自本仓库产品边界，不是你的原话。你 10-31 说过 graph、loop、异步多 Agent “都可以纳入考虑”，这一条要不要保留由你定。

   你一改，所有检查要重跑一遍再关闭，约 15 分钟。
2. **没有开完整的第 4 轮评审。** 第 3 轮之后的修复由第 3 轮评审者接着原上下文核对了两次，并确认了一次措辞。
   - 方法门第 4 步写的是“完整评审”，合同上限是 2 轮，你只批准了第 3 轮。两条守不住时，我选了不超出你批准轮数的那条。
   - 你要完整的一轮，我就再做。
3. **README 安装行仍写 `@6.0.0`**，6.0.0 没有这个里程碑的功能。
   - 原因：不能让人装还没发布的版本。
   - 发布时 `verify:release` 会拦下忘改的情况：正式版本号和 README 不一致时测试失败。
4. **两件默认不改，由你定：**
   - A7 第 3 轮的会话用一条裁决决定，不给没有 README 的项目加文档需求，而方法要求把用户文档作为一条需求。可以给方法加一个条件，例如“这次工作改变了用户怎么安装、运行或配置时”。
   - 已关闭 M-P5 的 C-package 写死了版本号 `6.1.0-rc.0`，每次发布都要改一次已关闭的验收。可以改成“锁文件版本等于 package.json 版本”。
5. **D2 原因仍未知。** C-release 在干净检出里失败过一次，约 27 次全量中只有这一次。已加诊断，下次再红时日志会写出进程当时的状态。
6. **方法检查只是结构性的。** C-method-p6 只证明文字在，不证明方法有效。是否有效靠评审和 A7，而 A7 每个场景只有一个样本、一个模型，全部代答，也没有在 drive 下跑。drive 下的情形由评审者的探针覆盖。
7. **`milestone close` 保留 `--review`。** 去掉会推翻你 11-11 确认的 REQ-P6-close，所以没做。
8. **规模：** 引擎 2015/2050 行，SKILL.md 394/395 行，已经贴着上限。
9. **方案 A 的已知限制**（评审者列出，不拦）：
   - 项目测试命令每个里程碑多一个路径；
   - 路径手段只能整文件排除，和绿测试同在一个文件里的红测试要拆出来，或者走清理节点；
   - C-method-p6 只查文字，把并入方向写反的副本也能通过。

## 7. Direction 草稿（全文，待你确认）

```
## Direction
North star (Owner, 2026-10-31):
"集当前所有上下文工程、Harness 工程为一体的一个作品";
"有控制、有进度，同时又不失灵活性，把整个事情做得井井有条，而且具有极高的辨识度";
"能够用它产生真实、优雅且非常厉害的工程样本".
The purposes of the earlier UBP, as the Owner named them (2026-10-30):
"1. 自动化 2. 更好、更精确的意图识别与执行".
Users: the Owner, who runs several projects at once,
"有的项目是在已有代码上去做，有的是全新的" (2026-11-11); the hosts are Claude Code and Codex only
(the confirmed v6 contract).
Success (Owner, 2026-10-31): "只要最终能产出一个真正好用的东西就行". Done when the Owner can
take it to a first real project; that first real sample is the real acceptance (the confirmed
v6 contract). The Owner's complaints that success should end (the assistant's reading):
"你不知道具体进度是什么" (2026-10-30) and, from 1 to 100, "越改越乱" (2026-10-31).
Abandon: not stated by the Owner.
Boundary: one method (`ultra`), one engine (`ubp`) and one advisory hook; no daemon, runner or
Python hook (this repository's v6 product boundary, not the Owner's words). Push, tag, npm
publishing and installing in the real HOME wait for the Owner: the v6 contract excludes
"push、tag、npm 发布", and the M-P6 contract the Owner confirmed ("确认，确认") says
"门通过后装进 ~/.claude，不 push、不发布".
Accepted cost (2026-10-31): "它在 0 到 1 阶段可能会比较重，但这是我们可以接受的".
Elegance: not stated by the Owner.
```

## 8. 问题

请你按第 1 节自己测试。测完后回答一个问题：**M-P6 放行，还是要改？**

- 要改的话，直接说改什么：Direction 草稿、方案 A 的效果，或第 6 节里任何一项。我改完会从门第 1 步重新走。
- 放行的话，你的原话会作为 `--owner` 记进关闭记录。之后我按合同依次：关闭 M-P6、合并进 `main`、跑发布检查、从干净提交装进真实的 `~/.claude`（只装 Claude Code），不 push、不打 tag。
- 第 6 节“两件默认不改”的事，如果你要改，也在同一句回答里说。
