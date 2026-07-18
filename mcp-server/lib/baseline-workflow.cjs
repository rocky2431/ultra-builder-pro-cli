'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ops = require('./state-ops.cjs');
const providerRefs = require('./provider-refs.cjs');

const BASELINE_ID = /^[a-zA-Z0-9_-]+$/;
const MODES = new Set(['greenfield', 'brownfield']);
const SPEC_KINDS = new Set(['discovery', 'product', 'architecture', 'quality', 'delivery', 'other']);
const EVIDENCE_KINDS = new Set(['source', 'docs', 'runtime', 'test', 'deploy', 'external']);
const VERIFICATION_STATUSES = new Set(['pass', 'known_red', 'not_run']);

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
    provider_refs: parseJson(row.provider_refs_json, 'provider_refs_json', {}),
  };
  for (const key of [
    'scope_json', 'spec_refs_json', 'evidence_json', 'verification_json', 'unknowns_json',
    'provider_refs_json',
  ]) delete baseline[key];
  return baseline;
}

function readBaseline(db, id) {
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
    safeRelativePath(rootDir, item, `scope[${index}]`);
    return String(item).trim();
  }))];
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

function normalizeEvidence(value) {
  if (!Array.isArray(value)) throw new BaselineWorkflowError('VALIDATION_ERROR', 'evidence must be an array');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !EVIDENCE_KINDS.has(item.kind)) {
      throw new BaselineWorkflowError('VALIDATION_ERROR', `invalid evidence[${index}]`);
    }
    return {
      kind: item.kind,
      ref: nonEmpty(item.ref, `evidence[${index}].ref`),
      summary: nonEmpty(item.summary, `evidence[${index}].summary`),
    };
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

function startBaseline(db, input = {}, { rootDir = process.cwd(), emitEvent = true } = {}) {
  const id = input.id || 'project-baseline';
  if (!BASELINE_ID.test(id)) throw new BaselineWorkflowError('VALIDATION_ERROR', 'baseline id is invalid');
  const projectName = nonEmpty(input.project_name, 'project_name');
  if (!MODES.has(input.mode)) throw new BaselineWorkflowError('VALIDATION_ERROR', `invalid baseline mode: ${input.mode}`);
  if (readBaseline(db, id)) throw new BaselineWorkflowError('DUPLICATE_BASELINE_ID', `baseline ${id} exists`);
  const current = readBaseline(db);
  if (current && current.status !== 'superseded') {
    if (current.status === 'ready' && input.replace_ready !== true) {
      throw new BaselineWorkflowError('BASELINE_EXISTS', `ready baseline ${current.id} requires replace_ready=true`);
    }
    if (current.status !== 'ready') {
      throw new BaselineWorkflowError('BASELINE_IN_PROGRESS', `baseline ${current.id} is ${current.status}`);
    }
  }
  const scope = normalizeScope(input.scope, rootDir);
  const providers = providerRefs.normalizeProviderRefs(input.provider_refs, BaselineWorkflowError);
  const status = input.mode === 'brownfield' ? 'adopting' : 'draft';
  const ts = nowIso();
  return ops.tx(db, () => {
    if (current?.status === 'ready') {
      db.prepare("UPDATE baselines SET status = 'superseded', updated_at = ? WHERE id = ?")
        .run(ts, current.id);
    }
    db.prepare(
      `INSERT INTO baselines
       (id, project_name, project_type, stack, mode, status, repository_root, scope_json,
        repository_revision, provider_refs_json, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '.', ?, ?, ?, ?, ?)`,
    ).run(
      id, projectName, input.project_type || null, input.stack || null, input.mode, status,
      JSON.stringify(scope), input.repository_revision || gitHead(rootDir), JSON.stringify(providers), ts, ts,
    );
    if (emitEvent) {
      ops.appendEventInTx(db, {
        type: 'baseline_started',
        payload: { baseline_id: id, mode: input.mode, replaced_baseline_id: current?.id || null },
      });
    }
    return readBaseline(db, id);
  });
}

