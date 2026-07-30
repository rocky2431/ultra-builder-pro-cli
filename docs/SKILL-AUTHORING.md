# Skill authoring contract

Ultra Builder Pro keeps one portable source workflow and adapts only runtime metadata
or host invocation details. This contract follows OpenAI Skills guidance and the Agent
Skills progressive-disclosure format:

- <https://learn.chatgpt.com/docs/build-skills>
- <https://learn.chatgpt.com/docs/customization/overview>
- <https://agentskills.io/specification>
- <https://agentskills.io/skill-creation/best-practices>

## Surface ownership

| Content | Owner |
|---|---|
| Repeatable task procedure and conditional references | `skills/<name>/SKILL.md` |
| Codex display, invocation policy, and dependencies | `skills/<name>/agents/openai.yaml` after adaptation |
| Host launcher | `commands/<name>.md` |
| Durable repository or user engineering policy | `AGENTS.md` or the host equivalent |
| Deterministic lifecycle enforcement | one hook implementation |
| Live external data or actions | MCP server or connector |
| Bounded delegated role | `agents/<name>.md` |

Do not duplicate a rule across these surfaces.

## Portable `SKILL.md`

Source frontmatter contains only `name` and `description`. The description says what
the Skill does and when it should activate. The body uses imperative, outcome-oriented
steps and includes only information an agent cannot reliably infer from the task,
repository, or host policy.

Keep the main file compact. Move conditional domain detail to `references/`, reusable
deterministic work to `scripts/`, and output material to `assets/`. Reference a file
only from the main workflow or one directly relevant reference.

## Language

The standards do not prohibit Chinese. Ultra source prompts use English as a project
policy because one source is transformed for Claude Code, Codex, OpenCode, Kimi Code,
and Grok Build. The host or user instruction controls the response language; a workflow must not
hard-code the user's output language unless language is itself part of the task.

Maintainer documentation may use the language appropriate for its audience. English
source prompts are a portability rule, not a claim that multilingual Skills are invalid.

## Content that does not belong in a Skill prompt

- release notes, migration history, old-version behavior, or implementation diary;
- host tool inventories, model pins, package paths, and dependency metadata shared by
  only one runtime;
- generic engineering doctrine already owned by user or repository instructions;
- one-off project facts, volatile external facts, or copied datasets;
- duplicated command bodies, hook policy, MCP schemas, or private memory behavior;
- arbitrary coverage, confidence, complexity, option-count, or severity thresholds;
- pattern matching that turns TODOs, mocks, catch blocks, or line counts directly into
  findings without a reachable impact;
- tutorial-style old/new or good/bad comparisons that do not change the workflow;
- menus of hypothetical alternatives when one repository default already satisfies the
  contract.

Comparison is appropriate only when the task requires a real decision or verification:
compare credible alternatives against shared constraints, accepted specification
against delivered behavior, or independent analyses against authoritative evidence.

## Review checklist

1. Does the description state a precise use condition?
2. Is every instruction reusable for this Skill rather than copied global policy?
3. Is host-specific metadata outside the portable prompt?
4. Does each conditional reference earn its context cost?
5. Are judgments evidence-based rather than threshold-based?
6. Are commands thin and agents bounded?
7. Do positive and negative trigger evals cover accidental activation?
8. Do source, five generated runtimes, and package contents pass validation?
