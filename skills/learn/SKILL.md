---
name: learn
description: "Extract reusable patterns from current session into skills/learned/<name>_unverified.md; user-gated before write."
runtime: all
mcp_tools_required:
  - ask.question
cli_fallback: "ask"
---

# learn — Phase 3.6

Mine the current session for a reusable pattern and save it as a Speculation-
grade skill under `~/.claude/skills/learned/<name>_unverified.md`. User
confirmation is mandatory before the write — never silently persist.

## Trigger conditions

Run `/learn` after solving a non-trivial problem where the approach is
generalizable (not a one-off typo or outage-specific fix).

## What to extract

| Kind | Example |
|------|---------|
| **Error resolution** | Root cause + fix that applies to similar errors |
| **Debugging technique** | Non-obvious steps, effective tool combos |
| **Workaround** | Library quirk / API limitation / version-specific fix |
| **Project-specific pattern** | Codebase convention / integration pattern discovered this session |

## Workflow

### Step 1 — Review session

Scan recent messages / tool outputs for extractable patterns. Prefer
patterns that saved meaningful time or would have, had they been known upfront.

### Step 2 — Identify the highest-value candidate

Multiple candidates? Pick one. Keep skills focused — **one pattern per file**.

### Step 3 — Draft skill body

Use the **learned-skill template** below. Mark confidence as `Speculation`
and append the `_unverified` suffix to the filename.

### Step 4 — User confirmation (`ask.question` gate)

Present a concise summary (pattern name, one-sentence description, trigger,
proposed filename) to the user and ask to approve the save. Options:
- A: "Save it" → Step 5
- B: "Edit first" → accept user revisions, re-confirm
- C: "Don't save" → abort

### Step 5 — Write file

Path: `~/.claude/skills/learned/<pattern-slug>_unverified.md`.
Never overwrite an existing unverified file — increment the slug
(`pattern-slug-2_unverified.md`) if it already exists.

## Learned-skill template

```markdown
# <Descriptive Pattern Name>

**Extracted**: <YYYY-MM-DD>
**Confidence**: Speculation (unverified)
**Context**: <one-sentence applicability>

## Problem
<what problem does this pattern solve — be specific>

## Solution
<the pattern / technique / workaround>

## Example
<code example if applicable — else a transcribed command sequence>

## Trigger Conditions
<what situations should activate this skill>

## Verification Status
- [ ] Human review passed
- [ ] Multiple successful uses
```

## Verification upgrade path

1. **Speculation** (this skill writes this level) — freshly extracted, unverified
2. **Inference** — after human review passes, remove the `_unverified` suffix
3. **Fact** — after multiple successful uses confirm the pattern

## What NOT to extract

- Simple typo fixes
- One-time issues (API outage, transient CI flake)
- Patterns too project-specific to reuse (belongs in project docs, not a skill)
- Anything the user already wrote in CLAUDE.md or similar project instructions

## MCP → CLI fallback matrix

| Purpose | MCP tool | CLI fallback |
|---------|----------|--------------|
| Confirm before save | `ask.question` | Claude: `AskUserQuestion`; others: `ultra-tools ask --question …` |

## What this skill DOES NOT do

- Does NOT modify state.db
- Does NOT save without user approval
- Does NOT extract more than one pattern per run

## Integration

| | |
|---|---|
| **Input** | current session transcript / recent tool outputs |
| **Output** | `~/.claude/skills/learned/<slug>_unverified.md` |
| **Next** | user may promote after review; `/learn` again later when another pattern appears |
