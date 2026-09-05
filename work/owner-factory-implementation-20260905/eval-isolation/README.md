# Evaluation launch isolation (A-R7 repair)

Smallest usable OS-level isolation for the actual ZCode owner-journey
evaluation. It wraps the evaluation launch in the macOS seatbelt sandbox
(`sandbox-exec`, already installed; no dependencies, no daemon, no global
settings) so that product writes and **failing product tests** cannot escape
the evaluation project/temp roots into real-HOME business data — including
the A-R7 mechanism, where a test unsets `HOME` and Python's `Path.home()`
falls back to the password database and resolves the real user home. The
sandbox is a kernel path check, so containment does not depend on `HOME` at
all.

## How it works

`ubp-eval-sandbox.sh` generates this seatbelt profile and execs the command
under it (actual output on this host):

```
(version 1)
(allow default)                                                    ; reads, network, keychain, mach OK
(deny file-write* (subpath "/Users/rocky243"))                     ; canonical real HOME
(allow file-write* (subpath "/Users/rocky243/.zcode/cli/rollout"))
(allow file-write* (subpath "/Users/rocky243/.zcode/cli/db"))
(allow file-write* (subpath "/Users/rocky243/.zcode/cli/exec"))
(allow file-write* (subpath "/Users/rocky243/.zcode/cli/artifacts"))
(allow file-write* (subpath "/Users/rocky243/.zcode/cli/image-cache"))
(allow file-write* (subpath "/Users/rocky243/.zcode/cli/pdf-cache"))
(allow file-write* (subpath "/Users/rocky243/.zcode/cli/video-cache"))
```

- Last matching rule wins (verified), so each allow re-opens exactly one
  named session cache — nothing else under HOME.
- The sandbox is kernel-enforced on the wrapped process and inherited by all
  children (verified for nested `sh`, `node`, `python3`). Wrapping the
  `agent-delegate run --to zcode ...` invocation therefore covers the
  `node zcode.cjs` child it spawns.
- All profile paths are canonicalized (`/tmp` → `/private/tmp`); symlink
  escapes — including a symlink planted **inside an allowed cache** pointing
  at a denied sibling — and alias spellings of the deny root are denied
  (verified). Profile interpolation rejects quote/backslash/control
  characters, which real operator inputs (`$HOME`, `/tmp` roots) never
  contain.

## Why exactly these seven caches (and nothing else)

Each re-opened path is justified by the installed ZCode 0.16.5 bundle source
(`/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`) plus live
evidence that the real headless CLI wrote there during actual sessions on
2026-09-05:

| Allowed subpath | Bundle consumer | Evidence it is required |
|---|---|---|
| `~/.zcode/cli/rollout` | `SCo()` — `join(homedir(),".zcode","cli",…"rollout")`, **homedir-hardcoded** (offset 6869016) | `model-io-sess_*.jsonl` written 18:41 during live sessions; session persistence the native `--resume` transport reads |
| `~/.zcode/cli/db` | `Q9e()` — `join(homedir(),".zcode","cli","db","db.sqlite")`, **homedir-hardcoded** (offset 882501) | `db.sqlite`/`-wal` written 18:41 during live sessions |
| `~/.zcode/cli/exec` | `qK()` — `join(ZCODE_STORAGE_DIR‖~/.zcode,"cli","exec")` (offset 1527271) | `exec/sess_*` and `bash-startup` written 18:41; the terminal tool's shell snapshots |
| `~/.zcode/cli/artifacts` | `artifactStore` `rootDir` (offset 11953323) | `artifacts/sess_*` written 18:32 during live sessions; per-session tool-output/artifact persistence |
| `~/.zcode/cli/image-cache`, `pdf-cache`, `video-cache` | same `artifactStore` callsite — `imageCacheRootDir`/`pdfCacheRootDir`/`videoCacheRootDir` | media cache roots of the same pipeline (`image-cache` exists on disk; pdf/video are created on demand) |

