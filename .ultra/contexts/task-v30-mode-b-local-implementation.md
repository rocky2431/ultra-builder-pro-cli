# Task v30-mode-b-local-implementation: Implement Ultra Builder Pro 3.0 (Mode B)

## Context

**What**: Project the accepted 3.0 forward design into the repository as one
coherent local work package — canonical documentation convergence (D0),
deletion-first loop closure (D1), cognitive checkpoints and per-fact authority
(D2), owner-selected topology and dual-mode grants (D3), the honest optional
Graph/Loop boundary (D4), and real-path acceptance readiness (D5).

**Why**: The owner accepted `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md` (SHA-256
`a91b563a48889909f80fc61f608a8198edec86c073a9b039ee57788b38483c1f`) and issued
the Mode B durable grant `ubp3-mode-b-2026-08-17`
(`.ultra/decisions/2026-08-17-ultra-builder-pro-3.0-mode-b.md`): ZCode implements
locally across sessions, Codex reviews read-only after the freeze, at most one
initial plus two P0/P1 delta reviews, and no release effects.

**Constraints**:

- The accepted design and the owner grant are byte-frozen inputs; never edit them.
- Preserve all unrelated dirty-worktree changes; never reset, revert, or overwrite.
- No commit, push, tag, publish, release, deploy, real-HOME/global install,
  credential, production, purchase, or new paid effect.
- No daemon, database, MCP, Graph engine, hidden executor, or semantic state
  machine; no dead integration scaffolding.
- Do not use the changing local `ultra-review` to self-approve this repair.
- Do not spawn or delegate to other Agents.
- Ignore superseded v0.27 task routes (including `v027-autonomy-packet`) where
  they conflict with the grant.

## Implementation

**Layers touched**: `.ultra` canonical projections (north-star r2, specs,
ledger, change lifecycle), public docs, the fourteen Skills and their references,
the five Hooks (only where reproduced behavior requires it), runtime assets,
adapters where the policy surface changes, CLI scripts under `skills/*/scripts`,
and the test suite (behavior/permission/effect regressions replacing brittle
prose locks).

**Pattern**: deletion-first (remove superseded mechanisms before adding), TDD for
new behavior or reproduced bugs, one frozen final diff with exact evidence.

## Planned Path Inventory

`MODIFY`/`CREATE` (areas; exact paths are enumerated in the frozen report):

- `.ultra/north-star.md`, `.ultra/decisions/2026-08-17-ultra-3-0-north-star-r2.md`,
  `.ultra/research/2026-08-17-ultra-3-0-projection/`, `.ultra/tasks.json`,
  `.ultra/changes/**`, `.ultra/specs/*.md`, this context file
- `docs/PHILOSOPHY.md`, `docs/ARCHITECTURE.md`, `docs/ARTIFACT-AUTHORITY.md`,
  `docs/WORKFLOW-LIFECYCLE.md`, `docs/DECISIONS.md`, `README.md`, `AGENTS.md`,
  `CHANGELOG.md`, `docs/wip/ultra-builder-pro-3.0-implementation.md`
- `skills/*/SKILL.md` and `skills/*/references/**` where 3.0 changes the contract
- `skills/ultra-review/scripts/review_wait.py`,
  `skills/ultra-plan/scripts/validate_task_evidence.cjs`
- `adapters/_shared/runtime-assets.cjs`, `adapters/_shared/plugin-core.cjs`
- `tests/*.test.cjs`

`CREATE` (closeout evidence):

- `.ultra/evidence/v30-mode-b-local-implementation/verification.log`
- `.ultra/evidence/v30-mode-b-local-implementation/external-review.json`
- `.ultra/evidence/v30-mode-b-local-implementation/evidence.json`

`DELETE`: files whose only consumer was the superseded v0.27 route, after their
live consumers are updated:
`skills/ultra-change/references/autonomy-envelope.md`,
`docs/wip/v027-lifecycle-closure.md`.

## Acceptance Criteria

