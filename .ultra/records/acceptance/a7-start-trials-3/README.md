# A7, round 3: the existing-codebase trial on the method of `a3ca72f` (2026-11-12)

The M-P6 gate review, round 3, reproduced a stall the round-2 trial had avoided only through
its own ruling: with the invariant registered as a glob (`36a141f`), a new requirement's red
test under that glob refuses every node planned before the one that turns it green.
`a3ca72f` gives Start step 1 one rule for every test that is red now, and REQ-P6-method's
`Done when` now asks a headless session that adds a behavior and changes one an existing test
pins to reach the milestone gate following the method's text. This trial checks that.

## Setup

- Plugin: `git archive a3ca72f`, `npm ci --ignore-scripts`, then
  `node bin/install.js --claude --global --config-dir /tmp/a7r3-config` with `HOME` set to a
  temporary directory; `--doctor --json`: `healthy`, `6.1.0-rc.0`. The installed `SKILL.md`
  holds the new rule ("a test that is red now"); the installed `references/drive.md` is
  byte-identical to the repository's.
- Session: the round-2 command unchanged (`claude -p … --setting-sources project --plugin-dir
  /tmp/a7r3-config/skills/ultra-builder-pro --model opus --permission-mode acceptEdits
  --allowedTools Bash,Read,Edit,Write,Glob,Grep,Agent`, denying `git push`, `npm publish` and
  `gh`, `--max-budget-usd 25`, `--output-format stream-json`). The init event lists
  `ultra-builder-pro` from `/tmp/a7r3-config` at `6.1.0-rc.0`, the Skill
  `ultra-builder-pro:ultra` and the model `claude-opus-5-5` (xhigh).
- Codebase: Shortlink rebuilt as round 2 started it (`git archive` of `ubp-sample-shortlink`
  at `d90758e` without `.ultra/`, `.gitattributes` and the sample's description, one fresh
  commit); its tree is identical, file for file, to round 2's `cc383bb`. 49/49 tests green.
  The original repository was not touched.
- Prompt: `../a7-start-trials-2/prompt-existing.md`, unchanged. Node 1 adds a behavior (the
  total of visits); node 2 changes one an existing test pins (a deleted link answers 410 已删除
  instead of 404).

## Results

| | Existing codebase (Shortlink) |
|---|---|
| Time, cost, turns | 926 s, $5.20, 66 |
| Invariant | `C-suite`: `node --test --test-reporter=spec test/*.test.cjs`, `expect` a named test line |
| Red tests | the three new checks in `test/m4/`, a directory the invariant's glob does not match; ruling: "a red check inside the invariant would refuse every node" |
| The pinned test | the 404 assertion left `test/delete.test.cjs` (that test now asserts the deleted link redirects nowhere) and became the 410 assertion in `test/m4/deleted.test.cjs` (`C-deleted`), committed red with the other acceptance (`b0f30af`); see `existing-shortlink/pinned-test-move.diff` |
| Characterization | `test/deleted-api.test.cjs` added to the invariant's run, green at the baseline (`C-suite: pass` before any code) |
| Nodes | `N-total` then `N-deleted` (depends on it), each by a fresh subagent writer |
| `ubp node done` refused | never: one completion per node in the ledger; the transcript holds `node N-total: pass` and `node N-deleted: pass` and no `node … fail`; `invariant-not-green` appears only in text read from `FORMATS.md` |
| End | `M4 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次`; `npm test` 50/50 |

## What the trial shows

1. **The method's text now carries the rule.** Round 2's session skipped this milestone's
   test names by a ruling of its own; this session put every red test outside the glob and
   gave the method's reason. Neither node was refused.
2. **The session asked one thing the method leaves open:** its ruling says that after M4
   closes `test/m4/` "has to be folded into the invariant by hand". The method does not say
   whether a test that turned green rejoins the invariant; its requirement's check keeps
   running at every gate and in the controller's ratchet, so nothing is lost if it does not.
3. **It decided against a README requirement** by a ruling (the project has no user
   documentation, and neither behavior changes how Shortlink is installed or run), where the
   method says to make user documentation a requirement.

## Limits

- One sample, one model, proxy answers only; no real Owner was interviewed.
- Not run under `ubp drive` (as in round 2); the round-3 reviewer's drive probes cover that.
- "No refusal" rests on the ledger (one completion per node) and the transcript; the engine
  keeps no record of a refused `node done`.
- The product choices (deletion records in the data file, so an older server refuses that file)
  are the session's, reported in its final message and rulings; they are not judged here.
