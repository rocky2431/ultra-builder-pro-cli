# Ultra Builder Pro 3.0 implementation WIP

> **Status**: `local implementation and mechanical closeout complete — after the accepted Round-5 APPROVE (zero P0/P1) and the Codex-validated final integration repair (2026-08-17)`
> **Work package**: `ubp3-mode-b-2026-08-17`
> **Execution mode**: `durable work-package / local ZCode writer`
> **Reviewer**: `Codex root / read-only`
> **Review budget**: owner live-overrode this task's local budget to a total cap of 10 with target Round 5; the product's accepted default contract remains three rounds and is unchanged by this override

## Authority

- Accepted design: `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md`
- Accepted design SHA-256: `a91b563a48889909f80fc61f608a8198edec86c073a9b039ee57788b38483c1f`
- Owner grant: `.ultra/decisions/2026-08-17-ultra-builder-pro-3.0-mode-b.md`
- Owner grant SHA-256: `eeb86a7ca17214d2922959b4dec0396bbfe155042b3188ad43d663a44b1d029c`
- Base HEAD: `fc055021bcfeee3e8c6781b9545d267f5eb73cbd` (unchanged; nothing was committed)
- Existing dirty worktree: protected implementation input; every baseline entry is preserved below.

This WIP is progress and handoff, not a second North Star or grant. Ordinary WIP text never
enlarges authority.

## Accepted outcome

Deliver the accepted Ultra Builder Pro 3.0 design as one local work package: the
provider-neutral, file-first Ultra Core Protocol; explicit dual-mode grants
(session-local default, durable work-package by exact owner record); owner-selected
topology with a single-Agent default; bounded three-round review convergence with
P0/P1-only blocking; per-fact canonical authority with owner checkpoints; an
optional, honestly-unintegrated Graph/Loop boundary; and real-path acceptance
readiness with no undisclosed live-path fakes.

## Milestones

D0 canonical documentation convergence; D1 deletion-first loop closure; D2 cognitive
checkpoints and per-fact authority; D3 owner-selected topology and dual-mode grants;
D4 optional Graph/Loop boundary (documented, not integrated); D5 real-path acceptance
readiness — all delivered in the frozen subject below and verified by the evidence
sections.

## Review history (corrected record)

- **Codex Round 5 verdict**: `APPROVE` with zero P0/P1. The Ultra Builder Pro 3.0
  implementation and the T3-07 frozen report are accepted. What follows below is
  mechanical closeout, not Review Round 6; the reviewed subject is captured
  unchanged immediately after this correction.

- **Codex Round 1** (initial review): `REQUEST_CHANGES` with one P1 repair set of
  three roots — P1-A dual-mode grant/finalization contradictions, P1-B six-lens
  topology hard-wiring, P1-C brittle prose-lock tests. All three repaired as one set.
- **Codex Round 2** (first delta): `REQUEST_CHANGES`, P1-C only. The registry form
  was removed; the derivation form was not accepted as sufficient.
- **Owner-directed delta**: the inline-parsing form was also rejected; the entire
  prose-protocol apparatus was deleted, leaving a doc smoke plus the pre-existing
  runtime permission contracts.
- **Codex Round 3/4 review continuation and Round 4 verdict**: `REQUEST_CHANGES`
  for exactly one P1 — this T3-07 reporting/evidence root. There are no code or
  product-semantics P0/P1 blockers.
- **Owner override**: the owner live-overrode this task's local review budget to a
  total cap of 10 with target Round 5. This is a task-scoped override; the product's
  accepted default three-round convergence contract is unchanged.

## Frozen-subject inventory

Mechanically derived from current Git state at HEAD
`fc055021bcfeee3e8c6781b9545d267f5eb73cbd` via
`git status --short --untracked-files=all` (72 modified, 64 created, 0
tracked-deleted). The grant-time baseline recorded 109 status entries (72 modified
plus 37 untracked top-level entries; the untracked entries expand to 61 files, of
which this package deleted 2). Every baseline entry is preserved — nothing was
reset, reverted, or destructively overwritten; the package's own footprint is
enumerated separately.

