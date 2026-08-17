'use strict';

const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'install.js');
const PACKAGE = require('../package.json');

function temporary(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const HOST_BIN_ROOT = temporary('ubp-cli-host-bin-');
const FAKE_CODEX = path.join(HOST_BIN_ROOT, 'codex');
fs.writeFileSync(FAKE_CODEX, `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.CODEX_HOME || process.env.HOME;
const state = path.join(root, '.ubp-test-codex-plugin.json');
const args = process.argv.slice(2);
if (args.join(' ') === 'plugin list --json') {
  const installed = fs.existsSync(state)
    ? [{ name: 'ultra-builder-pro', installed: true, enabled: true }]
    : [];
  process.stdout.write(JSON.stringify({ installed, available: [] }) + '\\n');
  process.exit(0);
}
if (args[0] === 'plugin' && args[1] === 'add') {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(state, '{}\\n');
  process.stdout.write('{}\\n');
  process.exit(0);
}
if (args[0] === 'plugin' && args[1] === 'remove') {
  fs.rmSync(state, { force: true });
  process.stdout.write('{}\\n');
  process.exit(0);
}
process.stderr.write('unsupported synthetic Codex command: ' + args.join(' ') + '\\n');
process.exit(2);
`);
fs.chmodSync(FAKE_CODEX, 0o755);
after(() => fs.rmSync(HOST_BIN_ROOT, { recursive: true, force: true }));

function hostTestEnv(extra = {}) {
  return {
    ...process.env,
    PATH: [HOST_BIN_ROOT, path.dirname(process.execPath), process.env.PATH || '']
      .filter(Boolean)
      .join(path.delimiter),
    ...extra,
  };
}

function run(args, options = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: hostTestEnv(options.env),
  });
}

test('package exposes only the installer and delegate entrypoint', () => {
  assert.deepEqual(PACKAGE.bin, {
    'ultra-builder-pro-cli': 'bin/install.js',
    ubp: 'bin/install.js',
  });
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Claude Code/);
  assert.match(help.stdout, /OpenCode/);
  assert.match(help.stdout, /Codex CLI/);
  assert.match(help.stdout, /Kimi Code/);
  assert.match(help.stdout, /Grok Build/);
  assert.match(help.stdout, /ZCode/);
});

