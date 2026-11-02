# UBP v6 上手说明：拿它试第一个工程样本

这份说明写给 Owner：怎么装、第一次怎么用、无人值守怎么跑、规划时要注意什么、哪些地方它还做不到。完整的方法在 `skills/ultra/SKILL.md`，文件格式和退出码在 `engine/FORMATS.md`。

## 1. 它是什么

- 意图是源码，计划是编译产物，进度靠计算得出，变更就是一份 diff。
- 你和模型的约定写在 `.ultra/` 下：
  - `spec.md`：需求，每条都有编号；
  - `checks.json`：可执行的检查，每条检查覆盖哪些需求；
  - `plan.json`：里程碑和节点。
- 进度由引擎 `ubp` 从这些文件和检查结果算出来，不靠任何人的口头汇报。
- 安装后宿主里只有一个 Skill `ultra`（方法）、一份引擎副本，以及一个 SessionStart hook。这个 hook 只在含有 `.ultra/spec.md` 的项目里打印进度行，再加一句 `Use the ultra Skill to drive this project.`。

## 2. 安装（v6.0.0 还没发布到 npm）

这台机器 PATH 上的 `ubp`（`/opt/homebrew/bin/ubp`）链接到主仓库 `ultra-builder-pro-cli` 的 `bin/install.js`。主仓库是 5.x（`ubp --version` 显示 `v5.0.2`），没有 `status`、`gate` 这些引擎命令，`ubp status` 会报错（验收包第 0 节）。在你按方式 A 换装 v6 之前，下文的 `ubp` 请读作 `node <v6 工作树>/bin/install.js`。安装方式二选一：

```sh
# A. 从 v6 分支打包后全局安装（会替换现在 PATH 上的 ubp）
cd <v6 工作树>
npm pack                                   # 生成 ultra-builder-pro-cli-6.0.0.tgz
npm install -g ./ultra-builder-pro-cli-6.0.0.tgz
ubp --all --global                         # 给 Claude Code 和 Codex 都装上
ubp --all --global --doctor --json         # 两个宿主都应显示 healthy

# B. 不换 PATH 上的 ubp，直接用 v6 工作树里的入口（--global 仍会装进真实的 ~/.claude 和 ~/.codex）
node <v6 工作树>/bin/install.js --all --global
```

- 只想先试一下：加 `--config-dir <空目录>` 做隔离安装，不碰真实的 `~/.claude` 和 `~/.codex`。
- 卸载：`ubp --all --global --uninstall`，只删安装时创建的东西。
- 装好以后，Skill 里写的是插件自带引擎的绝对路径。所以就算终端里的 `ubp` 还是旧版，模型调用的也一定是 v6 引擎。

## 3. 第一次会话

1. 新建项目目录，执行 `git init`，提交一次（引擎需要至少一个提交）。
2. 启动方式：
   - Claude Code：输入 `/ultra`（完整名称 `/ultra-builder-pro:ultra`）。
   - Codex：先在 `/hooks` 里信任 UBP 的 hook，只需一次；之后输入 `$ultra-builder-pro:ultra`。没有信任 hook 时，会话开头看不到那行进度，但 Skill 第一步跑的 `ubp status` 照样会显示。
3. 项目里还没有 `.ultra/spec.md` 时，模型先访谈你，再写出需求、先红后绿的检查和里程碑计划，然后跑 `ubp gate`，提交。
4. 之后每个会话开头都会看到这样一行：`M1 · 0/3 绿 · 3 红 · 下一项 N-01 · 本里程碑计划变更 0 次`。

需要你本人出面的时刻（其余由模型自己推进）：
- **0→1 访谈**：为谁做、成功条件、边界。模型先问你，再写需求和计划。
- **里程碑门**：看演示、看评审结论，回答“放行还是改方向”。模型会执行 `ubp milestone close … --owner "你的原话"`。
- **缩小范围**：删需求、删检查，或者把一条需求改得要求更少，都要先经你批准（`ubp approve`）。
- **方向（L0）的变化**：模型会停下来问你。

## 4. 无人值守：`ubp drive`

当你说“这一段让它自己跑”时，控制者执行：

```sh
ubp drive --writer <写者命令> --reviewer <评审命令> --json
```

