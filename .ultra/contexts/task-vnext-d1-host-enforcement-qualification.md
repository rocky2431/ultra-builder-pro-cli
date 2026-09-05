# Task vnext-d1-host-enforcement-qualification: Qualify fail-closed Host enforcement and close D1

## Context

**What**: After the shared runtime-safety repair, mechanically qualify the selected
ZCode Host path against the Packet's real file, Agent-tool network, env-secret and
point-of-use effect boundaries; admit only supported dimensions, retain one redacted
no-production external observation, align maintained contracts and run the integrated gate.

**Why**: Prompt restrictions and final Git-diff rejection cannot undo an already
performed external effect or outside-worktree write. Step 1 may use a Host only when
the actual exact-version path enforces the Packet it receives, or fails closed with a
truthful limitation.

**Constraints**:
- Depends on completed `vnext-d1-runtime-safety-boundary`; do not duplicate its env or writer logic.
- One bounded selected-Host qualification call, thirty-minute ceiling, existing authentication only.
- The fixture is isolated and no-production; provider transport is separately authorized and recorded.
- Do not infer support from README, Host self-report, exit zero or a green fake test.
- If ZCode cannot enforce the required Packet, return a typed unavailable path; do not weaken D1-AC03.
- No commit, push, publish, deploy, real HOME install, login, credential mutation or business external effect.

## Implementation

**Layers touched**: Host profile capability facts -> delegate admission -> exact-version
no-production smoke -> current Skill/spec/architecture compatibility surfaces -> full gate.

**Pattern**: extend the existing Host-profile capability/maturity record only where a
real admission consumer exists. Reuse permission schema, native disallowed tools,
ACP permission denials, isolated worktree, actual diff validator and current receipt
redaction. Do not build a generic sandbox or point-of-use workflow engine.

**Tech Notes**:
- Distinguish provider control-plane network, explicitly authorized for the model call,
  from Worker-initiated Web/shell/business effects. Every denied Agent effect remains
  fail-closed.
- Qualify exact dimensions, not a single marketing boolean: writable scope, outside-root
  denial, Worker Web/shell/tool denial, env-key isolation, adapter preinstallation versus
  runtime fetch, credential value redaction and receipt truth.
- Bind the exact probe instruction and permission digests. Every claimed tool-mediated
  denial requires a mechanically observed attempt-and-denial event; use coordinator-owned
  isolated filesystem markers and a loopback-only local network sink for pre/post checks.
  An unattempted or unobservable dimension remains unsupported. Never point probes at a
  user, business or production endpoint, and never retain secret values.
- A missing capability may close that Host/Packet route while leaving analysis and other
  qualified Hosts available. No silent fallback or brand-specific semantic branch.
- Before the provider request, reserve the exact delegation/attempt id and atomically mark
  it `dispatched`; dispatch consumes the one-call budget. Missing or indeterminate terminal
  receipt is `outcome_unknown` and cannot be retried without a new grant or authoritative
  proof that no provider request was sent.
- Update prose only after the observed implementation and smoke subject are frozen.

**Earliest observable slice**: the selected exact ZCode transport either produces a
redacted receipt showing the allowed in-root change and all denied probes remained
ineffective, or admission returns one precise unsupported-dimension diagnostic before
any implementation write. Both are truthful; only the first satisfies D1-AC03 for ZCode.

**Fresh-session recovery**: verify the D0 decision SHA, sole active D1 Change, completed
predecessor evidence/review and current ZCode inventory; then inspect the immutable attempt
id and pre-dispatch state before the receipt. `reserved` with authoritative non-dispatch
proof is unconsumed; `dispatched`, terminal or indeterminate after dispatch consumes the
one permitted live call, and an absent receipt never restores it.

## Planned Path Inventory

`CREATE`:

- `.ultra/contexts/task-vnext-d1-host-enforcement-qualification.md`
- `.ultra/evidence/vnext-d1-host-enforcement-qualification/evidence.json`
- `.ultra/evidence/vnext-d1-host-enforcement-qualification/evidence-reopen-20260902.json`
- `.ultra/evidence/vnext-d1-host-enforcement-qualification/host-enforcement-attempt.json`
- `.ultra/evidence/vnext-d1-host-enforcement-qualification/host-enforcement-receipt.json`
- `.ultra/evidence/vnext-d1-host-enforcement-qualification/verification.log`
- `work/vnext-d1-zcode-host-enforcement-qualification.md`

`MODIFY`:

