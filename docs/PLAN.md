# ultra-builder-pro-cli — Execution Plan

**Status**: Phase 0 complete · Phase 1 ready to start
**Version**: 0.1.0-plan · drafted 2026-04-17
**Scope**: v0.1 delivery. v0.2+ items are explicitly called out.
**Overall confidence**: **96%** (per-phase breakdown in §10)

This document is the technical contract for turning the Hermes (Ultra
Builder Pro) agent-engineering system into a runtime-agnostic CLI. Every
task below has an acceptance criterion a reviewer can re-run end-to-end.

---

## 1. Problem statement

Hermes is a comprehensive agent-engineering system — 9 commands, 9
sub-agents, 18 skills, 15 hooks, a SQLite-FTS5 memory layer, a
team-coordination fabric — all written against Claude Code's specific
tool surface and configuration format. It works beautifully on Claude
Code. It does not work anywhere else.

Parallel ecosystems (OpenCode, Codex CLI, Gemini CLI) host their own
user communities that cannot consume Hermes today. Every upstream
improvement to Hermes compounds only inside the Claude Code bubble.

**Hypothesis**: the content is portable; only the plumbing is
Claude-specific. A thin distribution + adapter layer (the `get-shit-done`
precedent, validated across 14 runtimes) can unlock the remaining 3
major ecosystems without rewriting Hermes.

---

## 2. Goals

| # | Goal | Verification |
|---|------|--------------|
| G1 | `npx ultra-builder-pro-cli --{runtime} --{scope}` yields a working Hermes on Claude / OpenCode / Codex / Gemini | E2E: each runtime can run `/ultra-init` successfully |
| G2 | `--uninstall` reverts to a pre-install diff-equal state | `git status` on the target config dir is clean |
| G3 | Single source of truth — no fork of `commands/`, `agents/`, `skills/` per runtime | Only adapters contain per-runtime code |
| G4 | Claude-only tools degrade gracefully on the other 3 runtimes | `ultra-tools` shim backs every Claude-only call |
| G5 | **Diff-equal gate on Claude**: install result byte-identical to the existing hand-crafted `~/.claude` | `diff -r` exits 0 |
| G6 | 0 private-data leak in any published artifact | `npm pack --dry-run`, Homebrew bottle, pip wheel all clean |

---

## 3. Non-goals

- Rewriting Hermes into a standalone coding agent. That is gsd-2's lane.
- Abstracting LLM providers. Runtimes own that layer.
- Supporting Copilot, Cursor, Windsurf, Augment, Trae, Qwen, CodeBuddy,
  Cline, Antigravity, Kilo in v0.1. Each is ~2–3 days of adapter +
  testing; deferred to v0.2+.
- A web dashboard, TUI, or daemon. The CLI is a distribution tool, not
  an agent host.
- Cosmetic refactors of existing command / agent / skill content.

---

## 4. Architecture

### 4.1 Data flow

```
                  repo (single source of truth)
                           │
           ┌───────────────┼───────────────────────────┐
           │               │                           │
      commands/        agents/  skills/  hooks/   CLAUDE.md
           │               │       │       │           │
           └───────────────┼───────┴───────┴───────────┘
                           │
                   bin/install.js (CLI entry)
                           │
           ┌───────────────┼────────────┬──────────┐
           │               │            │          │
      adapters/        adapters/    adapters/  adapters/
      claude.js        opencode.js  codex.js   gemini.js
           │               │            │          │
           ▼               ▼            ▼          ▼
     ~/.claude/    ~/.config/     ~/.codex/    ~/.gemini/
                   opencode/
                           │
                  runtime loads assets
                           │
                       ┌───┴────┐
                       │ Agent  │ ← calls ultra-tools/cli.cjs via Bash
                       │  runs  │   for TaskCreate / AskUserQuestion /
                       │        │   Skill / Subagent / Memory parity
                       └────────┘
```

### 4.2 Component roster (after Phase 1–5)

