'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const baselines = require('./baseline-workflow.cjs');
const workflows = require('./workflow-state.cjs');
const decisions = require('./decision-dialogue.cjs');
const ops = require('./state-ops.cjs');
const changeAuthority = require('./change-authority.cjs');

const ROLES = new Set(['plan', 'implement', 'check', 'review']);
const GATES = new Set([
  'alignment', 'planning', 'implementation', 'verification', 'review', 'convergence', 'recovery',
]);
const CONTEXT_KINDS = new Set(['spec', 'source', 'test', 'docs', 'external']);
const DEFAULT_BUDGET = Object.freeze({ max_tokens: 12_000, max_files: 12 });
const MAX_CONTEXT_REFS = 64;
const MAX_REF_LENGTH = 2_048;
const MAX_REASON_LENGTH = 2_048;
const MAX_LOCATOR_LENGTH = 512;
const SPEC_REF_FIELDS = new Set([
  'ref', 'reason', 'required', 'expected_digest', 'anchor', 'scope', 'freshness_policy',
]);
const ADVISORY_CONTEXT_CODES = new Set([
  'CONTEXT_FILE_BUDGET_EXCEEDED',
  'CONTEXT_TOKEN_BUDGET_EXCEEDED',
  'EXECUTION_CONTEXT_BUDGET_EXCEEDED',
  'EXECUTION_CONTEXT_BUDGET_ADVISORY',
]);
const ACTIVE_CHANGE_BASELINE_DRIFT = Object.freeze([
  /^BASELINE_HEAD_STALE$/,
  /^BASELINE_BRANCH_STALE$/,
  /^BASELINE_WORKSPACE_STALE$/,
  /^BASELINE_WORKTREE_STALE$/,
  /^BASELINE_WORKTREE_DIRTY$/,
  /^BASELINE_SPEC_STALE:/,
  /^BASELINE_EVIDENCE_STALE:/,
]);

class ContextSpineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContextSpineError';
    this.code = code;
  }
}

function currentHead(rootDir) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function parseJson(value, fallback = {}) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}

function hasIncidentBreakGlass(change) {
  const bypass = change?.baseline_bypass
    || parseJson(change?.baseline_bypass_json, null);
  return change?.kind === 'incident'
    && bypass?.mode === 'incident_break_glass'
    && Boolean(String(bypass.reason || '').trim())
    && Boolean(String(bypass.approved_by || '').trim());
}

function expectedActiveChangeDrift(code) {
  return ACTIVE_CHANGE_BASELINE_DRIFT.some((pattern) => pattern.test(code));
}

function baselineGateForChange(db, change, baselineHealth) {
  const baseWarnings = Array.isArray(baselineHealth.warnings) ? baselineHealth.warnings : [];
  if (baselineHealth.status === 'pass') {
    return { blockers: [], warnings: [...new Set(baseWarnings)], mode: 'healthy' };
  }
  const healthBlockers = Array.isArray(baselineHealth.blockers)
    ? baselineHealth.blockers : ['BASELINE_STATE_UNAVAILABLE'];
  if (hasIncidentBreakGlass(change)) {
    return {
      blockers: [], warnings: [...new Set([...healthBlockers, ...baseWarnings])],
      mode: 'incident_break_glass',
    };
  }
  const baseline = baselineHealth.baseline;
  if (!baseline || baseline.status !== 'ready' || baseline.mode === 'migrated') {
    return { blockers: healthBlockers, warnings: baseWarnings, mode: 'baseline_required' };
  }
  const binding = db.prepare(
    `SELECT wr.baseline_id, ws.status AS binding_status, ws.evidence_json
     FROM workflow_runs wr
     LEFT JOIN workflow_steps ws
       ON ws.run_id = wr.id AND ws.step_id = 'bind-baseline'
     WHERE wr.kind = 'change' AND wr.change_id = ?
     ORDER BY wr.started_at DESC, wr.rowid DESC LIMIT 1`,
  ).get(change.id);
  let evidence = [];
  try { evidence = JSON.parse(binding?.evidence_json || '[]'); } catch { evidence = []; }
  const boundFromReadyAuthority = binding?.baseline_id === baseline.id
    && binding.binding_status === 'completed'
    && evidence.some((item) => item?.ref === baseline.id);
  if (!boundFromReadyAuthority) {
    return { blockers: healthBlockers, warnings: baseWarnings, mode: 'baseline_binding_required' };
  }
  const blockers = healthBlockers.filter((code) => !expectedActiveChangeDrift(code));
  const driftWarnings = healthBlockers.filter(expectedActiveChangeDrift);
  return {
    blockers,
    warnings: [...new Set([...driftWarnings, ...baseWarnings])],
    mode: blockers.length === 0 ? 'active_change_drift' : 'baseline_invalid',
  };
}

