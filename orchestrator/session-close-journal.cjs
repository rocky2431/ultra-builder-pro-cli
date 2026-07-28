'use strict';

const childProcess = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const runtimePaths = require('../mcp-server/lib/runtime-paths.cjs');

const JOURNAL_VERSION = 2;
const LEGACY_JOURNAL_VERSION = 1;
const MAX_JOURNAL_BYTES = 32 * 1024;
const MAX_LOCK_BYTES = 4 * 1024;
const LOCK_VERSION = 2;
const WORKER_FILENAME = 'session-close-journal-worker.cjs';
const TERMINAL_STATUSES = new Set(['completed', 'crashed']);
const JOURNAL_PHASES = new Set([
  'prepared',
  'worker_running',
  'worktree_removed',
  'removal_failed',
  'recovery_failed',
]);
const PHASE_TRANSITIONS = Object.freeze({
  prepared: new Set([
    'worker_running',
    'worktree_removed',
    'removal_failed',
    'recovery_failed',
  ]),
  worker_running: new Set([
    'worktree_removed',
    'removal_failed',
    'recovery_failed',
  ]),
  removal_failed: new Set([
    'worktree_removed',
    'recovery_failed',
  ]),
  worktree_removed: new Set(['recovery_failed']),
  recovery_failed: new Set(),
});
const V1_KEYS = Object.freeze([
  'created_at',
  'error',
  'phase',
  'requested_status',
  'sid',
  'task_id',
  'updated_at',
  'version',
  'worktree_path',
]);
const V2_KEYS = Object.freeze([...V1_KEYS, 'generation'].sort());

class SessionCloseJournalError extends Error {
  constructor(code, message, { cause, details } = {}) {
    super(message);
    this.name = 'SessionCloseJournalError';
    this.code = code;
    if (cause) this.cause = cause;
    if (details) this.details = details;
  }
}

function assertSid(sid) {
  if (typeof sid !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(sid)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `invalid session id for close journal: ${String(sid)}`,
    );
  }
  return sid;
}

function assertTerminalStatus(status) {
  if (!TERMINAL_STATUSES.has(status)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `session close target must be completed or crashed, got ${String(status)}`,
    );
  }
  return status;
}

function journalRoot(repoRoot) {
  return path.join(
    runtimePaths.pathsFor(repoRoot).runtimeDir,
    'recovery',
    'session-close',
  );
}

function journalPath(repoRoot, sid) {
  return path.join(journalRoot(repoRoot), `${assertSid(sid)}.json`);
}

function statIdentity(stat) {
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
  };
}

function identitiesEqual(left, right) {
  return String(left?.dev) === String(right?.dev)
    && String(left?.ino) === String(right?.ino);
}

function assertRuntimeRoot(repoRoot) {
  runtimePaths.validateProjectLayout(repoRoot, {
    env: {},
    validateRuntimeTree: true,
  });
  const runtimeDir = runtimePaths.pathsFor(repoRoot).runtimeDir;
  const stat = fs.lstatSync(runtimeDir, {
    bigint: true,
    throwIfNoEntry: false,
  });
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_UNSAFE',
      `session close runtime root must be a real directory: ${runtimeDir}`,
    );
  }
  return {
    runtimeDir,
    identity: statIdentity(stat),
  };
}

function decodeHelperResult(result) {
  let payload;
  try {
    payload = JSON.parse(String(result.stdout || '').trim());
  } catch (error) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_HELPER_FAILED',
      `session close journal helper returned invalid output: ${String(result.stderr || '').trim()}`,
      { cause: result.error || error },
    );
  }
  if (!payload.ok) {
    throw new SessionCloseJournalError(
      payload.error?.code || 'SESSION_CLOSE_JOURNAL_HELPER_FAILED',
      payload.error?.message || 'session close journal helper failed',
      { details: payload.error?.details },
    );
  }
  return payload.value;
}

function workerPath() {
  const runtimeRoot = process.env.UBP_RUNTIME_ROOT
    ? path.resolve(process.env.UBP_RUNTIME_ROOT)
    : null;
  const candidate = runtimeRoot
    ? path.join(runtimeRoot, 'runtime', WORKER_FILENAME)
    : path.join(__dirname, WORKER_FILENAME);
  const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_HELPER_FAILED',
      `session close journal worker is missing or unsafe: ${candidate}`,
    );
  }
  return candidate;
}

