Reviewer: Claude `reviewer` subagent at xhigh, fresh context (the P4 engine was written by Codex; the contract and tests by the main session)

# P4 engine review, round 1 (verbatim)

The merge gate can leave the main branch moved after a refusal, and it can merge a branch while a check that matters is red. Both reproduced in throwaway fixtures, so my verdict is revise. The invariant, cleanup and retro parts are mostly correct; their problems are edge cases and test gaps.

I read the full P4 diff, ran the P4 suite (22/22 here), ran about 15 merge-gate scenarios against fixtures under `$TMPDIR`, and ran 21 broken copies of the engine against the P4 tests. All scratch files are deleted, and the workspace's modified-file list and `git worktree list` are as they were before.

## Should-fix

**1. With `GIT_DIR` set, a refused merge still moves the main branch.** Reproduced.
- **Where:** `engine/git-state.cjs:8-11`. The `git()` helper only sets the working directory. An inherited `GIT_DIR`/`GIT_WORK_TREE` therefore redirects every write in the temporary tree to the main repository: `engine/merge.cjs:27`, `:49-51` and `:88`.
- **What I saw:** I ran `ubp merge feature --expect-head <HEAD>` with `GIT_DIR=<root>/.git`.
  - With a green branch, it answered `head-moved` (exit 1).
  - With a broken branch, it answered `check-not-green` (exit 1).
  - In both cases main had moved to `Merge feature (ubp merge gate)`, and `git status` showed `D src/one.txt` (index and work tree out of step).
- **Why it is realistic:** `man githooks` (git 2.50.1, lines 24–28) says git exports `GIT_DIR`, `GIT_WORK_TREE` and similar variables to hooks. It also says a hook that runs git in a different work tree of the same repository must clear them.
- **Fix:** remove the variables listed by `git rev-parse --local-env-vars` from the environment of the git helper, and of checks run in the temporary tree (`engine/checks.cjs:34`).

**2. Which checks "matter" is decided by the temporary tree's committed ledger and the merged plan, not by main.** Reproduced.
- **Where:** `engine/merge.cjs:94-100`. Two scenarios:
- **Closure not committed:** M1 was closed in main but the ledger was not committed; the tree still counts as clean. A branch that breaks C-3, a check of the current milestone M2, merged with exit 0. After `ubp check`, main shows `1 红`. With the ledger committed first, the same merge is refused correctly.
- **Branch changes the checks:** a branch deleted C-2 from `checks.json`, rewrote C-1's `run` to `echo pass 1`, and committed code that breaks both. It merged with exit 0, and main's plan gate then fails with `reduction-unapproved M1/C-2`.
  - The plan gate is only checked before the merge (`merge.cjs:76`), so the gate lets in a reduction the Owner never approved. That breaks the ratchet in RESULT §3.7.
- **Fix:** take closures and the current milestone from main (or the union of main and the merged tree). Refuse when a check that matters in main is missing from the merged registry. Run the plan gate on the merged plan against main's ledger. FORMATS should say which tree decides.

**3. The parallel-writer flow in the method doc fails at the fast-forward.** Reproduced.
- **Where:** `engine/merge.cjs:117-118`.
- **Setup:** ledgers committed with `merge=union` (as FORMATS recommends), main has uncommitted evidence from `ubp check` (status is still clean), and the branch committed its own ledger line. `method/ultra.md:230` and `:236` prescribe exactly this.
- **What I saw:** every check ran, then the command exited 2 with raw git output: `Your local changes to the following files would be overwritten by merge: .ultra/ledger/evidence.jsonl`. HEAD was unchanged and the temporary tree removed, but it is an error, not a refusal with a problem. With two parallel writers, the second merge always hits this.
- **Fix:** check before running any checks that tracked engine-owned files are committed (new problem code, or fold it into `dirty-tree` for merge). Turn a failed fast-forward into a problem. Tell the controller in the method doc to commit the ledger before merging.

**4. Bisect blames the wrong commit in two ordinary cases.** Both reproduced.
- **Where:** `engine/merge.cjs:44-61`.
- **Check already red at HEAD:** main committed a file that breaks C-2, and the branch had two innocent commits. The message was `first bad commit <first sha> innocent one`.
- **Check added partway through the branch:** a branch added a failing invariant in commit 2 of 4. Bisect named commit 1 (`one`), because line 55 treats "the check does not exist at this commit" as "not green".
- **Fix:** test the merge base (HEAD alone) first and say "already not green at HEAD" when it fails. Treat a missing check id as green. Add both rules to FORMATS ("Bisect:", line 696).

**5. A failed cleanup hides the merge result, and stale temporary trees are never pruned.** Reproduced.
- **Where:** `engine/merge.cjs:120-127`.
- **Remove failure:** a check left a read-only directory under the ignored `.ultra/.runtime/`. The fast-forward happened (HEAD at the merge commit), then `git worktree remove --force` threw. The command exited 2 with no JSON, and the directory stayed under `.ultra/.runtime/merge/`. A caller sees a failure for an irreversible success.
- **SIGKILL:** the temporary tree stays in `git worktree list`, and the next successful merge does not prune it. SIGINT and SIGTERM during a check are fine: exits 130 and 143, everything cleaned up, HEAD unchanged.
- **Fix:** catch cleanup errors and report them as warnings; fall back to `chmod` plus `rmSync`, then `git worktree prune`; clear stale `merge/*` entries at start.

