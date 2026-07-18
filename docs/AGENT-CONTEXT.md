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

`.ultra/state.db` is the only durable Ultra authority for baselines, changes, tasks,
sessions, events, incidents, projection jobs/cursors, telemetry, review evidence,
and circuit-breaker state. `tasks.json`, context Markdown, execution plans, and
reports are projections or workflow artifacts.

## 3. Live MCP and declared contracts

`spec/mcp-tools.yaml` declares and the bundled server registers 36 tools across
six families:

| Family | Live tools |
|---|---|
| `baseline.*` | start, record, get, converge |
| `task.*` | create, update, list, get, switch_tag, delete, init_project, expand, parse_prd, dependency_topo, append_event, subscribe_events |
| `session.*` | spawn, close, get, list, admission_check, heartbeat, subscribe_events |
| `change.*` | create, update, get, list, context, breadcrumb, learning_propose, learning_resolve, converge, archive |
| `system.*` | doctor |
| `plan.*` | export, get |

Review, repository impact discovery, skill loading, and user interaction remain
host-native capabilities rather than fake MCP contracts. The generated Codex
capability map documents those replacements.

Any new MCP contract starts in `spec/mcp-tools.yaml` with valid and invalid
fixtures. Do not add an ad-hoc server handler first.

## 4. Context Spine contract

Context Manifest v2 is a DB-backed role handoff, not a static codebase summary.
`change.context` compiles required references, digests, readiness, context budget,
public seam, exact verification command, and one next action for `plan`,
`implement`, `check`, or `review`. The default 12-file, about 12k-token, and 40%
fresh-context values are attention guidance. Overflow produces warnings; it does
not block work or require raising a threshold. Prefer direct reads, bounded
excerpts, or a smaller slice when they preserve correctness, and retain all
necessary context when they do not.

`change.breadcrumb` is the only compact router. Hooks may inject its change/task,
role, gate, readiness, blockers, and one next action. They must not inject intent
bodies, transcripts, external memory, or graph payloads. Missing references,
digest drift, HEAD drift, or a missing execution seam blocks readiness. Context
size and baseline drift are advisory for a change that is already active. New ordinary
work requires a healthy baseline. Only an explicitly approved incident break-glass may
start without it; incident archive records a blocking reconciliation gap. Revision and
tracked-spec integrity are reconciled and rechecked atomically for ordinary archive.

Stable discoveries use `change.learning_propose`; they reach the baseline only
through approve/reject/apply transitions in `change.learning_resolve`. Unresolved
learning blocks convergence. Review contributes two independent axes,
`spec_fidelity` and `engineering_standards`; neither can replace the other.

## 5. Native host presentation

| Host | Plugin form | Workflow entry | Hook form | Collaboration companions |
|---|---|---|---|---|
| Claude Code | `.claude-plugin/plugin.json`, native commands/skills/agents, `.mcp.json` | `/ultra-*`, `/learn` | native `hooks/hooks.json` | `codex-collab`, `ultra-verify` |
| Codex | personal plugin with `.codex-plugin/plugin.json`, namespaced skills, TOML agents, `.mcp.json` | `$ultra-builder-pro:ultra-*`, `$ultra-builder-pro:learn` | native `hooks/hooks.json` through the Codex wire adapter | `cc-collab`, `ultra-verify` |
| OpenCode | config bundle plus native JavaScript plugin | `/ultra-*`, `/learn` | `event`, system transform, compaction, and tool lifecycle handlers | `cc-collab`, `codex-collab`, `ultra-verify` |
| Kimi Code 0.26+ | managed `kimi.plugin.json` plugin with commands, skills, hooks, and MCP | `/ultra-builder-pro:ultra-*`, `/ultra-builder-pro:learn` | native hooks through the Kimi wire adapter | `cc-collab`, `codex-collab`, `ultra-verify` |

The current host remains primary. Collaboration skills call another runtime
only when explicitly requested, use it as a read-only advisor, and return the
evidence to the primary host for final verification.

## 6. Hook boundary

The canonical Python hook bundle contains seven executable workflow hooks plus
the shared read-only `context_spine.py` breadcrumb helper:

- `health_check.py` and `workflow_context.py` on session start;
- `active_task_context.py` before an edit;
- `workflow_checkpoint.py` before compaction;
- `workflow_resume.py` after compaction/resume;
- `pre_stop_check.py` reports unfinished workflow position at stop without denial;
- `subagent_tracker.py` for bounded worker lifecycle evidence.

`workflow_context.py`, `active_task_context.py`, and `workflow_resume.py` read the
same DB-derived breadcrumb through `context_spine.py`. `health_check.py` and
`workflow_context.py` may inspect any initialized project;
`active_task_context.py` always protects the task projection but limits ordinary
edit guidance to an active workflow. Compact/stop/subagent hooks remain
active-workflow scoped. OpenCode natively injects baseline/change context and
protects the projection; full health inspection is available through
`system.doctor` rather than a session-start health hook.
Advisory baseline or context-budget warnings are presentation only and never
reject an edit, stop, or tool call.
Generic command blocking, post-edit governance, and unrelated user hooks are not
copied into Ultra Builder Pro.

## 7. Memory boundary

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

## 8. Project state layout

```text
.ultra/
├── state.db                 # authoritative SQLite store
├── workflow-state.json      # active workflow/recovery checkpoint
├── changes/
│   ├── active/<id>/         # intent, delta, plan, context v2, learning, verification
│   └── archive/             # converged packets after baseline reconciliation
├── tasks/                   # projections and task contexts
├── specs/                   # research/product/architecture artifacts
├── sessions/                # bounded runtime artifacts
├── reviews/                 # review evidence
├── test-report.json
└── delivery-report.json
```

## 9. User handbook integration

General engineering doctrine remains user-owned in `CLAUDE.md` or `AGENTS.md`.
Ultra Builder Pro contributes one managed section only. Preview or apply it with:

```bash
ubp-handbook preview --runtime codex
ubp-handbook apply --runtime codex
```

Supported runtime names are `claude`, `codex`, `opencode`, and `kimi`. Apply creates a
timestamped backup, replaces only the marked block, and can migrate the old
Codex `## Ultra Builder Pro Runtime Contract` section without touching the next
user section. Plugin adapters themselves do not silently overwrite handbooks.

## 10. Verification

Run `npm run test:all`, `python3 -m pytest hooks/tests -q`, and `npm audit`.
Adapter tests assert the allowlisted assets, native manifests, hook boundary,
MCP visibility, and host-specific skill rendering.
