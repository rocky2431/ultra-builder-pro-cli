---
name: ultra-deliver
description: Converge verified implementation, specification learning, review evidence, and release artifacts into a recoverable baseline. Use when an initial baseline or active change has current passing evidence and is ready to archive or release.
---

# Converge and deliver

Deliver one baseline or continuous change. Change lifecycle writes use MCP; test,
review, and delivery reports are evidence artifacts.

## Bind current evidence

1. Call `change.list` and bind exactly one relevant change, or a null change id for an
   initial baseline.
2. Call `change.breadcrumb`. Block on stale context, incomplete linked tasks, or
   unresolved readiness.
3. Require a passing test report for the current full HEAD and at least one declared
   public seam.
4. Require current independent `spec_fidelity` and `engineering_standards` review
   verdicts. Evidence from another checkout, commit, task set, or change is invalid.

## Reconcile the baseline

Call `change.get` for authoritative learning candidates.

- Resolve every proposed item as approved or rejected.
- Apply each approved item to its declared baseline target, verify the edit, then mark
  it applied.
- Preserve rejection reasons as decision evidence.
- Confirm previously applied items remain represented in the target document.

Reconcile accepted delta content and documentation impact into baseline documents.
Record updated paths or a specific no-change reason. Unknown documentation impact,
unresolved placeholders, and behavior that exists only in the delta block convergence.

## Verify the release candidate

Use a clean, reviewed release commit. Show any remaining diff and obtain explicit
authorization before staging or committing. Never stage unrelated user changes.

Run the exact repository commands needed for focused regression, relevant full tests,
static checks, production build, package/install/doctor smoke when distributed, the
public seam, and rollback or recovery sanity. Any post-verification edit invalidates
the affected evidence.

Compile final change context at the release commit with the convergence gate. It must
be ready before calling `change.converge`.

## Converge and archive

Submit structured evidence for the reviewed diff and seam, test signals, baseline and
delta, documentation, both independent review axes, and incident diagnosis when
applicable. Do not collapse review axes or replace exact signal fields with prose.

Resolve named blockers, rerun invalidated gates, then call `change.archive` with the
summary and baseline updates.

## Optional release

Only when release authorization is in scope:

1. determine the semantic version from compatibility impact;
2. update version and changelog;
3. rerun checks invalidated by version changes;
4. create a non-force commit and tag;
5. push and publish through the repository's authenticated workflow;
6. independently verify the remote commit, tag, release, and registry version.

Write the delivery report with the change id, archive status, commit, version, exact
commands, release identifiers, baseline updates, rollback notes, and timestamp.

Delivery is complete only when local and remote evidence agree and the worktree has no
unexplained scope. A local version bump is not publication evidence.
