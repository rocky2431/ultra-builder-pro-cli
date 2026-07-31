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
const checkpoints = require('../mcp-server/lib/stage-checkpoints.cjs');
const workerPackets = require('../mcp-server/lib/worker-packet.cjs');
const runtimePaths = require('../mcp-server/lib/runtime-paths.cjs');
const gitBootstrap = require('../mcp-server/lib/git-bootstrap.cjs');
const closeJournal = require('./session-close-journal.cjs');

const EXPECTED_EXECUTION_GATE_CODES = new Set([
  'TASK_EXECUTION_CONTRACT_INCOMPLETE',
  'WORKFLOW_TASK_NOT_EXECUTABLE',
  'TASK_DEPENDENCIES_INCOMPLETE',
  'WORKFLOW_PLAN_NOT_COMPLETED',
  'WORKFLOW_PLAN_TASK_SET_STALE',
  'WORKFLOW_PLAN_TASK_CONTRACT_STALE',
  'WORKFLOW_PLAN_CONTEXT_STALE',
  'WORKFLOW_IMPLEMENTATION_CONTEXT_REQUIRED',
  'WORKFLOW_IMPLEMENTATION_CONTEXT_STALE',
  'TASK_NOT_EXECUTABLE',
  'PLAN_CHECKPOINT_REQUIRED',
  'PLAN_TASK_CONTRACT_MISSING',
  'PLAN_TASK_CONTRACT_STALE',
  'IMPLEMENTATION_CONTEXT_REQUIRED',
  'IMPLEMENTATION_CONTEXT_STALE',
  'PLAN_CONTEXT_STALE',
  'WORKER_PACKET_REQUIRED',
  'CONTEXT_REQUIRED_REF_STALE',
  'ADMISSION_DENIED',
  'ACTIVE_SESSION_LEASE_CONFLICT',
  'SESSION_CLOSE_PENDING',
  'CIRCUIT_TRIPPED',
  'LEGACY_RUNTIME_CONFLICT',
  'LEGACY_RUNTIME_MIGRATION_FAILED',
  'RUNTIME_ADMISSION_ROLLBACK_FAILED',
  'RUNTIME_STATE_CONFLICT',
  'RUNTIME_STATE_MIGRATION_FAILED',
  'RUNTIME_STATE_NOT_QUIESCENT',
  'SESSION_CLOSE_JOURNAL_INVALID',
  'SESSION_CLOSE_JOURNAL_CONFLICT',
  'SESSION_CLOSE_CONFLICT',
]);

class SessionRunnerError extends Error {
  constructor(code, message, { cause, details } = {}) {
    super(message);
    this.name = 'SessionRunnerError';
    this.code = code;
    if (cause) this.cause = cause;
    if (details !== undefined) this.details = details;
  }
}

function findExpectedExecutionGate(error) {
  const seen = new Set();
  let current = error;
  while (current && (typeof current === 'object' || typeof current === 'function')) {
    if (seen.has(current)) return null;
    seen.add(current);
    if (EXPECTED_EXECUTION_GATE_CODES.has(current.code)) return current;
    current = current.cause;
  }
  return null;
}

function isExpectedExecutionGate(error) {
  return Boolean(findExpectedExecutionGate(error));
}

function assertSessionId(sid) {
  if (typeof sid !== 'string'
      || sid.length === 0
      || sid.length > 128
      || sid === '.'
      || sid === '..'
      || path.isAbsolute(sid)
      || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sid)) {
    throw new SessionRunnerError(
      'WORKTREE_SCOPE_INVALID',
      `session id is not a safe worktree leaf: ${String(sid)}`,
    );
  }
  return sid;
}

function assertManagedWorktreeRoot(repoRoot, { validateRuntimeTree = true } = {}) {
  const managedBase = runtimePaths.validateProjectLayout(
    repoRoot, { env: {}, validateRuntimeTree },
  ).worktreesDir;
  const stat = fs.lstatSync(managedBase, { throwIfNoEntry: false });
  if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
    throw new SessionRunnerError(
      'WORKTREE_SCOPE_INVALID',
      `managed worktree root must be a real directory: ${managedBase}`,
    );
  }
  return managedBase;
}