function taskStateDigest(task) {
  if (!task) return null;
  const payload = {
    id: task.id,
    change_id: task.change_id,
    status: task.status,
    stale: Boolean(task.stale),
    deps: task.deps || [],
    outcome: task.outcome,
    slice_kind: task.slice_kind,
    public_seam: task.public_seam,
    verification_command: task.verification_command,
    acceptance: task.acceptance || [],
    context_refs: task.context_refs || [],
    docs_impact: task.docs_impact || {},
    ownership: task.ownership || {},
    trace_to: task.trace_to,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function taskContractDigest(task) {
  if (!task) return null;
  const payload = {
    id: task.id,
    change_id: task.change_id,
    deps: task.deps || [],
    files_modified: task.files_modified || [],
    outcome: task.outcome,
    slice_kind: task.slice_kind,
    public_seam: task.public_seam,
    verification_command: task.verification_command,
    acceptance: task.acceptance || [],
    context_refs: task.context_refs || [],
    docs_impact: task.docs_impact || {},
    ownership: task.ownership || {},
    trace_to: task.trace_to,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

const { changeStateDigest } = changeAuthority;

function nonEmpty(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ContextSpineError('VALIDATION_ERROR', `${field} must be a non-empty string`);
  return text;
}

function boundedText(value, field, maxLength) {
  const text = nonEmpty(value, field);
  if (text.length > maxLength) {
    throw new ContextSpineError(
      'VALIDATION_ERROR', `${field} must be at most ${maxLength} characters`,
    );
  }
  return text;
}

function localPath(rootDir, ref) {
  const candidate = ref.split('#', 1)[0];
  if (!candidate || path.isAbsolute(candidate)
    || /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    throw new ContextSpineError('VALIDATION_ERROR', `context ref must be project-relative: ${ref}`);
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new ContextSpineError('VALIDATION_ERROR', `context ref escapes project root: ${ref}`);
  }
  return resolved;
}

function contextPathUnsafe(ref, message) {
  return new ContextSpineError(
    'CONTEXT_REF_UNSAFE',
    `${message}: ${ref}`,
  );
}

function lstatOrNull(candidate) {
  try { return fs.lstatSync(candidate); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function sameEntry(left, right) {
  return Boolean(left && right
    && String(left.dev) === String(right.dev)
    && String(left.ino) === String(right.ino));
}

function physicallyContained(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function readProjectFile(rootDir, ref) {
  const file = localPath(rootDir, ref);
  const root = path.resolve(rootDir);
  const rootStat = lstatOrNull(root);
  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw contextPathUnsafe(ref, 'project root must be a real directory');
  }
  const physicalRoot = fs.realpathSync(root);
  const identities = [{ file: root, stat: rootStat, directory: true }];
  let current = root;
  const segments = path.relative(root, file).split(path.sep).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const stat = lstatOrNull(current);
    if (!stat) return null;
    const final = index === segments.length - 1;
    if (stat.isSymbolicLink()) {
      throw contextPathUnsafe(ref, 'local Context refs cannot traverse symbolic links');
    }
    if ((!final && !stat.isDirectory()) || (final && !stat.isFile())) {
      throw contextPathUnsafe(
        ref,
        final
          ? 'local Context ref must be a regular file'
          : 'local Context ref ancestor must be a directory',
      );
    }
    identities.push({ file: current, stat, directory: !final });
  }
  let physicalFile;
  try { physicalFile = fs.realpathSync(file); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!physicallyContained(physicalRoot, physicalFile)) {
    throw contextPathUnsafe(ref, 'local Context ref escapes the physical project root');
  }
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  let fd;
  try {
    try { fd = fs.openSync(file, flags); } catch (error) {
      if (error?.code === 'ENOENT') return null;
      if (['ELOOP', 'EMLINK'].includes(error?.code)) {
        throw contextPathUnsafe(ref, 'local Context ref changed to a symbolic link');
      }
      throw error;
    }
    const opened = fs.fstatSync(fd);
    const finalIdentity = identities[identities.length - 1]?.stat;
    if (!opened.isFile() || !sameEntry(opened, finalIdentity)) {
      throw contextPathUnsafe(ref, 'local Context ref changed while opening');
    }
    for (const identity of identities) {
      const currentStat = lstatOrNull(identity.file);
      if (!currentStat || currentStat.isSymbolicLink()
        || !sameEntry(currentStat, identity.stat)
        || (identity.directory ? !currentStat.isDirectory() : !currentStat.isFile())) {
        throw contextPathUnsafe(ref, 'local Context ref path changed while opening');
      }
    }
    const currentPhysicalRoot = fs.realpathSync(root);
    const currentPhysicalFile = fs.realpathSync(file);
    if (currentPhysicalRoot !== physicalRoot
      || !physicallyContained(physicalRoot, currentPhysicalFile)) {
      throw contextPathUnsafe(ref, 'local Context ref physical path changed while opening');
    }
    return { file, bytes: fs.readFileSync(fd) };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function normalizeBudget(value, inherited) {
  const source = value || inherited || DEFAULT_BUDGET;
  const maxTokens = Number(source.max_tokens ?? DEFAULT_BUDGET.max_tokens);
  const maxFiles = Number(source.max_files ?? DEFAULT_BUDGET.max_files);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || !Number.isInteger(maxFiles) || maxFiles < 1) {
    throw new ContextSpineError('VALIDATION_ERROR', 'context budget must use positive integer max_tokens/max_files');
  }
  return { max_tokens: maxTokens, max_files: maxFiles };
}

function specRefToContextRef(value, role) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContextSpineError('VALIDATION_ERROR', 'spec_refs entries must be objects');
  }
  const unknown = Object.keys(value).filter((field) => !SPEC_REF_FIELDS.has(field));
  if (unknown.length > 0) {
    throw new ContextSpineError(
      'VALIDATION_ERROR', `spec_refs entry has unsupported fields: ${unknown.join(', ')}`,
    );
  }
  if (value.required !== undefined && typeof value.required !== 'boolean') {
    throw new ContextSpineError(
      'VALIDATION_ERROR', 'spec_refs[].required must be a boolean',
    );
  }
  const ref = boundedText(value.ref, 'spec_refs[].ref', MAX_REF_LENGTH);
  return {
    ref,
    kind: 'spec',
    reason: value.reason === undefined
      ? `Specification evidence for ${role}`
      : boundedText(value.reason, 'spec_refs[].reason', MAX_REASON_LENGTH),
    required: value.required !== false,
    expected_digest: value.expected_digest,
    anchor: value.anchor,
    scope: value.scope,
    freshness_policy: value.freshness_policy,
  };
}

function normalizeRefs(input, role, inherited) {
  if (input.context_refs !== undefined && input.spec_refs !== undefined) {
    throw new ContextSpineError(
      'VALIDATION_ERROR',
      'context_refs and spec_refs are mutually exclusive; provide exactly one reference format',
    );
  }
  let refs;
  if (input.context_refs !== undefined) refs = input.context_refs;
  else if (input.spec_refs !== undefined) {
    if (!Array.isArray(input.spec_refs)) {
      throw new ContextSpineError('VALIDATION_ERROR', 'spec_refs must be an array');
    }
    if (input.spec_refs.length > MAX_CONTEXT_REFS) {
      throw new ContextSpineError(
        'VALIDATION_ERROR', `spec_refs must contain at most ${MAX_CONTEXT_REFS} entries`,
      );
    }
    refs = input.spec_refs.map((value) => specRefToContextRef(value, role));
  }
  else refs = inherited || [];
  if (!Array.isArray(refs)) {
    throw new ContextSpineError('VALIDATION_ERROR', 'context_refs must be an array');
  }
  if (refs.length > MAX_CONTEXT_REFS) {
    throw new ContextSpineError(
      'VALIDATION_ERROR', `context_refs must contain at most ${MAX_CONTEXT_REFS} entries`,
    );
  }
  return refs.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ContextSpineError('VALIDATION_ERROR', `context_refs[${index}] must be an object`);
    }
    const ref = boundedText(
      value.ref || value.path || value.reference,
      `context_refs[${index}].ref`,
      MAX_REF_LENGTH,
    );
    const kind = value.kind || 'source';
    if (!CONTEXT_KINDS.has(kind)) {
      throw new ContextSpineError('VALIDATION_ERROR', `unsupported context kind: ${kind}`);
    }
    const reason = boundedText(
      value.reason, `context_refs[${index}].reason`, MAX_REASON_LENGTH,
    );
    const expectedDigest = value.expected_digest ?? value.digest ?? null;
    if (expectedDigest !== null && !/^[0-9a-f]{64}$/.test(expectedDigest)) {
      throw new ContextSpineError(
        'VALIDATION_ERROR', `context_refs[${index}].expected_digest must be sha256`,
      );
    }
    const freshnessPolicy = value.freshness_policy
      || (expectedDigest ? 'digest' : 'existence');
    if (!['digest', 'existence', 'advisory'].includes(freshnessPolicy)) {
      throw new ContextSpineError(
        'VALIDATION_ERROR',
        `context_refs[${index}].freshness_policy must be digest, existence, or advisory`,
      );
    }
    const normalized = {
      ref, kind, reason, required: value.required !== false,
      expected_digest: expectedDigest,
      freshness_policy: freshnessPolicy,
    };
    if (value.anchor !== undefined) {
      normalized.anchor = boundedText(
        value.anchor, `context_refs[${index}].anchor`, MAX_LOCATOR_LENGTH,
      );
    }
    if (value.scope !== undefined) {
      normalized.scope = boundedText(
        value.scope, `context_refs[${index}].scope`, MAX_LOCATOR_LENGTH,
      );
    }
    return normalized;
  });
}

function authoritativeTaskRefs(input, role, task) {
  if (!task) return null;
  const dbRefs = normalizeRefs({ context_refs: task.context_refs || [] }, role, []);
  if (input.context_refs === undefined && input.spec_refs === undefined) return dbRefs;
  const supplied = normalizeRefs(input, role, []);
  const comparable = (items) => items.map((item) => ({
    ref: item.ref,
    kind: item.kind,
    reason: item.reason,
    required: item.required,
    expected_digest: item.expected_digest,
    anchor: item.anchor,
    scope: item.scope,
    freshness_policy: item.freshness_policy,
  }));
  if (JSON.stringify(comparable(supplied)) !== JSON.stringify(comparable(dbRefs))) {
    throw new ContextSpineError(
      'EXECUTION_CONTEXT_REFS_CONFLICT',
      `context_refs conflict with task ${task.id} authority; update the task contract first`,
    );
  }
  return dbRefs;
}

function inspectRef(rootDir, role, value) {
  if (value.kind === 'external') {
    return { ...value, role, status: 'external', digest: value.expected_digest, estimated_tokens: 0 };
  }
  const read = readProjectFile(rootDir, value.ref);
  if (!read) {
    return { ...value, role, status: 'missing', digest: null, estimated_tokens: 0 };
  }
  const content = read.bytes;
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  const status = value.freshness_policy !== 'existence'
    && value.expected_digest && value.expected_digest !== digest ? 'stale' : 'current';
  return {
    ...value, role, status, digest,
    estimated_tokens: Math.max(1, Math.ceil(content.byteLength / 4)),
  };
}

function taskNeighborhood(tasks, task, role) {
  if (!task || role !== 'implement') return tasks;
  const selected = new Set([task.id, ...(task.deps || [])]);
  for (const candidate of tasks) {
    const dependencies = candidate.deps || [];
    if (dependencies.includes(task.id)) selected.add(candidate.id);
    if (candidate.slice_kind === 'integration_checkpoint'
      && dependencies.some((dependency) => selected.has(dependency))) {
      selected.add(candidate.id);
    }
  }
  return tasks.filter((candidate) => selected.has(candidate.id));
}

function taskContextContract(change, task) {
  if (!task) return null;
  const contract = change.contract || parseJson(change.contract_json, {});
  return {
    purpose: task.outcome,
    why: task.trace_to,
    constraints: contract.constraints || [],
    non_goals: contract.non_goals || [],
    target: {
      public_seams: [task.public_seam].filter(Boolean),
      files: task.files_modified || [],
    },
    pattern_refs: (task.context_refs || []).map((item) => ({
      ref: item.ref,
      reason: item.reason,
      anchor: item.anchor || null,
      scope: item.scope || null,
    })),
    acceptance: task.acceptance || [],
    documentation_impact: task.docs_impact || {},
    recovery: contract.recovery || null,
    definition_of_drift: {
      change_state_digest: changeStateDigest(change),
      task_contract_digest: taskContractDigest(task),
      required_context_freshness: (task.context_refs || []).map((item) => ({
        ref: item.ref,
        expected_digest: item.expected_digest || item.digest || null,
        freshness_policy: item.freshness_policy
          || ((item.expected_digest || item.digest) ? 'digest' : 'existence'),
      })),
    },
  };
}

function estimateInlineTokens(value) {
  return Math.max(1, Math.ceil(Buffer.byteLength(JSON.stringify(value), 'utf8') / 4));
}

function normalizeExecutionContract(input, inherited, { task }) {
  const taskContract = task
    && task.slice_kind && task.public_seam && task.verification_command ? {
    slice_kind: task.slice_kind,
    public_seam: task.public_seam,
    verification_command: task.verification_command,
    context_budget_percent: input.execution_contract?.context_budget_percent
      ?? inherited?.context_budget_percent
      ?? 40,
  } : null;
  if (input.execution_contract) {
    for (const field of ['slice_kind', 'public_seam', 'verification_command']) {
      if (input.execution_contract[field] !== undefined) {
        throw new ContextSpineError(
          'EXECUTION_CONTRACT_CONFLICT',
          `execution_contract.${field} is owned by the task row and cannot be supplied by Prompt input`,
        );
      }
    }
  }
  if (!task && input.execution_contract !== undefined) {
    throw new ContextSpineError(
      'EXECUTION_CONTRACT_CONFLICT',
      'execution_contract is valid only for a DB-backed task context',
    );
  }
  const source = taskContract || input.execution_contract || inherited || null;
  const taskId = task?.id || null;
  if (!taskId) return null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const sliceKind = source.slice_kind || 'tracer_bullet';
  if (typeof sliceKind !== 'string'
      || sliceKind.trim().length < 1
      || sliceKind.trim().length > 80) {
    throw new ContextSpineError(
      'VALIDATION_ERROR',
      'slice kind must be a non-empty string of at most 80 characters',
    );
  }
  const percent = Number(source.context_budget_percent ?? 40);
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new ContextSpineError('VALIDATION_ERROR', 'context_budget_percent must be an integer from 1 to 100');
  }
  return {
    slice_kind: sliceKind.trim(),
    public_seam: typeof source.public_seam === 'string' ? source.public_seam.trim() : '',
    verification_command: typeof source.verification_command === 'string'
      ? source.verification_command.trim()
      : '',
    context_budget_percent: percent,
  };
}

