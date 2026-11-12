# A7: two headless start trials of the M-P6 method (2026-11-12)

Contract A7 (`thinking/v6-workflow-review-20261111/RESULT.md`): run the method from the
working tree's plugin in two headless sessions, one on the Shortlink clone with `.ultra`
removed (an existing codebase), one in an empty directory (a new project); both interviews
answered by proxy.

## Setup

- Plugin: `m-p6` method (`cf0a1b0`) with the `m-p6-engine` engine (`34f7ba0`), installed
  with `node bin/install.js --claude --global --config-dir /tmp/a7-config` (`HOME` set to a
  temporary directory). Sessions ran
  `claude -p … --setting-sources project --plugin-dir /tmp/a7-config/skills/ultra-builder-pro
  --model opus --permission-mode acceptEdits`, denying `git push`, `npm publish` and `gh`.
  A probe confirmed the session loaded this plugin's Skill (its `ubp` line names
  `/tmp/a7-config/...`), not the installed 6.0.0 one. The sessions billed an API key set in
  the environment, not the subscription.
- Existing codebase: a clone of `ubp-sample-shortlink` at `d90758e`, origin removed,
  `.ultra/`, `.gitattributes` and the sample markers removed in two commits (`8de0e2c`);
  49/49 tests green. The original repository was not touched.
- New project: an empty Git repository.
- Both prompts said the Owner was unavailable and asked for every answer by proxy, logged
  with `proxy: yes`.

## Results

| | Existing codebase (Shortlink) | New project (reading list) |
|---|---|---|
| Asked of the session | add link expiry; go through Start, spec, checks and plan until `ubp gate` passes; no product code | a reading-list CLI; go through Start up to the interview, then stop |
| Time, cost, turns | 587 s, $2.77, 37 | 268 s, $1.06, 17 |
| `.ultra/design.md` | `## System` (build, run, test, module and data ownership, test suite), `## Decisions`, `## Facts` with sources and probes | `## System` (empty repository, toolchain), `## Decisions`, `## Facts` with probes, open unknowns |
| Existing tests | the suite registered as invariant `C-suite` (`covers: []`, `fix`) | none exist |
| Characterization | `C-expire-restart` pins expiry across a restart, a behavior no test pinned, green on the existing code | not applicable |
| Spec | Direction, Interface, three requirements each with `Done when`; the README is a requirement | not written (stopped after the interview, as asked) |
| Interview | 5 questions; 8 owner-touch lines `proxy: yes`, the delegation `proxy: no` | 5 questions; 5 `proxy: yes`, the delegation `proxy: no`; a table maps every expected requirement to an Owner sentence |
| Gate | `ubp gate`: pass; `.ultra` committed; status `M4 · 2/3 绿 · 1 红 · 下一项 N-readme` | not reached (not asked) |

Files: `existing-shortlink/` and `new-reading-list/` hold the trial's `.ultra` text files and
the session's final message; `existing-shortlink/commits.txt` lists its commits.

## What the trials found

1. **The `expect` example in the method was wrong** (new-project trial, Fact 5 of its
   design). `node --test` reports a file or a name filter that ran no test as one passing
   test (`✔ test/x.test.cjs`, `ℹ pass 1`, exit 0); reproduced by the controller on Node
   22.21.0 and 25.7.0. The method's `^ℹ pass [1-9][0-9]*$` therefore could not do what its
   own sentence promised, and the existing-codebase trial copied it into all five checks.
   Corrected in the method and `engine/FORMATS.md` with a ruling (2026-11-12).
2. **The survey prevented a rebuild.** Shortlink already had link expiry (delivered as its
   M2). The session found it from the code, tests and history, specified the existing
   behavior instead of building a new mechanism, pinned the one unpinned behavior, and made
   the missing README the only red requirement.

## Limits of these trials

- The feature asked of the existing codebase already existed (the controller did not check
  before choosing it). So the trial exercised survey, invariant, characterization and
  documentation, but not a node that changes existing behavior.
- The clone kept its Git history, including the removed `.ultra/` files; the session read
  them (`79a778d^:.ultra/records/owner-touches.md`). A real existing project would not have
  them.
- Every Owner answer is a proxy answer; no real Owner was interviewed. The sessions'
  behavior is one sample each, on one model (Opus).
