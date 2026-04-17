---
name: ultra-dev
description: "Agile development execution with TDD workflow. Writes state via task.update; review via review.run (Phase 3 wired) / subagent CLI fallback; pre-review checkpoint via session.checkpoint (Phase 5 placeholder)."
runtime: all
mcp_tools_required:
  - task.update
  - task.get
  - task.list
  - review.run
cli_fallback: "task update"
---

# ultra-dev — Phase 3.4

Drive one task from `pending → completed` using a strict TDD loop, gated by
`/ultra-review`. **state.db is the authority**: status transitions go through
MCP `task.update`; the projector regenerates `tasks.json` and context-md
frontmatter. The skill only writes context-md **bodies** (Change Log,
Completion, Dual-Write notes).

## Design decisions vs pre-Phase-3

- **Single-write status**: Step 1.5 / Step 5 stop touching `contexts/task-{id}.md`
  frontmatter or the "`> **Status**: xxx`" line. Only MCP `task.update` fires;
  projector rewrites frontmatter; humans read body for history.
- **MCP review path**: `/ultra-review all` is fronted by MCP `review.run` when
  available (Phase 3 runs a worker pool server-side). When MCP is down the
  skill falls back to the runtime's native subagent/Task path (Claude:
  `Task` tool; others: `ultra-tools subagent run ... --backend auto`).