function assertManagedWorktreePath(repoRoot, candidate, {
  sid = null,
  validateRuntimeTree = true,
} = {}) {
  if (!repoRoot || typeof candidate !== 'string' || !candidate) {
    throw new SessionRunnerError(
      'WORKTREE_SCOPE_INVALID',
      'repoRoot and a managed worktree path are required',
    );
  }
  const expectedSid = assertSessionId(sid === null ? path.basename(candidate) : sid);
  const managedBase = assertManagedWorktreeRoot(repoRoot, { validateRuntimeTree });
  if (String(candidate).split(/[\\/]+/).includes('..')) {
    throw new SessionRunnerError(
      'WORKTREE_SCOPE_INVALID',
      `worktree path may not contain traversal segments: ${candidate}`,
    );
  }
  const resolved = path.resolve(repoRoot, candidate);
  if (path.basename(resolved) !== expectedSid) {
    throw new SessionRunnerError(
      'WORKTREE_SCOPE_INVALID',
      `worktree path must be the exact managed child for session ${expectedSid}: ${candidate}`,
    );
  }
  const candidateStat = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (candidateStat && (candidateStat.isSymbolicLink() || !candidateStat.isDirectory())) {
    throw new SessionRunnerError(
      'WORKTREE_SCOPE_INVALID',
      `managed worktree path must be a real directory: ${candidate}`,
    );
  }
  const physicalManaged = physicalCandidate(managedBase);
  const physicalResolved = physicalCandidate(resolved);
  const physicalRelative = path.relative(physicalManaged, physicalResolved);
  if (physicalRelative !== expectedSid) {
    throw new SessionRunnerError(
      'WORKTREE_SCOPE_INVALID',
      `worktree path must resolve to the exact managed child ${expectedSid}: ${candidate}`,
    );
  }
  return resolved;
}

function gitWorktreeAdd(repoRoot, worktreePath, ref = 'HEAD') {
  const managedPath = assertManagedWorktreePath(repoRoot, worktreePath, {
    sid: path.basename(worktreePath),
  });
  fs.mkdirSync(path.dirname(managedPath), { recursive: true });
  try {
    execFileSync('git', ['worktree', 'add', '--detach', managedPath, ref], {
      cwd: repoRoot, stdio: 'pipe',
    });
  } catch (err) {
    throw new SessionRunnerError('WORKTREE_FAILED', `git worktree add failed: ${err.stderr ? err.stderr.toString().trim() : err.message}`, { cause: err });
  }
}

function gitWorktreeRemove(repoRoot, worktreePath) {
  const managedPath = assertManagedWorktreePath(repoRoot, worktreePath, {
    sid: path.basename(worktreePath),
    validateRuntimeTree: false,
  });
  try {
    execFileSync('git', ['worktree', 'remove', managedPath], {
      cwd: repoRoot, stdio: 'pipe',
    });
  } catch (error) {
    throw new SessionRunnerError(
      'WORKTREE_FAILED',
      `git worktree remove failed: ${
        error.stderr ? error.stderr.toString().trim() : error.message
      }`,
      { cause: error },
    );
  }
}

function gitWorktreeRegistry(repoRoot) {
  try {
    const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return new Set(output
      .split(/\r?\n/)
      .filter((line) => line.startsWith('worktree '))
      .map((line) => physicalCandidate(line.slice('worktree '.length))));
  } catch (error) {
    throw new SessionRunnerError(
      'WORKTREE_FAILED',
      `git worktree registry read failed: ${
        error.stderr ? error.stderr.toString().trim() : error.message
      }`,
      { cause: error },
    );
  }
}

