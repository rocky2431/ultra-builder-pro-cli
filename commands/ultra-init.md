---
description: Initialize Ultra Builder Pro project — scaffold .ultra/, seed tasks.json, optional git
argument-hint: <name> <type> <stack> [git]
allowed-tools: Read, Write, Bash, Grep, Glob, AskUserQuestion
model: opus
workflow-ref: "@skills/ultra-init/SKILL.md"
mcp_tools_required:
  - task.init_project
cli_fallback: "task init-project"
---

# /ultra-init

## 目标

搭 `.ultra/` 骨架（specs + tasks + docs + reports）；写入带元数据的 `tasks.json`；
按需初始化 git。4 个 runtime 行为一致，不依赖 Claude 独占工具。

## 参数

| 位 | 含义 | 缺省 |
|----|------|------|
| `$1` | 项目名 | 当前目录名 |
| `$2` | 项目类型（`web`/`api`/`cli`/`fullstack`/`other`） | 从 package 文件识别 |
| `$3` | 技术栈（逗号分隔） | 从 package 文件识别 |
| `$4` | `git` → 初始化 git | 检测已有 `.git/` 时询问 |

## Workflow

完整流程见 `@skills/ultra-init/SKILL.md`（4 步：状态检测 → 参数补全 →
`task.init_project` 拉起骨架 → git 集成）。

**命令入口做的事**：
1. 解析 `$1-$4`，补缺省
2. 探测 runtime 能力：优先走 MCP `task.init_project`；不可达时退回 `ultra-tools task init-project`
3. 按 skill 的 4 步工作流推进
4. 完成后提示下一步命令

## 用法

```bash
/ultra-init                          # 交互模式（自动识别）
/ultra-init my-app                   # 带项目名
/ultra-init my-app api               # 带类型
/ultra-init my-app fullstack react,postgres git  # 完整 + git
```

## 下一步

**CRITICAL**：跑 `/ultra-research` 做 17 步 discovery 把 spec 填满，
**然后**才跑 `/ultra-plan` 生成任务。直接 plan 会产出基于模糊需求的任务。
