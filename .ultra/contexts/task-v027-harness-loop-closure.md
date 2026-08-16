# Task v027-harness-loop-closure: Close the harness review loop and pending-activation incident

## Context

**What**: Close the Phase 2 harness-loop incident — terminal `APPROVE` with retained
P2/P3, P0/P1-only repair routing with one delta, budget stops without semantic
verdicts, navigational Resume Notes, direct-parent packet history, the self-hosting
review boundary, and pending-frontier tasks that Hooks never activate.

**Why**: A self-hosting strict-review recurrence ran roughly 25 hours because the
termination, budget, and activation rules in the workflow contracts were open-ended;
the owner accepted `docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md` as the
remediation contract. The incident history, including the persisted Resume demand
for one more finding-free Review, is recorded in that contract and the WIP; it is
not restated here as a completion rule.

**Constraints**:

- Section 10.0 of the accepted incident contract is the hard maximum path allowlist;
  any path outside it is scope drift and must stop.
- The accepted incident contract bytes must not change.
- Review is external and manual; the local changing `ultra-review` must not approve
  this repair.
- Do not reopen Phase 2, repair historical P2/P3, or start Phase 3.

## Implementation

**Layers touched**: Hook task selection and Resume injection, the review Skill
contracts (terminal/budget/selection/history/self-hosting), Dev/Test/Deliver/Status
routing text, task-evidence blocking dispositions, canonical authority and lifecycle
docs, the task graph, and the regression suites that pin all of it.

**Pattern**: smallest authoritative-surface edits with red-first contract tests, in
the established source-assertion plus subprocess-fixture style of this repository.

## Planned Path Inventory

The exact allowlist is section 10.0 of
`docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md`. Its load-bearing entries:

`MODIFY`:

- `.ultra/tasks.json`
- `.ultra/changes/active/chg-v027-lifecycle-closure/intent.md`
- `docs/wip/v027-lifecycle-closure.md`
- `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md`
- `docs/ARTIFACT-AUTHORITY.md`
- `docs/WORKFLOW-LIFECYCLE.md`
- `.ultra-template/contexts/TEMPLATE.md`
- `skills/ultra-review/SKILL.md`
- `skills/ultra-review/references/unified-schema.md`
- `skills/ultra-review/references/worker-packet.md`
- `skills/ultra-dev/SKILL.md`
- `skills/ultra-test/SKILL.md`
- `skills/ultra-deliver/SKILL.md`
- `skills/ultra-status/SKILL.md`
- `skills/ultra-plan/references/task-evidence-v2.md`
- `hooks/README.md`
- `hooks/_common.py`
- `hooks/session_context.py`
- `hooks/compact_context.py`
- `skills/ultra-review/scripts/review_wait.py` (conditional; justified by the
  direct-parent machine RED)
- `tests/v026-contract.test.cjs`
- `tests/review-transport.test.cjs`
- `tests/project-artifacts.test.cjs`
- `tests/task-evidence-v2.test.cjs`
- `hooks/tests/test_v026_hooks.py`

`CREATE`:

- `.ultra/decisions/2026-08-16-v027-harness-loop-closure.md`
- `.ultra/contexts/task-v027-harness-loop-closure.md`
- `.ultra/evidence/v027-harness-loop-closure/verification.log`
- `.ultra/evidence/v027-harness-loop-closure/evidence.json` (closeout only)
- `.ultra/evidence/v027-harness-loop-closure/external-review.json`

The `external-review.json` entry was reconciled on 2026-08-16: the accepted H0
bootstrap decision names this exact receipt path as the required external-manual
review provenance, so it belongs in this inventory.

Any later addition, removal, or rename beyond that allowlist is plan-critical scope
drift: stop and return a scope-change proposal to the owner.

## Public Seams

- `hooks/_common.py::current_task_selection(root, trusted_task_id=None)` — unique
  `in_progress` or invocation-local trusted id only; pending is never auto-activated.
