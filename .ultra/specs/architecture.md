# Architecture Specification

## Scope

- **Boundary**: Ultra Builder Pro 5.0.2 npm package source, six adapters, fourteen
  Skills, five Hooks, installed Skill-local ACP-first delegation with a typed CLI
  fallback, canonical project assets, tests, and maintained documentation.
- **Revision**: base HEAD `fc055021bcfeee3e8c6781b9545d267f5eb73cbd` plus the current owner-accepted reconciliation.
- **Quality goals**: semantic agency, six-host portability, deterministic mechanical
  enforcement, truthful evidence, reversible installation, and file/Git recovery.

## Architecture Context

```text
Owner ──explicit route or verified grant──> owner workflow ──writes──> canonical files + source + Git
                              │
                              ├── model discipline (method, selected by host model)
                              ├── Hook (bounded context/observation/effect guard)
                              └── delegated Agent runtime ──ACP-first / typed CLI fallback──> isolated worktree + validated receipt

Installer ──host adapter──> native managed plugin/bundle + provenance + Doctor
```

The host model owns semantic interpretation, strategy, completeness, evidence judgment,
and final expression. Ultra mechanizes only paths, formats, permissions, exact effects,
digests, process state, installed ownership, evidence identity, and recovery.

## Authority and Recovery

| State | Authority | Writers | Readers | Recovery |
|---|---|---|---|---|
| Raw owner intake | `.ultra/project-brief.md` | init, owner correction | research, status, session Hook before baseline | preserve exact wording; recover legacy one-line; Git |
| Accepted project baseline | `.ultra/north-star.md`, `CONTEXT.md`, `.ultra/specs/*.md` | research first; change/delivery reconcile only touched sections | all execution workflows and session Hook | evidence-backed reconciliation and Git |
| Current outcome | active Change `intent.md` with stable `change_id`, Research Disposition, North Star Trace, and required Execution Grant (`session-local`, manual and inert without current-session activation, by default; `durable work-package` only with an exact owner record) | change; plan posture | research when required, then plan through delivery | preserve unknowns, refresh stale North Star revision, repair contract, move same id with Git |
| Execution graph and resume | `ultra-task-ledger-v2` append-only `.ultra/tasks.json` as sole task Status plus contexts with typed Acceptance/Resume meaning | plan creates rows/contexts; dev changes ledger Status and context resume/review fields without duplicating Status | workflows and Hooks after active-id filtering | reject cross-Change dependencies; ledger wins over legacy context headers; report migration diagnostic and read back |
| Verification | `ultra-task-evidence-v2` typed evidence whose `subject` is an independently captured completion-snapshot freshness observation after validated Review and before publication; separate strict task review provenance lives in `task_review`, which separately binds the retained strict summary; aggregate Test binds ordered evidence identities and independently binds the current Change; v1 task evidence and older review schemas are explicit historical compatibility only | dev/test/review, with owner-only disposition for owner judgment | delivery/status | keep task in progress through blocking review repair, refresh evidence, recapture the completion subject, and rerun against current semantic and Git state |
| History | archived Changes, abandoned Changes with exact closure, decisions, Git | delivery/change/think/Git | owner, status, and future Change reconciliation | supersede, recover, or revert; never erase accepted history |

Derived `.ultra/.runtime/`, `.ultra/progress/`, and `.ultra/reviews/` data is disposable,
but disposable does not mean prematurely removable. Retain the exact current strict v4
review session, including `ADMISSION.json` and `SUMMARY.json`, until Test and Deliver
have both successfully consumed its transport binding; garbage collection may remove
that derived session only afterward. V3 and pre-admission v4 sessions are read-only
historical compatibility and never satisfy a current Test or Deliver claim. No Ultra
executable is required to reconstruct canonical state; receipt loss before both
consumers succeed instead requires a fresh Review and Test.

