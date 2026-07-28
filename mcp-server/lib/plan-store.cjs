'use strict';

// Phase 8A.4b — Persist / load / section-slice the execution-plan artifact.
//
// The plan itself is computed by orchestrator/planner/plan-builder.cjs
// (Functional Core). This module handles IO: atomic write via the shared
// file-ops helper for the retired global artifact, plus journaled publication,
// read-back, md rendering, and section projection for change-scoped plans.

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { writeAtomic } = require('../../adapters/_shared/file-ops.cjs');
const { buildPlan } = require('../../orchestrator/planner/plan-builder.cjs');

const DEFAULT_ARTIFACT_RELPATH = '.ultra/execution-plan.json';
const PLAN_PUBLICATION_WORKER = path.join(__dirname, 'plan-publication-worker.cjs');

function planPathError(message, cause) {
  const error = new Error(message);
  error.code = 'PLAN_ARTIFACT_PATH_UNSAFE';
  if (cause) error.cause = cause;
  return error;
}

function containedPath(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function entryExists(candidate) {
  try {
    fs.lstatSync(candidate);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function assertRegularTarget(target, physicalRoot) {
  if (!entryExists(target)) return;
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw planPathError(`plan artifact target must be a regular file: ${target}`);
  }
  const physicalTarget = fs.realpathSync(target);
  if (!containedPath(physicalRoot, physicalTarget)) {
    throw planPathError(`plan artifact target escapes the physical project root: ${target}`);
  }
}

function assertArtifactDirectoryCurrent(paths) {
  let current = paths.root;
  const relativeDirectory = path.relative(paths.root, paths.directory);
  for (const segment of relativeDirectory.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); } catch (cause) {
      throw planPathError(`plan artifact ancestor disappeared: ${current}`, cause);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw planPathError(`plan artifact ancestor must be a real directory: ${current}`);
    }
  }
  let physicalDirectory;
  try { physicalDirectory = fs.realpathSync(paths.directory); } catch (cause) {
    throw planPathError(`plan artifact directory cannot be resolved: ${paths.directory}`, cause);
  }
  if (physicalDirectory !== paths.physicalDirectory
    || !containedPath(paths.physicalRoot, physicalDirectory)) {
    throw planPathError(
      `plan artifact directory changed after staging: ${paths.directory}`,
    );
  }
}

function verifyArtifactDirectory(projectRoot, change) {
  const root = path.resolve(projectRoot);
  let rootStat;
  try { rootStat = fs.lstatSync(root); } catch (cause) {
    throw planPathError(`project root does not exist: ${root}`, cause);
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw planPathError(`project root must be a real directory: ${root}`);
  }
  const physicalRoot = fs.realpathSync(root);
  const paths = changePlanPaths(root, change);
  const directory = path.dirname(paths.json);
  const relativeDirectory = path.relative(root, directory);
  let current = root;
  for (const segment of relativeDirectory.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) {
      try { fs.mkdirSync(current); } catch (cause) {
        throw planPathError(`cannot create plan artifact directory: ${current}`, cause);
      }
    }
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw planPathError(`plan artifact ancestor must be a real directory: ${current}`);
    }
  }
  const physicalDirectory = fs.realpathSync(directory);
  if (!containedPath(physicalRoot, physicalDirectory)) {
    throw planPathError(`plan artifact directory escapes the physical project root: ${directory}`);
  }
  assertRegularTarget(paths.json, physicalRoot);
  assertRegularTarget(paths.md, physicalRoot);
  return {
    ...paths,
    root,
    directory,
    physicalRoot,
    physicalDirectory,
  };
}

