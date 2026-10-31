# UBP v6 engine: truth files and CLI contract

The engine is deterministic code. It reads the project's truth files, runs registered
checks, records evidence, and computes progress. The model writes intent, specification
and plan; it never writes progress, evidence or completion records by hand.

Plan of record: `thinking/back-to-essentials-20261030/RESULT.md` (§3.1, §3.3–3.5, §4, §5 P1).

## Layout

All paths are relative to the project root: the top level of the Git work tree, which
contains `.ultra/`.

| Path | Layer | Written by |
|---|---|---|
| `.ultra/spec.md` | L1 behavior specification | planner (model); Owner confirms |
| `.ultra/checks.json` | acceptance check registry | acceptance author (model) |
| `.ultra/plan.json` | L3 milestones and task graph | planner (model) |
| `.ultra/rulings.md` | ruling log | any role, append only |
| `.ultra/ledger/evidence.jsonl` | check runs | engine only |
| `.ultra/ledger/plan-log.jsonl` | plan snapshots and changes | engine only |
| `.ultra/ledger/nodes.jsonl` | node completions | engine only |
| `.ultra/ledger/milestones.jsonl` | milestone closures | engine only (writer arrives in P2) |
| `.ultra/.runtime/checks/<run>.log` | full check output | engine; disposable |
| `.ultra/.runtime/engine.lock` | writer lock | engine; disposable |
| `.ultra/.runtime/engine.lock.break` | serializes breaking a dead writer's lock | engine; disposable |

Missing ledger files mean "no records". Missing `rulings.md` means "no rulings".
`spec.md`, `checks.json` and `plan.json` are required. `.ultra/.runtime/` is never committed.

The engine-owned paths are `.ultra/spec.md`, `.ultra/checks.json`, `.ultra/plan.json`,
`.ultra/rulings.md`, `.ultra/ledger/` and `.ultra/.runtime/`. Everything else, including
other files under `.ultra/` such as check scripts, is code (see "Git state").

The ledgers are committed project history, like the truth files. When two branches append
to the same ledger, Git's union merge keeps both sides' lines; projects add this line to
`.gitattributes`:

```
.ultra/ledger/*.jsonl merge=union
```

