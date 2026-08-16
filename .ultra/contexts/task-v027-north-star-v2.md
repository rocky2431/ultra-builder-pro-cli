# Task v027-north-star-v2: Establish the first-principles North Star v2 constitution

## Context

**What**: Define, test, and migrate North Star v2 with revision acceptance, problem
reality, falsifiable `FP-*`, causal chains, observable `NS-*`, risk-based `HC-*`,
exclusions, uncertainty triggers, and research trace.

**Why**: Automatic coding can stay aligned only when every later artifact can trace to
accepted first principles and when contradictory evidence has an explicit return path.

**Constraints**:
- `ultra-research` is the first canonical writer; Init preserves raw owner input only.
- Mechanical validation checks structure and references, never semantic truth.
- Later artifacts reference stable IDs instead of copying North Star prose.
- The 58 pre-Change dirty entries are unbound baseline, not task evidence.

## Implementation

**Layers touched**: canonical schema, Skill writers/readers, template distribution,
project migration, validation, and documentation.

**Pattern**: one canonical owner-readable file plus deterministic structural sensors.

## Planned Path Inventory

`MODIFY`:

- `.ultra-template/north-star.md`
- `.ultra-template/contexts/TEMPLATE.md`
- `.ultra-template/test-report.json`
- `.ultra/north-star.md`
- `.ultra/specs/product.md`
- `.ultra/specs/architecture.md`
- `.ultra/specs/discovery.md`
- `.ultra/specs/research-distillate.md`
- `skills/ultra-init/SKILL.md`
- `skills/ultra-init/scripts/init_project.cjs`
- `skills/ultra-research/SKILL.md`
- `skills/ultra-research/references/04-product-strategy.md`
- `skills/ultra-research/references/21-features-scope.md`
- `skills/ultra-research/references/22-success-metrics.md`
- `skills/ultra-research/references/99-synthesis.md`
- `skills/ultra-research/references/wayfinding.md`
- `skills/ultra-change/SKILL.md`
- `skills/ultra-change/references/change-contract.md`
- `skills/ultra-change/references/autonomy-envelope.md`
- `skills/ultra-plan/SKILL.md`
- `skills/ultra-dev/SKILL.md`
- `skills/ultra-status/SKILL.md`
- `skills/ultra-review/SKILL.md`
- `skills/ultra-review/references/unified-schema.md`
- `skills/ultra-review/references/worker-packet.md`
- `skills/ultra-review/scripts/review_wait.py`
- `skills/ultra-test/SKILL.md`
- `skills/ultra-deliver/SKILL.md`
- `hooks/_common.py`
- `hooks/session_context.py`
- `hooks/tests/test_v026_hooks.py`
- `docs/PHILOSOPHY.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `.ultra/changes/active/chg-v027-lifecycle-closure/intent.md`
- `tests/project-artifacts.test.cjs`
- `tests/review-wait.test.cjs`
- `tests/skill-authoring.test.cjs`
- `tests/v026-contract.test.cjs`

`CREATE`:

- `skills/ultra-research/references/north-star-v2.md`
- `skills/ultra-research/scripts/validate_north_star.cjs`
- `tests/north-star-v2.test.cjs`
- `.ultra/decisions/2026-08-15-v027-north-star-r1.md`
- `.ultra/research/2026-08-15-v027-north-star/brief.md`
- `.ultra/research/2026-08-15-v027-north-star/00-problem-validation.md`
- `.ultra/research/2026-08-15-v027-north-star/04-product-strategy.md`
- `.ultra/research/2026-08-15-v027-north-star/05-assumptions-validation.md`
- `.ultra/research/2026-08-15-v027-north-star/22-success-metrics.md`
- `.ultra/research/2026-08-15-v027-north-star/41-quality-risks.md`
- `.ultra/research/2026-08-15-v027-north-star/99-synthesis.md`
- `.ultra/research/2026-08-15-v027-north-star/north-star-v2-r1.accepted.md`
- `skills/ultra-test/scripts/validate_review_transport.cjs`
- `tests/review-transport.test.cjs`

Additional `MODIFY` paths admitted by the postfix review correction:

- `tests/package-smoke.test.cjs`

Any later addition, removal, or rename in this inventory is plan-critical and requires
a rebuilt Execution Packet plus owner reapproval before implementation continues.

## Public Seams

- `.ultra/north-star.md` North Star v2 headings, revision identity, and `FP-*`/`NS-*`/`HC-*` reference syntax.
- `ultra-init` output: an `unresearched` empty placeholder only.
- `ultra-research` output: the first populated semantic authority and owner-acceptance record.
- `node skills/ultra-research/scripts/validate_north_star.cjs <path>` structural-sensor CLI.

## Narrow Verification

- `node --test tests/north-star-v2.test.cjs`
- `node skills/ultra-research/scripts/validate_north_star.cjs .ultra/north-star.md`
- `node --test tests/project-artifacts.test.cjs tests/skill-authoring.test.cjs tests/v026-contract.test.cjs`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC-01`, `AC-02`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| A-01 | North Star structure, revision, ID, and trace contracts pass. | `command` | exact command, cwd, exit code, raw evidence ref, and freshness identity |
| A-02 | Every later workflow consumes `FP/NS/HC` trace without a prose mirror. | `inspection` | workflow sources, observed trace behavior, and revision |
| A-03 | The migrated v2 revision carries the owner's accepted principles. | `owner-judgment` | durable owner statement or explicit disposition |
| A-04 | Supersession marks an active Change stale and preserves old evidence. | `inspection` | supersession sources, observed behavior, and revision |

