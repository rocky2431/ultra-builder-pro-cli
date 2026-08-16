# 04 Product Strategy: file-first bounded autonomy

## Observed

- The product deliberately omits a workflow state machine, daemon, database, and MCP
  server; public workflows remain explicit and shared Skills remain host-neutral.
- Six Hosts expose different plugin, Hook, permission, and headless interfaces.

## Verified

- `docs/ARCHITECTURE.md` and `.ultra/specs/architecture.md` place canonical meaning in
  files and Git while native adapters own Host differences.
- `adapters/_shared/runtime-assets.cjs` is the shared asset allowlist; adapter-specific
  surfaces do not own workflow prose.

## Decided

- Use file-first bounded autonomy: the owner supplies purpose and material
  authorization, the Host model chooses tactics inside a live grant, and code validates
  only exact facts, permissions, effects, evidence, and recovery.
- Preserve common Skill semantics and adapt every Host natively.

## Inference

- A durable stage engine would duplicate semantic authority before any reproduced
  continuation failure proves it necessary.

## Unknown

- Exact native limits remain subject to later capability probes and candidate
  acceptance.
- Execution Packet v1 is planned behavior, not evidence available in this Phase 1 run.

## Trace

- north_star_effect: supports
- north_star_claim: native Host loops can provide bounded automation while files and Git retain semantic authority and recovery
- tradeoff: prefer native model-loop continuation plus file authority over an Ultra-owned semantic stage engine
- rationale: the existing primary path can preserve owner gates without a second semantic state representation
- specification_anchor: `.ultra/specs/discovery.md#north-star-v2-problem-relations`
- decision_ref: `.ultra/decisions/2026-08-15-v027-north-star-r1.md#owner-record`
- supports_problem: `PROB-V027-01`