Line order in a ledger therefore carries no meaning except as a tie-breaker (see "Ledger
records").

## Markdown rules

`spec.md` and `rulings.md` are read line by line:

- A fence opens on a line indented by at most three spaces that starts with at least three
  backticks or at least three tildes. For a backtick fence, the rest of the line must not
  contain a backtick; otherwise the line is ordinary text (inline code such as
  ```` ```npm test``` must print ````). A fence closes on a line indented by at most three
  spaces that holds at least as many of the opening character and otherwise only
  whitespace. Lines inside a fence are ordinary text.
- A fence still open at the end of the file is an error: `spec.md` is malformed, and in
  `rulings.md` it is a `malformed-ruling` problem. Either message names the opening line.
- Headings are ATX headings outside fences: a line indented by at most three spaces that
  starts with `#` or `##` followed by a space, a tab or the end of the line. Setext
  underlines (`---`, `===`) are ordinary text.
- Messages about a line use the form `<file>:<line>: <problem>`, with physical 1-based
  line numbers.

## `.ultra/spec.md` — requirements

A requirement starts at a level-2 heading `## REQ-<id> <title>`. `<id>` matches
`[A-Za-z0-9][A-Za-z0-9._-]*`. The block runs until the next level-1 or level-2 heading, or
the end of the file. Other level-2 headings (for example `## Notes`) are not requirements
and end the previous block.

Requirement text: the block's lines (heading included) after CRLF→LF, with trailing
whitespace removed from every line and leading/trailing empty lines dropped, joined with
`\n`. The requirement hash is the SHA-256 hex of that text in UTF-8. Any other edit to
the block changes the hash.

Malformed: a level-2 heading starting with `REQ-` whose id does not match the pattern; a
duplicate id; a fence still open at the end of the file; a near-miss heading, that is a
line outside fences, indented by at most three spaces, made of one or more `#`, then any
whitespace (Unicode whitespace included) or none, then `REQ-`, which is not a requirement
heading (for example `### REQ-3`, `##REQ-4`, `##　REQ-5` with an ideographic space), so
these mistypings cannot drop a requirement from the count. Ceiling: a heading that does
not contain `REQ-` at all, such as `## Req-7`, `## REQ 8` or `## REQ_9`, is an ordinary
section and is not counted.

## `.ultra/checks.json` — check registry

```json
{
  "version": 1,
  "checks": [
    { "id": "C-add", "covers": ["REQ-001"], "run": "node --test test/add.test.js",
      "timeout_sec": 120, "expect": "pass [1-9]" }
  ]
}
```

- `id`: unique, `[A-Za-z0-9][A-Za-z0-9._-]*`.
- `covers`: non-empty array of requirement ids. This is the only link between checks and
  requirements.
- `run`: non-empty shell command (see "Running a check").
- `timeout_sec`: optional positive integer, at most 86400; default 600.
- `expect`: required, non-empty regular expression source (JavaScript, flags `mu`) that
  does not match the empty string (`^`, `x*` and `(?:)` are malformed). A zero exit counts
  as a pass only when the output tail matches it. It is the acceptance author's statement
  of what proves that the check really ran, for example `pass [1-9]` for `node --test`,
  so a test filter that matched nothing never passes.

Check fingerprint: SHA-256 hex of `JSON.stringify([run, effectiveTimeoutSec, expect])`.
`covers` is not part of the fingerprint; requirement links are tracked per requirement.

Malformed: invalid JSON, wrong types, missing fields, duplicate id, empty or invalid
`expect`, an `expect` that matches the empty string.

## `.ultra/plan.json` — milestones and nodes

```json
{
  "version": 1,
  "milestones": [
    { "id": "M1", "title": "Core list", "requirements": ["REQ-001", "REQ-002"] }
  ],
  "nodes": [
    { "id": "N-01", "milestone": "M1", "title": "Add items", "covers": ["REQ-001"],
      "depends": [], "scope": ["src/items/"] }
  ]
}
```

- Milestone and node ids: unique within their kind, `[A-Za-z0-9][A-Za-z0-9._-]*`.
- Array order is plan order. `requirements`, `covers` and `depends` are arrays of
  strings; `scope` is an optional array of path prefixes (recorded now, enforced later).

Malformed: invalid JSON, wrong types, missing fields, duplicate ids.

## `.ultra/rulings.md` — ruling log

Every line outside fences whose first non-space characters are a list marker (`-`, `*` or
`+` followed by a space) is a ruling entry. An entry must be unindented and have exactly
this form; other lines are free text:

```
- 2026-10-31 L1 裁决：<decision> — 因为 <reason> — 如果判断错了，代价是 <cost>
```

The layer is one of `L0`–`L4`. The separators are an em dash with one space on each side.

## Git state

- Code fingerprint: SHA-256 hex of two outputs concatenated, each record keeping its
  terminating NUL: `git ls-tree --full-tree -z HEAD` without the record whose path is
  `.ultra`, then `git ls-tree --full-tree -z HEAD -- .ultra/` (the entries directly
  inside `.ultra/`) without the records of engine-owned paths. Tree ids commit to their
  contents, so the fingerprint covers every committed file except the engine-owned ones;
  it does not depend on Git's path-quoting settings. Edits to engine-owned files never
  invalidate evidence; any committed change elsewhere, including a check script kept under
  `.ultra/`, does, which forces full regression (the ratchet).
- Dirty: `git --no-optional-locks status --porcelain -z --untracked-files=normal`
  reports a path that is neither an engine-owned path nor inside one (for a rename or
  copy, either path). An untracked `.ultra/` directory as a whole is therefore dirty;
  the engine's own untracked ledgers and runtime files never are.
- The engine never limits the size of Git's output: a top-level directory with tens of
  thousands of entries, or as many modified files, must work.
- Usage errors (exit 2), each with its own message and hint: `--root` does not exist; the
  directory is not inside a Git work tree (hint: `git init`); the repository has no commit
  (hint: commit the code first).

## Running a check

- The command runs as `/bin/sh -c <run>` in the project root, inherits the engine's
  environment, and gets its own process group.
- When the shell exits, the engine kills that process group (a group that is already gone
  is fine), so background children never outlive the check. At the timeout it kills the
  group the same way.
- Standard input is empty. Standard output and standard error both go straight to the log
  file, through one open file so their interleaving is kept. The engine reads no pipe, so
  a descendant that left the group cannot keep the engine waiting, and the engine's peak
  memory does not grow with the size of the output. Ceiling: such a descendant may keep
  appending to the log after the engine has read it.
- After the shell exits or is killed, the engine reads the last 4 MiB of the log (the
  output tail); `expect` and `error_line` are evaluated on it.
- `expect` is evaluated with a limit of 5 seconds, so a pathological pattern cannot hang
  the engine; reaching the limit gives outcome `unknown` with reason `expect-timeout`.
- Evidence is dirty when the tree is dirty before or after the run, or when the code
  fingerprint after the run differs from the one before it.
- When the engine receives SIGINT, SIGTERM or SIGHUP during a run, it kills the running
  check's process group, records nothing for that run, and exits 130, 143 or 129
  respectively. Ceiling: an engine killed with SIGKILL cannot clean up, and its check's
  process group keeps running until it ends by itself.

## Ledger records (JSON Lines, append only)

Reading: every non-empty line must be a valid record of its file. A line that is not
makes every command exit 2 with `<file>:<line>: malformed ledger record` and a hint to
remove or repair that line; the engine never rewrites earlier lines. One exception: when a
file does not end with a newline and its last line is not a valid record, that line is an
incomplete write. It is ignored, reported in `warnings`, and removed (the file is truncated
after its last newline) before the engine's next append to that file.

`at` is ISO-8601 UTC with milliseconds (`YYYY-MM-DDTHH:MM:SS.mmmZ`), so string order is
time order; a record whose `at` has another form is malformed. When the engine appends a
record, its `at` is the current time or, when that is not later than the greatest `at`
already in that file, 1 ms after it; the engine holds the lock while it reads that file
and appends. A clock that runs fast or steps back therefore cannot make a later record
look older than an earlier one in the same file. Ceiling: the floor is per file, so a
comparison across files can still be skewed; the one that matters is the plan-change
count, which compares plan-log times with closure times. It only bites once closures are
written (P2), and P2 takes the floor across all four ledgers.

Latest record: the record with the greatest `at`; ties go to the later line.

Evidence (`evidence.jsonl`), one per executed check:

```json
{"v":1,"run":"<unique id>","check":"C-add","at":"<ISO time>","outcome":"pass|fail|unknown",
 "reason":"<see below>","exit_code":0,"duration_ms":812,"code":"<code fingerprint>",
 "dirty":false,"check_fp":"<check fingerprint>","reqs":{"REQ-001":"<requirement hash>"},
 "log":".ultra/.runtime/checks/<run>.log","error_line":null}
```

| Observation | outcome | reason |
|---|---|---|
| exit 0, output tail matches `expect` | pass | `exit-0` |
| exit 0, output tail does not match `expect` | unknown | `expect-unmet` |
| exit 0, `expect` reached its time limit | unknown | `expect-timeout` |
| exit 126 or 127 | unknown | `not-runnable` |
| other non-zero exit | fail | `exit-<n>` |
| killed by the timeout | unknown | `timeout` |
| killed by another signal | unknown | `signal-<NAME>`, for example `signal-SIGTERM` |
| the shell could not be started | unknown | `spawn-error` |

`reqs` holds the current hashes of the covered requirements that exist in the spec.
`error_line` is null on pass; otherwise the first line of the output tail that matches
`/^\s*(?:✖|not ok\b|FAIL(?:ED)?\b)|\b(?:[A-Z][A-Za-z]*)?Error\b/u`, else the last non-empty
line, cut to 200 characters.

Plan log (`plan-log.jsonl`), written by a passing gate:

```json
{"v":1,"type":"baseline|change|removed","milestone":"M1","at":"<ISO time>",
 "requirements":{"REQ-001":"<hash>"},"nodes":["N-01"],
 "checks":{"C-add":{"fp":"<check fingerprint>","covers":["REQ-001"]}},
 "diff":{"added":[],"removed":[],"modified":[],"nodes_added":[],"nodes_removed":[],
         "checks_added":[],"checks_removed":[],"checks_modified":[]}}
```

A milestone's snapshot is its requirement ids mapped to current hashes; its node ids,
sorted; and every check that covers at least one of its requirements, mapped to the
check's fingerprint and the sorted ids of the milestone's requirements it covers. So
removing a check, narrowing what it covers or editing it is a plan change of every
milestone it touches: it is recorded with its diff, and until then the gate is `stale`.
`diff` is present on `change` and `removed`; every id list in it is sorted in code-unit
order (JavaScript's default sort). What the gate records is defined under "Plan gate".

Node completion (`nodes.jsonl`): `{"v":1,"node":"N-01","at":"…","code":"…","reqs":{"REQ-001":"…"},"runs":["…"]}`.

Milestone closure (`milestones.jsonl`): `{"v":1,"milestone":"M1","at":"…"}`.

## States

A check's latest record decides its state; an older record never stands in for a newer
one. A check's `last_run` is the `run` of its latest record, or null.

Check state, and requirement-check pair state, evaluated in this order:

1. No record → `unknown` with reason `not-run`. Latest record dirty → `unknown` with
   reason `dirty-run` (a failure observed on a dirty tree must not leave an older pass
   standing).
2. Stale reasons are collected: `check-changed` (fingerprint differs), `code-changed`
   (code fingerprint differs), `req-changed:<id>` (a covered requirement's hash differs
   from, or is missing in, the record's `reqs`). For a pair, only the pair's own
   requirement can contribute `req-changed`. Any stale reason → `stale`.
3. Otherwise the outcome: pass → `green` with no reasons; fail → `red` and unknown →
   `unknown`, each with the record's `reason` as its only reason.

Requirement state: no covering check → `uncovered`. Otherwise over its pairs: any `red`
→ `red`; else any `unknown` → `unknown`; else any `stale` → `stale`; else `green`.
Only `green` counts as done; `unknown` and `uncovered` never do.

Node state:

- `done`: a completion record exists and every covered requirement's current hash
  equals the hash in the node's latest record.
- `stale`: a completion record exists but some covered requirement's hash differs or is
  missing (reasons `req-changed:<id>`).
- `ready`: no completion record and every dependency is `done`.
- `blocked`: otherwise.

A node is actionable when it is `ready`, or `stale` with every dependency `done`.

Closed milestones: those with a closure record. Current milestone: the first milestone in
plan order that is not closed; if all are closed, the last milestone; with no milestones,
none.

Next item, in this order:

1. the first actionable node, in plan order, among the nodes of the closed milestones and
   of the current milestone;
2. `检查` when some requirement of those milestones is not green;
3. `里程碑门` when there is a current milestone and every one of its nodes is done;
4. otherwise `无（受阻）`.

Closed not green: the number of requirements of closed milestones other than the current
milestone whose state is not green.

Plan changes of the current milestone: the number of `change` and `removed` records, of
any milestone, whose `at` is later than the greatest `at` in `milestones.jsonl` (all
such records when there is no closure). Renaming or shrinking the current milestone, or
changing a closed one, therefore never resets the count.

Gate state: `fail` when the plan gate reports any problem; otherwise `stale` when a gate
run would record something; otherwise `pass`.

## Progress line

```
<M> · <green>/<total> 绿[ · <n> 红][ · <n> 过期][ · <n> 未知][ · <n> 未覆盖] · 下一项 <next> · 本里程碑计划变更 <k> 次[ · 已关闭里程碑 <n> 项未绿][ · 工作区未提交][ · 计划门未通过| · 计划门待重跑]
```

Counts cover the current milestone's requirements that exist in the spec; the five state
counts always sum to the total. A bracketed count appears only when it is non-zero;
`工作区未提交` appears when the tree is dirty now; the gate segment appears when the gate
state is not `pass`. With no current milestone, `<M>` is `无`.

## Plan gate

Problems are objects `{ "code", "message", "hint" }`; the hint says how to fix it.

| code | condition |
|---|---|
| `unknown-requirement` | a milestone, node or check names a requirement absent from the spec |
| `unplanned-requirement` | a spec requirement is in no milestone |
| `requirement-in-multiple-milestones` | a requirement is in more than one milestone |
| `empty-plan` | `plan.json` has no milestones |
| `empty-milestone` | a milestone has no requirements or no nodes |
| `empty-node` | a node covers no requirement |
| `uncovered-requirement` | a planned requirement has no covering check |
| `requirement-without-node` | a planned requirement is covered by no node of its milestone |
| `unknown-milestone` | a node names a milestone that does not exist |
| `node-outside-milestone` | a node covers a requirement of another milestone |
| `unknown-dependency` | a node depends on a node that does not exist |
| `dependency-on-later-milestone` | a node depends on a node of a later milestone |
| `dependency-cycle` | the dependency graph has a cycle |
| `malformed-ruling` | a ruling entry in `rulings.md` does not have the ruling form, or a fence there is never closed |

What a passing gate records, in this order:

1. For each milestone in `plan.json`, in plan order: `baseline` when it has no plan-log
   record; `change` when its latest record is of type `removed` or holds a different
   snapshot, with `diff` against that record.
2. For each milestone id in the plan log whose latest record is not `removed` and that is
   no longer in `plan.json`, in order of first appearance in the log: `removed`, with
   empty `requirements`, `nodes` and `checks` and a `diff` whose `removed`,
   `nodes_removed` and `checks_removed` list everything that record held.

A renamed milestone therefore appears as `removed` plus `baseline`, and no requirement can
leave the plan without a record that names it.

## Concurrency

`gate` and `node done` hold `.ultra/.runtime/engine.lock` while they read the ledgers and
append to them; every other ledger append holds it while it reads that ledger's greatest
`at` and appends. The lock file is created exclusively and contains the holder's pid in
decimal. A command waits up to 30 seconds for the lock and exits 2 if it cannot get it.

A pid is alive when `kill(pid, 0)` succeeds or fails with `EPERM`. A lock whose pid is not
alive may be broken, but only by a command that first creates
`.ultra/.runtime/engine.lock.break` exclusively; holding it, the command re-reads the
lock, removes it only if it still names the same dead pid, and then removes the break
file. So two waiters can never both break a lock, and a live holder's lock is never
removed. A break file older than 10 seconds belongs to a breaker that died and may be
removed by anyone (ceiling: a breaker stalled for longer than that between its re-read
and its removal could still race).

The holder removes the lock when done if it still names the holder's pid; a lock that is
already gone is not an error and never changes the command's result.

## CLI

`node engine/cli.cjs <command> [options] [--root <dir>] [--json]`, also reachable as
`ubp <command>` through `bin/install.js`. The command comes first (`ubp status --json`);
options may follow in any order. `--root` defaults to the current directory.

| Command | Effect | Exit |
|---|---|---|
| `status` | prints the progress line, or with `--json` the full state | 0; 2 malformed/usage |
| `gate` | runs the plan gate; records plan-log entries when it passes | 0 pass; 1 problems; 2 |
| `check [--stale\|--all\|--req <id>\|<check-id>…]` | runs checks in registry order, records evidence, prints `<check>: <outcome> (<reason>)` per check (with `, dirty: not counted` inside the parentheses for a dirty run) and then the progress line; default `--stale` (checks whose state is `stale` or `unknown`) | 0 when every check in scope is green after the runs, 1 otherwise; 2. The scope is the selected checks, and for the default `--stale` every check in the registry, so `ubp check` never exits 0 while a check is red |
| `node done <id>` | records completion when the plan gate state is `pass`, the tree is clean, every dependency is done and every covered requirement is green | 0 recorded; 1 refused with problems; 2 |

`status --json` returns
`{ milestone, line, counts: {total, green, red, stale, unknown, uncovered}, next,
plan_changes, closed_not_green, gate, problems, warnings, dirty, requirements: [{id,
milestone, state, reasons, checks: [{id, state, reasons}]}], checks: [{id, state, reasons,
last_run}], nodes: [{id, milestone, state, reasons}] }`.

`gate --json` returns `{ ok, problems, recorded: [{milestone, type}] }`.
`check --json` returns `{ dirty, runs: [{check, run, outcome, reason, dirty}] }`; the top-level
`dirty` says whether the tree is dirty after the runs (as in `status`), and each run's
`dirty` is its evidence record's `dirty`.
`node done --json` returns `{ ok, node, problems }`; each refusal is a problem
`{ code, message, hint }` with code `plan-gate`, `dirty-tree`, `dependency-not-done` or
`requirement-not-green`.

Exit 1 only ever means that a check in scope is not green after `check`, the plan gate
found problems, or `node done` refused. Malformed truth files and ledgers, usage errors (an
unknown command, node id, check id or `--req` requirement id) and every other engine
failure exit 2; an interrupted engine exits 130 or 143. `status` exits 0 even when the
plan gate has problems; it reports them in `gate` and `problems`. Malformed files are named
on stderr. Text-mode commands print warnings on stderr.
