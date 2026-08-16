# Review artifact contract

Use this contract for every specialist artifact. Write JSON to the assigned file and
return only a one-line acknowledgement to the parent.

## Specialist artifact

```json
{
  "$schema": "ultra-review-findings-v4",
  "agent": "review-code",
  "axis": "engineering_standards",
  "packet_digest": "<sha256-of-exact-worker-packet>",
  "admission_digest": "<sha256-of-exact-admission-receipt>",
  "subject_digest": "<subject-digest-from-admission-receipt>",
  "session": "<session-id>",
  "timestamp": "<RFC-3339-instant>",
  "scope": {
    "head": "<full-git-head>",
    "range": "<diff-range>",
    "files_analyzed": ["src/example.ts"],
    "diff_only": true
  },
  "status": "complete",
  "findings": [
    {
      "id": "review-code-001",
      "axis": "engineering_standards",
      "severity": "P1",
      "category": "correctness",
      "title": "Retry path commits the same payment twice",
      "file": "src/payments/retry.ts",
      "line": 42,
      "line_end": 47,
      "trigger": "The provider times out after committing the first request.",
      "impact": "A retry can create a duplicate charge.",
      "evidence": "retryPayment calls charge() again without an idempotency key.",
      "suggestion": "Persist and reuse one idempotency key for the operation.",
      "north_star_trace": {
        "first_principles": ["FP-1"],
        "serves": ["NS-01"],
        "touches": ["HC-2"]
      }
    }
  ],
  "coverage_refs": ["src/payments/retry.ts:42"],
  "positive_observations": [],
  "limitations": []
}
```

Use `axis: "spec_fidelity"` for the independent acceptance review and
`axis: "engineering_standards"` for engineering specialists.

For packet-bound v4 artifacts, `agent`, `axis`, `session`, `scope.head`,
`scope.range`, and `packet_digest` exactly match the immutable packet and its canonical
worker record. `admission_digest` equals SHA-256 over the exact retained
`ADMISSION.json` bytes and `subject_digest` equals that receipt's field; both are
required and exact for current strict v4. `scope.diff_only` is `true`. Every
`scope.files_analyzed` entry and every
finding `file` is a normalized repository-relative path contained in the packet's
`diff_files`; a broader investigation requires a new packet rather than an expanded
artifact. `timestamp` is a valid RFC 3339 instant with `Z` or an explicit numeric UTC
offset; nonempty prose, impossible dates, and timezone-free local times are invalid.

## Required finding fields

Every finding needs a stable id, axis, severity, category, concise title, repository-
relative file, tight line range, triggering condition, observable impact, source
evidence, smallest complete remediation, and one `north_star_trace` object. Its
`first_principles`, `serves`, and `touches` arrays contain only the applicable resolving
IDs from the immutable Worker Packet; an array may be empty when that finding does not
touch that ID kind. Never copy North Star prose into a finding.

Severity is impact-based:

- P0: exploitable critical security issue, destructive data loss, or deterministic
  critical outage;
- P1: material correctness, authorization, reliability, or delivery failure;
- P2: bounded defect or maintainability risk with a concrete cost;
- P3: optional improvement that does not block the accepted outcome.

Do not report a concern without a plausible execution path. Do not encode a style
preference as a defect. Preserve the source specialist's severity during coordination.

Severity routes findings; it never decides convergence:

- P0 and P1 are blocking. `REQUEST_CHANGES` routes only the exact current P0/P1
  finding ids, or a P2 the owner explicitly promoted after the current review
  reclassified it as P1 on evidence.
- P2 and P3 findings are non-blocking. An `APPROVE` verdict is terminal for the
  current task review even when P2 or P3 findings are retained: they stay in the
  report and the owner-selected backlog, and there is no fresh review of the same
  subject after a current `APPROVE`. Repairing a P2 inside the same task requires an
  explicit owner selection, never an implicit promotion.

## Coordinator summary

`SUMMARY.json` contains:

