'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');
const projector = require('../lib/projector.cjs');

function gitRun(cwd, args, opts = {}) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'ubp-test',
    GIT_AUTHOR_EMAIL: 'ubp@example.com',
    GIT_COMMITTER_NAME: 'ubp-test',
    GIT_COMMITTER_EMAIL: 'ubp@example.com',
  };
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env, ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
  return { code: r.status, stdout: r.stdout.trim(), stderr: r.stderr };
}

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-hash-flow-'));
  gitRun(dir, ['init', '-q', '-b', 'main']);
  gitRun(dir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(dir, '.gitignore'), '.ultra/.runtime\n');
  return dir;
}

test('completion hash backfill remains local and does not create a second commit', () => {
  const dir = tmpRepo();
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
    const init = initStateDb(dbPath);
    const db = init.db;

    // Task starts pending, no completion_commit yet.
    ops.createTask(db, { id: 'task-h1', title: 'commit hash flow', type: 'feature', priority: 'P1' });
    projector.projectAll(db, { rootDir: dir });

    // Stage initial state and land the feat commit.
    fs.writeFileSync(path.join(dir, 'src.js'), '// implementation\n');
    gitRun(dir, ['add', '-A']);
    gitRun(dir, ['commit', '-q', '-m', 'feat: task-h1 — commit hash flow']);

    const featSha = gitRun(dir, ['rev-parse', 'HEAD']).stdout;

    // Backfill the commit into checkout-local runtime authority.
    ops.patchTask(db, 'task-h1', { completion_commit: featSha });
    projector.projectContext(db, 'task-h1', {}, { rootDir: dir });

    const log = gitRun(dir, ['log', '--oneline']).stdout.split('\n');
    assert.equal(log.length, 1);
    assert.match(log[0], /feat: task-h1 — commit hash flow/);
    assert.equal(gitRun(dir, ['status', '--porcelain']).stdout, '');

    const ctxFile = path.join(
      dir, '.ultra', '.runtime', 'projections', 'contexts', 'task-task-h1.md',
    );
    const ctxText = fs.readFileSync(ctxFile, 'utf8');
    const dbRow = db.prepare("SELECT completion_commit FROM tasks WHERE id = 'task-h1'").get();
    assert.equal(dbRow.completion_commit, featSha);
    assert.match(ctxText, /^---/);
    assert.match(ctxText, /schema_version: 4\.5/);
    assert.match(ctxText, /task_id: task-h1/);
    assert.match(ctxText, new RegExp(`completion_commit: ${featSha}`));
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rerunning local completion projection is byte-idempotent and Git-clean', () => {
  const dir = tmpRepo();
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
    const init = initStateDb(dbPath);
    const db = init.db;
    ops.createTask(db, { id: 'task-h2', title: 'idempotent', type: 'feature', priority: 'P1' });
    projector.projectAll(db, { rootDir: dir });

    fs.writeFileSync(path.join(dir, 'a.js'), '// a\n');
    gitRun(dir, ['add', '-A']);
    gitRun(dir, ['commit', '-q', '-m', 'feat: task-h2 — idempotent']);
    const sha = gitRun(dir, ['rev-parse', 'HEAD']).stdout;
    ops.patchTask(db, 'task-h2', { completion_commit: sha });
    projector.projectContext(db, 'task-h2', {}, { rootDir: dir });
    const contextFile = path.join(
      dir, '.ultra', '.runtime', 'projections', 'contexts', 'task-task-h2.md',
    );
    const before = fs.readFileSync(contextFile);

    projector.projectContext(db, 'task-h2', {}, { rootDir: dir });
    assert.deepEqual(fs.readFileSync(contextFile), before);
    const status = gitRun(dir, ['status', '--porcelain']).stdout;
    assert.equal(status, '', 're-projection of unchanged state must leave nothing to commit');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
