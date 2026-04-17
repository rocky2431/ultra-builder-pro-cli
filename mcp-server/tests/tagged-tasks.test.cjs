'use strict';

// Phase 7.2 — Tagged task lists:
//   • deriveBranchTag(cwd) — git HEAD → sanitized tag
//   • switchTaskTag(db, task_id, new_tag) — update tag + emit event
//   • createTask auto-derives tag from cwd when not provided

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');

function mkRepo(branch = 'main') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-tag-repo-'));
  execFileSync('git', ['init', '-q', '-b', branch], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# r\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  return dir;
}

function checkout(repoRoot, branch) {
  execFileSync('git', ['checkout', '-q', '-b', branch], { cwd: repoRoot });
}

function freshDb(repoRoot) {
  const dbPath = path.join(repoRoot, '.ultra', 'state.db');
  const init = initStateDb(dbPath);
  return init.db;
}

function teardown(dir, db) {
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

test('deriveBranchTag: main branch → "main"', () => {
  const repo = mkRepo('main');
  try { assert.equal(ops.deriveBranchTag(repo), 'main'); }
  finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('deriveBranchTag: feat/auth → "feat-auth" (slash sanitized)', () => {
  const repo = mkRepo('main');
  try {
    checkout(repo, 'feat/auth');
    assert.equal(ops.deriveBranchTag(repo), 'feat-auth');
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('deriveBranchTag: detached HEAD → null', () => {
  const repo = mkRepo('main');
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    execFileSync('git', ['checkout', '-q', sha], { cwd: repo });
    assert.equal(ops.deriveBranchTag(repo), null);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('deriveBranchTag: non-git directory → null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-nongit-'));
  try { assert.equal(ops.deriveBranchTag(dir), null); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('deriveBranchTag: sanitizes special chars (/ → -, @ dropped)', () => {
  const repo = mkRepo('main');
  try {
    checkout(repo, 'release/v1.2@staging');
    // Sanitized: slashes → hyphens, @ stripped
    const tag = ops.deriveBranchTag(repo);
    assert.match(tag, /^release-v1\.2.staging$/);
    assert.ok(!tag.includes('/'));
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('createTask: auto-derives tag from cwd branch when not supplied', () => {
  const repo = mkRepo('main');
  const db = freshDb(repo);
  try {
    checkout(repo, 'feat/billing');
    const task = ops.createTask(db, {
      id: 't-auto', title: 'autotag', type: 'feature', priority: 'P1', _cwd: repo,
    });
    assert.equal(task.tag, 'feat-billing');
  } finally { teardown(repo, db); }
});

test('createTask: explicit tag wins over auto-derivation', () => {
  const repo = mkRepo('main');
  const db = freshDb(repo);
  try {
    checkout(repo, 'feat/a');
    const task = ops.createTask(db, {
      id: 't-explicit', title: 'explicit', type: 'feature', priority: 'P1',
      tag: 'custom-tag', _cwd: repo,
    });
    assert.equal(task.tag, 'custom-tag');
  } finally { teardown(repo, db); }
});

test('createTask: non-git cwd → tag remains null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-task-nongit-'));
  const db = freshDb(dir);
  try {
    const task = ops.createTask(db, {
      id: 't-nogit', title: 'n/a', type: 'feature', priority: 'P1', _cwd: dir,
    });
    assert.equal(task.tag, null);
  } finally { teardown(dir, db); }
});

test('switchTaskTag: updates tag + emits task_tag_changed event', () => {
  const repo = mkRepo('main');
  const db = freshDb(repo);
  try {
    ops.createTask(db, { id: 't-sw', title: 'switch me', type: 'feature', priority: 'P1', tag: 'old' });
    const { events: before } = ops.subscribeEventsSince(db, { since_id: 0, limit: 500 });
    const result = ops.switchTaskTag(db, 't-sw', 'new-tag');
    assert.equal(result.tag, 'new-tag');
    const task = ops.readTask(db, 't-sw');
    assert.equal(task.tag, 'new-tag');

    const { events: after } = ops.subscribeEventsSince(db, { since_id: 0, limit: 500 });
    const newEvents = after.slice(before.length);
    assert.ok(newEvents.some((e) => e.type === 'task_tag_changed' && e.task_id === 't-sw'));
  } finally { teardown(repo, db); }
});

test('switchTaskTag: missing task → TASK_NOT_FOUND', () => {
  const repo = mkRepo('main');
  const db = freshDb(repo);
  try {
    assert.throws(
      () => ops.switchTaskTag(db, 'nope', 'x'),
      (err) => err instanceof ops.StateOpsError && err.code === 'TASK_NOT_FOUND',
    );
  } finally { teardown(repo, db); }
});

test('listTasks: filter by tag returns only matching', () => {
  const repo = mkRepo('main');
  const db = freshDb(repo);
  try {
    ops.createTask(db, { id: 'ta', title: 'a', type: 'feature', priority: 'P1', tag: 'auth' });
    ops.createTask(db, { id: 'tb', title: 'b', type: 'feature', priority: 'P1', tag: 'billing' });
    ops.createTask(db, { id: 'tc', title: 'c', type: 'feature', priority: 'P1', tag: 'auth' });

    const auth = ops.listTasks(db, { tag: 'auth' });
    assert.equal(auth.length, 2);
    assert.ok(auth.every((t) => t.tag === 'auth'));

    const billing = ops.listTasks(db, { tag: 'billing' });
    assert.equal(billing.length, 1);
  } finally { teardown(repo, db); }
});
