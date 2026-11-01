Reviewer: Claude `reviewer` subagent, same reviewer as round 1, fresh read of the round-2 changes (engine by Codex; contract and tests by the acceptance author; method edits by the controller)

# P4 engine review, round 2

All five round-1 should-fix findings are resolved for a single merge. One new problem blocks the commit: two `ubp merge` runs that overlap can run `git reset --hard` in the main repository and destroy uncommitted work there. It is caused by the round-2 step that clears leftover temporary trees. The method's parallel-writer section was not updated for the new merge rules and now tells the controller to run commands that fail.

**What I checked:**
- The round-1 copies of FORMATS and the tests diffed against the current files, and the full engine diff from `39edb70`.
- About 30 throwaway Git fixtures under `$TMPDIR`, using the workspace CLI. This includes 26 timed trials of two overlapping merges.
- 22 broken copies of the engine run against the revised P4 suite in a `/tmp` copy.

All scratch files are deleted. The workspace's modified and untracked file list is as it was at the start of round 2, and no worktree I created is left registered.

## Round-1 findings

| Round-1 finding | Status | Evidence |
|---|---|---|
| 1. Inherited `GIT_DIR` moves main | Resolved | `engine/git-state.cjs:11-27`, `engine/checks.cjs:34`. With `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` all exported, a refusal exits 1 with HEAD unchanged and the tree clean, and a pass exits 0 with the tree clean and one worktree. A check `test -z "$GIT_DIR$GIT_WORK_TREE$GIT_INDEX_FILE"` passed inside the gate. With `GIT_DIR=/nonexistent`, `status` still exits 0. |
| 2. The temporary tree decides which checks matter | Resolved | `merge.cjs:161-164` takes closures and the current milestone from main; `:147-154` refuse `truth-changed`. Covered by tests. What is left is a different gap: check files, ledger lines and rulings on a branch are still unchecked (S4). |
| 3. The fast-forward fails on the ledger | Resolved in the engine | `merge.cjs:63-70` with `:141` refuse an uncommitted `.ultra/`; `:191-196` turn a failed fast-forward into `fast-forward-failed`. I reproduced that path: a file edited in main during the checks gave exit 1 `fast-forward-failed`, HEAD unchanged, the edit kept. Two new issues come from this fix: S1 (engine) and S3 (method). |
| 4. Bisect blames the wrong commit | Resolved | `merge.cjs:77-78` try HEAD first (tested). A check added halfway through a branch can no longer happen, because of `truth-changed` and because the registry now comes from main. |
| 5. Cleanup failure hides the result; leftovers never pruned | Resolved for one merge at a time | `merge.cjs:52-61` (fallback removal plus `warnings`), `:132-138` (clear leftovers). After a SIGKILL, the next merge exits 0 with `warnings: []`, one worktree and an empty `merge/`. The leftover clearing is what causes B1. |
| Nit: interrupts outside a running check | Partly | `merge.cjs:105-127` (AbortController). I sent SIGINT to the whole process group at 300, 900, 1600 and 2600 ms: exit 130, HEAD and branch unchanged, tree clean. At 3600 ms it exited 2 (N1). |
| Nit: `--expect-head HEAD` | Resolved | `merge.cjs:95-97`; the test covers `HEAD`, `main` and a 12-hex prefix. |
| Nit: the cleanup node can be completed first | Resolved in `node done` | `completion.cjs:21-27`, tested. `status` still disagrees (S5). |
| Nit: retro empty class | Resolved | `states.cjs:149`, tested. |
| Nit: a refusal has no failure output | Resolved | `merge.cjs:183`, tested. |
| Nit: bisect edge cases | Resolved | A conflict now counts as not passing in both FORMATS and `:85`. An unparsable `checks.json` partway through a branch cannot happen now. |
| Nit: the cleanup brief omits invariants | Resolved | `context.cjs:29-40`, tested. |
| Nit: double load | Resolved | Merge no longer loads the project. |

## Blocker

**B1. Overlapping merges run `git reset --hard` in the main repository.** Reproduced. Must be fixed before commit.
- **Where:**
  - `merge.cjs:132-138`: every run deletes every entry under `.ultra/.runtime/merge/` before any other check. That includes a run that is about to be refused as `head-moved`.
  - In the surviving run, `checks.cjs:83` (`mkdirSync`) recreates the deleted path as a plain directory inside main's work tree.
  - Git then finds main's repository by walking up from that directory, so the temporary tree's `reset --hard` and `clean -fdx` (`merge.cjs:73-76`) act on main.
