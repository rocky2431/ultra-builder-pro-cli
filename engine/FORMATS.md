# UBP v6 engine: truth files and CLI contract

The engine is deterministic code. It reads the project's truth files, runs registered
checks, records evidence, and computes progress. The model writes intent, specification
and plan; it never writes progress, evidence or completion records by hand.

Plan of record: `thinking/back-to-essentials-20261030/RESULT.md` (§3.1, §3.3–3.5, §3.9, §4,
§5 P1–P4).

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
| `.ultra/ledger/approvals.jsonl` | the Owner's approvals of reductions | engine only (`approve`) |
| `.ultra/records/milestones/<milestone>-review.md` | milestone review and its verdict | reviewer (never the author) |
| `.ultra/records/handoffs/<node>.md` | what a finished node hands to its dependents | the node's writer |
| `.ultra/records/…` | other records, such as the interview and the Owner-touch log | the method |
| `.ultra/.runtime/checks/<run>.log` | full check output | engine; disposable |
| `.ultra/.runtime/engine.lock` | writer lock | engine; disposable |
| `.ultra/.runtime/engine.lock.break` | serializes breaking a dead writer's lock | engine; disposable |
| `.ultra/.runtime/merge/<id>/` | the merge gate's temporary work tree | engine; disposable |
| `.ultra/.runtime/merge.lock` | held by the one running merge | engine; disposable |
| `.ultra/.runtime/merge.lock.break` | serializes breaking a dead merge's lock | engine; disposable |

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

Shared text: every line of the spec outside the requirement blocks, that is the lines
before the first requirement and every section under a level-1 or level-2 heading that is
not a requirement (for example `## Direction` or `## Interface`), headings included. Its
hash is the SHA-256 hex, in UTF-8, of those lines after CRLF→LF, each with trailing
whitespace removed, empty lines dropped, joined with `\n`; with no such line it is the hash
of the empty string. So blank lines and trailing spaces never change it, and any other
edit does.

The shared text holds what every requirement relies on (direction, interface
conventions). The engine cannot tell which requirements a shared line concerns, so a
change to it invalidates as if every requirement had changed (see "States"). A convention
that concerns one requirement belongs in that requirement's block, where changing it
invalidates only that requirement.

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
- `covers`: array of requirement ids, non-empty except for an invariant. This is the only
  link between checks and requirements.
- `fix`: optional non-empty string. A check with `fix` is an invariant (RESULT §3.7): a
  rule the code must always keep, such as a size limit or a forbidden import, with the
  way to repair a violation written in `fix`. An invariant covers no requirement
  (`covers: []`) and belongs to no milestone.
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
`expect`, an `expect` that matches the empty string, an empty `covers` without `fix`, a
`fix` that is not a non-empty string, a `fix` on a check that covers a requirement.

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
- `kind`: optional; the only value is `"cleanup"`. A cleanup node (RESULT §3.7) covers no
  requirement (`covers: []`): the cleaner scans the code against the invariants and the
  project's principles and turns what it finds into small nodes or fixes inside its
  scope. Every other node covers at least one requirement (else `empty-node`).
- `cleanup_every`: optional top-level positive integer K. When present, the plan gate
  requires every milestone to end, in plan order, with a cleanup node, and no run of
  more than K consecutive other nodes within a milestone (`cleanup-missing`).
- `journey`: optional check id of the milestone's end-to-end journey, the check that walks
  the user's path through the milestone's behavior. `milestone close` requires one; the
  plan gate requires that it names a registered check covering at least one of the
  milestone's requirements. It is not part of the milestone's snapshot. Ceiling: switching
  the journey to another check that already covers the milestone is not a recorded plan
  change.

Malformed: invalid JSON, wrong types (including a `journey` that is not a string),
missing fields, duplicate ids, a `kind` other than `"cleanup"`, a cleanup node that covers
a requirement, a `cleanup_every` that is not a positive integer.

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
- Environment: every Git command the engine runs, and every check it runs, gets the
  environment without the variables `git rev-parse --local-env-vars` lists (`GIT_DIR`,
  `GIT_WORK_TREE`, `GIT_INDEX_FILE` and the like), so `--root`, or the merge gate's
  temporary work tree, alone decides the repository. A Git hook exports those variables.
  The list includes `GIT_CONFIG_PARAMETERS` and `GIT_CONFIG_COUNT`, so configuration passed
  through the environment (`git -c`, CI settings) does not reach the engine's Git commands.
  The engine also removes `GIT_LITERAL_PATHSPECS`, `GIT_GLOB_PATHSPECS`,
  `GIT_NOGLOB_PATHSPECS` and `GIT_ICASE_PATHSPECS`, so its pathspecs (the merge gate's
  `':(icase).ultra'`) mean the same in every environment.
