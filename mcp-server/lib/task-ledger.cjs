'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

const ops = require('./state-ops.cjs');

const LEDGER_KIND = 'ultra-team-task-ledger';
const LEDGER_SCHEMA_VERSION = '1.0';
const LEDGER_RELATIVE_PATH = '.ultra/tasks/tasks.json';
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_ANCESTORS = 64;
const DURABLE_BASELINE_FIELDS = Object.freeze([
  'id',
  'project_name',
  'project_type',
  'stack',
  'mode',
  'status',
  'scope',
  'repository_revision',
  'repository_branch',
  'worktree_state',
  'worktree_digest',
  'worktree_accepted',
  'known_red_accepted',
  'spec_refs',
  'evidence',
  'verification',
  'unknowns',
  'gaps',
  'classification',
  'provider_refs',
  'research_run_id',
  'approved_by',
  'approval_note',
  'converged_at',
]);
const DURABLE_TASK_FIELDS = Object.freeze([
  'id',
  'title',
  'type',
  'priority',
  'complexity',
  'estimated_days',
  'status',
  'deps',
  'files_modified',
  'stale',
  'trace_to',
  'outcome',
  'slice_kind',
  'public_seam',
  'verification_command',
  'acceptance',
  'context_refs',
  'docs_impact',
  'ownership',
  'change_id',
  'parent_id',
]);
const DURABLE_CHANGE_FIELDS = Object.freeze([
  'id',
  'title',
  'kind',
  'status',
  'intent',
  'docs_impact',
  'provider_refs',
  'baseline_bypass',
  'contract',
  'classification',
  'research_disposition',
  'base_commit',
  'artifact_root',
  'closed_at',
]);

class TaskLedgerError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'TaskLedgerError';
    this.code = code;
    if (details) this.details = details;
  }
}

function ledgerPath(rootDir) {
  return path.join(path.resolve(rootDir || '.'), ...LEDGER_RELATIVE_PATH.split('/'));
}

function safeDirectoryChain(rootDir, components, { create = false } = {}) {
  const root = path.resolve(rootDir || '.');
  const rootStat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new TaskLedgerError('TASK_LEDGER_UNSAFE', `project root is unsafe: ${root}`);
  }
  const physicalRoot = fs.realpathSync.native(root);
  let current = root;
  for (const component of components) {
    current = path.join(current, component);
    let stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat && create) {
      fs.mkdirSync(current);
      stat = fs.lstatSync(current);
    }
    if (!stat) return null;
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new TaskLedgerError(
        'TASK_LEDGER_UNSAFE',
        `task ledger directory is unsafe: ${current}`,
      );
    }
    const physical = fs.realpathSync.native(current);
    if (physical !== physicalRoot && !physical.startsWith(`${physicalRoot}${path.sep}`)) {
      throw new TaskLedgerError(
        'TASK_LEDGER_UNSAFE',
        `task ledger directory escapes the project: ${current}`,
      );
    }
  }
  return current;
}

function sha256(value) {
  return crypto.createHash('sha256').update(
    typeof value === 'string' ? value : JSON.stringify(value),
  ).digest('hex');
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function compactObject(entries) {
  return Object.fromEntries(entries.filter(([, value]) => value !== null && value !== undefined));
}

function portableBaseline(row) {
  if (!row) return null;
  return compactObject([
    ['id', row.id],
    ['project_name', row.project_name],
    ['project_type', row.project_type],
    ['stack', row.stack],
    ['mode', row.mode],
    ['status', row.status],
    ['scope', Array.isArray(row.scope) ? row.scope : parseJson(row.scope_json, ['.'])],
    ['repository_revision', row.repository_revision],
    ['repository_branch', row.repository_branch],
    ['worktree_state', row.worktree_state],
    ['worktree_digest', row.worktree_digest],
    ['worktree_accepted', Boolean(row.worktree_accepted)],
    ['known_red_accepted', Boolean(row.known_red_accepted)],
    ['spec_refs', Array.isArray(row.spec_refs) ? row.spec_refs : parseJson(row.spec_refs_json, [])],
    ['evidence', Array.isArray(row.evidence) ? row.evidence : parseJson(row.evidence_json, [])],
    ['verification', Array.isArray(row.verification)
      ? row.verification : parseJson(row.verification_json, [])],
    ['unknowns', Array.isArray(row.unknowns) ? row.unknowns : parseJson(row.unknowns_json, [])],
    ['gaps', Array.isArray(row.gaps) ? row.gaps : parseJson(row.gaps_json, [])],
    ['classification', row.classification && typeof row.classification === 'object'
      ? row.classification : parseJson(row.classification_json, {})],
    ['provider_refs', row.provider_refs && typeof row.provider_refs === 'object'
      ? row.provider_refs : parseJson(row.provider_refs_json, {})],
    ['research_run_id', row.research_run_id],
    ['approved_by', row.approved_by],
    ['approval_note', row.approval_note],
    ['converged_at', row.converged_at],
  ]);
}

function durableBaseline(row, previous = null) {
  if (!row) return null;
  const value = portableBaseline(row);
  const digest = sha256(value);
  if (previous?.digest === digest) return previous;
  return {
    ...value,
    revision: previous ? Number(previous.revision || 0) + 1 : 1,
    parent_digest: previous?.digest || null,
    digest,
  };
}

function readBaselineForLedger(db, previous = null) {
  const row = db.prepare(
    `SELECT * FROM baselines
     WHERE status <> 'superseded'
     ORDER BY CASE status WHEN 'ready' THEN 0 ELSE 1 END, updated_at DESC, rowid DESC
     LIMIT 1`,
  ).get();
  return durableBaseline(row, previous);
}

function portableChange(row) {
  return compactObject([
    ['id', row.id],
    ['title', row.title],
    ['kind', row.kind],
    ['status', row.status],
    ['intent', row.intent],
    ['docs_impact', parseJson(row.docs_impact_json, {})],
    ['provider_refs', parseJson(row.provider_refs_json, {})],
    ['baseline_bypass', parseJson(row.baseline_bypass_json, null)],
    ['contract', parseJson(row.contract_json, {})],
    ['classification', parseJson(row.classification_json, {})],
    ['research_disposition', parseJson(row.research_disposition_json, {})],
    ['base_commit', row.base_commit],
    ['artifact_root', row.artifact_root],
    ['closed_at', row.closed_at],
  ]);
}

function durableChange(row, previous = null) {
  const value = portableChange(row);
  const digest = sha256(value);
  if (previous?.digest === digest) return previous;
  return {
    ...value,
    revision: previous ? Number(previous.revision || 0) + 1 : 1,
    parent_digest: previous?.digest || null,
    digest,
  };
}

function readChangesForLedger(db, taskRows, previousChanges = new Map()) {
  const rows = db.prepare('SELECT * FROM changes ORDER BY id').all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const task of taskRows) {
    if (!task.change_id) continue;
    const row = byId.get(task.change_id);
    if (!row) {
      throw new TaskLedgerError(
        'TASK_LEDGER_CHANGE_MISSING',
        `task ledger cannot publish missing owning change ${task.change_id}`,
      );
    }
  }
  return rows.map((row) => durableChange(row, previousChanges.get(row.id)));
}

