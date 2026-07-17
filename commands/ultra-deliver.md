---
description: Converge and deliver a verified baseline or continuous change — reconcile specs, archive evidence, version, tag, and push
argument-hint: "[version-type]"
allowed-tools: Task, Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion
model: opus
workflow-ref: "@skills/ultra-deliver/SKILL.md"
cli_fallback: "direct user interaction"
mcp_tools_required:
  - change.list
  - change.get
  - change.context
  - change.converge
  - change.archive
---

# /ultra-deliver

## 目标

`/ultra-test` 绿灯后，把 active delta 合并回 baseline，重跑发布证据，调用
`change.converge` 与 `change.archive`，再完成版本号、tag、push 和 delivery report。

## 参数

| 位 | 含义 | 缺省 |
|----|------|------|
| `$1` | 版本跳跃（`patch`/`minor`/`major`） | 按 commit 类型自动判断 |

## Workflow

完整流程见 `@skills/ultra-deliver/SKILL.md`（绑定 change → baseline reconciliation →
build/test → release commit → context/convergence/archive → tag/push → report）。

**命令入口做的事**：
1. 读 `.ultra/test-report.json` 验 `passed=true` + `git_commit === HEAD`
2. `git status` 清洁检查；不干净 → 通过 Host 原生提问界面选处理方式
3. 有 active change 时合并 delta、刷新 context，并通过确定性 convergence gate
4. archive 完成后才允许 tag/push
5. 写带 change id、archive path、baseline updates 的 delivery report

## 用法

```bash
/ultra-deliver              # 自动判断版本号
/ultra-deliver major        # 强制 major bump（breaking changes）
/ultra-deliver patch        # 强制 patch
```

## 下一步

部署到 Railway / Vercel，或在 release channel 广播。`delivery-report.json` 里
`pushed=true` 后即可视作发布完成。
