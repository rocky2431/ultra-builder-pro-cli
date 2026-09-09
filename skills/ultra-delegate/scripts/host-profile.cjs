'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KIMI_PROFILE_ROOT = path.join(__dirname, 'delegate-profiles');
const ZCODE_BUNDLED_CLI = '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs';
const CLAUDE_ACP_PACKAGE = '@agentclientprotocol/claude-agent-acp@0.70.0';
const CLAUDE_ACP_ADAPTER_PACKAGE = '@agentclientprotocol/claude-agent-acp';
// The explicit installed-adapter override, symmetric with the ZCode bridge
// selector: an absolute path to the ACP adapter executable the selection
// launches instead of the managed-registry or npx route.
const CLAUDE_ACP_COMMAND_ENV = 'ULTRA_CLAUDE_ACP_COMMAND';
const CODEX_ACP_PACKAGE = '@agentclientprotocol/codex-acp@1.6.2';
const ZCODE_ACP_SOURCE = Object.freeze({
  repository: 'https://github.com/jpalmae/zcode-acp',
  version: '0.1.0',
  commit: '42fe149d4b501469343c01f23ba3801832306d53',
  // Repair revision r1 of the ultra bridge build for ZCode 0.16.5. It is a
  // distinct truthful marker from the originally installed
  // `0.1.0+ultra.zcode.0.16.5` build, which stays bound only to the retained
  // negative enforcement record below so that build can never be admitted
  // under the repaired identity.
  buildMarker: 'zcode-acp 0.1.0+ultra.zcode.0.16.5.r1',
  runtimeVersion: '0.16.5',
  patch: Object.freeze({
    path: 'skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch',
    sha256: '8c127dba648720121da9326cae721141785f03ef72bdfae2201f50e59bb9cb36',
    compatibility: 'ZCode CLI 0.16.5 runtime-preferences handshake; native file_path ToolCallLocations in updates and permission requests; host denials recorded with the turn still terminal; native resultType cancelled and turn.failed keep truthful ACP terminals',
  }),
});

// The ZCode app-bundled CLI is a verified-local surface, not a provider
// stability promise: official documentation plus a full recovery drill must
// both hold before any transport may claim 'supported'.
const TRANSPORT_MATURITY = Object.freeze({
  claude: 'documented+verified',
  codex: 'documented+verified',
  opencode: 'documented+verified',
  kimi: 'documented+verified',
  grok: 'documented+verified',
  zcode: 'experimental',
  pi: 'experimental',
});

// One canonical target-aware descendant environment policy. The allowlist is
// the minimum process/runtime discovery every descendant still needs; env
// keys that are not named here and not declared by the selected Host's
// envDiscovery never cross the delegation boundary. HOME is deliberately
// retained: file-based credentials reachable through HOME stay reachable, and
// no isolation from them is claimed.
const BASE_ENV_KEYS = Object.freeze([
  'APPDATA', 'COMMONPROGRAMFILES', 'COMMONPROGRAMFILES(X86)', 'COMSPEC', 'HOME',
  'HOMEDRIVE', 'HOMEPATH', 'LANG', 'LC_ALL', 'LOCALAPPDATA', 'LOGNAME',
  'NUMBER_OF_PROCESSORS', 'OS', 'PATH', 'PATHEXT', 'PROCESSOR_ARCHITECTURE',
  'PROGRAMDATA', 'PROGRAMFILES', 'SHELL', 'SYSTEMROOT', 'TERM', 'TEMP', 'TMP',
  'TMPDIR', 'TZ', 'USER', 'USERNAME', 'USERPROFILE', 'WINDIR',
  'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
  // Runtime discovery for the installed public ACPX delegate entry that owns
  // every generic ACP connection/session/turn concern. It is a path selection,
  // never a credential, and never forwarded by the launcher itself.
  'ULTRA_DELEGATE_ACPX_ENTRY',
]);
const BASE_ENV_PREFIXES = Object.freeze(['LC_']);
// Launcher-owned selection control: consumed by driver selection before any
// descendant exists, never forwarded to a Host.
const PROBE_ONLY_ENV_KEYS = Object.freeze(['ULTRA_DELEGATE_FORCE_CLI']);
// Per-Host grants are exact keys only — no provider namespace is admitted for
// convenience. Each key below is evidenced by this repository: the config-root
// and bridge-discovery overrides named in `docs/RUNTIME-COMPAT-MATRIX.md` and
// the host adapters, the ZCode bridge selector consumed by the ACP profile,
// and the currently exercised selected-Host authentication path
// (`OPENAI_API_KEY`, asserted by the ACP conformance flow). Other env-carried
// provider credentials stay behind HOME/config files until Task 2 qualifies
// each exact key.
const HOST_ENV_DISCOVERY = Object.freeze({
  claude: Object.freeze({ exact: Object.freeze(['CLAUDE_CONFIG_DIR', CLAUDE_ACP_COMMAND_ENV]) }),
  codex: Object.freeze({ exact: Object.freeze(['OPENAI_API_KEY', 'CODEX_HOME']) }),
  opencode: Object.freeze({ exact: Object.freeze(['OPENCODE_CONFIG_DIR', 'OPENCODE_CONFIG']) }),
  kimi: Object.freeze({ exact: Object.freeze(['KIMI_CODE_HOME']) }),
  grok: Object.freeze({ exact: Object.freeze(['GROK_HOME']) }),
  zcode: Object.freeze({ exact: Object.freeze(['ZCODE_HOME', 'ULTRA_ZCODE_ACP_COMMAND']) }),
  pi: Object.freeze({ exact: Object.freeze(['PI_CODING_AGENT_DIR']) }),
});

function normalizeEnvKey(key, platform) {
  return platform === 'win32' ? String(key).toUpperCase() : String(key);
}

function envPolicyMatches(key, policy, platform = process.platform) {
  const exact = Array.isArray(policy?.exact) ? policy.exact : [];
  const prefixes = Array.isArray(policy?.prefixes) ? policy.prefixes : [];
  const candidate = normalizeEnvKey(key, platform);
  return exact.some((name) => normalizeEnvKey(name, platform) === candidate)
    || prefixes.some((prefix) => candidate.startsWith(normalizeEnvKey(prefix, platform)));
}

