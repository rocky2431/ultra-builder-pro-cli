# Runtime compatibility matrix

Ultra Builder Pro adapts one fourteen-Skill, five-hook contract to six native hosts.
This document records the differences that belong in adapters rather than shared
Skills.

The bounded delegation runner additionally has an experimental Pi 0.85.1 native
CLI candidate. It does not install an Ultra plugin into Pi. Public Pi dispatch
requires both explicit experimental acknowledgement and a retained exact-runtime
enforcement qualification. The retained verified-local native CLI identity is
qualified; a changed runtime or policy refuses launch until requalified.
All eight native Pi tools are preserved behind the existing permission decisions.

## Installed surface

| Host | Managed plugin or bundle | Skills | Hook bridge |
|---|---|---:|---|
| Claude Code | `<config>/skills/ultra-builder-pro` | nested `skills/<name>` | direct Python commands in `hooks/hooks.json` |
| Codex | `<home>/plugins/ultra-builder-pro` plus personal marketplace entry | nested `skills/<name>` with `agents/openai.yaml` | `hooks/adapters/codex.py` |
| OpenCode | `<config>/.ultra-builder-pro` plus `<config>/plugins/ultra-builder-pro.js` | managed `<config>/skills/<name>` | native JS events call shared Python scripts |
| Kimi Code | `<config>/plugins/managed/ultra-builder-pro` plus `installed.json` | nested `skills/<name>` | `hooks/adapters/kimi.py` |
| Grok Build | `<GROK_HOME>/.ubp/plugin-sources/ultra-builder-pro` | nested `skills/<name>` | `hooks/adapters/grok.py` |
| ZCode | `~/.zcode/cli/plugins/marketplaces/ultra-builder-pro/plugin` plus managed local marketplace and `plugins.dirs` entry | nested `skills/<name>` | `hooks/adapters/zcode.py` |

Every host receives the same eight owner workflows, five model disciplines, and one
router. Codex alone needs generated `agents/openai.yaml` files to express display data
and implicit-invocation policy; those are host metadata, not custom agents.

## Scope resolution

| Host | Global default | Local default | Environment override |
|---|---|---|---|
| Claude Code | `~/.claude` | `<cwd>/.claude` | `CLAUDE_CONFIG_DIR` |
| Codex | `~/.codex` for config; `~/plugins` and `~/.agents` for sidecars | `<cwd>/.codex` plus home-scoped plugin surface | `CODEX_HOME` |
| OpenCode | `${XDG_CONFIG_HOME:-~/.config}/opencode` | `<cwd>/.opencode` | `OPENCODE_CONFIG_DIR` or `OPENCODE_CONFIG` |
| Kimi Code | `~/.kimi-code` | no project plugin scope | `KIMI_CODE_HOME` |
| Grok Build | `~/.grok` | no project plugin scope | `GROK_HOME` |
| ZCode | `~/.zcode` | no project plugin scope | adapter `ZCODE_HOME` override |

An explicit `--config-dir` wins over all defaults and becomes the home for any
host-owned sidecar as well. This rule makes isolated installation tests trustworthy.
With multiple selected runtimes, the CLI passes `<config-dir>/<runtime>` to each adapter
instead of merging incompatible host layouts.
Kimi, Grok, and ZCode currently expose user-scoped plugin installation only. `--local` rejects
them before mutating another host; an explicit `--config-dir` remains available for an
isolated user-scope installation test.

## Invocation policy

| Invocation class | Owner can route directly | Model can select implicitly |
|---|---:|---:|
| `explicit-entry` public mode | yes | no; the Owner's current request naming that work is the entry |
| `grant-continuable` public mode | yes | only under a valid Execution Grant covering that mode |
| five `model-discipline` Skills | no | as an internal method of a covered workflow |
| `ultra-status` `router` modes | yes | no; other Skills derive their cards directly from the shared contract |

The canonical per-mode map is `PUBLIC_SKILL_INVOCATION_MODES` in
`adapters/_shared/runtime-assets.cjs`. Init and Delegate are explicit-only. Research has
explicit `baseline` and grant-continuable `change-scoped`; Change has explicit
intake/evidence/acceptance and grant-continuable same-Change reconciliation; Deliver has
grant-continuable reconciliation and explicit finalization. Plan, Dev, and Test modes
are grant-continuable. Every public mode remains directly owner-invocable.

