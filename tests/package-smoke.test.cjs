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
    assert.ok(paths.includes('skills/ultra-research/scripts/validate_north_star.cjs'));
    assert.ok(paths.includes('skills/ultra-plan/references/task-evidence-v2.md'));
    assert.ok(paths.includes('skills/ultra-plan/scripts/validate_task_evidence.cjs'));
    assert.ok(paths.includes('skills/ultra-test/scripts/validate_review_transport.cjs'));
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
    assert.ok(paths.includes('docs/evals/adversarial-review-2026-08-14.md'));
    assert.ok(paths.includes('docs/evals/zcode-automation-2026-08-14.md'));
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
    assert.deepEqual(
      fs.readFileSync(path.join(
        config, 'skills', 'ultra-builder-pro', 'skills',
        'ultra-init', 'scripts', 'init_project.cjs',
      )),
      fs.readFileSync(path.join(ROOT, 'skills', 'ultra-init', 'scripts', 'init_project.cjs')),
    );
    assert.deepEqual(
      fs.readFileSync(path.join(
        config, 'skills', 'ultra-builder-pro', 'skills',
        'ultra-research', 'scripts', 'validate_north_star.cjs',
      )),
      fs.readFileSync(path.join(
        ROOT, 'skills', 'ultra-research', 'scripts', 'validate_north_star.cjs',
      )),
    );
    const project = path.join(sandbox, 'initialized-project');
    fs.mkdirSync(project);
    const initialized = command(process.execPath, [
      path.join(config, 'skills', 'ultra-builder-pro', 'skills', 'ultra-init', 'scripts', 'init_project.cjs'),
      '--project', project,
    ], { cwd: project });
    assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(project, '.ultra', 'tasks.json'), 'utf8')),
      { $schema: 'ultra-task-ledger-v2', tasks: [] },
    );
    const initializedContextTemplate = fs.readFileSync(
      path.join(project, '.ultra', 'contexts', 'TEMPLATE.md'),
      'utf8',
    );
    assert.deepEqual(
      [...initializedContextTemplate.matchAll(/^## ([^#].*)$/gm)].map((match) => match[1]),
      [
        'Context', 'Implementation', 'Planned Path Inventory', 'Public Seams',
        'Narrow Verification', 'Acceptance Criteria', 'Definition of Drift', 'Trace',
        'Change Log', 'Open Questions', 'Resume Note', 'Completion', 'Task Review',
      ],
    );
    assert.doesNotMatch(
      initializedContextTemplate,
      /^> \*\*(?:Status|Priority|Complexity)\*\*/m,
    );
    assert.match(
      initializedContextTemplate,
      /^\| ID \| Criterion \| Verification type \| Required evidence \|$/m,
    );
    const initializedTestReport = JSON.parse(fs.readFileSync(
      path.join(project, '.ultra', 'test-report.json'),
      'utf8',
    ));
    assert.equal(initializedTestReport.$schema, 'ultra-test-report-v2');
    assert.deepEqual(initializedTestReport.task_evidence, []);
    assert.ok(fs.existsSync(path.join(project, '.ultra', 'project-brief.md')));

    const installedNorthStar = path.join(installedTemplate, 'north-star.md');
    const canonicalNorthStar = fs.readFileSync(installedNorthStar);
    fs.writeFileSync(
      installedNorthStar,
      fs.readFileSync(installedNorthStar, 'utf8').replace(
        '> owner-readable structure only;',
        '> owner-readable structure only; maximize an invented metric;',
      ),
    );
    const malformedProject = path.join(sandbox, 'malformed-initialized-project');
    fs.mkdirSync(malformedProject);
    const malformedInit = command(process.execPath, [
      path.join(config, 'skills', 'ultra-builder-pro', 'skills', 'ultra-init', 'scripts', 'init_project.cjs'),
      '--project', malformedProject,
    ], { cwd: malformedProject });
    assert.equal(malformedInit.status, 1, malformedInit.stdout);
    assert.equal(malformedInit.stdout, '');
    const malformedFailure = JSON.parse(malformedInit.stderr);
    assert.equal(malformedFailure.$schema, 'ultra-init-error-v1');
    assert.equal(malformedFailure.code, 'north_star_template_invalid');
    assert.equal(malformedFailure.retryable, true);
    assert.equal(malformedFailure.phase, 'template_validation');
    assert.equal(malformedFailure.path, 'north-star.md');
    assert.deepEqual(
      malformedFailure.diagnostics.map(({ code, message }) => ({ code, message })),
      [{
        code: 'invalid_unresearched_placeholder',
        message: 'An unresearched North Star must preserve the exact packaged placeholder bytes, fields, and sentinels',
      }],
    );
    assert.equal(fs.existsSync(path.join(malformedProject, '.ultra')), false);
    assert.deepEqual(
      fs.readdirSync(malformedProject).filter((name) => name.startsWith('.ultra-init-')),
      [],
    );

    fs.writeFileSync(installedNorthStar, canonicalNorthStar);
    const recoveredInit = command(process.execPath, [
      path.join(config, 'skills', 'ultra-builder-pro', 'skills', 'ultra-init', 'scripts', 'init_project.cjs'),
      '--project', malformedProject,
    ], { cwd: malformedProject });
    assert.equal(recoveredInit.status, 0, recoveredInit.stderr || recoveredInit.stdout);
    assert.equal(
      JSON.parse(recoveredInit.stdout).north_star.disposition,
      'created_unresearched',
    );
    assert.deepEqual(
      fs.readFileSync(path.join(malformedProject, '.ultra', 'north-star.md')),
      canonicalNorthStar,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
