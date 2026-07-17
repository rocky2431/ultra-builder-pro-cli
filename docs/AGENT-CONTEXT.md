# Ultra Builder Pro — Agent Context

Current shared runtime contract for the native Claude Code, OpenCode, and Codex
plugins.

## 1. Ownership boundary

Ultra Builder Pro owns only:

- ten public workflows: `learn`, `ultra-init`, `ultra-research`, `ultra-plan`,
  `ultra-dev`, `ultra-test`, `ultra-review`, `ultra-deliver`, `ultra-status`, and
  `ultra-think`;
- four internal agent-only rule skills: `code-review-expert`, `security-rules`,
  `integration-rules`, and `testing-rules`;
- the host-specific collaboration companions and `ultra-verify`;
- bounded review/debug agents, workflow-only hooks, MCP task state, and the
  portable CLI/orchestrator.

Browser automation, deployment helpers, skill discovery, Vercel guidance, and
other framework skills are external packages. Adapters build exclusively from
`adapters/_shared/runtime-assets.cjs`; adding a directory under `skills/` does
not put it in a plugin until that allowlist classifies it.

## 2. Three-layer architecture

```text
native command or skill -> MCP workflow-state operation -> CLI fallback
                                  |
                                  v
                         .ultra/state.db
```

| Layer | Artifact | Contract |
|---|---|---|
| Skill/command | `skills/*/SKILL.md`, `commands/*.md` | Model-facing workflow and host-native entry point |
| MCP | `mcp-server/server.cjs` | Authoritative typed operations over `.ultra/state.db` |
| CLI | `ultra-tools`, `ubp-orchestrator` | Portable fallback, automation, and diagnostics |

`.ultra/state.db` is the only durable Ultra authority for tasks, sessions,
events, telemetry, review evidence, and circuit-breaker state. `tasks.json`,
context Markdown, execution plans, and reports are projections or workflow
artifacts; never treat them as a second writable authority.

## 3. Live MCP and declared contracts

`spec/mcp-tools.yaml` declares 30 contracts across seven families. The bundled
server registers 21 tools:

| Family | Live tools |
|---|---|
| `task.*` | create, update, list, get, switch_tag, delete, init_project, expand, parse_prd, dependency_topo, append_event, subscribe_events |
| `session.*` | spawn, close, get, list, admission_check, heartbeat, subscribe_events |
| `plan.*` | export, get |

The nine declared `review.*`, `impact.*`, `skill.*`, and `ask.*` contracts are
not advertised by the live server. A generated Codex plugin records their
native replacements in `spec/codex-capability-map.json`; other hosts use their
own native review agents, repository discovery, skill loader, and user
interaction surfaces.

Any new MCP contract starts in `spec/mcp-tools.yaml` with valid and invalid
fixtures. Do not add an ad-hoc server handler first.

## 4. Native host presentation

| Host | Plugin form | Workflow entry | Hook form | Collaboration companions |
|---|---|---|---|---|
| Claude Code | `.claude-plugin/plugin.json`, native commands/skills/agents, `.mcp.json` | `/ultra-*`, `/learn` | native `hooks/hooks.json` | `codex-collab`, `ultra-verify` |
| Codex | personal plugin with `.codex-plugin/plugin.json`, namespaced skills, TOML agents, `.mcp.json` | `$ultra-builder-pro:ultra-*`, `$ultra-builder-pro:learn` | native `hooks/hooks.json` through the Codex wire adapter | `cc-collab`, `ultra-verify` |
| OpenCode | config bundle plus native JavaScript plugin | `/ultra-*`, `/learn` | `event`, system transform, compaction, and tool lifecycle handlers | `cc-collab`, `codex-collab`, `ultra-verify` |

The current host remains primary. Collaboration skills call another runtime
only when explicitly requested, use it as a read-only advisor, and return the
evidence to the primary host for final verification.

## 5. Hook boundary

The canonical Python hook allowlist contains seven workflow-only adapters:

- `health_check.py` and `workflow_context.py` on session start;
- `active_task_context.py` before an edit;
- `workflow_checkpoint.py` before compaction;
- `workflow_resume.py` after compaction/resume;
- `pre_stop_check.py` at stop;
- `subagent_tracker.py` for bounded worker lifecycle evidence.

Every hook is a no-op unless `.ultra/workflow-state.json` describes an active,
non-terminal workflow. OpenCode expresses the same boundary in its native
JavaScript plugin. Generic command blocking, post-edit governance, and unrelated
user hooks are not copied into Ultra Builder Pro.

## 6. Memory boundary

Ultra Builder Pro has no memory MCP family, recall skill, prompt capture,
transcript capture, observation journal, or session-summary hook. Persistent
cross-session memory belongs to a separately installed provider such as
cloud-mem/claude-mem.

Old Ultra data is never deleted during install. The explicit migration path is:

```bash
ultra-tools legacy-memory inspect
ultra-tools legacy-memory archive
ultra-tools legacy-memory prune --confirm DELETE_ULTRA_LEGACY_MEMORY
```

Archive before prune; the confirmation token is intentionally required.

## 7. Project state layout

```text
.ultra/
├── state.db                 # authoritative SQLite store
├── workflow-state.json      # active workflow/recovery checkpoint
├── tasks/                   # projections and task contexts
├── specs/                   # research/product/architecture artifacts
├── sessions/                # bounded runtime artifacts
├── reviews/                 # review evidence
├── test-report.json
└── delivery-report.json
```

## 8. User handbook integration

General engineering doctrine remains user-owned in `CLAUDE.md` or `AGENTS.md`.
Ultra Builder Pro contributes one managed section only. Preview or apply it with:

```bash
ubp-handbook preview --runtime codex
ubp-handbook apply --runtime codex
```

Supported runtime names are `claude`, `codex`, and `opencode`. Apply creates a
timestamped backup, replaces only the marked block, and can migrate the old
Codex `## Ultra Builder Pro Runtime Contract` section without touching the next
user section. Plugin adapters themselves do not silently overwrite handbooks.

## 9. Verification

Run `npm run test:all`, `python3 -m pytest hooks/tests -q`, and `npm audit`.
Adapter tests assert the allowlisted assets, native manifests, hook boundary,
MCP visibility, and host-specific skill rendering.
