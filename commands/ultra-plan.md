---
description: Generate task breakdown from complete specs — walking-skeleton first, vertical slices, via MCP task.create
argument-hint: [scope]
allowed-tools: Read, Write, Edit, Bash(mkdir .ultra/*), Grep, Glob, AskUserQuestion
model: opus
workflow-ref: "@skills/ultra-plan/SKILL.md"
mcp_tools_required:
  - task.create
  - ask.question
cli_fallback: "task create"
---

# /ultra-plan

## 目标

把 `/ultra-research` 验证过的完整 spec 转成可执行的任务计划：先 Walking
Skeleton 贯穿所有层，再切 vertical slices，每 3-4 个 feature task 插一个
Integration Checkpoint。任务写入 state.db（MCP `task.create`），projector
自动生成 `.ultra/tasks/tasks.json` + contexts/*.md frontmatter。

## 参数

| 位 | 含义 | 缺省 |
|----|------|------|
| `$1` | scope 模式（EXPAND / SELECTIVE / HOLD / REDUCE） | 询问用户；默认 SELECTIVE |

## Workflow

完整 8 步流程见 `@skills/ultra-plan/SKILL.md`。

**命令入口做的事**：
1. 探测 spec 完整度 — 未填充则 block 并转 `/ultra-research`
2. 交互选 scope 模式（MCP `ask.question`；Claude 回退 `AskUserQuestion`）
3. 驱动 skill 跑生成 → 依赖分析 → `task.create` 循环 → 写 context-md 正文
4. 跑 7 项 verification（requirement coverage / 无环 / trace_to / 复杂度等）
5. 输出 report + 下一步

## 用法

```bash
/ultra-plan                 # 交互模式；默认 SELECTIVE
/ultra-plan EXPAND          # 直接进入"激进扩张"模式
/ultra-plan REDUCE          # MVP 最小化模式
```

## 下一步

所有 CRITICAL check 过了 → `/clear` 然后 `/ultra-dev` 开始 TDD。
单个 task 完成后 `/ultra-status` 看进度。