```
ultra-builder-pro-cli/
├── bin/
│   └── install.js            CLI entry, arg parsing, adapter routing
├── adapters/
│   ├── claude.js             ~/.claude + settings.json merge
│   ├── opencode.js           ~/.config/opencode + opencode.json merge
│   ├── codex.js              ~/.codex + config.toml merge
│   ├── gemini.js             ~/.gemini (no hook surface)
│   ├── _shared/
│   │   ├── file-ops.js       copy / symlink / hash / backup
│   │   ├── frontmatter.js    YAML ↔ TOML ↔ JSON transform
│   │   ├── settings-merge.js JSON-deep-merge with conflict policy
│   │   └── path-rewrite.js   ${UBP_CONFIG_DIR} template expansion
│   └── _shared.test.js       vitest per-module
├── ultra-tools/
│   ├── cli.cjs               Bash-callable shim; 5 subcommands
│   ├── task.cjs              TaskCreate/Update/List/Get/Delete
│   ├── ask.cjs               AskUserQuestion / text-mode menu
│   ├── memory.cjs            SQLite FTS5 via Python passthrough
│   ├── skill.cjs             Skill() invocation via SKILL.md read
│   ├── subagent.cjs          Task() via CLI recursion or SDK
│   └── *.test.cjs            node:test per-file
├── hooks/
│   ├── *.py                  15 Claude-format hooks (unchanged in v0.1)
│   ├── core/                 pure hook logic (Phase 3)
│   ├── adapters/             per-runtime event readers (Phase 3)
│   └── tests/                unit tests (not shipped)
├── commands/                 9 *.md (templated paths in Phase 4)
├── agents/                   9 *.md
├── skills/                   18 skill directories
├── output-styles/            2 *.md (Claude-specific; other runtimes skip)
├── .ultra-template/          project-init scaffold
├── docs/
│   ├── ROADMAP.md            5 phases, timeline
│   ├── PLAN.md               this file
│   ├── TOOL-MAPPING.md       Phase 4 deliverable
│   └── MIGRATION.md          Phase 5 deliverable
└── package.json
```

### 4.3 Key design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language of install layer | Node (CJS) | Ubiquitous on every target runtime; zero-runtime install via `npx`. Mirrors get-shit-done. |
| Language of hooks | Python (kept) | 15 hooks already written; rewriting them in Node is 2–3 weeks of pure churn with no user-visible value. All 4 target runtimes can shell out to `python3`. |
| Configuration merge policy | 3-way merge with marker sentinels | A Hermes marker comment (`# UBP_MANAGED_START` / `# UBP_MANAGED_END`) wraps every entry; uninstall strips the block; user edits outside the block are preserved. |
| Subagent fan-out (non-Claude) | Recursive CLI calls | `codex exec` / `gemini --prompt` / Claude Agent SDK via the `sdk` backend. True parallelism is lost on serial-only runtimes; documented as degraded. |
| Memory DB backing | Keep SQLite-FTS5 via `python3` | `better-sqlite3` binary compilation is a friction source; Python is already required by the hooks, reuse it. |
| Text-mode toggle | `UBP_TEXT_MODE` env + `workflow.text_mode` config | Commands include an `<text_mode>` block that flips UI primitives. Matches gsd-cc convention. |

---

## 5. Tool-mapping matrix

The 12 tools Hermes relies on, sorted by how each target runtime handles
them. Only `Claude-specific` rows need downgrading.

| Hermes tool | Claude | OpenCode | Codex | Gemini | Downgrade |
|-------------|--------|----------|-------|--------|-----------|
| Read | ✅ | ✅ read | ✅ read | ✅ read | rename only |
| Write | ✅ | ✅ write | ✅ write | ✅ write | rename only |
| Edit | ✅ | ✅ edit | ✅ edit | ✅ edit | rename only |
| Bash | ✅ | ✅ bash | ✅ bash | ✅ bash | none |
| Grep/Glob | ✅ | ✅ | ✅ | ✅ | none |
| WebSearch/Fetch | ✅ | ⚠ varies | ⚠ varies | ✅ | fall back to Bash `curl` |
| **TaskCreate/\*** | ✅ native | ❌ | ❌ | ❌ | `ultra-tools task …` (file-backed JSON with fs-lock) |
| **AskUserQuestion** | ✅ native | ❌ | ❌ | ❌ | `ultra-tools ask --text-mode` (numbered menu, stdin read) |
| **Skill** | ✅ native | ❌ | ❌ | ❌ | `ultra-tools skill invoke <name>` (prints SKILL.md; outer agent injects) |
| **Agent (subagent)** | ✅ native | ⚠ limited | ⚠ exec | ⚠ --prompt | `ultra-tools subagent run <name> --prompt …` (recursive CLI or SDK) |
| **TeamCreate / SendMessage** | ✅ native | ❌ | ❌ | ❌ | `<unsupported_in_runtime>` block; serialized sub-agent runs as workaround |
| **EnterWorktree / ExitWorktree** | ✅ native | ❌ | ❌ | ❌ | `ultra-tools worktree …` shelling out to `git worktree` (Phase 4.5, optional) |

### 5.1 Downgrade contract

When a Claude-only tool is called on a non-Claude runtime, the
`ultra-tools` shim **must**:

1. Produce the same functional outcome as the native call (state,
   selection, output).
2. Emit a machine-readable JSON line to stdout so the calling agent can
   parse it identically across runtimes.
3. Never silently fall through — missing input means a non-zero exit
   and a human-readable stderr message.

---

## 6. Phase-by-phase task breakdown

Each task has: **ID**, **subject**, **acceptance criterion**, **effort**
(AI-assisted hours). Unless noted, tasks are sequential within a phase.

### Phase 0 — Skeleton (✅ done)

