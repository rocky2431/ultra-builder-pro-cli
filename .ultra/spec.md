# UBP v6 specification

Requirements are the observable phase exits of `thinking/back-to-essentials-20261030/RESULT.md`
§5, as amended by the execution contract in §8. The engine computes their state; nobody
writes progress by hand.

## REQ-P1-stale Editing one requirement invalidates only what depends on it
After the text of one requirement in `.ultra/spec.md` changes, `ubp status` shows that
requirement's linked checks and nodes as stale, and every other check and node keeps its
state.

## REQ-P1-line The progress line is computed and correct
`ubp status` prints `<milestone> · <green>/<total> 绿 …` from files alone, and the five
state counts always add up to the total.

## REQ-P1-unknown Unknown never counts as green
A check that cannot run, times out, is killed, misses its expected output, or ran on a
dirty or changing tree never makes a requirement green.

## REQ-P1-counter The counter is tested
The acceptance suite fails when the counter, the state precedence or the progress line
regresses.

## REQ-REL-gate The package passes its release gate
`npm run verify:release` passes on the committed tree.

## REQ-P2-close A milestone closes only through its gate
`ubp milestone close <id>` records a closure only when the plan gate passes, the tree is
clean, the milestone is current, its nodes are done, its and every closed milestone's
requirements are green, its journey check is green and an accepting review by another role
exists; it records the Owner's words verbatim and marks words given on the Owner's behalf.

## REQ-P2-context A writer gets a compiled, bounded brief
`ubp context <node>` prints the same bytes for the same files: the node's requirement text,
the checks it must turn green, its scope, its dependencies' handoffs and the fixed rules,
within a byte budget, and it reads nothing outside the project's records.

## REQ-P2-records Records never invalidate evidence
Files under `.ultra/records/` (interview, reviews, handoffs, Owner touches) never make the
tree dirty and never make a check stale.

## REQ-P3-precision A change reruns only what it touches
After one requirement's text changes, only the nodes covering it turn stale. After the
shared text (every spec line outside requirement blocks) changes, every node and check
turns stale with the reason `shared-changed`; an edit of whitespace alone changes nothing.
After any code commit every check is stale until it runs again (the ratchet).

## REQ-P3-diff Every change leaves a visible diff
`ubp gate` records each plan change of a milestone in `.ultra/ledger/plan-log.jsonl` with
its diff (requirements added, removed and modified, nodes and checks added and removed,
narrowed coverage, shared text), and `ubp status` counts it in `本里程碑计划变更`.

## REQ-P3-reduction A reduction waits for the Owner
The plan gate refuses (`reduction-unapproved`) a requirement or a check leaving a
milestone, or a check covering less of a milestone, until `ubp approve <milestone>/<id>
--owner <words>` records an approval later than the milestone's latest plan change and
its closure; `--proxy` marks words given on the Owner's behalf.

## REQ-P4-tidy Invariants and cleanup keep the code tidy
A check with `fix` and no `covers` is an invariant: it belongs to no milestone, blocks
`node done` and `milestone close` while it is not green, and `ubp check` prints its `fix`
under a failure. A node of `kind: "cleanup"` covers nothing, waits for every earlier node of
its milestone, and completes only while every finished requirement and every invariant is
green; `cleanup_every` makes the plan gate require one. `ubp retro` lists the failure
classes since the latest closure.

## REQ-P4-merge Parallel work comes in only through the merge gate
`ubp merge <branch> --expect-head <full commit id>` merges in a temporary work tree, runs
every check there, and fast-forwards the main tree only when the finished work stays green:
every invariant, every check of a closed milestone, every check of a finished node (on the
main line or by the branch), and every check of the current milestone that passed before the
merge; another writer's unfinished work only warns. Otherwise it names the conflicting
paths, the forbidden `.ultra/` paths, or the first bad commit of the branch, and the main
tree is unchanged. One merge runs at a time, and a branch changes `.ultra/` only through
evidence and node lines, rulings and records: never the truth files, the plan log, closures
or approvals.

