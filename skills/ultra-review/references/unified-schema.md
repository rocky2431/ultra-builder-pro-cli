# Review artifact contract

Use this contract for every specialist artifact. Write JSON to the assigned file and
return only a one-line acknowledgement to the parent.

## Specialist artifact

```json
{
  "$schema": "ultra-review-findings-v2",
  "agent": "review-code",
  "axis": "engineering_standards",
  "session": "<session-id>",
  "timestamp": "<ISO-8601>",
  "scope": {
    "head": "<full-git-head>",
    "range": "<diff-range>",
    "files_analyzed": ["src/example.ts"],
    "diff_only": true
  },
  "status": "complete",
  "findings": [
    {
      "id": "review-code-001",
      "axis": "engineering_standards",
      "severity": "P1",
      "category": "correctness",
      "title": "Retry path commits the same payment twice",
      "file": "src/payments/retry.ts",
      "line": 42,
      "line_end": 47,
      "trigger": "The provider times out after committing the first request.",
      "impact": "A retry can create a duplicate charge.",
      "evidence": "retryPayment calls charge() again without an idempotency key.",
      "suggestion": "Persist and reuse one idempotency key for the operation."
    }
  ],
  "positive_observations": [],
  "limitations": []
}
```

Use `axis: "spec_fidelity"` for the independent acceptance review and
`axis: "engineering_standards"` for engineering specialists.

## Required finding fields

Every finding needs a stable id, axis, severity, category, concise title, repository-
relative file, tight line range, triggering condition, observable impact, source
evidence, and smallest complete remediation.

Severity is impact-based:

- P0: exploitable critical security issue, destructive data loss, or deterministic
  critical outage;
- P1: material correctness, authorization, reliability, or delivery failure;
- P2: bounded defect or maintainability risk with a concrete cost;
- P3: optional improvement that does not block the accepted outcome.

Do not report a concern without a plausible execution path. Do not encode a style
preference as a defect. Preserve the source specialist's severity during coordination.

## Coordinator summary

`SUMMARY.json` contains:

```json
{
  "$schema": "ultra-review-summary-v2",
  "session": "<session-id>",
  "head": "<full-git-head>",
  "status": "complete",
  "verdict": "REQUEST_CHANGES",
  "axes": {
    "spec_fidelity": {
      "verdict": "PASS",
      "evidence_refs": ["spec-fidelity.json"]
    },
    "engineering_standards": {
      "verdict": "FAIL",
      "evidence_refs": ["review-code.json", "review-tests.json"]
    }
  },
  "workers": {
    "completed": ["review-code", "review-tests"],
    "failed": [],
    "skipped": []
  },
  "findings": [],
  "positive_observations": [],
  "limitations": []
}
```

The overall verdict is `APPROVE` only when both axes pass, artifacts are complete and
current, and no P0 or P1 finding remains. Use `REQUEST_CHANGES` for a failed axis or
blocking finding, and `INCOMPLETE` when required evidence or workers are missing.
Each axis verdict is `PASS`, `FAIL`, or `INCOMPLETE`; the overall verdict is `APPROVE`,
`REQUEST_CHANGES`, or `INCOMPLETE`.

Validate JSON before acknowledgement. Never paste full JSON or worker transcripts into
the parent conversation.
