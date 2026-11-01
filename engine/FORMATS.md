# UBP v6 engine: truth files and CLI contract

The engine is deterministic code. It reads the project's truth files, runs registered
checks, records evidence, and computes progress. The model writes intent, specification
and plan; it never writes progress, evidence or completion records by hand.

Plan of record: `thinking/back-to-essentials-20261030/RESULT.md` (§3.1, §3.3–3.5, §3.9, §4,
§5 P1–P2).

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
| `.ultra/ledger/milestones.jsonl` | milestone closures | engine only (`milestone close`) |
| `.ultra/records/milestones/<milestone>-review.md` | milestone review and its verdict | reviewer (never the author) |
| `.ultra/records/handoffs/<node>.md` | what a finished node hands to its dependents | the node's writer |
| `.ultra/records/…` | other records, such as the interview and the Owner-touch log | the method |
| `.ultra/.runtime/checks/<run>.log` | full check output | engine; disposable |
| `.ultra/.runtime/engine.lock` | writer lock | engine; disposable |
| `.ultra/.runtime/engine.lock.break` | serializes breaking a dead writer's lock | engine; disposable |

Missing ledger files mean "no records". Missing `rulings.md` means "no rulings".
`spec.md`, `checks.json` and `plan.json` are required. `.ultra/.runtime/` is never committed.

