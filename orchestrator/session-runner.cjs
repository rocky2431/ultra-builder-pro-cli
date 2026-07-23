'use strict';

// Phase 4.5.1 — standard session unit runner.
// Session = one task/runtime lease + independent git worktree + state.db
// lease/heartbeat. A caller may attach a worker process or let the active host
// operate directly in the returned worktree.
//
// This module is the single session/worktree execution layer shared by MCP
// session.* tools and the optional orchestrator child-process path.
// Callers share a single open state-db connection (WAL supports multi-writer).

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const ops = require('../mcp-server/lib/state-ops.cjs');
const workflows = require('../mcp-server/lib/workflow-state.cjs');
const skillMiner = require('./skill-miner.cjs');

const EXPECTED_EXECUTION_GATE_CODES = new Set([
  'TASK_EXECUTION_CONTRACT_INCOMPLETE',
  'WORKFLOW_TASK_NOT_EXECUTABLE',
  'TASK_DEPENDENCIES_INCOMPLETE',
  'WORKFLOW_PLAN_NOT_COMPLETED',
  'WORKFLOW_PLAN_TASK_SET_STALE',
  'WORKFLOW_PLAN_TASK_CONTRACT_STALE',
]);

class SessionRunnerError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message);
    this.name = 'SessionRunnerError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function isExpectedExecutionGate(error) {
  return Boolean(error && EXPECTED_EXECUTION_GATE_CODES.has(error.code));
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

function authorityLinkIsIgnored(worktreePath) {
  try {
    execFileSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--', '.ultra'],
      { cwd: worktreePath, stdio: 'ignore' },
    );
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw new SessionRunnerError(
      'WORKTREE_AUTHORITY_LINK_FAILED',
      `cannot verify the worktree Ultra ignore rule: ${error.message}`,
      { cause: error },
    );
  }
}

function ensureAuthorityLinkIgnored(worktreePath) {
  if (authorityLinkIsIgnored(worktreePath)) return { changed: false, path: null };
  let output;
  try {
    output = execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new SessionRunnerError(
      'WORKTREE_AUTHORITY_LINK_FAILED',
      `cannot locate the repository-local exclude file: ${error.message}`,
      { cause: error },
    );
  }
  const excludePath = path.isAbsolute(output)
    ? output
    : path.resolve(worktreePath, output);
  let stat = null;
  try { stat = fs.lstatSync(excludePath); }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw new SessionRunnerError(
        'WORKTREE_AUTHORITY_LINK_FAILED',
        `cannot inspect ${excludePath}: ${error.message}`,
        { cause: error },
      );
    }
  }
  if (stat && (stat.isSymbolicLink() || !stat.isFile())) {
    throw new SessionRunnerError(
      'WORKTREE_AUTHORITY_NOT_IGNORED',
      `refusing to update unsafe Git exclude path: ${excludePath}`,
    );
  }
  const before = stat ? fs.readFileSync(excludePath, 'utf8') : '';
  const prefix = before && !before.endsWith('\n') ? `${before}\n` : before;
  const separator = prefix && !prefix.endsWith('\n\n') ? '\n' : '';
  try {
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    fs.writeFileSync(
      excludePath,
      `${prefix}${separator}# Ultra Builder Pro session authority\n.ultra\n`,
    );
    if (!authorityLinkIsIgnored(worktreePath)) {
      throw new Error('Git still does not ignore the session authority link');
    }
  } catch (error) {
    try {
      if (stat) fs.writeFileSync(excludePath, before);
      else fs.rmSync(excludePath, { force: true });
    } catch { /* best effort */ }
    throw new SessionRunnerError(
      'WORKTREE_AUTHORITY_NOT_IGNORED',
      `cannot establish a safe local ignore rule for .ultra: ${error.message}`,
      { cause: error },
    );
  }
  return { changed: true, path: excludePath };
}

