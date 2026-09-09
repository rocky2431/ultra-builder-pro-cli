# One durable Pi checkpoint

Use only after the owner explicitly selects a **durable work-package** for this
Change and authorizes the precise local effects. Ordinary session-local grants,
Resume notes and files discovered on disk never activate this path. The selected
Pi entry exposes `ultra_durable`; pass its `grant` argument a project-relative JSON
filename, never inline JSON. Registration binds the actual current session and PID.

This W4 path runs one existing finite RunSlice, waits for its Supervisor and old
Primary to stop, then starts at most one fresh native Pi turn to read retained
results and perform the authorized local work. Use the finite-slice contract for
the packet and qualified Workers. This is a bounded checkpoint, not an indefinite
agent service. Current machine support is macOS and Linux with the qualified Pi
native runtime; no other Host inherits that qualification.

## Exact grant

Store the grant under `.ultra/decisions/`. Required fields are:

| Field | Value |
| --- | --- |
| `$schema`, `mode` | `ultra-durable-grant-v1`, `durable work-package` |
| `grant_id`, `change_id`, `run_id`, `slice_id` | Explicit matching identities; letters, digits, `_` or `-`, starting with a letter or digit, at most 96 characters |
| `repository`, `base_revision` | Canonical absolute project directory and current full Git HEAD |
| `owner_decision` | Exact owner grant under `.ultra/decisions/` |
| `intent` | `.ultra/changes/active/<change_id>/intent.md` |
| `task_refs` | One to 32 exact references covering the packet's tasks and every additional task input needed after exit |
| `permission` | Existing `ultra-delegation-permission-v1` envelope |
| `prompt`, `packet` | Fresh turn instructions and existing finite RunSlice JSON |
| `model` | Explicit installed Pi model selector |
| `expires_at` | Absolute expiry timestamp, at or after the finite packet deadline |
| `revoked_path` | Explicit marker path under `.ultra/decisions/` |
| `max_fresh_turns` | Exactly `1` |
| `turn_timeout_seconds` | Integer from 1 to 86400, also bounded by expiry |
| `notification` (optional) | `none` (default) or explicit `macos` |

Each reference is exactly `{ "path": "project-relative-file", "sha256": "64-lowercase-hex" }`.
Hash actual retained bytes. The packet binds the current native session; generate
it in that session as described in [finite slices](finite-run-slice.md). Keep all
referenced inputs unchanged during the checkpoint. Writable roots must exclude
all cited authority, `.ultra/` and `.git/`. The fresh session retains all eight
native tools; the existing permission boundary rejects shell and out-of-scope
effects. Do not grant publication, installation or finalization through this path.
The model must select the complete input set: a matching Git HEAD does not bind
unreferenced dirty files. The native tool permission boundary is not an OS sandbox
against another same-user process replacing filesystem paths during a tool call.

## Observe and revoke

```sh
ubp slice durable status --grant <grant-id>
ubp slice durable revoke --grant <grant-id>
ubp slice durable wake --grant <grant-id>
```

`status` is observation. `revoke` writes the explicit marker and requests finite
slice cancellation; inspect actual process termination before reporting it stopped.
`wake` rechecks the existing registration, authority, exact inputs, stopped writers
and retained results. It cannot register a missing checkpoint or authorize another
turn. Input drift, changed source, expiry, revocation, unknown writers, existing W2/W3
delivery or changed machine/boot require owner attention. Never delete receipts to
make a retry eligible.
An interrupted activation or Supervisor launch may leave insufficient evidence to
continue; it remains unknown even if no useful work is visible. Same-boot PID reuse
can conservatively delay continuation until grant expiry. Neither condition permits
relaunch or a claim that recovery succeeded.

Activation and event claims under `.ultra/evidence/durable/` survive missing
`.runtime` cursors. A claim is synced before native input, so delivery interrupted
after that point stays `delivery_unknown` and is never automatically replayed,
including through a second grant for the same run/slice. Physical reboot recovery
has not been qualified; a different boot is rejected rather than inferred safe.

The fresh Primary must inspect the original grant, intent, tasks and actual results.
Its final JSON uses `$schema: "ultra-durable-consumption-v1"`, the supplied
`event_key` and `claim_nonce`, and a factual string `decision`. `consumed` means
one new native session completed and stopped with observed permission decisions;
it is not Review/Test/Deliver acceptance and authorizes no further wave.

With explicit `notification: "macos"`, the lifecycle process makes one local OS
notification request for completion or required attention. The saved OS acceptance
does not prove the owner saw a banner. An interrupted or unavailable notification
is not retried automatically; use `status` and retained evidence.
