# N-P6-engine handoff

## Delivered interfaces

- `context <node>` now places `## Project` between the milestone line and requirements.
  It includes shared specification text in file order, retaining internal empty lines,
  followed by `### .ultra/design.md` and the design read through the handoff reader.
  Missing or empty design text is `No design written.` Project knowledge is never omitted
  to meet the budget; the refusal hint names `.ultra/design.md`.
- `.ultra/design.md` is excluded from code dirtiness and fingerprints. The brief's first
  rule reserves it to the planner. Shared-text hashing retains its previous blank-line
  normalization, so the display change does not change evidence semantics.
- `status --json` adds `closed_recheck`. A stale historical closed requirement belongs
  there only when every covering check's latest outcome passed; other non-green closed
  requirements remain in `closed_not_green`. The line prints nonzero counts as `未绿`
  then `待复核`.
- `milestone close` accepts a review only at the normalized path
  `.ultra/records/milestones/<id>-review.md`. An accepting review elsewhere produces
  `review-not-for-milestone`; readability and verdict checks keep their earlier priority.
- `drive --json` writes the run, completed actions, stopping problems and stop line to
  stderr at the same points as text mode, keeping stdout for the final JSON.
- `engine/FORMATS.md` documents each change. No dependencies or installation changes were
  introduced. The engine totals 2011 lines against the 2050-line limit.

## Verification

- Parent `0d88c190259cfb00035f2d947935fa9de91b647d`:
  `node --test --test-reporter=spec tests/engine-p6.test.cjs`, exit 1,
  `tests 7`, `pass 0`, `fail 7`.
- Implementation `ea4279e0b00a338126a2d5bfe662d976d2b45616`:
  `ubp check C-engine-p6`, exit 0, `C-engine-p6: pass (exit-0)`,
  `tests 7`, `pass 7`, `fail 0`, evidence `dirty: false`.
