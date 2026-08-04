---
name: ultra-test
description: Audit whole-system integrity after tasks for the active Change are complete by finding anti-patterns, coverage gaps, broken wiring, E2E failures, performance risk, and security risk. Use when preparing delivery or when locally green tasks may not form a working product.
---

# NOT for running unit tests (that's `ultra-dev`). This audits whole-system integrity before delivery.

This is the one end-of-change sensor allowed by PHILOSOPHY C4: an export cannot be
called orphaned while a later task may still wire it. It is a terminal sensor, never a gate;
the owner decides what to fix or accept.

## Before you start

1. Resolve exactly one `.ultra/changes/active/<change_id>/intent.md`. Read
   `.ultra/tasks.json` and only tasks whose `change_id` matches the active Change. Every
   matching task must be complete; read each task's `context_file` Acceptance, Completion and
   closing `## Resume Note`. Historical tasks are not part of this audit snapshot.
2. Read `CONTEXT.md` for vocabulary and the relevant `.ultra/decisions/` entries.
3. Read the active Change intent, the task evidence directories and the current Git
   `HEAD`; old output is evidence only for the commit it names.
4. Resolve this loaded Skill's directory and run
   `node <ultra-test-skill-dir>/scripts/worktree_digest.cjs --project <repository-root> --change-id <change_id>`
   before and after the audit. It returns the stable Change id, exact intent SHA-256,
   HEAD, and product-worktree digest. The product digest excludes the report and all
   active/archive/abandoned Change-directory metadata; intent freshness is checked
   separately, so writing delivery metadata or moving the same Change cannot invalidate
   its tested product snapshot.

## Definition of done

- All six audit areas have an evidence-backed result or an explicit material omission.
- Wiring lists each changed export and its non-test consumers; zero matches are visible
  as orphan findings.
- `.ultra/test-report.json` records `change_id`, the exact current-Change `task_ids`,
  `intent_digest`, `git_commit`, commands, findings, omissions and the owner's
  disposition without rewriting a finding into a pass.

## Audit six areas

1. **Anti-patterns**: find tautological or empty tests and internal collaborators mocked
   instead of exercising a public seam.
2. **Coverage gaps**: map changed public behavior to tests and list behavior with no
   exercising test.
3. **Wiring Verification**: list changed exported symbols, then search each name in
   non-test source. `0 matches = orphan` until a framework registration or generated
   consumer is evidenced. Also trace Component→API, API→DB, Form→Handler and
   State→Render where those boundaries exist.
4. **E2E**: run the smallest real primary flow through its deployed or local boundary.
5. **Performance**: measure the paths whose acceptance or risk makes latency, resource
   use or scale material; record why anything else was omitted.
6. **Security**: run the repository's dependency and security checks, then inspect the
   trust boundaries changed by this Change.

The six are independent read-only audits and may run in parallel through the host's
native bounded subagents. Each returns its findings; the parent writes the one report.
A worker never writes `.ultra/test-report.json` itself — six writers on one canonical
file is how a report loses findings.

Read `references/export-syntax.md` before collecting exports. The table finds
candidates; repository conventions and real consumers decide what is public.

## Detect substantive stubs

Report an empty return with no IO, a log-only function, a handler that only prevents
default, or a component that only renders placeholder text. Pair every finding with
the smallest real boundary or implementation that would make it observable.

## Write the report

Store the exact `change_id`, ordered current-Change `task_ids`, `intent_digest`,
`git_commit`, timestamp, run count, commands and exit codes, the six area results,
findings with paths, verified seams, material omissions, residual risk, and `passed` as
the model's evidence-derived summary in the one canonical
`.ultra/test-report.json`. Each command records `command`, `exit_code`, and an
`evidence_ref`; each area records `status`, `evidence_refs`, and `omissions`. Copy the
script's `head`, `dirty`, `diff_digest`, and `intent_digest` into the report. A stale
commit, product digest, intent digest, Change id, or task-id snapshot is labelled stale;
it is never reused as current proof.

`passed` is a one-way claim: `true` requires every current-Change task complete and no
required area left `not_run`. Completed tasks do not force `passed: true`; findings,
omitted evidence, or a failed command may keep it false, while an explicitly
dispositioned gap remains visible even if the model's evidence summary passes. Preserve
the finding and the owner's disposition as separate fields.

Present the findings by consequence and recommend the highest-leverage response. The
owner may fix all, fix selected findings, accept recorded risk, or reduce scope through
the normal REDUCTION decision. Recommend the next capability; do not invoke it.

## When the owner decides

The owner decides disposition and risk acceptance. A failed command, orphan or stub is
an observation, not permission to auto-fix, weaken a test or silently change scope.

## References

- `references/export-syntax.md` — read during Wiring Verification to find exported
  symbol candidates in TypeScript/JavaScript, Python, Go, Rust and Java.
- `scripts/worktree_digest.cjs` — deterministic HEAD plus worktree evidence identity.
- `../ultra-think/references/autonomy-boundary.md` — read when a proposed response
  would make an existing specification commitment stop holding.