function durableStatus(task, previous) {
  if (task.status !== 'in_progress') return task.status;
  if (previous && previous.status !== 'in_progress') return previous.status;
  return 'pending';
}

function durableTask(task, previous = null) {
  const value = compactObject([
    ['id', task.id],
    ['title', task.title],
    ['type', task.type],
    ['priority', task.priority],
    ['complexity', task.complexity],
    ['estimated_days', task.estimated_days],
    ['status', durableStatus(task, previous)],
    ['deps', Array.isArray(task.deps) ? task.deps : []],
    ['files_modified', Array.isArray(task.files_modified) ? task.files_modified : []],
    ['stale', Boolean(task.stale)],
    ['trace_to', task.trace_to],
    ['outcome', task.outcome],
    ['slice_kind', task.slice_kind],
    ['public_seam', task.public_seam],
    ['verification_command', task.verification_command],
    ['acceptance', Array.isArray(task.acceptance) ? task.acceptance : []],
    ['context_refs', Array.isArray(task.context_refs) ? task.context_refs : []],
    ['docs_impact', task.docs_impact || { status: 'unknown', files: [], rationale: null }],
    ['ownership', task.ownership || {}],
    ['change_id', task.change_id],
    ['parent_id', task.parent_id],
  ]);
  const digest = sha256(value);
  if (previous && previous.digest === digest) return previous;
  return {
    ...value,
    revision: previous ? Number(previous.revision || 0) + 1 : 1,
    parent_digest: previous?.digest || null,
    digest,
  };
}

function statePayload({ baseline, changes, tasks }) {
  return {
    baseline: baseline || null,
    changes: Array.isArray(changes) ? changes : [],
    tasks: Array.isArray(tasks) ? tasks : [],
  };
}

function validateTask(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TaskLedgerError('TASK_LEDGER_INVALID', 'every task ledger entry must be an object');
  }
  for (const field of ['id', 'title', 'type', 'priority', 'status', 'revision', 'digest']) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      throw new TaskLedgerError(
        'TASK_LEDGER_INVALID',
        `task ledger entry ${entry.id || '(unknown)'} is missing ${field}`,
      );
    }
  }
  if (!HASH_PATTERN.test(entry.digest) || entry.digest !== sha256(
    Object.fromEntries(DURABLE_TASK_FIELDS
      .filter((field) => entry[field] !== undefined)
      .map((field) => [field, entry[field]])),
  )) {
    throw new TaskLedgerError(
      'TASK_LEDGER_DIGEST_MISMATCH',
      `task ledger entry ${entry.id} does not match its digest`,
    );
  }
  if (entry.parent_digest != null && !HASH_PATTERN.test(entry.parent_digest)) {
    throw new TaskLedgerError(
      'TASK_LEDGER_INVALID',
      `task ledger entry ${entry.id} has an invalid parent_digest`,
    );
  }
}

function validateBaseline(entry) {
  if (entry == null) return;
  if (typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TaskLedgerError('TASK_LEDGER_INVALID', 'baseline ledger entry must be an object');
  }
  for (const field of [
    'id', 'project_name', 'mode', 'status', 'scope', 'revision', 'digest',
  ]) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      throw new TaskLedgerError(
        'TASK_LEDGER_INVALID',
        `baseline ledger entry ${entry.id || '(unknown)'} is missing ${field}`,
      );
    }
  }
  const value = Object.fromEntries(DURABLE_BASELINE_FIELDS
    .filter((field) => entry[field] !== undefined)
    .map((field) => [field, entry[field]]));
  if (!HASH_PATTERN.test(entry.digest) || entry.digest !== sha256(value)) {
    throw new TaskLedgerError(
      'TASK_LEDGER_DIGEST_MISMATCH',
      `baseline ledger entry ${entry.id} does not match its digest`,
    );
  }
  if (entry.parent_digest != null && !HASH_PATTERN.test(entry.parent_digest)) {
    throw new TaskLedgerError(
      'TASK_LEDGER_INVALID',
      `baseline ledger entry ${entry.id} has an invalid parent_digest`,
    );
  }
}

