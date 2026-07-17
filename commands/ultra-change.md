---
description: Start or resume a continuous post-delivery change with bounded context, documentation impact, and linked authoritative tasks
argument-hint: "[change-id or title] [quick|standard|major|incident]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion
model: opus
workflow-ref: "@skills/ultra-change/SKILL.md"
mcp_tools_required:
  - change.create
  - change.update
  - change.get
  - change.list
  - change.context
  - task.create
  - task.list
---

# /ultra-change

## 目标

把初始交付后的日常修复、功能、重构或事故变成一个持续可追踪的 change，避免
代码、spec、测试证据和项目上下文逐步漂移。

## Workflow

完整流程见 `@skills/ultra-change/SKILL.md`：

1. 先查 active/blocked change，匹配则恢复，避免重复创建。
2. 按 `quick / standard / major / incident` 分类并声明 docs impact。
3. 调 `change.create`，为 change 创建至少一个带 `change_id` 的 task。
4. standard/major 写 delta + plan；调 `change.context` 编译最小上下文。
5. 路由到 `/ultra-dev`、`/ultra-test`、`/ultra-review`、`/ultra-deliver`。

Memory 与代码图谱只允许以外部 provider 元数据引用出现；本命令不保存 provider
正文，也不自动刷新外部 provider。

## 用法

```bash
/ultra-change auth-timeout quick
/ultra-change billing-redesign major
/ultra-change incident-2026-07-17 incident
```

## 下一步

输出会给出 change id、artifact root、linked task 与准确的下一个 Ultra workflow。