## Definition of Drift

- Adding a truth score, semantic state machine, duplicate North Star registry, or fixed
  maximum number of principles.
- Letting Init synthesize accepted product truth or a later Skill silently rewrite it.

## Trace

**Source**: `.ultra/north-star.md#north-star-outcomes`, `FP-1` through `FP-6`, and `NS-01`

**First principles**: [`FP-1`, `FP-2`, `FP-3`, `FP-4`, `FP-5`, `FP-6`]

**Serves**: [`NS-01`]

**Causal contribution**: Establish the revisioned authority and resolving ID chain that
lets every later workflow demonstrate how bounded coding serves `NS-01` without copying
North Star prose.

**Hard constraints**: [`HC-2`, `HC-3`, `HC-4`]

**Decisions**: `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md#4-north-star-v2第一性原理宪法`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-15 | — | Initial task contract | — | Phase 0 planning only |
| 2026-08-15 | CORRECTION | Added `tests/skill-authoring.test.cjs` to planned inventory | — | Full-suite discovery: the planned `north-star-v2.md` contract reference is not an eighteenth Research lens, and the accepted v0.27 plan removes the arbitrary resident-line hard gate. |
| 2026-08-15 | IMPLEMENTATION | Added North Star v2 placeholder, accepted self-migration, structural validator, and lifecycle trace/supersession contracts | — | Implements AC-01 and the North Star portion of AC-02 without adding semantic machine judgment. |
| 2026-08-15 | CORRECTION | Added the live SessionStart consumer, philosophy contract, review packet schema, stable owner decision, active intent reconciliation, and bounded Research run artifacts to the task inventory | — | Independent review showed that the first implementation validated a subset of the v2 structure but left the live Hook on legacy headings, cited a mutable intent anchor as the owner source, and claimed Research exit evidence without a canonical Research run. These paths are required consumers and authority records of the already accepted North Star v2 outcome. |
| 2026-08-15 | IMPLEMENTATION | Closed every Phase 1 blocking finding with draft/accepted/legacy validation, exact structure and causal-chain sensors, stable owner acceptance, bounded Research evidence, accepted-v2 SessionStart injection, exact Change trace/digest, and separate review-packet revision/digest fields | — | Restores the accepted semantic/mechanical boundary across the canonical writer, live consumer, downstream review packet, and recovery paths without making the validator a truth judge. |
| 2026-08-15 | CORRECTION | Added `hooks/_common.py`, the four promoted specification/distillate paths, and the immutable accepted North Star snapshot to the planned inventory | `.ultra/specs/discovery.md`, `.ultra/specs/product.md`, `.ultra/specs/architecture.md`, `.ultra/specs/research-distillate.md` | Fresh review proved that strict cross-language classification, accepted-byte recovery, and Research conclusions consumed by specifications are live Phase 1 paths rather than incidental files. |
| 2026-08-15 | IMPLEMENTATION | Added duplicate/unresolved sensors, decision-anchor and byte/digest/snapshot binding, equivalent JS/Python publication classification, bounded SessionStart reference fallback, exact lens traces, and resolving promoted specification relations | `.ultra/specs/discovery.md`, `.ultra/specs/product.md`, `.ultra/specs/architecture.md`, `.ultra/specs/research-distillate.md` | Closes the fresh review findings while retaining semantic truth and owner acceptance outside mechanical validation. |
| 2026-08-15 | CORRECTION | Added the canonical task/test templates, direct Dev/Deliver entry checks, review schema/waiter, and review contract tests to the planned inventory | — | The first six-lens task review exposed missing live consumers: accepted publication could bypass its owner binding, direct workflow entry could proceed on a superseded trace, the task template could not carry the promised causal IDs, and review v3 could not encode per-finding trace. These are repairs to AC-01/AC-02, not later-phase completion claims. |
| 2026-08-15 | IMPLEMENTATION | Repaired every first-round P1/P2 with binding-aware SessionStart publication, exact legacy and unresearched classification, decision-status authorization, direct-entry supersession checks, causal task trace, review v4 propagation, and maintained fallback documentation | — | Converts the six independent review observations into resolving tests and live consumers while preserving immutable v3 history through an explicit read-only compatibility mode. |
| 2026-08-15 | CORRECTION | Added the deterministic Review-to-Test transport validator, its executable contract test, and the packed installed-Init mutation path to the inventory | — | The fresh postfix review proved that prompt/schema wording alone did not preserve exact specialist findings through SUMMARY into Test, that the v4 waiter was not bound to its immutable packet roster, and that the installed Init path had no malformed-template rejection probe. These are direct live consumers and recovery checks for AC-01/AC-02. |
| 2026-08-15 | IMPLEMENTATION | Bound review v4 to the immutable packet and exact specialist union, added deterministic Review-to-Test transport, completed JS/Python publication-classifier parity, and made the unresearched Init artifact byte-canonical with direct-entry mutation coverage | — | Resolves all 17 postfix P1/P2 findings at four shared causes while retaining explicit read-only v3 compatibility and leaving semantic judgment with the model and owner. |
| 2026-08-15 | CORRECTION | Reused the existing North Star validator, Hook bridge, review waiter, Review-to-Test validator, templates, references, and contract-test paths already listed above; no new implementation path is admitted | — | The final-approved review reproduced three deeper shared causes: duplicate Python/JavaScript publication grammars, partial Worker Packet/provenance validation, and a Review-to-Test transport check that trusted an unvalidated SUMMARY identity. The repair is deletion-first: SessionStart delegates the exact mechanical publication report to the sole JavaScript validator, the waiter validates complete v4 packet and repository-relative provenance contracts, and Test first replays that waiter before binding the same SUMMARY bytes to Change/task/HEAD/context/worktree fields. These remain exact fact and recovery checks, not semantic truth gates. |
| 2026-08-15 | IMPLEMENTATION | Replaced the duplicate Python North Star grammar with one bounded canonical JavaScript report, bound accepted publication to raw UTF-8 bytes and repository-contained decision/snapshot paths, completed Worker Packet v1 and v4 artifact provenance validation, and made Review-to-Test replay the same waiter before exact subject transport | — | Resolves all 15 final-approved P1/P2 observations at their three shared causes. Invalid bytes, unavailable runtimes, malformed or out-of-scope review evidence, and cross-subject transport now return typed repairable diagnostics; no validator decides semantic truth, rewrites findings, or advances workflow state. |
| 2026-08-15 | CORRECTION | Reused only the existing Init, canonical North Star validator, Hook bridge, review waiter, Review-to-Test validator, and their listed tests; admitted no new implementation path after the final-closure review | — | The immutable final-closure review returned `REQUEST_CHANGES` with 23 findings. They reduce to seven mechanical roots: Init must classify and materialize atomically from raw bytes; the owner record must contain durable acceptance evidence; packet subject bytes and packet identity must remain bound through polling; a failed axis must still have a reachable `INCOMPLETE` summary; Review-to-Test must validate and bind one repository-contained byte snapshot; SessionStart must bound validator output while reading; and v4 timestamps must be RFC 3339. Repeated point patches stop here: each root receives one shared producer-side repair and mutation coverage. |
| 2026-08-15 | IMPLEMENTATION | Closed the seven final-closure roots with raw-byte staged Init, durable owner-record structure, bounded SessionStart streaming, packet admission and stable review files, reachable `INCOMPLETE`, RFC 3339 timestamps, and single-snapshot Review-to-Test transport | — | Converts the 23 immutable findings into shared mechanical producer/consumer repairs. The first full merge passed 263 Node and 36 Hook tests, but independent verification correctly rejected the result because the waiter had reintroduced a Python North Star grammar and mutable historical subject polling, and because Test report/SUMMARY and Init still had uncovered stable-byte boundaries. |
| 2026-08-15 | CORRECTION | Deleted the duplicate Python North Star/Change grammar and current-subject revalidation from immutable review consumption; reused the canonical JavaScript report and added no new implementation path | — | Independent anti-pattern review proved that the first root repair blocked the real accepted North Star and made normal context completion destroy historical evidence. Current subject validation now occurs only at packet admission; later agents, summary, and Test validate frozen bytes and bindings. Independent verification also required bounded non-symlink report/SUMMARY snapshots, a failed specification axis terminal path, fenced-heading rejection, and Init pre/post stable-byte checks. |
| 2026-08-15 | IMPLEMENTATION | Completed the deletion-first admission/consumption split, canonical revision report, failed-axis `INCOMPLETE`, bounded stable Test snapshots, Init drift retry, and fence-aware owner anchor | — | The merged root corpus passes 276 Node and 36 Hook tests. Historical evidence remains readable after normal context changes, live packet admission consumes the single canonical North Star validator, and no mechanical component judges semantic truth or mutates workflow status. |
| 2026-08-15 | CORRECTION | Reused the same canonical validator, Hook, Init, review waiter, Test transport, references, and tests after the closure-approved review; admitted no new semantic state or workflow path | — | The immutable closure-approved review returned `REQUEST_CHANGES` with 18 findings (P1=13, P2=5). They reduce to rendered-Markdown lexical truth, packet-admission proof and current Git/source observations, bounded single-snapshot validator consumption, stable publication/reading boundaries, and exact typed recovery. The next repair must centralize those facts instead of adding parallel parsers. |
| 2026-08-15 | IMPLEMENTATION | Closed closure-approved findings with one rendered Markdown stream, same-byte validator stdin, stable Hook/Init/Test snapshots, bounded review admission, current Git/source observations, and a required derived admission receipt | — | The receipt is reconstructable review-session evidence, never semantic authority. Default v4 consumers require it; immutable pre-receipt v4 sessions remain explicit `--legacy-v4` reads. All normal paths retain typed repair/retry and cooperative-workspace drift detection without claiming protection from an adversarial OS-level writer. |
| 2026-08-15 | CORRECTION | Kept the same Hook, review admission, Init diagnostic, schema/reference, and documentation paths after the final-pass review | `.ultra/specs/architecture.md` | The strict admitted final-pass session reduced residuals to five shared mechanical issues: stable Project Brief/authority snapshot fallback, immutable admission identity, receipt-loss recovery wording, full typed Init diagnostics, and one stale v3 architecture sentence. No new semantic parser, state machine, or workflow edge is admitted. |
| 2026-08-15 | IMPLEMENTATION | Closed final-pass residuals with shared stable Hook snapshots, create-once admission, exact admission/subject binding through Review and Test, retained-receipt recovery, typed Init diagnostics, and current architecture wording | `.ultra/specs/architecture.md` | Specialists and SUMMARY now pin the exact admission and subject digests; Test transports them unchanged. A receipt is non-authoritative retained evidence: loss makes the session incomplete and requires a fresh session, while exact repeated admission is idempotent and changed admission cannot overwrite history. |
| 2026-08-15 | CORRECTION | Reused canonical North Star observations, admission publication, Deliver entry, retained-review docs, and Init snapshot paths after the approved-session review | `.ultra/specs/product.md`, `.ultra/specs/architecture.md` | The strict approved session returned nine findings. Six P1s reduce to complete canonical source observations, post-publication session identity, distinguishing current strict sessions from historical compatibility, and Deliver consuming the retained receipt. Three P2s cover exact cleanup diagnostics, one false-green legacy test, and avoiding retained file bytes when a digest is sufficient. |
| 2026-08-15 | IMPLEMENTATION | Closed the approved-session roots with canonical decision/snapshot observations in the admission receipt, a strict packet marker, loss- and drift-safe receipt publication, Deliver replay of retained strict review evidence, Test-and-Deliver-gated review GC, exact cleanup diagnostics, and digest-only non-North-Star Init snapshots | `.ultra/specs/product.md`, `.ultra/specs/architecture.md`, `.ultra/specs/research-distillate.md` | Current strict sessions can no longer enter the historical legacy-v4 path, admission binds the exact authority bytes consumed by the canonical validator, missing published evidence has a fresh-session recovery, and delivery cannot archive evidence that Test can no longer reproduce. The mechanical fixes do not elevate receipts, digests, or validators into semantic authority. |
| 2026-08-15 | CORRECTION | Reused only the listed SessionStart, review packet/admission/waiter, schema, and contract-test paths after the complete-review session; admitted no new implementation path | — | The immutable complete-review session returned seven findings (P1=3, P2=4). They reduce to three producer-side roots: reference-only accepted authority must name the exact validated snapshot; packet production and admission must bind the same Change, acceptance, decision, and accepted-snapshot bytes while honoring archived traces; and strict-versus-legacy identity plus cleanup/docs must follow the same executable contract. These are mechanical provenance and recovery repairs, not new semantic gates. |
| 2026-08-15 | IMPLEMENTATION | Closed the complete-review roots with an immutable oversized-authority handoff, strict admission v2 packet-captured subject observations, retained-v1 read compatibility without receipt reconstruction, exact archive/abandoned Change consumption, all-source admission revalidation, strict-marker rejection in both legacy modes, complete cleanup warnings, and an executable SUMMARY example | — | New reviews now prove that packet production and admission observed the same Change, acceptance, decision, and accepted-snapshot bytes. Historical retained v1 evidence remains readable but cannot be recreated or reinterpreted, and the model-facing oversized handoff identifies the exact accepted snapshot rather than a mutable path alone. |
| 2026-08-15 | CORRECTION | Reused only the listed Init, SessionStart, Review-to-Test, Change contract, product specification, and contract-test paths after the admission-v2 review; admitted no new implementation path | `.ultra/specs/product.md`, `.ultra/specs/research-distillate.md` | The immutable admission-v2 session returned ten findings (P1=4, P2=6). Four shared repairs cover preserved-file parent identity, complete accepted-report binding, full Review-to-Test component identity, and typed acceptance/autonomy documentation plus the missing v2 mutation matrix. |
| 2026-08-15 | IMPLEMENTATION | Closed the admission-v2 roots with preserved parent-chain snapshots, accepted-specific Hook report validation, root-and-component Review-to-Test rewalk, typed Change acceptance, required manual-default Autonomy Envelope wording, and exact multi-source/final-rewalk/receipt/SUMMARY tests | `.ultra/specs/product.md`, `.ultra/specs/research-distillate.md` | The fixes preserve one canonical validator and file-first authority. They add only mechanical identity, evidence-shape, and recovery checks; owner judgment and model interpretation remain outside code. A new immutable packet and review are required because the reviewed bytes changed. |
| 2026-08-15 | CORRECTION | Added the already changed and directly consumed `autonomy-envelope.md`, `docs/ARCHITECTURE.md`, and `docs/DECISIONS.md` to the exact inventory; reused the existing Init, Hook, Review, Test, Change, specifications, and tests for all other repairs | `.ultra/specs/architecture.md`, `.ultra/specs/research-distillate.md` | The immutable final-approved-v2 session returned fourteen findings (P1=10, P2=4). Five P1 reports duplicated the missing live Autonomy Envelope, one exposed incomplete packet scope, one exposed accepted-report projection gaps, two exposed destructive cleanup identity gaps, and one requested an adversarial OS-level filesystem guarantee outside the accepted cooperative-workspace threat model. The three inventory additions are live public-seam consumers, not scope expansion. |
| 2026-08-15 | IMPLEMENTATION | Migrated the live Change to a manual-default inactive Autonomy Envelope, corrected the exact typed Acceptance table and architecture authority, validated complete accepted-report projections, made Init and admission cleanup identity-safe, expanded the mutation matrix, and documented the portable cooperative-workspace boundary | `.ultra/specs/architecture.md`, `.ultra/specs/research-distillate.md` | Observable symlink, root, ancestor, inode, byte, and digest drift remains enforced. Malicious operating-system writers that can exchange and restore entries between individual syscalls require Host sandboxing or an isolated worktree; building a platform-specific filesystem engine into this portable Skill would violate the accepted product boundary. |
| 2026-08-15 | CORRECTION | Reused the exact 54-path inventory after the phase1-approved review; admitted no new implementation path | — | The immutable phase1-approved session returned seven findings (P1=1, P2=6). They reduce to typed Acceptance consumption in Dev/Change, exact Change-shape migration, bounded Research validator ingress, preserving primary Init diagnostics during cleanup conflict, and exact contract assertions for both architecture authorities. |
| 2026-08-15 | IMPLEMENTATION | Migrated the active intent to the exact ordered Change contract, folded bootstrap approval beneath the Autonomy Envelope, made Dev evidence-type-aware without semantic numeric exits, bounded direct Research path validation, preserved dual Init failure diagnostics, and upgraded exact contract tests | — | This closes the remaining live producer/consumer drift without adding another authority or workflow engine. The final re-review must validate the same 54 paths and accepted cooperative-workspace boundary. |
| 2026-08-15 | CORRECTION | Reused the exact 54-path inventory for the three approved-final P2 repairs; admitted no new implementation path | — | The immutable approved-final session identified two missing executable sensors and one error-taxonomy defect: direct Research read failure, exact Bootstrap evidence nesting, and preserved-file snapshot I/O mislabeled as concurrent drift. |
| 2026-08-15 | IMPLEMENTATION | Added a public missing-path Research regression, exact in-envelope Bootstrap heading assertions, and a distinct sanitized Init snapshot-I/O diagnostic with nested cleanup recovery | — | RED was 52/53 with the old Init drift label; the same command reached 53/53 GREEN. Independent gates passed North Star 48/48, project artifacts 5/5, package smoke 1/1, both Init and Research Skill Creator validations, and `git diff --check`. The frozen review session, task status, ledger, Completion, and Task Review remain unchanged for coordinator closure. |
| 2026-08-15 | CORRECTION | Scoped the bootstrap-evidence assertion to this v0.27 construction Change and raised only the review test harness outer subprocess ceiling | — | The zero-final review found two test-contract defects: a reusable future Change was being forced to carry this Change's bootstrap subsection, and a healthy Python-to-Node integration probe could exceed a 1.5 second harness timeout under parallel load. Product timeout and semantic contracts remain unchanged. |
| 2026-08-15 | IMPLEMENTATION | Kept generic Autonomy Envelope validation reusable and made synchronous review-wait test helpers load-tolerant with a bounded five-second outer ceiling | — | Project artifact tests pass 5/5 and the complete review-wait suite passes 174/174. The waiter still uses its short internal timeout and poll settings; the larger ceiling belongs only to the executable test harness. |
| 2026-08-15 | CORRECTION | Migrated the retained Phase 1 command receipt to the canonical v2 raw-byte integrity field without changing its bytes or semantic disposition | `.ultra/specs/product.md`, `.ultra/specs/architecture.md` | Phase 2 made evidence publication non-self-referential by excluding `.ultra/evidence/**` from the product-worktree digest while requiring every command and external raw receipt to carry its exact SHA-256. This completed record now binds the existing `phase1-command-refresh.log` bytes as `1c7a8433a2833f0dc4c79868b8b5b6f2ee2df6d4b554ab1e3c6bb74fa261f5d1`; Test, Status, and Deliver must stable-read and recompute that digest before consuming the record. |

