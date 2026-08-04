# Ultra Builder Pro architecture

Ultra Builder Pro v0.26 is a file-first workflow asset package for five coding-agent
hosts. Its architecture is deliberately asymmetric: the host model owns meaning and
strategy; Ultra mechanizes only portable prompts, observable files, bounded effects,
and recovery.

## System boundary

```text
Owner request
    │ explicit selection
    ▼
User-invoked Skill ──────── recommends next public route and stops
    │
    ├── model-invoked disciplines (reasoning methods)
    ├── source / tests / runtime / primary documentation
    └── canonical project files + Git
             │
             ├── optional five hooks (derived context and effect guard)
             └── optional delegate CLI (bounded external host process)
```

Ultra has no semantic runtime supervisor. Reading the files is the recovery protocol;
editing the files is the state transition; Git is the journal and rollback mechanism.

## Four planes

### Method plane

Fourteen `skills/*/SKILL.md` files carry the workflow:

- eight owner-invoked workflows;
- five model-invoked reusable disciplines;
- one read-only router.

The exact allowlists live in `adapters/_shared/runtime-assets.cjs`. Public workflows
never invoke another public workflow. They may use model-invoked disciplines and then
recommend the next owner route.

Research's seventeen references are workflow-owned semantic lenses. Its optional
`wayfinding.md` maps a multi-lens question without becoming a new Skill or authority.
The reusable mechanics remain separate: Grilling owns the interaction loop, Think owns
one consequential decision, and Domain Modeling owns vocabulary promotion.

### Authority plane

Canonical semantic authority consists of:

- `.ultra/project-brief.md` for raw owner intake and the initial outline;
- `.ultra/north-star.md` for the accepted direction, outcome or metric decision, hard
  constraints, and exclusions established by Research;
- `.ultra/specs/*.md` for product, architecture, discovery, and research distillate;
- `.ultra/changes/{active,archive,abandoned}/<id>/intent.md` for bounded outcomes with
  one stable id across directory moves;
- append-only `.ultra/tasks.json` rows carrying `change_id`, plus each task's `context_file`;
- `.ultra/decisions/*.md`, `.ultra/evidence/`, `.ultra/test-report.json`, and research;
- repository-root `CONTEXT.md` for ubiquitous language;
- Git for revision identity, history, moves, diff, and rollback.

Each semantic fact has one canonical representation. A summary can point to authority,
but cannot become a second authority merely because it is convenient to read.

One primary host model writes this authority in a worktree. Native subagents are
read-only sensors; delegated CLIs write isolated non-`.ultra` roots and return receipts.
Sequential Changes share the ledger by stable id, while current readers filter by the
one unique active Change. This keeps concurrency explicit in Git instead of adding a
semantic lock service or workflow engine.

### Adaptation plane

`adapters/*.js` translates the shared package into native host surfaces:

- skill frontmatter and Codex `agents/openai.yaml` policy;
- plugin manifests and host registries;
- hook command paths and wire normalization;
- atomic managed installation, provenance, doctor, and uninstall behavior.

`adapters/_shared/plugin-core.cjs` owns the common copy and managed-publication
mechanics. `host-profile.cjs` owns the five non-interactive delegation argv contracts.
Adapters never rewrite workflow meaning.

### Why the old Agents are Skill assets now

The retired custom-agent files did not own product authority. They contained reusable
review lenses, debugging, test execution, and review coordination. v0.26 keeps those
methods on the common surface all five hosts actually share:

- six review workers map to `ultra-review/references/{code,design,errors,tests,spec,comments}.md`;
- review coordination and the former general code reviewer map to the parent
  `ultra-review` workflow, immutable Worker Packet, and shared schemas;
- debugging maps to `ultra-dev/references/debugging.md`;
- test execution maps to `ultra-tdd/references/test-execution.md`.

The references are copied as assets of their parent Skill. Native bounded subagents are
an execution option, not an installed Ultra authority. When a host has no equivalent,
the parent model runs the same references sequentially.

### Observation plane

Five hooks read canonical files and emit bounded context or observations. Their output
under `.ultra/.runtime/`, `.ultra/progress/`, or `.ultra/reviews/` is derived and
disposable. The dangerous-command hook is the only hard effect guard; it classifies a
small named destructive set and provides an exact-command authorization repair.
Additive protected-branch publication remains advisory when portable host wiring cannot
project a trusted owner-approval receipt; history rewrites and branch deletion remain
guarded.

## Completion and recovery

An operation is complete only when its accepted user outcome works through the real
public seam. Route/schema/UI shells, local unit green, or an edited task status are not
end-to-end evidence by themselves.

Every user Skill starts by reading:

1. zero or one active `change_id`, diagnosing more than one;
2. `.ultra/tasks.json` tasks whose `change_id` matches it;
3. the matching frontier task's `context_file` and closing `## Resume Note`;
4. `CONTEXT.md` and relevant decisions;
5. the active Change, specifications, evidence, and current Git state.

That same sequence works after compaction, a fresh process, disabled hooks, or a host
change. Compact snapshots can accelerate recovery but never outrank the source files.

## Integration defence

Three independent Skills protect the vertical path:

1. `ultra-plan` records model-selected technical seams, asks the owner only for a
   public-contract or material trade-off, and rejects horizontal feature tasks.
2. `ultra-dev` records six separate evidence dimensions, including real persistence,
   default-on behavior, vertical execution, and spec trace.
3. `ultra-test` searches exports for real consumers, exercises the primary flow, and
   binds the result to Change id, task ids, intent, HEAD, and product-worktree digest.

These are independent sensors. None rewrites a finding into product truth.

## Delegation

`ubp delegate run` validates all paths inside the selected project, reads a bounded
instruction and permission JSON, builds argv from one host profile, and starts a
background worker. Declared writable roots must already exist inside the delegated
worktree; no readable-root or external-effect grant can widen the host's native
sandbox. Empty writable roots select native read-only mode. The model returns a
schema-constrained final response; the Node worker validates `finished`, `blocked`, or
`failed` and atomically publishes `result.json` beside the instruction. The model never
writes its own receipt; stdout, stderr, native final output, and the launch receipt
remain diagnostic files.

The instruction binds the active `change_id` and one of three semantic scopes: task
execution/continuation, scoped Research evidence, or aggregate Change
review/verification. Only task execution requires a task row. The read-only Research
and aggregate scopes preserve the same process boundary without inventing work merely
to make delegation reachable.

Delegation does not grant authority or copy semantic state into another store. The
worker reads and writes the same repository files in the specified worktree.

## Deliberate absences

The architecture does not include:

- an Ultra database or SQLite dependency;
- an MCP server or tool protocol;
- a workflow state machine or semantic validator;
- a background orchestration daemon;
- command or custom-agent prompt projections;
- general memory, code graph, browser, deployment, or framework packages.

Adding one of these requires a reproduced failure that the file-first path cannot
repair, a named authority boundary, and a primary-path regression test.
