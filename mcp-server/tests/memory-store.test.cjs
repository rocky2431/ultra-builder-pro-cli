'use strict';

// Phase 7.1 — Memory store:
//   • retain: INSERT into memory_entries, FTS5 trigger auto-syncs content.
//   • recall: FTS5 MATCH on content + optional task_id/tag filters, ranked.
//   • reflect: GROUP BY kind summary + recent N entries (no LLM).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const memory = require('../lib/memory-store.cjs');

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mem-'));
  const file = path.join(dir, 'state.db');
  const init = initStateDb(file);
  return { dir, db: init.db };
}

function teardown(dir, db) {
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

test('retain: INSERT returns id + ts', () => {
  const { dir, db } = freshDb();
  try {
    const out = memory.retain(db, {
      task_id: 't-1',
      session_id: 'sess-1',
      tag: 'feat-auth',
      kind: 'decision',
      content: 'Chose JWT over cookies for session token',
      source: 'session_closed',
    });
    assert.ok(out.id > 0);
    assert.ok(out.ts);
    const row = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get(out.id);
    assert.equal(row.task_id, 't-1');
    assert.equal(row.kind, 'decision');
    assert.match(row.content, /JWT/);
  } finally { teardown(dir, db); }
});

test('retain: kind CHECK constraint rejects invalid kind', () => {
  const { dir, db } = freshDb();
  try {
    assert.throws(() => memory.retain(db, {
      kind: 'bogus', content: 'x',
    }), /CHECK|constraint|kind/);
  } finally { teardown(dir, db); }
});

test('retain: missing required fields throws', () => {
  const { dir, db } = freshDb();
  try {
    assert.throws(() => memory.retain(db, { kind: 'fact' }), /content/);
    assert.throws(() => memory.retain(db, { content: 'x' }), /kind/);
  } finally { teardown(dir, db); }
});

test('recall: FTS5 keyword match finds relevant entries', () => {
  const { dir, db } = freshDb();
  try {
    memory.retain(db, { kind: 'decision', content: 'Use PostgreSQL with JSONB columns for user preferences' });
    memory.retain(db, { kind: 'decision', content: 'Use Redis for session cache layer' });
    memory.retain(db, { kind: 'fact',     content: 'API rate limit is 100 req/min per user' });

    const results = memory.recall(db, { query: 'session', limit: 5 });
    assert.ok(results.length >= 1);
    assert.ok(results.some((r) => /Redis/.test(r.content)));
  } finally { teardown(dir, db); }
});

test('recall: filter by task_id + tag narrows matches', () => {
  const { dir, db } = freshDb();
  try {
    memory.retain(db, { task_id: 't-a', tag: 'auth', kind: 'decision', content: 'Chose bcrypt for hashing' });
    memory.retain(db, { task_id: 't-b', tag: 'billing', kind: 'decision', content: 'Chose Stripe for payments' });

    const auth = memory.recall(db, { query: 'chose', tag: 'auth' });
    assert.equal(auth.length, 1);
    assert.match(auth[0].content, /bcrypt/);

    const taskA = memory.recall(db, { query: 'chose', task_id: 't-a' });
    assert.equal(taskA.length, 1);
    assert.match(taskA[0].content, /bcrypt/);
  } finally { teardown(dir, db); }
});

test('recall: empty query returns recent entries (fallback)', () => {
  const { dir, db } = freshDb();
  try {
    memory.retain(db, { kind: 'note', content: 'first' });
    memory.retain(db, { kind: 'note', content: 'second' });
    memory.retain(db, { kind: 'note', content: 'third' });

    const results = memory.recall(db, { query: '', limit: 2 });
    assert.equal(results.length, 2);
    // Most recent first
    assert.match(results[0].content, /third/);
  } finally { teardown(dir, db); }
});

test('recall: no matches → empty array', () => {
  const { dir, db } = freshDb();
  try {
    memory.retain(db, { kind: 'note', content: 'apple pie recipe' });
    const results = memory.recall(db, { query: 'quantum computing' });
    assert.deepEqual(results, []);
  } finally { teardown(dir, db); }
});

test('recall: FTS5 respects ranking (relevance)', () => {
  const { dir, db } = freshDb();
  try {
    memory.retain(db, { kind: 'fact', content: 'auth auth auth token' }); // heavy hit
    memory.retain(db, { kind: 'fact', content: 'mention auth once' });     // light hit

    const results = memory.recall(db, { query: 'auth', limit: 5 });
    assert.ok(results.length === 2);
    assert.match(results[0].content, /auth auth auth/, 'heavier hit should rank first');
  } finally { teardown(dir, db); }
});

test('reflect: groups by kind + returns recent N', () => {
  const { dir, db } = freshDb();
  try {
    memory.retain(db, { kind: 'decision', content: 'd1' });
    memory.retain(db, { kind: 'decision', content: 'd2' });
    memory.retain(db, { kind: 'error_fix', content: 'e1' });
    memory.retain(db, { kind: 'fact', content: 'f1' });

    const r = memory.reflect(db, { limit: 10 });
    assert.ok(r.counts);
    assert.equal(r.counts.decision, 2);
    assert.equal(r.counts.error_fix, 1);
    assert.equal(r.counts.fact, 1);
    assert.ok(Array.isArray(r.recent));
    assert.ok(r.recent.length >= 3);
  } finally { teardown(dir, db); }
});

test('reflect: filter by tag', () => {
  const { dir, db } = freshDb();
  try {
    memory.retain(db, { tag: 'auth', kind: 'decision', content: 'a1' });
    memory.retain(db, { tag: 'auth', kind: 'decision', content: 'a2' });
    memory.retain(db, { tag: 'billing', kind: 'decision', content: 'b1' });

    const r = memory.reflect(db, { tag: 'auth' });
    assert.equal(r.counts.decision, 2);
    assert.equal(r.recent.every((e) => e.tag === 'auth'), true);
  } finally { teardown(dir, db); }
});

test('delete: FTS5 stays in sync (deleted rows disappear from recall)', () => {
  const { dir, db } = freshDb();
  try {
    const { id } = memory.retain(db, { kind: 'note', content: 'secret ingredient' });
    let hits = memory.recall(db, { query: 'secret' });
    assert.equal(hits.length, 1);

    db.prepare('DELETE FROM memory_entries WHERE id = ?').run(id);
    hits = memory.recall(db, { query: 'secret' });
    assert.equal(hits.length, 0, 'FTS5 trigger should remove deleted rows');
  } finally { teardown(dir, db); }
});
