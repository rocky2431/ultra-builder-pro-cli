# Ultra Builder Pro decision contract

This document records the current product and authority boundaries that apply to
the distributed package. Executable behavior remains defined by source,
`spec/mcp-tools.yaml`, and `spec/schemas/state-db.sql`; `package.json` is the
release-version authority.

## Authority split

| Layer | Owns | Must not own |
|---|---|---|
| User intent | Goals, acceptance, non-goals, material product trade-offs, risk acceptance, and authorization for irreversible or external effects | Facts that the current checkout or runtime can establish directly |
| Host model | Classification, investigation, research coverage, solution design, task decomposition, context, test and review strategy, documentation impact, and next-action recommendations | Fabricated evidence, bypassed authorization, or durable lifecycle state |
| Ultra MCP | IDs, state, digests, provenance, freshness, locks, leases, transactions, recovery, and legal state transitions | Product direction, a fixed research route, technology selection, or business decisions |
| Host adapter | Native Skill discovery, user-question surfaces, tool invocation, installation, and runtime wiring | A second project-state authority |
| Hook | Lifecycle observation, compact DB-derived context, recovery hints, and generated-projection protection | Ordinary development blocking or semantic route selection |

`.ultra/state.db` is the only durable Ultra lifecycle authority. Generated JSON
and Markdown are projections or evidence artifacts. Prompt text, chat history,
external memory, and code-graph payloads are not Ultra authority.

## Research coverage

The research references form an optional semantic catalog. The host model
selects only the areas justified by the current goal and evidence, records an
evidence-based selection reason, and always includes synthesis. Omitted catalog
areas create no workflow rows. An explicit `not_applicable` or accepted
`deferred` entry is recorded only when preserving that exclusion is useful.

MCP validates generic invariants: selected identifiers must exist, dispositions
must be legal, reused or excluded evidence must be referenced, synthesis must be
active, and at least one non-synthesis area must be applicable. MCP does not
choose the coverage set.

## Lifecycle boundaries

- `ultra-init` classifies and initializes local project authority. It does not
  perform product research or start another workflow.
- `ultra-research` establishes or refreshes evidence and converges a baseline
  only after the required user decisions and local Git authority exist.
- `ultra-change` owns post-baseline product deltas. Research, planning,
  development, testing, review, and delivery remain separately invocable
  capabilities with DB-enforced prerequisites.
- `ultra-deliver` converges local Ultra evidence. Commit, push, publish, deploy,
  messaging, and other external effects remain separately authorized host
  actions.

## Package boundary

The package contains the public Ultra workflows, internal review-rule Skills,
host-specific collaboration companions, MCP runtime, adapters, lifecycle hooks,
and minimal project bootstrap. General browser, deployment, framework,
discovery, memory, and graph capabilities remain owned by their separately
installed providers. Ultra stores only bounded provider metadata references.

## Installation provenance

Each host installation records package identity, repository, source commit when
available, installed-asset hashes, and contract targets. A local source checkout
also records whether it was dirty and a deterministic worktree digest. An npm
installation has no package-local Git repository and records those source
checkout fields as `null`; it never inherits an enclosing consumer repository.

Installation and project diagnostics are read-only unless an explicit repair or
install action is requested. No local workflow completion authorizes a remote,
release, deployment, or destructive effect.

## Current source map

- Runtime architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Workflow state and invalidation: [`WORKFLOW-LIFECYCLE.md`](./WORKFLOW-LIFECYCLE.md)
- Host compatibility: [`RUNTIME-COMPAT-MATRIX.md`](./RUNTIME-COMPAT-MATRIX.md)
- User handbook projection: [`USER-HANDBOOK-CONTRACT.md`](./USER-HANDBOOK-CONTRACT.md)
- MCP interface: [`../spec/mcp-tools.yaml`](../spec/mcp-tools.yaml)
- Database contract: [`../spec/schemas/state-db.sql`](../spec/schemas/state-db.sql)
