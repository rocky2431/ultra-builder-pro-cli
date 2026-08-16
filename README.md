# Ultra Builder Pro

Ultra Builder Pro is a file-first engineering workflow for Claude Code, Codex,
OpenCode, Kimi Code, Grok Build, and ZCode. It implements the provider-neutral
**Ultra Core Protocol**: owner–agent cognitive alignment, per-fact canonical
authority, explicit session-local or durable work-package grants, typed evidence
with recovery, and review that terminates within three rounds. It keeps product
intent, specifications, task contracts, evidence, decisions, and recovery notes
in the repository, so a different session or host can continue by reading files
and Git.

The host model remains the engineer. Ultra supplies reusable methods and checkable
artifacts; it does not replace reasoning with a workflow engine. Agent topology —
one Agent or several, which providers — is the owner's choice at every stage; the
default is the current Agent continuing alone.

## Why it exists

Long agentic changes tend to fail in four repeatable ways:

- intent is paraphrased until the delivered product no longer matches the owner;
- a locally green layer is mistaken for a working end-to-end path;
- context loss turns an interrupted task into archaeology;
- safety mechanisms start deciding product meaning and trap the primary workflow.

Ultra addresses those failures with short owner-readable files, progressive Skills,
real verification evidence, and Git recovery. There is no database, MCP server,
semantic state machine, generated prompt projection, or background daemon.

## Product surface

The package installs exactly fourteen Skills in three roles.

### Owner-invoked workflows

| Skill | Outcome |
|---|---|
| `ultra-init` | Establish the project skeleton and raw Project Brief |
| `ultra-research` | Establish an accepted North Star and evidence-backed baseline |
| `ultra-change` | Reconcile one requested delta against the accepted baseline |
| `ultra-plan` | Write tracer-bullet tasks, contexts, dependencies, and seams |
| `ultra-dev` | Implement one task through red/green development and six evidence dimensions |
| `ultra-test` | Audit whole-system wiring, E2E behavior, performance, and security |
| `ultra-deliver` | Reconcile, review, document, and archive a completed Change |
| `ultra-delegate` | Run bounded task work, Research evidence, or aggregate review through another supported CLI |

### Model-invoked disciplines

| Skill | Reused method |
|---|---|
| `ultra-grilling` | Draw out incomplete owner intent one material question at a time |
| `ultra-domain-modeling` | Maintain precise ubiquitous language in `CONTEXT.md` |
| `ultra-tdd` | Prove one confirmed seam red, then green |
| `ultra-review` | Run six independent review lenses and synthesize findings |
| `ultra-think` | Stress-test consequential decisions and record durable results |

`ultra-status` is the single router. It infers the current route from project files,
Git, and installation health without mutating the workflow.

Public workflows are explicitly selected by the owner by default. Outside a live,
owner-activated execution grant (session-local, or a durable work-package grant), one public workflow can recommend the
next one but does not launch it. Inside that grant, the host model may select only
the covered Research, Plan, Dev, Test, and reconcile-only Deliver routes; Init, Change,
Delegate, Status, final archive, and every external effect remain owner-selected.
Model-invoked disciplines remain available to the host model and are not separate user
routes. The model selects one when the active task presents its trigger: incomplete
intent uses grilling, competing terms use domain modeling, an accepted seam uses TDD,
review-ready evidence uses review, and a consequential unresolved decision uses think.
A host with native bounded subagents may parallelize review lenses; another host runs
the same lens assets sequentially.

Inside `ultra-research`, the first six references are six semantic lenses, not six
extra Skills: problem validation, opportunity discovery, market assessment,
alternatives, product strategy, and assumptions validation. `wayfinding.md` chooses
the smallest dependency-correct path through those and the later evidence lenses.
Grilling still owns how to ask one missing question, Think owns one consequential
trade-off, and Domain Modeling owns vocabulary; Research owns the overall question
map, evidence convergence, owner checkpoints, and baseline promotion.

### What happened to the original Agents

v0.26 does not install a custom `agents/` projection. The old review workers became the
six focused files under `ultra-review/references/`; review coordination and synthesis
belong to the parent `ultra-review` Skill. The old debugger procedure lives under
`ultra-dev/references/debugging.md`, and test execution lives under
`ultra-tdd/references/test-execution.md`. These are assets of their Skills and therefore
travel to all six hosts. They preserve a bounded role without pretending that every
host exposes the same custom-agent API.