At most one Change is active in one worktree. Every current reader resolves that
directory name as the stable `change_id` and selects only matching task rows. Prior
rows remain append-only history after archive or abandonment. One primary host model
writes canonical `.ultra` files; review workers are read-only and delegated edits occur
in isolated worktrees, so no lock service or semantic state machine is required.

The ledger owns only externally observable task status; it does not decide semantic
completion. Current context Acceptance is an exact four-column table whose verification
type is `command`, `inspection`, `owner-judgment`, or `external-observation`. The
evidence sensor validates exact shapes and freshness identities without converting an
exit code, validator result, digest, finding count, complexity, or model assertion into
semantic pass. Owner-judgment disposition is accepted only from a durable owner record.
Command and external-observation entries also name a normalized repository-relative raw
ref and exact SHA-256. Dev hashes bounded stable repository-contained bytes from an
ordinary regular non-symlink file before record publication; Test, Status, and Deliver
repeat that raw check, then recompute the exact record `evidence_digest`. Structural
validation checks only the ref and digest shape and does not dereference the raw file.
The product-worktree digest excludes `.ultra/evidence/**`; raw and record digests keep
that publication boundary non-self-referential without removing provenance.
Every completed v2 evidence record retains the exact strict task-review session—its
`WORKER-PACKET.json`, `ADMISSION.json`, every selected specialist artifact, and
`SUMMARY.json`—together with all blocking finding resolutions and refreshed evidence
references until aggregate Test and Deliver have both consumed it successfully.
Premature loss requires a fresh Review and Test; never reconstruct the old receipt.
Historical naming: a bootstrap task whose review predates the v0.27 Execution Packet v1
mechanism — the superseded name for what 3.0 calls an execution grant — records
`pre-v1-unavailable`, a null digest, and a non-empty limitation in that retained
evidence field rather than inventing an execution fingerprint.

### Baseline maturation

Init copies stable paths and preserves raw intake without promoting it. Research owns
the semantic question map and first accepted baseline. Its optional
`.ultra/research/<run-id>/brief.md` is derived Wayfinding navigation; the seventeen
area reports are evidence, while promoted meaning lives in the North Star,
`CONTEXT.md`, and specifications. Change begins from that baseline and patches only the
sections affected by one accepted delta. A whole unclear path returns to Research; one
consequential trade-off may use Think without manufacturing a workflow state.
Each Change records `none`, `bounded`, or `required` Research Disposition with exact
question, evidence, selected lenses, and exit evidence. Planning waits on unsatisfied
exit evidence without adding a `research_complete` flag.

### Bounded automatic coding

Six public Skills contain grant-continuable modes discoverable to the host model, but each resident entry
guard first requires a live execution grant in one of two modes. A `session-local`
grant stops as soon as its conversation activation is lost; a `durable work-package`
grant lets a fresh Agent or host continue only after the Agent stably verifies the
recorded grant itself. The stored grant text is only descriptive authority. The native model-tool loop may run one ready task at a time until
a semantic stop, owner checkpoint, review finding, budget, lost activation, or declared
through-test/reconcile boundary. It cannot grant another Change, risk acceptance,
finalization, archive, installation, commit, push, publish, or deploy. No daemon, route
ledger, workflow state machine, database, or MCP authority is added.

The owner selects the Agent topology per stage — one Agent or several, which
providers, which write scopes, serial or parallel. When unspecified, the current
Agent continues alone: no automatic spawn, delegation, or control-plane enablement,
and provider roles are never hard-bound to workflow stages. Changing the canonical
writer of a work package is an owner-granted primary transfer: the sender derives
an OFFER binding canonical refs/hashes, HEAD, and the worktree digest; the
receiver stable-reads and answers with a ready ACK only on full match; after the
ready ACK the receiver is the sole canonical writer and the sender stops writing;
execution ends in a frozen terminal RESULT receipt. Receipts under
`.ultra/.runtime/handoffs/` are derived observations, never authority, and stay
mutually exclusive with delegated workers, who never write canonical `.ultra`
(`skills/ultra-change/references/primary-transfer.md`).

