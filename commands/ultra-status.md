---
description: Real-time project status — progress + risks + workflow routing, via MCP task.list
argument-hint: "[task-id]"
allowed-tools: Read, Bash(git status), Bash(git log *), Grep, Glob, Task
model: opus
workflow-ref: "@skills/ultra-status/SKILL.md"
mcp_tools_required:
  - task.list
  - task.get
cli_fallback: "task list"
---

# /ultra-status

## 目标

一次调用拿整个项目近况：任务进度（来自 state.db `task.list`）+ 测试状态（`test-report.json`）+
发布状态（`delivery-report.json`）+ 风险检测 + 下一步命令路由。只读。

## 参数

| 位 | 含义 | 缺省 |
|----|------|------|
| `$1` | 单 task id（只看这个 task） | 不填 → 全局报告 |

## Workflow

完整 5 阶段见 `@skills/ultra-status/SKILL.md`（validation → load → progress → risk → routing）。

**命令入口做的事**：
1. 环境检查（state.db 可达 + 有 task）
2. `task.list` 拿全量；读 test-report / delivery-report
3. 算进度 + 风险（blocked / stalled / overdue / complexity spike / test stale）
4. 按当前 artifact 组合路由到下一个命令（/ultra-init → /ultra-research → /ultra-plan → /ultra-dev → /ultra-test → /ultra-deliver）

## 用法

```bash
/ultra-status            # 项目全局报告
/ultra-status 3          # 只看 task 3
```

## 下一步

看输出的 `▶ Next Up` 块。常见场景：有 pending → `/ultra-dev`；全绿 → `/ultra-test`；
test passed → `/ultra-deliver`。