## Open Questions

- _(none blocking; semantic acceptance evidence must remain owner-authored)_

## Resume Note

Completed. The accepted `north-star-v2-r1` authority, all Phase 1 consumers, final
evidence, and strict six-lens review are closed. Continue with
`v027-task-acceptance-v2`; do not reopen this task unless the North Star revision or one
of its exact acceptance bindings is superseded.

### Historical immutable review trail

The immutable `v027-north-star-v2-final-closure` review completed with
`REQUEST_CHANGES`: P0=0, P1=17, P2=6, total=23. Its packet SHA-256 is
`d6ff1f51d9a7a106bacff7722fd75c890dcae89ade17f38f6b033451f83a7d9d`; its SUMMARY
SHA-256 is `e0a01994f8f1a49829dcd7b67b7f643aa0d377edb07275560d5f98eb22507ee6`.
Every packet, specialist artifact, and summary remains immutable historical evidence.

- Final-closure root disposition: Init raw-byte classification/atomic materialization
  resolves five duplicate findings; packet subject-byte/identity/poll stability resolves
  four; reachable failed-axis `INCOMPLETE` summaries resolve four; one-byte-snapshot,
  repository-contained Review-to-Test transport resolves three; bounded streaming
  SessionStart output resolves three; non-empty durable owner evidence resolves one; and
  RFC 3339 specialist timestamps resolve three. The ledger remains `in_progress` and a
  new packet/review is required after all seven roots are GREEN.
