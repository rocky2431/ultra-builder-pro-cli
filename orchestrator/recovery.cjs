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

function recoverOnBoot(db, { graceSeconds = 300 } = {}) {
  if (!db) throw new Error('recoverOnBoot: db handle required');

  // Step 1 — promote stale running sessions to orphan (Phase 4.5 logic).
  ops.reapOrphanSessions(db, { graceSeconds });

  // Step 2 — for every orphan, decide crashed vs. keep-watching.
  const orphans = listOrphanSessions(db);
  const recovered = [];
  for (const s of orphans) {
    const alive = isPidAlive(s.pid);
    if (alive) continue;

    ops.updateSession(db, s.sid, { status: 'crashed' });
    ops.recordTaskFailure(db, s.task_id, {
      reason: 'session_crashed_on_boot',
      session_id: s.sid,
    });
    recovered.push({
      sid: s.sid,
      task_id: s.task_id,
      pid: s.pid,
      pid_alive: false,
      reason: 'session_crashed_on_boot',
    });
  }

  return { recovered, count: recovered.length };
}

module.exports = {
  recoverOnBoot,
  // exposed for tests
  _internal: { isPidAlive, listOrphanSessions },
};