function runHelper(repoRoot, request) {
  const { runtimeDir, identity } = assertRuntimeRoot(repoRoot);
  const result = childProcess.spawnSync(
    process.execPath,
    [workerPath()],
    {
      cwd: runtimeDir,
      input: JSON.stringify({ ...request, runtime_identity: identity }),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_HELPER_FAILED',
      `cannot start session close journal helper: ${result.error.message}`,
      { cause: result.error },
    );
  }
  return decodeHelperResult(result);
}

function prepare(repoRoot, {
  sid,
  task_id,
  requested_status,
  worktree_path,
}) {
  assertSid(sid);
  assertTerminalStatus(requested_status);
  assertBoundedString(task_id, 'task_id', { max: 256 });
  assertBoundedString(worktree_path, 'worktree_path', { max: 4096 });
  return {
    intent: runHelper(repoRoot, {
      op: 'prepare',
      sid,
      task_id,
      requested_status,
      worktree_path: path.resolve(worktree_path),
    }),
    path: journalPath(repoRoot, sid),
  };
}

function read(repoRoot, sid) {
  return runHelper(repoRoot, {
    op: 'read',
    sid: assertSid(sid),
  });
}

function update(repoRoot, sid, patch, {
  expected_generation = null,
} = {}) {
  assertSid(sid);
  return runHelper(repoRoot, {
    op: 'update',
    sid,
    patch,
    expected_generation,
  });
}

function discard(repoRoot, sid, {
  expected_generation = null,
} = {}) {
  assertSid(sid);
  return runHelper(repoRoot, {
    op: 'discard',
    sid,
    expected_generation,
  });
}

function list(repoRoot) {
  return runHelper(repoRoot, { op: 'list' });
}

function findForTask(repoRoot, taskId) {
  return list(repoRoot).find(
    (intent) => intent && intent.task_id === taskId,
  ) || null;
}

function lstatOrNull(candidate) {
  try {
    return fs.lstatSync(candidate, { bigint: true });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertPinnedRuntimeRoot(expected) {
  const actual = statIdentity(fs.statSync('.', { bigint: true }));
  if (!identitiesEqual(actual, expected)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_UNSAFE',
      'session close runtime root changed before it could be pinned',
      { details: { expected, actual } },
    );
  }
}

function ensureAndEnterDirectory(name) {
  let stat = lstatOrNull(name);
  if (!stat) {
    try {
      fs.mkdirSync(name, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    stat = lstatOrNull(name);
  }
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_UNSAFE',
      `session close journal ancestor must be a real directory: ${name}`,
    );
  }
  const expected = statIdentity(stat);
  process.chdir(name);
  const actual = statIdentity(fs.statSync('.', { bigint: true }));
  if (!identitiesEqual(actual, expected)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_UNSAFE',
      `session close journal ancestor changed while entering it: ${name}`,
      { details: { expected, actual } },
    );
  }
}

function enterPinnedJournalRoot(expectedRuntimeIdentity) {
  assertPinnedRuntimeRoot(expectedRuntimeIdentity);
  ensureAndEnterDirectory('recovery');
  ensureAndEnterDirectory('session-close');
}

function assertBoundedString(value, label, {
  max,
  allowEmpty = false,
} = {}) {
  if (typeof value !== 'string'
      || (!allowEmpty && value.length === 0)
      || value.length > max
      || value.includes('\0')) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `session close journal ${label} is invalid`,
    );
  }
  return value;
}

function assertTimestamp(value, label) {
  assertBoundedString(value, label, { max: 64 });
  if (!Number.isFinite(Date.parse(value))) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `session close journal ${label} is not a timestamp`,
    );
  }
  return value;
}