| ID | Task | AC | Done |
|----|------|----|------|
| 0.1 | Kill old `.git`, re-init on `main`; bundle legacy history | bundle verifies; 3 commits live | ✅ |
| 0.2 | `package.json` with bin/files/engines | `npm pack --dry-run` runs | ✅ |
| 0.3 | `bin/install.js` skeleton | `--help` and `--all --local` both show correct stubs | ✅ |
| 0.4 | 4 adapter stubs | each exports `resolveTarget/install/uninstall` and throws "not implemented" | ✅ |
| 0.5 | `ultra-tools/cli.cjs` skeleton | `--help`, `--version`, each subcommand stub error | ✅ |
| 0.6 | `docs/ROADMAP.md` | 5 phases listed with AC | ✅ |
| 0.7 | Privacy purge (`teams/`, `plugins/blocklist.json`) + minimal settings | npm tarball contains 0 local-state files | ✅ |

### Phase 1 — `ultra-tools` state engine · **5–7 days · conf 98%**

Runtime-agnostic Node CLI covering the 5 Claude-only surfaces. All
subcommands emit structured JSON on stdout (`{ok, data, error}`) so
agents parse output identically across runtimes.

#### 1.1 Shared utilities · 0.5 day
- Add `ultra-tools/_util.cjs`: JSON IO with `proper-lockfile`, structured
  error emitter, stdout JSON protocol helpers.
- **AC**: 4 util fns with vitest-style tests under `ultra-tools/_util.test.cjs`;
  ≥90% coverage on the util file.

#### 1.2 `task` subcommand · 1.5 days
- Operations: `create`, `update`, `list`, `get`, `delete`.
- Backing file: `.ultra/tasks/tasks.json` (schema v5.0, see §7.1).
- Arguments: `--subject`, `--description`, `--status`, `--owner`,
  `--id`, `--json`.
- Concurrency: `proper-lockfile` around every write.
- **AC**: (a) 10 unit tests pass (each op × happy + error); (b) a shell
  script simulating two concurrent `task create` calls produces two
  distinct IDs with no corruption.

#### 1.3 `ask` subcommand · 1 day
- Args: `--question "<q>"`, `--options "A|B|C"`, `--header`,
  `--multi-select`, `--text-mode`.
- Claude mode: emit a sentinel JSON block that a Claude wrapper parses
  into a native `AskUserQuestion` call.
- Text mode: print numbered menu to stderr, read choice(s) from stdin,
  validate, echo selection as JSON on stdout.
- Non-TTY stdin: parse a single line "1" or "1,3" for multi-select.
- **AC**: (a) 6 unit tests (TTY / non-TTY / multi / invalid / out-of-range
  / Claude sentinel shape); (b) a shell script pipes `"2\n"` to
  `ultra-tools ask …` and gets the 2nd option back.

#### 1.4 `memory` subcommand · 1 day
- Operations: `search <query> [--limit N]`, `save --summary "<s>"
  [--tags "a,b"]`, `prune --older-than N`.
- Backend: shells out to `python3 hooks/memory_db.py` passing a JSON
  command; ports the output to stdout. Avoids compiling sqlite in Node.
- Fallback: if `python3` missing, print actionable error and exit 3.
- **AC**: (a) 5 unit tests stubbing `memory_db.py` via a shim;
  (b) integration test: real `python3` call on a temp DB with 3
  entries, `search` finds 2 matches, `prune` removes 1.

#### 1.5 `skill` subcommand · 0.5 day
- Operations: `invoke <name> [--args "..."]`, `list [--filter X]`.
- `invoke` reads `skills/<name>/SKILL.md` (or `~/.ultra/skills/…` when
  `UBP_CONFIG_DIR` is set) and prints the full body prefixed with a
  JSON header.
- `list` scans the skills dir and returns `{ name, description, location }`
  per skill.
- **AC**: (a) 4 unit tests; (b) a shell script lists ≥1 skill and
  invokes one without error.

#### 1.6 `subagent` subcommand · 1.5 days
- Operations: `run <agent-name> --prompt "..." [--backend auto|claude|
  codex|gemini|sdk] [--timeout S]`.
- Backends:
  - `claude`: emit `Task()` JSON sentinel.
  - `codex`: `codex exec --sandbox read-only -o <out> <prompt>`.
  - `gemini`: `gemini --prompt <prompt>` with pipeline handling.
  - `sdk`: `@anthropic-ai/claude-agent-sdk` headless `query()`.
  - `auto`: branch on `$UBP_RUNTIME`, default `claude`.
- **AC**: (a) 8 unit tests (each backend × happy + fail); (b) E2E test
  with a dummy `codex` stub binary on `$PATH` verifies the shell-out
  contract and JSON return shape.

#### 1.7 Docs · 0.5 day
- Write `ultra-tools/README.md` documenting every subcommand's
  invocation, JSON schema, and exit codes. This file is shipped in the
  npm tarball and is also the canonical reference prompts in Phase 4
  will cite.
