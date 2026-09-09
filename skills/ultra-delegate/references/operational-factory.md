# Operate bounded factory runs

This is the Stage D operational method over the existing finite RunSlice, not a
second plan or semantic controller. Read the accepted intent, current task context,
relevant project facts, latest results and current qualification first. The Primary
selects every route, profile, scope, wave, repair and completion decision under the
current owner authority. Existing files alone never activate another slice.

## Choose proportionate work

Use Solo for tightly coupled changes, small edits or work whose shared interface is
still changing. Ask a fresh read-only Challenger when an uncertain decomposition or
interface could cause material rework. Use multiple scoped workers only when there
are genuinely independent seams and expected useful overlap. Preserve the required
independent final assessor even when implementation is Solo; never merge writer and
assessor authority to reduce overhead.

`profiles/pi-foundation-v1.json` maps independent seams to Luna/Terra;
`profiles/pi-balanced-v1.json` maps them to Terra/Sol. Both retain a Sol Challenger
and Astra assessor. Their qualification fields bind the same exact observed Pi
permission/runtime contract; the model assignments are explicit per-run choices,
not a silent replacement of another Profile or a claim of performance benefit.
Use only currently qualified Host/transport identities. If a route or model is
unavailable, report that fact; another profile or provider requires a current
model/owner selection within the existing grant. No automatic fallback.

## Prepare a wave

Keep one canonical task context. Worker instructions reference its relevant facts,
accepted interfaces, current base and exact writable seam; do not invent a second
knowledge authority or send unrelated transcripts. The Primary writes the actual
instruction and permission files and chooses a clean committed base. The qualified Pi delegate
envelope permits inspection and scoped edits, but denies Bash/execute. Workers may
author checks; the Primary executes them after integration. Preserve denied effects
and never describe unexecuted Worker checks as passing.

Create a registered clean detached worktree with the existing public CLI:

```bash
ubp slice workspace create --run <run-id> --tree <tree-id> \
  --base <exact-commit> --session <native-session-id>
```

The returned record names `.ultra/.runtime/worktrees/<run>/<tree>`. Create the
permission's writable directories in the committed base first. Registration of an
already-created tree uses `workspace register` with the same run/tree/session.
A failed registration retains the real Git worktree; it does not delete work to
make a retry look successful.

For mechanical digest assembly, write `ultra-run-slice-draft-v1` using the same
fields as RunSlice v1, except intent/grant/profile/seam and each attempt's
instruction/permission are plain repository-relative paths, and task_refs contain
only id/path. All role, model, scope, session, base and budget choices remain in
that model-authored draft. Compile it once:

```bash
ubp slice compile --draft <draft.json> --output <slice.json> \
  --session <native-session-id>
```

Compilation captures current file digests and runs the same whole-slice admission.
It creates only a new immutable packet, never starts a worker or fills in semantic
choices. Unknown fields, drift, overlapping trees or unqualified roles are errors;
correct the model-owned draft rather than bypassing them. An existing output is
never overwritten.

## Give a read-only reviewer usable inputs

A delegate works in its registered worktree and has an exact writable envelope;
the shared native permission contract does not define a readable-roots sandbox.
Put authorized baseline and current check observations inside that committed tree,
or embed their exact relevant bytes in its instruction, so the handoff is portable
and explicit. Ignored Primary `probe/` files are not included by Git worktree creation.
Only provide authorized review inputs; do not infer permission to inspect unrelated
host files from read-tool capability, execute denied commands, or invent a native
identity, timestamp or digest.

For an owner-selected external-manual Task Review, read the existing
[receipt contract](../../ultra-plan/references/task-evidence-v2.md). Supply an inline
JSON specimen with the exact observed subject, contract and authority fields. Give
the reviewer its registered role/attempt identity as a string and an actual recorded
dispatch timestamp, explicitly labelled as the start of this review observation.
Native terminal model/session facts remain separate launcher observations. The
reviewer alone chooses its verdict and findings and originates the complete receipt.

