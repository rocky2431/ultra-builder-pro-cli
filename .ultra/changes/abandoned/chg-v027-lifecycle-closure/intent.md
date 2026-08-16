# Change chg-v027-lifecycle-closure: Close the v0.27 autonomous lifecycle

> **Status**: accepted  
> **Profile**: major  
> **Profile rationale**: This Change revises canonical project schemas, lifecycle
> semantics, autonomy authorization, adversarial review, delegated execution, six Host
> installation, Doctor provenance, and real-path acceptance in one release boundary.  
> **Risk flags**: authorization semantics, delegated source writes, credential and secret
> boundaries, provider spend, real-HOME installation, six-Host activation, package supply
> chain, canonical-artifact migration

## Outcome

An owner can establish a falsifiable first-principles North Star, approve one stable
Execution Packet, let a supported Host autonomously perform bounded local coding through
the next owner gate, obtain lifecycle-wide independent adversarial review, delegate a
dirty but secret-safe snapshot to another CLI, and recover or continue the complete
change on Claude Code, Codex, OpenCode, Kimi Code, Grok Build, or ZCode using canonical
files plus Git.

## Acceptance

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| AC-01 | North Star v2 is produced by Research, owner-accepted, revisioned, falsifiable, and traceable through Change, task, review, Test, and Deliver without duplicated prose. | inspection + owner-judgment | schema/consumer tests, migrated repository artifact, exact owner acceptance source |
| AC-02 | The human/model/mechanical boundary and each owner gate are consistent across Skills, Hooks, docs, and runtime behavior. | inspection | contract tests plus source-backed six-Host comparison |
| AC-03 | A plan-only grant produces a deterministic stable Execution Packet; exact approval enables only named workflows, and plan-critical deltas invalidate it while normal execution evidence does not. | command + owner-judgment | regression tests, packet/delta fixtures, raw owner activation record |
| AC-04 | `.ultra/tasks.json` is sole task-status authority; Acceptance v2 supports command, inspection, owner-judgment, and external-observation evidence without semantic numeric gates. | command + inspection | migration and schema tests, live consumer inspection |
| AC-05 | Six independent review lenses challenge Research, Change, Plan, every task, Test, and Deliver; all findings and disagreements survive into canonical Test evidence. | command + inspection | adversarial evals, immutable worker packets, fresh aggregate Test report |
| AC-06 | Delegation Snapshot v1 safely captures dirty tracked work and explicit untracked files, excludes secrets/symlinks/ignored paths, detects races, brokers exact checks, and returns digest-bound terminal results without auto-merge. | command | positive and negative delegate regression suite plus bounded live drills |
| AC-07 | All six Host adapters use their native plugin/Hook/delegation capabilities, expose precise limitations, and support ZCode bidirectional delegation when providers are ready. | command + external-observation | isolated installs, Host capability probes, provider run receipts |
| AC-08 | Doctor separately reports installation integrity, expected candidate parity, and activation/provider readiness for git-worktree and npm-tarball provenance. | command | mutation/missing/orphan/wrong-source/unknown-identity/registry tests and real Doctor JSON |
| AC-09 | Supersession, packet invalidation, interruption, compaction, budget exhaustion, cancellation, abandonment, and derived-artifact GC all have reachable and honest recovery paths. | command + inspection | lifecycle fixtures and cross-session/Host drills |
| AC-10 | One exact v0.27 candidate passes release gates, validators, isolated consumer tests, and 6/6 real-Host candidate parity without performing an unauthorized release effect. | command + external-observation | exact current command output, tarball identity, six Doctor results |

## Non-goals

- No database, MCP server, daemon, semantic state machine, generated semantic mirror,
  persistent stage marker, or new `ultra-continue` public Skill.
- No mechanical judgment of first-principle truth, product strategy, semantic quality,
  finding disposition, risk acceptance, or final expression.
