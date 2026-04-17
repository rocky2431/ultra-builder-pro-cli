'use strict';

// Phase 7.3 — Skill miner (heuristic, no LLM):
//   • mineSession scans a session's events + task state for "solved
//     something non-trivial" signals and writes skills/learned/
//     <ts>_<sid>_unverified.md drafts.
//   • Idempotent: same sid twice → only one draft per signal.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const skillMiner = require('../skill-miner.cjs');

function mkFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-skill-'));
  const dbPath = path.join(repoRoot, '.ultra', 'state.db');
  const { db } = initStateDb(dbPath);
  const skillsRoot = path.join(repoRoot, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  return { repoRoot, db, skillsRoot };
}

function teardown(repoRoot, db) {
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function seed(db, { sid, task_id, title = 'demo', tag = null }) {
  ops.createTask(db, { id: task_id, title, type: 'feature', priority: 'P1', tag });
  ops.createSession(db, {
    sid, task_id, runtime: 'claude',
    worktree_path: `/tmp/${sid}/wt`, artifact_dir: `/tmp/${sid}/art`,
  });
}

test('mineSession: task_completed signal → generates draft', () => {
  const { repoRoot, db, skillsRoot } = mkFixture();
  try {
    seed(db, { sid: 's-done', task_id: 't-done', title: 'ship auth flow' });
    ops.patchTask(db, 't-done', { status: 'in_progress' });
    ops.appendEvent(db, { type: 'task_completed', task_id: 't-done', session_id: 's-done', payload: { to: 'completed' } });
    ops.patchTask(db, 't-done', { status: 'completed' });

    const out = skillMiner.mineSession(db, { sid: 's-done', skillsRoot });
    assert.equal(out.drafts.length, 1);
    assert.match(out.drafts[0], /_unverified\.md$/);
    const draft = fs.readFileSync(out.drafts[0], 'utf8');
    assert.match(draft, /kind: task-completion/);
    assert.match(draft, /unverified: true/);
    assert.match(draft, /ship auth flow/);
  } finally { teardown(repoRoot, db); }
});

test('mineSession: task_circuit_broken signal → debug-pattern draft', () => {
  const { repoRoot, db, skillsRoot } = mkFixture();
  try {
    seed(db, { sid: 's-cb', task_id: 't-cb', title: 'flaky integration' });
    ops.appendEvent(db, { type: 'task_circuit_broken', task_id: 't-cb', session_id: 's-cb', payload: { threshold: 3 } });
    const out = skillMiner.mineSession(db, { sid: 's-cb', skillsRoot });
    assert.equal(out.drafts.length, 1);
    const draft = fs.readFileSync(out.drafts[0], 'utf8');
    assert.match(draft, /kind: debug-pattern/);
  } finally { teardown(repoRoot, db); }
});

test('mineSession: session_crashed signal → recovery-pattern draft', () => {
  const { repoRoot, db, skillsRoot } = mkFixture();
  try {
    seed(db, { sid: 's-crash', task_id: 't-crash', title: 'crashing task' });
    ops.appendEvent(db, { type: 'session_crashed', task_id: 't-crash', session_id: 's-crash', payload: { to: 'crashed' } });
    const out = skillMiner.mineSession(db, { sid: 's-crash', skillsRoot });
    assert.equal(out.drafts.length, 1);
    const draft = fs.readFileSync(out.drafts[0], 'utf8');
    assert.match(draft, /kind: recovery-pattern/);
  } finally { teardown(repoRoot, db); }
});

test('mineSession: no trigger signals → no draft', () => {
  const { repoRoot, db, skillsRoot } = mkFixture();
  try {
    seed(db, { sid: 's-quiet', task_id: 't-quiet', title: 'nothing happened' });
    const out = skillMiner.mineSession(db, { sid: 's-quiet', skillsRoot });
    assert.equal(out.drafts.length, 0);
  } finally { teardown(repoRoot, db); }
});

test('mineSession: idempotent — running twice on same sid yields no new drafts', () => {
  const { repoRoot, db, skillsRoot } = mkFixture();
  try {
    seed(db, { sid: 's-idem', task_id: 't-idem', title: 'shipped' });
    ops.patchTask(db, 't-idem', { status: 'in_progress' });
    ops.appendEvent(db, { type: 'task_completed', task_id: 't-idem', session_id: 's-idem', payload: { to: 'completed' } });
    ops.patchTask(db, 't-idem', { status: 'completed' });

    const first = skillMiner.mineSession(db, { sid: 's-idem', skillsRoot });
    const second = skillMiner.mineSession(db, { sid: 's-idem', skillsRoot });
    assert.equal(first.drafts.length, 1);
    assert.equal(second.drafts.length, 0, 'second mining should see existing draft and skip');
    const learned = fs.readdirSync(path.join(skillsRoot, 'learned'));
    assert.equal(learned.length, 1);
  } finally { teardown(repoRoot, db); }
});

test('mineSession: missing session → empty drafts array', () => {
  const { repoRoot, db, skillsRoot } = mkFixture();
  try {
    const out = skillMiner.mineSession(db, { sid: 's-nope', skillsRoot });
    assert.deepEqual(out.drafts, []);
  } finally { teardown(repoRoot, db); }
});

test('AC flow: 5 mock sessions (3 with signal, 2 empty) → ≥3 drafts', () => {
  const { repoRoot, db, skillsRoot } = mkFixture();
  try {
    // 3 with a trigger signal
    for (const [i, kind] of [['ac1', 'completed'], ['ac2', 'crashed'], ['ac3', 'broken']]) {
      seed(db, { sid: `s-${i}`, task_id: `t-${i}`, title: `task ${i}` });
      if (kind === 'completed') {
        ops.patchTask(db, `t-${i}`, { status: 'in_progress' });
        ops.appendEvent(db, { type: 'task_completed', task_id: `t-${i}`, session_id: `s-${i}`, payload: {} });
        ops.patchTask(db, `t-${i}`, { status: 'completed' });
      } else if (kind === 'crashed') {
        ops.appendEvent(db, { type: 'session_crashed', task_id: `t-${i}`, session_id: `s-${i}`, payload: {} });
      } else if (kind === 'broken') {
        ops.appendEvent(db, { type: 'task_circuit_broken', task_id: `t-${i}`, session_id: `s-${i}`, payload: { threshold: 3 } });
      }
    }
    // 2 empty
    for (const i of ['ac4', 'ac5']) {
      seed(db, { sid: `s-${i}`, task_id: `t-${i}`, title: `task ${i}` });
    }

    let totalDrafts = 0;
    for (const i of ['ac1', 'ac2', 'ac3', 'ac4', 'ac5']) {
      const out = skillMiner.mineSession(db, { sid: `s-${i}`, skillsRoot });
      totalDrafts += out.drafts.length;
    }
    assert.ok(totalDrafts >= 3, `expected ≥3 drafts across 5 sessions, got ${totalDrafts}`);
    const learned = fs.readdirSync(path.join(skillsRoot, 'learned'));
    assert.ok(learned.length >= 3);
  } finally { teardown(repoRoot, db); }
});
