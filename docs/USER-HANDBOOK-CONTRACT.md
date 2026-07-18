# Ultra Builder Pro — User Handbook Contract

Ultra Builder Pro does not own a user's complete `CLAUDE.md` or `AGENTS.md`.
Those files contain durable engineering doctrine for the host. The plugin owns
only one small managed section describing its runtime boundary.

## Source and render targets

`adapters/_shared/handbook.cjs` is the canonical source. It renders the common
authority, baseline adoption, Context Spine, specification-learning, memory, hook, agent, and
package boundaries with host-native command syntax:

| Runtime | Default target | Main invocation form |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | `/ultra-plan` |
| Codex | `~/.codex/AGENTS.md` | `$ultra-builder-pro:ultra-plan` |
| OpenCode | `~/.config/opencode/AGENTS.md` | `/ultra-plan` |
| Kimi Code | `~/.kimi-code/AGENTS.md` | `/ultra-builder-pro:ultra-plan` |

The renderer never copies Claude Code-only APIs into Codex, OpenCode, or Kimi. Each
host receives only its native invocation and collaboration names.

The managed block deliberately stays short. It says that `.ultra/state.db` is
authoritative; `change.context` compiles role/gate readiness, bounded references,
fresh-context budget, public seam, and exact verification; size budgets and an
incomplete baseline during active work are advisory, while an approved baseline is
required for convergence and full baseline health is restored atomically at archive;
hooks inject only the DB-derived
`change.breadcrumb`; and unresolved specification learning or either failed review
axis blocks convergence. Detailed procedures remain in the plugin skills so user
handbooks do not accumulate duplicated prompt sediment.

## Managed-block contract

The owned content is bounded by:

```markdown
<!-- ultra-builder-pro:handbook:start -->
...
<!-- ultra-builder-pro:handbook:end -->
```

Rules outside those markers remain byte-for-byte user-owned. A malformed or
duplicated marker pair is an error, not an invitation to guess. For Codex only,
the first apply can migrate the old unmarked
`## Ultra Builder Pro Runtime Contract` section up to the next level-two heading.

## Safe workflow

Preview the full merged result before applying:

```bash
ubp-handbook preview --runtime claude
ubp-handbook preview --runtime codex
ubp-handbook preview --runtime opencode
ubp-handbook preview --runtime kimi
```

Apply when the preview is correct:

```bash
ubp-handbook apply --runtime claude
ubp-handbook apply --runtime codex
ubp-handbook apply --runtime opencode
ubp-handbook apply --runtime kimi
```

An existing target is copied to
`<file>.ubp-backup-<timestamp>` before the atomic replacement. Re-running apply
with the same rendered content is a no-op and creates no additional backup.

The plugin installer intentionally does not apply this section implicitly. A
plugin update and a durable user-handbook change have different rollback and
review requirements, so handbook mutation stays explicit.
