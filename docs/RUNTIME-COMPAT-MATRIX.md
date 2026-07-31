# Runtime compatibility matrix

Claude Code, OpenCode, Codex, Kimi Code, and Grok Build are supported plugin
hosts. The canonical asset boundary lives in
`adapters/_shared/runtime-assets.cjs`.

Legend: **FULL** means a native equivalent exists; **FUNCTIONAL** means the same
outcome uses a different native primitive; **DEGRADED** means the missing host
surface is stated and the Skill-entry Context read remains authoritative; **N/A**
means intentionally absent.

## Plugin and workflow surface

| Capability | Claude Code | OpenCode | Codex | Kimi Code | Grok Build |
|---|---|---|---|---|---|
| Package form | `.claude-plugin` | config bundle + JS plugin | personal `.codex-plugin` | managed `kimi.plugin.json` | native Grok plugin |
| Public entry | `/ultra-builder-pro:ultra-*` | `/ultra-*` | `$ultra-builder-pro:ultra-*` | `/ultra-builder-pro:ultra-*` | native Ultra commands/Skills |
| Public workflow Skills | 11 explicit-only | 11 command-backed private assets | 11 implicit-disabled | 11 model-disabled | 11 explicit-only |
| Internal rule Skills | 4 worker-only | 4 worker-only | 4 implicit-disabled | 4 worker templates | 4 worker templates |
| MCP tools | exactly 7 | exactly 7 | exactly 7 | exactly 7 | exactly 7 |
| Automatic semantic chaining | N/A | N/A | N/A | N/A | N/A |

Commands are thin launchers. The Skill contains adaptable semantic workflow prose;
the adapter contains only host metadata, translation, and wiring.

## Agents and collaboration

| Capability | Claude Code | OpenCode | Codex | Kimi Code | Grok Build |
|---|---|---|---|---|---|
| Bundled review/debug workers | FULL, 10 native Markdown agents | FULL, 10 native agents | FULL, 10 managed TOML agents | FUNCTIONAL, 10 prompt templates | FUNCTIONAL, 10 prompt templates |
| Immutable Worker Packet | FULL | FULL | FULL | FULL | FULL |
| Native bounded delegation | native agent surface | native agent surface | native subagents | Agent/AgentSwarm | plugin agent surface |
| Cross-host advisor | explicit read-only | explicit read-only | explicit read-only | explicit read-only | explicit read-only |
| Final acceptance owner | primary host | primary host | primary host | primary host | primary host |

Every Worker Packet binds Context, decisions, Git, Task, acceptance, evidence,
output schema, and digest. A worker cannot write SQLite or accept its own result.

## Hooks and Context

| Lifecycle | Claude Code | OpenCode | Codex | Kimi Code | Grok Build |
|---|---|---|---|---|---|
| Session Context | FULL, SessionStart compact | FULL, system transform | FULL, session/prompt compact | FULL where native event consumes output | DEGRADED, ignored stdout is not claimed as injection |
| Skill-entry Context | FULL | FULL | FULL | FULL | FULL and authoritative |
| Managed-file protection | PreToolUse | tool.before | PreToolUse | PreToolUse | camelCase PreToolUse |
| Compact recovery | PreCompact + SessionStart | compacting transform | pre/post compact | native pre/post where available | records lifecycle; Skill rereads Context |
| Stop | non-blocking advisory | session.idle annotation | non-blocking advisory | non-blocking advisory | advisory only for `reason=end_turn` |
| Subagent event | minimal ids | DEGRADED when host lacks event | minimal ids | native start/stop | minimal ids where exposed |

All Hook context comes from the canonical Context Envelope generator. Hooks never
capture prompts, transcripts, general memory, observations, or code-graph payloads.
They do not create semantic records or block ordinary work for incomplete evidence.

## MCP and native runtime

| Capability | Claude Code | OpenCode | Codex | Kimi Code | Grok Build |
|---|---|---|---|---|---|
| stdio registration | `.mcp.json` | local MCP entry | `.mcp.json` | `mcpServers` | native plugin MCP entry |
| Public discovered tools | 7 | 7 | 7 | 7 | 7 |
| Public write/read smoke | FULL | FULL | FULL | FULL | FULL |
| Doctor backup/reopen | FULL | FULL | FULL | FULL | FULL |
| Bundled `better-sqlite3` native | FULL | FULL | FULL | FULL | FULL |
| ABI/provenance validation | FULL | FULL | FULL | FULL | FULL |
| Git team checkpoint | `.ultra/tasks/tasks.json` | same | same | same | same |
| Local authority | `.ultra/.runtime/state.db` | same | same | same | same |

