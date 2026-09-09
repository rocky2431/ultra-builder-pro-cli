'use strict';

// 库存：追加式 JSONL，一行一条笔记。见 docs/decisions/2026-08-20-append-only-jsonl.md。
const fs = require('node:fs');

function readAll(storePath) {
  if (!fs.existsSync(storePath)) return [];
  return fs
    .readFileSync(storePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

// 追加一条笔记并返回带 id 的记录；不改写已有行。
function appendEntry(storePath, entry) {
  const record = { id: nextId(readAll(storePath)), ...entry };
  fs.appendFileSync(storePath, `${JSON.stringify(record)}\n`);
  return record;
}

function nextId(entries) {
  return `entry-${String(entries.length + 1).padStart(4, '0')}`;
}

function listEntries(storePath) {
  return readAll(storePath);
}

function searchEntries(storePath, keyword) {
  return readAll(storePath).filter(
    (entry) => entry.text.includes(keyword) || entry.book.includes(keyword),
  );
}

module.exports = { appendEntry, listEntries, searchEntries };