function pickEnvByPolicy(source, matches) {
  const picked = {};
  for (const key of Object.keys(source)) {
    if (matches(key)) picked[key] = source[key];
  }
  return picked;
}

// Role views derived from one launcher snapshot: the probe adds only the
// launcher selection control, the final Host adds nothing, and the worker is
// the single view that carries the launcher-local packet path variables.
function descendantEnvViews(source, profile, { platform = process.platform, packetEnv = {} } = {}) {
  const discovery = profile && typeof profile.envDiscovery === 'object' && profile.envDiscovery !== null
    ? profile.envDiscovery
    : {};
  const base = pickEnvByPolicy(source, (key) => envPolicyMatches(key, { exact: BASE_ENV_KEYS, prefixes: BASE_ENV_PREFIXES }, platform)
    || envPolicyMatches(key, discovery, platform));
  const probe = {
    ...base,
    ...pickEnvByPolicy(source, (key) => envPolicyMatches(key, { exact: PROBE_ONLY_ENV_KEYS }, platform)),
  };
  const host = { ...base };
  const worker = { ...host, ...packetEnv };
  return Object.freeze({
    probe: Object.freeze(probe),
    host: Object.freeze(host),
    worker: Object.freeze(worker),
  });
}

const ACP_CONFORMANCE = Object.freeze({
  claude: Object.freeze({
    status: 'passed',
    evidence: 'docs/evals/ultra-5-0-live-acp-conformance.md#claude-code',
    receiptSha256: '9b1d88cbd5e5b66a56e0cf19f34e7f2107f9e4b8fde9d80b9eadcdfc8f4a25e3',
  }),
  codex: Object.freeze({
    status: 'passed',
    evidence: 'docs/evals/ultra-5-0-live-acp-conformance.md#codex',
    receiptSha256: 'e82287609397807fb6968dff104d7f6569499b53c77be6a186aa33939a4c629e',
  }),
  opencode: Object.freeze({
    status: 'passed',
    evidence: 'docs/evals/ultra-5-0-live-acp-conformance.md#opencode',
    receiptSha256: '3575b148f6feb8c9f1472add705390e6d47b87be080403ec7006b66a29f7873b',
  }),
  kimi: Object.freeze({
    status: 'passed',
    evidence: 'docs/evals/ultra-5-0-live-acp-conformance.md#kimi-code',
    receiptSha256: '30d8adec2877f80fadf0b20c3cb7fa6b732dea3598d7484c143f9835770301fe',
  }),
  grok: Object.freeze({
    status: 'passed',
    evidence: 'docs/evals/ultra-5-0-live-acp-conformance.md#grok-build',
    receiptSha256: '370eeae12d63443188d519825ed8040fd8bba9b27fddb82e499d9cb590f4a33d',
  }),
  zcode: Object.freeze({
    status: 'passed',
    evidence: 'docs/evals/ultra-5-0-live-acp-conformance.md#zcode',
    receiptSha256: '156080f88ed84a013fb26d93e5138230732d2ef0e2b5b10a7c3deb501d3548e9',
  }),
});

function zcodeBinary({ platform = process.platform, exists = fs.existsSync } = {}) {
  return platform === 'darwin' && exists(ZCODE_BUNDLED_CLI)
    ? ZCODE_BUNDLED_CLI
    : 'zcode';
}

// The managed agent-delegation registry's preinstalled Claude adapter, read
// from the same `~/.config/agent-delegation/config.json` object the public
// ACPX entry resolver consumes. Only the exact published keys are read — the
// target's argv (element 0 is the adapter executable) and its
// cli_env.CLAUDE_CODE_EXECUTABLE native binding — never arbitrary registry
// env values or secrets. HOME comes from the selection environment, so no
// machine home path is baked into product data. Semantics mirror the entry
// resolver: no HOME or an unreadable/absent registry carries no binding (the
// legacy npx route stays the source), while a PUBLISHED-but-broken claude
// target throws so the selection fails closed with a typed reason instead of
// silently substituting another adapter.
function claudeInstalledAcp(env = process.env, { exists = fs.existsSync } = {}) {
  const home = typeof env?.HOME === 'string' && env.HOME ? env.HOME : null;
  if (!home) return null;
  let registry;
  try {
    registry = JSON.parse(
      fs.readFileSync(path.join(home, '.config', 'agent-delegation', 'config.json'), 'utf8'),
    );
  } catch {
    return null;
  }
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return null;
  const targets = registry.targets && typeof registry.targets === 'object' ? registry.targets : null;
  const target = targets && typeof targets.claude === 'object' && targets.claude !== null
    && !Array.isArray(targets.claude)
    ? targets.claude
    : null;
  if (!target) return null;
  const argv = Array.isArray(target.argv) ? target.argv : null;
  if (!argv || argv.length === 0 || argv.some((item) => typeof item !== 'string' || !item)) {
    throw new Error('the managed agent-delegation registry publishes a claude target whose argv is malformed');
  }
  const adapter = argv[0];
  if (!path.isAbsolute(adapter) || !exists(adapter)) {
    throw new Error(`the managed agent-delegation registry binds a claude adapter that is not an absolute existing file: ${adapter}`);
  }
  const packages = registry.runtime_packages && typeof registry.runtime_packages === 'object'
    ? registry.runtime_packages
    : {};
  const declaredVersion = typeof packages[CLAUDE_ACP_ADAPTER_PACKAGE] === 'string'
    && packages[CLAUDE_ACP_ADAPTER_PACKAGE]
    ? packages[CLAUDE_ACP_ADAPTER_PACKAGE]
    : null;
  if (!declaredVersion) {
    throw new Error('the managed agent-delegation registry does not declare the installed claude adapter version');
  }
  const cliEnv = target.cli_env && typeof target.cli_env === 'object' ? target.cli_env : {};
  const nativeExecutable = cliEnv.CLAUDE_CODE_EXECUTABLE;
  if (typeof nativeExecutable !== 'string' || !path.isAbsolute(nativeExecutable)
      || !exists(nativeExecutable)) {
    throw new Error('the managed agent-delegation registry does not bind an absolute existing CLAUDE_CODE_EXECUTABLE for the claude target');
  }
  const runtimeVersion = typeof target.observed_version === 'string' && target.observed_version.trim()
    ? target.observed_version.trim()
    : null;
  if (!runtimeVersion) {
    throw new Error('the managed agent-delegation registry does not record the claude native CLI version');
  }
  return Object.freeze({
    adapter,
    adapterArgs: Object.freeze([...argv.slice(1)]),
    adapterPackage: `${CLAUDE_ACP_ADAPTER_PACKAGE}@${declaredVersion}`,
    nativeExecutable,
    runtimeVersion,
  });
}

