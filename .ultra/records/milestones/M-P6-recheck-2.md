Reviewer: Claude reviewer subagent (round-3 context resumed), xhigh, round 3 re-check 2

Scope: `ef37b09` on `m-p6`, diff `8c87da7..ef37b09`. The only commit after it, `69afcc9`, changes 2 files under `.ultra/ledger/` and 16 under `.ultra/records/`. Nothing else (`git diff --name-only ef37b09 69afcc9`). The repository is still at HEAD `69afcc9`, clean.

(Recorded by the controller verbatim. Like `M-P6-recheck-1.md`, this re-check is not a review round; it checks option A, which the Owner chose after the first re-check.) All probes ran on copies under `/tmp/p6r3.O8ESAE/` using the engine from a clone of `ef37b09` (`/tmp/p6r3.O8ESAE/clone5`). I only read the A7 round-4 repo and stream.

## Blocking findings

None.

## What must be said to the Owner

### Re-check points 2, 3 and 4: all three fixed at `ef37b09`

**Point 2: a red test in the invariant's run blocked nodes planned before the one that turns it green. Fixed (confirmed by running).**

Probe projects (`/tmp/p6r3.O8ESAE/probes/mk5.sh`) are built the way `ef37b09`'s Start step 1 says:
- `package.json` `test` is `node --test --test-reporter=spec test/*.test.cjs`, and invariant `C-inv` runs that command.
- New tests live in `test/m1/`. One of them, `test/m1/title.test.cjs`, does `require('../../src/title.cjs')` at the top, before any node has written that module.

