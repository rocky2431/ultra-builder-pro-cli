# Discovery Evidence

## Scope

- **Repository**: `/Users/rocky243/Context Engineering/ultra-builder-pro-cli`
- **Baseline**: HEAD `e5e6ab92fcc60b05c978d9f918bf01d2c0916eaa` plus the current uncommitted boundary reconciliation.
- **Decision unlocked**: how Init, Research, and Change divide raw intake, accepted
  baseline, user interaction, and later deltas without adding another public Skill.
- **Freshness**: current Skills, templates, Hooks, maintained documentation, and
  repository artifacts inspected through 2026-08-04.

## Observed

| Fact | Evidence | Effect |
|---|---|---|
| The previous v0.24 runtime made seven MCP tools and SQLite authority mandatory on the primary path. | Referenced Codex task `019fb03a-ec33-7f93-a8ce-c94452650694`; retired files in Git history | Confirms why v0.26 must not reintroduce semantic runtime control. |
| Before this Change, this repository's own `.ultra/` still used `.ultra/tasks/tasks.json` sourced from `.ultra/.runtime/state.db` and eleven unresolved generated contexts. | pre-migration checkout inspection on 2026-08-01 | These projections could not serve as honest v0.26 resume authority. |
| The old ten custom-agent methods were review, debugging, test execution, and coordination methods rather than private product authority. | `git show 3f99189:agents/*.md` | They can be preserved as portable Skill references and parent coordination. |
| Local versions are Claude 2.1.220, Codex 0.144.4, OpenCode 1.18.3, Kimi 0.31.1, and Grok 0.2.118. | local `--version` and `--help` output on 2026-08-01 | Host profiles and documented limitations are tied to observed CLIs. |
| Kimi documents `KIMI_CODE_HOME`, managed user plugins, native Skills and Hooks, and no project plugin scope. | official Kimi plugin and Skill documentation | Adapter root and scope behavior must use `.kimi-code` and reject local plugin scope. |
| Codex plugin installation does not itself trust newly installed Hooks. | official Codex plugin documentation | Doctor must distinguish installed health from Hook activation. |
| The released Init contract asked baseline questions and wrote North Star semantics before Research, while Research asked overlapping questions again. | HEAD versions of `skills/ultra-init/SKILL.md`, `skills/ultra-research/SKILL.md`, templates, and owner usage feedback on 2026-08-03 | The route boundary, document ownership, and session fallback were internally inconsistent. |
| The file-first ledger used movable `change_ref` paths and Hooks selected the first globally unfinished task. | `.ultra/tasks.json`, `hooks/_common.py`, and sequential-Change failing contracts on 2026-08-04 | Archiving or abandoning one Change could dangle task identity or inject its acceptance into the next Change. |
| Test freshness excluded only the report, while Deliver wrote docs and moved the Change after checking only HEAD. | `worktree_digest.cjs`, `ultra-deliver`, and delivery-freshness regression | A valid report could invalidate itself during normal finalization, while changed intent was not independently detected. |
| Change entry was keyed to unfinished tasks rather than the active directory, Plan always asked the owner to confirm technical seams, and Delegate required a task even for pre-Plan evidence or aggregate review. | cross-Skill entry review and failing workflow-entry contracts on 2026-08-04 | A second Change could be opened before delivery, technical judgment was over-routed to the owner, and two advertised delegation callers were unreachable. |

## Decisions

| Decision | Evidence and rationale | Owner | Contract |
|---|---|---|---|
| Use Skill assets, not installed custom agents. | Common portable surface plus exact old-agent method comparison. | Owner | FR-03 |
| Put the canonical project template under installed `ultra-init/assets/project-template`. | Skills already carry references/assets on every adapter; avoids five distribution mechanisms. | Owner | FR-01, FR-04 |
| Treat Kimi and Grok plugins as user-scoped only. | Native documentation/help and registry layouts. | Owner | FR-07 |
| Keep unsupported routing and permission granularity visible. | Adding a semantic shim would recreate the rejected supervisor. | Owner | FR-07 |
| Keep fourteen Skills and place Wayfinding inside Research. | The six early references are Research semantic lenses; Grilling, Think, and Domain Modeling already own the reusable methods. A new public route would add navigation ceremony without a new owner outcome. | Owner | FR-09 |
| Make Init raw-only, Research baseline-owning, and Change delta-scoped. | This prevents Init from consuming Research and gives Project Brief, North Star, `CONTEXT.md`, and specifications one primary maturation path. | Owner | FR-09 |
| Use stable Change identity, active-scoped readers, and a two-pass Deliver. | Preserves sequential history without a database or lock service, prevents abandoned work from becoming current, and binds Test to semantic plus product snapshots without self-invalidation. | Owner | FR-10 |
| Keep one active Change, model-owned technical seams, and three bounded delegation scopes. | This preserves semantic ownership while keeping task work, scoped Research evidence, and aggregate review reachable without synthetic ledger rows. | Owner request plus repository agency boundary | FR-03, FR-06, FR-10 |

## Unknowns

| Unknown | Consequence | Blocking | Resolution |
|---|---|---:|---|
| Real authenticated provider behavior for a full cross-host task on the currently installed CLI versions. | Local contracts prove argv, files, process, and recovery, but not provider output quality or quota behavior. | No for local package completion; yes for a live-provider acceptance claim. | Separate owner-authorized provider drill with recorded receipts. |
| Whether the owner wants v0.26 committed, installed into real HOME, pushed, or published. | No external delivery effect can be claimed. | No for implementation; yes for that effect. | Separate explicit authorization and verification. |

## Problem Validation

The product gap was not missing prose alone. Source tests exposed concrete broken paths:
the development checkout could omit init assets, Kimi resolved the wrong home, Hook
traces could resolve against the wrong root, review digests were not bound to the exact
packet, delegate could not prove actual writes or terminal recovery, and this checkout
resumed from retired DB projections.

## Assumptions and Validation

| Assumption | Validation signal | Decision rule |
|---|---|---|
| A common Skill surface preserves more behavior than five custom-agent projections. | all references resolve and installed trees are byte-identical | retain unless a host-native live failure requires a bounded adapter asset |
| Files plus Git can recover work without a runtime store. | another host can identify active task, context, Resume Note, evidence, and diff | add no state service without a reproduced unrecoverable failure |
| Mechanical delegate checks can validate filesystem results. | adversarial tests for mutation, path, status, timeout, cancel, and diff | never promote receipt to semantic correctness |

## Baseline Gaps

| Gap | Status | Evidence | Owner |
|---|---|---|---|
| Canonical repository self-migration | completed | `.ultra/tasks.json` and `.ultra/evidence/v026-self-migration/evidence.json` | host model |
| Final validators, package proof, and release gate | completed | `.ultra/test-report.json` and `.ultra/evidence/v026-release-verification/evidence.json` | host model |
| Real provider drill and external delivery effects | separately authorized | active Change Non-goals and Unknowns | owner |