- The Resume navigation limitation injected by `session_context.py` and
  `compact_context.py`.
- `review_wait.py` packet admission: at most one direct parent review session, carried
  only through the exact `review_history` object.
- The task-review terminal route in `unified-schema.md`, `ultra-review/SKILL.md`, and
  `ultra-dev/SKILL.md`.

## Narrow Verification

- `node --test --test-name-pattern='task review APPROVE|Resume Note cannot override|one blocking delta|self-hosting review|review packet parent|Harness Loop Closure' tests/v026-contract.test.cjs tests/review-transport.test.cjs`
- `PYTHONDONTWRITEBYTECODE=1 pytest -q -p no:cacheprovider -k 'resume_navigation or compact_resume or review_route' hooks/tests/test_v026_hooks.py`
- `node --test --test-reporter=dot tests/task-evidence-v2.test.cjs tests/project-artifacts.test.cjs tests/v026-contract.test.cjs tests/skill-authoring.test.cjs tests/review-transport.test.cjs tests/package-smoke.test.cjs`
- `PYTHONDONTWRITEBYTECODE=1 pytest -q -p no:cacheprovider hooks/tests/test_v026_hooks.py`
- `git diff --check`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC-02`, `AC-05`, `AC-09`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| HL-01 | `APPROVE` is terminal with no P0/P1 even when P2/P3 findings are retained | `command` + `inspection` | route regression command receipt and schema/Skill source observation |
| HL-02 | zero-finding is not a completion condition in any task/Review/Resume consumer | `command` + `inspection` | negative sweep command receipt and live-consumer source observation |
| HL-03 | `REQUEST_CHANGES` routes only exact current P0/P1 or owner-promoted blockers | `command` + `inspection` | severity fixture receipt and consumer source observation |
| HL-04 | One initial plus at most one delta review per task; exhaustion returns an owner checkpoint | `command` | incident replay fixture receipt |
| HL-05 | Resource budget stops execution without pass/fail/accept verdicts | `command` + `inspection` | budget fixture receipt and diagnostic source observation |
| HL-06 | Resume Note cannot override scope, budget, acceptance, or a Review verdict | `command` + `inspection` | Hook/session/compact fixture receipts |
| HL-07 | None of the five Hooks can launch or select a Review/public workflow | `command` + `inspection` | registered Hook map and subprocess outputs |
| HL-08 | Self-hosting review pins the owner-accepted spec and a stable external reviewer boundary | `command` + `owner-judgment` | subject-path fixture receipt and the durable owner record |
| HL-09 | A delta packet carries at most one direct parent and only unresolved current blockers | `command` | packet/schema fixture receipt |
| HL-10 | Delta reviews select only affected lenses; aggregate reviews may default to all six | `command` + `inspection` | worker selection fixtures and Skill source observation |
| HL-11 | An out-of-PPI finding stops at a scope-change proposal without an edit | `command` | temp repo mutation fixture receipt |
| HL-12 | Prescribed closeout facts do not self-invalidate; implementation changes still go stale | `command` | positive/negative freshness fixture receipts |
| HL-13 | The remaining task graph is explicit, acyclic, and free of backward dependencies | `command` | task graph validator receipt |
| HL-14 | H0 adds no MCP, database, daemon, semantic registry, or persistent workflow state | `inspection` | final diff observation |
| HL-15 | The current primary path ends after one review or one repair plus delta | `command` + `inspection` | end-to-end incident replay receipt |
| HL-16 | The owner accepted the exact contract digest, path scope, and 4h budget | `owner-judgment` | durable owner record disposition |
| HL-17 | Pending frontier is not active work; with no live task, Hooks are task- and progress-silent | `command` + `inspection` | no-live-task Hook matrix and ledger/progress readback |
| HL-18 | `ultra-task-evidence-v2` accepts a generic discriminated external-manual review branch binding a real external receipt by exact bytes/digest/identity, with typed rejection for missing, unsafe, drifted, mismatched, or substituted receipts; strict-v4 evidence stays byte-compatible | `command` | validator structural + `--verify-external-receipt` fixtures in `tests/task-evidence-v2.test.cjs` and false-green mutation receipts |

## Definition of Drift

- Reopening Phase 2, repairing its historical P2/P3 findings, or starting Phase 3.
- Turning review observations, counters, or mutation counts into semantic gates.
- Adding a workflow launcher, persistent activation state, or a second review loop to
  any Hook.

## Trace

**Source**: `.ultra/specs/architecture.md#hook-boundary`

