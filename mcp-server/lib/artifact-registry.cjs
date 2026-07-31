'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ops = require('./state-ops.cjs');
const contextPaths = require('./context-paths.cjs');
const {
  openStableProjectRead,
  readStableProjectFile,
  walkStableProjectTree,
} = require('./safe-project-file.cjs');

const ENDPOINT_TYPES = new Set([
  'artifact', 'project', 'baseline', 'change', 'task', 'workflow', 'external',
]);
const OWNER_TYPES = new Set(['project', 'baseline', 'change', 'task', 'workflow']);
const STATUSES = new Set(['current', 'stale', 'terminal', 'archived']);
const ARTIFACT_INPUT_FIELDS = new Set([
  'id', 'owner_type', 'owner_id', 'change_id', 'task_id', 'kind', 'path',
  'content_digest', 'expected_before_digest', 'source_refs', 'consumer_refs',
  'provenance', 'metadata', 'status',
]);
const DIGEST = /^[0-9a-f]{64}$/;
const OWNER_TABLES = Object.freeze({
  baseline: 'baselines',
  change: 'changes',
  task: 'tasks',
  workflow: 'workflow_runs',
});
const STATIC_EXEMPT_PATHS = new Set([
  '.ultra/docs/research/README.md',
  '.ultra/reports/templates/delivery-report.json',
  '.ultra/reports/templates/test-report.json',
  '.ultra/templates/task-context.md',
  '.ultra/tasks/tasks.json',
  '.ultra/changes/active/.gitkeep',
  '.ultra/changes/archive/.gitkeep',
]);
const PROVISIONAL_BASELINE_SPEC_PATHS = new Set([
  '.ultra/specs/discovery.md',
  '.ultra/specs/product.md',
  '.ultra/specs/architecture.md',
  '.ultra/specs/research-distillate.md',
]);

class ArtifactRegistryError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ArtifactRegistryError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function artifactText(value, field, { optional = false, nullable = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ArtifactRegistryError(
      'VALIDATION_ERROR',
      `${field} must be a non-empty string${nullable ? ' or null' : ''}`,
    );
  }
  return value.trim();
}

function artifactDigest(value, field, { nullable = false } = {}) {
  if (value === undefined) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ArtifactRegistryError(
      'VALIDATION_ERROR',
      `${field} must be a lowercase SHA-256 digest${nullable ? ' or null' : ''}`,
    );
  }
  return value;
}

