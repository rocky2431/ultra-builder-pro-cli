'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KIMI_PROFILE_ROOT = path.join(__dirname, 'delegate-profiles');
const ZCODE_BUNDLED_CLI = '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs';

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
  PROFILES,
  TRANSPORT_MATURITY,
  ZCODE_BUNDLED_CLI,
  hostProfile,
  opencodePermission,
  transportSurface,
  zcodeBinary,
};