function validateChange(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TaskLedgerError('TASK_LEDGER_INVALID', 'every Change ledger entry must be an object');
  }
  for (const field of [
    'id', 'title', 'kind', 'status', 'intent', 'artifact_root', 'revision', 'digest',
  ]) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      throw new TaskLedgerError(
        'TASK_LEDGER_INVALID',
        `Change ledger entry ${entry.id || '(unknown)'} is missing ${field}`,
      );
    }
  }
  const value = Object.fromEntries(DURABLE_CHANGE_FIELDS
    .filter((field) => entry[field] !== undefined)
    .map((field) => [field, entry[field]]));
  if (!HASH_PATTERN.test(entry.digest) || entry.digest !== sha256(value)) {
    throw new TaskLedgerError(
      'TASK_LEDGER_DIGEST_MISMATCH',
      `Change ledger entry ${entry.id} does not match its digest`,
    );
  }
  if (entry.parent_digest != null && !HASH_PATTERN.test(entry.parent_digest)) {
    throw new TaskLedgerError(
      'TASK_LEDGER_INVALID',
      `Change ledger entry ${entry.id} has an invalid parent_digest`,
    );
  }
}

function validateLedger(document, file = '(memory)') {
  if (!document || typeof document !== 'object' || Array.isArray(document)
      || document.kind !== LEDGER_KIND
      || document.schema_version !== LEDGER_SCHEMA_VERSION
      || !Number.isInteger(document.generation)
      || document.generation < 0
      || !Array.isArray(document.ancestors)
      || !Array.isArray(document.tasks)
      || !Array.isArray(document.changes)) {
    throw new TaskLedgerError(
      'TASK_LEDGER_INVALID',
      `${file} is not an Ultra team task ledger v${LEDGER_SCHEMA_VERSION}`,
    );
  }
  if (document.ancestors.length > MAX_ANCESTORS
      || document.ancestors.some((digest) => !HASH_PATTERN.test(digest))) {
    throw new TaskLedgerError(
      'TASK_LEDGER_INVALID',
      `${file} contains an invalid checkpoint ancestry chain`,
    );
  }
  validateBaseline(document.baseline);
  const seen = new Set();
  for (const task of document.tasks) {
    validateTask(task);
    if (seen.has(task.id)) {
      throw new TaskLedgerError('TASK_LEDGER_INVALID', `${file} contains duplicate task ${task.id}`);
    }
    seen.add(task.id);
  }
  const seenChanges = new Set();
  for (const change of document.changes) {
    validateChange(change);
    if (seenChanges.has(change.id)) {
      throw new TaskLedgerError(
        'TASK_LEDGER_INVALID',
        `${file} contains duplicate Change ${change.id}`,
      );
    }
    seenChanges.add(change.id);
  }
  const expected = sha256(statePayload(document));
  if (!HASH_PATTERN.test(document.state_digest || '') || document.state_digest !== expected) {
    throw new TaskLedgerError(
      'TASK_LEDGER_DIGEST_MISMATCH',
      `${file} state_digest does not match its durable payload`,
    );
  }
  if (document.parent_digest != null && !HASH_PATTERN.test(document.parent_digest)) {
    throw new TaskLedgerError('TASK_LEDGER_INVALID', `${file} has an invalid parent_digest`);
  }
  return document;
}

function readTaskLedger(rootDir, { optional = true } = {}) {
  const file = ledgerPath(rootDir);
  const directory = safeDirectoryChain(rootDir, ['.ultra', 'tasks']);
  if (!directory) {
    if (optional) return null;
    throw new TaskLedgerError('TASK_LEDGER_INVALID', `task ledger is missing: ${file}`);
  }
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) {
    if (error.code === 'ENOENT' && optional) return null;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new TaskLedgerError('TASK_LEDGER_UNSAFE', `task ledger must be a regular file: ${file}`);
  }
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    throw new TaskLedgerError('TASK_LEDGER_INVALID', `cannot read ${file}: ${error.message}`);
  }
  return validateLedger(parsed, file);
}

function writeLedgerAtomic(rootDir, document) {
  const file = ledgerPath(rootDir);
  const dir = safeDirectoryChain(rootDir, ['.ultra', 'tasks'], { create: true });
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new TaskLedgerError('TASK_LEDGER_UNSAFE', `task ledger target is unsafe: ${file}`);
    }
  }
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    try { fs.rmSync(temp, { force: true }); } catch { /* best effort */ }
  }
  return file;
}

