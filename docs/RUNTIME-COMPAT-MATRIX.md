# Runtime Compatibility Matrix

Current presentation contract for Ultra Builder Pro. Claude Code, OpenCode,
Codex, and Kimi Code 0.26+ are supported native plugin hosts. The canonical
asset boundary lives in `adapters/_shared/runtime-assets.cjs`.

Legend: **FULL** = native host surface, **FUNCTIONAL** = the complete outcome is
available through a different native host primitive, **DEGRADED** = supported
but missing an equivalent lifecycle/control surface, **N/A** = intentionally
not installed.

## 1. Plugin and workflow surface

| Capability | Claude Code | OpenCode | Codex | Kimi Code 0.26+ |
|---|---|---|---|---|
| Package form | `.claude-plugin` native plugin | native config bundle + JS plugin | personal `.codex-plugin` | managed `kimi.plugin.json` plugin |
| Public entry | `/ultra-*`, `/learn` | `/ultra-*`, `/learn` | `$ultra-builder-pro:<skill>` | `/ultra-builder-pro:<command>` |
| Public Ultra workflows | 12 | 12 | 12 | 12 |
| Internal agent-rule skills | 4, non-user-facing | 4, non-user-facing | 4 with implicit invocation disabled | 4, consumed by review workers |
| Collaboration companions | `codex-collab`, `ultra-verify` | `cc-collab`, `codex-collab`, `ultra-verify` | `cc-collab`, `ultra-verify` | `cc-collab`, `codex-collab`, `ultra-verify` |
| Host bootstrap | native plugin context | native plugin context | native plugin context | `using-ultra-builder-pro` session-start skill |
| External browser/deploy/framework skills | N/A | N/A | N/A | N/A |

Codex converts workflows into namespaced skills and records eleven legacy
command mappings in `command-map.json`; `ultra-review` remains directly
invocable as a skill. Kimi registers all twelve commands through its native
plugin command directory and exposes the allowlisted skills independently.

## 2. Agents and collaboration

| Capability | Claude Code | OpenCode | Codex | Kimi Code 0.26+ |
|---|---|---|---|---|
| Bundled review/debug workers | FULL, native Markdown agents | FULL, native agent frontmatter | FULL, nine managed TOML agents | FUNCTIONAL, nine prompt templates consumed by `Agent` / `AgentSwarm` |
| Plugin custom-agent registration | FULL | FULL | FULL | N/A; the 0.26 manifest has no custom-agent field |
| Native bounded delegation | native agent surface | native agent surface | native Codex subagents | native `Agent` / `AgentSwarm` |
| Cross-host advisor | explicit and read-only | explicit and read-only | explicit and read-only | explicit and read-only |
| Primary-agent ownership | FULL | FULL | FULL | FULL |

No bundled worker owns private persistent memory. It receives current-checkout
evidence and bounded context from the primary host, then returns a result for
primary verification. On Kimi, the review workflow reads the bundled worker
template before creating the corresponding `AgentSwarm` item; the templates are
not presented as nonexistent custom agents.

## 3. Workflow hooks

| Lifecycle | Claude Code | OpenCode | Codex | Kimi Code 0.26+ |
|---|---|---|---|---|
| Session context/health | FULL, DB-derived Context Spine breadcrumb on native `SessionStart` | DEGRADED, projected v2 breadcrumb; health via `system.doctor` | FULL, DB-derived breadcrumb on native `SessionStart` | FULL, DB-derived breadcrumb via session-start skill + hooks |
| Active edit boundary | FULL, `PreToolUse Edit|Write` | FULL, `tool.execute.before` rejects projection writes | FULL, `PreToolUse Edit|Write|apply_patch` | FULL, native `PreToolUse Edit|Write` deny contract |
| Pre-compact checkpoint | FULL | FULL | FULL | FULL, native `PreCompact` |
| Post-compact context injection | FULL | FULL, native compacting context | FULL, native `PostCompact` restore | DEGRADED; checkpoint restoration runs, but Kimi 0.26/0.27 does not reinject fire-and-forget hook text |
| Incomplete-stop gate | FULL, native blocking `Stop` | DEGRADED, no equivalent blocking stop hook | FULL, native blocking `Stop` | FULL, native structured deny |
| Subagent lifecycle evidence | FULL | DEGRADED, no equivalent packaged event | FULL | FULL, native `SubagentStart` / `SubagentStop` |

Kimi's session bootstrap therefore also instructs recovery to inspect
`.ultra/runtime/checkpoint.json` and call Ultra status/doctor after compaction.
This keeps durable recovery intact without claiming dynamic context injection
that the host does not guarantee.

Health/context hooks inspect initialized projects; projection protection also
applies at baseline, while compact/stop/subagent enforcement remains
active-workflow scoped. No host receives prompt capture, transcript capture,
observation journaling, session-summary memory, generic command blocking, or
generic post-edit policy.

## 4. MCP and state

