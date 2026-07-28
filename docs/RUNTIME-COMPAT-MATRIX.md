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
| Public entry | `/ultra-builder-pro:ultra-*` | `/ultra-*` | `$ultra-builder-pro:ultra-*` | `/ultra-builder-pro:ultra-*` |
| Public Ultra capabilities | 11, model invocation disabled | 11 commands backed by private workflow assets | 11, implicit invocation disabled | 11, model invocation disabled |
| Internal agent-rule skills | 4, non-user-facing | 4, non-user-facing | 4 with implicit invocation disabled | 4, consumed by review workers |
| Collaboration companions | `codex-collab`, `ultra-verify` | `cc-collab`, `codex-collab`, `ultra-verify` | `cc-collab`, `ultra-verify` | `cc-collab`, `codex-collab`, `ultra-verify` |
| Automatic workflow bootstrap | N/A | N/A | N/A | N/A |
| External browser/deploy/framework skills | N/A | N/A | N/A | N/A |

Codex converts workflows into namespaced skills and records ten compatibility
command mappings in `command-map.json`; `ultra-review` remains directly
invocable as a skill. Kimi registers all eleven commands through its native
plugin command directory and exposes the allowlisted skills independently.

## 2. Agents and collaboration

| Capability | Claude Code | OpenCode | Codex | Kimi Code 0.26+ |
|---|---|---|---|---|
| Bundled review/debug workers | FULL, native Markdown agents | FULL, native agent frontmatter | FULL, 10 managed TOML agents | FUNCTIONAL, 10 prompt templates consumed by `Agent` / `AgentSwarm` |
| Plugin custom-agent registration | FULL | FULL | FULL | N/A; the 0.26 manifest has no custom-agent field |
| Native bounded delegation | native agent surface | native agent surface | native Codex subagents | native `Agent` / `AgentSwarm` |
| Cross-host advisor | explicit and read-only | explicit and read-only | explicit and read-only | explicit and read-only |
| Primary-agent ownership | FULL | FULL | FULL | FULL |

No bundled worker owns private conversational memory. It receives current-checkout
evidence and bounded context from the primary host, then returns a result for
primary verification. On Kimi, the review workflow reads the bundled worker
template before creating the corresponding `AgentSwarm` item; the templates are
not presented as nonexistent custom agents.

## 3. Workflow hooks

| Lifecycle | Claude Code | OpenCode | Codex | Kimi Code 0.26+ |
|---|---|---|---|---|
| Session context/health | FULL, active-workflow breadcrumb on native `SessionStart` | FULL, native JS plugin injects only an active-workflow breadcrumb; health via `system.doctor` | FULL, active-workflow breadcrumb on native `SessionStart` | FULL, active-workflow breadcrumb via native hooks |
| Active edit boundary | FULL, `PreToolUse Edit|Write` | FULL, `tool.execute.before` rejects projection writes | FULL, `PreToolUse Edit|Write|apply_patch` | FULL, native `PreToolUse Edit|Write` deny contract |
| Pre-compact checkpoint | FULL | FULL | FULL | FULL, native `PreCompact` |
| Post-compact context injection | FULL | FULL, native compacting context | FULL, native `PostCompact` restore | DEGRADED; checkpoint restoration runs, but Kimi 0.26/0.27 does not reinject fire-and-forget hook text |
| Stop lifecycle advisory | FULL, native non-blocking `Stop` | N/A, no equivalent stop event needed | FULL, native non-blocking `Stop` | FULL, native non-blocking `Stop` |
| Subagent lifecycle evidence | FULL | DEGRADED, no equivalent packaged event | FULL | FULL, native `SubagentStart` / `SubagentStop` |

Health/context, compact, stop, and subagent hooks remain silent unless
`.ultra/.runtime/state.db` proves an active, blocked, or ready workflow. Projection
protection applies to every initialized project because generated projections
must never become a second authority. No host receives prompt capture, transcript capture,
observation journaling, session-summary memory, generic command blocking, or
generic post-edit policy.
Baseline-adoption and context-budget warnings are injected as advisory context;
they do not deny edits or stop active incident work.

## 4. MCP and state

| Capability | Claude Code | OpenCode | Codex | Kimi Code 0.26+ |
|---|---|---|---|---|
| stdio MCP registration | plugin `.mcp.json` | `opencode.json` local MCP entry | plugin `.mcp.json` | plugin `mcpServers` entry |
| Live/declared contracts | 57 | 57 | 57 | 57 |
| Structured user alignment | `AskUserQuestion` in interactive sessions | `question` when permission is not denied | `request_user_input` when the current mode exposes it | `AskUserQuestion` outside auto mode |
| Greenfield/brownfield baseline adoption | FULL | FULL | FULL | FULL |
| Context Manifest v3 / breadcrumb | FULL | FULL, same bundled read-only DB reader as every hook | FULL | FULL |
| Approval-gated spec learning | FULL | FULL | FULL | FULL |
| Host-native review/discovery/ask | native | native | documented in `codex-capability-map.json` | native Kimi tools and workers |
| Workflow-memory envelope | project `.ultra/` | project `.ultra/` | project `.ultra/` | project `.ultra/` |
| Lifecycle/index authority | project `.ultra/.runtime/state.db` | project `.ultra/.runtime/state.db` | project `.ultra/.runtime/state.db` | project `.ultra/.runtime/state.db` |
| General memory-provider API | N/A | N/A | N/A | N/A |

