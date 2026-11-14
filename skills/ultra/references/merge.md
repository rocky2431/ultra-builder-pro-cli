# Parallel writers and the merge gate (`ubp merge`)

Read this before the first merge of a session. `ubp` is the engine command `SKILL.md`
defines.

## Setup

- Each parallel writer gets its own branch and work tree (`git worktree add`), runs its
  checks and `ubp node done` there, and commits its ledger lines with its code. A branch never
  changes `spec.md`, `checks.json`, `plan.json` or `design.md`, and never approves or closes:
  the merge refuses it (`truth-changed`); such a change is the planner's or yours, on the main
  line.
- Before merging: the project setup line `.ultra/ledger/*.jsonl merge=union` is committed in
  `.gitattributes` (without it two writers' evidence conflicts); `.ultra/` is committed on
  the main line (otherwise `dirty-tree`, naming the paths); and you have verified the
  branch's commits as in Node loop step 4 (scope, no check file, no `.ultra/design.md`, no
  approval line). The merge does not check scope or check scripts.

## What the gate does

Merge with `ubp merge <branch> --expect-head "$(git rev-parse HEAD)"`: a full commit id,
never the word `HEAD`. One merge at a time; a second is refused `merge-busy`. The engine
merges in a temporary work tree, refuses a branch that changes anything under `.ultra/`
except evidence and node lines, rulings and records (`truth-changed`), refuses a merged
tree that fails the plan gate (`merged-gate`, for example a malformed ruling), runs every
check there, and fast-forwards only when the finished work stayed green: every invariant,
every check of a closed milestone, every check of a node with a completion record (on the main
line or by the branch), and every check of the current milestone that passed before the merge.
The other writer's unfinished node only adds a `warning`; it never blocks.

The merged tree resolves modules from the main tree's installed dependencies: install a
dependency the branch adds on the main line before merging it.

## On refusal

- `head-moved`: re-read HEAD and retry.
- `plan-gate`: run `ubp gate` on the main line, commit `.ultra/`, retry.
- `nothing-to-merge`: the branch is already in.
- `merge-busy` that persists while no merge runs: delete `.ultra/.runtime/merge.lock` and
  retry.
- `merge-conflict`: the branch's writer resolves it on the branch (a conflict under
  `.ultra/ledger/` means the `merge=union` line is missing).
- `truth-changed`: the branch must drop that change (a plan or design change is yours, on the
  main line).
- `merged-gate`: the writer fixes the ruling on the branch.
- `check-not-green` with `first bad commit …` or `the branch marks <node> done`: brief that
  branch's writer again with it. With `not green at HEAD before the merge`, finished work is
  red on the main line: fix it there first (a requirement added to a closed milestone is red
  until built: merge the branch that builds it first).
- `fast-forward-failed`: the main tree changed during the merge; restore it, commit `.ultra/`
  and retry.
- `dirty-tree`: commit `.ultra/` (or what the paths name) on the main line and retry.

Exit 2 is not a refusal: read its `Git failed: …` reason (identity, a hook, signing) and fix
that. Any other `warning` names a temporary tree the engine could not remove.

## After each merge

Run `ubp check --all` in the main tree (a branch's evidence lines are not trusted until
then), fold what the merged nodes settled into `.ultra/design.md` as in Node loop step 4, and
commit `.ultra/` before the next merge.