The installed runtime includes the externalized `better-sqlite3` package and its
native `.node`. Provenance records native digest, platform, architecture, Node ABI,
and runtime command. A mismatched ABI fails before authority is opened; Doctor
repairs through staging and atomic swap.

Archive finalization uses a packaged Python 3 worker with identity-checked
descriptor-relative filesystem operations on POSIX. If this prerequisite is absent,
archive fails closed with `ARCHIVE_RUNTIME_UNAVAILABLE`; other MCP tools remain usable.

## Structured user interaction

| Host | Native question surface | Fallback |
|---|---|---|
| Claude Code | `AskUserQuestion` | one concise direct question |
| OpenCode | `question` | one concise direct question |
| Codex | `request_user_input` when exposed by current mode | one concise direct question |
| Kimi Code | `AskUserQuestion` outside auto mode | one concise direct question |
| Grok Build | native structured question when exposed | one concise direct question |

An interaction-disabled mode leaves the choice unresolved. The adapter never infers
consent or stores an interaction receipt.

## User instruction isolation

| Host | Durable user instruction | Installer writes it? |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | no |
| OpenCode | `~/.config/opencode/AGENTS.md` | no |
| Codex | `~/.codex/AGENTS.md` | no |
| Kimi Code | `~/.kimi-code/AGENTS.md` | no |
| Grok Build | host-owned instruction file | no |

Install, update, Doctor, and uninstall preserve user instructions, repository
instructions, project `.ultra`, unrelated plugins, and unrelated host configuration.

## Install lifecycle

| Capability | Claude Code | OpenCode | Codex | Kimi Code | Grok Build |
|---|---|---|---|---|---|
| Global flag | `--claude` | `--opencode` | `--codex` | `--kimi` | `--grok` |
| Staging + atomic swap | FULL | FULL | FULL | FULL | FULL |
| Exact-host preflight | FULL | FULL | FULL | FULL | FULL |
| Native registration truth | host manifest | host config | plugin manifest/cache | installed registry | `grok plugin list/details` |
| Active MCP truth | host MCP config | host MCP config | plugin cache | managed plugin config | `grok inspect` + `grok mcp doctor` |
| Managed uninstall guard | FULL | FULL | FULL | FULL | FULL |
| Preserve unrelated config | FULL | FULL | FULL | FULL | FULL |
| Read-only Doctor | FULL | FULL | FULL | FULL | FULL |

Preflight uses the final manifest command and verifies initialize, `tools/list == 7`,
public write/read, Doctor backup, close/reopen consistency, native provenance, and
lazy project initialization.

The Grok adapter probes the installed CLI's command and flag capabilities rather
than branching on a Grok version number. Global installation uses Grok's native
plugin registry, keeps a durable managed local source for native refresh, and
resolves the MCP launcher through `${GROK_PLUGIN_ROOT}` after Grok copies the plugin
under its dynamic `installed-plugins/<repo-key>` path. An older raw
`$GROK_HOME/plugins/ultra-builder-pro` installation is backed up and migrated; a
failed native install restores the prior source and registration.

`grok mcp list` is not the plugin-MCP inventory surface in current Grok releases;
it reports explicit user/project MCP configuration. Ultra therefore does not add a
second `[mcp_servers]` entry merely to make that command display the plugin. The
authoritative plugin consumer checks are the native plugin registry, merged
`grok inspect` MCP source, and the live `grok mcp doctor` handshake.

## Durable compatibility

| Capability | Contract |
|---|---|
| Current authority schema | `22.0` |
| Runtime values | `claude`, `opencode`, `codex`, `kimi`, `grok` |
| Legacy inputs | v4.4/v4.5 task projections, the legacy root-level state database, Task Contexts, v0.22/v0.23 DB and team ledger |
| Preservation | exact-byte backup, row/ID/event/migration-history preservation, verified semantic promotion |
| Failure | transactional rollback; no partial DB, ledger, native runtime, or host installation |

Old workflow/dialogue rows are retained as non-authoritative history. Current
Decisions, Stage Checkpoints, Context Envelopes, Worker Packets, and team checkpoint
are reconstructed only from verified authority.

## Verification sources

- `adapters/tests/*.test.cjs` validates every native builder and manifest.
- `tests/conformance/<runtime>/*.test.cjs` validates all five hosts.
- `adapters/_shared/tests/runtime-assets.test.cjs` keeps docs and asset allowlists
  synchronized.
- `tests/install.test.cjs` verifies atomic install, rollback, Doctor, and instruction
  preservation.
- `tests/package-smoke.test.cjs` installs the npm tarball and performs five real
  launcher write/read/backup/reopen round trips.
- Grok acceptance runs capability probing, native install/list/details/enable,
  merged inspect, MCP Doctor, migration rollback, and camelCase Hook fixtures.
