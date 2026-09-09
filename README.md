# Ultra Builder Pro

**English** | [简体中文](README.zh-CN.md)

Ultra Builder Pro is a file-first engineering workflow for Claude Code, Codex,
OpenCode, Kimi Code, Grok Build, and ZCode. It implements the provider-neutral
**Ultra Core Protocol**: owner–agent cognitive alignment, per-fact canonical
authority, explicit session-local or durable work-package grants, exclusive
verified handover between Agents, typed evidence with recovery, and review that
terminates within an owner-visible budget. It keeps product
intent, specifications, task contracts, evidence, decisions, and recovery notes
in the repository, so a different session or host can continue by reading files
and Git.

The host model remains the engineer. Ultra supplies reusable methods and checkable
artifacts; it does not replace reasoning with a workflow engine. Agent topology —
one Agent or several, which providers — is the owner's choice at every stage; the
default is the current Agent continuing alone, and handing the work package's
writing authority to a different Agent requires an explicit verified transfer
(OFFER → ACK → RESULT over the repository files and Git).

## Ultra Builder Pro 5.0

Version `5.0.2` is the current implementation of Ultra as a cognitive-alignment harness
for real software engineering. It preserves the accepted 3.0 file-first and model-agency
constitution, then makes workflow position, recovery, and cross-Agent execution directly
observable. It is not a decentralized multi-agent platform and it does not prescribe one
Agent topology. Instead, it keeps five promises:

- establish the owner-accepted North Star before Research becomes a plan or code;
- let the owner choose one Agent or several, and the provider, at every stage;
- carry canonical intent, decisions, tasks, evidence, and recovery through files
  under `.ultra/` plus Git so another session or host can resume from the same facts;
- automate mechanically verifiable authority, permissions, external effects,
  evidence, physical limits, and recovery while leaving meaning and strategy to the
  model and owner; and
- bound Review and repair so delivery converges instead of turning every observation
  into another automatic implementation loop.

5.0 expresses those promises through one Route Contract, explicit Init/Research/Change/
Plan responsibilities, file-only fresh-session recovery, an installed Skill-local
delegation runtime, and a replaceable `AgentExecutionDriver`. Stable ACP v1 is preferred
only after the exact Host has passed a recorded conformance drill; otherwise the same
result contract uses a reported CLI fallback. The portable protocol and native
installation cover Claude Code, Codex, OpenCode, Kimi Code, Grok Build, and ZCode. All
six profiles expose stable ACP v1 candidates and have their own current real-provider
receipt. Each selects ACP only while its recorded executable, protocol/receipt binding,
and any candidate-identity probes declared by that profile still match; otherwise it
returns a typed CLI fallback. ZCode uses an independently
installed, source-pinned bridge and remains `experimental`.

5.0 deliberately does not add a daemon, workflow service, semantic state machine, A2A
network, Team Pack, remote marketplace, or shared authority store. Package publication
and real user installation remain independently verifiable effects; a source version
alone never proves either one occurred.

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
| `ultra-dev` | Implement one task through red/green development and the six evidence dimensions `tests_written`, `tests_passed`, `persistence_real`, `feature_flags_audit`, `vertical_slice`, and `spec_trace` |
| `ultra-test` | Audit whole-system wiring, E2E behavior, performance, and security |
| `ultra-deliver` | Reconcile, review, document, and archive a completed Change |
| `ultra-delegate` | Delegate bounded task work, Research evidence, or aggregate Review to another installed Agent runtime through ACP-first stable v1 with a typed CLI fallback |

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
the covered change-scoped Research, same-Change reconciliation, Plan, Dev, Test, and
reconcile-only Deliver routes. Init, Change intake/evidence/acceptance/abandonment or
primary transfer, Delegate, Deliver finalization, archive, and every external effect
remain owner-selected; Status also remains owner-selected, read-only, and grants no continuation.
Every public transition first displays the derived `UBP Route Card`; Host invocation
metadata is only coarse discovery, and the loaded Skill revalidates its exact mode and
grant without creating route state.
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

