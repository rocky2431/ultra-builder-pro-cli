---
name: ultra-delegate
description: Delegate one bounded workflow segment to another installed Agent runtime through a conformance-gated ACP or CLI driver in an isolated worktree, then return only its stable result artifact. Use when the owner asks for another model or host to execute, review, verify, or continue a specific slice of current work.
---

# Run a bounded worker without giving it project authority

Delegation is an execution mode, not another workflow stage. The primary host keeps
semantic synthesis and remains the only writer of `.ultra/tasks.json`.

Delegation is also not a primary transfer. A delegated worker never becomes the
work package's canonical writer, whatever its result says; moving that role to
another Agent requires the owner-directed OFFER → ACK → RESULT protocol in
`../ultra-change/references/primary-transfer.md`, which stays mutually exclusive
with this bounded-worker path.

## Route modes

| Mode | Entry | Observable exit | Next |
|---|---|---|---|
| `task` | Explicit owner authorization for one task execution or continuation slice | One validated terminal worker result and isolated diff are returned to the primary writer | Return to the primary `ultra-dev` task for interpretation and integration |
| `research` | Explicit owner authorization for one active Change's bounded evidence question | One validated terminal result carries the named evidence or a bounded unavailable path | Return to `ultra-research/change-scoped` under the primary writer |
| `aggregate` | Explicit owner authorization for one Change-level review or verification question | One validated terminal finding result is available without canonical `.ultra` writes | Return to the primary `ultra-test`, `ultra-review`, or requesting route |

Follow `../ultra-status/references/route-contract.md`. Delegation always remains an
explicit-entry capability, even when the surrounding Change has an Execution Grant.
Show one Route Card before launch and one after the terminal result. Worker events and
transport progress may update `Position`, `Delta`, or `Reality`; they never prove the
delegated slice complete or select the primary route.

## Before you start

1. Resolve exactly one active `change_id`, then select one scope and name it in
   `instruction.md`:
   - **task execution or continuation** — select one matching task and read its full
     `context_file` and `## Resume Note`;
   - **scoped Research evidence** — read the active intent's Research Disposition,
     named question, sources, and required exit evidence;
   - **aggregate Change review or verification** — read the exact matching task ids,
     relevant contexts, current report or review summary, and Change diff.
   Research and aggregate read-only scopes do not require a task. An archived or
   abandoned task cannot be delegated as current work.
2. Read `CONTEXT.md`, relevant `.ultra/decisions/`, acceptance and current evidence.
3. Define one bounded instruction, permission set, clean Git worktree and result.
4. Read `references/delegation-contract.md` before writing either JSON artifact.

## Definition of done

- The worktree is a clean registered Git worktree; instruction, permission and worker
  spec digests remain unchanged.
- The worker terminates as `finished`, `blocked` or `failed` in a schema-valid
  `result.json`; declared paths equal the actual Git diff and stay in writable roots.
- No `writable_roots` entry is `.ultra/` or sits under it, and the actual diff touches
  nothing there.
- Timeout and cancellation reach a terminal failed result and release `run.lock`.
- ACP updates stay in a derived redacted event journal; no `agent_thought_chunk`, raw tool
  input/output, credential, session, or stop reason can establish Ultra completion.
- The primary host verifies the result against the selected scope's task acceptance,
  Research exit evidence, or aggregate review/verification question.

## Prepare and run

Write under `.ultra/.runtime/delegations/<id>/`:

- `instruction.md`: scope type, stable `change_id`, optional task id, bounded goal,
  sources, acceptance or exit evidence, and forbidden effects;
- `permission.json`: the exact file-local boundary in the contract reference;
- `result.json`: launcher-published terminal artifact only.

`writable_roots` is an array of existing worktree-relative directories. An empty array
selects native read-only mode; one or more roots selects bounded write mode.
**Neither `.ultra/` nor any path under it may appear in it.** The worktree carries a
checkout of `.ultra` because Git tracks it, but the project's memory has exactly one
writer. Two workers appending to `tasks.json`, `progress/` or `evidence/` in separate
worktrees collide in the very files every later session reads to resume. Worker findings
and state changes travel back in `result.json` and are applied by the primary host.
`external_effects` must be empty in this portable launcher: commit, push, publish,
deployment and other effects stay with the primary host. There is no `readable_roots`
claim because the six host sandboxes do not share one mechanically enforceable read
policy.

Create `.ultra/.runtime/worktrees/<id>` as a real Git worktree and run:

```text
node <loaded-ultra-delegate-skill-dir>/scripts/delegate.cjs run --to <host> --instruction <file> --permission <file> --worktree <dir> --timeout <seconds>
```

Resolve `<loaded-ultra-delegate-skill-dir>` from this Skill's actual loaded path. The
Skill-local launcher and worker are the canonical runtime. Do not search `PATH` for
`ubp`, install a global Ultra package, or invoke `npx` to locate Ultra during
delegation. The Claude and Codex ACP profiles may separately execute their exact pinned
adapter packages through `npx`; that transport dependency is declared in the profile.
`ubp delegate ...` is a one-release compatibility wrapper only.

`<host>` is `claude`, `codex`, `opencode`, `kimi`, `grok`, or `zcode`. Kimi accepts an
optional `--model <id>` when its account has no default headless model. A ZCode primary
host uses this same command to delegate to any other installed CLI; a different primary
host can select `--to zcode` through the ZCode headless profile.

