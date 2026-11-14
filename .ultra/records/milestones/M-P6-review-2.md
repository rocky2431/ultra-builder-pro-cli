Reviewer: Claude reviewer subagent (fresh context), xhigh, round 2

Commit reviewed: `b289adc255d3f4d540c72394c6ee8ea539efc39e` (branch `m-p6`). I started at `c65d7d3`. `b289adc` adds only nine `.ultra/ledger/evidence.jsonl` lines, so the diff under review is unchanged: `49b1e96..HEAD` without `thinking/`.

(Recorded by the controller verbatim, except that angle brackets the notification transport escaped as HTML entities are restored. Round 1 is `M-P6-review-1.md`. An API usage limit interrupted this review once; the reviewer resumed with its context.)

All probes ran under `/tmp/p6r2.qlhA7K`:
- `tree/`: a `git archive` copy;
- `clone/`: a clone for the full check run;
- `cfg/` and `home/`: an install into a temporary `--config-dir` with a temporary `HOME`;
- `s/`: scratch projects;
- `mut/`: broken copies;
- `probes/`: the probe scripts.

In the repository itself I only read files and ran read-only `git` commands.

## Blocking findings

None.

## What must be said to the Owner

### 1. The round-1 fix for changing a pinned behavior stalls every node planned before the change

This is a regression introduced by `d66f091`. I confirmed it by running it.

- **What the method says now.** `skills/ultra/SKILL.md:70-72` has the acceptance author rewrite the pinned test to the new behavior, "committed red before the node". That test still runs inside the invariant registered at `SKILL.md:64-67`. An invariant blocks every `node done` while it is red (`SKILL.md:337-338`).
- **Setup** (`/tmp/p6r2.qlhA7K/probes/b2.sh`):
  - Existing slug code, with its suite registered as invariant `C-inv`.
  - N-01 (README) comes first in plan order; N-02 changes the pinned behavior.
  - The acceptance author rewrote the pinned test red, as the text says.
- **By hand.** N-01's writer turned its own requirement green and then hit this:
  ```
  node N-01: fail
  invariant-not-green: C-inv is not green — Keep every existing test passing.
  M1 · 1/2 绿 · 1 红 · 下一项 N-01 · 本里程碑计划变更 0 次 · 不变量 1 未绿
  ```
- **Under drive** (`/tmp/p6r2.qlhA7K/probes/b2drive.sh`), the same plan used up three writer attempts on N-01:
  ```
  drive: writer N-01: node-not-done (exit 0)
  drive: writer N-01: node-not-done (exit 0)
  drive: writer N-01: node-not-done (exit 0)
  node-not-done: N-01: node-not-done — Resolve this stop before resuming drive.
  drive: stop attempts-exhausted
  ```
- **Two pinned changes in two nodes** (`/tmp/p6r2.qlhA7K/probes/b3.sh`): the first node is refused until the second node's code lands. By hand that can be recovered; under drive it ends in the same stop.
- **Why a model following the text ends up here.**
  - The status table says to choose the step "from the status, and from nothing else" (`SKILL.md:23`), and `next` stays N-01.
  - The invariant's `fix` points N-01's writer at code outside its scope. The A7 trial wrote its own `fix` the same way: "repair the code, never the test".
  - Escalation has no row for a node that is finished but refused by an invariant another node will turn green.
  - To recover, the planner has to see the cause and add `depends: ["N-02"]` to N-01.
- **Why it does not block.** REQ-P6-method does not mention changing a pinned behavior. Every step it does name can still be done, and the stall loses nothing. It is still the most likely way the method fails on an existing codebase, which is half of what the Owner asked for.
- **Proposal, which I ran.** The acceptance author moves the pinned test out of the invariant's run (into another file, or with the runner's skip filter) and into the requirement's own check, rewritten to the new behavior and committed red. I reran the same plan and writer with `C-inv` run as `--test-skip-pattern="drops dashes"` (`/tmp/p6r2.qlhA7K/probes/b5drive.sh`):
  ```
  drive: writer N-01: done (exit 0)
  drive: writer N-02: done (exit 0)
  drive: check all: pass
  drive: stop milestone-gate
  ```
  - Nothing that should still hold loses its check: the moved test asserted the old behavior, which the Owner asked to change. So this is an L1 modify with a ruling.
  - The Owner may still want to rule on narrowing an invariant's run, because the method calls removing an invariant a reduction of what the project promises itself.
  - I ran the skip filter only on Node 25.7.0. "Another file" works with any runner.
  - The cheaper alternative needs no move: plan the changing node first, and put all pinned changes of a milestone in one node. It constrains plans, and it does not help two such changes in separate nodes.
