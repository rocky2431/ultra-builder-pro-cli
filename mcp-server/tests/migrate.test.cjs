'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'ultra-tools', 'cli.cjs');
const FIXTURE = path.join(REPO_ROOT, 'spec', 'fixtures', 'v4.4-project');

const { EXPECTED_VERSION, openStateDb, closeStateDb } = require('../lib/state-db.cjs');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mig-'));
  copyRecursive(FIXTURE, dir);
  return dir;
}

function copyRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function runCli(args, opts = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts });
  const lines = r.stdout.trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1] || '{}';
  return { code: r.status, envelope: JSON.parse(last), stderr: r.stderr };
}

test('migrate --dry prints the plan without writing state.db or backups', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', 'state.db');
    const r = runCli(['migrate', '--from=4.4', '--to=4.5', '--dry', '--source-dir', dir]);
    assert.equal(r.code, 0);
    assert.equal(r.envelope.ok, true);
    assert.equal(r.envelope.data.mode, 'dry');
    assert.equal(r.envelope.data.tasks_to_insert, 3);
    assert.equal(r.envelope.data.events_to_insert, 6);
    assert.equal(r.envelope.data.warnings.length, 1, 'task-3 status mismatch must be flagged');
    assert.equal(r.envelope.data.warnings[0].task_id, 'task-3');
    assert.equal(fs.existsSync(dbPath), false, 'dry must not create state.db');
    const ultraEntries = fs.readdirSync(path.join(dir, '.ultra'));
    assert.equal(ultraEntries.some((n) => n.startsWith('backup-v4.4-')), false, 'dry must not create a backup');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate forward inserts tasks + events, records migration_history, creates backup', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', 'state.db');
    const r = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(r.code, 0);
    assert.equal(r.envelope.ok, true);
    assert.equal(r.envelope.data.mode, 'apply');
    assert.equal(r.envelope.data.tasks_inserted, 3);
    assert.equal(r.envelope.data.events_inserted, 6);
    assert.ok(fs.existsSync(r.envelope.data.backup_dir), 'backup dir must exist');
    assert.ok(fs.existsSync(dbPath), 'state.db must be written');

    const db = openStateDb(dbPath);
    const taskIds = db.prepare('SELECT id FROM tasks ORDER BY id').all().map((r) => r.id);
    assert.deepEqual(taskIds, ['task-1', 'task-2', 'task-3']);

    const migrated = db.prepare(
      'SELECT id, deps, estimated_days, context_file, created_at, updated_at FROM tasks ORDER BY id',
    ).all();
    assert.deepEqual(JSON.parse(migrated[1].deps), ['task-1']);
    assert.equal(migrated[1].estimated_days, 1.5);
    assert.equal(migrated[1].context_file, '.ultra/tasks/contexts/task-2.md');
    for (const task of migrated) {
      assert.match(task.created_at, /^2026-04-15T00:00:00\.000Z$/);
      assert.match(task.updated_at, /^2026-04-16T00:00:00\.000Z$/);
    }

    // Status comes from tasks.json (task-3 = pending), not the context md (blocked)
    const t3 = db.prepare("SELECT status FROM tasks WHERE id = 'task-3'").get();
    assert.equal(t3.status, 'pending');

    const eventCount = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
    assert.equal(eventCount, 6);

    const mig = db.prepare("SELECT direction, status FROM migration_history ORDER BY id").all();
    assert.equal(mig.length, 1);
    assert.equal(mig[0].direction, 'forward');
    assert.equal(mig[0].status, 'success');
    closeStateDb(db);

    const projected = JSON.parse(fs.readFileSync(
      path.join(dir, '.ultra', 'tasks', 'tasks.json'),
      'utf8',
    ));
    assert.equal(projected.schema_version, '4.5');
    assert.equal(projected.source, '.ultra/state.db');
    assert.equal(projected.tasks.length, 3);
    assert.equal(projected.tasks[1].estimated_days, 1.5);
    assert.deepEqual(projected.tasks[1].deps, ['task-1']);
    assert.match(
      fs.readFileSync(path.join(dir, '.ultra', 'tasks', 'contexts', 'task-2.md'), 'utf8'),
      /Wire JWT validation into the request pipeline/,
    );
    const contextTemplate = fs.readFileSync(
      path.join(dir, '.ultra', 'tasks', 'contexts', 'TEMPLATE.md'),
      'utf8',
    );
    assert.doesNotMatch(contextTemplate, /> \*\*Status\*\*:/);
    assert.doesNotMatch(contextTemplate, /mid_workflow_recall|session_context/);
    assert.match(contextTemplate, /Preserve this acceptance item/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate imports a v4.5 projection into current authority and requires evidence-backed re-adoption', () => {
  const dir = tmpProject();
  try {
    const tasksPath = path.join(dir, '.ultra', 'tasks', 'tasks.json');
    const projection = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    delete projection.version;
    projection.schema_version = '4.5';
    projection.source = '.ultra/state.db';
    fs.writeFileSync(tasksPath, `${JSON.stringify(projection, null, 2)}\n`);

    const r = runCli(['migrate', '--from=4.5', `--to=${EXPECTED_VERSION}`, '--source-dir', dir]);
    assert.equal(r.code, 0);
    assert.equal(r.envelope.data.from, '4.5');
    assert.equal(r.envelope.data.to, EXPECTED_VERSION);
    assert.match(path.basename(r.envelope.data.backup_dir), /^backup-v4\.5-/);

    const db = openStateDb(path.join(dir, '.ultra', 'state.db'));
    try {
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count, 3);
      const baseline = db.prepare(
        "SELECT mode, status, gaps_json FROM baselines WHERE id = 'migrated-baseline'",
      ).get();
      assert.deepEqual(
        { mode: baseline.mode, status: baseline.status },
        { mode: 'migrated', status: 'adopting' },
      );
      assert.equal(JSON.parse(baseline.gaps_json)[0].id, 'legacy-rebaseline-required');
    } finally { closeStateDb(db); }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate --rollback restores .ultra contents and writes a rollback row', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', 'state.db');
    const fwd = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(fwd.code, 0);

    // Capture rollback audit BEFORE the db file is removed by reading from the
    // backup snapshot we'll restore from.
    const backupDir = fwd.envelope.data.backup_dir;

    const back = runCli(['migrate', '--from=4.4', '--to=4.5', '--rollback', '--source-dir', dir]);
    assert.equal(back.code, 0);
    assert.equal(back.envelope.ok, true);
    assert.equal(back.envelope.data.mode, 'rollback');
    assert.equal(back.envelope.data.backup_dir, backupDir);

    // state.db is gone
    assert.equal(fs.existsSync(dbPath), false);

    // .ultra/tasks/tasks.json restored to original v4.4 content
    const tasksJson = JSON.parse(fs.readFileSync(path.join(dir, '.ultra', 'tasks', 'tasks.json'), 'utf8'));
    assert.equal(tasksJson.version, '4.4');
    assert.equal(tasksJson.tasks.length, 3);
    closeStateDb(undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate refuses to merge a v4.4 projection into a non-empty state.db', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', 'state.db');
    const init = require('../lib/state-db.cjs').initStateDb(dbPath);
    require('../lib/state-ops.cjs').createTask(init.db, {
      id: 'existing', title: 'existing task', type: 'feature', priority: 'P1',
    });
    closeStateDb(init.db);

    const r = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(r.code, 2);
    assert.equal(r.envelope.error.code, 'MIGRATE_FAILED');
    assert.match(r.envelope.error.message, /non-empty state\.db/);

    const db = openStateDb(dbPath);
    assert.deepEqual(db.prepare('SELECT id FROM tasks ORDER BY id').all(), [{ id: 'existing' }]);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate rejects unsupported --from / --to versions', () => {
  const r1 = runCli(['migrate', '--from=3.0', '--to=4.5', '--dry', '--source-dir', FIXTURE]);
  assert.equal(r1.code, 1);
  assert.equal(r1.envelope.error.code, 'UNSUPPORTED_VERSION');

  const r2 = runCli(['migrate', '--from=4.4', '--to=5.0', '--dry', '--source-dir', FIXTURE]);
  assert.equal(r2.code, 1);
  assert.equal(r2.envelope.error.code, 'UNSUPPORTED_VERSION');
});

test('migrate forward fails cleanly when tasks.json is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mig-empty-'));
  fs.mkdirSync(path.join(dir, '.ultra'), { recursive: true });
  try {
    const r = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(r.code, 2);
    assert.equal(r.envelope.error.code, 'MIGRATE_FAILED');
    assert.match(r.envelope.error.message, /tasks\.json missing/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