- **Deterministic reproduction:** merge A with a slow check in the temporary tree, then merge B started during it. A exits 2 `spawnSync git ENOENT` both when B is refused `head-moved` and when B merges.
- **Timed race:** 26 trials, with an uncommitted edit made in main while A runs (the merge holds no lock, as FORMATS says). In 16 trials B overlapped A:
  - 5 times A ran `git reset --hard` in main. The reflog shows `reset: moving to <head>`, the uncommitted edit was lost, and A then reported a false `check-not-green` (`Error: Cannot find module …/checks/pass.cjs`).
  - 11 times A died with exit 2 (`spawnSync git ENOENT`, `fatal: Unable to read current working directory`, or a failed `git worktree add`).
  - HEAD and the branch stayed unchanged in every trial. With a four-commit branch no bisect merge reached main, because the HEAD probe fails first in the emptied directory.
- **Why it blocks:** FORMATS (Merge gate) promises "On refusal the main tree, HEAD and the branch are unchanged". This loses uncommitted work, which cannot be recovered. The parallel-writer method makes overlapping merges plausible: two writers finish, and the controller merges both.
- **Fix:**
  - Hold one merge lock (pid-owned, like `engine.lock`) for the whole command, and clear leftovers only while holding it. Alternatively, delete only entries whose owner pid is dead.
  - Pin the temporary tree's Git calls so discovery cannot climb into main: set `GIT_CEILING_DIRECTORIES` to `.ultra/.runtime/merge`, or pass `--git-dir`/`--work-tree`, or check that `<temporary>/.git` exists before each destructive call.
  - Say in FORMATS what a second concurrent merge gets, and add a two-merge test.

## Should-fix

**S1. An ignored file under `.ultra/` refuses every merge.** Reproduced. Must be fixed before commit.
- **Where:** `merge.cjs:67` runs `ls-files --others` without `--exclude-standard`, so ignored files count as untracked.
- **What I saw:** with `.DS_Store` in `.gitignore` and `.ultra/.DS_Store` present, `git status` was empty and `ubp status` said `dirty: false`, but `merge` refused `dirty-tree` ("Code or .ultra files are uncommitted"). The message names no path.
- **Why it matters:** FORMATS:688 says "untracked", so the contract and the code disagree. On macOS, Finder creates these files.
- **Fix:** add `--exclude-standard`, and name the offending paths in the message.

**S2. A dirty passing run counts as a pass at the gate.** Reproduced. I recommend fixing before commit; it is one line.
- **Where:** `merge.cjs:174` (also `:78` and `:85`) tests only `record.outcome`.
- **What I saw:** a check that rewrites tracked `src/app.cjs` and exits 0 merged with exit 0. The same check in main records `C-2 pass dirty=true` and its state is `unknown (dirty-run)`.
- **Why it matters:** the gate is weaker than `node done`, and the code it accepted is not the merge commit.
- **Fix:** block on `outcome !== 'pass' || record.dirty`, in the main loop and in `firstBad`. Extend FORMATS:698 ("any outcome but `pass` blocks") to say "or a dirty run".

**S3. The method's parallel-writer section is stale.** Must be fixed before commit (text only).
- **Where:** `method/ultra.md:244-251`.
- **Problems:**
  - `--expect-head <HEAD>`: a literal `HEAD` is now a usage error. It should say the full commit id from `git rev-parse HEAD`.
  - It never says to commit `.ultra/` on main before a merge. `method/ultra.md:95-96` commits only after the gate and after closures. Line 251 says "After a merge, run `ubp check`", which leaves uncommitted evidence, so the next merge is refused `dirty-tree`.
  - It never mentions `.ultra/ledger/*.jsonl merge=union`. Without it, two writers' evidence produced `merge-conflict: .ultra/ledger/evidence.jsonl` (reproduced).
  - It never says that a branch may not change `spec.md`, `checks.json` or `plan.json`.
  - "A refusal names the conflicting paths or the first bad commit" omits `not green at HEAD before the merge`, `truth-changed`, `dirty-tree`, `fast-forward-failed` and `warnings`.

**S4. Branch content the gate does not check, which the serial flow's step 4 checks by hand.** Reproduced. The method part should land before commit; the engine part is the Owner's decision.
- **What I saw**, each merged with exit 0:
  - an `approvals.jsonl` line written on a branch; the approval is now in main;
  - `checks/pass.cjs` rewritten to always pass, plus code that breaks C-2;
  - a malformed ruling; main's plan gate then fails `malformed-ruling`.
- **Why it matters:** `method/ultra.md:110-112` has the controller verify that a writer's commits touch no check file and add no approval line, but the parallel section never asks for that before `ubp merge`.
- **Fix:**
  - Method (minimum): run step 4's verification on each branch before merging.
  - Engine (optional): refuse a branch that adds lines to `approvals.jsonl` or `milestones.jsonl`, and run the plan problems on the merged tree.

**S5. A cleanup node is `ready` and `next` while `node done` refuses it.** Reproduced. The Owner can defer this; it arises only when plan order and `depends` disagree.
- **Where:** `states.cjs:64` decides readiness from `depends` only; `completion.cjs:21-22` also requires every earlier node of the milestone.
- **What I saw:** plan `N-01 (depends N-02), N-clean, N-02`. `status` gives `N-clean: ready` and `next: N-clean`, and `node done N-clean` refuses with `N-01 is not done`. The controller would brief a writer for work that cannot be recorded.
- **Fix:** add the same implicit dependencies in `nodeStates`, and update the `ready` definition at FORMATS:395.

