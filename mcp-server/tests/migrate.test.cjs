'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const Database = require('better-sqlite3');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'ultra-tools', 'cli.cjs');
const FIXTURE = path.join(REPO_ROOT, 'spec', 'fixtures', 'v4.4-project');

const {
  EXPECTED_VERSION, initStateDb, openStateDb, closeStateDb,
} = require('../lib/state-db.cjs');
const migrateCommand = require('../../ultra-tools/commands/migrate.cjs');

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
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
    const r = runCli(['migrate', '--from=4.4', '--to=4.5', '--dry', '--source-dir', dir]);
    assert.equal(r.code, 0);
    assert.equal(r.envelope.ok, true);
    assert.equal(r.envelope.data.mode, 'dry');
    assert.equal(r.envelope.data.tasks_to_insert, 3);
    assert.equal(r.envelope.data.events_to_insert, 6);
    assert.equal(r.envelope.data.warnings.length, 1, 'task-3 status mismatch must be flagged');
    assert.equal(r.envelope.data.warnings[0].task_id, 'task-3');
    assert.equal(fs.existsSync(dbPath), false, 'dry must not create state.db');
    assert.equal(
      fs.existsSync(path.join(dir, '.ultra', '.runtime')),
      false,
      'dry must not create runtime state or a backup',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate forward inserts tasks + events, records migration_history, creates backup', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
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

    const eventCounts = db.prepare(
      `SELECT
         SUM(CASE WHEN type = 'artifact_recorded' THEN 1 ELSE 0 END) AS artifact_events,
         SUM(CASE WHEN type <> 'artifact_recorded' THEN 1 ELSE 0 END) AS imported_events
       FROM events`,
    ).get();
    assert.equal(eventCounts.imported_events, 6);
    assert.equal(eventCounts.artifact_events, 3);

    const mig = db.prepare("SELECT direction, status FROM migration_history ORDER BY id").all();
    assert.equal(mig.length, 1);
    assert.equal(mig[0].direction, 'forward');
    assert.equal(mig[0].status, 'success');
    const promoted = db.prepare(
      `SELECT * FROM artifacts
       WHERE owner_type = 'task' AND owner_id = 'task-2'
         AND kind = 'legacy_context_findings'`,
    ).get();
    assert.ok(promoted, 'legacy context prose must be promoted before projection replacement');
    assert.equal(promoted.managed, 1);
    assert.match(
      fs.readFileSync(path.join(dir, promoted.path), 'utf8'),
      /Wire JWT validation into the request pipeline/,
    );
    assert.deepEqual(
      db.prepare(
        `SELECT target_type, target_id FROM artifact_edges
         WHERE source_type = 'artifact' AND source_id = ?`,
      ).all(promoted.id),
      [{ target_type: 'task', target_id: 'task-2' }],
    );
    closeStateDb(db);

    const projected = JSON.parse(fs.readFileSync(
      path.join(dir, '.ultra', 'tasks', 'tasks.json'),
      'utf8',
    ));
    assert.equal(projected.schema_version, '4.5');
    assert.equal(projected.source, '.ultra/.runtime/state.db');
    assert.equal(projected.tasks.length, 3);
    assert.equal(projected.tasks[1].estimated_days, 1.5);
    assert.deepEqual(projected.tasks[1].deps, ['task-1']);
    const migratedContext = fs.readFileSync(
      path.join(dir, '.ultra', 'tasks', 'contexts', 'task-2.md'),
      'utf8',
    );
    assert.match(migratedContext, /## Execution Contract \(generated from state\.db\)/);
    assert.doesNotMatch(
      migratedContext,
      /Wire JWT validation into the request pipeline/,
      'legacy arbitrary prose must not survive inside a read-only projection',
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

test('migrate rejects traversal and symlink context paths before writing authority state', () => {
  const traversal = tmpProject();
  const symlink = tmpProject();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mig-contexts-'));
  try {
    const tasksPath = path.join(traversal, '.ultra', 'tasks', 'tasks.json');
    const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    tasks.tasks[0].context_file = '.ultra/tasks/contexts/../../../escaped.md';
    fs.writeFileSync(tasksPath, `${JSON.stringify(tasks, null, 2)}\n`);
    const traversalResult = runCli([
      'migrate', '--from=4.4', '--to=4.5', '--dry', '--source-dir', traversal,
    ]);
    assert.equal(traversalResult.code, 2);
    assert.match(traversalResult.envelope.error.message, /context_file|context path/i);
    assert.equal(fs.existsSync(path.join(traversal, '.ultra', '.runtime')), false);

    const contexts = path.join(symlink, '.ultra', 'tasks', 'contexts');
    fs.cpSync(contexts, external, { recursive: true });
    fs.rmSync(contexts, { recursive: true });
    fs.symlinkSync(external, contexts);
    const symlinkResult = runCli([
      'migrate', '--from=4.4', '--to=4.5', '--dry', '--source-dir', symlink,
    ]);
    assert.equal(symlinkResult.code, 2);
    assert.match(symlinkResult.envelope.error.message, /symlink|symbolic|context/i);
    assert.equal(fs.existsSync(path.join(symlink, '.ultra', '.runtime')), false);
  } finally {
    fs.rmSync(traversal, { recursive: true, force: true });
    fs.rmSync(symlink, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  }
});

test('migrate aborts when a fourth task appears after the immutable backup snapshot', () => {
  const dir = tmpProject();
  try {
    const tasksPath = path.join(dir, '.ultra', 'tasks', 'tasks.json');
    assert.throws(
      () => migrateCommand.prepareForwardSnapshot(dir, '4.4', {
        afterBackup() {
          const document = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
          document.tasks.push({
            id: 'task-4',
            title: 'Concurrent fourth task',
            type: 'feature',
            priority: 'P1',
            status: 'pending',
            dependencies: [],
          });
          fs.writeFileSync(tasksPath, `${JSON.stringify(document, null, 2)}\n`);
        },
      }),
      /semantic source changed|replan required/i,
    );
    assert.equal(
      fs.existsSync(path.join(dir, '.ultra', '.runtime', 'state.db')),
      false,
    );
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
    projection.source = '.ultra/.runtime/state.db';
    fs.writeFileSync(tasksPath, `${JSON.stringify(projection, null, 2)}\n`);

    const r = runCli(['migrate', '--from=4.5', `--to=${EXPECTED_VERSION}`, '--source-dir', dir]);
    assert.equal(r.code, 0);
    assert.equal(r.envelope.data.from, '4.5');
    assert.equal(r.envelope.data.to, EXPECTED_VERSION);
    assert.match(path.basename(r.envelope.data.backup_dir), /^projection-v4\.5-/);

    const db = openStateDb(path.join(dir, '.ultra', '.runtime', 'state.db'));
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

test('migrate --rollback restores .ultra contents through a staged transaction', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
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

test('rollback snapshots a held DB handle and stale writes cannot mutate recovery evidence', () => {
  const dir = tmpProject();
  let stale;
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
    const forward = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(forward.code, 0);
    stale = openStateDb(dbPath);
    stale.prepare(
      "INSERT INTO events(type, payload_json) VALUES ('before-rollback-snapshot', '{\"preserved\":true}')",
    ).run();

    const result = migrateCommand.rollbackFromBackup({
      sourceDir: dir,
      dbPath,
      backupDir: forward.envelope.data.backup_dir,
      fromVersion: '4.4',
      toVersion: '4.5',
    });
    const snapshotPath = path.join(result.recovery_dir, 'previous-state', 'state.db');
    const digest = () => createHash('sha256').update(fs.readFileSync(snapshotPath)).digest('hex');
    const beforeStaleWrite = digest();
    let staleWriteError = null;
    try {
      stale.prepare(
        "INSERT INTO events(type, payload_json) VALUES ('after-rollback-stale-write', '{\"must_not_reach_recovery\":true}')",
      ).run();
    } catch (error) {
      staleWriteError = error;
    }
    closeStateDb(stale);
    stale = null;

    assert.equal(digest(), beforeStaleWrite);
    const snapshot = new Database(snapshotPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(
        snapshot.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE type = 'before-rollback-snapshot'",
        ).get().count,
        1,
      );
      assert.equal(
        snapshot.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE type = 'after-rollback-stale-write'",
        ).get().count,
        0,
      );
    } finally {
      snapshot.close();
    }
    assert.ok(
      staleWriteError || !fs.existsSync(dbPath),
      'a stale handle may fail or write only its unlinked inode, never recovery evidence',
    );
    assert.equal(migrateCommand.resumeRollbackRecovery(dir).pending, 0);
  } finally {
    closeStateDb(stale);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rollback retries when a commit lands between VACUUM and the exclusive fence', () => {
  const dir = tmpProject();
  let writer;
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
    const forward = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(forward.code, 0);
    writer = openStateDb(dbPath);
    let injected = false;

    const result = migrateCommand.rollbackFromBackup({
      sourceDir: dir,
      dbPath,
      backupDir: forward.envelope.data.backup_dir,
      fromVersion: '4.4',
      toVersion: '4.5',
    }, {
      afterStateSnapshotBeforeFence({ attempt }) {
        if (attempt !== 1) return;
        writer.prepare(
          "INSERT INTO events(type, payload_json) VALUES ('vacuum-fence-gap-proof', '{\"preserved\":true}')",
        ).run();
        injected = true;
      },
    });
    closeStateDb(writer);
    writer = null;

    assert.equal(injected, true);
    const snapshotPath = path.join(result.recovery_dir, 'previous-state', 'state.db');
    const snapshot = new Database(snapshotPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(
        snapshot.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE type = 'vacuum-fence-gap-proof'",
        ).get().count,
        1,
      );
    } finally {
      snapshot.close();
    }
    const journal = JSON.parse(fs.readFileSync(
      path.join(result.recovery_dir, 'journal.json'),
      'utf8',
    ));
    assert.equal(journal.previous_state_snapshot_attempts, 2);
    assert.equal(Number.isInteger(journal.previous_state_data_version), true);
  } finally {
    closeStateDb(writer);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate --rollback supports a legacy backup before .ultra/.runtime exists', () => {
  const dir = tmpProject();
  try {
    const ultraDir = path.join(dir, '.ultra');
    const backupDir = path.join(ultraDir, 'backup-v4.4-legacy');
    fs.mkdirSync(backupDir);
    for (const entry of ['tasks', 'specs']) {
      const source = path.join(ultraDir, entry);
      if (fs.existsSync(source)) {
        fs.cpSync(source, path.join(backupDir, entry), { recursive: true });
      }
    }

    const tasksPath = path.join(ultraDir, 'tasks', 'tasks.json');
    const current = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    current.version = '4.5';
    fs.writeFileSync(tasksPath, `${JSON.stringify(current, null, 2)}\n`);
    const legacyDbPath = path.join(ultraDir, 'state.db');
    closeStateDb(initStateDb(legacyDbPath).db);
    assert.equal(fs.existsSync(path.join(ultraDir, '.runtime')), false);

    const back = runCli([
      'migrate', '--from=4.4', '--to=4.5', '--rollback', '--source-dir', dir,
    ]);
    assert.equal(back.code, 0, back.stderr || JSON.stringify(back.envelope));
    assert.equal(fs.existsSync(backupDir), true);
    assert.equal(fs.existsSync(legacyDbPath), false);
    assert.equal(
      fs.existsSync(path.join(ultraDir, '.runtime', 'state.db')),
      false,
    );
    const recoveryRoot = path.join(
      ultraDir,
      '.runtime',
      'recovery',
      'migrate-rollback',
    );
    const recoveryEntries = fs.readdirSync(recoveryRoot);
    assert.equal(recoveryEntries.length, 1);
    assert.equal(
      JSON.parse(fs.readFileSync(
        path.join(recoveryRoot, recoveryEntries[0], 'journal.json'),
        'utf8',
      )).phase,
      'complete',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(tasksPath, 'utf8')).version,
      '4.4',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate --rollback selects the newest valid backup across legacy and runtime roots', () => {
  const dir = tmpProject();
  try {
    const forward = runCli([
      'migrate', '--from=4.4', '--to=4.5', '--source-dir', dir,
    ]);
    assert.equal(forward.code, 0);
    const freshRuntime = forward.envelope.data.backup_dir;
    const staleLegacy = path.join(
      dir,
      '.ultra',
      'backup-v4.4-2020-01-01T00-00-00-000Z',
    );
    fs.cpSync(freshRuntime, staleLegacy, { recursive: true });
    fs.utimesSync(
      staleLegacy,
      new Date('2020-01-01T00:00:00.000Z'),
      new Date('2020-01-01T00:00:00.000Z'),
    );
    fs.utimesSync(
      freshRuntime,
      new Date('2026-07-28T12:00:00.000Z'),
      new Date('2026-07-28T12:00:00.000Z'),
    );

    const back = runCli([
      'migrate', '--from=4.4', '--to=4.5', '--rollback', '--source-dir', dir,
    ]);
    assert.equal(back.code, 0, back.stderr || JSON.stringify(back.envelope));
    assert.equal(back.envelope.data.backup_dir, freshRuntime);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate --rollback rejects a symlinked backup without touching current authority', () => {
  const dir = tmpProject();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mig-outside-'));
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
    const fwd = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(fwd.code, 0);
    const dbBefore = fs.readFileSync(dbPath);
    const tasksPath = path.join(dir, '.ultra', 'tasks', 'tasks.json');
    const tasksBefore = fs.readFileSync(tasksPath);
    fs.writeFileSync(path.join(outside, 'sentinel'), 'outside');
    const malicious = path.join(
      dir,
      '.ultra',
      '.runtime',
      'backups',
      'projection-v4.4-zzzz-malicious',
    );
    fs.symlinkSync(outside, malicious, 'dir');

    const back = runCli([
      'migrate', '--from=4.4', '--to=4.5', '--rollback', '--source-dir', dir,
    ]);
    assert.equal(back.code, 2);
    assert.equal(back.envelope.error.code, 'ROLLBACK_FAILED');
    assert.match(back.envelope.error.message, /symlink|real directory|unsafe/i);
    assert.deepEqual(fs.readFileSync(dbPath), dbBefore);
    assert.deepEqual(fs.readFileSync(tasksPath), tasksBefore);
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8'), 'outside');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('migrate rollback staging failure preserves the exact current DB and semantic files', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
    const fwd = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(fwd.code, 0);
    const backupDir = fwd.envelope.data.backup_dir;
    const tasksPath = path.join(dir, '.ultra', 'tasks', 'tasks.json');
    const productPath = path.join(dir, '.ultra', 'specs', 'product.md');
    const before = {
      db: fs.readFileSync(dbPath),
      tasks: fs.readFileSync(tasksPath),
      product: fs.existsSync(productPath) ? fs.readFileSync(productPath) : null,
    };
    let copies = 0;

    assert.throws(
      () => migrateCommand.rollbackFromBackup({
        sourceDir: dir,
        dbPath,
        backupDir,
        fromVersion: '4.4',
        toVersion: '4.5',
      }, {
        copyFileSync(source, target) {
          copies += 1;
          if (copies === 2) throw new Error('injected rollback staging copy failure');
          fs.copyFileSync(source, target);
        },
      }),
      /injected rollback staging copy failure/,
    );

    assert.deepEqual(fs.readFileSync(dbPath), before.db);
    assert.deepEqual(fs.readFileSync(tasksPath), before.tasks);
    if (before.product) assert.deepEqual(fs.readFileSync(productPath), before.product);
    assert.deepEqual(
      fs.readdirSync(path.join(dir, '.ultra', '.runtime'))
        .filter((name) => name.startsWith('.rollback-stage-')),
      [],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate cleanup failure preserves the installed rollback and durable recovery image', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
    const fwd = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(fwd.code, 0);
    let cleanupAttempts = 0;

    const result = migrateCommand.rollbackFromBackup({
      sourceDir: dir,
      dbPath,
      backupDir: fwd.envelope.data.backup_dir,
      fromVersion: '4.4',
      toVersion: '4.5',
    }, {
      rmSync(target, options) {
        if (path.basename(target).startsWith('.rollback-stage-')) {
          cleanupAttempts += 1;
          const restore = path.join(target, 'restore');
          if (fs.existsSync(restore)) {
            fs.rmSync(restore, { recursive: true, force: true });
          }
          throw new Error('injected partial cleanup failure');
        }
        fs.rmSync(target, options);
      },
    });

    assert.equal(cleanupAttempts, 1);
    assert.equal(result.cleanup_pending, true);
    assert.equal(fs.existsSync(dbPath), false);
    assert.equal(
      JSON.parse(fs.readFileSync(
        path.join(dir, '.ultra', 'tasks', 'tasks.json'),
        'utf8',
      )).version,
      '4.4',
    );
    assert.equal(fs.existsSync(result.recovery_dir), true);
    assert.equal(
      JSON.parse(fs.readFileSync(result.journal_path, 'utf8')).phase,
      'cleanup_pending',
    );

    const resumed = migrateCommand.resumeRollbackRecovery(dir);
    assert.equal(resumed.resumed, 1);
    assert.equal(fs.existsSync(result.stage_dir), false);
    assert.equal(
      JSON.parse(fs.readFileSync(result.journal_path, 'utf8')).phase,
      'complete',
    );
    assert.equal(fs.existsSync(dbPath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate refuses a projection backup whose content no longer matches its manifest', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
    const fwd = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(fwd.code, 0);
    const backupActivity = path.join(fwd.envelope.data.backup_dir, 'activity-log.json');
    fs.appendFileSync(backupActivity, '\n{"tampered":true}\n');
    const beforeDb = fs.readFileSync(dbPath);

    const back = runCli([
      'migrate', '--from=4.4', '--to=4.5', '--rollback', '--source-dir', dir,
    ]);
    assert.equal(back.code, 2);
    assert.equal(back.envelope.error.code, 'ROLLBACK_FAILED');
    assert.match(back.envelope.error.message, /manifest|digest|inventory/i);
    assert.deepEqual(fs.readFileSync(dbPath), beforeDb);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate resumes an installed rollback after interruption before stage cleanup', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
    const fwd = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(fwd.code, 0);

    assert.throws(
      () => migrateCommand.rollbackFromBackup({
        sourceDir: dir,
        dbPath,
        backupDir: fwd.envelope.data.backup_dir,
        fromVersion: '4.4',
        toVersion: '4.5',
      }, {
        afterPublish() {
          throw new Error('injected interruption after rollback install');
        },
      }),
      /injected interruption after rollback install/,
    );

    assert.equal(fs.existsSync(dbPath), false);
    assert.equal(
      JSON.parse(fs.readFileSync(
        path.join(dir, '.ultra', 'tasks', 'tasks.json'),
        'utf8',
      )).version,
      '4.4',
    );
    const recoveryRoot = path.join(
      dir,
      '.ultra',
      '.runtime',
      'recovery',
      'migrate-rollback',
    );
    const recoveryName = fs.readdirSync(recoveryRoot)[0];
    const journalPath = path.join(recoveryRoot, recoveryName, 'journal.json');
    const interrupted = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    assert.equal(interrupted.phase, 'installed');
    assert.equal(fs.existsSync(interrupted.stage_dir), true);
    fs.rmSync(fwd.envelope.data.backup_dir, { recursive: true, force: true });

    const resumed = migrateCommand.resumeRollbackRecovery(dir);
    assert.equal(resumed.resumed, 1);
    assert.equal(fs.existsSync(interrupted.stage_dir), false);
    assert.equal(
      JSON.parse(fs.readFileSync(journalPath, 'utf8')).phase,
      'complete',
    );
    assert.equal(fs.existsSync(dbPath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate recovery refuses to complete when the installed rollback lost a manifested file', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
    const fwd = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(fwd.code, 0);
    assert.throws(
      () => migrateCommand.rollbackFromBackup({
        sourceDir: dir,
        dbPath,
        backupDir: fwd.envelope.data.backup_dir,
        fromVersion: '4.4',
        toVersion: '4.5',
      }, {
        afterPublish() {
          throw new Error('injected interruption after rollback install');
        },
      }),
      /injected interruption after rollback install/,
    );
    const missing = path.join(dir, '.ultra', 'activity-log.json');
    fs.rmSync(missing);
    const recoveryRoot = path.join(
      dir, '.ultra', '.runtime', 'recovery', 'migrate-rollback',
    );
    const recoveryName = fs.readdirSync(recoveryRoot)[0];
    const journalPath = path.join(recoveryRoot, recoveryName, 'journal.json');
    const before = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

    assert.throws(
      () => migrateCommand.resumeRollbackRecovery(dir),
      /manifest|digest|inventory/i,
    );
    assert.equal(
      JSON.parse(fs.readFileSync(journalPath, 'utf8')).phase,
      before.phase,
    );
    assert.equal(fs.existsSync(before.stage_dir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate refuses to merge a v4.4 projection into a non-empty state.db', () => {
  const dir = tmpProject();
  try {
    const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
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
    const legacyDb = path.join(dir, '.ultra', 'state.db'); // runtime-path-compatibility
    const legacySession = path.join(dir, '.ultra', 'sessions', 'session.json'); // runtime-path-compatibility
    fs.writeFileSync(legacyDb, 'legacy authority');
    fs.mkdirSync(path.dirname(legacySession), { recursive: true });
    fs.writeFileSync(legacySession, 'legacy session');
    const before = {
      db: fs.readFileSync(legacyDb),
      session: fs.readFileSync(legacySession),
      entries: fs.readdirSync(path.join(dir, '.ultra')).sort(),
    };
    const r = runCli(['migrate', '--from=4.4', '--to=4.5', '--source-dir', dir]);
    assert.equal(r.code, 2);
    assert.equal(r.envelope.error.code, 'MIGRATE_FAILED');
    assert.match(r.envelope.error.message, /tasks\.json missing/);
    assert.deepEqual(fs.readFileSync(legacyDb), before.db);
    assert.deepEqual(fs.readFileSync(legacySession), before.session);
    assert.deepEqual(fs.readdirSync(path.join(dir, '.ultra')).sort(), before.entries);
    assert.equal(fs.existsSync(path.join(dir, '.ultra', '.runtime')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate backup preserves nested semantic files whose names resemble runtime artifacts', () => {
  const dir = tmpProject();
  try {
    const nested = [
      ['docs/state.db', 'semantic state prose'],
      ['docs/state.db-wal', 'semantic WAL prose'],
      ['docs/backup-v4.4-notes.md', 'semantic backup notes'],
      ['specs/.runtime/contract.md', 'semantic runtime contract'],
    ];
    for (const [relative, contents] of nested) {
      const target = path.join(dir, '.ultra', relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }

    const forward = runCli([
      'migrate', '--from=4.4', '--to=4.5', '--source-dir', dir,
    ]);
    assert.equal(forward.code, 0, forward.stderr || JSON.stringify(forward.envelope));
    for (const [relative, contents] of nested) {
      assert.equal(
        fs.readFileSync(path.join(forward.envelope.data.backup_dir, relative), 'utf8'),
        contents,
        relative,
      );
    }

    for (const [relative] of nested) {
      fs.rmSync(path.join(dir, '.ultra', relative), { recursive: true, force: true });
    }
    const rollback = runCli([
      'migrate', '--from=4.4', '--to=4.5', '--rollback', '--source-dir', dir,
    ]);
    assert.equal(rollback.code, 0, rollback.stderr || JSON.stringify(rollback.envelope));
    for (const [relative, contents] of nested) {
      assert.equal(fs.readFileSync(path.join(dir, '.ultra', relative), 'utf8'), contents);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate rejects an external --db-path before writing any authority', () => {
  const dir = tmpProject();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mig-external-db-'));
  try {
    const externalDb = path.join(outside, 'state.db');
    const r = runCli([
      'migrate',
      '--from=4.4',
      '--to=4.5',
      '--source-dir',
      dir,
      '--db-path',
      externalDb,
    ]);
    assert.equal(r.code, 2);
    assert.equal(r.envelope.ok, false);
    assert.match(r.envelope.error.message, /authority|canonical|project/i);
    assert.equal(fs.existsSync(externalDb), false);
    assert.equal(
      fs.existsSync(path.join(dir, '.ultra', '.runtime', 'state.db')),
      false,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
