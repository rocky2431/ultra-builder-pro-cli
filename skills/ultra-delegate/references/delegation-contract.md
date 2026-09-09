# Delegation artifact contract

## Runtime ownership

The loaded `ultra-delegate` Skill owns `scripts/delegate.cjs`,
`scripts/delegate-worker.cjs`, `scripts/host-profile.cjs`,
`scripts/agent-execution-driver.cjs`, `scripts/acp-driver.cjs`,
`scripts/cli-driver.cjs`, `scripts/pi-native-runtime.cjs`,
`scripts/pi-native-permissions.cjs`, `scripts/acp-conformance.cjs`, and its launch-only profiles.
Invoke the launcher with the loaded Skill's absolute path. It has no package-root or
global `ubp` dependency. The Codex profile invokes its exact pinned ACP adapter
package through `npx`; the Claude profile prefers the managed agent-delegation
registry's preinstalled adapter (with the registry's `CLAUDE_CODE_EXECUTABLE` native
binding injected by the launcher, overridable through `ULTRA_CLAUDE_ACP_COMMAND`) and
keeps the pinned `npx` route only without a healthy registry binding; no `npx` lookup
is used to locate Ultra itself.
The package `ubp delegate` command is a thin
one-release compatibility import of the same functions; it contains no launcher or
worker behavior of its own. The Claude registry route is bound by one
resolution per launch: adapter argv, identity probes, the declared native
runtime file, and the injected `CLAUDE_CODE_EXECUTABLE` all come from the
same selection, so an ordinary registry update between selection and launch
keeps executing the originally bound files or refuses typed, never a mix.
A retained positive Claude qualification additionally binds, beyond the
generic adapter/runtime/entry/ACPX-package fingerprints, the actual native
permission configuration at the execution root
(`.claude/settings.json` and `.claude/settings.local.json`, digested as one
composite by `claudeNativeSettingsObservation`) and the Claude SDK package
the adapter resolves (`resolveClaudeSdkPackage`); a worktree with missing or
changed native policy, or a changed SDK package inside the same
adapter/native versions, does not inherit the qualified result.

The experimental Pi 0.85.1 target uses the installed native JSON CLI through the
same worker and result contract. It requires `--ack-experimental` and an exact
retained enforcement qualification; a changed runtime or policy refuses before
launch. The verified-local receipt is identified in the profile. This execution
target does not add a Pi plugin installer.
The launcher binds the installed Node/Pi runtime, permission source, tool module,
and immutable permission envelope again immediately before spawning. Its explicit
extension restores all eight actual native tool definitions after registering the
shared Ultra permission decision; Bash remains available for attempted calls and
is mechanically denied under the no-external-effects envelope. A network request
through Bash remains an `execute` event, never a fabricated `fetch` event. Native
completion and every tool decision must reconcile before the final assistant JSON
can become a result. Expected denied effects produce `permission_denied`, not a
successful deliverable. Earlier messages and process exit zero cannot substitute
for the final native terminal.

## Permission

```json
{
  "$schema": "ultra-delegation-permission-v1",
  "writable_roots": ["src", "test"],
  "external_effects": []
}
```

Fields are exact. Roots are normalized worktree-relative directories that already
exist. An empty array selects native read-only mode; `.` deliberately grants the whole
isolated checkout except `.ultra/`. Absolute paths, symlink escapes, unknown fields,
`readable_roots`, `.ultra` or any path beneath it, and non-empty external effects are
rejected.

`.ultra/` is never writable by a worker under any root, `.` included. The project's
memory has exactly one writer — the primary host — because two worktrees appending to
`tasks.json`, `progress/` or `evidence/` collide in precisely the files a later session
reads to resume. Enforced twice: the launcher rejects a `.ultra` root before the
delegation starts, and the worker fails an actual diff that touches it with
`unauthorized_write`.

This boundary also separates delegation from a primary transfer: a delegation result
is a bounded observation returned to the primary host, and no delegation receipt can
serve as, upgrade into, or substitute for the OFFER/ACK/RESULT receipts of a primary
transfer (`../ultra-change/references/primary-transfer.md`). Widening a worker to write
`.ultra` in order to simulate a transfer is a contract violation, not an integration
shortcut.

## Model final response

```json
{
  "$schema": "ultra-delegation-result-v1",
  "status": "finished",
  "summary": "Implemented the bounded slice.",
  "changed_files": ["src/example.ts"],
  "checks": [
    {"command": "npm test -- example", "status": "passed", "output_ref": "stdout.log"}
  ],
  "evidence": ["src/example.ts"],
  "questions": [],
  "residual_risks": []
}
```

Fields are exact. Status is `finished`, `blocked`, or `failed`; `blocked` requires a
question. Check status is `passed`, `failed`, or `not_run`. Changed files are unique,
normalized repository-relative paths and must exactly equal the launcher's Git diff.
`output_ref` is requested for every check and required in the native schema projection
used by hosts that accept one. The launcher remains compatible with hosts that return
the otherwise exact check without that optional evidence pointer.