## Project authority

A project after its first accepted Research baseline uses this shape. Immediately after
Init, `CONTEXT.md` does not exist yet and the North Star/specification files are empty
skeletons.

```text
CONTEXT.md
.ultra/
├── .gitignore                  # ignores only derived Ultra paths
├── project-brief.md
├── north-star.md
├── tasks.json
├── test-report.json
├── specs/
│   ├── product.md
│   ├── architecture.md
│   ├── discovery.md
│   └── research-distillate.md
├── changes/
│   ├── active/<change-id>/{intent.md,delivery.md}
│   ├── archive/<change-id>/{intent.md,delivery.md}
│   └── abandoned/<change-id>/intent.md  # includes exact Abandonment closure
├── contexts/task-<task-id>.md
├── decisions/<decision-id>.md
├── evidence/<task-id>/...
└── research/<run-id>/{brief.md,<step-id>.md}
```

The optional `brief.md` is derived navigation; the selected step reports are cited
evidence, and promoted semantic facts live in the other canonical files. Git provides
history, comparison, rollback, and archive moves. The following additional paths are
derived:

```text
.ultra/.runtime/
.ultra/progress/
.ultra/reviews/
```

`.ultra/.runtime/` and `.ultra/progress/` can be deleted or rebuilt from current
authority. Retain the exact current strict review session until both Test and Deliver
have successfully consumed it; only then may that session be garbage-collected. If it
is lost before both consumers finish, run a fresh Review and Test and never reconstruct
the old receipt.

See [Artifact Authority](docs/ARTIFACT-AUTHORITY.md) for writer, reader, promotion,
staleness, and recovery rules.

### Which route writes which document

| Route | Canonical write | Who consumes it next |
|---|---|---|
| `ultra-init` | raw `project-brief.md`, empty North Star and specification skeletons, and empty task/test ledgers | research, status, and the pre-baseline session Hook fallback |
| `ultra-research` | accepted North Star, first domain baseline, selected cited reports, reconciled specifications, and distillate | change, plan, and delivery |
| `ultra-change` | one active `intent.md` with stable `change_id`, Research Disposition, and only the accepted baseline sections touched by that delta; or an exact Abandonment closure before an owner-authorized move | active: research through delivery; abandoned: future Change history and status |
| `ultra-plan` | append-only `tasks.json` rows for the active `change_id`, one context per task, and Planning Posture in the active intent | dev and every resume path |
| `ultra-dev` | source/tests, typed task evidence, ledger-only task status, Completion, Task Review, and Resume Note | review, test, status, delivery |
| `ultra-test` | the one current `test-report.json` bound to Change id, current task ids, intent digest, HEAD, and product-worktree digest | status and delivery |
| `ultra-deliver` | first reconciled specs/docs, then after a fresh Test snapshot one `delivery.md` and the archived Change directory | owner and future Change history |
| `ultra-status` | none | recommends the smallest explicit route from current files |
| `ultra-delegate` | derived runtime receipt plus an isolated worktree diff | primary host inspection and optional integration |

`ultra-domain-modeling` is the sole focused writer of `CONTEXT.md`; `ultra-think` writes
a durable decision only after owner acceptance. Review packets, Hook progress, compact
snapshots, and delegation receipts are derived evidence, not extra semantic documents.

## Install

Node.js 22 or newer is required.

```bash
# Current project, one host
npx ultra-builder-pro-cli --claude --local
npx ultra-builder-pro-cli --codex --local

# Global installation
npx ultra-builder-pro-cli --opencode --global
npx ultra-builder-pro-cli --kimi --global
npx ultra-builder-pro-cli --grok --global
npx ultra-builder-pro-cli --zcode --global

# All supported hosts
npx ultra-builder-pro-cli --all --global
```

Use the host's native Skill picker or invocation syntax to select an owner workflow.
Codex exposes namespaced entries such as `$ultra-builder-pro:ultra-init`. The installed
frontmatter and metadata keep user routes explicit and model disciplines implicit.

### Diagnose, update, and uninstall