- `ubp check`, exit 1, recorded the following outcomes. Together with the targeted P6
  run, all 321 engine tests passed; every evidence record has `dirty: false`.

  | Check | Outcome | Exit | Tests passed / failed |
  |---|---|---|---|
  | C-engine | pass | 0 | 96 / 0 |
  | C-engine-p2 | pass | 0 | 86 / 0 |
  | C-engine-p3 | pass | 0 | 26 / 0 |
  | C-engine-p4 | pass | 0 | 60 / 0 |
  | C-engine-p5 | pass | 0 | 46 / 0 |
  | C-release | fail | 1 | 363 / 24 |
  | C-package | fail | 1 | 11 / 4 |
  | C-method-p6 | fail | 1 | 1 / 8 |

  The deciding pass lines are `<check>: pass (exit-0)` for each engine check above.
  C-package's first failure is `after a drive stop the method puts truth files back before
  it commits the ledger`, with `ENOENT` for `skills/ultra/references/drive.md`; its other
  failures cannot load `js-yaml`. C-method-p6's first failure is `every drive stop and merge
  refusal is handled in a reference the Skill names`. C-release's first error is
  `Error: Cannot find module 'js-yaml'`; its 24 failures also include the unfinished method
  and `getaddrinfo ENOTFOUND registry.npmjs.org` in the temporary tarball-install test.
  `npm run verify:release` therefore did not reach the production dependency audit.
- `node engine/cli.cjs context N-P6-engine --json`, exit 0 on this repository's real data:
  `ok: true`, `bytes: 4490`, `omitted: []`, `problems: []`, with the Project section,
  design section and first rule naming the design.
- `npm pack --dry-run --json`, exit 0: 37 entries, including all 17 engine modules and
  `engine/FORMATS.md`.
- `node bin/install.js --all --global --doctor --json`, exit 1 before diagnosis:
  `Fatal: Cannot find module 'js-yaml'`. Nothing was installed to work around this.
- Protected acceptance files, spec/checks/plan and the milestone/approval/plan-log ledgers
  are unchanged. `git diff --check` and the line-count/line-width check passed before the
  implementation commit.

## What dependent nodes must know

The method node can rely on the Project section and planner ownership of the design.
Reviews intended for closure must use the exact milestone filename above. Watchers should
read stderr for progress and parse only stdout as the JSON result. The installed engine
used for project bookkeeping was not upgraded by this node; the acceptance tests exercise
the repository engine directly.

## Noticed and left unchanged

- Method references and packaging content belong to N-P6-method. This node does not edit
  them or their checks; the mission expects C-package, C-method-p6 and C-release to remain
  red until the parallel node is available.
- Missing `js-yaml` prevents the host doctor from loading adapters in this clone. The
  engine itself has no external dependency, and installation is outside this mission.
- When every milestone is closed, the last milestone remains the current one and is
  represented by current counts, not duplicated in historical closed counts.
- Design writer ownership is stated by the brief and ordinary scope rules; this change
  does not add the design to drive's protected truth snapshot. Drive retains its stricter
  requirement that non-ledger project metadata be committed before starting.
- Closure checks the review's path and accepting verdict; it does not authenticate the
  reviewer or prove that review text was not copied.

## Behavior not directly pinned by registered checks

- Exact display normalization of shared text between or after requirement blocks, beyond
  the Direction/Interface examples; shared hash normalization has existing coverage.
- Both historical closed counters being nonzero at once and their displayed order;
  mixed latest outcomes across multiple checks covering one closed requirement.
- Unsafe-file cases specifically at the design pathname; the shared handoff record reader
  has existing boundary coverage.
- Missing or non-accepting reviews at a noncanonical path; the existing error priorities
  are retained, while P6 checks accepting wrong paths and a missing canonical review.
- JSON drive progress being observable before process exit, and every action/problem
  variant on stderr; P6 checks the successful writer/check/stop event sequence.

## Unfinished

No engine implementation or required engine regression remains unfinished. The three
remaining check failures above await the parallel method node and dependency/network
availability. Release acceptance and host installation are outside this node. The engine
records node completion separately after this handoff is committed.

## Attempt 2 — missing-spec usage error

### Change and interface

`projectRoot` now rejects a Git repository with a commit but no `.ultra/spec.md` before
loading truth files or dispatching an action. Every valid engine command exits 2 with
`<root> has not started: .ultra/spec.md does not exist. Start it with the ultra Skill.`
on stderr, no stdout or `ENOENT`, and no writes. The existing missing-root, non-Git and
no-commit errors retain their priority. `engine/FORMATS.md` documents the error beside
those usage errors. No command, option, ledger format or dependency was added.

### Verification

The commands below used the controller-provided bookkeeping copy. The acceptance suites
exercise this repository's engine directly.

- Baseline `56e1e0dbef1b6a3e6295d1bdcf3204f48b273f13`:
  `ubp check C-engine-p6`, exit 1, `C-engine-p6: fail (exit-1)`,
  `tests 12`, `pass 11`, `fail 1`, evidence `dirty: false`. The sole failure was
  `a project without .ultra/spec.md has not started, and every command says so`;
  its deciding error was `status: .ultra/spec.md: ENOENT: no such file or directory`.
- Implementation `387f0f0`:
  `ubp check C-engine-p6`, exit 0, `C-engine-p6: pass (exit-0)`,
  `tests 12`, `pass 12`, `fail 0`, evidence `dirty: false`.
- Required regression command:
  `ubp check C-engine C-engine-p2 C-engine-p3 C-engine-p4 C-engine-p5`, exit 0.
  Each deciding line was `<check>: pass (exit-0)`:

  | Check | Exit | Tests passed / failed |
  |---|---|---|
  | C-engine | 0 | 96 / 0 |
  | C-engine-p2 | 0 | 86 / 0 |
  | C-engine-p3 | 0 | 26 / 0 |
  | C-engine-p4 | 0 | 60 / 0 |
  | C-engine-p5 | 0 | 46 / 0 |

  Including P6, all 326 engine tests passed. The six passing records have `dirty: false`
  and the same code fingerprint. The baseline failure and all six passes are committed
  in `.ultra/ledger/evidence.jsonl`; raw logs were archived outside the repository.
- `node engine/cli.cjs status --json`, exit 0 against this project's current files:
  all six selected engine checks are `green`, with `dirty: false`.
- An external, temporary CLI probe exercised all ten commands in text and JSON modes:
  exit 0, `20/20 command variants passed`. Each variant exited 2 with the exact message
  and empty stdout; no `.ultra` directory was created, and Git status including ignored
  paths stayed empty. The probe fixture was removed.
- Source limits: 2015 of 2050 engine lines, maximum line width 100, no new imports.

### Noticed and left unchanged

- The other P6 implementations and all acceptance files are unchanged. The expanded
  12-case P6 suite already pins shared-text normalization between and after requirement
  blocks, mixed latest pass/fail and unknown outcomes, the last closed milestone staying
  current, and drive stop problems on stderr. The corresponding gaps listed in the first
  handoff are superseded by those tests.
- Argument validation and the restrictions inside `UBP_DRIVE` still precede project
  loading; the missing-spec behavior applies to valid command invocations.
- C-package, C-method-p6 and C-release were neither rerun nor repaired, as this attempt's
  mission excludes them. No dependency was installed. No gate, approval, closure or node
  completion command was run for this project.

### Behavior not pinned by registered checks

- The missing-spec acceptance test names `status`, `status --json`, `check`, `gate` and
  `context`. The remaining commands and JSON combinations passed the external probe but
  have no persisted missing-spec regression assertion.
- Simultaneously nonzero historical closed counters and their displayed order, and drive
  progress arriving before process exit, remain unpinned by the registered P6 suite.
- The design-path record-reader and non-accepting review boundary gaps listed in the
  first handoff remain unchanged.

### Remaining work

No engine repair or required regression remains. The controller, after merging, owns node
completion; this attempt deliberately leaves that action to it. The three excluded checks
provide no new release or method acceptance evidence from this attempt.