- Final-closure review evidence: all six isolated workers completed against exact 51/51
  scope. Both axes were `FAIL`; exact packet-order union contained 23 findings, 44
  positive observations, and 11 limitations; `worktree_digest` remained honestly null.
- Final-closure repair RED/GREEN: the waiter mutation corpus first observed 77 pass and
  25 failures; Review-to-Test observed 9 pass and 8 failures; Init/owner drift and fenced
  anchor probes observed 0/3; the canonical admission/history seam observed 6 failures
  in a 12-test narrow set. After deletion-first repair, the merged North Star/review/Test
  corpus passed 153/153, transport passed 18/18, related Init/North Star contracts passed
  70/70, and full `npm test` passed 276/276 Node plus 36/36 Hook tests. A fresh immutable
  packet and six-lens review are still required; these green sensors do not complete the
  task.
- Closure-approved review: packet SHA-256
  `52371f040ec91c893fd7eefe03e809bec9671f26fb93843b11c5f2771bcb36dc`, SUMMARY
  SHA-256 `65e590ea8945e6b157f673d6d1a0e4bf0b283e20a742ffaefa7167ec934050ea`.
  Six isolated workers completed exact 51/51 scope; exact union is P0=0, P1=13, P2=5.
  Blocking roots are: one fence-aware canonical Markdown token stream; packet admission
  bound to current Git and byte observations with a required derived receipt; bounded
  validator stdout/stderr and same-byte legacy Hook consumption; stable ancestor/file
  identities for review reads and Init publication; and nonblocking bounded Test inputs.
  The session remains immutable `REQUEST_CHANGES` evidence.
