---
description: Agile development execution — one task through TDD + review gate, writing state via MCP task.update
argument-hint: "[task-id]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, AskUserQuestion, Skill
model: opus
workflow-ref: "@skills/ultra-dev/SKILL.md"
mcp_tools_required:
  - task.update
  - task.get
  - task.list
  - review.run
cli_fallback: "task update"
---

# /ultra-dev

## 目标

把一个 task 从 `pending` 推到 `completed`：进入 feature 分支 → RED/GREEN/REFACTOR
TDD → 质量门 → `/ultra-review all` → 完成 → commit/merge。**单写**：状态只通过
MCP `task.update` 改一次；projector 自动更新 tasks.json + context-md frontmatter。

## 参数

| 位 | 含义 | 缺省 |
|----|------|------|
| `$1` | task id | 拓扑序第一个 `pending` |

## Workflow

完整 8 步流程见 `@skills/ultra-dev/SKILL.md`（Resume Check → Design Gate → 选 task →
状态 in_progress → 环境 → TDD → 质量门 → checkpoint → review → 完成 → commit/merge → report）。

**命令入口做的事**：
1. 读 `.ultra/workflow-state.json` 决定新跑 vs resume
2. 首跑触发 Design Approval Gate（`ask.question`）
3. 驱动 skill 走 TDD + review 循环；状态仅通过 MCP `task.update`（双写消除）
4. Step 4.5 review 优先走 MCP `review.run`；不可达回退 `Task`/`ultra-tools subagent run`
5. Step 4.4 pre-review checkpoint 用 `session.checkpoint`（Phase 5 前回退 workflow-state.json；不再依赖 `/compact`）

## 用法

```bash
/ultra-dev          # 自动选下一个 pending task
/ultra-dev 3        # 直接做 task 3
```

## 下一步

单个 task 完成后自动提示下一个 `/ultra-dev`；所有 Walking Skeleton +
critical-path task 完成 → `/ultra-test` 做交付前质量审计。