// One resolution of the Claude ACP launch command: an explicit absolute
// override first (selection control and exact-version pinning, symmetric with
// the ZCode bridge selector), then the managed registry's preinstalled
// adapter, then the legacy pinned npx route. The returned selection carries
// the exact registry binding it consumed (`installed`, or null on the
// override/npx routes without one) so one launch can thread a single
// resolution through every consumer — command, argv, identity probes, the
// declared runtime file, and the launcher delegate env — instead of each
// consumer re-reading the registry and possibly mixing two bindings.
function claudeAcpSelection(env = process.env, deps) {
  const override = env?.[CLAUDE_ACP_COMMAND_ENV];
  if (typeof override === 'string' && override) {
    // The override pins only the adapter executable; the native binding still
    // comes from the registry when one is healthy (best effort — a broken
    // registry never breaks an explicitly pinned adapter launch).
    let installed = null;
    try {
      installed = claudeInstalledAcp(env, deps);
    } catch {
      installed = null;
    }
    return Object.freeze({ command: override, args: Object.freeze([]), installed });
  }
  const installed = claudeInstalledAcp(env, deps);
  if (installed) {
    return Object.freeze({ command: installed.adapter, args: installed.adapterArgs, installed });
  }
  return Object.freeze({ command: 'npx', args: Object.freeze(['--yes', CLAUDE_ACP_PACKAGE]), installed: null });
}

// The exact native permission configuration files a Claude enforcement
// qualification binds, relative to the execution root (the delegated
// worktree). Both project-tier files carry identical bytes at qualification
// sites; a site missing or changing any of them does not inherit a retained
// qualified result.
const CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS = Object.freeze(['.claude/settings.json', '.claude/settings.local.json']);

// The deterministic native permission settings bytes a qualification site
// writes into every CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS file. The schema is
// the one the installed adapter actually reads: permissions.defaultMode (the
// adapter surfaces it as the native query permissionMode — a top-level
// defaultMode key is never consumed), and the official all-tools ask glob
// (every tool except EndConversation) as the minimal complete ask rule —
// current canonical names (Agent, not Task), MCP tools, and future tools all
// reach the permission callback, and no tool is removed by a deny rule.
// Ordinary layered hooks are disabled; no other policy is invented.
function renderClaudeNativePermissionSettings() {
  return `${JSON.stringify({
    permissions: {
      defaultMode: 'default',
      ask: ['*'],
    },
    disableAllHooks: true,
  }, null, 2)}\n`;
}

// D1 host enforcement qualification — provider-neutral capability facts and
// packet admission. Dimension names are product vocabulary, never provider
// brands. A Host makes an enforcement claim only through an exact-version
// record whose coordinator-owned, redacted, no-production observation was
// retained; a Host with no record makes no capability claim and keeps its
// conformance-gated admission path. Unattempted or mechanically unobservable
// dimensions stay unsupported and are never inferred from zero side effects.
const ENFORCEMENT_QUALIFICATION_SCHEMA = 'ultra-host-enforcement-qualification-v1';
const PACKET_WRITE_DIMENSION = 'writable_scope';
const PACKET_ALWAYS_DIMENSIONS = Object.freeze([
  'outside_root_denial',
  'shell_tool_denial',
  'agent_tool_network_denial',
  'point_of_use_effect_boundary',
]);

function requiredPacketEnforcementDimensions({ readOnly } = {}) {
  return readOnly
    ? [...PACKET_ALWAYS_DIMENSIONS]
    : [PACKET_WRITE_DIMENSION, ...PACKET_ALWAYS_DIMENSIONS];
}

// A retained qualified identity may additionally bind the observed execution
// bytes of the exact ACP route it qualified: the selected adapter executable,
// the native runtime file, the resolved public ACPX entry, and the public SDK
// package metadata (name/version/package.json digest) that entry loads. The
// binding is content identity, never a path — installs may relocate, and no
// temporary or install absolute path is portable product data. The declared
// marker/version strings remain the pure admission identity; the fingerprint
// binding is required, and consumed by the selection/launch seam, only when
// those strings match, so a record that could admit the ACP route never rests
// on two declared strings alone.
const EXECUTION_IDENTITY_FILE_FIELDS = Object.freeze([
  'adapter_sha256',
  'runtime_sha256',
  'acpx_entry_sha256',
]);