## Nits

- **N1. Ctrl-C during a synchronous Git call exits 2.** A process-group SIGINT that kills a synchronous `git` inside a check exits 2 with `Command failed: git --no-optional-locks status …` instead of 130 (reproduced in 1 of 5 phases; main unchanged, temporary tree removed). Fix: map `error.signal` through `INTERRUPTS` in the catch at `merge.cjs:198-200`. Also inferred, not reproduced: during `--ff-only` (`:190-191`) the engine's handler ignores the signal, but a terminal Ctrl-C still reaches `git` in the same process group and could stop the checkout partway. Running that call detached would avoid it.
- **N2. `git worktree prune` is repository-wide.** It runs at `merge.cjs:138` on every merge, including refused ones, and also at `:59`. It drops the registration of any worktree whose directory is missing, for example one on an unmounted volume. The main repository's own `git worktree list` currently shows a dozen `prunable` entries that a merge there would remove. Fix: remove only entries under `.ultra/.runtime/merge/`.
- **N3. Misleading hint for a ledger conflict.** At `merge.cjs:158-159`, a conflict on a ledger path gets the hint "Resolve conflicts on the branch". The cause is a missing `merge=union`, and the hint should say so.
- **N4. Config passed through the environment is dropped.** `gitEnvironment` (`git-state.cjs:11-17`) also removes `GIT_CONFIG_PARAMETERS` and `GIT_CONFIG_COUNT`, so `git -c` settings and CI-injected configuration no longer reach the engine's Git calls (inferred). This is probably intended; FORMATS could say so.

## Method edits (item 3)

- **Accurate:**
  - Step 4's approval-line check.
  - A check's fingerprint covers only `run`, `timeout_sec` and `expect` (`loading.cjs:14`), and a check script is code, so weakening it only makes checks stale.
  - Approving after a refused gate works: a refused gate records no plan-log entry, so the approval is later than the floor in `plan.cjs` `reductionProblems`.
  - `approve` checks only the item and a non-empty `--owner`.
  - L2 has no per-module invalidation: node staleness comes only from `req-changed` or `shared-changed` (`states.cjs` `nodeState`).
  - The invariant, cleanup and retro bullets, and step 1 of the milestone gate, match the engine.
  - The demo additions match the owner-touches format.
- **Stale:** the parallel-writer section (S3, S4).

## Acceptance gaps (22 broken copies of the engine, 13 caught)

Caught: the HEAD probe; the `.ultra/` dirt check, two variants; `truth-changed`; leftover clearing; `makeWritable`; environment stripping in `git()`; the `--expect-head` form; closed milestones mattering; the cleanup node's earlier-node rule; the cleanup brief's `fix`; retro `||`.

| Survived | Missing test |
|---|---|
| Merge's own interrupt handler disabled | The interrupt test sends SIGTERM to node during a check, so `runShell`'s handler answers it. Signal the process during bisect or during a Git call. |
| Bisect without `--first-parent` | The first-parent test passes only because of how `rev-list` orders commits made in the same second. Give the side commit a later date. |
| `unknown` counted as a pass in merge | A branch whose check times out. |
| `spec.md` not a truth file | A branch that edits `spec.md`. |
| Checks keep `GIT_DIR` | The `GIT_DIR` test never looks at the environment a check sees. |
| A conflict in bisect counted as passing | A bisect step that conflicts. |
| `fast-forward-failed` rethrown as an error | A main-tree edit during the checks (the path works; I reproduced it). |
| Cleanup requires every requirement of its own milestone | A cleanup node in the middle of a milestone. |
| No HEAD recheck before the fast-forward; no prune in `removeTree` | Nearly equivalent: the catch at `:193` and the prune at `:138` cover them. |

The new tests protect the right behavior. `commitUltra` matches both the new `dirty-tree` rule and the method's commit points.

## Acceptance criteria

- **Met:** P4 suite 33/33. Controller log `round2-p4.log`, and my `/tmp` copy: 33 pass, 0 fail, 258 s on a machine with load average 6–10.
- **Not rerun by me:** P1, P2, P3 and boundaries 196/196, and `verify:release` exit 0. Both figures come from the controller's `round2-*.log`.
- **Met:** size. 1,662 lines (budget 2,000); longest line 100 characters (`cli.cjs:97`).
- **Not met:** the FORMATS guarantee that a refusal leaves the main tree unchanged, when two merges overlap (B1).

## Must be fixed before P4 is committed

B1, S1, S2 and S3, plus the method half of S4. The Owner can decide on the engine half of S4, on S5, and on the nits.

Verdict: revise
