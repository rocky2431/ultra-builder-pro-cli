'use strict';

// Phase 4.6b reviewer suggestion — scope-precedence contract across all
// four adapter.resolveTarget implementations.
//
// Each adapter honors the same ordering:
//   ctx.configDir  >  ctx.scope='global' → env var or homeDir/.<runtime>
//                  >  ctx.scope='local'  → cwd/.<runtime>
//
// Gemini also exposes resolveExtensionRoot that appends extensions/<NAME>.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const claude = require('../../../adapters/claude.js');
const opencode = require('../../../adapters/opencode.js');
const codex = require('../../../adapters/codex.js');
const gemini = require('../../../adapters/gemini.js');

// Stable fake values so assertions don't depend on real $HOME / $CWD.
const FAKE_HOME = '/fake-home';
const FAKE_CWD = '/fake-cwd';

function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
  const backup = {};
  for (const k of keys) { backup[k] = process.env[k]; }
  for (const k of keys) {
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  try { return fn(); }
  finally {
    for (const k of keys) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  }
}

const CASES = [
  { name: 'claude',   resolve: claude.resolveTarget,   localLeaf: '.claude',   globalHome: '.claude',   envKey: 'CLAUDE_CONFIG_DIR' },
  { name: 'opencode', resolve: opencode.resolveTarget, localLeaf: '.opencode', globalHome: path.join('.config', 'opencode'), envKey: 'OPENCODE_CONFIG_DIR' },
  { name: 'codex',    resolve: codex.resolveTarget,    localLeaf: '.codex',    globalHome: '.codex',    envKey: 'CODEX_HOME' },
  { name: 'gemini',   resolve: gemini.resolveTarget,   localLeaf: '.gemini',   globalHome: '.gemini',   envKey: 'GEMINI_CONFIG_DIR' },
];

for (const tc of CASES) {
  test(`${tc.name}.resolveTarget — configDir wins over scope/env/home`, () => {
    withEnv({ [tc.envKey]: '/env-path', XDG_CONFIG_HOME: undefined, OPENCODE_CONFIG: undefined }, () => {
      const out = tc.resolve({ configDir: '/explicit/path', scope: 'global', homeDir: FAKE_HOME, cwd: FAKE_CWD });
      assert.equal(out, '/explicit/path');
    });
  });

  test(`${tc.name}.resolveTarget — global scope picks env var`, () => {
    withEnv({ [tc.envKey]: '/env-global', XDG_CONFIG_HOME: undefined, OPENCODE_CONFIG: undefined }, () => {
      const out = tc.resolve({ scope: 'global', homeDir: FAKE_HOME, cwd: FAKE_CWD });
      assert.equal(out, '/env-global');
    });
  });

  test(`${tc.name}.resolveTarget — global scope falls back to home dir when env absent`, () => {
    withEnv({ [tc.envKey]: undefined, XDG_CONFIG_HOME: undefined, OPENCODE_CONFIG: undefined }, () => {
      const out = tc.resolve({ scope: 'global', homeDir: FAKE_HOME, cwd: FAKE_CWD });
      assert.equal(out, path.join(FAKE_HOME, tc.globalHome));
    });
  });

  test(`${tc.name}.resolveTarget — local scope uses cwd/<leaf>`, () => {
    const out = tc.resolve({ scope: 'local', homeDir: FAKE_HOME, cwd: FAKE_CWD });
    assert.equal(out, path.join(FAKE_CWD, tc.localLeaf));
  });

  test(`${tc.name}.resolveTarget — missing scope defaults to local (cwd)`, () => {
    const out = tc.resolve({ homeDir: FAKE_HOME, cwd: FAKE_CWD });
    assert.equal(out, path.join(FAKE_CWD, tc.localLeaf));
  });
}

test('gemini.resolveExtensionRoot layers extensions/<NAME> on top of resolveTarget', () => {
  const out = gemini.resolveExtensionRoot({ configDir: '/explicit' });
  assert.equal(out, path.join('/explicit', 'extensions', 'ultra-builder-pro'));
});