Explicitly **denied** (the A-R7 review's gap-1 classes), with the reason each
is safe to deny:

- `~/.zcode/cli/config.json` — user/provider **config**; read via
  `join(homedir(),".zcode","cli","config.json")` (offset 946258), reads are
  default-allowed. Writes stay denied: config mutation is not part of the
  evaluation.
- `~/.zcode/cli/plugins/**` — plugin install/registry class
  (`installed_plugins.json`, `known_marketplaces.json`, `marketplaces/`,
  seed-lock writer at offset 11811583). The evaluation plugin is isolated
  under the test root and reached through the project `.zcode/config.json`
  `plugins.dirs`, so no HOME plugin write is needed.
- `~/.zcode/v2/**` — shared credential store
  (`resolveSharedZCodeCredentialsPath()` = `<ZCODE_DATA_BASE_DIR‖home>/.zcode/v2/credentials.json`,
  offset 7175126) and telemetry state. Credential **reads** are
  default-allowed so provider auth keeps working. Credential **writes**
  (token refresh) stay denied — credential change is an owner-unauthorized
  effect; ensure a fresh token before a wrapped run (see Limitations). A
  denied telemetry-state write is tolerated by the CLI by design
  (`xSo(...).catch(()=>i())`, offset 4686477).
- `~/.zcode/security`, `skills`, `hooks`, `agents`, `agent-memory`,
  `tmp`, `cache`, `clipboard`, `projects`, `workspace*`, `plugin-workspace`,
  `computer-use`, `logs` — config/security/definition/workspace classes or
  caches no headless-bundle consumer requires. `cli/sessions` (workflow
  scripts, `lcn()` offset 11926342) and `cli/debug` are likewise denied; no
  such directory exists after months of unwrapped use.
- Everything else under HOME — default deny.

Not re-opened because an existing relocation setting covers it instead
(the review's preferred path):

- **Logs** → `ZCODE_LOG_DIR`: full log-dir override (`Jb()`, offset 6933679;
  default would be `~/.zcode/cli/log`). The launch contract points it into
  the evaluation isolation root.
- **Agent-delegate receipts** → `AGENT_DELEGATION_CONFIG`: alternate registry
  path (`agent_delegate.py:48-54`); the registry's `receipt_root` decides
  where `run` writes `request.json` **before** calling ACPX
  (`agent_delegate.py:255-265,438-456`). The launch contract uses an isolated
  registry copy whose `receipt_root` sits inside the evaluation isolation
  root (see below). This closes the review's gap 2 without any HOME
  exception: the ordinary `agent-delegate run` path works under the default
  profile.
- `ZCODE_STORAGE_DIR` is deliberately **not** used: it would relocate
  `agents`/`agent-memory`/`data` reads as well (offsets 3107, 553210),
  changing Host capabilities the evaluation must keep consistent. Named
  caches are the smaller change.

`~/.zcode/cli/context-mode` and `~/.zcode/cli/agents` were seen written on
2026-09-05 but have **no path literal in the headless bundle** (desktop-app
state), so they are not re-opened. If provider qualification ever proves a
further cache is required, add it with `--allow-under-deny PATH` plus a
source justification — never a bare `.zcode` allow.

## Verify (harmless, run first)

```bash
work/owner-factory-implementation-20260905/eval-isolation/verify-isolation.sh
```

Creates its own temporary parent, proves permitted/denied behavior against a
decoy home (child-process, missing-HOME fallback-shaped, symlink and
symlink-trampoline, alias-spelling, named-cache vs neighboring
config/plugin/security, profile-shape, isolated-registry, and
receipt-first-launch cases), and exits 0 only if every expectation holds. The
real HOME is never used as a write target.

## Prepare the isolated delegation config (once per evaluation root)

The installed registry is pure metadata (paths, versions, hashes); the
generator refuses anything with a secret-looking field and never touches
credentials:

```bash
EVAL=/tmp/ubp-owner-journeys-<id>
ISO="$EVAL/isolation"
python3 work/owner-factory-implementation-20260905/eval-isolation/prepare-delegation-config.py \
  --receipt-root "$ISO/receipts" \
  --out "$ISO/agent-delegation.config.json"
# copies the installed registry, rewrites ONLY receipt_root, writes mode 0600
```

## Launch the actual evaluation (Codex operator)

```bash
export AGENT_DELEGATION_CONFIG="$ISO/agent-delegation.config.json"
export ZCODE_LOG_DIR="$ISO/zcode-logs"

# A. Wrap the registered delegate bridge (its CLI child inherits the sandbox):
work/owner-factory-implementation-20260905/eval-isolation/ubp-eval-sandbox.sh \
  --profile-out "$ISO/eval-sandbox-profile.sb" -- \
  agent-delegate run --to zcode --caller codex ...

# B. Wrap the native CLI directly (the verified continuation transport,
#    native same-session --resume; AGENT_DELEGATION_CONFIG is irrelevant here):
work/owner-factory-implementation-20260905/eval-isolation/ubp-eval-sandbox.sh \
  --profile-out "$ISO/eval-sandbox-profile.sb" -- \
  /Users/rocky243/.hermes/node/bin/node \
  /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs --resume <session-id>
```

Notes:

- `--profile-out` keeps the exact profile next to the other run receipts as
  launch evidence; the stderr banner records deny root, exceptions, and the
  wrapped command. Record the profile actually used for every real run.
- The evaluation project root stays under `/tmp/ubp-owner-journeys-<id>` as
  before; it is outside the deny root, so product writes there work
  unchanged. The isolated plugin install (configDir under the same test
  root) is likewise unaffected, and receipts/logs now land under
  `$EVAL/isolation/` alongside it.
- The environment exports must be visible to the wrapped command (export
  before invoking the wrapper, or prefix them onto the wrapped command);
  `sandbox-exec` passes the environment through unchanged.
- `--allow-under-deny PATH` (repeatable) adds operator-named exceptions after
  the seven caches. Each use needs a per-run source justification; do not
  re-open config/plugin/security classes with it.

## Limitations (read before qualifying the provider under it)

- Covers only processes **launched through the wrapper**. An already-running
  process, or a separately launched ZCode.app GUI instance, is not covered.
- Only **writes under the deny root** (default: real HOME, minus the seven
  named caches) are blocked. Reads, network, and credential/keychain access
  are deliberately unaffected so provider auth keeps working — this is not
  read or network containment and must not be claimed as such. Writes
  outside HOME (e.g. system paths writable by this user) are not restricted —
  outside the A-R7 incident class.
- **Credential refresh writes under `~/.zcode/v2` are denied by design**
  (credential change is owner-unauthorized). A mid-run token refresh attempt
  fails with `Operation not permitted` and will fail the run; refresh
  provider auth shortly before a wrapped run. Denied telemetry-state writes
  are tolerated by the CLI (source-verified `.catch` fallback).
- `~/.zcode/cli/config.json` writes are denied by design; a CLI attempting a
  config migration/mutation mid-run would surface EPERM — intended, to keep
  config mutation out of the evaluation.
- The plugin runtime data dir (`ZCODE_PLUGIN_DATA`, e.g.
  `~/.zcode/cli/plugins/data/...`) stays denied. The bundled UBP hooks are
  observe-only and write under the project; if qualification shows a hook
  needs plugin-data writes, add `--allow-under-deny "$HOME/.zcode/cli/plugins/data"`
  for that run with a recorded justification.
- A failing product test under the wrapper now fails with `Operation not
  permitted` and leaves nothing behind; the sandbox is defense-in-depth
  around the test, not a replacement for the fixed product HOME guard.
- `sandbox-exec` is deprecated by Apple but verified functional on this host
  (macOS 15.6.1): the `(deny default)` smoke test blocks `execvp`, and every
  deny/allow case in `verify-isolation.sh` behaves as expected. If a future
  macOS silently no-ops it, the cheapest concrete alternative is a dedicated
  throwaway local user account for evaluation runs (home-directory writes
  then land in that account); that was not built here because the native
  mechanism works and no new identity was authorized.
