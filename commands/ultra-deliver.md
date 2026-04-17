---
description: Release preparation — docs + build + version bump + tag + push, gated by /ultra-test pass
argument-hint: "[version-type]"
allowed-tools: Task, Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion
model: opus
workflow-ref: "@skills/ultra-deliver/SKILL.md"
mcp_tools_required:
  - ask.question
cli_fallback: "ask"
---

# /ultra-deliver

## 目标

`/ultra-test` 绿灯后做发布准备：更新 CHANGELOG + technical-debt + README →
production build → 版本号 + git tag + push。写 `.ultra/delivery-report.json`。

## 参数

| 位 | 含义 | 缺省 |
|----|------|------|
| `$1` | 版本跳跃（`patch`/`minor`/`major`） | 按 commit 类型自动判断 |

## Workflow

完整 5 步见 `@skills/ultra-deliver/SKILL.md`（validations → 文档 → build → 版本发布 → 产物报告）。

**命令入口做的事**：
1. 读 `.ultra/test-report.json` 验 `passed=true` + `git_commit === HEAD`
2. `git status` 清洁检查；不干净 → `ask.question` 选处理方式
3. 驱动 skill 跑文档 + build + 版本 + tag + push
4. 写 `.ultra/delivery-report.json`
5. 输出 release summary

## 用法

```bash
/ultra-deliver              # 自动判断版本号
/ultra-deliver major        # 强制 major bump（breaking changes）
/ultra-deliver patch        # 强制 patch
```

## 下一步

部署到 Railway / Vercel，或在 release channel 广播。`delivery-report.json` 里
`pushed=true` 后即可视作发布完成。
