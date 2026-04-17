---
name: ultra-plan
description: "Generate task breakdown from complete specs OR from a raw PRD (Phase 8A). Scope-mode-aware; writes state.db via task.create or task.parse_prd; projector generates tasks.json + contexts/*.md."
runtime: all
mcp_tools_required:
  - task.create
  - task.parse_prd
  - task.dependency_topo
  - plan.export
  - plan.get
  - ask.question
cli_fallback: "task create"
---

# ultra-plan — Phase 3.3

Transform validated `.ultra/specs/` into an executable task plan. **state.db is
the authority** (D32): every new task is created via MCP `task.create`; the
projector regenerates `.ultra/tasks/tasks.json` and context-md frontmatter
automatically. Context-md bodies are written by this skill (not projector).

## Prerequisites

- `/ultra-research` completed — specs must be 100% (no `[NEEDS CLARIFICATION]`)
- `.ultra/specs/product.md` + `.ultra/specs/architecture.md` exist
- `.ultra/specs/research-distillate.md` preferred when present (token-efficient)

## Workflow

### Input Mode Selection (BEFORE Step 0)

Two entry points lead into the planner:

| Mode | When | Path |
|------|------|------|
| **Spec Mode** (default) | `.ultra/specs/` exists and `/ultra-research` is complete | Steps 0–7 below |
| **PRD Direct** (Phase 8A) | User hands you a raw PRD (path or inline text) and wants to skip the spec layer | see **PRD Direct Workflow** below |

---

### PRD Direct Workflow (Phase 8A — human-gated artifact)

For a one-shot PRD → task graph pipeline with approval gate:

1. **Dry-run parse** (no state.db writes):
   ```jsonc
   // MCP
   { "tool": "task.parse_prd", "args": { "prd_path": "<path>", "dry_run": true, "tag": "<branch>" } }
   ```
   Returns `{ tasks: [...], topo: [[...],[...]] }` without touching state.db.

