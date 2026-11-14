---
name: ultra
description: Drive a project with the UBP v6 engine, from status and the start of a new or
  existing project (survey, investigation, interview) through specification and checks,
  planning, the node loop, milestone gates, and changes.
---
# Ultra method (UBP v6)

You run a project through one entry point. The engine (`ubp`) owns the truth about
progress; you own judgment. Never write a progress number yourself: quote `ubp status`.

`ubp` always means `node __UBP_ENGINE_CLI__`, the engine bundled with this Skill,
regardless of PATH. Every command takes `--root <dir>` and `--json`. File formats and
exit codes: `__UBP_ENGINE_FORMATS__`.

## Every session starts the same way

1. `ubp status --json`. If `.ultra/spec.md` does not exist (not started), go to "Start".
   If the spec exists but `.ultra/design.md` does not, survey the project as Start
   step 1 says, registering nothing the checks already hold, and write the design before the
   next node; while a drive runs, wait for it to end first.
2. `git log --oneline -10` and `git status --short`.
3. When the current milestone has a `journey`, run it once: `ubp check <journey>`. A red
   journey at the start of a session is the first thing to fix.
4. Choose the step from the status, and from nothing else:

| Status | Step |
|---|---|
| `drive` is set (the line ends with `drive 运行中`) and `UBP_DRIVE` is not (you are not that drive's writer or reviewer) | a drive may be running on this tree: follow "A drive in the status" in `references/drive.md`; until it says the lock is left over, change no file, brief no writer and start no drive |
| `dirty: true` | commit or discard first; evidence from a dirty tree never counts |
| `gate: "fail"` | fix the reported `problems` (see "Plan") |
| `gate: "stale"` | `ubp gate`, which records the plan change |
| `next` is a node id | "Node loop" for that node |
| `next` is `检查` | `ubp check`, then triage every red or unknown check with "Escalation"; a red invariant prints its `fix` |
| `next` is `里程碑门` | "Milestone gate" |
| `next` is `全部完成` | report the line to the Owner; ask whether to plan another milestone |
| `next` is `无（受阻）` | read `nodes[].state` and `reasons`; repair the plan |

Whenever you report progress to the Owner, paste the line `ubp status` printed. Report it
unasked after every node and every gate step, and relay each line a running drive prints: an
Owner who has to ask "what is happening" is a failure of this rule. `待复核`: finished work
whose checks last passed and went stale (after a code commit a rerun settles it; after an
edit of a requirement, a check or the spec's shared text its node may need rework); `未绿`: a
check failed or never ran.

## Roles

Each step names a role. One agent may play several, with two exceptions: the acceptance
author and the reviewer are never the writer of the code they judge. A writer is a fresh
context: a new subagent or delegated session that sees the node brief and the repository,
not your conversation.

Per node, the default is one fresh writer followed by your verification (Node loop step 4):
no per-node explorer, tester or second reviewer, which cost tokens without raising quality.
Add a read, a review or a test run only to a node you judge risky. A reviewer from another
vendor, when available, reviews the whole branch at the milestone gate.

## Start (new or existing project)

Goal: before any requirement, know what exists, what is not known, and what the Owner wants,
in their own words. Four steps, in order; each writes a file, and the next step reads it.

1. **Survey (planner), always.** A directory that is not a Git repository gets `git init` and
   a first commit of what is there (`git commit --allow-empty` when it is empty): the engine
   reads only committed code. Read what is there: `git log`, the layout, how it is built, run
   and tested, its tests and its docs. Write `.ultra/design.md` (see "Project knowledge"): its
   `## System` says how the system is built, run and tested today. For existing code, also:
   - run the existing tests and time them, then register the project's own test command (the
     runner and a glob, not a list of files, so tests added later join it) as an invariant: a
     check with `covers: []`, a `fix` and a `timeout_sec` above the measured run (see
     "Keeping it tidy"), so every node keeps what already passes. It passes when registered,
     unless the milestone's first node is a cleanup node (`"kind": "cleanup"`) that fixes a red
     baseline; otherwise a red baseline (tests already red or flaky, noted under `## Facts`) is
     left out of its run, as below;
   - every test this work adds or rewrites red waits in the milestone's own test directory,
     kept out of the invariant's run by the runner's own path means (a glob that does not match
     it, such as `test/*.test.cjs` beside `test/m4/`; pytest `--ignore`; a Go package list): in
     the invariant's run it would refuse every node planned before the one that turns it
     green. That holds for a new requirement's test and for a test that pins a behavior this
     work changes, which moves out of the invariant into the requirement's check, rewritten to
     the new behavior and committed red. At the milestone gate the directory joins the
     project's test command and the invariant. Where no test pins what surrounds a change, add
     a characterization check of what must stay the same, committed green;
   - requirements cover what this work adds or changes, not the whole existing system;
     the invariant and the characterization checks keep the rest.
2. **Investigate (planner), only what decides something.** List the unknowns whose answer
   would change a requirement, a check or the plan: a service's limits, a library's
   behavior, a domain rule, how the existing code really behaves. Settle each from the
   cheapest source that can (the code, running it, official documentation, a small probe)
   and stop as soon as the decision it blocks can be made. Record each answer with its
   source and date under `## Facts` in `.ultra/design.md`; longer notes go under
   `.ultra/records/research/` with a link. An unknown nothing depends on is not investigated.
3. **Interview (interviewer).** Ask the Owner only what the survey and investigation cannot
   settle, one question at a time, each with your recommended answer and what would change
   it, in this order: the north star (for whom, and what they get), success and abandon
   conditions, the boundary (what is out; for existing code, what must not change), what
   "elegant" means here, the milestone split, and how the Owner would tell each user-visible
   behavior is done. Write `.ultra/records/interview.md`: each question, the Owner's answer
   verbatim, then your reading, facts apart from decisions. Stop when every requirement you
   are about to write has an Owner sentence behind it. Three to five questions is normal;
   needing more means you are asking for decisions you can make: make them, log a ruling.
4. **Confirm.** Write the spec and checks (next section), then show the Owner the Direction
   and every `Done when` line in plain words, not the interface details, and ask them to
   confirm or correct; record it as an `interview` touch. A correction before the gate is
   an edit, not a plan change.

## Project knowledge (`.ultra/design.md`)

`.ultra/design.md` is what the project knows now; `.ultra/rulings.md` is why it changed.
Keep three sections, short enough to fit every brief (longer notes go in `.ultra/records/`):

- `## System`: how it is built, run and tested; the modules and which one owns which data.
- `## Decisions`: the design decisions in force (L2), one line each with the date of the
  ruling that made it. Delete a line a later ruling replaced; the ruling keeps the history.
- `## Facts`: what investigation settled, each with its source and date, then the open unknowns.

The planner writes it; a writer never edits it. Every brief carries it under `## Project`,
after the spec's Direction and Interface, so each writer starts from what earlier writers
settled. A writer's L2 ruling and the "what dependent nodes must know" of its handoff are
proposals: the controller folds the ones that hold into the design at Node loop step 4. The
cleaner checks the design against the code and reports where they part. It is engine-owned:
editing it never stales evidence. It is guidance, not acceptance: a rule a machine can check
becomes an invariant, and a convention every check relies on goes in the spec's
`## Interface`. A brief over budget means: move detail to `.ultra/records/research/`.

## Specification and checks (planner, acceptance author)

`.ultra/spec.md`:

- Begin with `## Direction` (L0): north star, users, success and abandon conditions,
  boundary, the meaning of elegance. Only the Owner changes this section.
- Then one `## REQ-<id> <title>` block per user-observable behavior: what the user does and
  sees, then a line `Done when: <the Owner's acceptance sentence>`. Small fixes and internal
  structure are not requirements.
- How a user installs, runs, configures and recovers the product is user-observable too: make
  the user documentation (for example the README) a requirement whose `Done when` a new user
  can follow (on existing code, when this work changes how a user installs, runs, configures
  or recovers it, or a behavior it already describes), and change it whenever a behavior it
  describes changes. Its check reads the documentation from inside a test file: a file a
  check's `run` names is off limits to every drive writer (`check-touched`). A constraint a
  handoff reports that a user must know (for example "two servers must not share one data
  file") is an L1 change of that requirement (on existing code without one, of the requirement
  it constrains).

Checks (acceptance author, never the writer):

- Every requirement has a covering check; every milestone has a `journey` check that walks the
  user's whole path through the milestone, through the real interface.
- A requirement is green only when every check covering it passes. So a check covers only the
  requirements it proves on its own, and a journey covers only the requirement for the user's
  path (for example the web page), not every requirement it passes through: otherwise the
  first node cannot finish until the last node's interface exists.
- Anything a check needs from the code (start command, port and data variables, a ready line,
  markers in a page) is written in the spec as interface (L2), so a writer can meet it.
- `expect` must prove the tests ran: match the line of a test the check relies on, for example
  `^\s*✔ an expired link answers 410` with `node --test --test-reporter=spec` (a test inside
  `describe` is indented), or another runner's line for a named test. A pass count is not
  enough: a file or a name filter that ran no test still prints `ℹ pass 1`.
- Commit the test files before any implementation and run `ubp check`: every new check must be
  red or unknown, no test this commit adds or rewrites red is in an invariant's run (read its
  `run`), and every invariant that was green before this commit is still green (a red one has
  a red test in its run: Start step 1). A check that is green before the code exists proves
  nothing, except a characterization check of existing code, which pins what already works.