- Closure-approved repair RED/GREEN: canonical authority/Hook added seven failing
  regressions; review admission added six failing provenance/receipt probes plus bounded
  runner and component-stability failures; Init/Test added preserved/published drift,
  strict receipt, and nonblocking descriptor failures. After the shared fixes,
  `npm test` passed 294/294 Node and 40/40 Hook tests; the task-scoped merged corpus
  passed 209/209; waiter passed 112/112; Init 37/37; transport 22/22. Nine changed
  workflow Skills passed Skill Creator validation. A fresh packet and six-lens review
  remain required before completion.
- Final-pass review: strict packet SHA-256
  `91c4ae5b6b1ade00291a0c7855c00d6d3aef2a78197ea5f41a43b47a54b6b3bb`,
  admission SHA-256 `c5b8dc0fed8bf6ad8a058b3503179dad79dc02c2857d87a1b47471b83ae03c97`,
  SUMMARY SHA-256 `e24fd9601a9eb2b193cfe4a5af820d50aa87a67281d98502220e4cdb4ac151c0`.
  Six workers completed exact scope; exact union is P0=0, P1=5, P2=6. Specification
  fidelity passed and engineering standards failed. The next repair pins admission and
  subject digests into every current artifact, makes receipt publication immutable and
  explicitly retained, routes every Hook fallback through one bounded stable snapshot,
  preserves the canonical Init diagnostics, and reconciles the v3 documentation line.
