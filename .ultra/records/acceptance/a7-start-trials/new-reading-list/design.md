# Design: reading-list command-line tool

## System

New project. On 2026-11-12 the repository was empty: no commit, no file, no remote. Nothing
is built, run or tested yet, and there are no modules. The specification and plan will say
how it is built, run and tested; this section will then describe the code as it stands.

Machine the work runs on (survey, 2026-11-12): macOS (Darwin 24.6.0), Node.js v25.7.0,
npm 11.10.1, Python 3.13.5.

## Decisions

- Node.js, built-in modules only: no npm dependency. Tests use the built-in `node:test`
  runner (ruling 2026-11-12).
- The list is one JSON file a person can read and fix by hand. Default path
  `~/.reading-list.json`, overridden by the environment variable `READING_LIST_FILE`. Every
  write goes to a temporary file in the same directory, which is then renamed over the old
  file, so a crash never leaves half a list (ruling 2026-11-12).
- One milestone, M1: add, mark read, list unread and the README, with one journey
  (ruling 2026-11-12).

## Facts

Each fact was settled on 2026-11-12. "Probe" means a throwaway script run in a temp
directory outside the repository, which was deleted afterwards.

1. The repository had no commit and no remote (`git log`, `git remote -v`).
2. Node.js v25.7.0 has `util.parseArgs` (probe: `typeof` is `function`). So the tool can
   parse its arguments with no dependency.
3. `os.homedir()` follows `HOME` on this machine (probe: `HOME=/tmp/fakehome` gives
   `/tmp/fakehome`). So a check can test the default data-file location by pointing `HOME`
   at a temp directory, without touching the Owner's real list.
4. `node --test --test-reporter=spec` ends its output with count lines, for example
   `ℹ tests 2` and `ℹ pass 2`. With no test file at all it prints `ℹ pass 0` and exits 0
   (probe).
5. **On Node v25.7.0, `pass [1-9]` does not prove that tests ran** (probe). A
   `--test-name-pattern` that matches no test still prints `ℹ tests 1`, `ℹ pass 1` and
   exits 0, because the file itself counts as one passing test. A test file with no
   `test()` call does the same. A check's `expect` must therefore name what ran: for
   example, a `✔ <test name>` line from the spec reporter for each test the check relies
   on, or the file's exact test count. A plain `pass [1-9]` is not enough. The engine's
   FORMATS.md example says `pass [1-9]` is enough, so this is a method candidate.
6. npm's global prefix on this machine is under the user's home (`~/.local`), and its `bin`
   directory is writable (probe: `npm prefix -g` and a write test). So `npm install -g .` or
   `npm link` should install a command without `sudo`. Neither command was run.
7. Renaming a file over an existing file on the same file system replaces it atomically:
   readers see the old file or the new one, never a mix. Source: the POSIX `rename()`
   specification, recalled from knowledge, not fetched or probed.

Open unknowns:

- The oldest Node.js version the tool works on. Only v25.7.0 was checked. This decides
  what the README tells a new user to install. Settle it at the spec step against the
  Node.js documentation for the APIs the tool uses, or have the README name only the
  version that was tested.
