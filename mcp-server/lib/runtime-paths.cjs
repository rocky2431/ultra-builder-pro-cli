'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const RUNTIME_RELATIVE_DIR = path.join('.ultra', '.runtime');
const STATE_DB_RELATIVE_PATH = path.join(RUNTIME_RELATIVE_DIR, 'state.db');
const LEGACY_STATE_DB_RELATIVE_PATH = path.join('.ultra', 'state.db');
const STATE_SUFFIXES = Object.freeze(['', '-wal', '-shm']);
const STATE_TOMBSTONE_MARKER = 'MIGRATED_TO_RUNTIME.json';
const STATE_TOMBSTONE_KIND = 'ultra-state-migration-tombstone';
const LEGACY_RUNTIME_DIRS = Object.freeze([
  ['backups', 'backups'],
  ['collab', 'collab'],
  ['sessions', 'sessions'],
  ['telemetry', 'telemetry'],
  ['debug', 'debug'],
  ['orchestrator', 'orchestrator'],
  ['runtime', '.'],
]);
const LEGACY_RUNTIME_FILES = Object.freeze([
  ['orchestrator.pid', path.join('orchestrator', 'orchestrator.pid')],
  ['orchestrator.log', path.join('orchestrator', 'orchestrator.log')],
]);
const HELD_MIGRATION_GATE = Symbol('held-migration-gate');

class RuntimePathError extends Error {
  constructor(code, message, { cause, details } = {}) {
    super(message);
    this.name = 'RuntimePathError';
    this.code = code;
    if (cause) this.cause = cause;
    if (details) this.details = details;
  }
}

function lstatOrNull(candidate) {
  try {
    return fs.lstatSync(candidate);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function isContainedPath(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..'
    && !path.isAbsolute(relative));
}

function physicalPathCandidate(candidate) {
  let existing = path.resolve(candidate);
  while (!lstatOrNull(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const physicalExisting = fs.realpathSync(existing);
  return path.resolve(physicalExisting, path.relative(existing, path.resolve(candidate)));
}

function assertSafeRoot(rootDir) {
  const root = path.resolve(rootDir || process.cwd());
  const stat = lstatOrNull(root);
  if (!stat) {
    throw new RuntimePathError('RUNTIME_ROOT_INVALID', `project root does not exist: ${root}`);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new RuntimePathError(
      'RUNTIME_ROOT_INVALID',
      `project root must be a real directory, not a symlink or special entry: ${root}`,
    );
  }
  return root;
}

function assertRegularFileIfPresent(candidate, label) {
  const stat = lstatOrNull(candidate);
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new RuntimePathError(
      'RUNTIME_PATH_UNSAFE',
      `${label} must be a regular file and may not be a symlink: ${candidate}`,
      { details: { path: candidate } },
    );
  }
  return stat;
}

function assertDirectoryIfPresent(candidate, label) {
  const stat = lstatOrNull(candidate);
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new RuntimePathError(
      'RUNTIME_PATH_UNSAFE',
      `${label} must be a real directory and may not be a symlink: ${candidate}`,
      { details: { path: candidate } },
    );
  }
  return stat;
}

function pathsFor(rootDir) {
  const root = path.resolve(rootDir || process.cwd());
  const ultraDir = path.join(root, '.ultra');
  const runtimeDir = path.join(ultraDir, '.runtime');
  return {
    rootDir: root,
    ultraDir,
    runtimeDir,
    stateDbPath: path.join(runtimeDir, 'state.db'),
    legacyStateDbPath: path.join(ultraDir, 'state.db'),
    backupsDir: path.join(runtimeDir, 'backups'),
    collabDir: path.join(runtimeDir, 'collab'),
    sessionsDir: path.join(runtimeDir, 'sessions'),
    worktreesDir: path.join(runtimeDir, 'worktrees'),
    telemetryDir: path.join(runtimeDir, 'telemetry'),
    debugDir: path.join(runtimeDir, 'debug'),
    orchestratorDir: path.join(runtimeDir, 'orchestrator'),
    checkpointPath: path.join(runtimeDir, 'checkpoint.json'),
    orchestratorPidPath: path.join(runtimeDir, 'orchestrator', 'orchestrator.pid'),
    orchestratorLogPath: path.join(runtimeDir, 'orchestrator', 'orchestrator.log'),
  };
}

function explicitStateDbPath(env = process.env) {
  const configured = typeof env?.UBP_DB_PATH === 'string' ? env.UBP_DB_PATH.trim() : '';
  return configured ? path.resolve(configured) : null;
}

function managedStateTombstone(mainPath) {
  const stat = lstatOrNull(mainPath);
  if (!stat || stat.isSymbolicLink()) return null;
  let markerPath = mainPath;
  if (stat.isDirectory()) {
    markerPath = path.join(mainPath, STATE_TOMBSTONE_MARKER);
    const entries = fs.readdirSync(mainPath);
    const markerStat = lstatOrNull(markerPath);
    if (entries.length !== 1
        || entries[0] !== STATE_TOMBSTONE_MARKER
        || !markerStat?.isFile()
        || markerStat.isSymbolicLink()) {
      return null;
    }
  } else if (!stat.isFile()) {
    return null;
  }
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch {
    return null;
  }
  const canonicalPath = path.resolve(path.dirname(mainPath), marker.canonical_state_db || '');
  const expected = path.join(path.dirname(mainPath), '.runtime', 'state.db');
  if (marker.version !== 1
      || marker.kind !== STATE_TOMBSTONE_KIND
      || canonicalPath !== expected) {
    return null;
  }
  return { markerPath, canonicalPath, marker };
}

function isManagedLegacyStateTombstone(mainPath) {
  return Boolean(managedStateTombstone(mainPath));
}

function assertStateSetSafe(mainPath, label, { allowManagedTombstone = false } = {}) {
  const mainStat = lstatOrNull(mainPath);
  const tombstone = allowManagedTombstone ? managedStateTombstone(mainPath) : null;
  let main = null;
  if (mainStat && !tombstone) {
    main = assertRegularFileIfPresent(mainPath, `${label} state.db`);
  }
  const wal = assertRegularFileIfPresent(`${mainPath}-wal`, `${label} state.db-wal`);
  const shm = assertRegularFileIfPresent(`${mainPath}-shm`, `${label} state.db-shm`);
  if ((!main || tombstone) && (wal || shm)) {
    throw new RuntimePathError(
      'RUNTIME_ORPHAN_SIDECAR',
      `${label} SQLite sidecar exists without its state.db authority`,
      {
        details: {
          state_db_path: mainPath,
          wal_path: wal ? `${mainPath}-wal` : null,
          shm_path: shm ? `${mainPath}-shm` : null,
        },
      },
    );
  }
  return { main, wal, shm, tombstone };
}

function runtimeLinkMatchesConfiguredDb(paths, configuredDbPath) {
  const runtimeStat = lstatOrNull(paths.runtimeDir);
  if (!runtimeStat?.isSymbolicLink() || !configuredDbPath) return false;
  if (path.basename(configuredDbPath) !== 'state.db') return false;
  try {
    return fs.realpathSync(paths.runtimeDir) === fs.realpathSync(path.dirname(configuredDbPath))
      && fs.realpathSync(path.join(paths.runtimeDir, 'state.db'))
        === fs.realpathSync(configuredDbPath);
  } catch {
    return false;
  }
}

function isIntentionalTaskAuthorityLink(paths, candidate, physicalRuntimeDir) {
  const relative = path.relative(paths.runtimeDir, candidate);
  const parts = relative.split(path.sep);
  if (parts.length !== 4
      || parts[0] !== 'worktrees'
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(parts[1])
      || parts[2] !== '.ultra'
      || parts[3] !== '.runtime') {
    return false;
  }
  try {
    return fs.realpathSync(candidate) === physicalRuntimeDir
      && fs.realpathSync(path.join(candidate, 'state.db'))
        === fs.realpathSync(paths.stateDbPath);
  } catch {
    return false;
  }
}

function assertRegisteredWorktreeBoundary(paths, candidate, physicalRuntimeDir) {
  const sid = path.basename(candidate);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(sid)) {
    throw new RuntimePathError(
      'RUNTIME_PATH_UNSAFE',
      `registered worktree has an unsafe session id: ${candidate}`,
      { details: { path: candidate } },
    );
  }
  const authorityLink = path.join(candidate, '.ultra', '.runtime');
  const linkStat = lstatOrNull(authorityLink);
  if (!linkStat?.isSymbolicLink()
      || !isIntentionalTaskAuthorityLink(paths, authorityLink, physicalRuntimeDir)) {
    throw new RuntimePathError(
      'RUNTIME_PATH_UNSAFE',
      `registered worktree must contain the exact central Ultra authority link: ${authorityLink}`,
      { details: { path: candidate, authority_link: authorityLink } },
    );
  }
}

