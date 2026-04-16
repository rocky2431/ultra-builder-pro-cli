# ultra-builder-pro-cli — Roadmap

**Goal**: distribute the Ultra Builder Pro (Hermes) agent-engineering system to
any mainstream AI coding agent runtime, not just Claude Code.

**First-release runtimes**: Claude Code · OpenCode · Codex CLI · Gemini CLI.
**Confidence**: 96% (modeled on get-shit-done's proven multi-runtime pattern).
**Timeline**: 3–4 weeks full-time equivalent.

---

## Phase 0 — Skeleton & Boundaries  ✅ (done)

- [x] Destroy legacy `.git`; re-init on `main` (history preserved in bundle)
- [x] `package.json` with `name=ultra-builder-pro-cli`, bin, files, engines≥22
- [x] `bin/install.js` — arg parsing, banner, help, routing (adapters still stubbed)
- [x] `adapters/{claude,opencode,codex,gemini}.js` — `resolveTarget` + install/uninstall signatures
- [x] `ultra-tools/cli.cjs` — subcommand registry, USAGE, stubs
- [x] `docs/ROADMAP.md` (this file)

**Gate**: `node bin/install.js --help` and `--all --local` both exit with the
expected "not implemented" error for every adapter.

---

## Phase 1 — `ultra-tools` state engine (5–7 days)

A runtime-agnostic Node CLI that collapses Claude-only built-in tools into
file-backed, portable equivalents. Every runtime invokes it through Bash.

- `task create|update|list|get|delete`
  - Backs onto `.ultra/tasks/tasks.json` with FS-lock (`proper-lockfile`).
  - JSON output for machine parsing; `--human` for friendly tables.
- `ask --question ... --options "A|B|C" [--header H] [--text-mode]`
  - Claude: emit a sentinel JSON block the runtime captures and turns into
    native AskUserQuestion.
  - Others: numbered menu to stderr, read a choice from stdin.
- `memory search|save`
  - Wraps `.ultra/memory/memory.db` SQLite FTS5 via the existing Python
    `memory_db.py` (invoked through `python3`), or ports to `better-sqlite3`.
- `skill invoke <name>`
  - Loads `skills/<name>/SKILL.md` and prints the body; the calling agent
    injects it into its next prompt.
- `subagent run <agent-name> --prompt "..."`
  - Backends: `claude` (Task sentinel), `codex` (`codex exec`),
    `gemini` (`gemini --prompt`), `sdk` (Anthropic Agent SDK), `auto`.

**Tests**: `node --test ultra-tools/*.test.cjs`, ≥70% line coverage on the
state engine. Cross-runtime happy path driven by a shell script.

**Gate**: each subcommand has one passing unit test and one integration test
where a dummy "agent" shells out to ultra-tools and produces the expected
`.ultra/` state on disk.

---

## Phase 2 — Adapters (5–7 days)

Implement `install(ctx)` and `uninstall(ctx)` for each of the 4 runtimes.

| Runtime | Target dir | Hooks | Frontmatter transform |
|---------|-----------|-------|-----------------------|
| Claude Code | `~/.claude` / `./.claude` | settings.json merge | identity |
| OpenCode | `~/.config/opencode` / `./.opencode` | `opencode.json` | preserve YAML |
| Codex | `~/.codex` / `./.codex` | `config.toml` `[codex_hooks]` | YAML → TOML `[agents.X]` |
| Gemini | `~/.gemini` / `./.gemini` | — (none) | commands → TOML |

**Guarantees**:
- Idempotency: running install twice produces zero diff.
- Uninstall reverts to a diff-equal pre-state (settings.json merge aware).
- Claude install produces **diff-equal** output against the previous hand-
  crafted `~/.claude` setup — this is the hard gate.

**Tool-name mapping** (applies only where runtimes have different native
tool names; content is otherwise untouched):

```
Claude         Copilot   OpenCode   Codex    Gemini
Read       →   read      read       read     read
Write      →   edit      write      write    write
Edit       →   edit      edit       edit     edit
Bash       →   execute   bash       bash     bash
Grep/Glob  →   search    grep/glob  grep     grep
Task       →   agent     agent      subagent subagent
```

---

## Phase 3 — Python hooks tri-split (3–5 days)

Split every hook into `hooks/core/*.py` (pure logic) + per-runtime adapters:

- `hooks/adapters/claude.py` — reads Claude Code stdin JSON (today's shape).
- `hooks/adapters/opencode.py` — reads OpenCode hook JSON event.
- `hooks/adapters/codex.py` — reads Codex TOML-hook payload.
- `hooks/adapters/gemini.py` — (none; hooks downgrade to prompt guards).

Migrate the 15 existing hooks:

```
block_dangerous_commands  health_check            hook_utils
memory_db                 mid_workflow_recall     observation_capture
post_compact_inject       post_edit_guard         pre_compact_context
pre_stop_check            session_context         session_journal
subagent_tracker          system_doctor           user_prompt_capture
```

**Gate**: replay a canned Claude session and verify hook outputs are byte-
identical to pre-migration baseline.

---

## Phase 4 — Prompt rewrites for text_mode (3–5 days)

Each `commands/*.md` and agent gets a `<text_mode>` branch modeled on
get-shit-done's `gsd:do`:

- `AskUserQuestion` → `ultra-tools ask` (numbered menu)
- `TaskCreate/*`    → `ultra-tools task …`
- `Skill(...)`      → `ultra-tools skill invoke`
- `Agent(type=X)`   → `ultra-tools subagent run X`
- `TeamCreate` / `SendMessage` → `<unsupported_in_runtime>` block with a
  documented workaround (serialized sub-agent runs).

**Gate**: run `/ultra-init` on each of the 4 runtimes; produce comparable
final state in `.ultra/`.

---

## Phase 5 — Release pipeline (2–3 days)

- `ultra-builder-pro-cli --uninstall` fully reversible (Phase 2 guarantee
  exercised end-to-end).
- CI: GitHub Actions matrix ({claude, opencode, codex, gemini} × {local,
  global}) running install → smoke → uninstall.
- **Publishing**:
  - `npm publish` — primary channel (`npx ultra-builder-pro-cli@latest`).
  - `pip` / PyPI — thin Python wrapper that shells out to `npx`; useful for
    Python-heavy shops that prefer `pip install ultra-builder-pro`.
    (Optional for v0.1; required for v0.2.)
  - Homebrew — formula + GitHub Release; macOS/Linux-native install.
- README with runtime-by-runtime quickstart, tool-mapping table, downgrade
  matrix, and troubleshooting.

---

## Out-of-scope for v0.1 (deferred)

- Copilot, Cursor, Windsurf, Augment, Trae, Qwen, Cline, CodeBuddy, Kilo,
  Antigravity — 10 more runtimes, 2–3 days each.
- Independent TypeScript SDK that wraps the Anthropic Agent SDK. Not blocking
  the multi-runtime story; revisit once v0.1 has production users.
- Web dashboard / TUI. The CLI is a distribution tool, not an agent host.

---

## Non-goals (permanently)

- Rewriting Ultra Builder Pro into a standalone coding agent (that is what
  gsd-2 is — a different product).
- Building provider abstractions over multiple LLM APIs. Runtimes own that.
- Cosmetic refactors of the existing command/agent/skill content.
