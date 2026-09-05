# Change chg-ultra-5-0-2-authority-reconciliation: Reconcile the current 5.0 authority surface

> **Status**: accepted
> **Profile**: major
> **Profile rationale**: The repair changes the public package contract, model-facing instructions, one portable Skill, current canonical specifications, Host/provider guidance, and package metadata. One bounded patch Change is the smallest unit that can keep every maintained consumer coherent without rewriting historical evidence.
> **Risk flags**: public contract, model-facing instructions, six-Host delegation, provider guidance, package release metadata

## Outcome

Ultra's maintained 5.0 surfaces describe one truthful product: `npx` installs or
operates the plugin, while installed `ultra-delegate` dispatches bounded work to another
Agent runtime through conformance-gated stable ACP v1 and uses a typed result-compatible
CLI driver only as an explicit fallback. Current documentation, Skills, specifications,
Host trust guidance, ZCode provider guidance, package links, and version metadata agree.

## Acceptance

| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| AC502-01 | Every maintained product surface defines installed Skill-local, ACP-first Agent delegation as the primary path and describes CLI execution only as a typed compatibility fallback | `inspection` | README mirrors, model-facing instructions, current docs/specs, changed Skill, and a structural contract test |
| AC502-02 | Current specifications and lifecycle instructions reflect six Hosts, mode-aware explicit versus grant-continuable invocation, Codex host-managed trust, declared identity probes only when present, and the exact six task-evidence dimensions | `inspection` | reconciled current specs/instructions and focused contract tests |
| AC502-03 | ZCode guidance separates the Host from the provider, documents current ZCode model configuration, preserves the pinned 0.16.5 drill as historical evidence, and exposes the required experimental acknowledgement | `inspection` | README mirrors, compatibility matrix, CLI help, official-source links, and focused tests |
| AC502-04 | The local `5.0.2` candidate has coherent package/lock/changelog/README metadata and every relative README link resolves inside the packed artifact | `command` | package contract test and `npm pack --dry-run --json` |
| AC502-05 | Changed Skills validate, focused and full release suites pass, isolated and current six-Host Doctor observations remain truthful, and no external release effect occurs | `command` | Skill Creator output, test logs, Doctor JSON, pack report, diff check, and final Git inspection |

## Non-goals

- Redesigning `AgentExecutionDriver`, ACP negotiation, conformance receipts, or Host maturity.
- Reclassifying ZCode from `experimental`, changing the Codex host-managed Hook boundary,
  or modifying Windows process cleanup behavior.
- Rewriting archived Changes, dated evals, receipts, historical release evidence, or
  the accepted North Star.
- Commit, push, tag, npm publication, GitHub Release, deployment, or user-home mutation.

## Public Seams

