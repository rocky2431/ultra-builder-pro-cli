# Research Traceability

This file navigates the accepted baseline. It does not duplicate or outrank the three
specifications it binds.

## Scope

- **Baseline**: Ultra Builder Pro v0.26 file-first product.
- **Current reconciliation**: Init/Research/Change boundary plus sequential Change,
  active-task scoping, Test freshness, and Deliver finalization.
- **Mode**: direct owner-authorized design and implementation reconciliation; no full
  `ultra-research` workflow or new Research run was claimed for this change.
- **Revision**: base HEAD `e5e6ab92fcc60b05c978d9f918bf01d2c0916eaa` plus current worktree.
- **Coverage**: current Skills, templates, Hooks, maintained docs, repository artifacts,
  installation copy paths, and owner usage feedback through 2026-08-04.

## Observed

| Claim | Evidence | Specification anchor |
|---|---|---|
| The released Init contract mixed raw owner intake with success, North Star, and baseline questions later repeated by Research. | pre-change Init/Research Skills and templates; owner usage feedback | `product.md#requirement-fr-09-non-overlapping-baseline-maturation` |
| All five adapters copy the complete canonical template and every Skill reference recursively. | `adapters/_shared/plugin-core.cjs`, `tests/v026-adapters.test.cjs` | `architecture.md#adaptation-and-routing` |
| The six early Research references are semantic lenses with dependencies, while Grilling, Think, and Domain Modeling are reusable methods. | `skills/ultra-research/SKILL.md` and selected references | `architecture.md#baseline-maturation` |
| Session context can select an accepted baseline by content and fall back before Research without persisting a workflow-state bit. | `hooks/session_context.py`, `hooks/tests/test_v026_hooks.py` | `architecture.md#hook-boundary` |
| Movable Change paths and global unfinished-task selection made sequential lifecycle state ambiguous. | pre-fix ledger, Hooks, and failing sequential-Change/abandoned-task contracts | `product.md#requirement-fr-10-sequential-lifecycle-continuity` |
| Delivery metadata and archive moves changed the old worktree fingerprint, while intent had no independent freshness identity. | pre-fix digest/Deliver contracts and the isolated archive-move regression | `architecture.md#verification-and-release` |
| Task-keyed Change entry, unconditional owner seam confirmation, and task-only Delegate entry left valid routes ambiguous or unreachable. | cross-Skill entry audit and failing workflow-entry regressions | `product.md#requirement-fr-06-bounded-delegation` |

## Decisions

| Decision | Owner and approval | Specification anchor |
|---|---|---|
| Keep exactly fourteen Skills; do not add an Ultra Verified or Wayfinding public route. | Owner accepted the smaller design; Wayfinding is optional Research navigation. | `product.md#requirement-fr-09-non-overlapping-baseline-maturation` |
| Init owns raw Project Brief and an empty skeleton; Research owns the first accepted North Star, domain language, and baseline; Change owns one delta and touched reconciliation. | Owner accepted after boundary review. | `architecture.md#authority-and-recovery` |
| A North Star metric is optional; an observable outcome plus guardrails is valid when one metric would be artificial. | Owner accepted; `22-success-metrics.md` preserves the decision point. | `product.md#artifact-lifecycle` |
| Keep one stable `change_id`, an append-only ledger scoped by the unique active Change, and two-pass delivery freshness without adding a workflow engine. | Owner requested comprehensive closure; red tests reproduced dangling identity, abandoned-task injection, and self-invalidating delivery. | `product.md#requirement-fr-10-sequential-lifecycle-continuity` |
| Never open a second active Change; keep technical seam selection model-owned; allow task, Research-evidence, and aggregate-review delegation scopes. | Owner requested complete repair; entry-boundary regressions reproduced the three dead ends. | `product.md#requirement-fr-06-bounded-delegation` |

## Unknowns

