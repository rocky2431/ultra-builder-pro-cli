# Design: ultra-builder-pro-cli (UBP v6)

## System

- One npm package, `ultra-builder-pro-cli`, Node.js 22 or newer, Git required, no runtime
  npm dependency. `bin/install.js` is the single entry point: it installs the host plugins
  (`--claude`, `--codex`, `--all`, `--doctor`, `--uninstall`) and dispatches every engine
  command (`status`, `gate`, `check`, `node done`, `milestone close`, `context`, `approve`,
  `retro`, `merge`, `drive`) to `engine/cli.cjs`.
- `engine/` is the deterministic engine, about 2000 lines in 17 CommonJS files, capped at
  2050 lines, 100 characters a line, `node:` and relative requires only. `engine/FORMATS.md`
  is its contract: file formats, states, gates, exit codes. Data ownership: `loading.cjs`
  reads every truth file and ledger into one project object; `states.cjs` computes states
  and the progress line; `checks.cjs` runs checks (detached process groups, grace on
  interrupt) and appends evidence; `plan.cjs` is the plan gate; `context.cjs` compiles
  briefs; `milestone.cjs` closes; `merge.cjs` the merge gate; `drive.cjs` the unattended
  loop; `ledger.cjs` the append-only JSONL files and locks; `git-state.cjs` the code
  fingerprint (every committed file except the engine-owned `.ultra/` records).
- `skills/ultra/SKILL.md` is the method (at most 395 lines) with `references/` read on
  demand; installed copies get the engine path in place of `__UBP_ENGINE_CLI__`.
  `adapters/claude.js`, `adapters/codex.js` and `adapters/_shared/` package one plugin per
  host, each with its own engine copy, managed-file ownership and a doctor.
  `hooks/session-start.cjs` prints the progress line and always exits 0.
- Tests: `npm run verify:release` runs every `node --test` suite under `tests/` and
  `adapters/_shared/tests/` (about 400 tests, 6–7 minutes on this machine with Node 25),
  then `npm audit --omit=dev`. Each milestone has its own acceptance file
  (`tests/engine-p1…p6.test.cjs`, `tests/method-p6.test.cjs`, `tests/v6-package.test.cjs`)
  and a check in `.ultra/checks.json`; `C-release` runs the whole release gate.
- Bookkeeping for this repository uses the repository's own engine, `node engine/cli.cjs`,
  since the M-P6 merge (the installed engine is older).

## Decisions

- The engine owns progress and mechanical gates; the host model owns judgment; only the
  Owner changes the Direction, approves reductions and releases a milestone (2026-10-31).
- Any code commit stales every check (whole-tree fingerprint). The engine-owned `.ultra/`
  files (truth files, ledger, `records/`, `design.md`) are outside that fingerprint; a spec
  or check edit stales only through its own hash (2026-11-02, 2026-11-12).
- A review blocks only on a broken `Done when`, the Direction, or a reproducible wrong
  behavior; a weaker-than-possible check goes to the Owner (2026-11-02).
- Multi-file engine code is written by Codex on its own branch and comes in through
  `ubp merge`; method text is written by the controller; reviews are a Claude reviewer
  subagent that wrote none of the code (2026-10-31, 2026-11-12).
- A check's `expect` names one test's `✔` line, never a pass count (2026-11-12).
- The milestone review's instructions live once, in `skills/ultra/references/review.md`
  (2026-11-12).
- Version 6.1.0-rc.0 until release; the README pins the published version (2026-11-12).

## Facts

- `node --test` reports a file with no test, or a name filter that matches nothing, as
  `ℹ pass 1` and exits 0 (Node 22.21.0 and 25.7.0, checked 2026-11-12).
- The spec reporter indents tests inside `describe` (Node 25.7.0, 2026-11-12).
- `process.kill(pid, 0)` succeeds on a zombie; on macOS, `kill` of a process group can
  return `EPERM` (engine code ignores `ESRCH` and `EPERM`).
- Open: why `tests/engine-p5.test.cjs` "an interrupted drive stops its writer and the
  writer's check" failed once in about 27 full runs (the inner check alive 4 s after the
  drive exited; that suite took 556 s instead of about 395 s). Not reproduced under CPU load,
  two concurrent full suites twice, or about 950 targeted rounds on six workers; `gone()` now
  prints the process's `ps` line when it gives up (2026-11-12).
- A glob that matches no test file gives `ℹ pass 0` and exit 0 under `node --test`
  (A7 round 2, Node 25.7.0, 2026-11-12).
