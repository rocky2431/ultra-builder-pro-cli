'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const { version: PACKAGE_VERSION } = require('../package.json');
const { skillsForRuntime, WORKFLOW_HOOK_FILES } = require('../adapters/_shared/runtime-assets.cjs');

function command(program, args, options = {}) {
  return spawnSync(program, args, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
}

test('npm tarball contains and runs only the file-first product surface', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-pack-'));
  try {
    const env = { npm_config_cache: path.join(sandbox, 'npm-cache') };
    const packed = command('npm', ['pack', '--json', '--pack-destination', sandbox], { env });
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    const metadata = JSON.parse(packed.stdout)[0];
    const paths = metadata.files.map((entry) => entry.path);

    for (const name of skillsForRuntime('claude')) {
      assert.ok(paths.includes(`skills/${name}/SKILL.md`), name);
    }
    for (const name of WORKFLOW_HOOK_FILES) {
      assert.ok(paths.includes(`hooks/${name}`), name);
    }
    for (const name of ['cli.cjs', 'project.cjs', 'checks.cjs', 'formats.cjs', 'ledger.cjs',
      'git-state.cjs', 'loading.cjs', 'plan.cjs', 'states.cjs', 'completion.cjs',
      'expect.cjs', 'expect-worker.cjs', 'milestone.cjs', 'context.cjs', 'signals.cjs',
      'merge.cjs', 'FORMATS.md']) {
      assert.ok(paths.includes(`engine/${name}`), name);
    }
    for (const readmeName of ['README.md', 'README.zh-CN.md']) {
      const markdown = fs.readFileSync(path.join(ROOT, readmeName), 'utf8');
      for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
        let target = match[1].trim().replace(/^<|>$/gu, '');
        if (/^(?:#|[a-z][a-z+.-]*:|\/)/iu.test(target)) continue;
        target = target.split('#', 1)[0].split('?', 1)[0];
        if (!target) continue;
        target = path.posix.normalize(path.posix.join(path.posix.dirname(readmeName), target));
        assert.ok(paths.includes(target), `${readmeName}: packed relative link ${target}`);
      }
    }
    const npmIgnore = fs.readFileSync(path.join(ROOT, '.npmignore'), 'utf8');
    assert.doesNotMatch(npmIgnore, /^docs\/\*$/mu);
    assert.doesNotMatch(npmIgnore, /ROADMAP\.md/u);
    assert.ok(!paths.some((file) => /^(?:commands|agents|mcp-server|orchestrator|ultra-tools|spec|docs\/wip)(?:\/|$)/.test(file)), paths.join('\n'));
    assert.ok(!paths.some((file) => /(?:state\.db|\.sqlite|\.pyc$|__pycache__)/i.test(file)), paths.join('\n'));

    const tarball = path.join(sandbox, metadata.filename);
    const consumer = path.join(sandbox, 'consumer');
    fs.mkdirSync(consumer);
    fs.writeFileSync(path.join(consumer, 'package.json'), '{"private":true}\n');
    const installed = command('npm', [
      'install', tarball, '--ignore-scripts', '--no-audit', '--no-fund',
    ], { cwd: consumer, env });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    const packageRoot = path.join(consumer, 'node_modules', 'ultra-builder-pro-cli');
    const cli = path.join(packageRoot, 'bin', 'install.js');
    const version = command(process.execPath, [cli, '--version'], { cwd: consumer });
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout, `ultra-builder-pro-cli v${PACKAGE_VERSION}\n`);

    const config = path.join(sandbox, 'installed-claude');
    const install = command(process.execPath, [
      cli, '--claude', '--global', '--config-dir', config,
    ], { cwd: consumer });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    const doctor = command(process.execPath, [
      cli, '--claude', '--global', '--config-dir', config, '--doctor', '--json',
    ], { cwd: consumer });
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
    assert.equal(JSON.parse(doctor.stdout).status, 'healthy');

  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
