'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  SENTINEL_VERSION,
  readJsonSafe,
  withSentinelBlock,
  removeSentinelBlock,
  hasSentinelBlock,
  mergeArrayField,
} = require('../settings-merge.cjs');

test('withSentinelBlock writes under the sentinel key only; user config untouched', () => {
  const existing = { user_prop: 'keep me', hooks: [{ name: 'user-hook' }] };
  const out = withSentinelBlock(existing, 'ultra_builder_pro', {
    mcp: { ubp: { command: 'node' } },
  });

  assert.equal(out.user_prop, 'keep me');
  assert.deepEqual(out.hooks, [{ name: 'user-hook' }]);
  assert.equal(out.ultra_builder_pro.__sentinel, SENTINEL_VERSION);
  assert.equal(out.ultra_builder_pro.__generated_by, 'ultra-builder-pro-cli');
  assert.deepEqual(out.ultra_builder_pro.mcp.ubp, { command: 'node' });
});

test('removeSentinelBlock leaves unrelated keys intact; noop if absent', () => {
  const with_ = { a: 1, mine: { __sentinel: 1, x: 2 } };
  const stripped = removeSentinelBlock(with_, 'mine');
  assert.deepEqual(stripped, { a: 1 });
  assert.ok(!hasSentinelBlock(stripped, 'mine'));

  const noop = removeSentinelBlock({ a: 1 }, 'mine');
  assert.deepEqual(noop, { a: 1 });
});

test('mergeArrayField dedupes; readJsonSafe handles missing/empty/malformed', () => {
  const existing = { hooks: [{ name: 'user' }, { name: 'ubp-one' }] };
  const out = mergeArrayField(existing, 'hooks', [
    { name: 'ubp-one' }, // dup — skipped
    { name: 'ubp-two' },
  ]);
  assert.deepEqual(out.hooks, [
    { name: 'user' },
    { name: 'ubp-one' },
    { name: 'ubp-two' },
  ]);

  // readJsonSafe: missing file → empty object
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-merge-'));
  try {
    assert.deepEqual(readJsonSafe(path.join(tmp, 'none.json')), {});

    const p = path.join(tmp, 'existing.json');
    fs.writeFileSync(p, '{"a":1}');
    assert.deepEqual(readJsonSafe(p), { a: 1 });

    // empty file treated as empty object
    fs.writeFileSync(p, '   \n  ');
    assert.deepEqual(readJsonSafe(p), {});

    // malformed → throws
    fs.writeFileSync(p, '{not json');
    assert.throws(() => readJsonSafe(p), /cannot parse/);

    // P2 #7 / D45: rescue mode backs up corrupt file and returns {} instead
    // of throwing — lets `install` finish even if the user's settings.json
    // is syntactically broken.
    fs.writeFileSync(p, '{still not json');
    const rescued = readJsonSafe(p, { rescue: true });
    assert.deepEqual(rescued, {});
    const backups = fs.readdirSync(tmp).filter((f) => f.startsWith('existing.json.bak-'));
    assert.ok(backups.length > 0, `expected a .bak-* file in ${tmp}, saw ${fs.readdirSync(tmp).join(',')}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // withSentinelBlock rejects bad key
  assert.throws(() => withSentinelBlock({}, '', {}), /non-empty string/);
});
