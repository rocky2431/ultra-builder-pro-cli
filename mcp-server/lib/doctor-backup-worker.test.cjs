'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');

const { execute } = require('./doctor-backup-worker.cjs');

function fileIdentity(file) {
  const stat = fs.lstatSync(file, { bigint: true });
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

test('backup writes only to its pinned staging file when the staging name becomes a symlink', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-doctor-worker-race-'));
  const backupDir = path.join(rootDir, 'backups');
  const sourcePath = path.join(rootDir, 'state.db');
  const externalPath = path.join(rootDir, 'must-not-exist.db');
  const previousCwd = process.cwd();
  fs.mkdirSync(backupDir);
  const source = new Database(sourcePath);
  source.exec('CREATE TABLE proof (value TEXT); INSERT INTO proof VALUES (\'canonical\')');
  source.close();

  try {
    process.chdir(backupDir);
    await assert.rejects(
      execute({
        directory_identity: fileIdentity(backupDir),
        source_path: sourcePath,
        source_identity: fileIdentity(sourcePath),
        output_name: 'state-race-00000000-0000-4000-8000-000000000000.db',
      }, {
        beforeSnapshotWrite({ tempName }) {
          fs.unlinkSync(tempName);
          fs.symlinkSync(externalPath, tempName);
        },
      }),
      (error) => error.code === 'BACKUP_OUTPUT_UNSAFE',
    );
    assert.equal(
      fs.existsSync(externalPath),
      false,
      'a replaced staging pathname must never become a SQLite write target',
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
