#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const {
  descendantEnvViews,
  enforcementAdmission,
  hostProfile,
  requiredPacketEnforcementDimensions,
  transportSurface,
} = require('./host-profile.cjs');
const {
  deriveWriterState,
  processStartIdentity,
  readWriterObservationFile,
  selectExecutionDriver,
  signalOutcome,
  validateWriterObservation,
  writeObservationPhase,
} = require('./agent-execution-driver.cjs');

const PERMISSION_SCHEMA = 'ultra-delegation-permission-v1';
const RECEIPT_SCHEMA = 'ultra-delegation-receipt-v1';
const RESULT_SCHEMA = 'ultra-delegation-result-v1';
const FENCE_SCHEMA = 'ultra-delegation-worktree-fence-v1';
const PERMISSION_FIELDS = new Set(['$schema', 'writable_roots', 'external_effects']);
const PROTECTED_ROOT = '.ultra';
const RESULT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    '$schema', 'status', 'summary', 'changed_files', 'checks', 'evidence',
    'questions', 'residual_risks',
  ],
  properties: {
    $schema: { type: 'string', const: RESULT_SCHEMA },
    status: { type: 'string', enum: ['finished', 'blocked', 'failed'] },
    summary: { type: 'string' },
    changed_files: {
      type: 'array', items: { type: 'string' },
    },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['command', 'status', 'output_ref'],
        properties: {
          command: { type: 'string' },
          status: { type: 'string', enum: ['passed', 'failed', 'not_run'] },
          output_ref: { type: 'string' },
        },
      },
    },
    evidence: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
    residual_risks: { type: 'array', items: { type: 'string' } },
  },
});

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Runtime atomic writes replace or refuse a symlinked target; they never
  // follow one to whatever it references outside the delegation directory.
  let existing = null;
  try {
    existing = fs.lstatSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing && (existing.isSymbolicLink() || !existing.isFile())) {
    throw new Error(`refusing to write through a symlinked or non-regular target: ${file}`);
  }
  let mode = null;
  try {
    mode = fs.statSync(file).mode & 0o7777;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = `${file}.tmp-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(temporary, content, mode === null ? undefined : { mode });
    if (mode !== null) fs.chmodSync(temporary, mode);
    // rename replaces the directory entry itself, so a symlink swapped in
    // after the check is replaced rather than followed.
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function runnerCommand(action, delegation = '<delegation-dir>') {
  return [process.execPath, __filename, action, '--delegation', delegation]
    .map((value) => JSON.stringify(String(value)))
    .join(' ');
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function atOrInside(root, candidate) {
  return candidate === root || inside(root, candidate);
}

function sameFileSystemPath(left, right, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  return pathApi.relative(left, right) === '' && pathApi.relative(right, left) === '';
}

function sameFileSystemEntry(left, right, {
  platform = process.platform,
  stat = fs.statSync,
} = {}) {
  try {
    const leftStat = stat(left, { bigint: true });
    const rightStat = stat(right, { bigint: true });
    if (leftStat?.ino !== 0n && rightStat?.ino !== 0n) {
      return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
    }
  } catch {}
  return sameFileSystemPath(left, right, platform);
}

const FENCE_REGISTRY_SEGMENT = path.join('.ultra', '.runtime', 'delegation-fences');
const FENCE_FIELDS = Object.freeze([
  '$schema', 'delegation_id', 'launch_id', 'worktree', 'writable_roots', 'pid', 'created_at',
]);

function fenceFileName(delegationId) {
  const safe = String(delegationId).replace(/[^A-Za-z0-9._-]+/g, '_');
  const identity = crypto.createHash('sha256').update(String(delegationId)).digest('hex').slice(0, 12);
  return `${safe}-${identity}.json`;
}

// Every registry component is created and inspected without following
// symlinks, so a crafted registry path can never redirect a fence outside the
// canonical project root.
function ensureRegistryDirectory(projectRoot) {
  let current = projectRoot;
  for (const segment of FENCE_REGISTRY_SEGMENT.split(path.sep)) {
    const next = path.join(current, segment);
    try {
      fs.mkdirSync(next);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    let stat;
    try {
      stat = fs.lstatSync(next);
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`delegation fence registry component disappeared: ${next}`);
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(
        `delegation fence registry component is not a real directory: ${next}; `
        + 'resolve it before launching another delegation',
      );
    }
    current = next;
  }
  return current;
}

function withFenceRegistryLock(registry, action, {
  lockRetries = 100,
  lockRetryDelayMs = 20,
} = {}) {
  const lockDir = path.join(registry, '.lock');
  let locked = false;
  for (let attempt = 0; attempt <= lockRetries; attempt += 1) {
    try {
      fs.mkdirSync(lockDir);
      locked = true;
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    sleepSync(lockRetryDelayMs);
  }
  if (!locked) throw new Error('delegation fence registry is busy; retry the delegation');
  try {
    return action();
  } finally {
    try { fs.rmdirSync(lockDir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

// Reading a fence entry is itself a trust decision: only an exact-schema,
// no-follow regular file counts as evidence. Anything else — including valid
// JSON with missing, extra, or wrongly typed fields — fails closed.
function readFenceEntry(file, { delegationId = null, launchId = null } = {}) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(
      `delegation fence ${path.basename(file)} is refused: entry is a symlink or not a regular file; `
      + 'resolve it before launching another delegation',
    );
  }
  let fence;
  try {
    fence = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`delegation fence ${path.basename(file)} is unreadable; resolve it before launching another delegation`);
  }
  const invalid = (reason) => new Error(
    `delegation fence ${path.basename(file)} is invalid (${reason}); resolve it before launching another delegation`,
  );
  if (!fence || typeof fence !== 'object' || Array.isArray(fence)) throw invalid('not an object');
  const keys = Object.keys(fence);
  if (keys.length !== FENCE_FIELDS.length || !FENCE_FIELDS.every((field) => keys.includes(field))) {
    throw invalid('exact field set required');
  }
  if (fence.$schema !== FENCE_SCHEMA) throw invalid('schema');
  if (typeof fence.delegation_id !== 'string' || !fence.delegation_id) throw invalid('delegation_id');
  if (typeof fence.launch_id !== 'string' || !fence.launch_id) throw invalid('launch_id');
  if (typeof fence.worktree !== 'string' || !fence.worktree) throw invalid('worktree');
  if (!Array.isArray(fence.writable_roots)
      || !fence.writable_roots.every((root) => typeof root === 'string' && !!root)) {
    throw invalid('writable_roots');
  }
  // A fence names real filesystem roots; a relative or otherwise impossible
  // root is semantically void and must block admission rather than be compared.
  if (!path.isAbsolute(fence.worktree)) throw invalid('worktree must be an absolute path');
  if (!fence.writable_roots.every((root) => path.isAbsolute(root))) {
    throw invalid('writable_roots must be absolute paths');
  }
  if (!(fence.pid === null || (Number.isInteger(fence.pid) && fence.pid > 0))) throw invalid('pid');
  if (typeof fence.created_at !== 'string' || !fence.created_at) throw invalid('created_at');
  if (delegationId !== null && fence.delegation_id !== delegationId) throw invalid('delegation identity mismatch');
  if (launchId !== null && fence.launch_id !== launchId) throw invalid('launch identity mismatch');
  return fence;
}

// One physical writer fence per delegation, acquired atomically under a
// registry directory lock before launch, bound to one random launch identity.
// There is no TTL and no age-based deletion: a fence leaves only through its
// delegation's proven-stopped boundary or launcher-side repair, and an
// existing fence stays held even when its delegation id matches. The fence
// keeps launch/root identity only — worker liveness is never rewritten into
// it after the spawn.
function acquireWorktreeFence(projectRoot, entry, {
  platform = process.platform,
  stat = fs.statSync,
} = {}) {
  const registry = ensureRegistryDirectory(projectRoot);
  return withFenceRegistryLock(registry, () => {
    // Canonicalize through realpath so alias spellings cannot slide past the
    // containment comparison; filesystem identity still backs exact aliases.
    const worktree = canonicalExistingPath(entry.worktree);
    const writableRootPaths = entry.writableRootPaths.map(canonicalExistingPath);
    const candidates = [worktree, ...writableRootPaths];
    for (const name of fs.readdirSync(registry)) {
      if (!name.endsWith('.json')) continue;
      const fence = readFenceEntry(path.join(registry, name));
      if (fence.delegation_id === entry.delegationId) {
        throw new Error(
          `worktree fence conflict: delegation ${entry.delegationId} already holds a fence; `
          + 'cancel it or use a new delegation id',
        );
      }
      const held = [fence.worktree, ...fence.writable_roots];
      for (const existing of held) {
        for (const candidate of candidates) {
          if (fencePathsOverlap(existing, candidate, { platform, stat })) {
            throw new Error(
              `worktree fence conflict: ${candidate} overlaps ${existing} held by delegation ${fence.delegation_id}; `
              + 'wait for it, cancel it, or use a disjoint worktree',
            );
          }
        }
      }
    }
    const file = path.join(registry, fenceFileName(entry.delegationId));
    let fd;
    try {
      // 'wx' creation cannot follow a symlinked entry: an existing path of any
      // kind fails here instead of writing outside the registry.
      fd = fs.openSync(file, 'wx', 0o600);
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(
          `worktree fence conflict: delegation ${entry.delegationId} already holds a fence; `
          + 'cancel it or use a new delegation id',
        );
      }
      throw error;
    }
    try {
      fs.writeFileSync(fd, `${JSON.stringify({
        $schema: FENCE_SCHEMA,
        delegation_id: entry.delegationId,
        launch_id: entry.launchId,
        worktree,
        writable_roots: writableRootPaths,
        pid: entry.pid ?? null,
        created_at: new Date().toISOString(),
      }, null, 2)}\n`);
    } finally {
      fs.closeSync(fd);
    }
    return { file, registry };
  });
}

function releaseWorktreeFence(projectRoot, delegationId, { launchId = null } = {}) {
  const registry = ensureRegistryDirectory(projectRoot);
  return withFenceRegistryLock(registry, () => {
    const file = path.join(registry, fenceFileName(delegationId));
    const fence = readFenceEntry(file, { delegationId, launchId });
    if (!fence) return false;
    fs.unlinkSync(file);
    return true;
  });
}

function fenceHeldForLaunch(projectRoot, delegationId, launchId) {
  const registry = ensureRegistryDirectory(projectRoot);
  return withFenceRegistryLock(registry, () => {
    const file = path.join(registry, fenceFileName(delegationId));
    const fence = readFenceEntry(file, { delegationId, launchId });
    return fence !== null;
  });
}

function normalizedRootKey(value, platform = process.platform) {
  const api = platform === 'win32' ? path.win32 : path.posix;
  let key = api.normalize(String(value)).replace(/\\/g, '/');
  if (platform === 'win32') key = key.toLowerCase();
  return key.replace(/\/+$/, '') || '/';
}

// Roots conflict when they name the same filesystem entry (dev/ino identity
// covers symlink and 8.3-style aliases) or when one contains the other
// lexically after platform normalization covers Windows case and separator
// spellings.
function fencePathsOverlap(left, right, { platform = process.platform, stat = fs.statSync } = {}) {
  if (sameFileSystemEntry(left, right, { platform, stat })) return true;
  const leftKey = normalizedRootKey(left, platform);
  const rightKey = normalizedRootKey(right, platform);
  return leftKey === rightKey || leftKey.startsWith(`${rightKey}/`) || rightKey.startsWith(`${leftKey}/`);
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function canonicalExistingPath(value) {
  let current = value;
  const suffix = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...suffix);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return value;
    suffix.unshift(path.basename(current));
    current = parent;
  }
}

function readWriterObservation(file) {
  return readWriterObservationFile(file);
}

function writerBoundaryState(delegationRoot, identity) {
  const file = path.join(delegationRoot, 'writer.json');
  const observation = fs.existsSync(file) ? readWriterObservation(file) : null;
  // Missing, unreadable, invalid, mismatched, or launching evidence is
  // unknown; only a valid explicit not_started or proven-stopped boundary
  // counts as stopped.
  return deriveWriterState(observation, { identity });
}

function writerObservationSnapshot(delegationRoot, identity) {
  const file = path.join(delegationRoot, 'writer.json');
  const observation = fs.existsSync(file) ? readWriterObservation(file) : null;
  const validated = validateWriterObservation(observation, identity);
  if (!validated) return { state: 'unknown' };
  return {
    state: deriveWriterState(validated, { identity }),
    phase: validated.phase,
    pid: validated.pid,
    pgid: validated.pgid,
    platform: validated.platform,
    started_at: validated.started_at,
  };
}

// The start-identity schema types this product defines. A structurally valid
// identity of any other type is a malformed recovery fact, not a weaker fact
// to interpret; the set grows only when a new portable identity mechanism is
// introduced with its own contract.
const KNOWN_START_IDENTITY_TYPES = new Set(['linux_procfs_starttime']);

function validStartIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.type !== 'string' || !value.type) return null;
  if (typeof value.value !== 'string' || !value.value) return null;
  return value;
}

// A recovery fact may carry only a structurally valid identity of a known
// schema type; anything else is malformed and fails closed before status,
// cancel, or spec consumption may act on the facts.
function knownStartIdentity(value) {
  const identity = validStartIdentity(value);
  return identity !== null && KNOWN_START_IDENTITY_TYPES.has(identity.type);
}

// One conservative recovery view assembled from every available lock/receipt
// fact. Malformed facts — and any delegation, launch, spec-digest, worker-pid,
// or worker-identity conflict between the lock and receipt — fail closed
// before status, cancel, or spec consumption may act on them. Absent optional
// facts stay absent; only contradictions are refused.
function loadRecoveryFacts(root) {
  const delegationId = path.basename(root);
  const lockFile = path.join(root, 'run.lock');
  const receiptFile = path.join(root, 'receipt.json');
  const invalid = (reason) => new Error(
    `delegation ${reason}; resolve the conflicting recovery facts before retrying`,
  );
  let lock = null;
  if (fs.existsSync(lockFile)) {
    let parsed;
    try {
      parsed = readJson(lockFile);
    } catch {
      throw invalid('run.lock is malformed');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw invalid('run.lock is malformed');
    }
    if (parsed.delegation_id !== undefined && parsed.delegation_id !== delegationId) {
      throw invalid('lock delegation identity conflicts with the delegation directory');
    }
    if (parsed.launch_id !== undefined && (typeof parsed.launch_id !== 'string' || !parsed.launch_id)) {
      throw invalid('lock launch identity is malformed');
    }
    if (parsed.spec_digest !== undefined && !/^[0-9a-f]{64}$/u.test(String(parsed.spec_digest))) {
      throw invalid('lock spec digest is malformed');
    }
    if (!(parsed.pid === null || parsed.pid === undefined
        || (Number.isInteger(parsed.pid) && parsed.pid > 0))) {
      throw invalid('lock worker pid is malformed');
    }
    if (parsed.worker_start_identity != null
        && !knownStartIdentity(parsed.worker_start_identity)) {
      throw invalid('lock worker start identity is malformed');
    }
    lock = parsed;
  }
  let receipt = null;
  if (fs.existsSync(receiptFile)) {
    let parsed;
    try {
      parsed = readJson(receiptFile);
    } catch {
      throw invalid('receipt.json is malformed');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw invalid('receipt.json is malformed');
    }
    if (parsed.delegation_id !== undefined && parsed.delegation_id !== delegationId) {
      throw invalid('receipt delegation identity conflicts with the delegation directory');
    }
    if (parsed.launch_id !== undefined && (typeof parsed.launch_id !== 'string' || !parsed.launch_id)) {
      throw invalid('receipt launch identity is malformed');
    }
    if (parsed.spec_digest !== undefined && !/^[0-9a-f]{64}$/u.test(String(parsed.spec_digest))) {
      throw invalid('receipt spec digest is malformed');
    }
    if (parsed.worker_pid !== undefined && !(Number.isInteger(parsed.worker_pid) && parsed.worker_pid > 0)) {
      throw invalid('receipt worker pid is malformed');
    }
    if (parsed.worker_start_identity != null
        && !knownStartIdentity(parsed.worker_start_identity)) {
      throw invalid('receipt worker start identity is malformed');
    }
    receipt = parsed;
  }
  if (lock && receipt) {
    if (lock.launch_id && receipt.launch_id && lock.launch_id !== receipt.launch_id) {
      throw invalid('lock and receipt launch identities conflict');
    }
    if (lock.spec_digest && receipt.spec_digest && lock.spec_digest !== receipt.spec_digest) {
      throw invalid('lock and receipt spec digests conflict');
    }
    if (Number.isInteger(lock.pid) && lock.pid > 0
        && Number.isInteger(receipt.worker_pid) && lock.pid !== receipt.worker_pid) {
      throw invalid('lock and receipt worker pids conflict');
    }
    const lockIdentity = validStartIdentity(lock.worker_start_identity);
    const receiptIdentity = validStartIdentity(receipt.worker_start_identity);
    if (lockIdentity && receiptIdentity
        && (lockIdentity.type !== receiptIdentity.type || lockIdentity.value !== receiptIdentity.value)) {
      throw invalid('lock and receipt worker start identities conflict');
    }
  }
  return { lock, receipt, lockFile, receiptFile };
}

function recoveryIdentity(root, facts) {
  const launchId = facts?.lock?.launch_id || facts?.receipt?.launch_id || null;
  return launchId ? { delegationId: path.basename(root), launchId } : null;
}

// The outer worker uses the same conservative three-state vocabulary as the
// inner writer boundary: alive, stopped, or unknown. A launch-bound recovery
// record with no claimed worker pid is the post-spawn/pre-claim window — the
// worker may exist unobserved, so it is unknown, never stopped. Only a dead
// pid, or a recorded known identity whose observable current identity of the
// same type carries a different value (proving pid reuse), proves stopped. An
// unavailable current identity or a type mismatch is unknown. A live pid with
// no recorded identity keeps raw liveness as the retained weaker non-Linux
// fallback. The signal itself shares the inner-boundary outcome helper: only
// ESRCH proves a pid dead, EPERM keeps a proven-existing worker alive, and
// any other unprovable outcome stays unknown — none may release the boundary
// as stopped.
function outerWorkerView({ lock, receipt } = {}, { kill = process.kill } = {}) {
  const pid = Number.isInteger(lock?.pid) && lock.pid > 0 ? lock.pid
    : Number.isInteger(receipt?.worker_pid) && receipt.worker_pid > 0 ? receipt.worker_pid : null;
  if (pid === null) {
    return { state: lock || receipt ? 'unknown' : 'stopped', pid: null };
  }
  const signal = signalOutcome(pid, kill);
  if (signal === 'dead') return { state: 'stopped', pid };
  if (signal === 'unknown') return { state: 'unknown', pid };
  const recorded = validStartIdentity(lock?.worker_start_identity)
    || validStartIdentity(receipt?.worker_start_identity) || null;
  if (recorded) {
    const current = processStartIdentity(pid);
    if (!current || current.type !== recorded.type) return { state: 'unknown', pid };
    return {
      state: current.value === recorded.value ? 'alive' : 'stopped',
      pid,
    };
  }
  return { state: 'alive', pid };
}

// Launcher recovery consumes worker-spec fields only when a valid launch-bound
// 64-hex digest exists in the receipt or lock and the current bytes still
// match it; a drifted or unbound spec is refused rather than trusted.
function loadRecoverySpec(root, { receipt = null, lock = null } = {}) {
  const specFile = path.join(root, 'worker-spec.json');
  if (!fs.existsSync(specFile)) return null;
  const expected = [
    typeof receipt?.spec_digest === 'string' ? receipt.spec_digest : null,
    typeof lock?.spec_digest === 'string' ? lock.spec_digest : null,
  ].find((value) => /^[0-9a-f]{64}$/u.test(value)) ?? null;
  if (expected === null) {
    throw new Error(
      'no launch-bound worker spec digest exists; refusing to consume the delegation spec; '
      + 'the worktree fence is retained',
    );
  }
  if (sha256(specFile) !== expected) {
    throw new Error(
      'worker spec digest no longer matches its launch-bound receipt/lock; '
      + 'refusing to consume the delegation spec; the worktree fence is retained',
    );
  }
  return readJson(specFile);
}

function projectPath(projectRoot, value, label, { directory = false } = {}) {
  const lexical = path.resolve(projectRoot, value);
  const resolved = fs.existsSync(lexical) ? fs.realpathSync(lexical) : lexical;
  if (!inside(projectRoot, resolved)) throw new Error(`${label} must be inside the current project`);
  if (directory && (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory())) {
    throw new Error(`${label} must be an existing directory`);
  }
  return resolved;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function observedChangedFiles(cwd, baseHead) {
  const run = (args) => execFileSync('git', args, {
    cwd,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString('utf8').split('\0').filter(Boolean);
  return [...new Set([
    ...run(['diff', '--name-only', '-z', baseHead, '--']),
    ...run(['ls-files', '--others', '--exclude-standard', '-z']),
  ].map((file) => file.split(path.sep).join('/')))].sort();
}

function validateWorktree(worktree) {
  let top;
  try {
    top = fs.realpathSync(git(worktree, ['rev-parse', '--show-toplevel']));
  } catch {
    throw new Error('worktree must be a real Git worktree');
  }
  if (!sameFileSystemEntry(top, worktree)) {
    throw new Error('worktree must be the root of a real Git worktree');
  }
  const registered = git(worktree, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .some((entry) => {
      try { return sameFileSystemEntry(fs.realpathSync(entry), worktree); } catch { return false; }
    });
  if (!registered) throw new Error('worktree is not registered as a Git worktree');
  const dirty = git(worktree, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (dirty) throw new Error('delegated Git worktree must start clean');
  return git(worktree, ['rev-parse', 'HEAD']);
}

function readPermission(file, worktree) {
  let payload;
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
    payload = JSON.parse(source);
  } catch {
    throw new Error('permission must be valid JSON');
  }
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new Error('permission must be a JSON object');
  }
  for (const key of Object.keys(payload)) {
    if (!PERMISSION_FIELDS.has(key)) throw new Error(`unknown permission field: ${key}`);
  }
  if (payload.$schema !== PERMISSION_SCHEMA) {
    throw new Error(`permission $schema must be ${PERMISSION_SCHEMA}`);
  }
  if (!Array.isArray(payload.writable_roots)) {
    throw new Error('permission writable_roots must be an array');
  }
  const writableRoots = [];
  const writableRootPaths = [];
  for (const value of payload.writable_roots) {
    if (typeof value !== 'string' || !value.trim() || path.isAbsolute(value)) {
      throw new Error('permission writable_roots entries must be relative non-empty paths');
    }
    const resolved = path.resolve(worktree, value);
    if (!atOrInside(worktree, resolved)) {
      throw new Error('permission writable_roots must stay inside the delegated worktree');
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`permission writable_roots entry must be an existing directory: ${value}`);
    }
    const real = fs.realpathSync(resolved);
    if (!atOrInside(worktree, real)) {
      throw new Error('permission writable_roots must not escape through symlinks');
    }
    const normalized = path.relative(worktree, real).split(path.sep).join('/') || '.';
    // `.ultra` is the project's memory and has exactly one writer: the primary host.
    // Rejected here so the delegation never starts, and again against the actual diff
    // in the worker, which also covers the `.` grant.
    if (normalized === PROTECTED_ROOT || normalized.startsWith(`${PROTECTED_ROOT}/`)) {
      throw new Error(`permission writable_roots must not include ${PROTECTED_ROOT}; the primary host is its only writer`);
    }
    if (!writableRoots.includes(normalized)) {
      writableRoots.push(normalized);
      writableRootPaths.push(real);
    }
  }
  if (!Array.isArray(payload.external_effects)) {
    throw new Error('permission external_effects must be an array');
  }
  if (payload.external_effects.length !== 0) {
    throw new Error('permission external_effects must be empty; the primary host performs separately authorized effects');
  }
  return {
    writableRoots,
    writableRootPaths,
    source,
    digest: crypto.createHash('sha256').update(source).digest('hex'),
  };
}

function delegatePrompt({
  instructionSource, instructionDigest, permissionSource, permissionDigest,
  worktree, readOnly,
}) {
  return [
    'Execute one bounded Ultra Builder Pro delegation in the isolated Git worktree.',
    'The launcher embedded the digest-bound packet below. Do not access packet paths outside the worktree.',
    `Instruction SHA-256: ${instructionDigest}`,
    '--- instruction.md ---',
    instructionSource.trimEnd(),
    '--- end instruction.md ---',
    `Permission SHA-256: ${permissionDigest}`,
    '--- permission.json ---',
    permissionSource.trimEnd(),
    '--- end permission.json ---',
    `Use this worktree as the only filesystem boundary: ${worktree}`,
    readOnly
      ? 'This is read-only delegation. Do not create, modify, or delete any project file.'
      : 'Modify only paths covered by permission.writable_roots.',
    'Do not perform external effects, edit the primary checkout, or change Ultra task authority.',
    'Batch independent reads in the earliest tool turn. Do not emit a preliminary result, and reserve a final turn for the one terminal JSON response.',
    `Return exactly one JSON object as the final response using $schema ${RESULT_SCHEMA}.`,
    'The exact fields are $schema, status, summary, changed_files, checks, evidence, questions, and residual_risks.',
    'status is finished, blocked, or failed. blocked requires at least one question.',
    'changed_files must exactly list every repository-relative path changed in the worktree.',
    'checks items use command, status (passed, failed, or not_run), and output_ref. Use a short evidence reference when no file exists.',
    'Do not write the receipt yourself. The launcher validates structured output, process exit, permissions, and the actual Git diff before publication.',
  ].join('\n');
}

function selectedBinary(runtime, fallback) {
  return process.env[`UBP_DELEGATE_${runtime.toUpperCase()}_BIN`] || fallback;
}

function selectedModel(runtime, explicit) {
  return explicit || process.env[`UBP_DELEGATE_${runtime.toUpperCase()}_MODEL`] || null;
}

function parsePairs(argv, allowed) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || value === undefined || value === '') {
      throw new Error(`invalid delegate argument: ${key || '<missing>'}`);
    }
    if (values[key]) throw new Error(`duplicate delegate argument: ${key}`);
    values[key] = value;
  }
  return values;
}

function parseRun(argv) {
  // --ack-experimental is the one valueless flag: launching an experimental
  // transport must be a visible choice, never a silent default.
  const ackExperimental = argv.includes('--ack-experimental');
  const pairs = argv.filter((arg) => arg !== '--ack-experimental');
  const values = parsePairs(pairs, new Set([
    '--to', '--instruction', '--permission', '--worktree', '--timeout', '--model',
  ]));
  for (const key of ['--to', '--instruction', '--permission', '--worktree']) {
    if (!values[key]) throw new Error(`delegate run requires ${key}`);
  }
  const timeout = values['--timeout'] === undefined ? 1800 : Number(values['--timeout']);
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 86400) {
    throw new Error('delegate --timeout must be greater than 0 and at most 86400 seconds');
  }
  return {
    to: values['--to'], instruction: values['--instruction'],
    permission: values['--permission'], worktree: values['--worktree'],
    model: values['--model'] || null,
    timeoutMs: Math.ceil(timeout * 1000),
    ackExperimental,
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// One stable typed pre-launch admission failure. It is thrown before the
// worktree fence, the worker spec, the worker, or any Host process exists, so
// an unqualified Host transport can never launch and never falls back
// silently to another transport or Host. The decision carries only retained
// redacted facts: dimension names, statuses, bases, and the evidence binding.
class HostEnforcementUnavailableError extends Error {
  constructor(host, admission, { transportSurface: surface = null, maturity = null } = {}) {
    const dimensions = (admission.dimensions || [])
      .map((entry) => `${entry.dimension} (${entry.status})`)
      .join(', ');
    super(
      `host enforcement unavailable: delegate --to ${host} transport ${admission.transport}`
      + `${maturity ? ` (${maturity})` : ''} is not admitted for this packet;`
      + ` required dimensions fail against the retained exact-version qualification: ${dimensions}.`
      + ' Provider transport for the qualification call was separately authorized only and'
      + ' never grants Worker effects; no silent fallback to another transport or host occurred.'
      + ` Evidence: ${admission.evidence?.ref ?? 'none retained'}.`,
    );
    this.name = 'HostEnforcementUnavailableError';
    this.code = 'UBP_HOST_ENFORCEMENT_UNAVAILABLE';
    this.admission = admission;
    this.transportSurface = surface;
  }
}

// One stable, redacted, machine-readable failure projection shared by both
// public process boundaries (the installed Skill runner and the `ubp
// delegate` compatibility launcher). Only the known typed pre-launch refusal
// is projected; every other error stays generic prose so an unrelated launch
// failure can never masquerade as the enforcement gate. The projection
// carries only retained facts and the bounded human recovery message — never
// environment or secret values.
const FAILURE_DIAGNOSTIC_SCHEMA = 'ultra-delegation-failure-diagnostic-v1';

function failureDiagnostic(error) {
  if (!error || typeof error !== 'object'
      || error.code !== 'UBP_HOST_ENFORCEMENT_UNAVAILABLE'
      || !error.admission || typeof error.admission !== 'object') {
    return null;
  }
  return {
    $schema: FAILURE_DIAGNOSTIC_SCHEMA,
    code: error.code,
    error: String(error.admission.code ?? 'host_enforcement_unavailable'),
    message: String(error.message),
    admission: error.admission,
  };
}

function failureDiagnosticLine(error) {
  const diagnostic = failureDiagnostic(error);
  return diagnostic ? `${JSON.stringify(diagnostic)}\n` : null;
}

// The one real detached delegate-worker launch entry. The programmatic
// `spawnWorker` option on run() may wrap this seam to observe the exact
// environment handed to the OS for the actual launch; the default always
// performs the real detached spawn itself.
function launchDelegateWorker(specFile, specDigest, env, cwd) {
  return spawn(process.execPath, [
    path.join(__dirname, 'delegate-worker.cjs'), specFile, specDigest,
  ], {
    cwd,
    detached: true,
    stdio: 'ignore',
    env,
  });
}

function run(argv, {
  projectRoot = process.cwd(),
  resolveHostProfile = hostProfile,
  chooseExecutionDriver = selectExecutionDriver,
  spawnWorker = launchDelegateWorker,
  faults = null,
} = {}) {
  const args = parseRun(argv);
  projectRoot = fs.realpathSync(projectRoot);
  const profile = resolveHostProfile(args.to);
  if (args.model && !profile.supportsModelSelection) {
    throw new Error(`delegate --model is not supported by host ${args.to}`);
  }
  const model = profile.supportsModelSelection ? selectedModel(args.to, args.model) : null;
  const binary = selectedBinary(args.to, profile.binary);
  const transportMaturity = profile.transportMaturity;
  const instruction = projectPath(projectRoot, args.instruction, 'instruction');
  const permission = projectPath(projectRoot, args.permission, 'permission');
  const worktree = projectPath(projectRoot, args.worktree, 'worktree', { directory: true });
  if (!fs.statSync(instruction).isFile()) throw new Error('instruction must be a file');
  if (!fs.statSync(permission).isFile()) throw new Error('permission must be a file');
  if (path.dirname(instruction) !== path.dirname(permission)) {
    throw new Error('instruction and permission must share one delegation directory');
  }
  const baseHead = validateWorktree(worktree);
  const permissionContract = readPermission(permission, worktree);
  const instructionSource = fs.readFileSync(instruction, 'utf8');
  const delegationRoot = path.dirname(instruction);
  const delegationId = path.basename(delegationRoot);
  const result = path.join(delegationRoot, 'result.json');
  const receiptFile = path.join(delegationRoot, 'receipt.json');
  const stdout = path.join(delegationRoot, 'stdout.log');
  const stderr = path.join(delegationRoot, 'stderr.log');
  const spec = path.join(delegationRoot, 'worker-spec.json');
  const outputSchema = path.join(delegationRoot, 'result-schema.json');
  const hostOutput = path.join(delegationRoot, 'host-result.json');
  const events = path.join(delegationRoot, 'events.jsonl');
  const lock = path.join(delegationRoot, 'run.lock');
  const cancel = path.join(delegationRoot, 'cancel.request');
  const writerObservation = path.join(delegationRoot, 'writer.json');
  if (fs.existsSync(result)) throw new Error('delegation result.json already exists; use a new delegation id');
  if (fs.existsSync(lock)) throw new Error('delegation is already running');
  // A leftover cancel request is a prior run's artifact: a new launch would
  // either ignore its signal or race the stale one, so it blocks admission.
  if (fs.existsSync(receiptFile) || fs.existsSync(spec) || fs.existsSync(outputSchema)
    || fs.existsSync(hostOutput) || fs.existsSync(events) || fs.existsSync(writerObservation)
    || fs.existsSync(cancel)) {
    throw new Error('delegation id already has run artifacts; cancel or use a new delegation id');
  }
  let lockFd;
  try {
    lockFd = fs.openSync(lock, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('delegation is already running');
    throw error;
  }
  const startedAt = new Date().toISOString();
  // One random launch identity binds the observation, lock, receipt, worker
  // spec, and fence of this exact launch together.
  const launchId = crypto.randomUUID();
  const instructionDigest = crypto.createHash('sha256').update(instructionSource).digest('hex');
  const permissionDigest = permissionContract.digest;
  const identity = { delegationId, launchId };
  const injectedFault = (seam) => {
    if (Array.isArray(faults) && faults.includes(seam)) {
      throw new Error(`injected fault: ${seam}`);
    }
  };
  let fence = null;
  let spawned = false;
  try {
    writeAtomic(outputSchema, `${JSON.stringify(RESULT_JSON_SCHEMA, null, 2)}\n`);
    fs.chmodSync(outputSchema, 0o600);
    const outputSchemaDigest = sha256(outputSchema);
    const envViews = descendantEnvViews(process.env, profile, {
      packetEnv: {
        UBP_DELEGATE_INSTRUCTION_FILE: instruction,
        UBP_DELEGATE_PERMISSION_FILE: permission,
        UBP_DELEGATE_WORKTREE: worktree,
      },
    });
    const profileOptions = {
      readOnly: permissionContract.writableRoots.length === 0,
      writableRoots: permissionContract.writableRoots,
      schemaFile: outputSchema,
      schemaJson: JSON.stringify(RESULT_JSON_SCHEMA),
      hostOutput,
      model,
    };
    const prompt = delegatePrompt({
      instructionSource,
      instructionDigest,
      permissionSource: permissionContract.source,
      permissionDigest,
      worktree,
      readOnly: profileOptions.readOnly,
    });
    // The experimental-maturity disclosure gate is a pure refusal: it must
    // fire before driver selection can run any process-backed identity
    // probe. It names the transport this launch would prefer — ACP-first, or
    // the CLI transport when the operator forced it.
    const forcedCli = envViews.probe.ULTRA_DELEGATE_FORCE_CLI === '1';
    const preferredSurface = !forcedCli && profile.acp && typeof profile.acp === 'object'
      ? profile.acp.surface
      : transportSurface(args.to, binary);
    if (transportMaturity === 'experimental' && !args.ackExperimental) {
      throw new Error(
        `delegate --to ${args.to} would launch ${preferredSurface}. `
        + 'This transport is experimental (verified-local only; the provider publishes no '
        + 'stability contract), and it is not the documented ZCode Desktop interactive '
        + 'surface. Acknowledge explicitly with --ack-experimental to proceed, or pick a '
        + 'documented transport.',
      );
    }
    // Fail-closed host enforcement admission starts from pure, version-bound
    // capability facts: when every transport this launch could still select
    // is unavailable, the typed refusal is already stable and happens before
    // driver selection can run any process-backed identity probe, the
    // worktree fence, the worker spec, the worker, or any Host process.
    // Forcing the CLI transport is not a fallback past the qualification,
    // and a separately authorized provider transport never counts as Worker
    // effect authority.
    const requiredDimensions = requiredPacketEnforcementDimensions({
      readOnly: profileOptions.readOnly,
    });
    const preAdmissions = (forcedCli ? ['cli'] : ['acp', 'cli'])
      .map((driver) => enforcementAdmission(profile, {
        required: requiredDimensions,
        driver,
      }));
    if (preAdmissions.every((decision) => decision.route === 'unavailable')) {
      throw new HostEnforcementUnavailableError(args.to, preAdmissions[0], {
        transportSurface: preferredSurface,
        maturity: transportMaturity,
      });
    }
    // Any transport the precheck left admissible keeps the existing order:
    // selection attests the candidate identity only for a route that could
    // be admitted.
    const driverSelection = chooseExecutionDriver({
      host: args.to,
      profile,
      cliCommand: binary,
      env: envViews.probe,
    });
    const transportSurfaceNote = driverSelection.driver === 'acp'
      ? profile.acp.surface
      : transportSurface(args.to, binary);
    const cliFallback = driverSelection.driver === 'acp'
      && typeof profile.delegateArgv === 'function'
      ? {
          command: binary,
          args: profile.delegateArgv(prompt, worktree, profileOptions),
          transport_surface: transportSurface(args.to, binary),
        }
      : null;
    if (transportMaturity === 'experimental') {
      process.stderr.write(
        `ultra-delegate: warning: host '${args.to}' runs ${transportSurfaceNote}; `
        + `recovery: ${runnerCommand('cancel')}\n`,
      );
    }
    // The selected transport faces the same admission against the retained
    // exact-version qualification before any launch artifact exists; a
    // single-transport refusal (for example a forced CLI transport with no
    // retained observation) still fails closed here.
    const admission = enforcementAdmission(profile, {
      required: requiredDimensions,
      driver: driverSelection.driver,
    });
    if (admission.route === 'unavailable') {
      throw new HostEnforcementUnavailableError(args.to, admission, {
        transportSurface: transportSurfaceNote,
        maturity: transportMaturity,
      });
    }
    fence = acquireWorktreeFence(projectRoot, {
      delegationId,
      launchId,
      worktree,
      writableRootPaths: permissionContract.writableRootPaths,
      pid: process.pid,
    });
    // Before the outer worker may exist, persist a valid identity-bound
    // not_started observation: absent evidence must never read as stopped.
    writeObservationPhase(writerObservation, { identity, phase: 'not_started' });
    const workerSpec = {
      $schema: 'ultra-delegation-worker-spec-v1',
      delegation_id: delegationId,
      launch_id: launchId,
      host: args.to,
      model,
      command: driverSelection.command,
      transport_maturity: transportMaturity,
      transport_surface: transportSurfaceNote,
      experimental_ack: transportMaturity === 'experimental' ? args.ackExperimental : undefined,
      execution_driver: driverSelection.driver,
      driver_fallback_reason: driverSelection.fallbackReason,
      acp_capability: driverSelection.acpCapability,
      args: driverSelection.driver === 'acp'
        ? driverSelection.args
        : profile.delegateArgv(prompt, worktree, profileOptions),
      ...(driverSelection.driver === 'acp' ? {
        prompt,
        ...(cliFallback ? { cli_fallback: cliFallback } : {}),
      } : {}),
      cwd: worktree,
      project_root: projectRoot,
      instruction,
      permission,
      instruction_digest: instructionDigest,
      permission_digest: permissionDigest,
      output_schema: outputSchema,
      output_schema_digest: outputSchemaDigest,
      host_output: hostOutput,
      read_only: profileOptions.readOnly,
      writable_roots: permissionContract.writableRoots,
      writable_root_paths: permissionContract.writableRootPaths,
      base_head: baseHead,
      started_at: startedAt,
      timeout_ms: args.timeoutMs,
      result,
      stdout,
      stderr,
      events: driverSelection.driver === 'acp' ? events : null,
      lock,
      cancel,
      writer_observation: writerObservation,
      fence: fence.file,
      // The final Host receives the named base and selected-Host keys picked
      // from the worker's own sanitized environment plus the launcher
      // delegateEnv entries below; secret values never persist in the packet.
      env_keys: Object.keys(envViews.host).sort(),
      env: {
        ...(profile.delegateEnv ? profile.delegateEnv(profileOptions) : {}),
      },
    };
    const specBytes = `${JSON.stringify(workerSpec, null, 2)}\n`;
    const specDigest = crypto.createHash('sha256').update(specBytes).digest('hex');
    writeAtomic(spec, specBytes);
    fs.chmodSync(spec, 0o600);
    // Persist the launch-bound facts before any worker may exist: the spec
    // digest is bound now, and the launcher PID is never recorded as the
    // worker PID — the worker pid slot stays empty until the worker itself (or
    // the post-spawn rewrite below) claims it.
    fs.writeFileSync(lockFd, `${JSON.stringify({
      delegation_id: delegationId,
      launch_id: launchId,
      started_at: startedAt,
      spec_digest: specDigest,
      pid: null,
      worker_start_identity: null,
    })}\n`);
    fs.closeSync(lockFd);
    lockFd = undefined;
    const worker = spawnWorker(spec, specDigest, envViews.worker, projectRoot);
    if (!worker.pid) throw new Error('failed to start delegation worker');
    worker.unref();
    spawned = true;
    injectedFault('receipt-write');
    const workerStartIdentity = processStartIdentity(worker.pid);
    const receipt = {
      $schema: RECEIPT_SCHEMA,
      status: 'started',
      delegation_id: delegationId,
      launch_id: launchId,
      host: args.to,
      model,
      transport_maturity: transportMaturity,
      transport_surface: transportSurfaceNote,
      ...(transportMaturity === 'experimental' ? { experimental_ack: args.ackExperimental } : {}),
      execution_driver: driverSelection.driver,
      driver_fallback_reason: driverSelection.fallbackReason,
      acp_capability: driverSelection.acpCapability,
      worker_pid: worker.pid,
      worker_start_identity: workerStartIdentity,
      instruction_digest: instructionDigest,
      permission_digest: permissionDigest,
      output_schema_digest: outputSchemaDigest,
      spec_digest: specDigest,
      base_head: baseHead,
      started_at: startedAt,
      timeout_ms: args.timeoutMs,
      result_file: result,
      read_only: profileOptions.readOnly,
      stdout_file: stdout,
      stderr_file: stderr,
      events_file: driverSelection.driver === 'acp' ? events : null,
      cancel_command: runnerCommand('cancel', delegationRoot),
    };
    writeAtomic(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`);
    injectedFault('lock-rewrite');
    writeAtomic(lock, `${JSON.stringify({
      delegation_id: delegationId,
      launch_id: launchId,
      started_at: startedAt,
      spec_digest: specDigest,
      pid: worker.pid,
      worker_start_identity: workerStartIdentity,
    })}\n`);
    fs.chmodSync(lock, 0o600);
    if (fs.existsSync(result)) {
      try { fs.unlinkSync(lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return receipt;
  } catch (error) {
    if (lockFd !== undefined) fs.closeSync(lockFd);
    if (!spawned) {
      // Pre-spawn: nothing was launched, so the run directory can be cleaned.
      try { fs.unlinkSync(lock); } catch (unlinkError) { if (unlinkError.code !== 'ENOENT') throw unlinkError; }
      if (fence) {
        try { releaseWorktreeFence(projectRoot, delegationId, { launchId }); } catch { /* the fence stays held */ }
      }
      for (const file of [spec, outputSchema, hostOutput, events, writerObservation]) {
        try { fs.unlinkSync(file); } catch (unlinkError) { if (unlinkError.code !== 'ENOENT') throw unlinkError; }
      }
      throw error;
    }
    // Post-spawn uncertainty: the detached worker may already be running, so
    // its fence, spec, lock, and observation survive any later write failure.
    // The only recovery path is the canonical cancel command.
    throw new Error(
      `${error.message}; the delegation worker may already be running — recover with ${runnerCommand('cancel', delegationRoot)}`,
    );
  }
}

function delegationPath(projectRoot, value) {
  return projectPath(projectRoot, value, 'delegation', { directory: true });
}

function latestDerivedEvent(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  const source = fs.readFileSync(file, 'utf8');
  if (Buffer.byteLength(source) > 512 * 1024) return { status: 'unavailable', reason: 'event_journal_limit' };
  const lines = source.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  try {
    const { projectedDerivedEvent } = require('./acp-driver.cjs');
    const latest = projectedDerivedEvent(JSON.parse(lines.at(-1)));
    return latest
      ? { status: 'observed', event_count: lines.length, latest }
      : { status: 'unavailable', reason: 'event_journal_malformed' };
  } catch {
    return { status: 'unavailable', reason: 'event_journal_malformed' };
  }
}

function status(argv, { projectRoot = process.cwd(), kill = process.kill } = {}) {
  const values = parsePairs(argv, new Set(['--delegation']));
  if (!values['--delegation']) throw new Error('delegate status requires --delegation');
  projectRoot = fs.realpathSync(projectRoot);
  const root = delegationPath(projectRoot, values['--delegation']);
  const result = path.join(root, 'result.json');
  // The same conservative recovery view as cancel: conflicting or malformed
  // lock/receipt facts fail closed instead of projecting a reassuring state.
  const facts = loadRecoveryFacts(root);
  const identity = recoveryIdentity(root, facts);
  const snapshot = writerObservationSnapshot(root, identity);
  if (fs.existsSync(result)) {
    // A terminal outcome_unknown keeps its immutable result while status
    // exposes a freshly derived current writer boundary for recovery.
    return { ...readJson(result), writer_observation: snapshot };
  }
  // A run with spec/lock/writer artifacts but no receipt is never
  // not_started: the worker may exist unobserved, so the state stays
  // conservative and the canonical cancel repair is always offered.
  const hasRunArtifacts = !!(facts.lock || facts.receipt
    || fs.existsSync(path.join(root, 'worker-spec.json'))
    || fs.existsSync(path.join(root, 'writer.json')));
  const view = outerWorkerView(facts, { kill });
  const eventsFile = path.join(root, 'events.jsonl');
  // An unprovable outer worker projects the conservative non-terminal
  // unknown; only a proven-stopped worker may read as not_started or stalled.
  return {
    $schema: 'ultra-delegation-status-v1',
    status: fs.existsSync(path.join(root, 'cancel.request'))
      ? 'cancelling'
      : view.state === 'alive' ? 'running'
        : view.state === 'unknown' ? 'unknown'
          : !hasRunArtifacts ? 'not_started'
            : facts.receipt ? 'stalled' : 'unknown',
    delegation_id: path.basename(root),
    worker_pid: facts.lock?.pid || facts.receipt?.worker_pid || null,
    result_file: result,
    execution_driver: facts.receipt?.execution_driver || null,
    driver_fallback_reason: facts.receipt?.driver_fallback_reason || null,
    events_file: facts.receipt?.events_file || null,
    execution_observation: latestDerivedEvent(eventsFile),
    writer_observation: snapshot,
    repair: hasRunArtifacts ? runnerCommand('cancel', root) : null,
  };
}

function failureFromSpec(spec, failureType, summary, { writerState = null } = {}) {
  let finalHead = null;
  let changedFiles = [];
  try { finalHead = git(spec.cwd, ['rev-parse', 'HEAD']); } catch {}
  try { changedFiles = observedChangedFiles(spec.cwd, spec.base_head); } catch {}
  return {
    $schema: RESULT_SCHEMA,
    status: 'failed',
    summary,
    changed_files: changedFiles,
    checks: [],
    evidence: [],
    questions: [],
    residual_risks: [],
    failure_type: failureType,
    ...(writerState ? { writer_state: writerState } : {}),
    delegation_id: spec.delegation_id,
    host: spec.host,
    transport_maturity: spec.transport_maturity ?? null,
    transport_surface: spec.transport_surface ?? null,
    execution_driver: spec.execution_driver ?? 'cli',
    driver_fallback_reason: spec.driver_fallback_reason ?? null,
    acp_capability: spec.acp_capability ?? null,
    acp_protocol_version: null,
    acp_stop_reason: null,
    events_file: spec.events ?? null,
    // Terminal recovery results carry the same transport truth as live ones.
    ...(spec.experimental_ack === true ? { experimental_ack: true } : {}),
    instruction_digest: spec.instruction_digest,
    permission_digest: spec.permission_digest,
    output_schema_digest: spec.output_schema_digest,
    base_head: spec.base_head,
    final_head: finalHead,
    started_at: spec.started_at,
    finished_at: new Date().toISOString(),
    exit_code: null,
  };
}

function cancel(argv, { projectRoot = process.cwd(), kill = process.kill } = {}) {
  const values = parsePairs(argv, new Set(['--delegation']));
  if (!values['--delegation']) throw new Error('delegate cancel requires --delegation');
  projectRoot = fs.realpathSync(projectRoot);
  const root = delegationPath(projectRoot, values['--delegation']);
  const result = path.join(root, 'result.json');
  // Conflicting or malformed lock/receipt facts fail closed before any
  // recovery action may act on them.
  const facts = loadRecoveryFacts(root);
  const identity = recoveryIdentity(root, facts);
  if (fs.existsSync(result)) {
    // Repair path: a terminal outcome_unknown freezes its roots, and the
    // frozen fence and lock release only once BOTH boundaries — the inner
    // writer and the outer worker — are proven stopped. The terminal result
    // itself is never rewritten, and the fence path is derived from the
    // canonical registry plus launch identity — never from the mutable
    // worker spec.
    let fenceReleased = false;
    if (identity && writerBoundaryState(root, identity) === 'stopped'
        && outerWorkerView(facts, { kill }).state === 'stopped') {
      fenceReleased = releaseWorktreeFence(projectRoot, identity.delegationId, {
        launchId: identity.launchId,
      });
      if (fenceReleased) {
        try { fs.unlinkSync(facts.lockFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    return {
      $schema: 'ultra-delegation-cancel-v1',
      status: 'already_terminal',
      delegation_id: path.basename(root),
      result_file: result,
      result: readJson(result),
      ...(fenceReleased ? { fence_released: true } : {}),
    };
  }
  const specFile = path.join(root, 'worker-spec.json');
  if (!fs.existsSync(specFile)) throw new Error('delegation has no worker spec to cancel');
  // The canonical signal is created before any mutable spec field is consumed,
  // and the no-follow atomic write refuses a symlinked or non-regular target
  // instead of touching whatever it references.
  const request = path.join(root, 'cancel.request');
  writeAtomic(request, `${JSON.stringify({ requested_at: new Date().toISOString() })}\n`);
  // A reused bound PID never defers cancellation through raw liveness: the
  // identity-aware view is the only worker-liveness input.
  const view = outerWorkerView(facts, { kill });
  // Spec drift blocks synthesized terminal fields only; it never blocks the
  // signal above or a proven-stopped fence release.
  let spec = null;
  try {
    spec = loadRecoverySpec(root, facts);
  } catch {
    spec = null;
  }
  // Only a proven-stopped outer worker may synthesize a terminal, remove the
  // lock, or release the fence — and even then only together with a
  // proven-stopped inner writer boundary. An alive or unknown outer worker
  // keeps the signal, the lock, and the fence untouched.
  if (view.state === 'stopped') {
    const writerState = identity ? writerBoundaryState(root, identity) : 'unknown';
    if (writerState === 'stopped') {
      if (spec) {
        writeAtomic(result, `${JSON.stringify(failureFromSpec(
          spec, 'cancelled',
          'Delegation cancelled after its complete writer boundary was proven stopped.',
          { writerState },
        ), null, 2)}\n`);
      }
      try { fs.unlinkSync(facts.lockFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (identity) {
        releaseWorktreeFence(projectRoot, identity.delegationId, { launchId: identity.launchId });
      }
    } else if (spec) {
      // A live or unidentifiable writer may still write: report the unknown
      // outcome and freeze the fence and lock instead of claiming safe
      // cancellation or admitting a second writer.
      writeAtomic(result, `${JSON.stringify(failureFromSpec(
        spec, 'outcome_unknown',
        `Delegation cancellation could not prove the complete writer boundary stopped (writer state: ${writerState}); the worktree fence is retained.`,
        { writerState },
      ), null, 2)}\n`);
    }
  }
  return {
    $schema: 'ultra-delegation-cancel-v1',
    status: 'cancel_requested',
    delegation_id: path.basename(root),
    result_file: result,
  };
}

function handle(argv, options) {
  if (argv[0] !== 'delegate') throw new Error('delegate command is required');
  if (argv[1] === 'run') return run(argv.slice(2), options);
  if (argv[1] === 'status') return status(argv.slice(2), options);
  if (argv[1] === 'cancel') return cancel(argv.slice(2), options);
  throw new Error(
    'usage: delegate.cjs <run|status|cancel> ... '
    + '(compatibility: ubp delegate <run|status|cancel> ...)',
  );
}

function printHelp() {
  process.stdout.write([
    'Usage: node <ultra-delegate-skill-dir>/scripts/delegate.cjs <run|status|cancel> ...',
    '',
    'The installed Skill-local path is canonical.',
    'Compatibility for one release cycle: ubp delegate <run|status|cancel> ...',
    '',
  ].join('\n'));
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    return;
  }
  const result = handle(['delegate', ...argv]);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(failureDiagnosticLine(error) ?? `${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  acquireWorktreeFence,
  cancel,
  failureDiagnostic,
  failureDiagnosticLine,
  fenceFileName,
  fenceHeldForLaunch,
  fencePathsOverlap,
  handle,
  HostEnforcementUnavailableError,
  launchDelegateWorker,
  main,
  releaseWorktreeFence,
  run,
  sameFileSystemEntry,
  sameFileSystemPath,
  status,
};