- **AC**: `ultra-tools --help` output matches the README table of
  contents line-for-line.

**Phase 1 gate**: all subcommands tested, README exists, cross-shell
integration script (`scripts/phase1-smoke.sh`) pipes a 5-step workflow
through ultra-tools producing expected JSON stream on stdout.

### Phase 2 — Adapters · **5–7 days · conf 94%**

Implement `install(ctx)` and `uninstall(ctx)` for each of the 4
runtimes. Each adapter completes in <30 s on a warm cache.

#### 2.1 Shared adapter utilities · 1 day
- `adapters/_shared/file-ops.js`: copy, symlink, hash-and-skip-if-same,
  backup-before-overwrite (stores backups under `${target}/.ubp-backup/`).
- `adapters/_shared/frontmatter.js`: YAML ↔ TOML ↔ JSON. Uses `yaml`
  and a minimal TOML writer (no dependency explosion).
- `adapters/_shared/settings-merge.js`: deep-merge with sentinel
  (`UBP_MANAGED_START`/`END`) block recognition; conflict policy =
  fail loud with actionable error.
- `adapters/_shared/path-rewrite.js`: expand `${UBP_CONFIG_DIR}`,
  `${UBP_RUNTIME}`, `${UBP_SCOPE}` across file bodies.
- **AC**: 12 unit tests across 4 modules; ≥85% coverage on shared.

#### 2.2 Claude adapter · 1 day
- Target: `~/.claude/` (global) or `./.claude/` (local).
- Assets: direct copy of `commands/`, `agents/`, `skills/`, `hooks/`;
  `settings.json` merged via settings-merge; `CLAUDE.md` appended
  inside sentinel block.
- **AC**: **diff-equal gate** — `diff -r existing-claude-install new-
  claude-install` returns 0. A fresh install on an empty `~/.claude/`
  followed by `--uninstall` leaves the dir empty.

#### 2.3 OpenCode adapter · 1.5 days
- Target: XDG (`~/.config/opencode/`) or `./.opencode/`.
- Transformations:
  - `commands/*.md` → `commands/*.md` (YAML frontmatter compatible).
  - `agents/*.md` → `agents/*.md` (tool names mostly compatible; spot
    fixes documented in frontmatter comment).
  - `skills/` → `skills/` (Phase 1 validated SKILL.md works).
  - `hooks/*.py` → `opencode.json` hook entries pointing to
    `${target}/hooks/*.py`.
- **AC**: install produces a valid `opencode.json` (validated against
  OpenCode schema if available; else JSON-parse check); `/ultra-init`
  smoke test on an empty project completes without crash.

#### 2.4 Codex adapter · 1.5 days
- Target: `$CODEX_HOME` or `~/.codex/`.
- Transformations:
  - `commands/*.md` → `prompts/*.md` (strip YAML frontmatter, inline
    `$ARGUMENTS` support preserved).
  - `agents/*.md` → `config.toml` `[agents.<name>]` with sandbox,
    model, tools derived from frontmatter.
  - `skills/` → Bash-addressable under `${target}/skills/`; referenced
    in agent prompts via `ultra-tools skill invoke`.
  - `hooks/*.py` → `[codex_hooks]` entries with `event = "pre_tool"`
    shape (exact schema per current Codex TOML reference).
- Tool name rewrite: performed via `frontmatter.js`.
- **AC**: install produces a valid `config.toml` (parsed by a Node TOML
  reader); `codex exec "run /ultra-init"` completes (or if Codex exec
  is not reachable in CI, a mocked exec binary satisfies the contract).

#### 2.5 Gemini adapter · 1.5 days
- Target: `$GEMINI_CONFIG_DIR` or `~/.gemini/`.
- Transformations:
  - `commands/*.md` → `commands/*.toml` (Gemini command format, 1-to-1
    mechanical). `$ARGUMENTS` → Gemini's `{{args}}` template.
  - `agents/*.md` → sub-agent registrations (Gemini's sub-agent protocol
    as of 2026-04; confirm in Phase 2.0 spike).
  - `skills/` → Bash-addressable; no native skill concept.
  - **Hooks: NOT SUPPORTED** by Gemini CLI. Downgrade: strip hooks at
    install, append a prominent `# hooks-disabled` note to
    `.gemini/README.ubp.md` with the rationale.
- **AC**: install completes without crash on an empty `~/.gemini`;
  uninstall leaves it empty; a smoke test invoking one command via
  `gemini --prompt` returns exit 0.

#### 2.6 Path rewrite integration · 0.5 day
- Apply `path-rewrite.js` over every copied file body during install.
  Source tokens: `${UBP_CONFIG_DIR}`, `${UBP_SKILLS_DIR}`,
  `${UBP_HOOKS_DIR}`.
- Backfill tokens into the 6 hard-coded `~/.claude/` references noted
  in ROADMAP §Phase 2 (CLAUDE.md ×2, commands/learn.md ×3, commands/
  ultra-init.md ×1).