function linkAuthorityIntoWorktree(repoRoot, worktreePath) {
  const authorityDir = path.resolve(repoRoot, '.ultra');
  const stateDbPath = path.join(authorityDir, 'state.db');
  const linkPath = path.join(worktreePath, '.ultra');
  if (!fs.existsSync(stateDbPath)) {
    throw new SessionRunnerError(
      'WORKTREE_AUTHORITY_MISSING',
      `central Ultra authority is missing at ${stateDbPath}`,
    );
  }
  ensureAuthorityLinkIgnored(worktreePath);
  try {
    if (fs.existsSync(linkPath) || fs.lstatSync(linkPath, { throwIfNoEntry: false })) {
      throw new SessionRunnerError(
        'WORKTREE_AUTHORITY_CONFLICT',
        `worktree already contains an .ultra entry at ${linkPath}`,
      );
    }
    fs.symlinkSync(
      process.platform === 'win32' ? authorityDir : path.relative(worktreePath, authorityDir),
      linkPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    if (fs.realpathSync(path.join(linkPath, 'state.db')) !== fs.realpathSync(stateDbPath)) {
      throw new Error('linked state.db does not resolve to the central authority');
    }
    return { authorityDir, stateDbPath, linkPath };
  } catch (error) {
    throw error instanceof SessionRunnerError ? error : new SessionRunnerError(
      'WORKTREE_AUTHORITY_LINK_FAILED',
      `cannot link the worktree to central Ultra authority: ${error.message}`,
      { cause: error },
    );
  }
}

function worktreeRemovalBlocker(repoRoot, worktreePath) {
  if (!fs.existsSync(worktreePath)) return null;
  try {
    const status = execFileSync('git', ['status', '--porcelain=v1'], {
      cwd: worktreePath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (status) return 'worktree contains uncommitted changes';
    const sessionHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: worktreePath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const repositoryHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    execFileSync(
      'git', ['merge-base', '--is-ancestor', sessionHead, repositoryHead],
      { cwd: repoRoot, stdio: ['ignore', 'ignore', 'ignore'] },
    );
    return null;
  } catch (error) {
    if (error.status === 1) return 'worktree commit has not been integrated into the current checkout';
    return `worktree integration could not be verified: ${error.message}`;
  }
}

function changeTaskIntegrationBlocker(db, task, worktreePath) {
  if (!task?.change_id) return null;
  let worktreeHead;
  try {
    worktreeHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    return {
      code: 'WORKTREE_HEAD_UNAVAILABLE',
      message: `cannot verify task worktree HEAD: ${error.message}`,
    };
  }
  if (!task.completion_commit || task.completion_commit !== worktreeHead) {
    return {
      code: 'TASK_COMPLETION_COMMIT_STALE',
      message: `task ${task.id} completion commit does not match worktree HEAD`,
    };
  }
  const dev = workflows.listWorkflows(
    db,
    {
      kind: 'dev',
      status: 'ready',
      change_id: task.change_id,
      task_id: task.id,
      limit: 1,
    },
    { rootDir: worktreePath },
  )[0];
  if (!dev || dev.artifact_health.status !== 'pass') {
    return {
      code: 'DEV_WORKFLOW_NOT_READY',
      message: `task ${task.id} has no current ready dev workflow`,
    };
  }
  try {
    workflows.assertApprovedReview(db, task.change_id, task.id, worktreePath);
  } catch (error) {
    return {
      code: error.code || 'TASK_REVIEW_NOT_CURRENT',
      message: error.message,
    };
  }
  return null;
}

function resolveWorktreeBase(repoRoot, requestedBase) {
  const managedBase = path.resolve(repoRoot, '.ultra', 'worktrees');
  const resolved = requestedBase
    ? path.resolve(repoRoot, requestedBase)
    : managedBase;
  if (resolved !== managedBase && !resolved.startsWith(`${managedBase}${path.sep}`)) {
    throw new SessionRunnerError(
      'WORKTREE_SCOPE_INVALID',
      `worktree_base must stay inside ${managedBase}`,
    );
  }
  return resolved;
}

function mintSessionId() {
  return `sess-${randomUUID().slice(0, 8)}`;
}

function assertSessionTaskReady(db, repoRoot, taskId) {
  const task = ops.readTask(db, taskId);
  if (!task) return null; // admissionCheck reports the canonical TASK_NOT_FOUND error.
  // Unbound rows remain readable for legacy recovery, but every current
  // change-owned task must pass the same plan gate as a dev workflow.
  if (!task.change_id) return task;
  ops.assertTaskExecutionContract(task);
  if (!['pending', 'in_progress', 'blocked'].includes(task.status) || task.stale) {
    throw new workflows.WorkflowStateError(
      'WORKFLOW_TASK_NOT_EXECUTABLE',
      `task ${task.id} is not executable from status ${task.status}${task.stale ? ' (stale)' : ''}`,
    );
  }
  const incompleteDependencies = (task.deps || []).filter((id) => {
    const dependency = ops.readTask(db, id);
    return !dependency || !['completed', 'expanded'].includes(dependency.status);
  });
  if (incompleteDependencies.length > 0) {
    throw new workflows.WorkflowStateError(
      'TASK_DEPENDENCIES_INCOMPLETE',
      `task ${task.id} has incomplete dependencies: ${incompleteDependencies.join(', ')}`,
    );
  }
  workflows.assertCurrentPlan(db, task.change_id, repoRoot);
  return task;
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
  worktree_base = null,
  lease_seconds = 1800,
}) {
  if (!db) throw new SessionRunnerError('VALIDATION_ERROR', 'db handle required');
  if (!repoRoot) throw new SessionRunnerError('VALIDATION_ERROR', 'repoRoot required');
  if (!task_id) throw new SessionRunnerError('VALIDATION_ERROR', 'task_id required');
  if (!runtime) throw new SessionRunnerError('VALIDATION_ERROR', 'runtime required');
  const worktreeBase = resolveWorktreeBase(repoRoot, worktree_base);

  // 1. Admission check
  const verdict = ops.admissionCheck(db, task_id);
  // Circuit breaker trumps takeover — tripped tasks require explicit reset.
  if (verdict.recommended_action === 'blocked_by_breaker') {
    const err = new SessionRunnerError(
      'CIRCUIT_TRIPPED',
      `task ${task_id} is tripped by circuit breaker; call resetCircuitBreaker before spawning`,
    );
    err.verdict = verdict;
    throw err;
  }
  // Validate workflow authority before takeover can terminate the prior worker
  // or any filesystem mutation creates a new worktree.
  assertSessionTaskReady(db, repoRoot, task_id);
  if (!verdict.can_spawn && !takeover) {
    const err = new SessionRunnerError(
      'ADMISSION_DENIED',
      `active session exists for task ${task_id} (${verdict.conflict && verdict.conflict.sid}); recommended=${verdict.recommended_action}`,
    );
    err.verdict = verdict;
    throw err;
  }
  if (!verdict.can_spawn && takeover && verdict.conflict) {
    const priorSession = ops.readSession(db, verdict.conflict.sid);
    if (priorSession?.pid) {
      try { process.kill(priorSession.pid, 'SIGTERM'); }
      catch (error) {
        if (error.code !== 'ESRCH') {
          throw new SessionRunnerError(
            'TAKEOVER_FAILED',
            `cannot terminate prior session ${verdict.conflict.sid}: ${error.message}`,
          );
        }
      }
    }
    ops.updateSession(db, verdict.conflict.sid, { status: 'crashed' });
  }

  // 2. Mint sid + paths
  const sid = mintSessionId();
  const worktree_path = path.join(worktreeBase, sid);
  const artifact_dir = path.join(repoRoot, '.ultra', 'sessions', sid);

  // 3. Git worktree (throws WORKTREE_FAILED on failure)
  gitWorktreeAdd(repoRoot, worktree_path, worktreeRef);
  let authority;
  try {
    authority = linkAuthorityIntoWorktree(repoRoot, worktree_path);
    fs.mkdirSync(artifact_dir, { recursive: true });
  } catch (error) {
    gitWorktreeRemove(repoRoot, worktree_path);
    throw error;
  }

  // 4. Spawn child process (optional — the active host may consume the worktree)
  let proc = null;
  if (command) {
    proc = spawn(command, args, {
      cwd: worktree_path,
      env: {
        ...process.env,
        ...env,
        UBP_SESSION_ID: sid,
        UBP_TASK_ID: task_id,
        UBP_RUNTIME: runtime,
        UBP_WORKTREE: worktree_path,
        UBP_ARTIFACT_DIR: artifact_dir,
        UBP_DB_PATH: authority.stateDbPath,
        UBP_ROOT_DIR: worktree_path,
        UBP_AUTHORITY_ROOT: repoRoot,
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
    try { fs.rmSync(artifact_dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    throw err;
  }

  return {
    sid,
    worktree_path,
    artifact_dir,
    authority_db_path: authority.stateDbPath,
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
  remove_worktree = false,
  kill_signal = 'SIGTERM',
  mineSkill = false,
  skillsRoot = null,
  autoMerge = false,
  mergeBaseBranch = 'main',
} = {}) {
  if (!db || !sid) throw new SessionRunnerError('VALIDATION_ERROR', 'db + sid required');
  const session = ops.readSession(db, sid);
  if (!session) {
    throw new SessionRunnerError('SESSION_NOT_FOUND', `session ${sid} not found`);
  }
  if (remove_worktree && !autoMerge) {
    const blocker = worktreeRemovalBlocker(repoRoot, session.worktree_path);
    if (blocker) {
      throw new SessionRunnerError(
        'WORKTREE_NOT_INTEGRATED',
        `refusing to remove ${session.worktree_path}: ${blocker}`,
      );
    }
  }
  if (session.pid) {
    try { process.kill(session.pid, kill_signal); }
    catch (_) { /* already dead */ }
  }
  // Phase 7.3 — opt-in skill mining reads durable task/session events. It
  // cannot advance task or workflow state.
  if (mineSkill && skillsRoot) {
    try { skillMiner.mineSession(db, { sid, skillsRoot }); }
    catch (err) { process.stderr.write(`skill-miner error: ${err.message}\n`); }
  }
  // Phase 8B.4 — opt-in auto-merge. Conflict preserves worktree for the
  // human; clean/no-op merges fall through to normal removal below.
  let mergeResult;
  let effectiveRemove = remove_worktree;
  if (autoMerge && status === 'completed' && repoRoot && session.worktree_path) {
    const task = session.task_id ? ops.readTask(db, session.task_id) : null;
    if (!task || task.status !== 'completed') {
      mergeResult = {
        merged: false,
        reason: 'task_not_completed',
        task_status: task?.status || null,
      };
      effectiveRemove = false;
    } else {
      const integrationBlocker = changeTaskIntegrationBlocker(
        db,
        task,
        session.worktree_path,
      );
      if (integrationBlocker) {
        mergeResult = {
          merged: false,
          reason: 'workflow_gates_open',
          blocker: integrationBlocker.code,
          message: integrationBlocker.message,
        };
        effectiveRemove = false;
      } else {
        const autoMergeMod = require('./auto-merge.cjs');
        mergeResult = autoMergeMod.autoMerge({
          repoRoot,
          worktreePath: session.worktree_path,
          baseBranch: mergeBaseBranch,
          sid,
          task_id: session.task_id,
          db,
        });
        effectiveRemove = Boolean(
          mergeResult.merged || mergeResult.reason === 'no_changes',
        );
      }
    }
  }
  ops.updateSession(db, sid, { status });
  if (effectiveRemove && repoRoot && session.worktree_path) {
    gitWorktreeRemove(repoRoot, session.worktree_path);
  }
  const out = {
    sid,
    status,
    worktree_preserved: Boolean(
      session.worktree_path && fs.existsSync(session.worktree_path),
    ),
  };
  if (mergeResult) out.merge = mergeResult;
  return out;
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
  EXPECTED_EXECUTION_GATE_CODES,
  isExpectedExecutionGate,
  spawnSession,
  closeSession,
  attachHeartbeat,
  assertSessionTaskReady,
  // exposed for tests
  _internal: {
    gitWorktreeAdd,
    gitWorktreeRemove,
    mintSessionId,
    authorityLinkIsIgnored,
    ensureAuthorityLinkIgnored,
    linkAuthorityIntoWorktree,
    worktreeRemovalBlocker,
    changeTaskIntegrationBlocker,
    resolveWorktreeBase,
  },
};
