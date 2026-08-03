# Architecture Specification

## Scope

- **Boundary**: npm package source, five adapters, fourteen Skills, five Hooks, bounded
  delegate, canonical project assets, tests, and maintained v0.26 documentation.
- **Revision**: base HEAD `3f99189bc68697262cd90444685ac2d4857139c4` plus the current uncommitted Change.
- **Quality goals**: semantic agency, five-host portability, deterministic mechanical
  enforcement, truthful evidence, reversible installation, and file/Git recovery.

## Architecture Context

```text
Owner ──explicit route──> owner workflow ──writes──> canonical files + source + Git
                              │
                              ├── model discipline (method, selected by host model)
                              ├── Hook (bounded context/observation/effect guard)
                              └── delegate CLI ──isolated worktree──> validated receipt

Installer ──host adapter──> native managed plugin/bundle + provenance + Doctor
```

The host model owns semantic interpretation, strategy, completeness, evidence judgment,
and final expression. Ultra mechanizes only paths, formats, permissions, exact effects,
digests, process state, installed ownership, evidence identity, and recovery.

## Authority and Recovery

| State | Authority | Writers | Readers | Recovery |
|---|---|---|---|---|
| Owner goal and constraints | `.ultra/north-star.md` | init, owner | workflows, session Hook | owner correction and Git |
| Product/architecture truth | `.ultra/specs/*.md` | research/change/delivery reconciliation | all execution workflows | evidence-backed reconciliation |
| Current outcome | active Change `intent.md` | change; plan posture | plan through delivery | preserve unknowns, repair contract |
| Execution graph and resume | `.ultra/tasks.json` + task contexts | plan/dev dual write | workflows and Hooks | compare both, repair, read back |
| Verification | task evidence and test report | dev/test | review/delivery/status | rerun against current Git state |
| History | archived Changes, decisions, Git | delivery/think/Git | owner and future workflows | supersede or revert; never erase accepted history |

Derived `.ultra/.runtime/`, `.ultra/progress/`, and `.ultra/reviews/` data is disposable.
No Ultra executable is required to reconstruct canonical state.

## Agent-to-Skill Convergence

The original package installed ten host-specific custom agents. v0.26 removes that
projection and preserves the useful method at the smallest portable surface:

| Retired agent | Current canonical home | Relationship to whole workflow |
|---|---|---|
| `review-code`, `review-design`, `review-errors`, `review-tests`, `review-spec`, `review-comments` | matching `skills/ultra-review/references/*.md` lens | A parent `ultra-review` fixes scope and Worker Packet, runs selected lenses, validates artifacts, synthesizes, and owns any repair. |
| `review-coordinator`, `code-reviewer` | `skills/ultra-review/SKILL.md`, `worker-packet.md`, `unified-schema.md`, and `review-modes.md` | Coordination is the parent Skill's semantic job; schema and digest checks stay deterministic. |
| `debugger` | `skills/ultra-dev/references/debugging.md` | `ultra-dev` loads it only for a reproduced failure, then uses TDD for the repair. |
| `tdd-runner` | `skills/ultra-tdd/references/test-execution.md` | `ultra-tdd` uses it for exact command evidence; the primary model still owns the code. |

These files are Skill assets, copied with their parent Skill to all five hosts. They are
not autonomous hidden agents. A host may use native bounded subagents for review, or run
the same lenses sequentially when no such surface exists.

## Adaptation and Routing

| Host | Managed surface | Owner/model policy | Known native boundary |
|---|---|---|---|
| Claude Code | managed Skill plugin with direct Hooks | frontmatter separates explicit and implicit routes | native permission mode controls delegate tools |
| Codex | plugin root, marketplace entry, Skills plus `agents/openai.yaml` metadata | `allow_implicit_invocation` expresses role | installed Hooks require separate user review/trust |
| OpenCode | native JS plugin plus managed Skill directories | descriptions guide selection | no native owner/model routing bit |
| Kimi Code | managed plugin registry under `KIMI_CODE_HOME` | native Skill metadata | plugin scope is user-only; unattended tool approval is coarse |
| Grok Build | native plugin source/registration | native frontmatter | plugin scope is user-only; sandbox behavior remains host-owned |

`adapters/_shared/runtime-assets.cjs` is the only packaged allowlist.
`plugin-core.cjs` copies shared assets and the canonical init template.
Adapters generate host metadata and wire payloads without editing shared workflow prose.

## Hook Boundary