function assertRuntimeTreeSafe(paths) {
  const runtimeStat = lstatOrNull(paths.runtimeDir);
  if (!runtimeStat) return;
  let physicalRuntimeDir;
  try {
    physicalRuntimeDir = fs.realpathSync(paths.runtimeDir);
  } catch (error) {
    throw new RuntimePathError(
      'RUNTIME_PATH_UNSAFE',
      `canonical runtime root cannot be resolved: ${paths.runtimeDir}`,
      { cause: error, details: { path: paths.runtimeDir } },
    );
  }
  let registered = null;
  const pending = fs.readdirSync(paths.runtimeDir)
    .map((entry) => path.join(paths.runtimeDir, entry));
  while (pending.length > 0) {
    const candidate = pending.pop();
    const stat = lstatOrNull(candidate);
    if (!stat) continue;
    if (stat.isSymbolicLink()) {
      if (isIntentionalTaskAuthorityLink(paths, candidate, physicalRuntimeDir)) continue;
      throw new RuntimePathError(
        'RUNTIME_PATH_UNSAFE',
        `canonical runtime entry may not be a symlink: ${candidate}`,
        { details: { path: candidate } },
      );
    }
    if (!stat.isDirectory() && !stat.isFile()) {
      throw new RuntimePathError(
        'RUNTIME_PATH_UNSAFE',
        `canonical runtime entry must be a regular file or real directory: ${candidate}`,
        { details: { path: candidate } },
      );
    }
    let physicalCandidate;
    try {
      physicalCandidate = fs.realpathSync(candidate);
    } catch (error) {
      throw new RuntimePathError(
        'RUNTIME_PATH_UNSAFE',
        `canonical runtime entry cannot be resolved: ${candidate}`,
        { cause: error, details: { path: candidate } },
      );
    }
    if (!isContainedPath(physicalRuntimeDir, physicalCandidate)) {
      throw new RuntimePathError(
        'RUNTIME_PATH_UNSAFE',
        `canonical runtime entry escapes its physical root: ${candidate}`,
        {
          details: {
            path: candidate,
            resolved_path: physicalCandidate,
            runtime_root: physicalRuntimeDir,
          },
        },
      );
    }
    const relative = path.relative(paths.runtimeDir, candidate);
    const relativeParts = relative.split(path.sep);
    if (stat.isDirectory()
        && relativeParts.length === 2
        && relativeParts[0] === 'worktrees') {
      if (registered === null) registered = registeredWorktrees(paths.rootDir);
      if (registered.has(physicalCandidate)) {
        assertRegisteredWorktreeBoundary(paths, candidate, physicalRuntimeDir);
        // A Git checkout owns its tracked tree. Ultra validates the direct
        // managed child and authority link, then leaves repository symlinks
        // and other tracked entries to Git instead of treating them as
        // runtime artifacts.
        continue;
      }
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(candidate)) {
        pending.push(path.join(candidate, entry));
      }
    }
  }
}

function validateProjectLayout(rootDir, {
  env = process.env,
  allowConfiguredRuntimeLink = true,
  forMutation = false,
  validateRuntimeTree = false,
} = {}) {
  const root = assertSafeRoot(rootDir);
  const paths = pathsFor(root);
  assertDirectoryIfPresent(paths.ultraDir, '.ultra');
  const configured = explicitStateDbPath(env);
  if (configured) assertStateSetSafe(configured, 'configured');
  const runtimeStat = lstatOrNull(paths.runtimeDir);
  if (runtimeStat?.isSymbolicLink()) {
    const allowed = !forMutation
      && allowConfiguredRuntimeLink
      && runtimeLinkMatchesConfiguredDb(paths, configured);
    if (!allowed) {
      throw new RuntimePathError(
        'RUNTIME_PATH_UNSAFE',
        `.ultra/.runtime may only be a task link to the explicitly configured authority: ${paths.runtimeDir}`,
        { details: { path: paths.runtimeDir, configured_state_db_path: configured } },
      );
    }
  } else if (runtimeStat && !runtimeStat.isDirectory()) {
    throw new RuntimePathError(
      'RUNTIME_PATH_UNSAFE',
      `.ultra/.runtime must be a real directory: ${paths.runtimeDir}`,
      { details: { path: paths.runtimeDir } },
    );
  }
  assertStateSetSafe(paths.legacyStateDbPath, 'legacy', { allowManagedTombstone: true });
  assertStateSetSafe(paths.stateDbPath, 'runtime');
  if (validateRuntimeTree) assertRuntimeTreeSafe(paths);
  return { ...paths, configuredStateDbPath: configured, runtimeLinked: runtimeStat?.isSymbolicLink() };
}

function assertNoCompetingState(paths) {
  const legacy = lstatOrNull(paths.legacyStateDbPath);
  const runtime = lstatOrNull(paths.stateDbPath);
  if (!legacy || !runtime || managedStateTombstone(paths.legacyStateDbPath)) return;
  throw new RuntimePathError(
    'RUNTIME_STATE_CONFLICT',
    'both legacy .ultra/state.db and runtime .ultra/.runtime/state.db exist; refusing to choose either authority',
    {
      details: {
        legacy_state_db_path: paths.legacyStateDbPath,
        runtime_state_db_path: paths.stateDbPath,
      },
    },
  );
}

function samePhysicalAuthority(left, right) {
  if (path.resolve(left) === path.resolve(right)) return true;
  if (!lstatOrNull(left) || !lstatOrNull(right)) return false;
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return false;
  }
}

