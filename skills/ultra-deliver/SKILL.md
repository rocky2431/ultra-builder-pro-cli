---
name: ultra-deliver
description: "Release preparation — verify /ultra-test passed, update docs, build, version-bump, tag, push. Writes .ultra/delivery-report.json."
runtime: all
mcp_tools_required:
  - ask.question
cli_fallback: "ask"
---

# ultra-deliver — Phase 3.5

Release the current working tree. Driven entirely by file-level artifacts
(`.ultra/test-report.json` as the gate; `.ultra/delivery-report.json` as the
output). No state.db writes.

## Prerequisites (Pre-Delivery Validations — both BLOCKING)

### Validation 1 — `/ultra-test` passed

Read `.ultra/test-report.json`:
- File must exist → else: "Run `/ultra-test` first" → **EXIT**
- `passed === true` → else: show `blocking_issues`, **EXIT**
- `git_commit === current HEAD` → else: "Code changed since last test;
  re-run `/ultra-test`" → **EXIT**

### Validation 2 — No uncommitted changes

`git status --porcelain` must be empty. If dirty → `ask.question`:
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

**Checklist**:
- [ ] CHANGELOG.md updated
- [ ] technical-debt.md refreshed
- [ ] README.md reflects current API (if applicable)

Any unchecked → fix, then continue.

### Step 2 — Production Build

Detect build command (priority order):
1. `package.json → scripts.build` → `npm run build` (or `pnpm build`/`yarn build`
   based on lockfile)
2. `Makefile` → `make build` or `make release`
3. `Cargo.toml` → `cargo build --release`
4. `go.mod` → `go build ./...`
5. Nothing detected → `ask.question` for the command

Non-zero exit → block with stderr captured, `ask.question`:
- A: "Fix error and retry"
- B: "Abort delivery"

### Step 3 — Version + Release (MANDATORY — all 5 sub-steps)

**3.1 Determine version bump**:
- `git log <last-tag>..HEAD --oneline` → analyze commit types
- `feat:` → minor, `BREAKING CHANGE:` / `!:` → major, else patch
- Display `<old> → <new>`; allow `ask.question` override.

**3.2 Update version in project files**:
- `package.json`, `Cargo.toml`, `pyproject.toml`, etc.
- Verify: read the file; confirm new version.

**3.3 Release commit**:
```bash
git add -A
git commit -m "chore(release): v<X.Y.Z>"
```
Verify with `git log -1 --oneline`.

**3.4 Git tag**:
```bash
git tag v<X.Y.Z>
```
Verify with `git tag -l v<X.Y.Z>`.

**3.5 Push to remote**:
```bash
git push origin main     # release commit
git push origin v<X.Y.Z> # version tag
```
Verify with `git ls-remote --tags origin | grep v<X.Y.Z>`.

**Release checklist**:
- [ ] Version determined and displayed
- [ ] Version file updated and verified
- [ ] Release commit created and verified
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
  "changelog_updated": true,
  "technical_debt_refreshed": true,
  "build_success": true,
  "pushed": true
}
```

### Step 5 — Report

Print a tight release summary: tag, commit, files touched in CHANGELOG,
outstanding technical-debt count, next suggested action (deploy / announce).

## Deliverables Checklist (final)

- [ ] `/ultra-test` passed (verified via test-report.json)
- [ ] Uncommitted changes handled
- [ ] CHANGELOG + technical-debt refreshed (README if API changed)
- [ ] Production build exit 0
- [ ] Version bumped, tagged, pushed
- [ ] delivery-report.json written

## MCP → CLI fallback matrix

| Purpose | MCP tool | CLI fallback |
|---------|----------|--------------|
| Resolve dirty-tree action | `ask.question` | Claude: `AskUserQuestion`; CLI: `ultra-tools ask …` |
| Override version bump | `ask.question` | same |

## What this skill DOES NOT do

- Does NOT run tests (that is `/ultra-test`'s job)
- Does NOT publish to npm / crates.io / PyPI (Phase 9 handles distribution)
- Does NOT mutate state.db

## Integration

| | |
|---|---|
| **Input** | `.ultra/test-report.json` (gate), current repo |
| **Output** | `.ultra/delivery-report.json`, git tag + remote push |
| **Next** | Deploy target (Railway / Vercel / etc.) or release announcement |
