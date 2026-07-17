---
name: ultra-deliver
description: "Converge an implementation, approved specification learning, independent review axes, and release evidence into one recoverable baseline."
user-invocable: true
runtime: all
mcp_tools_required:
  - change.list
  - change.get
  - change.context
  - change.breadcrumb
  - change.learning_resolve
  - change.converge
  - change.archive
cli_fallback: "direct user interaction"
---

# ultra-deliver — Converge, Archive, Release

Deliver the current baseline or one continuous-change packet. Change lifecycle writes
use MCP only; `.ultra/test-report.json`, review sessions, and delivery reports are
evidence artifacts.

## 1. Bind the delivery

1. Call `change.list` for active, blocked, and ready changes.
2. Bind exactly one relevant change; require an id when ambiguous. Initial baseline
   delivery may use `change_id: null`.
3. Call `change.breadcrumb`. A stale/blocked context or incomplete linked task blocks.
4. Verify `.ultra/test-report.json` exists, passed, matches the change, and records the
   current full HEAD plus at least one public seam.
5. Verify the latest review session matches the same HEAD and has passing independent
   `spec_fidelity` and `engineering_standards` axes.

Do not reuse evidence from another checkout, commit, task set, or change.

## 2. Reconcile specification learning

Call `change.get` for authoritative `learning_candidates`; use the packet's
`spec-learning.json` only as the inspectable projection.

- `proposed`: require approve or reject through `change.learning_resolve`.
- `approved`: update the declared baseline target, verify the edit, then mark `apply`.
- `rejected`: preserve the reason as decision evidence.
- `applied`: verify the target still contains the accepted behavior.

Any proposed or approved candidate blocks convergence. This is the mandatory path that
keeps baseline specs alive after daily changes; it is not cross-session memory.

Reconcile accepted `delta/` content and declared documentation impact into baseline
documents. Record `baseline_updates`, or a specific no-change reason. No unresolved
placeholder, unknown docs impact, or delivered-only-in-delta behavior may remain.

## 3. Verify the release candidate

Require a clean, reviewed release commit. If changes remain, show the diff and obtain
explicit approval before committing. Never auto-stage unrelated user changes.

Run exact project commands for:

1. focused regression/acceptance feedback loop;
2. full relevant tests;
3. static checks and production build;
4. package/install/doctor smoke where the product is distributed;
5. public-seam acceptance and rollback/recovery sanity.

Record commands, exit results, and current HEAD. Any post-test edit invalidates the
test and review gates.

## 4. Compile final role context

Call `change.context` at the release commit with `role=review`, `gate=convergence`,
current required refs/digests, the public seam, exact verification command, and the
single next action `Archive the converged change`. Readiness must be `ready`.

## 5. Converge

Call `change.converge` with evidence rows for:

- `diff`: reviewed release diff and public seam;
- `tests`: exact signal object (`command`, expected/observed red, observed green,
  deterministic, duration when known) and seam;
- `spec`: baseline/delta and applied learning evidence;
- `docs`: updated paths or explicit non-applicability;
- `review`, `axis=spec_fidelity`;
- `review`, `axis=engineering_standards`;
- `diagnosis` for incidents.

Do not collapse the two review axes or substitute prose for the signal fields. If
convergence returns blockers, fix the named source and rerun the invalidated gates.

## 6. Archive and release

After `ready=true`, call `change.archive` with summary and `baseline_updates` (or the
validated no-change reason). Then:

1. determine the semantic version from user-visible compatibility;
2. update version and changelog;
3. rerun release verification if version files changed;
4. create a non-force commit/tag and push only with explicit release authorization;
5. publish the package/release through the repository's authenticated workflow;
6. verify the remote tag/release and registry version independently.

Write `.ultra/delivery-report.json` with change id, archived status, commit, version,
commands, package/release identifiers, baseline updates, rollback notes, and timestamp.

## Completion gate

Delivery is complete only when the change is archived, local and remote commit/tag
agree, registry/release verification is current, and the worktree contains no
unexplained scope. Report the outcome first, exact evidence next, and residual risks
last. Never say “published” based only on a local version bump.