All 57 `task.*`, `session.*`, `baseline.*`, `change.*`, `decision.*`,
`workflow.*`, `artifact.*`, `system.*`, and `plan.*` operations
registered by `mcp-server/server.cjs` are live. Review, impact discovery, skill
loading, and user interaction remain host-native surfaces.

When a native structured question surface is unavailable, the shared interaction
contract permits one concise direct question only if ordinary conversation is still
available. A host mode that forbids interaction leaves the choice unanswered; Ultra
does not infer consent or silently delegate the semantic route.

Kimi starts plugin MCP processes with the managed plugin root as `cwd`. The
generated launcher recovers the project from the inherited `PWD`, sets
`UBP_ROOT_DIR` and `UBP_DB_PATH`, and refuses to start if that project boundary
cannot be established. On POSIX it intentionally uses `env node` because Kimi
0.26/0.27's embedded Node ABI differs from the ABI used to install `better-sqlite3`.

Archive finalization and archive-journal recovery use an adjacent, explicitly
packaged Python 3 worker. The worker accepts only bounded, basename-only
operations and performs mutations relative to inherited, identity-checked
directory descriptors. This boundary requires a POSIX Python runtime with
`dir_fd`, no-follow `stat`, and `O_NOFOLLOW` support. If that prerequisite is
missing, archive operations fail closed with `ARCHIVE_RUNTIME_UNAVAILABLE`;
Ultra never falls back to ancestor-sensitive pathname mutation. Other MCP
operations remain available.

## 5. User instruction isolation

| Capability | Claude Code | OpenCode | Codex | Kimi Code 0.26+ |
|---|---|---|---|---|
| Durable user file | `~/.claude/CLAUDE.md` | `~/.config/opencode/AGENTS.md` | `~/.codex/AGENTS.md` | `~/.kimi-code/AGENTS.md` |
| Automatic overwrite by plugin install | no | no | no | no |
| Writer shipped by Ultra | N/A | N/A | N/A | N/A |
| Uninstall removes user instructions | no | no | no | no |

The Kimi plugin installer also does not edit `~/.kimi-code/config.toml`. Durable
user preferences belong to each host and remain outside Ultra's ownership.
Legacy Ultra handbook text is not proof of plugin ownership and is never
silently rewritten or removed.

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
| Local-source dirty state and worktree digest | FULL | FULL | FULL | FULL |
| Read-only `ubp --all --global --doctor` | FULL | FULL | FULL | FULL |
| Asset-content and host-contract drift detection | FULL | FULL | FULL | FULL |

Package-local Git provenance never falls through to an enclosing consumer
repository. Source installs record commit, dirty state, and a deterministic
worktree digest; registry installs record unavailable checkout fields as
`null`.

Kimi's global managed root is
`~/.kimi-code/plugins/managed/ultra-builder-pro`; its only registry mutation is
the owned `ultra-builder-pro` entry in `~/.kimi-code/plugins/installed.json`.
Reinstall preserves the user's enabled/capability choices and unrelated plugin
records. Uninstall refuses an unmanaged or conflicting root.

## 7. Durable schema compatibility

| Capability | Contract |
|---|---|
| Current state schema | `20.0` |
| Runtime values | `claude`, `opencode`, `codex`, `kimi` |
| Upgrade from earlier schema | preserves runtime rows, adds Context Spine state through 10.0, authoritative baseline adoption in 11.0, repository evidence in 12.0, durable workflows in 13.0, continuous baseline revalidation in 14.0, typed research semantics and verified reconciliation in 15.0, resumable owner-agent decision threads and workflow alignment gates in 16.0, explicit unborn-Git authority in 17.0, adaptive transitions and legacy workflow normalization in 18.0, non-ceremonial decision completion in 19.0, then typed artifact ownership and normalized dependency edges in 20.0 |
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
- `adapters/_shared/tests/plugin-isolation.test.cjs` and `tests/install.test.cjs`
  verify the absence of a handbook writer and byte-preservation of all user instruction files.
- `adapters/_shared/tests/provenance.test.cjs` verifies normalized manifests,
  content hashes, source attribution, corruption handling, and contract drift.
- `tests/install.test.cjs` verifies healthy four-host doctor output and
  host-specific hook/MCP degradation after controlled tampering.
- `tests/package-smoke.test.cjs` installs the packed tarball into a clean
  consumer and executes a live MCP round trip through every generated launcher.

Any capability claim elsewhere must match current adapter code and these tests.
