# Ultra Verify Modes

All four modes compare an independently written primary analysis with one read-only external
advisor. Agreement is useful corroboration, not proof; evidence decides the final result.

## 1. Decision (`decision`)

Give both analyses the same decision context, constraints, and options. Compare recommendation,
trade-offs, risks, and assumptions. When they differ, identify the assumption or evidence that
caused the split and resolve it before recommending an option.

## 2. Diagnose (`diagnose`)

Provide symptoms, exact errors, relevant code, and recent changes. Each analysis should rank its
root-cause hypotheses and provide discriminating checks. Merge duplicate hypotheses, retain useful
unique ones, and order investigation by evidence strength and verification cost.

## 3. Audit (`audit`)

Use the same code scope and severity model for both analyses. Deduplicate findings by root cause,
verify every location against the current checkout, and retain a single-model finding when source
evidence confirms it. Never derive severity from model agreement alone.

## 4. Estimate (`estimate`)

Require a breakdown, assumptions, dependencies, and risk range from both analyses. Explain large
differences by locating mismatched scope or assumptions. Return a range supported by the reconciled
work breakdown rather than averaging estimates mechanically.
