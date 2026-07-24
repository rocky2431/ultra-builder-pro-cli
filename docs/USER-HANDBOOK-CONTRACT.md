# Ultra Builder Pro — User Handbook Contract

Ultra Builder Pro has two explicit handbook modes:

- default mode owns only one small managed section describing the Ultra runtime;
- full mode installs a complete host-native engineering handbook when the owner
  explicitly chooses to replace legacy unmarked prompt content.

Neither mode runs implicitly during plugin installation. Existing files are backed
up before mutation, and full mode preserves other provider-owned marker blocks.

## Source and render targets

`adapters/_shared/handbook.cjs` is the canonical source. It renders both the bounded
runtime contract and the complete engineering handbook with host-native command,
interaction, coordination, delegation, and durable-file semantics:

| Runtime | Default target | Main invocation form |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | `/ultra-builder-pro:ultra-plan` |
| Codex | `~/.codex/AGENTS.md` | `$ultra-builder-pro:ultra-plan` |
| OpenCode | `~/.config/opencode/AGENTS.md` | `/ultra-plan` |
| Kimi Code | `~/.kimi-code/AGENTS.md` | `/ultra-builder-pro:ultra-plan` |

The renderer never copies Claude Code-only APIs into Codex, OpenCode, or Kimi. Each
host receives only its native invocation, collaboration, interaction, and worker
language.

The default managed block deliberately stays short. It says that `.ultra/state.db`
is authoritative; `change.context` compiles role/gate readiness, bounded references,
fresh-context budget, public seam, and exact verification; size budgets are advisory;
new ordinary work requires a healthy baseline; and only an approved incident
break-glass may start without baseline readiness. It explicitly separates user intent,
host-model judgment, MCP mechanics, host-adapter presentation, and hook lifecycle
responsibilities. It also records the decision, specification-learning, memory, agent,
and package boundaries.

Detailed procedures remain in the plugin skills so neither handbook mode duplicates
workflow implementation steps.

## Managed-block contracts

Default mode owns only:

```markdown
<!-- ultra-builder-pro:handbook:start -->
...
<!-- ultra-builder-pro:handbook:end -->
```

Rules outside those markers remain byte-for-byte user-owned. A malformed or
duplicated marker pair is an error, not an invitation to guess. For Codex only,
the first default apply can migrate an old unmarked
`## Ultra Builder Pro Runtime Contract` section up to the next level-two heading.

Full mode owns:

```markdown
<!-- ultra-builder-pro:full-handbook:start -->
...
<!-- ultra-builder-pro:full-handbook:end -->
```

On first full apply, unmarked legacy prompt content is replaced. Marker-delimited
content owned by another provider is retained before the Ultra full-handbook region.
Both `provider:start` / `provider:end` and `BEGIN provider` / `END provider`
comment forms are supported. Repeated blocks remain repeated, and blocks nested
inside an old Ultra full region are extracted before that region is replaced. Later
full applies produce the same canonical output and keep each retained block
byte-for-byte intact.

Because full apply intentionally removes unmarked content, a current preview is
enforced rather than merely documented. The confirmation token binds the runtime,
target path, existing content, and rendered result; missing or stale tokens are
rejected before any file changes.

## Safe workflow

Preview and apply only the runtime contract:

```bash
ubp-handbook preview --runtime claude
ubp-handbook preview --runtime codex
ubp-handbook preview --runtime opencode
ubp-handbook preview --runtime kimi

ubp-handbook apply --runtime claude
ubp-handbook apply --runtime codex
ubp-handbook apply --runtime opencode
ubp-handbook apply --runtime kimi
```

Converge a legacy complete handbook through explicit full mode:

```bash
ubp-handbook preview --runtime codex --full > /tmp/ubp-codex-handbook.md
# Inspect /tmp/ubp-codex-handbook.md and copy the token printed to the terminal.
ubp-handbook apply --runtime codex --full \
  --confirm "PASTE_64_CHARACTER_TOKEN_HERE"
```

Repeat with `claude`, `opencode`, or `kimi` as the runtime. An existing target is
copied to `<file>.ubp-backup-<timestamp>` before atomic replacement. A handbook
symlink remains a symlink and the resolved target's POSIX mode is retained.
Re-running either apply mode with the same rendered content is a no-op and creates
no additional backup.

The plugin installer intentionally applies neither mode. A plugin update and a
durable user-handbook change have different rollback and review requirements.

## Ownership boundaries

The complete handbook defines general engineering and collaboration behavior, but it
does not install or invoke external memory, graph, browser, deployment, discovery, or
framework skills. Those providers retain their own installation, prompts, credentials,
and lifecycle. Ultra records only the minimum provider references required for workflow
provenance.

Host adaptation is semantic, not textual substitution. A foreign tool name or prompt
mechanism must never be made “compatible” by changing only its path or product name.
