'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');

const journal = require('./archive-journal.cjs');

function archiveInput(rootDir, changeId = 'change-a') {
  const source = path.join(rootDir, '.ultra', 'changes', 'active', changeId);
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'intent.md'), `# ${changeId}\n`);
  const reconciliationPath = `.ultra/changes/active/${changeId}/baseline-reconciliation.json`;
  const reconciliationManifest = {
    $schema: 'ultra-baseline-reconciliation-v1', change_id: changeId, baseline_id: null,
    baseline_updates: [], semantic_changes: [], resolved_gap_ids: [], resolved_unknowns: [],
    verification: [{ name: 'read-back', command: 'ubp status', status: 'pass', evidence: 'Verified.' }],
    semantic_no_change_reason: 'No baseline content changed.',
  };
  fs.writeFileSync(
    path.join(rootDir, reconciliationPath), `${JSON.stringify(reconciliationManifest)}\n`,
  );
  return {
    rootDir,
    change: { id: changeId, title: changeId, artifact_root: `.ultra/changes/active/${changeId}` },
    summary: `Archive ${changeId}.`,
    baselineUpdates: [],
    noBaselineChangeReason: 'No baseline content changed.',
    reconciliationPath,
    reconciliationDigest: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(rootDir, reconciliationPath))).digest('hex'),
    reconciliationManifest,
    now: new Date('2026-07-18T00:00:00.000Z'),
  };
}

test('archive journal restores the exact active directory when finalization cannot run', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-journal-'));
  const input = archiveInput(rootDir);
  const source = path.join(rootDir, input.change.artifact_root);
  try {
    const prepared = journal.prepareArchiveMove(input);
    assert.equal(fs.existsSync(prepared.source), false);
    assert.equal(journal.listArchiveIntents(rootDir).length, 1);

    journal.rollbackArchiveIntent(rootDir, prepared.intent);
    assert.equal(fs.existsSync(source), true);
    assert.equal(fs.existsSync(path.join(source, 'intent.md')), true);
    assert.equal(fs.existsSync(path.join(source, 'archive-summary.md')), false);
    assert.equal(journal.listArchiveIntents(rootDir).length, 0);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('archive preparation rejects symlinked active or archive roots without touching external files', () => {
  for (const unsafeRoot of ['active', 'archive']) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `ubp-archive-${unsafeRoot}-`));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-outside-'));
    let inputRoot = null;
    try {
      const changesRoot = path.join(rootDir, '.ultra', 'changes');
      fs.mkdirSync(changesRoot, { recursive: true });
      fs.symlinkSync(outside, path.join(changesRoot, unsafeRoot), 'dir');
      if (unsafeRoot === 'archive') {
        const input = archiveInput(rootDir);
        assert.throws(
          () => journal.prepareArchiveMove(input),
          (error) => error.code === 'ARCHIVE_PATH_UNSAFE',
        );
      } else {
        fs.mkdirSync(path.join(outside, 'change-a'), { recursive: true });
        fs.writeFileSync(path.join(outside, 'change-a', 'intent.md'), '# External\n');
        inputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-input-'));
        const input = {
          ...archiveInput(inputRoot),
          rootDir,
        };
        assert.throws(
          () => journal.prepareArchiveMove(input),
          (error) => error.code === 'ARCHIVE_PATH_UNSAFE',
        );
      }
      assert.deepEqual(fs.readdirSync(outside).sort(), unsafeRoot === 'active' ? ['change-a'] : []);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
      if (inputRoot) fs.rmSync(inputRoot, { recursive: true, force: true });
    }
  }
});