function validateIntent(value, file, expectedSid) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `session close journal must be an object: ${file}`,
    );
  }
  const version = value.version;
  const expectedKeys = version === JOURNAL_VERSION
    ? V2_KEYS
    : version === LEGACY_JOURNAL_VERSION
      ? V1_KEYS
      : null;
  if (!expectedKeys
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `session close journal has an unsupported schema: ${file}`,
    );
  }
  assertSid(value.sid);
  if (expectedSid !== undefined && value.sid !== expectedSid) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `session close journal filename does not match payload SID: ${file}`,
    );
  }
  assertTerminalStatus(value.requested_status);
  assertBoundedString(value.task_id, 'task_id', { max: 256 });
  assertBoundedString(value.worktree_path, 'worktree_path', { max: 4096 });
  if (!path.isAbsolute(value.worktree_path)
      || path.resolve(value.worktree_path) !== value.worktree_path) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `session close journal worktree_path must be canonical and absolute: ${file}`,
    );
  }
  if (!JOURNAL_PHASES.has(value.phase)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `session close journal phase is invalid: ${file}`,
    );
  }
  if (value.error !== null) {
    assertBoundedString(value.error, 'error', { max: 8192, allowEmpty: true });
  }
  assertTimestamp(value.created_at, 'created_at');
  assertTimestamp(value.updated_at, 'updated_at');
  const generation = version === LEGACY_JOURNAL_VERSION ? 0 : value.generation;
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `session close journal generation is invalid: ${file}`,
    );
  }
  return version === LEGACY_JOURNAL_VERSION
    ? { ...value, generation }
    : value;
}

function intentFilename(sid) {
  return `${assertSid(sid)}.json`;
}

function lockFilename(sid) {
  return `${assertSid(sid)}.lock`;
}

function assertIdentity(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['dev', 'ino'])
      || !/^\d{1,32}$/u.test(String(value.dev))
      || !/^\d{1,32}$/u.test(String(value.ino))) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `session close journal ${label} identity is invalid`,
    );
  }
  return {
    dev: String(value.dev),
    ino: String(value.ino),
  };
}

function processStartMarker(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (process.platform === 'linux') {
    try {
      const value = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const close = value.lastIndexOf(')');
      if (close < 0) return null;
      const fields = value.slice(close + 2).trim().split(/\s+/u);
      const startTime = fields[19];
      return startTime ? `linux:${startTime}` : null;
    } catch {
      return null;
    }
  }
  if (process.platform === 'win32') {
    const result = childProcess.spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 2000 },
    );
    const value = String(result.stdout || '').trim();
    return result.status === 0 && /^\d+$/u.test(value) ? `win32:${value}` : null;
  }
  const result = childProcess.spawnSync(
    'ps',
    ['-o', 'lstart=', '-p', String(pid)],
    { encoding: 'utf8', windowsHide: true, timeout: 2000 },
  );
  const value = String(result.stdout || '').trim().replace(/\s+/gu, ' ');
  return result.status === 0 && value ? `${process.platform}:${value}` : null;
}

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function validateLockMetadata(value, file, actualFileIdentity = null) {
  const expectedKeys = [
    'created_at',
    'directory',
    'file',
    'pid',
    'process_start',
    'token',
    'version',
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)
      || value.version !== LOCK_VERSION
      || !Number.isSafeInteger(value.pid)
      || value.pid <= 0) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `session close journal lock has an unsupported schema: ${file}`,
    );
  }
  assertBoundedString(value.process_start, 'lock process_start', { max: 256 });
  assertBoundedString(value.token, 'lock token', { max: 128 });
  assertTimestamp(value.created_at, 'lock created_at');
  const directory = assertIdentity(value.directory, 'lock directory');
  const lockFile = assertIdentity(value.file, 'lock file');
  if (actualFileIdentity && !identitiesEqual(lockFile, actualFileIdentity)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_UNSAFE',
      `session close journal lock inode does not match its metadata: ${file}`,
      { details: { expected: lockFile, actual: actualFileIdentity } },
    );
  }
  return {
    ...value,
    directory,
    file: lockFile,
  };
}

