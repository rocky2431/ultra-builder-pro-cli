'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const Database = require('better-sqlite3');

const {
  EXPECTED_VERSION, initStateDb, openStateDb, closeStateDb, MIGRATED_GAPS,
} = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const projector = require('../../mcp-server/lib/projector.cjs');
const runtimePaths = require('../../mcp-server/lib/runtime-paths.cjs');
const contextPaths = require('../../mcp-server/lib/context-paths.cjs');

const DEFAULT_FROM = '4.4';
const BACKUP_MANIFEST = 'backup-manifest.json';
const BACKUP_MANIFEST_KIND = 'ultra-projection-backup';
const SUPPORTED_TRANSITIONS = Object.freeze({
  '4.4': '4.5',
  '4.5': EXPECTED_VERSION,
});

// Frozen SQL — values flow through parameter bindings.
const RECORD_MIGRATION_SQL = "INSERT INTO migration_history (from_version, to_version, direction, status, notes) VALUES (@from, @to, @direction, @status, @notes)";

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function parseFlags(args) {
  const flags = { _: [] };
  // Accept both "--from 4.4" and "--from=4.4" styles.
  const valueOf = (token, i) => {
    const eq = token.indexOf('=');
    return eq >= 0 ? { value: token.slice(eq + 1), nextI: i } : { value: args[i + 1], nextI: i + 1 };
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry')        { flags.dry = true; continue; }
    if (a === '--rollback')   { flags.rollback = true; continue; }
    if (a === '--help' || a === '-h') { flags.help = true; continue; }
    if (a.startsWith('--from'))       { const r = valueOf(a, i); flags.from = r.value; i = r.nextI; continue; }
    if (a.startsWith('--to'))         { const r = valueOf(a, i); flags.to = r.value; i = r.nextI; continue; }
    if (a.startsWith('--source-dir')) { const r = valueOf(a, i); flags.sourceDir = r.value; i = r.nextI; continue; }
    if (a.startsWith('--db-path'))    { const r = valueOf(a, i); flags.dbPath = r.value; i = r.nextI; continue; }
    flags._.push(a);
  }
  return flags;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = text.slice(3, end).trim();
  const out = {};
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    out[key] = value;
  }
  return out;
}

function readJsonOptional(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function findContexts(rootDir, ultraDir = path.join(rootDir, '.ultra')) {
  const dir = path.join(ultraDir, 'tasks', 'contexts');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dir, f));
}

function lstatOrNull(candidate) {
  try {
    return fs.lstatSync(candidate);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertRealDirectory(candidate, label) {
  const stat = lstatOrNull(candidate);
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`migrate: ${label} must be a real directory: ${candidate}`);
  }
  return stat;
}

function assertRegularTree(root, label) {
  assertRealDirectory(root, label);
  const pending = fs.readdirSync(root).map((entry) => path.join(root, entry));
  while (pending.length > 0) {
    const candidate = pending.pop();
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw new Error(
        `migrate: ${label} contains a symlink or non-regular entry: ${candidate}`,
      );
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(candidate)) {
        pending.push(path.join(candidate, entry));
      }
    }
  }
}

function copyDirSync(src, dst, {
  copyFileSync = fs.copyFileSync,
  excludeAuthorityRoot = true,
} = {}) {
  assertRealDirectory(src, 'copy source');
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (excludeAuthorityRoot && entry.name === '.runtime') continue;
    if (excludeAuthorityRoot
        && ['state.db', 'state.db-wal', 'state.db-shm'].includes(entry.name)) continue;
    if (excludeAuthorityRoot && /^backup-v[^/]+-/.test(entry.name)) continue;
    if (entry.isDirectory()) {
      copyDirSync(s, d, { copyFileSync, excludeAuthorityRoot: false });
    }
    else if (entry.isFile()) copyFileSync(s, d);
    else {
      throw new Error(
        `migrate: copy source contains a symlink or non-regular entry: ${s}`,
      );
    }
  }
}

function fileDigest(candidate) {
  return createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');
}

function regularTreeInventory(root, { excludeRootEntries = [] } = {}) {
  assertRegularTree(root, 'inventory tree');
  const inventory = [];
  const excluded = new Set(excludeRootEntries);
  const pending = fs.readdirSync(root)
    .filter((entry) => !excluded.has(entry))
    .map((entry) => path.join(root, entry));
  while (pending.length > 0) {
    const candidate = pending.pop();
    const stat = fs.lstatSync(candidate);
    const relative = path.relative(root, candidate).split(path.sep).join('/');
    if (stat.isDirectory()) {
      inventory.push({ path: `${relative}/`, kind: 'directory' });
      for (const entry of fs.readdirSync(candidate)) pending.push(path.join(candidate, entry));
    } else {
      inventory.push({
        path: relative,
        kind: 'file',
        size: stat.size,
        sha256: fileDigest(candidate),
      });
    }
  }
  return inventory.sort((left, right) => left.path.localeCompare(right.path));
}

function jsonDigest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function backupInventory(root) {
  return regularTreeInventory(root, { excludeRootEntries: [BACKUP_MANIFEST] });
}

function backupManifest(inventory, fromVersion, createdAt) {
  return {
    version: 1,
    kind: BACKUP_MANIFEST_KIND,
    source_version: String(fromVersion),
    created_at: createdAt,
    inventory,
    inventory_sha256: jsonDigest(inventory),
  };
}

function validateBackupManifestDocument(manifest, fromVersion, label) {
  if (!manifest
      || manifest.version !== 1
      || manifest.kind !== BACKUP_MANIFEST_KIND
      || manifest.source_version !== String(fromVersion)
      || !Array.isArray(manifest.inventory)
      || !/^[a-f0-9]{64}$/.test(manifest.inventory_sha256 || '')
      || manifest.inventory_sha256 !== jsonDigest(manifest.inventory)) {
    throw new Error(`migrate: ${label} has an invalid backup manifest`);
  }
  return {
    manifest,
    manifestDigest: jsonDigest(manifest),
    inventoryDigest: manifest.inventory_sha256,
  };
}

