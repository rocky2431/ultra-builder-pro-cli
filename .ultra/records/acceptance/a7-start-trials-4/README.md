# A7, round 4: the existing-codebase trial on option A's method (`ef37b09`, 2026-11-12)

The round-3 re-check found two problems with `a3ca72f`'s rule for red tests. A new test file
that loads a module not yet written fails before the runner's skip filter applies. And tests
kept outside the invariant's glob never reach the project's own test command. The Owner chose
option A ("选A吧"):

- every test the milestone adds or rewrites red waits in the milestone's own test directory;
- after the acceptance commit, every invariant that was green is still green;
- at milestone gate step 1, that directory joins the project's test command and the invariant.

This trial checks whether a fresh session does all three from the text alone.

## Setup

- **Plugin:**
  - `git archive ef37b09`, then `npm ci --ignore-scripts`, then
    `node bin/install.js --claude --global --config-dir /tmp/a7r4-config` with `HOME` set to a
    temporary directory.
  - `--doctor --json`: `healthy`, `6.1.0-rc.0`.
  - The session's init event lists `ultra-builder-pro` from `/tmp/a7r4-config` at
    `6.1.0-rc.0`, the Skill `ultra-builder-pro:ultra`, and the model `claude-opus-5-5`
    (xhigh).
- **Session:** the round-2 and round-3 command, unchanged.
- **Codebase:** Shortlink rebuilt as rounds 2 and 3 started it. Its tree is identical, file for
  file, to round 2's `cc383bb`. 49/49 tests green. The original repository was not touched.
- **Prompt:** `prompt-existing.md` in this folder. It differs from round 2's in two places:
  - it asks the session to "do step 1 of the milestone gate, and stop there", where round 2's
    said "Stop there";
  - it asks the session to print the project's test command at the end.

  Neither change names the new rule.

## Results

| | Existing codebase (Shortlink) |
|---|---|
| Time, cost, turns | 1097 s, $6.20, 70 |
| Invariant | `INV-suite`: `node --test --test-reporter=spec test/*.test.cjs`, `expect` a named test line |
| Red tests | the three new checks in `test/m4/`, committed red in `8ca2068`. Ruling: "keep M4's tests in test/m4/ outside its glob until the milestone gate" |
| After the acceptance commit | `INV-suite: pass` (evidence at 02:37:58Z, 11 s after `8ca2068`, before any node) |
| The pinned test | the 404 test left `test/delete.test.cjs` and became the 410 test in `test/m4/deleted.test.cjs`; see `existing-shortlink/pinned-test-move.diff` |
| Nodes | `N-total`, then `N-deleted` (depends on it), each by a fresh subagent writer |
| `ubp node done` refused | never: the transcript holds `node … : pass` lines only, and no `invariant-not-green` |
| Plan change | one L1 modify: `REQ-deleted-page` now states the rollback constraint the writer reported. `N-deleted` was then recorded done a second time on green checks |
| Gate step 1 | `b02902c` "test/m4 joins npm test and the invariant INV-suite" (ruling, `existing-shortlink/gate-step-1-join.diff`); then `check --all` in the tree and in a clean checkout of HEAD, and `ubp retro` (no repeated class) |
| End | `M4 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 1 次`; `npm test` runs `test/*.test.cjs test/m4/*.test.cjs`: 59/59 |

## What the trial shows

1. **The session followed option A from the text alone.**
   - The red tests waited outside the invariant.
   - The invariant was green after the acceptance commit.
   - No node was refused.
   - At gate step 1, the milestone's directory joined the project's test command with a
     ruling.
   - The project's own `npm test` now runs the milestone's tests (round 3's ended with
     50 tests, none of them M4's).
2. **A constraint reported in a handoff became an L1 change of its requirement**, as the method
   says. Rolling back to an older Shortlink after a delete needs the data file edited by hand.

## Limits

- One sample, one model, proxy answers only; no real Owner was interviewed.
- Not run under `ubp drive`.
- "No refusal" rests on the transcript; the engine keeps no record of a refused `node done`.
- The product choices are the session's and are not judged here: deleted-code records in the
  data file, and only `GET` answering 410.
