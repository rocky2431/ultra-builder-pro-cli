# Brownfield adoption

Execute this procedure for a detected brownfield repository, a migrated compatibility
baseline, or an existing adoption in `adopting` or `blocked` state.

## Bind the repository boundary

Record the repository root, selected scope, workspace roots, branch, HEAD, dirty files,
generated and vendored exclusions, manifests, verification commands, and public seams.
Use `.` for a whole-repository adoption. Use selected workspace roots only when the
user's requested ownership is narrower than the monorepo.

The authoritative worktree snapshot contains only selected-scope paths. Report dirty
files outside that scope separately as repository context, but do not include them in
the baseline digest. Require `accept_dirty_worktree: true` only after the owner confirms
the exact in-scope `worktree_files` returned by the server.

## Build the evidence model

Inspect the maintained system through its live boundaries:

- product behavior, actors, entry points, and public acceptance;
- runtime modules, consumers, data flow, persistence, and authority;
- APIs, events, integrations, permissions, security, and failure paths;
- build, test, lint, typecheck, deployment, migration, observability, and recovery;
- maintained documents and every detected source-to-document conflict.

Classify each material statement as `Observed`, `Verified`, `Decided`, or `Unknown`.
Record document/source conflicts as drift. Keep provider payloads outside Ultra and
record only bounded metadata references.

## Write baseline artifacts

Update `.ultra/specs/product.md` with current delivered behavior and acceptance. Update
`.ultra/specs/architecture.md` with real boundaries, owners, writers, consumers,
consistency rules, permissions, failures, and recovery. Use `discovery.md` for scope
evidence, decisions, and unresolved questions.

Capture current facts without redesigning the application or manufacturing product
narratives that are absent from evidence.

## Run characterization verification

Run the repository's existing verification commands. Record each result as `pass`,
`known_red`, or `not_run`. A known-red item needs evidence and a rationale; a missing
command is not a passing result. Record a characterization gap for a critical public
seam that has no stable verification signal; create its ordinary task only after the
baseline is ready.

## Maintain the gap ledger

Record every adoption gap with a stable id, evidence references, owner, blocking flag,
and one category:

- `baseline_blocker`: prevents trustworthy adoption;
- `documentation_drift`: maintained prose conflicts with observed behavior;
- `known_defect`: reproducible incorrect behavior;
- `technical_debt`: accepted maintainability or quality cost;
- `unknown`: evidence is insufficient;
- `future_change`: desired behavior outside the current baseline.

Use `open` for unresolved gaps, `accepted` for owner-accepted non-blocking debt,
`resolved` when evidence closes the gap, and `deferred` for explicitly postponed
non-blocking work. Every open `baseline_blocker` remains blocking. Do not convert the
ledger into hundreds of application tasks.

## Record authority

Call `baseline.record` with full replacement arrays for:

- scope and repository revision;
- repository classification;
- product and architecture specification paths;
- bounded source, documentation, runtime, test, deployment, or external references;
- verification results;
- blocking and non-blocking unknowns;
- the complete gap ledger;
- external provider metadata references, when supplied.

Use the server-returned revision, branch, worktree digest, and specification digests.

## Obtain approval and converge

Present scope, observed behavior, drift, known-red verification, unknowns, gaps, dirty
worktree state, and material decisions to the owner. Call `baseline.converge` only after
explicit approval. Set `accept_known_red` and `accept_dirty_worktree` only for the exact
items the owner accepted.

Resolve returned blockers through evidence or an owner decision, record the replacement
snapshot, and retry. Adoption is complete only when `baseline.get` is `ready` and
current, the gap ledger has no open blocker, and project doctor has no authority
failure. Route all selected work through `ultra-change`, including work described by a
legacy plan. Import its accepted intent into a current Change Contract before planning.