Installation is managed, atomic, and provenance-checked.

```bash
# Re-running install updates the managed artifact
npx ultra-builder-pro-cli --codex --global

# Read-only diagnosis
npx ultra-builder-pro-cli --all --global --doctor --json

# Remove only managed Ultra assets
npx ultra-builder-pro-cli --all --global --uninstall
```

`--config-dir <path>` isolates both the primary config and host-owned sidecars. It is
the safe choice for tests and does not fall through to the real home directory. When
more than one host is selected, each host receives `<path>/<runtime>` so their native
layouts cannot overwrite one another.

Uninstall removes the managed plugin and prunes only empty config shells that were
absent before the first install. Pre-existing registries, directories, symlinks, and
any path containing owner data are preserved.

Kimi Code, Grok Build, and ZCode currently expose user-scoped plugins only, so `--local`
rejects them before mutation. Claude Code, Codex, and OpenCode support project-local
installation; all six support managed global installation and isolated
`--config-dir` verification.

## Typical workflow

1. Select `ultra-init` once. It writes the skeleton, preserves the owner's raw one-line
   request and broad outline in the Project Brief, initializes Git when needed, and
   stops before product research.
2. Select `ultra-research` to turn that brief into the first accepted North Star,
   shared vocabulary, and evidence-backed product and architecture baseline. For an
   unclear multi-lens question it first writes a derived Wayfinding brief; for one
   bounded evidence gap it skips that extra file.
3. Select `ultra-change` for a requested delta. It reconciles only the baseline sections
   the delta touches before planning; it does not rebuild the project baseline. Its
   Research Disposition either cites sufficient evidence or names the bounded question
   and exit evidence that must return through Research. A micro edit that makes no
   specification sentence false stays outside Ultra; every accepted Change receives the
   smallest Plan graph justified by its real seams, evidence, review, and recovery needs.
   A profile never fixes task count. While that Change remains active, reconcile its
   same stable id; never open a second active Change for a separate request.
4. Select `ultra-plan` to record public seams and produce resumable tracer-bullet tasks.
   The model owns ordinary technical seams; the owner decides only a seam that changes
   the public contract or another material trade-off.
5. Select `ultra-dev` for one task at a time. `.ultra/tasks.json` is the sole task-status
   authority. Dev records typed v2 evidence and completes task review while the row is
   still `in_progress`; only after blocking findings and affected evidence are resolved
   does it write `completed`, add Completion, and rewrite the Resume Note.
6. Select `ultra-test` once tasks for the active Change are completed with current v2
   evidence and retained task-review provenance. Historical ledger rows and legacy
   context Status fields do not enter this audit. Local green tests do not substitute
   for wiring and E2E proof.
7. Select `ultra-deliver` to run aggregate review and reconcile documentation. If that
   changes product or semantic files, rerun Test; re-enter Deliver on the fresh snapshot
   to write delivery metadata and archive the stable Change id. Commit, push, tag,
   publication, and deployment remain separately authorized effects.

For one accepted Change, the owner may activate its exact `Execution Grant` in either
mode. A `session-local` grant lives only in the current conversation: when that
activation is lost — a fresh session, another host, or compaction — the work stops and
waits for a new owner activation. A `durable work-package` grant lets a fresh Agent or
host continue one exact work package, but only after the Agent stably verifies the
recorded grant itself. In both modes the model may select the covered Research, Plan,
Dev, Test, and reconcile-only Deliver routes until the next semantic stop or declared
budget, and neither mode grants finalization or archive: writing `delivery.md`, version
or package posture, and archiving always require a current explicit owner invocation,
as do commit, push, publication, deployment, installation, and every other external
effect.

At any point, `ultra-status` can reconstruct the current position. A fresh session or
different host resumes by reading `.ultra/tasks.json`, the selected `context_file`, its
`## Resume Note`, `CONTEXT.md`, relevant decisions, the active Change, and Git. It first
filters the append-only ledger to tasks whose `change_id` matches the unique active
Change; archived and abandoned unfinished rows are history, not the frontier.

## Three independent integration defences

The workflow does not treat “tests pass” as an end-to-end verdict.

- `ultra-plan` rejects horizontal feature slicing and confirms observable seams.
- `ultra-dev` records tests, persistence, feature flags, vertical execution, and spec
  trace as six separate observations.
