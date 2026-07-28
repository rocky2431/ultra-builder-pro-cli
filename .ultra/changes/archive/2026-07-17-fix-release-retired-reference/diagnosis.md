# Incident diagnosis: Fix retired-surface release gate regression

## Reproduction

`node --test tests/retired-runtime.test.cjs` fails the command-proxy retirement
contract on `docs/PLAN.zh-CN.md`. GitHub Actions run 29579633258 reproduced the
same single failure after 123 other rest-suite tests passed, before npm publish.

## Hypotheses

The new D53 decision row reintroduced a forbidden retired-surface name while
trying to state that the surface stayed excluded. The runtime code and package
allowlist were otherwise unchanged.

## Root cause

D53 described a negative boundary by naming the retired command proxy. The
retirement contract intentionally scans active documentation as well as code,
so even a negative mention is prohibited. The earlier local release-gate output
was truncated and its exit status was not surfaced, which allowed the failure
to be misclassified as success before the tag was pushed.

## Regression test

Keep `tests/retired-runtime.test.cjs` unchanged and require an explicit zero exit
from both that focused test and `npm run verify:release`. Also verify that npm
and GitHub Release remain absent for the failed tag before recovery publishing.

## Recovery

Remove the forbidden name from D53, publish an immutable `0.8.1` patch instead
of rewriting the pushed `v0.8.0` tag, rerun the complete release gate with an
explicit exit code, then verify GitHub Actions, npm registry, and GitHub Release.