function assertConfiguredAuthorityBinding(paths) {
  const configured = paths.configuredStateDbPath;
  if (!configured) return;
  const active = lstatOrNull(paths.stateDbPath)
    ? paths.stateDbPath
    : (lstatOrNull(paths.legacyStateDbPath)
        && !managedStateTombstone(paths.legacyStateDbPath)
      ? paths.legacyStateDbPath
      : null);
  const allowed = active
    ? samePhysicalAuthority(configured, active)
    : physicalPathCandidate(configured) === physicalPathCandidate(paths.stateDbPath);
  if (allowed && !paths.runtimeLinked) return;
  if (allowed && paths.runtimeLinked) {
    let authorityRoot;
    let authorityPaths;
    let physicalTaskRoot;
    let physicalWorktreesRoot;
    let sid;
    try {
      authorityRoot = projectRootFromStateDbPath(configured);
      authorityPaths = pathsFor(authorityRoot);
      if (!samePhysicalAuthority(configured, authorityPaths.stateDbPath)) {
        throw new Error('configured DB is not a canonical project runtime authority');
      }
      physicalTaskRoot = fs.realpathSync(paths.rootDir);
      physicalWorktreesRoot = fs.realpathSync(authorityPaths.worktreesDir);
      const relative = path.relative(physicalWorktreesRoot, physicalTaskRoot);
      const parts = relative.split(path.sep);
      if (parts.length !== 1
          || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(parts[0])) {
        throw new Error('task root is not a direct managed worktree child');
      }
      [sid] = parts;
      const registered = registeredWorktrees(authorityRoot);
      if (!registered.has(physicalTaskRoot)) {
        throw new Error('task root is not a registered Git worktree');
      }
      if (!runtimeLinkMatchesConfiguredDb(paths, configured)) {
        throw new Error('task authority link does not resolve to the configured DB');
      }
      // Open read-only only after the complete filesystem and Git binding is
      // proven. The row is the durable session-to-worktree ownership record.
      // eslint-disable-next-line global-require
      const Database = require('better-sqlite3');
      const db = new Database(configured, { readonly: true, fileMustExist: true });
      try {
        const session = db.prepare(
          'SELECT sid, worktree_path FROM sessions WHERE sid = ?',
        ).get(sid);
        if (!session) throw new Error(`authority has no session binding for ${sid}`);
        let recorded;
        try { recorded = fs.realpathSync(session.worktree_path); }
        catch { recorded = path.resolve(session.worktree_path); }
        if (recorded !== physicalTaskRoot) {
          throw new Error(`session ${sid} is bound to a different worktree`);
        }
      } finally {
        db.close();
      }
      return;
    } catch (error) {
      throw new RuntimePathError(
        'RUNTIME_AUTHORITY_MISMATCH',
        `task root is not bound to the configured Ultra authority: ${error.message}`,
        {
          cause: error,
          details: {
            project_root: paths.rootDir,
            configured_state_db_path: configured,
            authority_root: authorityRoot || null,
            session_id: sid || null,
          },
        },
      );
    }
  }
  throw new RuntimePathError(
    'RUNTIME_AUTHORITY_MISMATCH',
    `UBP_DB_PATH does not name this project's canonical or task-linked authority: ${configured}`,
    {
      details: {
        project_root: paths.rootDir,
        configured_state_db_path: configured,
        project_state_db_path: active || paths.stateDbPath,
      },
    },
  );
}

function locateStateDb(rootDir, { env = process.env } = {}) {
  const paths = validateProjectLayout(rootDir, { env });
  assertNoCompetingState(paths);
  assertConfiguredAuthorityBinding(paths);
  if (paths.configuredStateDbPath) return paths.configuredStateDbPath;
  if (lstatOrNull(paths.stateDbPath)) return paths.stateDbPath;
  if (lstatOrNull(paths.legacyStateDbPath)
      && !managedStateTombstone(paths.legacyStateDbPath)) {
    return paths.legacyStateDbPath;
  }
  return paths.stateDbPath;
}

function projectRootFromStateDbPath(dbPath) {
  const resolved = path.resolve(dbPath);
  if (path.basename(resolved) !== 'state.db') return path.dirname(resolved);
  const parent = path.dirname(resolved);
  if (path.basename(parent) === '.runtime'
      && path.basename(path.dirname(parent)) === '.ultra') {
    return path.dirname(path.dirname(parent));
  }
  if (path.basename(parent) === '.ultra') return path.dirname(parent);
  return path.dirname(resolved);
}

function digestFile(file) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function verifiedCopy(source, target) {
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  if (fs.statSync(source).size !== fs.statSync(target).size
      || digestFile(source) !== digestFile(target)) {
    throw new RuntimePathError(
      'RUNTIME_STATE_BACKUP_INVALID',
      `backup verification failed for ${source}`,
    );
  }
}

function atomicVerifiedCopy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const stage = path.join(
    path.dirname(target),
    `.${path.basename(target)}.stage-${process.pid}-${randomUUID()}`,
  );
  try {
    verifiedCopy(source, stage);
    fs.renameSync(stage, target);
  } finally {
    fs.rmSync(stage, { force: true });
  }
}

function timestampSlug(now) {
  return now().toISOString().replace(/[:.]/g, '-');
}

function createMigrationBackup(paths, now) {
  fs.mkdirSync(paths.backupsDir, { recursive: true });
  const prefix = `legacy-state-${timestampSlug(now)}`;
  let backupPath = path.join(paths.backupsDir, prefix);
  let attempt = 0;
  while (fs.existsSync(backupPath)) {
    attempt += 1;
    backupPath = path.join(paths.backupsDir, `${prefix}-${attempt}`);
  }
  fs.mkdirSync(backupPath, { recursive: false });
  try {
    for (const suffix of STATE_SUFFIXES) {
      const source = `${paths.legacyStateDbPath}${suffix}`;
      if (!fs.existsSync(source)) continue;
      verifiedCopy(source, path.join(backupPath, `state.db${suffix}`));
    }
  } catch (error) {
    throw error instanceof RuntimePathError ? error : new RuntimePathError(
      'RUNTIME_STATE_BACKUP_FAILED',
      `could not back up legacy Ultra state: ${error.message}`,
      { cause: error },
    );
  }
  return backupPath;
}

function isSQLiteDatabase(candidate) {
  const descriptor = fs.openSync(candidate, 'r');
  try {
    const header = Buffer.alloc(16);
    return fs.readSync(descriptor, header, 0, header.length, 0) === header.length
      && header.equals(Buffer.from('SQLite format 3\0'));
  } finally {
    fs.closeSync(descriptor);
  }
}

function processStartMarker(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return null;
  return String(result.stdout || '').trim() || null;
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    return true;
  }
}

function readMigrationGate(gatePath) {
  const stat = lstatOrNull(gatePath);
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) return null;
  try {
    const owner = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
    return { owner, stat };
  } catch {
    return null;
  }
}

function reclaimDeadMigrationGate(gatePath, observed) {
  const quarantine = `${gatePath}.stale-${process.pid}-${randomUUID()}`;
  fs.renameSync(gatePath, quarantine);
  try {
    const moved = fs.lstatSync(quarantine);
    if (moved.dev !== observed.stat.dev || moved.ino !== observed.stat.ino) {
      if (!lstatOrNull(gatePath)) fs.renameSync(quarantine, gatePath);
      throw new RuntimePathError(
        'RUNTIME_STATE_NOT_QUIESCENT',
        `state migration gate changed while reclaiming a dead owner: ${gatePath}`,
      );
    }
  } finally {
    fs.rmSync(quarantine, { force: true });
  }
}

