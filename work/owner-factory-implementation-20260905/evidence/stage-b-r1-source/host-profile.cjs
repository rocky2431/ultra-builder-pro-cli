'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KIMI_PROFILE_ROOT = path.join(__dirname, 'delegate-profiles');
const ZCODE_BUNDLED_CLI = '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs';
const CLAUDE_ACP_PACKAGE = '@agentclientprotocol/claude-agent-acp@0.70.0';
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
  claude: Object.freeze({ exact: Object.freeze(['CLAUDE_CONFIG_DIR']) }),
  codex: Object.freeze({ exact: Object.freeze(['OPENAI_API_KEY', 'CODEX_HOME']) }),
  opencode: Object.freeze({ exact: Object.freeze(['OPENCODE_CONFIG_DIR', 'OPENCODE_CONFIG']) }),
  kimi: Object.freeze({ exact: Object.freeze(['KIMI_CODE_HOME']) }),
  grok: Object.freeze({ exact: Object.freeze(['GROK_HOME']) }),
  zcode: Object.freeze({ exact: Object.freeze(['ZCODE_HOME', 'ULTRA_ZCODE_ACP_COMMAND']) }),
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

const HOST_ENFORCEMENT_QUALIFICATION = Object.freeze({
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
  const declared = profile.acp && typeof profile.acp === 'object'
    ? profile.acp.candidateIdentity ?? null
    : null;
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
      command: () => 'npx',
      argv: () => ['--yes', CLAUDE_ACP_PACKAGE],
    }),
    delegateArgv: (prompt, _cwd, options) => [
      '-p', prompt,
      '--permission-mode', options.readOnly ? 'plan' : 'acceptEdits',
      '--no-session-persistence',
      '--output-format', 'json',
      '--tools', options.readOnly ? 'Read,Grep,Glob' : 'Read,Write,Edit,Grep,Glob',
    ],
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

function hostProfile(runtime) {
  const profile = PROFILES[runtime];
  if (!profile) throw new Error(`unsupported delegate host: ${runtime}`);
  return {
    ...profile,
    transportMaturity: TRANSPORT_MATURITY[runtime],
    // Evidence-bound enforcement capability facts; absent Hosts make no
    // capability claim.
    ...(HOST_ENFORCEMENT_QUALIFICATION[runtime]
      ? { enforcement: HOST_ENFORCEMENT_QUALIFICATION[runtime] }
      : {}),
  };
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
  CLAUDE_ACP_PACKAGE,
  CODEX_ACP_PACKAGE,
  ENFORCEMENT_QUALIFICATION_SCHEMA,
  HOST_ENFORCEMENT_QUALIFICATION,
  HOST_ENV_DISCOVERY,
  PACKET_ALWAYS_DIMENSIONS,
  PACKET_WRITE_DIMENSION,
  PROFILES,
  TRANSPORT_MATURITY,
  ZCODE_BUNDLED_CLI,
  ZCODE_ACP_SOURCE,
  descendantEnvViews,
  enforcementAdmission,
  hostProfile,
  opencodePermission,
  requiredPacketEnforcementDimensions,
  transportSurface,
  zcodeBinary,
};