- drive 一个节点接一个节点地运行：先编译简报，交给写者，再逐项核验：
  - 真相文件和账本有没有被改；
  - 有没有改写历史；
  - 工作区是否干净，包括 Git 的隐藏标记（`assume-unchanged`、`skip-worktree`）和仓库自己的 Git 设置（`config`、`config.worktree`、`info/exclude`），这三份设置在每个写者和评审前后都要逐字节一致；
  - 改动是否都在 scope 内、有没有碰检查文件；
  - 计划门是否通过；
  - 棘轮：已经绿的需求不能变红（当前里程碑和已关闭的里程碑都算）；
  - 节点的检查和所有不变量是否全绿（drive 自己重跑，不信写者交来的证据）。
- 写者和评审调用引擎时要写成 `eval "$UBP <参数>"`。drive 在每次运行前把自己的 `ubp` 放到 `PATH` 最前面，并设好 `UBP` 变量；但代理的登录 shell 可能把 `PATH` 换回去，这台机器上普通的 `ubp` 会解析到主仓库那份 5.x 入口，它没有引擎命令。示例脚本已经这样写。
- 每个节点最多尝试 3 次；整次运行最多启动 10 个写者（`--max-writers`）。
- 到了里程碑门，它让评审跑一次，然后停下来，**从不关闭里程碑、从不批准任何事**。
- 写者和评审各自的日志在 `.ultra/.runtime/drive/<run>/`。
- 停止原因和对应的处理方法，见方法文本中 “When the Owner asks for an unattended run” 一段。
- npm 包和仓库里的 `docs/examples/drive/claude-writer.sh`、`claude-reviewer.sh` 是现成的写者和评审命令（无头 `claude -p`；安装器不把它们复制进宿主）。写者默认用 sonnet，评审默认用 opus，可以用 `UBP_WRITER_MODEL`、`UBP_REVIEWER_MODEL` 换掉。它们以“自动接受编辑、允许 Bash、无沙箱”运行，只在你愿意让代理改动的仓库里用。
- `--writer` 和 `--reviewer` 收的是一整行 shell 命令。**路径里有空格（比如 `Context Engineering`）时，要在命令里再加一层引号**：`--writer "'/path with space/claude-writer.sh'"`。不加引号时写者根本起不来（exit 127），而 drive 会把它当成“节点没完成”，连试 3 次后才停。样本 R 第一次就是这样停下的。
- 样本运行是在一个 Claude Code 会话里启动 drive 的，为稳妥起见先去掉了会话自己的环境变量（`CLAUDECODE`、`CLAUDE_CODE_SESSION_ID`、`CLAUDE_CODE_MESSAGING_SOCKET` 等）；不去掉会怎样没有测过。在普通终端里启动不需要这一步。完整命令（`<v6>` 换成 v6 工作树的路径，项目根目录有空格时同样加引号）：

  ```sh
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET \
    -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION \
    -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_CODE_EXECPATH \
    node "<v6>/bin/install.js" drive --root "<项目>" \
    --writer "'<v6>/docs/examples/drive/claude-writer.sh'" \
    --reviewer "'<v6>/docs/examples/drive/claude-reviewer.sh'" --json
  ```

  样本 R 每次启动的实际命令行在 R 的 `.ultra/records/p5/scripts/README.md`。
- 样本 R 的 M3 一共启动了 4 次 drive：第 0 次写者没起来（路径没加引号）；第 1、2 次评审都是 `revise`（代码对、检查弱），每次由控制者补检查后再跑；第 3 次用的是“窄核对”评审，只核对上一轮起草的检查有没有照原样补进去、能不能让那些故意改坏的代码变红，结果 `accept`。窄核对脚本在 R 的 `.ultra/records/p5/scripts/claude-confirm.sh`，用 `UBP_PRIOR_REVIEW` 指向上一轮评审。**“评审两轮之后只做窄核对”是这次按合同和你的规则做的，方法里还没有这一条**（上限 11，验收包第 4 节第 18 条）：照方法走，每次 revise 之后都会再评审，在你的真实样本上需要你在两轮后叫停。过程见验收包里的“样本”部分。

## 5. 规划时要注意

- **每个节点都要写 `scope`**，并且检查文件（测试）要放在所有 scope 之外。drive 会拦截两类改动：
  - 改了 scope 之外的路径；
  - 改了检查的 `run` 里点名的文件。

  但测试引用的辅助文件 drive 拦不住。
