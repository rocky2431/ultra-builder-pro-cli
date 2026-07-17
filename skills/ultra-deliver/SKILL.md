---
name: ultra-deliver
description: "Converge and deliver a verified baseline or continuous change: reconcile specs, build/test, archive evidence, version, tag, and push."
runtime: all
mcp_tools_required:
  - change.list
  - change.get
  - change.context
  - change.converge
  - change.archive
cli_fallback: "direct user interaction"
---

# ultra-deliver — Phase 3.5

Release the current working tree and close its continuous-change packet when
one exists. `.ultra/test-report.json` is the test gate; `change.converge` is the
deterministic closure gate; `.ultra/delivery-report.json` is the release report.
Change lifecycle writes go through MCP only.

## Prerequisites (all validations are blocking)

### Validation 0 — Resolve continuous change

Call `change.list` for `active`, `blocked`, and `ready` work.

- Exactly one relevant change → bind delivery to that id.
- More than one → require an explicit id; never guess which change to archive.
- None → allow initial-baseline delivery, but record `change_id: null`.
- Active/blocked change → its linked tasks must all be completed and its
  `test-report.json.change_id` must match.
- Ready change → do not rerun convergence blindly; verify its existing
  verification artifact still matches current HEAD before archive.

### Validation 1 — `/ultra-test` passed

Read `.ultra/test-report.json`:
- File must exist → else: "Run `/ultra-test` first" → **EXIT**
- `passed === true` → else: show `blocking_issues`, **EXIT**
- `git_commit === current HEAD` → else: "Code changed since last test;
  re-run `/ultra-test`" → **EXIT**

### Validation 2 — No uncommitted changes

`git status --porcelain` must be empty. If dirty, ask through the current
Host's native user-interaction surface:
- A: "Auto-commit all changes" → `git add -A && git commit -m "chore: pre-delivery cleanup"`
- B: "Review changes first" → `git diff --stat` → re-ask
- C: "Block delivery" → **EXIT**

Commit failure (conflicts, hook rejection) → surface error and **EXIT**.

## Workflow

### Step 1 — Documentation Update (MANDATORY)

**1.1 CHANGELOG.md** (required):
1. `git log --oneline <last-tag>..HEAD`
2. Categorize by Conventional Commit type: `feat:` → Added, `fix:` → Fixed,
   `chore:` → Maintenance, `refactor:` → Changed, `docs:` → Documentation,
   `test:` → Tests, `perf:` → Performance.
3. Insert a new version section at the top of CHANGELOG.md.
4. Verify: Read CHANGELOG.md; confirm new version section exists.

**1.2 Technical debt report** (required):
1. Grep source for `TODO:` / `FIXME:` / `HACK:` / `XXX:`.
2. Generate / refresh `.ultra/docs/technical-debt.md`:
   ```markdown
   # Technical Debt (<date>, <commit>)
   | File | Line | Kind | Note |
   |------|------|------|------|
   | src/foo.ts | 42 | TODO | "remove after v1.3" |
   ```
3. Verify: file reflects current grep output.

**1.3 README.md** (conditional — public API changed):
1. Diff exported API signatures since last release (`git diff <last-tag>..HEAD -- 'src/**'`)
2. If signatures changed, update README usage examples
3. Verify examples match the new API

**1.4 Baseline specification reconciliation** (continuous change):

1. Read `intent.md`, `delta/`, and `docs_impact` from the bound change.
2. Merge accepted deltas into the declared baseline documents.
3. Record every updated project-relative path as `baseline_updates`.
4. If no baseline file changes, write a specific `no_baseline_change_reason`.
5. Verify no `[NEEDS CLARIFICATION]` or unresolved delta remains for delivered behavior.

**Checklist**:
- [ ] CHANGELOG.md updated
- [ ] technical-debt.md refreshed
- [ ] README.md reflects current API (if applicable)
- [ ] active delta reconciled into baseline, or explicit no-change rationale exists

Any unchecked → fix, then continue.

### Step 2 — Production Build

Detect build command (priority order):
1. `package.json → scripts.build` → `npm run build` (or `pnpm build`/`yarn build`
   based on lockfile)
2. `Makefile` → `make build` or `make release`
3. `Cargo.toml` → `cargo build --release`
4. `go.mod` → `go build ./...`
5. Nothing detected → ask the user for the command

Non-zero exit → block with stderr captured, then ask the user:
- A: "Fix error and retry"
- B: "Abort delivery"

### Step 3 — Version + convergence + release

