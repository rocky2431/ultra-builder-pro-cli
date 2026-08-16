# Immutable Worker Packet

Create `.ultra/reviews/<session>/WORKER-PACKET.json` once, before starting any lens.
Serialize it as UTF-8 JSON with a trailing newline, compute SHA-256 over those exact
bytes, and never edit the file. A changed scope requires a new session and packet.
Before serialization, read each context, the canonical `.ultra/north-star.md`, the exact
Change trace path, and every acceptance source from stable repository-contained
regular-file snapshots. Send the captured North Star bytes to the canonical validator,
then stable-read its reported decision and accepted-snapshot paths and verify their byte
lengths and SHA-256 values. Compute the recorded context SHA-256, capture the trace
fields, preserve each acceptance claim with its source path and heading, and write the
exact ordered v2 `subject_observations`. After writing the packet, run:

```bash
python3 scripts/review_wait.py <session> packet --packet-digest <sha256>
```

Do not launch a worker unless that producer-side preflight returns `status: complete`.
On success it atomically writes the derived
`.ultra/reviews/<session>/ADMISSION.json` receipt. That receipt binds admission version,
packet digest, observed Git HEAD, stable subject byte observations, and the exact
canonical North Star report input plus that report's exact decision and snapshot
`source_observations`. The subject digest binds all of those observations. It is
evidence of the mechanical ingress check, not semantic authority. Publication is atomic and create-once: exact existing bytes are an
idempotent success, while different existing bytes return `admission_conflict` and
require a fresh session without replacing the first receipt. If the receipt was
published, a fresh canonical root rewalk must confirm the session and exact receipt
identity. Unresolved cleanup and directory durability failures are returned together
as `status: complete` with `durability_warning`; a cleanup retry that succeeds is not a
warning. Retain this derived evidence through Test and Deliver. If it is lost after any
specialist artifact or `SUMMARY.json` exists, the session is `INCOMPLETE` and must be
replaced by a fresh review session; do not claim the old receipt is reconstructable.
Before any output exists, packet mode may recreate a missing v2 receipt only from the
same packet-recorded bytes. A retained strict v1 packet remains readable with its exact
existing receipt, but packet mode never creates or recreates a v1 receipt.

```json
{
  "$schema": "ultra-review-worker-packet-v1",
  "admission_contract": "ultra-review-admission-required-v2",
  "session": "<session-id>",
  "mode": "task | change | plan",
  "created_at": "<RFC-3339-instant>",
  "head": "<full-git-head>",
  "range": "<exact-diff-range>",
  "change_id": "<active-change-id>",
  "task_ids": ["<task-id>"],
  "acceptance": ["<criterion with source path and heading>"],
  "public_seams": ["<entry point or behavior>"],
  "north_star_trace": {
    "path": ".ultra/changes/active/<change-id>/intent.md#north-star-trace",
    "first_principles": ["FP-1"],
    "serves": ["NS-01"],
    "touches": ["HC-2"],
    "north_star_revision": "north-star-v2-r1",
    "north_star_digest": "<git-blob-hash>"
  },
  "context_files": [
    {"path": ".ultra/contexts/task-<task-id>.md", "sha256": "<digest>"}
  ],
  "subject_observations": [
    {"role": "change", "path": ".ultra/changes/active/<change-id>/intent.md", "sha256": "<digest>", "byte_length": 123},
    {"role": "acceptance_source", "path": ".ultra/changes/active/<change-id>/intent.md", "sha256": "<digest>", "byte_length": 123},
    {"role": "decision", "path": ".ultra/decisions/<decision>.md", "sha256": "<digest>", "byte_length": 456},
    {"role": "snapshot", "path": ".ultra/research/<run>/north-star-v2-r1.accepted.md", "sha256": "<digest>", "byte_length": 789}
  ],
  "workers": [
    {
      "agent": "review-spec",
      "axis": "spec_fidelity",
      "lens": "skills/ultra-review/references/spec.md",
      "output": ".ultra/reviews/<session>/review-spec.json"
    }
  ],
  "diff_files": ["src/example.ts"],
  "output_directory": ".ultra/reviews/<session>"
}
```

Every displayed top-level field is required for a current strict packet.
`admission_contract` has the exact value `ultra-review-admission-required-v2` for every
new packet.
`created_at` is RFC 3339; `head` is the
lowercase 40-hex Git commit digest; `acceptance`, `public_seams`, and `diff_files` are
non-empty; `task_ids` is non-empty in task mode.
`north_star_trace` contains exactly the six displayed fields. Its three ID arrays are
unique resolving IDs, `north_star_revision` is the accepted North Star `Revision`, and
`north_star_digest` is the lowercase 40-hex result of
`git hash-object .ultra/north-star.md`. Each `context_files` item contains exactly
`path` plus a lowercase SHA-256 `sha256`. `subject_observations` is exact and ordered:
the Change named by `north_star_trace.path`, each unique acceptance source sorted by
UTF-8 path bytes, then the canonical validator's `decision` and `snapshot`. Every item
contains exactly `role`, normalized repository-relative `path`, lowercase SHA-256, and
non-negative integer `byte_length`; each worker contains exactly the four fields shown.
Top-level extension fields may carry read-only review questions or historical
references, but they are not provenance and cannot replace a required core field.

