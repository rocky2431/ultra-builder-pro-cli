# Ultra Builder Pro 6

意图是源码，计划是编译产物，进度由计算得出，变更是一份 diff。

UBP 为 Claude Code 和 Codex 提供一个 `ultra` Skill、确定性的 `ubp` 引擎和一个
SessionStart hook。模型负责判断，引擎从项目文件与可执行检查计算进度。需要 Node.js 22
或更新版本，以及 Git。

## 安装

```sh
npm install -g ultra-builder-pro-cli@6.0.0
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
在 Codex 中调用 `$ultra-builder-pro:ultra`。运行 `ubp status` 查看当前状态。没有 `.ultra/spec.md`
的项目从访谈开始，再形成规格、验收检查和里程碑计划。

SessionStart hook 仅在 `.ultra/spec.md` 存在时打印进度和使用 `ultra` 的提示；
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
| `ubp milestone close <id> --owner "原话" --review <file>` | 关闭已评审里程碑 |
| `ubp approve <items> --owner "原话"` | 记录缩减范围的批准 |
| `ubp retro` | 列出重复失败类别 |
| `ubp merge <branch> --expect-head <sha>` | 校验并合并工作分支 |

引擎命令接受 `--root <dir>` 和 `--json`。文件格式、退出码见
[引擎合同](engine/FORMATS.md)，工作方法与批准边界见 [ultra](skills/ultra/SKILL.md)。

## 从 5.x 迁移

v6 用一个方法替代十四个 `ultra-*` Skills，用一个 Node 提示 hook 替代五个 Python hooks。
移除了 OpenCode、Kimi、Grok、ZCode 适配器、`run`、`delegate`、ACP/Pi 执行、durable grants、
wake-up 机制和旧项目模板，避免多个入口争夺下一步；下一步由引擎状态决定。
旧项目记录不会自动转换为 v6 格式。

仍需旧工作流时，在独立配置目录使用 5.0.2；旧源码可从 Git 历史恢复。
另见 [变更记录](CHANGELOG.md) 和 [插件边界](docs/PLUGIN-ISOLATION-CONTRACT.md)。
