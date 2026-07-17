# Runtime Compatibility Matrix

Current presentation contract for Ultra Builder Pro. Claude Code, OpenCode, and
Codex are the supported native plugin hosts. The canonical asset boundary lives
in `adapters/_shared/runtime-assets.cjs`.

Legend: **FULL** = native host surface, **DEGRADED** = supported but missing an
equivalent lifecycle/control surface, **N/A** = intentionally not installed.

## 1. Plugin and workflow surface

| Capability | Claude Code | OpenCode | Codex |
|---|---|---|---|
| Package form | `.claude-plugin` native plugin | native config bundle + JS plugin | personal `.codex-plugin` |
| Public entry | `/ultra-*`, `/learn` | `/ultra-*`, `/learn` | `$ultra-builder-pro:<skill>` |
| Public Ultra workflows | 10 | 10 | 10 |
| Internal agent-rule skills | 4, non-user-facing | 4, non-user-facing | 4 with implicit invocation disabled |
| Collaboration companions | `codex-collab`, `ultra-verify` | `cc-collab`, `codex-collab`, `ultra-verify` | `cc-collab`, `ultra-verify` |
| External browser/deploy/framework skills | N/A | N/A | N/A |

Codex converts the workflows into namespaced skills and records nine legacy
command mappings in `command-map.json`; `ultra-review` remains directly
invocable as a skill.

## 2. Agents and collaboration

| Capability | Claude Code | OpenCode | Codex |
|---|---|---|---|
| Bundled review/debug agents | FULL, native Markdown agents | FULL, native agent frontmatter | FULL, nine managed TOML custom agents |
| Native bounded delegation | native agent surface | native agent surface | native Codex subagents |
| Cross-host advisor | explicit and read-only | explicit and read-only | explicit and read-only |
| Primary-agent ownership | FULL | FULL | FULL |

No bundled agent owns private persistent memory. It receives current-checkout
evidence and bounded context from the primary host, then returns a result for
primary verification.

## 3. Workflow hooks

| Lifecycle | Claude Code | OpenCode | Codex |
|---|---|---|---|
| Session context/health | FULL, native `SessionStart` | FULL, system transform + event refresh | FULL, native `SessionStart` |
| Active edit boundary | FULL, `PreToolUse Edit|Write` | FULL, `tool.execute.before` rejects projection writes | FULL, `PreToolUse Edit|Write|apply_patch` |
| Compaction recovery | FULL, `PreCompact` + resume matcher | FULL, native compacting context | FULL, `PreCompact` + `PostCompact` |
| Incomplete-stop gate | FULL, native blocking `Stop` | DEGRADED, no equivalent blocking stop hook | FULL, native blocking `Stop` |
| Subagent lifecycle evidence | FULL | DEGRADED, no equivalent packaged event | FULL |

All reachable hooks are workflow-only and no-op without an active non-terminal
`.ultra/workflow-state.json`. No host receives Ultra prompt capture, transcript
capture, observation journaling, session-summary memory, generic command
blocking, or generic post-edit policy.

## 4. MCP and state

| Capability | Claude Code | OpenCode | Codex |
|---|---|---|---|
| stdio MCP registration | plugin `.mcp.json` | `opencode.json` local MCP entry | plugin `.mcp.json` |
| Live contracts | 21 | 21 | 21 |
| Declared contracts | 30 | 30 | 30 |
| Nine non-live contracts | host-native review/discovery/ask | host-native review/discovery/ask | `codex-capability-map.json` |
| Durable authority | project `.ultra/state.db` | project `.ultra/state.db` | project `.ultra/state.db` |
| Ultra memory API | N/A | N/A | N/A |

Only the 21 `task.*`, `session.*`, and `plan.*` operations registered by
`mcp-server/server.cjs` are advertised as live. Review, impact, skill, and user
interaction remain host-native surfaces.

## 5. User handbook presentation

| Capability | Claude Code | OpenCode | Codex |
|---|---|---|---|
| Durable user file | `~/.claude/CLAUDE.md` | `~/.config/opencode/AGENTS.md` | `~/.codex/AGENTS.md` |
| Automatic overwrite by plugin install | no | no | no |
| Explicit managed-block sync | `ubp-handbook --runtime claude` | `ubp-handbook --runtime opencode` | `ubp-handbook --runtime codex` |
| Backup before change | FULL | FULL | FULL |

## 6. Install, update, and uninstall

| Capability | Claude Code | OpenCode | Codex |
|---|---|---|---|
| Adapter install | FULL | FULL | FULL |
| Native update | next host session | host restart | cachebuster + `codex plugin add`, then new task |
| Removes stale managed assets | FULL | FULL | FULL |
| Preserves unrelated config | FULL | FULL | FULL |
| Uninstall ownership guard | managed plugin root | sentinels + owned MCP entry | managed root/manifest/agent headers |

## 7. Verification sources

- `adapters/tests/*.test.cjs` verifies each installer and native manifest.
- `tests/conformance/<runtime>/*.test.cjs` verifies command/skill, hook, MCP,
  idempotency, and smoke presentation.
- `adapters/_shared/tests/runtime-assets.test.cjs` prevents retired or external
  skills and generic/memory hooks from re-entering a package.
- `tests/retired-runtime.test.cjs` prevents retired runtime code or prompt text
  from re-entering active product surfaces.
- `adapters/_shared/tests/handbook.test.cjs` verifies host rendering, backup,
  migration, and idempotency.

Any capability claim elsewhere must match current adapter code and these tests.