## REQ-P5-drive An unattended run stops wherever a person must judge
`ubp drive --writer <command> [--reviewer <command>]` runs the controller loop without a
person: per node it compiles the brief, runs the writer, and verifies a clean tree, untouched
truth files, the node's scope, the plan gate and the ratchet; a node that is not done gets up
to `--attempts` writers. At the milestone gate it runs the reviewer once. It stops with a
reason at every point where a person must judge, and never closes, approves, reverts or
writes the Owner's records.

## REQ-P5-package One install gives a host the method, the engine and the status line
`npx ultra-builder-pro-cli --claude`, `--codex` or `--all` installs one Skill `ultra` (the
method), a copy of the engine that the Skill names by absolute path, and one SessionStart hook
that prints the `ubp status` line in a project with `.ultra/spec.md` and nothing elsewhere;
`--doctor` reports `healthy`, `--uninstall` leaves nothing the install created, and nothing
of 5.x ships.

## REQ-P6-knowledge A writer works from what the project knows
`.ultra/design.md` holds the project's current understanding: how the system is built, run
and tested (for an existing codebase, its baseline), the design decisions in force, and the
facts settled by investigation with their sources. The planner owns it and writers never
edit it. It is engine-owned: writing or committing it never makes the tree dirty and never
makes a check stale. `ubp context <node>` puts a section `## Project` between the milestone
line and `## Requirements`: the spec's shared text (its lines outside requirement blocks, in
file order, after CRLF→LF, trailing whitespace removed from every line, leading and trailing
empty lines dropped), an empty line, `### .ultra/design.md`, an empty line, and the design's
text read as a handoff is read, or `No design written.` when there is none. The first rule
of the brief names `.ultra/design.md` among the files a writer must not edit. When the brief
still exceeds its budget after the handoffs are shortened, the refusal's hint names
`.ultra/design.md` as a place to shorten.
Done when: a writer's brief contains the Direction, the Interface and `.ultra/design.md`, and
editing `.ultra/design.md` leaves every piece of evidence as it was (contract A1, A2).

## REQ-P6-status The status says what needs rechecking apart from what is not green
A requirement of a closed milestone that is stale while the latest run of every check
covering it passed is to be rechecked: `ubp status --json` counts it in `closed_recheck`,
and the line says `已关闭里程碑 <n> 项待复核`. Every other requirement of a closed milestone
that is not green counts in `closed_not_green`, and the line says `已关闭里程碑 <n> 项未绿`.
Each segment appears only when its count is not zero, `未绿` before `待复核`. `ubp drive
--json` writes to stderr every line the text mode prints to stdout (the run, each action,
each problem and the stop), so a watcher sees each node as it finishes; stdout holds only
the final JSON.
Done when: after a commit that touches only notes, the line says 待复核 instead of 未绿, and
a drive run with `--json` shows each node event on stderr (contract A3, A5).

## REQ-P6-close A milestone closes only on its own review
`ubp milestone close <id> --review <path>` refuses an accepting review whose path, once
normalized, is not `.ultra/records/milestones/<id>-review.md`, with the problem
`review-not-for-milestone` and no closure. A review that is missing or cannot be read is
still refused only as `review-missing`.
Done when: closing a milestone with another milestone's accepting review is refused
(contract A4).

## REQ-P6-method The method starts any project and keeps its knowledge flowing
The installed `ultra` Skill starts a project without `.ultra/spec.md`, new or with existing
code, in four steps: survey what exists (for existing code, `## System` in
`.ultra/design.md`, the existing test command registered as an invariant, and
characterization checks before an unpinned behavior is changed); investigate only the
unknowns whose answer changes a requirement, a check or the plan, recording each answer and
its source in `.ultra/design.md`; interview the Owner for what investigation cannot settle;
and have the Owner confirm the Direction and every `Done when` line. It says who writes and
who reads `.ultra/design.md`; its escalation covers a fact nobody knows; its milestone review
checks the spec against the Owner's recorded words and uses the product through its user
documentation, which is a requirement like any other; the controller reports the status line
after every node and gate step; and every drive stop and merge refusal the engine can return
is handled in a `references/` file the Skill names, keeping `SKILL.md` within 395 lines.
Done when: the method covers the four start steps, the upkeep of `.ultra/design.md`, the
escalation for an unknown fact, the review against the Owner's words, documentation as a
requirement and progress reports, with drive and merge handling in references and
`SKILL.md` no longer than 395 lines (contract A6).