- No lowest-common-denominator emulation of native Host features.
- No automatic merge of delegated changes and no silent inheritance of activation by a
  fresh session.
- No commit, push, tag, npm publication, GitHub Release, or production deployment under
  this Change without a separate owner authorization.

## Public Seams

- `.ultra/north-star.md`, active Change intent, `.ultra/tasks.json`, task contexts,
  `.ultra/test-report.json`, and archived delivery history
- the eight user workflows, five model disciplines, and read-only Status router
- Host-native Skill/plugin/Hook surfaces for six supported CLIs
- `ubp delegate run|status|cancel` and non-interactive Host profiles
- `node bin/install.js --<host>|--all --global --doctor --json`
- packaged init template and exact candidate tarball

## Reconciliation

### Promised and Missing

AC-03 through AC-10 remain promised and incomplete. Their owning tasks stay pending;
Phase 1 evidence must not be promoted into autonomy, lifecycle review, delegation,
six-Host parity, Doctor, migration, or release acceptance.

#### Harness loop incident (2026-08-16)

Phase 2's strict self-review ran an unbounded recurrence: `APPROVE` with retained P2
findings did not close the task, a mutable Resume Note persisted "run one more
zero-finding review" across sessions, and Hooks attributed edits to the still-pending
frontier task. The owner accepted
`docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md`
(SHA-256 `c39347ca3553175aec06629f710a8541db8a12445e5a17dd90e62e6b75bc2acb`) and its
one-time bootstrap grant: task `v027-harness-loop-closure` (H0), ZCode sole writer,
`max_zcode_active_time: 4h`, one initial plus at most one delta external manual
review, read-only Codex root reviewer, no commit/push/tag/publish/install/deploy, and
scope drift or budget exhaustion returning to the owner. H0 sits between
`v027-task-acceptance-v2` and `v027-autonomy-packet` in the ledger; Phase 3 stays
`pending` until the owner accepts H0's external manual review. Phase 2 evidence and
review receipts are preserved unchanged as incident history.

### Built and Unpromised

#### Preexisting and unbound

Before this Change created any source or lifecycle file, HEAD was
`fc055021bcfeee3e8c6781b9545d267f5eb73cbd` and `git status --short` contained 58
entries. Their status-list digest was
`fd041c7ab675b6bb23f2cf83d12fe706fa990d83fe35fcf1e85479f98e875624`; the tracked
binary-diff digest was
`611bebbb33fd0bc86b4cf67180caf3c8cd5f1143caf1589078cce9e98cbb0338`.

Every one of those entries is classified as `preexisting/unbound baseline`. It may be
reconciled, retained, corrected, or replaced by an authorized v0.27 task, but it is not
red-first evidence, a passed review, or proof that any acceptance row above is complete.
Untracked directories in the condensed status remain subject to exact file inventory
and secret inspection before packaging or delegation.

#### Recovery point

The pre-Change source tree was copied, before new file edits, to:

`/Users/rocky243/.codex/backups/ultra-builder-pro-cli-v027-phase0-7Bi7MhBA`

The recovery copy excludes `.git/` and `node_modules/`. Recovery is by explicit
file-by-file comparison; it must never be used to destructively overwrite the repository.

### Contradictory

None currently. New evidence that contradicts the North Star, accepted scope, owner
boundary, or recovery contract returns this Change to reconciliation before planning or
automatic continuation.

## Research Disposition

- Disposition: none
- Exit status: satisfied
- Question: Which existing v0.26/v0.27-draft claims are accepted first principles,
  which are implementation preferences, and what evidence can falsify them?
- Selected lenses: `00-problem-validation`, `04-product-strategy`,
  `05-assumptions-validation`, `22-success-metrics`, `41-quality-risks`, and
  `99-synthesis` under `.ultra/research/2026-08-15-v027-north-star/`.
