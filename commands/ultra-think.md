---
description: Deep analysis with adversarial reasoning — Evidence-First + Multi-Perspective + Stress-Test + Confidence-Quantified recommendation
argument-hint: "[problem or decision to analyze]"
allowed-tools: Read, Grep, Glob, Bash, Write, Task, WebSearch, WebFetch, AskUserQuestion, mcp__exa__web_search_exa, mcp__exa__get_code_context_exa, mcp__context7__resolve-library-id, mcp__context7__query-docs
model: opus
workflow-ref: "@skills/ultra-think/SKILL.md"
mcp_tools_required:
  - ask.question
cli_fallback: "ask"
---

# /ultra-think

## 目标

结构化深度分析复杂问题/决策/诊断。Evidence-First 标注（Fact/Inference/Speculation）+
多视角 + 对抗压测（Steel-Man / Pre-Mortem / Sensitivity / Second-Order）→
量化置信度的推荐 + 验证计划。

## 参数

<problem>
$ARGUMENTS
</problem>

## Workflow

完整 5 步见 `@skills/ultra-think/SKILL.md`（Scope → Evidence → Multi-Perspective →
Adversarial → Synthesis）。

**命令入口做的事**：
1. 读 `$ARGUMENTS` 判定问题范围 — 模糊 → 最多 3 个 `ask.question` 澄清
2. 简单问题 → 直接答；复杂 → 跑完整框架
3. 输出 Markdown 报告（Problem / Analysis / Options / Adversarial / Recommendation /
   Verification / Next Steps）

## 用法

```bash
/ultra-think "should we switch from REST to gRPC for the internal API?"
/ultra-think "why is the deploy pipeline flaky every 3rd run?"
```

## 下一步

方案进入 spec → `/ultra-research` 补证据或 `/ultra-plan` 直接排任务；
纯诊断 → 跟着 Verification Plan 走，取证后再定。
