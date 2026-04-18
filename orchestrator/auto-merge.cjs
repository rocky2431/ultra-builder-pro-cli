'use strict';

// Phase 8B.4 — Auto-merge session worktree back onto baseBranch.
//
// Called by session-runner.closeSession when autoMerge=true. Three outcomes:
//   1. session HEAD === base HEAD            → { merged:false, reason:'no_changes' }
//   2. git merge --no-ff clean                → { merged:true }  + merged_back event
//   3. conflict                               → { merged:false, reason:'conflict',
//                                                conflict_paths[] } + merge_conflict event
//      (caller keeps the worktree so a human can resolve)
//
// Note: git worktree add --detach shares the .git dir, so the session commit
// is already reachable from the repo root. No fetch / push is needed.

const { execFileSync } = require('node:child_process');

const ops = require('../mcp-server/lib/state-ops.cjs');

function runGit(args, opts = {}) {
  return execFileSync('git', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...opts,
  }).trim();
}

function listConflictPaths(repoRoot) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=U'], {
      cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean);
  } catch (err) {
    process.stderr.write(`auto-merge: listConflictPaths failed: ${err.message}\n`);
    return [];
  }
}

function autoMerge({ repoRoot, worktreePath, baseBranch = 'main', sid, task_id = null, db = null }) {
  if (!repoRoot) throw new Error('autoMerge: repoRoot required');
  if (!worktreePath) throw new Error('autoMerge: worktreePath required');

  let sessionSha;
  let baseSha;
  try {
    sessionSha = runGit(['rev-parse', 'HEAD'], { cwd: worktreePath });
    baseSha = runGit(['rev-parse', baseBranch], { cwd: repoRoot });
  } catch (err) {
    // Base branch missing or worktree malformed — surface but don't throw.
    process.stderr.write(`auto-merge: rev-parse failed: ${err.message}\n`);
    return { merged: false, reason: 'rev_parse_failed', session_sha: null, base_sha: null };
  }

  if (sessionSha === baseSha) {
    return { merged: false, reason: 'no_changes', session_sha: sessionSha, base_sha: baseSha };
  }

  // Make sure repoRoot is checked out on baseBranch before we merge into it.
  try { runGit(['checkout', baseBranch], { cwd: repoRoot }); }
  catch (err) {
    process.stderr.write(`auto-merge: checkout ${baseBranch} failed: ${err.message}\n`);
    return { merged: false, reason: 'checkout_failed', session_sha: sessionSha, base_sha: baseSha };
  }

  try {
    runGit(
      ['merge', '--no-ff', '-m', `ubp: merge session ${sid}`, sessionSha],
      { cwd: repoRoot },
    );
    if (db) {
      ops.appendEvent(db, {
        type: 'merged_back',
        task_id,
        session_id: sid,
        payload: { session_sha: sessionSha, base_sha: baseSha, base_branch: baseBranch },
      });
    }
    return { merged: true, session_sha: sessionSha, base_sha: baseSha };
  } catch (err) {
    // Collect conflict info BEFORE aborting — abort resets the index.
    const conflictPaths = listConflictPaths(repoRoot);
    try { runGit(['merge', '--abort'], { cwd: repoRoot }); }
    catch (abortErr) {
      process.stderr.write(`auto-merge: merge --abort failed: ${abortErr.message}\n`);
    }
    if (db) {
      ops.appendEvent(db, {
        type: 'merge_conflict',
        task_id,
        session_id: sid,
        payload: {
          session_sha: sessionSha,
          base_sha: baseSha,
          base_branch: baseBranch,
          conflict_paths: conflictPaths,
        },
      });
    }
    return {
      merged: false,
      reason: 'conflict',
      session_sha: sessionSha,
      base_sha: baseSha,
      conflict_paths: conflictPaths,
    };
  }
}

module.exports = { autoMerge };