- `.ultra/tasks.json`
- `.ultra/specs/research-distillate.md`
- `.ultra/specs/architecture.md`
- `.ultra/specs/product.md`
- `bin/install.js`
- `docs/ARCHITECTURE.md`
- `docs/ARTIFACT-AUTHORITY.md`
- `docs/RUNTIME-COMPAT-MATRIX.md`
- `skills/ultra-delegate/SKILL.md`
- `skills/ultra-delegate/references/delegation-contract.md`
- `skills/ultra-delegate/scripts/agent-execution-driver.cjs`
- `skills/ultra-delegate/scripts/delegate.cjs`
- `skills/ultra-delegate/scripts/host-profile.cjs`
- `tests/acp-driver.test.cjs`
- `tests/delegate.test.cjs`
- `tests/v026-contract.test.cjs`

Any later addition, removal, or rename in this inventory or the Public Seams below is
plan-critical and requires a rebuilt ZCode task packet and Codex plan disposition before
implementation continues.

The three added `MODIFY` paths are the exact post-Review Plan disposition for Repair 1:
`research-distillate.md` is the existing canonical consumer whose two source-blob rows
became stale when the already-planned specs changed; `bin/install.js` is the existing
compatibility process boundary that currently drops the typed unavailable result; and
`agent-execution-driver.cjs` is writable only if the smallest correct repair must split
pure transport choice from process-backed identity probes. No new product seam or effect
is added, and Repair 1 may leave the driver file unchanged when an earlier provider-neutral
precheck resolves the executable-order defect.

## Public Seams

- Host profile capability/maturity and delegate admission diagnostics
- `ultra-delegation-permission-v1` denied-effect boundary
- installed `ultra-delegate` Skill and delegation contract
- product/architecture/compatibility statements consumed by fresh Hosts and reviewers
- redacted external-observation receipt and current full release gate

## Narrow Verification

- `node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/v026-contract.test.cjs`
- changed-Skill validation through the installed Skill Creator validator
- one exact-version ZCode no-production enforcement smoke with exact instruction/permission
  digests, pre-dispatch budget reservation and a thirty-minute ceiling
- require independent attempt-and-denial events for each tool-mediated claim plus
  coordinator-owned pre/post markers and a loopback-only local network sink; every
  unattempted or unobservable dimension remains unsupported
- `npm run verify:release`
- `npm pack --dry-run --json`
- `git diff --check`

## Acceptance Criteria

