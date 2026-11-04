Reviewer: Claude `reviewer` subagent, same reviewer as round 1, fresh read of the round-2 changes

# P3 engine review, round 2 (verbatim)

All round-1 findings are fixed and I found nothing that blocks the commit. Your two code changes are correct; two optional tests below would protect them better.

**What I checked:** the full round-1 → round-2 changes, read against my round-1 findings. I rebuilt the round-1 tree in /tmp from f903a90 plus `p3.diff` and diffed it against the workspace. The changes are limited to `engine/plan.cjs`, `engine/FORMATS.md`, `method/ultra.md` and `tests/engine-p3.test.cjs`, which matches `p3-round2.diff`. I re-ran 12 broken copies of the engine (round-1 survivors plus new ones on your code) against throwaway fixtures. All my /tmp files are deleted and the workspace is unchanged.

**Your code:**
- **Closure floor** (`engine/plan.cjs:156-157`): an approval must be later than both the milestone's latest plan-log record and its closure. That matches FORMATS at `engine/FORMATS.md:463`. An approval given after the closure still counts, which is right. The round-1 scenario is now refused, with or without the later M2 change in between.
- **`Object.hasOwn` in `snapshotDiff`** (`engine/plan.cjs:119-131`): correct. An approved deletion of a check named `valueOf` is now recorded, the approval is used up, and a second gate records nothing.

**Round-1 findings, each now caught by its new test** (the broken copy fails it):
- S1 (milestone half of an approval item).
- S2 (fenced shared text).
- S3 (approval before closure).
- Node reason order.
- `shared` hash validation in evidence and plan-log.
- `diff.shared` must be `true`.
- S4, S5 and the text nits: the new FORMATS and method wording matches the engine:
  - the upgrade paragraph matches the full upgrade I walked through in round 1;
  - the problem-order sentence now matches the code;
  - an item covers any reduction of what it names;
  - hand-written approvals count;
  - "approve, edit and gate in one go";
  - the L1 add row now says every check is stale until `ubp check`.
- **Line width:** the long lines that remain are tables, the base's line 184, a JSON example, the progress-line template and the verbatim brief rules.

## Findings

Both are nits; the code is right in both cases, but each new branch has no test.

1. **The `closed.at &gt; before.at` comparison has no test** (`engine/plan.cjs:157`).
   - Simplifying it to `closed ? closed.at : before.at` passes all 195 tests, and that simplification is an easy one to make by accident.
   - Fixture: close M1, `approve M1/C-2`, gate an edit to the shared text (which records an M1 change after the approval), then drop C-2.
   - Real engine: exit 1 with `M1/C-2`. Simplified copy: exit 0.
   - The test at `tests/engine-p3.test.cjs:407` covers this ordering only for open milestones. Adding these steps to the test at line 513 would cover it.
2. **The `valueOf` test only covers deletion** (`tests/engine-p3.test.cjs:527`, `engine/plan.cjs:129`).
   - Putting `in` back in `checks_added` passes all 195 tests.
   - Under that copy, adding a check named `valueOf` after the baseline records nothing, and deleting it later passes with no approval. The real engine records the addition and refuses the deletion.
   - The test title says "reductions and diffs"; one addition step would cover it. The id is contrived, so this is low priority.

Two broken copies that are stricter than the contract also pass every test: one ties approvals to any milestone's latest plan change, the other to any milestone's closure. Both can only refuse more than they should, so neither needs a test.

## Evidence and status

- **Suites on the final tree, my own run:** `node --test tests/engine-p1.test.cjs tests/engine-p2.test.cjs tests/engine-p3.test.cjs tests/engine-boundaries.test.cjs` gave 195 tests, 195 pass, 0 fail (93 s).
- **Engine size:** 1,346 lines, none over 100 characters.
- **Mutation round 2:** 7 of the 12 copies are caught. Of the 5 that pass, 2 are the stricter ones above, 2 are the nits, and 1 (`in` in `checks_modified`) behaves the same as the real code.
- **Not checked by me:** `npm run verify:release` on the final tree (you're rerunning it), `npm pack --dry-run` and the install doctor.

Verdict: commit
