Reviewer: Claude reviewer subagent (fresh context; wrote none of the P4 engine, the method or the tests)

# M-P4 gate review: `v6-p4` at `cd6828b`

The engine code is careful, and every round-2 blocker and should-fix is resolved, each with a test. Two things still break the criteria:

- **Parallel writers can never merge.** Two writers working in the same milestone can never get their branches through the merge gate. That is the case the method's parallel-writer section describes.
- **A branch can still bring in closures, approvals and plan-log lines** by giving a protected file a different name or path.

**How I worked:** all experiments ran in a throwaway clone of `cd6828b` and in fixture repositories under `$TMPDIR`. Everything is deleted, and I left no worktree registered.

**The workspace changed while I worked, not by me.** It was clean when I started. It now shows ` M .ultra/records/deviations.md` and `?? .ultra/records/experiments/p5-evolution/`, presumably from the controller's concurrent P5 work.

## Acceptance criteria

| # | Criterion | Result | How I know |
|---|---|---|---|
| 1 | FORMATS and engine agree; engine ≤ 2,000 lines | **Met** (nits N1, N2) | Read every P4 section against `merge.cjs`, `states.cjs`, `plan.cjs`, `completion.cjs`, `context.cjs`, `formats.cjs`, `cli.cjs`. `wc -l engine/*.cjs` gives `1744 total`; no line is over 100 characters. FORMATS describes the B1 rule faithfully: the code matches the contract, and the contract itself is the problem. |
| 2 | P4 suite protects the contract, was red first; P1–P3 and boundary suites green | **Met**, with a gap | `node --test tests/engine-p4.test.cjs`: `tests 51, pass 51, fail 0` (181 s). P1, P2, P3, boundaries and package-smoke: `tests 197, pass 197, fail 0`, exit 0. Red-first logs: `acceptance-red.log` 1/22 pass, `round2-red.log` 21/33, `round3-red.log` 7/18. I ran 12 targeted mutants and 9 were caught. The gap: every merge fixture's checks pass before anything is built, so no test can see B1. I did not rerun `npm run verify:release`. |
| 3 | A refused or interrupted merge leaves main unchanged (also when two overlap); a branch never brings in truth files, closures or approvals | **Not met** (B2) | The unchanged-main half holds. The tests for it pass (lines 829, 855, 880, 1155, 1171, 1194) and I found no counterexample. The branch half fails: three reproductions merged with exit 0 (B2). |
| 4 | `method/ultra.md` matches the engine and says what to do on each refusal | **Not met** (B1, S1–S3) | The advice for `not green at HEAD before the merge` cannot be followed in the normal parallel case. Node briefs following the Node loop are refused once a project has an invariant. Some refusal codes have no instruction. |
| 5 | A/B/C conclusion follows from `PROTOCOL.md` and `data/` | **Met** | Recomputed from `usage.tsv`: totals match RESULTS.md to the token. B is 3.30–3.80× A's tokens and C is 3.62–5.23×. Critical path: B 2.68–3.47×, C 2.67–4.52×. Hidden logs: T1 6/6, T2 3/4 and T3 6/6 in every arm. The T2 failure is the `JSON.parse` of an HTML 404, as stated. File birth times: `PROTOCOL.md` was created at 07:17:40, before the first unit's setup (08:49) and first dispatch (08:54). It was last modified at 09:23:25, during the runs. |

## Round-2 findings

| Round 2 | Status | Evidence |
|---|---|---|
| B1: overlapping merges ran `reset --hard` in main | Resolved | `merge.cjs:112-114` takes the lock first. `git-state.cjs:17` bounds Git with `GIT_CEILING_DIRECTORIES`. Tests 829, 855 and 880 pass. Mutants removing the ceiling or the lock are caught. |
| S1: an ignored file under `.ultra/` refuses merges | Resolved | `merge.cjs:74-75` uses `--exclude-standard` and the message names the paths (test 911). |
| S2: a dirty pass counted at the gate | Resolved | `merge.cjs:15` `passing` is used in the main loop and in bisect (test 930). |
| S3: method's parallel section stale | Resolved as asked | `method/ultra.md:254-277`. New gaps are in S3 below. |
| S4: branch content left unchecked | Engine part partly resolved | Closures, approvals and the merged-tree plan gate are now checked (tests 955, 972), but bypassable (B2). The method part is resolved: line 261 requires the step-4 verification before merging. |
| S5: cleanup node `ready` while `node done` refuses | Resolved | `states.cjs:70` uses `dependencies()` (test 990; mutant caught). |
| N1: Ctrl-C during Git exits 2 | Resolved | `merge.cjs:136, 229` and the detached fast-forward at `:131` (tests 1171, 1194). The detached part is not discriminated by any test (N4). |
| N2: repository-wide prune | Resolved | No `prune` left in `engine/`; only the merge's own registrations are dropped (test 1043). |
| N3: ledger-conflict hint | Resolved | `merge.cjs:181-183`, test 1023. |
| N4: env config dropped | Resolved | Documented at `FORMATS.md:221-222`. |

