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
const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-wtmgr-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# seed\n');
  fs.writeFileSync(
    path.join(dir, '.gitignore'),
    '!.ultra/\n!.ultra/**\n.ultra/.runtime\n',
  );
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  const initialized = initStateDb(
    path.join(dir, '.ultra', '.runtime', 'state.db'),
  );
  closeStateDb(initialized.db);
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
}

test('allocate: creates worktree under .ultra/.runtime/worktrees/<sid> and returns path', () => {
  const repo = mkRepo();
  try {
    const { worktree_path } = wm.allocate({ repoRoot: repo, sid: 'sess-abc' });
    assert.ok(worktree_path.endsWith('.ultra/.runtime/worktrees/sess-abc'));
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

test('release refuses to delete a dirty registered worktree', () => {
  const repo = mkRepo();
  try {
    const { worktree_path } = wm.allocate({ repoRoot: repo, sid: 'sess-dirty' });
    const sentinel = path.join(worktree_path, 'untracked.txt');
    fs.writeFileSync(sentinel, 'preserve me\n');
    assert.throws(
      () => wm.release({ repoRoot: repo, worktree_path }),
      (error) => error?.code === 'WORKTREE_NOT_INTEGRATED',
    );
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve me\n');
    assert.deepEqual(wm.listActive(repo).map((entry) => entry.sid), ['sess-dirty']);
  } finally {
    cleanup(repo);
  }
});

test('release preserves the worktree while its authoritative session is nonterminal', () => {
  const repo = mkRepo();
  try {
    const sid = 'sess-running';
    const { worktree_path } = wm.allocate({ repoRoot: repo, sid });
    const { db } = initStateDb(
      path.join(repo, '.ultra', '.runtime', 'state.db'),
    );
    try {
      ops.createTask(db, {
        id: 'running-task',
        title: 'Running worktree task',
        type: 'feature',
        priority: 'P1',
      });
      ops.createSession(db, {
        sid,
        task_id: 'running-task',
        runtime: 'codex',
        worktree_path,
        artifact_dir: path.join(repo, '.ultra', '.runtime', 'sessions', sid),
      });
    } finally {
      closeStateDb(db);
    }

    assert.throws(
      () => wm.release({ repoRoot: repo, worktree_path }),
      (error) => (
        error?.code === 'WORKTREE_NOT_INTEGRATED'
        && /nonterminal \(running\)/i.test(error.message)
      ),
    );
    assert.equal(fs.existsSync(worktree_path), true);
    assert.deepEqual(wm.listActive(repo).map((entry) => entry.sid), [sid]);
  } finally {
    cleanup(repo);
  }
});

test('allocate rejects traversal, absolute, and separator-bearing session ids', () => {
  const repo = mkRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-wtmgr-sid-'));
  try {
    for (const sid of ['..', '../escape', 'nested/session', '/tmp/absolute-session']) {
      assert.throws(
        () => wm.allocate({ repoRoot: repo, sid }),
        /session id|sid|WORKTREE_SCOPE_INVALID/i,
        sid,
      );
    }
    assert.deepEqual(wm.listActive(repo), []);
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    cleanup(repo);
    cleanup(outside);
  }
});

test('allocate validates the complete runtime tree before creating a worktree', () => {
  const repo = mkRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-wtmgr-runtime-'));
  try {
    const telemetry = path.join(repo, '.ultra', '.runtime', 'telemetry');
    fs.mkdirSync(path.dirname(telemetry), { recursive: true });
    fs.symlinkSync(outside, telemetry, 'dir');

    assert.throws(
      () => wm.allocate({ repoRoot: repo, sid: 'unsafe-runtime' }),
      /RUNTIME_PATH_UNSAFE|symlink/i,
    );
    assert.equal(
      fs.existsSync(path.join(repo, '.ultra', '.runtime', 'worktrees', 'unsafe-runtime')),
      false,
    );
  } finally {
    cleanup(repo);
    cleanup(outside);
  }
});

test('release rejects an arbitrary external path without deleting it', () => {
  const repo = mkRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-wtmgr-external-'));
  try {
    const sentinel = path.join(outside, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'preserve');
    assert.throws(
      () => wm.release({ repoRoot: repo, worktree_path: outside }),
      (error) => error?.code === 'WORKTREE_SCOPE_INVALID',
    );
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve');
  } finally {
    cleanup(repo);
    cleanup(outside);
  }
});

test('release requires the exact direct child for the supplied session id', () => {
  const repo = mkRepo();
  try {
    const first = wm.allocate({ repoRoot: repo, sid: 'sess-first' }).worktree_path;
    const nested = path.join(first, 'nested');
    fs.mkdirSync(nested);
    assert.throws(
      () => wm.release({
        repoRoot: repo,
        sid: 'sess-first',
        worktree_path: nested,
      }),
      (error) => error?.code === 'WORKTREE_SCOPE_INVALID',
    );
    assert.throws(
      () => wm.release({
        repoRoot: repo,
        sid: 'sess-other',
        worktree_path: first,
      }),
      (error) => error?.code === 'WORKTREE_SCOPE_INVALID',
    );
    assert.equal(fs.existsSync(first), true);
  } finally {
    cleanup(repo);
  }
});

test('release and releaseAll reject an in-domain symlink escape without deleting its target', () => {
  const repo = mkRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-wtmgr-link-'));
  try {
    const sentinel = path.join(outside, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'preserve');
    const domain = path.join(repo, '.ultra', '.runtime', 'worktrees');
    fs.mkdirSync(domain, { recursive: true });
    const escape = path.join(domain, 'escape-link');
    fs.symlinkSync(outside, escape, 'dir');

    assert.throws(
      () => wm.release({ repoRoot: repo, worktree_path: escape }),
      /WORKTREE_SCOPE_INVALID|symlink|managed worktree/i,
    );
    assert.equal(fs.lstatSync(escape).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve');

    assert.throws(
      () => wm.releaseAll(repo),
      /RUNTIME_PATH_UNSAFE|symlink/i,
    );
    assert.equal(fs.lstatSync(escape).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve');
  } finally {
    cleanup(repo);
    cleanup(outside);
  }
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

test('listActive: only returns worktrees under .ultra/.runtime/worktrees/ (main excluded)', () => {
  const repo = mkRepo();
  try {
    // Manually add a worktree OUTSIDE .ultra/.runtime/worktrees — should be ignored.
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

test('listActive and releaseAll fail closed when Git discovery fails in a repository', () => {
  const repo = mkRepo();
  try {
    const orphan = path.join(
      repo, '.ultra', '.runtime', 'worktrees', 'preserve-orphan',
    );
    fs.mkdirSync(orphan, { recursive: true });
    fs.writeFileSync(path.join(orphan, 'sentinel'), 'preserve');
    const failingGit = () => {
      const error = new Error('injected git worktree list failure');
      error.status = 128;
      error.stderr = Buffer.from('fatal: injected discovery failure');
      throw error;
    };

    assert.throws(
      () => wm.listActive(repo, { execGit: failingGit }),
      /WORKTREE_DISCOVERY_FAILED|injected/i,
    );
    assert.throws(
      () => wm.releaseAll(repo, { execGit: failingGit }),
      /WORKTREE_DISCOVERY_FAILED|injected/i,
    );
    assert.equal(fs.readFileSync(path.join(orphan, 'sentinel'), 'utf8'), 'preserve');
  } finally {
    cleanup(repo);
  }
});

test('releaseAll preserves a registered worktree when Git removal fails', () => {
  const repo = mkRepo();
  try {
    const allocated = wm.allocate({ repoRoot: repo, sid: 'preserve-active' });
    fs.writeFileSync(path.join(allocated.worktree_path, 'sentinel'), 'preserve');

    const result = wm.releaseAll(repo, {
      releaseWorktree() {
        throw new Error('injected git worktree remove failure');
      },
    });

    assert.equal(result.cleaned, 0);
    assert.equal(
      fs.readFileSync(path.join(allocated.worktree_path, 'sentinel'), 'utf8'),
      'preserve',
    );
    assert.deepEqual(wm.listActive(repo).map((entry) => entry.sid), ['preserve-active']);
  } finally {
    cleanup(repo);
  }
});

test('releaseAll removes safe registered worktrees and quarantines filesystem orphans', () => {
  const repo = mkRepo();
  try {
    wm.allocate({ repoRoot: repo, sid: 'x1' });
    wm.allocate({ repoRoot: repo, sid: 'x2' });
    // Create an orphan dir: git doesn't know about it, but fs exists.
    const orphanDir = path.join(repo, '.ultra', '.runtime', 'worktrees', 'orphan-dir');
    fs.mkdirSync(orphanDir, { recursive: true });
    fs.writeFileSync(path.join(orphanDir, 'junk.txt'), 'x');

    const result = wm.releaseAll(repo);
    assert.equal(result.cleaned, 2, 'should report 2 git-tracked cleanups');
    assert.equal(wm.listActive(repo).length, 0);
    assert.equal(fs.existsSync(orphanDir), false, 'orphan leaves the managed worktree root');
    assert.equal(result.quarantined.length, 1);
    assert.equal(result.quarantined[0].sid, 'orphan-dir');
    assert.equal(
      fs.readFileSync(path.join(result.quarantined[0].recovery_path, 'junk.txt'), 'utf8'),
      'x',
    );
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