### MODIFY — package-edited (32; already modified in the protected baseline)

- `.ultra-template/contexts/TEMPLATE.md`
- `.ultra/north-star.md`
- `.ultra/specs/architecture.md`
- `.ultra/specs/discovery.md`
- `.ultra/specs/product.md`
- `.ultra/specs/research-distillate.md`
- `.ultra/tasks.json`
- `adapters/_shared/runtime-assets.cjs`
- `adapters/_shared/tests/runtime-assets.test.cjs`
- `AGENTS.md`
- `CHANGELOG.md`
- `docs/ARCHITECTURE.md`
- `docs/ARTIFACT-AUTHORITY.md`
- `docs/DECISIONS.md`
- `docs/RUNTIME-COMPAT-MATRIX.md`
- `docs/WORKFLOW-LIFECYCLE.md`
- `README.md`
- `hooks/tests/test_v026_hooks.py`
- `skills/ultra-change/SKILL.md`
- `skills/ultra-change/references/change-contract.md`
- `skills/ultra-deliver/SKILL.md`
- `skills/ultra-dev/SKILL.md`
- `skills/ultra-plan/SKILL.md`
- `skills/ultra-research/SKILL.md`
- `skills/ultra-review/SKILL.md`
- `skills/ultra-review/scripts/review_wait.py`
- `skills/ultra-status/SKILL.md`
- `skills/ultra-test/SKILL.md`
- `tests/project-artifacts.test.cjs`
- `tests/review-wait.test.cjs`
- `tests/v026-adapters.test.cjs`
- `tests/v026-contract.test.cjs`

### MODIFY — protected baseline only (40; not touched by this package)

- `.ultra-template/north-star.md`
- `.ultra-template/tasks.json`
- `.ultra-template/test-report.json`
- `adapters/_shared/host-profile.cjs`
- `adapters/_shared/plugin-core.cjs`
- `bin/delegate-worker.cjs`
- `bin/delegate.cjs`
- `bin/install.js`
- `docs/PHILOSOPHY.md`
- `docs/PLUGIN-ISOLATION-CONTRACT.md`
- `docs/SKILL-AUTHORING.md`
- `hooks/_common.py`
- `hooks/compact_context.py`
- `hooks/mid_workflow_recall.py`
- `hooks/post_edit_guard.py`
- `hooks/README.md`
- `hooks/session_context.py`
- `package-lock.json`
- `package.json`
- `skills/ultra-delegate/references/delegation-contract.md`
- `skills/ultra-delegate/SKILL.md`
- `skills/ultra-grilling/references/reframing.md`
- `skills/ultra-grilling/SKILL.md`
- `skills/ultra-init/scripts/init_project.cjs`
- `skills/ultra-init/SKILL.md`
- `skills/ultra-research/references/04-product-strategy.md`
- `skills/ultra-research/references/21-features-scope.md`
- `skills/ultra-research/references/22-success-metrics.md`
- `skills/ultra-research/references/99-synthesis.md`
- `skills/ultra-research/references/wayfinding.md`
- `skills/ultra-review/references/spec.md`
- `skills/ultra-review/references/unified-schema.md`
- `skills/ultra-review/references/worker-packet.md`
- `skills/ultra-tdd/references/test-execution.md`
- `skills/ultra-tdd/SKILL.md`
- `skills/ultra-test/scripts/worktree_digest.cjs`
- `tests/delegate.test.cjs`
- `tests/install.test.cjs`
- `tests/package-smoke.test.cjs`
- `tests/skill-authoring.test.cjs`

### CREATE — package-created (5)

- `.ultra/changes/active/chg-ultra-3-0-mode-b/intent.md`
- `.ultra/contexts/task-v30-mode-b-local-implementation.md`
- `.ultra/decisions/2026-08-17-ultra-3-0-north-star-r2.md`
- `.ultra/research/2026-08-17-ultra-3-0-projection/north-star-v2-r2.accepted.md`
- `skills/ultra-change/references/execution-grant.md`

### CREATE — protected baseline, package-edited (8)

