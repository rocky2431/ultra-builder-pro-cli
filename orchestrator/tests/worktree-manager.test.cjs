'use strict';

// Phase 8B.3 — N-concurrent git worktree management.
//
// Session-runner (Phase 4.5) already encapsulates `git worktree add/remove`
// for a single session. worktree-manager is the registry / batch layer:
// allocate N, track them via `git worktree list --porcelain`, release one
// or all (for crash recovery), detect filesystem orphans.
//
// AC (from PLAN §6 Phase 8B.3):
//   - 3 concurrent slices → 3 independent worktrees, git worktree list
//     shows them; main branch checkout untouched
//   - 5 rapid allocations in one tick → no .git/config.lock contention
//     (Node single-thread execFileSync is naturally serialized)
//   - releaseAll cleans filesystem leftovers even when git forgot them

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const wm = require('../worktree-manager.cjs');

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-wtmgr-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# seed\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
}

test('allocate: creates worktree under .ultra/worktrees/<sid> and returns path', () => {
  const repo = mkRepo();
  try {
    const { worktree_path } = wm.allocate({ repoRoot: repo, sid: 'sess-abc' });
    assert.ok(worktree_path.endsWith('.ultra/worktrees/sess-abc'));
    assert.ok(fs.existsSync(worktree_path), 'worktree dir should exist');
    assert.ok(fs.existsSync(path.join(worktree_path, 'README.md')), 'seed file visible');
  } finally { cleanup(repo); }
});

test('release: removes worktree dir and unregisters from git', () => {
  const repo = mkRepo();
  try {
    const { worktree_path } = wm.allocate({ repoRoot: repo, sid: 'sess-rel' });
    wm.release({ repoRoot: repo, worktree_path });
    assert.equal(fs.existsSync(worktree_path), false, 'dir should be removed');
    const active = wm.listActive(repo);
    assert.equal(active.length, 0, 'no slices should remain');
  } finally { cleanup(repo); }
});

test('3 concurrent allocates → 3 independent worktrees visible via listActive', () => {
  const repo = mkRepo();
  try {
    const sids = ['sess-a', 'sess-b', 'sess-c'];
    const paths = sids.map((sid) => wm.allocate({ repoRoot: repo, sid }).worktree_path);
    for (const p of paths) assert.ok(fs.existsSync(p), `${p} missing`);
    const active = wm.listActive(repo);
    const activeSids = active.map((a) => a.sid).sort();
    assert.deepEqual(activeSids, sids.slice().sort());
    // Every entry has a distinct worktree_path
    const uniquePaths = new Set(active.map((a) => a.worktree_path));
    assert.equal(uniquePaths.size, 3);
  } finally { cleanup(repo); }
});

test('5 rapid allocates in one tick → no .git/config.lock contention', () => {
  const repo = mkRepo();
  try {
    const sids = ['s1', 's2', 's3', 's4', 's5'];
    // Execute synchronously back-to-back; Node single-thread guarantees
    // serialized git calls, so no file-lock race.
    for (const sid of sids) {
      wm.allocate({ repoRoot: repo, sid });
    }
    assert.equal(wm.listActive(repo).length, 5);
  } finally { cleanup(repo); }
});

test('listActive: only returns worktrees under .ultra/worktrees/ (main excluded)', () => {
  const repo = mkRepo();
  try {
    // Manually add a worktree OUTSIDE .ultra/worktrees — should be ignored.
    const outsideDir = path.join(repo, 'other-wt');
    execFileSync('git', ['worktree', 'add', '--detach', outsideDir, 'HEAD'], {
      cwd: repo, stdio: 'pipe',
    });
    wm.allocate({ repoRoot: repo, sid: 'sess-domain' });
    const active = wm.listActive(repo);
    assert.equal(active.length, 1);
    assert.equal(active[0].sid, 'sess-domain');
  } finally { cleanup(repo); }
});

test('listActive: empty repo → []', () => {
  const repo = mkRepo();
  try {
    assert.deepEqual(wm.listActive(repo), []);
  } finally { cleanup(repo); }
});

test('releaseAll: clears all allocated worktrees + filesystem orphans', () => {
  const repo = mkRepo();
  try {
    wm.allocate({ repoRoot: repo, sid: 'x1' });
    wm.allocate({ repoRoot: repo, sid: 'x2' });
    // Create an orphan dir: git doesn't know about it, but fs exists.
    const orphanDir = path.join(repo, '.ultra', 'worktrees', 'orphan-dir');
    fs.mkdirSync(orphanDir, { recursive: true });
    fs.writeFileSync(path.join(orphanDir, 'junk.txt'), 'x');

    const result = wm.releaseAll(repo);
    assert.equal(result.cleaned, 2, 'should report 2 git-tracked cleanups');
    assert.equal(wm.listActive(repo).length, 0);
    assert.equal(fs.existsSync(orphanDir), false, 'orphan must be swept');
  } finally { cleanup(repo); }
});

test('allocate: baseRef honored — worktree checked out at given ref', () => {
  const repo = mkRepo();
  try {
    // Make a second commit so we have two distinct SHAs.
    fs.writeFileSync(path.join(repo, 'second.md'), '# second\n');
    execFileSync('git', ['add', '-A'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'second'], { cwd: repo });
    const firstSha = execFileSync('git', ['rev-parse', 'HEAD~1'], {
      cwd: repo, stdio: ['ignore', 'pipe', 'pipe'],
    }).toString().trim();

    const { worktree_path } = wm.allocate({
      repoRoot: repo, sid: 'sess-ref', baseRef: firstSha,
    });
    const wtSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: worktree_path, stdio: ['ignore', 'pipe', 'pipe'],
    }).toString().trim();
    assert.equal(wtSha, firstSha);
  } finally { cleanup(repo); }
});
