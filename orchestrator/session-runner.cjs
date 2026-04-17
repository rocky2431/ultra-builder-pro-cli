'use strict';

// Phase 4.5.1 — Session 标准单元 runner.
// Session = new process + independent git worktree + state.db sessions-table
// lease/heartbeat (D20 + D32 — no .ultra/sessions/<sid>/lease.json file).
//
// This module is the execution layer. MCP session.* tools record state,
// orchestrator runs the actual git worktree + child_process work.
// Callers share a single open state-db connection (WAL supports multi-writer).

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const ops = require('../mcp-server/lib/state-ops.cjs');

class SessionRunnerError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message);
    this.name = 'SessionRunnerError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function gitWorktreeAdd(repoRoot, worktreePath, ref = 'HEAD') {
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  try {
    execFileSync('git', ['worktree', 'add', '--detach', worktreePath, ref], {
      cwd: repoRoot, stdio: 'pipe',
    });
  } catch (err) {
    throw new SessionRunnerError('WORKTREE_FAILED', `git worktree add failed: ${err.stderr ? err.stderr.toString().trim() : err.message}`, { cause: err });
  }
}

function gitWorktreeRemove(repoRoot, worktreePath) {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', worktreePath], {
      cwd: repoRoot, stdio: 'pipe',
    });
  } catch (_err) {
    // worktree may already be detached; fall through to fs removal
  }
  if (fs.existsSync(worktreePath)) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }
}

function mintSessionId() {
  return `sess-${randomUUID().slice(0, 8)}`;
}

function spawnSession({
  db,
  repoRoot,
  task_id,
  runtime,
  takeover = false,
  command = null,
  args = [],
  env = {},
  stdio = 'ignore',
  worktreeRef = 'HEAD',
  lease_seconds = 1800,
}) {
  if (!db) throw new SessionRunnerError('VALIDATION_ERROR', 'db handle required');
  if (!repoRoot) throw new SessionRunnerError('VALIDATION_ERROR', 'repoRoot required');
  if (!task_id) throw new SessionRunnerError('VALIDATION_ERROR', 'task_id required');
  if (!runtime) throw new SessionRunnerError('VALIDATION_ERROR', 'runtime required');

  // 1. Admission check
  const verdict = ops.admissionCheck(db, task_id);
  if (!verdict.can_spawn && !takeover) {
    const err = new SessionRunnerError(
      'ADMISSION_DENIED',
      `active session exists for task ${task_id} (${verdict.conflict && verdict.conflict.sid}); recommended=${verdict.recommended_action}`,
    );
    err.verdict = verdict;
    throw err;
  }
  if (!verdict.can_spawn && takeover && verdict.conflict) {
    ops.updateSession(db, verdict.conflict.sid, { status: 'crashed' });
  }

  // 2. Mint sid + paths
  const sid = mintSessionId();
  const worktree_path = path.join(repoRoot, '.ultra', 'worktrees', sid);
  const artifact_dir = path.join(repoRoot, '.ultra', 'sessions', sid);

  // 3. Git worktree (throws WORKTREE_FAILED on failure)
  gitWorktreeAdd(repoRoot, worktree_path, worktreeRef);
  fs.mkdirSync(artifact_dir, { recursive: true });

  // 4. Spawn child process (optional — caller may want a record-only session)
  let proc = null;
  if (command) {
    proc = spawn(command, args, {
      cwd: worktree_path,
      env: {
        ...process.env,
        UBP_SESSION_ID: sid,
        UBP_TASK_ID: task_id,
        UBP_RUNTIME: runtime,
        UBP_WORKTREE: worktree_path,
        UBP_ARTIFACT_DIR: artifact_dir,
        ...env,
      },
      stdio,
      detached: false,
    });
  }

  // 5. Write session record
  let session;
  try {
    session = ops.createSession(db, {
      sid,
      task_id,
      runtime,
      pid: proc ? proc.pid : null,
      worktree_path,
      artifact_dir,
      lease_seconds,
    });
  } catch (err) {
    // state.db insert failed — roll back worktree + child
    if (proc && !proc.killed) { try { proc.kill('SIGTERM'); } catch (_) { /* ignore */ } }
    gitWorktreeRemove(repoRoot, worktree_path);
    throw err;
  }

  return {
    sid,
    worktree_path,
    artifact_dir,
    lease_expires_at: session.lease_expires_at,
    pid: proc ? proc.pid : null,
    process: proc,
  };
}

function closeSession({
  db,
  repoRoot,
  sid,
}, {
  status = 'completed',
  remove_worktree = true,
  kill_signal = 'SIGTERM',
} = {}) {
  if (!db || !sid) throw new SessionRunnerError('VALIDATION_ERROR', 'db + sid required');
  const session = ops.readSession(db, sid);
  if (!session) {
    throw new SessionRunnerError('SESSION_NOT_FOUND', `session ${sid} not found`);
  }
  if (session.pid) {
    try { process.kill(session.pid, kill_signal); }
    catch (_) { /* already dead */ }
  }
  ops.updateSession(db, sid, { status });
  if (remove_worktree && repoRoot && session.worktree_path) {
    gitWorktreeRemove(repoRoot, session.worktree_path);
  }
  return { sid, status };
}

function attachHeartbeat(db, sid, { intervalMs = 30000 } = {}) {
  if (!db || !sid) throw new SessionRunnerError('VALIDATION_ERROR', 'db + sid required');
  const timer = setInterval(() => {
    try { ops.heartbeatSession(db, sid); }
    catch (_err) { clearInterval(timer); }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

module.exports = {
  SessionRunnerError,
  spawnSession,
  closeSession,
  attachHeartbeat,
  // exposed for tests
  _internal: { gitWorktreeAdd, gitWorktreeRemove, mintSessionId },
};
