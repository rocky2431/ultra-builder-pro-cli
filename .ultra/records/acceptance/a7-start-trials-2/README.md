# A7, round 2: headless trials of the reworked M-P6 method (2026-11-12)

The Owner answered the M-P6 gate with "先修 准确地说，全部修复完成了之后，我才会去做测试". The
round-2 review found that the method of `d66f091` stalled every node planned before a change
of a behavior an existing test pins, and that no fresh session had tried the reworked method.
These two trials ran the method and engine of `7c0a563` (after the fixes, before the round-3
review).

## Setup

- Plugin: `git archive 7c0a563`, `npm ci --ignore-scripts`, then
  `node bin/install.js --claude --global --config-dir /tmp/a7r2-config` with `HOME` set to a
  temporary directory; `--doctor --json` reported `healthy`, version `6.1.0-rc.0`. Sessions ran
  `claude -p … --setting-sources project --plugin-dir /tmp/a7r2-config/skills/ultra-builder-pro
  --model opus --permission-mode acceptEdits --allowedTools Bash,Read,Edit,Write,Glob,Grep,Agent`,
  denying `git push`, `npm publish` and `gh`, with `--output-format stream-json`. The init event
  of each session lists `ultra-builder-pro` from `/tmp/a7r2-config` at `6.1.0-rc.0` and the Skill
  `ultra-builder-pro:ultra`. Authentication went through the environment's
  `ANTHROPIC_AUTH_TOKEN` gateway, as in round 1.
- Existing codebase: `git archive` of `ubp-sample-shortlink` at `d90758e` without `.ultra/`,
  `.gitattributes` or the sample's description, committed as one fresh commit (`cc383bb`) in a
  new repository, so no earlier `.ultra` history could be read (round 1's limit). 49/49 tests
  green. The original repository was not touched.
- The Owner's request (`prompt-existing.md`): in one milestone, first a total
  of visits at the top of `/`, then a deleted short link answers 410 with a page saying 已删除
  instead of 404. The second changes a behavior an existing test pins
  (`test/delete.test.cjs`: "a deleted link leaves the list and its short link answers 404"),
  and the first is planned before it: the shape round 2 showed stalling.
- New project: an empty directory that is not a Git repository; a reading-list CLI; Start up to
  and including the interview record.
- Both prompts said the Owner was unavailable; every answer by proxy, logged `proxy: yes`.

## Results

| | Existing codebase (Shortlink) | New project (reading list) |
|---|---|---|
| Time, cost, turns | 1154 s, $6.05, 56 | 323 s, $1.26, 23 |
| Git | already a repository | `git init` and an empty first commit (`126c021`) |
| `ubp status` before the spec | not checked | `… has not started: .ultra/spec.md does not exist. Start it with the ultra Skill.` (exit 2) |
| `.ultra/design.md` | `## System` with module and data ownership, the invariant, the tombstones the node added | `## System`, `## Decisions`, `## Facts` from four probes, each with source and date |
| Invariant | `C-suite`: the runner and the glob `test/*.test.cjs`, with `--test-skip-pattern` for this milestone's new test names; `expect` a named test line and `ℹ fail 0` | none (no code) |
| The pinned test | moved: the 404 assertion left `test/delete.test.cjs` (that test now asserts the deleted link no longer redirects) and became the 410 assertion of `test/deleted-410.test.cjs` (check `C-deleted-410`), committed red with the other acceptance (`1851e6b`); see `pinned-test-move.diff` | not applicable |
| Nodes | `N-total-visits` then `N-deleted-410` (depends on it), each by a fresh subagent writer (`Agent` "Writer for …") | not reached (not asked) |
| `ubp node done` refused | never: one completion per node in `.ultra/ledger/nodes.jsonl`, no retry; every refusal code in the transcript comes from reading `engine/FORMATS.md` | not applicable |
| End | `M4 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次`; `npm test` 62/62 | interview 5 questions; 6 `proxy: yes` lines; the milestone split decided by a ruling instead of a question |

## What the trials show

1. **The round-2 stall does not recur.** With the reworked Start step 1, the acceptance author
   took the pinned assertion out of the invariant into the requirement's own check before any
   node, so the node planned before the change finished on its first `node done`. Round 2's
   reviewer reproduced the opposite with the `d66f091` text (three refused attempts under drive).
2. **A writer's new test joins the invariant.** The `N-deleted-410` writer added
   `test/deleted-codes.test.cjs`; the invariant's glob runs it from then on, and no existing
   check file was edited by a writer (both writer commits: `src/` plus one new test file).
3. **The not-started message and `git init` reach a fresh session** (new-project trial).
4. **A fact the method already states, seen from another side:** a glob that matches no file
   gives `ℹ pass 0` with exit 0 (new-project trial, `design.md` Facts); round 1 found a file
   with no test gives `ℹ pass 1`. Both are why `expect` names a test.

## Limits

- One sample each, one model (Opus), proxy answers only; no real Owner was interviewed.
- The existing-codebase trial was not run under `ubp drive`; the nodes' scope held `test/`,
  which a drive would have to keep free of check files (`references/drive.md`). Drive's
  `check-touched` on a writer's new file under an invariant's glob was not exercised.
- The trial's product choices (tombstone records in the data file, so an older server refuses
  that file after a delete) are the session's, reported in its handoff and final message; they
  are not judged here.
