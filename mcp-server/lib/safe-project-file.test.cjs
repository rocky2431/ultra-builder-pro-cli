'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-safe-project-file-'));
  fs.mkdirSync(path.join(rootDir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'evidence', 'report.json'), '{"source":"project"}\n');
  return rootDir;
}

test('stable project reads reject an ancestor swap before reading external bytes', () => {
  const { readStableProjectFile } = require('./safe-project-file.cjs');
  const rootDir = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-safe-project-outside-'));
  const evidence = path.join(rootDir, 'evidence');
  const owned = path.join(rootDir, 'evidence-owned');
  const target = path.join(fs.realpathSync(rootDir), 'evidence', 'report.json');
  const realOpen = fs.openSync;
  const realRead = fs.readFileSync;
  let swapped = false;
  let readAfterSwap = false;
  try {
    fs.writeFileSync(path.join(outside, 'report.json'), '{"source":"external"}\n');
    fs.openSync = (file, ...args) => {
      if (!swapped && typeof file === 'string' && path.resolve(file) === path.resolve(target)) {
        fs.renameSync(evidence, owned);
        fs.symlinkSync(outside, evidence, 'dir');
        swapped = true;
      }
      return realOpen(file, ...args);
    };
    fs.readFileSync = (file, ...args) => {
      if (swapped && typeof file === 'number') readAfterSwap = true;
      return realRead(file, ...args);
    };

    assert.throws(
      () => readStableProjectFile(rootDir, 'evidence/report.json'),
      (error) => error.code === 'PROJECT_FILE_UNSAFE',
    );
    assert.equal(readAfterSwap, false);
  } finally {
    fs.openSync = realOpen;
    fs.readFileSync = realRead;
    if (swapped) {
      fs.rmSync(evidence, { force: true });
      fs.renameSync(owned, evidence);
    }
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('stable project reads reject final symlinks, non-files, and project-relative escapes', () => {
  const { readStableProjectFile } = require('./safe-project-file.cjs');
  const rootDir = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-safe-project-final-'));
  try {
    fs.writeFileSync(path.join(outside, 'outside.json'), '{"source":"external"}\n');
    fs.symlinkSync(
      path.join(outside, 'outside.json'),
      path.join(rootDir, 'evidence', 'linked.json'),
    );
    fs.mkdirSync(path.join(rootDir, 'evidence', 'directory.json'));

    assert.throws(
      () => readStableProjectFile(rootDir, 'evidence/linked.json'),
      (error) => error.code === 'PROJECT_FILE_UNSAFE',
    );
    assert.throws(
      () => readStableProjectFile(rootDir, 'evidence/directory.json'),
      (error) => error.code === 'PROJECT_FILE_UNSAFE',
    );
    assert.throws(
      () => readStableProjectFile(rootDir, '../outside.json'),
      (error) => error.code === 'PROJECT_FILE_PATH_INVALID',
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('stable project reads reject same-inode mutation after the snapshot was read', () => {
  const { openStableProjectRead } = require('./safe-project-file.cjs');
  const rootDir = fixture();
  const file = path.join(rootDir, 'evidence', 'report.json');
  let reader;
  try {
    reader = openStableProjectRead(rootDir, 'evidence/report.json');
    const before = fs.lstatSync(file);

    fs.writeFileSync(file, '{"source":"mutated-in-place"}\n');

    const after = fs.lstatSync(file);
    assert.equal(String(after.dev), String(before.dev));
    assert.equal(String(after.ino), String(before.ino));
    assert.throws(
      () => reader.verify(),
      (error) => error.code === 'PROJECT_FILE_CHANGED',
    );
  } finally {
    reader?.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
