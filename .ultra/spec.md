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