function readLockFile(sid) {
  const file = lockFilename(sid);
  let fd;
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `cannot open session close journal lock ${file}: ${error.message}`,
      { cause: error },
    );
  }
  try {
    const stat = fs.fstatSync(fd, { bigint: true });
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_LOCK_BYTES) {
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_JOURNAL_INVALID',
        `session close journal lock is not a bounded regular file: ${file}`,
      );
    }
    let value;
    try {
      value = JSON.parse(fs.readFileSync(fd, 'utf8'));
    } catch (error) {
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_JOURNAL_INVALID',
        `cannot parse session close journal lock ${file}: ${error.message}`,
        { cause: error },
      );
    }
    const identity = statIdentity(stat);
    return {
      metadata: validateLockMetadata(value, file, identity),
      identity,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function reclaimStaleLock(sid) {
  const existing = readLockFile(sid);
  if (!existing) return true;
  const { metadata, identity } = existing;
  const currentDirectory = statIdentity(fs.statSync('.', { bigint: true }));
  if (!identitiesEqual(metadata.directory, currentDirectory)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_UNSAFE',
      `session ${sid} close journal lock belongs to a different directory`,
    );
  }
  if (pidIsAlive(metadata.pid)) {
    const actualStart = processStartMarker(metadata.pid);
    if (!actualStart || actualStart === metadata.process_start) return false;
  }
  const current = lstatOrNull(lockFilename(sid));
  if (!current || current.isSymbolicLink() || !current.isFile()
      || !identitiesEqual(statIdentity(current), identity)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_UNSAFE',
      `session ${sid} close journal lock changed before stale-owner recovery`,
    );
  }
  fs.unlinkSync(lockFilename(sid));
  syncCurrentDirectory();
  return true;
}

function syncCurrentDirectory() {
  let fd;
  try {
    fd = fs.openSync('.', fs.constants.O_RDONLY);
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function readIntentFile(sid) {
  const file = intentFilename(sid);
  let fd;
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `cannot open session close journal ${file}: ${error.message}`,
      { cause: error },
    );
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_JOURNAL_BYTES) {
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_JOURNAL_INVALID',
        `session close journal is not a bounded regular file: ${file}`,
      );
    }
    let value;
    try {
      value = JSON.parse(fs.readFileSync(fd, 'utf8'));
    } catch (error) {
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_JOURNAL_INVALID',
        `cannot parse session close journal ${file}: ${error.message}`,
        { cause: error },
      );
    }
    return validateIntent(value, file, sid);
  } finally {
    fs.closeSync(fd);
  }
}

function writeTemp(intent, sid) {
  const temporary = `${assertSid(sid)}.${process.pid}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(
      temporary,
      fs.constants.O_WRONLY
        | fs.constants.O_CREAT
        | fs.constants.O_EXCL
        | (fs.constants.O_NOFOLLOW || 0),
      0o600,
    );
    fs.writeFileSync(fd, `${JSON.stringify(intent, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    return temporary;
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* best effort */ }
    }
    try { fs.rmSync(temporary, { force: true }); } catch { /* best effort */ }
    throw error;
  }
}

function writeReplacement(intent, sid) {
  const temporary = writeTemp(intent, sid);
  try {
    fs.renameSync(temporary, intentFilename(sid));
    syncCurrentDirectory();
  } finally {
    try { fs.rmSync(temporary, { force: true }); } catch { /* best effort */ }
  }
}

function sameCloseIdentity(left, right) {
  return left.sid === right.sid
    && left.task_id === right.task_id
    && left.requested_status === right.requested_status
    && left.worktree_path === right.worktree_path;
}

function helperPrepare(request) {
  assertSid(request.sid);
  assertTerminalStatus(request.requested_status);
  assertBoundedString(request.task_id, 'task_id', { max: 256 });
  assertBoundedString(request.worktree_path, 'worktree_path', { max: 4096 });
  const now = new Date().toISOString();
  const candidate = validateIntent({
    version: JOURNAL_VERSION,
    generation: 0,
    sid: request.sid,
    task_id: request.task_id,
    requested_status: request.requested_status,
    worktree_path: request.worktree_path,
    phase: 'prepared',
    error: null,
    created_at: now,
    updated_at: now,
  }, intentFilename(request.sid), request.sid);
  const temporary = writeTemp(candidate, request.sid);
  try {
    try {
      fs.linkSync(temporary, intentFilename(request.sid));
      syncCurrentDirectory();
      return candidate;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = readIntentFile(request.sid);
      if (existing && sameCloseIdentity(existing, candidate)) return existing;
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_CONFLICT',
        `session ${request.sid} already has a different close intent`,
      );
    }
  } finally {
    try { fs.rmSync(temporary, { force: true }); } catch { /* best effort */ }
  }
}