Review convergence is bounded by an owner-visible budget: exact defaults live in
the versioned product contract and exact work-package overrides in owner grants
(the released default is one initial Review plus two P0/P1 delta Reviews); a
remaining blocker at budget exhaustion returns to the owner rather than opening
another round, no Agent, reviewer, Hook, or control plane can extend the budget,
and P2/P3 findings are reported without automatic repair.

### Optional coordination boundary

An external Graph/Loop-style control plane may own only coordination observations —
goal/todo identity, claims, leases, attention queues, quotas, gates, handoff
receipts, and append-only run logs — and never North Star meaning, acceptance,
semantic severity, or effect authority. No integration ships in this package; the
Ultra Core Protocol stays complete on files plus Git with the layer absent, and
enabling it requires an owner-accepted real coordination problem plus an adapter
with a live consumer.

## North Star v2 Architecture Relations

| Architecture path ID | Existing architecture anchors | North Star relations | Research evidence |
|---|---|---|---|
| `ARCH-V027-01` | `#authority-and-recovery`, `#baseline-maturation`, `#bounded-automatic-coding`, `#hook-boundary` | `FP-1`, `FP-2`, `FP-3`; `HC-2`, `HC-3`, `HC-4`, `HC-6`; `NS-01` | `.ultra/research/2026-08-15-v027-north-star/00-problem-validation.md#trace`, `.ultra/research/2026-08-15-v027-north-star/41-quality-risks.md#trace` |
| `ARCH-V027-02` | `#agent-to-skill-convergence`, `#adaptation-and-routing`, `#delegation-boundary` | `FP-4`, `FP-5`, `FP-6`; `HC-1`, `HC-5`; `NS-01` | `.ultra/research/2026-08-15-v027-north-star/04-product-strategy.md#trace`, `.ultra/research/2026-08-15-v027-north-star/05-assumptions-validation.md#trace` |

## Agent-to-Skill Convergence

The original package installed ten host-specific custom agents. The historical v0.26
transition removed that projection and preserved each useful method at the smallest
portable surface; 5.0.2 retains this boundary:

| Retired agent | Current canonical home | Relationship to whole workflow |
|---|---|---|
| `review-code`, `review-design`, `review-errors`, `review-tests`, `review-spec`, `review-comments` | matching `skills/ultra-review/references/*.md` lens | A parent `ultra-review` fixes scope and Worker Packet, runs selected lenses, validates artifacts, synthesizes, and owns any repair. |
| `review-coordinator`, `code-reviewer` | `skills/ultra-review/SKILL.md`, `worker-packet.md`, `unified-schema.md`, and `review-modes.md` | Coordination is the parent Skill's semantic job; schema and digest checks stay deterministic. |
| `debugger` | `skills/ultra-dev/references/debugging.md` | `ultra-dev` loads it only for a reproduced failure, then uses TDD for the repair. |
| `tdd-runner` | `skills/ultra-tdd/references/test-execution.md` | `ultra-tdd` uses it for exact command evidence; the primary model still owns the code. |

These files are Skill assets, copied with their parent Skill to all six hosts. They are
not autonomous hidden agents. A host may use native bounded subagents for review, or run
the same lenses sequentially when no such surface exists.

## Adaptation and Routing

| Host | Managed surface | Owner/model policy | Known native boundary |
|---|---|---|---|
| Claude Code | managed Skill plugin with direct Hooks | frontmatter separates owner-invocable routes from withheld model discovery | native permission mode controls delegate tools |
| Codex | plugin root, marketplace entry, Skills plus `agents/openai.yaml` metadata | `allow_implicit_invocation` expresses role | Hook trust is Host-owned; Doctor reports `host_managed` with `observable: false` instead of requesting repeated user trust |
| OpenCode | native JS plugin plus managed Skill directories | descriptions guide selection | no native owner/model routing bit |
| Kimi Code | managed plugin registry under `KIMI_CODE_HOME` | native Skill metadata | plugin scope is user-only; unattended tool approval is coarse |
| Grok Build | native plugin source/registration | native frontmatter | plugin scope is user-only; sandbox behavior remains host-owned |
| ZCode | managed local marketplace plus inline plugin directory | portable descriptions and resident grant guard | plugin scope is user-only; the source-pinned ACP bridge uses an App-internal runtime and remains **experimental**, requires `--ack-experimental`, and keeps Host/provider configuration separate |

