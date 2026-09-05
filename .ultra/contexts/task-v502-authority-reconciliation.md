# Task v502-authority-reconciliation: Reconcile the current ACP-first authority surface

## Context

**What**: Correct every maintained product, model-facing, package, and current
specification surface that still presents legacy CLI-first, five-Host, stale trust,
incomplete evidence, or outdated ZCode configuration semantics.

**Why**: A delivered ACP path is not a truthful product while its canonical explanations
still teach the fallback as the architecture. One coherent patch prevents Hosts, models,
and package consumers from acting on contradictory authority.

**Constraints**:
- Preserve runtime behavior, conformance receipts, Host maturity, and the accepted North Star.
- Preserve archived Changes, dated evals, receipts, and historical release evidence.
- Do not mutate user homes, Windows behavior, Git remotes, tags, registries, or deployments.
- Keep English model-facing instructions and the established bilingual public README contract.

## Implementation

**Layers touched**: package-facing READMEs/help/version metadata; portable Skill and
model-facing instructions; maintained lifecycle/authority documentation; current
`.ultra/specs`; package contract tests and release verification.

**Confirmed seams**:
- Installed delegation: `skills/ultra-delegate/SKILL.md` -> Skill-local runner ->
  `AgentExecutionDriver` -> conformance-gated ACP v1 or typed CLI fallback.
- Host truth: `skills/ultra-delegate/scripts/host-profile.cjs` and Doctor JSON.
- Invocation truth: `adapters/_shared/runtime-assets.cjs`.
- Package closure: `npm pack --dry-run --json` plus relative README link resolution.

## Planned Path Inventory

`CREATE`:

- `.ultra/changes/active/chg-ultra-5-0-2-authority-reconciliation/intent.md`
- `.ultra/contexts/task-v502-authority-reconciliation.md`
- `.ultra/evidence/v502-authority-reconciliation/evidence.json`
- `.ultra/evidence/v502-authority-reconciliation/verification.log`

`MODIFY`:

- `README.md`, `README.zh-CN.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`
- `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `bin/install.js`
- `skills/ultra-delegate/SKILL.md`, `skills/ultra-status/SKILL.md`
- maintained current docs and `.ultra/specs/{product,architecture,research-distillate}.md`
- `tests/v026-contract.test.cjs`, `tests/ultra-5-journeys.test.cjs`,
  `tests/package-smoke.test.cjs`, `.ultra/tasks.json`

## Public Seams

- `ultra-delegate` discovery and invocation guidance
- six-Host installation/Doctor/help output
- README package navigation and ZCode setup
- current product/architecture specifications used for continuation

## Narrow Verification

- focused RED/GREEN Node contract tests for maintained authority and packed links
- Skill Creator validation for both changed Skills
- `npm run verify:release`
- `npm pack --dry-run --json`
- isolated and current `node bin/install.js --all --global --doctor --json`
- `git diff --check`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC502-01`, `AC502-02`, `AC502-03`, `AC502-04`, `AC502-05`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| T502-01 | Maintained discovery and model-facing surfaces define ACP-first Agent delegation and typed CLI fallback without the audited stale primary-path phrases | `command` | focused contract test over named maintained files |
| T502-02 | Current specs, invocation policy, Host trust, identity-probe wording, evidence dimensions, and ZCode configuration agree with runtime/official sources | `inspection` | final diff plus focused bilingual/Host contract tests |
| T502-03 | The local 5.0.2 package candidate has closed README links and coherent version/help metadata | `command` | package smoke test and pack JSON |
| T502-04 | Full validation remains green and current six-Host Doctor selection is unchanged by this documentation/contract repair | `command` | release suite, Skill validators, isolated/current Doctor, and diff check |

## Definition of Drift

- Changing ACP/CLI selection code, receipts, maturity, or provider credentials.
- Broadly rewriting historical records because they use the terminology true at their date.
- Treating package, commit, tag, publication, deployment, or installation as one effect.
- Adding a semantic mirror, route state, or new compatibility abstraction for wording drift.

## Trace

**Source**: `.ultra/specs/product.md#requirement-fr-06-bounded-delegation`