function defaultGate(role) {
  return {
    plan: 'planning', implement: 'implementation', check: 'verification', review: 'review',
  }[role];
}

function deriveTransitions({
  change,
  tasks = [],
  task,
  role,
  readiness,
  blockers = [],
  activeWorkflow = null,
  deliveryReady = false,
}) {
  const unique = (values) => [...new Set(values.filter(Boolean))];
  const has = (prefix) => blockers.some((blocker) => blocker === prefix || blocker.startsWith(`${prefix}:`));
  if (has('STATE_DB_UNREADABLE') || has('STATE_SCHEMA_INCOMPLETE') || has('STATE_AUTHORITY_CONFLICT')) {
    return {
      allowed_transitions: ['ultra-doctor', 'ultra-status'],
      required_transition: 'ultra-doctor',
    };
  }
  if (has('STATE_DB_MISSING') || has('BASELINE_MISSING')) {
    return {
      allowed_transitions: ['ultra-init', 'ultra-status'],
      required_transition: 'ultra-init',
    };
  }
  if (blockers.some((blocker) => blocker.startsWith('DECISION_'))) {
    return {
      allowed_transitions: ['ultra-think', 'ultra-status'],
      required_transition: 'ultra-think',
    };
  }
  if (blockers.some((blocker) => blocker.startsWith('BASELINE_SCHEMA_')
    || blocker.startsWith('STATE_SCHEMA_MIGRATION_'))) {
    return {
      allowed_transitions: ['ultra-doctor', 'ultra-init', 'ultra-status'],
      required_transition: 'ultra-doctor',
    };
  }

  const transitions = [];
  if (activeWorkflow) transitions.push(`ultra-${activeWorkflow.kind}`);
  if (!change) {
    transitions.push('ultra-research', 'ultra-change', 'ultra-think', 'ultra-status', 'ultra-doctor');
    return { allowed_transitions: unique(transitions), required_transition: null };
  }
  if (readiness === 'blocked') {
    if (blockers.some((blocker) => blocker.startsWith('CONTEXT_')
      || blocker.startsWith('EXECUTION_'))) {
      transitions.push('change.context');
    }
    if (blockers.some((blocker) => blocker.startsWith('BASELINE_'))) {
      transitions.push('ultra-research', 'ultra-doctor');
    }
    transitions.push('ultra-change', 'ultra-think', 'ultra-status');
    return { allowed_transitions: unique(transitions), required_transition: null };
  }
  if (change.status === 'ready') {
    transitions.push('ultra-deliver', 'ultra-review', 'ultra-test');
  } else if (change.status === 'blocked') {
    transitions.push('ultra-think', 'ultra-change');
  } else if (!task && tasks.length === 0) {
    transitions.push('ultra-plan', 'ultra-research', 'ultra-change');
  } else if (task?.status === 'pending' || task?.status === 'in_progress') {
    transitions.push('ultra-dev', 'ultra-plan');
    if (role === 'review') transitions.push('ultra-review');
  } else if (tasks.length > 0 && tasks.every((row) => ['completed', 'expanded'].includes(row.status))) {
    transitions.push('ultra-test', 'ultra-review');
    if (deliveryReady) transitions.push('ultra-deliver');
  } else {
    transitions.push('ultra-plan', 'ultra-change');
  }
  transitions.push('ultra-think', 'ultra-status');
  return { allowed_transitions: unique(transitions), required_transition: null };
}

