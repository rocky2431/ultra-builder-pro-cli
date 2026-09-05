# Delegated mission

## Outcome

Act as the fresh read-only Claude Code architecture collaborator for the beginning of
Ultra Builder Pro vNext Step 1. Challenge the accepted D0 direction and the bounded D1
delegation-safety Change, then recommend the smallest dependency-valid D1 task graph
that preserves the complete three-stage R2 destination.

## Canonical inputs

- `.ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md`
  - SHA-256: `9818a805fa37cdc974dd3434bfcf8e1b79d3a8022adc361ce6c1bc38859025fd`
- `.ultra/changes/active/chg-ultra-vnext-d1-delegation-safety/intent.md`
- `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md`
  - SHA-256: `f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7`
- `.ultra/specs/product.md#requirement-fr-06-bounded-delegation`
- `.ultra/specs/architecture.md#delegation-boundary`
- current `skills/ultra-delegate/scripts/` and focused delegation/driver tests

## Questions

1. Does D1 close the real pre-fan-out safety boundary without smuggling Run Supervisor,
   wake, Profile routing or durable-run implementation into this Change?
2. Which D1 acceptance criteria can share one tracer task, and which need a separate
   task or integration checkpoint because their evidence authorities differ?
3. What is the minimum safe implementation seam for descendant environment isolation,
   nested-writer identity/cancel/fencing and fail-closed Host enforcement qualification?
   Prefer existing helpers and current process/driver machinery.
4. Which assumptions are still unproven and should be encoded as a failing fixture or
   typed `outcome_unknown`, rather than guessed in implementation?
5. Does the decision correctly separate product runtime Profiles from the current
   work-package topology: ZCode writes implementation code, Codex reviews, Claude is
   read-only, and no provider brand is hard-coded into Core?

## Authority and boundaries

- You may read repository files and run read-only inspection commands.
- Do not edit, create, delete, move or format any repository file.
- Do not invoke another Agent, install anything, log in, expose credentials, access
  production, or perform external effects.
- Do not propose a commit/push/publish/deploy step; those are explicitly unauthorized.
- A transport success, test result or your own conclusion is advisory evidence only.
- Challenge over-engineering: require each new mechanism to have a reproduced failure
  and an observable consumer.

## Return contract

Return a concise Chinese report with:

- current facts versus inference;
- P0/P1/P2 findings with exact file/line evidence;
- recommended smallest D1 task graph and dependency order;
- accepted/deferred/deleted mechanisms;
- measurable D1 exit evidence and any blocker that truly needs Owner judgment.

State `changed_files: []`; if any file changed unexpectedly, report it and stop.