The launcher embeds the exact instruction and permission sources with their digests in
the host prompt, extracts this object from native structured output, and adds
`delegation_id`, `host`, instruction, permission, and output-schema digests,
`read_only`, `base_head`, `final_head`, timestamps, `exit_code`, and signal. Launcher
failures also add `failure_type`. A nonzero process cannot publish `finished`.

Every receipt, worker spec, and terminal result also records the transport truth:
`transport_maturity` (from the Skill-local host profile) and the exact `transport_surface`
wording. The ZCode headless transport is `experimental` with no public stability
contract and is not the documented ZCode Desktop interactive surface; launching it
requires the explicit `--ack-experimental` flag, prints a stderr warning, and stamps
`experimental_ack: true` on the receipt, so no delegation record can misrepresent an
internal CLI run as a documented Desktop session — including failure, cancellation,
and timeout recovery results.

They also record `execution_driver`, `driver_fallback_reason`, and the probed
`acp_capability`, including candidate-identity validity when the profile declares
bounded local version probes. ACP results add negotiated `acp_protocol_version`, observed
`acp_stop_reason`, and `events_file`. `acp_protocol_version` is the entry's observed
negotiation report — the version the pinned runtime persisted on the public session
record from the initialization result — and nothing else: a typed result line, whatever
terminal status it carries, never turns it into 1, and an initialization that persisted
no session record (for example an authentication failure at session creation) stays
unobserved (`null`). These are mechanical observations only. In
particular, `stopReason: end_turn`, a completed tool call, an ACP plan, or process exit
cannot synthesize the exact model response above or satisfy its Git-diff validation.

## ACP v1 permission and event boundary

The generic stdio engine is the installed public agent-delegation entry (pinned ACPX
runtime): the entry is resolved from the explicit `ULTRA_DELEGATE_ACPX_ENTRY`
override, then the managed installer's `acpx_delegate_entry` registry binding in
`~/.config/agent-delegation/config.json`, then the legacy fixed install root; an
invalid override or a present-but-broken registry binding fails closed rather than
substituting another runtime. Ultra launches it with the sanitized descendant
environment, the entry starts
the Host inside its process group, and Ultra never ships a second protocol
implementation. The pinned runtime advertises client filesystem and terminal
capabilities as present, but the entry hard-requires `deny-all`, so every client-side
`fs/read_text_file`, `fs/write_text_file`, and `terminal/create` is denied at the
client; the effective client surface equals the previous no-fs/no-terminal
advertisement. Native Host tools route through the raw `session/request_permission`
callback below. The engine creates one fresh session with the isolated worktree as
absolute `cwd`, an empty MCP-server list, and one digest-bound text prompt. Before that
prompt, the entry verifies the actual negotiation through the pinned runtime's public
session record: unless stable protocol v1 was observed there, it refuses the turn with a
typed `unsupported_protocol_version` failure carrying the structured `ensure_session`
phase. The pinned manager creates the agent session before that record is persisted, so
an unproven or unsupported session may already exist at refusal, but no prompt, tool
call, or model turn is ever submitted on it, and the refusal's observed version (when
one was observed) is what `acp_protocol_version` reports. Agent-side
file tools remain inside the Host process and the existing worktree/diff enforcement
remains final. When the entry is absent or unreadable, driver selection reports the
typed `acp_entry_unavailable` CLI fallback instead of launching an ACP worker.

ACP `session/request_permission` uses least authority:

- read, search, and think may select an offered `allow_once`;
- edit, delete, and move may select `allow_once` only when every non-empty absolute
  location is already inside a granted real writable root and outside `.ultra/`;
- execute, fetch, mode switching, unknown operations, read-only writes, symlink escape,
  and every other widening select an offered rejection and make the run terminally
  denied;
- `allow_always` is never selected; cancellation answers any pending permission request
  with ACP's `cancelled` outcome.

Creation-time session metadata before the `session/new` response is routed by the
installed public entry, not by Ultra: the pinned runtime buffers and folds session
updates per connection owner and turn without comparing a per-message session ID, and
Ultra's driver consumes the entry's public events, which carry no session ID. Ultra
applies no early-session buffering, replay, or session-identity validation of its
own; the absence of the retired engine's per-message session-ID equality check is a
limitation of that public connection routing, not an Ultra guarantee.

`events.jsonl` is bounded disposable telemetry. It stores phase/update type, tool kind
and status, counts, permission decision/scope, and terminal stop reason. It drops
`agent_thought_chunk` entirely and never stores message text, titles, raw tool
input/output, credentials, or protocol wire payloads. Status re-projects the latest
record through the same fixed safe shape, so a malformed or replaced journal becomes
`event_journal_malformed` instead of being echoed. Loss of the journal does not affect
recovery or completion.

## Host enforcement admission