- **Two smaller points on the same bullet.**
  - It says "L1 modify" during Start, where there is no requirement block yet to modify; the change is an add.
  - It appears only in Start step 1. A later Owner request goes to "Changes after 0→1", whose row "a behavior changes" says "edit the block, its checks" and never mentions a pinned test inside the invariant. One clause there pointing to the rule would cover it.

### 2. REQ-P6-status's text and HEAD disagree when every milestone is closed

I confirmed this by running it and judged it non-blocking; the Owner may read it otherwise.

- **The requirement:** "A requirement of a closed milestone that is stale while the latest run of every check covering it passed is to be rechecked: `ubp status --json` counts it in `closed_recheck`." The spec does not exclude the current milestone.
- **HEAD:**
  - When every milestone is closed, the last one is still the current milestone (FORMATS: "if all are closed, the last milestone"), and it is left out of both closed counts.
  - Scratch project with one milestone M1, closed, then a commit of `NOTES.md`, using the installed engine: `closed_recheck 0`, `closed_not_green 0`.
  - The line read `M1 · 0/2 绿 · 2 过期 · 下一项 检查 · 本里程碑计划变更 0 次 · 不变量 1 未绿`.
- **Why I did not block:**
  - The `Done when` holds: the line never says `未绿` for these requirements.
  - `closed_not_green` has used the same scope since M-P1, and REQ-P6-status splits that count.
  - Counting these requirements would report them twice on one line.
  - FORMATS states the scope ("closed milestones other than the current milestone"), and both the 2026-11-12 ruling and the engine handoff record this case.
- **Fix.** Add one clause to the requirement: "of a closed milestone other than the one the line names". It changes nothing in the engine. It is a wording edit of a requirement, so the Owner approves it.

### 3. The round-1 items the controller says it fixed in `d66f091`, one by one

| Round-1 item | Does the fix do what was asked? | Evidence |
|---|---|---|
| 1. Pinned behavior | Only when the changing node is first in plan order and the only such change; otherwise it stalls (point 1 above) | `/tmp/p6r2.qlhA7K/probes/b2*.sh`, `b3.sh`, `b5*.sh` |
| 2. Drive progress in Claude Code | Yes, with three gaps | Monitor probe |
| 3. `待复核` wording | Yes; one more cause is not named | scratch `f1`, `f3` |
| 4. Spec without a design | Yes, with two ambiguities | reading; drive probe `d1` |
| 5. Red, flaky or slow baseline | Partly: "fixing them is the first node" has one valid shape, and the text does not name it | `/tmp/p6r2.qlhA7K/probes/b4.sh` |
| 6. `expect` inside `describe` | Yes | scratch checks |
| 9. Smaller items | Partly: three of the six sub-items are done | below |

**Item 2: drive progress.**
- I armed a Monitor with the exact command in `references/drive.md:14-18`, on a drive whose writer slept 6 s per node. It delivered every event while the drive ran, in four notifications:
  - `drive: run …` together with `drive: check stale: pass`;
  - `drive: writer N-01: done (exit 0)`;
  - `drive: writer N-02: done (exit 0)`;
  - `drive: check all: pass` together with `drive: stop milestone-gate`.
- **Gap: duplicates on re-arm.** Re-arming the same command replays every line from the first (`tail -n +1`; on the finished file it printed all 6). The Owner gets duplicates each time the monitor expires. The tool's default timeout is 5 minutes; 30 minutes applies only when the model passes it.
- **Gap: the monitor outlives the drive.** `tail -F` never exits. In my probe the monitor kept running until its timeout, after `drive: stop milestone-gate`. The text does not say to stop it when the drive's completion notice arrives.
- **Gap: problem lines are filtered out.** The filter `^drive: ` drops problem lines such as `writer-left-dirty: N-01: writer-left-dirty — Resolve this stop before resuming drive.` Nothing is lost: the stop reason still arrives, and the final JSON carries the problems.
- **Fix:** "Pass the longest timeout; on re-arm, relay only lines not yet relayed; stop the monitor at the drive's completion notice."
- **Codex** (not checked): the text there is unchanged ("read the stderr file at each check-in"), and nothing on that host creates a check-in.