- `ultra-test` searches changed exports for real non-test consumers and runs the
  smallest primary flow through its boundary.

Each defence can report a defect independently. The reports are sensors, not semantic
gates; the model and owner decide the response without erasing evidence.

## Hooks

Five optional hooks accelerate file reading and protect a narrow effect boundary:

| Hook | Behavior |
|---|---|
| `session_context.py` | Inject the accepted North Star, or the Project Brief fallback before Research, plus current acceptance |
| `mid_workflow_recall.py` | Restate acceptance before relevant source operations |
| `compact_context.py` | Save and restore a disposable Git/file snapshot |
| `post_edit_guard.py` | Record mechanical evidence observations after edits |
| `block_dangerous_commands.py` | Advise on additive protected-branch publication; deny history rewrites and named destructive shell effects until the exact command is authorized |

All five hooks exit silently when `.ultra/` is absent. Details are in
[Plugin Isolation](docs/PLUGIN-ISOLATION-CONTRACT.md).

## Delegation

Delegation writes an immutable instruction and permission envelope, then starts the
selected CLI in the background. Empty writable roots select native read-only mode;
declared roots select bounded write mode. The model returns one schema-constrained final
response; the launcher extracts it from native structured output, validates the actual
Git diff, and atomically publishes a terminal `finished`, `blocked`, or `failed` result
beside the instruction. The digest-bound packet is embedded in the worker prompt, so a
strict host need not read instruction files outside its isolated worktree.

```bash
ubp delegate run --to codex \
  --instruction .ultra/.runtime/delegations/D-01/instruction.md \
  --permission .ultra/.runtime/delegations/D-01/permission.json \
  --worktree .ultra/.runtime/worktrees/D-01
```

Use `skills/ultra-delegate/scripts/delegate_wait.py` to wait for `result.json` without
loading intermediate worker output into the parent context. Delegation grants no new
authority; writable roots remain inside the worktree, and its permission file must
declare zero external effects without widening the host sandbox.
The immutable instruction names task execution/continuation, scoped Research evidence,
or aggregate Change review/verification. The latter two may be read-only and do not
require a task row, keeping pre-Plan Research and post-task cross-family review
reachable without inventing ledger work.

## Host support

| Host | Skills | Hooks | Managed lifecycle |
|---|---:|---:|---|
| Claude Code | 14 | 5 direct | install / doctor / update / uninstall |
| Codex | 14 + native metadata | 5 through wire adapter | plugin + personal marketplace |
| OpenCode | 14 | 5 through native JS plugin | bundle + skill directories |
| Kimi Code | 14 | 5 through wire adapter | managed plugin registry |
| Grok Build | 14 | 5 through wire adapter | native plugin registration when available |
| ZCode | 14 | 5 through wire adapter | inline plugin + local marketplace + reversible config registration |

See [Runtime Compatibility](docs/RUNTIME-COMPAT-MATRIX.md) for exact paths and host
limitations.

## Development

```bash
# Node contracts, package smoke, host adapters, delegation, and Skills
npm run test:node

# File-first hook behavior and wire wrappers
npm run test:hooks

# Complete release gate
npm run verify:release

# Inspect the exact publish artifact
npm pack --dry-run --json
```

Every changed Skill is also validated with the Codex Skill Creator validator. A changed
Codex manifest is validated against the Plugin Creator schema. No release effect is
implied by a green verification run, and validator success establishes structural
conformance rather than semantic acceptance.

## Documentation

- [Philosophy](docs/PHILOSOPHY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Artifact Authority](docs/ARTIFACT-AUTHORITY.md)
- [Workflow Lifecycle](docs/WORKFLOW-LIFECYCLE.md)
- [Skill Authoring](docs/SKILL-AUTHORING.md)
- [Plugin Isolation](docs/PLUGIN-ISOLATION-CONTRACT.md)
- [Runtime Compatibility](docs/RUNTIME-COMPAT-MATRIX.md)
- [Adversarial Review Evaluation](docs/evals/adversarial-review-2026-08-14.md)
- [ZCode Automation Evaluation](docs/evals/zcode-automation-2026-08-14.md)

## License

[MIT](LICENSE)
