Reviewer: Claude reviewer subagent (fresh context; wrote none of the P4 engine, the method or the tests)

# M-P4 gate review, round 2: `v6-p4` at `ab938e7` plus the uncommitted round-4 repair

All but one of my round-1 findings are fixed, each with a test, and I checked each fix by running something:

- **B1 (parallel writers) is fixed.** Three writers whose checks start red, in one milestone, now merge one after another.
- **The briefs, hints, retro, Git error messages and refusal instructions are fixed.**
- **One forgery route is still open, and it breaks criterion 3.** A branch that commits a protected file under an upper-case `.ULTRA/` directory gets past `truth-changed` on macOS's case-insensitive file system, and brought a closure into main with exit 0. The fix is one pathspec plus one test.

**How I worked:**
- I copied the uncommitted `engine/`, `tests/`, `method/`, `bin/` and `package.json` onto a throwaway clone of `ab938e7`; `cmp` showed them identical to the workspace.
- All fixtures were under `$TMPDIR`; everything is deleted and no worktree is left registered.
- I changed no file in the workspace. Its `git status` list is the same as when I started this round.
- My first `git status` there ran without `--no-optional-locks`, so it may have refreshed the index's stat cache. No file content changed.

## Acceptance criteria

| # | Criterion | Result | How I know |
|---|---|---|---|
| 1 | FORMATS and engine agree; engine ≤ 2,000 lines | **Met**, with should-fix S1 | I read the FORMATS diff (rules 1–4, bisect shortcut, allowlist, warnings, maintenance flags, exit lines) against `merge.cjs`, `states.cjs`, `context.cjs` and `git-state.cjs`; they agree. `wc -l engine/*.cjs`: `1786 total`; no line is over 100 characters. One ceiling sentence is false (S1). |
| 2 | P4 suite protects the contract, red first; P1–P3 and boundary suites green | **Met** | In my copy: `tests/engine-p4.test.cjs` 60 pass, 0 fail, exit 0. P1, P2, P3, boundaries and package-smoke: 197 pass, 0 fail, exit 0. `round4-red.log`: 134 tests, 121 pass, 13 fail (the new tests and the P2 Rules-line tests). The two edits to old tests follow the contract change, so they weaken nothing: the retro fixtures now pass once first, and the order assertion is now Git's order. 13 targeted mutants of the new logic: 9 caught (S2 lists the 4 survivors). `verify:release` comes from the controller's log `round4-verify-release.log`: 1095 tests, 1090 pass, 0 fail, 5 skipped (env- or platform-gated), pytest `104 passed`, `found 0 vulnerabilities`. I did not rerun it. |
| 3 | A refused or interrupted merge leaves main unchanged; a branch never brings in truth files, closures or approvals | **Not met** (B1 below) | The unchanged-main half holds: tests pass, and every refusal in my fixtures left HEAD and the tree as they were. The branch half fails on macOS: a closure came in through `.ULTRA/ledger/milestones.jsonl`. |
| 4 | `method/ultra.md` matches the engine and says what to do on each refusal | **Met**, with S1 and nits | Every refusal code now has an action, including `plan-gate`, `nothing-to-merge`, a persistent `merge-busy`, `truth-changed` and exit 2. The blocking rules match the engine. Three red-first writers merged following the method. A normal brief and a cleanup brief, followed to the letter, now end in `node … : pass`. The post-merge step should be `--all` (S1). |
| 5 | A/B/C conclusion follows from `PROTOCOL.md` and `data/` | **Met** (nit N6) | Data and conclusion are unchanged since round 1. The N6 addendum claims more writer reports than `data/` holds; it does not affect the decision rule. |

## Round-1 findings

