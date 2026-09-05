# ZCode repair packet — v502 Review round 1 delta

## Mission

Repair the remaining P1 authority contradiction from Codex's independent readback of
the prior repair. This is the same bounded 5.0.2 closeout package; you remain the sole
product/documentation writer and Codex remains the reviewer.

## Frozen authority

- Grant: `.ultra/decisions/2026-09-01-v502-zcode-closeout-grant.md`
- Expected SHA-256:
  `c7bc58e853c0883f4cbbe32471391a81bb468c648432387f556b11d8442778d1`
- No external or release effect is authorized.

## Verified P1

The canonical active intent now declares durable work-package grant
`ubp-v502-zcode-closeout-2026-09-01`, and the task context records the same. However,
`.ultra/specs/research-distillate.md:113-115` still says the active Change is under the
"current session-local grant". A fresh Agent consuming the Planning Entry can therefore
stop incorrectly after compaction or a Host/session change, contradicting the exact
durable grant and the product's recovery boundary.

## Writable files — exact

- `.ultra/specs/research-distillate.md`
- `.ultra/contexts/task-v502-authority-reconciliation.md`

Do not edit any other file. Preserve all existing tracked and untracked changes.

## Acceptance

1. Planning Entry names the exact durable grant id and does not call the current grant
   session-local.
2. Task context records this second P1 and its repair without claiming a completed
   formal Review verdict.
3. Generic product explanations of the two grant modes remain unchanged.
4. Run `git diff --check --` for the two writable files plus a bounded readback proving
   there is no remaining `current session-local grant` phrase in the current v502
   authority/context/spec surfaces.

## Stop and return

Stop if the grant digest or either writable file drifts after your initial snapshot, or
if another file is needed. Return changed paths, exact checks/results, and limitations.
Do not commit, publish, install, or diagnose/fix the separate Codex Host plugin issue.