Claude and Grok receive `user-invocable` / `disable-model-invocation` frontmatter.
Kimi receives its native equivalent. Codex receives
`policy.allow_implicit_invocation` in `agents/openai.yaml`. Those Hosts expose only a
coarse Skill-level bit, and that bit is discovery, not authority: it is withheld only for
`HOST_DISCOVERY_WITHHELD_SKILLS` — Status and Delegate, the two routes the product
requires the Owner to name explicitly. Every other public Skill is discoverable,
including the `ultra-init` entry route before `.ultra/` exists. Ordinary host-chat
discovery is best-effort; `ubp run` explicitly enters Ultra and lets the host model
select the route. Its foreground launch supports Claude Code and Pi. Pi loads the packaged portable
Skills through native `--skill`, the finite W1/W2 Primary extension through native
`--extension`, and resumes through native `--session`; it does not
load Claude hooks or gain delegated-execution qualification from this entry. The six
installation adapters and their Skill surfaces are unchanged. The loaded Skill must still verify the selected mode, same
active `change_id`, grant, effects, and material checkpoints. In particular, the coarse
bit does not permit baseline Research, Change intake/acceptance, or Deliver finalization
without the Owner's current request naming that work, and it never turns an installation
or a file found on disk into activation.

OpenCode uses portable source frontmatter and native discovery, but its current Skill
schema has no equivalent owner/model routing bit: all fourteen Skills remain
discoverable and their descriptions plus the same in-Skill guard guide selection. Ultra
does not add a semantic interception hook to imitate a Host feature OpenCode does not
expose. ZCode likewise discovers all plugin Skills and relies on their portable
descriptions and runtime guard rather than a fabricated routing flag.

## Hook compatibility

| Hook | Claude | Codex | OpenCode | Kimi | Grok | ZCode |
|---|---:|---:|---:|---:|---:|---:|
| session context | yes | normalized | native bridge | normalized to message | executed; host stdout limits apply | normalized |
| mid-workflow recall | yes | handles `apply_patch` | native bridge | normalized | executed | handles `ApplyPatch` aliases |
| compact context | pre/start | pre/post | native compact event | pre/post | pre-compact | `SessionStart: compact` |
| post-edit observation | Write/Edit | Write/Edit/`apply_patch` | write/edit/patch | Write/Edit | Write/Edit/patch | Write/Edit/ApplyPatch |
| dangerous command guard | Bash advisory/deny | Bash advisory/deny | bash advisory/deny | Bash advisory/deny | Bash allow/deny mapping | Bash advisory/deny |

All hooks share the same `.ultra/` idle guard. Wire adapters normalize payload and
output fields only; they do not change semantic policy. Codex installation health and
Hook trust are distinct. Codex owns the persisted trust decision, while its plugin CLI
does not expose that live decision to Ultra. Doctor therefore reports
`hook_activation: host_managed` with `observable: false`; it claims neither trusted nor
untrusted and emits no remediation action without an authoritative Host observation.

## Agent execution driver selection

