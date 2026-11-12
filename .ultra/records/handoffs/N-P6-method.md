# Handoff: N-P6-method

Writer: the controller (main session), per ruling 2026-11-12 L2 (the method is model-facing
text; C-method-p6 is structural, the method's effect is judged by the milestone review and
the headless start trials, A7).

## What changed

- `skills/ultra/SKILL.md`: "0→1 interview" became "Start (new or existing project)" in four
  steps (survey, investigate only what decides something, interview, Owner confirms the
  Direction and every `Done when`). New section "Project knowledge (`.ultra/design.md`)":
  three sections, the planner writes it, writers never edit it, every brief carries it, the
  controller folds writers' L2 rulings and handoff constraints into it at Node loop step 4,
  the cleaner checks it against the code. Escalation has a row for a fact nobody knows. The
  milestone review reads `.ultra/records/interview.md` and the owner-touches lines since the
  previous closure and uses the product through its user documentation; the spec section
  makes user documentation a requirement. The status line is reported after every node and
  every gate step; `待复核` and `未绿` are explained. The reduction test is "who gets less".
  Drive and merge handling moved out; SKILL.md is 393 lines (was 395).
- `skills/ultra/references/drive.md`, `references/merge.md`: the drive start, progress lines,
  every stop, the merge setup, gate and every refusal, moved with their wording kept; added
  the stderr event format and the design fold after a stop or merge.
- `docs/examples/drive/claude-writer.sh`: the brief's Project section is named; Never edit
  includes `.ultra/design.md`. `claude-reviewer.sh`: reads the design and the Owner's words,
  blocks a spec that departs from them, uses the product through its user documentation.
- `README.md`, `README.zh-CN.md`: the four-step start, `.ultra/design.md`, `待复核` vs `未绿`.
  `CHANGELOG.md`: an Unreleased section for M-P6.

## What dependent nodes must know

- The method names `references/drive.md` and `references/merge.md` by relative path; the
  installer copies the whole `skills/ultra` directory and replaces placeholders only in
  `SKILL.md`, so the references say "`ubp` is the engine command `SKILL.md` defines".

## Noticed and left unchanged

- The merge gate refuses a branch that changes `.ultra/design.md` through its existing rule
  (anything under `.ultra/` except evidence, node lines, rulings and records); the method now
  says so, but no merge test pins it for `design.md` specifically.
- `engine/FORMATS.md`'s authorship table is the engine node's to update for `design.md`.

## Pinned by no check

- Whether a writer actually uses the `## Project` section, and whether a fresh session follows
  the four start steps on an existing codebase: A7 trials and the milestone review judge it.
- The README and CHANGELOG wording.

## Rework after the gate review, round 1 (2026-11-12)

The round-1 review (`.ultra/records/milestones/M-P6-review-1.md`) accepted with no blocking
finding. The controller fixed the method items under "What must be said to the Owner" before
asking the Owner, so the gate starts again at step 1 with a full review:

- Start step 1: run the existing tests first; a red or flaky baseline goes under `## Facts`
  and is either the first node or left out of the invariant; `timeout_sec` above the
  measured run (item 5). A behavior an existing test pins changes through a requirement whose
  acceptance author rewrites that test, committed red (item 1).
- Session step 1: a spec without `.ultra/design.md` gets one from a survey before any node
  (item 4).
- `待复核` explained as "last passed and went stale" in the method and both READMEs (item 3).
- `expect` example `^\s*✔ <name>` (indented inside `describe`) and other runners, in the
  method and `engine/FORMATS.md`; verified on Node 25.7.0 with a nested test (item 6).
- `references/drive.md`: in Claude Code, stderr to `.ultra/.runtime/drive.err` watched with
  the Monitor tool; a probe in this host delivered each `drive:` line as its own
  notification while the writer was still running, and the monitor expired as documented
  (item 2). The `all-done` stop has a bullet (item 9).
- A check never reads `.ultra/design.md` either; the zh README says the hook is silent inside
  a drive (item 9).
- To stay within 395 lines and keep one place per policy, the Skill's drive and merge
  paragraphs now only route to the references (the scope, commit and branch rules live
  there), and a repeated "every brief carries" sentence is gone. SKILL.md: 393 lines.

Not done (the Owner decides): this repository's own Direction, design and per-test
`expect` (ruling 2026-11-12); one `references/review.md` for the three copies of the review
instructions, moving the status table's drive row into `drive.md`, and `milestone close`
without `--review` (each changes a closed milestone's acceptance or the CLI); the package
version (pinned at 6.0.0 by `tests/v6-package.test.cjs`).