- The engine never limits the size of Git's output: a top-level directory with tens of
  thousands of entries, or as many modified files, must work.
- Usage errors (exit 2), each with its own message and hint: `--root` does not exist; the
  directory is not inside a Git work tree (hint: `git init`); the repository has no commit
  (hint: commit the code first).
- A Git command the engine expects to succeed that fails for another reason (identity,
  a hook, signing, a broken repository) exits 2 with the message
  `Git failed: <arguments>: <first non-empty line of Git's standard error>` (only the
  arguments when Git wrote nothing), so the reason reaches the user.

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
in any of the five ledgers, 1 ms after it; the engine holds the lock while it reads the
ledgers and appends. A clock that runs fast or steps back therefore cannot make a later
record look older than an earlier one, in the same file or across files (the plan-change
count compares plan-log times with closure times).

Latest record: the record with the greatest `at`; ties go to the later line.

Evidence (`evidence.jsonl`), one per executed check:

```json
{"v":1,"run":"<unique id>","check":"C-add","at":"<ISO time>","outcome":"pass|fail|unknown",
 "reason":"<see below>","exit_code":0,"duration_ms":812,"code":"<code fingerprint>",
 "dirty":false,"check_fp":"<check fingerprint>","reqs":{"REQ-001":"<requirement hash>"},
 "shared":"<shared text hash>","log":".ultra/.runtime/checks/<run>.log","error_line":null}
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

`reqs` holds the current hashes of the covered requirements that exist in the spec;
`shared` holds the hash of the spec's shared text when the check ran.
`duration_ms` is measured with a monotonic clock, so a wall clock that steps back during a
run never makes it negative and never loses the run.
`error_line` is null on pass; otherwise the first line of the output tail that matches
`/^\s*(?:✖|not ok\b|FAIL(?:ED)?\b)|\b(?:[A-Z][A-Za-z]*)?Error\b/u`, else the last non-empty
line, cut to 200 characters.

Plan log (`plan-log.jsonl`), written by a passing gate:

```json
{"v":1,"type":"baseline|change|removed","milestone":"M1","at":"<ISO time>",
 "shared":"<shared text hash>","requirements":{"REQ-001":"<hash>"},"nodes":["N-01"],
 "checks":{"C-add":{"fp":"<check fingerprint>","covers":["REQ-001"]}},
 "diff":{"added":[],"removed":[],"modified":[],"nodes_added":[],"nodes_removed":[],
         "checks_added":[],"checks_removed":[],"checks_modified":[]}}
```

A milestone's snapshot is the shared text hash; its requirement ids mapped to current
hashes; its node ids, sorted; and every check that covers at least one of its requirements,
mapped to the check's fingerprint and the sorted ids of the milestone's requirements it
covers. So removing a check, narrowing what it covers or editing it is a plan change of
every milestone it touches: it is recorded with its diff, and until then the gate is
`stale`. `diff` is present on `change` and `removed`; every id list in it is sorted in
code-unit order (JavaScript's default sort). `diff` also holds `"shared": true` when the
snapshot's shared hash differs from the previous record's, or the previous record has none;
the key is absent otherwise. What the gate records is defined under "Plan gate".

Node completion (`nodes.jsonl`):
`{"v":1,"node":"N-01","at":"…","code":"…","reqs":{"REQ-001":"…"},"shared":"…","runs":["…"]}`.

`shared` in evidence, plan-log and node completion records is optional for reading: records
written before P3 lack it and stay valid. When present it must be a SHA-256 hex, and a
plan-log `diff.shared`, when present, must be `true`. Every record the engine writes now
carries `shared`.

Upgrading a project whose records predate P3: its evidence, nodes and plan-log records have
no `shared`, so every check and every done node turns `stale` (`shared-changed`) and the
gate is `stale`. Run `ubp gate` once (it records a `change` for every milestone, with an
otherwise empty diff and `shared: true`, which raises `本里程碑计划变更` until the next
closure), then `ubp check`, then `ubp node done` for each node that was done, in dependency
order. A milestone review should read those records as the upgrade, not as a change of
intent.

Approval (`approvals.jsonl`), written by `approve`:

```json
{"v":1,"items":["M2/C-delete-page","M2/REQ-delete-page"],"at":"<ISO time>",
 "owner":{"words":"<the Owner's words, verbatim>","proxy":false}}
