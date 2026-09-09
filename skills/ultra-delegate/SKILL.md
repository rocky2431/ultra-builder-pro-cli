---
name: ultra-delegate
description: Delegate one bounded workflow segment to another installed Agent runtime through conformance-gated ACP-first stable v1 with a typed result-compatible CLI fallback, then return only its stable isolated-worktree result. Use when the owner asks another model or host to execute, review, verify, or continue a specific slice of current work.
---

# Run a bounded worker without giving it project authority

Delegation is an execution mode, not another workflow stage. The primary host keeps
semantic synthesis and remains the only writer of `.ultra/tasks.json`.

Delegation is also not a primary transfer. A delegated worker never becomes the
work package's canonical writer, whatever its result says; moving that role to
another Agent requires the owner-directed OFFER → ACK → RESULT protocol in
`../ultra-change/references/primary-transfer.md`, which stays mutually exclusive
with this bounded-worker path.

## Route modes

| Mode | Entry | Observable exit | Next |
|---|---|---|---|
| `task` | Explicit owner authorization for one task execution or continuation slice | One validated terminal worker result and isolated diff are returned to the primary writer | Return to the primary `ultra-dev` task for interpretation and integration |
| `research` | Explicit owner authorization for one active Change's bounded evidence question | One validated terminal result carries the named evidence or a bounded unavailable path | Return to `ultra-research/change-scoped` under the primary writer |
| `aggregate` | Explicit owner authorization for one Change-level review or verification question | One validated terminal finding result is available without canonical `.ultra` writes | Return to the primary `ultra-test`, `ultra-review`, or requesting route |

Follow `../ultra-status/references/route-contract.md`. Delegation always remains an
explicit-entry capability, even when the surrounding Change has an Execution Grant.
Show one Route Card before launch and one after the terminal result. Worker events and
transport progress may update `Position`, `Delta`, or `Reality`; they never prove the
delegated slice complete or select the primary route.

## Before you start

Pi 0.85.1 is an experimental native CLI execution target, separate from the six
plugin installation hosts. Only its retained exact runtime/policy identity is
qualified; `--ack-experimental` alone cannot admit another installed version.
See the delegation contract for native tool, terminal and version binding details.

For a current owner-authorized parallel wave, read
`references/finite-run-slice.md`. The native Pi entry exposes `ultra_slice` for
one finite wave and W1/W2 attention, using the same qualified delegation boundary.
The Primary selects the packet and role profile, interprets results and integrates.
The controller never chooses repairs, creates a later wave or declares completion.

1. Resolve exactly one active `change_id`, then select one scope and name it in
   `instruction.md`:
   - **task execution or continuation** — select one matching task and read its full
     `context_file` and `## Resume Note`;
   - **scoped Research evidence** — read the active intent's Research Disposition,
     named question, sources, and required exit evidence;
   - **aggregate Change review or verification** — read the exact matching task ids,
     relevant contexts, current report or review summary, and Change diff.
   Research and aggregate read-only scopes do not require a task. An archived or
   abandoned task cannot be delegated as current work.
2. Read `CONTEXT.md`, relevant `.ultra/decisions/`, acceptance and current evidence.
3. Define one bounded instruction, permission set, clean Git worktree and result.
4. Read `references/delegation-contract.md` before writing either JSON artifact.

## Definition of done

- The worktree is a clean registered Git worktree; instruction, permission and worker
  spec digests remain unchanged.
- The worker terminates as `finished`, `blocked` or `failed` in a schema-valid
  `result.json`; declared paths equal the actual Git diff and stay in writable roots.
- No `writable_roots` entry is `.ultra/` or sits under it, and the actual diff touches
  nothing there.
- Timeout and cancellation reach a terminal failed result and release `run.lock`.
- ACP updates stay in a derived redacted event journal; no `agent_thought_chunk`, raw tool
  input/output, credential, session, or stop reason can establish Ultra completion.
- The primary host verifies the result against the selected scope's task acceptance,
  Research exit evidence, or aggregate review/verification question.

## Prepare and run

Write under `.ultra/.runtime/delegations/<id>/`:

- `instruction.md`: scope type, stable `change_id`, optional task id, bounded goal,
  sources, acceptance or exit evidence, and forbidden effects;
- `permission.json`: the exact file-local boundary in the contract reference;
- `result.json`: launcher-published terminal artifact only.