## Nits

- **Interrupts that arrive outside a running check** (`merge.cjs:112-115`, inferred from the code). Merge's own handler only sets a flag, so the remaining checks and bisect keep running. When problems exist, the refusal is returned with exit 1 instead of the interrupt's exit code. A terminal Ctrl-C also kills git child processes, so it ends as exit 2 "Command failed" rather than 130. During `merge --ff-only` it could leave a partial checkout; not reproduced.
- **`--expect-head HEAD`, or the current branch name, always passes** (reproduced). FORMATS allows it, and the method doc's wording `--expect-head <HEAD>` (`method/ultra.md:231`) invites it. Consider requiring a commit hash.
- **The trailing cleanup node can be completed first** (`plan.cjs:96-109`, reproduced). With `cleanup_every`, a cleanup node without `depends` can be `node done` before any other node. The cadence still holds "in plan order", and its completion rule then checks nothing. Suggest the gate require a cleanup node to depend on the earlier nodes of its milestone.
- **Retro folds silent failures into one empty class** (`states.cjs:149`, reproduced). A failing check with no output has `error_line: ""`, not null, so an `exit 3` and a timeout became one class `""` and printed `2 ×  · S-1, S-2`. The `?? r.reason` fallback can practically never fire. Use `||`, and say "null or empty" in FORMATS.
- **A refusal gives the writer no failure output.** The temporary tree's logs are discarded, and the message has no `error_line`, only "X is not green". Suggest adding the error line before the `first bad commit …` ending.
- **Bisect edge cases** (inferred). A merge conflict at an intermediate commit counts as bad. A `checks.json` that does not parse at an intermediate commit aborts the whole merge with exit 2.
- **Cleanup brief omits invariants.** The brief shows "Checks: None." although `node done` requires every invariant green. It never shows the invariants or their `fix`. This matches the contract and a test locks it in; it is a design gap only.
- **Double load:** `merge.cjs:41` loads the project twice.

## Acceptance gaps

21 broken copies of the engine were run against the P4 suite; 4 were caught and 17 survived. One survivor does not count: making the retro window inclusive can never change a result, because ledger timestamps strictly increase.

| Survived (no test catches it) | Missing test |
|---|---|
| No HEAD re-check before the fast-forward | A check that commits in the main tree during the merge |
| Closed milestones' checks don't matter at merge | Close M1, then merge a branch that breaks C-2 or C-3 (finding 2) |
| Unknown or stale counted as green at merge (2 variants) | A branch whose check times out or dirties the tree |
| `node done`/`milestone close` block only on a red invariant | An unknown invariant blocking `node done` (FORMATS: "anything but green") |
| No "at most K consecutive" rule, or that limit off by one | A plan that ends with cleanup but has K+1 other nodes in a row |
| Cleanup requires every requirement of its own milestone | A cleanup node completed mid-milestone |
| Retro drops `unknown` outcomes; retro window starts after the earliest closure | An unknown run; two closures |
| No `--first-parent`; merge message changed; conflict counted as green in bisect; no `git clean` in bisect | A branch containing a merge commit; asserting the message; the bisect edge cases |
| Interrupt flag ignored | — |
| Merge accepts a stale plan gate | A pending plan change before merge |

Caught: dropping the cleanup node's own-milestone rule; whitespace folding in retro; retro sort order; running the checks in the main tree instead of the temporary one.

## The two test edits

- **Rerunning the mended check by name (`ubp check <id>`):** keeps what the test protects. By the existing contract the default `check` reruns only stale or unknown checks, and the fixture's switch file does not change code, so a red check would stay red.
- **Branch helper commits only the named file:** a correct fix. With `git add -A`, switching back to main deleted main's uncommitted ledger. Side effect: no test now has a committed ledger in main or a branch carrying ledger lines, which is the flow the method doc prescribes. Findings 2 and 3 sit in that blind spot.

## Acceptance criteria

- **Met:** P4 suite 22/22 (`node --test tests/engine-p4.test.cjs`, my run).
- **Met:** P1/P2/P3/boundary tests are unchanged; `git diff 39edb70 --stat -- tests/` shows only `package-smoke.test.cjs`, which adds `merge.cjs`.
- **Not rerun by me:** the 219/219 result for all engine suites comes from your log `.ultra/.runtime/v6/p4/engine-suites.log` (`ℹ pass 219`, `ℹ fail 0`).
- **Not met:** the FORMATS requirements that a refusal leaves HEAD unchanged (finding 1), that every check that matters blocks the merge (finding 2), and that bisect names the first bad commit (finding 4).
- **Met:** size. 1,563 lines, under the 2,000 budget. No line over 100 characters: awk flagged `engine/cli.cjs:97` at 102, but that counts bytes, and `×` is 2 bytes. `merge.cjs` reads clearly.

Relevant files:
- `/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p4/engine/merge.cjs`
- `/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p4/engine/git-state.cjs`
- `/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p4/engine/states.cjs`
- `/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p4/engine/plan.cjs`
- `/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p4/engine/FORMATS.md`
- `/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p4/method/ultra.md`
- `/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p4/tests/engine-p4.test.cjs`

Verdict: revise
