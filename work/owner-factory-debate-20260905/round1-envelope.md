# Mission: Claude Code adversarial discussion, round 1 of exactly 2

You are the actual Claude Code participant in an owner-requested adversarial design discussion with Codex. The owner explicitly requests that BOTH participants independently search the internet and support their significant arguments with evidence, not model consensus. You have the capability/context advantage of challenging Codex's analysis from a different agent/harness and independently consulting primary engineering experience and papers. Do not simply endorse the proposal. Choose your own research and reasoning strategy.

## Outcome

Read Codex's frozen initial position, independently investigate its material assumptions, and return a strong evidence-backed critique and alternative for BOTH propositions:
1. What is wrong with current Ultra Builder Pro owner experience, and what changes would measurably improve it?
2. How should the independent automated software factory execute goal/graph engineering over ACP, learn from feedback within a task, and improve future graphs/workflows without uncontrolled goal or permission drift?

Write the owner-facing report in Chinese at:
`/Users/rocky243/Context Engineering/ultra-builder-pro-cli/docs/wip/owner-factory-debate-20260905/01-claude-round1.zh-CN.md`

Include: the strongest objections; evidence for each critical claim with direct primary-source URLs and local file:line where applicable; which conclusions are facts vs inference; source limitations and counterexamples; a concrete competing proposal; questions/issues Codex must resolve in round 2; your actual independent search queries and sources read. Prefer decisive depth to a long bibliography. At least several independently retrieved primary sources are necessary; do not claim to browse if tools fail. Existing Codex sources are starting points, not your independent evidence alone. You may use normal web, Terminal, plugins and adjacent read-only inspection. Return a concise receipt with report path, decisive findings, and any unmet requirement. No rigid output schema is required.

## Starting context (not a limit on exploration)

- Repo root: `/Users/rocky243/Context Engineering/ultra-builder-pro-cli`.
- Frozen proposal: `docs/wip/owner-factory-debate-20260905/00-codex-position.zh-CN.md`.
- Codex's independent evidence: `docs/wip/owner-factory-debate-20260905/evidence-codex.zh-CN.md`.
- Original diagnosis to reassess: `docs/wip/ultra-builder-pro-5.0-owner-experience-diagnosis.zh-CN.md`.
- Existing cumulative factory architecture: `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md` (full Step 1/2/3 intent must not be silently reduced to an MVP).
- Prior owner/Claude conversation: `/Users/rocky243/.claude/projects/-Users-rocky243--claude/7e6fb331-9923-4319-8f9d-504d34e1e340.jsonl`. Owner messages near lines 729, 837, 879, 917, 976, 1015 are useful. Read only visible user/assistant content; private reasoning is unnecessary. Earlier claims may be stale.
- Current independent Goal Skill: `/Users/rocky243/Context Engineering/ultra-goal-skill/plugins/ultra-goal/skills/ultra-goal/`, metadata 2.14.0, especially SKILL.md and references/goal-contract.md, references/graph-topology.md, assets/delegation-package.md, assets/workflow-script.js. The worktree contains uncommitted updates: inspect current bytes.
- Existing ACP Skill: `/Users/rocky243/.codex/plugins/cache/rocky-agent-delegation/agent-delegation/0.1.3/skills/agent-delegation/SKILL.md`; runtime `/Users/rocky243/.local/bin/agent-delegate`, ACPX-based. The owner may mean another new ACP Skill; identity clarification is pending. Treat this as a working assumption rather than a migration commitment.

Owner history: V1 gave a finite, comprehensible process and good first delivery, but drifted after repeated iterations. V2 sought intent alignment, existing-repo iteration and multi-agent automation; actual Research instead became endless professional questioning beyond the owner's expertise and obscured the destination. The owner wants a standalone CLI and eventually PaaS software factory, while UltraGoal remains a separate Skill. They want REAL loops and graph improvement, not just failed-command retries or a renamed checklist.

Current evidence already contradicts parts of the old diagnosis: Task Evidence v2 has four evidence kinds; Goal 2.14 already protects acceptance/verifiers; UBP has ACP drivers; route tests are mostly static; generated host policy differs from source frontmatter. Investigate actual consumer behavior and missing runtime proof instead of assuming no existing primitives.

## Authority and effects

This is authorized research and document writing only. You may read local project/skill/session context and browse public sources, and write the named report plus necessary research notes under this new discussion directory. Do not edit implementation, existing product contracts, existing diagnosis, AGENTS.md, grants, canonical task files or another agent's report. Preserve unrelated dirty worktrees. Do not install/update/uninstall, authenticate, call implementation/qualification agents, commit/push/tag/publish/deploy, send messages to third parties, or mutate production. Do not spawn further agents: this discussion is between Codex and CC. Normal tool capability is available; this paragraph bounds effects, not your research approach.

An unrelated root task-state and active D1 Change are blocked on a specific supplementary owner grant. Do NOT resume them, use their budgets, or interpret this research as that grant. TASK_STATE_DISABLED=1 is set for this isolated one-shot discussion. Complete this round and stop; Codex will send a second-round rebuttal after reading your report.
