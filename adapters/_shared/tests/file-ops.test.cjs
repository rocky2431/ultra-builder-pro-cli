'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  captureAbsent,
  copyTree,
  managedMetadata,
  markManaged,
  pruneCreatedEmpty,
  removeTree,
  writeAtomic,
} = require('../file-ops.cjs');

function mk(prefix = 'ubp-shared-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('copyTree copies recursively and skips generated host artifacts', () => {
  const src = mk();
  const dst = mk();
  try {
    fs.mkdirSync(path.join(src, 'nested'));
    fs.mkdirSync(path.join(src, '__pycache__'));
    fs.writeFileSync(path.join(src, 'a.txt'), 'A');
    fs.writeFileSync(path.join(src, '.DS_Store'), 'junk');
    fs.writeFileSync(path.join(src, 'nested', 'b.txt'), 'B');
    fs.writeFileSync(path.join(src, 'nested', 'module.pyc'), 'compiled');
    fs.writeFileSync(path.join(src, '__pycache__', 'module.pyc'), 'compiled');

    const files = copyTree(src, dst);
    assert.deepEqual(files.sort(), ['a.txt', path.join('nested', 'b.txt')]);
    assert.equal(fs.readFileSync(path.join(dst, 'a.txt'), 'utf8'), 'A');
    assert.equal(fs.readFileSync(path.join(dst, 'nested', 'b.txt'), 'utf8'), 'B');
    assert.ok(!fs.existsSync(path.join(dst, '.DS_Store')));
    assert.ok(!fs.existsSync(path.join(dst, '__pycache__')));
    assert.ok(!fs.existsSync(path.join(dst, 'nested', 'module.pyc')));
  } finally {
    removeTree(src);
    removeTree(dst);
  }
});

test('writeAtomic never leaves a torn write — tmp file is renamed', () => {
  const dir = mk();
  try {
    const target = path.join(dir, 'out', 'file.txt');
    writeAtomic(target, 'hello');
    assert.equal(fs.readFileSync(target, 'utf8'), 'hello');

    const siblings = fs.readdirSync(path.dirname(target));
    assert.deepEqual(siblings, ['file.txt']);  // no .tmp-* left behind
  } finally {
    removeTree(dir);
  }
});

test('writeAtomic preserves a symlink and the target POSIX mode', () => {
  const dir = mk();
  try {
    const target = path.join(dir, 'managed', 'file.txt');
    const link = path.join(dir, 'file.txt');
    fs.mkdirSync(path.dirname(target));
    fs.writeFileSync(target, 'before', { mode: 0o640 });
    fs.symlinkSync(path.relative(dir, target), link);

    writeAtomic(link, 'after');

    assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(target, 'utf8'), 'after');
    assert.equal(fs.statSync(target).mode & 0o777, 0o640);
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ['file.txt']);
  } finally {
    removeTree(dir);
  }
});

test('removeTree refuses to wipe filesystem root without allowRoot', () => {
  assert.throws(
    () => removeTree('/', { allowRoot: false }),
    /refusing to remove filesystem root/,
  );
});

test('managed metadata survives marker updates while explicit fields are replaced', () => {
  const dir = mk();
  try {
    markManaged(dir, { adapter: 'first', cleanup_absent: ['skills'] });
    const installedAt = managedMetadata(dir).installed_at;
    markManaged(dir, { adapter: 'second', registry_created: true });

    assert.deepEqual(managedMetadata(dir), {
      source: 'ubp',
      installed_at: installedAt,
      adapter: 'second',
      cleanup_absent: ['skills'],
      registry_created: true,
    });
  } finally {
    removeTree(dir);
  }
});

test('owned cleanup removes only paths absent before install and still empty afterward', () => {
  const root = mk();
  try {
    fs.mkdirSync(path.join(root, 'preexisting'));
    const absent = captureAbsent(root, [
      '.',
      'preexisting',
      'created',
      path.join('created', 'nested'),
      'empty.txt',
      'kept.txt',
    ]);
    assert.deepEqual(absent, [
      'created',
      path.join('created', 'nested'),
      'empty.txt',
      'kept.txt',
    ]);

    fs.mkdirSync(path.join(root, 'created', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'empty.txt'), '');
    fs.writeFileSync(path.join(root, 'kept.txt'), 'owner data');
    const removed = pruneCreatedEmpty(root, absent);

    assert.deepEqual(new Set(removed), new Set([
      path.join('created', 'nested'),
      'created',
      'empty.txt',
    ]));
    assert.equal(fs.existsSync(path.join(root, 'preexisting')), true);
    assert.equal(fs.readFileSync(path.join(root, 'kept.txt'), 'utf8'), 'owner data');
  } finally {
    removeTree(root);
  }
});

test('owned cleanup rejects non-canonical and escaping paths', () => {
  const root = mk();
  try {
    assert.throws(() => captureAbsent(root, ['child/../']), /escapes its root/);
    assert.throws(() => pruneCreatedEmpty(root, ['../outside']), /escapes its root/);
  } finally {
    removeTree(root);
  }
});