Before the worktree fence, the worker spec, the worker, or any Host process exists,
the retained host enforcement qualification drives admission: the launcher compares the
Packet's required enforcement dimensions with the exact Host capability facts retained
for the selected transport. A record exists only where an
exact-version, coordinator-owned, redacted, no-production observation was retained; a
Host without a record makes no capability claim and keeps its conformance-gated
admission path. A write Packet requires `writable_scope` in addition to the dimensions
every Packet requires: `outside_root_denial`, `shell_tool_denial`,
`agent_tool_network_denial`, and `point_of_use_effect_boundary`. A missing, unknown,
unsupported, or version-mismatched dimension produces one typed
`host_enforcement_unavailable` diagnostic that creates no Host process, never falls
back silently to another transport or Host, and names each failing dimension with its
observed status and the retained evidence binding.

A qualified identity that string-matches the declared candidate is also bound to the
observed execution bytes: selection digests the actual adapter executable, the native
runtime file, the resolved public ACPX entry, and the name/version/package.json
SHA-256 of the public SDK package that entry loads — resolved exactly as Node resolves
it from the entry's real path — and compares them with the
retained fingerprints. For such a bound route the candidate argv is built over the
exact resolved runtime path, and the binding retains the resolved adapter and runtime
paths beside the content digests. A positive record without that binding, an
unreadable file, or
drifted content fails closed through the typed candidate-identity seam before any
launch artifact; the verified resolution travels digest-bound in the worker spec and
is rechecked at launch, where the bound adapter path launches directly (never
re-resolved against the worker's PATH or cwd) and every qualified component — adapter,
runtime, entry, and SDK package — must still match at the bound paths; changed or
unprovable content refuses with
`acp_execution_identity_mismatch`. Paths may relocate between qualification and
selection; only the selection-retained paths and content identity bind a launch. Every
launcher ACP selection must carry the launch-bound public entry it resolved, and a
string-matching qualified route must carry the verified execution identity; a
selection without the required binding — for example a command/args override chooser —
is refused at the launcher before the fence, the worker spec, or any Host process. The
conformance harness stays the explicit no-record bootstrap: it binds the public entry
it resolved and cannot masquerade as a qualified route.
This covers the entry file plus SDK package identity — not a whole-`node_modules`
attestation and not a defense against a malicious OS writer. The same admission also
governs the one pre-session authentication fallback: `cli_fallback` enters the worker
spec only when the CLI transport itself is admitted against the Packet's required
dimensions, so an ACP-only qualification binds no fallback and the typed ACP failure
stands alone with no CLI process.

The retained ZCode 0.16.5 ACP qualification observed `writable_scope` unsupported —
edit requests carried no provable location, so the product denied them as
`outside_envelope` before any write — and every later effect dimension unobserved, so
both ZCode transports stay unavailable for delegation Packets while the transport
remains `experimental`. Provider transport for the qualification call was separately
authorized only and is never Worker effect authority; adapter preinstallation (the
installed adapter invoked directly, no runtime package fetch), env-key isolation,
credential-value redaction and receipt truth are recorded as separate product-side
facts and never satisfy a Packet enforcement dimension. The redacted receipt is
retained under `.ultra/evidence/vnext-d1-host-enforcement-qualification/`.

## Recovery

- `status` distinguishes running, cancelling, stalled, and terminal artifacts.
- ACP status may also expose the latest redacted derived event; it remains non-authoritative.
- Denied permission requests stay recorded while the bounded turn continues toward later
  probes; the driver's terminal stays `permission_denied` when any denial occurred.
- Raw entry traffic is never persisted: `stdout.log` stays empty, and safe observations
  exist only as derived events, the typed result, and `host_output`.
- `cancel` writes `cancel.request`; the worker terminates its host process, publishes a
  failed result with `failure_type: cancelled`, and removes `run.lock`.
- `--timeout` does the same with `failure_type: timeout`.
- `ULTRA_DELEGATE_FORCE_CLI=1` bypasses ACP selection for one operator-controlled run
  and records `acp_forced_cli`; it does not mutate the conformance record.
- `acp_auth_required` runs the immutable bounded CLI fallback once and records
  `acp_fallback.prompt_sent: false` only when the entry's failed result carries the
  structured `ensure_session` phase — the pre-prompt proof that `startTurn` was never
  called — and only when the destination CLI transport was itself admitted through
  the same Packet admission (an ACP-only qualification binds no fallback, so the
  typed ACP failure stands alone and no CLI process starts). An auth-shaped failure
  arriving at any later phase keeps its typed result,
  never starts the CLI, and records no `prompt_sent` claim. No other ACP failure is
  retried, preventing duplicate provider work.
- A stopped worker with no result is recoverable through `cancel`, which finalizes the
  stale run. Retry under a new delegation id and fresh digests.
- Liveness proofs are conservative at every seam: only the kernel's `ESRCH` proves a
  pid dead. `EPERM` means the target exists but is not signalable by the observer and
  stays alive; any other signal outcome is unprovable and stays unknown. Neither may
  synthesize a terminal, delete `run.lock`, or release the worktree fence.
## Finite composition

An explicitly authorized wave can compose this same single-worker boundary through
[RunSlice v1](finite-run-slice.md). It requires positive exact Host qualification for
every attempt, preserves permissions, writer observations and fences, and adds only
whole-wave admission, finite waiting and one mechanical attention. It does not grant
new effects, replace the result contract or transfer the canonical writer role.
