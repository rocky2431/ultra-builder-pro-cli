---
description: Extract one reusable pattern from current session and save (user-gated) to ~/.claude/skills/learned/<name>_unverified.md
argument-hint: "[pattern-name]"
allowed-tools: Read, Write, Grep, Glob, AskUserQuestion
model: opus
workflow-ref: "@skills/learn/SKILL.md"
mcp_tools_required:
  - ask.question
cli_fallback: "ask"
---

# /learn

## 目标

扫当前会话挑一个最值得保存的「可复用模式」，以 Speculation 级别写到
`~/.claude/skills/learned/<slug>_unverified.md`。写入前必问用户确认。

## 参数

| 位 | 含义 | 缺省 |
|----|------|------|
| `$1` | pattern 文件名建议 slug | 由 skill 自动生成 |

## Workflow

完整 5 步见 `@skills/learn/SKILL.md`（review → pick one → draft → 用户确认 → write）。

**命令入口做的事**：
1. 回溯会话找可提炼的模式（错误修复 / 调试套路 / workaround / 项目级惯例）
2. 选一个价值最高的（不是多个 — 一个文件一个模式）
3. 按模板起草 → `ask.question` 让用户选 Save/Edit/Cancel
4. 保存到 `~/.claude/skills/learned/<slug>_unverified.md`（不覆盖已存在）

## 用法

```bash
/learn                       # 自动挑
/learn supabase-rls-debug    # 指定文件名 slug
```

## 下一步

用户以后 review 后手动去掉 `_unverified` 后缀升为 Inference；多次成功使用后升为 Fact。
