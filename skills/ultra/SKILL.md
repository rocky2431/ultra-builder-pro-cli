---
name: ultra
description: Drive a project with the UBP v6 engine, from status and the initial interview
  through specification and checks, planning, the node loop, milestone gates, and changes.
---
# Ultra method (UBP v6)

You run a project through one entry point. The engine (`ubp`) owns the truth about
progress; you own judgment. Never write a progress number yourself: quote `ubp status`.

`ubp` always means `node __UBP_ENGINE_CLI__`, the engine bundled with this Skill,
regardless of PATH. Every command takes `--root <dir>` and `--json`. File formats and
exit codes: `__UBP_ENGINE_FORMATS__`.

## Every session starts the same way

1. `ubp status --json`. If `.ultra/spec.md` does not exist, the project has not started:
   go to "0→1 interview".
2. `git log --oneline -10` and `git status --short`.
3. When the current milestone has a `journey`, run it once: `ubp check <journey>`. A red
   journey at the start of a session is the first thing to fix.
4. Choose the step from the status, and from nothing else:

| Status | Step |
|---|---|
| `drive` is set (the line ends with `drive 运行中`) and `UBP_DRIVE` is not (you are not that drive's writer or reviewer) | a drive may be running on this tree. When `ps -o command= -p <drive>` exits 0 and prints a full command line (program and arguments) without the word `drive`, the pid now belongs to another process and the lock is left over: remove `.ultra/.runtime/drive.lock` and read the status again. If `ps` fails, prints nothing or prints only a program name such as `(node)`, treat the drive as running. Otherwise brief no writer, start no drive and change no file: if this session started the drive, wait for its completion notice; if not, tell the Owner it is running (its pid is `drive`) and stop |
| `dirty: true` | commit or discard first; evidence from a dirty tree never counts |
| `gate: "fail"` | fix the reported `problems` (see "Plan") |
| `gate: "stale"` | `ubp gate`, which records the plan change |
| `next` is a node id | "Node loop" for that node |
| `next` is `检查` | `ubp check`, then triage every red or unknown check with "Escalation"; a red invariant prints its `fix` |
| `next` is `里程碑门` | "Milestone gate" |
| `next` is `全部完成` | report the line to the Owner; ask whether to plan another milestone |
| `next` is `无（受阻）` | read `nodes[].state` and `reasons`; repair the plan |

Whenever you report progress to the Owner, paste the line `ubp status` printed.

## Roles

Each step names a role. One agent may play several, with two exceptions: the acceptance
author and the reviewer are never the writer of the code they judge. A writer is a fresh
context: a new subagent or delegated session that sees the node brief and the repository,
not your conversation.

Per node, the default is one fresh writer followed by your verification (Node loop step 4):
no per-node explorer, tester or second reviewer. In a measured comparison on nine nodes,
those extra roles cost three to five times the tokens, scored no higher on hidden checks, and
found one defect between them. Add a read, a review or a test run to a node only when you
judge that node risky. A reviewer from another vendor, when one is available, reviews the
whole branch at the milestone gate.

## 0→1 interview (interviewer)

Goal: the Owner's intent, in their own words, before any specification.

- Ask one question at a time. Each carries your recommended answer and what would change it.
- Cover, in this order: the north star (for whom, and what they get), success and abandon
  conditions, the boundary (what is out), what "elegant" means for this project, the
  milestone split, and for each user-visible behavior how the Owner would tell it is done.
- Write `.ultra/records/interview.md`: each question, the Owner's answer verbatim, then your
  reading, keeping facts apart from decisions.
- Stop when every requirement you are about to write has an Owner sentence behind it.
  Three to five questions is normal. Needing more means you are asking for decisions you can
  make: make them and log a ruling.

## Specification and checks (planner, acceptance author)

`.ultra/spec.md`:

- Begin with `## Direction` (L0): north star, users, success and abandon conditions,
  boundary, the meaning of elegance. Only the Owner changes this section.
- Then one `## REQ-<id> <title>` block per user-observable behavior: what the user does and
  sees, then a line `Done when: <the Owner's acceptance sentence>`. Small fixes and internal
  structure are not requirements.

Checks (acceptance author, never the writer):

- Every requirement has a covering check; every milestone has a `journey` check that walks the
  user's whole path through the milestone, through the real interface.
- A requirement is green only when every check covering it passes. So a check covers only the
  requirements it proves on its own, and a journey covers only the requirement for the user's
  path (for example the web page), not every requirement it passes through: otherwise the
  first node cannot finish until the last node's interface exists.
- Anything a check needs from the code (start command, port and data variables, a ready line,
  markers in a page) is written in the spec as interface (L2), so a writer can meet it.
- `expect` must prove the tests ran, for example `^ℹ pass [1-9][0-9]*$` with
  `node --test --test-reporter=spec`; a filter that matched nothing must not pass.
- Commit the test files before any implementation and run `ubp check`: every new check must be
  red or unknown. A check that is green before the code exists proves nothing.
- For each key requirement, break the finished implementation once and see its check fail.
- A check never reads `.ultra/records/`.

## Plan (planner)

`.ultra/plan.json`: milestones in delivery order, each with its requirements and `journey`;
nodes in plan order, each with `covers`, `depends` and `scope`.

- A node is one writer session: one to three requirements, a few path prefixes of scope, and
  a brief that fits the default budget (`ubp context` exits 1 when it does not: split it).
- `depends` names the nodes whose interfaces this node uses, whose code it changes, or whose
  conventions it must keep (for example "save before responding"): only their handoffs reach
  its brief. Reordering `depends` is free (L3) and is not a recorded plan change; log a
  ruling when you change it after the gate.
- The planner does not write product code.
- Before the gate, read the requirements against each other. Two that cannot both hold (for
  example "each create gives a new code" and "creating the same link twice returns the first
  code") are an L1 conflict for the Owner; a writer must never be left to pick one.
- Run `ubp gate` until it passes; it records the plan baseline.
- Project setup, once: `.ultra/.runtime/` in `.gitignore`, and
  `.ultra/ledger/*.jsonl merge=union` in `.gitattributes`.
- Commit the truth files, ledger and records (`.ultra/spec.md`, `checks.json`, `plan.json`,
  `rulings.md`, `ledger/`, `records/`) in their own commit after the gate passes and after
  each milestone closure. They are engine-owned: committing them never stales evidence.

## Node loop (controller and writer)

1. `ubp context <node> > .ultra/.runtime/briefs/<node>.md`.
2. Start a fresh writer with that brief, the workspace path and how to call `ubp`, and ask
   it to say in its handoff what it noticed and left unchanged and what behavior no check
   pins (the milestone demo lists them). Nothing else from your conversation goes in: what
   the writer needs belongs in the spec, the checks, the scope or a dependency's handoff.
   The writer must be able to run the checks where it works (a sandbox that forbids
   listening on a local port cannot run a server's checks); a writer that cannot is the
   wrong writer for that node, not a reason to weaken a check.
3. The writer works test-first inside the scope, commits, runs the `ubp check <ids>` line of
   its brief until those checks are green, writes `.ultra/records/handoffs/<node>.md`, and
   runs `ubp node done <node>`.
4. Verify, as controller: `ubp status --json` shows the node `done`; `git diff` of the
   writer's commits stays inside the scope, touches no check file and adds no line to
   `.ultra/ledger/approvals.jsonl` (a writer never approves); `ubp gate` still passes
   (it validates the rulings the writer added); `ubp check` (every stale or unknown check)
   turns no requirement of the current or a closed milestone from green to red (ratchet).
   A violation is reverted in a new commit and the node is briefed again.
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

When the Owner asks for an unattended run, give every node a `scope` that holds no check
file, commit everything, and start `ubp drive --writer <cmd> --reviewer <cmd> --json` in the
background, then wait for its completion notice: a drive runs for many writers, and a
foreground call is bounded by the host's command timeout (at most 10 minutes in Claude Code).
In Claude Code, run it with Bash `run_in_background`; on a host without background
commands, run `mkdir -p .ultra/.runtime`, start
`nohup <drive command> > .ultra/.runtime/drive.json 2> .ultra/.runtime/drive.err &`, tell
the Owner it is running and stop: a later session sees it in `ubp status` and, once `drive`
is null, reads `drive.json`, or `drive.err` when the drive printed no result. The writer command hands an agent `$UBP_BRIEF` and tells it to call the engine as
`eval "$UBP <args>"` (a login shell can put another `ubp` first on `PATH`). Headless Claude
Code examples are `docs/examples/drive/claude-writer.sh` and `claude-reviewer.sh` in the
ultra-builder-pro-cli package and repository; `--writer` takes a shell command line, so quote
a path that holds a space (`--writer "'<path>'"`). When the drive stops, first put back what
the stop names: each truth file a `truth-touched` problem names to its content at HEAD
(deleted when HEAD has none; `.ultra/ledger/` holds three, `milestones.jsonl`,
`approvals.jsonl` and `plan-log.jsonl`), what the reviewer changed on `reviewer-changed-tree`,
and the branch itself on `history-rewritten` (below). Only then commit the records the drive
left in `.ultra/ledger/` (records never dirty the tree, so the drive does not), and act on
`stop`:
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
- `drive-running`: another drive holds this tree; this one started nothing. Follow the
  status table's first row. When `ubp status` shows no `drive`, the lock holds no live pid
  (a drive killed while taking it): remove `.ultra/.runtime/drive.lock` and start the drive
  again. Never remove it while its pid runs a drive.

## Escalation (RESULT §3.2)

Before acting, name the layer the problem lives in. Never change a check to get past it.

| Finding | Layer | Decides | Action |
|---|---|---|---|
| the implementation is wrong | L4 | writer | retry inside the node, at most three attempts |
| a design or interface does not work | L2 | planner | ruling; change the design and plan; `ubp gate` |
| an acceptance is wrong | L1 | planner | add or modify with a ruling; edit spec and checks; `ubp gate` |
| two requirements conflict (both cannot hold) | L1 | Owner | stop and ask which holds; never leave a writer to pick; narrowing the other is a reduction |
| a requirement must be deleted or narrowed | L1 | Owner | stop and ask; act only on approval |
| the direction or success criteria are wrong | L0 | Owner | stop and ask |

When two repairs fail and both point at the same premise, test that premise before
choosing a layer.

## Milestone gate

When `next` is `里程碑门`:

1. `ubp check --all`. Every check covering a requirement of this milestone or of a closed
   milestone, and every invariant, must be green; checks of later milestones may be red.
   Then repeat it in a clean checkout of HEAD (`git worktree add --detach <temp> HEAD`,
   install what the project needs, `ubp check --all --root <temp>`, then
   `git worktree remove --force <temp>`): a fix that lives only in a file Git ignores or
   hides passes here while HEAD lacks it. A check green here and red there is a stop: find
   the file and commit it. Then `ubp retro` (see "Keeping it tidy").
2. Whole-branch review. A reviewer who wrote none of the milestone's code reads the
   milestone's diff (from the previous closure commit, or from the start), its requirements,
   the plan-log changes, the rulings and the writers' handoffs since the previous closure.
   Ask it to drive the product by hand and to run the checks against deliberately broken
   copies of the code: a check that passes on a broken copy is an acceptance gap. The Owner's
   rule (2026-11-02) is that a check that could be stronger never blocks, so every round uses
   one bar: a finding blocks only when the product, as HEAD builds it, breaks a requirement's
   `Done when` line or the Direction, or does something wrong that a person can reproduce
   through its real interface. Wrong means it contradicts the text of the spec (a
   requirement, the Interface or the Direction), loses or corrupts data, crashes, or opens a
   security hole. An acceptance gap does not block once the reviewer has driven HEAD through
   its real interface on the input the broken copy got wrong and seen it behave correctly:
   it quotes what HEAD did, names the check that would close the gap under
   `What must be said to the Owner`, and the verdict stays `accept`. The review,
   `.ultra/records/milestones/<milestone>-review.md`, holds a first line `Reviewer: <who>`,
   the findings that block (each naming the `Done when` line, the Direction or the
   reproduction it rests on), a section `What must be said to the Owner` with everything
   else, then exactly one line `Verdict: accept` (no finding blocks) or `Verdict: revise`.
   Quote an earlier verdict only inside a code fence. On `revise`, keep that review as
   `<milestone>-review-<n>.md`, triage every blocking finding with "Escalation" (a fix that
   narrows a requirement goes to the Owner first), change the spec and the checks as
   acceptance author, `ubp gate`, rework the stale nodes through the node loop, and review
   again. A review after a `revise` also checks each blocking finding of that review and
   looks for regressions.
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
   `--proxy` when you answered for the Owner. Then commit `.ultra/`.

## Changes after 0→1

An Owner message during the work, or a finding during it, is a difference in one layer.
Name the layer before touching any file, then follow its row. Every row ends with
`ubp gate` passing and a commit of `.ultra/`; the plan log then holds the diff, and
`ubp status` counts it in `本里程碑计划变更`.

| Difference | Layer | What you do | What the engine does |
|---|---|---|---|
| a new behavior | L1 add | spec block, a red check (commit it before code), a node; gate | new node `ready`; no other node changes state; every check is stale until `ubp check` (the new check file is code) |
| a behavior changes | L1 modify | edit the block, its checks; gate | only nodes covering it turn `stale`; brief a writer with the new `ubp context` |
| a behavior goes away or asks for less | L1 reduce | ask the Owner first (touch `reduction`); `ubp approve <milestone>/<id>… --owner "<words>"` (add `--proxy` when you answered for them); then edit | the gate refuses (`reduction-unapproved`) any dropped requirement, dropped check or narrowed check coverage without that record |
| how it is built changes | L2 | a ruling; edit the design, the plan (usually a new node, or new `depends`); gate | the new node runs; requirement texts are unchanged, so no other node turns stale |
| a shared convention changes (`## Interface`) | L2 | as above, plus edit the shared text | every node and check turns `stale` (`shared-changed`): rerun every check; a node whose checks are green again needs only `ubp node done` |
| direction or success criteria | L0 | stop and ask the Owner | — |

After any of these, the controller runs `ubp check` (every check is stale after any code
commit: the ratchet) and confirms that no requirement of the current or a closed milestone
went from green to red.

The engine sees removals, not meaning: rewording a requirement so it asks for less,
changing a check's `run` or `expect` so it proves less, or deleting a convention from the
shared text all pass the gate as modifications. Weakening a test inside a check's file never
reaches the gate or the plan log at all (a check's fingerprint covers only `run`,
`timeout_sec` and `expect`); it only makes checks stale like any code commit. Classify such an
edit as a reduction yourself and record the Owner's approval with `ubp approve` before making
it. An approval answers the plan as it stands: gate any other change of that milestone, or
close it, and the approval no longer counts, so approve, edit and gate in one go (approving
after a refused gate also works).

The engine does not know who approves: `ubp approve` without `--proxy` is accepted from
anyone. Only the controller runs it, only after the matching line in
`.ultra/records/owner-touches.md`, and with `--proxy` whenever that line says `proxy: yes`.

An L2 change re-opens no finished node: the engine has no per-module invalidation, only none
(a new node) or everything (`shared-changed`). The ratchet protects finished behavior; when
the new design makes a finished node's code wrong without failing a check, plan a node for
that change instead of editing the code inside another node's scope.

Interface details that concern one requirement go in that requirement's block, so changing
them stales only its nodes. A brief carries requirement text only: when the shared text
changed, quote the changed lines in the writer's mission.

## Keeping it tidy (cleaner)

The ratchet keeps old behavior working. These three keep the code from decaying as it grows
(RESULT §3.7).

- **Invariants.** A rule the code must always keep (a file size limit, a forbidden import,
  no npm dependency) is a check with `fix` and `covers: []`. `fix` says in one sentence how
  to repair a violation, so the writer who meets it can act without asking. An invariant
  belongs to no milestone; it blocks `node done` and `milestone close` while it is not
  green, and `ubp check` prints its `fix` under a failure. Adding one is a ruling (L2), not
  a plan change; break the code once and see it fail, as for any check. Removing one is a
  reduction of what the project promises itself: log a ruling saying why.
- **Cleanup nodes.** A node with `"kind": "cleanup"` and `covers: []`, whose writer (the
  cleaner) reads the code against the invariants, the Direction's meaning of elegance and
  the rulings. It fixes small things inside its scope and turns anything bigger into a new
  node with a ruling, never a large refactor. It completes only while every finished
  requirement and every invariant stays green. With `"cleanup_every": K` in `plan.json`,
  the gate requires one at the end of every milestone and after at most K other nodes.
- **Retro.** At every milestone gate, run `ubp retro` (it leaves out a check's red runs before
  its first pass: test-first work is not a failure class; a test that turns red again because
  a review added cases counts as a regression, since the engine cannot tell the two apart).
  Each failure class seen twice or more becomes a change to the environment (an invariant, a
  rule in the spec's interface, a helper, a ruling), not another one-off fix in the code; say
  what you did in the demo. A
  lesson about this method itself is a method candidate, never a direct edit of this file.

## Parallel writers and the merge gate

The default is one writer. Run two in parallel only when the plan's frontier holds at least
two ready nodes whose scopes do not overlap and each is a substantial piece of work; reads,
reviews and test runs may run in parallel at any time.

- Each parallel writer gets its own branch and work tree (`git worktree add`), runs its
  checks and `ubp node done` there, and commits its ledger lines with its code. A branch never
  changes `spec.md`, `checks.json` or `plan.json`, and never approves or closes: the merge
  refuses it (`truth-changed`); such a change is the planner's or yours, on the main line.
- Before merging: the project setup line `.ultra/ledger/*.jsonl merge=union` is committed in
  `.gitattributes` (without it two writers' evidence conflicts); `.ultra/` is committed on
  the main line (otherwise `dirty-tree`, naming the paths); and you have verified the
  branch's commits as in Node loop step 4 (scope, no check file, no approval line). The merge
  does not check scope or check scripts.
- Merge with `ubp merge <branch> --expect-head "$(git rev-parse HEAD)"`: a full commit id,
  never the word `HEAD`. One merge at a time; a second is refused `merge-busy`. The engine
  merges in a temporary work tree, refuses a branch that changes anything under `.ultra/`
  except evidence and node lines, rulings and records (`truth-changed`), refuses a merged
  tree that fails the plan gate (`merged-gate`, for example a malformed ruling), runs every
  check there, and fast-forwards only when the finished work stayed green: every invariant,
  every check of a closed milestone, every check of a node with a completion record (on the main
  line or by the branch), and every check of the current milestone that passed before the merge.
  The other writer's unfinished node only adds a `warning`; it never blocks.
- On refusal: `head-moved`, re-read HEAD and retry; `plan-gate`, run `ubp gate` on the main
  line, commit `.ultra/`, retry; `nothing-to-merge`, the branch is already in; `merge-busy`
  that persists while no merge runs, delete `.ultra/.runtime/merge.lock` and retry;
  `merge-conflict`, the branch's writer resolves it on the branch (a conflict under
  `.ultra/ledger/` means the `merge=union` line is missing); `truth-changed`, the branch must
  drop that change (a plan change is yours, on the main line); `merged-gate`, the writer
  fixes the ruling on the branch; `check-not-green` with `first bad commit …` or `the branch
  marks <node> done`, brief that branch's writer again with it; `not green at HEAD before the
  merge`, finished work is red on the main line, fix it there first (a requirement added to
  a closed milestone is red until built: merge the branch that builds it first);
  `fast-forward-failed`, the main tree changed during the merge, restore it, commit `.ultra/`
  and retry. Exit 2 is
  not a refusal: read its `Git failed: …` reason (identity, a hook, signing) and fix that.
  Any other `warning` names a temporary tree the engine could not remove.
- The merged tree resolves modules from the main tree's installed dependencies: install a
  dependency the branch adds on the main line before merging it.
- After each merge, run `ubp check --all` in the main tree (a branch's evidence lines are
  not trusted until then) and commit `.ultra/` before the next merge.

## Owner touches

Every question put to the Owner is one line in `.ultra/records/owner-touches.md`:

```
- <YYYY-MM-DD> <touchpoint> · Q: <question> · A: <answer verbatim> · proxy: yes|no
```

Touchpoints: `interview`, `milestone-gate`, `reduction`, `L0`, `delegation` (the Owner hands
the remaining touchpoints to you: answer them by proxy from then on, except step 4 of the
milestone gate while its list holds a defect), `unplanned`. A run that went as planned has
no `unplanned` line; report the count at every milestone gate. An
answer the assistant gave for the Owner (`proxy: yes`) is not Owner validation; say so
wherever it is reported.

## Rulings

Every decision made without asking is one line in `.ultra/rulings.md`:

```
- YYYY-MM-DD Lx 裁决：<decision> — 因为 <reason> — 如果判断错了，代价是 <cost>
```

The plan gate reads it tolerantly: dashes, spaces and colons may differ and `如果判断错了` may
be left out, but a line without its date, layer, decision, reason or cost is refused.

The Owner reads this log at milestone gates instead of being asked along the way.