- Existing evidence: `.ultra/project-brief.md`, maintained specs and docs, repository and
  Phase 0 Git/runtime observations, the accepted construction plan, and the previously
  gathered CC/Kimi/Grok/ZCode analyses. No new external claim was invented.
- Required exit evidence: satisfied by the six selected reports plus `brief.md`, linked
  `99-synthesis.md`, accepted `.ultra/north-star.md` revision `north-star-v2-r1`, stable
  owner decision `.ultra/decisions/2026-08-15-v027-north-star-r1.md`, resolving
  `FP-1` through `FP-6`, `NS-01`, `HC-1` through `HC-6`, and the reconciled digest above.
- Rationale: the bounded run now distinguishes observations, owner decisions, model
  inferences, and unknown delivery evidence. Later implementation and Host readiness
  remain separate acceptance tasks, not backfilled Research proof.

## North Star Trace

- First principles: `FP-1`, `FP-2`, `FP-3`, `FP-4`, `FP-5`, `FP-6`
- Serves: `NS-01`
- Touches: `HC-1`, `HC-2`, `HC-3`, `HC-4`, `HC-5`, `HC-6`
- Evidence: `.ultra/research/2026-08-15-v027-north-star/99-synthesis.md` maps the
  accepted file-first, bounded-autonomy, adversarial-review, native-adaptation, and
  least-authority premises to the recoverable six-Host coding outcome.
- North Star revision: `north-star-v2-r1`
- North Star digest: `8a14955cb615179b2e1fc0a354eb02343de247d9`
- Contradictions or refinements: none for r1; later contradictory evidence returns to
  Research and requires a new owner decision rather than a silent trace rewrite.
- Supersession observation: previous v0.26 evidence is preserved honestly; its old
  revision and prose are not relabeled as r1 evidence.
- Execution Packet observation: `pending`; the earlier plan projection is invalidated by
  this accepted plan-critical trace correction and task `v027-autonomy-packet` must
  generate the first fingerprint from the reconciled authority.

## Autonomy Envelope

- Grant: `manual`.
- Allowed workflows: `research`, `plan`, `dev`, `test`, and `deliver-reconcile` remain
  available only through an explicit owner invocation while the grant is `manual`; this
  stored list does not auto-select or chain a workflow.
- Budgets: no persisted automatic task, repair-round, review-round, or delegation budget
  exists under the manual grant. Each explicit invocation remains bounded by its own
  workflow contract and the current owner request.
- Mandatory reviews: Plan review before approval, isolated task review before task
  completion, and aggregate Change review before Test/Deliver finalization.
- Stop conditions: stale or contradictory North Star trace, unmet Research or owner
  checkpoint, plan-critical drift, disputed P0/P1, lost current-session activation,
  insufficient evidence, budget exhaustion, or any external/irreversible effect.
- Never granted: a new Change, baseline acceptance, scope/risk acceptance,
  finalization/archive, commit, push, tag, publication, deployment, credential movement,
  incremental spend, or cross-family provider calls.
- Activation: inactive from stored text. The current construction request authorizes
  this explicitly requested task, but it does not activate automatic continuation; a
  future unchanged Execution Packet still requires a trusted current-session owner
  utterance, and task `v027-autonomy-packet` remains responsible for that mechanism.

### Bootstrap approval evidence

- Stable packet fingerprint: `pending` until `v027-autonomy-packet` implements and
  generates Execution Packet v1.
- Canonical source boundary: the exact raw owner utterances, conversation scope, model
  wording boundary, absent timestamp, and non-inheritance rule are preserved once in
  `.ultra/decisions/2026-08-15-v027-north-star-r1.md#owner-record`; this mutable Change
  intent cites that record instead of duplicating or paraphrasing the quotes.
