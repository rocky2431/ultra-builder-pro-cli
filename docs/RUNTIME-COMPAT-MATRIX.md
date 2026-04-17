# Runtime Compatibility Matrix

Phase 4.6a product. Captures what each of the four target runtimes supports,
what degrades, and what is outright unavailable. Every decision in
`adapters/<runtime>.js` + `hooks/adapters/<runtime>.py` traces back here.

**Legend**:
- **FULL** — native support; our adapter passes it through verbatim
- **DEGRADED** — supported via a workaround (CLI fallback, prompt context)
- **N/A** — not reachable; documented and treated as a graceful no-op

## 1. Command surface

| Capability | Claude | OpenCode | Codex | Gemini |
|-----------|:------:|:--------:|:-----:|:------:|
| Slash command (`/ultra-init …`) | FULL | FULL | DEGRADED (via `prompts/*.md`) | DEGRADED (via `commands/*.toml`) |
| Command frontmatter recognized | FULL (`description`, `model`, `allowed-tools`, `argument-hint`) | FULL (lowercased keys) | N/A (plain prompt, frontmatter stripped) | FULL (`description`, `prompt`) |
| `argument-hint` rendered in picker | FULL | FULL | N/A | DEGRADED (description only) |
| `$ARGUMENTS` / positional args | FULL | FULL | FULL | FULL |
| Thin-shell `workflow-ref` resolution | FULL (agent loads referenced SKILL.md) | FULL | DEGRADED (referenced SKILL.md copied alongside prompt) | DEGRADED (SKILL.md shipped in extension) |

## 2. Skills

| Capability | Claude | OpenCode | Codex | Gemini |
|-----------|:------:|:--------:|:-----:|:------:|
| Skills directory | `~/.claude/skills/` | `~/.config/opencode/skills/` | `~/.agents/skills/` (open-agent standard) | `~/.gemini/extensions/<ext>/skills/` |
| `user-invocable: true` opt-in | FULL | FULL | DEGRADED (read as prompt include) | DEGRADED (read as prompt include) |
| Skill frontmatter parse | FULL | FULL (lowercased) | N/A | N/A |
| Auto-discovery by name | FULL | FULL | FULL (agents convention) | DEGRADED (manifest enumeration) |

## 3. Hook events

| Event | Claude | OpenCode | Codex | Gemini |
|-------|:------:|:--------:|:-----:|:------:|
| SessionStart | FULL | DEGRADED (mapped from `session.start`) | N/A | N/A |
| UserPromptSubmit | FULL | DEGRADED (synth from event bus) | N/A | N/A |
| PreToolUse | FULL | DEGRADED (synth from event bus) | DEGRADED (`pre-tool-exec`, spec pending) | N/A |
| PostToolUse | FULL | DEGRADED (synth from event bus) | DEGRADED (`pre-tool-exec` inverse) | N/A |
| PreCompact / PostCompact | FULL | N/A (no compact) | N/A (no compact) | N/A (no compact) |
| Stop | FULL | DEGRADED (synth) | DEGRADED (`post-session`) | N/A |
| SubagentStop | FULL | N/A | N/A | N/A |
| **Total reachable events** | **8** | **2** (session.start + event) | **2** (pre-tool-exec + post-session, pending) | **0** |

Consequences:
- Claude enforces hooks at runtime — gold standard
- OpenCode / Codex enforce at tool-call + stop boundaries; mid-workflow checks degrade
- Gemini cannot enforce at runtime; guidance degrades to prompt context (see `hooks/adapters/gemini.py`)

## 4. MCP (Model Context Protocol)

| Capability | Claude | OpenCode | Codex | Gemini |
|-----------|:------:|:--------:|:-----:|:------:|
| stdio transport | FULL | FULL | FULL | FULL (via extension manifest) |
| HTTP / SSE transport | FULL | FULL | PARTIAL (upstream) | DEGRADED (extension only) |
| Server registration location | `settings.json → mcpServers` | `opencode.json → mcp` | `config.toml → [mcp_servers.<name>]` | `gemini-extension.json → mcpServers` |
| Our MCP server name | `ultra-builder-pro` | `ultra-builder-pro` | `ultra-builder-pro` | `ultra-builder-pro` |
| Tool call propagation to agent | FULL | FULL | FULL | FULL |

