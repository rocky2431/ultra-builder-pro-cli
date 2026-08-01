'use strict';

const path = require('node:path');

const KIMI_PROFILE_ROOT = path.join(__dirname, 'delegate-profiles');

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
      '--json-schema', options.schemaJson,
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
    delegateArgv: (prompt, _cwd, options) => [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--agent-file', path.join(
        KIMI_PROFILE_ROOT,
        options.readOnly ? 'kimi-read-only.md' : 'kimi-write.md',
      ),
    ],
  }),
  grok: Object.freeze({
    binary: 'grok',
    delegateArgv: (prompt, cwd, options) => [
      '--cwd', cwd, '--single', prompt,
      '--permission-mode', options.readOnly ? 'plan' : 'acceptEdits',
      '--sandbox', options.readOnly ? 'read-only' : 'workspace',
      '--no-memory', '--no-subagents', '--disable-web-search',
      '--json-schema', options.schemaJson,
      '--output-format', 'json',
    ],
  }),
});

function hostProfile(runtime) {
  const profile = PROFILES[runtime];
  if (!profile) throw new Error(`unsupported delegate host: ${runtime}`);
  return profile;
}

module.exports = { PROFILES, hostProfile, opencodePermission };
