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

## Correction to round 1

The section above says item 9 was done. Three of its six sub-items were not: the raw `ENOENT`
of `ubp status` before a project starts (an engine change), `git init` and a first commit in
Start, and the README's `--review` path. The heading levels inside `## Project` were left as
specified. The round-2 review found this (`M-P6-review.md`, point 3).

## Rework after the gate, round 2 (2026-11-12)

The Owner answered gate step 4 with "先修 准确地说，全部修复完成了之后，我才会去做测试". Acceptance
first (`45ef203`), then:

- Start step 1: `git init` and a first commit for a directory that is not a repository; the
  invariant registers the runner and a glob, not a list of files; a red or flaky baseline is
  left out of it or fixed by a first `"kind": "cleanup"` node; a test that pins a behavior
  this work changes moves out of the invariant into the requirement's check, rewritten red
  (replaces the round-1 bullet that stalled every earlier node, point 1). The "a behavior
  changes" row of "Changes after 0→1" points to the same rule.
- Session step 1: the design comes from the survey without registering anything the checks
  already hold, and never while a drive runs (point 3, item 4).
- `待复核` names the shared text as a cause, in the method and both READMEs (item 3).
- One `references/review.md` replaces the reviewer instructions of gate step 2 and of
  `claude-reviewer.sh`, which now reads it (`UBP_REVIEW_GUIDE` overrides the path); it adds
  `.ultra/design.md` to what the reviewer reads and asks where the same acceptance could be
  met with less.
- The status table's drive row routes to "A drive in the status" in `references/drive.md`,
  which now holds the whole lock procedure next to `drive-running`.
- `references/drive.md`: the monitor has no filter (problem lines are relayed too), takes
  its longest timeout, relays only lines not yet relayed after a re-arm, and is stopped at
  the drive's completion notice; other hosts tell the Owner `tail -f
  .ultra/.runtime/drive.err`. "Relay each line" now matches the Skill.
- The Roles evidence parenthetical is cut; the rule stays.
- README: the review path in the command table, `git init`, the not-started status, the
  pinned-test rule. CHANGELOG. Version 6.1.0-rc.0 in `package.json` and the lock (the README
  still installs the published 6.0.0).
- SKILL.md: 381 lines. Skill Creator `quick_validate.py`, Claude and Codex copies: valid.

## Noticed and left unchanged (round 2)

- The skip-filter route for moving a pinned test was run only on Node 25.7.0 (by the
  round-2 reviewer); moving the test to another file works with any runner.
- Codex has no equivalent of the Monitor tool that this method relies on; there the Owner
  watches `drive.err` themselves.

## Pinned by no check (round 2)

- Whether a fresh session follows the pinned-test rule on a real codebase: the A7 trial that
  changes a pinned Shortlink behavior judges it.
- The rendered prompt of `claude-reviewer.sh` (checked by hand: the guide follows the
  mission lines).

## Rework after the gate, round 3 (2026-11-12)

- Start step 1 has one rule for every test that is red now (a new requirement's test, a
  pinned test rewritten to the new behavior, a red baseline): it stays out of the invariant's
  run, in a directory the glob does not match or behind the runner's skip filter on a name
  prefix, unless the milestone's first node is a cleanup node that fixes a red baseline. It
  replaces the two clauses that round 3 showed still stall: a new requirement's red test under
  `test/` joined the glob invariant and refused every earlier node.
- Correction to round 2's "moving the test to another file works with any runner": only to a
  file outside the invariant's glob; inside it, the stall stays (round 3, reproduced under drive).
- The "a new behavior" row of Changes after 0→1 names the same rule; the cleaner's "never a
  large refactor" leaves room for the baseline cleanup node; an empty directory's first commit
  is `git commit --allow-empty`.
- Specification: a documentation check reads the README from inside a test file, since a file
  a check's `run` names is off limits to drive writers (`check-touched`).
- The status table's drive row now says to change no file until "A drive in the status" says
  the lock is left over (it may remove the lock).
- `references/drive.md` names `UBP_REVIEW_GUIDE` for a copied example reviewer.
- README (both), CHANGELOG: the same rule. SKILL.md: 384 lines.

## Pinned by no check (round 3)

- Whether a fresh session follows the red-test rule when it adds a behavior and changes a
  pinned one: the A7 rerun of the existing-codebase trial judges it.

## Rework after the round-3 re-check: option A (2026-11-12)

- The Owner chose A ("选A吧"). Start step 1: the invariant is the project's own test command
  and passes when registered (a red baseline left out, or a first cleanup node); every test
  this work adds or rewrites red waits in the milestone's own test directory, which the
  invariant's glob does not match. The skip filter on a name prefix is gone: a new test file
  that loads a module not yet written fails before any filter applies (re-check point 2,
  reproduced on Node 22 and 25).
- Specification: after the acceptance commit, every invariant that was green is still green;
  a red one has a red test in its run. This catches every route, whatever the runner does.
- Milestone gate step 1: first add the milestone's directory to the project's test command and
  the invariant's `run`, with a ruling (an invariant belongs to no milestone, so the gate
  records no plan change); then `check --all`. Probed on a copy of the A7 round-3 project:
  `gate: pass`, every check green again, `npm test` 50 → 59 tests.
- README (both), CHANGELOG, the "a new behavior" row. SKILL.md: 391 lines.

## Pinned by no check (option A)

- Whether a fresh session does the join at gate step 1 from the text alone: the A7 rerun, which
  now runs through gate step 1, judges it.

## Wording after the second re-check (2026-11-12)

- Start step 1: the milestone's directory is kept out of the invariant's run "by the runner's
  own path means" (a glob that does not match it, pytest `--ignore`, a Go package list); plain
  `node --test`, pytest and `go test ./...` find it recursively otherwise. The red-baseline
  sentence no longer contradicts its cleanup exception.
- Specification: the acceptance commit also checks that no test it adds or rewrites red is in
  an invariant's run (read from `run`), which colour alone misses when a red baseline is fixed
  by a first cleanup node. (First written as "no test file this commit adds", which forbade a
  green characterization test; corrected after the reviewer's confirmation.)
- Gate step 1 says "(or drop its exclusion)" for runners that exclude by path.
- Gate step 1: the join's ruling quotes the invariant's `run` before and after, since under
  drive the review comes before the join and the engine records no plan change for it.
- SKILL.md: 394 lines.