| Hook | Input fact | Output/effect | Failure behavior |
|---|---|---|---|
| `session_context.py` | north star and active task | bounded startup context | silent outside Ultra; diagnostic failure |
| `mid_workflow_recall.py` | active acceptance and source operation | bounded reminder | silent outside Ultra; diagnostic failure |
| `compact_context.py` | files and Git | disposable snapshot | rebuild from authority |
| `post_edit_guard.py` | edited path, ledger, task trace | normalized mechanical progress observation | malformed prior observation is repaired; semantic gaps stay advisory |
| `block_dangerous_commands.py` | exact shell command and optional exact authorization digest | advise additive protected push; deny protected history rewrite/deletion, destructive data operation, funds, secret, or eval | advisory preserves the host authority path; denial names protected effect and reachable authorization path |

An additive protected push is advisory because Git publication is recoverable and
portable Hook wiring cannot consume every host's trusted approval receipt. History
rewrites and branch deletion remain guarded. A database migration is also advisory
because migration meaning and reversibility are not decidable from a command pattern.
Only the remaining named externally verifiable destructive effects fail closed.

## Delegation Boundary

`ubp delegate run` requires one immutable instruction file, a strict
`ultra-delegation-permission-v1` JSON file, a supported host, a clean registered Git
worktree, and a timeout. It records SHA-256 digests, atomically acquires `run.lock`, and
starts one background worker.

The worker validates inputs before and after execution, invokes exactly one host profile,
enforces timeout/cancellation, extracts one strict final result from native structured
output, computes the actual Git diff from base HEAD including untracked files, rejects
undeclared or escaped writes, and atomically writes the terminal receipt. The model does
not write its own receipt. Nonzero exit cannot become `finished`.

| Host | Fitted invocation | Deliberate limitation |
|---|---|---|
| Claude | structured print mode; plan/read tools or acceptEdits/file tools; no Bash or web | native workspace path policy remains Claude-owned |
| Codex | ephemeral exec; read-only or workspace-write; user config ignored, project rules preserved, network disabled | native sandbox permits the whole worktree rather than individual declared roots |
| OpenCode | auto mode under inline deny-by-default permissions; external directories, Bash, web and subagents denied | inline configuration support is version-bound |
| Kimi | prompt mode with launch-only read/write file-tool agent profile; no Bash, web, MCP or subagents | native file tools do not expose a portable per-root CLI policy |
| Grok | single turn; read-only or workspace OS sandbox; no memory/subagents/web | sandbox profile semantics remain Grok-owned |

Therefore v0.26 accepts an empty `external_effects` list, removes shell, web and subagent
tools where native surfaces permit, and combines native isolation with a verified Git
diff. It does not falsely claim a per-root OS sandbox on hosts that do not expose one.
The parent treats the isolated diff and receipt as untrusted input, inspects them, and
performs integration or any external effect itself.

## Verification and Release

```text
source contract tests
  -> Hook tests
  -> fourteen Skill Creator validations
  -> generated Codex Plugin Creator validation
  -> isolated five-host install / Doctor / uninstall
  -> npm verify:release
  -> npm pack --dry-run --json
```

Each arrow depends on the previous artifact state but does not authorize commit, push,
real HOME installation, provider calls, publication, or deployment.

## Quality Scenarios and Risks

| Trigger | Expected response | Verification | Residual limit |
|---|---|---|---|
| Interrupted init | rerun creates only missing assets and preserves existing bytes | package smoke and init tests | semantic placeholders still require owner/model |
| Corrupt Hook observation | normalize to known shape without losing new evidence | Hook regression | derived history may be discarded |
| Child lies about success or writes elsewhere | actual Git diff/schema/digest check fails terminally | delegate regression | host-owned non-filesystem effects cannot be rolled back by Git |
| Unsupported host scope or Hook trust | preflight/Doctor reports exact limitation | adapter tests | owner performs native trust action |
| Cross-host resume | canonical files plus Git reconstruct current task | artifact audit | no conversational memory is promised |

## Product Traceability

| Product requirement | Architecture section | Evidence |
|---|---|---|
| FR-01, FR-02, FR-03, FR-07 | Adaptation and Routing; Agent-to-Skill Convergence | adapter, package, and authoring tests |
| FR-04 | Authority and Recovery | artifact audit and boundary tests |
| FR-05 | Hook Boundary | Python Hook suite |
| FR-06 | Delegation Boundary | Node delegation suite |
| FR-08 | Verification and Release | validators, full gate, dry-run package |