**Item 3: `待复核` wording.**
- After closure, a requirement text edit reads `已关闭里程碑 1 项待复核`, with reason `req-changed:REQ-001` and `next` N-01. That matches the new wording.
- A Direction edit (shared text) also puts every closed requirement in `待复核` (`shared-changed`): `已关闭里程碑 2 项待复核`. The wording names only requirement and check edits; add "or the shared text".

**Item 4: a spec without `.ultra/design.md`.** `SKILL.md:19` does what was asked. Two ambiguities remain:
- "Write the design (Start step 1)" points at the whole step. Read literally, its existing-code bullets would register the existing suite as an invariant again in a project already on UBP; in this repository that would be `npm test` alongside C-release (inferred). Saying "its survey" fixes this.
- The line comes before the status table, so a session can act on it while a drive runs.
  - The table says to change no file while a drive runs.
  - An uncommitted `.ultra/design.md` stops a drive: in probe `d1`, a writer's uncommitted edit stopped it as `writer-left-dirty`.
  - So a controller that writes the design mid-drive would stop the drive and get its writer blamed (inferred for the controller case).

**Item 5: a red, flaky or slow baseline.**
- A first node with `covers: []` is refused by the gate: `empty-node: N-fix covers no requirement — Link the node to a requirement or remove it.`
- The same node as `"kind": "cleanup"` passes the gate, completes once the fix lands, and the next node follows (`/tmp/p6r2.qlhA7K/probes/b4.sh`).
- The text should say "a cleanup node first in the milestone" or name a requirement for that node. The cleaner's "never a large refactor" may then need an exception.

**Item 6: `expect` inside `describe`.** In my scratch checks, `^\s*✔ <name>` matched both a top-level test (`joins words`) and a test inside `describe` (`drops dashes at the ends`). The FORMATS example escapes the pattern correctly for JSON.

**Item 9: smaller items.**
- **Done:**
  - the `all-done` bullet (`drive.md:67-68`);
  - "a check never reads … `.ultra/design.md`" (`SKILL.md:148`);
  - the zh README's hook sentence.
- **Not done, although the handoff says "(item 9)", and not in its not-done list:**
  - In a committed repository without a spec, `ubp status` still prints `.ultra/spec.md: ENOENT: no such file or directory, open '…'` and exits 2, while the README says `ubp status` shows "the current state". The engine's messages before `git init` and before the first commit are clear.
  - Start still does not mention `git init` or a first commit.
  - The README's command table still shows `--review <file>` without saying the file must be `.ultra/records/milestones/<id>-review.md`. FORMATS, Skill gate step 5 and the refusal's hint all name the path.
  - Heading levels inside the brief's `## Project`. These are as specified.

**Regressions from the restructuring.** None beyond the above.
- The Skill's drive and merge paragraphs now only point to the references. The rules they dropped are all in `drive.md` and `merge.md`:
  - a node's scope holds no check file;
  - `--expect-head` takes a full commit id;
  - a branch never changes the truth files and never approves.
- One harmless inconsistency: the Skill says to relay "each line a running drive prints" (`SKILL.md:37-38`, `:207`), while `drive.md:35-36` says "each writer line".

### 4. Items 7 and 8, and this repository's own setup, are still the Owner's to decide

- **Version (round-1 item 8).**
  - `package.json` and the README's install line still say `6.0.0`.
  - My temporary install's doctor reported `claude:healthy:6.0.0 codex:healthy:6.0.0` for content that differs from npm's 6.0.0. The planned install into the real `~/.claude` after the gate will report the same.
  - Setting a prerelease version before that install keeps `--doctor` honest.
- **This repository (round-1 item 4; ruling 2026-11-12).**
  - It has no `## Direction`, no `.ultra/design.md`, no interview record and no user-documentation requirement.
  - `C-engine-p6` and `C-method-p6` still use `^ℹ pass [1-9][0-9]*$`.
  - After the install, the first session here will reach `SKILL.md:19` and write the design before any node, with the item-4 ambiguity above.