function normalizeRecommendation(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContextSpineError('VALIDATION_ERROR', 'recommendation must be an object');
  }
  const workflow = String(value.workflow || '').trim();
  const rationale = String(value.rationale || '').trim();
  if (!workflow || rationale.length < 3) {
    throw new ContextSpineError(
      'VALIDATION_ERROR', 'recommendation requires workflow and rationale',
    );
  }
  return { workflow, rationale, authoritative: false };
}

function deliveryCapabilityReady(db, change, tasks, rootDir) {
  if (!change || !Array.isArray(tasks) || tasks.length === 0
    || !tasks.every((row) => ['completed', 'expanded'].includes(row.status))) {
    return false;
  }
  try {
    workflows.validateDeliveryPrerequisites(db, { change_id: change.id }, rootDir);
    return true;
  } catch {
    return false;
  }
}

function latestContextSnapshot(db, {
  change_id: changeId,
  task_id: taskId = null,
  role,
  gate,
} = {}) {
  if (!changeId || !role || !gate) return null;
  return db.prepare(
    `SELECT * FROM context_snapshots
     WHERE change_id = ? AND task_id IS ? AND role = ? AND gate = ?
     ORDER BY created_at DESC, rowid DESC LIMIT 1`,
  ).get(changeId, taskId, role, gate) || null;
}