function waitForMigrationGate(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireStateMigrationGate(paths, {
  timeoutMs = 5000,
  retryMs = 25,
} = {}) {
  const gatePath = path.join(paths.runtimeDir, 'state-migration.lock');
  const token = randomUUID();
  const deadline = Date.now() + timeoutMs;
  let descriptor;
  while (descriptor === undefined) {
    try {
      descriptor = fs.openSync(gatePath, 'wx', 0o600);
      fs.writeFileSync(descriptor, `${JSON.stringify({
        version: 2,
        pid: process.pid,
        owner_started_at: processStartMarker(process.pid),
        token,
        legacy_state_db: paths.legacyStateDbPath,
        runtime_state_db: paths.stateDbPath,
      })}\n`);
      fs.fsyncSync(descriptor);
      break;
    } catch (error) {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch { /* best effort */ }
        descriptor = undefined;
      }
      if (error.code !== 'EEXIST') throw error;
      const observed = readMigrationGate(gatePath);
      const ownerPid = Number(observed?.owner?.pid);
      const live = processIsAlive(ownerPid);
      const currentStart = live ? processStartMarker(ownerPid) : null;
      const sameOwner = live && (
        !observed?.owner?.owner_started_at
        || !currentStart
        || observed.owner.owner_started_at === currentStart
      );
      if (!observed) {
        throw new RuntimePathError(
          'RUNTIME_STATE_NOT_QUIESCENT',
          `the Ultra state migration gate is malformed or unsafe: ${gatePath}`,
          { cause: error, details: { gate_path: gatePath, owner_pid: ownerPid || null } },
        );
      }
      if (sameOwner) {
        if (ownerPid === process.pid || Date.now() >= deadline) {
          throw new RuntimePathError(
            'RUNTIME_STATE_NOT_QUIESCENT',
            `another Ultra state migration owns the process gate: ${gatePath}`,
            { cause: error, details: { gate_path: gatePath, owner_pid: ownerPid || null } },
          );
        }
        waitForMigrationGate(Math.min(retryMs, Math.max(1, deadline - Date.now())));
        continue;
      }
      reclaimDeadMigrationGate(gatePath, observed);
    }
  }
  return () => {
    try {
      fs.closeSync(descriptor);
    } finally {
      const current = readMigrationGate(gatePath);
      if (current?.owner?.token === token) fs.rmSync(gatePath, { force: true });
    }
  };
}

function createStateTombstone(paths, { beforePublish } = {}) {
  const stage = path.join(
    paths.ultraDir,
    `.state-tombstone-${process.pid}-${randomUUID()}`,
  );
  fs.writeFileSync(stage, `${JSON.stringify({
    version: 1,
    kind: STATE_TOMBSTONE_KIND,
    canonical_state_db: path.join('.runtime', 'state.db'),
  }, null, 2)}\n`, { flag: 'wx', mode: 0o444 });
  try {
    if (beforePublish) beforePublish({
      legacyStateDbPath: paths.legacyStateDbPath,
      runtimeStateDbPath: paths.stateDbPath,
    });
    fs.renameSync(stage, paths.legacyStateDbPath);
    if (!managedStateTombstone(paths.legacyStateDbPath)) {
      throw new RuntimePathError(
        'RUNTIME_STATE_MIGRATION_FAILED',
        `could not verify the managed legacy state tombstone: ${paths.legacyStateDbPath}`,
      );
    }
  } finally {
    fs.rmSync(stage, { force: true });
  }
}

function removeStateTombstone(candidate) {
  const stat = lstatOrNull(candidate);
  if (!stat) return;
  if (!managedStateTombstone(candidate)) {
    throw new RuntimePathError(
      'RUNTIME_STATE_MIGRATION_FAILED',
      `legacy state tombstone changed content during migration: ${candidate}`,
    );
  }
  fs.rmSync(candidate, { recursive: true, force: true });
}

function migrateLegacyState(rootDir, {
  now = () => new Date(),
  rename = fs.renameSync,
  rollbackRename = fs.renameSync,
  beforeTombstonePublish = null,
  afterGateAcquired = null,
  _migrationGateToken = null,
} = {}) {
  let paths = validateProjectLayout(rootDir, { forMutation: true, env: {} });
  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  const releaseGate = _migrationGateToken === HELD_MIGRATION_GATE
    ? () => {}
    : acquireStateMigrationGate(paths);
  let sqlite = false;
  let backupPath = null;
  const moved = [];
  let tombstone = false;
  let db = null;
  let exclusive = false;
  try {
    // The gate owner must classify the complete authority layout again. Any
    // observation made before waiting on the gate is stale by definition.
    paths = validateProjectLayout(rootDir, { forMutation: true, env: {} });
    assertNoCompetingState(paths);
    const legacyTombstone = managedStateTombstone(paths.legacyStateDbPath);
    const legacyExists = Boolean(lstatOrNull(paths.legacyStateDbPath));
    const runtimeExists = Boolean(lstatOrNull(paths.stateDbPath));
    if (legacyTombstone && runtimeExists) {
      return { ...paths, migrated: false, backupPath: null };
    }
    if (legacyTombstone && !runtimeExists) {
      throw new RuntimePathError(
        'RUNTIME_STATE_MISSING',
        `managed legacy state metadata points to a missing runtime authority: ${paths.stateDbPath}`,
      );
    }
    if (!legacyExists) {
      return { ...paths, migrated: false, backupPath: null };
    }
    if (runtimeExists) return { ...paths, migrated: false, backupPath: null };
    if (afterGateAcquired) afterGateAcquired({ ...paths });

    sqlite = isSQLiteDatabase(paths.legacyStateDbPath);
    if (sqlite) {
      // A SQLite-consistent hand-off must first drain WAL, switch away from
      // pathname-bound sidecars, then hold an exclusive transaction across
      // snapshot, rename, and old-path tombstone publication.
      // eslint-disable-next-line global-require
      const Database = require('better-sqlite3');
      db = new Database(paths.legacyStateDbPath, { fileMustExist: true });
      db.pragma('busy_timeout = 0');
      const checkpoint = db.pragma('wal_checkpoint(TRUNCATE)');
      if (checkpoint.some((row) => Number(row.busy) !== 0)) {
        throw new RuntimePathError(
          'RUNTIME_STATE_NOT_QUIESCENT',
          'legacy Ultra state still has a busy WAL writer; migration was not started',
        );
      }
      const journalMode = String(db.pragma('journal_mode = DELETE', { simple: true })).toLowerCase();
      if (journalMode !== 'delete') {
        throw new RuntimePathError(
          'RUNTIME_STATE_NOT_QUIESCENT',
          `legacy Ultra state could not enter rollback-journal mode: ${journalMode}`,
        );
      }
      db.exec('BEGIN EXCLUSIVE');
      exclusive = true;
      for (const suffix of ['-wal', '-shm']) {
        if (lstatOrNull(`${paths.legacyStateDbPath}${suffix}`)) {
          throw new RuntimePathError(
            'RUNTIME_STATE_NOT_QUIESCENT',
            `legacy SQLite sidecar remained after checkpoint: ${paths.legacyStateDbPath}${suffix}`,
          );
        }
      }
      backupPath = createMigrationBackup(paths, now);
      atomicVerifiedCopy(paths.legacyStateDbPath, paths.stateDbPath);
      moved.push({
        kind: 'snapshot',
        source: paths.legacyStateDbPath,
        target: paths.stateDbPath,
      });
      createStateTombstone(paths, { beforePublish: beforeTombstonePublish });
      tombstone = true;
      db.exec('COMMIT');
      exclusive = false;
    } else {
      backupPath = createMigrationBackup(paths, now);
      // Non-SQLite legacy fixtures have no live connection semantics. Preserve
      // their complete file set byte-for-byte and keep the main file as the
      // final completion marker.
      for (const suffix of ['-wal', '-shm', '']) {
        const source = `${paths.legacyStateDbPath}${suffix}`;
        if (!fs.existsSync(source)) continue;
        const target = `${paths.stateDbPath}${suffix}`;
        rename(source, target);
        moved.push({ source, target });
      }
    }
  } catch (error) {
    if (exclusive && db) {
      try { db.exec('ROLLBACK'); } catch { /* filesystem rollback remains authoritative */ }
      exclusive = false;
    }
    if (db) {
      try { db.close(); } catch { /* continue deterministic filesystem rollback */ }
      db = null;
    }
    const rollbackErrors = [];
    if (sqlite) {
      try {
        fs.rmSync(paths.stateDbPath, { force: true });
        if (backupPath && managedStateTombstone(paths.legacyStateDbPath)) {
          atomicVerifiedCopy(
            path.join(backupPath, 'state.db'),
            paths.legacyStateDbPath,
          );
        }
      } catch (rollbackError) {
        rollbackErrors.push(`${paths.stateDbPath}: ${rollbackError.message}`);
      }
    } else {
      for (const item of moved.reverse()) {
        try {
          fs.mkdirSync(path.dirname(item.source), { recursive: true });
          rollbackRename(item.target, item.source);
        } catch (rollbackError) {
          rollbackErrors.push(`${item.target}: ${rollbackError.message}`);
        }
      }
    }
    if (error instanceof RuntimePathError
        && error.code === 'RUNTIME_STATE_NOT_QUIESCENT'
        && rollbackErrors.length === 0) {
      throw error;
    }
    throw new RuntimePathError(
      'RUNTIME_STATE_MIGRATION_FAILED',
      `could not move legacy Ultra state into .ultra/.runtime: ${error.message}`
        + `${rollbackErrors.length ? `; rollback errors: ${rollbackErrors.join('; ')}` : ''}`,
      { cause: error, details: { backup_path: backupPath } },
    );
  } finally {
    if (db) {
      if (exclusive) {
        try { db.exec('ROLLBACK'); } catch { /* best effort */ }
      }
      try { db.close(); } catch { /* best effort */ }
    }
    releaseGate();
  }
  const result = { ...paths, migrated: true, backupPath };
  Object.defineProperty(result, '_transaction', {
    value: { moved, rollbackRename, tombstone },
  });
  return result;
}