`writable_roots` is an array of existing worktree-relative directories. An empty array
selects native read-only mode; one or more roots selects bounded write mode.
**Neither `.ultra/` nor any path under it may appear in it.** The worktree carries a
checkout of `.ultra` because Git tracks it, but the project's memory has exactly one
writer. Two workers appending to `tasks.json`, `progress/` or `evidence/` in separate
worktrees collide in the very files every later session reads to resume. Worker findings
and state changes travel back in `result.json` and are applied by the primary host.
`external_effects` must be empty in this portable launcher: commit, push, publish,
deployment and other effects stay with the primary host. There is no `readable_roots`
claim because the six host sandboxes do not share one mechanically enforceable read
policy.

Create `.ultra/.runtime/worktrees/<id>` as a real Git worktree and run:

```text
node <loaded-ultra-delegate-skill-dir>/scripts/delegate.cjs run --to <host> --instruction <file> --permission <file> --worktree <dir> --timeout <seconds>
```

Resolve `<loaded-ultra-delegate-skill-dir>` from this Skill's actual loaded path. The
Skill-local launcher and worker are the canonical runtime. Do not search `PATH` for
`ubp`, install a global Ultra package, or invoke `npx` to locate Ultra during
delegation. The Codex ACP profile may separately execute its exact pinned adapter
package through `npx`; that transport dependency is declared in the profile. The Claude
ACP profile prefers the managed agent-delegation registry's preinstalled
`@agentclientprotocol/claude-agent-acp` adapter and injects the registry's exact
`CLAUDE_CODE_EXECUTABLE` native binding; without a healthy registry binding it keeps the
pinned `npx` route, and an explicit `ULTRA_CLAUDE_ACP_COMMAND` absolute override wins
exactly like the ZCode bridge selector.
`ubp delegate ...` is a one-release compatibility wrapper only. The Claude
ACP profile resolves its candidate exactly once per launch: one
override/registry resolution binds the adapter argv, the identity probe, the
declared runtime file, and the injected `CLAUDE_CODE_EXECUTABLE` native
binding together, so an ordinary registry update between selection and launch
either keeps executing the originally bound files or refuses typed — the
launcher env never carries a different native file than the selection hashed.

`<host>` is `claude`, `codex`, `opencode`, `kimi`, `grok`, `pi`, or `zcode`. Kimi accepts an
optional `--model <id>` when its account has no default headless model. A ZCode primary
host uses this same command to delegate to any other installed Agent runtime; a different
primary host can select `--to zcode --ack-experimental` through the ZCode headless profile.

The launcher selects one `AgentExecutionDriver` per Host. A stable ACP v1 stdio
candidate is preferred only when that exact Host's versioned conformance row is
`passed`, names a non-empty evidence reference, and its executable and declared
candidate-identity probes succeed. The probes are bounded local version checks; they
inspect capability, executability, and pinned runtime identity without starting a
provider task. Every other case uses the
result-compatible `CliDriver` and records `execution_driver`, `acp_capability`, and the
exact `driver_fallback_reason` in the receipt and terminal result. Do not edit a
conformance row merely because a binary or help command exists.
`ULTRA_DELEGATE_FORCE_CLI=1` is the explicit operator recovery switch: it selects the
same bounded `CliDriver` with `acp_forced_cli` without deleting the ACP candidate or
changing its evidence row.

Before the worktree fence, the worker spec, the worker, or any Host process exists,
the launcher also admits the selected transport through the retained host enforcement
qualification: it compares this Packet's required enforcement dimensions —
`writable_scope` for a write packet, plus `outside_root_denial`, `shell_tool_denial`,
`agent_tool_network_denial`, and `point_of_use_effect_boundary` for every packet —
against the exact Host capability facts recorded for that transport and exact installed
identity. A record exists only where an exact-version, coordinator-owned, redacted,
no-production observation was retained; a Host without one makes no capability claim
and keeps its conformance-gated admission. A missing, unknown, unsupported, or
version-mismatched dimension returns one typed `host_enforcement_unavailable`
diagnostic that creates no Host process and never falls back silently to another
transport or Host.

