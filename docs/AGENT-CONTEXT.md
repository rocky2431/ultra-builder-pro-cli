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
- the host-specific collaboration companions, `ultra-verify`, and host-native
  explicit command or skill entry points;
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

`.ultra/state.db` is the only durable Ultra authority for baselines, changes, decisions, tasks,
workflow runs/steps, sessions, events, incidents, projection jobs/cursors, telemetry, review evidence,
and circuit-breaker state. `tasks.json`, context Markdown, execution plans, and
reports are projections or workflow artifacts.

## 3. Live MCP and declared contracts

`spec/mcp-tools.yaml` declares and the bundled server registers 50 tools across
eight families:

| Family | Live tools |
|---|---|
| `baseline.*` | start, record, get, converge |
| `task.*` | create, update, list, get, switch_tag, delete, init_project, expand, parse_prd, dependency_topo, append_event, subscribe_events |
| `session.*` | spawn, close, get, list, admission_check, heartbeat, subscribe_events |
| `change.*` | create, update, get, list, context, breadcrumb, learning_propose, learning_resolve, converge, archive |
| `decision.*` | thread_start, get, list, open, resolve, delegate, defer, supersede, checkpoint |
| `workflow.*` | start, get, list, step, complete |
| `system.*` | doctor |
| `plan.*` | export, get |

Review, repository impact discovery, skill loading, and decision presentation remain
host-native capabilities rather than fake MCP contracts. MCP stores only normalized
decision authority and checkpoints; it never generates questions or retains prompts
and transcripts. The generated Codex capability map documents host replacements.

The complete write, transition, invalidation, and recovery contract lives in
[`WORKFLOW-LIFECYCLE.md`](./WORKFLOW-LIFECYCLE.md).

Any new MCP contract starts in `spec/mcp-tools.yaml` with valid and invalid
fixtures. Do not add an ad-hoc server handler first.

## 4. Human-agent alignment contract

`skills/ultra-think/references/decision-dialogue.md` is the single reusable prompt
contract for load-bearing owner choices. Research, change, and plan read it at their
decision boundaries. They inspect evidence first, expose only the earliest unresolved
choice, include a recommendation and durable effects, and stop the turn. Dev, test,
review, and deliver route back to the same thread instead of deciding for the owner.

One partial unique index permits only one open item per thread. `decision.resolve`,
`decision.delegate`, and `decision.defer` preserve the source of authority;
`decision.supersede` preserves history when evidence or intent changes. Prepare and
confirm checkpointing bind a material accepted cluster to current artifact digests
when interruption recovery needs that boundary. Status and breadcrumb return only the
current question plus allowed and mechanically required transitions, so recovery does
not require replaying conversation history.

## 5. Context Spine contract

Context Manifest v3 is an immutable DB-backed role handoff, not a static codebase summary.
`change.context` compiles required references, digests, readiness, context budget,
public seam, exact verification command, Change/task authority digests, and valid
transitions for `plan`, `implement`, `check`, or `review`. The default 12-file,
about 12k-token, and 40%
fresh-context values are attention guidance. Overflow produces warnings; it does
not block work or require raising a threshold. Prefer direct reads, bounded
excerpts, or a smaller slice when they preserve correctness, and retain all
necessary context when they do not.

`change.breadcrumb` is the only compact router. Hooks may inject its change/task,
role, gate, readiness, blockers, `allowed_transitions`, and `required_transition`.
They must not inject intent
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

## 6. Native host presentation

| Host | Plugin form | Workflow entry | Hook form | Collaboration companions |
|---|---|---|---|---|
| Claude Code | `.claude-plugin/plugin.json`, native commands/skills/agents, `.mcp.json` | `/ultra-*`, `/learn` | native `hooks/hooks.json` | `codex-collab`, `ultra-verify` |
| Codex | personal plugin with `.codex-plugin/plugin.json`, namespaced skills, TOML agents, `.mcp.json` | `$ultra-builder-pro:ultra-*`, `$ultra-builder-pro:learn` | native `hooks/hooks.json` through the Codex wire adapter | `cc-collab`, `ultra-verify` |
| OpenCode | config bundle plus native JavaScript plugin | `/ultra-*`, `/learn` | `event`, system transform, compaction, and tool lifecycle handlers | `cc-collab`, `codex-collab`, `ultra-verify` |
| Kimi Code 0.26+ | managed `kimi.plugin.json` plugin with commands, skills, hooks, and MCP | `/ultra-builder-pro:ultra-*`, `/ultra-builder-pro:learn` | native hooks through the Kimi wire adapter | `cc-collab`, `codex-collab`, `ultra-verify` |

The current host remains primary. Collaboration skills call another runtime
only when explicitly requested, use it as a read-only advisor, and return the
evidence to the primary host for final verification.

## 7. Hook boundary

The canonical Python hook bundle contains seven executable workflow hooks plus
the shared read-only `context_spine.py` breadcrumb helper:

- `health_check.py` and `workflow_context.py` on session start;
- `active_task_context.py` before an edit;
- `workflow_checkpoint.py` before compaction;
- `workflow_resume.py` after compaction/resume;
- `pre_stop_check.py` reports unfinished workflow position at stop without denial;
- `subagent_tracker.py` for minimal DB event evidence containing only lifecycle ids
  and types, never transcript paths or messages.

`workflow_context.py`, `active_task_context.py`, `workflow_resume.py`, and the
OpenCode plugin invoke the same bundled JavaScript `change.breadcrumb` reader
through the thin `context_spine.py` bridge. No hook reimplements the state query.
`health_check.py` and
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

## 8. Memory boundary

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

## 9. Project state layout

```text
.ultra/
├── state.db                 # authoritative SQLite store
├── runtime/
│   └── checkpoint.json      # advisory breadcrumb recovery projection
├── changes/
│   ├── active/<id>/         # intent, delta, plan, context v3, learning, verification
│   └── archive/             # converged packets after baseline reconciliation
├── tasks/                   # projections and task contexts
├── specs/                   # research/product/architecture artifacts
├── sessions/                # bounded runtime artifacts
├── reviews/                 # immutable review evidence by session id
└── reports/
    ├── templates/           # blank report schemas; never evidence
    ├── tests/<workflow-id>.json
    └── delivery/<workflow-id>.json
```

## 10. Plugin and user-instruction isolation

General engineering doctrine and long-term personal preferences live in each
host's durable `CLAUDE.md` or `AGENTS.md`. Ultra never writes those files. Its
workflow doctrine remains in plugin-owned skills and is loaded only through an
explicit public invocation.

Installation and uninstall own only adapter-declared commands, skills, workers,
hooks, runtime assets, provenance, and host registration. Project authority is
created only by an explicit `ultra-init`, and uninstall never deletes `.ultra/`.
See [`PLUGIN-ISOLATION-CONTRACT.md`](./PLUGIN-ISOLATION-CONTRACT.md).

## 11. Verification

Run `npm run test:all`, `python3 -m pytest hooks/tests -q`, and `npm audit`.
Adapter tests assert the allowlisted assets, native manifests, hook boundary,
MCP visibility, and host-specific skill rendering.
