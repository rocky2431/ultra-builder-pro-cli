Reviewer: Claude reviewer subagent (round-3 context resumed), xhigh, re-check 2 confirmation

I read only `git diff 591b45d 04fd380`, plus SKILL.md and the A7 round-4 record where needed to judge consistency. On an archive copy of `04fd380` with dependencies linked, `node --test tests/method-p6.test.cjs` gives `ℹ tests 16`, `ℹ pass 16`. The ledger line added in this diff shows `C-method-p6` failing on that same case before the method edit, so the test was committed red first. SKILL.md is 394 lines; the limit is 395. I did not start a full check run.

(Recorded by the controller verbatim. A confirmation of the four wording fixes after `M-P6-recheck-2.md`, read from `git diff 591b45d 04fd380`; not a review round.)

## Point 1: recursive runners had no stated route. Fixed.

Start step 1 now keeps the directory out "by the runner's own path means (a glob that does not match it, such as `test/*.test.cjs` beside `test/m4/`; pytest `--ignore`; a Go package list)". That is the route I meant, and it covers the cases I reproduced (`node --test`, pytest, `go test ./...`).

It doesn't contradict "the runner and a glob, not a list of files". A Go package list built from `go list ./...` still picks up packages added later.

Small wording point, not a contradiction: gate step 1 says "add that directory to … the invariant's `run`". On the pytest and Go routes the join actually means removing the exclusion, and the recursive project command already runs the directory. A reader will follow it. "(or drop its exclusion)" would make it exact.

## Point 2: a misplaced red test went unseen when a cleanup node fixes a red baseline. Fixed, but the new clause conflicts with characterization tests.

The clause "no test file this commit adds is in an invariant's run (read its `run`)" catches my cl5 case: a new red test sitting in `test/` while the invariant is already red.

It reaches further than Start step 1, though. Start step 1 sends only tests added or rewritten red to the milestone directory. Characterization tests are "committed green" and naturally live inside the invariant: A7 round 4 put its characterization test there by ruling, as "replaces it inside the invariant".

- Written as an edit to an existing file, as A7 did, the characterization test passes the new clause.
- Written as a new file in `test/`, the clause forbids it, though Start step 1 allows it.
- If the characterization check is its own invariant (it covers no requirement, and `engine/formats.cjs:117-121` makes such a check an invariant), its own `run` names the file the commit adds. The clause then forbids the check by construction.

This was my own proposed wording, so the conflict is mine. The fix is to use Start step 1's own words: "no test this commit adds or rewrites red is in an invariant's run (read its `run`)". That also covers a test rewritten red in place, which "adds" misses. The matching assertion in `tests/method-p6.test.cjs` would change with it, and the line count stays the same.

## Point 3: the red-baseline sentence contradicted itself. Fixed.

It now reads "It passes when registered, unless the milestone's first node is a cleanup node … that fixes a red baseline; otherwise a red baseline … is left out of its run, as below". That matches cl5, where the invariant was registered red under a cleanup-first plan. "As below" points to the path means, so the text again says how to leave the baseline out.

One limit worth knowing: path means work on whole files. A red test sharing a file with green ones has to be split out, or go the cleanup-first route.

## Point 4: under drive, the review comes before the join. Fixed as I meant.

Gate step 1's ruling now "quotes the `run` before and after (the engine records no plan change for an invariant)". That agrees with the Invariants paragraph ("Adding one is a ruling (L2), not a plan change") and with the option-A ruling. No contradiction.

Verdict: accept
