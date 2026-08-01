# Research Traceability

## Scope

- **Change**: `chg-converge`
- **Mode**: bounded source and native-host verification
- **Revision**: base HEAD `3f99189bc68697262cd90444685ac2d4857139c4` plus current worktree
- **Coverage**: current repository code and Git history, local five-CLI help/version,
  official Kimi and Codex plugin documentation, and referenced prior Codex task.

## Observed

| Claim | Evidence | Specification anchor |
|---|---|---|
| Kimi's user configuration root defaults to `~/.kimi-code`; managed plugins live under `plugins/managed`; project plugin scope is unsupported. | <https://moonshotai.github.io/kimi-code/en/customization/plugins.html> | `architecture.md#adaptation-and-routing` |
| Kimi Skills support user and project discovery and a native model-invocation control. | <https://moonshotai.github.io/kimi-code/en/customization/skills> | `product.md#20-behavioral-requirements-and-acceptance` |
| Codex plugins can ship Skills and Hooks, but installed non-managed Hook definitions require user trust. | <https://developers.openai.com/plugins/build/plugins> | `architecture.md#adaptation-and-routing` |
| Current local host flags differ materially; no one delegate argv or plugin layout is portable. | local `claude`, `codex`, `opencode`, `kimi`, and `grok` help on 2026-08-01 | `architecture.md#delegation-boundary` |
| The old Agent content maps to review lenses, parent review coordination, debugging, and test execution without loss of product authority. | Git history `agents/*.md`; current `skills/*/references/` | `architecture.md#agent-to-skill-convergence` |

## Decisions

| Decision | Owner and rationale | Specification anchor |
|---|---|---|
| Adopt file-first fourteen-Skill architecture and delete runtime supervisors. | Owner; preserve model agency and cross-host recovery. | `product.md#capability-and-scope-boundary` |
| Distribute project template as an `ultra-init` asset. | Owner option B; uses the already proven Skill asset copy path. | `product.md#artifact-lifecycle` |
| Use strict delegate receipts but do not claim an unavailable portable OS sandbox. | Owner constraints plus native CLI evidence. | `architecture.md#delegation-boundary` |

## Unknowns

| Unknown | Blocking | Owner and revisit condition |
|---|---:|---|
| Authenticated five-provider execution quality and quota behavior | only for a live-provider claim | Owner authorizes a bounded drill |
| Real HOME install/update/uninstall after v0.26 packaging | only for a real-install claim | Owner authorizes installation |

## End-to-End Trace

| Problem | Requirement | Architecture | Verification |
|---|---|---|---|
| Incomplete installed asset path | FR-01 | adapter copy and native managed layouts | adapter and package smoke tests |
| Owner/model role ambiguity | FR-02, FR-03 | generated native policy plus documented limits | role metadata tests |
| Orphan or duplicate project documents | FR-04 | canonical artifact lifecycle and repository self-migration | authoring and artifact audit |
| Unsafe or false-success child CLI | FR-06 | digest, worktree, permission, process, diff, receipt | delegate adversarial tests |
| Hook overreach | FR-05 | bounded context and exact-effect guard | Python Hook tests |

## Verification

| Command | Result | Freshness |
|---|---|---|
| `npm run verify:release` | 106 Node passed, 8 Hooks passed, audit found 0 vulnerabilities | 2026-08-01, after implementation and review repairs |
| 14 Skill Creator validations plus generated Codex Plugin Creator validation | 14/14 Skills valid; plugin validation passed | 2026-08-01 |
| Isolated five-host install, Doctor, reinstall, and uninstall | 5/5 healthy; config and sentinel HOME both empty after uninstall | 2026-08-01 |
| `npm pack --dry-run --json` | passed; exact current inventory is in `.ultra/test-report.json` | 2026-08-01 |

## Planning Entry

- **Posture**: `EXPAND`, owner-confirmed.
- **Required references**: current product and architecture specifications, active
  Change, six task contexts, runtime compatibility matrix, and artifact authority.
- **Blocking local gaps**: none.
- **External effects**: explicitly separate and not authorized by local completion.
