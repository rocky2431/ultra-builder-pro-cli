'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { spawnSync } = require('node:child_process');

const gitBootstrap = require('./git-bootstrap.cjs');

test('nested projects receive one root-anchored repository-local runtime exclusion', () => {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-nested-repo-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repositoryRoot });
    execFileSync('git', ['config', 'user.email', 'nested@example.invalid'], {
      cwd: repositoryRoot,
    });
    execFileSync('git', ['config', 'user.name', 'Nested Project Test'], {
      cwd: repositoryRoot,
    });
    fs.writeFileSync(path.join(repositoryRoot, 'README.md'), '# monorepo\n');
    execFileSync('git', ['add', 'README.md'], { cwd: repositoryRoot });
    execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: repositoryRoot });

    const projectRoot = path.join(repositoryRoot, 'packages', 'app');
    fs.mkdirSync(path.join(projectRoot, '.ultra', 'specs'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, '.ultra', 'specs', 'product.md'),
      '# Product\n',
    );

    const result = gitBootstrap.ensureExistingProjectStorageBoundary(projectRoot);
    assert.equal(result.status, 'ready');
    assert.equal(result.local_exclude_changed, true);
    const exclude = fs.readFileSync(result.local_exclude_path, 'utf8');
    assert.match(exclude, /^\/packages\/app\/\.ultra\/\.runtime$/m);
    assert.doesNotMatch(exclude, /^\.ultra\/\.runtime$/m);
    assert.doesNotThrow(() => execFileSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--', '.ultra/.runtime/state.db'],
      { cwd: projectRoot },
    ));
    assert.throws(() => execFileSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--', '.ultra/specs/product.md'],
      { cwd: projectRoot },
    ));
  } finally {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test('storage admission checks every runtime and semantic artifact class', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-partial-ignore-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: rootDir });
    fs.writeFileSync(
      path.join(rootDir, '.gitignore'),
      '.ultra/.runtime/state.db\n.ultra/changes/archive/\n',
    );

    const result = gitBootstrap.ensureExistingProjectStorageBoundary(rootDir);
    assert.equal(result.status, 'ready');
    const runtimeProbes = [
      '.ultra/.runtime/state.db',
      '.ultra/.runtime/state.db-wal',
      '.ultra/.runtime/state.db-shm',
      '.ultra/.runtime/backups/backup.db',
      '.ultra/.runtime/collab/review.json',
      '.ultra/.runtime/sessions/session/metadata.json',
      '.ultra/.runtime/worktrees/session/marker',
      '.ultra/.runtime/telemetry/events.jsonl',
      '.ultra/.runtime/debug/trace.jsonl',
      '.ultra/.runtime/checkpoint.json',
      '.ultra/.runtime/orchestrator/orchestrator.pid',
      '.ultra/.runtime/orchestrator/orchestrator.log',
    ];
    for (const probe of runtimeProbes) {
      assert.doesNotThrow(
        () => execFileSync(
          'git', ['check-ignore', '--quiet', '--no-index', '--', probe],
          { cwd: rootDir },
        ),
        probe,
      );
    }
    const semanticProbes = [
      '.ultra/specs/product.md',
      '.ultra/tasks/tasks.json',
      '.ultra/reports/templates/test-report.json',
      '.ultra/reports/test-report.json',
      '.ultra/docs/research/report.md',
      '.ultra/changes/active/change/intent.md',
      '.ultra/changes/archive/change/intent.md',
    ];
    for (const probe of semanticProbes) {
      assert.throws(
        () => execFileSync(
          'git', ['check-ignore', '--quiet', '--no-index', '--', probe],
          { cwd: rootDir },
        ),
        (error) => error.status === 1,
        probe,
      );
    }
    const projectionProbes = [
      '.ultra/.runtime/projections/tasks.json',
      '.ultra/.runtime/projections/contexts/task.md',
    ];
    for (const probe of projectionProbes) {
      assert.doesNotThrow(
        () => execFileSync(
          'git', ['check-ignore', '--quiet', '--no-index', '--', probe],
          { cwd: rootDir },
        ),
        probe,
      );
    }
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('repository detection fails closed when Git metadata exists but probing fails', () => {
  const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-broken-git-'));
  const healthy = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-null-git-'));
  try {
    fs.writeFileSync(path.join(broken, '.git'), 'gitdir: /missing/git/metadata\n');
    assert.throws(
      () => gitBootstrap.inspectGitRepository(broken),
      (error) => error instanceof gitBootstrap.GitBootstrapError
        && error.code === 'GIT_DISCOVERY_FAILED',
    );

    execFileSync('git', ['init', '-q'], { cwd: healthy });
    assert.throws(
      () => gitBootstrap.inspectGitRepository(healthy, {
        spawnGit() {
          return {
            status: null,
            stdout: '',
            stderr: '',
            error: new Error('injected spawn failure'),
          };
        },
      }),
      (error) => error instanceof gitBootstrap.GitBootstrapError
        && error.code === 'GIT_DISCOVERY_FAILED',
    );
  } finally {
    fs.rmSync(broken, { recursive: true, force: true });
    fs.rmSync(healthy, { recursive: true, force: true });
  }
});

test('storage admission covers plan, findings, evidence, reconciliation, and real backup names', () => {
  const semanticCases = [
    '.ultra/plan.md',
    '.ultra/plan.json',
    '.ultra/changes/active/change/plan.md',
    '.ultra/changes/active/change/findings/review.md',
    '.ultra/evidence/build.json',
    '.ultra/reconciliation/change.md',
  ];
  for (const ignored of semanticCases) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-git-class-semantic-'));
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: rootDir });
      fs.writeFileSync(
        path.join(rootDir, '.gitignore'),
        `.ultra/.runtime\n${ignored}\n`,
      );
      const result = gitBootstrap.ensureExistingProjectStorageBoundary(rootDir);
      assert.equal(result.status, 'ready');
      assert.throws(
        () => execFileSync(
          'git', ['check-ignore', '--quiet', '--no-index', '--', ignored],
          { cwd: rootDir },
        ),
        (error) => error.status === 1,
        ignored,
      );
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }

  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-git-class-runtime-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: rootDir });
    fs.writeFileSync(
      path.join(rootDir, '.gitignore'),
      '.ultra/.runtime/*\n!.ultra/.runtime/backups/state-db-*.db\n',
    );
    const result = gitBootstrap.ensureExistingProjectStorageBoundary(rootDir);
    assert.equal(result.status, 'ready');
    assert.doesNotThrow(() => execFileSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--',
        '.ultra/.runtime/backups/state-db-2026-07-28.db'],
      { cwd: rootDir },
    ));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('repository detection treats an unexpected nonzero branch probe as failure', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-git-probe-status-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: rootDir });
    fs.writeFileSync(path.join(rootDir, 'README.md'), '# probe\n');
    execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
    execFileSync('git', ['-c', 'user.name=Probe', '-c', 'user.email=probe@example.invalid',
      'commit', '-q', '-m', 'seed'], { cwd: rootDir });
    assert.throws(
      () => gitBootstrap.inspectGitRepository(rootDir, {
        spawnGit(command, args, options) {
          if (args[0] === 'symbolic-ref') {
            return { status: 1, stdout: '', stderr: '' };
          }
          if (args[0] === 'branch' && args[1] === '--show-current') {
            return { status: 128, stdout: '', stderr: 'fatal: injected branch failure' };
          }
          return spawnSync(command, args, options);
        },
      }),
      (error) => error instanceof gitBootstrap.GitBootstrapError
        && error.code === 'GIT_DISCOVERY_FAILED',
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