- Final-pass repair evidence: Hook root/project-brief stability added two RED regressions
  and passed 42/42 Hook plus 48/48 Node consumers; admission create-once passed 3/3,
  strict specialist/SUMMARY binding passed 15/15, waiter passed 128/128, and transport
  passed 23/23. Typed Init diagnostic and architecture authority each observed one RED
  before passing; the related suite passed 62/62. A new admitted session and six-lens
  review are still required before the task may complete.
- Final-pass residual repair: Hook snapshot regressions moved RED→GREEN and passed 42/42;
  admission create-once passed 3/3, strict artifact/SUMMARY binding passed 15/15,
  waiter passed 128/128, and transport passed 23/23. Typed Init diagnostic and strict
  architecture authority each had one RED before the related suite passed 62/62. The
  final merged package suite passed 312/312 Node and 42/42 Hook tests; a new strict
  admitted review session remains the only missing completion evidence.
- Approved-session review: packet SHA-256
  `2a2f83d85944a7b650a3e08e5ebe446766c1440a37eed4f44b3db0115d4ca543`,
  admission SHA-256 `f65adb69b8aaf9fc4797cec0e3636dc6f6726545cee020afe08bcbd89bfa46bd`,
  SUMMARY SHA-256 `2de37b188bc0c53a38d8e99b1fad0723d0a380c03070536eb47cafc6d537d920`.
  Six strict workers completed exact scope; union P0=0, P1=6, P2=3. Remaining roots
  are canonical decision/snapshot observations in admission, session/receipt publication
  identity and loss recovery, Deliver strict replay before archive, precise cleanup
  diagnostics, current-vs-legacy packet identity, and digest-only Init observations.
- Approved-session repair evidence: nine focused admission behaviors moved from RED to
  GREEN; the current North Star plus review-wait corpus passed 174/174; the three
  Review-to-Test integration failures moved RED to GREEN and the transport suite passed
  23/23; Init passed 38/38 while a 4 MiB non-North-Star snapshot retained only identity,
  size, and digest; and the Deliver strict-consumption contract passed in the 34/34
  contract/authoring bundle. The merged `npm test` passed 322/322 Node and 42/42 Hook
  tests, all ten changed Skills passed Skill Creator validation, the accepted North Star
  returned a resolving canonical report with decision/snapshot source observations,
  `git diff --check` passed, and dry-run packing produced 124 entries. The task remains
  `in_progress` until a new strict immutable six-lens session reviews these exact bytes.