## Blockers

### B1. Two parallel writers in one milestone can never be merged (reproduced)

**Where:**
- `merge.cjs:189-203`: every check covering a current-milestone requirement blocks.
- `FORMATS.md:704-707` and REQ-P4-merge in `.ultra/spec.md` say the same.
- `method/ultra.md:250-274` describes two parallel writers on "ready nodes" of the frontier.

**Reproduction:** a fixture whose checks start red, as the method requires ("every new check must be red or unknown" before code):
- M1 holds REQ-001/C-1 and REQ-002/C-2, with nodes N-01 and N-02, both `depends: []`.
- Two worktrees: each writer builds its node, runs its check and `node done` (both `pass`), and commits its ledger.

Results:
```
merge wA: refused
check-not-green: C-2 is not green: AssertionError: two not built; not green at HEAD before the merge — Repair the failing check on the branch and retry.
merge wB: refused
check-not-green: C-1 is not green: AssertionError: one not built; not green at HEAD before the merge — Repair the failing check on the branch and retry.
```

**Why it blocks:**
- Each branch waits for the other's requirement, so the gate merges a branch only when that branch finishes the whole current milestone.
- The method's advice ("the main line is red, fix it first") and the engine's hint ("Repair … on the branch") are both impossible here.
- RESULT §3.6 asks that the merged tree "keeps the finished work green". This rule demands the unfinished work too.
- The tests miss it because `PASS_SCRIPT` passes on unbuilt code. The merge gate has never run on R (RESULTS.md: "本实验不检验并行写者").

**Fix:**
- A check should block when it is an invariant, or covers a requirement of a closed milestone, or passes at HEAD (the engine already probes HEAD in `firstBad`), or covers a node whose completion the branch brings in.
- Checks red at HEAD that the branch does not claim still run and are reported, but do not block.
- This changes REQ-P4-merge (an L1 modify that loosens what blocks), so it needs an Owner ruling.
- Add a test with red-first checks and two branches.
- Update the method's advice for `not green at HEAD before the merge`.

### B2. A branch can bring in closures, approvals and plan-log lines (reproduced, three ways)

**Where:**
- `merge.cjs:167-174` checks a denylist of five exact paths, using `base..tip`.
- The engine reads ledgers through symbolic links (`ledger.cjs:74-76`).

**The three reproductions, all with merge exit 0 (`{"ok":true,…}`):**
1. **Case variant (macOS, case-insensitive APFS).** The branch commits `.ultra/ledger/Milestones.jsonl` containing `{"v":1,"milestone":"M1","at":"2026-11-01T00:00:00.000Z"}`. Afterwards main's `ubp status` reads `M2 · 1/1 绿 · 下一项 N-02`: M1 is closed with no Owner words, no review and no journey.
2. **Symlink (works on any filesystem).** The branch replaces `.ultra/ledger/` with `.ultra/ledger -> records/l`, holding a forged `milestones.jsonl` and `approvals.jsonl`. Main then shows M2 as current.
3. **Plan-log line.** The branch appends a plan-log `change` record for M2 without REQ-002, with `at` 2026-12-01. After the merge, the planner deletes REQ-002, C-2 and M2 from spec, checks and plan. `ubp gate` then gives `gate: pass`, exit 0, with no `reduction-unapproved`. The new record also inherits the forged future time (`2026-12-01T00:00:00.001Z`).

**Threat model:** none of this happens by accident; it needs a writer that deliberately forges files. But criterion 3 says "never", and protected acceptance (RESULT §3.7) exists for exactly that kind of writer.

**Fix:**
- After the temporary merge, diff `HEAD..<merged> -- .ultra` with `--no-renames` and the raw modes.
- Refuse unless every changed path is in an allowlist: `ledger/evidence.jsonl`, `ledger/nodes.jsonl`, `rulings.md`, and regular files under `records/`.
- Refuse any symlink or type change under `.ultra/`, and compare names case-insensitively.
- Diffing against the merged tree also avoids false `truth-changed` refusals when the merge bases criss-cross (inferred, not reproduced).
- Add the three cases as tests.

## Should-fix