function recordBaseline(db, input = {}, { rootDir = process.cwd(), emitEvent = true } = {}) {
  const current = readBaseline(db, input.id);
  if (!current) throw new BaselineWorkflowError('BASELINE_NOT_FOUND', `baseline ${input.id} not found`);
  if (['ready', 'superseded'].includes(current.status)) {
    throw new BaselineWorkflowError('BASELINE_NOT_MUTABLE', `baseline ${current.id} is ${current.status}`);
  }
  const scope = input.scope === undefined ? current.scope : normalizeScope(input.scope, rootDir);
  const specs = input.spec_refs === undefined ? current.spec_refs : normalizeSpecRefs(input.spec_refs, rootDir);
  const evidence = input.evidence === undefined ? current.evidence : normalizeEvidence(input.evidence);
  const verification = input.verification === undefined
    ? current.verification : normalizeVerification(input.verification);
  const unknowns = input.unknowns === undefined ? current.unknowns : normalizeUnknowns(input.unknowns);
  const providers = input.provider_refs === undefined
    ? current.provider_refs
    : providerRefs.normalizeProviderRefs(input.provider_refs, BaselineWorkflowError);
  const revision = input.repository_revision === undefined
    ? (current.repository_revision || gitHead(rootDir)
      || workspaceRevision({ scope, specs, evidence }, rootDir))
    : nonEmpty(input.repository_revision, 'repository_revision');
  const status = current.mode === 'brownfield' ? 'adopting' : 'draft';
  const ts = nowIso();
  return ops.tx(db, () => {
    db.prepare(
      `UPDATE baselines SET status = ?, scope_json = ?, repository_revision = ?, spec_refs_json = ?,
       evidence_json = ?, verification_json = ?, unknowns_json = ?, provider_refs_json = ?,
       approved_by = NULL, approval_note = NULL, converged_at = NULL, updated_at = ? WHERE id = ?`,
    ).run(
      status, JSON.stringify(scope), revision, JSON.stringify(specs), JSON.stringify(evidence),
      JSON.stringify(verification), JSON.stringify(unknowns), JSON.stringify(providers), ts, current.id,
    );
    if (emitEvent) {
      ops.appendEventInTx(db, {
        type: 'baseline_recorded', payload: { baseline_id: current.id, spec_count: specs.length },
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

function convergenceBlockers(baseline, input, rootDir) {
  const blockers = new Set();
  const expected = typeof input.expected_revision === 'string' ? input.expected_revision.trim() : '';
  if (!expected) blockers.add('BASELINE_REVISION_REQUIRED');
  else if (baseline.repository_revision !== expected) blockers.add('BASELINE_REVISION_MISMATCH');
  const head = gitHead(rootDir);
  if (head && expected && head !== expected) blockers.add('BASELINE_HEAD_STALE');
  if (!Array.isArray(baseline.scope) || baseline.scope.length === 0) blockers.add('BASELINE_SCOPE_MISSING');
  for (const kind of ['product', 'architecture']) {
    if (!baseline.spec_refs.some((ref) => ref.kind === kind)) blockers.add(`BASELINE_SPEC_MISSING:${kind}`);
  }
  for (const blocker of storedSpecBlockers(baseline, rootDir)) blockers.add(blocker);
  if (baseline.evidence.length === 0) blockers.add('BASELINE_EVIDENCE_MISSING');
  if (baseline.mode === 'brownfield' && !baseline.evidence.some((item) => item.kind === 'source')) {
    blockers.add('BASELINE_SOURCE_EVIDENCE_MISSING');
  }
  if (baseline.verification.length === 0) blockers.add('BASELINE_VERIFICATION_MISSING');
  for (const item of baseline.verification) {
    if (item.status === 'not_run') blockers.add(`BASELINE_VERIFICATION_NOT_RUN:${item.name}`);
    if (item.status === 'known_red') {
      if (input.accept_known_red !== true) blockers.add(`BASELINE_KNOWN_RED_NOT_ACCEPTED:${item.name}`);
      if (!item.rationale) blockers.add(`BASELINE_KNOWN_RED_RATIONALE_MISSING:${item.name}`);
    }
  }
  for (const item of baseline.unknowns.filter((unknown) => unknown.blocking)) {
    blockers.add(`BASELINE_UNKNOWN_BLOCKING:${item.summary}`);
  }
  if (!String(input.approved_by || '').trim()) blockers.add('BASELINE_APPROVER_REQUIRED');
  if (String(input.approval_note || '').trim().length < 3) blockers.add('BASELINE_APPROVAL_NOTE_REQUIRED');
  return [...blockers].sort();
}

function convergeBaseline(db, input = {}, { rootDir = process.cwd(), emitEvent = true } = {}) {
  const current = readBaseline(db, input.id);
  if (!current) throw new BaselineWorkflowError('BASELINE_NOT_FOUND', `baseline ${input.id} not found`);
  if (!['draft', 'adopting', 'blocked'].includes(current.status)) {
    throw new BaselineWorkflowError('BASELINE_NOT_CONVERGEABLE', `baseline ${current.id} is ${current.status}`);
  }
  const blockers = convergenceBlockers(current, input, rootDir);
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
    return { ready: false, status: 'blocked', blockers, baseline: readBaseline(db, current.id) };
  }
  ops.tx(db, () => {
    db.prepare(
      `UPDATE baselines SET status = 'ready', approved_by = ?, approval_note = ?,
       converged_at = ?, updated_at = ? WHERE id = ?`,
    ).run(String(input.approved_by).trim(), String(input.approval_note).trim(), ts, ts, current.id);
    if (emitEvent) {
      ops.appendEventInTx(db, {
        type: 'baseline_converged', payload: { baseline_id: current.id, revision: current.repository_revision },
      });
    }
  });
  return { ready: true, status: 'ready', blockers: [], baseline: readBaseline(db, current.id) };
}

function inspectBaseline(db, { rootDir = process.cwd(), id } = {}) {
  const baseline = readBaseline(db, id);
  if (!baseline) {
    return { status: 'fail', blockers: ['BASELINE_MISSING'], warnings: [], baseline: null };
  }
  if (baseline.status !== 'ready') {
    return {
      status: 'fail', blockers: [`BASELINE_NOT_READY:${baseline.status}`], warnings: [], baseline,
    };
  }
  if (baseline.mode === 'migrated') {
    return {
      status: 'pass', blockers: [], warnings: ['BASELINE_MIGRATION_REVIEW_RECOMMENDED'], baseline,
    };
  }
  const blockers = storedSpecBlockers(baseline, rootDir);
  const head = gitHead(rootDir);
  if (head && baseline.repository_revision && head !== baseline.repository_revision) {
    blockers.push('BASELINE_HEAD_STALE');
  }
  return { status: blockers.length === 0 ? 'pass' : 'fail', blockers, warnings: [], baseline };
}

function inferSpecKind(file) {
  const name = path.basename(file, path.extname(file)).toLowerCase();
  return SPEC_KINDS.has(name) ? name : 'other';
}

function reconcileBaseline(db, { baseline_updates = [], change_id = null } = {}, {
  rootDir = process.cwd(), emitEvent = true,
} = {}) {
  const current = readBaseline(db);
  if (!current || current.status !== 'ready') {
    throw new BaselineWorkflowError('BASELINE_NOT_READY', 'a ready baseline is required for reconciliation');
  }
  if (current.mode === 'migrated' && current.spec_refs.length === 0) return current;
  const refs = new Map(current.spec_refs.map((ref) => [ref.path, ref]));
  for (const update of baseline_updates) {
    const file = safeRelativePath(rootDir, update, 'baseline update');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new BaselineWorkflowError('BASELINE_FILE_MISSING', `baseline update missing: ${update}`);
    }
    refs.set(update, { kind: refs.get(update)?.kind || inferSpecKind(update), path: update, digest: digestFile(file) });
  }
  const revision = gitHead(rootDir) || current.repository_revision;
  const ts = nowIso();
  ops.tx(db, () => {
    db.prepare(
      'UPDATE baselines SET repository_revision = ?, spec_refs_json = ?, updated_at = ? WHERE id = ?',
    ).run(revision, JSON.stringify([...refs.values()]), ts, current.id);
    if (emitEvent) {
      ops.appendEventInTx(db, {
        type: 'baseline_reconciled',
        change_id,
        payload: { baseline_id: current.id, baseline_updates, repository_revision: revision },
      });
    }
  });
  return readBaseline(db, current.id);
}

module.exports = {
  BaselineWorkflowError,
  startBaseline,
  recordBaseline,
  convergeBaseline,
  readBaseline,
  inspectBaseline,
  reconcileBaseline,
  gitHead,
};