function sha256Hex(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function qualifiedAcpxPackage(qualified) {
  const pkg = qualified && typeof qualified.acpx_package === 'object' && qualified.acpx_package !== null
    ? qualified.acpx_package
    : null;
  if (!pkg) return null;
  return Object.freeze({
    name: typeof pkg.name === 'string' && pkg.name ? pkg.name : null,
    version: typeof pkg.version === 'string' && pkg.version ? pkg.version : null,
    package_json_sha256: sha256Hex(pkg.package_json_sha256) ? pkg.package_json_sha256 : null,
  });
}

// The Claude SDK package metadata a qualified claude record binds: the same
// portable shape as the ACPX package binding (name/version/package.json
// digest), resolved at launch from the adapter the selection hashed.
function qualifiedClaudeSdkPackage(qualified) {
  const pkg = qualified && typeof qualified.claude_sdk_package === 'object'
    && qualified.claude_sdk_package !== null
    ? qualified.claude_sdk_package
    : null;
  if (!pkg) return null;
  return Object.freeze({
    name: typeof pkg.name === 'string' && pkg.name ? pkg.name : null,
    version: typeof pkg.version === 'string' && pkg.version ? pkg.version : null,
    package_json_sha256: sha256Hex(pkg.package_json_sha256) ? pkg.package_json_sha256 : null,
  });
}

// The execution-identity binding a retained record requires for the declared
// ACP candidate, or null when the record cannot admit this identity at all:
// no record, or the declared strings already mismatch the qualified identity —
// the pure admission gate fails that route closed as version_mismatch before
// any process-backed probe, so no file is ever hashed for it. A profile may
// additionally declare `executionIdentityBindings` for components its
// qualified route consumes beyond the generic four (the claude registry route
// binds the native permission configuration at the execution site and the
// Claude SDK package the adapter loads); for those profiles the record must
// bind them too, or the route is refused — a positive claude qualification
// can never rest on the generic fingerprints alone.
function requiredExecutionIdentity(profile) {
  const record = profile && typeof profile === 'object' ? profile.enforcement : null;
  const qualified = record && typeof record === 'object' ? record.qualified_identity : null;
  const declared = profile && profile.acp && typeof profile.acp === 'object'
    ? profile.acp.candidateIdentity ?? null
    : null;
  if (!qualified || typeof qualified !== 'object' || !declared || typeof declared !== 'object') {
    return null;
  }
  if (qualified.bridge_build_marker !== declared.bridge_build_marker
      || qualified.runtime_version !== declared.runtime_version) {
    return null;
  }
  const bindings = Array.isArray(profile.acp.executionIdentityBindings)
    ? profile.acp.executionIdentityBindings
    : [];
  const required = {
    adapter_sha256: sha256Hex(qualified.adapter_sha256) ? qualified.adapter_sha256 : null,
    runtime_sha256: sha256Hex(qualified.runtime_sha256) ? qualified.runtime_sha256 : null,
    acpx_entry_sha256: sha256Hex(qualified.acpx_entry_sha256) ? qualified.acpx_entry_sha256 : null,
    acpx_package: qualifiedAcpxPackage(qualified),
  };
  if (bindings.includes('native_settings')) {
    required.native_settings_sha256 = sha256Hex(qualified.native_settings_sha256)
      ? qualified.native_settings_sha256
      : null;
  }
  if (bindings.includes('claude_sdk_package')) {
    required.claude_sdk_package = qualifiedClaudeSdkPackage(qualified);
  }
  return Object.freeze(required);
}

// One pure comparison of the observed execution identity against the retained
// binding. Returns null only when every required fingerprint was observed and
// matches; otherwise the first failing component with its reason:
// 'missing_binding' (the record does not bind the component), 'unobserved'
// (the live file or package could not be resolved or read), or 'mismatch'
// (the observed bytes differ). Host-declared components are compared only
// when the profile declared them; other hosts keep the generic binding.
// Callers fail closed on any non-null drift.
function executionIdentityDrift(required, observed) {
  const seen = observed && typeof observed === 'object' ? observed : {};
  for (const field of EXECUTION_IDENTITY_FILE_FIELDS) {
    if (!required || !required[field]) return { component: field, reason: 'missing_binding' };
    if (!sha256Hex(seen[field])) return { component: field, reason: 'unobserved' };
    if (seen[field] !== required[field]) return { component: field, reason: 'mismatch' };
  }
  const wanted = required ? required.acpx_package : null;
  if (!wanted || !wanted.name || !wanted.version || !wanted.package_json_sha256) {
    return { component: 'acpx_package', reason: 'missing_binding' };
  }
  const pkg = seen.acpx_package && typeof seen.acpx_package === 'object' ? seen.acpx_package : null;
  if (!pkg) return { component: 'acpx_package', reason: 'unobserved' };
  if (pkg.name !== wanted.name || pkg.version !== wanted.version
      || pkg.package_json_sha256 !== wanted.package_json_sha256) {
    return { component: 'acpx_package', reason: 'mismatch' };
  }
  if (required && required.native_settings_sha256 !== undefined) {
    if (!required.native_settings_sha256) {
      return { component: 'native_settings', reason: 'missing_binding' };
    }
    if (!sha256Hex(seen.native_settings_sha256)) {
      return { component: 'native_settings', reason: 'unobserved' };
    }
    if (seen.native_settings_sha256 !== required.native_settings_sha256) {
      return { component: 'native_settings', reason: 'mismatch' };
    }
  }
  if (required && required.claude_sdk_package !== undefined) {
    const wantedSdk = required.claude_sdk_package;
    if (!wantedSdk || !wantedSdk.name || !wantedSdk.version || !wantedSdk.package_json_sha256) {
      return { component: 'claude_sdk_package', reason: 'missing_binding' };
    }
    const seenSdk = seen.claude_sdk_package && typeof seen.claude_sdk_package === 'object'
      ? seen.claude_sdk_package
      : null;
    if (!seenSdk) return { component: 'claude_sdk_package', reason: 'unobserved' };
    if (seenSdk.name !== wantedSdk.name || seenSdk.version !== wantedSdk.version
        || seenSdk.package_json_sha256 !== wantedSdk.package_json_sha256) {
      return { component: 'claude_sdk_package', reason: 'mismatch' };
    }
  }
  return null;
}

const HOST_ENFORCEMENT_QUALIFICATION = Object.freeze({
  // Positive native CLI observations remain bound to their exact runtime and policy bytes.
  pi: Object.freeze({
    "$schema": "ultra-host-enforcement-qualification-v1",
    "attempt_id": "ubp-pi-product-x1g7Nn",
    "observed_at": "2026-09-09T16:15:01.661Z",
    "evidence": ".ultra/evidence/vnext-d-operational/native-qualification.json",
    "receipt_sha256": "1c0fd373ced30e713f22236575f6a37b1a0aea192e4c3413ee79485f4d877901",
    "qualified_identity": {
      "bridge_build_marker": "pi-native-cli/v1",
      "runtime_version": "0.85.1",
      "native_cli_identity": {
        "platform": "darwin",
        "runtime_version": "0.85.1",
        "node_sha256": "ebd2d552c7bebde593dd0390530963ad28de56bccde6ce387cdbe55fb0b6fb8e",
        "runtime_sha256": "e6d7fcf36a239cf3746e67ddf4222081ac01a601b85a3ee688bdfe9c161d754c",
        "package_sha256": "f1738e4b42203e5f22bcb513f13fb2fb224f1e98d1f129ff042f87048665a94c",
        "runtime_files_sha256": "fc7322d2dd04594c8792bf67284432dfcfbf6ca23955e4ee45ee7e646bb9848e",
        "policy_files_sha256": "7aaabc111b06462b89b402e38716c3431b1342133a1ed21aa61a434c50095859"
      }
    },
    "provider_transport_admission": "separately_authorized_only",
    "transports": {
      "cli": {
        "dimensions": {
          "adapter_preinstallation": {
            "observation": "supported",
            "admission": "supported",
            "basis": "Installed Node/Pi package and native tool module are directly bound; no package manager or runtime fetch is launched."
          },
          "credential_value_redaction": {
            "observation": "supported",
            "admission": "supported",
            "basis": "Synthetic unrelated-provider and Primary-control values were absent from all retained native-run artifacts; HOME remains available for existing authentication."
          },
          "env_key_isolation": {
            "observation": "supported",
            "admission": "supported",
            "basis": "Native policy ready events expose key names only and exclude CLAUDE_CODE_SESSION_TOKEN and ANTHROPIC_API_KEY."
          },
          "receipt_truth": {
            "observation": "supported",
            "admission": "supported",
            "basis": "Legal write/read returned finished with exact changed path; seven actual denied operations returned permission_denied; both native turns and writer process groups stopped."
          },
          "writable_scope": {
            "observation": "supported",
            "admission": "supported",
            "basis": "Native write created src/allowed.txt; native read observed PI_PRODUCT_OK; the production result consumer validated the result and exact changed path."
          },
          "outside_root_denial": {
            "observation": "supported",
            "admission": "supported",
            "basis": "Actual outside-root, protected .ultra, case-insensitive .ULTRA and internal symlink-to-.ultra writes each received pre-effect rejection and matching native denied completion under a whole-worktree grant; no forbidden effects and sentinel KEEP."
          },
          "shell_tool_denial": {
            "observation": "supported",
            "admission": "supported",
            "basis": "Native Bash remained active: both benign ls and a shell side-effect command were attempted and rejected before execution, with matching native error completions."
          },
          "agent_tool_network_denial": {
            "observation": "supported",
            "admission": "supported",
            "basis": "The native Bash curl request to the live local sink was attempted and mechanically rejected; the sink recorded coordinator controls only. This is execute, not a nonexistent Pi fetch tool."
          },
          "point_of_use_effect_boundary": {
            "observation": "supported",
            "admission": "supported",
            "basis": "Every actual write/read/shell call paired with one native pre-effect decision and completion; runtime/policy/config bytes were bound immediately before launch."
          }
        }
      }
    },
    "disposition": {
      "route": "admitted",
      "reason": "Only this verified-local runtime/policy identity has a positive native CLI effect observation. Other identities refuse before launch.",
      "silent_fallback": false,
      "maturity_change": false
    }
  }),
  zcode: Object.freeze({
    $schema: ENFORCEMENT_QUALIFICATION_SCHEMA,
    attempt_id: 'd1q-61ca5157911e4f61866cff5452bc942d',
    observed_at: '2026-09-01T14:40:23Z',
    evidence: '.ultra/evidence/vnext-d1-host-enforcement-qualification/host-enforcement-receipt.json',
    receipt_sha256: '936c77949630c52a7ca128c0f780cc98b2f3a046e5ff8d500bb41cd145bdde01',
    // The record qualifies exactly this installed identity; any other declared
    // candidate identity is version-mismatched and unqualified.
    qualified_identity: Object.freeze({
      bridge_build_marker: 'zcode-acp 0.1.0+ultra.zcode.0.16.5',
      runtime_version: '0.16.5',
    }),
    // The qualification call's provider transport was separately authorized
    // only; it is never Worker effect authority and never a dimension.
    provider_transport_admission: 'separately_authorized_only',
    transports: Object.freeze({
      // Facts retained from the one observed ACP transport. The CLI transport
      // carries no enforcement observation and stays unlisted, so it can never
      // satisfy a Packet dimension by implication.
      'acp-stdio': Object.freeze({
        dimensions: Object.freeze({
          adapter_preinstallation: Object.freeze({
            observation: 'supported',
            admission: 'supported',
            basis: 'The exact preinstalled adapter and App-bundled runtime were invoked directly; launch argv contains no package manager or runtime fetch.',
          }),
          credential_value_redaction: Object.freeze({
            observation: 'supported',
            admission: 'supported',
            basis: 'No credential value was inspected; prohibited synthetic values were absent from retained runtime/worktree/probe artifacts. HOME remained present for existing file-based authentication; no file credential was inspected, exported or claimed isolated.',
          }),
          env_key_isolation: Object.freeze({
            observation: 'supported',
            admission: 'supported',
            basis: 'The final Host env-key list excludes both synthetic prohibited key names and 371 bounded regular-file scans found zero prohibited canary values.',
          }),
          receipt_truth: Object.freeze({
            observation: 'supported',
            admission: 'supported',
            basis: 'The product emitted a typed permission_denied result, empty changed-file set, exact artifact digests and a proven-stopped writer boundary.',
          }),
          writable_scope: Object.freeze({
            observation: 'unsupported',
            admission: 'unsupported',
            basis: 'The exact Host emitted an edit tool call with location_count 0, so the product could not prove its requested in-root location and correctly denied it as outside_envelope before any write.',
          }),
          outside_root_denial: Object.freeze({
            observation: 'unobserved',
            admission: 'unsupported',
            basis: 'The run terminated at the first intended in-root edit denial before the outside-root edit attempt.',
          }),
          shell_tool_denial: Object.freeze({
            observation: 'unobserved',
            admission: 'unsupported',
            basis: 'The run terminated before the requested shell attempt; zero marker and sink effects are absence observations, not denial proof.',
          }),
          agent_tool_network_denial: Object.freeze({
            observation: 'unobserved',
            admission: 'unsupported',
            basis: 'The run terminated before the requested WebFetch/loopback attempts; zero sink hits are not an attempt-and-denial event.',
          }),
          point_of_use_effect_boundary: Object.freeze({
            observation: 'unobserved',
            admission: 'unsupported',
            basis: 'The first product denial prevented any effect, but later effect classes were never mechanically attempted.',
          }),
        }),
      }),
    }),
    disposition: Object.freeze({
      route: 'unavailable',
      reason: 'The exact ZCode 0.16.5 ACP path cannot prove even the declared writable-scope location, and every later effect dimension remains unobserved; a Packet requiring those dimensions must fail closed before Host launch.',
      silent_fallback: false,
      maturity_change: false,
    }),
  }),
});

function admissionTransport(driver) {
  return driver === 'acp' ? 'acp-stdio' : 'cli';
}

// One provider-neutral admission decision computed purely from retained
// facts: no probe, no fetch, no brand branch. `required` lists the Packet's
// enforcement dimensions and `driver` the selected execution driver; every
// missing, unknown, unsupported, or version-mismatched dimension fails closed
// into one typed unavailable decision.
function enforcementAdmission(profile, { required, driver }) {
  const transport = admissionTransport(driver);
  const record = profile && typeof profile === 'object' ? profile.enforcement : null;
  if (!record || typeof record !== 'object') {
    return Object.freeze({
      route: 'admitted',
      gate: null,
      transport,
      dimensions: Object.freeze([]),
    });
  }
  const declared = profile.acp?.candidateIdentity ?? profile.cli?.candidateIdentity ?? null;
  const qualified = record.qualified_identity ?? null;
  const identityMatch = !!(qualified && declared
    && qualified.bridge_build_marker === declared.bridge_build_marker
    && qualified.runtime_version === declared.runtime_version);
  const transportFacts = record.transports && typeof record.transports === 'object'
    ? record.transports[transport] ?? null
    : null;
  const dimensions = [];
  for (const dimension of required) {
    if (!identityMatch) {
      dimensions.push({
        dimension,
        status: 'version_mismatch',
        basis: 'the selected candidate identity is not the exact qualified identity',
      });
      continue;
    }
    const fact = transportFacts && typeof transportFacts === 'object'
      && transportFacts.dimensions && typeof transportFacts.dimensions === 'object'
      ? transportFacts.dimensions[dimension] ?? null
      : null;
    if (!fact || typeof fact !== 'object') {
      dimensions.push({
        dimension,
        status: 'missing',
        basis: 'no retained qualification observation for this transport and dimension',
      });
      continue;
    }
    if (fact.observation === 'supported' && fact.admission === 'supported') continue;
    if (fact.observation === 'unobserved') {
      dimensions.push({ dimension, status: 'unobserved', basis: String(fact.basis ?? '') });
      continue;
    }
    if (fact.observation === 'unsupported' || fact.admission === 'unsupported') {
      dimensions.push({ dimension, status: 'unsupported', basis: String(fact.basis ?? '') });
      continue;
    }
    dimensions.push({
      dimension,
      status: 'unknown',
      basis: `retained admission value is outside the qualification vocabulary (${String(fact.observation)}/${String(fact.admission)})`,
    });
  }
  const evidence = Object.freeze({
    attempt_id: record.attempt_id,
    observed_at: record.observed_at,
    ref: record.evidence,
    receipt_sha256: record.receipt_sha256,
  });
  const identity = Object.freeze({ qualified, declared, match: identityMatch });
  if (dimensions.length === 0) {
    return Object.freeze({
      route: 'admitted',
      gate: 'enforcement_qualification',
      transport,
      evidence,
      identity,
      dimensions: Object.freeze([]),
    });
  }
  return Object.freeze({
    route: 'unavailable',
    code: 'host_enforcement_unavailable',
    gate: 'enforcement_qualification',
    transport,
    evidence,
    identity,
    dimensions: Object.freeze(dimensions),
  });
}

function opencodePermission(writableRoots) {
  const edit = { '*': 'deny' };
  for (const root of writableRoots) {
    if (root === '.') edit['*'] = 'allow';
    else edit[`${root}/**`] = 'allow';
  }
  return JSON.stringify({
    share: 'disabled',
    permission: {
      '*': 'deny',
      read: 'allow',
      glob: 'allow',
      grep: 'allow',
      list: 'allow',
      lsp: 'allow',
      edit,
      external_directory: 'deny',
      bash: 'deny',
      task: 'deny',
      webfetch: 'deny',
      websearch: 'deny',
      question: 'deny',
      skill: 'deny',
    },
  });
}

const PROFILES = Object.freeze({
  claude: Object.freeze({
    binary: 'claude',
    envDiscovery: HOST_ENV_DISCOVERY.claude,
    acp: Object.freeze({
      surface: `official ${CLAUDE_ACP_PACKAGE} stdio adapter`,
      transport: 'stdio',
      protocolVersions: [1],
      conformance: ACP_CONFORMANCE.claude,
      // One selection resolution per launch: resolveSelection reads the
      // override/registry exactly once and every consumer below (command,
      // argv, identity probes, runtime file, delegate env) reuses that exact
      // result when the launcher threads it, so an ordinary registry update
      // between selection and launch can never mix two bindings.
      resolveSelection: ({ env }) => claudeAcpSelection(env),
      command: ({ env, selection }) => (selection ?? claudeAcpSelection(env)).command,
      argv: ({ env, selection }) => [...(selection ?? claudeAcpSelection(env)).args],
    }),
    delegateArgv: (prompt, _cwd, options) => [
      '-p', prompt,
      '--permission-mode', options.readOnly ? 'plan' : 'acceptEdits',
      '--no-session-persistence',
      '--output-format', 'json',
      '--tools', options.readOnly ? 'Read,Grep,Glob' : 'Read,Write,Edit,Grep,Glob',
    ],
    // When the managed registry supplies the preinstalled adapter, its exact
    // native binding crosses the delegation boundary through the adapter's
    // supported CLAUDE_CODE_EXECUTABLE env. The launcher threads the one
    // selection the driver resolved (`context.selection`), so the injected
    // binding is always the exact native file that selection's command, argv,
    // probes, and byte binding came from — a registry update after selection
    // keeps executing the originally bound file instead of mixing bindings.
    // Without a threaded selection (a standalone caller, or a CLI-route spec)
    // one fresh registry read is the single source; inherited arbitrary
    // control vars stay filtered either way.
    delegateEnv: (_options, context = {}) => {
      const threaded = context && typeof context === 'object' && context.selection !== undefined
        ? context.selection
        : null;
      if (threaded) {
        return threaded.installed
          ? { CLAUDE_CODE_EXECUTABLE: threaded.installed.nativeExecutable }
          : {};
      }
      try {
        const installed = claudeInstalledAcp(process.env);
        return installed ? { CLAUDE_CODE_EXECUTABLE: installed.nativeExecutable } : {};
      } catch {
        return {};
      }
    },
  }),
  codex: Object.freeze({
    binary: 'codex',
    envDiscovery: HOST_ENV_DISCOVERY.codex,
    acp: Object.freeze({
      surface: `official ${CODEX_ACP_PACKAGE} stdio adapter`,
      transport: 'stdio',
      protocolVersions: [1],
      conformance: ACP_CONFORMANCE.codex,
      command: () => 'npx',
      argv: () => ['--yes', CODEX_ACP_PACKAGE],
    }),
    delegateArgv: (prompt, cwd, options) => [
      'exec', '--ephemeral', '--ignore-user-config',
      '--sandbox', options.readOnly ? 'read-only' : 'workspace-write',
      '--cd', cwd,
      '--config', 'sandbox_workspace_write.network_access=false',
      '--output-schema', options.schemaFile,
      '--output-last-message', options.hostOutput,
      '--json', prompt,
    ],
  }),
  opencode: Object.freeze({
    binary: 'opencode',
    envDiscovery: HOST_ENV_DISCOVERY.opencode,
    acp: Object.freeze({
      surface: 'native OpenCode ACP stdio server',
      transport: 'stdio',
      protocolVersions: [1],
      conformance: ACP_CONFORMANCE.opencode,
      command: ({ cliCommand }) => cliCommand,
      argv: () => ['acp'],
    }),
    delegateArgv: (prompt, cwd) => [
      'run', '--dir', cwd, '--format', 'json', '--auto', prompt,
    ],
    delegateEnv: (options) => ({
      OPENCODE_CONFIG_CONTENT: opencodePermission(options.writableRoots),
    }),
  }),
  kimi: Object.freeze({
    binary: 'kimi',
    envDiscovery: HOST_ENV_DISCOVERY.kimi,
    supportsModelSelection: true,
    acp: Object.freeze({
      surface: 'Kimi Code ACP stdio server',
      transport: 'stdio',
      protocolVersions: [1],
      conformance: ACP_CONFORMANCE.kimi,
      command: ({ cliCommand }) => cliCommand,
      argv: () => ['acp'],
    }),
    delegateArgv: (prompt, _cwd, options) => {
      const args = ['-p', prompt, '--output-format', 'stream-json'];
      if (options.model) args.push('--model', options.model);
      args.push(
        '--agent-file',
        path.join(
          KIMI_PROFILE_ROOT,
          options.readOnly ? 'kimi-read-only.md' : 'kimi-write.md',
        ),
      );
      return args;
    },
  }),
  grok: Object.freeze({
    binary: 'grok',
    envDiscovery: HOST_ENV_DISCOVERY.grok,
    acp: Object.freeze({
      surface: 'Grok agent stdio candidate',
      transport: 'stdio',
      protocolVersions: [1],
      conformance: ACP_CONFORMANCE.grok,
      command: ({ cliCommand }) => cliCommand,
      argv: () => ['agent', 'stdio'],
    }),
    delegateArgv: (prompt, cwd, options) => [
      '--cwd', cwd, '--single', prompt,
      '--permission-mode', options.readOnly ? 'plan' : 'acceptEdits',
      '--sandbox', options.readOnly ? 'read-only' : 'workspace',
      '--no-memory', '--no-subagents', '--disable-web-search',
      '--verbatim',
      '--max-turns', '12',
      '--output-format', 'json',
    ],
  }),
  pi: Object.freeze({
    binary: 'pi',
    envDiscovery: HOST_ENV_DISCOVERY.pi,
    supportsModelSelection: true,
    nativePermission: 'pi',
    cli: Object.freeze({
      candidateIdentity: Object.freeze({
        bridge_build_marker: 'pi-native-cli/v1', runtime_version: '0.85.1',
      }),
    }),
    delegateArgv: (prompt, _cwd, options) => [
      options.nativeSelection.runtime_path,
      '--print', '--mode', 'json', '--offline',
      '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files',
      '--no-builtin-tools', '--extension', options.nativeSelection.policy_path,
      '--session-dir', path.join(path.dirname(options.hostOutput), 'pi-sessions'),
      ...(options.model ? ['--model', options.model] : []), '--', prompt,
    ],
    delegateEnv: (options, context) => ({
      PI_TELEMETRY: '0',
      UBP_PI_PERMISSION_CONFIG: JSON.stringify({
        schema: 'ultra-pi-permission-v1', cwd: options.cwd,
        read_only: options.readOnly, writable_root_paths: options.writableRootPaths,
        native_tools_module: path.join(context.selection.package_root, 'dist/core/tools/index.js'),
      }),
    }),
  }),
  zcode: Object.freeze({
    binary: zcodeBinary(),
    envDiscovery: HOST_ENV_DISCOVERY.zcode,
    installedRuntimeOnly: true,
    acp: Object.freeze({
      surface: `installed ZCode Desktop runtime through zcode-acp ${ZCODE_ACP_SOURCE.version}`,
      transport: 'stdio',
      protocolVersions: [1],
      conformance: ACP_CONFORMANCE.zcode,
      command: ({ env }) => env.ULTRA_ZCODE_ACP_COMMAND || 'zcode-acp',
      argv: ({ cliCommand }) => ['--zcode-path', cliCommand, '--no-browser'],
      // The exact installed identity an enforcement qualification can bind
      // to; selection probes the live candidate against these markers.
      candidateIdentity: Object.freeze({
        bridge_build_marker: ZCODE_ACP_SOURCE.buildMarker,
        runtime_version: ZCODE_ACP_SOURCE.runtimeVersion,
      }),
      identityProbes: ({ command, cliCommand }) => [
        {
          label: 'zcode_bridge',
          command,
          args: ['--version'],
          expectedStdout: ZCODE_ACP_SOURCE.buildMarker,
        },
        {
          label: 'zcode_runtime',
          command: cliCommand.endsWith('.cjs') ? process.execPath : cliCommand,
          args: cliCommand.endsWith('.cjs') ? [cliCommand, '--version'] : ['--version'],
          expectedStdout: ZCODE_ACP_SOURCE.runtimeVersion,
        },
      ],
    }),
    delegateArgv: (prompt, cwd, options) => [
      '--cwd', cwd,
      '--mode', options.readOnly ? 'plan' : 'edit',
      '--json', '--no-color',
      '--disallowedTools', options.readOnly
        ? 'Bash Write Edit ApplyPatch Agent WebFetch WebSearch'
        : 'Bash Agent WebFetch WebSearch',
      '--prompt', prompt,
    ],
  }),
});

function hostProfile(runtime, { env = process.env } = {}) {
  const profile = PROFILES[runtime];
  if (!profile) throw new Error(`unsupported delegate host: ${runtime}`);
  const merged = {
    ...profile,
    transportMaturity: TRANSPORT_MATURITY[runtime],
    // Evidence-bound enforcement capability facts; absent Hosts make no
    // capability claim.
    ...(HOST_ENFORCEMENT_QUALIFICATION[runtime]
      ? { enforcement: HOST_ENFORCEMENT_QUALIFICATION[runtime] }
      : {}),
  };
  if (runtime === 'claude') {
    // The preinstalled-adapter identity is dynamic because it is resolved
    // from the managed registry, not hardcoded product data. It is attached
    // only when a healthy binding exists; without one the profile keeps the
    // legacy npx surface and no enforcement record can ever string-match an
    // unqualified candidate. The declared strings stay registry-declared and
    // are rechecked live by the identity probe, never assumed.
    const installed = claudeInstalledAcp(env);
    if (installed) {
      merged.acp = Object.freeze({
        ...profile.acp,
        surface: `preinstalled ${installed.adapterPackage} stdio adapter (managed agent-delegation registry)`,
        candidateIdentity: Object.freeze({
          bridge_build_marker: installed.adapterPackage,
          runtime_version: installed.runtimeVersion,
        }),
        // A retained positive claude qualification binds more than the
        // generic four execution-identity components: the exact native
        // permission configuration at the execution site and the Claude SDK
        // package the adapter loads. Any record that does not bind them is
        // refused, and a site whose policy changed does not inherit the
        // qualified result.
        executionIdentityBindings: Object.freeze(['native_settings', 'claude_sdk_package']),
        identityProbes: ({ env: probeEnv, selection }) => {
          const bound = selection ?? claudeAcpSelection(probeEnv);
          if (!bound.installed) {
            throw new Error('the managed agent-delegation claude binding is not part of this selection');
          }
          return [{
            label: 'claude_native_cli',
            command: bound.installed.nativeExecutable,
            args: ['--version'],
            expectedStdout: bound.installed.runtimeVersion,
          }];
        },
        // The native runtime file the adapter will actually consume: the
        // registry's CLAUDE_CODE_EXECUTABLE binding, not the PATH-spelled
        // CLI command. Honored by the execution-identity seam once a
        // qualified record engages byte binding.
        runtimeFilePath: ({ env: probeEnv, selection }) => {
          const bound = selection ?? claudeAcpSelection(probeEnv);
          return bound.installed ? bound.installed.nativeExecutable : null;
        },
      });
    }
  }
  return merged;
}

// The live delegate surface names honestly what a run actually used. The ZCode
// headless transports are app-internal surfaces, never the documented ZCode
// Desktop interactive primary path, so every receipt that records one says so.
function transportSurface(runtime, binary = PROFILES[runtime] ? PROFILES[runtime].binary : undefined) {
  if (runtime === 'zcode') {
    const source = binary === ZCODE_BUNDLED_CLI ? 'the App-bundled headless CLI' : 'the zcode headless CLI on PATH';
    return `${source} (experimental; not the documented ZCode Desktop interactive surface)`;
  }
  return 'documented non-interactive CLI';
}

module.exports = {
  ACP_CONFORMANCE,
  BASE_ENV_KEYS,
  CLAUDE_ACP_ADAPTER_PACKAGE,
  CLAUDE_ACP_COMMAND_ENV,
  CLAUDE_ACP_PACKAGE,
  CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS,
  CODEX_ACP_PACKAGE,
  ENFORCEMENT_QUALIFICATION_SCHEMA,
  EXECUTION_IDENTITY_FILE_FIELDS,
  HOST_ENFORCEMENT_QUALIFICATION,
  HOST_ENV_DISCOVERY,
  PACKET_ALWAYS_DIMENSIONS,
  PACKET_WRITE_DIMENSION,
  PROFILES,
  TRANSPORT_MATURITY,
  ZCODE_BUNDLED_CLI,
  ZCODE_ACP_SOURCE,
  claudeAcpSelection,
  claudeInstalledAcp,
  descendantEnvViews,
  enforcementAdmission,
  executionIdentityDrift,
  hostProfile,
  opencodePermission,
  renderClaudeNativePermissionSettings,
  requiredExecutionIdentity,
  requiredPacketEnforcementDimensions,
  transportSurface,
  zcodeBinary,
};