function latestContext(db, binding) {
  const row = latestContextSnapshot(db, binding);
  return parseJson(row?.context_json, {});
}

function validateContextSnapshot(db, binding, {
  rootDir = process.cwd(),
  require_current_checkout = false,
} = {}) {
  const snapshot = latestContextSnapshot(db, binding);
  if (!snapshot) {
    return {
      snapshot: null,
      manifest: null,
      blockers: ['CONTEXT_SNAPSHOT_MISSING'],
      warnings: [],
    };
  }
  const blockers = [];
  const warnings = [];
  let manifest = null;
  let manifestFile = null;
  try {
    const read = readProjectFile(rootDir, snapshot.manifest_path);
    manifestFile = read?.file || localPath(rootDir, snapshot.manifest_path);
    if (!read) {
      blockers.push('CONTEXT_MANIFEST_MISSING');
    } else {
      const bytes = read.bytes;
      const digest = crypto.createHash('sha256').update(bytes).digest('hex');
      if (digest !== snapshot.manifest_hash) blockers.push('CONTEXT_MANIFEST_STALE');
      manifest = JSON.parse(bytes.toString('utf8'));
    }
  } catch {
    blockers.push('CONTEXT_MANIFEST_INVALID');
  }
  if (!manifest) {
    return {
      snapshot,
      manifest: null,
      blockers: [...new Set(blockers)],
      warnings: [],
    };
  }
  if (manifest.snapshot_id !== snapshot.id
    || manifest.change?.id !== binding.change_id
    || (manifest.resume?.task_id || null) !== (binding.task_id || null)
    || manifest.role !== binding.role
    || manifest.gate !== binding.gate
    || snapshot.role !== binding.role
    || snapshot.gate !== binding.gate) {
    blockers.push('CONTEXT_BINDING_MISMATCH');
  }
  if (snapshot.readiness !== 'ready' || manifest.readiness?.status !== 'ready') {
    blockers.push('CONTEXT_NOT_READY');
  }
  const change = db.prepare('SELECT * FROM changes WHERE id = ?').get(binding.change_id);
  if (!change || manifest.resume?.change_state_digest !== changeStateDigest(change)) {
    blockers.push('CONTEXT_CHANGE_CONTRACT_STALE');
  }
  if (binding.task_id) {
    const task = ops.readTask(db, binding.task_id);
    if (!task || manifest.resume?.task_contract_digest !== taskContractDigest(task)) {
      blockers.push('CONTEXT_TASK_CONTRACT_STALE');
    }
  }
  for (const item of manifest.context?.items || []) {
    if (item.kind === 'external') continue;
    let read;
    try { read = readProjectFile(rootDir, item.ref); }
    catch (error) {
      blockers.push(
        error?.code === 'CONTEXT_REF_UNSAFE'
          ? `CONTEXT_REF_UNSAFE:${item.ref}`
          : `CONTEXT_REF_INVALID:${item.ref}`,
      );
      continue;
    }
    if (!read) {
      item.freshness_status = 'missing';
      item.current_digest = null;
      if (item.required) blockers.push(`CONTEXT_REQUIRED_REF_MISSING:${item.ref}`);
      else warnings.push(`CONTEXT_OPTIONAL_REF_MISSING:${item.ref}`);
      continue;
    }
    if (['digest', 'advisory'].includes(item.freshness_policy)) {
      const currentDigest = crypto.createHash('sha256').update(read.bytes).digest('hex');
      const expectedDigest = item.expected_digest || item.digest;
      item.current_digest = currentDigest;
      item.freshness_status = currentDigest === expectedDigest ? 'current' : 'stale';
      if (currentDigest !== expectedDigest) {
        if (item.freshness_policy === 'advisory') {
          warnings.push(`CONTEXT_REF_STALE_ADVISORY:${item.ref}`);
        } else if (item.required) {
          blockers.push(`CONTEXT_REQUIRED_REF_STALE:${item.ref}`);
        } else {
          warnings.push(`CONTEXT_OPTIONAL_REF_STALE:${item.ref}`);
        }
      }
    } else {
      item.current_digest = item.digest || null;
      item.freshness_status = 'current';
    }
  }
  if (require_current_checkout) {
    const checkout = baselines.gitWorktreeSnapshot(rootDir, ['.']);
    if (checkout.head && manifest.git?.head !== checkout.head) blockers.push('CONTEXT_HEAD_STALE');
    if (checkout.digest && manifest.git?.worktree_digest !== checkout.digest) {
      blockers.push('CONTEXT_WORKTREE_STALE');
    }
  }
  return {
    snapshot,
    manifest,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
  };
}