- **No `/compact` dependency**: Step 4.4 writes a checkpoint via MCP
  `session.checkpoint` (Phase 5 placeholder — until wired, skill falls back to
  `.ultra/workflow-state.json` + the runtime's optional compact). Removing the
  hard `/compact` dependency is a v0.1 gate.

## Prerequisites

- `.ultra/tasks/tasks.json` exists (from `/ultra-plan`)
- At least one task with `status=pending`
- `state.db` initialized (first `task.*` call will init if missing)

## Arguments

- `$1`: task id (optional; default = first `pending` task in topological order)

## Workflow

### Step 0 — Workflow Resume Check

Read `.ultra/workflow-state.json` if present.
- If `branch` matches current `git branch --show-current` → resume from the
  step after `status`
- If `review_session` is set → skip re-running review
- Otherwise → proceed to Step 0.5

### Step 0.5 — Design Approval Gate (first run only)

Fires when `.ultra/workflow-state.json` does NOT exist.

1. `task.list` → confirm plan present; if empty, instruct `/ultra-plan` and **EXIT**
2. If ANY task has `status` in (`in_progress`, `completed`) → plan was already
   approved → skip this gate
3. Present plan overview (totals, P0/P1/P2, Walking-Skeleton position)
4. `ask.question` (or runtime `AskUserQuestion`):
   - A: "Confirm, start implementation" → continue to Step 1
   - B: "Revise plan first" → suggest `/ultra-plan` → **EXIT**
5. On approval, write workflow-state:
   ```jsonc
   {"command":"ultra-dev","task_id":0,"branch":"","step":"0.5","status":"design_approved","ts":"<ISO8601>"}
   ```

### Step 1 — Task Selection

```jsonc
// MCP: task.list (or runtime args supply id)
{ "status": "pending" }
```

Pick the first result (dependency-resolved) or the one matching `$1`.
Read `.ultra/tasks/contexts/task-{id}.md` body for the Implementation /
Acceptance sections. Use the Acceptance list as the initial todo set.

### Step 1.5 — Status → in_progress (single-write)

```jsonc
// MCP: task.update  (R: do NOT touch context-md frontmatter or "> **Status**" line)
{ "id": "<id>", "patch": { "status": "in_progress" } }
```

**CLI fallback**: `ultra-tools task update <id> --status in_progress`.

Projector runs after the write → `tasks.json` + `contexts/task-{id}.md`
frontmatter re-generated with `status: in_progress`. **Do not hand-edit either.**

### Step 2 — Environment Setup

**Unmerged-completed recovery**: `git branch --list 'feat/task-*'`; for each,
extract task id, look up status via `task.get`. If any completed task has an
unmerged branch → `ask.question`:
- "Merge task-{id} to main first" (recommended)
- "Delete branch (abandoned)"
- "Skip, continue with new task"

**Branch setup**:

| Current branch | Action |
|----------------|--------|
| `main` / `master` | `git pull origin main && git checkout -b feat/task-{id}-{slug}` |
| `feat/task-{id}-*` (same task) | continue (resume checkpoint) |
| other | `ask.question`: switch to main + new branch / continue current |

**Dependencies**: soft-warn only; parallel work is allowed.

### Step 3 — TDD Cycle

**Subagent isolation (complexity ≥ 7)**: optional — spawn the cycle via
`ultra-tools subagent run --backend auto --prompt "…"` or runtime equivalent;
subagent returns summary.

**Mid-TDD checkpoint (complexity ≥ 6)**: after GREEN phase, write a
checkpoint. See Step 4.4 for the preferred MCP route.

**RED** — write failing tests:
- Mine Acceptance list for test specs
- Cover 5 dimensions: functional / boundary / exception / security / integration
- At least one integration test per boundary-crossing module
- Run; confirm failure

**GREEN** — minimum code to pass:
- Production-ready (no TODO / placeholder)
- Run; confirm pass

**REFACTOR** — SOLID / DRY / KISS / YAGNI; tests stay green.

**Checkpoint after Step 3.3**:
```jsonc
{"command":"ultra-dev","task_id":<id>,"branch":"<branch>","step":"3.3","status":"tdd_complete","ts":"<iso>"}
```
→ `.ultra/workflow-state.json`

### Step 4 — Quality Gates

| Gate | Requirement |
|------|-------------|
| Tests green | 0 failures |
| Coverage | ≥80% overall; 100% functional-core; critical paths for shell |
| Mock policy | Core logic: no mocks; external: testcontainers/stub OK |
| No degradation | Zero fallback or demo code |
| Integration test | Boundary-crossing code has ≥1 real integration test |
| Entry-point reachable | New modules trace to a handler/listener/cron |
| Spec compliance | Each Acceptance criterion implemented AND tested |

Checkpoint `step="4"`, `status="gates_passed"`.

### Step 4.4 — Pre-Review Checkpoint (no more `/compact` dependency)

**MCP primary path** (Phase 5 wires this):
```jsonc
// session.checkpoint — stores workflow state so review can reclaim context
{ "session_id": "<current>", "task_id": "<id>", "step": "4.5", "status": "pre_review" }
```

**Fallback (Phase 5 placeholder, current reality)**:
1. Write `.ultra/workflow-state.json` with `step=4.5, status=pre_review`
2. On Claude runtime, the user may still `/compact` manually; the skill reads
   `.ultra/workflow-state.json` on resume to restore state
3. Other runtimes skip `/compact` entirely (no dependency)

**Gate**: the skill MUST NOT require `/compact`; it MUST work when the
runtime cannot compact.

### Step 4.5 — Ultra Review (MANDATORY)

**MCP primary path** (Phase 3 wires this):
```jsonc
// review.run — orchestrates the parallel agent pool server-side, writes SUMMARY.json
{ "mode": "all", "scope": { "diff_range": "HEAD" } }
```

**Fallback — Claude Task tool**: invoke skill `/ultra-review all` (current behavior).
**Fallback — other runtimes**: `ultra-tools subagent run review-code --backend auto` + loop.

**MAX_REVIEW_ITERATIONS = 2**

| Verdict | Iter | Action |
|---------|------|--------|
| APPROVE | any | → Step 5 |
| COMMENT | any | review P1s, fix if warranted, → Step 5 |
| REQUEST_CHANGES | 1 | fix ALL P0, re-run tests, `/ultra-review recheck` |
| REQUEST_CHANGES | 2 | stall check → escalate or fix |

**Stall detection before iter 2**: if `curr_count >= prev_count` (P0+P1 not
shrinking) → write `UNRESOLVED.md`, WARN user, proceed to Step 5.

**Verification gate before Step 5**:
- SUMMARY.json verdict ≠ `REQUEST_CHANGES`
- All P0 resolved
- Tests still green

Checkpoint `step="4.5", status="review_done", review_session=<id>, review_iteration=<N>`.

### Step 5 — Status → completed (single-write)

**Prerequisites**: Step 4 + Step 4.5 green.

```jsonc
// MCP: task.update
{
  "id": "<id>",
  "patch": {
    "status": "completed",
    "completion_commit": "_pending_"  // overwritten in Step 6 after commit
  }
}
```

**CLI fallback**: `ultra-tools task update <id> --status completed`.

Projector regenerates frontmatter. **Then** write the context-md **body**
Completion section (skill responsibility, not projector):

```markdown
## Completion
- **Completed**: <YYYY-MM-DD>
- **Commit**: _pending_   # filled in Step 6
- **Summary**: <one-line delivery summary>
```

**Do not** hand-edit `> **Status**` anywhere in the body — frontmatter owns it.

### Step 5.5 — Pre-Commit Checklist (BLOCKING)

Before `git commit`, verify every item:

- [ ] `task.get` confirms `status="completed"`
- [ ] context-md body has updated Completion section
- [ ] All tests pass
- [ ] Ultra Review verdict ≠ `REQUEST_CHANGES`
- [ ] New modules reach a live entry point (no orphan)
- [ ] Boundary-crossing code has integration test

Any unchecked → fix; do NOT commit.

### Step 6 — Commit + Merge

1. `git status` → show diff
2. `ask.question`:
   - A: "Commit + Merge to main" (recommended)
   - B: "Commit only, create PR later"
   - C: "Review diff first" → `git diff --stat` → re-ask

3. On approval:
   ```bash
   git add -A
   git commit -m "feat(scope): description"
   ```

4. Record commit hash via MCP:
   ```jsonc
   { "id": "<id>", "patch": { "completion_commit": "<sha>" } }
   ```
   Update context-md body Completion line to the real hash; amend:
   ```bash
   git add .ultra/tasks/contexts/task-<id>.md
   git commit --amend --no-edit
   ```
   (The amend is OK here — the first commit is a local, not-yet-pushed commit
   in the feature branch. Never amend pushed commits.)

5. `git fetch origin && git rebase origin/main`; resolve any conflicts.

6. Re-run tests after rebase. Fail → fix → amend → repeat 5-6.

7. If Option A chosen:
   ```bash
   git checkout main && git pull origin main
   git merge --no-ff feat/task-<id>-<slug>
   git push origin main && git branch -d feat/task-<id>-<slug>
   ```

Checkpoint `step="6", status="committed", commit=<sha>`.

### Step 7 — Report

- Commit hash
- Project progress (`task.list` → `completed/total`)
- Next task suggestion (first remaining `pending` in topological order)

## Dual-Write Mode

Triggered when implementation reveals spec gaps or requirement changes.

**Classification (mandatory before updating specs)**:

| Kind | Meaning | Action |
|------|---------|--------|
| **EXPANSION** | new requirement surfaced | update spec + Change Log |
| **CORRECTION** | spec error/ambiguity | update spec + Change Log |
| **REDUCTION** | removing/weakening scope | **STOP** → `ask.question` for approval |

**REDUCTION gate** — options:
- A: "Approve reduction, update spec"
- B: "Keep original scope, find alternative implementation"
- C: "Split into separate task, defer to next cycle"

Update `.ultra/specs/` immediately so parallel tasks see current truth.
Log in context-md body Change Log:

```markdown
| <date> | <KIND> | <change desc> | specs/<file>#<section> | <reason> |
```

**Principle**: `specs/` is source of truth; `contexts/` tracks implementation
history. Specs may grow (EXPANSION) or be corrected (CORRECTION). Specs must
never silently shrink (REDUCTION without gate).

## MCP → CLI fallback matrix

| Purpose | MCP tool (phase) | CLI / runtime fallback |
|---------|------------------|------------------------|
| Select pending task | `task.list` (2) / `task.get` (2) | `ultra-tools task list --status pending` |
| Status → in_progress | `task.update` (2) | `ultra-tools task update <id> --status in_progress` |
| Pre-review checkpoint | `session.checkpoint` (5 — placeholder) | write `.ultra/workflow-state.json` |
| Run review | `review.run` (3 — placeholder) | Claude: `Task` → `/ultra-review all`; others: `ultra-tools subagent run review-code --backend auto` |
| Status → completed | `task.update` (2) | `ultra-tools task update <id> --status completed` |
| Ask user | `ask.question` (3 — placeholder) | Claude: `AskUserQuestion`; CLI: `ultra-tools ask --question … --options …` |

## What this skill DOES NOT do

- Does NOT write `tasks.json` directly (projector owns it)
- Does NOT edit context-md frontmatter (projector owns it)
- Does NOT require the runtime to support `/compact`
- Does NOT assume `review.run` or `session.checkpoint` are wired — fallbacks are first-class

## Integration

| | |
|---|---|
| **Input** | `.ultra/tasks/tasks.json`, `.ultra/tasks/contexts/task-<id>.md` body, state.db |
| **Writes** | state.db (via `task.update`), context-md body (Completion + Change Log), workflow-state.json checkpoints |
| **Next** | `/ultra-dev <next-id>` or `/ultra-test` when all Walking Skeleton + critical-path tasks complete |