function migrateLegacyProjection(db, rootDir, originalError) {
  const file = ledgerPath(rootDir);
  let bytes;
  let document;
  try {
    bytes = fs.readFileSync(file);
    document = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw originalError;
  }
  if (document?.kind === LEDGER_KIND
      || !document || !Array.isArray(document.tasks)
      || !['4.4', '4.5'].includes(String(document.version || document.schema_version))) {
    throw originalError;
  }
  const legacyIds = document.tasks.map((task) => String(task?.id || '')).sort();
  if (legacyIds.some((id) => !id) || new Set(legacyIds).size !== legacyIds.length) {
    throw new TaskLedgerError(
      'TASK_LEDGER_LEGACY_CONFLICT',
      'legacy tasks projection has missing or duplicate task ids',
    );
  }
  const currentIds = ops.listTasks(db, { status: 'any', limit: 1000 })
    .map((task) => task.id)
    .sort();
  if (JSON.stringify(legacyIds) !== JSON.stringify(currentIds)) {
    throw new TaskLedgerError(
      'TASK_LEDGER_LEGACY_CONFLICT',
      'legacy tasks projection does not match current SQLite task authority',
      { legacy_task_ids: legacyIds, current_task_ids: currentIds },
    );
  }
  const currentById = new Map(
    ops.listTasks(db, { status: 'any', limit: 1000 }).map((task) => [task.id, task]),
  );
  for (const legacyTask of document.tasks) {
    const current = currentById.get(legacyTask.id);
    for (const field of DURABLE_TASK_FIELDS) {
      if (legacyTask[field] === undefined) continue;
      if (!util.isDeepStrictEqual(legacyTask[field], current[field])) {
        throw new TaskLedgerError(
          'TASK_LEDGER_LEGACY_CONFLICT',
          `legacy task ${legacyTask.id} field ${field} does not match SQLite authority`,
          {
            task_id: legacyTask.id,
            field,
            legacy_value: legacyTask[field],
            current_value: current[field],
          },
        );
      }
    }
  }
  const digest = sha256(bytes);
  const backupDir = safeDirectoryChain(
    rootDir,
    ['.ultra', '.runtime', 'backups', 'task-ledger'],
    { create: true },
  );
  const backup = path.join(backupDir, `legacy-tasks-${digest.slice(0, 16)}.json`);
  if (fs.existsSync(backup)) {
    const stat = fs.lstatSync(backup);
    if (stat.isSymbolicLink() || !stat.isFile()
        || !fs.readFileSync(backup).equals(bytes)) {
      throw new TaskLedgerError(
        'TASK_LEDGER_UNSAFE',
        `legacy task ledger backup is unsafe or conflicting: ${backup}`,
      );
    }
  } else {
    fs.writeFileSync(backup, bytes, { flag: 'wx' });
  }
  return { previous: null, migrated: true, backup };
}

function priorLedgerForPublish(db, rootDir) {
  try {
    return { previous: readTaskLedger(rootDir), migrated: false, backup: null };
  } catch (error) {
    if (!['TASK_LEDGER_INVALID', 'TASK_LEDGER_DIGEST_MISMATCH'].includes(error.code)) {
      throw error;
    }
    return migrateLegacyProjection(db, rootDir, error);
  }
}

function syncTaskLedger(db, { rootDir = '.' } = {}) {
  let document;
  try {
    document = readTaskLedger(rootDir);
  } catch (error) {
    if (!['TASK_LEDGER_INVALID', 'TASK_LEDGER_DIGEST_MISMATCH'].includes(error.code)) {
      throw error;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(ledgerPath(rootDir), 'utf8'));
      if (raw && Array.isArray(raw.tasks)
          && ['4.4', '4.5'].includes(String(raw.version || raw.schema_version))) {
        return { status: 'legacy', imported: 0, already_current: false };
      }
    } catch {
      // Preserve the typed ledger error from the validated read.
    }
    throw error;
  }
  if (!document) {
    return { status: 'missing', imported: 0, already_current: false };
  }
  const checkpoint = latestImportedCheckpoint(db);
  if (checkpoint.state_digest === document.state_digest) {
    return {
      status: 'current',
      imported: 0,
      preserved: document.tasks.length,
      deleted: 0,
      imported_changes: 0,
      preserved_changes: document.changes.length,
      imported_baseline: false,
      preserved_baseline: Boolean(document.baseline),
      generation: document.generation,
      state_digest: document.state_digest,
      requires_plan_revalidation: false,
      requires_baseline_revalidation: false,
      already_current: true,
    };
  }
  return {
    status: 'imported',
    ...importTaskLedger(db, { rootDir }),
  };
}

function taskDigestMap(tasks) {
  return Object.fromEntries(tasks.map((task) => [task.id, task.digest]));
}

function recordLedgerEvent(db, type, ledger, extra = {}) {
  ops.appendEvent(db, {
    type,
    payload: {
      generation: ledger.generation,
      state_digest: ledger.state_digest,
      baseline_digest: ledger.baseline?.digest || null,
      baseline_checkpoint: ledger.baseline || null,
      task_digests: taskDigestMap(ledger.tasks),
      change_digests: taskDigestMap(ledger.changes),
      ...extra,
    },
  });
}

function publishTaskLedger(db, {
  rootDir = '.',
  reason = 'manual_checkpoint',
} = {}) {
  let prior = priorLedgerForPublish(db, rootDir);
  if (prior.previous && !prior.migrated) {
    syncTaskLedger(db, { rootDir });
    prior = {
      previous: readTaskLedger(rootDir),
      migrated: false,
      backup: null,
    };
  }
  const previous = prior.previous;
  const priorTasks = new Map((previous?.tasks || []).map((task) => [task.id, task]));
  const priorChanges = new Map((previous?.changes || []).map((change) => [change.id, change]));
  const rows = ops.listTasks(db, { status: 'any', limit: 1000 })
    .sort((left, right) => left.id.localeCompare(right.id));
  const tasks = rows.map((task) => durableTask(task, priorTasks.get(task.id)));
  const baseline = readBaselineForLedger(db, previous?.baseline || null);
  if (baseline?.gaps?.some((gap) => (
    gap.id === 'team-ledger-revalidation-required' && gap.status === 'open'
  ))) {
    throw new TaskLedgerError(
      'TASK_LEDGER_REVALIDATION_REQUIRED',
      'the imported team baseline must converge in this checkout before publication',
      { baseline_id: baseline.id, ledger_path: LEDGER_RELATIVE_PATH },
    );
  }
  const changes = readChangesForLedger(db, rows, priorChanges);
  const digest = sha256(statePayload({ baseline, changes, tasks }));
  if (previous?.state_digest === digest) {
    return {
      changed: false,
      path: ledgerPath(rootDir),
      ledger: previous,
    };
  }
  const document = {
    kind: LEDGER_KIND,
    schema_version: LEDGER_SCHEMA_VERSION,
    generation: Number(previous?.generation || 0) + 1,
    parent_digest: previous?.state_digest || null,
    ancestors: previous
      ? [previous.state_digest, ...(previous.ancestors || [])].slice(0, MAX_ANCESTORS)
      : [],
    state_digest: digest,
    published_at: new Date().toISOString(),
    reason,
    baseline,
    changes,
    tasks,
  };
  validateLedger(document);
  const file = writeLedgerAtomic(rootDir, document);
  recordLedgerEvent(db, 'task_ledger_published', document, {
    reason,
    migrated_legacy_projection: prior.migrated,
    legacy_backup_path: prior.backup,
  });
  return {
    changed: true,
    path: file,
    ledger: document,
    migrated_legacy_projection: prior.migrated,
    legacy_backup_path: prior.backup,
  };
}

