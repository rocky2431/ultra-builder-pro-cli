---
name: ultra-delegate
description: Delegate one bounded workflow segment to another installed CLI in an isolated worktree and return only its stable result artifact. Use when the owner asks for another model or host to execute, review, verify, or continue a specific slice of current work.
---

# Run a bounded worker without giving it project authority

Delegation is an execution mode, not another workflow stage. The primary host keeps
semantic synthesis and remains the only writer of `.ultra/tasks.json`.

## Before you start

1. Resolve exactly one active `change_id`, then select one scope and name it in
   `instruction.md`:
   - **task execution or continuation** — select one matching task and read its full
     `context_file` and `## Resume Note`;
   - **scoped Research evidence** — read the active intent's Research Disposition,
     named question, sources, and required exit evidence;
   - **aggregate Change review or verification** — read the exact matching task ids,
     relevant contexts, current report or review summary, and Change diff.
   Research and aggregate read-only scopes do not require a task. An archived or
   abandoned task cannot be delegated as current work.
2. Read `CONTEXT.md`, relevant `.ultra/decisions/`, acceptance and current evidence.
3. Define one bounded instruction, permission set, clean Git worktree and result.
4. Read `references/delegation-contract.md` before writing either JSON artifact.

## Definition of done

- The worktree is a clean registered Git worktree; instruction, permission and worker
  spec digests remain unchanged.
- The worker terminates as `finished`, `blocked` or `failed` in a schema-valid
  `result.json`; declared paths equal the actual Git diff and stay in writable roots.
- No `writable_roots` entry is `.ultra/` or sits under it, and the actual diff touches
  nothing there.
- Timeout and cancellation reach a terminal failed result and release `run.lock`.
- The primary host verifies the result against the selected scope's task acceptance,
  Research exit evidence, or aggregate review/verification question.

## Prepare and run

Write under `.ultra/.runtime/delegations/<id>/`:

- `instruction.md`: scope type, stable `change_id`, optional task id, bounded goal,
  sources, acceptance or exit evidence, and forbidden effects;
- `permission.json`: the exact file-local boundary in the contract reference;
- `result.json`: launcher-published terminal artifact only.

`writable_roots` is an array of existing worktree-relative directories. An empty array
selects native read-only mode; one or more roots selects bounded write mode.
**Neither `.ultra/` nor any path under it may appear in it.** The worktree carries a
checkout of `.ultra` because Git tracks it, but the project's memory has exactly one
writer. Two workers appending to `tasks.json`, `progress/` or `evidence/` in separate
worktrees collide in the very files every later session reads to resume. Worker findings
and state changes travel back in `result.json` and are applied by the primary host.
`external_effects` must be empty in this portable launcher: commit, push, publish,
deployment and other effects stay with the primary host. There is no `readable_roots`
claim because the five host sandboxes do not share one mechanically enforceable read
policy.

Create `.ultra/.runtime/worktrees/<id>` as a real Git worktree and run:

```text
ubp delegate run --to <host> --instruction <file> --permission <file> --worktree <dir> --timeout <seconds>
```

The command returns a receipt. Immediately run `scripts/delegate_wait.py`; read no
intermediate output. Use `ubp delegate status --delegation <dir>` for a read-only state
and `ubp delegate cancel --delegation <dir>` to request termination. Never delete a lock
to manufacture completion.

The worker returns one schema-constrained JSON final response. The launcher extracts it
from the host's native structured output, validates digests, process exit, exact schema,
actual base-HEAD diff and writable roots, then atomically publishes `result.json`. The
model never writes its own receipt. If owner input is needed, the worker terminates
`blocked` with questions and evidence; start a new id and fresh packet after obtaining
the answer.

After `finished`, inspect the isolated diff, rerun acceptance checks, and integrate via
the repository's normal Git workflow with ordinary authorization. Delegation never
auto-merges or writes canonical task/evidence files.

## Synthesize multiple results

Three agreeing results are Consensus. Two of three are Majority and require examining
the dissent. Three different results are No Consensus: narrow the question or add
evidence. A failed external CLI does not block the underlying workflow; report the
missing evidence rather than turning a vote or score into truth.

## When the owner decides

The owner authorizes delegation. External effects cannot be delegated by this launcher;
the primary host obtains their separate authorization. The primary host owns result
interpretation, risk acceptance, integration and task state.

## References

- `references/delegation-contract.md` — strict permission, receipt and result schemas.
- `scripts/delegate_wait.py` — run immediately after the launch receipt.
- `../ultra-think/SKILL.md` — read when No Consensus exposes a consequential decision.
- `../ultra-think/references/autonomy-boundary.md` — read before granting write effects.