| Round 1 | Status | Evidence |
|---|---|---|
| B1: parallel writers can never merge | **Resolved** | My red-first reproduction with three writers in one milestone: `merge wA: pass` with warnings for C-2 and C-3, then `merge wB: pass` with a warning for C-3, then `merge wC: pass`. Final line `M1 · 3/3 绿 · 下一项 里程碑门`. Covered by the tests "two writers of one milestone…" and "a branch that marks a node done…". |
| B2: forged closures, approvals, plan log | **Partly resolved** | The file-level case variant, the symlinked ledger, the plan-log line and a deleted record are all refused (test passes). Still open: the directory-level case variant (B1 below). |
| S1: brief omits invariants; misleading hint | **Resolved** | The hint is `fix` only when the invariant is `red` (`states.cjs:144-147`); test passes and the mutant is caught. Following the new brief: `node done` passes. |
| S2: cleanup brief | **Resolved** | Following the new brief: `I-size: pass`, then `ubp check`, then `node N-clean: pass`. |
| S3: refusal instructions; Git reason | **Resolved** | `method/ultra.md:274-286`; `git-state.cjs:22-27`. The test uses a failing pre-merge-commit hook; the mutant is caught. |
| S4: retro is mostly TDD red runs | **Resolved** | On a throwaway clone of R with closures hidden: 6 classes repeated twice or more, down from 14. The three I traced (C-create, C-journey-m1, C-expire) are checks re-reddened after review rounds added cases (N3). Both retro mutants are caught. |
| S5: dependency ceiling | **Resolved** | FORMATS ceiling rewritten; method line 285-286. |
| N1, N2: exit-code lines | **Resolved** | `FORMATS.md:874-878`. |
| N3: empty `dirty-tree` list | **Resolved** | `merge.cjs:161`, with a test. |
| N4: HEAD reset backwards; detached fast-forward; registration-only leftovers | Reset: **resolved** (new test). The other two: untested, accepted | See "Not addressed by design". |
| N5: auto-maintenance | **Resolved** in code | `git-state.cjs:10, 30` and `merge.cjs:15`. No test; that mutant survives, which is acceptable. |
| N6: context-rebuild metric | Addendum added, one claim inaccurate | See N6 below. |

## Blocker

### B1. A case variant of the `.ultra/` directory still brings in a closure (reproduced, macOS)

**Where:**
- `merge.cjs:178-179` compares with the pathspec `-- .ultra`. Git matches that pathspec case-sensitively, but on a case-insensitive file system a checkout of `.ULTRA/…` writes into the existing `.ultra/` directory.
- `FORMATS.md:709` promises a case variant "is simply not allowed, on any file system".

**Reproduction (APFS, `core.ignorecase=true`):** main has M1 done, M2 open, and no closures yet. The branch commits a closure record at `.ULTRA/ledger/milestones.jsonl` (`git update-index --add --cacheinfo`).
```
{"ok":true,"merged":"83ff375…","problems":[],"warnings":[]}
merge exit 0
ls .ultra/ledger → evidence.jsonl milestones.jsonl nodes.jsonl plan-log.jsonl
M2 · 0/1 绿 · 1 过期 · 下一项 N-02 · 本里程碑计划变更 0 次 · 已关闭里程碑 1 项未绿
```
`git status` on main stays clean. M1 is closed with no Owner words, no review and no journey.

**Scope:**
- The same route works for `approvals.jsonl` before the first approval (inferred: same mechanism).
- For a protected file that already exists, the outcome depends on how Git handles the collision; my one attempt was muddied by my own fixture, so that case is not established.
- This is the Owner's platform: macOS's default file system is case-insensitive.

**Fix:**
- Compare with `-- ':(icase).ultra'`. On the bypass merge, the engine's command printed nothing, and `git diff-tree -r --no-renames <HEAD> <merge> -- ':(icase).ultra'` printed `A .ULTRA/ledger/milestones.jsonl`. The exact-path allowlist then refuses it.
- Equivalently, drop the pathspec and refuse every path matching `/^\.ultra(\/|$)/i` that is not an exact allowlisted path.
- Add the `.ULTRA/` case to the B2 test, and adjust the "on any file system" sentence.

## Should-fix

- **S1. A branch's forged evidence keeps a red check green on main until `ubp check --all` (reproduced). The ceiling says the opposite.**
  - Where: `FORMATS.md:795` says "evidence is stale after the merge anyway", and `method/ultra.md:287` says "After each merge, run `ubp check`".
  - What I saw: the branch's only change was one appended pass record for C-2, a red M2 check, carrying the current fingerprints.
    - The merge succeeded: `{"ok":true,…}`.
    - On main, `ubp check` reran nothing and exited 0.
    - `node done N-02` printed `node N-02: pass`, although `src/two.cjs` does not exist.
    - Only `ubp check --all` printed `C-2: fail (exit-1)`.
  - Why the sentence is false: a branch that changes no code leaves the code fingerprint unchanged, and a deliberate forger can compute the merged tree's fingerprint in any case.
  - Why it is not a blocker: evidence is outside criterion 3's list, and closures stay safe because milestone gate step 1 runs `--all`.
  - Also inferred, not reproduced: Git's union merge still applies one-sided deletions, and the allowlist accepts `M`, so a branch can delete main-line ledger lines.
  - Fix: make method line 287 `ubp check --all`. Real runs are appended after any forged record because of the time floor, so they supersede it; after a code merge every check is stale anyway, so this costs nothing extra. Correct the ceiling sentence.