function projectionInventory(root) {
  const stage = fs.mkdtempSync(path.join(path.dirname(root), '.inventory-stage-'));
  try {
    copyDirSync(root, stage);
    return regularTreeInventory(stage);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

function isoTimestamp(value, fallback) {
  const candidate = value || fallback;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`migrate: invalid timestamp ${JSON.stringify(candidate)}`);
  }
  return date.toISOString();
}

function projectRelativeContextPath(sourceDir, value) {
  if (!value) return null;
  try {
    return contextPaths.resolveContextPath(sourceDir, value, {
      allowLegacyAliases: true,
    }).relative;
  } catch (error) {
    if (error.code !== 'CONTEXT_PATH_INVALID') throw error;
    throw new Error(`migrate: context_file rejected: ${error.message}`, { cause: error });
  }
}

function sanitizeLegacyContextTemplate(sourceDir) {
  const file = path.join(sourceDir, '.ultra', 'tasks', 'contexts', 'TEMPLATE.md');
  if (!fs.existsSync(file)) return false;
  const current = fs.readFileSync(file, 'utf8');
  const next = current
    .replace(/^>\s*\*\*Status\*\*:.*(?:\r?\n|$)(?:\r?\n)?/mi, '')
    .replace(
      /Read by mid_workflow_recall\.py and session_context\.py and injected into agent context\./g,
      'Used as task-local acceptance criteria by the active Ultra workflow.',
    );
  if (next === current) return false;
  fs.writeFileSync(file, next);
  return true;
}

function normalizeLegacyTask(task, tasksJson, contextHeaders, sourceDir) {
  if (!task || typeof task !== 'object') throw new Error('migrate: every task must be an object');
  for (const field of ['id', 'title', 'type', 'priority', 'status']) {
    if (task[field] === undefined || task[field] === null || task[field] === '') {
      throw new Error(`migrate: task ${task.id || '(unknown)'} missing ${field}`);
    }
  }
  const deps = task.dependencies ?? task.deps ?? [];
  if (!Array.isArray(deps)) throw new Error(`migrate: task ${task.id} dependencies must be an array`);
  if (task.estimated_days !== undefined
      && (!Number.isFinite(task.estimated_days) || task.estimated_days <= 0)) {
    throw new Error(`migrate: task ${task.id} estimated_days must be a positive number`);
  }
  const createdAt = isoTimestamp(task.created_at, tasksJson.created);
  const updatedAt = isoTimestamp(task.updated_at, tasksJson.updated || tasksJson.created);
  const ctx = contextHeaders[task.id];
  const contextFile = projectRelativeContextPath(
    sourceDir,
    task.context_file || (ctx && ctx._file),
  );
  return {
    ...task,
    deps,
    estimated_days: task.estimated_days ?? null,
    context_file: contextFile,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function planForward(sourceDir, expectedFrom = DEFAULT_FROM, {
  ultraDir = path.join(sourceDir, '.ultra'),
} = {}) {
  const tasksPath = path.join(ultraDir, 'tasks', 'tasks.json');
  const tasksJson = readJsonOptional(tasksPath);
  if (!tasksJson || !Array.isArray(tasksJson.tasks)) {
    throw new Error(`migrate: tasks.json missing or malformed at ${tasksPath}`);
  }
  const version = String(tasksJson.version || tasksJson.schema_version || '');
  if (version !== expectedFrom) {
    throw new Error(`migrate: expected v${expectedFrom} tasks.json, found ${version || '(missing version)'}`);
  }

  const contextHeaders = {};
  for (const file of findContexts(sourceDir, ultraDir)) {
    const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    if (fm && fm.task_id) {
      contextHeaders[fm.task_id] = {
        ...fm,
        _file: path.join(
          sourceDir,
          '.ultra',
          path.relative(ultraDir, file),
        ),
      };
    }
  }

  const warnings = [];
  for (const task of tasksJson.tasks) {
    const ctx = contextHeaders[task.id];
    if (ctx && ctx.status && ctx.status !== task.status) {
      warnings.push({
        task_id: task.id,
        json_status: task.status,
        context_status: ctx.status,
        resolution: `tasks.json wins (v${expectedFrom} projection migration rule)`,
      });
    }
  }

  const eventsPath = path.join(ultraDir, 'activity-log.json');
  const events = readJsonOptional(eventsPath);
  const eventList = Array.isArray(events) ? events : [];
  const tasks = tasksJson.tasks.map((task) => (
    normalizeLegacyTask(task, tasksJson, contextHeaders, sourceDir)
  ));

  return {
    tasks,
    events: eventList,
    contextHeaders,
    warnings,
    projectName: tasksJson.project?.name || path.basename(sourceDir),
  };
}

function applyForward(db, plan) {
  const insertTask = db.prepare(
    "INSERT INTO tasks (id, title, type, priority, complexity, estimated_days, status, deps, tag, trace_to, context_file, created_at, updated_at) VALUES (@id, @title, @type, @priority, @complexity, @estimated_days, @status, @deps, @tag, @trace_to, @context_file, @created_at, @updated_at)",
  );
  const insertEvent = db.prepare(
    "INSERT INTO events (ts, type, task_id, session_id, runtime, payload_json) VALUES (@ts, @type, @task_id, @session_id, @runtime, @payload)",
  );

  let taskInserted = 0;
  for (const t of plan.tasks) {
    insertTask.run({
      id: t.id,
      title: t.title,
      type: t.type,
      priority: t.priority,
      complexity: t.complexity ?? null,
      estimated_days: t.estimated_days,
      status: t.status,
      deps: JSON.stringify(t.deps),
      tag: t.tag ?? null,
      trace_to: t.trace_to ?? null,
      context_file: t.context_file,
      created_at: t.created_at,
      updated_at: t.updated_at,
    });
    taskInserted++;
  }

  let eventsInserted = 0;
  for (const e of plan.events) {
    insertEvent.run({
      ts: e.ts || new Date().toISOString(),
      type: e.type,
      task_id: e.task_id ?? null,
      session_id: e.session_id ?? null,
      runtime: e.runtime ?? null,
      payload: e.payload === undefined ? null : JSON.stringify(e.payload),
    });
    eventsInserted++;
  }

  return { taskInserted, eventsInserted };
}

function recordMigration(db, { from, to, direction, status, notes }) {
  db.prepare(RECORD_MIGRATION_SQL).run({ from, to, direction, status, notes });
}

function ensureBackupName(sourceDir, fromVersion = DEFAULT_FROM) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const parent = runtimePaths.pathsFor(sourceDir).backupsDir;
  const prefix = `projection-v${fromVersion}-${ts}`;
  let candidate = path.join(parent, prefix);
  let attempt = 0;
  while (lstatOrNull(candidate)) {
    attempt += 1;
    candidate = path.join(parent, `${prefix}-${attempt}`);
  }
  return candidate;
}

function createProjectionBackup(sourceDir, fromVersion, {
  copyFileSync = fs.copyFileSync,
  renameSync = fs.renameSync,
} = {}) {
  const paths = runtimePaths.pathsFor(sourceDir);
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const stage = path.join(sourceDir, `.ultra-migrate-stage-${token}`);
  const finalPath = ensureBackupName(sourceDir, fromVersion);
  try {
    copyDirSync(paths.ultraDir, stage, { copyFileSync });
    const expected = projectionInventory(paths.ultraDir);
    const actual = regularTreeInventory(stage);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('migrate: staged projection backup inventory does not match source');
    }
    writeJsonAtomic(
      path.join(stage, BACKUP_MANIFEST),
      backupManifest(actual, fromVersion, new Date().toISOString()),
    );
    assertRollbackBackup(sourceDir, stage, fromVersion, { staged: true });
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    renameSync(stage, finalPath);
    return finalPath;
  } catch (error) {
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch { /* recovery path remains */ }
    throw error;
  }
}

