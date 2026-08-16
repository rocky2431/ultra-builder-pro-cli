# Delegation artifact contract

## Permission

```json
{
  "$schema": "ultra-delegation-permission-v1",
  "writable_roots": ["src", "test"],
  "external_effects": []
}
```

Fields are exact. Roots are normalized worktree-relative directories that already
exist. An empty array selects native read-only mode; `.` deliberately grants the whole
isolated checkout except `.ultra/`. Absolute paths, symlink escapes, unknown fields,
`readable_roots`, `.ultra` or any path beneath it, and non-empty external effects are
rejected.

`.ultra/` is never writable by a worker under any root, `.` included. The project's
memory has exactly one writer — the primary host — because two worktrees appending to
`tasks.json`, `progress/` or `evidence/` collide in precisely the files a later session
reads to resume. Enforced twice: the launcher rejects a `.ultra` root before the
delegation starts, and the worker fails an actual diff that touches it with
`unauthorized_write`.

## Model final response

```json
{
  "$schema": "ultra-delegation-result-v1",
  "status": "finished",
  "summary": "Implemented the bounded slice.",
  "changed_files": ["src/example.ts"],
  "checks": [
    {"command": "npm test -- example", "status": "passed", "output_ref": "stdout.log"}
  ],
  "evidence": ["src/example.ts"],
  "questions": [],
  "residual_risks": []
}
```

Fields are exact. Status is `finished`, `blocked`, or `failed`; `blocked` requires a
question. Check status is `passed`, `failed`, or `not_run`. Changed files are unique,
normalized repository-relative paths and must exactly equal the launcher's Git diff.
`output_ref` is requested for every check and required in the native schema projection
used by hosts that accept one. The launcher remains compatible with hosts that return
the otherwise exact check without that optional evidence pointer.

The launcher embeds the exact instruction and permission sources with their digests in
the host prompt, extracts this object from native structured output, and adds
`delegation_id`, `host`, instruction, permission, and output-schema digests,
`read_only`, `base_head`, `final_head`, timestamps, `exit_code`, and signal. Launcher
failures also add `failure_type`. A nonzero process cannot publish `finished`.

## Recovery

- `status` distinguishes running, cancelling, stalled, and terminal artifacts.
- `cancel` writes `cancel.request`; the worker terminates its host process, publishes a
  failed result with `failure_type: cancelled`, and removes `run.lock`.
- `--timeout` does the same with `failure_type: timeout`.
- A stopped worker with no result is recoverable through `cancel`, which finalizes the
  stale run. Retry under a new delegation id and fresh digests.