function removeExactPrunableWorktreeRegistry(repoRoot, managedPath) {
  let reported;
  try {
    reported = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  } catch (error) {
    throw new SessionRunnerError(
      'WORKTREE_FAILED',
      `cannot resolve Git common directory: ${
        error.stderr ? error.stderr.toString().trim() : error.message
      }`,
      { cause: error },
    );
  }
  const commonDir = fs.realpathSync(
    path.isAbsolute(reported) ? reported : path.resolve(repoRoot, reported),
  );
  const registryRoot = path.join(commonDir, 'worktrees');
  const rootStat = fs.lstatSync(registryRoot, { throwIfNoEntry: false });
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    throw new SessionRunnerError(
      'WORKTREE_FAILED',
      `Git still registers ${managedPath}, but its exact worktree metadata root is unavailable`,
    );
  }
  const expected = path.resolve(managedPath);
  const matches = [];
  for (const entry of fs.readdirSync(registryRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const adminDir = path.join(registryRoot, entry.name);
    const gitdirFile = path.join(adminDir, 'gitdir');
    const gitdirStat = fs.lstatSync(gitdirFile, { throwIfNoEntry: false });
    if (!gitdirStat?.isFile() || gitdirStat.isSymbolicLink()) continue;
    const gitdir = fs.readFileSync(gitdirFile, 'utf8').trim();
    if (!gitdir) continue;
    const recorded = path.dirname(
      path.isAbsolute(gitdir) ? path.resolve(gitdir) : path.resolve(adminDir, gitdir),
    );
    if (recorded === expected) matches.push(adminDir);
  }
  if (matches.length !== 1) {
    throw new SessionRunnerError(
      'WORKTREE_FAILED',
      `cannot identify one exact Git registry entry for removed worktree ${managedPath}`,
    );
  }
  fs.rmSync(matches[0], { recursive: true, force: false });
}

function reconcileRemovedWorktree(repoRoot, worktreePath, { sid } = {}) {
  const managedPath = assertManagedWorktreePath(repoRoot, worktreePath, {
    sid: sid || path.basename(worktreePath),
    validateRuntimeTree: false,
  });
  const registryKey = physicalCandidate(managedPath);
  let registry = gitWorktreeRegistry(repoRoot);
  if (fs.existsSync(managedPath)) {
    gitWorktreeRemove(repoRoot, managedPath);
  } else if (registry.has(registryKey)) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', managedPath], {
        cwd: repoRoot,
        stdio: 'pipe',
      });
    } catch {
      removeExactPrunableWorktreeRegistry(repoRoot, managedPath);
    }
  }
  registry = gitWorktreeRegistry(repoRoot);
  if (!fs.existsSync(managedPath) && registry.has(registryKey)) {
    removeExactPrunableWorktreeRegistry(repoRoot, managedPath);
    registry = gitWorktreeRegistry(repoRoot);
  }
  if (registry.has(registryKey)) {
    throw new SessionRunnerError(
      'WORKTREE_FAILED',
      `Git still registers the managed worktree after removal: ${managedPath}`,
    );
  }
  return managedPath;
}

function authorityLinkIsIgnored(worktreePath) {
  try {
    execFileSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--', '.ultra/.runtime'],
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
      `${prefix}${separator}# Ultra Builder Pro shared session runtime\n/.ultra/.runtime\n`,
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
      `cannot establish a safe local ignore rule for .ultra/.runtime: ${error.message}`,
      { cause: error },
    );
  }
  return { changed: true, path: excludePath };
}