function assertJsonValue(value, field, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new ArtifactRegistryError('VALIDATION_ERROR', `${field} must contain valid JSON values`);
  }
  if (typeof value !== 'object') {
    throw new ArtifactRegistryError('VALIDATION_ERROR', `${field} must contain valid JSON values`);
  }
  if (seen.has(value)) {
    throw new ArtifactRegistryError('VALIDATION_ERROR', `${field} must not contain circular references`);
  }
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ArtifactRegistryError(
        'VALIDATION_ERROR', `${field} must contain only JSON objects`,
      );
    }
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${field}[${index}]`, seen));
  } else {
    Object.entries(value).forEach(([key, item]) => (
      assertJsonValue(item, `${field}.${key}`, seen)
    ));
  }
  seen.delete(value);
}

function normalizeJsonObject(value, field) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ArtifactRegistryError('VALIDATION_ERROR', `${field} must be a JSON object`);
  }
  assertJsonValue(value, field);
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeRelativePath(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ArtifactRegistryError('VALIDATION_ERROR', 'artifact path is required');
  }
  const raw = value.trim().replaceAll('\\', '/');
  if (path.posix.isAbsolute(raw)) {
    throw new ArtifactRegistryError('ARTIFACT_PATH_INVALID', 'artifact path must be project-relative');
  }
  const normalized = path.posix.normalize(raw).replace(/^\.\//, '');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new ArtifactRegistryError(
      'ARTIFACT_PATH_INVALID', `artifact path escapes the project: ${value}`,
    );
  }
  return normalized;
}

function isExemptArtifactPath(value) {
  const relative = normalizeRelativePath(value);
  return relative === '.ultra/.runtime'
    || relative.startsWith('.ultra/.runtime/')
    || relative === '.ultra/scratch'
    || relative.startsWith('.ultra/scratch/')
    || STATIC_EXEMPT_PATHS.has(relative);
}

function isGeneratedProjectionPath(value) {
  const relative = normalizeRelativePath(value);
  return relative === '.ultra/.runtime/projections'
    || relative.startsWith('.ultra/.runtime/projections/')
    || relative === '.ultra/tasks/contexts'
    || relative.startsWith('.ultra/tasks/contexts/');
}

function artifactPathError(message, details = undefined) {
  return new ArtifactRegistryError('ARTIFACT_PATH_INVALID', message, details);
}

function isWithinPath(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function statIdentity(stat) {
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: stat.mode,
  };
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
}

function inspectResolvedArtifactPath(resolved, { requireFile = false } = {}) {
  const identities = [];
  let rootStat;
  try {
    rootStat = fs.lstatSync(resolved.physicalRoot);
  } catch (cause) {
    throw artifactPathError(
      `artifact project root is unavailable: ${resolved.root}`,
      { cause: cause.message },
    );
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw artifactPathError(`artifact project root is not a regular directory: ${resolved.root}`);
  }
  identities.push({
    path: resolved.physicalRoot,
    kind: 'directory',
    ...statIdentity(rootStat),
  });

  const components = resolved.relative.split('/').filter((part) => part && part !== '.');
  let current = resolved.physicalRoot;
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    const final = index === components.length - 1;
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (cause) {
      if (cause?.code === 'ENOENT' && final && !requireFile) {
        return { exists: false, identities, final: null };
      }
      if (cause?.code === 'ENOENT' && final) {
        throw new ArtifactRegistryError(
          'ARTIFACT_FILE_MISSING',
          `artifact file does not exist: ${resolved.relative}`,
        );
      }
      throw artifactPathError(
        `artifact ancestor is unavailable: ${resolved.relative}`,
        { component: components.slice(0, index + 1).join('/'), cause: cause.message },
      );
    }
    if (stat.isSymbolicLink()) {
      throw artifactPathError(
        `artifact path contains a symbolic link: ${resolved.relative}`,
        { component: components.slice(0, index + 1).join('/') },
      );
    }
    if (final ? !stat.isFile() : !stat.isDirectory()) {
      throw artifactPathError(
        `artifact path contains a non-regular ${final ? 'file' : 'ancestor'}: ${resolved.relative}`,
        { component: components.slice(0, index + 1).join('/') },
      );
    }
    let physical;
    try {
      physical = fs.realpathSync.native(current);
    } catch (cause) {
      throw artifactPathError(
        `artifact path cannot be resolved safely: ${resolved.relative}`,
        { component: components.slice(0, index + 1).join('/'), cause: cause.message },
      );
    }
    if (!isWithinPath(resolved.physicalRoot, physical)) {
      throw artifactPathError(
        `artifact path escapes the physical project root: ${resolved.relative}`,
        { component: components.slice(0, index + 1).join('/'), physical },
      );
    }
    identities.push({
      path: current,
      kind: final ? 'file' : 'directory',
      ...statIdentity(stat),
    });
  }
  const final = identities.at(-1);
  if (!final || final.kind !== 'file') {
    if (requireFile) {
      throw new ArtifactRegistryError(
        'ARTIFACT_FILE_MISSING',
        `artifact file does not exist: ${resolved.relative}`,
      );
    }
    return { exists: false, identities, final: null };
  }
  return { exists: true, identities, final };
}

function resolveArtifactFile(rootDir, relative) {
  const root = path.resolve(rootDir);
  const normalized = normalizeRelativePath(relative);
  let physicalRoot;
  try {
    physicalRoot = fs.realpathSync.native(root);
  } catch (cause) {
    throw artifactPathError(
      `artifact project root is unavailable: ${root}`,
      { cause: cause.message },
    );
  }
  const file = path.resolve(physicalRoot, normalized);
  if (!isWithinPath(physicalRoot, file)) {
    throw artifactPathError(`artifact path escapes the project: ${relative}`);
  }
  const resolved = {
    root,
    physicalRoot,
    file,
    relative: normalized,
  };
  inspectResolvedArtifactPath(resolved);
  return resolved;
}

function digestFile(file) {
  let fd;
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) {
      throw artifactPathError(`artifact must be a regular file: ${file}`);
    }
    return crypto.createHash('sha256').update(fs.readFileSync(fd)).digest('hex');
  } catch (error) {
    if (error instanceof ArtifactRegistryError) throw error;
    throw artifactPathError(`artifact cannot be read safely: ${file}`, {
      cause: error.message,
    });
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function openStableArtifactRead(resolved) {
  const translate = (error) => {
    if (error instanceof ArtifactRegistryError) throw error;
    if (error?.code === 'PROJECT_FILE_MISSING') {
      throw new ArtifactRegistryError(
        'ARTIFACT_FILE_MISSING',
        `artifact file does not exist: ${resolved.relative}`,
      );
    }
    if (error?.code === 'PROJECT_FILE_CHANGED') {
      throw new ArtifactRegistryError(
        'ARTIFACT_DIGEST_CONFLICT',
        `artifact bytes changed while publication was in progress: ${resolved.relative}`,
        error.details,
      );
    }
    throw artifactPathError(
      `artifact cannot be opened without following links: ${resolved.relative}`,
      { cause: error.message },
    );
  };
  try {
    const reader = openStableProjectRead(resolved.root, resolved.relative);
    return {
      digest: reader.digest,
      verify() {
        try { reader.verify(); } catch (error) { translate(error); }
      },
      close: reader.close,
    };
  } catch (error) {
    translate(error);
  }
}

function stableArtifactDigest(resolved) {
  const reader = openStableArtifactRead(resolved);
  try {
    reader.verify();
    return reader.digest;
  } finally {
    reader.close();
  }
}

function endpointExists(db, type, id) {
  if (!ENDPOINT_TYPES.has(type) || typeof id !== 'string' || id.trim() === '') return false;
  if (type === 'external') return true;
  if (type === 'project') return id === 'project';
  const table = type === 'artifact' ? 'artifacts' : OWNER_TABLES[type];
  if (!table) return false;
  return Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE id = ? LIMIT 1`).get(id));
}

function normalizeEndpoint(endpoint, field) {
  if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint)) {
    throw new ArtifactRegistryError('VALIDATION_ERROR', `${field} must be an object`);
  }
  const unknown = Object.keys(endpoint)
    .filter((key) => !['type', 'id', 'relation'].includes(key));
  if (unknown.length > 0) {
    throw new ArtifactRegistryError(
      'VALIDATION_ERROR', `${field}.${unknown[0]} is not allowed`,
    );
  }
  const type = typeof endpoint.type === 'string' ? endpoint.type.trim() : '';
  const id = typeof endpoint.id === 'string' ? endpoint.id.trim() : '';
  const relation = typeof endpoint.relation === 'string' ? endpoint.relation.trim() : '';
  if (!ENDPOINT_TYPES.has(type) || !id || !relation) {
    throw new ArtifactRegistryError(
      'VALIDATION_ERROR', `${field} requires a supported type, id, and relation`,
    );
  }
  return { type, id, relation };
}

function normalizeArtifactInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ArtifactRegistryError('VALIDATION_ERROR', 'artifact input is required');
  }
  const unknown = Object.keys(input).filter((field) => !ARTIFACT_INPUT_FIELDS.has(field));
  if (unknown.length > 0) {
    throw new ArtifactRegistryError(
      'VALIDATION_ERROR', `artifact.${unknown[0]} is not allowed`,
    );
  }
  const status = input.status === undefined
    ? 'current'
    : artifactText(input.status, 'artifact.status');
  if (!STATUSES.has(status)) {
    throw new ArtifactRegistryError('VALIDATION_ERROR', `invalid artifact status: ${status}`);
  }
  const normalizeRefs = (value, field) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      throw new ArtifactRegistryError('VALIDATION_ERROR', `${field} must be an array`);
    }
    return value.map((item, index) => normalizeEndpoint(item, `${field}[${index}]`));
  };
  return {
    id: artifactText(input.id, 'artifact.id', { optional: true }),
    ownerType: artifactText(input.owner_type, 'artifact.owner_type'),
    ownerId: artifactText(input.owner_id, 'artifact.owner_id'),
    changeId: artifactText(
      input.change_id,
      'artifact.change_id',
      { optional: true, nullable: true },
    ),
    taskId: artifactText(
      input.task_id,
      'artifact.task_id',
      { optional: true, nullable: true },
    ),
    kind: artifactText(input.kind, 'artifact.kind'),
    path: artifactText(input.path, 'artifact.path'),
    status,
    contentDigest: artifactDigest(input.content_digest, 'artifact.content_digest'),
    expectedBeforeDigest: artifactDigest(
      input.expected_before_digest,
      'artifact.expected_before_digest',
      { nullable: true },
    ),
    sourceRefs: normalizeRefs(input.source_refs, 'artifact.source_refs'),
    consumerRefs: normalizeRefs(input.consumer_refs, 'artifact.consumer_refs'),
    provenance: normalizeJsonObject(input.provenance, 'artifact.provenance'),
    metadata: normalizeJsonObject(input.metadata, 'artifact.metadata'),
  };
}

function assertEndpoint(db, endpoint, field) {
  const normalized = normalizeEndpoint(endpoint, field);
  const { type, id } = normalized;
  if (!endpointExists(db, type, id)) {
    throw new ArtifactRegistryError(
      'ARTIFACT_ENDPOINT_MISSING', `${field} endpoint does not exist: ${type}:${id}`,
      { type, id },
    );
  }
  return normalized;
}

function assertOwner(db, ownerType, ownerId) {
  if (!OWNER_TYPES.has(ownerType)) {
    throw new ArtifactRegistryError(
      'VALIDATION_ERROR', `unsupported artifact owner_type: ${ownerType}`,
    );
  }
  if (!endpointExists(db, ownerType, ownerId)) {
    throw new ArtifactRegistryError(
      'ARTIFACT_OWNER_MISSING', `artifact owner does not exist: ${ownerType}:${ownerId}`,
      { owner_type: ownerType, owner_id: ownerId },
    );
  }
}

function assertArtifactOwner(db, ownerType, ownerId) {
  assertOwner(db, ownerType, ownerId);
}

function assertDeclaredOwnerRefs(db, normalized) {
  const expectedTaskId = normalized.ownerType === 'task' ? normalized.ownerId : null;
  const expectedChangeId = normalized.ownerType === 'change'
    ? normalized.ownerId
    : normalized.ownerType === 'task'
      ? db.prepare('SELECT change_id FROM tasks WHERE id = ?').get(normalized.ownerId)?.change_id || null
      : normalized.ownerType === 'workflow'
        ? db.prepare('SELECT change_id FROM workflow_runs WHERE id = ?').get(normalized.ownerId)?.change_id || null
        : null;
  for (const [field, supplied, expected] of [
    ['change_id', normalized.changeId, expectedChangeId],
    ['task_id', normalized.taskId, expectedTaskId],
  ]) {
    if (supplied !== undefined && supplied !== expected) {
      throw new ArtifactRegistryError(
        'ARTIFACT_AUTHORITY_CONFLICT',
        `artifact ${field} does not match its owner authority`,
        { field, supplied, expected },
      );
    }
  }
  return { changeId: expectedChangeId, taskId: expectedTaskId };
}

function edgesForArtifact(db, artifactId) {
  const sources = db.prepare(
    `SELECT source_type AS type, source_id AS id, relation
     FROM artifact_edges
     WHERE target_type = 'artifact' AND target_id = ?
     ORDER BY source_type, source_id, relation`,
  ).all(artifactId);
  const consumers = db.prepare(
    `SELECT target_type AS type, target_id AS id, relation
     FROM artifact_edges
     WHERE source_type = 'artifact' AND source_id = ?
     ORDER BY target_type, target_id, relation`,
  ).all(artifactId);
  return { sources, consumers };
}