test('archive intent publication stays on its pinned source when the canonical parent swaps at open', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-swap-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-swap-outside-'));
  const input = archiveInput(rootDir);
  const active = path.join(rootDir, '.ultra', 'changes', 'active');
  const owned = path.join(rootDir, '.ultra', 'changes', 'active-owned');
  const realRename = fs.renameSync;
  const realSpawnSync = childProcess.spawnSync;
  let swapped = false;
  try {
    fs.mkdirSync(path.join(outside, input.change.id), { recursive: true });
    fs.writeFileSync(path.join(outside, input.change.id, 'canary'), 'external\n');
    childProcess.spawnSync = (command, args, options) => {
      const operation = JSON.parse(String(options.input || '{}')).operation;
      if (!swapped && operation === 'write_atomic') {
        realRename(active, owned);
        fs.symlinkSync(outside, active, 'dir');
        swapped = true;
      }
      return realSpawnSync(command, args, options);
    };
    assert.throws(
      () => journal.prepareArchiveMove(input),
      (error) => error.code === 'ARCHIVE_PATH_UNSAFE',
    );
    assert.deepEqual(
      fs.readdirSync(path.join(outside, input.change.id)).sort(),
      ['canary'],
    );
    assert.equal(
      fs.readFileSync(path.join(owned, input.change.id, 'intent.md'), 'utf8'),
      `# ${input.change.id}\n`,
    );
  } finally {
    childProcess.spawnSync = realSpawnSync;
    if (swapped) {
      fs.rmSync(active, { force: true });
      realRename(owned, active);
    }
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('archive transition refuses a canonical archive swap before renameat and keeps source recoverable', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-transition-swap-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-transition-outside-'));
  const input = archiveInput(rootDir);
  const archive = path.join(rootDir, '.ultra', 'changes', 'archive');
  const owned = path.join(rootDir, '.ultra', 'changes', 'archive-owned');
  const source = path.join(rootDir, input.change.artifact_root);
  const realRename = fs.renameSync;
  const realSpawnSync = childProcess.spawnSync;
  let swapped = false;
  try {
    childProcess.spawnSync = (command, args, options) => {
      const operation = JSON.parse(String(options.input || '{}')).operation;
      if (!swapped && operation === 'rename_dir') {
        realRename(archive, owned);
        fs.symlinkSync(outside, archive, 'dir');
        swapped = true;
      }
      return realSpawnSync(command, args, options);
    };

    assert.throws(
      () => journal.prepareArchiveMove(input),
      (error) => error.code === 'ARCHIVE_PATH_UNSAFE',
    );
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.equal(fs.readFileSync(path.join(source, 'intent.md'), 'utf8'), '# change-a\n');
    assert.ok(fs.existsSync(path.join(source, journal.INTENT_FILE)));
  } finally {
    childProcess.spawnSync = realSpawnSync;
    if (swapped) {
      fs.rmSync(archive, { force: true });
      realRename(owned, archive);
    }
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('archive mutation workers inherit only the pinned directories required by each operation', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-fds-'));
  const input = archiveInput(rootDir);
  const realSpawnSync = childProcess.spawnSync;
  const seen = [];
  try {
    childProcess.spawnSync = (command, args, options) => {
      const request = JSON.parse(String(options.input || '{}'));
      seen.push({ operation: request.operation, stdio: [...options.stdio] });
      return realSpawnSync(command, args, options);
    };
    const prepared = journal.prepareArchiveMove(input);
    journal.rollbackArchiveIntent(rootDir, prepared.intent);

    assert.ok(seen.some((entry) => entry.operation === 'mkdir_dir'));
    assert.ok(seen.some((entry) => entry.operation === 'write_atomic'));
    assert.ok(seen.some((entry) => entry.operation === 'rename_dir'));
    for (const entry of seen) {
      assert.deepEqual(entry.stdio.slice(0, 3), ['pipe', 'pipe', 'pipe']);
      assert.ok(entry.stdio.slice(3).every(Number.isInteger));
      assert.equal(
        entry.stdio.length,
        entry.operation === 'rename_dir' ? 6 : 4,
        `${entry.operation} inherited an unexpected descriptor`,
      );
    }
  } finally {
    childProcess.spawnSync = realSpawnSync;
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('archive mutation fails closed with a typed prerequisite error and no pathname fallback', () => {
  for (const unavailable of [
    {
      error: Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' }),
      status: null,
      stderr: '',
      signal: null,
    },
    {
      error: undefined,
      status: 3,
      stderr: JSON.stringify({
        ok: false,
        code: 'ARCHIVE_RUNTIME_UNAVAILABLE',
        message: 'Python dir_fd operations are unavailable',
      }),
      signal: null,
    },
  ]) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-prerequisite-'));
    const input = archiveInput(rootDir);
    const source = path.join(rootDir, input.change.artifact_root);
    const realSpawnSync = childProcess.spawnSync;
    try {
      childProcess.spawnSync = () => unavailable;
      assert.throws(
        () => journal.prepareArchiveMove(input),
        (error) => error.code === 'ARCHIVE_RUNTIME_UNAVAILABLE',
      );
      assert.equal(fs.existsSync(path.join(source, 'intent.md')), true);
      assert.equal(fs.existsSync(path.join(source, journal.INTENT_FILE)), false);
    } finally {
      childProcess.spawnSync = realSpawnSync;
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

test('archive mutation worker rejects non-basename protocol fields before touching a directory', () => {
  const worker = path.join(__dirname, 'archive-mutation-worker.py');
  const result = childProcess.spawnSync('python3', [worker], {
    input: JSON.stringify({
      operation: 'mkdir_dir',
      directory_fd: 3,
      directory_identity: { dev: '0', ino: '0', mode: '0' },
      name: '../outside',
    }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).code, 'ARCHIVE_MUTATION_INVALID');
});

test('archive recovery scanner surfaces symlinked change residues without traversing them', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-scan-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-scan-outside-'));
  try {
    const active = path.join(rootDir, '.ultra', 'changes', 'active');
    fs.mkdirSync(active, { recursive: true });
    fs.writeFileSync(path.join(outside, journal.INTENT_FILE), '{"external":true}\n');
    fs.symlinkSync(outside, path.join(active, 'unsafe-change'), 'dir');

    const records = journal.listArchiveIntents(rootDir);

    assert.equal(records.length, 1);
    assert.equal(records[0].error.code, 'ARCHIVE_PATH_UNSAFE');
    assert.match(records[0].file, /unsafe-change/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('archive cleanup refuses an archive-root swap and never deletes an external intent', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-cleanup-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-cleanup-outside-'));
  const prepared = journal.prepareArchiveMove(archiveInput(rootDir));
  const archiveRoot = path.join(rootDir, '.ultra', 'changes', 'archive');
  const owned = path.join(rootDir, '.ultra', 'changes', 'archive-owned');
  try {
    fs.mkdirSync(path.join(outside, path.basename(prepared.destination)), { recursive: true });
    fs.writeFileSync(
      path.join(outside, path.basename(prepared.destination), journal.INTENT_FILE),
      '{"external":true}\n',
    );
    fs.renameSync(archiveRoot, owned);
    fs.symlinkSync(outside, archiveRoot, 'dir');

    assert.throws(
      () => journal.completeArchiveIntent(rootDir, prepared.intent),
      (error) => error.code === 'ARCHIVE_PATH_UNSAFE',
    );
    assert.equal(
      fs.readFileSync(
        path.join(outside, path.basename(prepared.destination), journal.INTENT_FILE),
        'utf8',
      ),
      '{"external":true}\n',
    );
  } finally {
    if (fs.lstatSync(archiveRoot).isSymbolicLink()) {
      fs.rmSync(archiveRoot);
      fs.renameSync(owned, archiveRoot);
    }
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