**First principles**: [`FP-1`, `FP-2`, `FP-5`, `FP-6`, `FP-7`]

**Serves**: [`NS-01`, `NS-02`, `NS-03`, `NS-04`]

**Causal contribution**: One current, package-closed authority surface lets every Host
and fresh Agent reconstruct the real delegation path without confusing a compatibility
fallback, provider choice, or transport observation with product meaning.

**Hard constraints**: [`HC-1`, `HC-3`, `HC-4`, `HC-5`, `HC-6`]

**Decisions**: active Change intent and accepted 5.0 design; no new owner decision.

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-26 | — | Initial creation | current product/architecture/distillate | Owner accepted full local reconciliation |
| 2026-09-01 | evidence correction | Dated the 2026-08-26 real-HOME Doctor observation and recorded the fresh 2026-09-01 read-only observation (six expected `PACKAGE_VERSION_MISMATCH` plus Codex `HOST_PLUGIN_NOT_DISCOVERED`; ACP still selected with `fallback_reason: null` for all six) in the distillate evidence register and this Resume Note | research-distillate; this context | Repair of Review round 1 P1 current-evidence contradiction; no runtime, test, or release change |
| 2026-09-01 | authority correction | Replaced the distillate Planning Entry's mislabeling of the active Change's grant as session-local with the exact durable work-package grant `ubp-v502-zcode-closeout-2026-09-01` and recorded this second P1 in this context | research-distillate; this context | Repair of Review round 1 delta P1 grant-mode contradiction — the Planning Entry must agree with the intent's durable grant so a fresh Agent cannot stop after compaction believing continuation was session-scoped; no runtime, test, or release change |
| 2026-09-01 | authority correction | Clarified the active intent's durable Activation field with ZCode-authored wording: stable verification activates only the bounded package, while the stored active-intent mirror alone is inactive and cannot widen the owner decision | active intent; this context | Repair of the full-suite P1 authority-contract failure at `tests/project-artifacts.test.cjs:1279`; the targeted test and full release suite pass after the correction; no runtime, test, grant-scope, or release change |
| 2026-09-01 | evidence close | Bound the isolated 5.0.2-only product snapshot, published and read back canonical task evidence, and recorded the Owner's exact Deliver/P2 disposition | task evidence; Deliver decision; this context | Owner explicitly invoked local evidence/ledger close, Test/Deliver consumption, finalization, and archive while retaining both P2 findings and forbidding every external effect |
| 2026-09-01 | completion evidence invalidation | Reopened criterion `T502-04` after the first post-close project-artifact audit rejected `verification.log` because the new evidence files were absent from Planned Path Inventory | this context; task ledger; canonical evidence | The task cannot remain completed while its full project-artifact validation is red; preserve the prior evidence and Reviews as historical observations, repair only the evidence inventory, then obtain fresh task Review and evidence |
| 2026-09-01 | completion evidence repair | Added the exact canonical evidence and raw verification paths to Planned Path Inventory while the ledger task was explicitly reopened | this context only | Repair the project-artifact lifecycle contract without changing product implementation, acceptance, retained findings, or effect authority |
| 2026-09-01 | completion evidence re-close | Obtained a fresh admitted task Review for the repaired inventory and republished canonical task evidence against the new completion subject | task Review; task evidence; this context | Replace the invalidated closeout artifacts with current revision-bound proof before the ledger returns to `completed` and Test reruns the failed project-artifact check |
| 2026-09-01 | acceptance binding correction | Reopened `T502-04` again when the same audit reached the next assertion and showed that canonical evidence used a hand-calculated section digest including a trailing newline rather than the repository sensor's exact Acceptance-section bytes | this context; task ledger; canonical evidence | Bind the unchanged Acceptance Criteria to the exact tested extraction (`300a33a8...`) and recapture the completion subject; no criterion, product behavior, Review finding, or effect authority changes |

## Open Questions

- _(none; release effects remain outside this task)_

## Resume Note