Results:
- **By hand, plan A:** `node N-01: pass`. The missing module did not block N-01, because `test/m1/` is outside `C-inv`'s glob.
- **Under drive, plan A:** `drive: writer N-01: done (exit 0)`, then N-02 done, N-03 done, `drive: check all: pass`, `drive: stop milestone-gate`.
- **The acceptance-commit bullet catches a misplaced red test before any node** (variant `leftin`, where C-3's test is put in `test/`):
  - Right after the acceptance commit: `C-inv: fail (exit-1)`, status `M1 · 0/3 绿 · 3 红 · 下一项 N-01 · 本里程碑计划变更 0 次 · 不变量 1 未绿`. That is the signal SKILL.md:156 tells the planner to act on ("every invariant that was green before this commit is still green").
  - If the planner ignores it, the engine refuses the first node: `node N-01: fail` / `invariant-not-green: C-inv is not green — Keep every existing test passing.`

**Point 3: after the milestone, the project's own test command did not run the milestone's tests. Fixed (confirmed by running).**

On probe project `/tmp/p6r3.O8ESAE/s/d5-A`, after drive stopped at `milestone-gate`, I followed gate step 1 (SKILL.md:244):
- `package.json` `test` and `C-inv`'s `run` both became `node --test --test-reporter=spec test/*.test.cjs test/m1/*.test.cjs`, with a ruling.
- `ubp gate` gave `gate: pass`. The plan-log stayed at 1 line.
- Status then read `M1 · 0/3 绿 · 3 过期 · 下一项 检查 · … 不变量 1 未绿`, so the engine sees the changed run.
- `ubp check --all`: C-inv, C-1, C-docs and C-3 all pass, and status reads `M1 · 3/3 绿 · 下一项 里程碑门`.
- A clean checkout passes, and retro reports `重复两次及以上：0 类`.

What the project's test command runs:
- **Before the join:** `npm test` ran 2 tests, 2 passed.
- **After the join:** `npm test` runs 5 tests, 5 passed, including the milestone's 3 new tests.

The A7 round-4 record agrees. Join diff `b02902c` changed both `package.json` `test` and the `INV-suite` run to `... test/*.test.cjs test/m4/*.test.cjs`. `npm test` gave 59/59, and `INV-suite: pass` after the acceptance commit, with no refusals.

Procedure caveat: on d5-A my first join commit landed before `ubp gate` ran (a zsh word-splitting error on my side). I then ran gate, `check --all`, the clean checkout and retro with `/tmp/p6r3.O8ESAE/probes/join5.sh`. The results above come from that run.

**Point 4: Direction quotes and attribution. Fixed (confirmed by reading).**
- All 12 quoted phrases in the rewritten Direction appear verbatim in the Owner's records or in the v6 and M-P6 contracts, and none spans a line break.
- The complaints are labeled "(the assistant's reading)".
- "Elegance: not stated by the Owner."
- The release boundary quotes both contracts ("push、tag、npm 发布" and "门通过后装进 ~/.claude，不 push、不发布").
- What remains is covered by a ruling: no draft marker on the Direction, because gate step 4 shows the Owner the full text.

### Regressions and limits (non-blocking)

**1. Recursive test runners have no stated route since the skip filter was dropped (confirmed by running; layer L2).** Start step 1's only route is "the milestone's own test directory, which the invariant's glob does not match (for example `test/m4/` beside `test/*.test.cjs`)". That works only when the project's test command names a glob. Under the usual default commands, the milestone directory is already inside the run:
- **Plain `node --test`** (Node 25.7.0 and 22.21.0) finds `test/m1/` on its own: `✖ test/m1/title.test.cjs`, `ℹ fail 2`.
- **pytest 8.4.2, default discovery:** `Interrupted: 1 error during collection`, so not even the old tests run. With `--ignore=tests/m1`: `1 passed`.
- **Go 1.25.5, `go test ./...`** (temporary GOCACHE and GOPATH): `slug/m1/title_test.go:8:40: undefined: slug.Title` and `FAIL example.com/s/slug/m1 [build failed]`. With `go list ./... | grep -v /m1`: ok.
- **jest and vitest:** not installed here. From their documentation, default discovery is recursive too (inferred, not run).

In every case the invariant turns red at the acceptance commit, so the outcome bullet catches it and nothing goes wrong silently. But the planner is left without a written route. Compared with `a3ca72f`, route coverage is partly lost: the skip filter worked for test files that load, though not for a missing-module `require`. Taken as a whole, option A is still an improvement.

Cheapest fix, one clause in Start step 1: "where the runner finds tests recursively, keep the directory out of the invariant's run with the runner's own path means (a narrower glob, pytest `--ignore`, a Go package list), and remove that at the gate."

**2. With a red baseline and a cleanup-first plan, the acceptance-commit bullet misses a misplaced red test (confirmed by running; layer L1).** Probe `/tmp/p6r3.O8ESAE/probes/cl5.sh`: one existing test red, cleanup node `N-fix` first, and the new requirement's test wrongly put in `test/`, inside `C-inv`'s glob.
- **Before the acceptance commit:** `C-inv: fail (exit-1)`.
- **After it:** the same status, `M1 · 0/1 绿 · 1 红 · 下一项 N-fix · 本里程碑计划变更 0 次 · 不变量 1 未绿`. The bullet only compares invariants that were green before, so it gives no signal.
- **After the cleaner fixes the baseline:** still `C-inv: fail (exit-1)`, and `node N-fix: fail` / `invariant-not-green: C-inv is not green — Keep every existing test passing.` The cleanup node is refused because of a test it cannot turn green.

This takes two mistakes together, so it is rare. Cheapest fix: extend the bullet with "and no test file this commit adds is in an invariant's run". The planner can check that by reading the glob, without depending on colour.

**3. The red-baseline sentence contradicts itself (confirmed by reading and running; layer L2).** SKILL.md:71–73 says "It passes when registered: a red baseline … is left out of its run, unless the milestone's first node is a cleanup node". Under that exception the invariant is registered red: cl5 shows `C-inv: fail` at registration. The text also no longer says how to leave a red baseline out, now that the name-prefix filter is gone. The real means are moving the test, narrowing the glob, or a runner exclusion. Suggested wording: "It passes when registered, unless the milestone's first node is a cleanup node that fixes the red baseline; otherwise the red baseline … is left out of its run (moved, or excluded by the runner's path means)."

**4. Under drive, the accepting review comes before the join commit (inferred from drive.md:68 and SKILL.md:244; layer L2).** `milestone-gate` with `accept` goes straight to gate step 1, so no reviewer ever sees the change to `package.json` and the invariant's `run`. The A7-4 join (`b02902c`) and my d5-A join were clean, and `check --all` reruns everything. The remaining risk is a join that narrows the invariant's run instead of widening it. That would go unreviewed and, as before this change, leave no plan-log line, because invariant run changes produce none. A cheap fix is for the gate step 1 ruling to quote the run before and after.

**5. README wording is now accurate (confirmed by reading).** Both READMEs say tests added or rewritten red "wait in the milestone's own test directory, outside the invariant's run … at the milestone gate that directory joins the project's test command and the invariant". The Chinese README has the same content ("里程碑自己的测试目录"). The misleading "until a node turns it green" is gone. The red baseline is no longer mentioned in either README, which is fine for a README.

**6. `C-method-p6` mutation results (confirmed by running, `/tmp/p6r3.O8ESAE/mut5/`).**
- Mutants that delete the acceptance-commit bullet, delete the gate join, or restore the name-prefix filter all fail the test.
- A mutant that reverses the join's direction passes 16/16. The test checks wording, not meaning, and the rulings accept that.

**7. Already decided by ruling or already with the Owner, listed so nothing looks missed.**
- The test command grows by one path per milestone.
- The A7-4 session again added no documentation requirement for a project without a README (its rulings, line 8: "M4 has no documentation requirement"). This is already on the Owner's default-not-change list.

### Where the same acceptance could be met with less

- **Replace the glob example with a principle.** "Keep the directory out of the invariant's run by the runner's own path means; the acceptance-commit bullet proves it." That covers point 1 above without listing runner flags, and the outcome bullet already does the proving.
- **Make the join a single edit.** When the invariant's `run` is literally the project's test command (`npm test`), gate step 1 changes one file, and the two copies cannot drift apart. In A7-4, `package.json` and `INV-suite` carried the same string twice. The cost: the fingerprint covers only `run`, `timeout_sec` and `expect`, so editing `package.json` alone would not mark the invariant stale. The `ubp check --all` that gate step 1 already requires covers that, but between nodes the engine would not notice.
- **Shorten the red-baseline clause** to the one-sentence form in point 3. That removes the contradiction without adding a mechanism.
- **Leave the engine as it is.** Option A needed no engine change, and none of the gaps above needs one.

### Acceptance criteria

- **REQ-P6-method `Done when`, "after gate step 1 the project's own test command runs the milestone's new tests (contract A6, A7)": met.** Probe d5-A: `npm test` went from 2 tests to 5, all passing. A7-4: 59/59 with the `test/m4/` join.
- **Every check on a fresh copy of HEAD: met.** Command: `node engine/cli.cjs check --all` on an archive of `69afcc9` with `git init` and `npm ci`, in `/tmp/p6r3.O8ESAE/tree5`. Every check passed: C-engine, C-release, C-engine-p2 through C-engine-p6, C-package and C-method-p6. Final status: `M-P6 · 5/5 绿 · 下一项 里程碑门 · 本里程碑计划变更 18 次`, exit 0, 20:26 wall time.
- **Skill size and validity: met.** SKILL.md is 391 lines against the 395 limit, and the Skill Creator validator reports it valid.
- **Option A as the Owner chose it ("选A吧"): met in the text.** Tests wait in the milestone's own test directory, invariants that were green stay green after the acceptance commit, gate step 1 joins the directory, and the skip filter is gone. All four parts were exercised by hand, under drive and at the gate, as above.

### Not checked

- jest and vitest discovery (not installed; inferred from their documentation).
- A Codex-host drive run.
- I did not rerun the A7 round-4 trial. I read its record, the trial repo (its plan-log has only a baseline and one L1 modify, with no line for the join) and its stream, without changing them.
- A clean checkout of the repository at `69afcc9` itself: I ran the archive copy above. A separate clean-checkout run started by the controller (`/tmp/ubp-p6-clean-A`) was still running while I worked, and I did not read its result.
- Every process I started has exited. No probe processes remain.

Verdict: accept
