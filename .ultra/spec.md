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
