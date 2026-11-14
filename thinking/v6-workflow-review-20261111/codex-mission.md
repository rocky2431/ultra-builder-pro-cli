# Mission: independent review of the UBP v6 workflow

You are an independent reviewer. You have never seen the author's reasoning, and you should
not try to reconstruct it. Read the sources yourself and form your own view.

## What the Owner asked (verbatim, Chinese)

First message: "我们目前在里面还要写 spec 文档吗？文档这块是怎么处理的？现在还有原来那个 research 的环节吗，还是说已经没有了？"

Second message, after an earlier answer went down the wrong path because "research" was
transcribed as "architecture": "我合理怀疑其他地方也有问题。所以我希望你能重新以不同的视角，
review 一下我们整个流程。包括：流程怎么写入？写入什么？谁来写入？谁来改？中间的机械设置会不会
阻碍模型的智能？类似这些各种各样的问题，反正就针对我们之前遇到的情况，能不能再做一轮比较深入的
review？之后我们再看是不是需要改、具体怎么改。"

## Goal

Judge whether the v6 workflow, as written and as it actually ran, serves the Owner: a person who
wants an AI host (Claude Code or Codex) to take a software project from intent to working product
and keep it correct through later changes, with the Owner touched only where their judgment is
needed. Find where the workflow loses information, puts a decision in the wrong hands, asks for
work nobody consumes, or constrains the model where it should not (and where it is too loose).
Ground every finding in what actually happened where possible.

## Sources (repository root: this directory, `ultra-builder-pro-cli`)

The method and its contracts:
- `skills/ultra/SKILL.md` — the whole method the host model follows.
- `engine/FORMATS.md` — file formats, who writes each file, gates, exit codes.
- `engine/*.cjs` — the engine itself (`context.cjs` compiles the writer's brief).
- `docs/examples/drive/claude-writer.sh`, `claude-reviewer.sh` — unattended writer/reviewer prompts.
- `hooks/session-start.cjs` — the only hook.

Why it is shaped this way (the plan of record and later decisions):
- `thinking/back-to-essentials-20261030/RESULT.md` and `research/01-06` there (01 is a catalog of
  failures across earlier Ultra versions).
- `thinking/v6-remaining-problems-20261102/RESULT.md`, `THOUGHTS.md`.

What actually happened:
- This repo built itself with v6: `.ultra/` (spec, checks, plan, `rulings.md`,
  `records/deviations.md`, `records/owner-touches.md`, `records/milestones/*`,
  `records/experiments/`).
- The first sample project: `../ubp-sample-shortlink/` (its `.ultra/` truth files, interview,
  handoffs, milestone reviews, rulings, owner touches, `records/p3`, `records/p5`).
- A drive smoke project: `../ubp-v6-drive-smoke/`.
- `git log` in each.

Earlier versions are in git history (`git show 5fe3d9b --stat` lists what v6 deleted, for example
the `ultra-research`, `ultra-plan`, `ultra-init` skills and `.ultra-template/specs/*`). Read them
only when comparing what was dropped.

## Questions to answer

For each, say what is written, by whom, read by whom, changed by whom, and whether the answer is
good for the Owner:
1. Write path: from the Owner's first words to merged code and a closed milestone, what gets
   written, in which file, by which role, and who reads it next. Where does information get
   produced and then never consumed, or needed and never produced? (Examples of the kind of thing
   to look for, not conclusions: research or investigation before specifying; product
   documentation; decisions reaching writers.)
2. Authority: who may write and change each artifact; are those the right hands; where does one
   agent hold roles that should be separate, or where is the Owner asked for what the model could
   decide (or not asked for what only the Owner can decide)?
3. Mechanics vs intelligence: which engine gates, formats, budgets and method rules constrain
   the model; for each, what weakness it compensates, whether that weakness was observed, and
   whether it blocked good work. Also the reverse: where the model is left to judge something a
   machine should hold.
4. Anything else you find that the Owner would want to know before deciding what to change.

## Output

Return your review as your final message, in Chinese. No file edits, no commits, no installs:
this is read-only. For each finding give:
- the claim in one sentence;
- evidence as `path:line` (or a command and its output);
- whether it happened in a real run, was constructed by a reviewer, or is your inference;
- the harm the Owner would see;
- optionally one line on the direction of a fix (not a design).

Rank findings by harm to the Owner. Then list what works and should not be changed, with
evidence. Also answer the Owner's first-message questions directly (spec, documentation,
research). Prefer fewer, well-evidenced findings to a long list.
