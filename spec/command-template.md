# Thin command launcher contract

`commands/*.md` is a host launcher surface, not a second workflow prompt. Each command
routes to exactly one Skill and contains no implementation steps, MCP inventory, model
selection, fallback logic, release history, or host comparison.

## Source shape

```markdown
---
description: <concise user-visible action>
argument-hint: "[optional-arguments]"
workflow-ref: "@skills/<name>/SKILL.md"
---

# <Action title>

Read and follow `@skills/<name>/SKILL.md`, using `$ARGUMENTS` only as invocation input.
Treat the referenced skill as the only workflow definition.
```

The `workflow-ref` name must match the command filename. The body is limited to twelve
lines. Host adapters may translate paths or launcher metadata, but they must not inject
a second procedure.

Run `node spec/scripts/validate-commands.cjs` after editing commands.