| Capability | Claude Code | OpenCode | Codex | Kimi Code 0.26+ |
|---|---|---|---|---|
| stdio MCP registration | plugin `.mcp.json` | `opencode.json` local MCP entry | plugin `.mcp.json` | plugin `mcpServers` entry |
| Live/declared contracts | 32 | 32 | 32 | 32 |
| Context Spine v2 / breadcrumb | FULL | FULL, DB-generated projection consumed by native JS | FULL | FULL |
| Approval-gated spec learning | FULL | FULL | FULL | FULL |
| Host-native review/discovery/ask | native | native | documented in `codex-capability-map.json` | native Kimi tools and workers |
| Durable authority | project `.ultra/state.db` | project `.ultra/state.db` | project `.ultra/state.db` | project `.ultra/state.db` |
| Ultra memory API | N/A | N/A | N/A | N/A |

All 32 `task.*`, `session.*`, `change.*`, `system.*`, and `plan.*` operations
registered by `mcp-server/server.cjs` are live. Review, impact discovery, skill
loading, and user interaction remain host-native surfaces.

Kimi starts plugin MCP processes with the managed plugin root as `cwd`. The
generated launcher recovers the project from the inherited `PWD`, sets
`UBP_ROOT_DIR` and `UBP_DB_PATH`, and refuses to start if that project boundary
cannot be established. On POSIX it intentionally uses `env node` because Kimi
0.26/0.27's embedded Node ABI differs from the ABI used to install `better-sqlite3`.

## 5. User handbook presentation

| Capability | Claude Code | OpenCode | Codex | Kimi Code 0.26+ |
|---|---|---|---|---|
| Durable user file | `~/.claude/CLAUDE.md` | `~/.config/opencode/AGENTS.md` | `~/.codex/AGENTS.md` | `~/.kimi-code/AGENTS.md` |
| Automatic overwrite by plugin install | no | no | no | no |
| Explicit managed-block sync | `ubp-handbook --runtime claude` | `ubp-handbook --runtime opencode` | `ubp-handbook --runtime codex` | `ubp-handbook --runtime kimi` |
| Backup before change | FULL | FULL | FULL | FULL |

The Kimi plugin installer does not edit `~/.kimi-code/config.toml`. Handbook
sync remains a separate, previewable action so user policy and plugin mechanics
do not become one irreversible mutation.

## 6. Install, update, and uninstall

| Capability | Claude Code | OpenCode | Codex | Kimi Code 0.26+ |
|---|---|---|---|---|
| Adapter install | FULL | FULL | FULL | FULL |
| Global install command | `ubp --claude --global` | `ubp --opencode --global` | `ubp --codex --global` | `ubp --kimi --global` |
| Native update visibility | next host session | host restart | cachebuster + new task | `/reload` or new session |
| Removes stale managed assets | FULL | FULL | FULL | FULL |
| Preserves unrelated config | FULL | FULL | FULL | FULL, including `config.toml` and unrelated registry records |
| Uninstall ownership guard | managed plugin root | sentinels + owned MCP entry | managed root/manifest/agent headers | managed root + exact registry record |
| Normalized install provenance | FULL | FULL | FULL | FULL |
| Read-only `ubp --doctor` | FULL | FULL | FULL | FULL |
| Asset-content and host-contract drift detection | FULL | FULL | FULL | FULL |

Kimi's global managed root is
`~/.kimi-code/plugins/managed/ultra-builder-pro`; its only registry mutation is
the owned `ultra-builder-pro` entry in `~/.kimi-code/plugins/installed.json`.
Reinstall preserves the user's enabled/capability choices and unrelated plugin
records. Uninstall refuses an unmanaged or conflicting root.

## 7. Durable schema compatibility

| Capability | Contract |
|---|---|
| Current state schema | `10.0` |
| Runtime values | `claude`, `opencode`, `codex`, `kimi` |
| Upgrade from earlier schema | preserves Kimi runtime rows, adds Context Spine columns and `spec_learning_candidates` transactionally |
| Preservation gate | rows, IDs, indexes, foreign keys, telemetry, incidents, and migration history remain intact |
| Failure behavior | rollback; no partially upgraded authority database |

## 8. Verification sources

- `adapters/tests/*.test.cjs` verifies each installer and native manifest.
- `tests/conformance/<runtime>/*.test.cjs` verifies command/skill, hook, MCP,
  idempotency, and smoke presentation for all four hosts.
- `tests/conformance/kimi/smoke.test.cjs` reproduces Kimi's plugin-root MCP
  `cwd` and proves that the first state write lands in the active project.
- `adapters/_shared/tests/runtime-assets.test.cjs` prevents retired or external
  skills and generic/memory hooks from re-entering a package.
- `tests/retired-runtime.test.cjs` prevents retired runtime code or prompt text
  from re-entering active product surfaces.
- `adapters/_shared/tests/handbook.test.cjs` verifies host rendering, backup,
  migration, and idempotency.
- `adapters/_shared/tests/provenance.test.cjs` verifies normalized manifests,
  content hashes, source attribution, corruption handling, and contract drift.
- `tests/install.test.cjs` verifies healthy four-host doctor output and
  host-specific hook/MCP degradation after controlled tampering.
- `tests/package-smoke.test.cjs` installs the packed tarball into a clean
  consumer and executes a live MCP round trip through every generated launcher.

Any capability claim elsewhere must match current adapter code and these tests.
