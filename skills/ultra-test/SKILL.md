---
name: ultra-test
description: "Run the pre-delivery check gate from a fresh role context and record exact feedback-loop, wiring, recovery, and acceptance evidence."
user-invocable: true
runtime: all
mcp_tools_required:
  - task.list
  - change.list
  - change.context
  - change.breadcrumb
---

# ultra-test — Independent Check Context

This is the project/change pre-delivery gate, not a replacement for the task-level TDD
loop. It produces `.ultra/test-report.json`; task and change authority remain in
`.ultra/state.db`.

## Entry gate

1. Call `task.list`; require at least one completed task in scope.
2. Call `change.list` and bind to exactly one relevant active/blocked/ready change, or
   explicitly record `change_id: null` for an initial baseline.
3. For a change, compile `change.context` with `role=check`, `gate=verification`, only
   the tests/specs/source seams needed to verify it, and the same execution contract.
4. Call `change.breadcrumb`; stop when context is stale or readiness is blocked.

Never fall back to `.ultra/tasks/tasks.json`. Do not reuse the implementer's full
conversation as test context.

## Verification matrix

Build a matrix from acceptance claims to observable evidence:

| Check | Required evidence | Blocking condition |
|---|---|---|
| Feedback loop | exact command and observed green | command fails or no prior red for fix/incident |
| Public seam | reachable entry-to-consumer path | orphan/stub/unwired behavior |
| Regression | focused and adjacent suites | failure or meaningful skipped assertion |
| Build/static | typecheck/lint/build as applicable | non-zero result |
| Error/recovery | failure mode and recovery path | silent/swallowed/unrecoverable critical path |
| Security | input/auth/secrets/dependency checks in scope | high-severity issue |
| Docs/spec | delivered behavior matches declared delta | drift or unknown impact |

Use repository-native commands and real boundaries where practical. Test doubles are
acceptable only at costly or nondeterministic external boundaries and must be named.

## Quality checks

- Detect tautologies, empty tests, weakened assertions, and core-domain over-mocking.
- Find changed exports without meaningful test coverage.
- Trace changed source into non-test consumers; flag orphan modules and placeholder
  handlers/components.
- Exercise key API/UI/CLI flows when the project exposes them.
- Inspect error handling, authorization, migrations, idempotency, and rollback in the
  affected risk surface.
- Compare current HEAD and context digests with the implementation evidence.

Do not mechanically require every possible test category. Mark a check
`not_applicable` only with a concrete scope reason.

## Report contract

Write `.ultra/test-report.json` atomically with at least:

```json
{
  "schema_version": "2.0",
  "change_id": "<id-or-null>",
  "git_commit": "<full-head>",
  "context_manifest_hash": "<hash-or-null>",
  "passed": true,
  "feedback_loop": {
    "command": "<exact command>",
    "expected_red": "<failure contract or not-applicable reason>",
    "observed_red": true,
    "observed_green": true,
    "deterministic": true
  },
  "public_seams": ["<verified seam>"],
  "checks": [],
  "blocking_issues": [],
  "commands": []
}
```

Set `passed=true` only when every required check passes, the report HEAD is current,
and at least one public seam is verified. Preserve exact commands, exit results, and
concise failure excerpts; do not paste full logs.

## Exit

Call `change.breadcrumb` and route one next action: fix a named blocker, run
`/ultra-review all`, or run `/ultra-deliver`. A stale report never routes to delivery.
