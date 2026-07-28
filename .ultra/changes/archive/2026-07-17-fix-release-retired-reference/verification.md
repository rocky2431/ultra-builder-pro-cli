# Verification: Fix retired-surface release gate regression

## diagnosis

Status: **pass**

.ultra/changes/active/fix-release-retired-reference/diagnosis.md records CI reproduction, tested hypothesis, root cause, unchanged regression contract, and immutable patch recovery.

## diff

Status: **pass**

Commit 72e1aa38738bf5506c68478abc4984602719b752 removes the single forbidden documentation mention, updates release history/version to 0.8.1, and preserves untracked AGENTS.md.

## tests

Status: **pass**

node --test tests/retired-runtime.test.cjs passed 3/3; npm run verify:release completed with explicit VERIFY_RELEASE_EXIT=0; active source/document searches returned no retired command-proxy or Gemini names.
