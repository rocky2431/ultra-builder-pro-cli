# `ultra-tools` CLI protocol

`ultra-tools` is the maintenance and degraded-mode client for the same seven-tool
kernel exposed through MCP. It does not publish the retired lifecycle families as
model-facing tools and it does not contain a second semantic workflow engine.

Authority boundary: [`docs/DECISIONS.md`](../docs/DECISIONS.md).

## Invocation

```text
ultra-tools ultra <verb> [--json '<object>']
```

The supported verbs map exactly to the public MCP contract. JSON input uses the
corresponding `input_schema` in `spec/mcp-tools.yaml`. Large inputs may use
`--json-file <path>`.

Maintenance-only commands such as installation diagnostics, explicit backup
restore, schema migration, and runtime inspection remain available under their
documented non-MCP command groups. They are operator surfaces, not hidden model
tools.

## Output

The final stdout line is always one JSON envelope:

```json
{ "ok": true, "data": {} }
```

or:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "What failed",
    "retriable": false
  }
}
```

Human-readable progress may precede the envelope. Structured logs go to stderr.
Exit code `0` means success, `1` means invalid user input, `2` means a mechanical
runtime or I/O failure, `3` means a lease conflict, `4` means a schema mismatch,
and `5` means timeout.

## Public tool mapping

The table is checked against `spec/mcp-tools.yaml` at gate time.

| MCP tool | CLI subcommand | Phase | Writer |
|---|---|---:|---|
| `ultra.context` | `ultra context` | 24 | mcp |
| `ultra.record` | `ultra record` | 24 | mcp |
| `ultra.checkpoint` | `ultra checkpoint` | 24 | mcp |
| `ultra.sync` | `ultra sync` | 24 | mcp |
| `ultra.session` | `ultra session` | 24 | mcp |
| `ultra.archive` | `ultra archive` | 24 | mcp |
| `ultra.doctor` | `ultra doctor` | 24 | mcp |

The retired `task.*`, `change.*`, `decision.*`, `workflow.*`, `artifact.*`,
`plan.*`, `session.*`, `baseline.*`, and `system.doctor` names are historical
migration vocabulary only. They are neither returned by `tools/list` nor accepted
by the MCP call handler.

## Behavioral boundary

- `ultra.context` is read-only and returns one canonical Context Envelope.
- `ultra.record` appends typed facts or revises mutable drafts. Semantic
  diagnostics are returned as data.
- `ultra.checkpoint` attempts an immutable stage checkpoint. An unsuccessful
  attempt remains a revisable draft.
- `ultra.sync` imports, publishes, inspects, or migrates the Git team ledger.
- `ultra.session` owns only leases, Worker Packets, heartbeats, and terminal
  session transitions.
- `ultra.archive` is the recoverable filesystem and database commit boundary.
- `ultra.doctor` reports mechanical health and performs only explicit,
  backup-first deterministic repairs.

Skills own adaptive workflow prose and host-native user interaction. Hooks observe
lifecycle events and inject bounded context. Neither surface may silently write
semantic authority.

## Orchestrator

`ubp-orchestrator` consumes an accepted Plan checkpoint and a task-specific
Worker Packet. It may schedule independent tasks but may not infer missing owner
decisions, rewrite a Change contract, or bypass a rejected checkpoint.

Every worker result must echo the exact `packet_digest`. A zero exit code is
execution evidence, not automatic semantic completion; the responsible Skill
records the outcome and attempts the appropriate checkpoint.

## Versioning

The CLI follows the `version` in `spec/mcp-tools.yaml`. Public tool removal,
renaming, or incompatible envelope changes require a major contract revision and
a migration note. Adding an optional field or a new typed record action requires
a minor contract revision.
