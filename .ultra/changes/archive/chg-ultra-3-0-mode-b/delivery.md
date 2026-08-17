# Delivery: chg-ultra-3-0-mode-b

## Outcome Reconciliation

The accepted outcome in
`.ultra/changes/archive/chg-ultra-3-0-mode-b/intent.md#outcome` is realized as
Ultra Builder Pro 3.0: a provider-neutral, file-first cognitive-alignment harness
whose host model owns meaning and strategy while Ultra mechanizes authority,
permissions, effects, evidence, physical bounds, and recovery. The canonical
North Star is `.ultra/north-star.md#first-principles`; its observable outcomes and
hard constraints are traced by all three completed Change tasks in
`.ultra/tasks.json`. The shipped package supports Claude Code, Codex, OpenCode,
Kimi Code, Grok Build, and ZCode without adding a required daemon, database, MCP
server, Graph engine, hidden executor, or semantic state machine.

The owner selected the 3.0 release line on 2026-08-18. The first `v3.0.0`
candidate stopped before publication when its clean-checkout release gate exposed
workstation-only test inputs; the published candidate is therefore `3.0.1`, without
rewriting the failed tag. The intent's earlier
deferred-version note and no-external-effects grant remain accurate historical
boundaries for implementation; this finalization and its release effects proceed
under the owner's newer explicit invocation, not by extending that expired grant.

## Specification and Documentation Updates

- `.ultra/north-star.md#first-principles`, `.ultra/specs/product.md`, and
  `.ultra/specs/architecture.md` carry the accepted r3 authority, product contract,
  and architecture boundary.
- `README.md#ultra-builder-pro-30` now states the 3.0 cognitive-alignment promise,
  owner-selected topology, bounded convergence, six-host support, exact 3.0.1
  install commands, and honest ZCode transport maturity.
- `CHANGELOG.md#301--2026-08-18`, `package.json`, and `package-lock.json` establish
  the SemVer 3.0.1 release posture.
- `tests/project-artifacts.test.cjs`, `tests/north-star-v2.test.cjs`, and
  `tests/v026-contract.test.cjs` resolve the delivered Change by stable
  `change_id` across its active-to-archive move; immutable task evidence is not
  rewritten to follow a movable directory, and an empty active frontier is valid
  after all tasks complete.
- `docs/wip/ultra-builder-pro-3.0-implementation.md` is a compatibility tombstone,
  not a live WIP; the immutable evidence path remains resolvable while current
  authority lives in `.ultra/`, this delivery record, and Git.

## Verification

| Command | Exit | Evidence | Freshness |
|---|---:|---|---|
| `node skills/ultra-test/scripts/worktree_digest.cjs --project . --change-id chg-ultra-3-0-mode-b` | 0 | HEAD `53bb8f90...`; intent `9f877a8c...`; product `af6bed45...`, stable across two captures | after 3.0.1 README, changelog, package metadata, and clean-checkout gate reconciliation |
| `node skills/ultra-plan/scripts/validate_task_evidence.cjs <record> [--verify-external-receipt] --projection` for all three Change tasks | 0 | exact projections `a797be19...`, `24e2f95e...`, `b2930ca3...` | immediately before finalization |
| `node skills/ultra-test/scripts/validate_review_transport.cjs --summary .ultra/reviews/v30-current-test-report-consumer-final-delta-review/SUMMARY.json --report .ultra/test-report.json` | 0 | `valid: true`, zero findings, SUMMARY `26854a96...` | immediately before finalization |
| `npm run verify:release` | 0 | 615 Node tests, 89 Hook tests, 0 high-severity production dependency vulnerabilities | fresh 3.0.1 product snapshot |
| `npm pack --dry-run --json` | 0 | `ultra-builder-pro-cli@3.0.1`, 128 files, 321334-byte tarball | fresh 3.0.1 product snapshot; no package written |
| `git diff --check` | 0 | no whitespace errors | immediately before finalization |

## Review

The current terminal receipt is
`.ultra/reviews/v30-current-test-report-consumer-final-delta-review/SUMMARY.json`,
packet digest `3308b5b9c39b008cb90781853a33dfd800334365e1ca7ec7352fb6cf23aa8459`,
SUMMARY digest `26854a96341e9b2678bea76439e83d6e48304b8ac76b4c03b96844fb69ba6dc1`,
verdict `APPROVE`, with P0=0, P1=0, P2=0, P3=0. The parent aggregate receipt
`.ultra/reviews/v30-mode-b-delivery-review/SUMMARY.json` remains historical
`APPROVE` with one non-blocking P2 disposition; it is not the current transport
receipt and does not reopen the completed work package.

## Technical Debt

- ZCode's App-bundled headless delegation transport remains `experimental`.
  Consequence: installation is supported, but automated delegation must preserve
  the explicit maturity warning and acknowledgment. Owner: Ultra Builder Pro.
  Upgrade path: promote only after an official stable interface exists and a full
  interruption/recovery drill passes.
- The parent aggregate Review's P2 about intent Recovery wording remains recorded
  report-only backlog by owner disposition. Consequence: historical prose is less
  explicit than the current canonical recovery contracts, with no runtime or
  delivery blocker. Upgrade path: address only in a future owner-scoped documentation
  Change; it must not trigger an automatic repair loop.

## Residual Risks and Omissions

- The portable worktree seal is a finite cooperative sensor, not hostile operating-
  system isolation; adversarial concurrent writers require a host sandbox or an
  isolated worktree.
- Graph/Loop control-plane integration remains deliberately not implemented because
  no accepted live consumer requires it.
- Grok Build remains a supported packaged host but is outside the owner's requested
  real-install set for this release operation. Claude Code, Codex, OpenCode, Kimi
  Code, and ZCode are the authorized real-install targets.
- Provider-native behavior is version-bound and remains observable through Doctor;
  the package does not claim control of provider internals.

## Recovery

Before publication, revert the release commit or reinstall the prior tagged source
and rerun `npm run verify:release`. After npm publication, package versions are
immutable: restore consumers with `npx ultra-builder-pro-cli@0.26.2 ...`, verify each
host with `--doctor --json`, and, only under a fresh owner authorization, move the npm
`latest` dist-tag back to `0.26.2`. Git recovery is a normal revert of the release
commit; never rewrite the published tag or package bytes.

## External Effects

| Effect | Authorization | Observed status at local archive |
|---|---|---|
| Commit release state | owner-authorized 2026-08-18 | release commit `2b2dc777...`; clean-checkout gate repair `53bb8f90...`; 3.0.1 metadata commit pending |
| Fast-forward merge to `main` and push | owner-authorized 2026-08-18 | `main` pushed through `53bb8f90...`; 3.0.1 metadata push pending |
| Annotated tags and publication | owner-authorized 2026-08-18 | `v3.0.0` preserved as a failed pre-publication candidate (workflow `32057781915`; no npm version or GitHub Release); `v3.0.1` publish pending |
| Global install: Claude Code, Codex, OpenCode, Kimi Code, ZCode | owner-authorized 2026-08-18 | pending until published `ultra-builder-pro-cli@3.0.1` is fetched and each Doctor is healthy |
| Grok Build global install | not requested | not performed |