The launcher selects one `AgentExecutionDriver` per Host. A stable ACP v1 stdio
candidate is preferred only when that exact Host's versioned conformance row is
`passed`, names a non-empty evidence reference, and its executable and declared
candidate-identity probes succeed. The probes are bounded local version checks; they
inspect capability, executability, and pinned runtime identity without starting a
provider task. Every other case uses the
result-compatible `CliDriver` and records `execution_driver`, `acp_capability`, and the
exact `driver_fallback_reason` in the receipt and terminal result. Do not edit a
conformance row merely because a binary or help command exists.
`ULTRA_DELEGATE_FORCE_CLI=1` is the explicit operator recovery switch: it selects the
same bounded `CliDriver` with `acp_forced_cli` without deleting the ACP candidate or
changing its evidence row.

`AcpDriver` sends `initialize` with protocol v1 and no client filesystem, terminal, or
interactive-auth capability; creates one session at the absolute isolated-worktree
`cwd`; sends the digest-bound packet as one text prompt; and consumes `session/update`,
permission, cancellation, and terminal messages. It retains only bounded redacted
event metadata. An edit/delete/move request is granted with `allow_once` only when all
declared locations are already inside `writable_roots`; scope widening and execution,
fetch, mode-switch, or unknown operations are denied and force a typed terminal
failure. `allow_always` is never selected. If `session/new` reports
`acp_auth_required` before any prompt is sent, the launcher runs the already-bound
`CliDriver` once and records the failed ACP attempt as redacted fallback metadata. It
never retries any post-prompt or other ACP failure, so this recovery cannot duplicate a
provider task. The driver does not copy or solicit credentials.
Some agents emit creation-time session metadata before their `session/new` response.
The driver transiently buffers only a bounded set of metadata update kinds, then checks
every buffered `sessionId` against the returned identity before publishing an event.
Early message/tool content, an identity mismatch, or a count/byte overflow fails typed.

The ZCode headless transport is `experimental`: its thin profile invokes the
independently installed `zcode-acp` v0.1.0 bridge, pinned to source commit
`42fe149d4b501469343c01f23ba3801832306d53` plus the digest-bound ZCode 0.16.5
runtime-preferences patch under this Skill's `patches/` directory, and passes only the
installed ZCode Desktop runtime path (or the operator's explicit PATH/test override).
Selection verifies both the bridge build marker
`zcode-acp 0.1.0+ultra.zcode.0.16.5` and the installed runtime version `0.16.5` before
using the passing receipt.
Ultra ships the source patch but never redistributes the bridge binary or App bytes.
Host identity and provider identity are separate; the verified local runtime uses the
Owner's domestic BigModel provider rather than international Z.AI OAuth. The installed
`app-server` remains a
ZCode Protocol surface behind that bridge, not ACP evidence by itself; the ZCode row
can pass only from its own provider-backed conformance receipt. The runtime remains
an App-internal or PATH CLI with
no public stability contract, and it is **not** the documented ZCode Desktop
interactive surface. `delegate run --to zcode` refuses to launch until the invocation
explicitly carries `--ack-experimental`; every launch then prints a stderr warning and
records `transport_maturity: "experimental"`, the exact `transport_surface` wording,
and `experimental_ack: true` in the receipt, the worker spec, and the terminal result
(including failure and timeout recovery results), so no receipt can imply a documented
Desktop session. Promotion requires official documentation plus a full recovery drill.

The command returns a receipt. `status --delegation <dir>` reports the active driver,
fallback reason, and latest safe derived ACP observation when present; that observation
is execution telemetry, not a route or completion verdict. Immediately run
`python3 <loaded-ultra-delegate-skill-dir>/scripts/delegate_wait.py <result.json>`; read
no intermediate output. Use the same Skill-local Node entrypoint with `status
--delegation <dir>` for a read-only state and `cancel --delegation <dir>` to request
termination. The receipt carries the exact canonical cancel command. Never delete a
lock to manufacture completion.

The worker returns one schema-constrained JSON final response. The launcher extracts it
from the host's native structured output, validates digests, process exit, exact schema,
actual base-HEAD diff and writable roots, then atomically publishes `result.json`. The
launcher embeds the exact digest-bound instruction and permission packet in the prompt,
so a host that denies external-directory reads never needs authority outside the
worktree. The model never writes its own receipt. If owner input is needed, the worker terminates
`blocked` with questions and evidence; start a new id and fresh packet after obtaining
the answer.

After `finished`, inspect the isolated diff, rerun acceptance checks, and integrate via
the repository's normal Git workflow with ordinary authorization. Delegation never
auto-merges or writes canonical task/evidence files.

## Synthesize multiple results

Three agreeing results are Consensus. Two of three are Majority and require examining
the dissent. Three different results are No Consensus: narrow the question or add
evidence. A failed external CLI does not block the underlying workflow; report the
missing evidence rather than turning a vote or score into truth.

## When the owner decides

The owner authorizes delegation. External effects cannot be delegated by this launcher;
the primary host obtains their separate authorization. The primary host owns result
interpretation, risk acceptance, integration and task state.

## References

- `references/delegation-contract.md` — strict permission, receipt and result schemas.
- `scripts/delegate.cjs` — canonical installed launcher and status/cancel entrypoint.
- `scripts/delegate_wait.py` — run immediately after the launch receipt.
- `../ultra-status/references/route-contract.md` — owner-visible route, checkpoint, and recovery output.
- `../ultra-think/SKILL.md` — read when No Consensus exposes a consequential decision.
- `../ultra-think/references/autonomy-boundary.md` — read before granting write effects.
