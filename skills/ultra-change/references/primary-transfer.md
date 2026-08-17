# Primary transfer between Agents (OFFER → ACK → RESULT)

Use this reference only when the owner moves the canonical implementation
authority of one work package from the current primary Agent to another Agent.
It is the exclusive way a work package changes its single canonical writer;
everything else a second Agent can do is a delegated worker slice
(`skills/ultra-delegate/`) or a read-only review.

Primary transfer and delegated work are mutually exclusive:

- a **primary transfer** moves the sole canonical `.ultra` writer role for the
  work package, under an exact owner grant, after verification;
- a **delegated worker** keeps the primary writer untouched, runs in an
  isolated worktree, cannot write `.ultra`, and returns a bounded result.

A delegation receipt can never serve as an ACK or RESULT, and relaxing the
worker's `.ultra` write prohibition to fake a transfer is a contract violation,
not a shortcut. While an ACK-ready transfer is open, the receiver is the one
canonical writer and the sender stops writing product and canonical files.

## When a transfer is valid

- the owner has issued or accepted an exact durable work-package grant naming
  the new primary, the scope, allowed local effects, forbidden effects, review
  budget, stop conditions, and terminal outcomes;
- the current primary has written current reality, evidence, not-done, and next
  steps back into the canonical task context and its closing Resume Note;
- the sender derives one OFFER from canonical authority — never from chat
  memory — and stops writing after the receiver's ready ACK.

## Receipts

Receipts live under `.ultra/.runtime/handoffs/<handoff-id>/` and are derived,
reconstructable observations, never semantic authority:

- `OFFER.json` (`ultra-primary-transfer-offer-v1`): sender, receiver and roles,
  repository root/origin/base HEAD, worktree digest, dirty state and known
  untracked files, every frozen input with purpose/path/SHA-256, the accepted
  scope including the fresh task identity, allowed and forbidden effects, the
  review budget, and the receiver protocol.
- `ACK.json` (`ultra-primary-transfer-ack-v1`): the receiver's stable-read
  observations — repository identity, base HEAD, worktree digest, and every
  frozen input's offered and observed SHA-256 with a match flag — plus the
  accepted role and task identity. `state` is `ready` only when every value
  matches; otherwise it is `blocked` with `blocked_reasons`.
- `RESULT.json` (`ultra-primary-transfer-result-v1` or `-v2`): the terminal receipt —
  `terminal_state` (`completed` | `blocked` | `revoked` | `cancelled` |
  `failed`), final HEAD and worktree digest, exact changed and deleted paths,
  exact commands with exit codes, evidence refs, fakes, limitations, not-done,
  external effects, and review risks. A v2 RESULT additionally lists
  `frozen_input_final_digests`: the actual final SHA-256 (or an explicit
  `absent: true`) of every OFFER frozen input.
- `CLOSEOUT.json` (`ultra-primary-transfer-closeout-v1`): optional, and only
  beside a completed v2 RESULT in the same handoff — the receipt of the one
  prescribed post-review closeout transition below. It cites the exact
  reviewed subject (`closes_result`), the acceptance receipt that authorized
  the closeout (`authorized_by`), the three prescribed paths, the
  closeout-start and closeout-end observations (`subject_before` /
  `subject_after`), an optional owner-authorized `continuation` covering work
  that legally moved the subject between freeze and closeout, and
  `effects_declined` — commit, review, and handoff all false. It never
  rewrites OFFER/ACK/RESULT bytes.

A `completed` RESULT means the receiver's sole-writer execution is finished and
frozen for read-only review. It never closes the task ledger row, accepts the
review, or authorizes a delivery or release effect — those stay with the owner
and the reviewer.

## Phase-correct freshness

The ACK's bytes are a **pre-write boundary** record, never present-current
freshness. Expected receiver edits after a ready ACK — including edits to files
the OFFER froze as starting reality, such as the task context or the WIP
checkpoint — are legal and must not invalidate an active or completed transfer:

- the ACK proves the starting subject at its own temporal boundary; the sender
  validates it promptly after the ACK, before receiver writes begin;
- after that boundary, active validation observes only the current HEAD against
  the base HEAD, the ledger row, and whether the current worktree digest still
  equals the ACK-observed digest (`boundary intact`) or receiver writes have
  legally begun — it never re-reads ACK-start bytes as present truth;
- resume and current reality come from the canonical task context, the current
  grant, and the ledger, never from pretending ACK-time bytes are still current;
- a terminal v1 receipt, and any handoff superseded by a newer handoff, is
  historical structure: the reviewer recaptures facts from the repository
  instead of re-anchoring old receipts to current bytes;
- a newest v2 terminal RESULT is bound to the current reality: the recomputed
  final HEAD, the recomputed product worktree digest, the exact final product
  path inventory (every tracked change against the base HEAD plus every
  product-scope untracked file — the same subject definition the worktree-digest
  primitive uses), and the final bytes of every frozen input. History advancing
  past the frozen final HEAD (for example an owner commit) is a warning that
  makes the receipt historical; a divergence that does not preserve the frozen
  HEAD is an error for the owner. A prescribed closeout receipt (below) is the
  one legal way current reality moves past the frozen digest without a new
  handoff.

