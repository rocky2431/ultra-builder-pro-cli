# Delivery reconciliation contract

Write exactly one `.ultra/changes/active/<change-id>/delivery.md`. It is editable while
the Change is active and moves with the directory when archived.

```markdown
# Delivery: <change-id>

## Outcome Reconciliation
<accepted outcome versus observed result, with path#anchor evidence>

## Specification and Documentation Updates
<changed files and why, or an evidence-backed no-change statement>

## Verification
| Command | Exit | Evidence | Freshness |
|---|---:|---|---|

## Review
<SUMMARY.json path, packet digest, verdict, and unresolved findings>

## Technical Debt
<bounded debt, consequence, owner, and upgrade path; or None>

## Residual Risks and Omissions
<owner disposition for every material item>

## Recovery
<rollback or recovery procedure and verification>

## External Effects
<commit, push, tag, publish, deploy: authorized and observed status separately>
```

Every semantic update cites a repository-relative `path#anchor`. A reduction requires
the owner decision before the affected specification changes. Exact command evidence
must match the checkout identified by `.ultra/test-report.json`; stale results stay
visible and never become a pass. Do not create a second JSON or Markdown delivery
summary.