- **S2. Untested guards, and rule 2.** Four mutants survive their targeted tests:
  - `modeok` and `allowD` (the mode guard and the deletion guard): each survives alone because the other also refuses a deletion. A symlink at an allowed path (for example `.ultra/records/x`, or a new `.ultra/ledger/nodes.jsonl` as a symlink) is caught only by the mode guard, and no test has one.
  - `closedrule` (rule 2 removed): it survives because closing a milestone needs every node done, so rule 3 already covers it. Rule 2 adds behavior only for a requirement added to a closed milestone after its closure. Its never-built check is red at HEAD and would block every parallel merge as `not green at HEAD before the merge` (inferred from `merge.cjs:220-234`). The method calls that "finished work is red", which it is not, and two such nodes in parallel would recreate B1 in miniature.
  - `maint` (the maintenance flags): no test, which is acceptable.
  - Fix: add a symlink-at-an-allowed-path test, and decide whether rule 2 should block only checks that passed at HEAD or whose node is done.

## Nits

- **N1.** The brief's added `ubp check` exits 1 and prints `fail` lines for unbuilt checks of later milestones. I reproduced `C-2: fail (exit-1)`, `check exit 1`, then `node N-clean: pass`. A writer could count that against "If three attempts leave a check red, stop" (`context.cjs:24`). Say in the Rules line that failures no finished node needs are expected.
- **N2.** `method/ultra.md:270` says "a node that is done". The engine and FORMATS rule 3 count any completion record, so a stale node counts too.
- **N3.** Retro still names classes by test name. Tests re-reddened by review-added cases count as regressions, because the engine cannot tell new acceptance from a regression. Worth one sentence in the method.
- **N4.** A branch evidence line dated `9999-12-31T23:59:59.999Z` makes the merge exit 2 with `.ultra/ledger/evidence.jsonl: refusing to append a malformed ledger record.` Main is protected, but the message does not point at the branch's line.
- **N5.** `gitFailure` (`git-state.cjs:22-27`) replaces a spawn error's own message (for example a missing cwd) with only `Git failed: <args>` (inferred from the code).
- **N6.** The RESULTS.md addendum, line 58, says "写者报告都在 `data/reports/`". That directory holds one writer report (`T1-B.writer-report.md`) plus three Codex results, so the context-rebuild metric cannot be rebuilt from `data/`. The decision rule does not use it.

## Not addressed by design: do I accept?

- **Owner item 4 (removing an invariant leaves no plan-log record):** accepted as a ceiling. FORMATS states it only implicitly ("belongs to no milestone", line 135); it is explicit in a test name and in the method's ruling rule. One sentence in the Reductions ceiling would make it explicit.
- **N4's detached fast-forward and registration-only leftovers, untested:** accepted. The first needs a signal inside a window of a few milliseconds. The second is harmless: a new random path never collides, and a stale registration only shows as prunable.

## What must be said to the Owner

1. **M-P4 cannot close on this round.** One forgery route remains (B1): on macOS, a branch can close a milestone through an upper-case `.ULTRA/` path. The fix is one pathspec and one test, and I verified that the fixed command sees the path. The controller's own ruling sends any remaining revise to the Owner. **My recommendation:** authorize that fix, and let the controller confirm it with this reproduction rather than a new review round.
2. **REQ-P4-merge was loosened by proxy.** The assistant approved it on the Owner's behalf, and the Owner has not seen it. Other writers' unfinished work now only warns; invariants, closed milestones, finished nodes and checks green before the merge still block. This matches RESULT §3.6.
3. **A writer can still make a red check look green on main** with a forged evidence line, until someone runs `ubp check --all` (S1). Closures stay protected because the milestone gate runs `--all`. Changing one word in the method closes the gap for merges.
4. **Removing an invariant needs no approval and leaves no plan-log record.** It is an accepted ceiling, recorded only by a ruling.
5. **The merge gate has still only run on fixtures**, never on R or a real project.

Verdict: revise
