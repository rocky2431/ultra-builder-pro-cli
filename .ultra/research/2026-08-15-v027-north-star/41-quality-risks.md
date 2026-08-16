# 41 Quality Risks: authority, evidence, portability, and recovery

## Observed

- This Change touches authorization semantics, delegated writes, credentials, provider
  spend, real-HOME installation, Host activation, provenance, and supply chain behavior.
- A structurally valid worker delta, Hook output, digest, or Doctor result can still be
  semantically wrong.

## Verified

- The accepted plan and active Change require explicit retry, cancel, abandon, stale-
  evidence, and separate external-effect paths.
- `docs/PLUGIN-ISOLATION-CONTRACT.md` and `.ultra/specs/architecture.md` keep Host
  activation and derived observations outside semantic authority.

## Decided

- Bind the Phase 1 quality boundary to `HC-1` through `HC-6`; preserve the last accepted
  authority and stop before stale integration or an unauthorized external effect.

## Inference

- Named trigger/response/recovery scenarios protect the accepted values without turning
  quality into a score or authoring a semantic disposition.

## Unknown

- Snapshot races, candidate mutation, provider unavailability, and cross-Host
  degradation still require later negative tests and live probes.
- A risk record never authorizes the effect it describes.

## Trace

- north_star_effect: supports
- north_star_claim: every quality guard must protect an exact authority, identity, or recovery invariant without deciding semantic truth
- trigger_condition: authority, source identity, snapshot freshness, Host readiness, or effect authorization changes
- expected_response: stop only the named effect and return typed evidence to the model or owner
- measurement: exact identity, digest, readiness, permission, and recovery observations named by the applicable task
- mitigation: least authority, immutable inputs, native isolation, explicit gates, and independent review
- recovery: preserve accepted authority and expose retry, cancel, abandon, re-review, or explicit owner disposition
- owner: repository owner for risk acceptance and effects; Host model for semantic evidence interpretation
- specification_anchor: `.ultra/specs/architecture.md#north-star-v2-architecture-relations`
