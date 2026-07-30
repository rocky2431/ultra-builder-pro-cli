'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ops = require('./state-ops.cjs');
const providerRefs = require('./provider-refs.cjs');
const checkpoints = require('./stage-checkpoints.cjs');

const BASELINE_ID = /^[a-zA-Z0-9_-]+$/;
const MODES = new Set(['greenfield', 'brownfield']);
const SPEC_KINDS = new Set(['discovery', 'product', 'architecture', 'quality', 'delivery', 'other']);
const EVIDENCE_KINDS = new Set(['source', 'docs', 'runtime', 'test', 'deploy', 'external']);
const VERIFICATION_STATUSES = new Set(['pass', 'known_red', 'not_run']);
const GAP_CATEGORIES = new Set([
  'baseline_blocker', 'documentation_drift', 'known_defect',
  'technical_debt', 'unknown', 'future_change',
]);
const GAP_STATUSES = new Set(['open', 'accepted', 'resolved', 'deferred']);

class BaselineWorkflowError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'BaselineWorkflowError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function gitHead(rootDir) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function gitRepositoryRoot(rootDir) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function gitBranch(rootDir) {
  let result = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    result = spawnSync('git', ['branch', '--show-current'], {
      cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return result.status === 0 ? (result.stdout.trim() || null) : null;
}

function gitCommitIsAncestor(rootDir, ancestor, descendant) {
  if (!ancestor || !descendant) return false;
  const result = spawnSync(
    'git', ['merge-base', '--is-ancestor', ancestor, descendant],
    { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return result.status === 0;
}

function hashScopedWorkingTree(rootDir, relativePaths) {
  const root = path.resolve(rootDir);
  const digest = crypto.createHash('sha256');
  for (const relative of [...new Set(relativePaths)].sort()) {
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
      throw new BaselineWorkflowError(
        'BASELINE_SCOPE_INVALID',
        `Git returned a path outside the repository: ${relative}`,
      );
    }
    digest.update(relative).update('\0');
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat) {
      digest.update('missing\0');
    } else if (stat.isSymbolicLink()) {
      digest.update('symlink\0').update(fs.readlinkSync(file)).update('\0');
    } else if (stat.isFile()) {
      digest.update(stat.mode & 0o111 ? 'file+x\0' : 'file\0');
      digest.update(fs.readFileSync(file)).update('\0');
    } else if (stat.isDirectory()) {
      const submoduleHead = spawnSync('git', ['-C', file, 'rev-parse', 'HEAD'], {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      digest.update('directory\0');
      if (submoduleHead.status === 0) digest.update(submoduleHead.stdout.trim());
      digest.update('\0');
    } else {
      digest.update(`special:${stat.mode}\0`);
    }
  }
  return digest.digest('hex');
}

function gitWorktreeSnapshot(rootDir, scope = ['.']) {
  const repositoryRoot = gitRepositoryRoot(rootDir);
  if (!repositoryRoot) {
    return {
      head: null, branch: null, state: 'unavailable', digest: null, files: [],
    };
  }
  const head = gitHead(rootDir);
  const selectedScope = Array.isArray(scope) && scope.length > 0 ? scope : ['.'];
  const pathspecs = selectedScope.map((item) => (
    item === '.' ? '.' : `:(literal)${item}`
  ));
  const args = ['--', ...pathspecs, ':(exclude).ultra', ':(exclude).ultra/**'];
  const status = spawnSync(
    'git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', ...args],
    { cwd: rootDir, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
  );
  const inventory = spawnSync(
    'git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z',
      '--', ...pathspecs, ':(exclude).ultra', ':(exclude).ultra/**'],
    { cwd: rootDir, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
  );
  if (status.status !== 0 || inventory.status !== 0) {
    return {
      head, branch: gitBranch(rootDir), state: 'unavailable', digest: null, files: [],
    };
  }
  const statusText = status.stdout.toString('utf8');
  const files = statusText.split('\0').filter(Boolean);
  const scopedFiles = inventory.stdout.toString('utf8').split('\0').filter(Boolean);
  return {
    head,
    branch: gitBranch(rootDir),
    state: head ? (files.length > 0 ? 'dirty' : 'clean') : 'unborn',
    digest: hashScopedWorkingTree(rootDir, scopedFiles),
    files,
  };
}

function gitWorktreeChanges(rootDir, scope = ['.']) {
  const snapshot = gitWorktreeSnapshot(rootDir, scope);
  return snapshot.state === 'unavailable' ? null : snapshot.files;
}

function parseJson(value, field, fallback) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); }
  catch (error) {
    throw new BaselineWorkflowError('STATE_CORRUPT', `invalid ${field}: ${error.message}`);
  }
}

function rowToBaseline(row) {
  if (!row) return null;
  const baseline = {
    ...row,
    scope: parseJson(row.scope_json, 'scope_json', []),
    spec_refs: parseJson(row.spec_refs_json, 'spec_refs_json', []),
    evidence: parseJson(row.evidence_json, 'evidence_json', []),
    verification: parseJson(row.verification_json, 'verification_json', []),
    unknowns: parseJson(row.unknowns_json, 'unknowns_json', []),
    gaps: parseJson(row.gaps_json, 'gaps_json', []),
    classification: parseJson(row.classification_json, 'classification_json', {}),
    worktree_files: parseJson(row.worktree_files_json, 'worktree_files_json', []),
    worktree_accepted: Boolean(row.worktree_accepted),
    known_red_accepted: Boolean(row.known_red_accepted),
    provider_refs: parseJson(row.provider_refs_json, 'provider_refs_json', {}),
  };
  for (const key of [
    'scope_json', 'spec_refs_json', 'evidence_json', 'verification_json', 'unknowns_json',
    'gaps_json', 'classification_json', 'worktree_files_json', 'provider_refs_json',
  ]) delete baseline[key];
  return baseline;
}

