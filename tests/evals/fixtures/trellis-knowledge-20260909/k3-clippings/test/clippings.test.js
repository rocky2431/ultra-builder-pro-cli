'use strict';

// 库存的基线行为：id 分配、只追加不改写、搜索范围。后续改动不得破坏这些断言。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { appendEntry, listEntries, searchEntries } = require('../src/store.js');

function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mozhai-store-'));
  return path.join(dir, 'entries.jsonl');
}

test('append assigns sequential store ids and round-trips the fields', () => {
  const store = freshStore();
  const first = appendEntry(store, {
    book: '《夜晚的潜水艇》',
    author: '陈春成',
    time: '2026-07-21 22:14:09',
    text: '夜里翻书，像是在水下走。',
  });
  const second = appendEntry(store, {
    book: '《俗世奇人》',
    author: '冯骥才',
    time: '2026-07-25 09:02:41',
    text: '刷子李的规矩比手艺还硬。',
  });
  assert.equal(first.id, 'entry-0001');
  assert.equal(second.id, 'entry-0002');
  assert.deepEqual(listEntries(store), [first, second]);
});

test('the store is append-only: existing lines are never rewritten', () => {
  const store = freshStore();
  appendEntry(store, {
    book: '《夜晚的潜水艇》',
    author: '陈春成',
    time: '2026-07-21 22:14:09',
    text: '夜里翻书，像是在水下走。',
  });
  const before = fs.readFileSync(store, 'utf8');
  appendEntry(store, {
    book: '《俗世奇人》',
    author: '冯骥才',
    time: '2026-07-25 09:02:41',
    text: '刷子李的规矩比手艺还硬。',
  });
  const after = fs.readFileSync(store, 'utf8');
  assert.ok(after.startsWith(before), 'the second append must not touch the first line');
  assert.equal(listEntries(store).length, 2);
});

test('search matches note text and book title only', () => {
  const store = freshStore();
  appendEntry(store, {
    book: '《夜晚的潜水艇》',
    author: '陈春成',
    time: '2026-07-21 22:14:09',
    text: '夜里翻书，像是在水下走。',
  });
  appendEntry(store, {
    book: '《俗世奇人》',
    author: '冯骥才',
    time: '2026-07-25 09:02:41',
    text: '刷子李的规矩比手艺还硬。',
  });
  assert.equal(searchEntries(store, '水下').length, 1);
  assert.equal(searchEntries(store, '俗世奇人').length, 1);
  assert.equal(searchEntries(store, '不存在的词').length, 0);
});
