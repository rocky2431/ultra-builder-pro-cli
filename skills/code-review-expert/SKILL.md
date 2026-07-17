---
name: code-review-expert
description: Review a bounded diff for consequential correctness, security, integration, and maintainability defects with evidence and precise locations. Use only when assigned to an Ultra review worker or an explicitly requested read-only code review.
---

# Review a bounded code change

Prioritize defects that can change behavior, safety, operability, or delivery. Do not
fill the report with style preferences or generic best-practice commentary.

## Workflow

1. Establish the exact diff, stated intent, acceptance evidence, current checkout, and
   relevant repository guidance. If the scope is empty or ambiguous, report that
   boundary instead of reviewing unrelated history.
2. Trace changed behavior from a live entry point through state and side effects to a
   consumer. Read callers, contracts, tests, and error paths needed to prove or refute
   a finding.
3. Load focused references only when their scope is present:
   - `security-rules` for trust or authorization boundaries;
   - `integration-rules` for cross-component behavior;
   - `references/correctness-reliability.md` for a concrete behavioral risk;
   - `references/design-boundaries.md` for a concrete ownership or coupling problem;
   - `references/removal-plan.md` for code proposed for deletion.
4. For every candidate finding, state the violated contract, triggering condition,
   user or system impact, and evidence in the current source. Discard speculative
   concerns that lack a plausible execution path.
5. Assign severity from impact and likelihood:
   - P0: exploitable security issue, data loss, or deterministic critical failure;
   - P1: material correctness, authorization, reliability, or delivery failure;
   - P2: bounded maintainability or edge-case defect with concrete future cost;
   - P3: optional improvement that does not block the accepted outcome.
6. Deduplicate findings by root cause and order them by severity, path, and line.

## Finding contract

Each finding includes a concise title, severity, tight file and line range,
trigger, impact, evidence, and smallest complete remediation. Do not request a broad
rewrite when a local fix satisfies the contract.

If no actionable defect is supported, say so and name the remaining verification or
coverage gap. Review is read-only unless a separate implementation request explicitly
authorizes changes.
