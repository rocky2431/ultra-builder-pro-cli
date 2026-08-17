# Ultra Builder Pro decisions

This file records durable product-level decisions that explain the current source tree.
Project decisions created by Ultra belong in each project's `.ultra/decisions/`.

## Ultra Core Protocol (3.0, accepted 2026-08-17; r3 revision same day)

The owner accepted `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md` and projected it as North
Star revision `north-star-v2-r2`
(`.ultra/decisions/2026-08-17-ultra-3-0-north-star-r2.md`), then converged the
constitution with the owner-directed r3 design
(`docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md`) as revision
`north-star-v2-r3`
(`.ultra/decisions/2026-08-17-ultra-3-0-north-star-r3.md`). Ultra Builder Pro is
the file-first, provider-neutral Ultra Core Protocol: cognitive alignment through
checkpoints, per-fact canonical authority, explicit dual-mode authorization, typed
evidence with recovery, exclusive verified Agent handover, and review convergence
bounded by an owner-visible budget. The constitution itself stays count-free —
agent counts and topology detail, Host and Skill counts, provider names, and
exact review-round numbers live in the versioned product contract and exact
work-package grants. Authorization has two
modes — `session-local` by default, `durable work-package` when the owner issues an
exact grant (see `.ultra/decisions/2026-08-17-ultra-builder-pro-3.0-mode-b.md`); no
file, status, Hook, or Resume note ever implies activation. Optional Graph/Loop
coordination layers own observations only and none is integrated.

## Primary transfer between Agents (r3, accepted 2026-08-17)

A work package's canonical writer moves to another Agent only through an
owner-granted primary transfer: the sender writes current reality into the task
context and Resume Note, derives an OFFER binding canonical refs/hashes, HEAD,
and the worktree digest, and stops writing after the receiver's ready ACK; the
receiver stable-reads, verifies every digest, becomes the sole canonical writer,
and freezes a terminal RESULT. Receipts under `.ultra/.runtime/handoffs/` are
derived and rebuildable, never authority; mismatches block instead of
auto-repairing; delegated workers stay mutually exclusive with this path and
never write canonical `.ultra`
(`.ultra/decisions/2026-08-17-ultra-3-0-r3-primary-handoff.md`,
`skills/ultra-change/references/primary-transfer.md`).

## ZCode headless transport stays experimental (r3, accepted 2026-08-17)

The ZCode app-bundled CLI is a verified-local surface — it exists, launches, and
passed local drills — but the provider publishes no headless CLI, SDK, or
protocol stability contract. Its transport maturity is recorded `experimental`
in the shared host profile and compatibility matrix; promotion to `supported`
requires both official documentation and a full recovery drill. Interactive
Desktop use and the documented plugin surface are unaffected, and no adapter may
pass an app-internal binary off as an official stable interface.

## File-first authority

Owner-readable repository files and Git are the complete semantic authority. Ultra
does not maintain a database, MCP kernel, workflow state machine, prompt projection, or
daemon. The previous mechanical supervisor could make every public path unreachable
while still reporting internally consistent state; deletion restores the host model's
ownership of route and meaning.

## Three Skill roles

The product exposes eight user workflows, five model-invoked disciplines, and one
router. Public workflows require explicit owner selection by default. Research, Plan,
Dev, Test, and Deliver reconciliation have one narrow exception: an activated
Change-scoped execution grant may let the model select the next covered workflow —
session-local activation in the current conversation, or a stably verified durable
work-package grant. A model discipline needs at least two canonical callers or it is
inlined.

This keeps reusable reasoning in one place without turning it into another user-facing
route or custom-agent registry.

## Bounded same-session continuation

The stored grant text is descriptive authority, not an executable grant. Session-local
activation is a current owner utterance approving the exact grant and current task
ledger; a durable work-package grant is executable only after a fresh Agent stably
verifies its recorded subject, scope, topology, effects, budgets, expiry, revocation,
and invalidation. A fresh session without a durable grant, host change, lost
activation context, semantic stop, or budget ceiling pauses
the loop. Plan, task, and aggregate reviews remain mandatory. Delivery continuation is
reconcile-only; finalization, archive, authenticated providers, install, commit, push,
publish, and deploy remain separately authorized.

The native host model-tool loop performs the work. Existing files and Git carry
recovery; no route position, daemon, or extra semantic store is introduced.

## Review topology is owner-selected

The owner chooses reviewer and provider count for each stage. The default is one reviewer:
the current Agent. An initial task review selects `review-spec` plus the
lenses justified by risk and touched seams; a delta review reruns only affected
lenses; an aggregate Change review may default to the full roster only when cross-task
wiring justifies it — never as a mandatory count or a quality proxy. Specification
fidelity owns both accepted-behavior mapping and the challenge to a Change's claimed
North Star contribution, with actual execution mode and coverage recorded. When
another model family is available, a blind premise challenger is an additional probe
rather than a voting lens.

