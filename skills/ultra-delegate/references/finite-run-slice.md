# Finite RunSlice v1

Use this only for a current owner-authorized finite parallel wave. The Primary
model chooses decomposition, role assignments, the integration seam and the next
decision. The controller validates facts, starts the explicitly listed attempts,
waits mechanically and returns one bounded attention. It cannot choose a repair,
create another wave, change providers or declare the product complete.

## Native entry

`ubp run --host pi "<owner goal>"` adds the packaged Pi extension to the native
interactive session. It preserves ordinary native tools and sessions. The extension
has no execution effect until `ultra_slice` is called. With a native explicit
`--tools` allowlist, include `ultra_slice,ultra_attention_ack` as well as the tools
the Primary needs; the extension never widens that native allowlist.

- `ultra_slice {action:"run", packet:"wave.json", delivery:"wait"}` is W1:
  the native tool stays pending until attention is available. No idle model polling.
- With `delivery:"background"`, W2 returns to the current native turn. After that
  turn settles, one causal completion starts a new turn in the same live session.
  Only one background controller may be pending per extension instance.
- `action:"reconcile"` or `action:"cancel"` takes `run_id` and `slice_id` instead
  of `packet`. These observe/cancel the original attempts and never launch them.
- For W2 only, after reading the required results and deciding, the Primary calls
  `ultra_attention_ack {event_key:"<run>:<slice>"}`. W1 already returns in the current
  tool turn and has no delivery receipt to acknowledge; do not call this tool for
  W1. Acknowledgement grants no effects.

The Skill-local CLI is available without the native extension:

```text
node <loaded-ultra-delegate-skill-dir>/scripts/run-slice.cjs run --packet wave.json --session <native-session-id>
node <loaded-ultra-delegate-skill-dir>/scripts/run-slice.cjs status --run <id> --slice <id> --session <native-session-id>
node <loaded-ultra-delegate-skill-dir>/scripts/run-slice.cjs reconcile --run <id> --slice <id> --session <native-session-id>
node <loaded-ultra-delegate-skill-dir>/scripts/run-slice.cjs cancel --run <id> --slice <id> --session <native-session-id>
```

`ubp slice ...` invokes the same code. `run`, `reconcile` and `cancel` wait finitely;
`status` returns immediately. The CLI operator supplies the native session identity;
the Pi adapter reads it directly from Pi. A retained file is never activation.

## Exact packet

All fields below are required except `experimental_ack`. Unknown fields or schema
versions are refused. IDs contain letters, numbers, `_` and `-`, start with a letter
or number and are at most 96 characters. Native session IDs are opaque strings of at
most 256 characters. Every reference is `{path, sha256}` over exact current bytes;
paths are project-relative, contained and have no symlink components. Files are
regular and at most 1 MiB each.

```json
{
  "$schema": "ultra-run-slice-v1",
  "run_id": "example",
  "slice_id": "wave-one",
  "change_id": "change-example",
  "base_revision": "<full Git commit>",
  "primary_session_id": "<actual native session id>",
  "intent": {"path": ".ultra/changes/active/change-example/intent.md", "sha256": "<sha256>"},
  "grant": {"path": ".ultra/decisions/owner-grant.md", "sha256": "<sha256>"},
  "profile": {"path": ".ultra/profiles/selected-v1.json", "sha256": "<sha256>"},
  "task_refs": [{"id": "task-one", "path": ".ultra/contexts/task-task-one.md", "sha256": "<sha256>"}],
  "seam": {"path": "interface.md", "sha256": "<sha256>"},
  "attempts": [{
    "id": "worker-one", "role_id": "worker-left", "task_id": "task-one",
    "host": "pi", "model": "gpt-5.6-luna",
    "worktree": ".ultra/.runtime/worktrees/worker-one",
    "instruction": {"path": ".ultra/.runtime/delegations/worker-one/instruction.md", "sha256": "<sha256>"},
    "permission": {"path": ".ultra/.runtime/delegations/worker-one/permission.json", "sha256": "<sha256>"}
  }],
  "budget": {"max_concurrency": 2, "attempt_timeout_seconds": 180, "deadline_at": "<absolute ISO timestamp>"},
  "barrier": "all-terminal",
  "cancel_policy": "cancel-unfinished",
  "experimental_ack": true
}
```

The Primary verifies the owner's actual words and scope in the bound grant and
intent. Code binds those bytes; it does not infer authorization by parsing prose.
The exact explicit tool/CLI invocation is required. Do not substitute a status,
receipt, previous prompt, result or Resume note for current execution authority.