function hasTable(db, table) {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(table));
}

function readBaseline(db, id) {
  if (!hasTable(db, 'baselines')) return null;
  const row = id
    ? db.prepare('SELECT * FROM baselines WHERE id = ?').get(id)
    : db.prepare(
      "SELECT * FROM baselines WHERE status != 'superseded' ORDER BY updated_at DESC, rowid DESC LIMIT 1",
    ).get();
  return rowToBaseline(row);
}

function nonEmpty(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BaselineWorkflowError('VALIDATION_ERROR', `${field} must be a non-empty string`);
  return text;
}

function normalizeReplacementAuthorization(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BaselineWorkflowError(
      'BASELINE_REPLACEMENT_AUTHORIZATION_REQUIRED',
      'replacing a ready baseline requires approved_by and reason',
    );
  }
  let approvedBy;
  let reason;
  try {
    approvedBy = nonEmpty(value.approved_by, 'replacement_authorization.approved_by');
    reason = nonEmpty(value.reason, 'replacement_authorization.reason');
  } catch {
    throw new BaselineWorkflowError(
      'BASELINE_REPLACEMENT_AUTHORIZATION_REQUIRED',
      'replacing a ready baseline requires approved_by and reason',
    );
  }
  if (reason.length < 3) {
    throw new BaselineWorkflowError(
      'BASELINE_REPLACEMENT_AUTHORIZATION_REQUIRED',
      'replacement_authorization.reason must explain the owner-approved replacement',
    );
  }
  return { approved_by: approvedBy, reason };
}

function safeRelativePath(rootDir, candidate, field = 'path') {
  const value = nonEmpty(candidate, field);
  if (path.isAbsolute(value)) {
    throw new BaselineWorkflowError('VALIDATION_ERROR', `${field} must be project-relative: ${value}`);
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, value);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new BaselineWorkflowError('VALIDATION_ERROR', `${field} escapes project root: ${value}`);
  }
  return resolved;
}

function normalizeScope(value, rootDir) {
  const scope = value === undefined ? ['.'] : value;
  if (!Array.isArray(scope) || scope.length === 0) {
    throw new BaselineWorkflowError('VALIDATION_ERROR', 'scope must be a non-empty array');
  }
  return [...new Set(scope.map((item, index) => {
    const resolved = safeRelativePath(rootDir, item, `scope[${index}]`);
    if (!fs.existsSync(resolved)) {
      throw new BaselineWorkflowError(
        'BASELINE_SCOPE_MISSING', `baseline scope does not exist: ${String(item).trim()}`,
      );
    }
    return String(item).trim();
  }))];
}

function storedScopeBlockers(baseline, rootDir) {
  const blockers = [];
  for (const item of baseline.scope) {
    let target;
    try { target = safeRelativePath(rootDir, item, 'scope path'); }
    catch { blockers.push(`BASELINE_SCOPE_INVALID:${item}`); continue; }
    if (!fs.existsSync(target)) blockers.push(`BASELINE_SCOPE_MISSING:${item}`);
  }
  return blockers;
}

function digestFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function workspaceRevision({ scope, specs, evidence }, rootDir) {
  const evidenceRefs = evidence.map((item) => {
    try {
      const file = safeRelativePath(rootDir, item.ref, 'evidence ref');
      return fs.existsSync(file) && fs.statSync(file).isFile()
        ? { kind: item.kind, ref: item.ref, digest: digestFile(file) }
        : { kind: item.kind, ref: item.ref };
    } catch {
      return { kind: item.kind, ref: item.ref };
    }
  });
  const payload = JSON.stringify({ scope, specs, evidence: evidenceRefs });
  return `workspace:${crypto.createHash('sha256').update(payload).digest('hex')}`;
}

function normalizeSpecRefs(value, rootDir) {
  if (!Array.isArray(value)) throw new BaselineWorkflowError('VALIDATION_ERROR', 'spec_refs must be an array');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !SPEC_KINDS.has(item.kind)) {
      throw new BaselineWorkflowError('VALIDATION_ERROR', `invalid spec_refs[${index}]`);
    }
    const specPath = nonEmpty(item.path, `spec_refs[${index}].path`);
    const file = safeRelativePath(rootDir, specPath, `spec_refs[${index}].path`);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new BaselineWorkflowError('BASELINE_SPEC_MISSING', `baseline specification missing: ${specPath}`);
    }
    return { kind: item.kind, path: specPath, digest: digestFile(file) };
  });
}

function normalizeEvidence(value, rootDir) {
  if (!Array.isArray(value)) throw new BaselineWorkflowError('VALIDATION_ERROR', 'evidence must be an array');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !EVIDENCE_KINDS.has(item.kind)) {
      throw new BaselineWorkflowError('VALIDATION_ERROR', `invalid evidence[${index}]`);
    }
    const normalized = {
      kind: item.kind,
      ref: nonEmpty(item.ref, `evidence[${index}].ref`),
      summary: nonEmpty(item.summary, `evidence[${index}].summary`),
    };
    if (item.kind === 'source') {
      const file = safeRelativePath(rootDir, normalized.ref, `evidence[${index}].ref`);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        throw new BaselineWorkflowError(
          'BASELINE_EVIDENCE_MISSING', `baseline source evidence missing: ${normalized.ref}`,
        );
      }
      normalized.digest = digestFile(file);
    }
    return normalized;
  });
}