function compileRoleContext(db, { input, change, tasks, rootDir }) {
  if (input.next_action !== undefined) {
    throw new ContextSpineError(
      'CONTEXT_LEGACY_NEXT_ACTION_UNSUPPORTED',
      'next_action is not an authority field; provide a non-authoritative recommendation instead',
    );
  }
  const task = input.task_id ? tasks.find((row) => row.id === input.task_id) : null;
  if (input.task_id && !task) {
    throw new ContextSpineError('TASK_NOT_FOUND', `task ${input.task_id} is not linked to change ${change.id}`);
  }
  const role = input.role || (input.task_id ? 'implement' : 'plan');
  if (!ROLES.has(role)) throw new ContextSpineError('VALIDATION_ERROR', `unsupported context role: ${role}`);
  const gate = input.gate || defaultGate(role);
  if (!GATES.has(gate)) throw new ContextSpineError('VALIDATION_ERROR', `unsupported workflow gate: ${gate}`);
  const inherited = latestContext(db, {
    change_id: change.id,
    task_id: input.task_id || null,
    role,
    gate,
  });

  const refs = authoritativeTaskRefs(input, role, task)
    || normalizeRefs(input, role, inherited.context?.items || []);
  const items = refs.map((value) => inspectRef(rootDir, role, value));
  const budget = normalizeBudget(input.budget, inherited.context?.budget);
  const scopedTasks = taskNeighborhood(tasks, task, role);
  const executionContract = normalizeExecutionContract(
    input, inherited.execution_contract, { task },
  );
  const taskContract = taskContextContract(change, task);
  const fileTokenEstimate = items.reduce((sum, item) => sum + item.estimated_tokens, 0);
  const inlineTokenEstimate = estimateInlineTokens({
    change: {
      id: change.id,
      kind: change.kind,
      intent: change.intent,
      contract: change.contract || parseJson(change.contract_json, {}),
      docs_impact: change.docs_impact || parseJson(change.docs_impact_json, {}),
    },
    tasks: scopedTasks,
    execution_contract: executionContract,
    task_context_contract: taskContract,
    context_refs: items.map((item) => ({
      ref: item.ref,
      kind: item.kind,
      reason: item.reason,
      required: item.required,
      expected_digest: item.expected_digest,
      anchor: item.anchor,
      scope: item.scope,
      freshness_policy: item.freshness_policy,
    })),
  });
  const tokenEstimate = fileTokenEstimate + inlineTokenEstimate;
  const fileCount = items.filter((item) => item.status !== 'external').length;
  const blockers = [];
  const warnings = [];
  const baselineHealth = baselines.inspectBaseline(db, { rootDir });
  const checkout = baselines.gitWorktreeSnapshot(rootDir, ['.']);
  const baselineGate = baselineGateForChange(db, change, baselineHealth);
  blockers.push(...baselineGate.blockers);
  warnings.push(...baselineGate.warnings);
  for (const item of items) {
    if (item.required && item.status === 'missing') blockers.push(`CONTEXT_REQUIRED_REF_MISSING:${item.ref}`);
    if (!item.required && item.status === 'missing') {
      warnings.push(`CONTEXT_OPTIONAL_REF_MISSING:${item.ref}`);
    }
    if (item.status === 'stale') {
      if (item.freshness_policy === 'advisory') {
        warnings.push(`CONTEXT_REF_STALE_ADVISORY:${item.ref}`);
      } else if (item.required) {
        blockers.push(`CONTEXT_REQUIRED_REF_STALE:${item.ref}`);
      } else {
        warnings.push(`CONTEXT_OPTIONAL_REF_STALE:${item.ref}`);
      }
    }
  }
  if (fileCount > budget.max_files) warnings.push('CONTEXT_FILE_BUDGET_EXCEEDED');
  if (tokenEstimate > budget.max_tokens) warnings.push('CONTEXT_TOKEN_BUDGET_EXCEEDED');
  if (input.task_id) {
    if (!executionContract) blockers.push('EXECUTION_CONTRACT_MISSING');
    else {
      if (!executionContract.public_seam) blockers.push('EXECUTION_PUBLIC_SEAM_MISSING');
      if (!executionContract.verification_command) blockers.push('EXECUTION_VERIFICATION_COMMAND_MISSING');
      if (executionContract.slice_kind !== 'expand_contract'
        && executionContract.context_budget_percent > 40) {
        warnings.push('EXECUTION_CONTEXT_BUDGET_ADVISORY');
      }
    }
  }
  const readiness = blockers.length === 0 ? 'ready' : 'blocked';
  const control = deriveTransitions({
    change,
    tasks,
    task,
    role,
    readiness,
    blockers,
    deliveryReady: deliveryCapabilityReady(db, change, tasks, rootDir),
  });
  return {
    role,
    gate,
    control,
    recommendation: normalizeRecommendation(input.recommendation),
    readiness: { status: readiness, blockers, warnings: [...new Set(warnings)] },
    context: {
      items,
      budget,
      token_estimate: tokenEstimate,
      file_token_estimate: fileTokenEstimate,
      inline_token_estimate: inlineTokenEstimate,
      file_count: fileCount,
      lazy_file_refs: true,
    },
    execution_contract: executionContract,
    task_context_contract: taskContract,
    task_scope: scopedTasks,
    baseline: baselineHealth.baseline ? {
      id: baselineHealth.baseline.id,
      mode: baselineHealth.baseline.mode,
      status: baselineHealth.baseline.status,
      repository_revision: baselineHealth.baseline.repository_revision,
      health: baselineHealth.status,
      warnings: [...new Set([...baselineHealth.blockers, ...baselineHealth.warnings])],
    } : null,
    selected_task: task,
    resume: {
      change_id: change.id,
      change_state_digest: changeStateDigest(change),
      task_id: task?.id || null,
      task_status: task?.status || null,
      task_state_digest: taskStateDigest(task),
      task_contract_digest: taskContractDigest(task),
      session_id: task?.session_id || null,
      role,
      gate,
      git_head: checkout.head,
      worktree_state: checkout.state,
      worktree_digest: checkout.digest,
    },
  };
}

