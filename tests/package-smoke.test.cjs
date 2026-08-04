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

test('npm tarball contains and runs only the v0.26 file-first product surface', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-pack-'));
  try {
    const packed = command('npm', ['pack', '--json', '--pack-destination', sandbox]);
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    const metadata = JSON.parse(packed.stdout)[0];
    const paths = metadata.files.map((entry) => entry.path);

    for (const name of skillsForRuntime('claude')) {
      assert.ok(paths.includes(`skills/${name}/SKILL.md`), name);
    }
    for (const name of WORKFLOW_HOOK_FILES) {
      assert.ok(paths.includes(`hooks/${name}`), name);
    }
    assert.ok(paths.includes('hooks/_common.py'));
    assert.ok(paths.includes('bin/delegate.cjs'));
    assert.ok(paths.includes('bin/delegate-worker.cjs'));
    assert.ok(paths.includes('.ultra-template/project-brief.md'));
    assert.ok(paths.includes('.ultra-template/tasks.json'));
    assert.ok(paths.includes('.ultra-template/test-report.json'));
    assert.ok(paths.includes('skills/ultra-init/scripts/init_project.cjs'));
    for (const document of [
      'ARCHITECTURE.md',
      'ARTIFACT-AUTHORITY.md',
      'DECISIONS.md',
      'PHILOSOPHY.md',
      'PLUGIN-ISOLATION-CONTRACT.md',
      'RUNTIME-COMPAT-MATRIX.md',
      'SKILL-AUTHORING.md',
      'WORKFLOW-LIFECYCLE.md',
    ]) {
      assert.ok(paths.includes(`docs/${document}`), document);
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
    ], { cwd: consumer });
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

    const installedTemplate = path.join(
      config, 'skills', 'ultra-builder-pro', 'skills',
      'ultra-init', 'assets', 'project-template',
    );
    assert.ok(fs.existsSync(path.join(installedTemplate, 'project-brief.md')));
    assert.ok(fs.existsSync(path.join(installedTemplate, 'north-star.md')));
    const project = path.join(sandbox, 'initialized-project');
    fs.mkdirSync(project);
    const initialized = command(process.execPath, [
      path.join(config, 'skills', 'ultra-builder-pro', 'skills', 'ultra-init', 'scripts', 'init_project.cjs'),
      '--project', project,
    ], { cwd: project });
    assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(project, '.ultra', 'tasks.json'), 'utf8')),
      { tasks: [] },
    );
    assert.ok(fs.existsSync(path.join(project, '.ultra', 'project-brief.md')));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