function rowToArtifact(db, row) {
  if (!row) return null;
  const edges = edgesForArtifact(db, row.id);
  return {
    id: row.id,
    owner_type: row.owner_type,
    owner_id: row.owner_id,
    kind: row.kind,
    path: row.path,
    digest: row.digest || row.content_hash || null,
    before_digest: row.before_digest || null,
    after_digest: row.after_digest || row.digest || row.content_hash || null,
    managed: Boolean(row.managed),
    status: row.status,
    provenance: parseJson(row.provenance_json, {}),
    metadata: parseJson(row.metadata_json, {}),
    source_refs: edges.sources,
    consumer_refs: edges.consumers,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getArtifact(db, { id, path: artifactPath } = {}) {
  const hasId = typeof id === 'string' && id.trim() !== '';
  const hasPath = typeof artifactPath === 'string' && artifactPath.trim() !== '';
  if (hasId === hasPath) {
    throw new ArtifactRegistryError(
      'VALIDATION_ERROR', 'provide exactly one of artifact id or path',
    );
  }
  let row;
  if (hasId) {
    row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id.trim());
  } else {
    const relative = normalizeRelativePath(artifactPath);
    const matches = db.prepare(
      `SELECT * FROM artifacts WHERE path = ? AND status <> 'archived'
       ORDER BY CASE status WHEN 'current' THEN 0 WHEN 'terminal' THEN 1
                WHEN 'stale' THEN 2 ELSE 3 END, updated_at DESC, rowid DESC`,
    ).all(relative);
    if (matches.length > 1) {
      throw new ArtifactRegistryError(
        'ARTIFACT_DUPLICATE_AUTHORITY',
        `artifact path has multiple active authorities: ${relative}`,
        { path: relative, artifact_ids: matches.map((item) => item.id) },
      );
    }
    [row] = matches;
    if (!row) {
      row = db.prepare(
        `SELECT * FROM artifacts WHERE path = ? AND status = 'archived'
         ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
      ).get(relative);
    }
  }
  if (!row) {
    throw new ArtifactRegistryError(
      'ARTIFACT_NOT_FOUND', `artifact ${hasId ? id : artifactPath} not found`,
    );
  }
  return rowToArtifact(db, row);
}

function insertEdge(db, sourceType, sourceId, targetType, targetId, relation) {
  db.prepare(
    `INSERT INTO artifact_edges
     (source_type, source_id, target_type, target_id, relation)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(sourceType, sourceId, targetType, targetId, relation);
}

function endpointKey(endpoint) {
  return `${endpoint.type}\u0000${endpoint.id}`;
}

function outgoingEdges(db, endpoint) {
  return db.prepare(
    `SELECT target_type AS type, target_id AS id, relation
     FROM artifact_edges
     WHERE source_type = ? AND source_id = ?
     ORDER BY target_type, target_id, relation`,
  ).all(endpoint.type, endpoint.id);
}

function graphReaches(db, start, target) {
  const targetKey = endpointKey(target);
  const queue = [...outgoingEdges(db, start)];
  const seen = new Set();
  while (queue.length > 0) {
    const endpoint = queue.shift();
    const key = endpointKey(endpoint);
    if (key === targetKey) return true;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(...outgoingEdges(db, endpoint));
  }
  return false;
}

function graphCycleFrom(db, start) {
  return graphReaches(db, start, start);
}

function invalidateConsumersFromEndpointInTx(db, start, {
  prior_consumers: priorConsumers = [],
  reason = 'authority_digest_changed',
  exclude = [],
} = {}) {
  const excluded = new Set(exclude.map(endpointKey));
  const queue = [...priorConsumers, ...outgoingEdges(db, start)];
  const seen = new Set();
  const invalidated = [];
  while (queue.length > 0) {
    const endpoint = queue.shift();
    const key = endpointKey(endpoint);
    if (seen.has(key) || excluded.has(key) || key === endpointKey(start)) continue;
    seen.add(key);
    if (endpoint.type === 'workflow') {
      // Workflow rows are retained only as pre-v0.24 audit history. Preserve
      // graph traversal for downstream current authorities, but never rewrite
      // the historical workflow row or claim that it was invalidated.
      queue.push(...outgoingEdges(db, endpoint));
      continue;
    }
    invalidated.push({ type: endpoint.type, id: endpoint.id });
    if (endpoint.type === 'artifact') {
      const row = db.prepare('SELECT status FROM artifacts WHERE id = ?').get(endpoint.id);
      if (!row) continue;
      if (row.status === 'current') {
        db.prepare(
          `UPDATE artifacts SET status = 'stale',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
        ).run(endpoint.id);
      }
    }
    if (endpoint.type === 'task') {
      const task = db.prepare('SELECT id, stale FROM tasks WHERE id = ?').get(endpoint.id);
      if (task && !task.stale) {
        db.prepare(
          `UPDATE tasks SET stale = 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
        ).run(endpoint.id);
        ops.appendEventInTx(db, {
          type: 'task_stale_marked',
          task_id: endpoint.id,
          payload: {
            source_type: start.type,
            source_id: start.id,
            ...(start.type === 'artifact' ? { artifact_id: start.id } : {}),
            reason,
          },
        });
      }
    }
    queue.push(...outgoingEdges(db, endpoint));
  }
  return invalidated;
}

function invalidateDownstreamInTx(db, artifactId, priorConsumers = []) {
  return invalidateConsumersFromEndpointInTx(
    db,
    { type: 'artifact', id: artifactId },
    {
      prior_consumers: priorConsumers,
      reason: 'artifact_digest_changed',
    },
  );
}

function preflightArtifactPublication(db, input, { rootDir = process.cwd() } = {}) {
  const normalized = normalizeArtifactInput(input);
  const {
    ownerType, ownerId, kind, status,
  } = normalized;
  assertOwner(db, ownerType, ownerId);
  assertDeclaredOwnerRefs(db, normalized);
  const resolved = resolveArtifactFile(rootDir, normalized.path);
  if (isExemptArtifactPath(resolved.relative) || isGeneratedProjectionPath(resolved.relative)) {
    throw new ArtifactRegistryError(
      'ARTIFACT_PATH_EXEMPT',
      `runtime, scratch, and generated projection paths are not registry authority: ${resolved.relative}`,
    );
  }
  const explicitId = normalized.id || null;
  const existingById = explicitId
    ? db.prepare('SELECT * FROM artifacts WHERE id = ?').get(explicitId)
    : null;
  const existingByAuthority = db.prepare(
    `SELECT * FROM artifacts
     WHERE owner_type = ? AND owner_id = ? AND kind = ? AND path = ?`,
  ).get(ownerType, ownerId, kind, resolved.relative);
  if (explicitId && existingByAuthority && existingByAuthority.id !== explicitId) {
    throw new ArtifactRegistryError(
      'ARTIFACT_AUTHORITY_CONFLICT',
      `artifact authority is already bound to id ${existingByAuthority.id}`,
    );
  }
  const existing = existingById || existingByAuthority;
  if (existing && (
    existing.owner_type !== ownerType || existing.owner_id !== ownerId
    || existing.kind !== kind || existing.path !== resolved.relative
  )) {
    throw new ArtifactRegistryError(
      'ARTIFACT_AUTHORITY_CONFLICT',
      `artifact id ${existing.id} is already bound to another authority`,
    );
  }
  const artifactId = existing?.id || explicitId;
  const pathConflict = db.prepare(
    `SELECT id FROM artifacts
     WHERE path = ? AND status <> 'archived' AND (? IS NULL OR id <> ?)
     ORDER BY id LIMIT 1`,
  ).get(resolved.relative, artifactId, artifactId);
  if (status !== 'archived' && pathConflict) {
    throw new ArtifactRegistryError(
      'ARTIFACT_AUTHORITY_CONFLICT',
      `artifact path already has active authority ${pathConflict.id}: ${resolved.relative}`,
      {
        path: resolved.relative,
        requested_id: artifactId,
        existing_id: pathConflict.id,
      },
    );
  }
  const beforeDigest = existing?.digest || existing?.content_hash || null;
  if (existing) {
    let actual;
    try {
      actual = stableArtifactDigest(resolved);
    } catch (error) {
      if (error.code === 'ARTIFACT_FILE_MISSING') {
        throw new ArtifactRegistryError(
          'ARTIFACT_DIGEST_CONFLICT',
          `registered artifact bytes are missing before publication: ${resolved.relative}`,
          { expected: beforeDigest, actual: null },
        );
      }
      throw error;
    }
    if (beforeDigest && actual !== beforeDigest) {
      throw new ArtifactRegistryError(
        'ARTIFACT_DIGEST_CONFLICT',
        `registered artifact changed outside its authority before publication: ${resolved.relative}`,
        { expected: beforeDigest, actual },
      );
    }
  } else {
    const state = inspectResolvedArtifactPath(resolved);
    if (state.exists) {
      stableArtifactDigest(resolved);
    }
  }
  return {
    artifact_id: artifactId,
    path: resolved.relative,
    expected_before_digest: beforeDigest,
  };
}

function recordArtifactInTx(db, input, { rootDir = process.cwd() } = {}) {
  const normalized = normalizeArtifactInput(input);
  const {
    ownerType, ownerId, kind, status,
    sourceRefs, consumerRefs, provenance, metadata,
  } = normalized;
  assertOwner(db, ownerType, ownerId);
  const ownerRefs = assertDeclaredOwnerRefs(db, normalized);
  const resolved = resolveArtifactFile(rootDir, normalized.path);
  if (isExemptArtifactPath(resolved.relative) || isGeneratedProjectionPath(resolved.relative)) {
    throw new ArtifactRegistryError(
      'ARTIFACT_PATH_EXEMPT',
      `runtime, scratch, and generated projection paths are not registry authority: ${resolved.relative}`,
    );
  }
  const stableRead = openStableArtifactRead(resolved);
  try {
  const explicitId = normalized.id || null;
  const existingById = explicitId
    ? db.prepare('SELECT * FROM artifacts WHERE id = ?').get(explicitId)
    : null;
  const existingByAuthority = db.prepare(
    `SELECT * FROM artifacts
     WHERE owner_type = ? AND owner_id = ? AND kind = ? AND path = ?`,
  ).get(ownerType, ownerId, kind, resolved.relative);
  if (explicitId && existingByAuthority && existingByAuthority.id !== explicitId) {
    throw new ArtifactRegistryError(
      'ARTIFACT_AUTHORITY_CONFLICT',
      `artifact authority is already bound to id ${existingByAuthority.id}`,
      { requested_id: explicitId, existing_id: existingByAuthority.id },
    );
  }
  const existing = existingById || existingByAuthority;
  if (existing && (
    existing.owner_type !== ownerType || existing.owner_id !== ownerId
    || existing.kind !== kind || existing.path !== resolved.relative
  )) {
    throw new ArtifactRegistryError(
      'ARTIFACT_AUTHORITY_CONFLICT',
      `artifact id ${existing.id} is already bound to another authority`,
    );
  }
  const artifactId = existing?.id || explicitId || `art-${crypto.randomUUID().slice(0, 12)}`;
  const activePathRows = db.prepare(
    "SELECT id FROM artifacts WHERE path = ? AND status <> 'archived' ORDER BY id",
  ).all(resolved.relative);
  const pathConflict = activePathRows.find((row) => row.id !== artifactId);
  if (status !== 'archived' && pathConflict) {
    throw new ArtifactRegistryError(
      'ARTIFACT_AUTHORITY_CONFLICT',
      `artifact path already has active authority ${pathConflict.id}: ${resolved.relative}`,
      {
        path: resolved.relative,
        requested_id: artifactId,
        existing_id: pathConflict.id,
      },
    );
  }
  for (const [field, refs] of [['source_refs', sourceRefs], ['consumer_refs', consumerRefs]]) {
    refs.forEach((ref, index) => {
      if (ref.type === 'artifact' && ref.id === artifactId) {
        throw new ArtifactRegistryError(
          'ARTIFACT_GRAPH_SELF_EDGE',
          `${field}[${index}] cannot reference artifact ${artifactId} itself`,
          { artifact_id: artifactId, field, index },
        );
      }
      assertEndpoint(db, ref, `${field}[${index}]`);
    });
  }
  const beforeDigest = existing?.digest || existing?.content_hash || null;
  if (normalized.expectedBeforeDigest !== undefined
    && normalized.expectedBeforeDigest !== beforeDigest) {
    throw new ArtifactRegistryError(
      'ARTIFACT_DIGEST_CONFLICT',
      `artifact ${artifactId} changed since it was read`,
      { expected: normalized.expectedBeforeDigest, actual: beforeDigest },
    );
  }
  const afterDigest = stableRead.digest;
  if (normalized.contentDigest !== undefined && normalized.contentDigest !== afterDigest) {
    throw new ArtifactRegistryError(
      'ARTIFACT_DIGEST_CONFLICT',
      `artifact bytes do not match the supplied digest: ${resolved.relative}`,
      { expected: normalized.contentDigest, actual: afterDigest },
    );
  }
  const changed = beforeDigest !== afterDigest;
  const priorConsumers = existing ? edgesForArtifact(db, artifactId).consumers : [];
  const ownerChangeId = ownerRefs.changeId;
  const now = new Date().toISOString();
  let invalidated = [];
  db.prepare(
    `INSERT INTO artifacts
     (id, owner_type, owner_id, change_id, task_id, kind, path, digest,
      content_hash, before_digest, after_digest, provenance_json, metadata_json,
      managed, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       owner_type = excluded.owner_type, owner_id = excluded.owner_id,
       change_id = excluded.change_id, task_id = excluded.task_id,
       kind = excluded.kind, path = excluded.path, digest = excluded.digest,
       content_hash = excluded.content_hash, before_digest = excluded.before_digest,
       after_digest = excluded.after_digest, provenance_json = excluded.provenance_json,
       metadata_json = excluded.metadata_json, managed = 1, status = excluded.status,
       updated_at = excluded.updated_at`,
  ).run(
    artifactId, ownerType, ownerId,
    ownerChangeId,
    ownerRefs.taskId,
    kind, resolved.relative, afterDigest, afterDigest, beforeDigest, afterDigest,
    JSON.stringify(provenance), JSON.stringify(metadata), status,
    existing?.created_at || now, now,
  );
  db.prepare(
    `DELETE FROM artifact_edges
     WHERE (source_type = 'artifact' AND source_id = ?)
        OR (target_type = 'artifact' AND target_id = ?)`,
  ).run(artifactId, artifactId);
  for (const ref of sourceRefs) {
    insertEdge(db, ref.type, ref.id, 'artifact', artifactId, ref.relation);
  }
  for (const ref of consumerRefs) {
    insertEdge(db, 'artifact', artifactId, ref.type, ref.id, ref.relation);
  }
  if (graphCycleFrom(db, { type: 'artifact', id: artifactId })) {
    throw new ArtifactRegistryError(
      'ARTIFACT_GRAPH_CYCLE',
      `artifact dependency edges create a cycle through ${artifactId}`,
      { artifact_id: artifactId },
    );
  }
  if (beforeDigest && changed) {
    invalidated = invalidateDownstreamInTx(db, artifactId, priorConsumers);
  }
  ops.appendEventInTx(db, {
    type: 'artifact_recorded',
    change_id: ownerChangeId,
    task_id: ownerType === 'task' ? ownerId : null,
    payload: {
      artifact_id: artifactId, path: resolved.relative, before_digest: beforeDigest,
      after_digest: afterDigest, changed,
    },
  });
  if (beforeDigest && changed) {
    ops.appendEventInTx(db, {
      type: 'spec_changed',
      change_id: ownerChangeId,
      task_id: ownerType === 'task' ? ownerId : null,
      payload: {
        artifact_id: artifactId, path: resolved.relative,
        before_digest: beforeDigest, after_digest: afterDigest,
        sections: [resolved.relative], invalidated,
      },
    });
  }
  stableRead.verify();
  return {
    artifact: getArtifact(db, { id: artifactId }),
    changed,
    invalidated,
  };
  } finally {
    stableRead.close();
  }
}

function recordArtifact(db, input, options = {}) {
  return ops.tx(db, () => recordArtifactInTx(db, input, options));
}

function moveArtifactInTx(db, id, nextPath, { rootDir = process.cwd() } = {}) {
  const row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id);
  if (!row) {
    throw new ArtifactRegistryError('ARTIFACT_NOT_FOUND', `artifact ${id} not found`);
  }
  const resolved = resolveArtifactFile(rootDir, nextPath);
  if (isExemptArtifactPath(resolved.relative) || isGeneratedProjectionPath(resolved.relative)) {
    throw new ArtifactRegistryError(
      'ARTIFACT_PATH_EXEMPT',
      `artifact cannot move into runtime, scratch, or generated projections: ${resolved.relative}`,
    );
  }
  const conflict = db.prepare(
    "SELECT id FROM artifacts WHERE path = ? AND status <> 'archived' AND id <> ? LIMIT 1",
  ).get(resolved.relative, id);
  if (row.status !== 'archived' && conflict) {
    throw new ArtifactRegistryError(
      'ARTIFACT_AUTHORITY_CONFLICT',
      `artifact path already has active authority ${conflict.id}: ${resolved.relative}`,
    );
  }
  const stableRead = openStableArtifactRead(resolved);
  try {
    const actual = stableRead.digest;
    const expected = row.digest || row.content_hash;
    if (expected && actual !== expected) {
      throw new ArtifactRegistryError(
        'ARTIFACT_DIGEST_CONFLICT',
        `artifact move target digest does not match ${id}`,
        { expected, actual },
      );
    }
    db.prepare(
      `UPDATE artifacts SET path = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    ).run(resolved.relative, id);
    ops.appendEventInTx(db, {
      type: 'artifact_moved',
      change_id: row.change_id || (row.owner_type === 'change' ? row.owner_id : null),
      task_id: row.owner_type === 'task' ? row.owner_id : null,
      payload: { artifact_id: id, from: row.path, to: resolved.relative },
    });
    stableRead.verify();
    return getArtifact(db, { id });
  } finally {
    stableRead.close();
  }
}

function setArtifactStatusInTx(db, id, status) {
  if (!STATUSES.has(status)) {
    throw new ArtifactRegistryError('VALIDATION_ERROR', `invalid artifact status: ${status}`);
  }
  const row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id);
  if (!row) {
    throw new ArtifactRegistryError('ARTIFACT_NOT_FOUND', `artifact ${id} not found`);
  }
  if (status !== 'archived') {
    const conflict = db.prepare(
      "SELECT id FROM artifacts WHERE path = ? AND status <> 'archived' AND id <> ? LIMIT 1",
    ).get(row.path, id);
    if (conflict) {
      throw new ArtifactRegistryError(
        'ARTIFACT_AUTHORITY_CONFLICT',
        `artifact path already has active authority ${conflict.id}: ${row.path}`,
      );
    }
  }
  db.prepare(
    `UPDATE artifacts SET status = ?,
     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  ).run(status, id);
  return getArtifact(db, { id });
}

function collectJsonPaths(value, output) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonPaths(item, output);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (['path', 'ref', 'manifest_path', 'report_path'].includes(key)
      && typeof item === 'string' && item.startsWith('.ultra/')) {
      try { output.add(normalizeRelativePath(item)); } catch { /* diagnosed elsewhere */ }
    } else {
      collectJsonPaths(item, output);
    }
  }
}

function knownArtifactPaths(db) {
  const known = new Set(
    db.prepare('SELECT path FROM artifacts').all().map((row) => normalizeRelativePath(row.path)),
  );
  const jsonQueries = [
    ['SELECT spec_refs_json, evidence_json FROM baselines', ['spec_refs_json', 'evidence_json']],
    ['SELECT outputs_json FROM workflow_steps', ['outputs_json']],
    ['SELECT checkpoint_json FROM decision_threads', ['checkpoint_json']],
  ];
  for (const [sql, fields] of jsonQueries) {
    for (const row of db.prepare(sql).all()) {
      for (const field of fields) collectJsonPaths(parseJson(row[field], null), known);
    }
  }
  for (const row of db.prepare('SELECT manifest_path FROM context_snapshots').all()) {
    if (row.manifest_path) known.add(normalizeRelativePath(row.manifest_path));
  }
  for (const row of db.prepare('SELECT id, context_file FROM tasks').all()) {
    known.add(normalizeRelativePath(
      contextPaths.resolveContextPath('.', row.context_file, { taskId: row.id }).relative,
    ));
  }
  return known;
}

function listUltraFiles(rootDir) {
  return walkStableProjectTree(rootDir, '.ultra', {
    ignore(relative, entry, stat) {
      return (stat.isDirectory()
          && (relative === '.ultra/.runtime' || relative === '.ultra/scratch'))
        || (stat.isFile() && ['.DS_Store', '.gitkeep'].includes(entry.name));
    },
  });
}

function hasReachableConsumerSink(db, artifactId) {
  const queue = [...outgoingEdges(db, { type: 'artifact', id: artifactId })];
  const seen = new Set();
  while (queue.length > 0) {
    const endpoint = queue.shift();
    const key = endpointKey(endpoint);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!endpointExists(db, endpoint.type, endpoint.id)) continue;
    if (endpoint.type === 'task' || endpoint.type === 'workflow') return true;
    if (endpoint.type === 'artifact') {
      const row = db.prepare(
        'SELECT status, metadata_json FROM artifacts WHERE id = ?',
      ).get(endpoint.id);
      const metadata = parseJson(row?.metadata_json, {});
      if (row && (row.status === 'terminal' || metadata.terminal_role === true)) return true;
    }
    queue.push(...outgoingEdges(db, endpoint));
  }
  return false;
}

function inspectArtifactHealth(db, { rootDir = process.cwd() } = {}) {
  const issues = [];
  const rows = db.prepare('SELECT * FROM artifacts ORDER BY path, id').all();
  const byPath = new Map();
  const push = (code, details = {}) => issues.push({ code, ...details });
  for (const row of rows) {
    const relative = normalizeRelativePath(row.path);
    if (row.status !== 'archived') {
      if (!byPath.has(relative)) byPath.set(relative, []);
      byPath.get(relative).push(row.id);
    }
    let resolved;
    try {
      resolved = resolveArtifactFile(rootDir, relative);
    } catch (error) {
      push(
        error.code === 'ARTIFACT_PATH_INVALID'
          ? 'ARTIFACT_PATH_UNSAFE'
          : 'ARTIFACT_MISSING',
        { artifact_id: row.id, path: relative },
      );
      continue;
    }
    try {
      const expected = row.digest || row.content_hash;
      const actual = stableArtifactDigest(resolved);
      if (row.status === 'stale' || (expected && expected !== actual)) {
        push('ARTIFACT_STALE', {
          artifact_id: row.id, path: relative, expected_digest: expected || null,
          actual_digest: actual,
        });
      }
    } catch (error) {
      push(
        error.code === 'ARTIFACT_PATH_INVALID'
          ? 'ARTIFACT_PATH_UNSAFE'
          : 'ARTIFACT_MISSING',
        { artifact_id: row.id, path: relative },
      );
    }
    if (!endpointExists(db, row.owner_type, row.owner_id)) {
      push('ARTIFACT_OWNER_MISSING', {
        artifact_id: row.id, path: relative,
        owner_type: row.owner_type, owner_id: row.owner_id,
      });
    }
    if (!row.managed) {
      push('ARTIFACT_COMPATIBILITY_UNMANAGED', {
        artifact_id: row.id, path: relative,
      });
    }
    if (row.managed && row.status === 'current') {
      const metadata = parseJson(row.metadata_json, {});
      if (metadata.terminal_role !== true && !hasReachableConsumerSink(db, row.id)) {
        push('ARTIFACT_NO_CONSUMER', { artifact_id: row.id, path: relative });
      }
      if (graphCycleFrom(db, { type: 'artifact', id: row.id })) {
        push('ARTIFACT_GRAPH_CYCLE', { artifact_id: row.id, path: relative });
      }
    }
  }
  for (const [artifactPath, ids] of byPath) {
    if (ids.length > 1) {
      push('ARTIFACT_DUPLICATE_AUTHORITY', {
        path: artifactPath, artifact_ids: ids,
      });
    }
  }
  for (const edge of db.prepare('SELECT * FROM artifact_edges ORDER BY id').all()) {
    const sourceExists = endpointExists(db, edge.source_type, edge.source_id);
    const targetExists = endpointExists(db, edge.target_type, edge.target_id);
    if (!sourceExists || !targetExists) {
      push('ARTIFACT_EDGE_DANGLING', {
        edge_id: edge.id,
        source: { type: edge.source_type, id: edge.source_id },
        target: { type: edge.target_type, id: edge.target_id },
      });
    }
  }
  const known = knownArtifactPaths(db);
  const readyBaseline = Boolean(db.prepare(
    "SELECT 1 FROM baselines WHERE status = 'ready' LIMIT 1",
  ).get());
  const tree = listUltraFiles(rootDir);
  for (const issue of tree.unsafe) {
    push('ARTIFACT_TREE_UNSAFE', issue);
  }
  for (const relative of tree.files) {
    if (isExemptArtifactPath(relative) || known.has(relative)) continue;
    if (!readyBaseline && PROVISIONAL_BASELINE_SPEC_PATHS.has(relative)) continue;
    if (relative.startsWith(`${contextPaths.LEGACY_CONTEXT_ROOT_RELATIVE}/`)) {
      let contents;
      try {
        contents = readStableProjectFile(rootDir, relative).bytes;
      } catch (error) {
        push('ARTIFACT_TREE_UNSAFE', { path: relative, reason: error.message });
        continue;
      }
      if (contextPaths.isGeneratedContextContents(contents)) {
        push('ARTIFACT_GHOST_PROJECTION', { path: relative });
      }
    }
    push('ARTIFACT_UNREGISTERED', { path: relative });
  }
  const counts = {};
  for (const issue of issues) counts[issue.code] = (counts[issue.code] || 0) + 1;
  return {
    status: issues.length === 0 ? 'pass' : 'fail',
    registered: rows.length,
    managed: rows.filter((row) => Boolean(row.managed)).length,
    unmanaged: rows.filter((row) => !row.managed).length,
    issues,
    counts,
  };
}

module.exports = {
  ArtifactRegistryError,
  ENDPOINT_TYPES,
  OWNER_TYPES,
  STATUSES,
  assertArtifactOwner,
  digestFile,
  getArtifact,
  inspectArtifactHealth,
  isExemptArtifactPath,
  isGeneratedProjectionPath,
  normalizeRelativePath,
  preflightArtifactPublication,
  recordArtifact,
  recordArtifactInTx,
  moveArtifactInTx,
  setArtifactStatusInTx,
  invalidateDownstreamInTx,
  invalidateConsumersFromEndpointInTx,
  outgoingEdges,
};