function acquireUpdateLock(sid) {
  const name = lockFilename(sid);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const temporary = `${name}.${process.pid}.${randomUUID()}.tmp`;
    let fd;
    try {
      fd = fs.openSync(
        temporary,
        fs.constants.O_WRONLY
          | fs.constants.O_CREAT
          | fs.constants.O_EXCL
          | (fs.constants.O_NOFOLLOW || 0),
        0o600,
      );
      const processStart = processStartMarker(process.pid);
      if (!processStart) {
        throw new SessionCloseJournalError(
          'SESSION_CLOSE_JOURNAL_UNSAFE',
          'cannot establish the session close journal worker process-start marker',
        );
      }
      const fileIdentity = statIdentity(fs.fstatSync(fd, { bigint: true }));
      const directoryIdentity = statIdentity(fs.statSync('.', { bigint: true }));
      const metadata = validateLockMetadata({
        version: LOCK_VERSION,
        pid: process.pid,
        process_start: processStart,
        token: randomUUID(),
        created_at: new Date().toISOString(),
        directory: directoryIdentity,
        file: fileIdentity,
      }, temporary, fileIdentity);
      fs.writeFileSync(fd, `${JSON.stringify(metadata)}\n`, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.linkSync(temporary, name);
      syncCurrentDirectory();
      fs.unlinkSync(temporary);
      return {
        name,
        identity: fileIdentity,
        token: metadata.token,
      };
    } catch (error) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* best effort */ }
      }
      try { fs.rmSync(temporary, { force: true }); } catch { /* best effort */ }
      if (error.code !== 'EEXIST') {
        throw error;
      }
      if (!reclaimStaleLock(sid)) {
        throw new SessionCloseJournalError(
          'SESSION_CLOSE_CONFLICT',
          `session ${sid} close journal is being updated concurrently`,
        );
      }
    }
  }
  throw new SessionCloseJournalError(
    'SESSION_CLOSE_CONFLICT',
    `session ${sid} close journal lock changed repeatedly during recovery`,
  );
}

function releaseUpdateLock(lock) {
  const current = readLockFile(lock.name.slice(0, -'.lock'.length));
  if (!current) return;
  if (!identitiesEqual(current.identity, lock.identity)
      || current.metadata.token !== lock.token) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_UNSAFE',
      `session close journal lock ownership changed before release: ${lock.name}`,
    );
  }
  const stat = lstatOrNull(lock.name);
  if (!stat || stat.isSymbolicLink() || !stat.isFile()
      || !identitiesEqual(statIdentity(stat), lock.identity)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_UNSAFE',
      `session close journal lock inode changed before release: ${lock.name}`,
    );
  }
  fs.unlinkSync(lock.name);
  syncCurrentDirectory();
}

function withUpdateLock(sid, fn) {
  const lock = acquireUpdateLock(sid);
  let value;
  let operationError = null;
  try {
    value = fn();
  } catch (error) {
    operationError = error;
  }
  try {
    releaseUpdateLock(lock);
  } catch (releaseError) {
    if (!operationError) throw releaseError;
  }
  if (operationError) throw operationError;
  return value;
}

function validateUpdatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      'session close journal update patch must be an object',
    );
  }
  const keys = Object.keys(patch).sort();
  if (keys.length === 0
      || keys.some((key) => !['error', 'phase'].includes(key))
      || !Object.hasOwn(patch, 'phase')) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      'session close journal updates may only set phase and error',
    );
  }
  if (!JOURNAL_PHASES.has(patch.phase)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      `unsupported session close journal phase: ${String(patch.phase)}`,
    );
  }
  if (Object.hasOwn(patch, 'error') && patch.error !== null) {
    assertBoundedString(patch.error, 'error', { max: 8192, allowEmpty: true });
  }
  return patch;
}