When the retained qualified identity string-matches the declared candidate, admission
also consumes the observed execution identity rather than the declared strings alone:
selection digests the actual adapter executable, the native runtime file, the resolved
public ACPX entry, and the name/version/package.json SHA-256 of the public SDK package
that entry loads (resolved exactly as Node resolves it from the entry's real path), and
compares them with the fingerprints the qualification bound. For such a bound route the
candidate argv is built over the exact resolved runtime path, and the binding retains
the resolved adapter and runtime paths alongside the content digests. A
record that could admit the ACP route without that binding, an unreadable file, or
drifted bytes — same declared versions or not — fails closed through the typed
candidate-identity seam before the fence, the worker spec, or any Host process. The
verified resolution is bound into the digest-bound worker spec and rechecked at launch,
where the bound adapter path launches directly (never re-resolved against the worker's
PATH or cwd) and every qualified component — adapter, runtime, entry, and SDK package —
must still match at the bound paths; changed content refuses the launch with
`acp_execution_identity_mismatch`. Every launcher ACP selection must carry the
launch-bound public entry it resolved, and a string-matching qualified route must carry
the verified execution identity; a driver selection without the required binding —
for example a command/args override chooser — is refused before any Host effect, while
the conformance bootstrap stays the explicit no-record seam that binds the entry it
resolved. This binds the entry file plus the SDK package
identity only — it is not a whole-`node_modules` attestation and not a defense against
a malicious OS writer. The same admission governs the one pre-session authentication
fallback: the CLI fallback is bound into the worker spec only when the CLI transport
itself is admitted against the Packet's required dimensions, so an ACP-only
qualification binds no fallback and the typed ACP failure stands alone, while an
unrecorded Host keeps its existing fallback behavior.

The one retained record binds the installed `zcode-acp 0.1.0+ultra.zcode.0.16.5`
bridge over ZCode runtime `0.16.5`, retained unchanged as history: selection now
declares the repaired `.r1` marker below, so the declared identity is version-mismatched
against this record until a new exact-identity qualification of the repaired build is
retained. Its single authorized call observed `writable_scope`
unsupported — the ACP edit request carried no provable location, so the product denied
it before any write — and every later effect dimension unobserved, so they stay
unsupported rather than inferred from zero side effects. Both ZCode transports
therefore answer any delegation Packet — read-only or write — with the typed
unavailable diagnostic before launch, with no silent fallback to the CLI transport or
another Host; analysis and other delegation stay available through their own qualified
profiles, and the transport maturity stays `experimental`. Provider transport for the
qualification call was separately authorized only and never grants Worker effects;
adapter preinstallation (no runtime package fetch), env-key isolation,
credential-value redaction and receipt truth are recorded as separate product-side
facts that never satisfy a Packet enforcement dimension. The redacted receipt is
retained under `.ultra/evidence/vnext-d1-host-enforcement-qualification/`.

`AcpDriver` drives the generic engine through the installed public
agent-delegation entry (pinned ACPX runtime, selected by the explicit
`ULTRA_DELEGATE_ACPX_ENTRY` override, then the managed installer's
`acpx_delegate_entry` registry binding in `~/.config/agent-delegation/config.json`,
then the legacy fixed install root for pre-registry installs; an invalid override or a
broken registry binding fails closed, and a missing entry is the
typed `acp_entry_unavailable` CLI fallback): Ultra launches the entry with the
sanitized descendant environment inside its observed process group, the entry
negotiates protocol v1 and refuses the turn with a typed
`unsupported_protocol_version` failure before any prompt unless stable v1 was
actually observed on the pinned runtime's public session record (the manager
may already have created the agent session by then; no prompt, tool call, or
model turn is submitted), creates one session at the absolute isolated-worktree
`cwd`, sends the digest-bound packet as one text prompt, and streams runtime
events, raw permission requests, and one typed terminal result back. The
published `acp_protocol_version` is that observed negotiation report only —
never a constant derived from the presence of a typed result, and unobserved
(`null`) when initialization persisted no session record. Client-side
filesystem and terminal callbacks stay deny-all inside the entry, so the client
surface equals a no-fs/no-terminal advertisement; native Host tools route
through Ultra's raw permission decision. Raw protocol traffic is never
persisted; only bounded redacted derived-event metadata is retained. An
edit/delete/move request is granted with `allow_once` only when all declared
locations are already inside `writable_roots`; scope widening and execution,
fetch, mode-switch, or unknown operations select an offered rejection, are
recorded, and leave the bounded turn reachable for later probes — the terminal
stays a typed `permission_denied` when any denial occurred. `allow_always` is
never selected. Only an `acp_auth_required` failure that carries the entry's
structured `ensure_session` phase — the proof that `startTurn` was never called
— runs the already-bound `CliDriver` once (bound only when the CLI transport
itself is admitted through the same Packet admission above) and records the
failed ACP attempt as
redacted fallback metadata. Auth-shaped failures at any later phase, and every
other ACP failure, are never retried, so recovery cannot duplicate a provider
task. The driver does not copy or solicit credentials.
Creation-time session metadata before the `session/new` response is routed by the
public entry's connection-owner logic, which buffers and folds updates per owner and
turn without per-message session-ID comparison; the driver consumes the entry's
public events, which carry no session ID, and adds no buffering bound, replay, or
session-identity gate of its own.

