---
description: Real-time project status — progress + risks + workflow routing, via MCP task.list
argument-hint: "[task-id]"
allowed-tools: Read, Bash(git status), Bash(git log *), Grep, Glob, Task
model: opus
workflow-ref: "@skills/ultra-status/SKILL.md"
mcp_tools_required:
  - task.list
  - task.get
  - change.list
  - system.doctor
---

# /ultra-status

## 目标

一次调用拿整个项目近况：任务进度（来自 state.db `task.list`）+ 测试状态（`test-report.json`）+
发布状态（`delivery-report.json`）+ active change + runtime health + 下一步命令路由。只读。
任务状态只接受 MCP `task.list`/`task.get`；失败时原样报告并停止，绝不读取
`tasks.json` 冒充权威数据。旧 v4.4 数据必须先执行正式迁移。

## 参数

| 位 | 含义 | 缺省 |
|----|------|------|
| `$1` | 单 task id（只看这个 task） | 不填 → 全局报告 |

## Workflow

完整 5 阶段见 `@skills/ultra-status/SKILL.md`（validation → load → progress → risk → routing）。

**命令入口做的事**：
1. 环境检查（state.db 可达 + 有 task）
2. `task.list` + `change.list` + read-only `system.doctor`；读 test/delivery report
3. 算进度 + 风险（含 projection、incident、context/docs drift）
4. 初始交付后不再显示终局 Done；健康 baseline 的下一项日常工作路由到 `/ultra-change`

## 用法

```bash
/ultra-status            # 项目全局报告
/ultra-status 3          # 只看 task 3
```

## 下一步

看输出的 `▶ Next Up` 块。常见场景：有 pending → `/ultra-dev`；全绿 → `/ultra-test`；
test passed → `/ultra-deliver`；已归档且 baseline 健康 → `/ultra-change`。