function prepareForwardSnapshot(sourceDir, fromVersion, {
  afterBackup = null,
  ...backupOptions
} = {}) {
  const backupDir = createProjectionBackup(sourceDir, fromVersion, backupOptions);
  if (afterBackup) afterBackup({ sourceDir, backupDir });
  const bound = assertRollbackBackup(sourceDir, backupDir, fromVersion);
  const current = projectionInventory(runtimePaths.pathsFor(sourceDir).ultraDir);
  if (JSON.stringify(current) !== JSON.stringify(bound.manifest.inventory)) {
    throw new Error(
      'migrate: semantic source changed after the immutable backup snapshot; replan required',
    );
  }
  const plan = planForward(sourceDir, fromVersion, { ultraDir: backupDir });
  return { backupDir, plan, manifest: bound.manifest };
}

function backupTimestampFromName(candidate) {
  const match = path.basename(candidate).match(
    /(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:-\d+)?$/,
  );
  if (!match) return null;
  const value = `${match[1]}:${match[2]}:${match[3]}.${match[4]}Z`;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function backupTimestampFromMetadata(candidate) {
  for (const name of ['.backup-metadata.json', 'backup-metadata.json']) {
    const metadataPath = path.join(candidate, name);
    const stat = lstatOrNull(metadataPath);
    if (!stat) continue;
    if (stat.isSymbolicLink() || !stat.isFile()) return null;
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      const timestamp = Date.parse(metadata.created_at || metadata.createdAt || '');
      if (Number.isFinite(timestamp)) return timestamp;
    } catch {
      return null;
    }
  }
  return null;
}

function backupSortKey(candidate) {
  const stat = fs.lstatSync(candidate);
  return [
    backupTimestampFromMetadata(candidate)
      ?? backupTimestampFromName(candidate)
      ?? stat.mtimeMs,
    stat.mtimeMs,
    candidate,
  ];
}

function findLatestBackup(sourceDir, fromVersion = DEFAULT_FROM) {
  runtimePaths.validateProjectLayout(sourceDir, {
    env: {},
    validateRuntimeTree: true,
  });
  const roots = [
    {
      dir: runtimePaths.pathsFor(sourceDir).backupsDir,
      prefix: `projection-v${fromVersion}-`,
    },
    {
      dir: path.join(sourceDir, '.ultra'),
      prefix: `backup-v${fromVersion}-`,
    },
  ];
  const candidates = roots.flatMap(({ dir, prefix }) => (
    fs.existsSync(dir)
      ? fs.readdirSync(dir)
        .filter((name) => name.startsWith(prefix))
        .map((name) => path.join(dir, name))
      : []
  ));
  const valid = [];
  const invalid = [];
  for (const candidate of candidates) {
    try {
      assertRollbackBackup(sourceDir, candidate, fromVersion);
      valid.push(candidate);
    } catch (error) {
      invalid.push(error);
    }
  }
  if (valid.length === 0) {
    if (invalid.length > 0) throw invalid[0];
    return null;
  }
  valid.sort((left, right) => {
    const a = backupSortKey(left);
    const b = backupSortKey(right);
    return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
  });
  return valid.at(-1);
}

