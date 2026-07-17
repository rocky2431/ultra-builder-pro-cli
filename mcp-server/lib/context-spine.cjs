'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROLES = new Set(['plan', 'implement', 'check', 'review']);
const GATES = new Set([
  'alignment', 'planning', 'implementation', 'verification', 'review', 'convergence', 'recovery',
]);
const CONTEXT_KINDS = new Set(['spec', 'source', 'test', 'docs', 'external']);
const SLICE_KINDS = new Set(['tracer_bullet', 'expand_contract', 'integration_checkpoint']);
const DEFAULT_BUDGET = Object.freeze({ max_tokens: 12_000, max_files: 12 });

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

function nonEmpty(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ContextSpineError('VALIDATION_ERROR', `${field} must be a non-empty string`);
  return text;
}

function localPath(rootDir, ref) {
  const candidate = ref.split('#', 1)[0];
  if (!candidate || path.isAbsolute(candidate)) {
    throw new ContextSpineError('VALIDATION_ERROR', `context ref must be project-relative: ${ref}`);
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new ContextSpineError('VALIDATION_ERROR', `context ref escapes project root: ${ref}`);
  }
  return resolved;
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
  const ref = typeof value === 'string'
    ? value
    : value && (value.ref || value.path || value.reference);
  if (!ref) throw new ContextSpineError('VALIDATION_ERROR', 'spec_refs entries require path/ref/reference');
  return {
    ref,
    kind: 'spec',
    reason: (value && value.reason) || `Specification evidence for ${role}`,
    required: value?.required !== false,
    digest: value && value.digest,
  };
}

function normalizeRefs(input, role, inherited) {
  let refs;
  if (input.context_refs !== undefined) refs = input.context_refs;
  else if (input.spec_refs !== undefined) refs = input.spec_refs.map((value) => specRefToContextRef(value, role));
  else refs = inherited || [];
  if (!Array.isArray(refs)) {
    throw new ContextSpineError('VALIDATION_ERROR', 'context_refs must be an array');
  }
  return refs.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ContextSpineError('VALIDATION_ERROR', `context_refs[${index}] must be an object`);
    }
    const ref = nonEmpty(value.ref || value.path || value.reference, `context_refs[${index}].ref`);
    const kind = value.kind || 'source';
    if (!CONTEXT_KINDS.has(kind)) {
      throw new ContextSpineError('VALIDATION_ERROR', `unsupported context kind: ${kind}`);
    }
    const reason = nonEmpty(value.reason, `context_refs[${index}].reason`);
    if (value.digest !== undefined && !/^[0-9a-f]{64}$/.test(value.digest)) {
      throw new ContextSpineError('VALIDATION_ERROR', `context_refs[${index}].digest must be sha256`);
    }
    return {
      ref, kind, reason, required: value.required !== false,
      expected_digest: value.digest || null,
    };
  });
}

function inspectRef(rootDir, role, value) {
  if (value.kind === 'external' || /^[a-z][a-z0-9+.-]*:\/\//i.test(value.ref)) {
    return { ...value, role, status: 'external', digest: value.expected_digest, estimated_tokens: 0 };
  }
  const file = localPath(rootDir, value.ref);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return { ...value, role, status: 'missing', digest: null, estimated_tokens: 0 };
  }
  const content = fs.readFileSync(file);
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  const status = value.expected_digest && value.expected_digest !== digest ? 'stale' : 'current';
  return {
    ...value, role, status, digest,
    estimated_tokens: Math.max(1, Math.ceil(content.byteLength / 4)),
  };
}

