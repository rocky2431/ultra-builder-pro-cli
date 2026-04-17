'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { copyTree, writeAtomic, removeTree } = require('../file-ops.cjs');

function mk(prefix = 'ubp-shared-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('copyTree copies recursively and skips .DS_Store', () => {
  const src = mk();
  const dst = mk();
  try {
    fs.mkdirSync(path.join(src, 'nested'));
    fs.writeFileSync(path.join(src, 'a.txt'), 'A');
    fs.writeFileSync(path.join(src, '.DS_Store'), 'junk');
    fs.writeFileSync(path.join(src, 'nested', 'b.txt'), 'B');

    const files = copyTree(src, dst);
    assert.deepEqual(files.sort(), ['a.txt', path.join('nested', 'b.txt')]);
    assert.equal(fs.readFileSync(path.join(dst, 'a.txt'), 'utf8'), 'A');
    assert.equal(fs.readFileSync(path.join(dst, 'nested', 'b.txt'), 'utf8'), 'B');
    assert.ok(!fs.existsSync(path.join(dst, '.DS_Store')));
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

test('removeTree refuses to wipe filesystem root without allowRoot', () => {
  assert.throws(
    () => removeTree('/', { allowRoot: false }),
    /refusing to remove filesystem root/,
  );
});