function assertRollbackBackup(sourceDir, backupDir, fromVersion, { staged = false } = {}) {
  const paths = runtimePaths.validateProjectLayout(sourceDir, { env: {} });
  if (!staged) {
    const allowedParents = [
      paths.backupsDir,
      paths.ultraDir,
    ];
    const parent = path.dirname(path.resolve(backupDir));
    if (!allowedParents.includes(parent)) {
      throw new Error(`migrate: rollback backup is outside a managed backup root: ${backupDir}`);
    }
    if (parent === paths.backupsDir) {
      assertRealDirectory(paths.backupsDir, 'runtime backup root');
    }
  }
  assertRegularTree(backupDir, 'rollback backup');
  for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
    const candidate = path.join(backupDir, entry.name);
    if (entry.name === '.runtime'
        || entry.name === 'state.db'
        || entry.name === 'state.db-wal'
        || entry.name === 'state.db-shm') {
      throw new Error(`migrate: rollback backup contains a runtime authority entry: ${candidate}`);
    }
  }
  // Traversing the source with the same copier used for staging proves every
  // nested entry is a real directory or regular file before current state moves.
  const tasksPath = path.join(backupDir, 'tasks', 'tasks.json');
  const tasksStat = lstatOrNull(tasksPath);
  if (!tasksStat || tasksStat.isSymbolicLink() || !tasksStat.isFile()) {
    throw new Error(`migrate: rollback backup has no regular tasks/tasks.json: ${tasksPath}`);
  }
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  const version = String(tasks.version || tasks.schema_version || '');
  if (version !== String(fromVersion) || !Array.isArray(tasks.tasks)) {
    throw new Error(
      `migrate: rollback backup is not a valid v${fromVersion} projection snapshot`,
    );
  }
  const inventory = backupInventory(backupDir);
  const manifestPath = path.join(backupDir, BACKUP_MANIFEST);
  const manifestStat = lstatOrNull(manifestPath);
  const requiresManifest = path.basename(backupDir).startsWith(`projection-v${fromVersion}-`);
  let manifest;
  if (manifestStat) {
    if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) {
      throw new Error(`migrate: rollback backup manifest is unsafe: ${manifestPath}`);
    }
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      throw new Error(`migrate: rollback backup manifest is malformed: ${manifestPath}`, {
        cause: error,
      });
    }
  } else if (requiresManifest) {
    throw new Error(`migrate: projection backup manifest is missing: ${manifestPath}`);
  } else {
    // Legacy backup-v snapshots predate cryptographic manifests. Adopt their
    // complete current image once, before mutation, and bind that inventory to
    // the new durable recovery journal.
    manifest = backupManifest(
      inventory,
      fromVersion,
      new Date(fs.lstatSync(backupDir).mtimeMs).toISOString(),
    );
  }
  const admitted = validateBackupManifestDocument(
    manifest,
    fromVersion,
    'rollback backup',
  );
  if (JSON.stringify(inventory) !== JSON.stringify(manifest.inventory)) {
    throw new Error(
      `migrate: rollback backup inventory does not match its manifest: ${backupDir}`,
    );
  }
  return {
    paths,
    manifest: admitted.manifest,
    manifestDigest: admitted.manifestDigest,
    inventoryDigest: admitted.inventoryDigest,
    manifestPath: manifestStat ? manifestPath : null,
  };
}

function assertCurrentSemanticTree(ultraDir) {
  assertRealDirectory(ultraDir, '.ultra');
  const pending = fs.readdirSync(ultraDir, { withFileTypes: true })
    .filter((entry) => entry.name !== '.runtime'
      && entry.name !== 'state.db'
      && entry.name !== 'state.db-wal'
      && entry.name !== 'state.db-shm')
    .map((entry) => path.join(ultraDir, entry.name));
  while (pending.length > 0) {
    const candidate = pending.pop();
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw new Error(
        `migrate: current semantic tree contains a symlink or non-regular entry: ${candidate}`,
      );
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(candidate)) {
        pending.push(path.join(candidate, entry));
      }
    }
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (error) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw error;
  }
}

function updateRollbackJournal(journalPath, patch) {
  const current = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const next = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  writeJsonAtomic(journalPath, next);
  return next;
}

function rollbackRecoveryBase(paths) {
  return path.join(paths.runtimeDir, 'recovery', 'migrate-rollback');
}

function assertRollbackRecoveryJournal(sourceDir, paths, recoveryDir, journal) {
  const resolvedRecovery = path.resolve(recoveryDir);
  const recoveryBase = path.resolve(rollbackRecoveryBase(paths));
  if (path.dirname(resolvedRecovery) !== recoveryBase) {
    throw new Error(`migrate: rollback recovery is outside its managed root: ${recoveryDir}`);
  }
  if (!journal || journal.version !== 1
      || path.resolve(journal.source_dir || '') !== path.resolve(sourceDir)
      || path.resolve(journal.recovery_dir || '') !== resolvedRecovery
      || path.dirname(path.resolve(journal.stage_dir || '')) !== path.resolve(paths.runtimeDir)
      || !path.basename(journal.stage_dir || '').startsWith('.rollback-stage-')
      || path.resolve(journal.backup_manifest_path || '')
        !== path.resolve(recoveryDir, BACKUP_MANIFEST)
      || !/^[a-f0-9]{64}$/.test(journal.backup_manifest_sha256 || '')
      || !/^[a-f0-9]{64}$/.test(journal.backup_inventory_sha256 || '')
      || ![
        'prepared',
        'installed',
        'cleanup_pending',
        'complete',
        'rolled_back',
        'recovery_failed',
      ].includes(journal.phase)) {
    throw new Error(`migrate: invalid rollback recovery journal: ${recoveryDir}`);
  }
  const hasStateInventory = journal.previous_state_inventory !== undefined
    || journal.previous_state_inventory_sha256 !== undefined;
  if (hasStateInventory) {
    if (!Array.isArray(journal.previous_state_inventory)
        || !/^[a-f0-9]{64}$/.test(journal.previous_state_inventory_sha256 || '')
        || jsonDigest(journal.previous_state_inventory)
          !== journal.previous_state_inventory_sha256) {
      throw new Error(`migrate: invalid rollback state inventory: ${recoveryDir}`);
    }
    const actual = regularTreeInventory(path.join(recoveryDir, 'previous-state'));
    if (JSON.stringify(actual) !== JSON.stringify(journal.previous_state_inventory)) {
      throw new Error(`migrate: rollback state snapshot changed after publication: ${recoveryDir}`);
    }
  }
  return journal;
}