- Complete-review evidence: strict packet SHA-256
  `98a905dfe24c0b2d8c6e5617277e9025ba5f619cfbdd12433e93ae6b97db1768`,
  admission SHA-256 `d8e7b235a8514faba1de2a806dff2b5fcb0a00c0e71412ce61ad81376ffa20b7`,
  subject digest `3c55c42add4cafb8ba877a952cc103be65fd5160160ad3179f3b7dfd8f9a123a`,
  and SUMMARY SHA-256 `613bb4b1b37d2a2dade60c72539f5bf56eaa84489e95e9311a34fdd6969eecef`.
  All six isolated workers completed the exact ordered 51-path scope. The exact union is
  P0=0, P1=3, P2=4; both axes failed and the verdict is `REQUEST_CHANGES`. The next root
  repair binds reference-only authority, producer/admission source observations and
  archived Change paths, rejects strict packets in every legacy mode, preserves
  unresolved existing-receipt cleanup warnings, and corrects the executable v4 example.
- Complete-review repair evidence: the oversized SessionStart regression moved RED to
  GREEN and the Hook suite passed 43/43. Admission v2, retained-v1/no-recreate, both
  legacy modes, archived/abandoned traces, Change/acceptance/decision/snapshot drift,
  post-validator source mutation, final rewalk, and existing-receipt cleanup were all
  covered by focused regressions; review-wait passed 162/162 and transport passed 23/23.
  The merged `npm test` passed 348/348 Node and 43/43 Hook tests. Ten changed Skills
  passed Skill Creator, project artifacts passed 5/5, `git diff --check` passed, and the
  dry-run package contained 124 entries. A new strict admission-v2 immutable review is
  still required; this implementation evidence does not complete the task by itself.

- Final-approved RED: North Star focused probes observed 1 pass and 2 failures for raw
  invalid UTF-8 and repository symlink escape; the Hook bridge observed 4/4 failures;
  Review-to-Test observed 3 pass and 2 failures for cross-subject reuse and unvalidated
  SUMMARY; and the complete waiter adversarial corpus observed 27 pass and 41 failures.
  Supplemental probes also reproduced missing worktree provenance, malformed HEAD and
  RFC 3339 values, a missing permanent specification lens, Windows drive-relative paths,
  and symlink loops before implementation.
- Final-approved GREEN: `npm test` passed 229/229 Node and 34/34 Hook tests. The focused
  North Star corpus passed 27/27, waiter plus transport passed 81/81, and the combined
  task corpus passed 133/133. All nine changed workflow Skills passed Skill Creator;
  current and template North Stars validated as accepted and unresearched; dry-run pack
  exited 0 with 124 entries; and `git diff --check` exited 0.
- Compatibility disposition: the immutable v3 review still reads as `REQUEST_CHANGES`
  with 17 findings under `--legacy-v3`. The two immutable v4 summaries now return typed
  `incomplete` because their own specialists recorded paths outside their frozen packet
  scopes; no historical artifact was relaxed or rewritten. The fresh re-review must use
  a new packet whose `diff_files` includes every authorized analyzed path.

- Postfix repair RED: the packet/transport/North-Star/contract Node corpus observed
  29 passing and 9 failing tests, while the focused Hook corpus observed 10 passing and
  1 failing test. The failures covered packet tampering and roster/scope/trace binding,
  exact summary union and derived verdicts, exact Review-to-Test transport, exhaustive
  publication-table parity, canonical unresearched bytes, packed installed-Init
  rejection, and bounded direct-entry stale checks.
- Postfix disposition: packet-bound v4 and exact summary aggregation resolve
  `review-spec-002`, `review-spec-003`, `review-code-001`, `review-code-002`,
  `review-tests-001`, `review-tests-002`, `review-design-001`, `review-design-002`, and
  `review-comments-001`; classifier parity resolves `review-spec-001`,
  `review-code-003`, `review-errors-001`, and `review-design-003`; canonical Init and
  bounded direct-entry tests resolve `review-code-004`, `review-tests-004`, and
  `review-tests-005`; exact Review-to-Test transport resolves `review-tests-003`.
- Postfix GREEN: the targeted Node corpus passed 60/60, package smoke passed 1/1,
  focused Hooks passed 11/11 with 19 deselected, and `npm test` passed 160/160 Node plus
  30/30 Hook tests. All nine changed Skills passed Skill Creator validation; current and
  template North Stars validated as `accepted` and `unresearched`; actual postfix v4
  and historical `--legacy-v3` sessions were read successfully; dry-run packing exited
  0 with 124 entries; and `git diff --check` exited 0.

- Six-lens repair RED: `node --test tests/north-star-v2.test.cjs
  tests/review-wait.test.cjs tests/v026-contract.test.cjs` observed 41 passing and 15
  failing tests. `pytest -q hooks/tests/test_v026_hooks.py -k 'session_context or
  javascript_equivalent or philosophy_contract'` observed 7 passing and 3 failing tests.
  The failures covered the exact reported categories; no preexisting failure was relabelled.
- Six-lens repair narrow GREEN: the same Node command passed 56/56 and the focused Hook
  command passed 10/10 with 19 deselected.
