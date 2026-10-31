<!-- Subagent research report (harness and context engineering), saved verbatim 2026-10-31. Model output: 'summary' and 'snippet' tags are not byte-checked. -->

# Harness and context engineering for long-running coding agents

Read-only research, fetched 2026-10-31. Status tags: **full** = full page read; **summary** = fetched, quote taken from a model-extracted summary and not byte-checked; **snippet** = search result only. Vendor figures are self-reported.

## Bottom line
Sources agree on five practices: state in files and git; completion judged by an external oracle or evaluator, not self-report; one unit of work per loop with fresh context; bounded tool and hook output; re-testing harness parts when the model changes. They disagree on parallelism, merge-gate strictness, and who decides "done." Evidence is mostly vendor case studies. Comparisons are single runs or internal evals of undisclosed size.

## 1. Progress oracle and denominator
- Anthropic 2025: an initializer writes a JSON feature list (200+ items for a claude.ai clone), all `passes: false`. Coding agents may only flip `passes`. JSON was chosen because models less often overwrite it [1]. No completion percentage is defined [1].
- Anthropic 2026: each sprint negotiates testable criteria before coding; Sprint 3 had 27 [5].
- C compiler: the denominator is test suites ("99% pass rate on most compiler test suites"), with GCC as a reference oracle for kernel files. The verifier must be "nearly perfect, otherwise Claude will solve the wrong problem" [4].
- OpenAI: no numeric denominator; execution plans and per-domain quality grades [6]. Ralph: a TODO list the operator watches [8]. Manus: todo.md rewritten each step over about 50 tool calls [9].

## 2. What stops the loop
- C compiler: the loop "runs forever." The only stop cited is an agent running `pkill -9 bash` [4].
- Ralph: ends when the TODO list runs out "or it goes completely off track," by operator judgment [8].
- OpenAI: PR loops run until all agent reviewers are satisfied; humans are pulled in "only when judgment is required" [6].
- Claude Code `/goal` (official): after each turn, a small model checks the condition. It runs no commands and sees only the transcript. Several turns without tool use stop the loop and return control. A "stop after 20 turns" clause bounds it [11]. Stop-hook continuation is guarded by `stop_hook_active` and an 8-consecutive-continuation cap [15].
- Codex `/goal` (official): the agent stops "when it's confident it has reached the stopping condition." No separate evaluator is described [23].
- Claude Code workflows: 1,000 agents per run, 16 concurrent by default (summary) [13].

## 3. Entropy and drift
- OpenAI: background agents scan for "golden principles" deviations and open small refactor PRs. A doc-gardening agent fixes stale docs. Linter errors carry fix instructions [6]. Manual weekly cleanup "didn't scale" [6].
- Each new session reads git log and progress notes, then runs an end-to-end test to catch broken state left behind [1].
- Fowler: computational sensors (tests, linters, structural checks) reliably catch duplication, complexity, and coverage gaps. Misdiagnosis and overengineering get past both sensor types. AI-generated tests are "not good enough yet" [7]. A May 2026 follow-up reports mixed static-analysis results (snippet; dates conflict) [21].
- C compiler: late regressions led to CI that blocks commits breaking existing code [4].

## 4. Context per worker
- A subagent brief needs objective, output format, tools and sources, and boundaries [3]. Subagents may use "tens of thousands of tokens" but return summaries "often 1,000-2,000 tokens" [2].
- Claude Code subagents start fresh and return only a summary (summary) [14]. Codex subagents inherit the parent's sandbox and approvals, which custom agents cannot override [18].
- C compiler: print a few lines, log details to files, put "ERROR" and the reason on one line for grep [4].
- Instruction budgets: OpenAI's AGENTS.md is about 100 lines, a map into docs/ [6]. Codex stops adding AGENTS.md files at a 32 KiB default cap [19]. Claude Code targets under 200 lines per CLAUDE.md and calls it context, not enforcement [16].
- Hook caps: Claude Code caps hook text at 10,000 characters, spills the excess to a file, and shows a 2,000-character preview. Claude is not asked to read the file (summary) [15]. Codex caps each model-visible hook message at about 2,500 tokens (summary) [20].
- Manus: stable, append-only prefixes; masks tools rather than removing them; files as restorable memory. It calls KV-cache hit rate the top metric but gives no measured rates [9].
- Ralph: fresh context each loop, about 170k usable; the primary context schedules subagents [8].
- Left out by design: raw logs and exploration trails. Per OpenAI, what the agent cannot see in context "effectively doesn't exist" [6].

