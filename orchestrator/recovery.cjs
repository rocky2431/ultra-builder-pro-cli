'use strict';

// Phase 5.1 — Recovery decision layer.
//
// Phase 4.5's reapOrphanSessions marks running sessions whose lease or
// heartbeat has expired as `orphan`. Orphan is a safe waypoint — we don't yet
// know whether the child is dead, deadlocked, or just slow.
//
// recoverOnBoot upgrades orphans whose pid is demonstrably dead to `crashed`,
// records a task_failure event, and leaves orphans with live pids alone so
// they can recover on their own heartbeat.
//
// The circuit breaker (Phase 5.2) consumes task_failure events to decide
// whether the task should be tripped.

const ops = require('../mcp-server/lib/state-ops.cjs');
const fs = require('node:fs');
const path = require('node:path');
const closeJournal = require('./session-close-journal.cjs');
const runner = require('./session-runner.cjs');

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    // Signal 0 performs error checking without actually sending a signal.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process; EPERM = process exists but owned by another user
    // (still counts as alive for our purposes).
    if (err && err.code === 'EPERM') return true;
    return false;
  }
}

function listOrphanSessions(db) {
  return db.prepare("SELECT * FROM sessions WHERE status = 'orphan'").all();
}

function reconcileCloseWorktree(repoRoot, intent) {
  runner._internal.assertManagedWorktreePath(
    repoRoot,
    intent.worktree_path,
    { sid: intent.sid, validateRuntimeTree: false },
  );
  if (fs.existsSync(intent.worktree_path)) {
    const blocker = runner._internal.worktreeRemovalBlocker(
      repoRoot,
      intent.worktree_path,
    );
    if (blocker) throw new Error(blocker);
  }
  runner._internal.reconcileRemovedWorktree(
    repoRoot,
    intent.worktree_path,
    { sid: intent.sid },
  );
}

function closeIntentMatchesSession(intent, session) {
  return Boolean(
    intent
      && session
      && intent.sid === session.sid
      && intent.task_id === session.task_id
      && typeof intent.worktree_path === 'string'
      && typeof session.worktree_path === 'string'
      && path.resolve(intent.worktree_path) === path.resolve(session.worktree_path),
  );
}

function recoverCloseIntents(db, repoRoot) {
  if (!repoRoot) return { recovered: [], pending: [] };
  const recovered = [];
  const pending = [];
  for (const intent of closeJournal.list(repoRoot)) {
    const session = ops.readSession(db, intent.sid);
    if (!session) {
      pending.push({ sid: intent.sid, reason: 'session_missing' });
      continue;
    }
    if (!closeIntentMatchesSession(intent, session)) {
      pending.push({ sid: intent.sid, reason: 'journal_identity_mismatch' });
      continue;
    }
    if (session.status === intent.requested_status) {
      try {
        reconcileCloseWorktree(repoRoot, intent);
        closeJournal.discard(repoRoot, intent.sid);
        recovered.push({
          sid: intent.sid,
          status: session.status,
          reconciled: 'already_terminal',
        });
      } catch (error) {
        closeJournal.update(repoRoot, intent.sid, {
          phase: 'recovery_failed',
          error: error.message,
        });
        pending.push({ sid: intent.sid, reason: error.message });
      }
      continue;
    }
    if (['completed', 'crashed'].includes(session.status)) {
      pending.push({
        sid: intent.sid,
        reason: `terminal_status_conflict:${session.status}`,
      });
      continue;
    }
    if (isPidAlive(session.pid)) {
      pending.push({ sid: intent.sid, reason: 'worker_still_alive' });
      continue;
    }
    try {
      reconcileCloseWorktree(repoRoot, intent);
      closeJournal.update(repoRoot, intent.sid, {
        phase: 'worktree_removed',
        error: null,
      });
      ops.updateSession(db, intent.sid, { status: intent.requested_status });
      closeJournal.discard(repoRoot, intent.sid);
      recovered.push({
        sid: intent.sid,
        status: intent.requested_status,
        reconciled: 'close_intent',
      });
    } catch (error) {
      closeJournal.update(repoRoot, intent.sid, {
        phase: 'recovery_failed',
        error: error.message,
      });
      pending.push({ sid: intent.sid, reason: error.message });
    }
  }
  return { recovered, pending };
}

function recoverOnBoot(db, { graceSeconds = 300, repoRoot = null } = {}) {
  if (!db) throw new Error('recoverOnBoot: db handle required');

  const closeRecovery = recoverCloseIntents(db, repoRoot);

  // Step 1 — promote stale running sessions to orphan (Phase 4.5 logic).
  ops.reapOrphanSessions(db, {
    graceSeconds,
    exclude_session_ids: closeRecovery.pending.map((entry) => entry.sid),
  });

  // Step 2 — for every orphan, decide crashed vs. keep-watching.
  const orphans = listOrphanSessions(db);
  const recovered = [];
  for (const s of orphans) {
    const alive = isPidAlive(s.pid);
    if (alive) continue;

    const resolution = ops.crashOrphanSession(db, s.sid, {
      reason: 'session_crashed_on_boot',
    });
    if (!resolution.changed) continue;
    recovered.push({
      sid: s.sid,
      task_id: s.task_id,
      pid: s.pid,
      pid_alive: false,
      reason: 'session_crashed_on_boot',
    });
  }

  return {
    recovered,
    count: recovered.length,
    closed: closeRecovery.recovered,
    close_pending: closeRecovery.pending,
  };
}

module.exports = {
  recoverOnBoot,
  // exposed for tests
  _internal: {
    isPidAlive,
    listOrphanSessions,
    closeIntentMatchesSession,
    reconcileCloseWorktree,
    recoverCloseIntents,
  },
};
