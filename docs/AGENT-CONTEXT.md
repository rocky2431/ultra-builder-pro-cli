# Ultra Builder Pro — Agent Context

Current shared runtime contract for the native Claude Code, OpenCode, Codex,
and Kimi Code plugins.

## 1. Ownership boundary

Ultra Builder Pro owns only:

- twelve public workflows: `learn`, `ultra-init`, `ultra-research`, `ultra-plan`,
  `ultra-dev`, `ultra-test`, `ultra-review`, `ultra-deliver`, `ultra-status`, and
  `ultra-think`, plus the daily `ultra-change` and diagnostic `ultra-doctor`;
- four internal agent-only rule skills: `code-review-expert`, `security-rules`,
  `integration-rules`, and `testing-rules`;
- the host-specific collaboration companions, `ultra-verify`, and the minimal
  Kimi session bootstrap required to establish the shared runtime boundary;
- bounded review/debug agents, workflow-only hooks, MCP task state, and the
  portable CLI/orchestrator.

Browser automation, deployment helpers, skill discovery, Vercel guidance, and
other framework skills are external packages. Adapters build exclusively from
`adapters/_shared/runtime-assets.cjs`; adding a directory under `skills/` does
not put it in a plugin until that allowlist classifies it.

## 2. Three-layer architecture

```text
native command or skill -> MCP workflow-state operation -> .ultra/state.db
                                      ^
                                      |
              selected CLI init / doctor / diagnostics / orchestration
```

| Layer | Artifact | Contract |
|---|---|---|
| Skill/command | `skills/*/SKILL.md`, `commands/*.md` | Model-facing workflow and host-native entry point |
| MCP | `mcp-server/server.cjs` | Authoritative typed operations over `.ultra/state.db` |
| CLI | `ultra-tools`, `ubp-orchestrator` | Selected initialization, backup-first recovery, automation, and diagnostics; not a change-state mirror |

`.ultra/state.db` is the only durable Ultra authority for changes, tasks,
sessions, events, incidents, projection jobs/cursors, telemetry, review evidence,
and circuit-breaker state. `tasks.json`, context Markdown, execution plans, and
reports are projections or workflow artifacts.

## 3. Live MCP and declared contracts

`spec/mcp-tools.yaml` declares and the bundled server registers 29 tools across
five families:

| Family | Live tools |
|---|---|
| `task.*` | create, update, list, get, switch_tag, delete, init_project, expand, parse_prd, dependency_topo, append_event, subscribe_events |
| `session.*` | spawn, close, get, list, admission_check, heartbeat, subscribe_events |
| `change.*` | create, update, get, list, context, converge, archive |
| `system.*` | doctor |
| `plan.*` | export, get |

Review, repository impact discovery, skill loading, and user interaction remain
host-native capabilities rather than fake MCP contracts. The generated Codex
capability map documents those replacements.

Any new MCP contract starts in `spec/mcp-tools.yaml` with valid and invalid
fixtures. Do not add an ad-hoc server handler first.

## 4. Native host presentation

| Host | Plugin form | Workflow entry | Hook form | Collaboration companions |
|---|---|---|---|---|
| Claude Code | `.claude-plugin/plugin.json`, native commands/skills/agents, `.mcp.json` | `/ultra-*`, `/learn` | native `hooks/hooks.json` | `codex-collab`, `ultra-verify` |
| Codex | personal plugin with `.codex-plugin/plugin.json`, namespaced skills, TOML agents, `.mcp.json` | `$ultra-builder-pro:ultra-*`, `$ultra-builder-pro:learn` | native `hooks/hooks.json` through the Codex wire adapter | `cc-collab`, `ultra-verify` |
| OpenCode | config bundle plus native JavaScript plugin | `/ultra-*`, `/learn` | `event`, system transform, compaction, and tool lifecycle handlers | `cc-collab`, `codex-collab`, `ultra-verify` |
| Kimi Code 0.26+ | managed `kimi.plugin.json` plugin with commands, skills, hooks, and MCP | `/ultra-builder-pro:ultra-*`, `/ultra-builder-pro:learn` | native hooks through the Kimi wire adapter | `cc-collab`, `codex-collab`, `ultra-verify` |

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

`health_check.py` and `workflow_context.py` may inspect any initialized project;
`active_task_context.py` always protects the task projection but limits ordinary
edit guidance to an active workflow. Compact/stop/subagent hooks remain
active-workflow scoped. OpenCode natively injects baseline/change context and
protects the projection; full health inspection is available through
`system.doctor` rather than a session-start health hook.
Generic command blocking, post-edit governance, and unrelated user hooks are not
copied into Ultra Builder Pro.

## 6. Memory boundary

Ultra Builder Pro has no memory MCP family, recall skill, prompt capture,
transcript capture, observation journal, or session-summary hook. Persistent
cross-session memory belongs to a separately installed provider such as
cloud-mem/claude-mem. Code graph content is equally external. A change context
may contain only provider metadata references, never provider payload content.

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
├── changes/
│   ├── active/<id>/         # intent, delta, plan, compiled context, verification
│   └── archive/             # converged packets after baseline reconciliation
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
