'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../mcp-server/lib/state-db.cjs');

const CLI = path.join(__dirname, 'cli.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-system-cli-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  db.prepare(
    `INSERT INTO baselines
     (id, project_name, mode, status, approved_by, approval_note, converged_at)
     VALUES ('test-baseline', 'fixture', 'greenfield', 'ready', 'test', 'accepted fixture', ?)`,
  ).run(new Date().toISOString());
  closeStateDb(db);
  return rootDir;
}

function invoke(rootDir, args) {
  return spawnSync(process.execPath, [CLI, 'system', ...args], {
    cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('system doctor provides a read-only JSON health envelope', () => {
  const rootDir = fixture();
  try {
    const result = invoke(rootDir, ['doctor']);
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.status, 'healthy');
    assert.equal(envelope.data.repair_performed, false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('system doctor --repair creates a backup before recovery', () => {
  const rootDir = fixture();
  try {
    const result = invoke(rootDir, ['doctor', '--repair']);
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.repair_performed, true);
    assert.ok(fs.existsSync(envelope.data.backup_path));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('system doctor --repair migrates an older schema only after preserving a pre-migration backup', () => {
  const rootDir = fixture();
  try {
    const dbPath = path.join(rootDir, '.ultra', 'state.db');
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    db.prepare("DELETE FROM schema_version WHERE version = '12.0'").run();
    db.close();

    const result = invoke(rootDir, ['doctor', '--repair']);
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.schema_version, '12.0');
    assert.ok(fs.existsSync(envelope.data.schema_migration_backup_path));
    assert.ok(fs.existsSync(envelope.data.backup_path));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('system doctor reports a corrupt database as structured recovery guidance', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-system-corrupt-'));
  try {
    fs.mkdirSync(path.join(rootDir, '.ultra'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, '.ultra', 'state.db'), 'not a sqlite database');
    const result = invoke(rootDir, ['doctor']);
    assert.equal(result.status, 2);
    const envelope = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'STATE_DB_CORRUPT');
    assert.match(envelope.error.message, /restore.*backup|rebaseline/i);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('system restore replaces only a corrupt state database from a verified managed backup', () => {
  const rootDir = fixture();
  try {
    const dbPath = path.join(rootDir, '.ultra', 'state.db');
    const backupsDir = path.join(rootDir, '.ultra', 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const sourceBackup = path.join(backupsDir, 'verified.db');
    fs.copyFileSync(dbPath, sourceBackup);
    fs.writeFileSync(dbPath, 'not a sqlite database');

    const refused = invoke(rootDir, ['restore', '--backup', sourceBackup]);
    assert.equal(refused.status, 1);
    assert.equal(JSON.parse(refused.stdout.trim()).error.code, 'CONFIRMATION_REQUIRED');
    assert.equal(fs.readFileSync(dbPath, 'utf8'), 'not a sqlite database');

    const restored = invoke(rootDir, [
      'restore', '--backup', sourceBackup,
      '--confirm', 'REPLACE_CORRUPT_ULTRA_STATE',
    ]);
    assert.equal(restored.status, 0, restored.stderr);
    const envelope = JSON.parse(restored.stdout.trim());
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.schema_version, '12.0');
    assert.equal(envelope.data.source_backup, fs.realpathSync(sourceBackup));
    assert.ok(fs.existsSync(envelope.data.quarantined_state_path));
    assert.equal(
      fs.readFileSync(envelope.data.quarantined_state_path, 'utf8'),
      'not a sqlite database',
    );
    const restoredDb = require('better-sqlite3')(dbPath, { readonly: true });
    try {
      assert.equal(restoredDb.prepare('SELECT COUNT(*) AS count FROM baselines').get().count, 1);
    } finally { restoredDb.close(); }
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('system rebaseline preserves corrupt authority and legacy projection before starting brownfield adoption', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-system-rebaseline-'));
  try {
    fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, '.ultra', 'tasks', 'contexts'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'src', 'index.js'), 'module.exports = true;\n');
    fs.writeFileSync(path.join(rootDir, '.ultra', 'state.db'), 'broken authority');
    const tasksPath = path.join(rootDir, '.ultra', 'tasks', 'tasks.json');
    fs.writeFileSync(tasksPath, `${JSON.stringify({
      schema_version: '4.5', source: '.ultra/state.db',
      tasks: [{ id: 'legacy-task', title: 'Preserved task', type: 'feature', priority: 'P1', status: 'pending' }],
    }, null, 2)}\n`);
    fs.writeFileSync(
      path.join(rootDir, '.ultra', 'tasks', 'contexts', 'legacy-task.md'),
      '# Preserved task context\n',
    );

    const result = invoke(rootDir, [
      'rebaseline', '--project-name', 'legacy-app',
      '--confirm', 'REBASELINE_CORRUPT_ULTRA_STATE',
    ]);
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout.trim());
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.baseline.mode, 'brownfield');
    assert.equal(envelope.data.baseline.status, 'adopting');
    assert.ok(fs.existsSync(envelope.data.quarantined_state_path));
    assert.ok(fs.existsSync(envelope.data.legacy_projection_path));
    assert.equal(
      JSON.parse(fs.readFileSync(envelope.data.legacy_projection_path, 'utf8')).tasks[0].id,
      'legacy-task',
    );
    assert.ok(fs.existsSync(path.join(
      envelope.data.recovery_backup_dir, 'tasks', 'contexts', 'legacy-task.md',
    )));
    assert.equal(
      fs.existsSync(path.join(rootDir, '.ultra', 'tasks', 'contexts', 'legacy-task.md')),
      false,
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(tasksPath, 'utf8')).tasks, []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('system restore rolls back the corrupt database and sidecars when replacement initialization fails', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-system-restore-rollback-'));
  try {
    const ultraDir = path.join(rootDir, '.ultra');
    const backupsDir = path.join(ultraDir, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const statePath = path.join(ultraDir, 'state.db');
    const originals = {
      '': Buffer.from('broken authority'),
      '-wal': Buffer.from('broken wal'),
      '-shm': Buffer.from('broken shm'),
    };
    for (const [suffix, content] of Object.entries(originals)) {
      fs.writeFileSync(`${statePath}${suffix}`, content);
    }

    const incompatibleBackup = path.join(backupsDir, 'structurally-incompatible.db');
    const backupDb = require('better-sqlite3')(incompatibleBackup);
    backupDb.exec("CREATE TABLE schema_version (version TEXT NOT NULL); INSERT INTO schema_version VALUES ('11.0');");
    backupDb.close();

    const result = invoke(rootDir, [
      'restore', '--backup', incompatibleBackup,
      '--confirm', 'REPLACE_CORRUPT_ULTRA_STATE',
    ]);
    assert.notEqual(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout.trim());
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'STATE_RESTORE_FAILED');
    for (const [suffix, content] of Object.entries(originals)) {
      assert.deepEqual(fs.readFileSync(`${statePath}${suffix}`), content);
    }
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('system rebaseline rolls back authority, sidecars, and the full task projection when adoption fails', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-system-rebaseline-rollback-'));
  try {
    const ultraDir = path.join(rootDir, '.ultra');
    const tasksDir = path.join(ultraDir, 'tasks');
    fs.mkdirSync(path.join(tasksDir, 'contexts'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'src', 'index.js'), 'module.exports = true;\n');
    const statePath = path.join(ultraDir, 'state.db');
    const originals = {
      '': Buffer.from('broken authority'),
      '-wal': Buffer.from('broken wal'),
      '-shm': Buffer.from('broken shm'),
    };
    for (const [suffix, content] of Object.entries(originals)) {
      fs.writeFileSync(`${statePath}${suffix}`, content);
    }
    const tasksPath = path.join(tasksDir, 'tasks.json');
    const contextPath = path.join(tasksDir, 'contexts', 'legacy.md');
    const tasksContent = Buffer.from('{"schema_version":"4.5","source":".ultra/state.db","tasks":[]}\n');
    const contextContent = Buffer.from('# Legacy context\n');
    fs.writeFileSync(tasksPath, tasksContent);
    fs.writeFileSync(contextPath, contextContent);

    const result = invoke(rootDir, [
      'rebaseline', '--project-name', 'legacy-app', '--scope', 'missing-workspace',
      '--confirm', 'REBASELINE_CORRUPT_ULTRA_STATE',
    ]);
    assert.notEqual(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout.trim());
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'IO_ERROR');
    for (const [suffix, content] of Object.entries(originals)) {
      assert.deepEqual(fs.readFileSync(`${statePath}${suffix}`), content);
    }
    assert.deepEqual(fs.readFileSync(tasksPath), tasksContent);
    assert.deepEqual(fs.readFileSync(contextPath), contextContent);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('system restore rejects backups outside the managed project backup directory', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-system-external-backup-'));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-external-backup-'));
  try {
    fs.mkdirSync(path.join(rootDir, '.ultra'), { recursive: true });
    fs.mkdirSync(path.join(rootDir, '.ultra', 'backups'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, '.ultra', 'state.db'), 'broken authority');
    const external = path.join(externalDir, 'state.db');
    fs.writeFileSync(external, 'not trusted');
    const result = invoke(rootDir, [
      'restore', '--backup', external,
      '--confirm', 'REPLACE_CORRUPT_ULTRA_STATE',
    ]);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout.trim()).error.code, 'BACKUP_OUTSIDE_MANAGED_ROOT');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(externalDir, { recursive: true, force: true });
  }
});

test('system corrupt-state recovery commands refuse to replace readable authority', () => {
  const rootDir = fixture();
  try {
    const backupsDir = path.join(rootDir, '.ultra', 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const backup = path.join(backupsDir, 'healthy.db');
    fs.copyFileSync(path.join(rootDir, '.ultra', 'state.db'), backup);

    const restore = invoke(rootDir, [
      'restore', '--backup', backup,
      '--confirm', 'REPLACE_CORRUPT_ULTRA_STATE',
    ]);
    assert.equal(restore.status, 2);
    assert.equal(JSON.parse(restore.stdout.trim()).error.code, 'STATE_DB_NOT_CORRUPT');

    const rebaseline = invoke(rootDir, [
      'rebaseline', '--project-name', 'fixture',
      '--confirm', 'REBASELINE_CORRUPT_ULTRA_STATE',
    ]);
    assert.equal(rebaseline.status, 2);
    assert.equal(JSON.parse(rebaseline.stdout.trim()).error.code, 'STATE_DB_NOT_CORRUPT');

    const db = require('better-sqlite3')(path.join(rootDir, '.ultra', 'state.db'), { readonly: true });
    try {
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM baselines').get().count, 1);
    } finally { db.close(); }
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