## 5. Tried and removed
- JSON replaced Markdown for feature lists. Browser tests replaced unit tests plus curl, which missed end-to-end failures [1].
- One large AGENTS.md "failed in predictable ways" [6].
- Manus tried dynamic tool loading and ruled it out unless necessary. It rebuilt its framework four times [9].
- Anthropic 2026: context resets were dropped once Opus 4.5 "largely removed" context anxiety. Sprints and per-sprint grading were removed for Opus 4.6. A radical first simplification lost quality, so parts were removed one at a time [5].
- C compiler: 16 agents "didn't help because each was stuck solving the same task" on the kernel. No orchestrator or agent messaging was built [4].
- Research system: early runs spawned "50 subagents for simple queries," fixed with scaling rules [3].
- Ralph: fanning out build/test subagents is "bad form back pressure" [8].

## 6. Measurements and evidence
- C compiler: 16 agents, about 2,000 sessions over two weeks, 2B input and 140M output tokens, just under $20,000, a 100k-line Rust compiler that builds Linux 6.9. No per-session time or quality metrics [4].
- Anthropic 2026: solo run 20 min/$9 vs. full harness 6 h/$200; DAW run 3 h 50 min/$124.70. Single runs [5].
- Research system: +90.2% over single-agent Opus 4 on an internal eval (size undisclosed). Multi-agent uses about 15x chat tokens. Token use explains 80% of BrowseComp variance [3].
- OpenAI: about 1M lines and 1,500 merged PRs. "About 1/10th the time" is an estimate [6]. A separate Codex blog reports one 25-hour run, about 13M tokens, about 30k lines, labeled an experiment. The page has no date [22].
- ACE: +10.6% on agents, +8.6% on finance. Cost and latency gains are stated without numbers [10].
- Ralph's "$50k contract for $297" is a shared iMessage, unmeasured [8].

## 7. Native features (official docs)
- Claude Code: `/loop` runs on an interval and stops when Claude judges the work done [11]. Agent teams are experimental and off by default; a `TaskCompleted` hook can block completion [12][15]. Dynamic workflows are rerunnable scripts that orchestrate subagents [13]. Subagents nest three levels by default [14].
- Codex: `/goal` with pause, resume, and clear, behind `features.goals` if missing [23]. Subagents are on by default [18]. Hooks are on by default (summary) [20]. A goal needs an outcome, constraints, and verification [17].
- Many features are version-gated; check the installed build [11][13].

## 8. Synthesis
**Agreed (3+ sources):**
1. Files and git hold state; handoffs go through files, not chat [1][4][6][9].
2. Completion comes from external checks, not self-report [1][4][5][7][11].
3. One unit per loop, fresh context per worker [1][5][8].
4. Tool and hook output is bounded and greppable [4][15][20].
5. Harness parts encode model assumptions and need re-testing [2][5].

**Disputed:**
1. Parallelism. The research system finds gains on breadth tasks, but "most coding tasks involve fewer truly parallelizable tasks" [3]. The C compiler parallelized tests, not one large task [4]. Ralph opposes fan-out [8]. OpenAI uses long single runs [6][22].
2. Merge gates. OpenAI prefers "minimal blocking merge gates" because corrections are cheap [6]. The C compiler added strict CI after regressions [4].
3. Who decides done. Claude's `/goal` uses a separate evaluator. Codex's docs describe stopping on the agent's own confidence [11][23].
4. Tool sets. Minimal toolsets and just-in-time data loading [2], versus no mid-run tool changes to protect the KV cache [9].
5. Agent-driven verification. OpenAI has agents write all tests [6], and Anthropic's evaluator drives the app with Playwright [5]. Fowler says this is "not good enough yet" [7].