```

`items` is non-empty, sorted in code-unit order, without duplicates; each item is
`<milestone id>/<requirement or check id>`, both parts matching the id pattern of
"`.ultra/spec.md`". `owner.words` is a non-empty string and `owner.proxy` a boolean.

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
2. Stale reasons are collected, in this order: `check-changed` (fingerprint differs),
   `code-changed` (code fingerprint differs), `shared-changed` (the shared text hash differs
   from the record's `shared`, or the record has none), `req-changed:<id>` (a covered
   requirement's hash differs from, or is missing in, the record's `reqs`). For a pair, only
   the pair's own requirement can contribute `req-changed`. Any stale reason → `stale`.
3. Otherwise the outcome: pass → `green` with no reasons; fail → `red` and unknown →
   `unknown`, each with the record's `reason` as its only reason.

Invariant state: the check state of the invariant. An invariant is not green when its
state is anything but `green` (`unknown`, `stale` and `red` alike).

Requirement state: no covering check → `uncovered`. Otherwise over its pairs: any `red`
→ `red`; else any `unknown` → `unknown`; else any `stale` → `stale`; else `green`.
Only `green` counts as done; `unknown` and `uncovered` never do.

Node state:

- `done`: a completion record exists, its `shared` equals the current shared text hash,
  and every covered requirement's current hash equals the hash in the node's latest
  record.
- `stale`: a completion record exists but its `shared` differs or is missing (reason
  `shared-changed`, first), or some covered requirement's hash differs or is missing
  (reasons `req-changed:<id>`).
- `ready`: no completion record and every dependency is `done`. A cleanup node's
  dependencies are its `depends` and every node before it in its milestone (plan order),
  as `node done` requires; here and in "actionable" below.
- `blocked`: otherwise.

A node is actionable when it is `ready`, or `stale` with every dependency `done`.

Invalidation precision: a node turns stale only when the text of a requirement it covers,
or the shared text, changes, so only the nodes behind a changed requirement are worked
again. A check's evidence is tied to the whole code fingerprint, so any commit to code
makes every check stale: the engine cannot know which code a check exercises, and a
narrower rule could keep a broken check green. After any code commit, `ubp check` reruns
every check, which is the ratchet: a requirement of the current or a closed milestone that
was green must be green again. Ceiling: a project whose full check run is slow pays it
after every node; the upgrade path is per-check input prefixes, valid only where a check's
inputs can be stated and enforced.

Closed milestones: those with a closure record. Current milestone: the first milestone in
plan order that is not closed; if all are closed, the last milestone; with no milestones,
none.

Next item, in this order:

1. the first actionable node, in plan order, among the nodes of the closed milestones and
   of the current milestone;
2. `检查` when some requirement of those milestones, or some invariant, is not green;
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
<M> · <green>/<total> 绿[ · <n> 红][ · <n> 过期][ · <n> 未知][ · <n> 未覆盖] · 下一项 <next> · 本里程碑计划变更 <k> 次[ · 不变量 <n> 未绿][ · 已关闭里程碑 <n> 项未绿][ · 工作区未提交][ · 计划门未通过| · 计划门待重跑]
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
| `cleanup-missing` | with `cleanup_every` K: a milestone does not end with a cleanup node, or holds more than K consecutive other nodes; one problem per milestone |
| `reduction-unapproved` | the plan drops a requirement or a check from a milestone, or narrows what a check covers, without a recorded approval (below) |
| `malformed-ruling` | a ruling entry in `rulings.md` does not have the ruling form, or a fence there is never closed |

`reduction-unapproved` problems, one per unapproved item, follow every other plan problem,
and `malformed-ruling` comes last.

Reductions. For each milestone id in the plan log whose latest record is not `removed`,
in order of first appearance in the log, compare that record's snapshot with the
milestone's current snapshot (empty when the milestone is no longer in `plan.json`). Its
reduction items are, requirements first, then checks, each group sorted by id:

- `<milestone>/<requirement>` for every requirement in the record that the current
  snapshot lacks (deleted from the spec, or moved to another milestone);
- `<milestone>/<check>` for every check in the record that the current snapshot lacks, and
  for every check in both whose current `covers` lacks a requirement that the record's
  `covers` held and that is still in the current snapshot.

An item is approved when some record in `approvals.jsonl` lists it and has an `at` later
than both the milestone's latest plan-log record and its closure, if any: an approval
answers the plan as it stood, so a later recorded change of that milestone, or its closure,
leaves an unused approval behind. One item covers any reduction of what it names: approving
`M1/C-12` to narrow it also allows deleting it. Each unapproved item is one problem; its
message names the item and its hint names `ubp approve <item> --owner "<words>"`. Once the
gate passes, it records the change, and the item is no longer in the latest snapshot, so
an approval is used once. Only the Owner approves a reduction (RESULT §3.2, §3.7): the
ratchet keeps every check of a requirement until they do.

Renaming a milestone removes everything it held from the old id (see "What a passing gate
records"), so a rename needs the same approval for each of the old milestone's items.

Ceiling: the engine sees removals, not meaning. These pass the gate as modifications:
rewording a requirement so that it asks for less; weakening the assertions inside a check's
test file; changing a check's `run` or `expect` in `checks.json` so it proves less; deleting
a convention from the shared text. The method has the planner classify such an edit as a
reduction and record the Owner's approval with `ubp approve` before making it; the
milestone review reads the plan-log diffs. Approval records are checked for their shape
only, so a hand-written line counts like one written by `ubp approve`. An invariant belongs to
no milestone, so removing one is no plan change: it needs no approval and leaves no
plan-log record; the method records it as a ruling.

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
| `invariant-not-green` | an invariant is not green; one problem per invariant, its hint the invariant's `fix` when its state is `red`, otherwise ``Run `ubp check <id>`.`` (a stale or unknown invariant has not been run on this code, so its `fix` would mislead) |
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
  `covers` order, separated by one empty line; with none (a cleanup node), the single line
  `None.` A covered id absent from the spec appears
  as the line `<id>: not in .ultra/spec.md` (the plan gate reports it).
- Checks: every check covering at least one of the node's requirements, in registry order,
  with its current state; for a cleanup node, every invariant instead, each line ending
  ` · fix: <fix>`; with none, the single line `None.`
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
- Run `ubp check <checks>` until every check above is green, then `ubp check` (every stale check: invariants and finished requirements must stay green), then `ubp node done <id>`.
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

## Retro

`retro` lists the failure classes since the latest closure (RESULT §3.7: a mechanical error
seen twice becomes a check). It reads only.

- Window: evidence records whose `at` is later than the greatest `at` in
  `milestones.jsonl`; all records when there is none. `since` is that `at`, or null.
- Failures: records in the window with `dirty: false` and outcome `fail` or `unknown`, except
  the red-before-green runs of test-first work: a record whose reason is not `timeout`,
  `expect-timeout`, `not-runnable` or `spawn-error` counts only when an earlier line of
  `evidence.jsonl` (inside the window or before it) holds a `pass` with `dirty: false` for
  the same check. So a check failing before it ever passed is not a failure class; a
  regression after a pass is, and a check that cannot run or hangs always is.
- Class: the record's `error_line` (or its `reason` when `error_line` is null or empty) with every
  run of ASCII digits replaced by `#`, every run of whitespace by one space, and the ends
  trimmed.