One wave contains 1–32 attempts and no queue. `max_concurrency` is 1–32 and cannot
be smaller than the attempt count. The per-attempt timeout is an integer from 1 to
86,400 seconds. The absolute deadline must be in the next 24 hours at admission.
All worktrees must start clean at the exact base revision; worktree boundaries
cannot overlap. Instructions and permissions share a fresh directory whose name
equals the attempt ID. That directory initially contains only those two files.
Permission roots use the existing delegation contract, including protected `.ultra`
and empty external effects. Experimental routes require the explicit acknowledgement.

The complete wave passes schema, input, worktree, role, qualification and native
identity checks before any Worker starts. Each launch rechecks bound input bytes,
then uses the existing delegate launcher and its permission, identity and fence
checks. A partial launch failure cancels unfinished attempts and retains uncertainty;
it never replays the partial wave.

## Role profile

Profile v1 has exactly `$schema:"ultra-role-profile-v1"`, `profile_id` and `roles`.
Each role has `role_id`, a model-readable `purpose`, `authority` (`read-only` or
`scoped-write`), `host`, `model` and `qualification_sha256`. The last value is SHA-256
of `JSON.stringify(hostProfile(host).enforcement)` from the loaded package. The
attempt must match its role's host/model and read/write authority. Hosts supporting
model selection require an explicit model. The native Primary keeps its canonical
writer role; these role records describe delegates only.

[Pi foundation v1](profiles/pi-foundation-v1.json) is a separately versioned
assignment, not a rewrite of historical Profile v0. It uses one qualified native
Host with distinct model/role assignments; it does not prove other Hosts qualified.
The Primary may select a different explicit profile within owner authority. Code
does not rank roles or choose models. Unrecorded legacy admission (`gate:null`) is
insufficient for a RunSlice, even where ordinary single delegation still permits it.

## Attention, delivery and recovery

`.ultra/.runtime/runs/<run>/<slice>/run-slice.json` retains the admitted packet.
Exclusive directory creation prevents a second start. `attention.json` is published
once atomically with `ultra-attention-v1`, the exact run/slice/session and packet
digest, event key, observation time, state counts and attempt result `{path,sha256}`
references. It contains no transcripts, summaries, semantic next steps or acceptance.

`wave_terminal` means every attempt has a validated `finished`, `blocked` or `failed`
result and proven stopped writers. It includes failed waves. `operator_attention`
means at least one attempt is missing or uncertain. Unknown/malformed facts cannot
be promoted to success. Cancellation and deadline reach the existing cancel path;
after a five-second stop observation grace, unproven running attempts remain unknown
with the existing delegation fences intact. No missing/unknown attempt is relaunched.

For W2, `delivery.json` is a disposable observation. The adapter claims the event
before sending and records `delivery_unknown` before the void-returning native send.
Native extension input is deduplicated before another model turn. A native user
message event proves delivery; the model's explicit acknowledgement after using the
attention proves consumption. This confirmation is sticky even if the same turn
later fails or the session dies. A failure before confirmation remains unknown.
Consumption is not task or product acceptance.

An existing claim is never resent, including after process death or an uncertain
send. Reconciliation returns the retained facts for a model/owner decision. An idle
or restarted process does not activate a slice from files. This finite live adapter
does not claim W3 durable authority, W4 supervisor recovery or native exactly-once
delivery.

## Product closeout

For a new project, establish its accepted intent and canonical Change/task records
before starting product work. Retrofitting them after implementation adds adoption
work and cannot create historical evidence. Keep reviewer-authority and reviewed
contract bytes fixed through their consumers. If the task context will receive
Completion/Resume updates, bind the external receipt to an immutable reviewed
contract retained under that task's evidence directory, including the applicable
acceptance and authority references, rather than to the mutable whole context.
For read-only external QA, supply the actual selected reviewer identity, observed
request timestamp and subject bindings in its instruction. It can return its receipt
as plain JSON text in a typed result's string evidence entry for exact publication;
do not require a shell command merely to obtain the time or encode the receipt.

A finished slice supplies results for the Primary's next decision. It does not
complete a task or its Review. After integration, bind combined E2E and independent
Review to the actual integrated revision. If a blocking finding causes a source
repair, use the existing bounded delta Review on that repair before claiming
readiness; a prior review of different source plus the author's green tests cannot
stand in for that independent disposition.

Use the canonical [Review](../../ultra-review/SKILL.md),
[Task Evidence v2](../../ultra-plan/references/task-evidence-v2.md),
[Test](../../ultra-test/SKILL.md) and [Deliver](../../ultra-deliver/SKILL.md)
consumers for closeout. A custom `delivery_ready` JSON, a delegate's `finished`
result, or a consumed attention does not replace those records. Preserve the
existing mode, owner-authority and review-budget boundaries throughout.
