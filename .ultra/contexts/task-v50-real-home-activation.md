# Task v50-real-home-activation: Install and verify 5.0 in the six real Host homes

## Context

**What**: Upgrade the current user's six managed Host installations from their observed
older versions to the verified 5.0 source and prove discovery, ownership, Doctor, ACP
selection, and rollback without rewriting unrelated Host configuration.

**Why**: Isolated install fixtures cannot establish that the package is usable from the
Owner's actual Claude, Codex, OpenCode, Kimi, Grok, and ZCode environments.

**Constraints**:
- Inventory and back up only managed Ultra paths before mutation.
- Leave unrelated Host files and credentials untouched.
- Keep the healthy 5.0 installation active; use uninstall/reinstall only as bounded proof.
- Do not claim Codex hook activation where Host trust still requires user review.

## Planned Path Inventory

`CREATE`:

- `.ultra/evidence/v50-real-home-activation/preinstall-inventory.json`
- `.ultra/evidence/v50-real-home-activation/verification.log`
- `.ultra/evidence/v50-real-home-activation/install-receipt.json`

`MODIFY`:

- `.ultra/tasks.json`
- `docs/wip/ultra-builder-pro-5.0.md`

## Acceptance Criteria

**Change Acceptance IDs**: [`AC5-15`]

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| RH-01 | A pre-install inventory binds the six existing managed manifests and a recovery backup without reading credential values | `command` | redacted inventory and backup-manifest digests |
| RH-02 | `node bin/install.js --all --global` installs package 5.0.0 and the exact Skill-local delegation assets in all six real Host directories | `command` | real install JSON/log and provenance manifests |
| RH-03 | Real all-Host Doctor is healthy except explicitly user-review-required Host trust, and each installed runner reports its truthful ACP selection/fallback | `command` | Doctor JSON and installed-runner status probes |
| RH-04 | Unrelated Host files remain byte-identical and the adapter uninstall/reinstall recovery path is reachable | `inspection` | before/after managed inventory and ownership metadata |

## Definition of Drift

- Replacing a Host config directory, credentials, or unrelated plugin assets.
- Treating package presence as Host discovery without a real installed-path probe.
- Hiding a Doctor degradation or hook trust action behind a healthy summary.

## Trace

**Source**: `.ultra/decisions/2026-08-26-ultra-5-0-live-activation.md`

**First principles**: [`FP-1`, `FP-4`, `FP-5`]

**Serves**: [`NS-01`, `NS-04`, `NS-05`]

**Causal contribution**: A real ownership-safe install makes the verified Skill and ACP
transport discoverable in the Owner's actual Hosts without changing project authority.

**Hard constraints**: [`HC-1`, `HC-3`, `HC-4`, `HC-5`]

**Decisions**: `.ultra/decisions/2026-08-26-ultra-5-0-live-activation.md`

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-26 | boundary expansion | Initial real-HOME task | Change intent | Owner requested real installation |
| 2026-08-26 | evidence repair | Added the retained pre-install inventory to Planned Path Inventory | no | Closeout audit rejected an unlisted raw receipt |

## Open Questions

- _(none)_

## Resume Note

Why: move from isolated fixtures to the Owner's real Hosts. Outcome: six healthy 5.0
managed installs with an explicit rollback. Reality: the real all-Host install and
Doctor pass, every installed runner selects ACP, all unrelated Host sentinels match,
and ZCode uninstall/reinstall returns to healthy while preserving its config bytes and
mode 0600. Decision needed: none. Next bounded action: consume this completed task in
the Windows release gate. Not done: real Windows runner proof or public release.

## Task Review

- Execution Grant state/limitation: `active`; the Owner authorized real user-directory
  installation, and the bounded six-Host operation is complete.
- Review session and Summary digest:
  `v50-real-home-activation-initial-review-v1` / `605147d5dd579ab1a4a1187701602771a6b2392a503ca74876dbd842e09bc143`.
- Blocking findings: none; verdict `APPROVE`, both axes `PASS`.
- Retention: retain the pre-install backup receipt, post-install Doctor evidence, and the
  strict Review through aggregate Test and Deliver.