- `classes`: one entry `{ class, count, checks, runs }` per class: `count` failing records,
  `checks` their sorted unique check ids, `runs` their run ids in record order (latest
  record order, ties by line). Sorted by `count` descending, then by `class` in code-unit
  order.
- Text mode prints one line per class, `<count> × <class> · <checks joined by ", ">`, then
  `重复两次及以上：<n> 类`, where n counts classes with `count` at least 2.

The method turns each class seen twice into an invariant or a ruling.

## Merge gate

`merge <branch> --expect-head <commit>` brings a branch in only when the merged tree keeps
the finished work green (RESULT §3.6: verify the expected head, run the full regression, bisect on
red). `<branch>` is anything `git rev-parse --verify <x>^{commit}` resolves; `<commit>` is a
full commit id (40 or 64 hex digits) that resolves. Anything else is a usage error: a name
such as `HEAD` or the current branch would always match.

Problems, collected in this order; the first of `merge-busy`, `head-moved`, `dirty-tree`,
`plan-gate` and `nothing-to-merge` that applies stops the command before any merge is tried,
and `merge-conflict`, `truth-changed` or `merged-gate` (the first that applies, in that
order) stops it before any check runs:

| code | condition |
|---|---|
| `merge-busy` | another `ubp merge` holds `.ultra/.runtime/merge.lock`; refused at once, never a wait, and nothing under `.ultra/.runtime/merge/` is touched |
| `head-moved` | HEAD is not the `--expect-head` commit, or it moved before the fast-forward |
| `dirty-tree` | the tree is dirty, or a file under `.ultra/` outside `.ultra/.runtime/` differs from HEAD or is untracked and not ignored (`git ls-files --others --exclude-standard`); the message names each such `.ultra/` path, and reads `Uncommitted code` when only code is dirty, never ending with an empty list (hint: commit `.ultra/` first; the merge brings the branch's ledger lines in) |
| `plan-gate` | the plan gate state is not `pass` |
| `nothing-to-merge` | the branch's commit is already an ancestor of HEAD |
| `merge-conflict` | merging the branch into HEAD conflicts; the message names the conflicting paths. When one of them is under `.ultra/ledger/`, the hint says to add `.ultra/ledger/*.jsonl merge=union` to `.gitattributes` on the main line |
| `truth-changed` | the merge commit differs from HEAD at a path that is `.ultra` or lies under `.ultra/`, other than an added or modified regular file (Git mode `100644` or `100755`) at `.ultra/ledger/evidence.jsonl`, `.ultra/ledger/nodes.jsonl`, `.ultra/rulings.md` or a path under `.ultra/records/`. Compared with `git diff-tree -r --no-renames HEAD <merge commit> -- ':(icase).ultra'`, which also lists a case variant of the directory, and paths compared exactly as Git prints them, so a case variant such as `.ULTRA/ledger/milestones.jsonl` or `.ultra/ledger/Milestones.jsonl` is not allowed, on any file system (a case-insensitive one would check it out into `.ultra/`); a symbolic link, a submodule, a type change or a deletion is refused even at an allowed path. One problem per path, in Git's order, the message naming the path. Everything else under `.ultra/` (spec, checks, plan, plan log, closures, approvals) is the planner's or the controller's, made on the main line |
| `merged-gate` | the merged tree has plan problems, computed as `ubp gate` computes them (for example a malformed ruling the branch added); the message lists their codes |
| `check-not-green` | after the merge, a blocking check (below) did not pass; one problem per check, in registry order |
| `fast-forward-failed` | the main tree could not fast-forward to the merge commit while HEAD stayed put; the message carries Git's first error line |

Every check runs in the temporary tree. A run passes when its outcome is `pass` and its
evidence is clean. The merge keeps the finished work green (RESULT §3.6), not the unfinished
work of other writers: a check that does not pass blocks when it is

1. an invariant;
2. a check covering a requirement of a closed milestone (closures from the main tree's
   ledger);
3. a check covering a requirement that a finished node covers: a node with a completion
   record in the merged tree's `.ultra/ledger/nodes.jsonl`, whether it finished on the main
   line or the branch brings its completion in; or
4. any other check covering a requirement of the current milestone (decided in the main
   tree), when it passes on HEAD alone (see "Bisect"): the branch broke what already worked.

A check that does not pass and is none of these does not block. For a check of the current
milestone (it did not pass on HEAD alone either) the merge adds the warning
`<check> is not green after the merge and was not green before it; no finished work needs it`,
in registry order: this is unfinished work, for example another writer's node, as at a
milestone gate before its last node. Checks of later milestones run too but never block and
add no warning. Ceiling: a requirement added to a closed milestone after its closure is not
built yet, so its red check blocks, under rule 2, every merge except the one of the branch
that builds it; build it first.

Procedure: the engine first takes `.ultra/.runtime/merge.lock` (created exclusively, holding
the merge's pid in decimal; a lock whose pid is not alive is broken through
`.ultra/.runtime/merge.lock.break` exactly as `engine.lock` is in "Concurrency") and holds it
until its temporary work tree is removed. Holding it, the engine deletes the leftover
entries under `.ultra/.runtime/merge/` and drops the registrations of work trees inside that
directory; it never prunes or removes any other work tree. It adds a detached temporary work tree at HEAD under
`.ultra/.runtime/merge/<id>/`, merges the branch there with `git merge --no-ff --no-edit`
(message `Merge <branch> (ubp merge gate)`, the repository's Git identity, configuration and
hooks), and runs every
check there. Every Git command of the merge runs with `-c maintenance.auto=false -c
gc.auto=0`, so the gate never starts Git's automatic maintenance, which would expire reflog
entries of the whole repository. Their evidence goes to the temporary tree and is discarded. With no problem,
the main tree's current branch fast-forwards to that merge commit (`git merge --ff-only`). On
refusal the main tree, HEAD and the branch are unchanged.

Every Git command the engine runs in the temporary tree, including those of the checks'
bookkeeping, is bound to that tree's own Git directory, so it can never reach the main
repository: when the temporary tree or its `.git` file has gone, the command fails, the merge
exits 2, and the main tree (tracked, untracked and ignored files), its index, HEAD, its reflog
and the branch are unchanged.

The temporary work tree is removed whatever the outcome: `git worktree remove --force`, and
when that fails, making its directories writable, deleting it and dropping its registration
(only its own). When it still cannot be removed, the result stands: `merge --json` lists the failure
in `warnings`, and text mode prints `warning: <message>` after the result.

An interrupt (SIGINT or SIGTERM) before the fast-forward stops the merge: the main tree,
HEAD and the branch are unchanged, the temporary work tree is removed, and the command exits
130, 143 or 129. This holds whether the signal reaches the engine alone or its whole process group
(a terminal's Ctrl-C), and whether it arrives during a check, during a Git command or between
them: a Git command killed by the signal never turns the exit into 2. Once the fast-forward
has started, an interrupt no longer stops it: the fast-forward runs outside the engine's
process group, completes, and the command exits 0.

Bisect, for each blocking check, in registry order: when it blocks only under rule 3 and every
finished node covering its requirements finished on the branch (its completion record is not
in HEAD's `nodes.jsonl`), the result is `the branch marks <node> done` (the first such node in
plan order), with no search. Otherwise the engine first tries HEAD alone; when the check does not
pass there either, the result is `not green at HEAD before the merge`. Otherwise the branch's
first-parent commits after the merge base, oldest first, are searched in halves for the
first commit whose merge into HEAD makes that check not pass; a commit whose merge conflicts
counts as not passing. The result is `first bad commit <full sha> <subject>`. Ceiling: the
search assumes that once a commit breaks the check, later ones keep it broken.

Each `check-not-green` message reads `<check> is not green: <error line of its run, or its
reason when there is none, or `dirty-run` for a dirty pass>; <bisect result>`.

`merge --json` returns `{ ok, merged, problems, warnings }`; `merged` is the merge commit, or
null on refusal; `warnings` is an array of strings: the non-blocking checks above, then
any work tree the engine could not remove. Text mode prints `merge <branch>: pass
<first 7 hex of the merge commit>`, or `merge <branch>: refused` and each problem with its
hint.

Ceilings: checks run in a fresh work tree, so a project whose checks need generated files that
Git does not track cannot use the gate yet (upgrade path: a setup command in `checks.json`).
The temporary tree lies inside the main tree (`.ultra/.runtime/merge/<id>/`), so a module
resolver that walks up parent directories, as Node's does, finds the main tree's installed
dependencies: a dependency the branch adds but the main tree has not installed is not seen,
and one the main tree has installed hides a missing one; install on the main line before
merging such a branch. The forbidden paths are checked on the merged tree, so the engine
trusts the evidence and node lines a branch brings in. A forged completion only makes more
checks block. A forged evidence line can keep a red check green on the main line (a branch
that changes no code leaves the fingerprint unchanged), so after each merge the method runs
`ubp check --all`: its runs are appended after every branch record and supersede it; the merge holds no `engine.lock` while checks run, only
`merge.lock`.

## Concurrency

`gate`, `node done`, `milestone close` and `approve` hold `.ultra/.runtime/engine.lock` while they
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
| `check [--stale\|--all\|--req <id>\|<check-id>…]` | runs checks in registry order, records evidence, prints `<check>: <outcome> (<reason>)` per check (with `, dirty: not counted` inside the parentheses for a dirty run; for an invariant whose run did not pass, a next line `  fix: <fix>`) and then the progress line; default `--stale` (checks whose state is `stale` or `unknown`) | 0 when every check in scope is green after the runs, 1 otherwise; 2. The scope is the selected checks, and for the default `--stale` every check in the registry, so `ubp check` never exits 0 while a check is red |
| `node done <id>` | records completion when the plan gate state is `pass`, the tree is clean, every dependency is done, every covered requirement is green and every invariant is green; for a cleanup node, also every node before it in its milestone (plan order) is done (`dependency-not-done`, one per node) and every requirement of a closed milestone and every requirement of its own milestone covered by a done node is green | 0 recorded; 1 refused with problems; 2 |
| `retro` | prints the failure classes since the latest closure (see "Retro"); reads only | 0; 2 |
| `merge <branch> --expect-head <commit>` | the merge gate (see "Merge gate") | 0 merged; 1 refused with problems; 2 |
| `milestone close <id> --owner <words> --review <path> [--proxy]` | records the closure when the milestone gate finds no problem (see "Milestone gate") | 0 recorded; 1 refused with problems; 2 |
| `context <id> [--budget <bytes>]` | prints the node brief (see "Node brief") | 0; 1 over budget; 2 |
| `approve <milestone>/<id>… --owner <words> [--proxy]` | records the Owner's approval of the listed reduction items | 0 recorded; 2 |

`status --json` returns
`{ milestone, line, counts: {total, green, red, stale, unknown, uncovered}, next,
plan_changes, closed_not_green, gate, problems, warnings, dirty, requirements: [{id,
milestone, state, reasons, checks: [{id, state, reasons}]}], checks: [{id, state, reasons,
last_run}], nodes: [{id, milestone, state, reasons}], invariants: [{id, state, reasons,
fix}] }`; invariants appear in `checks` too, in registry order.

`gate --json` returns `{ ok, problems, recorded: [{milestone, type}] }`.
`check --json` returns `{ dirty, runs: [{check, run, outcome, reason, dirty}] }`; the top-level
`dirty` says whether the tree is dirty after the runs (as in `status`), and each run's
`dirty` is its evidence record's `dirty`.
`node done --json` returns `{ ok, node, problems }`; each refusal is a problem
`{ code, message, hint }` with code `plan-gate`, `dirty-tree`, `dependency-not-done`,
`requirement-not-green` (one per requirement) or `invariant-not-green` (one per invariant,
its hint as under "Milestone gate"), in that order.
`retro --json` returns `{ since, classes }` (see "Retro"); `merge --json` returns
`{ ok, merged, problems, warnings }` (see "Merge gate").
`milestone close --json` returns `{ ok, milestone, problems }`, with the codes listed under
"Milestone gate". `context --json` returns `{ ok, node, bytes, omitted, brief, problems }`:
`omitted` lists, in omission order, the dependencies whose handoffs were omitted, and on
refusal `brief` is null and `bytes` is the size reached after every handoff that could be
omitted was omitted.
`approve --json` returns `{ ok: true, items }` with the recorded, sorted items; in text mode
it prints `approved: <items joined by ", ">`. Each item must name a milestone whose latest
plan-log record is not `removed` and a requirement or check in that record's snapshot, so
an approval can be given before the edit it allows; any other item, no item, or `--owner`
missing, repeated or blank after trimming is a usage error (exit 2) and records nothing.
The engine cannot tell the Owner's words from words written for them; `--proxy` marks an
answer the assistant gave for the Owner.

Options belong to their command: `--owner` and `--proxy` only to `milestone close` and
`approve`, `--review` only to `milestone close`, `--expect-head` only to `merge` (given
once), `--budget` only to `context`, and the check
selectors only to `check`; anywhere else they are usage errors. Giving `--owner`, `--review`
or `--budget` twice is a usage error.

Exit 1 only ever means that a check in scope is not green after `check`, the plan gate
found problems, `node done`, `milestone close` or `merge` refused, or a node brief does not
fit its budget. Malformed truth files and ledgers, usage errors (an unknown command, node id,
milestone id, check id or `--req` requirement id, a missing, invalid or repeated option
value) and every other engine failure exit 2; an interrupted engine exits 130, 143 or 129
(SIGINT, SIGTERM or SIGHUP).
`status` exits 0 even when the plan gate has problems; it reports them in `gate` and
`problems`. Malformed files are named on stderr. Text-mode commands print warnings on
stderr.
