# Unattended drive (`ubp drive`)

Read this before the first drive of a session. `ubp` is the engine command `SKILL.md`
defines. The drive runs the node loop and the milestone review for you; it stops where a
person must decide, and every stop below says what to do next.

## Starting it

Give every node a `scope` that holds no check file, commit everything, and start
`ubp drive --writer <cmd> --reviewer <cmd> --json` in the background, then wait for its
completion notice: a drive runs for many writers, and a foreground call is bounded by the
host's command timeout (at most 10 minutes in Claude Code).

- In Claude Code, run `mkdir -p .ultra/.runtime`, start the drive with Bash
  `run_in_background` and `2> .ultra/.runtime/drive.err`, and watch that file with the
  Monitor tool: `tail -n +1 -F .ultra/.runtime/drive.err | grep --line-buffered '^drive: '`
  turns each event line into a notification, so you can relay it at once. A monitor ends at
  its timeout (at most 30 minutes): re-arm it while the drive runs.
- On a host without background commands, run `mkdir -p .ultra/.runtime`, start
  `nohup <drive command> > .ultra/.runtime/drive.json 2> .ultra/.runtime/drive.err &`, tell
  the Owner it is running and stop: a later session sees it in `ubp status` and, once `drive`
  is null, reads `drive.json`, or `drive.err` when the drive printed no result.

The writer command hands an agent `$UBP_BRIEF` and tells it to call the engine as
`eval "$UBP <args>"` (a login shell can put another `ubp` first on `PATH`). Headless Claude
Code examples are `docs/examples/drive/claude-writer.sh` and `claude-reviewer.sh` in the
ultra-builder-pro-cli package and repository; `--writer` takes a shell command line, so quote
a path that holds a space (`--writer "'<path>'"`).

## Reporting progress

With `--json`, stdout holds only the final JSON and stderr has one line per event:
`drive: run <id>` first, then `drive: <action> <subject>: <result>` for each check, gate,
context, writer and reviewer step (a writer or reviewer line ends with its exit code), and at
the end each problem as `<code>: <message> — <hint>` and `drive: stop <reason>`. Relay each
writer line to the Owner as it arrives, with the line `ubp status` prints; on a host that only
tells you when the drive ends, read the stderr file at each check-in and relay what is new.

## When it stops

When the drive stops, first put back what the stop names: each truth file a `truth-touched`
problem names to its content at HEAD (deleted when HEAD has none; `.ultra/ledger/` holds
three, `milestones.jsonl`, `approvals.jsonl` and `plan-log.jsonl`), what the reviewer changed
on `reviewer-changed-tree`, and the branch itself on `history-rewritten` (below). Only then
commit the records the drive left in `.ultra/ledger/` (records never dirty the tree, so the
drive does not), and act on `stop`:

- `milestone-gate`: with `accept`, go to "Milestone gate" step 1; with `revise`, its revise
  path; without a reviewer, have the milestone reviewed first.
- `truth-touched`, `out-of-scope`, `check-touched`, `ratchet-broken`, `node-not-green`:
  undo the attempt in a new commit (a truth line it committed goes with it). A completion it
  recorded stays, so take that node through the node loop by hand until its checks are green
  before driving on.
- `history-rewritten`: the attempt rewrote commits, which a new commit cannot undo. Find
  the HEAD before the attempt in `git reflog`, check nothing after it needs keeping, and
  reset the branch to it.
- `writer-left-dirty`, `dirty-tree`: clear any assume-unchanged or skip-worktree flag
  (`git ls-files -v` shows them), undo any change to the repository's Git `config`,
  `config.worktree` or `info/exclude`, then commit what belongs to the node and discard the
  rest.
- `attempts-exhausted`, `writer-budget`: "Escalation" (stalled); the writers' logs are in
  `.ultra/.runtime/drive/<run>/`.
- `review-exists`: keep the old review as `<milestone>-review-<n>.md`; `review-invalid`,
  `reviewer-changed-tree`: fix the reviewer command and restore what it changed.
- `scope-missing`, `plan-gate`, `brief-over-budget`, `checks-not-green`, `blocked`: the
  matching planner step.
- `all-done`: every milestone is closed; report the status line to the Owner and ask whether
  to plan another milestone.
- `drive-running`: another drive holds this tree; this one started nothing. Follow the
  status table's first row. When `ubp status` shows no `drive`, the lock holds no live pid
  (a drive killed while taking it): remove `.ultra/.runtime/drive.lock` and start the drive
  again. Never remove it while its pid runs a drive.

After any stop, fold what the finished nodes settled into `.ultra/design.md` as in Node loop
step 4 before driving on.
