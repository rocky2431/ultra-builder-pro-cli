# Immutable Worker Packet

Create `.ultra/reviews/<session>/WORKER-PACKET.json` once, before starting any lens.
Serialize it as UTF-8 JSON with a trailing newline, compute SHA-256 over those exact
bytes, and never edit the file. A changed scope requires a new session and packet.

```json
{
  "$schema": "ultra-review-worker-packet-v1",
  "session": "<session-id>",
  "mode": "task | change | plan",
  "created_at": "<ISO-8601>",
  "head": "<full-git-head>",
  "range": "<exact-diff-range>",
  "change_id": "<active-change-id>",
  "task_ids": ["<task-id>"],
  "acceptance": ["<criterion with source path and heading>"],
  "public_seams": ["<entry point or behavior>"],
  "context_files": [
    {"path": ".ultra/contexts/<task-id>.md", "sha256": "<digest>"}
  ],
  "diff_files": ["src/example.ts"],
  "output_directory": ".ultra/reviews/<session>"
}
```

All paths are repository-relative. `mode`, `head`, `range`, `change_id`, `task_ids`,
`acceptance`, `public_seams`, `context_files`, `diff_files`, and `output_directory` are
required. Arrays may be empty only when the selected mode makes the absence explicit
in the packet.

Give a selected worker only:

1. this packet path and exact digest;
2. `unified-schema.md`;
3. its one lens reference.

The worker writes only its assigned JSON artifact. Its `packet_digest` must equal the
expected digest passed to `review_wait.py`; a merely well-formed digest is insufficient.
The coordinator owns worker selection, synthesis, repair, and the summary.
