# Ultra Builder Pro 6

意图是源码，计划是编译产物，进度由计算得出，变更是一份 diff。

UBP 为 Claude Code 和 Codex 提供一个 `ultra` Skill、确定性的 `ubp` 引擎和一个
SessionStart hook。模型负责判断，引擎从项目文件与可执行检查计算进度。需要 Node.js 22
或更新版本，以及 Git。

## 安装

```sh
npm install -g ultra-builder-pro-cli@6.1.0
ubp --claude --global
ubp --codex --global
# 或一次安装两个宿主：
ubp --all --global
```

使用 `--config-dir <dir>` 隔离安装；`--all` 会为两个宿主分别建立子目录。
仅 Claude Code 支持 `--local`。Codex 只安装到用户范围：`--codex` 默认采用用户范围；
`--codex --local` 会报错，除非使用 `--config-dir` 隔离安装。
用 `ubp --all --global --doctor --json` 检查安装，用
`ubp --all --global --uninstall` 卸载托管资源。

每个安装后的插件都携带引擎副本。Skill 写明其绝对 Node 调用路径，所有引擎命令始终使用这个副本，
不采用 PATH 上其他版本的 `ubp`。不需要 Python。

## 第一次会话

在 Claude Code 项目中调用 `/ultra`（完整名称 `/ultra-builder-pro:ultra`）；
在 Codex 中调用 `$ultra-builder-pro:ultra`。运行 `ubp status` 查看当前状态；还没开工的项目，它会如实说明。没有 `.ultra/spec.md`
的项目，无论是空目录还是已有代码，都从四步开工：摸清现有情况；只调查答案会改变需求、检查或计划的
未知问题；其余的问 Owner；由 Owner 确认 Direction 和每条 `Done when`。之后再写验收检查和里程碑
计划。还不是 Git 仓库的目录先 `git init` 并做第一次提交。已有代码库的摸底会记下它怎么构建、运行和
测试，并把现有测试命令登记成每个节点都要保持通过的不变量。这次新写或改写成红的测试（新需求的测
试、钉住了 Owner 要改的行为的测试）放在里程碑自己的测试目录里，不进不变量的运行，所以不会因为后面
节点才变绿的测试拦住前面的节点；到里程碑门时，这个目录并入项目的测试命令和不变量。

`.ultra/design.md` 记录项目当前知道的东西：系统现状、当前有效的设计决定，以及调查查清的事实和来源。
它由规划者维护，写者不改；每份节点简报都会带上它和 spec 的 Direction、Interface。进度行里，
`已关闭里程碑 n 项待复核` 指检查上次都通过、之后过期的已完成工作：代码提交后重跑即可，改过需求、检查或
spec 的共享文字时，对应节点可能要返工；`未绿` 指最近一次检查失败或从未运行。

SessionStart hook 仅在 `.ultra/spec.md` 存在时打印进度和使用 `ultra` 的提示，在 drive 的写者或评审
会话里（`UBP_DRIVE`）不输出；
它不自动启动工作，也不写项目文件。

Codex 用户需先在 `/hooks` 中审阅并信任插件 hook；未信任前会跳过它。定义变更后需重新信任。
即使尚未信任 hook，Skill 的第一步 `ubp status` 仍会显示进度行。
详见 [Codex hook 信任规则](https://learn.chatgpt.com/docs/hooks)。

## 命令

| 命令 | 用途 |
| --- | --- |
| `ubp status` | 计算进度和下一步 |
| `ubp gate` | 校验计划并记录基线 |
| `ubp check [ids]` | 执行检查并记录证据 |
| `ubp node done <id>` | 在需求为绿时完成节点 |
| `ubp context <id>` | 编译节点简报 |
| `ubp milestone close <id> --owner "原话" --review .ultra/records/milestones/<id>-review.md` | 关闭已评审里程碑 |
| `ubp approve <items> --owner "原话"` | 记录缩减范围的批准 |
| `ubp retro` | 列出重复失败类别 |
| `ubp merge <branch> --expect-head <sha>` | 校验并合并工作分支 |
| `ubp drive --writer <cmd> [--reviewer <cmd>]` | 无人值守地推进节点，直到下一个需要 Owner 的点 |

引擎命令接受 `--root <dir>` 和 `--json`。文件格式、退出码见
[引擎合同](engine/FORMATS.md)，工作方法与批准边界见 [ultra](skills/ultra/SKILL.md)。

## 从 5.x 迁移

v6 用一个方法替代十四个 `ultra-*` Skills，用一个 Node 提示 hook 替代五个 Python hooks。
移除了 OpenCode、Kimi、Grok、ZCode 适配器、`run`、`delegate`、ACP/Pi 执行、durable grants、
wake-up 机制和旧项目模板，避免多个入口争夺下一步；下一步由引擎状态决定。
旧项目记录不会自动转换为 v6 格式。

仍需旧工作流时，在独立配置目录使用最后发布的 5.x 版本 5.0.1（5.0.2 从未发布）；旧源码可从 Git 历史恢复。
另见 [变更记录](CHANGELOG.md) 和 [插件边界](docs/PLUGIN-ISOLATION-CONTRACT.md)。