`adapters/_shared/runtime-assets.cjs` is the only packaged allowlist.
`plugin-core.cjs` copies shared assets and the canonical init template.
Adapters generate host metadata and wire payloads without editing shared workflow prose.

## Hook Boundary

| Hook | Input fact | Output/effect | Failure behavior |
|---|---|---|---|
| `session_context.py` | accepted North Star or Project Brief fallback, plus task selected by active `change_id` | bounded startup context | silent only outside Ultra; ambiguous active Change suppresses task content but emits typed `active_change_ambiguous` with reachable bootstrap recovery |
| `mid_workflow_recall.py` | active-Change acceptance and source operation, plus host `session_id` when supplied | bounded reminder; only a reminder identical to the session's most recent delivery is suppressed via disposable `.ultra/.runtime/` state, never authority, so a task switch, an acceptance change (including back to an earlier value), or a fresh session delivers again | silent only outside Ultra; ambiguous active Change suppresses task content but emits typed `active_change_ambiguous` with reachable bootstrap recovery; missing or malformed session identity never suppresses a reminder |
| `compact_context.py` | files and Git | disposable snapshot | rebuild from authority |
| `post_edit_guard.py` | edited path, ledger, task trace | normalized mechanical progress observation | malformed prior observation is repaired; semantic gaps stay advisory |
| `block_dangerous_commands.py` | exact shell command and optional exact authorization digest | advise additive protected push; deny protected history rewrite/deletion, destructive data operation, funds, secret, or eval | advisory preserves the host authority path; denial names protected effect and reachable authorization path |

An additive protected push is advisory because Git publication is recoverable and
portable Hook wiring cannot consume every host's trusted approval receipt. History
rewrites and branch deletion remain guarded. A database migration is also advisory
because migration meaning and reversibility are not decidable from a command pattern.
Only the remaining named externally verifiable destructive effects fail closed.

## Delegation Boundary

The canonical installed `ultra-delegate/scripts/delegate.cjs` runner requires one
immutable instruction file, a strict `ultra-delegation-permission-v1` JSON file, a
supported Host, a clean registered Git worktree, and a timeout. `ubp delegate` is a
one-release compatibility wrapper, not the canonical entry. The runner records SHA-256
digests, atomically acquires `run.lock`, and starts one background worker. The exact digest-bound instruction and permission sources
are embedded in the prompt, so a strict native sandbox need not read outside the
worktree; the files remain canonical and the embedded copy is transport only.

The instruction binds the one active `change_id` and selects task execution or
continuation, scoped Research evidence, or aggregate Change review or verification.
Only task execution requires a task row. Research and aggregate scopes may be read-only,
keeping pre-Plan evidence and post-task review reachable without manufacturing ledger
work.

`AgentExecutionDriver` selects conformance-gated ACP-first stable v1 when the executable,
current passed receipt, protocol binding, and any identity probes declared by that Host
all pass. Every unavailable or stale condition selects the typed result-compatible CLI
fallback and records the exact reason; a started provider task is never retried across
drivers. Before the worktree fence, the worker spec, or any Host process exists, packet
admission through the retained host enforcement qualification compares the Packet's
required enforcement dimensions — `writable_scope` for write packets plus
`outside_root_denial`, `shell_tool_denial`, `agent_tool_network_denial`, and
`point_of_use_effect_boundary` for every packet — with the exact Host capability facts
for the selected transport and installed identity. A qualification record exists only
where an exact-version coordinator-owned observation was retained; a missing, unknown,
unsupported, or version-mismatched dimension returns one typed
`host_enforcement_unavailable` diagnostic, creates no Host process, and never falls
back silently. The retained ZCode 0.16.5 ACP qualification observed `writable_scope`
unsupported and every later effect dimension unobserved, so both ZCode transports stay
unavailable for delegation packets without changing their experimental maturity;
separately authorized provider transport, adapter preinstallation, env-key isolation,
credential-value redaction and receipt truth are recorded as distinct facts and never
satisfy a Packet enforcement dimension. The worker validates inputs before and after execution, invokes exactly one Host profile,
enforces timeout/cancellation, extracts one strict final result from native structured
output, computes the actual Git diff from base HEAD including untracked files, rejects
undeclared or escaped writes, and atomically writes the terminal receipt. The model does
not write its own receipt. Nonzero exit cannot become `finished`.