- `.ultra/changes/abandoned/chg-v027-lifecycle-closure/intent.md`
- `.ultra/contexts/task-v027-harness-loop-closure.md`
- `.ultra/evidence/v027-harness-loop-closure/evidence.json`
- `docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md`
- `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md`
- `docs/wip/ultra-builder-pro-3.0-implementation.md`
- `tests/north-star-v2.test.cjs`
- `tests/review-transport.test.cjs`

Notes: `.ultra/changes/abandoned/chg-v027-lifecycle-closure/intent.md` is the
baseline active-Change intent moved to abandoned with the exact `## Abandonment`
closure appended; `.ultra/evidence/v027-harness-loop-closure/evidence.json` carries
one re-encoded `context.acceptance_sha256` (disclosed in the task context Change
Log); the two v0.27 contract docs carry the owner-directed removal of the bootstrap
notices (incident doc restored byte-exact to its review-bound hash).

### CREATE — protected baseline only (51; not touched by this package)

- `.ultra/contexts/task-v027-adversarial-lifecycle.md`
- `.ultra/contexts/task-v027-autonomy-packet.md`
- `.ultra/contexts/task-v027-delegation-snapshot.md`
- `.ultra/contexts/task-v027-doctor-provenance.md`
- `.ultra/contexts/task-v027-host-adapters-hooks.md`
- `.ultra/contexts/task-v027-migration-acceptance.md`
- `.ultra/contexts/task-v027-north-star-v2.md`
- `.ultra/contexts/task-v027-task-acceptance-v2.md`
- `.ultra/decisions/2026-08-15-v027-north-star-r1.md`
- `.ultra/decisions/2026-08-16-v027-harness-loop-closure.md`
- `.ultra/decisions/2026-08-17-ultra-builder-pro-3.0-mode-b.md`
- `.ultra/evidence/v027-harness-loop-closure/external-review.json`
- `.ultra/evidence/v027-harness-loop-closure/verification.log`
- `.ultra/evidence/v027-north-star-v2/evidence.json`
- `.ultra/evidence/v027-north-star-v2/phase1-command-refresh.log`
- `.ultra/evidence/v027-task-acceptance-v2/evidence.json`
- `.ultra/evidence/v027-task-acceptance-v2/phase2-verification.log`
- `.ultra/research/2026-08-15-v027-north-star/00-problem-validation.md`
- `.ultra/research/2026-08-15-v027-north-star/04-product-strategy.md`
- `.ultra/research/2026-08-15-v027-north-star/05-assumptions-validation.md`
- `.ultra/research/2026-08-15-v027-north-star/22-success-metrics.md`
- `.ultra/research/2026-08-15-v027-north-star/41-quality-risks.md`
- `.ultra/research/2026-08-15-v027-north-star/99-synthesis.md`
- `.ultra/research/2026-08-15-v027-north-star/brief.md`
- `.ultra/research/2026-08-15-v027-north-star/north-star-v2-r1.accepted.md`
- `adapters/zcode.js`
- `docs/evals/adversarial-review-2026-08-14.md`
- `docs/evals/zcode-automation-2026-08-14.md`
- `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md`
- `hooks/adapters/zcode.py`
- `skills/ultra-plan/references/task-evidence-v2.md`
- `skills/ultra-plan/scripts/validate_task_evidence.cjs`
- `skills/ultra-research/references/north-star-v2.md`
- `skills/ultra-research/scripts/validate_north_star.cjs`
- `skills/ultra-review/references/adversarial-evaluation.md`
- `skills/ultra-test/scripts/validate_review_transport.cjs`
- `tests/adversarial-review-eval.test.cjs`
- `tests/evals/adversarial-review-seeds.json`
- `tests/evals/prompts/candidate-premise-lens.md`
- `tests/evals/prompts/current-six-lens-probe.md`
- `tests/evals/prompts/current-spec-lens.md`
- `tests/evals/read-only-permission.json`
- `tests/fixtures/adversarial-review/.ultra/changes/active/C-ADV/intent.md`
- `tests/fixtures/adversarial-review/.ultra/contexts/task-adv-confirmation.md`
- `tests/fixtures/adversarial-review/.ultra/north-star.md`
- `tests/fixtures/adversarial-review/.ultra/tasks.json`
- `tests/fixtures/adversarial-review/package.json`
- `tests/fixtures/adversarial-review/README.md`
- `tests/fixtures/adversarial-review/src/checkout.js`
- `tests/fixtures/adversarial-review/test/checkout.test.js`
- `tests/task-evidence-v2.test.cjs`

