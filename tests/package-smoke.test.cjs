'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGE = require(path.join(REPO_ROOT, 'package.json'));
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

async function verifyMcp(launcher, projectDir) {
  fs.mkdirSync(projectDir, { recursive: true });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [launcher],
    cwd: projectDir,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'package-smoke', version: PACKAGE.version }, { capabilities: {} });
  await client.connect(transport);
  try {
    assert.equal(client.getServerVersion().version, PACKAGE.version);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 29);
    assert.equal(fs.existsSync(path.join(projectDir, '.ultra', 'state.db')), false);
    const listed = await client.callTool({ name: 'task.list', arguments: {} });
    assert.notEqual(listed.isError, true, listed.content?.[0]?.text || 'task.list failed');
    assert.ok(fs.existsSync(path.join(projectDir, '.ultra', 'state.db')));
  } finally {
    await client.close();
  }
}

test('npm tarball installs all CLIs and builds durable native host runtimes', { timeout: 120000 }, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-package-smoke-'));
  try {
    const packJson = JSON.parse(run(NPM, ['pack', '--json', '--pack-destination', tempRoot]));
    const tarball = path.join(tempRoot, packJson[0].filename);
    const consumer = path.join(tempRoot, 'consumer');
    fs.mkdirSync(consumer);
    run(NPM, ['init', '-y'], { cwd: consumer });
    run(NPM, ['install', '--no-audit', '--no-fund', tarball], { cwd: consumer });

    const packageRoot = path.join(consumer, 'node_modules', PACKAGE.name);
    const binRoot = path.join(consumer, 'node_modules', '.bin');
    const ubp = path.join(binRoot, process.platform === 'win32' ? 'ubp.cmd' : 'ubp');
    const ultraTools = path.join(binRoot, process.platform === 'win32' ? 'ultra-tools.cmd' : 'ultra-tools');
    assert.match(run(ubp, ['--version'], { cwd: consumer }), new RegExp(`v${PACKAGE.version}$`));
    assert.equal(run(ultraTools, ['--version'], { cwd: consumer }), PACKAGE.version);

    for (const doc of [
      'COMMIT-HASH-BACKFILL.md', 'PLAN.zh-CN.md', 'STATE-DB-ACCESS-POLICY.md',
    ]) {
      assert.ok(fs.existsSync(path.join(packageRoot, 'docs', doc)), `tarball missing docs/${doc}`);
    }
    assert.equal(
      fs.existsSync(path.join(packageRoot, 'docs', 'LEGACY-HERMES.md')),
      false,
      'retired Hermes documentation must not ship in the npm tarball',
    );

    const configRoot = path.join(tempRoot, 'hosts');
    for (const runtime of ['claude', 'opencode', 'codex', 'kimi']) {
      const hostRoot = path.join(configRoot, runtime);
      const env = runtime === 'codex' ? { HOME: hostRoot } : {};
      run(ubp, [`--${runtime}`, '--config-dir', hostRoot], {
        cwd: consumer,
        env,
      });
      const doctor = JSON.parse(run(
        ubp,
        [`--${runtime}`, '--config-dir', hostRoot, '--doctor', '--json'],
        { cwd: consumer, env },
      ));
      assert.equal(doctor.status, 'healthy', JSON.stringify(doctor, null, 2));
      assert.deepEqual(doctor.reports.map((report) => report.adapter), [runtime]);
    }
    const launchers = {
      claude: path.join(configRoot, 'claude', 'skills', 'ultra-builder-pro', 'runtime', 'launch.cjs'),
      opencode: path.join(configRoot, 'opencode', '.ultra-builder-pro', 'runtime', 'launch.cjs'),
      codex: path.join(configRoot, 'codex', 'plugins', 'ultra-builder-pro', 'runtime', 'launch.cjs'),
      kimi: path.join(configRoot, 'kimi', 'plugins', 'managed', 'ultra-builder-pro', 'runtime', 'launch.cjs'),
    };
    for (const [runtime, launcher] of Object.entries(launchers)) {
      assert.ok(fs.existsSync(launcher), `${runtime} launcher missing`);
      assert.ok(!launcher.startsWith(REPO_ROOT), `${runtime} launcher leaked source checkout`);
      await verifyMcp(launcher, path.join(tempRoot, 'projects', runtime));
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
