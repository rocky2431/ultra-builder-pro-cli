---
description: Inspect Ultra runtime health and optionally run explicit backup-first mechanical recovery
argument-hint: "[--repair]"
allowed-tools: Read, Bash
model: opus
workflow-ref: "@skills/ultra-doctor/SKILL.md"
mcp_tools_required:
  - system.doctor
cli_fallback: "system doctor"
---

# /ultra-doctor

## 目标

诊断 state.db、projection、incident、session 和 active change artifact 的健康状态。
默认只读；只有显式传入 `--repair` 才允许备份后执行机械恢复。

## Workflow

完整契约见 `@skills/ultra-doctor/SKILL.md`。

1. 默认调用 `system.doctor {"repair": false}`。
2. 只报告失败检查、incident、游标落后和归属边界。
3. `--repair` 时必须先生成 state.db 备份，再恢复 orphan、消费 staleness event、
   重排超时中断或失败的 projection 并重新投影。
4. 修复后重新读取报告；仍 degraded 就明确剩余阻塞，不宣称完成。

## 用法

```bash
/ultra-doctor
/ultra-doctor --repair
```

Memory 和代码图谱属于外部 provider，本命令既不收集也不修复它们。