| Host | ACP-first candidate and compatibility CLI profile | Deliberate limitation |
|---|---|---|
| Claude | structured print mode; plan/read tools or acceptEdits/file tools; no Bash or web | native workspace path policy remains Claude-owned |
| Codex | ephemeral exec; read-only or workspace-write; user config ignored, project rules preserved, network disabled | native sandbox permits the whole worktree rather than individual declared roots |
| OpenCode | auto mode under inline deny-by-default permissions; external directories, Bash, web and subagents denied | inline configuration support is version-bound |
| Kimi | prompt mode with launch-only read/write file-tool agent profile; no Bash, web, MCP or subagents | native file tools do not expose a portable per-root CLI policy |
| Grok | single turn; read-only or workspace OS sandbox; no memory/subagents/web | sandbox profile semantics remain Grok-owned |
| ZCode | source-pinned `zcode-acp` bridge over the installed App-internal runtime; headless plan/edit compatibility profile remains result-compatible | **experimental** transport (verified-local only): launch requires `--ack-experimental`; the retained host enforcement qualification refuses both transports before launch for every delegation Packet; current model configuration belongs in the ZCode UI or `~/.zcode/v2/config.json`; no public runtime stability contract exists; a delegation receipt can never upgrade into a primary transfer |
| Pi | Installed native JSON CLI through the same worker; explicit pre-effect extension restores all eight actual native tools and reuses the shared permission decision | **experimental**, exact local 0.85.1 qualification only; runtime/package/launcher bytes and permission config rechecked before launch; native terminal and one-to-one decision/completion observations required; Bash network requests remain execute events |

`run-slice.cjs` composes the existing launcher/status/cancel boundary for one explicit
finite wave. Its immutable packet and attention live under `.ultra/.runtime/runs/`;
they are execution observations, never project authority. It validates the complete
wave before launching, preserves existing fences and never relaunches during
reconciliation. `pi-primary.cjs`, loaded by the ordinary Pi entry, registers native
W1/W2 tools and binds completion input to the current native session. Delivery is
claimed before send; duplicate native extension input is handled before inference;
consumption additionally needs model acknowledgement and remains confirmed through
a later turn failure or session death.
These finite W1/W2 paths introduce no daemon, semantic scheduler or automatic repair.

`slice-channel.cjs` holds the same finite controller in a separate child process,
using a dedicated IPC descriptor and filtered descendant environment. It accepts
only the original run/slice/session and exact retained attention digest; ordinary
delegates inherit their own explicit stdio, not the Primary message channel.
`slice-workspace.cjs` uses ordinary Git registration and the existing delegate fence
for lifecycle effects. Cleanup refuses dirty/ignored data and preserves exact
clean HEAD under a retained Git ref before removal. RunSlice draft compilation
fills current hashes only; route, profile, budgets, wave and repair remain model
choices. Original task context and typed results remain the knowledge/recovery
inputs; there is no parallel operational plan authority.

