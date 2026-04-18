'use strict';

// Phase 8B.3 — N-concurrent git worktree registry.
//
// Wraps session-runner's single-session gitWorktreeAdd/Remove with:
//   • allocate({repoRoot, sid, baseRef})  — create .ultra/worktrees/<sid>
//   • release({repoRoot, worktree_path})  — remove one
//   • listActive(repoRoot)                — scan git + filter our domain
//   • releaseAll(repoRoot)                — batch cleanup (crash recovery)
//
// Node single-thread execFileSync naturally serializes git calls, so
// `.git/config.lock` contention is a non-issue within one process. If the
// parallel orchestrator (8B.2) ever switches to async git spawning, an
// async mutex can be layered here without changing the API.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { _internal } = require('./session-runner.cjs');

const WORKTREE_DOMAIN = path.join('.ultra', 'worktrees');

function worktreePath(repoRoot, sid) {
  return path.join(repoRoot, WORKTREE_DOMAIN, sid);
}

function allocate({ repoRoot, sid, baseRef = 'HEAD' }) {
  if (!repoRoot) throw new Error('allocate: repoRoot required');
  if (!sid) throw new Error('allocate: sid required');
  const wt = worktreePath(repoRoot, sid);
  _internal.gitWorktreeAdd(repoRoot, wt, baseRef); // throws WORKTREE_FAILED
  return { worktree_path: wt };
}

function release({ repoRoot, worktree_path }) {
  if (!repoRoot) throw new Error('release: repoRoot required');
  if (!worktree_path) throw new Error('release: worktree_path required');
  _internal.gitWorktreeRemove(repoRoot, worktree_path);
}

function parsePorcelain(text) {
  const entries = [];
  let current = {};
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('worktree ')) {
      if (current.worktree) entries.push(current);
      current = { worktree: line.slice('worktree '.length) };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length);
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line === '' && current.worktree) {
      entries.push(current);
      current = {};
    }
  }
  if (current.worktree) entries.push(current);
  return entries;
}

function listActive(repoRoot) {
  let out;
  try {
    out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    });
  } catch (err) {
    // Non-git or git failure — surface nothing but log via stderr so callers
    // can trace. Return empty list so releaseAll is idempotent.
    process.stderr.write(`worktree-manager: listActive git call failed: ${err.message}\n`);
    return [];
  }
  const rawDomainRoot = path.resolve(repoRoot, WORKTREE_DOMAIN);
  // On macOS tmpdir is a symlink (/var → /private/var); git returns realpath.
  // Canonicalize both sides so prefix matching is robust.
  const domainRoot = (fs.existsSync(rawDomainRoot)
    ? fs.realpathSync(rawDomainRoot)
    : rawDomainRoot) + path.sep;
  return parsePorcelain(out)
    .filter((e) => {
      if (!e.worktree) return false;
      const canon = fs.existsSync(e.worktree) ? fs.realpathSync(e.worktree) : path.resolve(e.worktree);
      return (canon + path.sep).startsWith(domainRoot);
    })
    .map((e) => ({
      sid: path.basename(e.worktree),
      worktree_path: e.worktree,
      head: e.head || null,
      branch: e.branch || null,
      detached: !!e.detached,
    }));
}

function releaseAll(repoRoot) {
  const active = listActive(repoRoot);
  let cleaned = 0;
  for (const entry of active) {
    try {
      release({ repoRoot, worktree_path: entry.worktree_path });
      cleaned += 1;
    } catch (err) {
      // Best-effort: one bad worktree shouldn't stop the sweep.
      process.stderr.write(`worktree-manager: release(${entry.sid}) failed: ${err.message}\n`);
    }
  }
  // Sweep filesystem orphans that git no longer tracks.
  const domainRoot = path.join(repoRoot, WORKTREE_DOMAIN);
  if (fs.existsSync(domainRoot)) {
    for (const name of fs.readdirSync(domainRoot)) {
      const full = path.join(domainRoot, name);
      try { fs.rmSync(full, { recursive: true, force: true }); }
      catch (err) {
        process.stderr.write(`worktree-manager: orphan sweep failed for ${full}: ${err.message}\n`);
      }
    }
  }
  return { cleaned };
}

module.exports = {
  allocate,
  release,
  listActive,
  releaseAll,
  worktreePath,
  WORKTREE_DOMAIN,
};