Return that receipt as one raw JSON string in the typed result's evidence array;
Base64 is unnecessary. The Primary saves that exact string unchanged and invokes
the existing receipt sensor. Do not normalize or repair reviewer bytes. A schema or
subject mismatch remains a failed observation within the existing Review budget.
Retained test logs are inspected evidence, not independently executed tests.

## Receive external controller attention

The native `ultra_slice` tool accepts `delivery: message` for the selected Pi W3
path. It starts a separate finite controller using private Node process IPC;
`background` remains the in-process W2 mode and `wait` remains W1. The selected Pi 0.85.1 native runtime was observed with normal W1/W2/W3, duplicate
input, pre/post-consumption death and lost-controller explicit reconciliation.
Other runtime/Host identities require their own qualification; this is no W4 claim.

The channel is bound to the original child process and native session. Its message
contains only run/slice/session identity and an attention digest; it accepts no
arbitrary prompt, semantic command, provider/session credential or fallback. The
Primary rereads the original registered attention before queueing native input.
The controller receives the existing filtered environment, and delegated processes
retain their own explicit stdio so they do not inherit the Primary IPC descriptor.

A process message is not consumption. The same native input, user-message and
explicit `ultra_attention_ack` observations used by W2 remain required. Duplicate
messages never replay the event. A lost channel returns delivery_unknown and an
operator-visible reconciliation notice; it does not start another controller or
writer. Explicit reconciliation can return existing causal facts for a current
authorization decision. Session shutdown cancels a pending controller through the
original finite cancellation path; it never starts a fresh session. This is W3,
not W4 or a durable conductor.

## Continue or stop

After each attention, retain successful artifacts, inspect failures and decide
whether integration, one targeted repair, a different qualified profile or stopping
best serves the current intent. The controller never makes this choice. Every next
slice has a new identity, the current committed base, fresh exact task/interface/
permission refs and a finite deadline/attempt timeout. Old QA or E2E cannot certify
new source. Revalidate the actual integrated revision and use the existing bounded
P0/P1 delta Review when a blocking repair changed the reviewed subject.

Keep the run's maximum waves, repair count, total wall/provider budget and allowed
profiles in the current grant/task context before launch. Check the remaining
budget before each slice. The native tool admits only one outstanding background
or message slice; max_concurrency bounds the slice's actual fan-out. Cancellation
and partial failure use existing result/writer/fence facts. A rate limit or provider
error is a recorded failure requiring a bounded model decision, not a hidden retry,
new grant or provider switch. When a writer is uncertain, preserve its tree/fence
and stop conflicting work even if other workers succeeded.

Use `ubp slice status` and `workspace status` for derived run/tree facts. The owner
needs the current outcome, blocker, remaining boundary and any decision needed;
raw transport records do not replace that explanation. Read the existing task
context/results after an attention, not repeated model polling while waiting.

## Preserve and clean up

`workspace cleanup --run <id> --tree <id> --session <id>` acquires the same existing
worktree fence used by delegates. Any active/unknown fence blocks cleanup. Dirty, untracked
or ignored output also blocks cleanup and remains in place. After the Primary
has intentionally committed the output in that worktree, cleanup retains its exact
HEAD under `refs/ultra/workspaces/<run>/<tree>` before ordinary `git worktree remove`.
This preserves even an unmerged detached commit; there is no force-delete path or
automatic source commit. A substituted tree/session/ref is refused. Cleanup is a
mechanical effect, never product acceptance or authority to discard work.

## Record outcomes

Use the existing Task Evidence/Review/Test/Deliver consumers. Record the immutable
task/acceptance, selected profile/route, all role calls and costs, real overlap,
operator input, original failures, repair count, final subject and assessor. Keep
failed attempts and total coordination cost. Compare qualified profiles with fair
Solo and the previous finite method across repeated task shapes; a slower or less
reliable configuration remains limited or unused. No count of agents, passing
transport schema or single success proves useful operation.

Classify failures from original results and actual observations: admission/identity,
provider/tool, implementation/integration, review/evidence, or lifecycle/unknown.
Preserve original typed failure_type rather than replacing it with a guessed cause.
A proposed routing/profile/context change is a candidate with an explicit scope and
measurement plan. It cannot change cross-task defaults until the separate baseline/
held-out and owner promote/reject process is completed.
