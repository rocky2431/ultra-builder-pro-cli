# Research Traceability

This file navigates the accepted baseline. It does not duplicate or outrank the three
specifications it binds.

## Scope

- **Baseline**: Ultra Builder Pro v0.26 file-first product plus accepted v0.27 North
  Star v2 and Task/Acceptance v2 reconciliation.
- **Current reconciliation**: the accepted Ultra Builder Pro 3.0 forward design
  `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md` projected as revision `north-star-v2-r2`
  under the Mode B grant `ubp3-mode-b-2026-08-17`; superseded for forward work on
  2026-08-17 by the owner-directed r3 design
  `docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md` projected as revision
  `north-star-v2-r3` under the verified primary transfer and grant
  `ubp3-r3-zcode-2026-08-17`; the r1 research run
  `.ultra/research/2026-08-15-v027-north-star/99-synthesis.md` remains the
  bounded historical synthesis.
- **Mode**: bounded owner-authorized `ultra-research` run inside the abandoned
  Change `chg-v027-lifecycle-closure` (historical tasks `v027-north-star-v2` and
  `v027-task-acceptance-v2`); the r2 projection runs inside active Change
  `chg-ultra-3-0-mode-b` and later implementation claims remain separate tasks.
- **Revision**: base HEAD `fc055021bcfeee3e8c6781b9545d267f5eb73cbd` plus current worktree.
- **Coverage**: current Skills, templates, Hooks, maintained docs, repository artifacts,
  installation copy paths, authenticated host evidence, and owner decisions through 2026-08-14.

## Observed

| Claim | Evidence | Specification anchor |
|---|---|---|
| The released Init contract mixed raw owner intake with success, North Star, and baseline questions later repeated by Research. | pre-change Init/Research Skills and templates; owner usage feedback | `product.md#requirement-fr-09-non-overlapping-baseline-maturation` |
| All six adapters copy the complete canonical template and every Skill reference recursively. | `adapters/_shared/plugin-core.cjs`, `tests/v026-adapters.test.cjs` | `architecture.md#adaptation-and-routing` |
| The six early Research references are semantic lenses with dependencies, while Grilling, Think, and Domain Modeling are reusable methods. | `skills/ultra-research/SKILL.md` and selected references | `architecture.md#baseline-maturation` |
| Session context can select an accepted baseline by content and fall back before Research without persisting a workflow-state bit. | `hooks/session_context.py`, `hooks/tests/test_v026_hooks.py` | `architecture.md#hook-boundary` |
| Movable Change paths and global unfinished-task selection made sequential lifecycle state ambiguous. | pre-fix ledger, Hooks, and failing sequential-Change/abandoned-task contracts | `product.md#requirement-fr-10-sequential-lifecycle-continuity` |
| Delivery metadata and archive moves changed the old worktree fingerprint, while intent had no independent freshness identity. | pre-fix digest/Deliver contracts and the isolated archive-move regression | `architecture.md#verification-and-release` |
| Task-keyed Change entry, unconditional owner seam confirmation, and task-only Delegate entry left valid routes ambiguous or unreachable. | cross-Skill entry audit and failing workflow-entry regressions | `product.md#requirement-fr-06-bounded-delegation` |
| ZCode native discovery reports the managed Ultra plugin enabled with fourteen Skills and five runnable Hooks; source and target delegation both completed through real providers, including a default macOS App-bundle target launch with no binary override. | ZCode Doctor/inventory and `docs/evals/zcode-automation-2026-08-14.md` | `product.md#requirement-fr-01-six-native-installation-surfaces` |
| The seeded adversarial fixture stays locally green while encoding five consequential defect classes that current review prompts must recover. | `tests/adversarial-review-eval.test.cjs`, blind Claude/Kimi/ZCode runs | `architecture.md#agent-to-skill-convergence` |
| The v0.26 task contract duplicated Status in ledger and context, treated complexity as a semantic split gate, and admitted only command-shaped evidence. | pre-Phase-2 template, artifact tests, and `ultra-task-evidence-v1` records | `product.md#requirement-fr-10-sequential-lifecycle-continuity` |

## Decisions