function helperUpdate(request) {
  assertSid(request.sid);
  validateUpdatePatch(request.patch);
  if (request.expected_generation !== null
      && (!Number.isSafeInteger(request.expected_generation)
        || request.expected_generation < 0)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      'expected_generation must be a non-negative safe integer',
    );
  }
  return withUpdateLock(request.sid, () => {
    const current = readIntentFile(request.sid);
    if (!current) {
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_JOURNAL_MISSING',
        `session ${request.sid} has no close journal`,
      );
    }
    if (request.expected_generation !== null
        && current.generation !== request.expected_generation) {
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_CONFLICT',
        `session ${request.sid} close journal changed concurrently`,
        {
          details: {
            expected_generation: request.expected_generation,
            actual_generation: current.generation,
          },
        },
      );
    }
    const nextError = Object.hasOwn(request.patch, 'error')
      ? request.patch.error
      : current.error;
    if (request.patch.phase === current.phase) {
      if (nextError === current.error) return current;
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_CONFLICT',
        `session ${request.sid} close journal phase evidence cannot be overwritten`,
      );
    }
    if (!PHASE_TRANSITIONS[current.phase]?.has(request.patch.phase)) {
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_CONFLICT',
        `session ${request.sid} close journal cannot transition from ${current.phase} to ${request.patch.phase}`,
      );
    }
    const next = validateIntent({
      ...current,
      version: JOURNAL_VERSION,
      generation: current.generation + 1,
      phase: request.patch.phase,
      error: nextError,
      updated_at: new Date().toISOString(),
    }, intentFilename(request.sid), request.sid);
    writeReplacement(next, request.sid);
    return next;
  });
}

function helperDiscard(request) {
  assertSid(request.sid);
  if (request.expected_generation !== null
      && (!Number.isSafeInteger(request.expected_generation)
        || request.expected_generation < 0)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      'expected_generation must be a non-negative safe integer',
    );
  }
  return withUpdateLock(request.sid, () => {
    const current = readIntentFile(request.sid);
    if (!current) return false;
    if (request.expected_generation !== null
        && current.generation !== request.expected_generation) {
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_CONFLICT',
        `session ${request.sid} close journal changed before discard`,
      );
    }
    fs.unlinkSync(intentFilename(request.sid));
    syncCurrentDirectory();
    return true;
  });
}

function helperList() {
  const entries = fs.readdirSync('.', { withFileTypes: true })
    .filter((entry) => entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name));
  return entries.map((entry) => {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_JOURNAL_INVALID',
        `session close journal is not a regular file: ${entry.name}`,
      );
    }
    const sid = entry.name.slice(0, -'.json'.length);
    assertSid(sid);
    return readIntentFile(sid);
  });
}

function executeHelper(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new SessionCloseJournalError(
      'SESSION_CLOSE_JOURNAL_INVALID',
      'session close journal helper request must be an object',
    );
  }
  enterPinnedJournalRoot(request.runtime_identity);
  switch (request.op) {
    case 'prepare':
      return helperPrepare(request);
    case 'read':
      return readIntentFile(assertSid(request.sid));
    case 'update':
      return helperUpdate(request);
    case 'discard':
      return helperDiscard(request);
    case 'list':
      return helperList();
    default:
      throw new SessionCloseJournalError(
        'SESSION_CLOSE_JOURNAL_INVALID',
        `unknown session close journal operation: ${String(request.op)}`,
      );
  }
}

function serializeError(error) {
  return {
    code: error?.code || 'SESSION_CLOSE_JOURNAL_HELPER_FAILED',
    message: error?.message || String(error),
    details: error?.details,
  };
}

function helperMain() {
  try {
    const input = fs.readFileSync(0, 'utf8');
    const value = executeHelper(JSON.parse(input));
    process.stdout.write(JSON.stringify({ ok: true, value }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: serializeError(error) }));
    process.exitCode = 1;
  }
}

module.exports = {
  JOURNAL_VERSION,
  JOURNAL_PHASES,
  TERMINAL_STATUSES,
  SessionCloseJournalError,
  journalRoot,
  journalPath,
  prepare,
  read,
  update,
  discard,
  list,
  findForTask,
  _internal: {
    validateIntent,
    runHelper,
    workerPath,
    helperMain,
    enterPinnedJournalRoot,
    acquireUpdateLock,
    processStartMarker,
  },
};