function latestImportedCheckpoint(db) {
  const row = db.prepare(
    `SELECT payload_json FROM events
     WHERE type IN ('task_ledger_imported', 'task_ledger_published')
     ORDER BY id DESC LIMIT 1`,
  ).get();
  const payload = parseJson(row?.payload_json, {});
  return {
    generation: Number.isInteger(payload.generation) ? payload.generation : null,
    state_digest: HASH_PATTERN.test(payload.state_digest || '') ? payload.state_digest : null,
    task_digests: payload.task_digests && typeof payload.task_digests === 'object'
      ? payload.task_digests
      : {},
    change_digests: payload.change_digests && typeof payload.change_digests === 'object'
      ? payload.change_digests
      : {},
    baseline_digest: HASH_PATTERN.test(payload.baseline_digest || '')
      ? payload.baseline_digest
      : null,
    baseline_checkpoint: payload.baseline_checkpoint
      && typeof payload.baseline_checkpoint === 'object'
      ? payload.baseline_checkpoint
      : null,
  };
}

function baselineForLocalCheckout(baseline) {
  const value = portableBaseline(baseline);
  const requiresRevalidation = baseline.status === 'ready';
  if (!requiresRevalidation) return { value, requiresRevalidation: false };
  const gaps = [...(value.gaps || [])];
  if (requiresRevalidation && !gaps.some((gap) => gap.id === 'team-ledger-revalidation-required')) {
    gaps.push({
      id: 'team-ledger-revalidation-required',
      category: 'baseline_blocker',
      status: 'open',
      blocking: true,
      summary: 'The imported team checkpoint must be revalidated against this checkout.',
      evidence_refs: [LEDGER_RELATIVE_PATH],
      owner: 'project-owner',
    });
  }
  return {
    value: compactObject(Object.entries({
      ...value,
      status: value.mode === 'greenfield' ? 'draft' : 'adopting',
      worktree_accepted: false,
      known_red_accepted: false,
      gaps,
      research_run_id: undefined,
      approved_by: undefined,
      approval_note: undefined,
      converged_at: undefined,
    })),
    requiresRevalidation: true,
  };
}