The engine-owned paths are `.ultra/spec.md`, `.ultra/checks.json`, `.ultra/plan.json`,
`.ultra/rulings.md`, `.ultra/ledger/`, `.ultra/records/` and `.ultra/.runtime/`. Everything
else, including other files under `.ultra/` such as check scripts, is code (see "Git
state"). A check must not read files under `.ultra/records/`: editing a record never
invalidates evidence, so a check that read one could stay green after the record changed.

Reading a record file (a milestone review or a handoff): the engine reads it only when its
parent directory exists and resolves, through symbolic links, inside the root (both paths
compared after resolving), and the file, opened without following a symbolic link in its
last component and without blocking, is a regular file. A symbolic link, a FIFO, a device
or a directory at that path is never read. Git stores symbolic links, so a cloned project
can carry one; this rule keeps a record from pulling a file from outside the project into
the engine's output, and from making a command wait.

The ledgers are committed project history, like the truth files. When two branches append
to the same ledger, Git's union merge keeps both sides' lines; projects add this line to
`.gitattributes`:

```
.ultra/ledger/*.jsonl merge=union
```

Line order in a ledger therefore carries no meaning except as a tie-breaker (see "Ledger
records").

## Markdown rules

`spec.md`, `rulings.md` and milestone reviews are read line by line:

- A fence opens on a line indented by at most three spaces that starts with at least three
  backticks or at least three tildes. For a backtick fence, the rest of the line must not
  contain a backtick; otherwise the line is ordinary text (inline code such as
  ```` ```npm test``` must print ````). A fence closes on a line indented by at most three
  spaces that holds at least as many of the opening character and otherwise only
  whitespace. Lines inside a fence are ordinary text.
- A fence still open at the end of the file is an error: `spec.md` is malformed, and in
  `rulings.md` it is a `malformed-ruling` problem. Either message names the opening line.
  In a milestone review it is not an error; the lines after the opening are inside it.
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
whitespace (Unicode whitespace included) or none, then `REQ` in any letter case followed
by `-`, by `_`, or by whitespace and a digit, which is not a requirement heading (for
example `### REQ-3`, `##REQ-4`, `##　REQ-5` with an ideographic space, `## Req-7`,
`## REQ 8`, `## req_9`), so these mistypings cannot drop a requirement from the count.
Headings such as `## Requirements` or `## Req mapping` are ordinary sections.

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
    { "id": "M1", "title": "Core list", "requirements": ["REQ-001", "REQ-002"],
      "journey": "C-add" }
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
- `journey`: optional check id of the milestone's end-to-end journey, the check that walks
  the user's path through the milestone's behavior. `milestone close` requires one; the
  plan gate requires that it names a registered check covering at least one of the
  milestone's requirements. It is not part of the milestone's snapshot. Ceiling: switching
  the journey to another check that already covers the milestone is not a recorded plan
  change.

Malformed: invalid JSON, wrong types (including a `journey` that is not a string),
missing fields, duplicate ids.

## `.ultra/rulings.md` — ruling log

Every line outside fences whose first non-space characters are a list marker (`-`, `*` or
`+` followed by a space) is a ruling entry. An entry must be unindented and have exactly
this form; other lines are free text:

```
- 2026-10-31 L1 裁决：<decision> — 因为 <reason> — 如果判断错了，代价是 <cost>
```

The layer is one of `L0`–`L4`. The separators are an em dash with one space on each side.
Spaces after `裁决：`, `因为` and `代价是` are optional (`因为两种删除路径验收不同` is
valid); the decision, the reason and the cost must each be present.

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
in any of the four ledgers, 1 ms after it; the engine holds the lock while it reads the
ledgers and appends. A clock that runs fast or steps back therefore cannot make a later
record look older than an earlier one, in the same file or across files (the plan-change
count compares plan-log times with closure times).

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
`duration_ms` is measured with a monotonic clock, so a wall clock that steps back during a
run never makes it negative and never loses the run.
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

Milestone closure (`milestones.jsonl`), written by `milestone close`:

```json
{"v":1,"milestone":"M1","at":"<ISO time>","code":"<code fingerprint>",
 "reqs":{"REQ-001":"<requirement hash>"},"journey":{"check":"C-add","run":"<run id>"},
 "review":{"path":".ultra/records/milestones/M1-review.md","sha256":"<file hash>"},
 "owner":{"words":"<the Owner's words, verbatim>","proxy":false}}
```

`reqs` holds the current hashes of the milestone's requirements; `journey.run` is the
journey check's `last_run`; `review.sha256` is the SHA-256 hex of the review file's bytes,
so a later edit to the review can be detected. A record holding only `v`, `milestone` and
`at` is still valid (a closure recorded before P2); every other field, when present, must
have the type shown. Ceiling: the engine cannot tell a hand-written closure from its own.

Writing: the engine checks every record against these rules before it appends it. A record
that would not be valid (for example an `at` past year 9999, reached through the time
floor) is not written, and the command exits 2, so an append never leaves a ledger that
every later command rejects.

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
3. `全部完成` when the plan has at least one milestone and every milestone is closed;
4. `里程碑门` when there is a current milestone and every one of its nodes is done;
5. otherwise `无（受阻）`.

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
| `unknown-journey` | a milestone's `journey` names a check absent from `checks.json` |
| `journey-outside-milestone` | a milestone's `journey` check covers none of its requirements |
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

## Milestone gate

`milestone close <id> --owner <words> --review <path> [--proxy]` records that the Owner let
milestone `<id>` pass after seeing its demo, its journey result, its plan changes and the
rulings (RESULT §3.9).

- `--owner`: the Owner's words, verbatim; required, and not empty after trimming.
- `--proxy`: the words were given by the assistant on the Owner's behalf. The closure
  records `proxy: true`, so it reads as not validated by the real Owner.
- `--review`: the milestone review, a path relative to the project root. An absolute path,
  one that leaves the root, and one that names the root itself (`.`) are usage errors. The
  reviewer is never the author of the milestone's code; the recommended place is
  `.ultra/records/milestones/<id>-review.md`. The closure records the path relative to the
  root without `.` or `..` segments, with `/` separators (`./.ultra/records/x.md` is
  recorded as `.ultra/records/x.md`).
- `--owner` and `--review` are each given once; repeating either is a usage error. An
  option value is the next argument; a value that starts with `--` is read as a missing
  value (ceiling: Owner words cannot start with `--`).

Holding the lock, the command reloads the project and collects every problem, in this
order:

| code | condition |
|---|---|
| `plan-gate` | the plan gate state is not `pass` |
| `dirty-tree` | the tree is dirty |
| `not-current` | `<id>` is already closed, or a milestone before it in plan order is not closed |
| `node-not-done` | a node of the milestone is not done; one problem per node |
| `requirement-not-green` | a requirement of this milestone or of a closed milestone is not green; one problem per requirement |
| `no-journey` | the milestone names no `journey` |
| `journey-not-green` | the milestone's `journey` names a registered check whose check state is not `green` |
| `review-missing` | the review cannot be read under "Reading a record file" (see "Layout"): nothing is there, or it is a symbolic link, a FIFO, a directory or another file that is not regular, or its parent directory does not exist or resolves outside the root |
| `review-not-accepted` | the review is a regular file, but outside fences (see "Markdown rules") it does not hold exactly one line starting with `Verdict:`, or that line, without trailing whitespace, is not `Verdict: accept` (lines end at LF; a CR before it is trailing whitespace; a UTF-8 byte order mark at the start of the file is ignored) |

The bytes that were checked are the bytes that are hashed. A FIFO at the review path is
`review-missing` at once, never a wait while the lock is held. With no problem the command appends
the closure record.

The journey must be green as a check, not only through its pairs: a journey that also
covers a requirement of a later milestone turns `stale` when that requirement is edited,
while the pair for this milestone's requirement stays green, so `requirement-not-green`
alone would not catch it.

Ceiling: records never dirty the tree, so the engine does not require the review to be
committed. The method commits it with the closure record; `review.sha256` lets anyone
compare the committed file with what the gate accepted.

Text output is `milestone <id>: pass` or `milestone <id>: fail` followed by one
`<code>: <message> — <hint>` line per problem.

## Node brief

`context <id> [--budget <bytes>]` prints the brief a writer needs for node `<id>`, compiled
from the truth files and records (RESULT §3.5), and nothing else. The same files give the
same bytes. Layout, with the sections in this order:

```text
# Node <id>: <title>

Milestone <milestone id>: <milestone title> · node state <state>

## Requirements

<requirement text>

## Checks that must turn green (read-only)

- <check id> · <state> · `<run>`

## Scope

- <prefix>

## Handoffs from dependencies

### <dependency id>

<handoff>

## Rules

<rules>
```

- Milestone line: when the node's milestone is not in `plan.json`, it reads
  `Milestone <milestone id>: not in .ultra/plan.json · node state <state>` (the plan gate
  reports it).
- Requirements: each covered requirement's text, as defined for its hash, in the node's
  `covers` order, separated by one empty line. A covered id absent from the spec appears
  as the line `<id>: not in .ultra/spec.md` (the plan gate reports it).
- Checks: every check covering at least one of the node's requirements, in registry order,
  with its current state; with none, the single line `None.`
- Scope: one line per prefix; with no `scope` or an empty one, the single line
  `Not declared: change only what the requirements need.`
- Handoffs: one `### <dependency id>` subsection per direct dependency, in `depends` order.
  For a dependency that names a node of the plan, it holds the text of
  `.ultra/records/handoffs/<dependency>.md` (CRLF→LF, whitespace-only lines at the start
  and whitespace at the end of the text removed); the line `No handoff written.` when
  nothing is at that path and no directory on the path is a file, or when its text is
  empty; otherwise, when it cannot be read under "Reading a record file" (see "Layout"),
  the line `Not read: not a regular file inside the project.` For a dependency that names
  no node, it holds the line `Not a node in .ultra/plan.json.` and no file is read, so a crafted
  `depends` entry can never pull a file from outside the records into a brief. A node
  without dependencies has the single line `None.` instead.
- Rules: the fixed text below, with `<id>` replaced by the node id and `<checks>` by the
  ids of the checks listed above, in the same order, separated by one space (`--stale`
  when there are none).
- Blocks are separated by exactly one empty line, as in the layout: each heading from its
  body, each section from the next heading, and each handoff subsection from the next.
- The brief ends with exactly one newline; text mode writes it to stdout unchanged.

```text
- Do not edit .ultra/spec.md, .ultra/checks.json, .ultra/plan.json, .ultra/ledger/ or the files the checks above run. If a check or a requirement looks wrong, stop and escalate.
- Change only files inside the scope, and commit your work: evidence from an uncommitted tree never counts.
- Run `ubp check <checks>` until every check above is green, then `ubp node done <id>`.
- Escalate instead of deciding: a change of direction (L0) and any deletion or narrowing of a requirement go to the Owner.
- Record every other decision you made without asking as one line in .ultra/rulings.md: `- YYYY-MM-DD Lx 裁决：<决定> — 因为 <理由> — 如果判断错了，代价是 <代价>`.
- Before `ubp node done <id>`, write .ultra/records/handoffs/<id>.md: the interfaces you created, what dependent nodes must know, and what is left unfinished.
- If three attempts leave a check red, stop and report the check, its error line and what you tried.
```

Budget: the brief's size in UTF-8 bytes must not exceed the budget, 32768 by default or
`--budget`, a positive integer. When it does, handoffs are replaced one at a time, starting
from the last dependency, by the line
`Omitted to fit the budget: read .ultra/records/handoffs/<dependency>.md`, until the brief
fits. Only a handoff read from a file whose text is longer in UTF-8 bytes than its
replacement line is replaced; the others are skipped. So every omission makes the brief
smaller and points at a file that exists. Requirements, checks and rules are never cut:
when the brief still does not fit, `context` writes nothing to stdout and exits 1 with the
problem `brief-over-budget`, whose message names the size and the budget and whose hint is
to split the node; text mode prints the problem on stderr.

## Concurrency

`gate`, `node done` and `milestone close` hold `.ultra/.runtime/engine.lock` while they
read the ledgers and append to them; every other ledger append holds it while it reads the
ledgers' greatest `at` and appends. The lock file is created exclusively and contains the
holder's pid in decimal. A command waits up to 30 seconds for the lock and exits 2 if it
cannot get it.

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
| `milestone close <id> --owner <words> --review <path> [--proxy]` | records the closure when the milestone gate finds no problem (see "Milestone gate") | 0 recorded; 1 refused with problems; 2 |
| `context <id> [--budget <bytes>]` | prints the node brief (see "Node brief") | 0; 1 over budget; 2 |

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
`milestone close --json` returns `{ ok, milestone, problems }`, with the codes listed under
"Milestone gate". `context --json` returns `{ ok, node, bytes, omitted, brief, problems }`:
`omitted` lists, in omission order, the dependencies whose handoffs were omitted, and on
refusal `brief` is null and `bytes` is the size reached after every handoff that could be
omitted was omitted.

Options belong to their command: `--owner`, `--review` and `--proxy` only to `milestone
close`, `--budget` only to `context`, and the check selectors only to `check`; anywhere else
they are usage errors. Giving `--owner`, `--review` or `--budget` twice is a usage error.

Exit 1 only ever means that a check in scope is not green after `check`, the plan gate
found problems, `node done` or `milestone close` refused, or a node brief does not fit its
budget. Malformed truth files and ledgers, usage errors (an unknown command, node id,
milestone id, check id or `--req` requirement id, a missing, invalid or repeated option
value) and every other engine failure exit 2; an interrupted engine exits 130 or 143.
`status` exits 0 even when the plan gate has problems; it reports them in `gate` and
`problems`. Malformed files are named on stderr. Text-mode commands print warnings on
stderr.
