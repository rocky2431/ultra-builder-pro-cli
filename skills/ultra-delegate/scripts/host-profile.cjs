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
  buildMarker: 'zcode-acp 0.1.0+ultra.zcode.0.16.5',
  runtimeVersion: '0.16.5',
  patch: Object.freeze({
    path: 'skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch',
    sha256: '174dfd0feafe84320556a84b5ae08b10e44c5515fea4992fd1d58af54cee4e3d',
    compatibility: 'ZCode CLI 0.16.5 runtime-preferences handshake',
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
    installedRuntimeOnly: true,
    acp: Object.freeze({
      surface: `installed ZCode Desktop runtime through zcode-acp ${ZCODE_ACP_SOURCE.version}`,
      transport: 'stdio',
      protocolVersions: [1],
      conformance: ACP_CONFORMANCE.zcode,
      command: ({ env }) => env.ULTRA_ZCODE_ACP_COMMAND || 'zcode-acp',
      argv: ({ cliCommand }) => ['--zcode-path', cliCommand, '--no-browser'],
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
  return { ...profile, transportMaturity: TRANSPORT_MATURITY[runtime] };
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
  CLAUDE_ACP_PACKAGE,
  CODEX_ACP_PACKAGE,
  PROFILES,
  TRANSPORT_MATURITY,
  ZCODE_BUNDLED_CLI,
  ZCODE_ACP_SOURCE,
  hostProfile,
  opencodePermission,
  transportSurface,
  zcodeBinary,
};
