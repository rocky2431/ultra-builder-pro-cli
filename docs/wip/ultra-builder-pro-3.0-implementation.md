# Ultra Builder Pro 3.0 implementation WIP

> **Status**: `Round 3 repair pass frozen for Codex affected-delta review (2026-08-17)`
> **Work package**: `v30-north-star-r3-primary-handoff` under grant `ubp3-r3-zcode-2026-08-17`
> **Execution mode**: `durable work-package / ZCode Desktop sole writer via verified
> primary transfers (ubp3-r3-zcode → r1 → r2 → r3, one writer at a time)`
> **Reviewer**: `Codex root / read-only; package review override: total cap 10 targeting
> ≤5, P2/P3 never auto-extend, same-root 3-failed-fix architecture stop`

## Why

Codex's Round 2 affected-delta review found exactly one remaining blocker in
the bounded-validation root. The owner authorized exactly one Round 3 repair
pass; ZCode Desktop (the same real interactive task, GLM-5.3, Highest effort)
is again the sole writer under handoff `ubp3-r3-zcode-desktop-r3`, whose frozen
inputs include the Round 2 RESULT as a historical record.

## Accepted outcome

Repair only the two misses and stop: (1) bounded stable repository-contained
fail-closed primary-transfer validation — the reproduced Git-unavailable
`valid=true` exit 0 must become a typed error with restore-and-retry recovery,
receipt reads must be stable ordinary no-follow snapshots across the complete
parent chain via one shared primitive, handoff directories must hold exactly
the three receipts under a bounded exact replay, supersession must require the
same transfer subject and authority, the terminal binding must be one finite
coherent digest×manifest×frozen-input observation, revoked evidence must be a
stable ordinary file, and invalid paths must never be accessed; (2)
`experimental_ack=true` on every delegated ZCode terminal result authorized by
`--ack-experimental`. Prefer deletion/reuse; no new architecture and no design,
grant, intent, topology, or semantic-policy change.

## Boundary

- Round 3 frozen inputs verified before any write: the r3 design (`95e06a08…`,
  still byte-identical), the grant (`446ca6e6…`, untouched), the Round-3-start
  task context (`14e31828…`), the intent (`9f877a8c…`, untouched), and the
  Round 2 RESULT (`7fd6d1fc…`, historical, never edited). One invented hash
  tail in the first ACK draft was caught by re-verification and corrected
  before any product write.
- Rounds 0/1/2 receipts stay untouched history; this pass records only under
  `ubp3-r3-zcode-desktop-r3/`.

## Delta — what changed in the Round 3 repair

- **Repo-wide handoff-root discovery**
  (`skills/ultra-change/scripts/validate_primary_transfer.cjs`): the last
  same-root false green is closed. `listHandoffDirs` no longer materializes
  the root with `readdirSync` or silently filters unsafe entries — it reuses
  the one existing stable directory observation: no-follow root identity (a
  symlinked root, including to an empty external directory, is a typed
  `receipt_unsafe` failure, never zero handoffs with `valid: true`), bounded
  `opendirSync` streaming under the max+1 ceiling, one exact parent/entry
  type-and-identity replay (drift is typed), and every entry a
  normalized-id ordinary directory (`handoff_entry_malformed` otherwise). An
  absent root still legitimately means no transfers. `validateRepo` surfaces
  the thrown typed code. No third scanner; every Round 2 repair and the
  experimental_ack behavior are unchanged.

## Delta — what changed in the Round 2 repair