## 9. Implications for your failure modes (inference, not verified here)
- Non-terminating loops: turn, time, and agent-count caps plus an "N rounds without progress" stop rule, similar to the workflow and Stop-hook caps [13][15].
- Model-asserted completion: use a separate evaluator and require acceptance-command output in the transcript, since `/goal`'s evaluator sees only transcript text [11].
- Doc drift: CI checks for links and freshness, plus cleanup agents that open fix PRs [6].
- Hook flooding: adopt spill-to-file caps with pointers, as Claude and Codex do [15][20].
- Locally perfect, globally broken: a full regression gate plus one final whole-build evaluation. Anthropic kept an end-of-run evaluation after dropping per-sprint checks [4][5].
- Risk not yet raised: "it is easy to see tests pass and assume the job is done" [4].

## Gaps
- ACE's method and ablations were not read; the PDF did not parse [10].
- Fowler's May 2026 follow-up is snippet-only with conflicting dates [21].
- No 2026 OpenAI follow-up on garbage collection was found.

## Sources
[1] Anthropic, Effective harnesses for long-running agents, 2025-11-26, full: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
[2] Anthropic, Effective context engineering for AI agents, 2025-09-29, full: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[3] Anthropic, How we built our multi-agent research system, 2025-06-13, full: https://www.anthropic.com/engineering/multi-agent-research-system
[4] Anthropic, Building a C compiler with a team of parallel Claudes, 2026-02-05, full: https://www.anthropic.com/engineering/building-c-compiler
[5] Anthropic, Harness design for long-running application development, 2026-03-24, full: https://anthropic.com/engineering/harness-design-long-running-apps
[6] OpenAI, Harness engineering: leveraging Codex in an agent-first world, 2026-02-11, full: https://openai.com/index/harness-engineering/
[7] Böckeler, Harness engineering for coding agent users, 2026-04-02, full: https://martinfowler.com/articles/harness-engineering.html
[8] Huntley, Ralph Wiggum as a "software engineer", 2025-07-14, full: https://ghuntley.com/ralph/
[9] Ji, Context Engineering for AI Agents (Manus), 2025-07-18, full: https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
[10] Zhang et al., Agentic Context Engineering, arXiv:2510.04618, abstract only: https://arxiv.org/abs/2510.04618
[11] Claude Code docs, Keep Claude working toward a goal, full: https://code.claude.com/docs/en/goal.md
[12] Claude Code docs, Orchestrate teams of Claude Code sessions, summary: https://code.claude.com/docs/en/agent-teams.md
[13] Claude Code docs, Orchestrate subagents at scale with dynamic workflows, summary: https://code.claude.com/docs/en/workflows.md
[14] Claude Code docs, Create custom subagents, summary: https://code.claude.com/docs/en/sub-agents.md
[15] Claude Code docs, Hooks reference, summary plus grep of full text: https://code.claude.com/docs/en/hooks.md
[16] Claude Code docs, How Claude remembers your project, grep of full text: https://code.claude.com/docs/en/memory.md
[17] Codex docs, Long-running work, full: https://learn.chatgpt.com/docs/long-running-work.md
[18] Codex docs, Subagents, full: https://learn.chatgpt.com/docs/agent-configuration/subagents.md
[19] Codex docs, Custom instructions with AGENTS.md, full: https://learn.chatgpt.com/docs/agent-configuration/agents-md.md
[20] Codex docs, Hooks, summary: https://learn.chatgpt.com/docs/hooks.md
[21] Böckeler (via Fowler), maintainability sensors follow-up, snippet: https://techreport.ngo/engineering/maintainability-sensors-for-coding-agents/
[22] OpenAI, Run long horizon tasks with Codex, full, undated: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
[23] OpenAI, Follow a goal (Codex use case), full: https://developers.openai.com/codex/use-cases/follow-goals
