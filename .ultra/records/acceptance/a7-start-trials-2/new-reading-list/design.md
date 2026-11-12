# Design: reading list

What the project knows as of 2026-11-12 (Start: survey, investigation and interview done;
the spec is not written yet). Why each decision was made: `.ultra/rulings.md`. The Owner's
words: `.ultra/records/interview.md`; every answer there was given by proxy.

## System

- Nothing is built yet. The repository holds one empty commit (`126c021`, 2026-11-12): no
  code, build, tests or documentation to survey, so there is no existing suite to register
  as an invariant and no existing behavior to characterize.
- Toolchain on the Owner's machine (macOS, Darwin 24.6.0): see Fact 1. The UBP engine
  itself runs on Node.
- Build: none. Run: `node` on the entry script, or the command `npm` installs from the
  project's `bin`. Test: `node --test --test-reporter=spec`. This section is rewritten when
  the first node lands.

## Decisions

- 2026-11-12 Runtime: Node.js standard library only. No npm dependency, no build step;
  tests use the built-in `node:test` runner with `--test-reporter=spec`.
- 2026-11-12 Storage: the whole list is one JSON file the user can open and back up;
  default `~/.reading-list.json`, overridden by the environment variable
  `READING_LIST_FILE` (also how each check gets its own file). Every change is written to a
  temporary file in the same directory, then `rename`d over the list (Fact 4), so an
  interrupted command leaves the old list or the new one, never a half-written file.
- 2026-11-12 No network access, no server, no background process.

## Facts

Settled (source, date):

1. Toolchain: Node v25.7.0, npm 11.10.1, Python 3.13.5, Git 2.50.1 (`--version` of each,
   2026-11-12).
2. `node --test --test-reporter=spec` (Node v25.7.0) prints a passing test as
   `✔ <name> (<duration>ms)`; a test inside `describe` is indented two spaces per level. A
   glob that matches no file exits 0 and prints `ℹ pass 0`. So a check's `expect` must match
   a named test line (`^\s*✔ <name>`), never the exit code or a pass count alone. (Probe in a
   scratch directory, 2026-11-12.)
3. `new URL()` (Node v25.7.0) accepts `javascript:alert(1)`, `mailto:a@b.c`,
   `file:///etc/passwd`, `ftp://x.org/f` and `http:example.com` (→ `http://example.com/`);
   throws `ERR_INVALID_URL` for `example.com`, `www.example.com/x`, `https://` and
   `https://exa mple.com`; trims surrounding spaces; lowercases scheme and host
   (`HTTPS://Example.COM/Path?q=1#frag` → `https://example.com/Path?q=1#frag`); encodes a
   space in the path (`/a b` → `/a%20b`). Parsing alone is therefore no link rule: the
   scheme must be checked. (Probe with `node -e`, 2026-11-12.)
4. macOS `rename(2)`: "If new exists, it is first removed"; old and new "must reside on the
   same file system"; it "guarantees that an instance of new will always exist, even if the
   system should crash in the middle of the operation". (`man 2 rename`, 2026-11-12.)

Open unknowns:

- Every interview answer was written by the assistant for the Owner (`proxy: yes`); none is
  Owner validation. The Owner confirms or corrects them at Start step 4 (Confirm).
- Not investigated, because nothing inside the boundary depends on them: two commands
  writing the list at the same moment (one person, one terminal), Windows behavior, very
  large lists.