function linkAuthorityIntoWorktree(repoRoot, worktreePath, {
  authority: preadmittedAuthority = null,
} = {}) {
  let authority = preadmittedAuthority;
  if (!authority) {
    try {
      authority = runtimePaths.ensureRuntimeState(repoRoot, {
        admitStorageBoundary: () => gitBootstrap.ensureExistingProjectStorageBoundary(repoRoot),
      });
    } catch (error) {
      throw new SessionRunnerError(
        'WORKTREE_AUTHORITY_NOT_IGNORED',
        `cannot establish the project Ultra storage boundary: ${error.message}`,
        { cause: error },
      );
    }
  }
  const authorityDir = authority.runtimeDir;
  const stateDbPath = authority.stateDbPath;
  const worktreeUltraDir = path.join(worktreePath, '.ultra');
  const linkPath = path.join(worktreeUltraDir, '.runtime');
  if (!fs.existsSync(stateDbPath)) {
    throw new SessionRunnerError(
      'WORKTREE_AUTHORITY_MISSING',
      `central Ultra authority is missing at ${stateDbPath}`,
    );
  }
  ensureAuthorityLinkIgnored(worktreePath);
  try {
    fs.mkdirSync(worktreeUltraDir, { recursive: true });
    if (fs.existsSync(linkPath) || fs.lstatSync(linkPath, { throwIfNoEntry: false })) {
      throw new SessionRunnerError(
        'WORKTREE_AUTHORITY_CONFLICT',
        `worktree already contains an .ultra/.runtime entry at ${linkPath}`,
      );
    }
    fs.symlinkSync(
      process.platform === 'win32' ? authorityDir : path.relative(worktreeUltraDir, authorityDir),
      linkPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    if (fs.realpathSync(path.join(linkPath, 'state.db')) !== fs.realpathSync(stateDbPath)) {
      throw new Error('linked state.db does not resolve to the central authority');
    }
    try {
      gitBootstrap.assertUltraStorageBoundary(worktreePath);
    } catch (error) {
      fs.rmSync(linkPath, { force: true });
      throw new SessionRunnerError(
        'WORKTREE_STORAGE_BOUNDARY_STALE',
        `selected worktree revision does not preserve Ultra semantic artifacts: ${error.message}`,
        { cause: error },
      );
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
  const managedPath = assertManagedWorktreePath(repoRoot, worktreePath, {
    sid: path.basename(worktreePath),
  });
  if (!fs.existsSync(managedPath)) return null;
  try {
    const status = execFileSync('git', ['status', '--porcelain=v1'], {
      cwd: managedPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (status) return 'worktree contains uncommitted changes';
    const sessionHead = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: managedPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
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
  const dev = checkpoints.currentCheckpoint(
    db,
    'dev',
    { task_id: task.id },
    { includeDraft: false },
  );
  if (!dev || checkpoints.checkpointDigest(dev) !== dev.digest) {
    return {
      code: 'DEV_CHECKPOINT_NOT_ACCEPTED',
      message: `task ${task.id} has no current accepted Dev checkpoint`,
    };
  }
  const review = checkpoints.currentCheckpoint(
    db,
    'review',
    { task_id: task.id },
    { includeDraft: false },
  );
  if (!review || checkpoints.checkpointDigest(review) !== review.digest) {
    return {
      code: 'REVIEW_CHECKPOINT_NOT_ACCEPTED',
      message: `task ${task.id} has no current accepted Review checkpoint`,
    };
  }
  return null;
}

function physicalCandidate(candidate) {
  let existing = candidate;
  while (!fs.lstatSync(existing, { throwIfNoEntry: false })) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const physicalExisting = fs.realpathSync(existing);
  return path.resolve(physicalExisting, path.relative(existing, candidate));
}

function resolveWorktreeBase(repoRoot, requestedBase) {
  const managedBase = runtimePaths.pathsFor(repoRoot).worktreesDir;
  const resolved = requestedBase
    ? path.resolve(repoRoot, requestedBase)
    : managedBase;
  const physicalManaged = physicalCandidate(managedBase);
  const physicalResolved = physicalCandidate(resolved);
  if (resolved !== path.resolve(managedBase) || physicalResolved !== physicalManaged) {
    throw new SessionRunnerError(
      'WORKTREE_SCOPE_INVALID',
      `worktree_base must be the canonical managed root ${managedBase}`,
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
  if (!['pending', 'in_progress', 'blocked'].includes(task.status) || task.stale) {
    throw new SessionRunnerError(
      'TASK_NOT_EXECUTABLE',
      `task ${task.id} is not executable from status ${task.status}${task.stale ? ' (stale)' : ''}`,
    );
  }
  return task;
}

function assertKernelSessionTaskReady(db, repoRoot, taskId, packetDigest) {
  const task = ops.readTask(db, taskId);
  if (!task) {
    throw new SessionRunnerError('TASK_NOT_FOUND', `task ${taskId} not found`);
  }
  if (!['pending', 'in_progress', 'blocked'].includes(task.status) || task.stale) {
    throw new SessionRunnerError(
      'TASK_NOT_EXECUTABLE',
      `task ${task.id} is not executable from status ${task.status}${task.stale ? ' (stale)' : ''}`,
    );
  }
  const packet = packetDigest
    ? db.prepare(
      `SELECT id FROM worker_packets
       WHERE packet_digest = ? AND scope_type = 'task' AND scope_id = ?
         AND status IN ('pending', 'assigned')`,
    ).get(packetDigest, task.id)
    : null;
  if (!packet) {
    throw new SessionRunnerError(
      'WORKER_PACKET_REQUIRED',
      `task ${task.id} requires the exact Worker Packet prepared for this session`,
    );
  }
  workerPackets.readWorkerPacket(db, packet.id, { rootDir: repoRoot });
  return task;
}

function admissionCheck(db, repoRoot, taskId, options = {}) {
  assertSessionTaskReady(db, repoRoot, taskId);
  const pendingClose = closeJournal.findForTask(repoRoot, taskId);
  if (pendingClose) {
    return {
      can_spawn: false,
      conflict: {
        sid: pendingClose.sid,
        status: 'closing',
        heartbeat_age_ms: 0,
      },
      recommended_action: 'recover_close',
    };
  }
  return ops.admissionCheck(db, taskId, options);
}

function startSessionProcess({
  db,
  repoRoot,
  sid,
  command,
  args = [],
  env = {},
  stdio = 'ignore',
  authority = null,
}) {
  if (!db || !repoRoot || !sid || typeof command !== 'string' || !command.trim()) {
    throw new SessionRunnerError(
      'VALIDATION_ERROR',
      'db, repoRoot, sid, and an executable command are required',
    );
  }
  if (!Array.isArray(args)) {
    throw new SessionRunnerError('VALIDATION_ERROR', 'session process args must be an array');
  }
  const session = ops.readSession(db, sid);
  if (!session) throw new SessionRunnerError('SESSION_NOT_FOUND', `session ${sid} not found`);
  if (session.status !== 'running' || session.pid !== null) {
    throw new SessionRunnerError(
      'SESSION_NOT_STARTABLE',
      `session ${sid} cannot start from status=${session.status}, pid=${String(session.pid)}`,
    );
  }
  const worktreePath = assertManagedWorktreePath(repoRoot, session.worktree_path, { sid });
  const resolvedAuthority = authority || runtimePaths.ensureRuntimeState(repoRoot, {
    admitStorageBoundary: () => gitBootstrap.ensureExistingProjectStorageBoundary(repoRoot),
  });
  let proc;
  try {
    proc = spawn(command, args, {
      cwd: worktreePath,
      env: {
        ...process.env,
        ...env,
        UBP_SESSION_ID: sid,
        UBP_TASK_ID: session.task_id,
        UBP_RUNTIME: session.runtime,
        UBP_WORKTREE: worktreePath,
        UBP_ARTIFACT_DIR: session.artifact_dir,
        UBP_DB_PATH: resolvedAuthority.stateDbPath,
        UBP_ROOT_DIR: worktreePath,
        UBP_AUTHORITY_ROOT: repoRoot,
      },
      stdio,
      detached: false,
    });
    if (Number.isInteger(proc.pid)) {
      ops.updateSession(db, sid, { pid: proc.pid });
    }
    return proc;
  } catch (error) {
    try { if (proc && !proc.killed) proc.kill('SIGTERM'); } catch { /* best effort */ }
    try { ops.updateSession(db, sid, { status: 'crashed' }); } catch { /* preserve original error */ }
    throw error;
  }
}

function spawnSession({
  db,
  repoRoot,
  task_id,
  runtime,
  authority: preadmittedAuthority = null,
  takeover = false,
  command = null,
  args = [],
  env = {},
  stdio = 'ignore',
  worktreeRef = 'HEAD',
  worktree_base = null,
  lease_seconds = 1800,
  mark_task_started = false,
  takeover_timeout_ms = 5000,
  takeover_poll_ms = 25,
  kernel_mode = false,
  packet_digest = null,
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
  if (kernel_mode) assertKernelSessionTaskReady(db, repoRoot, task_id, packet_digest);
  else assertSessionTaskReady(db, repoRoot, task_id);
  let authority = preadmittedAuthority;
  if (!authority) {
    try {
      authority = runtimePaths.ensureRuntimeState(repoRoot, {
        admitStorageBoundary: () => gitBootstrap.ensureExistingProjectStorageBoundary(repoRoot),
      });
    } catch (error) {
      throw new SessionRunnerError(
        'WORKTREE_AUTHORITY_NOT_IGNORED',
        `cannot establish the project Ultra storage boundary: ${error.message}`,
        { cause: error },
      );
    }
  }
  const pendingClose = closeJournal.findForTask(repoRoot, task_id);
  if (pendingClose) {
    throw new SessionRunnerError(
      'SESSION_CLOSE_PENDING',
      `task ${task_id} has an unfinished close intent for session ${pendingClose.sid}; recover it before spawning or taking over`,
    );
  }
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
      if (!waitForProcessExit(priorSession.pid, {
        timeoutMs: takeover_timeout_ms,
        pollMs: takeover_poll_ms,
      })) {
        throw new SessionRunnerError(
          'TAKEOVER_FAILED',
          `prior session ${verdict.conflict.sid} process ${priorSession.pid} did not exit; its lease remains authoritative`,
        );
      }
    }
    ops.updateSession(db, verdict.conflict.sid, { status: 'crashed' });
  }

  // 2. Mint sid + paths
  const sid = mintSessionId();
  const worktree_path = path.join(worktreeBase, sid);
  const artifact_dir = path.join(runtimePaths.pathsFor(repoRoot).sessionsDir, sid);

  // 3. Git worktree (throws WORKTREE_FAILED on failure)
  gitWorktreeAdd(repoRoot, worktree_path, worktreeRef);
  try {
    authority = linkAuthorityIntoWorktree(repoRoot, worktree_path, { authority });
    fs.mkdirSync(artifact_dir, { recursive: true });
  } catch (error) {
    try {
      fs.rmSync(path.join(worktree_path, '.ultra', '.runtime'), { force: true });
    } catch { /* best effort */ }
    gitWorktreeRemove(repoRoot, worktree_path);
    throw error;
  }

  // 4. Persist the task/worktree binding before any worker can run a hook or
  // resolve UBP_DB_PATH. This is the anti-spoof authority hand-off.
  let session;
  try {
    session = ops.createSession(db, {
      sid,
      task_id,
      runtime,
      pid: null,
      worktree_path,
      artifact_dir,
      lease_seconds,
    });
  } catch (err) {
    // state.db insert failed — no worker has started; roll back the worktree.
    gitWorktreeRemove(repoRoot, worktree_path);
    try { fs.rmSync(artifact_dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    throw err;
  }

  // Automated dispatch must publish the running task state before the worker
  // can observe or complete it. Manual host-owned sessions retain the caller's
  // task state unless they explicitly opt into this ordering contract.
  try {
    if (mark_task_started && ops.readTask(db, task_id)?.status === 'pending') {
      ops.updateTaskStatus(db, task_id, 'in_progress');
    }
  } catch (error) {
    try { ops.updateSession(db, sid, { status: 'crashed' }); } catch { /* preserve original error */ }
    try { gitWorktreeRemove(repoRoot, worktree_path); } catch { /* recovery keeps evidence */ }
    try { fs.rmSync(artifact_dir, { recursive: true, force: true }); } catch { /* ignore */ }
    throw error;
  }

  // 5. Spawn child process only after the durable binding exists. The active
  // host may also consume the returned worktree without a child process.
  let proc = null;
  try {
    if (command) {
      proc = startSessionProcess({
        db,
        repoRoot,
        sid,
        command,
        args,
        env,
        stdio,
        authority,
      });
      session = ops.readSession(db, sid);
    }
  } catch (error) {
    ops.updateSession(db, sid, { status: 'crashed' });
    try { gitWorktreeRemove(repoRoot, worktree_path); } catch { /* recovery keeps evidence */ }
    throw error;
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

function processIsExecuting(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code !== 'EPERM') throw error;
  }
  try {
    const state = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return Boolean(state) && !state.startsWith('Z');
  } catch {
    // A failed ps lookup after signal 0 normally means the process vanished.
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code !== 'ESRCH';
    }
  }
}

function waitForProcessExit(pid, {
  timeoutMs = 5000,
  pollMs = 25,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (processIsExecuting(pid)) {
    if (Date.now() >= deadline) return false;
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(4)),
      0,
      0,
      Math.min(pollMs, Math.max(1, deadline - Date.now())),
    );
  }
  return true;
}

function closeSession({
  db,
  repoRoot,
  sid,
}, {
  status = 'completed',
  remove_worktree = false,
  kill_signal = 'SIGTERM',
  autoMerge = false,
  mergeBaseBranch = 'main',
  kill_timeout_ms = 5000,
  kill_poll_ms = 25,
} = {}) {
  if (!db || !sid) throw new SessionRunnerError('VALIDATION_ERROR', 'db + sid required');
  if (!closeJournal.TERMINAL_STATUSES.has(status)) {
    throw new SessionRunnerError(
      'VALIDATION_ERROR',
      `session close status must be completed or crashed, got ${String(status)}`,
    );
  }
  const session = ops.readSession(db, sid);
  if (!session) {
    throw new SessionRunnerError('SESSION_NOT_FOUND', `session ${sid} not found`);
  }
  if (closeJournal.TERMINAL_STATUSES.has(session.status)) {
    if (session.status !== status) {
      throw new SessionRunnerError(
        'SESSION_TERMINAL_CONFLICT',
        `session ${sid} is already ${session.status} and cannot be closed as ${status}`,
      );
    }
    // A terminal row may contain a legacy PID that has since been reused by an
    // unrelated process. Terminal authority is idempotent: never signal that
    // PID, and clear it before reconciling any durable close intent.
    if (session.pid !== null) ops.updateSession(db, sid, { pid: null });
    const intent = repoRoot ? closeJournal.read(repoRoot, sid) : null;
    if (intent) {
      if (intent.requested_status !== status
          || intent.task_id !== session.task_id
          || path.resolve(intent.worktree_path) !== path.resolve(session.worktree_path)) {
        throw new SessionRunnerError(
          'SESSION_CLOSE_JOURNAL_CONFLICT',
          `session ${sid} terminal state conflicts with its durable close intent`,
        );
      }
    }
    if ((intent || remove_worktree) && repoRoot && session.worktree_path) {
      assertManagedWorktreePath(repoRoot, session.worktree_path, { sid: session.sid });
      if (fs.existsSync(session.worktree_path)) {
        const blocker = worktreeRemovalBlocker(repoRoot, session.worktree_path);
        if (blocker) {
          throw new SessionRunnerError(
            'WORKTREE_NOT_INTEGRATED',
            `refusing to remove ${session.worktree_path}: ${blocker}`,
          );
        }
      }
      if (!intent) {
        closeJournal.prepare(repoRoot, {
          sid,
          task_id: session.task_id,
          requested_status: status,
          worktree_path: session.worktree_path,
        });
      }
      try {
        reconcileRemovedWorktree(repoRoot, session.worktree_path, { sid: session.sid });
        closeJournal.update(repoRoot, sid, {
          phase: 'worktree_removed',
          error: null,
        });
        closeJournal.discard(repoRoot, sid);
      } catch (error) {
        closeJournal.update(repoRoot, sid, {
          phase: 'recovery_failed',
          error: error.message,
        });
        throw error;
      }
    }
    return {
      sid,
      status,
      worktree_preserved: Boolean(
        session.worktree_path && fs.existsSync(session.worktree_path),
      ),
    };
  }
  if ((remove_worktree || autoMerge) && session.worktree_path) {
    assertManagedWorktreePath(repoRoot, session.worktree_path, { sid: session.sid });
  }
  let closeIntentPrepared = false;
  if (remove_worktree && !autoMerge && repoRoot && session.worktree_path) {
    closeJournal.prepare(repoRoot, {
      sid,
      task_id: session.task_id,
      requested_status: status,
      worktree_path: session.worktree_path,
    });
    closeIntentPrepared = true;
  }
  if (session.pid) {
    try {
      process.kill(session.pid, kill_signal);
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw new SessionRunnerError(
          'SESSION_TERMINATION_FAILED',
          `cannot signal session ${sid} process ${session.pid}: ${error.message}`,
          { cause: error },
        );
      }
    }
    if (!waitForProcessExit(session.pid, {
      timeoutMs: kill_timeout_ms,
      pollMs: kill_poll_ms,
    })) {
      if (closeIntentPrepared) {
        closeJournal.update(repoRoot, sid, {
          phase: 'worker_running',
          error: `process ${session.pid} did not exit after ${kill_timeout_ms}ms`,
        });
      }
      throw new SessionRunnerError(
        'SESSION_TERMINATION_TIMEOUT',
        `session ${sid} process ${session.pid} did not exit after ${kill_timeout_ms}ms; lease and worktree were preserved`,
      );
    }
    // The owned worker is gone. Clear its reusable OS identifier even if a
    // later merge or worktree gate keeps this close intent recoverable.
    ops.updateSession(db, sid, { pid: null });
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
  if (effectiveRemove && repoRoot && session.worktree_path) {
    const blocker = worktreeRemovalBlocker(repoRoot, session.worktree_path);
    if (blocker) {
      throw new SessionRunnerError(
        'WORKTREE_NOT_INTEGRATED',
        `refusing to remove ${session.worktree_path}: ${blocker}`,
      );
    }
    if (!closeIntentPrepared) {
      closeJournal.prepare(repoRoot, {
        sid,
        task_id: session.task_id,
        requested_status: status,
        worktree_path: session.worktree_path,
      });
      closeIntentPrepared = true;
    }
    try {
      gitWorktreeRemove(repoRoot, session.worktree_path);
      closeJournal.update(repoRoot, sid, {
        phase: 'worktree_removed',
        error: null,
      });
    } catch (error) {
      closeJournal.update(repoRoot, sid, {
        phase: 'removal_failed',
        error: error.message,
      });
      throw error;
    }
  }
  ops.updateSession(db, sid, { status });
  if (effectiveRemove && repoRoot && session.worktree_path) {
    closeJournal.discard(repoRoot, sid);
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
  findExpectedExecutionGate,
  isExpectedExecutionGate,
  spawnSession,
  startSessionProcess,
  closeSession,
  attachHeartbeat,
  admissionCheck,
  assertSessionTaskReady,
  assertKernelSessionTaskReady,
  // exposed for tests
  _internal: {
    gitWorktreeAdd,
    gitWorktreeRemove,
    gitWorktreeRegistry,
    reconcileRemovedWorktree,
    mintSessionId,
    authorityLinkIsIgnored,
    ensureAuthorityLinkIgnored,
    linkAuthorityIntoWorktree,
    worktreeRemovalBlocker,
    changeTaskIntegrationBlocker,
    processIsExecuting,
    waitForProcessExit,
    closeJournal,
    resolveWorktreeBase,
    assertSessionId,
    assertManagedWorktreeRoot,
    assertManagedWorktreePath,
  },
};