| Decision | Owner and approval | Specification anchor |
|---|---|---|
| Keep exactly fourteen Skills; do not add an Ultra Verified or Wayfinding public route. | Owner accepted the smaller design; Wayfinding is optional Research navigation. | `product.md#requirement-fr-09-non-overlapping-baseline-maturation` |
| Init owns raw Project Brief and an empty skeleton; Research owns the first accepted North Star, domain language, and baseline; Change owns one delta and touched reconciliation. | Owner accepted after boundary review. | `architecture.md#authority-and-recovery` |
| A North Star metric is optional; an observable outcome plus guardrails is valid when one metric would be artificial. | Owner accepted; `22-success-metrics.md` preserves the decision point. | `product.md#artifact-lifecycle` |
| Keep one stable `change_id`, an append-only ledger scoped by the unique active Change, and two-pass delivery freshness without adding a workflow engine. | Owner requested comprehensive closure; red tests reproduced dangling identity, abandoned-task injection, and self-invalidating delivery. | `product.md#requirement-fr-10-sequential-lifecycle-continuity` |
| Never open a second active Change; keep technical seam selection model-owned; allow task, Research-evidence, and aggregate-review delegation scopes. | Owner requested complete repair; entry-boundary regressions reproduced the three dead ends. | `product.md#requirement-fr-06-bounded-delegation` |
| Add ZCode as the sixth native host, keep six lenses available as the justified aggregate default, and permit Change-scoped continuation only through explicit dual-mode execution grants (session-local stop on lost activation; durable continuation only after exact verification; neither grants finalization or archive). | Owner accepted Phases 1–4 after cross-model review; the accepted 3.0 design superseded the same-session-only and permanent-roster restrictions. | `architecture.md#bounded-automatic-coding` |
| Make the v2 ledger the sole task-status authority and use four typed acceptance evidence shapes without semantic auto-pass. | Owner accepted the comprehensive lifecycle plan; Phase 2 RED reproduced the missing schema, duplicate context authority, absent typed validator, and v1-only evidence. | `product.md#requirement-fr-10-sequential-lifecycle-continuity` |

## North Star v2 Navigation

| Revision | First principles | Outcome | Hard constraints | Research and promoted anchors |
|---|---|---|---|---|
| `north-star-v2-r1` | `FP-1`, `FP-2`, `FP-3`, `FP-4`, `FP-5`, `FP-6` | `NS-01` | `HC-1`, `HC-2`, `HC-3`, `HC-4`, `HC-5`, `HC-6` | `.ultra/research/2026-08-15-v027-north-star/99-synthesis.md#trace`; `discovery.md#north-star-v2-problem-relations`; `product.md#north-star-v2-outcome-relations`; `architecture.md#north-star-v2-architecture-relations` |
| `north-star-v2-r2` | `FP-1`–`FP-7` | `NS-01`–`NS-05` | `HC-1`–`HC-8` | `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md`; `.ultra/decisions/2026-08-17-ultra-3-0-north-star-r2.md`; `.ultra/decisions/2026-08-17-ultra-builder-pro-3.0-mode-b.md` |
| `north-star-v2-r3` (current) | `FP-1`–`FP-8` | `NS-01`–`NS-05` | `HC-1`–`HC-8` | `docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md`; `.ultra/decisions/2026-08-17-ultra-3-0-north-star-r3.md`; `.ultra/decisions/2026-08-17-ultra-3-0-r3-primary-handoff.md`; `.ultra/research/2026-08-17-ultra-3-0-r3-projection/north-star-v2-r3.accepted.md` |

## Unknowns

| Unknown or gap | Blocking | Owner and revisit condition |
|---|---:|---|
| Whether this uncommitted boundary change should be committed, pushed, published, or installed into real HOME | No for local implementation; yes for each named external effect | Separate explicit authorization |
| Grok Build 1.0.3 terminal structured-output conformance | No for source/package completion; yes for claiming a valid Grok worker result | Recheck after a host update; preserve fail-closed launcher validation |

## Source Revisions

| Canonical source | Git blob hash from `git hash-object` | Status |
|---|---|---|
| `.ultra/specs/product.md` | `dfc91d1ca2a3cfc2b50f7c9c4367af23eaf49775` | current for this worktree (r3 projection) |
| `.ultra/specs/architecture.md` | `ffaa7241389d88259fc9f745d7fa0bd039c782b6` | current for this worktree (r3 projection) |
| `.ultra/specs/discovery.md` | `5d4025e7295f702d83aa04a15b731bdfd2240735` | current for this worktree |

## End-to-End Trace

| Problem or constraint | Actor and scenario | Requirement and acceptance | Architecture path | Verification |
|---|---|---|---|---|
| Init consumed Research and made the next route repetitive. | Owner starts a new or brownfield project. | FR-09; Init leaves only raw intake and empty baseline paths. | Project Brief authority and baseline maturation | Init/template contract tests |
| Research modes and generic methods had no explicit relationship. | Host model scopes an evidence path. | FR-03, FR-09; lenses remain Research-owned and methods stay reusable. | Method plane and baseline maturation | Skill graph and authoring tests |
| A pre-Research session still needs steering context. | Host starts a session before baseline acceptance. | FR-05, FR-09; accepted baseline wins, Project Brief is fallback, task acceptance is appended. | Hook boundary | Python Hook regressions |
| New artifacts must reach all six hosts without adapter-specific semantics. | Maintainer installs any supported CLI. | FR-01, FR-07, FR-09; installed template and references are byte-identical. | Adaptation and routing | adapter lifecycle and package smoke tests |
| Automatic coding must preserve owner authority and North Star causality. | Owner activates one accepted Change. | FR-02, FR-04, FR-10; resident guards verify live activation, reviews stay mandatory, semantic and effect boundaries stop. | Bounded automatic coding | contract regressions plus ZCode through-test drill |
| Sequential Changes must not overwrite or revive history. | Owner archives or abandons one Change, then starts another. | FR-10; stable ids, same-Change dependencies, active-scoped readers, append-only ledger. | Authority and recovery | artifact and Hook regressions |
| Deliver must not invalidate its own Test evidence. | Owner reconciles docs and archives a tested Change. | FR-10; product changes require retest, while delivery metadata/move preserves product digest and intent remains separately bound. | Verification and release | isolated delivery-freshness regression |
| Delegation callers must be reachable without synthetic task rows. | Owner requests another CLI for scoped Research or aggregate review. | FR-06; instruction binds one of three scopes and only task execution requires a task. | Delegation boundary | workflow-entry and delegate contracts |
| Task completion needs evidence without making a command or validator the semantic judge. | Host model implements and reviews a task; owner retains judgment-only criteria. | FR-04, FR-10; ledger-only Status, typed evidence, Acceptance-only digest, strict task review, owner-only authority. | Authority and recovery; Verification and release | task-evidence-v2, artifact, Hook, and package-consumer contracts |