function writeExclusive(file, content) {
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_EXCL
    | (fs.constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(file, flags, 0o600);
  try {
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function digestContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function directoryIdentity(directory) {
  const stat = fs.statSync(directory, { bigint: true });
  if (!stat.isDirectory()) {
    throw planPathError(`plan artifact directory is not a directory: ${directory}`);
  }
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function workerError(payload, fallback) {
  const error = new Error(payload?.message || fallback);
  error.code = payload?.code || 'PLAN_WORKER_FAILED';
  if (payload?.details !== undefined) error.details = payload.details;
  return error;
}

function runDirectoryWorker(paths, action, payload, {
  verifyCurrent = true,
} = {}) {
  if (verifyCurrent) assertArtifactDirectoryCurrent(paths);
  const result = spawnSync(
    process.execPath,
    [PLAN_PUBLICATION_WORKER, action],
    {
      cwd: paths.directory,
      input: JSON.stringify(payload),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) {
    throw planPathError(
      `cannot start plan publication worker in ${paths.directory}: ${result.error.message}`,
      result.error,
    );
  }
  let response;
  try { response = JSON.parse(String(result.stdout || '').trim()); } catch (cause) {
    throw workerError(
      null,
      `plan publication worker returned invalid output: ${String(result.stderr || '').trim()}`,
    );
  }
  if (!response?.ok) throw workerError(response?.error, 'plan publication worker failed');
  if (result.status !== 0) {
    throw workerError(
      response?.error,
      `plan publication worker exited ${result.status}: ${String(result.stderr || '').trim()}`,
    );
  }
  return response.result;
}

function inspectExistingArtifactDirectory(projectRoot, change) {
  const root = path.resolve(projectRoot);
  const paths = changePlanPaths(root, change);
  const directory = path.dirname(paths.json);
  let rootStat;
  try { rootStat = fs.lstatSync(root); } catch (cause) {
    throw planPathError(`project root does not exist: ${root}`, cause);
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw planPathError(`project root must be a real directory: ${root}`);
  }
  const physicalRoot = fs.realpathSync(root);
  let current = root;
  for (const segment of path.relative(root, directory).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); } catch (cause) {
      if (cause?.code === 'ENOENT') return null;
      throw planPathError(`plan artifact ancestor cannot be inspected: ${current}`, cause);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw planPathError(`plan artifact ancestor must be a real directory: ${current}`);
    }
  }
  const physicalDirectory = fs.realpathSync(directory);
  if (!containedPath(physicalRoot, physicalDirectory)) {
    throw planPathError(`plan artifact directory escapes the physical project root: ${directory}`);
  }
  return {
    ...paths,
    root,
    directory,
    physicalRoot,
    physicalDirectory,
  };
}

function readChangePlanBytes(projectRoot, change) {
  const paths = inspectExistingArtifactDirectory(projectRoot, change);
  if (!paths) return null;
  const identity = directoryIdentity(paths.directory);
  const result = runDirectoryWorker(paths, 'read', {
    identity,
    target: 'plan.json',
  });
  if (!result.exists) return null;
  const bytes = Buffer.from(result.content, 'base64');
  if (digestContent(bytes) !== result.digest) {
    throw planPathError('plan publication reader returned inconsistent bytes');
  }
  return bytes;
}

function renderPlanMd(plan, { tasks = [] } = {}) {
  const lines = [];
  lines.push('# Execution Plan');
  lines.push('');
  if (plan.change_id) lines.push(`- Change: ${plan.change_id}`);
  if (plan.context?.snapshot_id) lines.push(`- Context snapshot: ${plan.context.snapshot_id}`);
  if (plan.context?.manifest_digest) lines.push(`- Context digest: ${plan.context.manifest_digest}`);
  lines.push(`- Waves: ${plan.waves.length}`);
  lines.push(plan.estimated_cost_usd === null
    ? '- Estimated cost: unavailable (exact runtime model was not recorded)'
    : `- Estimated cost: $${plan.estimated_cost_usd}`);
  lines.push(`- Estimated duration: ${plan.estimated_duration_min} min`);
  if (plan.conflict_surface.length > 0) {
    lines.push(`- Conflicts: ${plan.conflict_surface.length}`);
  }
  if (plan.cycles && plan.cycles.length > 0) {
    lines.push(`- Cycles: ${plan.cycles.length}`);
  }
  lines.push('');
  lines.push('## Waves');
  lines.push('');
  for (const w of plan.waves) {
    lines.push(`### Wave ${w.id} ${w.parallel ? '(parallel)' : '(serial)'}`);
    for (const id of w.tasks) lines.push(`- ${id}`);
    if (w.reason) lines.push(`_reason_: ${w.reason}`);
    lines.push('');
  }
  if (plan.conflict_surface.length > 0) {
    lines.push('## Conflict Surface');
    lines.push('');
    for (const c of plan.conflict_surface) {
      lines.push(`- **files**: ${c.files.join(', ')}; **tasks**: ${c.tasks.join(', ')}; **recommend**: ${c.recommend}`);
    }
  }
  if (tasks.length > 0) {
    lines.push('');
    lines.push('## Task Contracts');
    lines.push('');
    for (const task of [...tasks].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
      lines.push(`## Task ${task.id}`);
      lines.push('');
      lines.push(`- Purpose: ${task.outcome || 'unresolved'}`);
      lines.push(`- Why: ${task.trace_to || 'unresolved'}`);
      lines.push(`- Slice: ${task.slice_kind || 'unresolved'}`);
      lines.push(`- Public seam: ${task.public_seam || 'unresolved'}`);
      lines.push(`- Target files: ${(task.files_modified || []).join(', ') || 'resolved at implementation time'}`);
      lines.push(`- Verification: ${task.verification_command || 'unresolved'}`);
      lines.push(`- Documentation: ${task.docs_impact?.status || 'unknown'} — ${task.docs_impact?.rationale || 'unresolved'}`);
      lines.push('');
      lines.push('### Acceptance');
      lines.push('');
      for (const item of task.acceptance || []) {
        lines.push(`- ${item.id}: ${item.criterion} — \`${item.verification}\``);
      }
      if ((task.acceptance || []).length === 0) lines.push('- unresolved');
      lines.push('');
      lines.push('### Pattern and context references');
      lines.push('');
      for (const item of task.context_refs || []) {
        const locator = [item.ref, item.anchor].filter(Boolean).join('#');
        const scope = item.scope ? `; scope: ${item.scope}` : '';
        lines.push(`- \`${locator}\` — ${item.reason}${scope}`);
      }
      if ((task.context_refs || []).length === 0) lines.push('- unresolved');
      lines.push('');
      lines.push('### Recovery and drift');
      lines.push('');
      lines.push('- Recovery: follow the owning Change Contract recovery strategy and verification.');
      lines.push('- Drift: recompile when the Change contract, task contract, or a digest-bound context reference changes.');
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}

function savePlanArtifact(plan, outPath, format = 'json', renderOptions = {}) {
  if (!outPath) {
    const err = new Error('out_path required');
    err.code = 'WRITE_FAILED';
    throw err;
  }
  const abs = path.resolve(outPath);
  const content = format === 'md'
    ? renderPlanMd(plan, renderOptions)
    : `${JSON.stringify(plan, null, 2)}\n`;
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    writeAtomic(abs, content);
  } catch (err) {
    const wrap = new Error(`cannot write plan: ${err.message}`);
    wrap.code = 'WRITE_FAILED';
    wrap.cause = err;
    throw wrap;
  }
  return { plan_path: abs };
}

function loadPlanArtifact(projectRoot) {
  const abs = path.resolve(projectRoot, DEFAULT_ARTIFACT_RELPATH);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

function changePlanPaths(projectRoot, change) {
  const artifactRoot = String(change?.artifact_root || '').trim();
  if (!artifactRoot || path.isAbsolute(artifactRoot)) {
    const error = new Error('change artifact_root must be project-relative');
    error.code = 'WRITE_FAILED';
    throw error;
  }
  const root = path.resolve(projectRoot);
  const directory = path.resolve(root, artifactRoot);
  if (directory !== root && !directory.startsWith(`${root}${path.sep}`)) {
    const error = new Error('change artifact_root escapes project root');
    error.code = 'WRITE_FAILED';
    throw error;
  }
  return {
    json: path.join(directory, 'plan.json'),
    md: path.join(directory, 'plan.md'),
  };
}

function saveChangePlanArtifacts(plan, {
  rootDir,
  change,
  tasks = [],
  context,
} = {}) {
  const publication = prepareChangePlanPublication(plan, {
    rootDir,
    change,
    tasks,
    context,
  });
  try {
    publication.publish();
  } catch (error) {
    const rollback = publication.rollback();
    if (rollback?.rolled_back === false) {
      throw planRecoveryRequiredError(error, rollback, publication.transaction_id);
    }
    throw error;
  }
  publication.commit();
  return {
    plan_path: publication.plan_path,
    plan_md_path: publication.plan_md_path,
    plan: publication.plan,
  };
}

function errorEvidence(error) {
  return {
    code: error?.code || 'PLAN_PUBLISH_FAILED',
    message: error?.message || 'plan publication failed',
    ...(error?.details !== undefined ? { details: error.details } : {}),
  };
}

function planRecoveryRequiredError(originalError, rollback, transactionId) {
  const original = originalError?.details?.original_error || errorEvidence(originalError);
  const rollbackIssue = rollback?.issue
    || originalError?.details?.rollback_issue
    || {
      code: 'PLAN_RECOVERY_FAILED',
      message: 'plan publication rollback did not complete',
    };
  const error = new Error(
    `plan publication failed and rollback recovery is required: ${original.message}; `
      + `${rollbackIssue.message}`,
  );
  error.code = 'PLAN_RECOVERY_REQUIRED';
  error.cause = originalError;
  error.details = {
    transaction_id: transactionId,
    original_error: original,
    rollback_issue: rollbackIssue,
    issue: rollbackIssue,
  };
  return error;
}

function prepareChangePlanPublication(plan, {
  rootDir,
  change,
  tasks = [],
  context,
} = {}) {
  if (!change || plan?.change_id !== change.id) {
    const error = new Error('plan must be bound to its owning change');
    error.code = 'PLAN_CHANGE_MISMATCH';
    throw error;
  }
  if (!context?.snapshot_id || !/^[0-9a-f]{64}$/.test(context.manifest_digest || '')) {
    const error = new Error('plan export requires a digest-bound planning context');
    error.code = 'PLAN_CONTEXT_REQUIRED';
    throw error;
  }
  const boundPlan = {
    ...plan,
    context: {
      snapshot_id: context.snapshot_id,
      manifest_path: context.manifest_path,
      manifest_digest: context.manifest_digest,
    },
  };
  const paths = verifyArtifactDirectory(rootDir, change);
  const jsonContent = `${JSON.stringify(boundPlan, null, 2)}\n`;
  const mdContent = renderPlanMd(boundPlan, { tasks });
  const canonicalPath = (file) => path.relative(path.resolve(rootDir), file)
    .split(path.sep).join('/');
  return beginPlanPublication({
    paths,
    boundPlan,
    jsonContent,
    mdContent,
    authority: {
      owner_type: 'change',
      owner_id: change.id,
      paths: {
        execution_plan: canonicalPath(paths.json),
        execution_plan_markdown: canonicalPath(paths.md),
      },
    },
  });
}

function beginPlanPublication({
  paths,
  boundPlan,
  jsonContent,
  mdContent,
  authority,
}) {
  const transactionId = crypto.randomUUID();
  const identity = directoryIdentity(paths.directory);
  let prepared;
  try {
    prepared = runDirectoryWorker(paths, 'prepare', {
      identity,
      transaction_id: transactionId,
      contents: {
        execution_plan: jsonContent,
        execution_plan_markdown: mdContent,
      },
      authority,
    });
  } catch (cause) {
    if (cause?.code === 'PLAN_ARTIFACT_PATH_UNSAFE') throw cause;
    const error = new Error(`cannot stage plan publication: ${cause.message}`);
    error.code = cause?.code || 'PLAN_PUBLISH_FAILED';
    error.cause = cause;
    throw error;
  }
  let published = false;
  let finalized = false;

  const rollback = () => {
    if (finalized) return;
    try {
      runDirectoryWorker(paths, 'rollback', {
        identity,
        transaction_id: transactionId,
      });
      finalized = true;
    } catch (error) {
      return {
        rolled_back: false,
        issue: {
          code: error.code || 'PLAN_RECOVERY_FAILED',
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      };
    }
    return { rolled_back: true };
  };

  const publish = () => {
    if (published) return;
    try {
      runDirectoryWorker(paths, 'publish', {
        identity,
        transaction_id: transactionId,
      });
      published = true;
    } catch (cause) {
      const rollbackResult = rollback();
      if (rollbackResult?.rolled_back === false) {
        throw planRecoveryRequiredError(cause, rollbackResult, transactionId);
      }
      if (['PLAN_ARTIFACT_PATH_UNSAFE', 'PLAN_PUBLISH_CONFLICT'].includes(cause?.code)) {
        throw cause;
      }
      const error = new Error(`cannot publish plan artifacts: ${cause.message}`);
      error.code = cause?.code || 'PLAN_PUBLISH_FAILED';
      error.cause = cause;
      throw error;
    }
  };

  const commit = () => {
    if (finalized) return;
    if (!published) {
      const error = new Error('plan publication was not published');
      error.code = 'PLAN_PUBLISH_FAILED';
      throw error;
    }
    try {
      runDirectoryWorker(paths, 'commit', {
        identity,
        transaction_id: transactionId,
      });
      finalized = true;
    } catch (cause) {
      const error = new Error(
        `plan publication cleanup is incomplete; recovery is required: ${cause.message}`,
      );
      error.code = 'PLAN_RECOVERY_REQUIRED';
      error.cause = cause;
      error.details = {
        transaction_id: transactionId,
        issue: {
          code: cause.code || 'PLAN_RECOVERY_FAILED',
          message: cause.message,
          details: cause.details,
        },
      };
      throw error;
    }
  };

  return {
    transaction_id: transactionId,
    plan_path: paths.json,
    plan_md_path: paths.md,
    plan: boundPlan,
    artifacts: prepared.entries.map((entry) => ({
      kind: entry.kind,
      path: path.join(paths.directory, entry.target),
      digest: entry.digest,
    })),
    publish,
    rollback,
    commit,
  };
}

function canonicalChangeRows(db) {
  return db.prepare(
    `SELECT id, artifact_root
     FROM changes
     WHERE artifact_root IS NOT NULL AND TRIM(artifact_root) <> ''
     ORDER BY id`,
  ).all();
}

function registryAuthorityForPath(db, relativePath) {
  const rows = db.prepare(
    `SELECT owner_type, owner_id, kind, path, digest, content_hash,
            status, managed, provenance_json
     FROM artifacts
     WHERE path = ? AND status <> 'archived'
     ORDER BY updated_at DESC, rowid DESC`,
  ).all(relativePath);
  if (rows.length !== 1) return null;
  let provenance = {};
  try { provenance = JSON.parse(rows[0].provenance_json || '{}'); } catch { provenance = {}; }
  return {
    owner_type: rows[0].owner_type,
    owner_id: rows[0].owner_id,
    kind: rows[0].kind,
    path: rows[0].path,
    digest: rows[0].digest || rows[0].content_hash || null,
    status: rows[0].status,
    managed: rows[0].managed,
    provenance,
  };
}

function inspectPlanPublications(db, {
  rootDir = process.cwd(),
} = {}) {
  let pending = 0;
  const transactions = [];
  const issues = [];
  for (const change of canonicalChangeRows(db)) {
    let paths;
    try {
      paths = inspectExistingArtifactDirectory(rootDir, change);
      if (!paths) continue;
      const identity = directoryIdentity(paths.directory);
      const inspected = runDirectoryWorker(paths, 'inspect', { identity });
      pending += inspected.pending;
      transactions.push(...inspected.transactions.map((item) => ({
        ...item,
        change_id: change.id,
        artifact_root: change.artifact_root,
      })));
      issues.push(...inspected.issues.map((item) => ({
        ...item,
        change_id: change.id,
        artifact_root: change.artifact_root,
      })));
    } catch (error) {
      pending += 1;
      issues.push({
        code: error.code || 'PLAN_RECOVERY_FAILED',
        change_id: change.id,
        artifact_root: change.artifact_root,
        message: error.message,
      });
    }
  }
  return {
    status: pending === 0 && issues.length === 0 ? 'pass' : 'fail',
    pending,
    transactions,
    issues,
  };
}

function recoverPlanPublications(db, {
  rootDir = process.cwd(),
} = {}) {
  let recovered = 0;
  let finalized = 0;
  const issues = [];
  for (const change of canonicalChangeRows(db)) {
    let paths;
    try {
      paths = inspectExistingArtifactDirectory(rootDir, change);
      if (!paths) continue;
      const identity = directoryIdentity(paths.directory);
      const relative = (file) => path.relative(path.resolve(rootDir), file)
        .split(path.sep).join('/');
      const result = runDirectoryWorker(paths, 'recover', {
        identity,
        registry: {
          'plan.json': registryAuthorityForPath(db, relative(paths.json)),
          'plan.md': registryAuthorityForPath(db, relative(paths.md)),
        },
      });
      recovered += result.recovered;
      finalized += result.finalized;
      issues.push(...result.issues.map((item) => ({
        ...item,
        change_id: change.id,
        artifact_root: change.artifact_root,
      })));
    } catch (error) {
      issues.push({
        code: error.code || 'PLAN_RECOVERY_FAILED',
        change_id: change.id,
        artifact_root: change.artifact_root,
        message: error.message,
      });
    }
  }
  const after = inspectPlanPublications(db, { rootDir });
  return {
    recovered,
    finalized,
    pending: after.pending,
    issues: [...issues, ...after.issues],
  };
}

function loadChangePlanArtifact(projectRoot, change, {
  db = null,
  strict = false,
} = {}) {
  try {
    const bytes = readChangePlanBytes(projectRoot, change);
    if (!bytes) return null;
    const relative = path.relative(
      path.resolve(projectRoot),
      changePlanPaths(projectRoot, change).json,
    ).split(path.sep).join('/');
    if (db) {
      const rows = db.prepare(
        `SELECT owner_type, owner_id, kind, digest, content_hash, status
         FROM artifacts
         WHERE path = ? AND status <> 'archived'
         ORDER BY updated_at DESC, rowid DESC`,
      ).all(relative);
      if (rows.length !== 1
        || rows[0].owner_type !== 'change'
        || rows[0].owner_id !== change.id
        || rows[0].kind !== 'execution_plan'
        || rows[0].status !== 'current') {
        const error = new Error(`canonical Change plan registry authority is invalid: ${relative}`);
        error.code = 'PLAN_ARTIFACT_INVALID';
        throw error;
      }
      const expected = rows[0].digest || rows[0].content_hash;
      const actual = digestContent(bytes);
      if (!expected || expected !== actual) {
        const error = new Error(`canonical Change plan bytes do not match registry authority: ${relative}`);
        error.code = 'PLAN_ARTIFACT_INVALID';
        throw error;
      }
    }
    const value = JSON.parse(bytes.toString('utf8'));
    if (value?.change_id !== change.id) {
      const error = new Error(`canonical Change plan is not bound to ${change.id}`);
      error.code = 'PLAN_ARTIFACT_INVALID';
      throw error;
    }
    return value;
  } catch (error) {
    if (strict) {
      if (error?.code === 'PLAN_ARTIFACT_INVALID') throw error;
      const wrapped = new Error(`canonical Change plan is unsafe or invalid: ${error.message}`);
      wrapped.code = 'PLAN_ARTIFACT_INVALID';
      wrapped.cause = error;
      throw wrapped;
    }
    return null;
  }
}

function selectSection(plan, section) {
  switch (section || 'all') {
    case 'tasks':     return { ownership_forecast: plan.ownership_forecast };
    case 'topo':      return { waves: plan.waves };
    case 'conflicts': return { conflict_surface: plan.conflict_surface };
    case 'all':
    default:          return plan;
  }
}

module.exports = {
  savePlanArtifact,
  loadPlanArtifact,
  saveChangePlanArtifacts,
  prepareChangePlanPublication,
  inspectPlanPublications,
  recoverPlanPublications,
  loadChangePlanArtifact,
  changePlanPaths,
  selectSection,
  renderPlanMd,
  buildPlan,
  planRecoveryRequiredError,
  DEFAULT_ARTIFACT_RELPATH,
};