- **Fail-closed bounded stable validation**
  (`skills/ultra-change/scripts/validate_primary_transfer.cjs`,
  `skills/ultra-test/scripts/worktree_digest.cjs`,
  `skills/ultra-change/references/primary-transfer.md`): the validator's
  duplicated snapshot code was deleted and every read (receipts, ledger,
  frozen inputs, revoked evidence, sibling handoffs) now goes through the
  digest tool's exported `streamStableRepositoryFile` — repository-relative
  paths validated before any filesystem access, full parent-chain walks as
  ordinary non-symlink directories, no-follow leaf opens, post-read identity
  replay, strict UTF-8, and per-file byte ceilings. Handoff directories stream
  under an entry ceiling with a final exact parent/entry identity replay and
  hold exactly OFFER.json, optional ACK.json, optional RESULT.json. Live
  validation fails closed on an unobservable HEAD/Git (`git_unavailable`).
  The newest v2 terminal binding is one finite coherent observation: the
  digest is re-observed once after the manifest and frozen-input reads, and a
  changed second digest is `subject_changed_during_observation`. A newer
  handoff supersedes an older terminal receipt only for the same repository,
  accepted task identity, and owner-grant decision bytes — unrelated newer
  work never downgrades strict validation.
- **`experimental_ack` on every ZCode terminal result** (`bin/delegate-worker.cjs`
  `mechanical()`, `bin/delegate.cjs` `failureFromSpec()`): finished, failed,
  cancelled, and interrupted results now all carry `transport_maturity`,
  `transport_surface`, and `experimental_ack: true` when `--ack-experimental`
  authorized the run — closing the gap where the receipt and spec claimed it
  but live results omitted it.

## Reality — verification evidence

Exact commands and exit codes are in
`.ultra/evidence/v30-north-star-r3-primary-handoff/verification.log` (Round 3
section for this round). Summary: RED confirmed for the 2 new Round 3
regressions (discovery matrix and deterministic entry-set drift); then
primary-transfer 25/25, delegate 14/14, `npm run test:node` 604/604, hooks
89/89, `verify:release` 0 vulnerabilities, 14/14 Skill validations, pack
128 entries, isolated fake-HOME Doctor healthy on all six hosts; the
repo-wide `--live` exits 0 with r0/r1/r2 historical and r3 binding the frozen
subject. Round 2 record: RED confirmed for all 8 new regressions (git-unavailable,
parent symlink, FIFO leaf, directory rule + ceiling+1, unrelated-newer
supersession, escaping path no-access, deterministic digest-to-manifest
mutation via a test-only git shim, terminal experimental_ack); then
primary-transfer 23/23, delegate 14/14, `npm run test:node` 602/602, hooks
89/89, `verify:release` 0 vulnerabilities, 14/14 Skill validations, pack
dry-run 128 entries, isolated fake-HOME install + Doctor healthy on all six
hosts. Readback on the live repository: Git-unavailable now exits 1 with
`git_unavailable` errors (was exit 0, valid true); the normal repo-wide `--live`
exits 0 with r0/r1 historical and r2 binding the frozen subject. HEAD unchanged
(`9a759003…`); design bytes unchanged.

## Fakes, limitations, not-done

- **Live-path fakes**: none. Test doubles stay test-scoped; the
  digest-to-manifest mutation regression uses a temporary PATH-shimded `git`
  that appends one byte exactly once — a deliberate deterministic race
  injection inside the test sandbox only.
- **Limitations**: the coherence check observes the digest exactly twice — a
  mutation confined to the window after the closing observation but before the
  process exits is outside any finite observation (the receipt is frozen
  against the closing digest). Supersession compares the OFFER-visible subject
  key (repository root, task identity, grant decision bytes); two handoffs
  could theoretically share those while differing in scope prose — that is
  owner-grant territory, not mechanically decidable. ZCode app-bundled
  transport stays experimental; package version stays 0.26.2.
- **Not done** (separate owner decisions): Codex Round 2 affected-delta review
  (next); ledger completion/closeout evidence; Change delivery/archival; every
  release effect; transport promotion.

## Decision needed

Codex Round 3 affected-delta review of the one repaired root against this
frozen subject; any further P0/P1 blocker returns as one owner-authorized
repair set inside the package budget. Delivery/finalization and every release
effect stay with the owner.

## Next bounded action

Reviewer recapture from repository facts (the `ubp3-r3-zcode-desktop-r3`
OFFER/ACK/RESULT receipts, the grant, north-star r3, the ledger, the task
context, the verification log); no further ZCode writes after the r3 RESULT is
frozen.