2. **Build execution plan** (in-memory via the server's `plan-builder`):
   The server composes `computeWaves` + `files_modified` overlap + `pricing.computeCost`
   into a plan with `waves`, `ownership_forecast`, `conflict_surface`, and
   estimated cost / duration.

3. **Human gate** — `ask.question` with plan summary + estimated cost:
   - `approve` → re-run `task.parse_prd` **with `dry_run: false`** to commit
     tasks, then `plan.export { out_path: ".ultra/execution-plan.json" }`
     to land the artifact and emit the `plan_approved` event.
   - `reject` → **do not** call the non-dry-run path. No state.db rows, no
     artifact. Prompt user for PRD revision and loop.

4. **Post-approval** — the artifact at `.ultra/execution-plan.json` is the
   source of truth for Phase 8B orchestration (wave-by-wave dispatch).
   Use `plan.get { section: "topo" | "conflicts" | "all" }` to inspect
   without re-reading the file.

**AC guarantees**:
- `reject` path performs zero state.db writes (dry_run=true on parse).
- `approve` path emits exactly one `plan_approved` event, tied to the
  persisted artifact path.
- Task IDs returned by the dry-run and the final persisted tasks are
  identical (parser is deterministic given the same LLM output).

---

### Step 0 — Scope Mode Selection

Ask the user which posture this plan takes. **Commit once selected — do not
drift silently.**

| Mode | Posture | Use when |
|------|---------|----------|
| **EXPAND** | "What would make this 10x better for 2x effort?" — surface stretch opportunities | Greenfield, user wants to think bigger |
| **SELECTIVE** (default) | Baseline scope held; optional expansions surfaced individually | Most common; feature work on existing product |
| **HOLD** | Scope locked; make it bulletproof; catch every failure mode | Requirements clear, need execution depth |
| **REDUCE** | Find the minimum viable version; cut ruthlessly | MVP, time pressure, PoC |

Interactive prompt uses **MCP `ask.question`** (Phase 3.7+). Until then, fall
back to the runtime's native picker (Claude: `AskUserQuestion`; CLI: menu).

**Dual-scale effort** on every EXPAND/SELECTIVE expansion decision:
`Complete: ~X LOC, AI ~Y min | Shortcut: ~X LOC, saves Y min but ___`

### Step 1 — Specification Completeness Validation (BLOCK gate)

Read specs and check field-by-field. **Fail loud** — don't generate a plan
against broken specs.

**discovery.md** (if present):
- §0 Problem Validation has demand signal + confidence %
- §2 Market Assessment has TAM/SAM/SOM with numbers + sources
- §3 Competitive Landscape has ≥2 competitors compared
- §4 Product Strategy has ≥3 trade-offs

**product.md**:
- §2 Personas: ≥2 with goals + pain points
- §3 Scenarios: ≥3 with current + desired flow
- §4 User Stories: acceptance criteria in Given/When/Then
- §5 Feature Scope: Features Out section with rationale
- §6 Success Metrics: North Star has numeric target

**architecture.md**:
- §1 Quality Goals: ≥3 measurable scenarios
- §4 Solution Strategy: tech stack with URL-cited rationale
- §5 Building Blocks: modules map to features
- §6 Runtime Scenarios: ≥1 with data flow

**Fail if**: `[NEEDS CLARIFICATION]` markers present / file missing / checklist fails.
On fail → instruct user to run `/ultra-research` targeting the gap.

### Step 2 — Requirements + Codebase Analysis

**Requirements extraction** (prefer distillate):
- Functional requirements (product.md §4)
- Technical constraints (architecture.md §2)
- Quality requirements (architecture.md §10)
- Success metrics (product.md §6)

**Codebase analysis** (for AI-executable context):
- Directory structure (src/ tests/ config/)
- Existing patterns worth referencing
- Tech stack detection (framework versions, test runners)
- Naming conventions

### Step 3 — Task Generation

#### tasks.json schema (v4.5 projection, source in state.db)

Fields per task: `id`, `title` (action verb + target), `type`
(architecture/feature/bugfix), `priority` (P0-P3), `complexity` (1-10),
`status` (pending initially), `dependencies` (task IDs), `estimated_days`,
`context_file`, `trace_to` (spec section anchor).

#### Integration tasks — MANDATORY inserts

1. **Walking Skeleton — always Task #1, P0, type=architecture**
   - Title: "Walking skeleton: {primary use case} end-to-end"
   - Must touch every layer: entry → use case → domain → persistence
   - Acceptance: one real request returns real data through all layers

2. **Contract Definition** (when specs show component boundaries)
   - Title: "Define contract: {component A} ↔ {component B}"
   - Must PRECEDE implementation tasks on both sides
   - Acceptance: shared interface/schema + contract test

3. **Integration Checkpoint** — every 3-4 feature tasks
   - Title: "Integration checkpoint: verify {feature group} connectivity"
   - Acceptance: components from recent tasks communicate end-to-end

#### Task granularity

- Ideal complexity: 3-5 (one-session completable)
- Too large (>6) → split
- Too small (<3) → merge
- Context budget: target 40% per task; max 8 files touched; complexity ≥7 must split

### Step 4 — Dependency Analysis

- Build dependency graph from each task's `deps` list
- Detect cycles (DFS with visited + recursion stack) — cycles are **fatal**
- Topological order → surface parallel opportunities
- Vertical slicing check: flag any task touching only one layer → split or merge
- Walking skeleton blocks all feature tasks
- Contract tasks precede their consumer implementations

### Step 5 — Persist via MCP `task.create`

For **each** task in the planned list (topological order):

```jsonc
// MCP call per task
{
  "id": "1",                          // optional; server mints uuid if omitted
  "title": "Walking skeleton: …",
  "type": "architecture",
  "priority": "P0",
  "complexity": 4,
  "deps": [],
  "tag": "<git branch>",              // optional
  "trace_to": ".ultra/specs/product.md#US-01"
}
```

**CLI fallback** (per task):
```bash
ultra-tools task create \
  --title "Walking skeleton: …" --type architecture --priority P0 \
  --complexity 4 --trace-to ".ultra/specs/product.md#US-01"
```

After each `task.create`, the server auto-runs the projector — `tasks.json`
and `contexts/task-{id}.md` (frontmatter only) appear.

**Note on batching**: Phase 3.3 does one `task.create` per task. Phase 8A may
introduce `task.create_batch` for bulk inserts; not required here.

### Step 5.5 — Context-md body (skill responsibility)

Projector writes the frontmatter; this skill writes the body. For each task,
write `.ultra/tasks/contexts/task-{id}.md` body (projector preserves it):

```markdown
## Context
**What**: …
**Why**: … (Persona/Scenario link)
**Constraints**: - …

## Implementation
**Target Files**: - path/to/file.ts (create|modify: desc)
**Pattern**: …
**Tech Notes**: …

## Acceptance
**Tests**: - [ ] `test cmd`
**Verification**: ```bash …```

## Trace
**Source**: `.ultra/specs/product.md#US-01`

## Change Log
| Date | Change | Specs Updated | Reason |
|------|--------|---------------|--------|

## Completion
> _Filled when task completed by /ultra-dev_
```

### Step 6 — Plan Verification (BLOCKING)

Run programmatic checks **before** presenting to user:

| Check | Severity | Action on fail |
|-------|----------|----------------|
| Every user story (US-XX) mapped to ≥1 task via `trace_to` | CRITICAL | create missing task or flag |
| Dependency graph acyclic | CRITICAL | report cycle chain, block |
| `trace_to` points at real spec anchor | WARN | suggest correction |
| Tasks with complexity ≥7 | WARN | suggest split |
| Tasks touching >8 files | WARN | suggest split |
| Total tasks >20 | WARN | suggest phased delivery |
| Per-task complexity × 5% context > 40% | WARN | split recommended |

All CRITICAL pass → present to user (Step 7). Any CRITICAL fail → auto-fix or surface.

### Step 7 — Report + Next Steps

Summary output:
- Total tasks, priority distribution (P0/P1/P2), complexity histogram
- Dependency edge count, parallel-track count
- Estimated total effort (sum of `estimated_days`)
- Requirement coverage % (stories mapped / stories total)
- First task details (Walking Skeleton)
- Suggest `/ultra-dev`

### Continuation block (MANDATORY)

```markdown
---
## ▶ Next Up
**Start Development** — TDD workflow on Task #1: {Walking Skeleton title}

`/clear` then `/ultra-dev`

---
**Also available**: `/ultra-status`
---
```

## Quality Standards

- 100% requirement coverage (every user story mapped)
- Clear acceptance criteria per task
- No circular dependencies
- Realistic complexity (justifiable in review)
- Action-verb titles
- Walking Skeleton is Task #1
- Every feature task is a vertical slice (≥2 layers)
- Integration checkpoint every 3-4 feature tasks
- Contract tasks precede cross-boundary implementations

## Integration Points

| | |
|---|---|
| **Prerequisite** | `/ultra-research` — specs 100% complete |
| **Input** | `.ultra/specs/research-distillate.md` (primary), `product.md`, `architecture.md`, `discovery.md` |
| **Writes** | state.db via `task.create`; context-md bodies |
| **Output (projected)** | `.ultra/tasks/tasks.json`, `.ultra/tasks/contexts/task-*.md` |
| **Next** | `/ultra-dev` |

## MCP → CLI fallback matrix

| Purpose | MCP tool | CLI fallback |
|---------|----------|--------------|
| Scope mode prompt | `ask.question` | `ultra-tools ask --question … --options …` |
| Create task | `task.create` | `ultra-tools task create --title … --type … --priority …` |

**Phase 3.7 placeholder**: `ask.question` not yet wired cross-runtime — skill
falls back to the runtime's native picker (Claude `AskUserQuestion`).

## What this skill DOES NOT do

- Does NOT write state.db directly — all task writes go through `task.create`
- Does NOT regenerate `tasks.json` — projector owns that
- Does NOT start implementation — that's `/ultra-dev`
- Does NOT re-run research — if specs are incomplete, redirects to `/ultra-research`
