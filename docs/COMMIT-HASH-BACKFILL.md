# Commit-hash backfill — two-commit completion flow

> Phase 2.8 contract. Replaces the v4.4 `git commit --amend` step with an
> append-only flow that survives the SQLite authority model.
> Hook wiring lives in Phase 3 (`skills/ultra-dev/SKILL.md` Step 6).

## Why we changed

In v4.4 the per-task `context md` carried a `completion_commit` field
in its frontmatter. The legacy flow was:

1. `git commit -m "feat: …"` to land the implementation
2. read the freshly-created commit hash
3. edit `contexts/task-N.md` to write the hash into the header
4. `git commit --amend --no-edit` to fold the edit into the same commit

That last step makes the commit non-atomic (the second write produces
a new SHA, invalidating the value we just stamped). It also fights the
v4.5 authority rule (D32) — the projector is the only writer to
`contexts/task-N.md`, so any handwritten edit gets stomped.

## The new flow

```
┌──────────────────────────────────┐
│ 1. feat commit                   │  context md still has empty
│    git add … && git commit       │  completion_commit (projector
│    -m "feat: task-N — title"     │  emitted it from a NULL row)
└──────────────────┬───────────────┘
                   ▼
┌──────────────────────────────────┐
│ 2. read the new SHA              │  hash = `git rev-parse HEAD`
└──────────────────┬───────────────┘
                   ▼
┌──────────────────────────────────┐
│ 3. update state.db               │  ops.patchTask(db, id,
│                                  │    { completion_commit: hash })
└──────────────────┬───────────────┘
                   ▼
┌──────────────────────────────────┐
│ 4. projector regenerates the     │  projector.projectContext(db, id)
│    context md header with the    │  writes a new contexts/task-N.md
│    completion_commit value       │  whose YAML now contains the hash
└──────────────────┬───────────────┘
                   ▼
┌──────────────────────────────────┐
│ 5. chore commit                  │  git add contexts/task-N.md
│                                  │  git commit -m
│                                  │    "chore: record task-N hash"
└──────────────────────────────────┘
```

The result in `git log --oneline`:

```
2222222 chore: record task-N completion hash
1111111 feat: task-N — <title>
```

Both commits are immutable. The chore commit is small (only the
projection file changed) and is trivial to revert if the wrong task is
recorded.

## Why two commits, not amend

- **Atomic history.** Each SHA is final the moment it is written.
- **Idempotent.** Re-running the chore commit on the same hash is a
  no-op (projector emits the same bytes).
- **Survives the projector contract.** The projection is the only
  writer to `contexts/task-N.md`; this flow keeps that promise.
- **Audit trail.** Reviewers can see the implementation diff (commit 1)
  separately from the bookkeeping diff (commit 2).

## Hook integration (Phase 3)

The post-commit hook installed by `skills/ultra-dev/` will invoke this
flow as soon as a feat commit lands on a task branch:

```
post-commit hook → if commit message starts with "feat:" and the
                   working tree contains contexts/task-N.md →
                   ultra-tools task update --id task-N \
                       --completion-commit $(git rev-parse HEAD) &&
                   git add contexts/task-N.md &&
                   git commit -m "chore: record task-N completion hash"
```

Until that hook lands, contributors run the two commits manually. The
contract above is what the hook will codify.

## Verification

`mcp-server/tests/commit-hash-flow.test.cjs` builds a throwaway git
repo, walks the five steps in-process, and asserts:

- `git log --oneline -2` shows `chore: record task-N completion hash`
  on top of `feat: task-N — …`.
- The post-projection `contexts/task-N.md` frontmatter contains the
  exact SHA produced by the feat commit.
- Re-running step 4 + step 5 against the same SHA is a no-op (the
  chore commit is empty and skipped).