## Prescribed closeout transition (versioned contract)

A `completed` v2 RESULT freezes the reviewed subject but never closes the task
ledger row — the closeout (final evidence record, task-context Task
Review/Completion/Resume, ledger `completed`, readback) still has to write
product-scope authority bytes. Rewriting the frozen RESULT, opening a new
handoff for the closeout, or committing would each create a loop or conflate
separate effects. The versioned closeout-transition contract is the one
bounded answer: a CLOSEOUT receipt separates the immutable reviewed subject
from exactly one uncommitted prescribed closeout.

- The closeout is **prescribed**: exactly three paths — the task ledger
  `.ultra/tasks.json`, the task context `.ultra/contexts/task-<id>.md`, and
  the final evidence record `.ultra/evidence/<task-id>/evidence.json` — and,
  inside the context, only the closeout sections (`## Resume Note`,
  `## Task Review`, `## Completion`). The context bytes before the earliest of
  those headings, the ledger rows outside the closed task, and every
  pre-review evidence sibling stay byte-frozen: implementation, Acceptance,
  the PPI, pre-review evidence, and unrelated authority changes remain stale.
- The closeout is **post-review only**: `authorized_by` cites the real
  external-review receipt by path and SHA-256 and binds its existing
  `ultra-external-review-receipt-v1` semantics — no second review schema is
  invented: an identified read-only reviewer, the exact task and change
  identity, the reviewer-authority and reviewed-contract refs verified by
  stable bytes, a subject equal to the closeout-start HEAD and worktree
  digest, an `approve` verdict with no P0/P1 finding (retained P2/P3 stay
  recorded and non-blocking), and a receipt path that is a Planned Path
  Inventory entry of the task context, planned before the review so the
  evidence audit and this contract agree at closeout time. The closeout
  starts no review, no handoff, and
  no repair round, and it never commits — the frozen final
  HEAD must still be the current HEAD.
- The receipt records the transition: `subject_before` and `subject_after`
  pin the aggregate product worktree digest, the prescribed paths' exact
  bytes, the ledger rows outside the closed task, the frozen context prefix,
  and the pre-review evidence siblings, so any drift before, during, or after
  the closeout fails typed instead of silently rebinding. The closed task's
  own ledger row is bound the same way: unique, `in_progress` at closeout
  start, `completed` at the end, and every field except `status` pinned by a
  canonical ex-status digest recorded before and after and re-read live — a
  missing, duplicated, or field-drifted current row is a typed stop.
- If owner-authorized work moved the subject between the freeze and the
  closeout (a recorded repair round under the same durable grant), the receipt
  declares it once in `continuation`: the frozen digest it starts from, every
  delta path with its closeout-start bytes (prescribed paths only at their
  closeout-start bytes), and the canonical records that authorize it. A
  closeout that starts from a subject the RESULT never froze, with no
  continuation, is a typed stop for the owner — never a silent rebind.
- The transition is **terminal and one-shot**: after the closeout, current
  reality binds to `subject_after`, and any further product write of any kind
  fails typed. There is no re-freeze, no second closeout, no retry loop, and
  no automatic repair; a mismatch returns to the owner. Supersession rules
  are unchanged — a newer same-subject handoff still makes the closed-out
  receipt and its closeout historical together, and v1 receipts never carry
  a closeout.

## Host post-turn external effects

A receiver's receipts observe only what exists through their own publication
boundary. Host post-turn lifecycle effects run after the receiver's terminal
text and are never observable inside the pass that produced them, so a RESULT
never asserts future Host state. Enabled provider-local automatic memory — for
example ZCode Desktop Workspace Memory extraction — is such a
Host external effect:

- if the Host memory feature is enabled, the OFFER `effects` must allow it and
  the terminal RESULT must disclose it in `external_effects`; omitting it is a
  false zero-effect claim even though the files land outside the repository;
- a strict zero-external-effect transfer starts in a fresh task with the
  native master setting off (`memoryEnabled=false` on ZCode Desktop; the
  logged `memoryExtractionEnabled`/`memoryUse` values are absent-key,
  disable-only observations, not independent owner-facing gates) and ends with
  an independent reviewer postflight over the Host post-turn logs and the
  external memory store;
- Host memory is never a frozen input, shared authority, evidence substitute,
  or completion signal in either mode: it stays non-authoritative and
  non-portable, and Ultra neither parses nor mutates provider settings — the
  native setting remains owner/operator controlled.

## Protocol

1. Sender writes reality back to canonical task context and Resume Note.
2. Owner grant (already recorded) names the receiver exactly.
3. Sender derives `OFFER.json` binding canonical refs/hashes, HEAD, and the
   worktree digest.
4. Receiver stable-reads the exact refs and answers with `ACK.json`:
   `ready` (all observed values match) or `blocked` (with reasons).
5. Only a matching grant plus a ready ACK makes the receiver the sole canonical
   writer; the sender then stops writing.
