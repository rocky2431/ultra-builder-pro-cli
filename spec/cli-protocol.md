# `ultra-tools` CLI protocol

`ultra-tools` is the Bash-fallback layer of the three-layer architecture
(PLAN §4, D12). Every MCP tool listed in `spec/mcp-tools.yaml` has a
matching `ultra-tools <subcommand>`; both call the same `state-db` write
path. This file is the **contract** the hook system and shell users rely on.

Trace: PLAN §6 Phase 1.4, decisions D12 / D29 / D33 / D37.

## 1. Invocation

```
ultra-tools <family> <verb> [--flag value] [positional ...]
```

- `family` and `verb` together correspond to a `tool.name` in
  `spec/mcp-tools.yaml` (e.g. `task create`, `session admission`).
- Flags map 1-to-1 to the `input_schema.properties` of the tool.
- Positional args are reserved for the **id-like primary key** of the tool,
  if the tool has one (`task get <id>`, `session get <sid>`). All other
  fields must be flags so machine callers do not depend on argument order.
- Boolean flags: `--takeover` for true; `--no-takeover` for false. Default
  is whatever the schema declares.
- JSON values: pass with `--json '<inline json>'` or `--json-file <path>`
  when an input field is itself an object/array.

## 2. Output

The CLI may print human-readable lines to stdout while it runs. The **last
line of stdout MUST be a single JSON object** matching the tool's
`output_schema` on success, or an error envelope on failure:

```json
// success
{ "ok": true, "data": { ... output_schema ... } }
```

```json
// failure
{ "ok": false, "error": { "code": "<ERROR_CODE>", "message": "...", "retriable": false } }
```

`error.code` MUST be one of the `errors[].code` values declared for that
tool in `spec/mcp-tools.yaml`. Hooks parse this last line; any extra noise
must come **before** it.

Streaming subcommands (e.g. `task subscribe`) emit one JSON object per
line during the stream, and finish with the standard envelope on stdout's
last line.

## 3. Exit codes

| Code | Meaning                                           |
|-----:|---------------------------------------------------|
| `0`  | success — `data` envelope is on stdout            |
| `1`  | user error (bad flags, missing required input)    |
| `2`  | system error (DB unavailable, IO failure)         |
| `3`  | lease conflict — see `error.code = ADMISSION_DENIED` (D33) |
| `4`  | schema mismatch (input or output failed validation) |
| `5`  | timeout — operation exceeded its budget           |
| `124`| reserved for SIGTERM / killed by orchestrator     |

Exit code is **the** ground truth for hooks; the JSON envelope is
informational. Never rely on stderr for status.

## 4. Stdin / stdout / stderr discipline

- **stdin**: closed by default. Tools that accept large input
  (`task parse-prd`) read from `--prd-file <path>` rather than stdin to
  keep streaming pipelines deterministic.
- **stdout**: human-readable lines + the trailing JSON envelope.
- **stderr**: log lines only (structured JSON; `level / message / context`).
  Never carry success data on stderr.

## 5. Tool ↔ CLI mapping

The mapping below is generated from `spec/mcp-tools.yaml` by
`spec/scripts/check-cli-mapping.cjs` and asserted at gate time. This table
is the authoritative reference; do not duplicate it in command md files.

| MCP tool                  | CLI subcommand              | Phase | Writer  |
|---------------------------|-----------------------------|------:|---------|
| `task.create`             | `task create`               | 2     | mcp     |
| `task.update`             | `task update`               | 2     | mcp     |
| `task.list`               | `task list`                 | 2     | any     |
| `task.get`                | `task get`                  | 2     | any     |
| `task.delete`             | `task delete`               | 2     | mcp     |
| `task.init_project`       | `task init-project`         | 3     | mcp     |
| `task.expand`             | `task expand`               | 8a    | mcp     |
| `task.parse_prd`          | `task parse-prd`            | 8a    | mcp     |
| `task.dependency_topo`    | `task topo`                 | 8a    | mcp     |
| `task.append_event`       | `task append-event`         | 2     | any     |
| `task.subscribe_events`   | `task subscribe`            | 2     | any     |
| `memory.retain`           | `memory retain`             | 7     | mcp     |
| `memory.recall`           | `memory recall`             | 7     | any     |
| `memory.reflect`          | `memory reflect`            | 7     | mcp     |
| `review.run`              | `review run`                | 3     | mcp     |
| `review.verdict`          | `review verdict`            | 3     | any     |
| `impact.radius`           | `impact radius`             | 6     | any     |
| `impact.changes`          | `impact changes`            | 6     | any     |
| `impact.dependents`       | `impact dependents`         | 6     | any     |
| `skill.resolve`           | `skill resolve`             | 3     | any     |
| `skill.manifest`          | `skill manifest`            | 3     | any     |
| `session.spawn`           | `session spawn`             | 4.5   | mcp     |
| `session.close`           | `session close`             | 4.5   | mcp     |
| `session.get`             | `session get`               | 4.5   | any     |
| `session.list`            | `session list`              | 4.5   | any     |
| `session.admission_check` | `session admission`         | 4.5   | any     |
| `session.heartbeat`       | `session heartbeat`         | 4.5   | mcp     |
| `session.subscribe_events`| `session subscribe`         | 4.5   | any     |
| `ask.question`            | `ask question`              | 3     | any     |
| `ask.menu`                | `ask menu`                  | 3     | any     |
| `plan.export`             | `plan export`               | 8a    | mcp     |
| `plan.get`                | `plan get`                  | 8a    | any     |

`Writer = mcp` rows go through the MCP server's single-writer connection;
the CLI shells out to the running MCP server over stdio rather than
touching `.ultra/state.db` directly. `Writer = any` rows are safe to
execute from any process — read-only queries and `events` appends fall
into this bucket because `events.id AUTOINCREMENT` makes concurrent
INSERTs collision-free under WAL + `busy_timeout`. The full policy lives
in `docs/STATE-DB-ACCESS-POLICY.md` (Phase 2.2 / R25).

## 6. Versioning

The CLI follows the `version` field of `spec/mcp-tools.yaml`. Adding a new
flag is a minor bump; renaming or removing a flag, or changing exit-code
semantics, is a major bump. Major bumps require an entry in
`docs/PLAN.zh-CN.md §14 Decision log`.
