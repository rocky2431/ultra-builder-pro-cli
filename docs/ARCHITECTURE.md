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

### Authority plane

Canonical semantic authority consists of:

- `.ultra/north-star.md` for owner wording and hard constraints;
- `.ultra/specs/*.md` for product, architecture, discovery, and research distillate;
- `.ultra/changes/{active,archive}/<id>/intent.md` for bounded outcomes;
- `.ultra/tasks.json` plus each task's `context_file`;
- `.ultra/decisions/*.md`, `.ultra/evidence/`, `.ultra/test-report.json`, and research;
- repository-root `CONTEXT.md` for ubiquitous language;
- Git for revision identity, history, moves, diff, and rollback.

Each semantic fact has one canonical representation. A summary can point to authority,
but cannot become a second authority merely because it is convenient to read.

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

1. `.ultra/tasks.json`;
2. the unfinished task's `context_file` and closing `## Resume Note`;
3. `CONTEXT.md` and relevant decisions;
4. the active Change, specifications, evidence, and current Git state.

That same sequence works after compaction, a fresh process, disabled hooks, or a host
change. Compact snapshots can accelerate recovery but never outrank the source files.

## Integration defence

Three independent Skills protect the vertical path:

1. `ultra-plan` confirms seams and rejects horizontal feature tasks.
2. `ultra-dev` records six separate evidence dimensions, including real persistence,
   default-on behavior, vertical execution, and spec trace.
3. `ultra-test` searches exports for real consumers and exercises the primary flow.

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