The seeded 2026-08-14 evaluation found no consequential defect class uniquely caught
by a permanent premise lens: the strengthened specification lens, the six-concern Kimi
probe, and the ZCode specification probe each found all five hidden classes. Grok's
malformed terminal output was rejected and was not counted as semantic evidence. See
`docs/evals/adversarial-review-2026-08-14.md`.

## ZCode activation uses documented plugin directories

ZCode receives a managed local marketplace for importability and a documented
`plugins.dirs` entry for immediate native discovery. Ultra owns only the entry it adds,
so reinstall is idempotent and uninstall preserves unrelated user configuration. It
does not write ZCode's private plugin cache or copy desktop provider credentials into
headless CLI configuration.

## Intake, baseline, and delta

Init preserves raw owner intake in the Project Brief; Research establishes the accepted North Star, domain language, and specification baseline; Change reconciles only the sections touched by one requested delta.

The optional Research Wayfinding brief is derived navigation, not a fifteenth Skill or
semantic authority. The first six Research references remain dependency-aware semantic
lenses. Grilling controls how caller-named questions are asked, Think stress-tests one
consequential decision, and Domain Modeling promotes settled vocabulary. This prevents
Init from consuming Research while keeping reusable methods in one canonical place.

## Rule-side assets travel with Skills

`.ultra/` contains project data only. Reusable executable examples live under
`skills/ultra-tdd/references/templates/`; the reduction boundary lives under
`skills/ultra-think/references/`; the full philosophy lives in `docs/PHILOSOPHY.md`.

Skill `references/` is already copied by every adapter and supports relative
cross-Skill links. No placeholder root variable or separate asset distributor is
needed.

## State is fact; route is judgment

Directory position and explicit fields record mechanically checkable facts. The host
model reads those facts and chooses the next route. There is no persisted “current
workflow stage” whose value can override the actual files.

Task status lives only in the `ultra-task-ledger-v2` row and is read back there. New task
contexts do not duplicate it; legacy context Status and Complexity fields remain
migration diagnostics and the ledger wins. Tasks retain a stable `change_id` in the
append-only ledger; current readers select only rows matching the one active Change.
Archive or abandonment is a `git mv`. Test-report freshness is governed normatively by the complete v2 rule in [Artifact Authority](ARTIFACT-AUTHORITY.md#evidence-promotion).
That authority binds the current Change snapshot, ordered v2 task-evidence identities,
and strict aggregate-review packet, admission, subject, and summary bindings. This
decision intentionally does not maintain a second field mirror. Deliver reconciles
first and finalizes only while that complete snapshot remains current. A separate
request cannot create a second active Change; it waits, exits the current Change, or is
explicitly reconciled into the same id.

## Typed task evidence and completion ordering

Current work uses `ultra-task-evidence-v2`. Command, inspection, owner-judgment, and
external-observation evidence retain distinct authorities; the owner alone can supply
an owner-judgment result. Structural validators report exact fields, identities,
digests, provenance, and freshness, never semantic acceptance. A task remains
`in_progress` through its task review. Blocking findings and their dispositions are
recorded and affected evidence is refreshed before the primary model writes
`completed` to the ledger. Historical v1 evidence remains readable but cannot satisfy a
current Change's Test or Deliver input without migration.

## Counts are observations, not semantic gates

Task, file, line, context, question, finding, repair-round, and complexity counts do not
decide plan quality, review convergence, staleness, or completion. The model interprets
concrete coupling, evidence, risk, and recovery facts. Explicit physical ceilings such
as time, bytes, cost, provider spend, or bounded process resources still stop resource
consumption and return a typed recovery path; exhaustion never dispositions a finding.

## Three independent integration defences

Planning, task development, and final testing detect different versions of the
locally-green/whole-system-broken failure. Their outputs remain independent sensors:
horizontal task shape, six evidence dimensions, and final wiring/E2E audit.

No single sensor is promoted into a semantic completion gate.

## Five hooks only

The hook surface is session context, mid-workflow acceptance recall, compact snapshot,
post-edit evidence observation, and dangerous-command protection. Every hook is silent
without `.ultra/`. Additive protected-branch publication is advisory because the
portable hook cannot receive every host's trusted owner-approval receipt. History
rewrites, branch deletion, and the narrower named destructive effects can be denied;
their repair is authorization scoped to the exact command digest.

## Delegation is a process boundary

`ubp delegate run` starts a supported CLI with an immutable instruction, explicit
permission JSON, and named worktree. Their exact digest-bound sources are embedded in
the worker prompt because some native sandboxes correctly deny reads outside the
worktree. Files remain the cross-host state; the embedded copy is transport, not another
authority. The parent reads a stable terminal result instead of worker chatter.
Delegation adds no semantic store and no authority. The instruction selects task
execution, scoped Research evidence, or aggregate Change review/verification; only task
execution requires a task row.

## Installation isolation

An explicit `--config-dir` owns host sidecars as well as the primary config. In
particular, Codex plugin and personal-marketplace paths resolve inside the sandbox.
Managed staging, provenance, doctor, and uninstall are native adapter responsibilities.

## External effects

Commit, push, tag, package publication, release, deployment, installation, migrations,
and real-money effects are independent. A locally complete delivery authorizes none of
them automatically.
