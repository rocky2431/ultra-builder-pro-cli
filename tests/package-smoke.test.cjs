'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGE = require(path.join(REPO_ROOT, 'package.json'));
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const RETIRED_DISTRIBUTION_REFERENCES = /\b(?:Gemini|RTK|graphify|Impeccable|Context7|GSD-2|GStack|OpenSpec|Spec Kit|Trellis|ECC)\b|Exa MCP|agent-browser|find-skills|\.ultra\/memory|memory\.(?:retain|recall|reflect)/iu;

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
    assert.equal(tools.tools.length, 51);
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
    const forbiddenPayload = packJson[0].files
      .map((entry) => entry.path)
      .filter((file) => /(?:^|\/)(?:tests?|test-support|__pycache__)(?:\/|$)|\.(?:test\.cjs|py[co])$/.test(file));
    assert.deepEqual(forbiddenPayload, [], 'tarball must not ship tests or generated cache files');
    const tarball = path.join(tempRoot, packJson[0].filename);
    const consumer = path.join(tempRoot, 'consumer');
    fs.mkdirSync(consumer);
    run(NPM, ['init', '-y'], { cwd: consumer });
    run(NPM, ['install', '--no-audit', '--no-fund', tarball], { cwd: consumer });
    const consumerAudit = JSON.parse(run(
      NPM, ['audit', '--omit=dev', '--audit-level=high', '--json'], { cwd: consumer },
    ));
    assert.equal(
      consumerAudit.metadata.vulnerabilities.total,
      0,
      JSON.stringify(consumerAudit.vulnerabilities, null, 2),
    );
    assert.equal(consumerAudit.metadata.vulnerabilities.moderate, 0);
    assert.equal(consumerAudit.metadata.vulnerabilities.high, 0);
    assert.equal(consumerAudit.metadata.vulnerabilities.critical, 0);

    const packageRoot = path.join(consumer, 'node_modules', PACKAGE.name);
    const binRoot = path.join(consumer, 'node_modules', '.bin');
    const ubp = path.join(binRoot, process.platform === 'win32' ? 'ubp.cmd' : 'ubp');
    const ultraTools = path.join(binRoot, process.platform === 'win32' ? 'ultra-tools.cmd' : 'ultra-tools');
    assert.match(run(ubp, ['--version'], { cwd: consumer }), new RegExp(`v${PACKAGE.version}$`));
    assert.equal(run(ultraTools, ['--version'], { cwd: consumer }), PACKAGE.version);

    const cliProject = path.join(tempRoot, 'direct-cli-project');
    fs.mkdirSync(cliProject);
    const initialized = JSON.parse(run(ultraTools, [
      'task', 'init-project', '--target-dir', cliProject, '--project-name', 'tarball-cli',
    ], { cwd: consumer }));
    assert.equal(initialized.ok, true);
    assert.equal(initialized.data.status, 'created');
    assert.ok(fs.existsSync(path.join(cliProject, '.ultra', 'specs', 'product.md')));
    assert.ok(fs.existsSync(path.join(cliProject, '.ultra', 'state.db')));

    for (const doc of [
      'COMMIT-HASH-BACKFILL.md', 'DECISIONS.md', 'STATE-DB-ACCESS-POLICY.md',
      'WORKFLOW-LIFECYCLE.md',
    ]) {
      assert.ok(fs.existsSync(path.join(packageRoot, 'docs', doc)), `tarball missing docs/${doc}`);
    }
    assert.equal(
      fs.existsSync(path.join(packageRoot, 'docs', 'PLAN.zh-CN.md')),
      false,
      'historical implementation plans must not ship in the npm tarball',
    );
    assert.equal(
      fs.existsSync(path.join(packageRoot, 'docs', 'LEGACY-HERMES.md')),
      false,
      'retired Hermes documentation must not ship in the npm tarball',
    );
    for (const entry of packJson[0].files) {
      if (!/\.(?:cjs|js|json|md|py|toml|ya?ml)$/.test(entry.path)) continue;
      const text = fs.readFileSync(path.join(packageRoot, entry.path), 'utf8');
      assert.doesNotMatch(
        text,
        RETIRED_DISTRIBUTION_REFERENCES,
        `tarball contains a retired distribution reference in ${entry.path}`,
      );
    }

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
      const bundledTools = path.join(path.dirname(launcher), 'ultra-tools.cjs');
      assert.equal(
        run(process.execPath, [bundledTools, '--version'], { cwd: consumer }),
        PACKAGE.version,
        `${runtime} bundled Ultra tools reported the wrong package version`,
      );
      await verifyMcp(launcher, path.join(tempRoot, 'projects', runtime));
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