function runGitForMigration(rootDir, args, spawnGit) {
  return spawnGit('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function hasGitMetadata(rootDir) {
  let current = path.resolve(rootDir);
  while (true) {
    if (lstatOrNull(path.join(current, '.git'))) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function gitProbeFailure(rootDir, result) {
  const detail = String(
    result?.error?.message || result?.stderr || result?.stdout || 'unknown Git probe failure',
  ).trim();
  return new RuntimePathError(
    'WORKTREE_DISCOVERY_FAILED',
    `cannot classify repository state before legacy worktree migration: ${detail}`,
    { cause: result?.error },
  );
}

function registeredWorktrees(rootDir, { spawnGit = spawnSync } = {}) {
  let metadataPresent;
  try {
    metadataPresent = hasGitMetadata(rootDir);
  } catch (error) {
    throw new RuntimePathError(
      'WORKTREE_DISCOVERY_FAILED',
      `cannot inspect Git metadata before legacy worktree migration: ${error.message}`,
      { cause: error },
    );
  }
  let repository;
  try {
    repository = runGitForMigration(
      rootDir,
      ['rev-parse', '--is-inside-work-tree'],
      spawnGit,
    );
  } catch (error) {
    throw gitProbeFailure(rootDir, { error });
  }
  const probe = String(repository?.stdout || '').trim();
  if (repository?.status !== 0 || repository?.error || probe !== 'true') {
    const detail = String(repository?.stderr || repository?.stdout || '');
    const explicitlyNonGit = !metadataPresent
      && repository?.status !== 0
      && /not a git repository/i.test(detail);
    const explicitlyOutsideWorktree = !metadataPresent
      && repository?.status === 0
      && probe === 'false';
    if (explicitlyNonGit || explicitlyOutsideWorktree) return new Set();
    throw gitProbeFailure(rootDir, repository);
  }
  let result;
  try {
    result = runGitForMigration(rootDir, ['worktree', 'list', '--porcelain'], spawnGit);
  } catch (error) {
    throw new RuntimePathError(
      'WORKTREE_DISCOVERY_FAILED',
      `cannot inspect registered Git worktrees: ${error.message}`,
      { cause: error },
    );
  }
  if (result.status !== 0 || result.error) {
    throw new RuntimePathError(
      'WORKTREE_DISCOVERY_FAILED',
      `cannot inspect registered Git worktrees: ${
        String(result.error?.message || result.stderr || result.stdout || 'unknown error').trim()
      }`,
      { cause: result.error },
    );
  }
  return new Set(result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => {
      const candidate = path.resolve(line.slice('worktree '.length));
      try { return fs.realpathSync(candidate); }
      catch { return candidate; }
    }));
}

function assertTreeEntrySafe(candidate, {
  containmentRoot,
  registeredWorktree = false,
  canonicalRuntimeDir = null,
  canonicalUltraDir = null,
} = {}) {
  const stat = lstatOrNull(candidate);
  if (!stat) return;
  if (stat.isSymbolicLink()) {
    let resolved;
    try {
      resolved = fs.realpathSync(candidate);
    } catch (error) {
      throw new RuntimePathError(
        'RUNTIME_PATH_UNSAFE',
        `legacy runtime symlink cannot be resolved safely: ${candidate}`,
        { cause: error, details: { path: candidate } },
      );
    }
    const relative = path.relative(containmentRoot, candidate);
    const isAuthorityLink = registeredWorktree
      && relative === path.join('.ultra', '.runtime')
      && canonicalRuntimeDir
      && resolved === fs.realpathSync(canonicalRuntimeDir);
    const isLegacyWholeUltraLink = registeredWorktree
      && relative === '.ultra'
      && canonicalUltraDir
      && resolved === fs.realpathSync(canonicalUltraDir);
    const containmentReal = fs.realpathSync(containmentRoot);
    if (!isAuthorityLink
        && !isLegacyWholeUltraLink
        && (!registeredWorktree || !isContainedPath(containmentReal, resolved))) {
      throw new RuntimePathError(
        'RUNTIME_PATH_UNSAFE',
        `legacy runtime symlink escapes its declared authority boundary: ${candidate}`,
        { details: { path: candidate, resolved_path: resolved } },
      );
    }
    return;
  }
  if (stat.isFile()) return;
  if (!stat.isDirectory()) {
    throw new RuntimePathError(
      'RUNTIME_PATH_UNSAFE',
      `legacy runtime entry must be a regular file or directory: ${candidate}`,
      { details: { path: candidate } },
    );
  }
  for (const entry of fs.readdirSync(candidate)) {
    assertTreeEntrySafe(path.join(candidate, entry), {
      containmentRoot,
      registeredWorktree,
      canonicalRuntimeDir,
      canonicalUltraDir,
    });
  }
}

function preflightLegacyRuntime(paths, {
  spawnGit = spawnSync,
} = {}) {
  const legacyWorktrees = path.join(paths.ultraDir, 'worktrees');
  const legacyWorktreesStat = assertDirectoryIfPresent(
    legacyWorktrees,
    'legacy worktrees runtime root',
  );
  const registered = legacyWorktreesStat
    ? registeredWorktrees(paths.rootDir, { spawnGit })
    : new Set();
  const legacyWholeUltraLinks = new Set();
  const directories = [
    ['worktrees', 'worktrees'],
    ...LEGACY_RUNTIME_DIRS,
  ];
  for (const [legacyName, runtimeName] of directories) {
    const sourceDir = path.join(paths.ultraDir, legacyName);
    const sourceStat = assertDirectoryIfPresent(
      sourceDir,
      `legacy ${legacyName} runtime root`,
    );
    if (!sourceStat) continue;
    const targetDir = runtimeName === '.'
      ? paths.runtimeDir
      : path.join(paths.runtimeDir, runtimeName);
    assertDirectoryIfPresent(targetDir, `runtime ${runtimeName} target`);
    for (const entry of fs.readdirSync(sourceDir)) {
      const source = path.join(sourceDir, entry);
      const target = path.join(targetDir, entry);
      assertVacantTarget(source, target);
      let canonicalSource;
      try { canonicalSource = fs.realpathSync(source); }
      catch { canonicalSource = path.resolve(source); }
      assertTreeEntrySafe(source, {
        containmentRoot: source,
        registeredWorktree: registered.has(canonicalSource),
        canonicalRuntimeDir: paths.runtimeDir,
        canonicalUltraDir: paths.ultraDir,
      });
      const wholeUltra = path.join(source, '.ultra');
      if (registered.has(canonicalSource)
          && lstatOrNull(wholeUltra)?.isSymbolicLink()
          && fs.realpathSync(wholeUltra) === fs.realpathSync(paths.ultraDir)) {
        legacyWholeUltraLinks.add(canonicalSource);
      }
    }
  }
  for (const [legacyName, runtimeRelative] of LEGACY_RUNTIME_FILES) {
    const source = path.join(paths.ultraDir, legacyName);
    const sourceStat = assertRegularFileIfPresent(source, `legacy ${legacyName}`);
    if (!sourceStat) continue;
    assertVacantTarget(source, path.join(paths.runtimeDir, runtimeRelative));
  }
  assertDirectoryIfPresent(paths.backupsDir, 'runtime backups target');
  return { registered, legacyWholeUltraLinks };
}

function moveRegisteredWorktree(rootDir, source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const result = spawnSync('git', ['worktree', 'move', source, target], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      `git worktree move failed for ${source}: `
      + `${(result.stderr || result.stdout || 'unknown error').trim()}`,
    );
  }
}

function assertVacantTarget(source, target) {
  if (!fs.existsSync(target) && !fs.lstatSync(target, { throwIfNoEntry: false })) return;
  throw new RuntimePathError(
    'LEGACY_RUNTIME_CONFLICT',
    `cannot migrate legacy runtime artifact ${source}; target already exists at ${target}`,
    { details: { source, target } },
  );
}

function restoreTrackedUltraTree(worktreePath) {
  const ultraDir = path.join(worktreePath, '.ultra');
  fs.rmSync(ultraDir, { recursive: true, force: true });
  const listed = spawnSync('git', ['-C', worktreePath, 'ls-files', '-z', '--', '.ultra'], {
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (listed.status !== 0) {
    throw new Error(
      `git ls-files failed while restoring tracked Ultra semantics in ${worktreePath}: `
      + `${String(listed.stderr || listed.stdout || 'unknown error').trim()}`,
    );
  }
  if (listed.stdout.length > 0) {
    const restored = spawnSync('git', ['-C', worktreePath, 'checkout', '--', '.ultra'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (restored.status !== 0) {
      throw new Error(
        `git checkout failed while restoring tracked Ultra semantics in ${worktreePath}: `
        + `${(restored.stderr || restored.stdout || 'unknown error').trim()}`,
      );
    }
  } else {
    fs.mkdirSync(ultraDir, { recursive: true });
  }
}

function convertLegacyWholeUltraWorktree(paths, worktreePath) {
  const ultraDir = path.join(worktreePath, '.ultra');
  const stat = lstatOrNull(ultraDir);
  if (!stat?.isSymbolicLink()
      || fs.realpathSync(ultraDir) !== fs.realpathSync(paths.ultraDir)) {
    throw new Error(`legacy whole-.ultra authority link changed before conversion: ${ultraDir}`);
  }
  restoreTrackedUltraTree(worktreePath);
  const runtimeLink = path.join(ultraDir, '.runtime');
  assertVacantTarget(paths.runtimeDir, runtimeLink);
  fs.symlinkSync(path.relative(ultraDir, paths.runtimeDir), runtimeLink, 'dir');
  if (fs.realpathSync(runtimeLink) !== fs.realpathSync(paths.runtimeDir)) {
    throw new Error(`converted worktree authority link does not resolve centrally: ${runtimeLink}`);
  }
}

function openSessionBindingTransaction(paths) {
  if (!lstatOrNull(paths.stateDbPath) || !isSQLiteDatabase(paths.stateDbPath)) return null;
  // eslint-disable-next-line global-require
  const Database = require('better-sqlite3');
  const db = new Database(paths.stateDbPath, { fileMustExist: true });
  db.pragma('busy_timeout = 0');
  const sessions = db.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'sessions'",
  ).get();
  if (!sessions) {
    db.close();
    return null;
  }
  db.exec('BEGIN IMMEDIATE');
  return db;
}

function sessionBindingsForWorktree(db, source) {
  if (!db) return [];
  const canonicalSource = physicalPathCandidate(source);
  return db.prepare('SELECT sid, worktree_path FROM sessions').all()
    .filter((row) => {
      try {
        return physicalPathCandidate(row.worktree_path) === canonicalSource;
      } catch {
        return path.resolve(row.worktree_path) === path.resolve(source);
      }
    });
}

function moveSessionBindings(db, bindings, source, target) {
  if (!db || bindings.length === 0) return;
  const update = db.prepare(
    'UPDATE sessions SET worktree_path = ? WHERE sid = ? AND worktree_path = ?',
  );
  for (const binding of bindings) {
    const result = update.run(target, binding.sid, binding.worktree_path);
    if (result.changes !== 1) {
      throw new RuntimePathError(
        'RUNTIME_SESSION_BINDING_CHANGED',
        `session ${binding.sid} worktree binding changed during migration`,
        {
          details: {
            sid: binding.sid,
            expected_worktree_path: binding.worktree_path,
            target_worktree_path: target,
          },
        },
      );
    }
  }
}

function restoreCommittedSessionBindings(paths, actions) {
  const worktreeActions = actions.filter(
    (action) => action.kind === 'worktree' && action.sessionBindings?.length,
  );
  if (worktreeActions.length === 0) return;
  const db = openSessionBindingTransaction(paths);
  if (!db) {
    throw new RuntimePathError(
      'RUNTIME_SESSION_BINDING_MISSING',
      'cannot restore migrated worktree bindings without canonical state authority',
    );
  }
  try {
    const update = db.prepare(
      'UPDATE sessions SET worktree_path = ? WHERE sid = ? AND worktree_path = ?',
    );
    for (const action of [...worktreeActions].reverse()) {
      for (const binding of action.sessionBindings) {
        const result = update.run(action.source, binding.sid, action.target);
        if (result.changes !== 1) {
          const current = db.prepare(
            'SELECT worktree_path FROM sessions WHERE sid = ?',
          ).get(binding.sid);
          if (current?.worktree_path !== action.source) {
            throw new RuntimePathError(
              'RUNTIME_SESSION_BINDING_CHANGED',
              `session ${binding.sid} cannot restore its legacy worktree binding`,
            );
          }
        }
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* best effort */ }
    throw error;
  } finally {
    db.close();
  }
}

function moveLegacyDirectoryContents({
  rootDir,
  sourceDir,
  targetDir,
  registered,
  legacyWholeUltraLinks,
  paths,
  rename,
  actions,
  removedDirs,
  bindingDb,
}) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    assertVacantTarget(source, target);
    let canonicalSource;
    try { canonicalSource = fs.realpathSync(source); }
    catch { canonicalSource = path.resolve(source); }
    if (registered.has(canonicalSource)) {
      const sessionBindings = sessionBindingsForWorktree(bindingDb, source);
      const legacyWholeUltraLink = legacyWholeUltraLinks.has(canonicalSource);
      const originalUltraLink = legacyWholeUltraLink
        ? fs.readlinkSync(path.join(source, '.ultra'))
        : null;
      moveRegisteredWorktree(rootDir, source, target);
      actions.push({
        kind: 'worktree',
        source,
        target,
        sessionBindings,
        legacyWholeUltraLink,
        originalUltraLink,
      });
      moveSessionBindings(bindingDb, sessionBindings, source, target);
      if (legacyWholeUltraLink) convertLegacyWholeUltraWorktree(paths, target);
    } else {
      rename(source, target);
      actions.push({ kind: 'rename', source, target });
    }
  }
  if (fs.readdirSync(sourceDir).length === 0) {
    fs.rmdirSync(sourceDir);
    removedDirs.push(sourceDir);
  }
}

function rollbackLegacyRuntime(rootDir, actions, removedDirs, rollbackRename) {
  const errors = [];
  for (const dir of [...removedDirs].reverse()) {
    try { fs.mkdirSync(dir, { recursive: true }); }
    catch (error) { errors.push(`${dir}: ${error.message}`); }
  }
  for (const action of [...actions].reverse()) {
    try {
      fs.mkdirSync(path.dirname(action.source), { recursive: true });
      if (action.kind === 'worktree') {
        if (action.legacyWholeUltraLink) restoreTrackedUltraTree(action.target);
        moveRegisteredWorktree(rootDir, action.target, action.source);
        if (action.legacyWholeUltraLink) {
          fs.rmSync(path.join(action.source, '.ultra'), { recursive: true, force: true });
          fs.symlinkSync(action.originalUltraLink, path.join(action.source, '.ultra'), 'dir');
        }
      } else {
        rollbackRename(action.target, action.source);
      }
    } catch (error) {
      errors.push(`${action.target}: ${error.message}`);
    }
  }
  if (errors.length === 0) {
    try {
      restoreCommittedSessionBindings(pathsFor(rootDir), actions);
    } catch (error) {
      errors.push(`session worktree bindings: ${error.message}`);
    }
  }
  return errors;
}

function migrateLegacyRuntime(rootDir, {
  rename = fs.renameSync,
  rollbackRename = fs.renameSync,
  spawnGit = spawnSync,
  _migrationGateToken = null,
} = {}) {
  let paths = validateProjectLayout(rootDir, { forMutation: true, env: {} });
  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  const releaseGate = _migrationGateToken === HELD_MIGRATION_GATE
    ? () => {}
    : acquireStateMigrationGate(paths);
  let registered;
  let legacyWholeUltraLinks;
  const actions = [];
  const removedDirs = [];
  let bindingDb = null;
  try {
    // The caller may preflight before state migration for all-or-nothing
    // admission, but only this gate-owned re-read is authoritative.
    paths = validateProjectLayout(rootDir, { forMutation: true, env: {} });
    const checked = preflightLegacyRuntime(paths, { spawnGit });
    registered = checked.registered;
    legacyWholeUltraLinks = checked.legacyWholeUltraLinks || new Set();
    bindingDb = openSessionBindingTransaction(paths);
    const legacyWorktrees = path.join(paths.ultraDir, 'worktrees');
    moveLegacyDirectoryContents({
      rootDir,
      sourceDir: legacyWorktrees,
      targetDir: paths.worktreesDir,
      registered,
      legacyWholeUltraLinks,
      paths,
      rename,
      actions,
      removedDirs,
      bindingDb,
    });
    for (const [legacyName, runtimeName] of LEGACY_RUNTIME_DIRS) {
      const sourceDir = path.join(paths.ultraDir, legacyName);
      const targetDir = runtimeName === '.'
        ? paths.runtimeDir
        : path.join(paths.runtimeDir, runtimeName);
      moveLegacyDirectoryContents({
        rootDir,
        sourceDir,
        targetDir,
        registered,
        legacyWholeUltraLinks,
        paths,
        rename,
        actions,
        removedDirs,
        bindingDb,
      });
    }
    for (const [legacyName, runtimeRelative] of LEGACY_RUNTIME_FILES) {
      const source = path.join(paths.ultraDir, legacyName);
      if (!fs.existsSync(source)) continue;
      const target = path.join(paths.runtimeDir, runtimeRelative);
      assertVacantTarget(source, target);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      rename(source, target);
      actions.push({ kind: 'rename', source, target });
    }
    if (bindingDb) bindingDb.exec('COMMIT');
  } catch (error) {
    if (bindingDb) {
      try { bindingDb.exec('ROLLBACK'); } catch { /* best effort */ }
    }
    const rollbackErrors = rollbackLegacyRuntime(
      rootDir,
      actions,
      removedDirs,
      rollbackRename,
    );
    if (error instanceof RuntimePathError && rollbackErrors.length === 0) throw error;
    throw new RuntimePathError(
      'LEGACY_RUNTIME_MIGRATION_FAILED',
      `could not move legacy Ultra runtime artifacts into .ultra/.runtime: ${error.message}`
        + `${rollbackErrors.length ? `; rollback errors: ${rollbackErrors.join('; ')}` : ''}`,
      { cause: error },
    );
  } finally {
    if (bindingDb) bindingDb.close();
    releaseGate();
  }
  const result = {
    migrated: actions.length > 0,
    moved: actions.map(({ kind, source, target }) => ({ kind, source, target })),
  };
  Object.defineProperty(result, '_transaction', {
    value: { actions, removedDirs, rollbackRename },
  });
  return result;
}

function restoreStateMigrationImage(state) {
  if (!state?.migrated || !state.backupPath) return;
  for (const suffix of STATE_SUFFIXES) {
    const backup = path.join(state.backupPath, `state.db${suffix}`);
    const runtimeTarget = `${state.stateDbPath}${suffix}`;
    const legacyTarget = `${state.legacyStateDbPath}${suffix}`;
    fs.rmSync(runtimeTarget, { force: true });
    if (!lstatOrNull(backup)) continue;
    assertRegularFileIfPresent(backup, `migration backup state.db${suffix}`);
    atomicVerifiedCopy(backup, legacyTarget);
  }
  if (state._transaction) state._transaction.tombstone = false;
}

function ensureRuntimeState(rootDir, options = {}) {
  let paths = validateProjectLayout(rootDir, {
    env: options.env || {},
    allowConfiguredRuntimeLink: options.allowConfiguredRuntimeLink === true,
    forMutation: options.allowConfiguredRuntimeLink !== true,
    validateRuntimeTree: true,
  });
  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  const releaseGate = acquireStateMigrationGate(paths);
  let state = null;
  let legacyRuntime = null;
  try {
    // Everything observed before waiting on the outer gate is stale. Re-read
    // the complete authority and keep this token through storage admission or
    // every rollback, so another successful caller can never observe state
    // that a failing predecessor is still allowed to remove.
    paths = validateProjectLayout(rootDir, {
      env: options.env || {},
      allowConfiguredRuntimeLink: options.allowConfiguredRuntimeLink === true,
      forMutation: options.allowConfiguredRuntimeLink !== true,
      validateRuntimeTree: true,
    });
    assertNoCompetingState(paths);
    assertConfiguredAuthorityBinding(paths);
    if (paths.runtimeLinked) {
      const legacyRuntimePresent = [
        ...LEGACY_RUNTIME_DIRS.map(([name]) => path.join(paths.ultraDir, name)),
        ...LEGACY_RUNTIME_FILES.map(([name]) => path.join(paths.ultraDir, name)),
        path.join(paths.ultraDir, 'worktrees'),
      ].some((candidate) => lstatOrNull(candidate));
      if (legacyRuntimePresent) {
        throw new RuntimePathError(
          'RUNTIME_PATH_UNSAFE',
          'a task runtime link cannot be used as a migration target for legacy local runtime data',
        );
      }
      const storageBoundary = options.admitStorageBoundary
        ? options.admitStorageBoundary()
        : null;
      return {
        ...paths,
        stateDbPath: paths.configuredStateDbPath,
        migrated: false,
        backupPath: null,
        legacyRuntime: { migrated: false, moved: [] },
        storageBoundary,
      };
    }

    // Validate every source and target under the same token that owns the
    // migration, Git boundary callback, and rollback.
    preflightLegacyRuntime(paths, {
      spawnGit: options.spawnGit || spawnSync,
    });
    state = options.migrateState === false
      ? { ...paths, migrated: false, backupPath: null }
      : migrateLegacyState(rootDir, {
        ...options,
        _migrationGateToken: HELD_MIGRATION_GATE,
      });
    legacyRuntime = migrateLegacyRuntime(rootDir, {
      ...options,
      _migrationGateToken: HELD_MIGRATION_GATE,
    });
    const storageBoundary = options.admitStorageBoundary
      ? options.admitStorageBoundary()
      : null;
    return { ...state, legacyRuntime, storageBoundary };
  } catch (error) {
    const rollbackErrors = [];
    if (legacyRuntime?._transaction) {
      rollbackErrors.push(...rollbackLegacyRuntime(
        paths.rootDir,
        legacyRuntime._transaction.actions,
        legacyRuntime._transaction.removedDirs,
        legacyRuntime._transaction.rollbackRename,
      ));
    }
    if (state?._transaction) {
      try {
        restoreStateMigrationImage(state);
      } catch (restoreError) {
        rollbackErrors.push(
          `state migration image restore failed: ${restoreError.message}`,
        );
      }
    }
    if (rollbackErrors.length) {
      throw new RuntimePathError(
        'RUNTIME_ADMISSION_ROLLBACK_FAILED',
        `${error.message}; rollback errors: ${rollbackErrors.join('; ')}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    releaseGate();
  }
}

function resolveConfiguredStateDb(rootDir, {
  env = process.env,
  migrateLegacy = false,
  now,
} = {}) {
  const projectPaths = validateProjectLayout(rootDir, { env });
  assertNoCompetingState(projectPaths);
  assertConfiguredAuthorityBinding(projectPaths);
  const configured = explicitStateDbPath(env);
  if (configured) {
    if (migrateLegacy && configured === projectPaths.legacyStateDbPath) {
      return {
        ...ensureRuntimeState(rootDir, { ...(now ? { now } : {}) }),
        configured: true,
      };
    }
    return {
      ...projectPaths,
      stateDbPath: configured,
      migrated: false,
      backupPath: null,
      configured: true,
    };
  }
  if (migrateLegacy) {
    return ensureRuntimeState(rootDir, { ...(now ? { now } : {}) });
  }
  return {
    ...pathsFor(rootDir),
    stateDbPath: locateStateDb(rootDir, { env: {} }),
    migrated: false,
    backupPath: null,
    configured: false,
  };
}

function findProjectRoot(startDir, { env = process.env } = {}) {
  const explicitRoot = typeof env?.UBP_ROOT_DIR === 'string' ? env.UBP_ROOT_DIR.trim() : '';
  if (explicitRoot) {
    const root = assertSafeRoot(explicitRoot);
    const dbPath = locateStateDb(root, { env });
    return fs.existsSync(dbPath) ? root : null;
  }

  const requestedStart = path.resolve(startDir || process.cwd());
  let current;
  try {
    current = fs.realpathSync(requestedStart);
  } catch (error) {
    throw new RuntimePathError(
      'RUNTIME_ROOT_INVALID',
      `project root search start does not exist: ${requestedStart}`,
      { cause: error },
    );
  }
  while (true) {
    const dbPath = locateStateDb(current, { env: {} });
    if (fs.existsSync(dbPath)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function assertManagedBackupDestination(rootDir, targetPath) {
  const paths = validateProjectLayout(rootDir, {
    env: {},
    validateRuntimeTree: true,
  });
  const target = path.resolve(rootDir, targetPath);
  const physicalBackups = physicalPathCandidate(paths.backupsDir);
  const physicalTarget = physicalPathCandidate(target);
  const relative = path.relative(physicalBackups, physicalTarget);
  if (!relative
      || relative === '..'
      || relative.startsWith(`..${path.sep}`)
      || path.isAbsolute(relative)) {
    throw new RuntimePathError(
      'RUNTIME_BACKUP_SCOPE_INVALID',
      `backup target must be inside ${paths.backupsDir}: ${target}`,
      { details: { target, backups_root: paths.backupsDir } },
    );
  }
  let current = physicalPathCandidate(paths.runtimeDir);
  for (const part of path.relative(
    physicalPathCandidate(paths.runtimeDir),
    path.dirname(physicalTarget),
  ).split(path.sep)) {
    if (!part || part === '.') continue;
    current = path.join(current, part);
    const stat = lstatOrNull(current);
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      throw new RuntimePathError(
        'RUNTIME_BACKUP_SCOPE_INVALID',
        `backup target parent must be a real managed directory: ${current}`,
        { details: { target, unsafe_parent: current } },
      );
    }
  }
  const targetStat = lstatOrNull(target);
  if (targetStat && (targetStat.isSymbolicLink() || !targetStat.isFile())) {
    throw new RuntimePathError(
      'RUNTIME_BACKUP_SCOPE_INVALID',
      `backup target must be a regular file: ${target}`,
      { details: { target } },
    );
  }
  return { ...paths, targetPath: target };
}

module.exports = {
  RuntimePathError,
  RUNTIME_RELATIVE_DIR,
  STATE_DB_RELATIVE_PATH,
  LEGACY_STATE_DB_RELATIVE_PATH,
  pathsFor,
  validateProjectLayout,
  locateStateDb,
  findProjectRoot,
  projectRootFromStateDbPath,
  isManagedLegacyStateTombstone,
  ensureRuntimeState,
  migrateLegacyState,
  migrateLegacyRuntime,
  resolveConfiguredStateDb,
  assertManagedBackupDestination,
  _internal: {
    acquireStateMigrationGate,
  },
};