Version 5.0.2 does not install a custom `agents/` projection. The old review workers became the
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
npx ultra-builder-pro-cli@5.0.2 --claude --local
npx ultra-builder-pro-cli@5.0.2 --codex --local

# Global installation
npx ultra-builder-pro-cli@5.0.2 --opencode --global
npx ultra-builder-pro-cli@5.0.2 --kimi --global
npx ultra-builder-pro-cli@5.0.2 --grok --global
npx ultra-builder-pro-cli@5.0.2 --zcode --global

# All supported hosts
npx ultra-builder-pro-cli@5.0.2 --all --global
```

ZCode ACP delegation additionally requires the independently built bridge and an
installed ZCode Desktop runtime. Ultra ships the small source patch needed by ZCode
CLI 0.16.5, but installs neither dependency and never records provider credentials:

```bash
git clone https://github.com/jpalmae/zcode-acp
git -C zcode-acp checkout 42fe149d4b501469343c01f23ba3801832306d53
git -C zcode-acp apply \
  /path/to/installed/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch
cargo test --locked --manifest-path zcode-acp/Cargo.toml
cargo install --locked --path zcode-acp
```

The base commit, patch SHA-256
`174dfd0feafe84320556a84b5ae08b10e44c5515fea4992fd1d58af54cee4e3d`, locked tests,
fake E2E, release build, and real ZCode 0.16.5 session were verified for 5.0. Keep the
binary on `PATH`; its `--version` must report
`zcode-acp 0.1.0+ultra.zcode.0.16.5`. Use the platform's installed ZCode CLI path
outside macOS.

Provider identity is separate from the Host: ZCode Desktop is the runtime, while the
model account may be domestic 智谱 BigModel, international Z.AI, or another configured
provider. Current model connections belong in the ZCode UI and
`~/.zcode/v2/config.json`; `~/.zcode/cli/config.json` owns CLI plugins, Hooks, MCP, and
other headless-runtime settings, not the canonical model-account configuration.
BigModel account authorization needs no manually entered URL. A BigModel Coding Plan
API key uses the OpenAI-compatible coding endpoint
`https://open.bigmodel.cn/api/coding/paas/v4`; the Anthropic-compatible
`https://open.bigmodel.cn/api/anthropic` endpoint applies to the separate resource-package
or prepaid-balance path. Follow the current
[ZCode model configuration](https://zcode.z.ai/en/docs/configuration),
[ZCode provider Q&A](https://zcode.z.ai/en/docs/qa), and
[BigModel Claude compatibility guide](https://docs.bigmodel.cn/cn/guide/develop/claude/introduction).
The dated ZCode 0.16.5 conformance drill used
`builtin:bigmodel-coding-plan/GLM-5.2` through its pinned headless configuration; that
receipt is historical compatibility evidence, not universal setup guidance.

Because the ZCode transport remains `experimental`, every actual delegation launch
must acknowledge that boundary explicitly:

```bash
node <loaded-ultra-delegate-skill-dir>/scripts/delegate.cjs run --to zcode \
  --ack-experimental --instruction <file> --permission <file> --worktree <dir>
```

These pinned `npx` commands resolve the immutable registry version after publication.
Source-tree verification uses `node bin/install.js --config-dir <isolated-path>` when
it must not mutate the real user installation; the separate 5.0 release drill also
verified an ownership-safe install, Doctor, ZCode uninstall, and reinstall in all six
real Host homes.

### Start Ultra on a goal

```bash
# Say what you want; the host model picks the route
ubp run "fix the CSV export mojibake in the report writer"
ubp run "build me something to tidy the notes I take in meetings"
ubp run --host pi "build me something to organize my receipts"

# See the exact command and first prompt without starting anything
ubp run --dry-run "..."
```

`ubp run` resolves the managed plugin the host would load, sends that plugin's own entry
instructions plus your goal verbatim, and hands the session to the host. You never pick
an Ultra mode, phase, or Skill name. Stop and exit stay native. Use
`ubp run --continue "continue the requested change"` or
`ubp run --resume <session-id> "finish the interrupted change"` to resume with the
plugin loaded again. Keep the same working directory and plugin selection.

Useful flags: `--config-dir <dir>` (Claude) or `--plugin-dir <dir>` to bind a specific managed
plugin for the session, `--cwd <dir>` to run somewhere else,
`--host-arg <arg>` to pass a native host flag
through, and `-` to read the goal from stdin. `ubp run --help` lists them.

Use the interactive terminal form above when the purpose needs an answer. Claude
`--print` mode has no interactive question tool; a batch run is not evidence that
intake worked. Piped input also does not provide a terminal for later replies.
The host may ask once to read a reference under the selected plugin directory;
that is native file access, separate from deciding the product's purpose.

Interactive launch supports Claude Code and Pi. `--host pi` loads the portable Skills
from this package for the session, so it needs an installed `pi` CLI but no separate
Ultra installation in Pi. Use `ubp run --host pi --continue "..."` or
`ubp run --host pi --resume <session-id-or-path> "..."` to reload the same Skills
and continue through Pi's native session storage. `--plugin-dir` can select an existing
generated portable plugin instead. Pi does not load Ultra's optional Claude hooks.
The six-host installation and delegated-execution qualification surfaces are unchanged.

Use the host's native Skill picker or invocation syntax to select an owner workflow.
Codex exposes namespaced entries such as `$ultra-builder-pro:ultra-init`. Discovery in
ordinary host chat is best-effort; use the unified entry to explicitly enter Ultra
without naming an internal route. Each workflow verifies its own entry, mode, grant,
and effects before doing anything. The
installed frontmatter and metadata keep the two routes you must name yourself — read-only
`ultra-status` diagnosis and `ultra-delegate` worker topology — owner-invoked, and keep
model disciplines internal to a workflow.

### Diagnose, update, and uninstall

Installation is managed, atomic, and provenance-checked.

```bash
# Re-running install updates the managed artifact
npx ultra-builder-pro-cli@5.0.2 --codex --global

# Read-only diagnosis
npx ultra-builder-pro-cli@5.0.2 --all --global --doctor --json

# Remove only managed Ultra assets
npx ultra-builder-pro-cli@5.0.2 --all --global --uninstall
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

For day-to-day work on an existing project, a new request starts with `ultra-change`,
not an open-ended Research run. Enter `ultra-research` directly only to establish the
first baseline, or to answer the bounded evidence question recorded by the same active
Change. Every public transition shows a derived Route Card with its current Mode,
Position, observable Exit condition, material checkpoint, and Next route.

"Select" below means either naming the route or making the request it exists for: your
current message is the entry for the work it names, and an ordinary bounded change that
makes no specification sentence false stays ordinary repository work with no `.ultra/`
artifacts at all.

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
   Its earliest observable slice must cross a real consumer and real data path and name
   the owner-visible observation. The model owns ordinary technical seams; the owner
   decides only a seam that changes the public contract or another material trade-off.
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
recorded grant itself. In both modes the model may select the covered change-scoped
Research, same-Change reconciliation, Plan, Dev, Test, and reconcile-only Deliver
routes until the next semantic stop or declared budget, and neither mode grants
finalization or archive: writing `delivery.md`, version
or package posture, and archiving always require a current explicit owner invocation,
as do commit, push, publication, deployment, installation, and every other external
effect.

At any point, `ultra-status` can reconstruct the current position. A fresh session
starts from repository root and `HEAD`, resolves exactly one active Change, then reads
`.ultra/tasks.json`, the matching `context_file` and its `## Resume Note`, `CONTEXT.md`,
relevant decisions, specifications, evidence, and the current Git diff. It never reruns
completed Research merely because conversation memory is gone. If active authority is
ambiguous or unreadable, Status switches to read-only recovery, names the unsafe fact,
and gives the cheapest repair, retry, cancel, abandon, or fresh-session path without
choosing an intent or writing semantic files. Archived and abandoned unfinished rows
remain history, not the frontier.

## Three independent integration defences

The workflow does not treat “tests pass” as an end-to-end verdict.

- `ultra-plan` rejects horizontal feature slicing and confirms observable seams.
- `ultra-dev` records the six separate observations `tests_written`, `tests_passed`,
  `persistence_real`, `feature_flags_audit`, `vertical_slice`, and `spec_trace`.
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

Delegation writes an immutable instruction and permission envelope, then selects one
Host-local `AgentExecutionDriver` and starts it in the background. ACP is selected only
for an executable stdio endpoint that negotiates stable v1 and has a passed per-Host
conformance record with evidence; otherwise the same result contract uses `CliDriver`
and reports the exact fallback reason. All six current Host rows have their own passing
real-provider receipt; a missing executable, a failed declared candidate-identity probe
(when present), or a stale/missing receipt still returns the typed CLI fallback. An ACP authentication error
detected before `session/prompt` runs the bounded CLI path once and records
`acp_auth_required`; no other ACP failure is retried, so Ultra cannot duplicate a
provider task. Empty
writable roots select native read-only mode;
declared roots select bounded write mode. The model returns one schema-constrained final
response; the launcher extracts it from native structured output, validates the actual
Git diff, and atomically publishes a terminal `finished`, `blocked`, or `failed` result
beside the instruction. The digest-bound packet is embedded in the worker prompt, so a
strict host need not read instruction files outside its isolated worktree.

```bash
node <loaded-ultra-delegate-skill-dir>/scripts/delegate.cjs run --to codex \
  --instruction .ultra/.runtime/delegations/D-01/instruction.md \
  --permission .ultra/.runtime/delegations/D-01/permission.json \
  --worktree .ultra/.runtime/worktrees/D-01
```

The loaded Skill path is canonical and works after a clean `npx` plugin install without
a global `ubp` or another `npx` lookup for Ultra; the pinned Claude/Codex ACP adapters
may themselves run through `npx`. `ubp delegate` remains a one-release compatibility
wrapper. Use the installed Skill's `scripts/delegate_wait.py` to wait for `result.json`
without loading intermediate worker output into the parent context. Delegation grants no new
authority; writable roots remain inside the worktree, and its permission file must
declare zero external effects without widening the host sandbox.
The immutable instruction names task execution/continuation, scoped Research evidence,
or aggregate Change review/verification. The latter two may be read-only and do not
require a task row, keeping pre-Plan Research and post-task cross-family review
reachable without inventing ledger work.
ZCode resolves only the installed Desktop runtime through the independently installed
`zcode-acp` bridge and remains `experimental`. Its capability, read-only,
permission, cancellation/no-orphan, cwd/diff, result-parity, and redaction drills pass;
promotion still requires an official stability contract for the App-internal runtime.
Doctor reports runner health, ACP capability, declared candidate identity when present,
selected driver, fallback reason, and ZCode maturity independently.

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

- [5.0 design and acceptance contract](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md) —
  Route, Skill ownership, continuation, ACP/CLI execution, migration, and journey
  boundaries implemented by 5.0.2.
- [5.0 journey results](docs/evals/ultra-5-0-journey-results.md) — observable source,
  isolated-runtime, real-provider, real-HOME, and cross-platform outcomes plus the
  deliberately excluded service-deployment boundary.
- [Current authority](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/.ultra/north-star.md) — this repository's accepted
  North Star, revision `north-star-v2-r3`, is the canonical current authority;
  `.ultra/tasks.json` and the stable Change under `.ultra/changes/active/` or
  `.ultra/changes/archive/` record the current or delivered work frontier.
- Frozen design history (immutable accepted records, not live status):
  [3.0 North Star R3](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md) —
  the hash-bound accepted r3 design — and
  [3.0 design](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md), superseded by r3.
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