- Six-lens repair full GREEN: `npm test` passed 156/156 Node tests and 29/29 Hook tests.
- Nine changed workflow Skills passed Skill Creator `quick_validate.py`; `git diff --check`
  exited 0; current accepted North Star validation returned `valid: true`; and
  `npm pack --dry-run --json` exited 0 with 123 entries and no publication.

- Fresh review RED: `node --test tests/north-star-v2.test.cjs
  tests/project-artifacts.test.cjs` observed 18 passing and 8 failing tests after adding
  duplicate-field, unresolved-marker, accepted-binding, classifier, Research report,
  specification promotion, and snapshot probes. One initial helper-regex syntax defect
  was corrected before treating the remaining failures as product evidence.
- Fresh Hook RED: `pytest -q hooks/tests/test_v026_hooks.py -k 'session_context or
  philosophy_contract'` observed 6 passing and 2 failing tests for malformed publication
  fallback and 1.2 MB bounded startup context before the repair.
- Fresh narrow GREEN: the same Node command passed 26/26; the focused Hook command passed
  8/8 with 20 deselected.

- Original RED remains preserved: `node --test tests/north-star-v2.test.cjs
  tests/project-artifacts.test.cjs tests/v026-contract.test.cjs` exited 1 with 26 passing
  and 8 failing tests before the initial v2 implementation.
- Review-fix RED: `node --test tests/north-star-v2.test.cjs` exited 1 with 5 passing and
  10 failing tests before accepted/draft identity, exact heading ownership/order,
  causal-chain rows, legacy classification, stable decision/Research evidence, Change
  digest resolution, and review-packet trace separation were implemented.
- Hook RED: `pytest -q hooks/tests/test_v026_hooks.py -k 'session_context or
  philosophy_contract'` exited 1 with 3 passing and 3 failing tests before the live Hook
  and PHILOSOPHY contract consumed accepted v2. An earlier `python3 -m pytest` attempt
  failed because that interpreter has no pytest module; it is environment evidence, not
  product RED.
- GREEN narrow: `node --test tests/north-star-v2.test.cjs` passed 15/15; the focused Hook
  command passed 6/6 with 19 deselected.
- Final GREEN full: `npm test` passed 151/151 Node tests and 28/28 Hook tests after
  every Phase 1 repair.
- Structural sensor: current `.ultra/north-star.md` returned `valid: true`, status
  `accepted`, 6 FP ids, 1 NS id, 6 HC ids, resolving decision anchor, content SHA-256,
  Git blob digest, and byte-identical accepted snapshot; the packaged template returned
  `unresearched`, a streamed complete candidate returned `draft`, and actual HEAD v0.26
  authority returned `legacy_unadopted`.
- Skill Creator validation returned `Skill is valid!` for all eight changed Skills:
  Init, Research, Change, Plan, Status, Review, Test, and Deliver.
- Diff hygiene: `git diff --check` exited 0 after the repair set.
- Package inspection: `npm pack --dry-run --json` exited 0 with 123 entries and included
  the validator plus updated Hook assets; it performed no publication.
- The current Change records revision `north-star-v2-r1` and product digest
  `8a14955cb615179b2e1fc0a354eb02343de247d9`; its first Execution Packet remains pending
  and any earlier projection is explicitly invalidated.
- The pre-Change dirty baseline and legacy North Star remain preserved evidence and were
  not converted into red-first, review, or completion claims.

## Completion

- **Completed**: 2026-08-15T13:00:05+08:00
- **Evidence**: `.ultra/evidence/v027-north-star-v2/evidence.json`
- **Summary**: Established the accepted first-principles North Star v2 constitution,
  migrated the repository authority, wired every live consumer, closed all review
  findings, and passed the final merged and package-facing verification gates.

## Task Review

- Execution Packet state: `pre-v1-unavailable`; Execution Packet v1 is introduced by
  `v027-autonomy-packet`, so no digest is fabricated for this bootstrap task.
- Review session identity: `v027-north-star-v2-complete-final`
- Review packet digest: `5989fa0f1af1842a60d845b76e7f74a934be8cbdc2d6fc8c6b5f83c7db68385d`
- Admission digest: `0a57d27ad821252083634032ed6ef9cbda7b6975d0e71095346f38f71c239896`
- Subject digest: `d88fa254f9dc08b0170c6bc273b5ad61106fe7c7ebaa6c432fffd0aa4e076fe3`
- Summary ref: `.ultra/reviews/v027-north-star-v2-complete-final/SUMMARY.json`
- Summary digest: `13d5e25a8fe6b44cbddbe0d7ed542353097a257e3c06f96cf7fdf95bdacbe3db`
- Blocking finding IDs: none; all six workers completed, both axes passed, and P0–P3
  counts are zero.
- Resolution/disposition: every earlier immutable finding remains in its original review
  session with a resolving producer-side fix and regression; the final session rewrote
  or omitted none of them.
- Evidence refresh refs: `.ultra/evidence/v027-north-star-v2/evidence.json`, `npm test`
  (374 Node + 47 Hook), and the exact seven-file review corpus (289/289).
- Retention: retain the current strict review session until both aggregate Test and
  Deliver consume it. Premature loss requires a fresh Review and Test; never reconstruct
  the old receipt.