for (const runtime of ['claude', 'opencode', 'codex', 'kimi', 'grok', 'zcode']) {
  test(`${runtime} CLI install, doctor, reinstall and uninstall stay inside config-dir`, () => {
    const config = temporary(`ubp-cli-${runtime}-`);
    const fakeHome = temporary(`ubp-cli-home-${runtime}-`);
    const args = [`--${runtime}`, '--global', '--config-dir', config];
    try {
      const first = run(args, { env: { HOME: fakeHome } });
      assert.equal(first.status, 0, first.stderr || first.stdout);

      const doctor = run([...args, '--doctor', '--json'], { env: { HOME: fakeHome } });
      assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
      const report = JSON.parse(doctor.stdout);
      assert.equal(report.status, 'healthy', JSON.stringify(report.reports));

      const second = run(args, { env: { HOME: fakeHome } });
      assert.equal(second.status, 0, second.stderr || second.stdout);

      const uninstall = run([...args, '--uninstall'], { env: { HOME: fakeHome } });
      assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
      assert.deepEqual(fs.readdirSync(config), [], `${runtime} left config-dir residue`);
      assert.deepEqual(fs.readdirSync(fakeHome), [], `${runtime} escaped config-dir`);
    } finally {
      fs.rmSync(config, { recursive: true, force: true });
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
}

test('--all gives each host its own config-dir namespace', () => {
  const config = temporary('ubp-cli-all-');
  const fakeHome = temporary('ubp-cli-all-home-');
  const args = ['--all', '--global', '--config-dir', config];
  const pluginRoots = [
    path.join(config, 'claude', 'skills', 'ultra-builder-pro'),
    path.join(config, 'opencode', '.ultra-builder-pro'),
    path.join(config, 'codex', 'plugins', 'ultra-builder-pro'),
    path.join(config, 'kimi', 'plugins', 'managed', 'ultra-builder-pro'),
    path.join(config, 'grok', '.ubp', 'plugin-sources', 'ultra-builder-pro'),
    path.join(config, 'zcode', 'cli', 'plugins', 'marketplaces', 'ultra-builder-pro', 'plugin'),
  ];
  try {
    const installed = run(args, { env: { HOME: fakeHome } });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    for (const root of pluginRoots) assert.ok(fs.existsSync(root), root);

    const doctor = run([...args, '--doctor', '--json'], { env: { HOME: fakeHome } });
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
    assert.equal(JSON.parse(doctor.stdout).status, 'healthy', doctor.stdout);

    const uninstalled = run([...args, '--uninstall'], { env: { HOME: fakeHome } });
    assert.equal(uninstalled.status, 0, uninstalled.stderr || uninstalled.stdout);
    for (const root of pluginRoots) assert.equal(fs.existsSync(root), false, root);
    assert.deepEqual(fs.readdirSync(config), [], 'all-host uninstall left config-dir residue');
    assert.deepEqual(fs.readdirSync(fakeHome), []);
  } finally {
    fs.rmSync(config, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

test('Codex config-dir owns both plugin root and marketplace sidecar', () => {
  const config = temporary('ubp-codex-config-');
  const realHomeSentinel = temporary('ubp-codex-real-home-');
  try {
    const installed = run(['--codex', '--global', '--config-dir', config], {
      env: { HOME: realHomeSentinel },
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    assert.ok(fs.existsSync(path.join(config, 'plugins', 'ultra-builder-pro')));
    assert.ok(fs.existsSync(path.join(config, '.agents', 'plugins', 'marketplace.json')));
    const listed = spawnSync('codex', ['plugin', 'list', '--json'], {
      encoding: 'utf8',
      env: hostTestEnv({ HOME: config, CODEX_HOME: config }),
    });
    assert.equal(listed.status, 0, listed.stderr || listed.stdout);
    const plugin = JSON.parse(listed.stdout).installed.find((entry) => (
      entry.name === 'ultra-builder-pro'
    ));
    assert.equal(plugin?.enabled, true, listed.stdout);
    assert.deepEqual(fs.readdirSync(realHomeSentinel), []);
  } finally {
    run(['--codex', '--global', '--config-dir', config, '--uninstall'], {
      env: { HOME: realHomeSentinel },
    });
    fs.rmSync(config, { recursive: true, force: true });
    fs.rmSync(realHomeSentinel, { recursive: true, force: true });
  }
});

test('Codex install rolls back managed files when native registration fails', () => {
  const config = temporary('ubp-codex-rollback-');
  const fakeBinRoot = temporary('ubp-codex-fake-bin-');
  const fakeCodex = path.join(fakeBinRoot, 'codex');
  fs.writeFileSync(fakeCodex, `#!/usr/bin/env node
const command = process.argv.slice(2).join(' ');
if (command === 'plugin list --json') {
  process.stdout.write('{"installed":[],"available":[]}\\n');
  process.exit(0);
}
if (command.startsWith('plugin add ')) {
  process.stderr.write('synthetic add failure\\n');
  process.exit(9);
}
if (command.startsWith('plugin remove ')) {
  process.stdout.write('{}\\n');
  process.exit(0);
}
process.exit(2);
`);
  fs.chmodSync(fakeCodex, 0o755);
  const codex = require('../adapters/codex.js');
  const ctx = {
    repoRoot: ROOT,
    scope: 'global',
    configDir: config,
    homeDir: config,
    codexBin: fakeCodex,
    runPluginCli: true,
  };
  try {
    assert.throws(() => codex.install(ctx), /synthetic add failure/);
    assert.equal(fs.existsSync(codex.resolvePluginRoot(ctx)), false);
    assert.equal(fs.existsSync(codex.resolveMarketplaceFile(ctx)), false);
    assert.deepEqual(fs.readdirSync(config), []);
  } finally {
    fs.rmSync(config, { recursive: true, force: true });
    fs.rmSync(fakeBinRoot, { recursive: true, force: true });
  }
});

test('Codex and Kimi preserve pre-existing empty registries on uninstall', () => {
  const codexRoot = temporary('ubp-codex-existing-registry-');
  const kimiRoot = temporary('ubp-kimi-existing-registry-');
  const codex = require('../adapters/codex.js');
  const kimi = require('../adapters/kimi.js');
  const codexMarketplace = path.join(codexRoot, '.agents', 'plugins', 'marketplace.json');
  const kimiRegistry = path.join(kimiRoot, 'plugins', 'installed.json');
  try {
    fs.mkdirSync(path.dirname(codexMarketplace), { recursive: true });
    fs.writeFileSync(codexMarketplace, '{"name":"personal","plugins":[]}\n');
    fs.mkdirSync(path.dirname(kimiRegistry), { recursive: true });
    fs.writeFileSync(kimiRegistry, '{"version":1,"plugins":[]}\n');

    const codexCtx = {
      repoRoot: ROOT,
      scope: 'global',
      configDir: codexRoot,
      homeDir: codexRoot,
      runPluginCli: false,
    };
    const kimiCtx = {
      repoRoot: ROOT,
      scope: 'global',
      configDir: kimiRoot,
    };
    codex.install(codexCtx);
    kimi.install(kimiCtx);
    codex.uninstall(codexCtx);
    kimi.uninstall(kimiCtx);

    assert.deepEqual(JSON.parse(fs.readFileSync(codexMarketplace, 'utf8')).plugins, []);
    assert.deepEqual(JSON.parse(fs.readFileSync(kimiRegistry, 'utf8')).plugins, []);
  } finally {
    fs.rmSync(codexRoot, { recursive: true, force: true });
    fs.rmSync(kimiRoot, { recursive: true, force: true });
  }
});

test('Codex failed reinstall restores the previous managed plugin and marketplace', () => {
  const config = temporary('ubp-codex-reinstall-rollback-');
  const fakeBinRoot = temporary('ubp-codex-reinstall-bin-');
  const fakeCodex = path.join(fakeBinRoot, 'codex');
  fs.writeFileSync(fakeCodex, `#!/usr/bin/env node
const command = process.argv.slice(2).join(' ');
if (command === 'plugin list --json') {
  process.stdout.write('{"installed":[{"name":"ultra-builder-pro","enabled":true}],"available":[]}\\n');
  process.exit(0);
}
if (command.startsWith('plugin add ')) {
  process.stderr.write('synthetic update failure\\n');
  process.exit(9);
}
process.exit(2);
`);
  fs.chmodSync(fakeCodex, 0o755);
  const codex = require('../adapters/codex.js');
  const ctx = {
    repoRoot: ROOT,
    scope: 'global',
    configDir: config,
    homeDir: config,
    runPluginCli: false,
  };
  try {
    codex.install(ctx);
    const marker = path.join(codex.resolvePluginRoot(ctx), 'previous-install.txt');
    fs.writeFileSync(marker, 'preserve me\n');
    const previousMarketplace = fs.readFileSync(codex.resolveMarketplaceFile(ctx), 'utf8');
    assert.throws(() => codex.install({
      ...ctx,
      codexBin: fakeCodex,
      runPluginCli: true,
    }), /synthetic update failure/);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'preserve me\n');
    assert.equal(
      fs.readFileSync(codex.resolveMarketplaceFile(ctx), 'utf8'),
      previousMarketplace,
    );
  } finally {
    fs.rmSync(config, { recursive: true, force: true });
    fs.rmSync(fakeBinRoot, { recursive: true, force: true });
  }
});

test('invalid CLI combinations fail without mutating a config directory', () => {
  const config = temporary('ubp-invalid-');
  try {
    const result = run(['--claude', '--global', '--local', '--config-dir', config]);
    assert.notEqual(result.status, 0);
    assert.deepEqual(fs.readdirSync(config), []);
  } finally {
    fs.rmSync(config, { recursive: true, force: true });
  }
});
