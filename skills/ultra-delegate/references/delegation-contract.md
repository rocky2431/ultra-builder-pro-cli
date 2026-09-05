# Delegation artifact contract

## Runtime ownership

The loaded `ultra-delegate` Skill owns `scripts/delegate.cjs`,
`scripts/delegate-worker.cjs`, `scripts/host-profile.cjs`,
`scripts/agent-execution-driver.cjs`, `scripts/acp-driver.cjs`,
`scripts/cli-driver.cjs`, `scripts/acp-conformance.cjs`, and its launch-only profiles.
Invoke the launcher with the loaded Skill's absolute path. It has no package-root or
global `ubp` dependency. The Claude and Codex profiles separately invoke exact pinned
ACP adapter packages through `npx`; no `npx` lookup is used to locate Ultra itself.
The package `ubp delegate` command is a thin
one-release compatibility import of the same functions; it contains no launcher or
worker behavior of its own.

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
`acp_stop_reason`, and `events_file`. These are mechanical observations only. In
particular, `stopReason: end_turn`, a completed tool call, an ACP plan, or process exit
cannot synthesize the exact model response above or satisfy its Git-diff validation.

## ACP v1 permission and event boundary

The stdio client advertises no client filesystem, terminal, or terminal-auth
capability. It creates one fresh session with the isolated worktree as absolute `cwd`,
an empty MCP-server list, and one digest-bound text prompt. Agent-side file tools remain
inside the Host process and the existing worktree/diff enforcement remains final.

ACP `session/request_permission` uses least authority:

- read, search, and think may select an offered `allow_once`;
- edit, delete, and move may select `allow_once` only when every non-empty absolute
  location is already inside a granted real writable root and outside `.ultra/`;
- execute, fetch, mode switching, unknown operations, read-only writes, symlink escape,
  and every other widening select an offered rejection and make the run terminally
  denied;
- `allow_always` is never selected; cancellation answers any pending permission request
  with ACP's `cancelled` outcome.

An agent may send creation-time `available_commands_update`, `current_mode_update`,
`config_option_update`, or `session_info_update` before the `session/new` response.
Ultra holds at most 32 such messages and 256 KiB transiently, persists no raw payload,
and replays them only after every message session ID equals the returned session ID.
Any other early update kind, identity mismatch, count overflow, or byte overflow is a
typed failure; pre-session buffering cannot contribute model result text.

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
- `cancel` writes `cancel.request`; the worker terminates its host process, publishes a
  failed result with `failure_type: cancelled`, and removes `run.lock`.
- `--timeout` does the same with `failure_type: timeout`.
- `ULTRA_DELEGATE_FORCE_CLI=1` bypasses ACP selection for one operator-controlled run
  and records `acp_forced_cli`; it does not mutate the conformance record.
- `acp_auth_required` reported by `session/new` before any prompt was sent runs the
  immutable bounded CLI fallback once and records `acp_fallback.prompt_sent: false`.
  No other ACP failure is retried, preventing duplicate provider work.
- A stopped worker with no result is recoverable through `cancel`, which finalizes the
  stale run. Retry under a new delegation id and fresh digests.