function boundRecoveryManifest(recoveryDir, journal) {
  const manifestPath = path.join(recoveryDir, BACKUP_MANIFEST);
  const stat = lstatOrNull(manifestPath);
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`migrate: bound recovery manifest is missing or unsafe: ${manifestPath}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`migrate: bound recovery manifest is malformed: ${manifestPath}`, {
      cause: error,
    });
  }
  const admitted = validateBackupManifestDocument(
    manifest,
    journal.from_version,
    'bound recovery',
  );
  if (admitted.manifestDigest !== journal.backup_manifest_sha256
      || admitted.inventoryDigest !== journal.backup_inventory_sha256) {
    throw new Error('migrate: recovery manifest digest does not match its journal binding');
  }
  return admitted;
}

function assertInstalledRollback(sourceDir, paths, journal) {
  const bound = boundRecoveryManifest(journal.recovery_dir, journal);
  assertCurrentSemanticTree(paths.ultraDir);
  const installedInventory = projectionInventory(paths.ultraDir);
  if (JSON.stringify(installedInventory) !== JSON.stringify(bound.manifest.inventory)) {
    throw new Error('migrate: installed rollback inventory does not match its bound manifest');
  }
  const tasksPath = path.join(paths.ultraDir, 'tasks', 'tasks.json');
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  const version = String(tasks.version || tasks.schema_version || '');
  if (version !== String(journal.from_version)) {
    throw new Error(
      `migrate: installed rollback does not match v${journal.from_version}: ${tasksPath}`,
    );
  }
  for (const candidate of [
    paths.stateDbPath,
    `${paths.stateDbPath}-wal`,
    `${paths.stateDbPath}-shm`,
    paths.legacyStateDbPath,
    `${paths.legacyStateDbPath}-wal`,
    `${paths.legacyStateDbPath}-shm`,
  ]) {
    if (lstatOrNull(candidate)) {
      throw new Error(`migrate: installed rollback still exposes state authority: ${candidate}`);
    }
  }
  return sourceDir;
}

function resumeRollbackRecovery(sourceDir, io = {}) {
  const rmSync = io.rmSync || fs.rmSync;
  const paths = runtimePaths.validateProjectLayout(sourceDir, {
    env: {},
    validateRuntimeTree: true,
  });
  const base = rollbackRecoveryBase(paths);
  const stat = lstatOrNull(base);
  if (!stat) return { resumed: 0, pending: 0, recoveries: [] };
  assertRealDirectory(base, 'rollback recovery root');
  const recoveries = [];
  let pending = 0;
  for (const name of fs.readdirSync(base).sort()) {
    const recoveryDir = path.join(base, name);
    assertRealDirectory(recoveryDir, 'rollback recovery');
    const journalPath = path.join(recoveryDir, 'journal.json');
    const journalStat = lstatOrNull(journalPath);
    if (!journalStat || journalStat.isSymbolicLink() || !journalStat.isFile()) {
      throw new Error(`migrate: rollback recovery journal is missing or unsafe: ${journalPath}`);
    }
    const journal = assertRollbackRecoveryJournal(
      sourceDir,
      paths,
      recoveryDir,
      JSON.parse(fs.readFileSync(journalPath, 'utf8')),
    );
    if (journal.phase === 'complete' || journal.phase === 'rolled_back') continue;
    if (!['installed', 'cleanup_pending'].includes(journal.phase)) {
      pending += 1;
      recoveries.push({
        recovery_dir: recoveryDir,
        phase: journal.phase,
        resumed: false,
      });
      continue;
    }
    assertInstalledRollback(sourceDir, paths, journal);
    if (lstatOrNull(journal.stage_dir)) {
      rmSync(journal.stage_dir, { recursive: true, force: true });
    }
    updateRollbackJournal(journalPath, {
      phase: 'complete',
      cleanup_error: null,
      completed_at: new Date().toISOString(),
    });
    recoveries.push({
      recovery_dir: recoveryDir,
      phase: 'complete',
      resumed: true,
    });
  }
  return {
    resumed: recoveries.filter((entry) => entry.resumed).length,
    pending,
    recoveries,
  };
}

function sqliteFile(candidate) {
  const stat = lstatOrNull(candidate);
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) return false;
  const descriptor = fs.openSync(candidate, 'r');
  try {
    const header = Buffer.alloc(16);
    return fs.readSync(descriptor, header, 0, header.length, 0) === header.length
      && header.equals(Buffer.from('SQLite format 3\0'));
  } finally {
    fs.closeSync(descriptor);
  }
}

function quoteSqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function immutableStateSnapshot(resolvedDb, previousState, {
  onSnapshot = () => {},
  afterVacuumBeforeFence = () => {},
  maxAttempts = 5,
} = {}) {
  const copied = [];
  const main = lstatOrNull(resolvedDb);
  if (!main) {
    onSnapshot([], { source_data_version: null, snapshot_attempts: 0 });
    return copied;
  }
  if (main.isSymbolicLink() || !main.isFile()) {
    throw new Error(`migrate: current state entry is unsafe: ${resolvedDb}`);
  }
  let liveDb = null;
  let exclusive = false;
  let sourceDataVersion = null;
  let snapshotAttempts = 0;
  try {
    const snapshot = path.join(previousState, 'state.db');
    if (sqliteFile(resolvedDb)) {
      liveDb = new Database(resolvedDb, { fileMustExist: true });
      liveDb.pragma('busy_timeout = 0');
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        snapshotAttempts = attempt;
        const before = Number(liveDb.pragma('data_version', { simple: true }));
        fs.rmSync(snapshot, { force: true });
        // VACUUM cannot run inside the exclusive transaction. Bind its read
        // image to the later writer fence with data_version: if any other
        // connection commits in this gap, discard the candidate and retry.
        liveDb.exec(`VACUUM INTO ${quoteSqlString(snapshot)}`);
        afterVacuumBeforeFence({ attempt, source_data_version: before });
        liveDb.exec('BEGIN EXCLUSIVE');
        exclusive = true;
        const fenced = Number(liveDb.pragma('data_version', { simple: true }));
        if (fenced === before) {
          sourceDataVersion = fenced;
          break;
        }
        liveDb.exec('ROLLBACK');
        exclusive = false;
        fs.rmSync(snapshot, { force: true });
      }
      if (!exclusive) {
        throw new Error(
          `migrate: current state changed during ${maxAttempts} snapshot attempts`,
        );
      }
    } else {
      throw new Error(`migrate: current state is not a SQLite database: ${resolvedDb}`);
    }
    const verification = new Database(snapshot, { readonly: true, fileMustExist: true });
    try {
      const integrity = verification.pragma('integrity_check');
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
        throw new Error('migrate: current state recovery snapshot failed integrity_check');
      }
    } finally {
      verification.close();
    }
    fs.chmodSync(snapshot, 0o444);
    copied.push({ current: resolvedDb, prior: snapshot, kind: 'sqlite' });
    const inventory = regularTreeInventory(previousState);
    onSnapshot(inventory, {
      source_data_version: sourceDataVersion,
      snapshot_attempts: snapshotAttempts,
    });
    for (const suffix of ['-wal', '-shm', '']) {
      fs.rmSync(`${resolvedDb}${suffix}`, { force: true });
    }
    if (exclusive) {
      try { liveDb.exec('ROLLBACK'); } catch { /* the unlinked inode is already fenced */ }
      exclusive = false;
    }
  } finally {
    if (liveDb) {
      if (exclusive) {
        try { liveDb.exec('ROLLBACK'); } catch { /* best effort */ }
      }
      liveDb.close();
    }
  }
  return copied;
}

function rollbackFromBackupLocked({
  sourceDir,
  dbPath,
  backupDir,
  fromVersion,
  toVersion,
}, io = {}) {
  const copyFileSync = io.copyFileSync || fs.copyFileSync;
  const renameSync = io.renameSync || fs.renameSync;
  const rmSync = io.rmSync || fs.rmSync;
  const afterPublish = io.afterPublish || (() => {});
  const backupAdmission = assertRollbackBackup(sourceDir, backupDir, fromVersion);
  const paths = backupAdmission.paths;
  const resolvedDb = path.resolve(dbPath);
  if (![paths.stateDbPath, paths.legacyStateDbPath].includes(resolvedDb)) {
    throw new Error(
      `migrate: rollback state.db must be project-owned: ${resolvedDb}`,
    );
  }
  assertCurrentSemanticTree(paths.ultraDir);

  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const stageRoot = path.join(paths.runtimeDir, `.rollback-stage-${token}`);
  const restoreRoot = path.join(stageRoot, 'restore');
  const recoveryDir = path.join(rollbackRecoveryBase(paths), token);
  const previousSemantic = path.join(recoveryDir, 'previous-semantic');
  const previousState = path.join(recoveryDir, 'previous-state');
  const journalPath = path.join(recoveryDir, 'journal.json');
  const movedCurrent = [];
  const installed = [];
  const movedState = [];
  const cleanupStage = () => {
    rmSync(stageRoot, { recursive: true, force: true });
  };
  let published = false;
  try {
    if (!lstatOrNull(paths.runtimeDir)) {
      fs.mkdirSync(paths.runtimeDir);
    }
    fs.mkdirSync(stageRoot, { recursive: false });

    // Complete and validate the restore image before moving any current file.
    copyDirSync(backupDir, restoreRoot, { copyFileSync });
    if (!lstatOrNull(path.join(restoreRoot, BACKUP_MANIFEST))) {
      writeJsonAtomic(path.join(restoreRoot, BACKUP_MANIFEST), backupAdmission.manifest);
    }
    const stagedAdmission = assertRollbackBackup(
      sourceDir,
      restoreRoot,
      fromVersion,
      { staged: true },
    );
    if (stagedAdmission.manifestDigest !== backupAdmission.manifestDigest
        || stagedAdmission.inventoryDigest !== backupAdmission.inventoryDigest) {
      throw new Error('migrate: staged rollback image does not match the admitted backup manifest');
    }
    fs.mkdirSync(recoveryDir, { recursive: true });
    fs.mkdirSync(previousSemantic);
    fs.mkdirSync(previousState);
    const recoveryManifestPath = path.join(recoveryDir, BACKUP_MANIFEST);
    writeJsonAtomic(recoveryManifestPath, stagedAdmission.manifest);
    const now = new Date().toISOString();
    let preparedJournal = {
      version: 1,
      source_dir: path.resolve(sourceDir),
      from_version: fromVersion,
      to_version: toVersion,
      backup_dir: path.resolve(backupDir),
      backup_manifest_path: recoveryManifestPath,
      backup_manifest_sha256: stagedAdmission.manifestDigest,
      backup_inventory_sha256: stagedAdmission.inventoryDigest,
      stage_dir: stageRoot,
      recovery_dir: recoveryDir,
      phase: 'prepared',
      cleanup_error: null,
      created_at: now,
      updated_at: now,
    };
    writeJsonAtomic(journalPath, preparedJournal);

    if (runtimePaths.isManagedLegacyStateTombstone?.(paths.legacyStateDbPath)) {
      const prior = path.join(previousState, 'legacy-state-tombstone');
      copyFileSync(paths.legacyStateDbPath, prior);
      fs.chmodSync(prior, 0o444);
      fs.rmSync(paths.legacyStateDbPath);
      movedState.push({
        current: paths.legacyStateDbPath,
        prior,
        kind: 'tombstone',
      });
    }

    movedState.push(...immutableStateSnapshot(resolvedDb, previousState, {
      afterVacuumBeforeFence: io.afterStateSnapshotBeforeFence,
      onSnapshot(inventory, snapshotEvidence) {
        preparedJournal = updateRollbackJournal(journalPath, {
          previous_state_inventory: inventory,
          previous_state_inventory_sha256: jsonDigest(inventory),
          previous_state_data_version: snapshotEvidence.source_data_version,
          previous_state_snapshot_attempts: snapshotEvidence.snapshot_attempts,
        });
      },
    }));

    for (const entry of fs.readdirSync(paths.ultraDir, { withFileTypes: true })) {
      if (entry.name === '.runtime'
          || entry.name === 'state.db'
          || entry.name === 'state.db-wal'
          || entry.name === 'state.db-shm'
          || path.resolve(paths.ultraDir, entry.name) === path.resolve(backupDir)) {
        continue;
      }
      const current = path.join(paths.ultraDir, entry.name);
      const prior = path.join(previousSemantic, entry.name);
      renameSync(current, prior);
      movedCurrent.push({ current, prior });
    }

    for (const entry of fs.readdirSync(restoreRoot)) {
      if (entry === BACKUP_MANIFEST) continue;
      const staged = path.join(restoreRoot, entry);
      const target = path.join(paths.ultraDir, entry);
      renameSync(staged, target);
      installed.push({ staged, target });
    }

    assertInstalledRollback(sourceDir, paths, preparedJournal);
    updateRollbackJournal(journalPath, {
      phase: 'installed',
      installed_at: new Date().toISOString(),
    });
    published = true;
    // This seam also models a process interruption after the rollback is
    // authoritative but before disposable staging cleanup begins. Recovery
    // must trust the installed tree plus the independent journal, never the
    // potentially partial staging directory.
    afterPublish();
  } catch (error) {
    if (published) throw error;
    const rollbackErrors = [];
    for (const item of [...installed].reverse()) {
      try {
        fs.mkdirSync(path.dirname(item.staged), { recursive: true });
        renameSync(item.target, item.staged);
      } catch (rollbackError) {
        rollbackErrors.push(`${item.target}: ${rollbackError.message}`);
      }
    }
    for (const item of [...movedCurrent].reverse()) {
      try {
        fs.mkdirSync(path.dirname(item.current), { recursive: true });
        renameSync(item.prior, item.current);
      } catch (rollbackError) {
        rollbackErrors.push(`${item.prior}: ${rollbackError.message}`);
      }
    }
    for (const item of [...movedState].reverse()) {
      try {
        fs.mkdirSync(path.dirname(item.current), { recursive: true });
        copyFileSync(item.prior, item.current);
        fs.chmodSync(item.current, item.kind === 'tombstone' ? 0o444 : 0o600);
      } catch (rollbackError) {
        rollbackErrors.push(`${item.prior}: ${rollbackError.message}`);
      }
    }
    if (rollbackErrors.length === 0) {
      try { cleanupStage(); }
      catch (cleanupError) {
        rollbackErrors.push(`${stageRoot}: ${cleanupError.message}`);
      }
    }
    if (rollbackErrors.length > 0) {
      if (lstatOrNull(journalPath)) {
        try {
          updateRollbackJournal(journalPath, {
            phase: 'recovery_failed',
            rollback_error: rollbackErrors.join('; '),
          });
        } catch { /* preserve original rollback evidence */ }
      }
      throw new Error(
        `${error.message}; rollback restore failed: ${rollbackErrors.join('; ')}`,
        { cause: error },
      );
    }
    if (lstatOrNull(journalPath)) {
      updateRollbackJournal(journalPath, {
        phase: 'rolled_back',
        rollback_error: null,
      });
    }
    throw error;
  }

  let cleanupError = null;
  try {
    cleanupStage();
  } catch (error) {
    cleanupError = error;
    updateRollbackJournal(journalPath, {
      phase: 'cleanup_pending',
      cleanup_error: error.message,
    });
  }
  if (!cleanupError) {
    updateRollbackJournal(journalPath, {
      phase: 'complete',
      cleanup_error: null,
      completed_at: new Date().toISOString(),
    });
  }
  return {
    mode: 'rollback',
    from: toVersion,
    to: fromVersion,
    backup_dir: backupDir,
    source_dir: sourceDir,
    recovery_dir: recoveryDir,
    journal_path: journalPath,
    stage_dir: stageRoot,
    cleanup_pending: Boolean(cleanupError),
    ...(cleanupError ? { cleanup_error: cleanupError.message } : {}),
  };
}

function rollbackFromBackup(input, io = {}) {
  const paths = runtimePaths.validateProjectLayout(input.sourceDir, {
    env: {},
    forMutation: true,
    validateRuntimeTree: true,
  });
  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  const releaseGate = runtimePaths._internal.acquireStateMigrationGate(paths);
  try {
    return rollbackFromBackupLocked(input, io);
  } finally {
    releaseGate();
  }
}

function cmdForward(flags) {
  const sourceDir = path.resolve(flags.sourceDir || '.');
  const fromVersion = flags.from || DEFAULT_FROM;
  const toVersion = flags.to || SUPPORTED_TRANSITIONS[fromVersion];
  let plan;
  let dbPath;
  try {
    const paths = runtimePaths.validateProjectLayout(sourceDir, {
      env: {},
      validateRuntimeTree: true,
    });
    dbPath = flags.dbPath ? path.resolve(flags.dbPath) : paths.stateDbPath;
    if (dbPath !== paths.stateDbPath) {
      throw new Error(
        `migrate: state.db destination must be the project canonical authority: ${paths.stateDbPath}`,
      );
    }
    assertCurrentSemanticTree(paths.ultraDir);
    // Validate the live source before creating any backup. Apply mode discards
    // this provisional plan and rebuilds it from the immutable backup image.
    plan = planForward(sourceDir, fromVersion);
  } catch (err) {
    emit({ ok: false, error: { code: 'MIGRATE_FAILED', message: err.message, retriable: false } });
    return 2;
  }

  if (flags.dry) {
    emit({
      ok: true,
      data: {
        mode: 'dry',
        from: fromVersion,
        to: toVersion,
        source_dir: sourceDir,
        db_path: dbPath,
        tasks_to_insert: plan.tasks.length,
        events_to_insert: plan.events.length,
        warnings: plan.warnings,
      },
    });
    return 0;
  }

  let db;
  let backupDir;
  try {
    // Validate and publish the complete projection snapshot before authority
    // migration can relocate any legacy DB or mutable runtime artifact.
    const prepared = prepareForwardSnapshot(sourceDir, fromVersion);
    backupDir = prepared.backupDir;
    plan = prepared.plan;
    dbPath = runtimePaths.ensureRuntimeState(sourceDir).stateDbPath;
    db = initStateDb(dbPath).db;
    const counts = ops.tx(db, () => {
      const existing = db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;
      if (existing > 0) {
        throw new Error(`migrate: refusing to merge into non-empty state.db (tasks=${existing})`);
      }
      const inserted = applyForward(db, plan);
      db.prepare(
        `INSERT INTO baselines
         (id, project_name, mode, status, gaps_json, approval_note)
         VALUES ('migrated-baseline', ?, 'migrated', 'adopting', ?, ?)`,
      ).run(
        plan.projectName,
        JSON.stringify(MIGRATED_GAPS),
        `Legacy v${fromVersion} projection imported; evidence-backed owner re-adoption is required`,
      );
      recordMigration(db, {
        from: fromVersion,
        to: toVersion,
        direction: 'forward',
        status: 'success',
        notes: `tasks=${inserted.taskInserted} events=${inserted.eventsInserted} warnings=${plan.warnings.length}`,
      });
      return inserted;
    });
    projector.projectAll(db, { rootDir: sourceDir });
    const contextTemplateSanitized = sanitizeLegacyContextTemplate(sourceDir);
    emit({
      ok: true,
      data: {
        mode: 'apply',
        from: fromVersion,
        to: toVersion,
        source_dir: sourceDir,
        db_path: dbPath,
        backup_dir: backupDir,
        tasks_inserted: counts.taskInserted,
        events_inserted: counts.eventsInserted,
        warnings: plan.warnings,
        context_template_sanitized: contextTemplateSanitized,
      },
    });
    return 0;
  } catch (err) {
    if (db) {
      try {
        recordMigration(db, {
          from: fromVersion,
          to: toVersion,
          direction: 'forward',
          status: 'failed',
          notes: err.message,
        });
      } catch (_) { /* swallow secondary failure */ }
    }
    emit({ ok: false, error: { code: 'MIGRATE_FAILED', message: err.message, retriable: false } });
    return 2;
  } finally {
    if (db) closeStateDb(db);
  }
}

function cmdRollback(flags) {
  const sourceDir = path.resolve(flags.sourceDir || '.');
  const fromVersion = flags.from || DEFAULT_FROM;
  const toVersion = flags.to || SUPPORTED_TRANSITIONS[fromVersion];
  try {
    const resumed = resumeRollbackRecovery(sourceDir);
    if (resumed.pending > 0) {
      throw new Error(
        `migrate: ${resumed.pending} rollback recovery transaction(s) require manual recovery`,
      );
    }
    if (resumed.resumed > 0) {
      emit({
        ok: true,
        data: {
          mode: 'rollback-resumed',
          from: toVersion,
          to: fromVersion,
          source_dir: sourceDir,
          ...resumed,
        },
      });
      return 0;
    }
    const dbPath = flags.dbPath
      ? path.resolve(flags.dbPath)
      : runtimePaths.locateStateDb(sourceDir, { env: {} });
    const backupDir = findLatestBackup(sourceDir, fromVersion);
    if (!backupDir) {
      emit({
        ok: false,
        error: {
          code: 'NO_BACKUP',
          message: `no projection-v${fromVersion}-* or backup-v${fromVersion}-* directory found`,
        },
      });
      return 2;
    }
    emit({
      ok: true,
      data: rollbackFromBackup({
        sourceDir,
        dbPath,
        backupDir,
        fromVersion,
        toVersion,
      }),
    });
    return 0;
  } catch (err) {
    emit({ ok: false, error: { code: 'ROLLBACK_FAILED', message: err.message, retriable: false } });
    return 2;
  }
}

function dispatch(args) {
  const flags = parseFlags(args);
  if (flags.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const fromVersion = flags.from || DEFAULT_FROM;
  const expectedTo = SUPPORTED_TRANSITIONS[fromVersion];
  if (!expectedTo) {
    emit({ ok: false, error: { code: 'UNSUPPORTED_VERSION', message: `--from ${fromVersion} unsupported (supported: ${Object.keys(SUPPORTED_TRANSITIONS).join(', ')})` } });
    return 1;
  }
  if (flags.to && flags.to !== expectedTo) {
    emit({ ok: false, error: { code: 'UNSUPPORTED_VERSION', message: `--to ${flags.to} unsupported for --from ${fromVersion} (expected ${expectedTo})` } });
    return 1;
  }
  return flags.rollback ? cmdRollback(flags) : cmdForward(flags);
}

const USAGE = `ultra-tools migrate --from=<version> --to=<version> [flags]

Supported transitions:
  4.4 -> 4.5   import the legacy task projection into authoritative state
  4.5 -> ${EXPECTED_VERSION}  import a projection-only project into current authoritative state

Flags:
  --source-dir <dir>   project root containing .ultra/ (default: .)
  --db-path <path>     state.db destination (default: <source-dir>/.ultra/.runtime/state.db)
  --dry                print the migration plan without writing
  --rollback           restore the most recent matching backup-v<from>-* and drop state.db

The forward flow: backup .ultra/ → init state.db → insert tasks from
tasks.json → merge context md status (tasks.json wins on conflict, warnings
recorded) → insert activity-log events → record migration_history.
Rollback restores from the latest matching backup-v<from>-* directory through a
prevalidated staged image, then removes the newer state.db only as part of the
rollback transaction.
`;

module.exports = {
  dispatch,
  USAGE,
  parseFlags,
  planForward,
  prepareForwardSnapshot,
  parseFrontmatter,
  sanitizeLegacyContextTemplate,
  rollbackFromBackup,
  resumeRollbackRecovery,
};