```json
{
  "$schema": "ultra-review-summary-v4",
  "mode": "change",
  "execution_mode": "isolated",
  "session": "<session-id>",
  "change_id": "<change-id>",
  "task_ids": ["<task-id>"],
  "head": "<full-git-head>",
  "worktree_digest": null,
  "context_digest": "<sha256-of-recorded-review-context>",
  "packet_digest": "<sha256-of-coordinator-worker-packet>",
  "admission_digest": "<sha256-of-exact-admission-receipt>",
  "subject_digest": "<subject-digest-from-admission-receipt>",
  "status": "complete",
  "verdict": "APPROVE",
  "axes": {
    "spec_fidelity": {
      "verdict": "PASS",
      "evidence_refs": ["review-spec.json"]
    },
    "engineering_standards": {
      "verdict": "PASS",
      "evidence_refs": ["review-code.json", "review-tests.json"]
    }
  },
  "workers": {
    "completed": ["review-spec", "review-code", "review-tests"],
    "failed": [],
    "skipped": ["review-errors", "review-design", "review-comments"]
  },
  "worker_selection": [
    {
      "worker": "review-spec",
      "status": "selected",
      "rationale": "The specification axis is required for every review mode."
    },
    {
      "worker": "review-code",
      "status": "selected",
      "rationale": "The runtime diff changes executable behavior."
    },
    {
      "worker": "review-tests",
      "status": "selected",
      "rationale": "The accepted behavior depends on changed test evidence."
    },
    {
      "worker": "review-errors",
      "status": "skipped",
      "rationale": "The diff does not change an error, fallback, or recovery path."
    },
    {
      "worker": "review-design",
      "status": "skipped",
      "rationale": "The bounded change does not alter module or data-flow boundaries."
    },
    {
      "worker": "review-comments",
      "status": "skipped",
      "rationale": "The current diff does not change maintained comments or API documentation."
    }
  ],
  "findings": [],
  "coverage_refs": ["review-spec.json", "review-code.json", "review-tests.json"],
  "positive_observations": [],
  "limitations": []
}
```

`findings` must contain every specialist v4 finding unchanged, including its
`north_star_trace`. Group duplicates only in
the human-readable summary; never delete or merge machine-readable records.

For v4, `review_wait.py` treats this as an exact transport invariant. It verifies the
session's immutable Worker Packet bytes, reloads and revalidates every artifact named in
`workers.completed`, and requires `findings` to equal their packet-ordered union one
object at a time. Omitted, edited, reordered, or coordinator-injected objects are
invalid. Axis evidence refs are the corresponding packet outputs; each axis verdict and
the overall verdict are derived from that verified union and the completed/failed roster.
Human grouping never changes these machine records.

For current strict v4, `admission_digest` and `subject_digest` are required and exactly
match the retained receipt just as they do in each specialist artifact. The waiter pins
the pair from its first receipt read through polling, specialist-union validation, and
its final reload. A missing or changed receipt makes the session `INCOMPLETE`; recovery
after any specialist artifact or `SUMMARY.json` exists is a fresh session, not receipt
reconstruction. Before any output exists, packet mode may recreate a missing v2 receipt
only when the exact packet-recorded subjects remain unchanged. It never creates or
recreates a retained strict v1 receipt. The receipt remains derived, non-authoritative evidence, but must be retained
through Test and Deliver. Its subject digest also binds the canonical validator's exact
decision and snapshot `source_observations` (`role`, repository-relative `path`,
lowercase SHA-256, and byte length).

An axis `evidence_refs` array is exactly the packet-ordered completed specialist output
union for that axis. It may be empty only when that union is empty and the derived axis
verdict is `INCOMPLETE`, such as a spec-only packet or when every selected engineering
worker failed. An empty array can never support `PASS` or `FAIL`; do not invent a
placeholder reference.

`context_digest` is packet-derived, not coordinator-authored. With one
`context_files` item it equals that item's `sha256`. With zero or multiple items it is
SHA-256 over compact UTF-8 JSON for the `{path,sha256}` items sorted by UTF-8 `path`
bytes, with object keys sorted. `worktree_digest` is present and `null` in Worker Packet
v1 reviews because that packet schema does not bind an exact worktree digest. A future
packet schema may add such a fact; an unbound coordinator observation must not claim
provenance now.