Why: eliminate stale authority after ACP live activation. Outcome: one local 5.0.2
candidate whose maintained public/model/spec/package surfaces agree with the existing
six-Host runtime. Current position: implementation and the full retained local gate are
complete. The first closeout was explicitly invalidated and reopened when
`tests/project-artifacts.test.cjs` found that `evidence.json` and `verification.log`
were absent from Planned Path Inventory. The inventory is now repaired without
weakening the assertion; fresh admitted task Review session
`v502-authority-reconciliation-reopen-final-review-20260901` returned `APPROVE` with
P0=0, P1=0, P2=2, P3=0, and canonical evidence was republished and read back at digest
`37894c2a2f6a380c4bf12d439b5c1d588f20d27ce41a3ab008da4c891e5385d9`, but the next
project-artifact assertion correctly rejected its hand-calculated Acceptance-section
digest. That binding is now repaired using the repository sensor's exact bytes, and
canonical evidence was republished and read back at digest
`45743f378a16fb1472f37d5a05d20a4578e84b5bb8484a51cbf627b5ef9d822a`, binding unchanged
Acceptance digest `300a33a8eb55c48142ec7a3b7eac0e138f29b04c8a85c1a029e00e81d5f64c78`, HEAD
`adb7bfe89f40e107d0c9c490076a6e74294b9337`, and completion product-worktree digest
`8245fd002634bc2475331534595582a8b0ec5d9a9b4c66ca80ec1e4ab22e3e55`.
The earlier evidence, aggregate Review, and Test report remain historical observations
only. The Owner explicitly retained both non-blocking P2 findings and authorized local
Test/Deliver finalization and archive. Next bounded action: return the ledger task to
`completed`, rerun the full project-artifact check, and only then rebuild aggregate
Review/Test. Not done: commit, push, tag, publish, deploy, real-HOME installation, the
Codex Host discovery repair, Windows work, or any other external effect.

## Completion

- Product/documentation implementation, retained local verification, and the repaired
  mandatory formal task Review are complete.
- The fresh strict Review remains current for the unchanged criteria and repaired path
  inventory. Canonical evidence now uses the exact Acceptance-section sensor digest and
  current completion subject. The ledger is the sole task-status authority and may
  return this exact task to `completed`; aggregate Test must rerun the previously failed
  project-artifact audit before Deliver.

## Task Review

- Execution Grant state/limitation: implementation completed 2026-08-26 under the then
  session-local grant; the 2026-09-01 repair closeout used durable work-package grant
  `ubp-v502-zcode-closeout-2026-09-01`, which expired at the validated formal Review
  `APPROVE`. The current exact Owner invocation recorded in
  `.ultra/decisions/2026-09-01-v502-deliver-finalization.md` independently authorizes
  only local evidence/ledger close, Test/Deliver consumption, finalization, and archive;
  it authorizes no external effect.
- Review session / summary digest:
  `.ultra/reviews/v502-authority-reconciliation-reopen-final-review-20260901/SUMMARY.json` /
  `c9f2a08aae1751537f5e58b60af1bab166236db71cb1bb5b5cd55e3b9da1e15e`;
  packet `e7de7cc48448b5137800e3aab492fdbca424439f68cd0167351f3fa3e61b0b0a`;
  admission `d36e0583b78be9ffaa5b15e84d2e64a880ad4ece4e7ea03fdc767b6ab3358d4a`;
  subject `aefb589707dcc8204ba993827114b7244d7e66ee3e1cfd62c7442b9a3bf6eb01`;
  `APPROVE` with P0=0, P1=0, P2=2, P3=0 under
  `sequential-shared-context`.
- Blocking findings: none. Three development-loop P1 findings were repaired before the
  frozen Review (real-HOME Doctor evidence drift; Planning Entry grant-mode drift;
  stored active-intent inactivity). The terminal Review retains two non-blocking P2s:
  `review-spec-001` for the stale 0.26.2 Architecture base and
  `review-comments-001` for mutable `blob/main` links in versioned/frozen README
  documentation. The Owner explicitly retained both in
  `.ultra/decisions/2026-09-01-v502-deliver-finalization.md`; they are reported, not
  auto-repaired.
- Retention: retain the exact strict Review session, including `ADMISSION.json`, all
  four specialist artifacts, and `SUMMARY.json`, until Test and Deliver consume it;
  any later cleanup is a separate local housekeeping decision.