**3.1 Determine version bump**:
- `git log <last-tag>..HEAD --oneline` → analyze commit types
- `feat:` → minor, `BREAKING CHANGE:` / `!:` → major, else patch
- Display `<old> → <new>`; allow an explicit user override.

**3.2 Update version in project files**:
- `package.json`, `Cargo.toml`, `pyproject.toml`, etc.
- Verify: read the file; confirm new version.

**3.2a Re-run release evidence after docs/version edits**:

- Run the exact relevant test, type-check, build, and package commands again.
- Capture command, exit code, and result. Any non-zero exit blocks delivery.
- Do not reuse a test report whose `change_id` or pre-change HEAD belongs to a
  different change as final evidence.

**3.3 Release commit**:
```bash
git add -A
git commit -m "chore(release): v<X.Y.Z>"
```
Verify with `git log -1 --oneline`.

**3.4 Recompile context and converge the change** (skip only for initial baseline):

For `active` or `blocked`, call `change.context` after the release commit so its
git head and task set are current. Then call `change.converge` with the exact
evidence required by kind:

- `quick`: diff, tests, spec;
- `standard` / `major`: diff, tests, spec, docs, review;
- `incident`: diagnosis, diff, tests. The diagnosis evidence must point to the
  completed `diagnosis.md`; convergence separately validates all five required
  debugging sections and cannot be satisfied by the evidence string alone.

Evidence must name concrete commands, artifacts, or file paths. If blockers are
returned, stop before tag/push and route to the owning workflow. Do not weaken
the change kind or mark failed evidence `not_applicable` merely to pass.

**3.5 Archive after baseline reconciliation**:

Call `change.archive` with the summary and either `baseline_updates` or the
explicit no-change reason. This moves the packet from `changes/active` to the
dated archive and records closure in state.db. Archive failure blocks release.

**3.6 Git tag**:
```bash
git tag v<X.Y.Z>
```
Verify with `git tag -l v<X.Y.Z>`.

**3.7 Push to remote**:
```bash
git push origin main     # release commit
git push origin v<X.Y.Z> # version tag
```
Verify with `git ls-remote --tags origin | grep v<X.Y.Z>`.

**Release checklist**:
- [ ] Version determined and displayed
- [ ] Version file updated and verified
- [ ] Release commit created and verified
- [ ] Change context current, convergence ready, baseline reconciled, archive complete
- [ ] Git tag created and verified
- [ ] Commit and tag pushed and verified on remote

Any failure → stop immediately; do NOT continue; surface last-step error.

### Step 4 — Persist `.ultra/delivery-report.json`

```jsonc
{
  "timestamp": "<ISO8601>",
  "version": "<X.Y.Z>",
  "git_tag": "v<X.Y.Z>",
  "git_commit": "<HEAD SHA>",
  "change_id": "<archived-change-id-or-null>",
  "change_archive_path": "<path-or-null>",
  "convergence_ready": true,
  "baseline_updates": ["<project-relative-path>"],
  "changelog_updated": true,
  "technical_debt_refreshed": true,
  "build_success": true,
  "pushed": true
}
```

### Step 5 — Report

Print a tight release summary: change id/archive, baseline files reconciled,
tag, commit, exact verification commands, outstanding technical-debt count,
and next suggested action. After release, daily work starts with `/ultra-change`.

## Deliverables Checklist (final)

- [ ] `/ultra-test` passed (verified via test-report.json)
- [ ] Uncommitted changes handled
- [ ] CHANGELOG + technical-debt refreshed (README if API changed)
- [ ] Production build exit 0
- [ ] Continuous change converged and archived (when present)
- [ ] Version bumped, tagged, pushed
- [ ] delivery-report.json written

## MCP → CLI fallback matrix

| Purpose | MCP tool | CLI fallback |
|---------|----------|--------------|
| Resolve dirty-tree action | none | current Host's native user-interaction surface |
| Override version bump | none | current Host's native user-interaction surface |
| Resolve/bind change | `change.list` / `change.get` | none; fail closed |
| Refresh context | `change.context` | none; fail closed |
| Deterministic closure | `change.converge` / `change.archive` | none; fail closed |

## What this skill DOES NOT do

- Does NOT replace `/ultra-test`; it re-runs the exact release evidence after
  documentation and version changes so the shipped commit is verified
- Does NOT publish to npm / crates.io / PyPI (Phase 9 handles distribution)
- Does NOT directly mutate state.db or external provider state

## Integration

| | |
|---|---|
| **Input** | bound change (if any), test/review artifacts, current repo |
| **Output** | archived change, reconciled baseline, delivery report, git tag + remote push |
| **Next** | deploy/announce; next daily change begins with `/ultra-change` |