- For each key requirement, break the finished implementation once and see its check fail.
- A check never reads `.ultra/records/` or `.ultra/design.md`.

## Plan (planner)

`.ultra/plan.json`: milestones in delivery order, each with its requirements and `journey`;
nodes in plan order, each with `covers`, `depends` and `scope`.

- A node is one writer session: one to three requirements, a few path prefixes of scope, and
  a brief that fits the default budget (`ubp context` exits 1 when it does not: split it).
- `depends` names the nodes whose interfaces this node uses, whose code it changes, or whose
  conventions it must keep: only their handoffs reach its brief. A convention every node must
  keep belongs in `.ultra/design.md` instead, which reaches every brief. Reordering `depends`
  is free (L3) and is not a recorded plan change; log a ruling when you change it after the gate.
- The planner does not write product code.
- Before the gate, read the requirements against each other. Two that cannot both hold (for
  example "each create gives a new code" and "creating the same link twice returns the first
  code") are an L1 conflict for the Owner; a writer must never be left to pick one.
- Run `ubp gate` until it passes; it records the plan baseline.
- Project setup, once: `.ultra/.runtime/` in `.gitignore`, and
  `.ultra/ledger/*.jsonl merge=union` in `.gitattributes`.
- Commit the truth files, ledger, design and records (`.ultra/spec.md`, `checks.json`,
  `plan.json`, `design.md`, `rulings.md`, `ledger/`, `records/`) in their own commit after the
  gate passes and after each milestone closure; committing them never stales evidence.

## Node loop (controller and writer)

1. `ubp context <node> > .ultra/.runtime/briefs/<node>.md`.
2. Start a fresh writer with that brief, the workspace path and how to call `ubp`, and ask
   it to say in its handoff what it noticed and left unchanged and what behavior no check
   pins (the milestone demo lists them). Nothing else from your conversation goes in: what
   the writer needs belongs in the spec, `.ultra/design.md`, the checks, the scope or a
   dependency's handoff. The writer must be able to run the checks where it works (a sandbox
   that forbids listening on a local port cannot run a server's checks); a writer that
   cannot is the wrong writer for that node, not a reason to weaken a check.
3. The writer works test-first inside the scope, commits, runs the `ubp check <ids>` line of
   its brief until those checks are green, writes `.ultra/records/handoffs/<node>.md`, and
   runs `ubp node done <node>`.
4. Verify, as controller: `ubp status --json` shows the node `done`; `git diff` of the
   writer's commits stays inside the scope, touches no check file and no `.ultra/design.md`,
   and adds no line to `.ultra/ledger/approvals.jsonl` (a writer never approves); `ubp gate`
   still passes (it validates the rulings the writer added); `ubp check` (every stale or
   unknown check) turns no requirement of the current or a closed milestone from green to red
   (ratchet). A violation is reverted in a new commit and the node is briefed again. Then
   fold what the node settled into `.ultra/design.md` (its L2 rulings that hold, what its
   handoff says dependents must know), commit `.ultra/`, and paste the status line.
5. Exits: converged (node done) → the next item; stalled (three attempts left a check red)
   or impossible → "Escalation".

A node made `stale` by a requirement edit, whose checks are already green on the committed
code, needs no writer: the controller runs `ubp node done <node>`. When its checks are red,
brief a fresh writer with the new `ubp context`; the latest rulings and the review that led
to the edit go into the mission, not into the writer's memory.

One writer at a time on one work tree. Brief the next writer on a tree only after the
previous writer's completion notice has arrived: a progress note, a `node done` line or a
quiet log is not completion, and a writer still running will commit whatever it finds in the
tree. Parallel writers: see "Parallel writers and the merge gate".

When the Owner asks for an unattended run, read `references/drive.md` first: how to start
`ubp drive` in the background (in Claude Code, Bash `run_in_background`), relay each of its
progress lines to the Owner as it arrives, and handle every `stop`, `drive-running` included.

## Escalation (RESULT §3.2)

Before acting, name the layer the problem lives in. Never change a check to get past it.

| Finding | Layer | Decides | Action |
|---|---|---|---|
| a fact nobody knows (a service, a library, a domain rule, how existing code behaves) | first | planner | investigate as in "Start" step 2, record the answer in `.ultra/design.md`, then name the layer of what it changes |
| the implementation is wrong | L4 | writer | retry inside the node, at most three attempts |
| a design or interface does not work | L2 | planner | ruling; change `.ultra/design.md` and the plan; `ubp gate` |
| an acceptance is wrong | L1 | planner | add or modify with a ruling; edit spec and checks; `ubp gate` |
| two requirements conflict (both cannot hold) | L1 | Owner | stop and ask which holds; never leave a writer to pick; narrowing the other is a reduction |
| a requirement must be deleted or narrowed | L1 | Owner | stop and ask; act only on approval |
| the direction or success criteria are wrong | L0 | Owner | stop and ask |

When two repairs fail and both point at the same premise, test that premise before
choosing a layer.

## Milestone gate

When `next` is `里程碑门`:

1. When this milestone's tests wait in its own test directory (Start step 1), first add that
   directory to the project's test command and to the invariant's `run` (or drop its exclusion),
   with a ruling that quotes the `run` before and after (the engine records no plan change for
   an invariant); `ubp gate`, commit. Then `ubp check --all`. Every check covering a requirement
   of this milestone or of a closed milestone, and every invariant, must be green; checks of
   later milestones may be red. Then repeat it in a clean checkout of HEAD
   (`git worktree add --detach <temp> HEAD`, install what the project needs,
   `ubp check --all --root <temp>`, then `git worktree remove --force <temp>`): a fix that lives
   only in a file Git ignores or hides passes here while HEAD lacks it. A check green here and
   red there is a stop: find the file and commit it. Then `ubp retro` (see "Keeping it tidy").
2. Whole-branch review. Give a reviewer who wrote none of the milestone's code the milestone
   id, the workspace, how to call `ubp`, and `references/review.md`, the one set of reviewer
   instructions: what it reads (the Owner's words and `.ultra/design.md` among them), how it
   uses the product and breaks the checks, the Owner's bar (a check that could be stronger
   never blocks), and the review file, `.ultra/records/milestones/<milestone>-review.md`,
   ending in exactly one line `Verdict: accept` or `Verdict: revise`. Brief it with that
   file, not your summary of it. On `revise`, keep that review as `<milestone>-review-<n>.md`,
   triage every blocking finding with "Escalation" (a fix that narrows a requirement goes to
   the Owner first), change the spec and the checks as acceptance author, `ubp gate`, rework
   the stale nodes through the node loop, and review again.
3. Demo for the Owner, in this order: what to try by hand (the journey in user terms), the
   journey check's result and log path, the progress line, the plan changes since the
   previous closure (`.ultra/ledger/plan-log.jsonl`), the rulings since then, the repeated
   failure classes from `ubp retro` and what you changed for each, the count of `unplanned`
   Owner touches, the verdict and which commits the accepting review read. Then list, defects
   first, what the reviews put under `What must be said to the Owner` and what the writers'
   handoffs (`.ultra/records/handoffs/`) say is unfinished, noticed and left unchanged, or
   pinned by no check.
4. Ask the Owner one question: let the milestone pass, or change direction. Their reply,
   verbatim, is `--owner`. Never answer this by proxy while the step-3 list holds a defect:
   fix it first, or ask the Owner. A defect you fix, or an item the Owner wants done now, is a
   change handled under "Changes after 0→1"; the gate then starts again at step 1, with a
   full review.
5. `ubp milestone close <milestone> --owner "<words>" --review <review path>`, adding
   `--proxy` when you answered for the Owner. The review path is
   `.ultra/records/milestones/<milestone>-review.md`; the engine refuses another milestone's.
   Then commit `.ultra/`.

## Changes after 0→1

An Owner message during the work, or a finding during it, is a difference in one layer.
Name the layer before touching any file, then follow its row. Every row ends with
`ubp gate` passing and a commit of `.ultra/`; the plan log then holds the diff, and
`ubp status` counts it in `本里程碑计划变更`.

| Difference | Layer | What you do | What the engine does |
|---|---|---|---|
| a new behavior | L1 add | spec block, a red check (commit it before code, its test outside every invariant's run until the milestone gate: Start step 1), a node; gate | new node `ready`; no other node changes state; every check is stale until `ubp check` (the new check file is code) |
| a behavior changes | L1 modify | edit the block, its checks; a test inside an invariant that pins the old behavior moves into the requirement's check first (Start step 1); gate | only nodes covering it turn `stale`; brief a writer with the new `ubp context` |
| a behavior goes away or asks for less | L1 reduce | ask the Owner first (touch `reduction`); `ubp approve <milestone>/<id>… --owner "<words>"` (add `--proxy` when you answered for them); then edit | the gate refuses (`reduction-unapproved`) any dropped requirement, dropped check or narrowed check coverage without that record |
| how it is built changes | L2 | a ruling; edit `.ultra/design.md` and the plan (usually a new node, or new `depends`); gate | the new node runs; requirement texts are unchanged, so no other node turns stale |
| a shared convention changes (`## Interface`) | L2 | as above, plus edit the shared text | every node and check turns `stale` (`shared-changed`): rerun every check; a node whose checks are green again needs only `ubp node done` |
| direction or success criteria | L0 | stop and ask the Owner | — |

After any of these, the controller runs `ubp check` (every check is stale after any code
commit: the ratchet) and confirms that no requirement of the current or a closed milestone
went from green to red.

The engine sees removals, not meaning: rewording a requirement so it asks for less,
changing a check's `run` or `expect` so it proves less, or deleting a convention from the
shared text all pass the gate as modifications. Weakening a test inside a check's file never
reaches the gate or the plan log at all (a check's fingerprint covers only `run`,
`timeout_sec` and `expect`); it only makes checks stale like any code commit. So judge by
who gets less: when an input that worked before is now refused, or a user who got something
now gets less, the edit is a reduction even if it only adds a sentence (for example "a data
file with a repeated code now stops the server"). Classify it yourself and record the Owner's
approval with `ubp approve` before making it. An approval answers the plan as it stands: gate
any other change of that milestone, or close it, and the approval no longer counts, so
approve, edit and gate in one go (approving after a refused gate also works).

The engine does not know who approves: `ubp approve` without `--proxy` is accepted from
anyone. Only the controller runs it, only after the matching line in
`.ultra/records/owner-touches.md`, and with `--proxy` whenever that line says `proxy: yes`.

An L2 change re-opens no finished node: the engine has no per-module invalidation, only none
(a new node) or everything (`shared-changed`). The ratchet protects finished behavior; when
the new design makes a finished node's code wrong without failing a check, plan a node for
that change instead of editing the code inside another node's scope.

Interface details that concern one requirement go in that requirement's block, so changing
them stales only its nodes.

## Keeping it tidy (cleaner)

The ratchet keeps old behavior working. These three keep the code from decaying as it grows
(RESULT §3.7).

- **Invariants.** A rule the code must always keep (a file size limit, a forbidden import,
  no npm dependency, an existing test suite that must keep passing) is a check with `fix`
  and `covers: []`. `fix` says in one sentence how to repair a violation, so the writer who
  meets it can act without asking. An invariant belongs to no milestone; it blocks
  `node done` and `milestone close` while it is not green, and `ubp check` prints its `fix`
  under a failure. Adding one is a ruling (L2), not a plan change; break the code once and
  see it fail, as for any check. Removing one is a reduction of what the project promises
  itself: log a ruling saying why.
- **Cleanup nodes.** A node with `"kind": "cleanup"` and `covers: []`, whose writer (the
  cleaner) reads the code against the invariants, the Direction's meaning of elegance,
  `.ultra/design.md` and the rulings. It fixes small things inside its scope, reports in its
  handoff where the design no longer matches the code, and turns anything bigger into a new
  node with a ruling, never a large refactor (the first node of Start step 1 that fixes a red
  baseline does what that fix needs). It completes only while every finished
  requirement and every invariant stays green. With `"cleanup_every": K` in `plan.json`,
  the gate requires one at the end of every milestone and after at most K other nodes.
- **Retro.** At every milestone gate, run `ubp retro` (it leaves out a check's red runs before
  its first pass: test-first work is not a failure class; a test that turns red again because
  a review added cases counts as a regression, since the engine cannot tell the two apart).
  Each failure class seen twice or more becomes a change to the environment (an invariant, a
  rule in the spec's interface, a line in `.ultra/design.md`, a helper, a ruling), not
  another one-off fix in the code; say what you did in the demo. A lesson about this method
  itself is a method candidate, never a direct edit of this file.

## Parallel writers and the merge gate

The default is one writer. Run two in parallel only when the plan's frontier holds at least
two ready nodes whose scopes do not overlap and each is a substantial piece of work; reads,
reviews and test runs may run in parallel at any time.

Each parallel writer gets its own branch and work tree; merge each branch with `ubp merge`,
one at a time, after verifying its commits as in Node loop step 4. Read `references/merge.md`
before the first merge: what a branch may change, the setup, the gate and every refusal.

## Owner touches

Every question put to the Owner is one line in `.ultra/records/owner-touches.md`:

```
- <YYYY-MM-DD> <touchpoint> · Q: <question> · A: <answer verbatim> · proxy: yes|no
```

Touchpoints: `interview`, `milestone-gate`, `reduction`, `L0`, `delegation` (the Owner hands
the remaining touchpoints to you: answer them by proxy from then on, except step 4 of the
milestone gate while its list holds a defect), `unplanned`. A run that went as planned has
no `unplanned` line; report the count at every milestone gate. An answer the assistant gave
for the Owner (`proxy: yes`) is not Owner validation; say so wherever it is reported.

## Rulings

Every decision made without asking is one line in `.ultra/rulings.md`:

```
- YYYY-MM-DD Lx 裁决：<decision> — 因为 <reason> — 如果判断错了，代价是 <cost>
```

The plan gate reads it tolerantly: dashes, spaces and colons may differ and `如果判断错了` may
be left out, but a line without its date, layer, decision, reason or cost is refused.

The Owner reads this log at milestone gates instead of being asked along the way; the
current state of the design it changed is in `.ultra/design.md`.
