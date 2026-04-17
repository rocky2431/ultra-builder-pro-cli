---
name: ultra-think
description: "Deep analysis with adversarial reasoning — Evidence-First + Multi-Perspective + Steel-Man + Pre-Mortem + Sensitivity. Produces a recommendation with confidence bounds."
runtime: all
mcp_tools_required:
  - ask.question
cli_fallback: "ask"
---

# ultra-think — Phase 3.6

Reasoning harness for complex decisions / diagnostics / architecture calls.
Enforces Evidence-First labelling and adversarial stress-tests before issuing
a recommendation with explicit confidence.

## Workflow

### Step 1 — Scope Check

If the problem is ambiguous / underspecified, ask up to **3** clarifying
questions via `ask.question` (fallback: `AskUserQuestion` / CLI menu).
If the problem is simple, **skip the framework**, answer concisely, and mark
downstream steps `completed` with note `"skipped: simple answer path"`.

### Step 2 — Evidence Gathering

Every factual claim about tech/API/best-practices must be verified via:
- Repo source (Read/Grep)
- Official docs (Context7 MCP: `mcp__context7__query-docs`)
- Community (Exa MCP: `mcp__exa__web_search_exa`)
- Web search (fallback)

Label each assertion:
- **Fact** — verified, cite source (URL / file path)
- **Inference** — deduced from facts (show the derivation chain)
- **Speculation** — unverified; list verification steps the user can run

**Iron law**: never trade accuracy for speed. Wrong-with-confidence > "I don't know + here's how to check".

### Step 3 — Multi-Perspective Analysis

Generate **≥3 distinct approaches**. For each, apply whichever lenses are relevant:
- **Technical** — feasibility, scalability, security, maintainability
- **Business** — value, cost, time-to-market, competitive advantage
- **User** — needs, experience, edge cases, accessibility
- **System** — integration, dependencies, emergent behaviors

### Step 4 — Adversarial Stress-Testing

Apply all four techniques:

| Technique | Question |
|-----------|----------|
| **Steel Man** | For the option you're inclined to REJECT, build its strongest possible case. What do you discover? |
| **Pre-Mortem** | Assume the recommended option has failed in 6 months. List the 3 most likely causes. |
| **Sensitivity** | Which single assumption, if wrong, would reverse your recommendation? |
| **Second-Order** | What new problems does the recommendation create 6-12 months out? |

### Step 5 — Synthesis

Recommendation with quantified confidence (0-100%) and explicit uncertainty bounds.

## Output Structure (adapt to problem type)

### Problem Statement
1-2 sentences: core decision + key constraints.

### Analysis
Deep analysis using relevant lenses from Step 3.

### Options Comparison (skip for diagnostic/investigative problems)
| Criterion | Weight | Option A | Option B | Option C |
|-----------|-------:|----------|----------|----------|
Quantified where possible.

### Adversarial Findings
- **Strongest counter-argument** (steel man for rejected option)
- **Pre-mortem top risk** (most likely failure + mitigation)
- **Assumption sensitivity** (load-bearing assumption)

### Recommendation
- **Choice**: <option>
- **Confidence**: <X>% because <rationale>
- **Key Assumptions**: what must be true
- **What would change my mind**: specific evidence / outcome

### Verification Plan
Concrete steps to validate the decision — metrics, tests, time-boxed experiments.

### Next Steps
Ordered, actionable items.

## MCP → CLI fallback matrix

| Purpose | MCP tool | CLI fallback |
|---------|----------|--------------|
| Clarifying questions | `ask.question` | Claude: `AskUserQuestion`; others: `ultra-tools ask --question …` |

## What this skill DOES NOT do

- Does NOT modify state.db or project files
- Does NOT implement the recommendation (that's `/ultra-dev` after `/ultra-plan`)
- Does NOT replace independent review — output is one model's analysis

## Integration

| | |
|---|---|
| **Input** | the problem statement in `$ARGUMENTS`, optional repo context via Read/Grep, docs via Context7/Exa |
| **Output** | structured Markdown report (Chinese per project rule) |
| **Feeds** | decisions captured in `.ultra/specs/architecture.md` via Dual-Write Mode of `/ultra-dev` |
