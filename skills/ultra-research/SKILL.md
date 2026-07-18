---
name: ultra-research
description: Turn uncertain product or architecture intent into evidence-backed baseline specifications with explicit decisions and traceable acceptance. Use when an Ultra project has unresolved requirements that are not ready for planning.
---

# Build a validated baseline

Research only the uncertainty that blocks a durable product, architecture, or delivery
decision. Do not force a fixed discovery ceremony onto a well-defined change.

## Preflight

1. Require an initialized `.ultra/specs/` directory and call `baseline.get`. Route to
   `ultra-init` when state or the baseline is absent. Preserve its mode and id.
2. Read the current specification files and repository evidence before asking the
   user to repeat known facts.
3. Define the intended deliverable, unresolved decisions, and evidence standard.
4. Select only the research lanes that the uncertainty requires:
   - problem and product: `references/problem-product.md`;
   - users and scope: `references/users-scope.md`;
   - architecture: `references/architecture.md`;
   - quality and delivery: `references/quality-delivery.md`;
   - final traceability: `references/synthesis.md`.

Read a reference completely only when its lane is selected. Do not load all lanes by
default.

## Evidence discipline

- Prefer the current checkout and existing project artifacts for repository facts.
- Browse only when a claim is external, unstable, or requires primary-source support.
- Prefer official and primary sources; cite each consequential external claim near the
  statement it supports.
- Separate observed facts, evidence-backed inferences, user decisions, and unresolved
  assumptions.
- Do not manufacture confidence percentages, market numbers, personas, competitors,
  or options when evidence does not support them.

## Workflow

1. Build a short research agenda from the selected lanes and the decisions they must
   unlock.
2. Gather evidence before recommending a direction. Ask one concise question when a
   user decision is load-bearing; batch independent low-impact questions only when it
   improves flow.
3. Present material tradeoffs before recording a decision. Comparisons are appropriate
   only when real alternatives share meaningful criteria.
4. Update the relevant baseline specification sections. Preserve source links,
   decisions, rejected alternatives when useful, acceptance criteria, and explicit
   open questions. Do not duplicate the same narrative across several files.
5. Validate cross-document consistency and trace each required behavior from problem
   or constraint to acceptance and architecture.
6. Use `references/synthesis.md` for the completion check.
7. Record unresolved evidence as the baseline gap ledger: `baseline_blocker`,
   `documentation_drift`, `known_defect`, `technical_debt`, `unknown`, or
   `future_change`. Keep accepted non-blocking work out of the implementation backlog
   until the owner selects it.
8. Call `baseline.record` with the complete current specification list, bounded evidence
   references, actual verification results, provider metadata, explicit unknowns,
   classification, and the full gap ledger. Use the returned repository revision for
   convergence.
9. Present the baseline, open gaps, dirty-worktree state, and any known-red verification
   to the owner. After explicit approval, call `baseline.converge`, setting acceptance
   flags only for the exact known-red or dirty snapshot approved by the owner. Resolve
   deterministic blockers before routing.

## Completion gate

Research is complete when the selected scope has enough evidence for planning, every
material decision is recorded, required acceptance is testable, architecture respects
known constraints, and unresolved items are either blocking or explicitly outside the
accepted scope.

Route a converged baseline to `ultra-plan`. Do not create business tasks, write raw
SQLite, or maintain a second condensed specification that can drift from the baseline.
