---
name: ultra-change
description: "Open or resume a continuous change, capture its delta and decisions, compile bounded role context, and route one executable slice."
user-invocable: true
runtime: all
mcp_tools_required:
  - change.create
  - change.update
  - change.get
  - change.list
  - change.context
  - change.breadcrumb
  - change.learning_propose
  - change.learning_resolve
  - task.create
  - task.list
---

# ultra-change — Delta Entry and Alignment Gate

Use this after the first baseline delivery for fixes, small features, redesigns,
incidents, and maintenance. It keeps specifications live through a delta → implement
→ learn → converge loop.

## Authority boundary

All change and task lifecycle writes use the live MCP tools. Do not write raw SQLite
or mutate generated task/context projections. Provider payloads stay in their owning
memory or graph system; Ultra stores metadata references only.

## 1. Establish the change

Call `change.list` and `change.breadcrumb` first.

- Resume the single matching active/blocked change.
- If several may match, require an explicit id.
- Otherwise auto-discover repository facts, then ask only the highest-value unresolved
  question. Do not ask the user for branch, stack, paths, or behavior already visible.

Capture:

- observable problem or requested outcome;
- acceptance and explicit non-goals;
- affected public seam or integration boundary;
- documentation impact: `required` paths, `none` with rationale, or blocking `unknown`;
- kind: `quick`, `standard`, `major`, or `incident`;
- decision inventory: accepted decisions, rejected alternatives, and unresolved choices.

Create with `change.create` using a stable kebab-case id. Update an existing packet
with `change.update`; never create a parallel packet for the same outcome.

## 2. Write only the delta

The bounded packet is:

```text
.ultra/changes/active/<change-id>/
  intent.md
  delta/                 # standard and major
  plan.md                # standard and major
  diagnosis.md           # incident
  context-manifest.json  # MCP projection
  spec-learning.json     # MCP projection
  verification.md        # convergence projection
```

`intent.md` records outcome, acceptance, non-goals, docs impact, and decisions.
Delta files describe only differences from the baseline. An incident diagnosis must
record symptom, earliest bad state, root-cause hypothesis, discriminating evidence,
and recovery boundary.

## 3. Create an executable slice

Prefer the smallest vertical `tracer_bullet` that crosses a live public seam. Split
only when ownership or verification is genuinely independent. Each task must declare:

- one observable outcome and linked `change_id`;
- bounded files/contracts and dependencies;
- `public_seam` that proves reachability;
- exact `verification_command`;
- expected red signal for a bug/incident;
- documentation impact.

Persist tasks with `task.create`. Generated `tasks.json` is never an input authority.

## 4. Compile Context Manifest v2

Call `change.context` for the next task with:

```json
{
  "id": "<change-id>",
  "task_id": "<task-id>",
  "role": "plan",
  "gate": "planning",
  "context_refs": [{"ref":"<path>","kind":"spec","reason":"defines acceptance","required":true}],
  "budget": {"max_tokens":12000,"max_files":12},
  "execution_contract": {
    "slice_kind":"tracer_bullet",
    "public_seam":"<reachable boundary>",
    "verification_command":"<exact command>",
    "context_budget_percent":40
  }
}
```

Include only files needed for the current role and gate. Missing required references,
digest drift, file-count overflow, or a fresh-context budget over 40% blocks readiness.
Use `expand_contract` only for an explicitly approved wider slice.

## 5. Handle discoveries without silent spec drift

When implementation reveals a stable requirement, invariant, or public behavior not
in the baseline, call `change.learning_propose` with evidence and target document.
It is a candidate, not an automatic edit. A human/primary-agent decision must approve
or reject it; approved learning is marked applied only after the baseline was updated.

## Exit contract

Call `change.breadcrumb` and report the compiled task, readiness, blockers, and its
single next action. Do not claim alignment while documentation impact is unknown,
context is stale, or a material decision remains unresolved.