6. Receiver executes, updates canonical files, and freezes the terminal
   `RESULT.json`.
7. Reviewer or next primary recaptures facts from the repository; nobody
   inherits the receiver's completion narrative.
8. Any source, grant, role, or digest mismatch returns `blocked` — never an
   auto-repaired packet and never silent continuation.

## Recovery

- **Stale offer** (frozen input, HEAD, or worktree drifted before ACK):
  receiver writes a blocked ACK citing the mismatched observation; a fresh
  offer under a new handoff id is created after the owner re-confirms. Old
  receipts are never edited to match new bytes.
- **Receiver refusal / no ACK**: no transfer happened; the sender remains the
  canonical writer. The offered handoff simply stays `offered`.
- **Interrupt / resume**: canonical task context and its Resume Note plus the
  grant's activation rule are the recovery anchor; the receiver re-verifies the
  grant and the ledger row (`--live`) before continuing.
- **Cancel / revoke**: the owner records a decision; the receiver (or sender,
  if pre-ACK) writes a terminal RESULT `cancelled` or `revoked` citing that
  decision record in `evidence_refs`.
- **Missing receipts**: receipts are derived state; create a fresh handoff
  under a new id from canonical authority. Never reconstruct an old ACK or
  RESULT — a lost receipt is regenerated, not remembered.
- **One-writer invariant**: at most one ACK-ready, unterminated handoff may be
  open in a repository; a conflict is a typed stop for the owner.
- **Closeout drift**: a closed-out subject that moved after its CLOSEOUT
  receipt is a typed stop; never edit the receipt, the frozen RESULT, or open
  a handoff for it — return the exact drift to the owner.
- **Lost or repeated closeout**: a CLOSEOUT receipt is never reconstructed or
  duplicated; if it is lost, the handoff stays a plain terminal RESULT and the
  owner decides the next bounded step.

## Mechanical checks

`node skills/ultra-change/scripts/validate_primary_transfer.cjs <repo-root>`
validates receipt structure, hash and HEAD bindings, state transitions, path
normalization, the delegation-boundary and one-writer invariants. All receipt
and bound-input reads go through one shared bounded mechanical primitive (the
worktree-digest tool's stable snapshot): repository-relative paths are
validated before any filesystem access, the complete parent chain is walked as
ordinary non-symlink directories, leaves open no-follow, and identities replay
after reading — symlinks, FIFOs, directories, oversize files, invalid UTF-8,
and replaced identities are typed diagnostics with recovery, never followed.
A handoff directory holds exactly `OFFER.json`, optional `ACK.json`, and
optional `RESULT.json` under a physically bounded entry scan with a final
exact replay; any other entry is a typed stop. Repo-wide discovery and
per-handoff validation share one ancestor-first optional-directory
observation: every existing `.ultra`/`.runtime`/`handoffs`/handoff component
is lstat'd no-follow before its child is touched, so a symlinked or special
ancestor fails typed even when a later component is absent; a genuinely
missing component under ordinary ancestors legally means no transfers for the
optional repo-wide root (and absence itself is replayed); a required handoff
directory's absence is a typed error; and every existing directory streams
bounded with an exact entry replay — drift, replacement, malformed entries,
and the entry ceiling fail typed and closed, never silently zero handoffs. Live validation fails closed:
when HEAD, Git, the worktree, the manifest, or a frozen input cannot be
observed, the result is an error with a restore-and-retry path, never a green
guess. For an active transfer it observes the current HEAD, the ledger row,
and whether the ACK-start digest still holds or receiver writes have begun.
For the newest v2 terminal RESULT it binds, in one finite coherent observation
(the digest re-observed once after the manifest and frozen-input reads), the
final HEAD, the recomputed worktree digest, the exact product path inventory,
and the final frozen-input digests; a subject that moves across that boundary
fails typed. A newer handoff supersedes an older terminal receipt only for the
same subject and authority — same repository, same accepted task identity,
same owner-grant decision bytes; unrelated newer work never downgrades strict
validation. Superseded and v1 terminal receipts stay historical. Beside a
completed v2 RESULT, the validator additionally accepts exactly one CLOSEOUT
receipt and binds the closed-out state instead: the closeout end-state digest,
the pinned reviewed subject and recorded continuation, the frozen-input bytes
outside the prescribed paths, the frozen ledger-row, context-prefix, and
pre-review-evidence scopes, the closed task row's canonical ex-status digest
(unique, `in_progress` → `completed`, re-read live), and the authorized_by
receipt's existing `ultra-external-review-receipt-v1` semantics. The validator
owns structure, identity, and freshness only; it never decides semantic
completion, and a green report is not an acceptance.

## What a transfer is not

- not a scheduler, daemon, wake-up service, or license for the receiver to
  extend its own grant, budget, or scope;
- not inheritable: a new transfer needs its own owner grant and receipts;
- not a memory channel: hidden chat, Host memory, Goal state, session ids, and
  progress files are never shared authority;
- not available to Hooks or Skills as automatic behavior — a transfer is an
  owner-directed protocol step executed by the Agents involved.