| Host | ACP candidate observed locally | Versioned conformance | 5.0 active driver | Fallback reason |
|---|---|---|---|---|
| Claude Code | preinstalled `@agentclientprotocol/claude-agent-acp` stdio adapter from the managed agent-delegation registry (registry-declared version + `CLAUDE_CODE_EXECUTABLE` native binding, launcher-injected from the one selection resolution — adapter argv, probes, runtime file, and env binding come from the same registry read, so an update between selection and launch keeps executing the originally bound files or refuses typed); pinned `npx` fallback without a registry binding. A future retained positive qualification must additionally bind the execution-site native permission configuration and the Claude SDK package metadata, and does not transfer to a worktree or SDK install that changed them | PASS, real provider receipt (earned on the `npx` route; the installed route's conformance is not separately re-earned) | ACP when the registry adapter or `npx` exists | `acp_command_unavailable` when absent |
| Codex | pinned `@agentclientprotocol/codex-acp@1.6.2` stdio adapter | PASS, real provider receipt | ACP when `npx` exists | `acp_command_unavailable` when absent |
| OpenCode | native `opencode acp` stdio server | PASS, real provider receipt | ACP when executable exists | `acp_command_unavailable` when absent |
| Kimi Code | documented [`kimi acp`](https://moonshotai.github.io/kimi-code/en/reference/kimi-acp.html) stdio server | PASS, real provider receipt | ACP when executable exists | `acp_command_unavailable` when absent |
| Grok Build | documented [`grok agent stdio`](https://docs.x.ai/build/cli/headless-scripting) | PASS, real provider receipt | ACP when executable exists | `acp_command_unavailable` when absent |
| ZCode | source-pinned `zcode-acp` v0.1.0 plus digest-bound 0.16.5 patch translating to installed `app-server` | PASS, domestic BigModel provider receipt | ACP when bridge exists and `--ack-experimental` is supplied; host enforcement admission then refuses both ZCode transports before launch (see below) | `acp_command_unavailable` when absent |

Selection is ACP-first only after the exact Host row is `passed` and names a non-empty
evidence reference: stable protocol v1, stdio, executable availability, read-only,
bounded write, permission denial,
cancellation/no-orphan, cwd/diff parity, result parity, and credential/event redaction
must all hold. Since the Stage B ACPX integration the generic
connection/session/turn engine is the installed public agent-delegation entry
(`~/.local/share/agent-delegation/runtime/acpx_delegate_entry.cjs`, pinned ACPX
runtime; `ULTRA_DELEGATE_ACPX_ENTRY` selects an exact entry for tests and
qualifications). A Host row without a readable entry reports the typed
`acp_entry_unavailable` CLI fallback — an absent runtime disables the ACP transport
honestly, it never silently widens it. The entry starts each Host inside the driver's
observed process group, copies its sanitized environment onto the Host, and forwards
raw permission requests; client-side fs/terminal callbacks stay deny-all. Static capability inspection never starts the provider. A candidate,
binary, help output, SDK version, or successful fake-agent suite alone cannot promote a
Host. The stable wire contract follows the official
[ACP v1 schema](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/v1/schema.json);
unstable v2 features are outside the 5.0 required path.

All Driver receipts and terminal results expose the selected driver, ACP capability,
and fallback reason. Doctor reports the same facts separately from installation health.
`AcpDriver` stores a bounded redacted `events.jsonl`, never raw protocol messages or
hidden reasoning. Status re-projects every displayed latest event through that fixed
safe shape and treats a corrupted journal as unavailable. `CliDriver` bounds
stdout/stderr while retaining the output tail so the existing exact Ultra result
extractor remains compatible.

Creation-time session metadata emitted by some conforming agents before the
`session/new` response is routed by the installed public entry's connection-owner
logic: the pinned runtime buffers and folds session updates per owner and turn
without comparing a per-message session ID, and `AcpDriver` consumes the entry's
public events, which carry no session ID. Ultra applies no early-session buffering,
replay, or session-identity validation of its own; the absence of the retired
engine's per-message session-ID equality check is a limitation of that public
connection routing, not an Ultra guarantee. `ULTRA_DELEGATE_FORCE_CLI=1` is an
explicit per-run recovery seam: it selects
the same bounded CLI result path and records `acp_forced_cli` without changing the
Host's stored conformance status.

## CLI fallback argv

`skills/ultra-delegate/scripts/host-profile.cjs` records current non-interactive
invocation for:

- Claude print mode with structured output and an explicit file-tool allowlist; read-only
  uses `plan`, while bounded write uses `acceptEdits` without Bash or web tools;
- Codex ephemeral `exec` with user config ignored, project rules preserved, native
  `read-only` or `workspace-write`, network disabled, and an output schema;
- OpenCode `run --auto` only after an inline config explicitly denies Bash, web,
  subagents, external directories, Skills and undeclared edit roots;
- Kimi prompt mode with a launch-only read or write agent profile that exposes only
  file tools and no Bash, web, MCP, Skills or subagents;
- Grok single-turn mode with `read-only` or `workspace` OS sandbox, structured output,
  no memory, web search or subagents, and a twelve-turn ceiling;
- ZCode headless prompt mode with native `plan` or `edit`; the current CLI accepts the
  camel-case `--disallowedTools` surface used to deny Bash, web, subagents, and (in
  read-only mode) write tools. The launcher's timeout remains the execution bound.

The pinned ZCode 0.16.5 historical conformance drill observed `--max-turns`,
`--allowed-tools`, and `--settings` in help but rejection at the live root parser, so the
locked compatibility profile does not pass those flags. That drill copied a bounded
headless provider entry through `~/.zcode/cli/config.json`; this is dated evidence for
the pinned runtime, not current universal setup guidance. Host/runtime identity and
provider identity remain separate: the verified path used ZCode Desktop with the
Owner's domestic BigModel Coding Plan provider, not international Z.AI OAuth. Current
model connections belong in the ZCode UI or `~/.zcode/v2/config.json`; the CLI config
owns plugins, Hooks, MCP, and other headless-runtime settings. BigModel Coding Plan API
keys use `https://open.bigmodel.cn/api/coding/paas/v4`; the Anthropic-compatible endpoint
belongs to the separate resource-package/prepaid-balance path. Ultra never copies
credentials. See the official [ZCode configuration](https://zcode.z.ai/en/docs/configuration)
and [provider Q&A](https://zcode.z.ai/en/docs/qa).

On macOS, the Skill-local host profile uses
`/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` when that App-bundled CLI
exists, then falls back to `zcode` on `PATH`. `UBP_DELEGATE_ZCODE_BIN` remains an explicit
test or operator override; the normal source-to-ZCode path does not require it.

The ACP bridge is independently installed from `jpalmae/zcode-acp` v0.1.0 at source
revision `42fe149d4b501469343c01f23ba3801832306d53`, then patched by the shipped
`zcode-acp-0.1.0-zcode-0.16.5.patch` with SHA-256
`8c127dba648720121da9326cae721141785f03ef72bdfae2201f50e59bb9cb36`. The patch
answers the `session/requestRuntimePreferences` server request introduced by ZCode
0.16.5 before and after session creation, and maps native `file_path` tool inputs to
ACP `ToolCallLocation`s on both tool-call updates and `session/request_permission`
requests, records host denials as failed tool-call updates while the bounded turn
stays reachable for later probes, maps the native `resultType: "cancelled"` terminal to
ACP `cancelled`, and resolves native `turn.failed` through ACP error semantics instead
of a synthetic `end_turn`. The pinned source plus patch passes the locked
Rust tests, reproduced RED, patched fake App-server E2E, release build, and real provider
session before use. It stamps the bridge as the repaired build marker
`zcode-acp 0.1.0+ultra.zcode.0.16.5.r1` — a revision distinct from the originally
installed `zcode-acp 0.1.0+ultra.zcode.0.16.5` build, which reports the un-suffixed
marker and stays bound only to the retained negative qualification record below.
Selection requires the repaired marker and an installed runtime reporting `0.16.5`,
so an old unqualified build reporting the un-suffixed marker fails the identity probe
and the enforcement identity comparison. Ultra records both source inputs and ships
only the patch; it redistributes neither the bridge binary nor any ZCode Desktop bytes.

**ZCode transport maturity is `experimental`** (recorded in
`skills/ultra-delegate/scripts/host-profile.cjs`): the App-bundled CLI is a verified-local
surface — it exists, launches, and passed the 2026-08-26 conformance drill — but
the provider publishes no headless CLI, SDK, A2A, or ZCode Protocol stability
contract. Promotion to `supported` requires both official documentation and a
full recovery drill; a binary's existence, working help, or zero exit status is
never sufficient. The other five delegate transports are documented and locally
verified through the same launcher. The maturity is live-enforced, not just
recorded: `delegate run --to zcode` refuses to launch without the explicit
`--ack-experimental` flag, prints a stderr warning, and stamps
`transport_maturity`, the exact `transport_surface` wording, and
`experimental_ack: true` onto the receipt, worker spec, and every terminal
result (including failure, cancellation, and timeout), so no delegation record
can present an internal CLI run as the documented ZCode Desktop interactive
surface. The documented interactive primary path for ZCode is the Desktop task
surface itself, not this headless transport.

## Installed delegation runner

Every managed plugin contains `ultra-delegate/scripts/delegate.cjs`, its worker, the
canonical Host profile, all three driver modules, and the Kimi launch-only profiles.
The loaded Skill resolves
that directory and invokes Node directly, so a clean plugin install does not require a
persisted Ultra package binary on `PATH` and never uses `npx` to rediscover Ultra.
The source-pinned Claude and Codex ACP adapters may themselves run through their exact
`npx --yes <package>@<version>` profiles. Doctor
reports `delegation_runner`, `acp_capability`, `agent_execution_driver`, its fallback
reason, and ZCode maturity separately from Skill discovery and Hooks. The package
`ubp delegate` surface remains a thin one-release compatibility wrapper around the same
functions; receipts and recovery commands point to the canonical Skill-local entrypoint.

### Host enforcement qualification (fail-closed admission)

`skills/ultra-delegate/scripts/host-profile.cjs` also records the exact-version Host
enforcement qualifications the launcher admits. A qualification exists only where a
coordinator-owned, redacted, no-production observation was retained; a Host without one
makes no capability claim and keeps its conformance-gated admission path. The launcher
compares the Packet's required dimensions — `writable_scope` for write packets, plus
`outside_root_denial`, `shell_tool_denial`, `agent_tool_network_denial`, and
`point_of_use_effect_boundary` for every packet — against the selected transport's
facts before the worktree fence, the worker spec, or any Host process exists, and
returns one typed `host_enforcement_unavailable` diagnostic without silent fallback.

The one retained record binds the installed `zcode-acp 0.1.0+ultra.zcode.0.16.5`
bridge over ZCode runtime `0.16.5` (evidence:
`.ultra/evidence/vnext-d1-host-enforcement-qualification/host-enforcement-receipt.json`).
It is retained unchanged as history: after the repaired-marker split, selection
declares `zcode-acp 0.1.0+ultra.zcode.0.16.5.r1`, so the declared identity is
version-mismatched against this record and every packet dimension fails closed until a
new exact-identity qualification of the repaired build is retained — the originally
installed build can never be admitted under the repaired identity.
Its single authorized no-production call observed `writable_scope` unsupported — the
ACP edit request carried no provable location, so the product denied it as
`outside_envelope` before any write — and every later effect dimension unobserved, so
they stay unsupported rather than inferred from zero side effects. Provider transport
for the qualification call was separately authorized only and never grants Worker
effects. Adapter
preinstallation (the installed adapter invoked directly, no runtime package fetch),
env-key isolation, credential-value redaction and receipt truth were separately
observed supported. The disposition is route `unavailable` with no silent fallback and
no maturity change: ZCode stays `experimental`, both ZCode transports are unavailable
for delegation packets, and the five documented transports keep their existing
conformance-gated admission with no new capability claim.

### ZCode Desktop Workspace Memory (post-turn host effect)

ZCode Desktop ships an optional Workspace Memory feature that extracts project
memory after a completed turn into provider-local files under
`~/.zcode/cli/memories/projects/<project>/memory`. Corrected facts
(2026-08-17):

- the feature is operator-controlled through the documented Workspace Memory
  setting (`memoryEnabled` in `~/.zcode/v2/setting.json`); it is not always
  default-off — it was observed enabled on this machine, and a fresh task
  inherits the operator's current selection;
- `memoryEnabled=false` is the single effective master gate: the App runtime
  injects `memory:{enabled:false}`, and every recall, root access, and
  post-turn extraction path resolves through one enabled-root resolver that
  returns no root while it is false. The logged `memoryExtractionEnabled` and
  `memoryUse` values are absent-key, disable-only defaults, not independent
  owner-facing gates;
- the extracted files are ordinary local files outside the repository that the
  operator can browse and clear directly; they are non-authoritative and
  non-portable — never Git content, never shared authority, never Ultra
  evidence;
- when the feature is enabled, the post-turn extraction is a Host external
  effect: an owner-authorized transfer must allow it in the OFFER `effects`
  and disclose it in the RESULT `external_effects`
  (`skills/ultra-change/references/primary-transfer.md`); a strict
  zero-external-effect pass requires a fresh task with the master setting off
  plus an independent reviewer postflight;
- Ultra never parses or mutates the provider setting.

The accepted r3 design document's section 7.1 local-memory snapshot
("local-only, default-off, cannot be browsed or cleared") is superseded by the
current documented UI and the observed runtime behavior above; the frozen
design bytes stay unedited.

The launcher accepts no external-effect authority. It binds instruction, permission and
output-schema digests, a clean Git worktree, allowed write roots, actual changed paths,
strict result schema, timeout and cancellation. Empty roots select read-only mode. The
model returns structured output and never authors the receipt. Host-native permissions
are the execution boundary; the primary host still inspects and integrates the isolated
diff. The launcher embeds the digest-bound packet in the prompt because OpenCode's
correct `external_directory: deny` policy prevents reading packet paths beside the
worktree. Codex receives a native-schema-compatible projection; the launcher separately
enforces non-empty strings, normalized unique paths, exact fields, and the observed diff.

### Historical authenticated CLI-fallback conformance — 2026-08-14

Before ACP activation, one clean, read-only seeded repository exercised the then-current
CLI driver against all six installed Host CLIs. Claude Code, Codex, OpenCode, Kimi Code,
and ZCode each produced a validated `finished` result with an empty diff and found the
seeded consequential defect. Grok Build 1.0.3 exited zero but repeatedly emitted
truncated or malformed structured output; the launcher correctly published
`failed/missing_result` and did not count partial text as evidence. This dated drill
proves the retained typed fallback behavior; it is not the current primary transport,
a permission bypass, or a semantic Review result.

ZCode was also exercised as the source host: one historical ZCode session invoked the
then-current compatibility wrapper `ubp delegate run --to claude`, waited for the
terminal artifact, and reported Claude's digest-bound read-only result without changing
the worktree. Separately, one bounded
ZCode Autonomy Envelope completed Plan, Plan review, TDD, task review, Test, and aggregate
review for one task, then stopped before ungranted delivery and Git effects. Exact
fixtures, session boundaries, checks, and residual risks are recorded in
`docs/evals/adversarial-review-2026-08-14.md` and
`docs/evals/zcode-automation-2026-08-14.md`.

## Lifecycle verification

Each adapter must pass isolated install, doctor, reinstall, and uninstall tests. Real
global doctor additionally asks the native host where supported, but never repairs or
installs. Codex still performs native registration under `--config-dir`; its host process
inherits the same isolated `HOME` and `CODEX_HOME`. Grok native registration is skipped
only in explicit isolated test mode. ZCode uses its documented inline-plugin directory
configuration for immediate activation while also publishing an importable local
marketplace; real global Doctor verifies the native plugin inventory. Lifecycle tests also require the isolated config
and fake HOME to contain zero children after uninstall, while separate ownership tests
prove that pre-existing empty Codex and Kimi registries survive.

## Authenticated cross-host continuation evidence

On 2026-08-03, one deliberately narrow task was run in an isolated Git repository to
test the product's central recovery claim with real authenticated models. This was a
continuation drill, not a full project workflow or a delegation receipt test.

Both hosts used globally installed artifacts from the same clean source candidate:

- source commit: `c473a248bde2afce77591f2ba382246d420b5c72`;
- worktree digest: `e83bdcbe2905cf02cb06cb0219127f6ce0400484331a6e9fc95622bbe24b44bd`;
- Doctor: Claude healthy with 83 assets and zero issues; Codex healthy with 99 assets
  and zero issues, with optional hooks still `user_review_required`.

The seed repository had one passing smoke test, one pending task, one mapped Change
acceptance ID, and seed HEAD `cf27d62aeeae353e0650413de6d9a118b89a0406`.

| Phase | Execution boundary | Observed result |
|---|---|---|
| Claude | One print-mode call, `acceptEdits`, no persistent session, empty MCP config, explicit file and local-test tools, USD 1.00 cap | Exit 0 at USD 0.741367 with zero web requests. It changed only the task ledger/context, added `test/slug.test.cjs`, and allowed the hook to write disposable progress. `src/slug.cjs` and completion evidence remained untouched. The task test exited 1 with actual `hello,-world!` versus expected `hello-world`; both task surfaces read `in_progress`, and the Resume Note named the exact next action. |
| Codex | One ephemeral `workspace-write` call with sandbox network disabled and no conversation from Claude | Exit 0. It found and read the installed `ultra-dev` Skill, recovered the single task from Git and `.ultra/`, reproduced the same red, changed only the intended implementation, then passed the task test 1/1 and `npm test` 2/2. It wrote the three-command canonical evidence record and logs, completed both task status surfaces, and filled Completion and the final Resume Note. |
| Independent check | Local commands after both model calls | `node --test test/slug.test.cjs` passed 1/1, `npm test` passed 2/2, `git diff --check` passed, and a structural check confirmed one completed task, six evidence dimensions, three existing command-log references, and matching ledger/context state. |

The Codex process emitted non-blocking diagnostics for an older local model-cache
schema and an unauthenticated user-config MCP startup. No MCP result was consumed and
no external effect occurred; all task actions used local file and shell tools. This
means the drill proves file-backed Claude-to-Codex continuation even while Codex hooks
remain untrusted, but it does not claim that arbitrary user configuration starts
without unrelated host diagnostics.

The result establishes one real end-to-end example of cross-host resume without a
shared conversation, database, MCP authority, daemon, or generated prompt projection.
It does not establish output quality for every model, host, repository, or task shape.
Task-level `ultra-review` and commits were intentionally excluded from the drill so the
two host calls tested only the handoff boundary.

Two older `.ultra` evidence snapshots originally named the completed WIP by its former
path. The current-path artifact contract requires every reference to resolve in the
checkout, so those two references now point here while their 2026-08-01 status and
limitations remain explicitly historical. The original WIP is still recoverable from
their pinned source commit `3f99189bc68697262cd90444685ac2d4857139c4` with
`git show`; the live `docs/wip/` directory contains no unfinished document.