function normalizeVerification(value) {
  if (!Array.isArray(value)) throw new BaselineWorkflowError('VALIDATION_ERROR', 'verification must be an array');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !VERIFICATION_STATUSES.has(item.status)) {
      throw new BaselineWorkflowError('VALIDATION_ERROR', `invalid verification[${index}]`);
    }
    const normalized = {
      name: nonEmpty(item.name, `verification[${index}].name`),
      command: nonEmpty(item.command, `verification[${index}].command`),
      status: item.status,
      evidence: nonEmpty(item.evidence, `verification[${index}].evidence`),
    };
    if (item.rationale !== undefined) normalized.rationale = nonEmpty(item.rationale, `verification[${index}].rationale`);
    return normalized;
  });
}

function normalizeUnknowns(value) {
  if (!Array.isArray(value)) throw new BaselineWorkflowError('VALIDATION_ERROR', 'unknowns must be an array');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BaselineWorkflowError('VALIDATION_ERROR', `invalid unknowns[${index}]`);
    }
    const normalized = {
      summary: nonEmpty(item.summary, `unknowns[${index}].summary`),
      blocking: item.blocking === true,
    };
    if (item.owner !== undefined) normalized.owner = nonEmpty(item.owner, `unknowns[${index}].owner`);
    return normalized;
  });
}

function normalizeGaps(value) {
  if (!Array.isArray(value)) throw new BaselineWorkflowError('VALIDATION_ERROR', 'gaps must be an array');
  const ids = new Set();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BaselineWorkflowError('VALIDATION_ERROR', `invalid gaps[${index}]`);
    }
    const id = nonEmpty(item.id, `gaps[${index}].id`);
    if (!BASELINE_ID.test(id) || ids.has(id)) {
      throw new BaselineWorkflowError('VALIDATION_ERROR', `invalid or duplicate gap id: ${id}`);
    }
    ids.add(id);
    if (!GAP_CATEGORIES.has(item.category)) {
      throw new BaselineWorkflowError('VALIDATION_ERROR', `invalid gap category: ${item.category}`);
    }
    const status = item.status || 'open';
    if (!GAP_STATUSES.has(status)) {
      throw new BaselineWorkflowError('VALIDATION_ERROR', `invalid gap status: ${status}`);
    }
    const evidenceRefs = item.evidence_refs === undefined ? [] : item.evidence_refs;
    if (!Array.isArray(evidenceRefs) || evidenceRefs.some((ref) => typeof ref !== 'string' || !ref.trim())) {
      throw new BaselineWorkflowError('VALIDATION_ERROR', `gaps[${index}].evidence_refs must be strings`);
    }
    const normalized = {
      id,
      category: item.category,
      status,
      blocking: item.category === 'baseline_blocker' ? true : item.blocking === true,
      summary: nonEmpty(item.summary, `gaps[${index}].summary`),
      evidence_refs: [...new Set(evidenceRefs.map((ref) => ref.trim()))],
      owner: item.owner == null ? null : nonEmpty(item.owner, `gaps[${index}].owner`),
    };
    if (item.resolution != null) {
      normalized.resolution = nonEmpty(item.resolution, `gaps[${index}].resolution`);
    }
    return normalized;
  });
}

function normalizeClassification(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BaselineWorkflowError('VALIDATION_ERROR', 'classification must be an object');
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 32 * 1024) {
    throw new BaselineWorkflowError('VALIDATION_ERROR', 'classification exceeds 32 KiB');
  }
  return JSON.parse(serialized);
}

function summarizeGaps(gaps = []) {
  const summary = { total: gaps.length, open: 0, blocking: 0, by_category: {} };
  for (const gap of gaps) {
    summary.by_category[gap.category] = (summary.by_category[gap.category] || 0) + 1;
    if (gap.status === 'open') summary.open += 1;
    if (gap.status === 'open' && gap.blocking) summary.blocking += 1;
  }
  return summary;
}

