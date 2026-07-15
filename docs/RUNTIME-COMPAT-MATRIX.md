# Runtime Compatibility Matrix

Current presentation contract for Ultra Builder Pro. Claude Code, OpenCode, and
Codex are first-class native plugins; Gemini CLI remains a compatibility
extension. The canonical asset boundary lives in
`adapters/_shared/runtime-assets.cjs`.

Legend: **FULL** = native host surface, **DEGRADED** = compatible but missing an
equivalent lifecycle/control surface, **N/A** = intentionally not installed.

## 1. Plugin and workflow surface

| Capability | Claude Code | OpenCode | Codex | Gemini CLI |
|---|---|---|---|---|
| Package form | `.claude-plugin` native plugin | native config bundle + JS plugin | personal `.codex-plugin` | compatibility extension |
| Public entry | `/ultra-*`, `/learn` | `/ultra-*`, `/learn` | `$ultra-builder-pro:<skill>` | generated command TOML |
| Public Ultra workflows | 10 | 10 | 10 | 10 |
| Internal agent-rule skills | 4, non-user-facing | 4, non-user-facing | 4 with implicit invocation disabled | 4 prompt dependencies |
| Collaboration companions | `codex-collab`, `gemini-collab`, `ultra-verify` | `cc-collab`, `codex-collab`, `gemini-collab`, `ultra-verify` | `cc-collab`, `gemini-collab`, `ultra-verify` | `cc-collab`, `codex-collab`, `ultra-verify` |
| External browser/deploy/framework skills | N/A | N/A | N/A | N/A |

Codex does not emulate deprecated custom slash prompts. Its adapter converts
the workflows into namespaced skills and records nine legacy command mappings
in `command-map.json`; `ultra-review` is directly invocable as a skill.

## 2. Agents and collaboration

| Capability | Claude Code | OpenCode | Codex | Gemini CLI |
|---|---|---|---|---|
| Bundled review/debug agents | FULL, native Markdown agents | FULL, lowercased native agent frontmatter | FULL, nine managed TOML custom agents | N/A |
| Native bounded delegation | `Task`/agent surface | native agent surface | native Codex subagents | evolving host surface, not packaged |
| Cross-host advisor | explicit collab skill; read-only | explicit collab skill; read-only | explicit collab skill; read-only | explicit collab skill; read-only |
| Primary-agent ownership | FULL | FULL | FULL | FULL |

No bundled agent declares private persistent memory. It receives current
checkout evidence and bounded context from the primary host, then returns a
result for primary verification.

## 3. Workflow hooks

| Lifecycle | Claude Code | OpenCode | Codex | Gemini CLI |
|---|---|---|---|---|
| Session context/health | FULL, native `SessionStart` | FULL, system transform + event refresh | FULL, native `SessionStart` | N/A |
| Active edit boundary | FULL, `PreToolUse Edit|Write` | DEGRADED, tool lifecycle can refresh but not inject a native pre-edit message | FULL, `PreToolUse Edit|Write` | N/A |
| Compaction recovery | FULL, `PreCompact` + compact resume matcher | FULL, native compacting context | FULL, `PreCompact` + `PostCompact` | N/A |
| Incomplete-stop gate | FULL, native blocking `Stop` hook | DEGRADED, no equivalent blocking stop hook | FULL, native blocking `Stop` hook | N/A |
| Subagent lifecycle evidence | FULL | DEGRADED, no equivalent packaged event | FULL | N/A |

All reachable hooks are workflow-only and no-op without an active non-terminal
`.ultra/workflow-state.json`. No runtime receives Ultra prompt capture,
transcript capture, observation journal, session-summary memory, generic command
blocking, or generic post-edit policy.

## 4. MCP and state

| Capability | Claude Code | OpenCode | Codex | Gemini CLI |
|---|---|---|---|---|
| stdio MCP registration | plugin `.mcp.json` | `opencode.json` local MCP entry | plugin `.mcp.json` | extension manifest |
| Live contracts | 21 | 21 | 21 | 21 |
| Declared upstream contracts | 30 | 30 | 30 | 30 |
| Nine non-live contracts | host-native review/discovery/ask surfaces | host-native review/discovery/ask surfaces | explicit `codex-capability-map.json` | compatibility guidance |
| Durable authority | project `.ultra/state.db` | project `.ultra/state.db` | project `.ultra/state.db` | project workflow state when invoked from the project |
| Ultra memory API | N/A | N/A | N/A | N/A |

The seven declared tool families are `task`, `session`, `plan`, `review`,
`impact`, `skill`, and `ask`. Only the 21 `task.*`, `session.*`, and `plan.*`
operations registered by `mcp-server/server.cjs` are advertised as live.

## 5. User handbook presentation

| Capability | Claude Code | OpenCode | Codex | Gemini CLI |
|---|---|---|---|---|
| Durable user file | `~/.claude/CLAUDE.md` | `~/.config/opencode/AGENTS.md` | `~/.codex/AGENTS.md` | extension `GEMINI.md` context |
| Automatic overwrite by plugin install | no | no | no | extension-owned context only |
| Explicit managed-block sync | `ubp-handbook --runtime claude` | `ubp-handbook --runtime opencode` | `ubp-handbook --runtime codex` | N/A |
| Backup before change | FULL | FULL | FULL | N/A |

## 6. Install, update, and uninstall

| Capability | Claude Code | OpenCode | Codex | Gemini CLI |
|---|---|---|---|---|
| Adapter install | FULL | FULL | FULL | FULL compatibility |
| Native registration/update | host loads plugin directory on next session | host loads local JS plugin on restart | cachebuster + `codex plugin add`; start a new task | host loads extension |
| Removes stale managed assets | FULL | FULL | FULL | FULL while preserving extension runtime state |
| Preserves unrelated user config | FULL | FULL | FULL | FULL inside user config; extension directory is managed |
| Uninstall ownership guard | managed plugin root | sentinels + owned MCP entry | managed root/manifest/agent headers | extension `_ubp.source` |

## 7. Verification sources

- `adapters/tests/*.test.cjs` verifies each installer and native manifest.
- `tests/conformance/<runtime>/*.test.cjs` verifies command/skill, hook, MCP,
  idempotency, and smoke presentation.
- `adapters/_shared/tests/runtime-assets.test.cjs` prevents retired or external
  skills and generic/memory hooks from re-entering any package.
- `adapters/_shared/tests/handbook.test.cjs` verifies host rendering, safe
  legacy-section migration, backup, and idempotency.

Any capability claim elsewhere must match current adapter code and these tests.