- `README.md`, `README.zh-CN.md`, `CHANGELOG.md`, package metadata, and CLI help
- `skills/ultra-delegate/SKILL.md` and `skills/ultra-status/SKILL.md`
- `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, and maintained lifecycle/authority docs
- `.ultra/specs/product.md`, `.ultra/specs/architecture.md`, and
  `.ultra/specs/research-distillate.md`
- packed README link closure and six-Host Doctor reporting

## Reconciliation

### Promised and Missing

ACP-first execution is implemented and locally conformed for all six installed Hosts,
but the most visible Skill table and several model-facing/current specification surfaces
still define delegation by its legacy CLI fallback. The READMEs omit the ZCode
experimental acknowledgement, collapse two test-evidence dimensions into one phrase,
and contain relative links to repository files excluded from the package.

### Built and Unpromised

The installed Skill-local runner, `AgentExecutionDriver`, stable ACP v1 receipts, typed
CLI fallback, six Host profiles, and host-managed Codex trust remain the implementation
authority. This Change makes their already delivered boundaries legible; it adds no new
transport or semantic state.

### Contradictory

Current specifications still describe v0.26, five Hosts, `ubp delegate run` as the
canonical entry, separate Codex Hook trust, and every public Skill as explicit-only.
Current ZCode setup text also conflates the ZCode Host, domestic BigModel Coding Plan,
and the historical Anthropic-compatible provider path. All maintained contradictions
are corrected together; historical records remain dated and unchanged.

## Research Disposition

- Disposition: none
- Question: none — the implementation, live Doctor observations, official ZCode
  configuration documentation, and the Owner-approved audit already resolve the repair.
- Selected lenses: none
- Existing evidence: `skills/ultra-delegate/scripts/host-profile.cjs`,
  `adapters/_shared/runtime-assets.cjs`, current six-Host Doctor JSON,
  `docs/evals/ultra-5-0-live-acp-conformance.md`, official ZCode configuration/QA pages,
  and the maintained README/spec audit.
- Required exit evidence: satisfied — every current contradiction has an authoritative
  source and an observable package or test seam.
- Rationale: more open-ended Research would duplicate the accepted correction and delay
  the smallest coherent patch.

## North Star Trace

- First principles: `FP-1`, `FP-2`, `FP-5`, `FP-6`, `FP-7`
- Serves: `NS-01`, `NS-02`, `NS-03`, `NS-04`
- Touches: `HC-1`, `HC-3`, `HC-4`, `HC-5`, `HC-6`
- Evidence: `.ultra/north-star.md`, current runtime/Host sources, accepted 5.0 design,
  official ZCode documentation, and focused package contract tests
- North Star revision: `north-star-v2-r3`
- North Star digest: `439b7838e2a672fd2d2cb6e0f11e94a61d0f76c8`
- Contradictions or refinements: none to the constitution; this Change corrects only
  stale product projections of the accepted delegation and authority boundaries.

## Execution Grant

- Grant: `durable work-package` `ubp-v502-zcode-closeout-2026-09-01`
- Allowed workflows: dev repair, test, formal task Review, and deliver-reconcile without
  finalization for this exact Change
- Agent topology: ZCode is the sole product implementation writer; Codex is the
  read-only implementation reviewer and may write only coordination, Review, evidence,
  and recovery artifacts; Claude Code is a read-only discussion participant
- Allowed local effects: edit only repository files required by current Codex P0/P1
  findings for `AC502-01` through `AC502-05`; run local tests, validators, package
  dry-runs, isolated Doctor, and read-only real-HOME Doctor checks
- Budgets and expiry: one initial Codex Review plus at most two P0/P1 delta Reviews;
  expires after formal task Review `APPROVE`, Owner revocation, or an invalidation stop
- Mandatory reviews: changed-Skill validation, current-source inspection, full release
  suite, packed-artifact inspection, Doctor readback, exact final diff, and formal task Review
- Stop conditions: runtime redesign, new credentials/provider purchase, user-home mutation,
  historical rewrite, Windows work, second active Change, or any external release effect
- Invalidation: owner revocation, scope/topology/effect expansion, stale North Star trace,
  unverified dirty-worktree separation, three failed fixes of one root cause, or exhausted
  Review budget with a remaining P0/P1
- Never granted: finalization/archive, commit, push, tag, publish, deployment, credential
  access/replacement, provider purchase, user-home installation, Windows changes, or a
  new unrelated Change
- Activation: stable verification of
  `.ultra/decisions/2026-09-01-v502-zcode-closeout-grant.md` at SHA-256
  `c7bc58e853c0883f4cbbe32471391a81bb468c648432387f556b11d8442778d1`
  activates only this bounded durable package; the stored active-intent
  mirror alone is inactive and cannot widen that decision because
  stored text alone is inactive.

## Planning Posture

`SELECTIVE`: use one tracer task across the existing documentation, Skill, specification,
package, and validation seams; add no transport or workflow mechanism.

## Recovery

`adb7bfe89f40e107d0c9c490076a6e74294b9337` is the clean pre-Change recovery point.
Before any external effect, normal file-level revert or a later corrective patch restores
the prior release. Historical artifacts and the current installed user environment remain
untouched.

## Unresolved Decisions

- None. Release effects remain a separate future owner decision.