**Change Acceptance IDs**: [`D1-AC03`, `D1-AC04`, `D1-AC05`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| D1Q-01 | Delegate admission checks the Packet's required enforcement dimensions against exact Host capability facts and returns one typed unsupported path before launch; it does not silently fallback or treat a provider brand as semantic policy | `command` | negative/positive admission fixtures with exact Host-profile inputs and focused test output |
| D1Q-02 | The selected exact ZCode Host path allows only the declared isolated in-root write, exposes no denied control env key, retains no secret value and performs no Worker Web/shell/outside-root/business effect; an unattempted or mechanically unobservable denial remains unsupported | `external-observation` | pre-dispatch attempt record plus redacted `host-enforcement-receipt.json` with exact instruction/permission digests, Host/model/adapter/version/maturity, run id/time, changed paths, mechanically observed attempt-and-denial events, coordinator-owned filesystem pre/post markers and loopback-sink observations |
| D1Q-03 | Provider transport use and adapter preinstallation are recorded separately from Worker effect authority, with no runtime package fetch hidden inside a supposedly offline admission | `inspection` | Host profile, launch argv, inventory and receipt inspection bound to exact versions |
| D1Q-04 | Maintained Skill, contract, specs and compatibility docs state only the enforcement actually proven, including `outcome_unknown`, fences and any ZCode experimental limitation | `inspection` | current final diff plus Skill validation and Codex Review subject |
| D1Q-05 | Integrated targeted and full release gates pass with no regression to N=1 delegation or package contents | `command` | retained command logs for focused tests, `npm run verify:release`, pack dry-run and diff check |

## Definition of Drift

- Calling an unqualified Host and using result rejection as access control.
- Treating provider transport network as an implicit Worker Web/business-effect grant.
- Adding a generic sandbox, workflow effect engine, online package installer or credential broker.
- Marking ZCode supported or non-experimental from one smoke, or silently falling back to another Host.
- Starting D2 wake or Run Supervisor work inside D1.

## Trace

**Source**: `.ultra/specs/product.md#requirement-fr-06-bounded-delegation`

**First principles**: [`FP-2`, `FP-3`, `FP-5`, `FP-6`]

**Serves**: [`NS-03`, `NS-04`, `NS-05`]

**Causal contribution**: an exact-version, dimension-specific admission and retained
real observation prevents a Worker capability from becoming undeclared effect authority,
while honest unavailability preserves the underlying workflow.

**Hard constraints**: [`HC-1`, `HC-2`, `HC-3`, `HC-4`, `HC-5`, `HC-6`, `HC-7`]

**Decisions**: `.ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|------|----------------|--------|---------------|--------|
| 2026-09-01 | — | Initial creation | — | Separate the only external-observation authority from the shared offline runtime repair |
| 2026-09-01 | plan delta | Added digest-bound independent denial observations, pre-dispatch budget consumption and the canonical Task 2 packet path | — | Resolve blocking findings `review-tests-002`, `review-errors-002` and `review-design-002` from the admitted Plan Review |
| 2026-09-01 | activation | Verified the completed predecessor evidence, exact R2/Grant/intent bindings, sole active Change and unconsumed attempt state; moved the ledger row to `in_progress` | — | Admit only the bounded Task 2 implementation packet before reserving or dispatching the one live qualification call |
| 2026-09-01 | review and plan delta | Retained the consumed no-production receipt, recorded initial Task Review `REQUEST_CHANGES`, and added only the canonical distillate consumer plus the two existing process-boundary paths to Repair 1 inventory | product, architecture | Resolve the three current P1 root causes without weakening the fail-closed boundary or auto-repairing five retained P2 findings |
| 2026-09-02 | Repair 1 and integration gate | ZCode repaired the three initial P1 root causes in four authorized paths; Codex independently verified the result, reopened and corrected Task 1 evidence, and reached a green full release gate | product, architecture | Establish the current integrated subject for the direct-parent Task 2 delta Review without retrying the consumed qualification or repairing retained P2s |
| 2026-09-02 | delta Review and completion evidence | Direct-parent delta Review approved all ten P1 dispositions; Codex froze the completion subject, reran focused/full/Skill/pack/diff gates and published current Task Evidence v2 at SHA-256 `31787c1f7e5cddd6d0335935c7117dbae81edc60e8386a7066122072d6f29ca7` | product, architecture | Close Task 2 truthfully with the exact ZCode route unavailable, five direct P2s plus three inherited P2 limitations retained, and no Repair 2 or external effect |
| 2026-09-02 | aggregate Review reopen | Reopen `D1Q-02` after aggregate Review `vnext-d1-aggregate-review-20260902` returned `REQUEST_CHANGES` at summary SHA-256 `1ce9dfed3700a1d743cdfdac6ac3dad562cf5d44fe7902cbd3f68767a064b558` | — | `review-spec-001` proves the negative route is truthful but cannot be marked `not_applicable` to close the unconditional positive criterion; the canonical evidence and ledger must expose the gap. |
| 2026-09-02 | read-only qualification-path diagnosis | Located the exact local `zcode-acp` source at commit `42fe149d4b501469343c01f23ba3801832306d53` and traced both the zero-location denial and the unreachable later-denial observations | — | The bridge omits native `file_path` and permission locations; after any rejection, Ultra's ACP driver records the denial but also resolves `fatal`, so the same bounded call cannot reliably reach the remaining shell/Web probes. |

## Open Questions

- Owner checkpoint required. Recommended path: preserve the accepted positive D1Q-02
  criterion and let the existing Task 2 Repair 2 close the now-observed bridge root cause.
  That repair needs an exact Plan-inventory extension for the canonical bridge patch plus
  its digest binding, and an isolated local `zcode-acp` worktree at commit
  `42fe149d4b501469343c01f23ba3801832306d53`; ZCode must add `file_path` extraction and carry
  those locations into `RequestPermissionRequest`, with a focused bridge regression. The
  exact Repair 2 inventory must also include `acp-driver.cjs`: a denied request must stay
  denied and recorded without immediately terminating the safe session, so one call can
  reach the remaining independent denial probes and still return final
  `failure_type: permission_denied`. Add one multi-denial regression; never allow a denied
  operation or turn a denial into success. A
  release binary can be built offline in the isolated worktree and selected only through
  `ULTRA_ZCODE_ACP_COMMAND` for one newly authorized no-production qualification call, so
  no real-HOME install or binary replacement is required. Retain the existing remaining
  Task 2 delta Review plus aggregate delta Review. The alternative is an explicit Owner
  revision of D1Q-02 so a truthful negative qualification becomes a legal terminal result;
  that weakens the accepted D1-AC03 proof and is not recommended.

## Resume Note

The exact qualification call remains terminal and consumed under attempt
`d1q-61ca5157911e4f61866cff5452bc942d`; receipt SHA-256 is
`936c77949630c52a7ca128c0f780cc98b2f3a046e5ff8d500bb41cd145bdde01`, current retry
authority is none, and the exact route remains unavailable. The aggregate Review summary
at SHA-256 `1ce9dfed3700a1d743cdfdac6ac3dad562cf5d44fe7902cbd3f68767a064b558`
correctly identifies `review-spec-001`: the receipt proves a truthful negative
qualification, but only the unobserved positive branch satisfies the non-conditional
`D1Q-02` and D1-AC03.

Read-only diagnosis found the exact source checkout at
`/private/var/folders/cm/zpwxmr512rq1qz4_0_ryz8t80000gn/T/ultra-zcode-acp-audit.XXXXXX.6ueNA86gp4`,
HEAD `42fe149d4b501469343c01f23ba3801832306d53`. Its tracked
`src/acp_translator.rs` and `src/agent.rs` are clean while six unrelated existing files are
dirty, so implementation must use a fresh isolated local worktree rather than edit that
checkout in place. The exact root cause is mechanical: `extract_locations` accepts `path`,
`file` and `files` but not the native ZCode `file_path`; separately,
`permission_to_acp` retains only `raw_input`, and `handle_server_request` builds the ACP
permission `ToolCallUpdate` without `.locations(...)`. The retained run therefore emitted
`location_count: 0`, and the Ultra ACP driver correctly denied the edit. Do not fix this by
parsing untrusted `rawInput` inside Ultra. Reproducible repair also requires updating
`skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch` and its SHA binding in
`host-profile.cjs`. A second read-only trace found that `acp-driver.cjs` resolves its fatal
promise immediately after any rejected request even though it already retains
`permissionDenied`; consequently the current session is cancelled before later shell/Web
denials can be observed. The smallest safe repair is to keep replying with the reject option,
append every denial event, allow the bounded Host turn to continue, and project terminal
`permission_denied` after the prompt ends. This does not authorize the denied operation.
The canonical patch, its digest binding, `acp-driver.cjs` and focused tests are proposed scope
only until the Owner grants the exact inventory extension.

No repository delegation or recent Agent-delegation run has an active `run.lock`; no
active ZCode writer is observable. The ledger must remain `in_progress`, and canonical
Task Evidence must record `D1Q-02` plus `spec_trace` as `gap`. The prior delta Review and
completion subject remain retained historical evidence; they do not close the reopened
criterion. Do not retry the provider call, weaken D1Q-02, finalize/archive, enter Step 1,
or perform commit, release, installation, credential, production or other external
effects without the new exact Owner authority described above.

## Superseded completion snapshot

Completed locally on `2026-09-01T17:07:41Z` under the exact D1 grant.

- Canonical evidence: `.ultra/evidence/vnext-d1-host-enforcement-qualification/evidence.json`
  at SHA-256 `31787c1f7e5cddd6d0335935c7117dbae81edc60e8386a7066122072d6f29ca7`.
- `D1Q-01`, `D1Q-03`, `D1Q-04` and `D1Q-05` are satisfied. `D1Q-02` is explicitly
  `not_applicable` for the positive route: the real receipt proves a safe negative
  qualification and the product consumes it before launch; it does not claim writable-scope
  or unattempted effect-denial support.
- All ten initial P1 findings are resolved by the retained Repair 1 bytes and approved delta
  Review. Five direct P2 findings and three inherited P2 limitations remain visible.
- No commit, push, tag, publish, deploy, real-HOME installation, credential operation,
  package fetch, production mutation, purchase or other external effect was performed.

## Task Review

- Execution Packet state/digest/limitation: delta Review packet is available at SHA-256 `152a8f45453d42744e7faca1fd7f2048c24ec2f892fdc036e89968e374755930`; limitation `null`.
- Review session identity and summary digest: `vnext-d1-host-enforcement-delta-1-review-20260902`; `62b04ccd3840d8acd4f7b25f44d3e97fe05d48f5d382ef1f96d47f9c482e21bb`; verdict `APPROVE`.
- Blocking findings with resolution/disposition/evidence refresh refs: all ten initial P1 ids are recorded as `resolved` in canonical Task Evidence v2, grouped across pre-admission executable probes, typed public diagnostics and the two stale distillate bindings. The delta Review carries no current P0/P1. Five direct P2s remain retained without auto-repair.
- Retention: retain both the initial `REQUEST_CHANGES` and delta-1 `APPROVE` strict sessions until aggregate Test and Deliver consume Task 2. Premature loss requires a fresh Review and Test; never reconstruct either receipt.

---
*Generated by ultra-plan*