- **AC**: `git grep "~/.claude/"` on the source returns 0 hits after
  backfill; each adapter's output correctly expands the tokens.

**Phase 2 gate**: all 4 adapters pass their individual AC; matrix
install (4 runtimes × 2 scopes) leaves the host filesystem in a
diff-equal pre-state after uninstall.

### Phase 3 — Python hooks tri-split · **3–5 days · conf 92%**

Split every hook into pure-logic core + thin per-runtime adapter so a
single change to, e.g., memory recall logic lands on all 4 runtimes at
once.

#### 3.1 Core extraction · 1 day
- Move hook business logic into `hooks/core/<name>.py` (pure functions,
  no stdin parsing, no env reading, no prints).
- **AC**: `python3 -c "from hooks.core import memory_db; …"` works;
  every `hooks/core/*.py` has a pytest file under `hooks/tests/core/`.

#### 3.2 Claude adapter · 0.5 day
- `hooks/adapters/claude.py`: reads current stdin JSON shape, calls
  core, prints expected response. Today's behavior preserved.
- **AC**: canned recording of current hook payload produces byte-
  identical output.

#### 3.3 OpenCode adapter · 1 day
- `hooks/adapters/opencode.py`: translate OpenCode's hook JSON event
  shape (per their published schema) to core inputs and back.
- **AC**: spec-test driven — for each hook, a sample OpenCode event is
  transformed, core is called, output matches the expected OpenCode
  hook response envelope.

#### 3.4 Codex adapter · 1 day
- `hooks/adapters/codex.py`: reads Codex's TOML-hook payload shape
  (verify exact wire format in a dedicated spike before coding).
- **AC**: same as OpenCode; also, `codex exec` invoked against a
  small fixture project runs the hook and yields expected side effects.

#### 3.5 Gemini adapter · 0.5 day
- No hook surface. Instead: produce `hooks/adapters/gemini.md` —
  documentation of what guardrails were dropped and how they map to
  "agent must invoke `ultra-tools verify …` in prompt" replacements.
- **AC**: reviewer confirms each of the 15 hooks has a stated outcome
  ("dropped", "moved to prompt guard", "moved to pre-commit shim").

**Phase 3 gate**: byte-identical Claude hook output, OpenCode + Codex
hooks pass their adapter AC, Gemini coverage table reviewed.

### Phase 4 — Prompt rewrites · **3–5 days · conf 95%**

Inject `<text_mode>` branches into every command / agent, and swap
Claude-only tool references for `ultra-tools` equivalents.

#### 4.1 Generator-based rewriter · 1 day
- `adapters/_shared/prompt-rewrite.js` — a deterministic transform
  that takes a command/agent's markdown and emits a runtime-specific
  variant. Runs at install time in adapters, not baked into source.
- Rules (machine-readable in `adapters/_shared/rewrite-rules.json`):
  ```
  AskUserQuestion(…)  → ultra-tools ask …   (text-mode branch)
  TaskCreate(…)       → ultra-tools task create …
  TaskUpdate(…)       → ultra-tools task update …
  TaskList()          → ultra-tools task list
  Skill(name=X)       → ultra-tools skill invoke X
  Agent(subagent=X)   → ultra-tools subagent run X
  TeamCreate(…)       → <unsupported_in_runtime> block with serial fallback
  SendMessage(…)      → <unsupported_in_runtime> block
  ```
- **AC**: golden-file tests — each of 9 commands + 9 agents has a
  `.golden.md` per runtime; rewriter output matches exactly.

#### 4.2 Command content updates · 1 day
- For each of the 9 commands, verify the `<text_mode>` branch renders
  cleanly. Where a native tool call has no clean shim, add a
  `<!-- ubp:warn -->` note.
- **AC**: manual review: each command renders for each runtime with no
  broken references.

#### 4.3 Agent content updates · 1 day
- Same treatment for the 9 sub-agents.
- **AC**: each sub-agent's tool-list frontmatter lists only
  runtime-supported tools after rewrite.

#### 4.4 Skill content updates · 0.5 day
- Skills mostly don't call Claude-specific tools; spot-fix the few
  that do (e.g., `recall`, `ultra-review`).
- **AC**: `grep -l "TaskCreate\|Skill(\|Agent("` on skills/ returns 0
  after rewrite for non-Claude targets.

#### 4.5 CLAUDE.md templating · 0.5 day
- Replace 2 hard-coded `~/.claude/` references with
  `${UBP_CONFIG_DIR}` tokens. Integrate with 2.6 path-rewrite.
- **AC**: `git grep "~/.claude/"` on the source → 0; installed files
  show runtime-correct paths.

**Phase 4 gate**: `/ultra-init` runs end-to-end on each of 4 runtimes,
creating `.ultra/` structure that matches the Claude baseline.

