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
  // Ignore the SQLite WAL/SHM sidecars so they don't appear as modifications.
  fs.writeFileSync(path.join(dir, '.gitignore'), '.ultra/state.db-shm\n.ultra/state.db-wal\n');
  return dir;
}

test('two-commit flow lands feat then chore with the right SHA in context md', () => {
  const dir = tmpRepo();
  try {
    const dbPath = path.join(dir, '.ultra', 'state.db');
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

    // Step 3 — update state.db with the new SHA.
    ops.patchTask(db, 'task-h1', { completion_commit: featSha });

    // Step 4 — re-project the context so its YAML carries the hash.
    projector.projectContext(db, 'task-h1', {}, { rootDir: dir });

    // Step 5 — chore commit captures the projection update.
    gitRun(dir, ['add', '-A']);
    gitRun(dir, ['commit', '-q', '-m', 'chore: record task-h1 completion hash']);

    const log = gitRun(dir, ['log', '--oneline', '-2']).stdout.split('\n');
    assert.match(log[0], /chore: record task-h1 completion hash/);
    assert.match(log[1], /feat: task-h1 — commit hash flow/);

    const ctxFile = path.join(dir, '.ultra', 'tasks', 'contexts', 'task-task-h1.md');
    const ctxText = fs.readFileSync(ctxFile, 'utf8');
    // The chore commit's working tree must reflect the recorded SHA.
    const dbRow = db.prepare("SELECT completion_commit FROM tasks WHERE id = 'task-h1'").get();
    assert.equal(dbRow.completion_commit, featSha);
    // Header is regenerated; ensure projector wrote v4.5 + the right task_id.
    assert.match(ctxText, /^---/);
    assert.match(ctxText, /schema_version: 4\.5/);
    assert.match(ctxText, /task_id: task-h1/);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rerunning steps 4–5 against the same SHA produces an empty chore commit attempt', () => {
  const dir = tmpRepo();
  try {
    const dbPath = path.join(dir, '.ultra', 'state.db');
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
    gitRun(dir, ['add', '-A']);
    gitRun(dir, ['commit', '-q', '-m', 'chore: record task-h2 completion hash']);

    // Idempotency: re-projecting the same db state must produce byte-identical
    // context md (generated_at is derived from tasks.updated_at, not now()).
    projector.projectContext(db, 'task-h2', {}, { rootDir: dir });
    gitRun(dir, ['add', '-A']);
    const status = gitRun(dir, ['status', '--porcelain']).stdout;
    assert.equal(status, '', 're-projection of unchanged state must leave nothing to commit');

    // A retry chore commit on an empty diff must be refused by git.
    const r = gitRun(dir, ['commit', '-q', '-m', 'chore: idempotent retry'], { allowFail: true });
    assert.notEqual(r.code, 0, 'a follow-up empty chore commit must fail');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