## 5. Subagents

| Capability | Claude | OpenCode | Codex | Gemini |
|-----------|:------:|:--------:|:-----:|:------:|
| Native subagent primitive | `Task` tool | `@mention` | `spawn_agent` | preview (evolving) |
| Parent ↔ child message channel | FULL | FULL | FULL | DEGRADED |
| Stop event emitted to parent | FULL | N/A | N/A | N/A |
| `ultra-tools subagent run` fallback | FULL (all) | FULL | FULL | FULL |

## 6. Ask / user prompts

| Capability | Claude | OpenCode | Codex | Gemini |
|-----------|:------:|:--------:|:-----:|:------:|
| Rich picker widget | `AskUserQuestion` (native) | DEGRADED (text menu) | DEGRADED (text menu) | DEGRADED (text menu) |
| `ask.question` MCP fallback | scheduled (Phase 3.7) | scheduled | scheduled | scheduled |
| `ultra-tools ask …` CLI | scheduled | scheduled | scheduled | scheduled |

## 7. Usage statistics

| Capability | Claude | OpenCode | Codex | Gemini |
|-----------|:------:|:--------:|:-----:|:------:|
| Tokens consumed | FULL | PARTIAL | PARTIAL | N/A |
| Cost accounting | FULL | N/A | N/A | N/A |
| Exposed to agent at runtime | FULL | N/A | N/A | N/A |

## 8. Worktree / process isolation

| Capability | Claude | OpenCode | Codex | Gemini |
|-----------|:------:|:--------:|:-----:|:------:|
| Native `git worktree` integration | FULL (`EnterWorktree` / `ExitWorktree`) | DEGRADED (shell) | DEGRADED (shell) | DEGRADED (shell) |
| Per-session process | via `ctx.newSession()` | via CLI spawn | via CLI spawn | via CLI spawn |
| Phase 4.5 session standard unit | FULL (D20 — new process + worktree + heartbeat) | FULL | FULL | FULL |

## 9. Permissions / approval model

| Capability | Claude | OpenCode | Codex | Gemini |
|-----------|:------:|:--------:|:-----:|:------:|
| Tool-level allow/deny config | `settings.json → permissions` | `opencode.json` | `config.toml → sandbox` | extension manifest |
| Path globs in deny list | FULL | FULL | DEGRADED | DEGRADED |
| Secret file protection | FULL (our template covers `.env`, `credentials*`, `secret*`) | FULL | FULL | DEGRADED |

## 10. Install / uninstall

| Capability | Claude | OpenCode | Codex | Gemini |
|-----------|:------:|:--------:|:-----:|:------:|
| `ultra-builder-pro-cli --<runtime>` install | FULL | FULL | FULL | FULL |
| Uninstall removes only managed assets | FULL (sentinel `_ubp_manifest`) | FULL (sentinel) | FULL (marker block) | FULL (whole extension dir) |
| Install idempotency | FULL | FULL | FULL | FULL |
| User-authored config preserved | FULL | FULL | FULL | N/A (extension is isolated) |

## Sources / decision log

- Claude: [Claude Code Hooks](https://code.claude.com/docs/en/hooks), [Sub-agents](https://code.claude.com/docs/en/sub-agents)
- OpenCode: [Commands](https://opencode.ai/docs/commands/), [Agents](https://opencode.ai/docs/agents/), [Config](https://opencode.ai/docs/config/)
- Codex: [Config Reference](https://developers.openai.com/codex/config-reference), [Skills](https://developers.openai.com/codex/skills), spike R11 pending
- Gemini: [Custom Commands](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/custom-commands.md), [Extensions](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md), spike R13 pending
- PLAN §5 + §14 decisions D23 (matrix requirement) / D35 (a/b split) / R10–R14 (runtime risk register)

## Update protocol

This matrix is the single source of runtime truth. Any capability claim
elsewhere (PLAN, skill/command frontmatter, adapter comments) must cite this
file. Edit here first, then propagate — do not let claims diverge.