- Approved construction scope: the exact `MODIFY`/`CREATE` path inventories and public
  seams in the eight `task-v027-*.md` contexts, six named provider targets (Claude Code,
  Codex, OpenCode, Kimi Code, Grok Build, and ZCode), read-only canonical `.ultra` inputs,
  and bounded verification/candidate-install drills described by the durable plan.
  An actual Delegation Permission v2 must narrow this superset to exact paths, an exact
  untracked allowlist, selected `.ultra` paths, snapshot manifest/digest, and provider.
- Spend boundary: use existing authenticated provider entitlements only; incremental
  credit purchase, subscription purchase, or an unbounded paid run is not authorized.
- Bootstrap rule: that live request authorizes this current v0.27 construction session;
  it does not justify fabricating a pre-existing packet fingerprint or grant future
  sessions permanent activation.
- Fresh-session rule: these stored quotes are durable approval evidence but are inactive
  in every fresh session. Only a trusted current-session owner utterance can activate an
  unchanged approved packet; no file may persist or reconstruct an activation bit.
- External-effect boundary: source edits, bounded verification, real six-Host candidate
  installation, and required provider drills are in scope. Credentials must not be
  copied or printed. Commit, push, tag, publish, release, and deployment remain outside
  this approval.

## Planning Posture

`EXPAND` and `CORRECT`: preserve the accepted file-first product and six-Host scope;
add bounded autonomy, lifecycle adversarial review, dirty-snapshot delegation, and
three-dimensional Doctor while correcting duplicated task status, arbitrary semantic
numeric gates, incomplete Hook wiring, and ambiguous provenance. No accepted product
commitment is reduced.

## Recovery

All new work remains uncommitted on branch `codex/v027-lifecycle-closure`. A future
abandonment must record owner decision, reason, reusable evidence, successor id if any,
and explicit source disposition (`keep`, normal Git `revert` after a commit, or
file-scoped discard). No workflow may automatically reset or overwrite the dirty tree.

## Unresolved Decisions

None blocks Phase 1 under the current owner's live authorization. Any newly discovered
plan-critical delta, credential request, unbounded provider spend, external publication,
or security trade-off returns to the owner rather than being inferred.

## Abandonment

- Date: 2026-08-17
- Owner decision: the owner accepted the Ultra Builder Pro 3.0 forward design
  (`docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md`, SHA-256
  `a91b563a48889909f80fc61f608a8198edec86c073a9b039ee57788b38483c1f`) and issued the
  Mode B durable work-package grant `ubp3-mode-b-2026-08-17`
  (`.ultra/decisions/2026-08-17-ultra-builder-pro-3.0-mode-b.md`). That grant states
  the historical v0.27 documents, tasks, evidence, and Review receipts are
  investigation inputs that do not override the accepted forward design, and the
  owner directed that the old task route — including `v027-autonomy-packet` — be
  ignored wherever it conflicts with the grant. This Change's remaining route is
  therefore superseded for forward design by that accepted decision.
- Reason: the accepted 3.0 design replaces the v0.27 Execution Packet / autonomy /
  adversarial-lifecycle route with the Ultra Core Protocol, dual-mode grants,
  bounded three-round review convergence, and owner-selected topology. Executing the
  remaining v0.27 pending tasks as designed would rebuild the superseded route
  inside the 3.0 work package.
- Reusable evidence: Phase 1 and H0 deliverables stand as accepted history — the
  North Star v2 schema and validator, the task ledger and typed evidence v2 with
  its discriminated external-manual review branch, the H0 loop-closure contract
  changes (terminal `APPROVE`, P0/P1-only repair routing, one delta review,
  navigational Resume Notes, direct-parent packet history, self-hosting review
  boundary, pending-frontier-inactive Hooks), the completed task evidence records
  under `.ultra/evidence/v027-*`, the incident record, and the r1 research run.
- Recovery or successor: successor Change `chg-ultra-3-0-mode-b` (active) carries the
  accepted 3.0 implementation under the Mode B grant. Source disposition: `keep` —
  all v0.27 work stays in the dirty worktree as the 3.0 baseline; nothing is reset,
  reverted, or discarded.