The ZCode headless transport is `experimental`: its thin profile invokes the
independently installed `zcode-acp` v0.1.0 bridge, pinned to source commit
`42fe149d4b501469343c01f23ba3801832306d53` plus the digest-bound ZCode 0.16.5
runtime-preferences patch under this Skill's `patches/` directory, and passes only the
installed ZCode Desktop runtime path (or the operator's explicit PATH/test override).
Selection verifies both the repaired bridge build marker
`zcode-acp 0.1.0+ultra.zcode.0.16.5.r1` — a revision distinct from the originally
installed `0.1.0+ultra.zcode.0.16.5` build, which stays bound only to the retained
negative qualification record — and the installed runtime version `0.16.5` before
using the passing receipt.
Ultra ships the source patch but never redistributes the bridge binary or App bytes.
Host identity and provider identity are separate; the verified local runtime uses the
Owner's domestic BigModel provider rather than international Z.AI OAuth. The installed
`app-server` remains a
ZCode Protocol surface behind that bridge, not ACP evidence by itself; the ZCode row
can pass only from its own provider-backed conformance receipt. The runtime remains
an App-internal or PATH CLI with
no public stability contract, and it is **not** the documented ZCode Desktop
interactive surface. `delegate run --to zcode` refuses to launch until the invocation
explicitly carries `--ack-experimental`; since the retained host enforcement
qualification, an acknowledged ZCode invocation is still refused before launch by the
typed `host_enforcement_unavailable` diagnostic. Any admitted experimental launch
prints a stderr warning and
records `transport_maturity: "experimental"`, the exact `transport_surface` wording,
and `experimental_ack: true` in the receipt, the worker spec, and the terminal result
(including failure and timeout recovery results), so no receipt can imply a documented
Desktop session. Promotion requires official documentation plus a full recovery drill.

The command returns a receipt. `status --delegation <dir>` reports the active driver,
fallback reason, and latest safe derived ACP observation when present; that observation
is execution telemetry, not a route or completion verdict. Immediately run
`python3 <loaded-ultra-delegate-skill-dir>/scripts/delegate_wait.py <result.json>`; read
no intermediate output. Use the same Skill-local Node entrypoint with `status
--delegation <dir>` for a read-only state and `cancel --delegation <dir>` to request
termination. The receipt carries the exact canonical cancel command. Never delete a
lock to manufacture completion.

The worker returns one schema-constrained JSON final response. The launcher extracts it
from the host's native structured output, validates digests, process exit, exact schema,
actual base-HEAD diff and writable roots, then atomically publishes `result.json`. The
launcher embeds the exact digest-bound instruction and permission packet in the prompt,
so a host that denies external-directory reads never needs authority outside the
worktree. The model never writes its own receipt. If owner input is needed, the worker terminates
`blocked` with questions and evidence; start a new id and fresh packet after obtaining
the answer.

After `finished`, inspect the isolated diff, rerun acceptance checks, and integrate via
the repository's normal Git workflow with ordinary authorization. Delegation never
auto-merges or writes canonical task/evidence files.

## Synthesize multiple results

Three agreeing results are Consensus. Two of three are Majority and require examining
the dissent. Three different results are No Consensus: narrow the question or add
evidence. A failed delegated Agent runtime does not block the underlying workflow; report the
missing evidence rather than turning a vote or score into truth.

## When the owner decides

The owner authorizes delegation. External effects cannot be delegated by this launcher;
the primary host obtains their separate authorization. The primary host owns result
interpretation, risk acceptance, integration and task state.

## References

- `references/delegation-contract.md` — strict permission, receipt and result schemas.
- `scripts/delegate.cjs` — canonical installed launcher and status/cancel entrypoint.
- `scripts/delegate_wait.py` — run immediately after the launch receipt.
- `../ultra-status/references/route-contract.md` — owner-visible route, checkpoint, and recovery output.
- `../ultra-think/SKILL.md` — read when No Consensus exposes a consequential decision.
- `../ultra-think/references/autonomy-boundary.md` — read before granting write effects.


For repeatable multiwave work, read [operational factory](references/operational-factory.md)
for model-owned route/profile selection, registered Git worktrees, draft compilation,
qualified external-controller attention, bounded partial-failure recovery and cleanup.
This method reuses current task context and canonical consumers; it grants no new
provider, execution, publication or cross-session authority.

For an explicitly selected durable work-package that must cross the old Pi
session's exit, read [one durable checkpoint](references/durable-checkpoint.md).
The native `ultra_durable` tool registers one finite wave and at most one fresh
turn under the exact owner grant; status files alone never activate it.