function normalizeExecutionContract(input, inherited, { taskId }) {
  const source = input.execution_contract || inherited || null;
  if (!taskId) return source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const sliceKind = source.slice_kind || 'tracer_bullet';
  if (!SLICE_KINDS.has(sliceKind)) {
    throw new ContextSpineError('VALIDATION_ERROR', `unsupported slice kind: ${sliceKind}`);
  }
  const percent = Number(source.context_budget_percent ?? 40);
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new ContextSpineError('VALIDATION_ERROR', 'context_budget_percent must be an integer from 1 to 100');
  }
  return {
    slice_kind: sliceKind,
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

function deriveNextAction({ change, tasks, task, role, readiness, explicit }) {
  if (readiness === 'blocked') return 'Resolve the context readiness blockers, then recompile change.context.';
  if (explicit && String(explicit).trim()) return String(explicit).trim();
  if (change.status === 'ready') return `Run ultra-deliver for change ${change.id}.`;
  if (change.status === 'blocked') return `Resolve the blockers for change ${change.id}, then recompile context.`;
  if (!task && tasks.length === 0) return `Create the first fresh-context tracer-bullet task for change ${change.id}.`;
  if (task?.status === 'pending') return `Start task ${task.id} through ultra-dev.`;
  if (task?.status === 'in_progress') {
    if (role === 'check') return `Run the exact verification command for task ${task.id}.`;
    if (role === 'review') return `Complete independent spec-fidelity and engineering-standards review for task ${task.id}.`;
    return `Continue the approved vertical slice for task ${task.id}.`;
  }
  if (tasks.length > 0 && tasks.every((row) => ['completed', 'expanded'].includes(row.status))) {
    return `Run ultra-test for change ${change.id}.`;
  }
  const pending = tasks.find((row) => row.status === 'pending');
  return pending ? `Compile implement context for task ${pending.id}.` : `Inspect blockers for change ${change.id}.`;
}

function latestContext(db, changeId, taskId) {
  const row = taskId
    ? db.prepare(
      'SELECT context_json FROM context_snapshots WHERE change_id = ? AND task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    ).get(changeId, taskId)
    : db.prepare(
      'SELECT context_json FROM context_snapshots WHERE change_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    ).get(changeId);
  return parseJson(row?.context_json, {});
}

function compileRoleContext(db, { input, change, tasks, rootDir }) {
  const task = input.task_id ? tasks.find((row) => row.id === input.task_id) : null;
  if (input.task_id && !task) {
    throw new ContextSpineError('TASK_NOT_FOUND', `task ${input.task_id} is not linked to change ${change.id}`);
  }
  const inherited = latestContext(db, change.id, input.task_id || null);
  const role = input.role || (input.task_id ? 'implement' : 'plan');
  if (!ROLES.has(role)) throw new ContextSpineError('VALIDATION_ERROR', `unsupported context role: ${role}`);
  const gate = input.gate || defaultGate(role);
  if (!GATES.has(gate)) throw new ContextSpineError('VALIDATION_ERROR', `unsupported workflow gate: ${gate}`);

  const refs = normalizeRefs(input, role, inherited.context?.items);
  const items = refs.map((value) => inspectRef(rootDir, role, value));
  const budget = normalizeBudget(input.budget, inherited.context?.budget);
  const tokenEstimate = items.reduce((sum, item) => sum + item.estimated_tokens, 0);
  const fileCount = items.filter((item) => item.status !== 'external').length;
  const executionContract = normalizeExecutionContract(
    input, inherited.execution_contract, { taskId: input.task_id },
  );
  const blockers = [];
  for (const item of items) {
    if (item.required && item.status === 'missing') blockers.push(`CONTEXT_REQUIRED_REF_MISSING:${item.ref}`);
    if (item.required && item.status === 'stale') blockers.push(`CONTEXT_REQUIRED_REF_STALE:${item.ref}`);
  }
  if (fileCount > budget.max_files) blockers.push('CONTEXT_FILE_BUDGET_EXCEEDED');
  if (tokenEstimate > budget.max_tokens) blockers.push('CONTEXT_TOKEN_BUDGET_EXCEEDED');
  if (input.task_id) {
    if (!executionContract) blockers.push('EXECUTION_CONTRACT_MISSING');
    else {
      if (!executionContract.public_seam) blockers.push('EXECUTION_PUBLIC_SEAM_MISSING');
      if (!executionContract.verification_command) blockers.push('EXECUTION_VERIFICATION_COMMAND_MISSING');
      if (executionContract.slice_kind !== 'expand_contract'
        && executionContract.context_budget_percent > 40) {
        blockers.push('EXECUTION_CONTEXT_BUDGET_EXCEEDED');
      }
    }
  }
  const readiness = blockers.length === 0 ? 'ready' : 'blocked';
  const nextAction = deriveNextAction({
    change, tasks, task, role, readiness, explicit: input.next_action,
  });
  return {
    role,
    gate,
    next_action: nextAction,
    readiness: { status: readiness, blockers },
    context: { items, budget, token_estimate: tokenEstimate, file_count: fileCount },
    execution_contract: executionContract,
    selected_task: task,
    resume: {
      change_id: change.id,
      task_id: task?.id || null,
      task_status: task?.status || null,
      session_id: task?.session_id || null,
      role,
      gate,
      git_head: currentHead(rootDir),
    },
  };
}

function recommendedWorkflow(change, task, tasks, readiness) {
  if (!change) return 'ultra-change';
  if (readiness !== 'ready' || change.status === 'blocked') return 'ultra-change';
  if (change.status === 'ready') return 'ultra-deliver';
  if (task && ['pending', 'in_progress'].includes(task.status)) return 'ultra-dev';
  if (tasks.length > 0 && tasks.every((row) => ['completed', 'expanded'].includes(row.status))) return 'ultra-test';
  return 'ultra-change';
}

function readBreadcrumb(db, { id } = {}, { rootDir = process.cwd() } = {}) {
  const change = id
    ? db.prepare('SELECT * FROM changes WHERE id = ?').get(id)
    : db.prepare(
      "SELECT * FROM changes WHERE status IN ('active', 'blocked', 'ready') ORDER BY updated_at DESC LIMIT 1",
    ).get();
  if (id && !change) {
    throw new ContextSpineError('CHANGE_NOT_FOUND', `change ${id} not found`);
  }
  if (!change) {
    return {
      change_id: null, task_id: null, role: 'plan', gate: 'alignment', readiness: 'ready',
      next_action: 'Start daily work with ultra-change.', recommended_workflow: 'ultra-change',
      context_manifest_path: null, context_manifest_hash: null, git_head: currentHead(rootDir),
    };
  }
  const tasks = db.prepare('SELECT * FROM tasks WHERE change_id = ? ORDER BY created_at ASC').all(change.id);
  const snapshot = db.prepare(
    'SELECT * FROM context_snapshots WHERE change_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
  ).get(change.id);
  const context = parseJson(snapshot?.context_json, {});
  const taskId = snapshot?.task_id || tasks.find((row) => row.status === 'in_progress')?.id
    || tasks.find((row) => row.status === 'pending')?.id || null;
  const task = tasks.find((row) => row.id === taskId) || null;
  const head = currentHead(rootDir);
  const snapshotMissing = !snapshot;
  const legacyContext = Boolean(snapshot && (!context.resume || !context.context || !context.readiness));
  const headStale = Boolean(snapshot?.git_head && head && snapshot.git_head !== head);
  const stateChanged = context.resume?.task_status !== undefined
    && context.resume.task_status !== (task?.status || null);
  const blockers = [];
  if (snapshotMissing) blockers.push('CONTEXT_NOT_COMPILED');
  else {
    if (legacyContext) blockers.push('CONTEXT_SNAPSHOT_UPGRADE_REQUIRED');
    if (headStale) blockers.push('CONTEXT_HEAD_STALE');
    if (stateChanged) blockers.push('CONTEXT_TASK_STATE_STALE');
    for (const blocker of parseJson(snapshot.blockers_json, [])) {
      if (!blockers.includes(blocker)) blockers.push(blocker);
    }
  }
  const readiness = blockers.length > 0 ? 'blocked' : snapshot.readiness;
  let nextAction;
  if (snapshotMissing) {
    nextAction = `Compile change.context for change ${change.id} before continuing.`;
  } else if (legacyContext) {
    nextAction = 'Recompile change.context to upgrade this legacy context snapshot.';
  } else if (headStale) {
    nextAction = 'Git HEAD changed after context compilation; recompile change.context.';
  } else if (stateChanged) {
    nextAction = 'Task state changed after context compilation; recompile change.context.';
  } else {
    nextAction = deriveNextAction({
      change, tasks, task, role: snapshot?.role || 'plan', readiness,
      explicit: snapshot?.next_action,
    });
  }
  return {
    change_id: change.id,
    change_status: change.status,
    task_id: task?.id || null,
    task_status: task?.status || null,
    session_id: task?.session_id || null,
    role: snapshot?.role || 'plan',
    gate: snapshot?.gate || 'alignment',
    readiness,
    blockers,
    next_action: nextAction,
    recommended_workflow: recommendedWorkflow(change, task, tasks, readiness),
    context_manifest_path: snapshot?.manifest_path || null,
    context_manifest_hash: snapshot?.manifest_hash || null,
    git_head: head,
  };
}

module.exports = {
  ContextSpineError,
  compileRoleContext,
  deriveNextAction,
  readBreadcrumb,
};