- **整套测试作为一条检查有冲突。** 如果一条检查是 `npm test`，覆盖已经关闭的需求，那么“先提交红测试，再写代码”会让这条检查立刻变红。v6 自己就遇到过这个问题，处理办法是把新测试放在分支上，等实现好再合进来。更好的做法是让每条检查只跑自己的测试文件。
- **跑 drive 之前先把 `.ultra/` 全部提交。** 工作区不干净，drive 一开始就会停下。drive 停下时，按方法先放回停止原因点名的东西（例如被写者改过的真相文件），再提交它留下的证据行。停在里程碑门时通常只有证据行要提交，提交后再开门。
- **里程碑门的第一步要在干净副本上再跑一次检查**：`git worktree add --detach <临时目录> HEAD`，装好依赖，`ubp check --all --root <临时目录>`，再 `git worktree remove --force <临时目录>`。只存在于被 Git 忽略的文件里的修复，在工作区能过，在 HEAD 上不行；两边结果不一样就停下，找到那个文件并提交。
- **每条需求先列出它的输入类别。** 样本 R 的三个里程碑都是在门评审时才发现检查太弱：先红后绿的测试每条需求只钉了两三个值，评审一次补一批。建议规划和节点完成时，对每句需求列出它接受的输入类别，以及新路径经过的所有旧路由（例如大小写不同的短码在创建、跳转、查询、删除四处都要钉）。这是候选，还没进方法，见验收包第 3 节。
- **并行写者走 `ubp merge <分支> --expect-head <sha>`**，合并后跑一次 `ubp check --all`。

## 6. 它现在做不到的（上限）

- 只有结构性的缩小会被拦住，比如删需求、删检查、缩小覆盖范围。把需求改写得要求更少、在测试里削弱断言，引擎看不出来，只能靠模型自己归类，再由评审把关。
- 引擎分不清 Owner 的话和代理替你说的话；带 `--proxy` 的记录才会标明是代答。
- 合并门在本次交付里只用于 v6 自己的分支，还没有在你的真实项目上跑过。
- Codex 的 hook 送达，是在一次性绕过信任的条件下验证的。在 `/hooks` 里长期信任这条路径还没实测过。
- **被 Git 忽略的文件 drive 看不见。** 写者把修复放进一个 `.gitignore` 忽略的文件，检查在工作区会过，HEAD 上没有这个修复。drive 只拦住了隐藏标记和仓库内设置这两条路；仓库外的 Git 设置（全局、系统、它们包含的文件、`$XDG_CONFIG_HOME/git/ignore`）不在比较之内。稀疏检出会给路径打 skip-worktree 标记，所以在稀疏检出里 drive 永远判工作区不干净，跑不起来。缓解：里程碑门第一步的干净副本重跑，以及示例评审脚本在 `git archive HEAD` 上跑检查。彻底修需要引擎行数，而预算已经用满，要你决定。
- 写者命令起不来（exit 127）也会被当成“节点没完成”，用完重试次数。所以路径有空格时一定要加引号（见第 4 节）。
- **改写历史时 drive 只报第一个问题。** 写者如果既改了真相文件，又用 `--amend` 或 rebase 改写了历史，drive 只报 `truth-touched`。照方法“放回再撤销”处理，伪造的行可能留在 HEAD，也可能连旧提交的正常内容一起撤掉。所以处理任何写者造成的停止之前，先从 `git reflog` 找到尝试前的 HEAD，跑 `git merge-base --is-ancestor <那个提交> HEAD`；不是祖先，就先按 `history-rewritten` 重置分支，再做别的。方法里还没写这一步（上限 15）。
- 写者或评审里的进程如果换到了别的进程组或会话，drive 在超时、中断或写者退出时都清理不到它。写者里的 `ubp` 启动的检查就在别的进程组里，但那个 `ubp` 收到 SIGTERM 时会自己停掉它们，有测试覆盖。`claude -p` 自己会不会把子进程放到别的进程组，没有验证过。
- 完整的上限清单：`.ultra/records/deviations.md` 的“上限”一节，以及 `engine/FORMATS.md` 里所有标为 “Ceiling” 的段落。

## 7. “代答”是什么意思

这次从 P0 到 P5，Owner 介入的地方都由助手按你 11-01 的委托代答了，大多数记在 `owner-touches.md` 里，标着 `proxy: yes`；少数只在决定文件或裁决里，验收包第 4 节写明了每条的位置。这些出口都“未经真实 Owner 验证”。清单在验收包的“过程”部分，你验收时逐条确认或推翻即可。推翻任何一条，都只需要在对应项目里改真相文件，然后跑 `node <v6 工作树>/bin/install.js gate`。