| Unknown or gap | Blocking | Owner and revisit condition |
|---|---:|---|
| Whether this uncommitted boundary change should be committed, pushed, published, or installed into real HOME | No for local implementation; yes for each named external effect | Separate explicit authorization |
| Provider output quality across every host and every Research lens | No for source/package completion | A bounded, owner-authorized live-provider evaluation |

## Source Revisions

| Canonical source | Git blob hash from `git hash-object` | Status |
|---|---|---|
| `.ultra/specs/product.md` | `3f4ad2305457537caaf0275dddc09dbebcf359a8` | current for this worktree |
| `.ultra/specs/architecture.md` | `d9617d4f7e8f3ffacb00b5501149f56c8c143fc1` | current for this worktree |
| `.ultra/specs/discovery.md` | `20a445746c5adc17d4520c71e8ae7315c6f8edf0` | current for this worktree |

## End-to-End Trace

| Problem or constraint | Actor and scenario | Requirement and acceptance | Architecture path | Verification |
|---|---|---|---|---|
| Init consumed Research and made the next route repetitive. | Owner starts a new or brownfield project. | FR-09; Init leaves only raw intake and empty baseline paths. | Project Brief authority and baseline maturation | Init/template contract tests |
| Research modes and generic methods had no explicit relationship. | Host model scopes an evidence path. | FR-03, FR-09; lenses remain Research-owned and methods stay reusable. | Method plane and baseline maturation | Skill graph and authoring tests |
| A pre-Research session still needs steering context. | Host starts a session before baseline acceptance. | FR-05, FR-09; accepted baseline wins, Project Brief is fallback, task acceptance is appended. | Hook boundary | Python Hook regressions |
| New artifacts must reach all five hosts without adapter-specific semantics. | Maintainer installs any supported CLI. | FR-01, FR-07, FR-09; installed template and references are byte-identical. | Adaptation and routing | adapter lifecycle and package smoke tests |
| Sequential Changes must not overwrite or revive history. | Owner archives or abandons one Change, then starts another. | FR-10; stable ids, same-Change dependencies, active-scoped readers, append-only ledger. | Authority and recovery | artifact and Hook regressions |
| Deliver must not invalidate its own Test evidence. | Owner reconciles docs and archives a tested Change. | FR-10; product changes require retest, while delivery metadata/move preserves product digest and intent remains separately bound. | Verification and release | isolated delivery-freshness regression |
| Delegation callers must be reachable without synthetic task rows. | Owner requests another CLI for scoped Research or aggregate review. | FR-06; instruction binds one of three scopes and only task execution requires a task. | Delegation boundary | workflow-entry and delegate contracts |

## Verification

| Command or observation | Result | Evidence location | Freshness |
|---|---|---|---|
| Boundary-focused red/green regressions | Init/Research ownership, stable Change identity, Hook frontier selection, report freshness, abandonment closure, and cross-Skill entry reachability reproduced red before green | changed tests and terminal output for this task | 2026-08-04, current worktree |
| Fourteen Skill Creator validations | 14/14 valid | official `quick_validate.py` output for this task | 2026-08-04, current worktree |
| `npm run verify:release` | 119 Node passed, 21 Hooks passed, audit found 0 vulnerabilities | terminal output for this task | 2026-08-04, current worktree |
| `npm pack --dry-run --json` and isolated five-host install/Doctor/uninstall | 115 package entries; 5/5 healthy; isolated config root empty after uninstall; Codex correctly reports Hook trust as user review | package and Doctor output for this task | 2026-08-04, current worktree |

## Planning Entry

- **Posture**: direct accepted boundary correction; no task graph was created.
- **Required references**: Project Brief, accepted North Star, three specifications,
  Research Wayfinding and lens references, maintained authority/lifecycle docs, and tests.
- **Blocking local gaps**: none for the local source and isolated installation contract.
- **External effects**: commit, push, publication, release, and real HOME installation are
  separate and not authorized by this local implementation request.