`durable-run.cjs` adds an opt-in, single-checkpoint lifecycle under an exact owner
durable grant. The current native Pi session registers its real identity; a finite
process waits for the old Primary and RunSlice Supervisor to stop before claiming
one fresh native turn. Activation and event claims are retained under
`.ultra/evidence/durable/`; disposable cursor loss cannot authorize replay.
Grant references, execution source, expiry, revocation, machine/boot identity,
retained results and stopped writers are checked before dispatch. The fresh Pi
extension repeats effect checks and retains its own deadline and abnormal-exit
attention path. Optional local macOS notification uses one persistent request;
OS acceptance is distinct from delivery to the owner. Unknown launch/delivery
remains unknown, with no new semantic plan, automatic acceptance or finalization.
Physical reboot continuation and other Host W4 paths remain unqualified.

Therefore the current portable launcher accepts an empty `external_effects` list, removes shell, web and subagent
tools where native surfaces permit, and combines native isolation with a verified Git
diff. It does not falsely claim a per-root OS sandbox on hosts that do not expose one.
The parent treats the isolated diff and receipt as untrusted input, inspects them, and
performs integration or any external effect itself.

## Verification and Release

```text
source contract tests
  -> Hook tests
  -> fourteen Skill Creator validations
  -> generated Codex Plugin Creator validation
  -> isolated six-host install / Doctor / uninstall
  -> npm verify:release
  -> npm pack --dry-run --json
```

Each arrow depends on the previous artifact state but does not authorize commit, push,
real HOME installation, provider calls, publication, or deployment.

Test records the exact active Change, ordered current task ids and v2 task-evidence
projections, intent SHA-256, HEAD, and product-worktree digest. Each projection carries
the task id, evidence schema/ref/digest, and task-review session/summary digest; the
evidence digest already binds the Acceptance-section SHA and each separately rechecked
command/external raw receipt SHA. Deliver first reconciles
review/spec/docs; any semantic or product change requires a fresh Test. Only a second
entry with matching identities may
apply the changed-export gate, run build and non-publishing package inspection, write
delivery metadata, and move the same id to archive. Change-directory metadata and
`.ultra/evidence/**` publication are excluded from the product digest while intent bytes
and exact raw/record evidence digests are checked independently. Release
package creation remains blocked until every changed export has a non-test consumer or
an owner disposition.

## Quality Scenarios and Risks

| Trigger | Expected response | Verification | Residual limit |
|---|---|---|---|
| Interrupted init | rerun creates only missing assets and preserves existing bytes | package smoke and init tests | semantic placeholders still require owner/model |
| Corrupt Hook observation | normalize to known shape without losing new evidence | Hook regression | derived history may be discarded |
| Child lies about success or writes elsewhere | actual Git diff/schema/digest check fails terminally | delegate regression | host-owned non-filesystem effects cannot be rolled back by Git |
| Unsupported host scope or Hook trust | preflight/Doctor reports exact limitation | adapter tests | owner performs native trust action |
| Cross-host resume | canonical files plus Git reconstruct current task | artifact audit | no conversational memory is promised |
| Sequential Change after an abandoned unfinished task | active-id filtering selects only the new Change while preserving history | Hook and artifact regressions | one primary writer per worktree remains required |
| Model discovers a public workflow without live activation | resident entry guard stops before workflow work | execution-grant contract regression | owner explicitly selects, reactivates, or re-verifies the exact grant |
| Host emits malformed structured delegation output | launcher publishes a typed terminal failure and counts no partial text as evidence | authenticated Grok conformance drill | retry only after host output conformance changes |

## Product Traceability

| Product requirement | Architecture section | Evidence |
|---|---|---|
| FR-01, FR-02, FR-03, FR-07 | Adaptation and Routing; Agent-to-Skill Convergence | adapter, package, and authoring tests |
| FR-04 | Authority and Recovery | artifact audit and boundary tests |
| FR-05 | Hook Boundary | Python Hook suite |
| FR-06 | Delegation Boundary | Node delegation suite |
| FR-08 | Verification and Release | validators, full gate, dry-run package |
| FR-09, FR-10 | Authority and Recovery; Baseline maturation | boundary, sequential lifecycle, Hook scope, and freshness tests |