**First principles**: [`FP-1`, `FP-2`, `FP-3`, `FP-4`]

**Serves**: [`NS-01`]

**Causal contribution**: Restore durable file authority with narrow field semantics
and bounded review budgets so autonomous execution stays recoverable and
owner-gated instead of self-amplifying.

**Hard constraints**: [`HC-2`, `HC-3`, `HC-4`]

**Decisions**: `.ultra/decisions/2026-08-16-v027-harness-loop-closure.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|------|----------------|--------|---------------|--------|
| 2026-08-16 | — | Initial task contract | — | Accepted H0 incident remediation |
| 2026-08-17 | correction | Reconciled the Planned Path Inventory with the owner-authorized `external-review.json` receipt (named by the 2026-08-16 bootstrap decision) and recorded this entry | — | The closeout inventory omitted the receipt path, so the evidence-directory audit failed on a file the decision already authorized |
| 2026-08-17 | correction | The canonical evidence record's `context.acceptance_sha256` was re-encoded to the repository convention (Acceptance-section bytes excluding the separator newline before the next heading) | — | The H0 publisher hashed the section with one extra trailing newline; both sibling v2 records, the contract reference, and the audit test use the excluding boundary. Acceptance content is unchanged; only the digest encoding is corrected |

## Open Questions

- _(none; H0 waits on external manual review, not on new decisions)_

## Resume Note

The awaiting external manual review gate closed with the read-only Codex root
reviewer's `approve` (zero findings); H0 is completed and its canonical evidence and
external receipt are published under `.ultra/evidence/v027-harness-loop-closure/`.
Phase 3 (`v027-autonomy-packet`) remains pending and requires its own owner
invocation and Execution Packet work; resume there, not here.

## Completion

Completed 2026-08-16. HL-01 through HL-18 are dispositioned in
`.ultra/evidence/v027-harness-loop-closure/evidence.json`
(`ultra-task-evidence-v2`, external-manual branch, receipt SHA-256
`e6bd86ee319e4be91cc6addf58f02c42b8a2dac0a02096e6a9d8db718793d138`); the full
receipt trail is the frozen verification log (final SHA-256
`0080efba64bdc7c903dcfcbb92c3c3d133d42ef67f8e23ad86fb9f650f534c49`).

## Task Review

- Execution Packet state/digest/limitation: `pre-v1-unavailable`, digest null —
  the one-time bootstrap grant in
  `.ultra/decisions/2026-08-16-v027-harness-loop-closure.md` (final bytes SHA-256
  `86ff5ba7d955d3894fb0b5f12d88dca3edb7c855d9254d00db71603740670b34`) is the
  recorded boundary, carried budget `max_zcode_active_time: 4h` and stops
  authorizing new work.
- Review session identity and summary digest: external-manual branch; receipt
  `.ultra/evidence/v027-harness-loop-closure/external-review.json`, SHA-256
  `e6bd86ee319e4be91cc6addf58f02c42b8a2dac0a02096e6a9d8db718793d138`, reviewer
  Codex root (read-only), verdict `approve`, findings none. No strict session was
  created or needed.
- Blocking findings with resolution/disposition/evidence refresh refs: none — the
  approved review carried zero findings.
- Retention: retain the exact external receipt bytes; it is a reconstructable
  observation, never semantic authority and never a strict SUMMARY/ADMISSION
  substitute.