### 5. Acceptance gaps: broken copies the P6 checks still pass

The engine has not changed since round 1 (`git diff --stat e5db85e..HEAD -- engine/*.cjs hooks adapters tests` is empty), so round 1's six engine mutants still apply. New this round:

- **`待复核` printed before `未绿`.** Passes C-engine-p6 7/7, but fails C-engine (`tests/engine-p1.test.cjs`, test "closed milestones keep counting", 0/1), whose updated line assertion pins the order. The check set covers it.
- **A closed requirement whose last run was `unknown` counted as `待复核`** (`!== 'fail'` instead of `=== 'pass'`).
  - Passes C-engine-p6 7/7, and passes that C-engine test 1/1.
  - HEAD on the same input: I made check C-2 come back `unknown (expect-unmet)`, then committed notes. The line read `… · 已关闭里程碑 1 项未绿 · 已关闭里程碑 1 项待复核`, with `recheck 1 not_green 1`, as the spec says.
  - To close this gap, add a closed requirement whose last run is `unknown` to the 待复核 test.
- **The review path checked before the review is read.** Fails C-engine-p6 6/7. Covered.
- **Method mutants.** Each of these passes C-method-p6 9/9:
  - removing session step 1's design line;
  - removing the Monitor bullet;
  - removing the `all-done` bullet;
  - changing "a writer never edits it" to "a writer may edit it too".

  This is expected, since the 2026-11-12 ruling makes C-method-p6 structural only. HEAD's text is right at `SKILL.md:19`, `drive.md:14-18`, `drive.md:67-68` and `SKILL.md:106`.

### 6. Smaller items

- **Where a writer puts its own tests on an existing codebase.** The method does not say. The example writer may not edit "any check's test file", and the drive stops `check-touched` on any path a check's `run` names. So an invariant that names the existing test files (as in my scratch projects) puts every existing test file out of a writer's reach, even one its refactor legitimately breaks. A7's glob `test/*.test.cjs` names no path, so it does not trigger this. Inferred.
- **`milestone close` accepts only the canonical path.** It now refuses a review at another path that used to pass. Like round 1, I read this as covered by the contract the Owner confirmed ("核对评审路径属于该里程碑"). Every closure in this repository used the canonical path.
- **The gate's reviewer does not read the design.** Skill gate step 2 (`SKILL.md:238-242`) does not ask the reviewer to read `.ultra/design.md`, while the example reviewer does. This is part of the three-copy problem below.

### Could the same acceptance be met with less?

Yes, in the method text. The engine is already close to the minimum.

- **Engine.**
  - M-P6 adds 13 lines (1998 to 2011, against the 2050 cap).
  - I would keep:
    - the separate `sharedText`, because it keeps existing evidence hashes valid;
    - `closed_recheck`;
    - the stderr printer, which simplified `drive.cjs`.
  - The one cut I would consider is the same as in round 1: drop `--review` and have `close` read the canonical path itself, as `drive` already does. That removes the path comparison and `review-not-for-milestone`. The cost is a CLI change and an edit to a closed milestone's acceptance.
- **Method text: about 30 always-loaded lines, with no acceptance lost.**
  - **One `references/review.md`** replacing the three copies of the reviewer instructions: gate step 2, `claude-reviewer.sh`, and the controller's brief. That takes about 22 lines out of `SKILL.md` and removes the drift already there (the design file and the `git archive` run).
  - **The status table's drive row** (`SKILL.md:27`, the `ps` lock procedure) moves into `drive.md`, next to `drive-running`, which currently gives a different rule for removing the lock. C-package's assertion in `tests/v6-package.test.cjs` pins `ps -o command=` in that table row, so it would need rewording. That is a closed milestone's acceptance, so the Owner decides.
  - **The measured-comparison parenthetical in Roles:** 2 lines. Keep the rule itself.
  - **Start step 1:** with the point-1 proposal, the pinned-test bullet and the characterization bullet become one rule. Proposed text: "a behavior this work changes moves into a requirement's check before its node: a test that pins it leaves the invariant and is rewritten red; a behavior no test pins gets a characterization check, green."