In task mode, `context_files` is the exact ordered projection of `task_ids`: task
`<task-id>` maps to `.ultra/contexts/task-<task-id>.md`. Each recorded digest must equal
the exact current bytes. `north_star_trace.path` binds `change_id` to
`.ultra/changes/<active|archive|abandoned>/<change-id>/intent.md#north-star-trace`.
The packet producer captures the trace arrays, revision, digest, and owner-readable
acceptance claims from those sources. Each `acceptance` item is
`<repository-path>#<heading>: <captured owner-readable claim>`. Packet admission checks
that `head` is the current `git rev-parse HEAD`, reads the exact validated Change path,
every acceptance source, and both canonical validator sources as stable
repository-contained regular-file bytes, and compares each byte length and SHA-256 with
the packet. It checks the current context SHA-256 and passes the already captured North
Star bytes to the one canonical Research validator through its native stdin seam. The
report must receipt that exact path, byte count, and SHA-256, and its decision/snapshot
observations must equal the packet's final two observations. Admission then freshly
rewalks every captured subject before publication. These observations bind only paths
and bytes; they do not add a second Markdown parser or reinterpret meaning.

That current-subject validation occurs only in `packet` mode. Strict v4 `agents`,
`summary`, and Review-to-Test require the stable packet-bound `ADMISSION.json`, then
never reread mutable context, Change, acceptance, or North Star prose. Later task
completion or authority revision does not invalidate the old review; reviewing the new
subject requires a new session and packet. An immutable v4 session created before
admission receipts and lacking `admission_contract` is readable only with explicit
`--legacy-v4`; packet-absent or unmarked v3 history uses explicit `--legacy-v3`.
Either legacy flag rejects every strict v1 or v2 marker, and there is no automatic
fallback. A retained strict v1 packet instead consumes only its exact existing receipt.

The session argument must resolve to `<repo>/.ultra/reviews/<session>`, and `session`
must equal that directory name. Every designated repository path uses normalized
repository-relative POSIX syntax: no absolute path, backslash, empty segment, `.`,
`..`, or symlink escape. `output_directory` is exactly
`.ultra/reviews/<session>`. Worker records appear in canonical roster order and use
these exact bindings (a scope may select a subset, but `review-spec` is permanent and
always present):

| Agent | Axis | Lens | Output basename |
|---|---|---|---|
| `review-spec` | `spec_fidelity` | `skills/ultra-review/references/spec.md` | `review-spec.json` |
| `review-code` | `engineering_standards` | `skills/ultra-review/references/code.md` | `review-code.json` |
| `review-tests` | `engineering_standards` | `skills/ultra-review/references/tests.md` | `review-tests.json` |
| `review-errors` | `engineering_standards` | `skills/ultra-review/references/errors.md` | `review-errors.json` |
| `review-design` | `engineering_standards` | `skills/ultra-review/references/design.md` | `review-design.json` |
| `review-comments` | `engineering_standards` | `skills/ultra-review/references/comments.md` | `review-comments.json` |

The context observation used by `SUMMARY.json` is deterministic. For one context it is
that item's `sha256`. For zero or multiple contexts, sort items bytewise by `path`,
serialize the array as UTF-8 JSON with sorted object keys and no insignificant
whitespace, then SHA-256 those bytes.

Give a selected worker only:

1. this packet path and exact digest;
2. `unified-schema.md`;
3. its one lens reference.

The worker writes only its assigned JSON artifact. During artifact and summary polling,
`review_wait.py` rereads the exact `WORKER-PACKET.json` bytes and requires their SHA-256
to remain unchanged. It binds the requested output stem to the declared worker and scope, requires
`scope.diff_only: true`, and rejects any `scope.files_analyzed` or finding `file`
outside `diff_files`. Packet, specialist, and summary inputs must be stable
repository-contained regular files no larger than 8 MiB; a symlink in any managed path
component, FIFO, other special file, replacement during a read, oversized file, invalid UTF-8, or invalid JSON
return typed `incomplete` diagnostics. JSON parsing and SHA-256 always consume the same
captured bytes. Finding trace IDs outside the packet arrays are invalid.
The artifact's `packet_digest` must equal the expected digest passed to the waiter; a
merely well-formed digest is insufficient.
Every strict current artifact and `SUMMARY.json` also carries `admission_digest`, the
SHA-256 of the exact retained `ADMISSION.json` bytes, and `subject_digest`, copied from
that receipt. Both must exactly match the receipt loaded at waiter start. The waiter
pins that pair across every polling and final reload, so a changed or missing receipt
makes the session `INCOMPLETE` and requires a fresh session. Pre-admission historical
v4 artifacts may omit the pair only when read with explicit `--legacy-v4`.
The coordinator owns worker selection, synthesis, repair, and the summary.

## Review history: one direct parent only

A task review packet may carry at most one direct parent. The sanctioned channel is
the optional top-level `review_history` object with exactly `parent_summary_ref`
(one prior session's `SUMMARY.json` path), `parent_summary_digest`, and
`unresolved_blocking_ids` — only the parent's still-unresolved current P0/P1 finding
ids. Packet admission rejects any packet whose fields or extensions reference more
than one foreign review session. Transitive summary chains, complete historical
findings, and whole-history disposition requests must not enter a new packet: a delta
review consumes the current subject, its one direct parent, and the exact evidence
refs the delta touches. The full archive stays readable under `.ultra/reviews/**` and
is read only for a dedicated incident or owner audit.