function actionableBaselineWorkflow(db, baselineId, rootDir) {
  if (!baselineId) return null;
  const candidates = workflows.listWorkflows(db, { baseline_id: baselineId, limit: 100 }, { rootDir })
    .filter((run) => ['active', 'blocked', 'ready'].includes(run.status));
  return candidates.find((run) => run.kind === 'research')
    || candidates.find((run) => run.kind === 'init')
    || candidates[0]
    || null;
}

function actionableChangeWorkflow(db, changeId, rootDir) {
  const candidates = workflows.listWorkflows(db, { change_id: changeId, limit: 100 }, { rootDir })
    .filter((run) => ['active', 'blocked', 'ready'].includes(run.status));
  return candidates.find((run) => run.status === 'blocked') || candidates[0] || null;
}

function summarizeWorkflow(run) {
  if (!run) return null;
  return {
    id: run.id, kind: run.kind, mode: run.mode, status: run.status,
    current_step: run.current_step, blockers: run.blockers,
  };
}

function summarizeDecision(gate) {
  if (!gate?.thread) return null;
  const current = gate.current_decision;
  return {
    thread_id: gate.thread.id,
    status: gate.thread.status,
    mode: gate.thread.mode,
    current: current ? {
      id: current.id,
      phase: current.phase,
      question: current.question,
      why_now: current.why_now,
      recommendation: current.recommendation,
      options: current.options,
      effects: current.effects,
    } : null,
  };
}

