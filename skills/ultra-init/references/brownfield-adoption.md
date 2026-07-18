# Brownfield adoption

Use this procedure only after `task.init_project` selects `brownfield`, or when an
existing baseline remains `adopting` or `blocked`.

## Establish the snapshot boundary

Bind the repository root, current Git HEAD when available, included paths, excluded
generated or vendored paths, project manifests, and the user-visible or public seams.
Use the revision returned by `baseline.record`; non-Git projects receive a deterministic
workspace revision from the recorded evidence.

## Read current behavior

Inspect only the evidence needed to explain the maintained system:

- entry points and consumers;
- persisted state and its writers;
- external interfaces, events, permissions, and failure paths;
- tests and their live seams;
- deployment, migration, and recovery paths when present;
- maintained documents and their relationship to source.

Classify every statement as observed, verified, decided, or unknown. Source and runtime
evidence outrank stale prose. External memory and code-graph providers may supply
references, but their content remains outside Ultra state.

## Capture the baseline

Update `.ultra/specs/product.md` with confirmed behavior, actors, entry points, failures,
and acceptance. Update `.ultra/specs/architecture.md` with actual boundaries, authority,
runtime paths, dependencies, permissions, and recovery. Use `discovery.md` only for
evidence or decisions that affect scope.

Do not redesign the project, normalize it to a preferred architecture, manufacture
personas or alternatives, or convert every source file into documentation.

Run the repository's existing verification commands. Record each result as `pass`,
`known_red`, or `not_run`. A known-red item needs evidence and a rationale; a missing
command is not a passing result. Mark an unknown blocking when it can change accepted
behavior, authority, security, data integrity, or the next implementation plan.

Call `baseline.record` with full replacement arrays for:

- scope and repository revision;
- product and architecture specification paths;
- bounded source, documentation, runtime, test, deployment, or external references;
- verification results;
- blocking and non-blocking unknowns;
- external provider metadata references, when supplied.

The server computes specification digests. Do not send prompt, transcript, memory, or
code-graph payloads.

## Converge

Present the observed behavior, known-red verification, blocking unknowns, and material
decisions to the project owner. After explicit approval, call `baseline.converge` with
the recorded revision, approver, approval note, and `accept_known_red` only when the
owner accepted those failures.

Resolve returned blockers through evidence or an owner decision, record the replacement
snapshot, and retry. Adoption is complete only when `baseline.get` and `system.doctor`
report the baseline ready and current. Route the first new outcome to `ultra-change`, or
route planning of already accepted work to `ultra-plan`.