`coverage_refs` names inspected source, commands, or stable artifacts supporting the
coverage claim. Zero findings with neither a coverage reference nor an explicit
limitation is incomplete, not an approval.

`mode` is `task`, `change`, or `plan`. `worker_selection` contains each member of the
six-worker roster exactly once with a scope-specific selected or skipped rationale.
Its selected set equals `workers.completed` plus `workers.failed`; its skipped set
equals `workers.skipped`. `review-spec` is always selected. If it fails, the
`spec_fidelity` evidence union is `[]`, that axis and the overall verdict are
`INCOMPLETE`, and the historical failure remains a valid summary rather than a fabricated
completed artifact.

`execution_mode` is exactly `isolated` when every selected lens ran in a fresh native
subagent context, or `sequential-shared-context` when the host reused one context. It
reports independence; it does not change a finding's truth.

The overall verdict is `APPROVE` only when both axes pass, artifacts are complete and
current, and no P0 or P1 finding remains. Use `REQUEST_CHANGES` for a failed axis or
blocking finding, and `INCOMPLETE` when required evidence or workers are missing.
Each axis verdict is `PASS`, `FAIL`, or `INCOMPLETE`; the overall verdict is `APPROVE`,
`REQUEST_CHANGES`, or `INCOMPLETE`.

The ordinary summary command reads one stable canonical `SUMMARY.json` snapshot and
returns its SHA-256 as `summary_digest`. The Review-to-Test consumer first captures the
canonical `.ultra/test-report.json` and its repository-relative `SUMMARY.json` using one
shared bounded stable raw-byte rule. Every managed path component below the real
repository root is non-symlink, each final entry is a regular file inside that root, and
each snapshot is limited to 8 MiB. An 8 MiB + 1 byte observation returns a typed
oversize diagnostic before JSON parsing or hashing. The exact report bytes own parsing
and subject comparisons; the exact summary bytes own parsing, SHA-256, comparisons, and
waiter validation. A direct consumer that already owns that summary snapshot passes
those exact bytes on stdin and invokes:

```bash
python3 scripts/review_wait.py <session> summary \
  --packet-digest <packet-sha256> \
  --summary-snapshot-digest <summary-sha256>
```

The waiter parses and validates only those stdin bytes, checks their supplied digest,
requires the session's stable packet-bound `ADMISSION.json`, and returns the same digest.
This seam prevents Review-to-Test from validating, parsing, hashing, and comparing
different filesystem observations. The receipt proves the strict v4 packet preflight
ran; it does not cause summary validation to reread mutable subjects.

Summary validation consumes the packet's frozen subject claims. It does not reread the
current context, Change, acceptance source, or North Star, so a task-close update or a
later accepted revision cannot make an already completed review unreadable.

Review admission and Review-to-Test are cooperative-workspace sensors. They detect
observable path, component, identity, byte, and digest drift and never claim to defeat a
malicious process that can exchange and restore directory entries between individual
system calls. Use Host sandboxing or an isolated worktree for adversarial operating-
system writers; do not add a second semantic authority or platform-specific filesystem
engine to this portable Skill.

Validate JSON before acknowledgement. Never paste full JSON or worker transcripts into
the parent conversation.

## Historical compatibility

New sessions always write `ultra-review-findings-v4` and
`ultra-review-summary-v4` from a packet carrying
`admission_contract: ultra-review-admission-required-v2` with exact ordered
`subject_observations`, after packet mode atomically publishes and freshly rewalks a v2
`ADMISSION.json`.
Immutable v4 sessions created before that receipt remain readable only by adding
`--legacy-v4` immediately after `--packet-digest <digest>` and only when the historical
packet lacks the admission marker.
Immutable v3 sessions use
`--legacy-v3` in the same position. Both flags reject packets marked strict v1 or v2;
only truly historical unmarked packets, or packet-absent v3 sessions, use them. Retained
strict v1 remains readable only with its exact existing receipt and cannot be admitted
or re-admitted. These are explicit read compatibility paths, not
automatic fallback or permission to create or rewrite legacy findings. `--legacy-v4`
is not a recovery path for a current session whose retained receipt was lost.
