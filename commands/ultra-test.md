---
description: Pre-delivery quality audit — Anti-Pattern + Coverage Gap + Wiring + E2E + Perf + Security
argument-hint: [scope]
allowed-tools: Bash, Read, Write, Edit, Task, Grep, Glob, AskUserQuestion
model: opus
workflow-ref: "@skills/ultra-test/SKILL.md"
mcp_tools_required:
  - task.list
  - ask.question
cli_fallback: "task list"
---

# /ultra-test

## 目标

`/ultra-deliver` 前的项目级质量审计：6 类 gate（Anti-Pattern / Coverage Gap /
Wiring / E2E / Performance / Security）× auto-fix loop。**只读** state.db，
写 `.ultra/test-report.json` 作为 `/ultra-deliver` 的准入凭证。

**注意**：这不是跑单测（那是 `/ultra-dev`）。这是交付前的体检。

## 参数

| 位 | 含义 | 缺省 |
|----|------|------|
| `$1` | 审计范围（`all`/`anti-pattern`/`coverage`/`e2e`/`perf`/`security`） | `all` |

## Workflow

完整 8 步见 `@skills/ultra-test/SKILL.md`（pre-check → 6 gates → auto-fix → persist → report）。

**命令入口做的事**：
1. 探测项目类型 + `task.list` 确认 ≥1 completed
2. 按 scope 跑 gates；失败进 auto-fix（最多 5 轮）
3. 写 `.ultra/test-report.json`（`passed` + gate-level 明细 + blocking_issues）
4. 通过 → 提示 `/ultra-deliver`

## 用法

```bash
/ultra-test                # 全量审计
/ultra-test security       # 只跑安全审计
/ultra-test coverage       # 只找覆盖缺口
```

## 下一步

`passed=true` → `/ultra-deliver`；`passed=false` → 修或跟进 `blocking_issues`。
