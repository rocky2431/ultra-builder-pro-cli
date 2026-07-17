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
const PACKAGE = require(path.join(REPO_ROOT, 'package.json'));
const ULTRA_TOOLS = require(path.join(REPO_ROOT, 'ultra-tools', 'cli.cjs'));

function runCli(args, { cwd, homeDir } = {}) {
  return spawnSync(process.execPath, [INSTALL_JS, ...args], {
    cwd: cwd || REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(homeDir ? { HOME: homeDir } : {}) },
  });
}

function mkTarget(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ubp-install-${prefix}-`));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

test('package exports every documented CLI entrypoint', () => {
  assert.equal(PACKAGE.bin['ultra-tools'], 'ultra-tools/cli.cjs');
  assert.deepEqual(Object.keys(ULTRA_TOOLS.SUBCOMMANDS).sort(), [
    'db', 'legacy-memory', 'migrate', 'session', 'status', 'system', 'task',
  ]);
});

const RUNTIMES = [
  {
    flag: '--claude',
    name: 'claude',
    expectRelPaths: [
      'skills/ultra-builder-pro/.claude-plugin/plugin.json',
      'skills/ultra-builder-pro/commands',
      'skills/ultra-builder-pro/hooks/hooks.json',
      'skills/ultra-builder-pro/.mcp.json',
      'skills/ultra-builder-pro/provenance.json',
    ],
  },
  { flag: '--opencode', name: 'opencode', expectRelPaths: ['commands', 'skills', 'plugins/ultra-builder-pro.js', 'opencode.json', '.ultra-builder-pro/provenance.json'] },
  {
    flag: '--codex',
    name: 'codex',
    expectRelPaths: [
      'plugins/ultra-builder-pro/.codex-plugin/plugin.json',
      'plugins/ultra-builder-pro/runtime/launch.cjs',
      'plugins/ultra-builder-pro/runtime/index.cjs',
      'agents/review-code.toml',
      '.agents/plugins/marketplace.json',
      'ultra-builder-pro/install-manifest.json',
      'ultra-builder-pro/provenance.json',
    ],
  },
];

for (const rt of RUNTIMES) {
  test(`install.js — ${rt.name} install + uninstall round-trip (--config-dir)`, () => {
    const target = mkTarget(rt.name);
    try {
      const installed = runCli([rt.flag, '--config-dir', target], { homeDir: target });
      assert.equal(installed.status, 0, `install stderr:\n${installed.stderr}`);
      for (const rel of rt.expectRelPaths) {
        assert.ok(fs.existsSync(path.join(target, rel)), `expected ${rel} after ${rt.name} install`);
      }

      const uninstalled = runCli([rt.flag, '--config-dir', target, '--uninstall'], { homeDir: target });
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

test('install.js — --all fans out to every supported runtime', () => {
  const target = mkTarget('all');
  const localRoots = { claude: '.claude', opencode: '.opencode', codex: '' };
  try {
    const installed = runCli(['--all', '--local'], { cwd: target, homeDir: target });
    assert.equal(installed.status, 0, `--all install stderr:\n${installed.stderr}`);
    for (const runtime of RUNTIMES) {
      assert.ok(
        fs.existsSync(path.join(target, localRoots[runtime.name], runtime.expectRelPaths[0])),
        runtime.name,
      );
    }
  } finally {
    cleanup(target);
  }
});

test('install.js — idempotent: two installs produce equal asset counts', () => {
  const target = mkTarget('idempotent');
  try {
    const first = runCli(['--claude', '--config-dir', target]);
    assert.equal(first.status, 0);
    const pluginRoot = path.join(target, 'skills', 'ultra-builder-pro');
    const countOne = fs.readdirSync(path.join(pluginRoot, 'commands')).length;
    const manifestOne = fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8');

    const second = runCli(['--claude', '--config-dir', target]);
    assert.equal(second.status, 0);
    const countTwo = fs.readdirSync(path.join(pluginRoot, 'commands')).length;
    const manifestTwo = fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8');

    assert.equal(countTwo, countOne, 'command count should not grow on re-install');
    assert.equal(manifestTwo, manifestOne);
  } finally {
    cleanup(target);
  }
});

test('install.js — doctor verifies all host provenance and reports managed-asset drift', () => {
  const target = mkTarget('doctor');
  try {
    const installed = runCli(['--all', '--local'], { cwd: target, homeDir: target });
    assert.equal(installed.status, 0, installed.stderr);

    const healthy = runCli(['--all', '--local', '--doctor', '--json'], {
      cwd: target, homeDir: target,
    });
    assert.equal(healthy.status, 0, healthy.stderr);
    const healthyReport = JSON.parse(healthy.stdout);
    assert.equal(healthyReport.status, 'healthy');
    assert.deepEqual(
      healthyReport.reports.map((report) => [report.adapter, report.status]),
      [['claude', 'healthy'], ['opencode', 'healthy'], ['codex', 'healthy']],
    );

    const managedHook = path.join(
      target, '.claude', 'skills', 'ultra-builder-pro', 'hooks', 'workflow_resume.py',
    );
    fs.appendFileSync(managedHook, '\n# drift\n');
    const degraded = runCli(['--all', '--local', '--doctor', '--json'], {
      cwd: target, homeDir: target,
    });
    assert.equal(degraded.status, 2, degraded.stderr);
    const degradedReport = JSON.parse(degraded.stdout);
    assert.equal(degradedReport.status, 'degraded');
    const claude = degradedReport.reports.find((report) => report.adapter === 'claude');
    assert.equal(claude.status, 'degraded');
    assert.ok(claude.issues.some((issue) => issue.code === 'ASSET_HASH_MISMATCH'));

    const openCodeConfigFile = path.join(target, '.opencode', 'opencode.json');
    const openCodeConfig = JSON.parse(fs.readFileSync(openCodeConfigFile, 'utf8'));
    delete openCodeConfig.mcp['ultra-builder-pro'];
    fs.writeFileSync(openCodeConfigFile, `${JSON.stringify(openCodeConfig, null, 2)}\n`);
    const codexManifestFile = path.join(
      target, '.codex', 'ultra-builder-pro', 'install-manifest.json',
    );
    const codexManifest = JSON.parse(fs.readFileSync(codexManifestFile, 'utf8'));
    codexManifest.hook_cache_versions.push('0.1.0+codex.missing-hook');
    fs.writeFileSync(codexManifestFile, `${JSON.stringify(codexManifest, null, 2)}\n`);

    const boundaryDrift = runCli(['--all', '--local', '--doctor', '--json'], {
      cwd: target, homeDir: target,
    });
    assert.equal(boundaryDrift.status, 2, boundaryDrift.stderr);
    const boundaryReport = JSON.parse(boundaryDrift.stdout);
    const opencode = boundaryReport.reports.find((report) => report.adapter === 'opencode');
    assert.ok(opencode.issues.some((issue) => issue.code === 'MCP_REGISTRATION_INVALID'));
    const codex = boundaryReport.reports.find((report) => report.adapter === 'codex');
    assert.ok(codex.issues.some((issue) => issue.code === 'HOOK_TARGET_MISSING'));
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

  const retiredFlag = `--${['gem', 'ini'].join('')}`;
  const retiredRuntime = runCli([retiredFlag, '--local']);
  assert.equal(retiredRuntime.status, 1);
  assert.match(retiredRuntime.stderr, /unknown flag/);

  const conflictingModes = runCli(['--claude', '--doctor', '--uninstall']);
  assert.equal(conflictingModes.status, 1);
  assert.match(conflictingModes.stderr, /cannot combine --doctor and --uninstall/);
});

// P3 #13 / D45: --config-dir NUL-byte rejection — unit-tested via
// `adapters/_shared/tests/validate.test.cjs`. Can't integration-test from
// here because Node child_process.spawnSync refuses NUL bytes in argv
// before our code sees them.