### Phase 5 — Release · **2–3 days · conf 98%**

#### 5.1 Integration tests · 1 day
- Add `tests/e2e/install-<runtime>.sh` × 4: spin up a clean temp dir,
  install, run `/ultra-init`, assert files exist, uninstall, assert
  dir is clean.
- GitHub Actions matrix: `{claude, opencode, codex, gemini}` ×
  `{local, global}` = 8 jobs. Claude + Codex + Gemini get mocked CLI
  binaries when the real ones are unavailable in CI.
- **AC**: all 8 matrix cells green on `main`.

#### 5.2 README rewrite · 0.5 day
- Replace the legacy 57 KB Hermes doc with a ~8 KB CLI-focused README:
  quickstart per runtime, tool-mapping table, downgrade matrix,
  troubleshooting. Move legacy content to `docs/LEGACY-HERMES.md`.
- **AC**: README fits in one screen's "About this repo" view on GitHub;
  each of the 4 runtimes has a 3-line quickstart.

#### 5.3 Publish pipelines · 1 day
- **npm**: `npm publish` on tag push (`v*`). Verify `npm pack --dry-run`
  on PRs (gating the merge).
- **Homebrew**: `homebrew-ultra-builder-pro-cli` tap with a formula
  that downloads the GitHub Release tarball. Formula auto-updated by
  a `homebrew-releaser` action.
- **pip**: a thin wrapper package `ultra-builder-pro` on PyPI that
  shells out to `npx ultra-builder-pro-cli`. Provides a single
  entry-point script for Python-centric shops.
- **AC**: all 3 channels resolve `ultra-builder-pro-cli@0.1.0` to the
  same commit SHA. A fresh macOS VM can install via each channel in
  <60 s.

#### 5.4 Release notes · 0.5 day
- `CHANGELOG.md` with v0.1.0 notes: scope, runtime coverage, known
  limitations, migration from legacy Hermes.
- **AC**: notes include a `known issues` section citing anything
  deferred to v0.2.

**Phase 5 gate**: `v0.1.0` tag pushed, all 3 channels live, installer
works on a clean machine for each of the 4 runtimes.

---

## 7. Interfaces & contracts

### 7.1 `.ultra/tasks/tasks.json` schema (v5.0)

```jsonc
{
  "version": "5.0",
  "created": "2026-04-17T03:45:12Z",
  "updated": "2026-04-17T03:45:12Z",
  "tasks": [
    {
      "id": "1",
      "subject": "Write failing test for auth flow",
      "description": "Cover invalid credentials path; expect 401.",
      "status": "pending",        // pending | in_progress | completed | deleted
      "owner": "",                 // empty = unassigned; agent name when claimed
      "blockedBy": [],             // list of task IDs
      "blocks": [],
      "activeForm": "Writing test",
      "created": "2026-04-17T03:45:12Z",
      "updated": "2026-04-17T03:45:12Z",
      "metadata": {}               // freeform
    }
  ]
}
```

- **Invariants**: `id` is a monotonic string; `status` transitions
  `pending → in_progress → completed` only (`deleted` is terminal).
  Conflicts on concurrent writes are prevented by `proper-lockfile`.

### 7.2 `ultra-tools` stdout protocol

Every subcommand emits a single JSON line as its final stdout:

```json
{"ok": true,  "command": "task.create", "data": { "id": "1", … }}
{"ok": false, "command": "task.create", "error": { "code": "EIO", "message": "…" }}
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | success |
| 1 | user input error (bad flags, missing required) |
| 2 | not implemented (stub phase only) |
| 3 | environment missing (e.g., no python3 for memory) |
| 4 | IO / locking failure |
| 5 | downstream tool failure (codex exec returned non-zero) |

### 7.3 Adapter signature

```ts
// conceptual — actual files are CJS
type AdapterContext = {
  repoRoot: string;
  scope: 'local' | 'global';
  configDir: string | null;   // override from --config-dir
  homeDir: string;
};