function startBaseline(db, input = {}, { rootDir = process.cwd(), emitEvent = true } = {}) {
  const id = input.id || 'project-baseline';
  if (!BASELINE_ID.test(id)) throw new BaselineWorkflowError('VALIDATION_ERROR', 'baseline id is invalid');
  const projectName = nonEmpty(input.project_name, 'project_name');
  if (!MODES.has(input.mode)) throw new BaselineWorkflowError('VALIDATION_ERROR', `invalid baseline mode: ${input.mode}`);
  if (readBaseline(db, id)) throw new BaselineWorkflowError('DUPLICATE_BASELINE_ID', `baseline ${id} exists`);
  const current = readBaseline(db);
  if (input.replace_migrated === true
    && (!current || current.mode !== 'migrated' || input.mode !== 'brownfield')) {
    throw new BaselineWorkflowError(
      'BASELINE_REPLACEMENT_INVALID',
      'replace_migrated requires a current migrated baseline and brownfield mode',
    );
  }
  const replacingMigrated = Boolean(
    current && current.mode === 'migrated' && current.status !== 'superseded'
      && input.replace_migrated === true,
  );
  let replacementAuthorization = null;
  if (input.replace_ready === true) {
    if (!current || current.status !== 'ready' || replacingMigrated) {
      throw new BaselineWorkflowError(
        'BASELINE_REPLACEMENT_INVALID',
        'replace_ready requires a current ready baseline',
      );
    }
    replacementAuthorization = normalizeReplacementAuthorization(input.replacement_authorization);
  } else if (input.replacement_authorization !== undefined) {
    throw new BaselineWorkflowError(
      'BASELINE_REPLACEMENT_INVALID',
      'replacement_authorization is valid only with replace_ready=true',
    );
  }
  if (current && current.status !== 'superseded') {
    if (replacingMigrated) {
      // Compatibility state is never an accepted product baseline. Explicit
      // replacement preserves its audit row while starting real adoption.
    } else if (current.status === 'ready' && input.replace_ready !== true) {
      throw new BaselineWorkflowError('BASELINE_EXISTS', `ready baseline ${current.id} requires replace_ready=true`);
    } else if (current.status !== 'ready') {
      throw new BaselineWorkflowError('BASELINE_IN_PROGRESS', `baseline ${current.id} is ${current.status}`);
    }
  }
  const scope = normalizeScope(input.scope, rootDir);
  const providers = providerRefs.normalizeProviderRefs(input.provider_refs, BaselineWorkflowError);
  const classification = normalizeClassification(input.classification);
  const snapshot = gitWorktreeSnapshot(rootDir, scope);
  if (snapshot.head && input.repository_revision && input.repository_revision !== snapshot.head) {
    throw new BaselineWorkflowError(
      'BASELINE_REVISION_MISMATCH', 'repository_revision does not match current Git HEAD',
    );
  }
  const status = input.mode === 'brownfield' ? 'adopting' : 'draft';
  const ts = nowIso();
  return ops.tx(db, () => {
    if (current && (current.status === 'ready' || replacingMigrated)) {
      db.prepare("UPDATE baselines SET status = 'superseded', updated_at = ? WHERE id = ?")
        .run(ts, current.id);
    }
    db.prepare(
      `INSERT INTO baselines
       (id, project_name, project_type, stack, mode, status, repository_root, scope_json,
        repository_revision, repository_branch, worktree_state, worktree_digest,
        worktree_files_json, classification_json, provider_refs_json, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '.', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, projectName, input.project_type || null, input.stack || null, input.mode, status,
      JSON.stringify(scope), snapshot.head || input.repository_revision || null, snapshot.branch,
      snapshot.state, snapshot.digest, JSON.stringify(snapshot.files), JSON.stringify(classification),
      JSON.stringify(providers), ts, ts,
    );
    if (emitEvent) {
      const payload = {
        baseline_id: id,
        mode: input.mode,
        replaced_baseline_id: current?.id || null,
      };
      if (replacementAuthorization) {
        payload.replacement_authorization = { ...replacementAuthorization, recorded_at: ts };
      }
      ops.appendEventInTx(db, {
        type: 'baseline_started',
        payload,
      });
    }
    return readBaseline(db, id);
  });
}

function refreshInProgressBaseline(db, input = {}, {
  rootDir = process.cwd(), emitEvent = true,
} = {}) {
  const current = readBaseline(db, input.id);
  if (!current) {
    throw new BaselineWorkflowError('BASELINE_NOT_FOUND', `baseline ${input.id || '(current)'} not found`);
  }
  if (!['draft', 'adopting', 'blocked'].includes(current.status)) return current;
  const projectName = input.project_name === undefined
    ? current.project_name
    : nonEmpty(input.project_name, 'project_name');
  const projectType = input.project_type === undefined ? current.project_type : input.project_type;
  const stack = input.stack === undefined ? current.stack : input.stack;
  const classification = input.classification === undefined
    ? current.classification
    : normalizeClassification(input.classification);
  const snapshot = gitWorktreeSnapshot(rootDir, current.scope);
  const repositoryRevision = snapshot.head
    || (snapshot.state === 'unborn' ? null : current.repository_revision);
  const ts = nowIso();
  return ops.tx(db, () => {
    db.prepare(
      `UPDATE baselines SET project_name = ?, project_type = ?, stack = ?,
       repository_revision = ?, repository_branch = ?, worktree_state = ?,
       worktree_digest = ?, worktree_files_json = ?, classification_json = ?,
       updated_at = ? WHERE id = ?`,
    ).run(
      projectName, projectType || null, stack || null,
      repositoryRevision, snapshot.branch, snapshot.state, snapshot.digest,
      JSON.stringify(snapshot.files), JSON.stringify(classification), ts, current.id,
    );
    if (emitEvent) {
      ops.appendEventInTx(db, {
        type: 'baseline_metadata_refreshed',
        payload: {
          baseline_id: current.id,
          project_name: projectName,
          project_type: projectType || null,
          stack: stack || null,
          repository_revision: repositoryRevision,
          repository_branch: snapshot.branch,
          worktree_state: snapshot.state,
        },
      });
    }
    return readBaseline(db, current.id);
  });
}

function recordBaseline(db, input = {}, { rootDir = process.cwd(), emitEvent = true } = {}) {
  const current = readBaseline(db, input.id);
  if (!current) throw new BaselineWorkflowError('BASELINE_NOT_FOUND', `baseline ${input.id} not found`);
  if (['ready', 'superseded'].includes(current.status)) {
    throw new BaselineWorkflowError('BASELINE_NOT_MUTABLE', `baseline ${current.id} is ${current.status}`);
  }
  const scope = normalizeScope(input.scope === undefined ? current.scope : input.scope, rootDir);
  const specs = input.spec_refs === undefined ? current.spec_refs : normalizeSpecRefs(input.spec_refs, rootDir);
  const evidence = input.evidence === undefined
    ? current.evidence : normalizeEvidence(input.evidence, rootDir);
  const verification = input.verification === undefined
    ? current.verification : normalizeVerification(input.verification);
  const unknowns = input.unknowns === undefined ? current.unknowns : normalizeUnknowns(input.unknowns);
  const gaps = input.gaps === undefined ? current.gaps : normalizeGaps(input.gaps);
  const classification = input.classification === undefined
    ? current.classification : normalizeClassification(input.classification);
  const providers = input.provider_refs === undefined
    ? current.provider_refs
    : providerRefs.normalizeProviderRefs(input.provider_refs, BaselineWorkflowError);
  const snapshot = gitWorktreeSnapshot(rootDir, scope);
  if (snapshot.state === 'unborn') {
    throw new BaselineWorkflowError(
      'BASELINE_GIT_HEAD_REQUIRED',
      'Git is initialized but has no commit; create an owner-authorized local checkpoint commit before recording the baseline',
    );
  }
  if (snapshot.head && input.repository_revision && input.repository_revision !== snapshot.head) {
    throw new BaselineWorkflowError(
      'BASELINE_REVISION_MISMATCH', 'repository_revision does not match current Git HEAD',
    );
  }
  const revision = snapshot.head || (input.repository_revision === undefined
    ? (current.repository_revision || workspaceRevision({ scope, specs, evidence }, rootDir))
    : nonEmpty(input.repository_revision, 'repository_revision'));
  const status = current.mode === 'brownfield' ? 'adopting' : 'draft';
  const ts = nowIso();
  return ops.tx(db, () => {
    db.prepare(
      `UPDATE baselines SET status = ?, scope_json = ?, repository_revision = ?,
       repository_branch = ?, worktree_state = ?, worktree_digest = ?, worktree_files_json = ?,
       worktree_accepted = 0, known_red_accepted = 0,
       spec_refs_json = ?, evidence_json = ?, verification_json = ?,
       unknowns_json = ?, gaps_json = ?, classification_json = ?, provider_refs_json = ?,
       approved_by = NULL, approval_note = NULL, converged_at = NULL, updated_at = ? WHERE id = ?`,
    ).run(
      status, JSON.stringify(scope), revision, snapshot.branch, snapshot.state, snapshot.digest,
      JSON.stringify(snapshot.files), JSON.stringify(specs), JSON.stringify(evidence),
      JSON.stringify(verification), JSON.stringify(unknowns), JSON.stringify(gaps),
      JSON.stringify(classification), JSON.stringify(providers), ts, current.id,
    );
    if (emitEvent) {
      ops.appendEventInTx(db, {
        type: 'baseline_recorded',
        payload: {
          baseline_id: current.id, spec_count: specs.length,
          gap_count: gaps.length, worktree_state: snapshot.state,
        },
      });
    }
    return readBaseline(db, current.id);
  });
}

function storedSpecBlockers(baseline, rootDir) {
  const blockers = [];
  for (const spec of baseline.spec_refs) {
    let file;
    try { file = safeRelativePath(rootDir, spec.path, 'spec path'); }
    catch { blockers.push(`BASELINE_SPEC_INVALID:${spec.path}`); continue; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      blockers.push(`BASELINE_SPEC_MISSING:${spec.path}`);
    } else if (!spec.digest || digestFile(file) !== spec.digest) {
      blockers.push(`BASELINE_SPEC_STALE:${spec.path}`);
    }
  }
  return blockers;
}

function storedEvidenceBlockers(baseline, rootDir) {
  const blockers = [];
  for (const item of baseline.evidence) {
    if (item.kind !== 'source' && !item.digest) continue;
    let file;
    try { file = safeRelativePath(rootDir, item.ref, 'evidence ref'); }
    catch { blockers.push(`BASELINE_EVIDENCE_INVALID:${item.ref}`); continue; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      blockers.push(`BASELINE_EVIDENCE_MISSING:${item.ref}`);
    } else if (!item.digest) {
      blockers.push(`BASELINE_EVIDENCE_UNVERIFIED:${item.ref}`);
    } else if (digestFile(file) !== item.digest) {
      blockers.push(`BASELINE_EVIDENCE_STALE:${item.ref}`);
    }
  }
  return blockers;
}

function storedReadyInvariantBlockers(baseline) {
  const blockers = [];
  const arrays = ['scope', 'spec_refs', 'evidence', 'verification', 'unknowns', 'gaps'];
  for (const field of arrays) {
    if (!Array.isArray(baseline[field])) blockers.push(`BASELINE_STATE_INVALID:${field}`);
  }
  if (!Array.isArray(baseline.scope) || baseline.scope.length === 0) {
    blockers.push('BASELINE_SCOPE_MISSING');
  }
  if (Array.isArray(baseline.verification)) {
    for (const item of baseline.verification) {
      if (!item || typeof item !== 'object') {
        blockers.push('BASELINE_STATE_INVALID:verification');
      } else if (item.status === 'known_red') {
        if (!String(item.rationale || '').trim()) {
          blockers.push(`BASELINE_KNOWN_RED_RATIONALE_MISSING:${item.name || 'unknown'}`);
        }
        if (!baseline.known_red_accepted) {
          blockers.push(`BASELINE_KNOWN_RED_NOT_ACCEPTED:${item.name || 'unknown'}`);
        }
      } else if (!['pass', 'not_run'].includes(item.status)) {
        blockers.push(`BASELINE_VERIFICATION_STATUS_INVALID:${item.name || 'unknown'}`);
      }
    }
  }
  if (!String(baseline.repository_revision || '').trim()) {
    blockers.push('BASELINE_REVISION_MISSING');
  }
  if (!String(baseline.approved_by || '').trim()) blockers.push('BASELINE_APPROVER_MISSING');
  if (!String(baseline.approval_note || '').trim()) {
    blockers.push('BASELINE_APPROVAL_NOTE_MISSING');
  }
  if (!baseline.converged_at || Number.isNaN(Date.parse(baseline.converged_at))) {
    blockers.push('BASELINE_CONVERGENCE_TIMESTAMP_MISSING');
  }
  return [...new Set(blockers)];
}

function storedReadySemanticWarnings(baseline) {
  const warnings = [];
  if (Array.isArray(baseline.spec_refs)) {
    for (const kind of ['discovery', 'product', 'architecture']) {
      if (!baseline.spec_refs.some((item) => item?.kind === kind)) {
        warnings.push(`BASELINE_SPEC_MISSING:${kind}`);
      }
    }
  }
  if (Array.isArray(baseline.evidence) && baseline.evidence.length === 0) {
    warnings.push('BASELINE_EVIDENCE_MISSING');
  }
  if (baseline.mode === 'brownfield'
    && Array.isArray(baseline.evidence)
    && !baseline.evidence.some((item) => item?.kind === 'source')) {
    warnings.push('BASELINE_SOURCE_EVIDENCE_MISSING');
  }
  if (Array.isArray(baseline.verification) && baseline.verification.length === 0) {
    warnings.push('BASELINE_VERIFICATION_MISSING');
  } else if (Array.isArray(baseline.verification)) {
    for (const item of baseline.verification) {
      if (item?.status === 'not_run') {
        warnings.push(`BASELINE_VERIFICATION_NOT_RUN:${item.name || 'unknown'}`);
      }
    }
  }
  if (Array.isArray(baseline.unknowns)) {
    for (const item of baseline.unknowns.filter((unknown) => unknown?.blocking === true)) {
      warnings.push(`BASELINE_UNKNOWN_RECORDED:${item.summary || 'unknown'}`);
    }
  }
  if (Array.isArray(baseline.gaps)) {
    for (const gap of baseline.gaps.filter((item) => (
      item?.status === 'open' && item?.blocking === true
    ))) {
      warnings.push(`BASELINE_GAP_RECORDED:${gap.id || 'unknown'}`);
    }
  }
  return [...new Set(warnings)];
}

function acceptedBaselineResearch(db, baseline) {
  return checkpoints.currentCheckpoint(
    db,
    'research',
    { baseline_id: baseline.id },
    { includeDraft: false },
  );
}

function convergenceResearchBlockers(db, baseline) {
  const checkpoint = acceptedBaselineResearch(db, baseline);
  if (!checkpoint) return ['BASELINE_RESEARCH_INCOMPLETE'];
  return [];
}

function storedResearchHealth(db, baseline) {
  const checkpointId = baseline.research_checkpoint_id || baseline.research_run_id;
  if (!checkpointId) {
    return { blockers: [], warnings: ['BASELINE_RESEARCH_PROVENANCE_MISSING'] };
  }
  let checkpoint;
  try {
    checkpoint = checkpoints.readCheckpoint(db, checkpointId);
  } catch (error) {
    if (error?.code === 'CHECKPOINT_DIGEST_MISMATCH') {
      return { blockers: ['BASELINE_RESEARCH_RECORD_INVALID'], warnings: [] };
    }
    throw error;
  }
  if (!checkpoint
      || checkpoint.stage !== 'research'
      || checkpoint.scope_type !== 'baseline'
      || checkpoint.scope_id !== baseline.id
      || checkpoints.checkpointDigest(checkpoint) !== checkpoint.digest) {
    return { blockers: ['BASELINE_RESEARCH_RECORD_INVALID'], warnings: [] };
  }
  if (checkpoint.status !== 'accepted') {
    return {
      blockers: [],
      warnings: [
        checkpoint.status === 'superseded'
          ? 'BASELINE_RESEARCH_SUPERSEDED'
          : `BASELINE_RESEARCH_NOT_ACCEPTED:${checkpoint.status}`,
      ],
    };
  }
  return { blockers: [], warnings: checkpoint.diagnostics || [] };
}

function convergenceBlockers(db, baseline, input, rootDir) {
  const blockers = new Set();
  const expected = typeof input.expected_revision === 'string' ? input.expected_revision.trim() : '';
  if (!expected) blockers.add('BASELINE_REVISION_REQUIRED');
  else if (baseline.repository_revision !== expected) blockers.add('BASELINE_REVISION_MISMATCH');
  const snapshot = gitWorktreeSnapshot(rootDir, baseline.scope);
  if (snapshot.state === 'unborn') blockers.add('BASELINE_GIT_HEAD_REQUIRED');
  if (snapshot.head && expected && snapshot.head !== expected
      && (!gitCommitIsAncestor(rootDir, expected, snapshot.head)
        || (baseline.worktree_digest && snapshot.digest
          && baseline.worktree_digest !== snapshot.digest))) {
    blockers.add('BASELINE_HEAD_STALE');
  }
  if (baseline.repository_branch && snapshot.branch
    && baseline.repository_branch !== snapshot.branch) blockers.add('BASELINE_BRANCH_STALE');
  if (!Array.isArray(baseline.scope) || baseline.scope.length === 0) blockers.add('BASELINE_SCOPE_MISSING');
  for (const blocker of storedSpecBlockers(baseline, rootDir)) blockers.add(blocker);
  for (const blocker of storedEvidenceBlockers(baseline, rootDir)) blockers.add(blocker);
  for (const blocker of storedScopeBlockers(baseline, rootDir)) blockers.add(blocker);
  if (baseline.worktree_digest && snapshot.digest && baseline.worktree_digest !== snapshot.digest) {
    blockers.add('BASELINE_WORKTREE_STALE');
    if (snapshot.state === 'dirty') blockers.add('BASELINE_WORKTREE_DIRTY');
  }
  if (baseline.worktree_state === 'dirty' && input.accept_dirty_worktree !== true) {
    blockers.add('BASELINE_DIRTY_WORKTREE_NOT_ACCEPTED');
  }
  for (const item of baseline.verification) {
    if (item.status === 'known_red') {
      if (input.accept_known_red !== true) blockers.add(`BASELINE_KNOWN_RED_NOT_ACCEPTED:${item.name}`);
      if (!item.rationale) blockers.add(`BASELINE_KNOWN_RED_RATIONALE_MISSING:${item.name}`);
    }
  }
  if (!String(input.approved_by || '').trim()) blockers.add('BASELINE_APPROVER_REQUIRED');
  if (!String(input.approval_note || '').trim()) blockers.add('BASELINE_APPROVAL_NOTE_REQUIRED');
  return [...blockers].sort();
}

function convergenceWarnings(db, baseline) {
  const warnings = new Set(storedReadySemanticWarnings(baseline));
  for (const warning of convergenceResearchBlockers(db, baseline)) warnings.add(warning);
  return [...warnings].sort();
}

function convergeBaseline(db, input = {}, { rootDir = process.cwd(), emitEvent = true } = {}) {
  const current = readBaseline(db, input.id);
  if (!current) throw new BaselineWorkflowError('BASELINE_NOT_FOUND', `baseline ${input.id} not found`);
  if (!['draft', 'adopting', 'blocked'].includes(current.status)) {
    throw new BaselineWorkflowError('BASELINE_NOT_CONVERGEABLE', `baseline ${current.id} is ${current.status}`);
  }
  const blockers = convergenceBlockers(db, current, input, rootDir);
  const warnings = convergenceWarnings(db, current);
  const ts = nowIso();
  if (blockers.length > 0) {
    ops.tx(db, () => {
      db.prepare("UPDATE baselines SET status = 'blocked', updated_at = ? WHERE id = ?")
        .run(ts, current.id);
      if (emitEvent) {
        ops.appendEventInTx(db, {
          type: 'baseline_blocked', payload: { baseline_id: current.id, blockers },
        });
      }
    });
    return {
      ready: false,
      status: 'blocked',
      blockers,
      warnings,
      baseline: readBaseline(db, current.id),
    };
  }
  const research = acceptedBaselineResearch(db, current);
  ops.tx(db, () => {
    db.prepare(
      `UPDATE baselines SET status = 'ready', approved_by = ?, approval_note = ?,
       worktree_accepted = ?, known_red_accepted = ?, research_checkpoint_id = ?,
       research_run_id = NULL,
       converged_at = ?, updated_at = ? WHERE id = ?`,
    ).run(
      String(input.approved_by).trim(), String(input.approval_note).trim(),
      input.accept_dirty_worktree === true ? 1 : 0,
      input.accept_known_red === true ? 1 : 0, research?.id || null, ts, ts, current.id,
    );
    if (emitEvent) {
      ops.appendEventInTx(db, {
        type: 'baseline_converged', payload: { baseline_id: current.id, revision: current.repository_revision },
      });
    }
  });
  return {
    ready: true,
    status: 'ready',
    blockers: [],
    warnings,
    baseline: readBaseline(db, current.id),
  };
}

function inspectBaseline(db, { rootDir = process.cwd(), id } = {}) {
  if (!hasTable(db, 'baselines')) {
    return {
      status: 'fail', blockers: ['BASELINE_SCHEMA_MIGRATION_REQUIRED'], warnings: [], baseline: null,
    };
  }
  const baseline = readBaseline(db, id);
  if (!baseline) {
    return { status: 'fail', blockers: ['BASELINE_MISSING'], warnings: [], baseline: null };
  }
  if (baseline.mode === 'migrated') {
    return {
      status: 'fail', blockers: ['BASELINE_MIGRATION_REVIEW_REQUIRED'], warnings: [], baseline,
    };
  }
  if (baseline.status !== 'ready') {
    return {
      status: 'fail', blockers: [`BASELINE_NOT_READY:${baseline.status}`], warnings: [], baseline,
    };
  }
  const research = storedResearchHealth(db, baseline);
  const blockers = [
    ...storedReadyInvariantBlockers(baseline),
    ...(Array.isArray(baseline.scope) ? storedScopeBlockers(baseline, rootDir) : []),
    ...(Array.isArray(baseline.spec_refs) ? storedSpecBlockers(baseline, rootDir) : []),
    ...(Array.isArray(baseline.evidence) ? storedEvidenceBlockers(baseline, rootDir) : []),
    ...research.blockers,
  ];
  const warnings = [
    ...storedReadySemanticWarnings(baseline),
    ...research.warnings,
  ];
  const snapshot = gitWorktreeSnapshot(
    rootDir, Array.isArray(baseline.scope) && baseline.scope.length > 0 ? baseline.scope : ['.'],
  );
  if (snapshot.state === 'unborn') {
    blockers.push('BASELINE_GIT_HEAD_REQUIRED');
  }
  if (snapshot.head && baseline.repository_revision && snapshot.head !== baseline.repository_revision) {
    if (!gitCommitIsAncestor(rootDir, baseline.repository_revision, snapshot.head)
        || (baseline.worktree_digest && snapshot.digest
          && baseline.worktree_digest !== snapshot.digest)) {
      blockers.push('BASELINE_HEAD_STALE');
    }
  } else if (!snapshot.head && baseline.repository_revision?.startsWith('workspace:')) {
    const revision = workspaceRevision({
      scope: baseline.scope, specs: baseline.spec_refs, evidence: baseline.evidence,
    }, rootDir);
    if (revision !== baseline.repository_revision) blockers.push('BASELINE_WORKSPACE_STALE');
  }
  if (baseline.repository_branch && snapshot.branch
    && baseline.repository_branch !== snapshot.branch) blockers.push('BASELINE_BRANCH_STALE');
  if (baseline.worktree_digest && snapshot.digest && baseline.worktree_digest !== snapshot.digest) {
    blockers.push('BASELINE_WORKTREE_STALE');
    if (snapshot.state === 'dirty') blockers.push('BASELINE_WORKTREE_DIRTY');
  }
  if (baseline.worktree_state === 'dirty' && !baseline.worktree_accepted) {
    blockers.push('BASELINE_DIRTY_WORKTREE_NOT_ACCEPTED');
  }
  return {
    status: blockers.length === 0 ? 'pass' : 'fail', blockers: [...new Set(blockers)].sort(),
    warnings: [...new Set(warnings)], baseline,
  };
}

function inferSpecKind(file) {
  const name = path.basename(file, path.extname(file)).toLowerCase();
  return SPEC_KINDS.has(name) ? name : 'other';
}

function reconcileBaseline(db, {
  baseline_updates = [], change_id = null, reconciliation = null,
  accept_delivery_worktree = false,
} = {}, {
  rootDir = process.cwd(), emitEvent = true,
} = {}) {
  const current = readBaseline(db);
  if (!current || current.status !== 'ready') {
    throw new BaselineWorkflowError('BASELINE_NOT_READY', 'a ready baseline is required for reconciliation');
  }
  if (current.mode === 'migrated' && current.spec_refs.length === 0) return current;
  const refs = new Map(current.spec_refs.map((ref) => [ref.path, ref]));
  const evidence = current.evidence.map((item) => ({ ...item }));
  for (const update of baseline_updates) {
    const file = safeRelativePath(rootDir, update, 'baseline update');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new BaselineWorkflowError('BASELINE_FILE_MISSING', `baseline update missing: ${update}`);
    }
    const digest = digestFile(file);
    const existingRef = refs.get(update);
    if (existingRef) refs.set(update, { ...existingRef, digest });
    let evidenceMatched = false;
    for (const item of evidence) {
      if (item.ref !== update || (item.kind !== 'source' && !item.digest)) continue;
      item.digest = digest;
      evidenceMatched = true;
    }
    if (!existingRef && !evidenceMatched) {
      refs.set(update, { kind: inferSpecKind(update), path: update, digest });
    }
  }
  const specs = [...refs.values()];
  const resolvedGapIds = new Set(reconciliation?.resolved_gap_ids || []);
  const resolvedUnknowns = new Set(reconciliation?.resolved_unknowns || []);
  const gaps = current.gaps.map((gap) => (
    resolvedGapIds.has(gap.id) ? { ...gap, status: 'resolved' } : gap
  ));
  const unknowns = current.unknowns.filter((unknown) => !resolvedUnknowns.has(unknown.summary));
  const snapshot = gitWorktreeSnapshot(rootDir, current.scope);
  const revision = snapshot.head || workspaceRevision({
    scope: current.scope, specs, evidence,
  }, rootDir);
  const ts = nowIso();
  ops.tx(db, () => {
    db.prepare(
      `UPDATE baselines SET repository_revision = ?, repository_branch = ?, worktree_state = ?,
       worktree_digest = ?, worktree_files_json = ?, worktree_accepted = ?,
       spec_refs_json = ?, evidence_json = ?, gaps_json = ?, unknowns_json = ?,
       updated_at = ? WHERE id = ?`,
    ).run(
      revision, snapshot.branch, snapshot.state, snapshot.digest, JSON.stringify(snapshot.files),
      accept_delivery_worktree && snapshot.state === 'dirty' ? 1 : 0,
      JSON.stringify(specs), JSON.stringify(evidence), JSON.stringify(gaps),
      JSON.stringify(unknowns), ts, current.id,
    );
    if (emitEvent) {
      ops.appendEventInTx(db, {
        type: 'baseline_reconciled',
        change_id,
        payload: {
          baseline_id: current.id, baseline_updates, repository_revision: revision,
          semantic_change_ids: (reconciliation?.semantic_changes || []).map((item) => item.id),
          resolved_gap_ids: [...resolvedGapIds], resolved_unknowns: [...resolvedUnknowns],
        },
      });
    }
  });
  return readBaseline(db, current.id);
}

function appendGapInTx(db, input = {}, { emitEvent = true } = {}) {
  const current = readBaseline(db, input.baseline_id);
  if (!current) throw new BaselineWorkflowError('BASELINE_NOT_FOUND', 'current baseline not found');
  const next = normalizeGaps([...current.gaps.filter((gap) => gap.id !== input.gap?.id), input.gap]);
  const ts = nowIso();
  db.prepare('UPDATE baselines SET gaps_json = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(next), ts, current.id);
  if (emitEvent) {
    ops.appendEventInTx(db, {
      type: 'baseline_gap_recorded',
      payload: { baseline_id: current.id, gap_id: input.gap.id, category: input.gap.category },
    });
  }
  return readBaseline(db, current.id);
}

function appendGap(db, input = {}, options = {}) {
  return ops.tx(db, () => appendGapInTx(db, input, options));
}

module.exports = {
  BaselineWorkflowError,
  startBaseline,
  refreshInProgressBaseline,
  recordBaseline,
  convergeBaseline,
  readBaseline,
  inspectBaseline,
  reconcileBaseline,
  gitHead,
  gitBranch,
  gitWorktreeSnapshot,
  gitWorktreeChanges,
  appendGap,
  appendGapInTx,
  summarizeGaps,
  normalizeGaps,
};