**Change Acceptance IDs**: [`AC3-01`, `AC3-02`, `AC3-03`, `AC3-04`, `AC3-05`, `AC3-06`, `AC3-07`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| T3-01 | North Star r2 validates as accepted and binds the 3.0 decision/snapshot; v0.27 change closed by exact abandonment | `command` | validator output with exit code |
| T3-02 | Review contracts terminate: three-round cap, P0/P1-only blocking, initial/delta separation, self-hosting external boundary | `inspection` + `command` | skill source observation plus regression suite |
| T3-03 | Checkpoint semantics and per-fact authority matrix canonical; behavior tests replace prose locks | `inspection` + `command` | doc observation plus migrated suite |
| T3-04 | Dual-mode grant contract explicit; nothing infers activation from files | `inspection` + `command` | contract observation plus hook/activation regressions |
| T3-05 | Graph/Loop boundary documented; no scaffolding added | `inspection` | docs and dependency inspection |
| T3-06 | Full package tests, release verification, pack dry-run, isolated install/Doctor pass | `command` | exact commands, cwd, exit codes |
| T3-07 | Frozen report enumerates paths, causes, evidence, fakes, limitations, not-done; no external effects | `owner-judgment` | the frozen WIP and final report |

## Narrow Verification

- `node skills/ultra-research/scripts/validate_north_star.cjs .ultra/north-star.md`
- `npm run test:node` and `npm run test:hooks`
- `npm run verify:release`
- `npm pack --dry-run --json`
- `node bin/install.js --all --global --doctor --json` inside an isolated
  temporary HOME/config
- Skill Creator validation for every changed Skill

## Trace

**Source**: `.ultra/north-star.md#north-star-outcomes`

**First principles**: [`FP-1`, `FP-2`, `FP-3`, `FP-4`, `FP-5`, `FP-6`, `FP-7`]

**Serves**: [`NS-01`, `NS-02`, `NS-03`, `NS-04`, `NS-05`]

**Causal contribution**: The 3.0 projection keeps meaning and topology with the
owner and the model, mechanizes only facts, permissions, effects, and recovery,
and terminates review loops — the direct instrumentation of every accepted North
Star outcome.

**Hard constraints**: [`HC-1`, `HC-2`, `HC-3`, `HC-4`, `HC-5`, `HC-6`, `HC-7`, `HC-8`]

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|------|----------------|--------|---------------|--------|
| 2026-08-17 | — | Initial task contract under the Mode B grant | — | Accepted 3.0 forward design and grant |
| 2026-08-17 | closeout | Added the closeout evidence Planned Path Inventory entries; filled Completion, Task Review, and the closing Resume Note | — | Codex Round-5 APPROVE mechanical closeout after subject capture |
| 2026-08-17 | correction | Refreshed Resume/Task Review/Completion, the finalized verification log, receipt, and evidence bindings to the final captured subject after the Codex-validated integration repair | — | Final mechanical closeout refresh (not Review Round 6) |

## Open Questions

- None blocking. Release versioning is explicitly deferred (see Change intent).

## Resume Note

Task complete and closed under the accepted Mode B grant: Codex Round 5 returned
APPROVE with zero P0/P1, the Codex-validated final integration repair landed
(one-block frontier-assertion update in `tests/v026-contract.test.cjs`), and the
final product subject was captured (HEAD
`fc055021bcfeee3e8c6781b9545d267f5eb73cbd`, worktree digest
`a2025b71fc61fe5a8d519ef5ddeb6d4b5d7942bd6060fad528692e63dbc64285`), the external
receipt and canonical v2 evidence validate against that subject, and the ledger
row is `completed`. Next reader: the active Change `chg-ultra-3-0-mode-b` awaits
the owner's separate delivery/finalization decision; nothing further is
authorized from this task. This note is navigational context only; it cannot
override the grant, acceptance, scope, or any review verdict.

## Task Review

- Execution Grant state: `durable work-package` `ubp3-mode-b-2026-08-17` (its
  recorded limitation: the grant covers exactly this local package and no external
  effect; terminal rule satisfied by the Codex Round-5 acceptance).
- Review mode: `external-manual` — the frozen implementation subject was reviewed
  by the owner-designated read-only reviewer across Rounds 1–5; the changing local
  `ultra-review` never approved this work.
- Summary ref: `.ultra/evidence/v30-mode-b-local-implementation/external-review.json`
  (Codex root APPROVE, zero P0/P1, final integration repair validated read-only),
  bound by SHA-256
  `8c583d3e9bad9bfac40403c417f26f7cca9db0ad79fea45de42e49d13100e3a6` in the
  canonical evidence record against the final captured subject.
- Blocking findings: none — the Round-5 APPROVE carried zero P0/P1; P2/P3
  observations were reported without automatic repair throughout.
- Retention: retain the exact external-manual receipt bytes and the canonical v2
  evidence record; both are reconstructable observations bound by SHA-256, never
  semantic authority and never a strict SUMMARY/ADMISSION substitute.

## Completion

Completed 2026-08-17 under the accepted Mode B grant. D0–D5 delivered and frozen;
Codex Rounds 1–5 closed with APPROVE and zero P0/P1 (the owner live-overrode this
task's local review budget to total cap 10 targeting Round 5; the product default
three-round contract is unchanged). The final mechanical integration repair
(replacing the stale frontier assertions with completed/zero-in-progress, Codex
read-only validated PASS: focused 1/1, independent 577/577) landed before the
final subject capture. Final verification: North Star stdin validator
accepted; focused grant/topology/P1-C regressions 4/4; `npm run verify:release`
exit 0 (577/577 node, 89/89 hooks, 0 vulnerabilities); `npm pack --dry-run` 126
entries with no superseded files; isolated fake-HOME install and Doctor 6/6
healthy; official Skill Creator `quick_validate.py` 14/14 and the Plugin Creator
validator passed via `/opt/anaconda3/bin/python`; worktree digest captured twice
with an identical HEAD/intent/diff tuple; frozen design/grant SHAs intact;
`git diff --check` clean. Canonical evidence:
`.ultra/evidence/v30-mode-b-local-implementation/evidence.json` (validator-clean,
external-manual branch, projection retained). No external effect occurred.