interface Adapter {
  name: string;
  resolveTarget(ctx: AdapterContext): string;
  install(ctx: AdapterContext): Promise<void>;
  uninstall(ctx: AdapterContext): Promise<void>;
}
```

All IO goes through `adapters/_shared/file-ops.js`; no adapter calls
`fs.*` directly. This makes dry-run mode (`--dry`) a single-line flag.

### 7.4 Sentinel block format

Any config file the CLI modifies is wrapped in a sentinel block so
uninstall can remove Hermes without touching the user's edits:

```jsonc
// ~/.claude/settings.json
{
  "permissions": { /* user-owned */ },

  // UBP_MANAGED_START (ultra-builder-pro-cli 0.1.0)
  "hooks": {
    "PostToolUse": [ /* Hermes */ ]
  }
  // UBP_MANAGED_END
}
```

For JSON and TOML where comments are awkward, we use a mirror file
(`~/.claude/.ubp-manifest.json`) recording every key we inserted,
parsed on uninstall.

---

## 8. Testing strategy

| Layer | Framework | Coverage target | Phase |
|-------|-----------|-----------------|-------|
| ultra-tools units | `node --test` (built-in) | ≥85% | 1 |
| adapter shared libs | `node --test` | ≥85% | 2 |
| adapter install/uninstall | shell E2E with tmp dirs | path coverage per runtime | 2 |
| hook cores (Python) | `pytest` | ≥80% | 3 |
| hook adapter translators | pytest | ≥80% | 3 |
| prompt rewriter | golden-file (stored under `tests/goldens/`) | 100% of commands × runtimes | 4 |
| End-to-end CI matrix | GitHub Actions | all green, no flaky | 5 |

**Fixtures**: `tests/fixtures/` contains canned stdin payloads, mock
config files, and a mock `codex`/`gemini` binary used in CI when the
real CLI is unavailable.

---

## 9. Risks & mitigations

| ID | Risk | Probability | Impact | Mitigation | Owner |
|----|------|-------------|--------|-----------|-------|
| R1 | Codex hook payload format undocumented / changes | medium | high | Phase 3 starts with a 0.5-day spike that records the current wire format; adapter is a thin translation layer so recovery is cheap | Phase 3.4 |
| R2 | Gemini sub-agent protocol unstable | medium | medium | Document "serialized-only" on Gemini in §5; mark as "degraded parallelism" in downgrade matrix; add `--gemini-agent-backend=flat` flag as an escape hatch | Phase 2.5 |
| R3 | settings-merge corrupts user's hand edits | low | high | Three guards: (a) backup to `.ubp-backup/` before every write; (b) sentinel block isolation; (c) `--dry` flag that prints diffs without writing | Phase 2.1 |
| R4 | `hooks/*.py` depends on Claude-only env vars | medium | medium | Phase 3.1 inventory every `os.environ.get(...)` read; translate in adapters | Phase 3.1 |
| R5 | `proper-lockfile` cross-platform flakiness | low | medium | Use the library's `retries` + stale lock detection; add a lock-timeout integration test | Phase 1.1 |
| R6 | `npx` bootstrap latency on slow networks | low | low | Publish a pre-bundled single-file ESM via esbuild (script `build:bin`) for advanced users | Phase 5.1 |
| R7 | Diff-equal gate fails because current `~/.claude` has ad-hoc additions | high | medium | Define "baseline" precisely: a freshly-installed Hermes from the pre-CLI git tag; compare against that, not user's live dir | Phase 2.2 |
| R8 | Homebrew tap abandoned if formula breaks | low | low | CI runs `brew install --build-from-source` on each release tag; formula auto-generated | Phase 5.3 |
| R9 | pip wrapper confuses Python-only users | medium | low | Wrapper's `--help` explicitly states it needs Node 22+; graceful error if Node missing | Phase 5.3 |

---

## 10. Confidence breakdown

| Phase | Work | Confidence | Why not higher |
|-------|------|-----------:|---------------|
| 0 | Skeleton | 100% | Already done |
| 1 | ultra-tools | 98% | Straightforward state engine; only residual risk is `proper-lockfile` edge cases (R5) |
| 2 | Adapters | 94% | Runtime quirks surface late: R1 (Codex hook format), R7 (baseline definition) |
| 3 | Hooks tri-split | 92% | Codex and OpenCode hook wire formats not fully public; each may need a spike day |
| 4 | Prompt rewrites | 95% | Deterministic transform; golden files catch drift |
| 5 | Release pipeline | 98% | Three standard channels; Homebrew tap is the wildcard (R8) |
| **Overall** | | **96%** | Weighted by effort; Phase 2+3 dominate |

**Residual 4%**: something genuinely novel surfaces in Codex / OpenCode
hook protocols that forces a re-architecture. Mitigation: both runtimes
ship open-source repos; we read their hook handler source if docs are
insufficient.

---

## 11. Timeline

Calendar target (AI-assisted, single developer):

```
Week 1     ████████████████████████  Phase 0 (done) + Phase 1
Week 2     ████████████████████████  Phase 1 (finish) + Phase 2 start
Week 3     ████████████████████████  Phase 2 (finish) + Phase 3 + Phase 4
Week 4     ████████████████████████  Phase 5 + buffer
```

- Phase 1: 5–7 working days (~30–40 hours)
- Phase 2: 5–7 days (~30–40 hours)
- Phase 3: 3–5 days (~15–25 hours)
- Phase 4: 3–5 days (~15–25 hours)
- Phase 5: 2–3 days (~10–15 hours)

**Total**: 18–27 working days; ~100–145 AI-assisted hours. Budget 4
calendar weeks with a 25% slack buffer on Phase 2 + Phase 3 (the
riskier ones).

---

## 12. Success metrics

Objective, measurable, checked at v0.1.0 release:

1. **Installability**: 4 runtimes × 2 scopes = 8 install paths all
   succeed on a clean macOS and a clean Ubuntu runner.
2. **Reversibility**: `--uninstall` leaves every runtime's config dir
   diff-equal to pre-install state (test: `git init && install &&
   uninstall && git status → clean`).
3. **Content parity**: on every runtime, `/ultra-init` produces the
   same `.ultra/tasks/tasks.json` schema and the same initial spec
   artifacts modulo runtime-specific paths.
4. **Privacy**: `npm pack --dry-run`, the Homebrew bottle, and the
   pip wheel all have zero entries under `teams/`, `memory/`,
   `sessions/`, `usage-data/`, `backups/`, `.ultra/`.
5. **Performance**: install completes in <30 s on a warm cache,
   <2 min cold.
6. **Coverage**: unit + integration tests ≥80% lines, 100% of the
   public API surface.

---

## 13. Out-of-scope for v0.1 (roadmap to v0.2)

| Item | Effort | Why deferred |
|------|-------|--------------|
| Copilot adapter | 2 days | Matches our downgrade pattern (tool name rewrite); deferred for focus |
| Cursor / Windsurf / Augment / Trae / Qwen / CodeBuddy / Cline / Antigravity / Kilo | 2–3 days each | Long tail; gauge user demand before investing |
| Worktree shim (`ultra-tools worktree`) | 2 days | Nice-to-have; Git already provides `worktree` natively on every runtime |
| TypeScript SDK that wraps Claude Agent SDK | 1 week | Not blocking multi-runtime distribution |
| TUI dashboard | 2 weeks | Distribution tool doesn't need a UI |
| Plugin marketplace integration | 1 week | Claude-specific; revisit if OpenCode adds one |

---

## 14. Decision log

Decisions made during planning that should not be re-litigated without
cause. Any change must cite new evidence.

| # | Date | Decision | Evidence |
|---|------|----------|----------|
| D1 | 2026-04-17 | Go with distribution-adapter route (A), not standalone agent (B) or hybrid SDK (C) | User selected; get-shit-done validates the pattern across 14 runtimes |
| D2 | 2026-04-17 | First-release runtimes: Claude + OpenCode + Codex + Gemini | User selected; covers ~80% of non-Claude CLI agent users as of 2026-04 |
| D3 | 2026-04-17 | Package name: `ultra-builder-pro-cli`, short form `ubp` | User selected |
| D4 | 2026-04-17 | Publish channels: npm + Homebrew + pip | User selected |
| D5 | 2026-04-17 | Destroy legacy git, re-init on main | User selected; legacy history archived in bundle |
| D6 | 2026-04-17 | Hooks stay in Python; Node shells out via `python3` | Rewriting 15 hooks in Node = 2–3 weeks of churn; all 4 runtimes can shell to Python |
| D7 | 2026-04-17 | Sentinel-block + manifest-file for config merging | Safer than text rewrites; matches get-shit-done's pattern |
| D8 | 2026-04-17 | `settings.json` trimmed to minimal merge template | Private data safety; user approved |
| D9 | 2026-04-17 | `README.md` rewrite deferred to Phase 5 | User approved; not blocking development |
| D10 | 2026-04-17 | `hooks/tests/` excluded from npm tarball | Matches get-shit-done's convention; keeps package lean |

---

## 15. Glossary

- **Adapter**: a runtime-specific module under `adapters/` that knows
  how to install and uninstall Hermes for one agent runtime.
- **AC (Acceptance Criterion)**: the verifiable condition that marks a
  task as done. Every task in §6 has one.
- **Baseline**: the diff-target used for the Claude diff-equal gate.
  Defined as "a freshly-installed Hermes from the pre-CLI git tag",
  not the user's current working tree.
- **CLI** (in this doc): `ultra-builder-pro-cli`, the npm package.
- **Downgrade**: replacing a Claude-only tool call with a portable
  equivalent via `ultra-tools`.
- **Gate**: a phase-end verification step that must pass before the
  next phase can start.
- **Runtime**: an AI coding agent environment — Claude Code, OpenCode,
  Codex CLI, or Gemini CLI in v0.1.
- **Sentinel block**: a marker-wrapped region (`UBP_MANAGED_START`/
  `END`) in a user-owned config file; allows clean uninstall.
- **Shim**: `ultra-tools/cli.cjs` — the Bash-callable bridge that lets
  agents on any runtime emulate Claude-only tool calls.
- **text_mode**: a branch in every command/agent that swaps
  `AskUserQuestion` for a text-based numbered menu. Used when
  `$UBP_TEXT_MODE=1` or when running on a non-Claude runtime.
- **Token (in frontmatter)**: `${UBP_CONFIG_DIR}` and friends, expanded
  at install time by `adapters/_shared/path-rewrite.js`.

---

*End of plan. Any change of scope, confidence, or timeline MUST be
reflected here with a dated entry in §14 before code lands.*