### DELETE — package deletions of untracked baseline files (2; absent from Git status)

- `skills/ultra-change/references/autonomy-envelope.md` (superseded by
  `execution-grant.md`)
- `docs/wip/v027-lifecycle-closure.md` (superseded progress WIP; durable facts
  remain in the abandonment record, decisions, and evidence)

## Verification evidence

### ZCode-run commands (repository root; latest freeze)

- `npm run test:node` exit 0 — 577/577.
- `npm run verify:release` exit 0 — 577 node tests, 89 hooks,
  `found 0 vulnerabilities`.
- `npm pack --dry-run --json` exit 0 — 126 entries, no superseded leftovers.
- Isolated fake-HOME `node bin/install.js --all --global --config-dir <tmp>` exit 0
  and `--doctor --json` exit 0 — overall healthy on claude, opencode, codex, kimi,
  grok, zcode.
- `git diff --check` exit 0.
- `node skills/ultra-research/scripts/validate_north_star.cjs .ultra/north-star.md`
  exit 0 — accepted, `north-star-v2-r2`, zero diagnostics.
- `rg` parser-pattern gate over the public-authority test body — exit 1 (no
  matches).
- Frozen-document `shasum -a 256` — design `a91b563a…383c1f`, grant
  `eeb86a7c…1d029c`, both byte-identical after every round.

ZCode also replicated Skill frontmatter checks with Python + PyYAML (8/8) in
earlier rounds; that replication is superseded by the official validator evidence
below and is no longer the claim of record.

### Codex Round-4 independent evidence (attributed; ZCode did not run these)

- North Star r2 validated as accepted.
- Node suite 577/577; Hooks 89/89.
- `npm audit` 0 vulnerabilities.
- `npm pack --dry-run` 126 entries.
- Fake-HOME Doctor 6/6 healthy.
- Official Skill Creator `quick_validate.py` valid 14/14 using
  `/opt/anaconda3/bin/python` (an earlier WIP claim that it was absent from this
  machine was false and is corrected here).
- Plugin Creator validator passed for the isolated generated Codex plugin.
- Frozen design, grant, and history hashes intact.
- `git diff --check` clean.

## Remaining fakes, test doubles, limitations, deferrals, not done

- **Live-path fakes**: none were introduced. Every fake or test double in the
  frozen subject is test-scoped: temporary repository fixtures in the Node suites,
  synthetic self-contained North Stars inside review-transport/review-wait
  fixtures, the seeded adversarial-review fixture with its five planted defect
  classes, install/Doctor sandboxes under temporary config-dirs and a fake HOME,
  and the `.ultra/reviews/*` local-only review-session history. None ships on a
  product live path.
- **Limitations**: released 0.26.1 changelog entries remain immutable dated
  history; superseded vocabulary (`Execution Packet`, `Autonomy Envelope`)
  survives only in explicitly labelled historical naming; the accepted 3.0 design
  document is repository development authority and is not part of the npm tarball.
- **Compatibility/release deferrals**: package version remains `0.26.2`; the 3.0
  release versioning and compatibility strategy are deferred and no release effect
  is authorized or performed.
- **Not done**: Graph/Loop control-plane integration (boundary documented, no
  consumer, no scaffolding — by design); and the owner-deferred release,
  delivery, and finalization effects for the still-active Change
  `chg-ultra-3-0-mode-b` (no archive, no `delivery.md`, no version decision, no
  commit, push, tag, publish, install, or deploy — each remains a separate owner
  decision).

## No external effects

No commit, push, tag, publication, real installation, deployment, credential,
purchase, or new paid effect has occurred. No agent was spawned or delegated, and
the changing local `ultra-review` was never used to self-approve this work.
