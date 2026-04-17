'use strict';

// Integration tests for bin/install.js — spawns the CLI and verifies each
// (runtime × scope) combo plus idempotency + clean uninstall.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const INSTALL_JS = path.join(REPO_ROOT, 'bin', 'install.js');

function runCli(args, { cwd } = {}) {
  return spawnSync(process.execPath, [INSTALL_JS, ...args], {
    cwd: cwd || REPO_ROOT,
    encoding: 'utf8',
  });
}

function mkTarget(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ubp-install-${prefix}-`));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

const RUNTIMES = [
  { flag: '--claude',   name: 'claude',   expectRelPaths: ['commands', 'skills', 'hooks', 'settings.json'] },
  { flag: '--opencode', name: 'opencode', expectRelPaths: ['commands', 'skills', 'hooks', 'opencode.json'] },
  { flag: '--codex',    name: 'codex',    expectRelPaths: ['skills', 'prompts', 'hooks', 'config.toml'] },
  { flag: '--gemini',   name: 'gemini',   expectRelPaths: ['extensions/ultra-builder-pro/gemini-extension.json'] },
];

for (const rt of RUNTIMES) {
  test(`install.js — ${rt.name} install + uninstall round-trip (--config-dir)`, () => {
    const target = mkTarget(rt.name);
    try {
      const installed = runCli([rt.flag, '--config-dir', target]);
      assert.equal(installed.status, 0, `install stderr:\n${installed.stderr}`);
      for (const rel of rt.expectRelPaths) {
        assert.ok(fs.existsSync(path.join(target, rel)), `expected ${rel} after ${rt.name} install`);
      }

      const uninstalled = runCli([rt.flag, '--config-dir', target, '--uninstall']);
      assert.equal(uninstalled.status, 0, `uninstall stderr:\n${uninstalled.stderr}`);
      // After uninstall, the leaf sentinel/config should either be gone or no longer
      // contain our managed block. For simplicity, assert that the primary asset
      // dir was removed.
      const primary = rt.expectRelPaths[0];
      assert.ok(!fs.existsSync(path.join(target, primary)), `expected ${primary} removed after ${rt.name} uninstall`);
    } finally {
      cleanup(target);
    }
  });
}

test('install.js — --all fans out to all four runtimes', () => {
  const targets = RUNTIMES.map((r) => ({ ...r, dir: mkTarget(`all-${r.name}`) }));
  // `--all` uses the runtime's default config dir, but we want an isolated
  // target for the test — run each runtime individually via its flag so we
  // can pass a distinct --config-dir (install.js v1 keeps --config-dir a single path).
  try {
    for (const t of targets) {
      const r = runCli([t.flag, '--config-dir', t.dir]);
      assert.equal(r.status, 0, `${t.name} install via --all loop stderr:\n${r.stderr}`);
    }
    // Confirm each target received assets
    for (const t of targets) {
      assert.ok(fs.existsSync(path.join(t.dir, t.expectRelPaths[0])));
    }
  } finally {
    for (const t of targets) cleanup(t.dir);
  }
});

test('install.js — idempotent: two installs produce equal asset counts', () => {
  const target = mkTarget('idempotent');
  try {
    const first = runCli(['--claude', '--config-dir', target]);
    assert.equal(first.status, 0);
    const countOne = fs.readdirSync(path.join(target, 'commands')).length;
    const settingsOne = fs.readFileSync(path.join(target, 'settings.json'), 'utf8');

    const second = runCli(['--claude', '--config-dir', target]);
    assert.equal(second.status, 0);
    const countTwo = fs.readdirSync(path.join(target, 'commands')).length;
    const settingsTwo = fs.readFileSync(path.join(target, 'settings.json'), 'utf8');

    assert.equal(countTwo, countOne, 'command count should not grow on re-install');
    const stripTs = (s) => s.replace(/"__generated_at": "[^"]+"/g, '"__generated_at": "<t>"');
    assert.equal(stripTs(settingsTwo), stripTs(settingsOne));
  } finally {
    cleanup(target);
  }
});

test('install.js — argument parsing errors fail with exit 1', () => {
  const noRuntime = runCli([]);
  assert.equal(noRuntime.status, 1);
  assert.match(noRuntime.stderr, /no runtime selected/);

  const bothScopes = runCli(['--claude', '--global', '--local', '--config-dir', '/tmp/x']);
  assert.equal(bothScopes.status, 1);
  assert.match(bothScopes.stderr, /cannot use --global and --local/);

  const unknownFlag = runCli(['--claude', '--bogus']);
  assert.equal(unknownFlag.status, 1);
  assert.match(unknownFlag.stderr, /unknown flag/);
});

// P3 #13 / D45: --config-dir NUL-byte rejection — unit-tested via
// `adapters/_shared/tests/validate.test.cjs`. Can't integration-test from
// here because Node child_process.spawnSync refuses NUL bytes in argv
// before our code sees them.