## Verification

| Command or observation | Result | Evidence location | Freshness |
|---|---|---|---|
| Boundary-focused red/green regressions | Init/Research ownership, stable Change identity, Hook frontier selection, report freshness, abandonment closure, and cross-Skill entry reachability reproduced red before green | changed tests and terminal output for this task | 2026-08-04, current worktree |
| Fourteen Skill Creator validations | 14/14 valid | official `quick_validate.py` output for this task | 2026-08-04, current worktree |
| `npm run verify:release` | 130 Node passed, 21 Hooks passed, audit found 0 vulnerabilities | terminal output for this task | 2026-08-14, current worktree |
| `npm pack --dry-run --json` and isolated six-host install/Doctor/uninstall | 121 package entries; 6/6 healthy; isolated lifecycle tests pass; Codex correctly reports Hook trust as user review | package and Doctor output for this task | 2026-08-14, current worktree |
| Authenticated adversarial and automatic-coding drills | Claude, Codex, OpenCode, Kimi, and ZCode returned valid target results; ZCode also called Claude and completed one through-test coding loop; Grok failed closed on malformed output | `docs/evals/*.md` | 2026-08-14 |
| Phase 2 Task/Acceptance RED, GREEN, and closeout | The public contract first failed 11/11; subsequent identity, key-order, pre-review evidence, graph, authority, recovery, portability, bounded active-Change, non-self-referential product freshness, exact raw-receipt SHA, tracked/untracked stable snapshot, deletion budgeting, exact active-root replay, started-task ambiguity, bounded artifact audit, and exactly one fixed closing protocol each reproduced RED before GREEN. That closing protocol is one complete primary observation plus one terminal seal: observable persistent in-seal drift returns typed recovery, a write after the completed seal requires the next consumer's fresh recapture, hostile writers require a native Host sandbox or isolated worktree, and no unbounded success-seeking replay is allowed. Post-review coverage pins the exact 64 MiB Git output option plus typed `ENOBUFS` recovery, the exact 5000 ms internal Git timeout inside a 10-second outer harness, and the inclusive tracked-deletion boundary where 256 succeeds with the complete digest and 257 fails with typed resource recovery. The public authority regression first reproduced the stale unconditional owner-route wording RED before README and the lifecycle guide aligned on owner-explicit selection by default plus the live same-session Autonomy Envelope exception (historical naming, superseded by the 3.0 execution grant). Its final repair binds each complete whitespace-normalized authority paragraph and rejects loss of `only`, weakening `every external effect`, and added model-selected `Status` or `Delegate`; the public docs and runtime did not change for that test-sensitivity repair. Sequential review fallback is recorded as `execution_mode: sequential-shared-context` with an explicit shared-context limitation; context reuse alone does not force `INCOMPLETE`. The repaired integrated boundary passes 239/239 Node and 83/83 Hook tests. Final current-subject Review returned zero-finding `APPROVE`; canonical evidence validates as `current-v2`; the ledger row is `completed`. | `tests/task-evidence-v2.test.cjs`, `tests/project-artifacts.test.cjs`, `tests/v026-contract.test.cjs`, `hooks/tests/test_v026_hooks.py`, `.ultra/evidence/v027-task-acceptance-v2/evidence.json`, `.ultra/reviews/v027-task-acceptance-v2-final-clean-review/SUMMARY.json` | 2026-08-16, completed Phase 2 worktree |

## Planning Entry

- **Posture**: active Change `chg-ultra-3-0-mode-b` under the durable Mode B grant;
  task `v30-mode-b-local-implementation` is the single in-progress frontier. The
  v0.27 lifecycle-closure Change is abandoned with an exact closure recording the
  superseding grant; its completed Phase 1/H0 evidence and reviews remain history.
- **Required references**: Project Brief, accepted North Star, three specifications,
  this run's brief/lens/synthesis reports, maintained authority/lifecycle docs, and tests.
- **Blocking local gaps**: none remain inside Phase 2. Phase 3 through Phase 8 have not
  started; later task evidence must not be backfilled from Phase 2, historical v0.26,
  or pre-task dirty records.
- **External effects**: no provider call, real-HOME install, commit, push, publication,
  or release was executed for this Phase 2 closeout.