- **What the rework added that I would keep:** the Monitor bullet, with its three gaps fixed. It sits in a reference that is not always loaded, and it is the only way finding 7 is met in Claude Code.
- **What I would not remove:**
  - the design section;
  - the four Start steps;
  - the Escalation row for an unknown fact;
  - the review against the Owner's words.

### Acceptance criteria

- **A1: met.**
  - Brief for N-01 on the existing-code scratch project, compiled by the installed engine: `## Project` holds the spec's title, `## Direction` and `## Interface`, then `### .ultra/design.md` and the design, all before `## Requirements`.
  - The first rule names `.ultra/design.md`.
  - The A7 Shortlink copy's only node compiles to 11290 bytes of the 32768 budget, with a 4127-byte design.
- **A2: met.**
  - C-engine-p6's design test passes.
  - A drive writer that edited `.ultra/design.md` without committing was stopped as `writer-left-dirty` before the next node, so no later brief carried the edit.
- **A3: met on scratch projects.**
  - Checked there: both segments, their order, and a last-`unknown` run counted as `未绿`. The all-closed case is point 2 above.
  - I did not rerun this repository's live line, because another process was running checks there. Round 1 quoted `… 已关闭里程碑 13 项待复核`.
- **A4: met.** Installed engine on a scratch project:

  | `--review` given | Result |
  |---|---|
  | `docs/M1-review.md` | `review-not-for-milestone: docs/M1-review.md is not the review for M1 — Use .ultra/records/milestones/M1-review.md for this milestone.` |
  | lowercase `m1-review.md` | refused the same way |
  | an absolute path | `--review must be a relative path inside the project root.` (exit 2) |
  | a missing file | only `review-missing` |
  | `.ultra//records/milestones/M1-review.md` | no path problem |
  | `./.ultra/records/milestones/M1-review.md` | `milestone M1: pass` |
- **A5: met.** The Monitor probe above; stdout held only the final JSON.
- **A6: met.**
  - `SKILL.md` is 393 lines.
  - Every drive stop (including `all-done`) and every merge refusal is handled in the references.
  - C-method-p6 passes 9/9.
- **A7: met as recorded.** Both trials ran the method at `cf0a1b0`, before `d66f091`. So no fresh session has tried any round-1 fix, and the trials' checks still use the old `pass [1-9]` expect.
- **A8: met.**
  - **Full check run.** In a clone of `c65d7d3` (the same tree as HEAD apart from evidence lines), `node engine/cli.cjs check --all` with the repository engine gave every check `pass (exit-0)`: C-engine, C-release, C-engine-p2 to p5, C-package, C-engine-p6 and C-method-p6. Exit 0, final line `M-P6 · 4/4 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次`.
  - **Release suite.** C-release's log: `ℹ tests 402`, `ℹ pass 402`, `ℹ fail 0`, `found 0 vulnerabilities`.
  - **Pack.** `npm pack --dry-run --json`: version 6.0.0, 39 entries, including `skills/ultra/references/drive.md`, `merge.md`, both drive examples and `engine/FORMATS.md`.
  - **Install.** `--all --global --config-dir <tmp>` with a temporary `HOME` exited 0, and `--doctor --json` reported `healthy`. The installed engine is byte-identical to `engine/`, the installed `SKILL.md` has no `__UBP_` placeholder, and both hosts carry the references.
  - **Skill validators.** Skill Creator `quick_validate.py` (Claude and Codex copies) on `skills/ultra`: `Skill is valid!` for both.
  - **Plugin Creator.** Not run; no adapter or manifest changed in `49b1e96..HEAD`.
- **A9:** waiting on the Owner.

**Spec against the Owner's words.**
- The four REQ-P6 blocks carry all five changes of RESULT's "统一方案" and A1–A6. I found no requirement that says other than what the Owner said.
- The changed closed-milestone assertions (`engine-p1`, `engine-p2`, and C-package's drive-stop line) keep their strength and are covered by the 2026-11-12 L1 ruling.
- The 2050-line budget is covered by the 2026-11-12 `reduction` touch.
- `engine-p5.test.cjs` lost no lines.

### Not checked

- A live model session following the reworked method, in Claude Code or Codex.
- The Monitor relay inside a real Claude Code drive with headless writers.
- Linux and Node 22: everything ran on macOS with Node 25.7.0.
- This repository's live status line.
- The Plugin Creator validator.

Verdict: accept