- **S1. Briefs omit invariants that `node done` requires; the hint misleads (reproduced).**
  - Where: `context.cjs:29-30` lists only the covering checks; `completion.cjs:42` requires every invariant; `states.cjs:144-147` always uses `fix` as the hint.
  - What I saw: the N-02 brief says ``Run `ubp check C-2` … then `ubp node done N-02` ``. Following it gives `invariant-not-green: I-size is not green — Split the file: no source file may exceed 300 lines.` The invariant was only stale after the writer's commit, not violated.
  - Fix: name every check `node done` needs in the brief's Rules line (or just `ubp check`). Use `fix` as the hint only when the invariant is red; otherwise hint `ubp check <id>`.
- **S2. The cleanup brief has the same gap (reproduced).** The brief says `Run ubp check I-size …`. After the cleaner's commit, `node done N-clean` gives `requirement-not-green: REQ-001 is not green` (`completion.cjs:27-41`). Same fix as S1.
- **S3. Refusal instructions missing from the method.**
  - `method/ultra.md:269-275` has no action for `plan-gate`, `nothing-to-merge`, a `merge-busy` that persists (a dead lock whose pid was reused, or a lock file with garbage in it; `ledger.cjs:154-157` refuses forever), or exit 2.
  - Exit 2 messages also lack Git's reason: `git-state.cjs:42-43` puts only the arguments into the message. A merge that fails on identity, a hook or signing prints `Git failed: merge …` and nothing else.
- **S4. `retro` groups failures by test name, not by error kind.** Under the spec reporter the method recommends, `error_line` is the `✖ <test name>` line (`checks.cjs:74-78`). On a throwaway clone of R with closures hidden, retro reported `重复两次及以上：14 类`. Every one was a test name from ordinary red-before-green runs (for example `10 × ✖ REQ-expire: …`). `method/ultra.md:243-246` turns each such class into an environment change. Fix: exclude runs before a check's first pass, or count only regressions, not-runnable runs and timeouts; or classify by the first error line after the `✖` line.
- **S5. The dependency ceiling is stated inaccurately.** `FORMATS.md:756-758` says checks that need installed dependencies cannot use the gate. In fact the temporary tree sits under `<main>/.ultra/.runtime/merge/`, so Node resolves main's `node_modules` by walking up parent directories. That can hide a dependency the branch added (inferred from Node's module resolution, not run). Document it, or add a setup command.

## Nits

- **N1.** `FORMATS.md:836` "Exit 1 only ever means …" leaves out a merge refusal.
- **N2.** `FORMATS.md:840` says "130 or 143", but `signals.cjs` and the merge also handle SIGHUP (129).
- **N3.** `merge.cjs:159-161`: when only code is dirty, the message ends with an empty list (`Uncommitted code or .ultra files: `).
- **N4.** Three mutants survive the targeted tests: no HEAD recheck before the fast-forward (`:219`), a non-detached fast-forward (`:131`), and no registration-only leftover clearing (`:147-149`). The recheck matters when HEAD is reset backwards during the checks, because `--ff-only` would then succeed. Add that test.
- **N5.** The temporary merge runs Git's auto-maintenance and the repository's hooks. A triggered `gc` expires old reflog entries repository-wide (inferred). Passing `-c maintenance.auto=false` avoids it.
- **N6.** RESULTS.md does not report "上下文重建", a metric registered in `PROTOCOL.md`.

## What must be said to the Owner

1. **Parallel writers do not work yet (B1).** Fixing it means changing REQ-P4-merge from "every check of the current milestone" to "the finished work". That narrows what blocks a merge, so it is their call. The merge gate has only run on fixtures, never on R.
2. **A writer can forge closures and approvals through the merge (B2).** It takes deliberate forgery, not accident. They should decide whether adversarial writers are in scope. If not, criterion 3's "never" should be reworded.
3. **On the A/B/C decision:**
   - The assistant made it by proxy, and they have not reviewed it.
   - The cost finding is solid: 3–5× the tokens and 2.7–4.5× the time.
   - The quality finding is weak: A already scored 6/6 on T1 and T3, and T2's hidden test was broken, so B or C could hardly have won.
   - "Cross-vendor review at the milestone gate" was not measured.
   - Pre-registration rests on a file creation time before the first unit; the protocol was first committed together with its results.
4. **Removing an invariant needs no Owner approval and leaves no plan-log record.** Only a ruling records it, by convention.
5. **For their first real sample:** the merge gate's temporary tree has no installed dependencies, and retro output at milestone gates will be mostly ordinary TDD red runs (S4, S5).

Verdict: revise