function writeBaseline(db, baseline, { update = false } = {}) {
  const local = baselineForLocalCheckout(baseline);
  const value = local.value;
  if (update) {
    db.prepare(
      `UPDATE baselines SET
         project_name = ?, project_type = ?, stack = ?, mode = ?, status = ?,
         scope_json = ?, repository_revision = ?, repository_branch = ?,
         worktree_state = ?, worktree_digest = ?, worktree_accepted = ?,
         known_red_accepted = ?, spec_refs_json = ?, evidence_json = ?,
         verification_json = ?, unknowns_json = ?, gaps_json = ?,
         classification_json = ?, provider_refs_json = ?, research_run_id = ?,
         approved_by = ?, approval_note = ?, converged_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      value.project_name,
      value.project_type || null,
      value.stack || null,
      value.mode,
      value.status,
      JSON.stringify(value.scope || ['.']),
      value.repository_revision || null,
      value.repository_branch || null,
      value.worktree_state || 'unavailable',
      value.worktree_digest || null,
      value.worktree_accepted ? 1 : 0,
      value.known_red_accepted ? 1 : 0,
      JSON.stringify(value.spec_refs || []),
      JSON.stringify(value.evidence || []),
      JSON.stringify(value.verification || []),
      JSON.stringify(value.unknowns || []),
      JSON.stringify(value.gaps || []),
      JSON.stringify(value.classification || {}),
      JSON.stringify(value.provider_refs || {}),
      value.research_run_id || null,
      value.approved_by || null,
      value.approval_note || null,
      value.converged_at || null,
      new Date().toISOString(),
      value.id,
    );
    return local;
  }
  db.prepare(
    `INSERT INTO baselines
     (id, project_name, project_type, stack, mode, status, repository_root, scope_json,
      repository_revision, repository_branch, worktree_state, worktree_digest,
      worktree_accepted, known_red_accepted, spec_refs_json, evidence_json,
      verification_json, unknowns_json, gaps_json, classification_json,
      provider_refs_json, research_run_id, approved_by, approval_note, converged_at)
     VALUES (?, ?, ?, ?, ?, ?, '.', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    value.id,
    value.project_name,
    value.project_type || null,
    value.stack || null,
    value.mode,
    value.status,
    JSON.stringify(value.scope || ['.']),
    value.repository_revision || null,
    value.repository_branch || null,
    value.worktree_state || 'unavailable',
    value.worktree_digest || null,
    value.worktree_accepted ? 1 : 0,
    value.known_red_accepted ? 1 : 0,
    JSON.stringify(value.spec_refs || []),
    JSON.stringify(value.evidence || []),
    JSON.stringify(value.verification || []),
    JSON.stringify(value.unknowns || []),
    JSON.stringify(value.gaps || []),
    JSON.stringify(value.classification || {}),
    JSON.stringify(value.provider_refs || {}),
    value.research_run_id || null,
    value.approved_by || null,
    value.approval_note || null,
    value.converged_at || null,
  );
  return local;
}

function localBaselineMatchesRevalidation(row, checkpointBaseline) {
  if (!row || !checkpointBaseline || row.id !== checkpointBaseline.id
      || checkpointBaseline.status !== 'ready') return false;
  const expected = baselineForLocalCheckout(checkpointBaseline).value;
  return util.isDeepStrictEqual(portableBaseline(row), expected);
}

function mergeBaseline(db, incoming, checkpoint) {
  if (!incoming) {
    return { imported: false, preserved: false, requiresRevalidation: false };
  }
  const active = db.prepare(
    `SELECT * FROM baselines
     WHERE status <> 'superseded'
     ORDER BY CASE status WHEN 'ready' THEN 0 ELSE 1 END, updated_at DESC, rowid DESC
     LIMIT 1`,
  ).get();
  if (!active) {
    const written = writeBaseline(db, incoming);
    return {
      imported: true,
      preserved: false,
      requiresRevalidation: written.requiresRevalidation,
    };
  }

  const current = durableBaseline(active, null);
  const lastDigest = checkpoint.baseline_digest;
  const effectiveCurrentDigest = localBaselineMatchesRevalidation(
    active,
    checkpoint.baseline_checkpoint,
  ) ? lastDigest : current.digest;
  if (active.id === incoming.id && current.digest === incoming.digest) {
    return { imported: false, preserved: true, requiresRevalidation: false };
  }
  if (!lastDigest) {
    throw new TaskLedgerError(
      'TASK_LEDGER_BASELINE_CONFLICT',
      `baseline ${active.id} exists locally without a common team checkpoint`,
      {
        local_baseline_id: active.id,
        incoming_baseline_id: incoming.id,
        local_digest: current.digest,
        incoming_digest: incoming.digest,
      },
    );
  }
  if (effectiveCurrentDigest !== lastDigest && incoming.digest === lastDigest) {
    return { imported: false, preserved: true, requiresRevalidation: false };
  }
  if (effectiveCurrentDigest !== lastDigest && incoming.digest !== lastDigest) {
    throw new TaskLedgerError(
      'TASK_LEDGER_BASELINE_CONFLICT',
      'baseline changed both locally and in the Git ledger',
      {
        local_baseline_id: active.id,
        incoming_baseline_id: incoming.id,
        last_digest: lastDigest,
        local_digest: current.digest,
        incoming_digest: incoming.digest,
      },
    );
  }
  if (active.id !== incoming.id) {
    db.prepare(
      "UPDATE baselines SET status = 'superseded', updated_at = ? WHERE id = ?",
    ).run(new Date().toISOString(), active.id);
    const written = writeBaseline(db, incoming);
    return {
      imported: true,
      preserved: false,
      requiresRevalidation: written.requiresRevalidation,
    };
  }
  const written = writeBaseline(db, incoming, { update: true });
  return {
    imported: true,
    preserved: false,
    requiresRevalidation: written.requiresRevalidation,
  };
}

function insertChange(db, change) {
  db.prepare(
    `INSERT INTO changes
     (id, title, kind, status, intent, docs_impact_json, provider_refs_json,
      baseline_bypass_json, contract_json, classification_json,
      research_disposition_json, base_commit, artifact_root, closed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    change.id,
    change.title,
    change.kind,
    change.status,
    change.intent,
    JSON.stringify(change.docs_impact || {}),
    JSON.stringify(change.provider_refs || {}),
    change.baseline_bypass ? JSON.stringify(change.baseline_bypass) : null,
    JSON.stringify(change.contract || {}),
    JSON.stringify(change.classification || {}),
    JSON.stringify(change.research_disposition || {}),
    change.base_commit || null,
    change.artifact_root,
    change.closed_at || null,
  );
}

function updateChangeFromLedger(db, change) {
  db.prepare(
    `UPDATE changes SET
       title = ?, kind = ?, status = ?, intent = ?, docs_impact_json = ?,
       provider_refs_json = ?, baseline_bypass_json = ?, contract_json = ?,
       classification_json = ?, research_disposition_json = ?, base_commit = ?,
       artifact_root = ?, closed_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    change.title,
    change.kind,
    change.status,
    change.intent,
    JSON.stringify(change.docs_impact || {}),
    JSON.stringify(change.provider_refs || {}),
    change.baseline_bypass ? JSON.stringify(change.baseline_bypass) : null,
    JSON.stringify(change.contract || {}),
    JSON.stringify(change.classification || {}),
    JSON.stringify(change.research_disposition || {}),
    change.base_commit || null,
    change.artifact_root,
    change.closed_at || null,
    new Date().toISOString(),
    change.id,
  );
}

function insertTaskFromLedger(db, task) {
  const created = ops.createTask(db, {
    id: task.id,
    title: task.title,
    type: task.type,
    priority: task.priority,
    complexity: task.complexity,
    estimated_days: task.estimated_days,
    deps: task.deps || [],
    files_modified: task.files_modified || [],
    stale: Boolean(task.stale),
    trace_to: task.trace_to,
    outcome: task.outcome,
    slice_kind: task.slice_kind,
    public_seam: task.public_seam,
    verification_command: task.verification_command,
    acceptance: task.acceptance || [],
    context_refs: task.context_refs || [],
    docs_impact: task.docs_impact || { status: 'unknown', files: [], rationale: null },
    ownership: task.ownership || {},
    change_id: task.change_id || null,
    parent_id: null,
  });
  if (task.status !== created.status) updateTaskFromLedger(db, task);
  return ops.readTask(db, task.id);
}

function updateTaskFromLedger(db, task) {
  db.prepare(
    `UPDATE tasks SET
       title = ?, type = ?, priority = ?, complexity = ?, estimated_days = ?,
       status = ?, deps = ?, files_modified = ?, session_id = NULL, stale = ?,
       trace_to = ?, outcome = ?, slice_kind = ?, public_seam = ?,
       verification_command = ?, acceptance_json = ?, context_refs_json = ?,
       docs_impact_json = ?, ownership_json = ?, change_id = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    task.title,
    task.type,
    task.priority,
    task.complexity ?? null,
    task.estimated_days ?? null,
    task.status,
    JSON.stringify(task.deps || []),
    JSON.stringify(task.files_modified || []),
    task.stale ? 1 : 0,
    task.trace_to || null,
    task.outcome || null,
    task.slice_kind || null,
    task.public_seam || null,
    task.verification_command || null,
    JSON.stringify(task.acceptance || []),
    JSON.stringify(task.context_refs || []),
    JSON.stringify(task.docs_impact || { status: 'unknown', files: [], rationale: null }),
    JSON.stringify(task.ownership || {}),
    task.change_id || null,
    new Date().toISOString(),
    task.id,
  );
}

function importTaskLedger(db, {
  rootDir = '.',
} = {}) {
  const document = readTaskLedger(rootDir, { optional: false });
  const checkpoint = latestImportedCheckpoint(db);
  const lastDigests = checkpoint.task_digests;
  const lastChangeDigests = checkpoint.change_digests;
  if (checkpoint.state_digest && checkpoint.state_digest !== document.state_digest) {
    if (document.generation < checkpoint.generation) {
      throw new TaskLedgerError(
        'TASK_LEDGER_STALE',
        `task ledger generation ${document.generation} is older than local generation ${checkpoint.generation}`,
        {
          incoming_generation: document.generation,
          local_generation: checkpoint.generation,
        },
      );
    }
    if (document.generation === checkpoint.generation
        || !document.ancestors.includes(checkpoint.state_digest)) {
      throw new TaskLedgerError(
        'TASK_LEDGER_HISTORY_CONFLICT',
        'task ledger does not descend from the last local team checkpoint',
        {
          incoming_generation: document.generation,
          local_generation: checkpoint.generation,
          incoming_parent_digest: document.parent_digest,
          local_state_digest: checkpoint.state_digest,
        },
      );
    }
  }
  if (checkpoint.state_digest === document.state_digest) {
    return {
      imported: 0,
      preserved: document.tasks.length,
      deleted: 0,
      imported_changes: 0,
      preserved_changes: document.changes.length,
      imported_baseline: false,
      preserved_baseline: Boolean(document.baseline),
      generation: document.generation,
      state_digest: document.state_digest,
      requires_plan_revalidation: false,
      requires_baseline_revalidation: false,
      already_current: true,
      ledger: document,
    };
  }
  const parentUpdates = [];
  let imported = 0;
  let preserved = 0;
  let deleted = 0;
  let importedChanges = 0;
  let preservedChanges = 0;
  let baselineImport = {
    imported: false,
    preserved: false,
    requiresRevalidation: false,
  };
  const changesById = new Set((document.changes || []).map((change) => change.id));
  for (const task of document.tasks) {
    if (task.change_id && !changesById.has(task.change_id)
        && !db.prepare('SELECT 1 FROM changes WHERE id = ?').get(task.change_id)) {
      throw new TaskLedgerError(
        'TASK_LEDGER_CHANGE_MISSING',
        `task ${task.id} references missing change ${task.change_id}`,
      );
    }
  }

  ops.tx(db, () => {
    baselineImport = mergeBaseline(db, document.baseline, checkpoint);
    for (const incoming of document.changes) {
      const row = db.prepare('SELECT * FROM changes WHERE id = ?').get(incoming.id);
      if (!row) {
        insertChange(db, incoming);
        importedChanges += 1;
        continue;
      }
      const current = durableChange(row, null);
      const last = lastChangeDigests[incoming.id] || null;
      if (current.digest === incoming.digest) {
        preservedChanges += 1;
        continue;
      }
      if (!last) {
        throw new TaskLedgerError(
          'TASK_LEDGER_CHANGE_CONFLICT',
          `Change ${incoming.id} exists locally without a common team checkpoint`,
          {
            change_id: incoming.id,
            local_digest: current.digest,
            incoming_digest: incoming.digest,
          },
        );
      }
      if (current.digest !== last && incoming.digest === last) {
        preservedChanges += 1;
        continue;
      }
      if (current.digest !== last && incoming.digest !== last) {
        throw new TaskLedgerError(
          'TASK_LEDGER_CHANGE_CONFLICT',
          `Change ${incoming.id} changed both locally and in the Git ledger`,
          {
            change_id: incoming.id,
            last_digest: last,
            local_digest: current.digest,
            incoming_digest: incoming.digest,
          },
        );
      }
      updateChangeFromLedger(db, incoming);
      importedChanges += 1;
    }
    for (const incoming of document.tasks) {
      const current = ops.readTask(db, incoming.id);
      const last = lastDigests[incoming.id] || null;
      if (!current) {
        insertTaskFromLedger(db, incoming);
        parentUpdates.push([incoming.id, incoming.parent_id || null]);
        imported += 1;
        continue;
      }
      const currentDurable = durableTask(current, null);
      if (currentDurable.digest === incoming.digest) {
        preserved += 1;
        parentUpdates.push([incoming.id, incoming.parent_id || null]);
        continue;
      }
      if (current.status === 'in_progress' && last && incoming.digest !== last) {
        throw new TaskLedgerError(
          'TASK_LEDGER_ACTIVE_TASK_CONFLICT',
          `task ${incoming.id} changed in Git while a local session is in progress`,
          { task_id: incoming.id, local_status: current.status },
        );
      }
      if (last && currentDurable.digest !== last && incoming.digest === last) {
        preserved += 1;
        continue;
      }
      if (last && currentDurable.digest !== last && incoming.digest !== last) {
        throw new TaskLedgerError(
          'TASK_LEDGER_CONFLICT',
          `task ${incoming.id} changed both locally and in the Git ledger`,
          {
            task_id: incoming.id,
            last_digest: last,
            local_digest: currentDurable.digest,
            incoming_digest: incoming.digest,
          },
        );
      }
      updateTaskFromLedger(db, incoming);
      parentUpdates.push([incoming.id, incoming.parent_id || null]);
      imported += 1;
    }
    const incomingIds = new Set(document.tasks.map((task) => task.id));
    for (const [id, last] of Object.entries(lastDigests)) {
      if (incomingIds.has(id)) continue;
      const current = ops.readTask(db, id);
      if (!current) continue;
      const activeSession = db.prepare(
        "SELECT sid FROM sessions WHERE task_id = ? AND status = 'running' LIMIT 1",
      ).get(id);
      if (current.status === 'in_progress' || current.session_id || activeSession) {
        throw new TaskLedgerError(
          'TASK_LEDGER_ACTIVE_TASK_CONFLICT',
          `task ${id} was removed from Git while local work is in progress`,
          { task_id: id, local_status: current.status },
        );
      }
      const currentDurable = durableTask(current, null);
      if (currentDurable.digest !== last) {
        throw new TaskLedgerError(
          'TASK_LEDGER_CONFLICT',
          `task ${id} was removed from Git after it changed locally`,
          {
            task_id: id,
            last_digest: last,
            local_digest: currentDurable.digest,
            incoming_digest: null,
          },
        );
      }
      const sessionCount = db.prepare(
        'SELECT COUNT(*) AS count FROM sessions WHERE task_id = ?',
      ).get(id).count;
      if (sessionCount > 0) {
        throw new TaskLedgerError(
          'TASK_LEDGER_CONFLICT',
          `task ${id} cannot be removed because local session history still references it`,
          { task_id: id, session_count: sessionCount },
        );
      }
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      deleted += 1;
    }
    for (const [id, parentId] of parentUpdates) {
      if (parentId && !db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(parentId)) {
        throw new TaskLedgerError(
          'TASK_LEDGER_PARENT_MISSING',
          `task ${id} references missing parent ${parentId}`,
        );
      }
      db.prepare('UPDATE tasks SET parent_id = ? WHERE id = ?').run(parentId, id);
    }
    recordLedgerEvent(db, 'task_ledger_imported', document, {
      imported,
      preserved,
      deleted,
      imported_changes: importedChanges,
      preserved_changes: preservedChanges,
    });
  });
  return {
    imported,
    preserved,
    deleted,
    imported_changes: importedChanges,
    preserved_changes: preservedChanges,
    imported_baseline: baselineImport.imported,
    preserved_baseline: baselineImport.preserved,
    generation: document.generation,
    state_digest: document.state_digest,
    requires_plan_revalidation: imported > 0
      || deleted > 0
      || importedChanges > 0
      || baselineImport.imported,
    requires_baseline_revalidation: baselineImport.requiresRevalidation,
    already_current: false,
    ledger: document,
  };
}

function inspectTaskLedger(db, { rootDir = '.' } = {}) {
  const document = readTaskLedger(rootDir);
  if (!document) {
    return {
      status: 'missing',
      path: ledgerPath(rootDir),
      generation: null,
      state_digest: null,
    };
  }
  const localTasks = ops.listTasks(db, { status: 'any', limit: 1000 });
  const previous = new Map(document.tasks.map((task) => [task.id, task]));
  const local = localTasks.map((task) => durableTask(task, previous.get(task.id)))
    .sort((left, right) => left.id.localeCompare(right.id));
  const localChanges = readChangesForLedger(
    db,
    localTasks,
    new Map(document.changes.map((change) => [change.id, change])),
  );
  const localBaseline = readBaselineForLedger(db, document.baseline || null);
  const localDigest = sha256(statePayload({
    baseline: localBaseline,
    changes: localChanges,
    tasks: local,
  }));
  const baselineRequiresRevalidation = Array.isArray(localBaseline?.gaps)
    && localBaseline.gaps.some((gap) => (
      gap.id === 'team-ledger-revalidation-required' && gap.status === 'open'
    ));
  const importedPayloadDigest = baselineRequiresRevalidation
    ? sha256(statePayload({
      baseline: document.baseline,
      changes: localChanges,
      tasks: local,
    }))
    : null;
  const status = localDigest === document.state_digest
    ? 'current'
    : (importedPayloadDigest === document.state_digest
      ? 'revalidation_required'
      : 'drifted');
  return {
    status,
    path: ledgerPath(rootDir),
    generation: document.generation,
    state_digest: document.state_digest,
    local_state_digest: localDigest,
    baseline_revalidation_required: baselineRequiresRevalidation,
  };
}

module.exports = {
  DURABLE_BASELINE_FIELDS,
  DURABLE_CHANGE_FIELDS,
  DURABLE_TASK_FIELDS,
  LEDGER_KIND,
  LEDGER_RELATIVE_PATH,
  LEDGER_SCHEMA_VERSION,
  TaskLedgerError,
  durableChange,
  durableBaseline,
  durableTask,
  importTaskLedger,
  inspectTaskLedger,
  ledgerPath,
  publishTaskLedger,
  readTaskLedger,
  syncTaskLedger,
  validateLedger,
};