function readBreadcrumb(db, { id } = {}, { rootDir = process.cwd() } = {}) {
  const baselineHealth = baselines.inspectBaseline(db, { rootDir });
  const change = id
    ? db.prepare('SELECT * FROM changes WHERE id = ?').get(id)
    : db.prepare(
      "SELECT * FROM changes WHERE status IN ('active', 'blocked', 'ready') ORDER BY updated_at DESC LIMIT 1",
    ).get();
  if (id && !change) {
    throw new ContextSpineError('CHANGE_NOT_FOUND', `change ${id} not found`);
  }
  if (!change) {
    const baseline = baselineHealth.baseline;
    const activeWorkflow = actionableBaselineWorkflow(db, baseline?.id, rootDir);
    const decisionGate = decisions.decisionGate(
      db, {
        baseline_id: baseline?.id || null,
        workflow_run_id: activeWorkflow?.id || null,
      }, { rootDir },
    );
    const acceptedIntent = decisions.acceptedIntent(db, {
      baseline_id: baseline?.id || null,
      workflow_run_id: activeWorkflow?.id || null,
    });
    if (!decisionGate.ready) {
      return {
        change_id: null, task_id: null, role: 'plan', gate: 'alignment', readiness: 'blocked',
        blockers: [...new Set([...baselineHealth.blockers, ...decisionGate.blockers])],
        warnings: baselineHealth.warnings,
        allowed_transitions: ['ultra-think', 'ultra-status'], required_transition: 'ultra-think',
        workflow: summarizeWorkflow(activeWorkflow),
        decision: summarizeDecision(decisionGate),
        accepted_intent: acceptedIntent,
        context_manifest_path: null, context_manifest_hash: null, git_head: currentHead(rootDir),
        baseline: baseline ? {
          id: baseline.id, mode: baseline.mode, status: baseline.status,
          repository_revision: baseline.repository_revision,
        } : null,
      };
    }
    if (baselineHealth.status !== 'pass') {
      const control = baseline
        ? {
          allowed_transitions: uniqueStrings([
            activeWorkflow ? `ultra-${activeWorkflow.kind}` : 'ultra-research',
            'ultra-status',
            'ultra-doctor',
          ]),
          required_transition: null,
        }
        : {
          allowed_transitions: ['ultra-init', 'ultra-status'],
          required_transition: 'ultra-init',
        };
      return {
        change_id: null, task_id: null, role: 'plan', gate: 'alignment', readiness: 'blocked',
        blockers: baselineHealth.blockers, warnings: baselineHealth.warnings,
        allowed_transitions: control.allowed_transitions,
        required_transition: control.required_transition,
        workflow: summarizeWorkflow(activeWorkflow),
        decision: null,
        accepted_intent: acceptedIntent,
        context_manifest_path: null,
        context_manifest_hash: null, git_head: currentHead(rootDir),
        baseline: baseline ? {
          id: baseline.id, mode: baseline.mode, status: baseline.status,
          repository_revision: baseline.repository_revision,
        } : null,
      };
    }
    return {
      change_id: null, task_id: null, role: 'plan', gate: 'alignment', readiness: 'ready',
      allowed_transitions: ['ultra-change', 'ultra-research', 'ultra-think', 'ultra-status'],
      required_transition: null,
      workflow: null,
      decision: null,
      accepted_intent: acceptedIntent,
      context_manifest_path: null, context_manifest_hash: null, git_head: currentHead(rootDir),
      blockers: [], warnings: baselineHealth.warnings,
      baseline: {
        id: baselineHealth.baseline.id, mode: baselineHealth.baseline.mode,
        status: baselineHealth.baseline.status,
        repository_revision: baselineHealth.baseline.repository_revision,
      },
    };
  }
  const tasks = db.prepare('SELECT id FROM tasks WHERE change_id = ? ORDER BY created_at ASC')
    .all(change.id).map((row) => ops.readTask(db, row.id));
  const activeWorkflow = actionableChangeWorkflow(db, change.id, rootDir);
  const taskId = activeWorkflow?.task_id || tasks.find((row) => row.status === 'in_progress')?.id
    || tasks.find((row) => row.status === 'pending')?.id || null;
  const task = tasks.find((row) => row.id === taskId) || null;
  const expectedBinding = {
    plan: ['plan', 'planning'],
    dev: ['implement', 'implementation'],
    test: ['check', 'verification'],
    review: ['review', 'review'],
    deliver: ['check', 'convergence'],
  }[activeWorkflow?.kind] || (task ? ['implement', 'implementation'] : ['plan', 'planning']);
  const snapshot = latestContextSnapshot(db, {
    change_id: change.id,
    task_id: expectedBinding[0] === 'implement' ? taskId : null,
    role: expectedBinding[0],
    gate: expectedBinding[1],
  });
  const context = parseJson(snapshot?.context_json, {});
  const checkout = baselines.gitWorktreeSnapshot(rootDir, ['.']);
  const head = checkout.head;
  const snapshotMissing = !snapshot;
  const legacyContext = Boolean(
    snapshot && (
      !context.resume || !context.context || !context.readiness || !('baseline' in context)
      || !Object.prototype.hasOwnProperty.call(context.resume, 'worktree_digest')
      || !Object.prototype.hasOwnProperty.call(context.resume, 'task_state_digest')
      || !Object.prototype.hasOwnProperty.call(context.resume, 'change_state_digest')
    ),
  );
  const headStale = Boolean(snapshot?.git_head && head && snapshot.git_head !== head);
  const worktreeStale = Boolean(
    context.resume && context.resume.worktree_digest && checkout.digest
      && context.resume.worktree_digest !== checkout.digest,
  );
  const stateChanged = context.resume?.task_status !== undefined
    && context.resume.task_status !== (task?.status || null);
  const taskContractChanged = Boolean(
    context.resume && (
      context.resume.task_contract_digest
        ? context.resume.task_contract_digest !== taskContractDigest(task)
        : context.resume.task_state_digest !== taskStateDigest(task)
    ),
  );
  const changeContractChanged = Boolean(
    context.resume && context.resume.change_state_digest !== changeStateDigest(change),
  );
  const blockers = [];
  const baselineGate = baselineGateForChange(db, change, baselineHealth);
  const decisionGate = decisions.decisionGate(db, {
    baseline_id: baselineHealth.baseline?.id || null,
    change_id: change.id,
    workflow_run_id: activeWorkflow?.id || null,
  }, { rootDir });
  const acceptedIntent = decisions.acceptedIntent(db, {
    baseline_id: baselineHealth.baseline?.id || null,
    change_id: change.id,
    workflow_run_id: activeWorkflow?.id || null,
  });
  const warnings = [...baselineGate.warnings];
  blockers.push(...baselineGate.blockers);
  blockers.push(...decisionGate.blockers);
  if (snapshotMissing && tasks.length > 0) blockers.push('CONTEXT_NOT_COMPILED');
  else if (snapshotMissing) warnings.push('CONTEXT_NOT_COMPILED');
  else {
    if (legacyContext) blockers.push('CONTEXT_SNAPSHOT_UPGRADE_REQUIRED');
    if (headStale) blockers.push('CONTEXT_HEAD_STALE');
    if (worktreeStale) blockers.push('CONTEXT_WORKTREE_STALE');
    if (stateChanged) blockers.push('CONTEXT_TASK_STATE_STALE');
    if (taskContractChanged) blockers.push('CONTEXT_TASK_CONTRACT_STALE');
    if (changeContractChanged) blockers.push('CONTEXT_CHANGE_CONTRACT_STALE');
    for (const blocker of parseJson(snapshot.blockers_json, [])) {
      if (ADVISORY_CONTEXT_CODES.has(blocker)
        || (blocker.startsWith('BASELINE_') && baselineGate.blockers.length === 0)) {
        if (!warnings.includes(blocker)) warnings.push(blocker);
      } else if (!blockers.includes(blocker)) blockers.push(blocker);
    }
    for (const warning of context.readiness?.warnings || []) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
  }
  const readiness = blockers.length > 0 ? 'blocked' : (snapshot?.readiness || 'ready');
  const control = deriveTransitions({
    change,
    tasks,
    task,
    role: snapshot?.role || 'plan',
    readiness,
    blockers,
    activeWorkflow,
    deliveryReady: deliveryCapabilityReady(db, change, tasks, rootDir),
  });
  return {
    change_id: change.id,
    change_status: change.status,
    task_id: task?.id || null,
    task_status: task?.status || null,
    session_id: task?.session_id || null,
    role: snapshot?.role || 'plan',
    gate: decisionGate.ready ? (snapshot?.gate || 'alignment') : 'alignment',
    readiness,
    blockers,
    warnings: [...new Set(warnings)],
    allowed_transitions: control.allowed_transitions,
    required_transition: control.required_transition,
    context_manifest_path: snapshot?.manifest_path || null,
    context_manifest_hash: snapshot?.manifest_hash || null,
    git_head: head,
    baseline: baselineHealth.baseline ? {
      id: baselineHealth.baseline.id, mode: baselineHealth.baseline.mode,
      status: baselineHealth.baseline.status,
      repository_revision: baselineHealth.baseline.repository_revision,
    } : null,
    workflow: summarizeWorkflow(activeWorkflow),
    decision: summarizeDecision(decisionGate),
    accepted_intent: acceptedIntent,
  };
}

module.exports = {
  ContextSpineError,
  baselineGateForChange,
  changeStateDigest,
  compileRoleContext,
  deriveTransitions,
  latestContextSnapshot,
  readBreadcrumb,
  taskContractDigest,
  validateContextSnapshot,
};
