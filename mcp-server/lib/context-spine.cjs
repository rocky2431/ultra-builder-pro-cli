'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const baselines = require('./baseline-workflow.cjs');
const workflows = require('./workflow-state.cjs');
const decisions = require('./decision-dialogue.cjs');
const ops = require('./state-ops.cjs');

const ROLES = new Set(['plan', 'implement', 'check', 'review']);
const GATES = new Set([
  'alignment', 'planning', 'implementation', 'verification', 'review', 'convergence', 'recovery',
]);
const CONTEXT_KINDS = new Set(['spec', 'source', 'test', 'docs', 'external']);
const SLICE_KINDS = new Set(['tracer_bullet', 'expand_contract', 'integration_checkpoint']);
const DEFAULT_BUDGET = Object.freeze({ max_tokens: 12_000, max_files: 12 });
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

function deriveNextAction({ change, tasks, task, role, readiness, blockers = [] }) {
  if (readiness === 'blocked') {
    if (blockers.some((blocker) => blocker.startsWith('BASELINE_'))) {
      return 'Complete or refresh the Ultra project baseline, then recompile change.context.';
    }
    return 'Resolve the context readiness blockers, then recompile change.context.';
  }
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
  if (input.next_action !== undefined) {
    throw new ContextSpineError(
      'CONTEXT_NEXT_ACTION_AUTHORITY_VIOLATION',
      'next_action is derived from authoritative workflow and task state',
    );
  }
  const task = input.task_id ? tasks.find((row) => row.id === input.task_id) : null;
  if (input.task_id && !task) {
    throw new ContextSpineError('TASK_NOT_FOUND', `task ${input.task_id} is not linked to change ${change.id}`);
  }
  const inherited = latestContext(db, change.id, input.task_id || null);
  const role = input.role || (input.task_id ? 'implement' : 'plan');
  if (!ROLES.has(role)) throw new ContextSpineError('VALIDATION_ERROR', `unsupported context role: ${role}`);
  const gate = input.gate || defaultGate(role);
  if (!GATES.has(gate)) throw new ContextSpineError('VALIDATION_ERROR', `unsupported workflow gate: ${gate}`);

  const refs = authoritativeTaskRefs(input, role, task)
    || normalizeRefs(input, role, inherited.context?.items || []);
  const items = refs.map((value) => inspectRef(rootDir, role, value));
  const budget = normalizeBudget(input.budget, inherited.context?.budget);
  const tokenEstimate = items.reduce((sum, item) => sum + item.estimated_tokens, 0);
  const fileCount = items.filter((item) => item.status !== 'external').length;
  const executionContract = normalizeExecutionContract(
    input, inherited.execution_contract, { task },
  );
  const blockers = [];
  const warnings = [];
  const baselineHealth = baselines.inspectBaseline(db, { rootDir });
  const checkout = baselines.gitWorktreeSnapshot(rootDir, ['.']);
  const baselineGate = baselineGateForChange(db, change, baselineHealth);
  blockers.push(...baselineGate.blockers);
  warnings.push(...baselineGate.warnings);
  for (const item of items) {
    if (item.required && item.status === 'missing') blockers.push(`CONTEXT_REQUIRED_REF_MISSING:${item.ref}`);
    if (item.required && item.status === 'stale') blockers.push(`CONTEXT_REQUIRED_REF_STALE:${item.ref}`);
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
  const nextAction = deriveNextAction({
    change, tasks, task, role, readiness, blockers,
  });
  return {
    role,
    gate,
    next_action: nextAction,
    readiness: { status: readiness, blockers, warnings: [...new Set(warnings)] },
    context: { items, budget, token_estimate: tokenEstimate, file_count: fileCount },
    execution_contract: executionContract,
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
      task_id: task?.id || null,
      task_status: task?.status || null,
      task_state_digest: taskStateDigest(task),
      session_id: task?.session_id || null,
      role,
      gate,
      git_head: checkout.head,
      worktree_state: checkout.state,
      worktree_digest: checkout.digest,
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

function workflowNextAction(run) {
  if (run.status === 'blocked') {
    return `Resolve ${run.kind} workflow blockers at ${run.current_step}: ${run.blockers.join(', ')}.`;
  }
  if (run.status === 'ready') {
    return `Finalize ${run.kind} workflow ${run.id} after verifying its recorded evidence and outputs.`;
  }
  return `Continue ${run.kind} workflow ${run.id} at ${run.current_step}.`;
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

function decisionNextAction(gate) {
  if (gate.blockers?.some((blocker) => blocker.startsWith('DECISION_CHECKPOINT_ARTIFACT_STALE:'))) {
    return `Reprepare and confirm decision checkpoint ${gate.thread?.id || 'for the active alignment thread'} against the current artifact.`;
  }
  if (gate.current_decision) {
    return `Answer decision ${gate.current_decision.id}: ${gate.current_decision.question}`;
  }
  if (gate.thread?.status === 'checkpoint_ready') {
    return `Confirm decision checkpoint ${gate.thread.id} after reviewing its durable effects.`;
  }
  return `Prepare the confirmed decision checkpoint for ${gate.thread?.id || 'the active alignment thread'}.`;
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
    const decisionGate = decisions.decisionGate(
      db, { baseline_id: baseline?.id || null }, { rootDir },
    );
    if (!decisionGate.ready) {
      return {
        change_id: null, task_id: null, role: 'plan', gate: 'alignment', readiness: 'blocked',
        blockers: [...new Set([...baselineHealth.blockers, ...decisionGate.blockers])],
        warnings: baselineHealth.warnings,
        next_action: decisionNextAction(decisionGate), recommended_workflow: 'ultra-think',
        workflow: null, decision: summarizeDecision(decisionGate),
        context_manifest_path: null, context_manifest_hash: null, git_head: currentHead(rootDir),
        baseline: baseline ? {
          id: baseline.id, mode: baseline.mode, status: baseline.status,
          repository_revision: baseline.repository_revision,
        } : null,
      };
    }
    if (baselineHealth.status !== 'pass') {
      const activeWorkflow = actionableBaselineWorkflow(db, baseline?.id, rootDir);
      const nextAction = activeWorkflow
        ? workflowNextAction(activeWorkflow)
        : baseline
        ? `Complete ${baseline.mode} baseline adoption ${baseline.id} through ultra-init.`
        : 'Initialize the project and start baseline adoption with ultra-init.';
      return {
        change_id: null, task_id: null, role: 'plan', gate: 'alignment', readiness: 'blocked',
        blockers: baselineHealth.blockers, warnings: baselineHealth.warnings, next_action: nextAction,
        recommended_workflow: activeWorkflow ? `ultra-${activeWorkflow.kind}` : 'ultra-init',
        workflow: summarizeWorkflow(activeWorkflow), decision: null, context_manifest_path: null,
        context_manifest_hash: null, git_head: currentHead(rootDir),
        baseline: baseline ? {
          id: baseline.id, mode: baseline.mode, status: baseline.status,
          repository_revision: baseline.repository_revision,
        } : null,
      };
    }
    return {
      change_id: null, task_id: null, role: 'plan', gate: 'alignment', readiness: 'ready',
      next_action: 'Start daily work with ultra-change.', recommended_workflow: 'ultra-change',
      workflow: null,
      decision: null,
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
  const snapshot = db.prepare(
    'SELECT * FROM context_snapshots WHERE change_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
  ).get(change.id);
  const context = parseJson(snapshot?.context_json, {});
  const taskId = snapshot?.task_id || tasks.find((row) => row.status === 'in_progress')?.id
    || tasks.find((row) => row.status === 'pending')?.id || null;
  const task = tasks.find((row) => row.id === taskId) || null;
  const checkout = baselines.gitWorktreeSnapshot(rootDir, ['.']);
  const head = checkout.head;
  const snapshotMissing = !snapshot;
  const legacyContext = Boolean(
    snapshot && (
      !context.resume || !context.context || !context.readiness || !('baseline' in context)
      || !Object.prototype.hasOwnProperty.call(context.resume, 'worktree_digest')
      || !Object.prototype.hasOwnProperty.call(context.resume, 'task_state_digest')
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
    context.resume && context.resume.task_state_digest !== taskStateDigest(task),
  );
  const blockers = [];
  const baselineGate = baselineGateForChange(db, change, baselineHealth);
  const decisionGate = decisions.decisionGate(db, {
    baseline_id: baselineHealth.baseline?.id || null,
    change_id: change.id,
    workflow_run_id: actionableChangeWorkflow(db, change.id, rootDir)?.id || null,
  }, { rootDir });
  const warnings = [...baselineGate.warnings];
  blockers.push(...baselineGate.blockers);
  blockers.push(...decisionGate.blockers);
  if (snapshotMissing) blockers.push('CONTEXT_NOT_COMPILED');
  else {
    if (legacyContext) blockers.push('CONTEXT_SNAPSHOT_UPGRADE_REQUIRED');
    if (headStale) blockers.push('CONTEXT_HEAD_STALE');
    if (worktreeStale) blockers.push('CONTEXT_WORKTREE_STALE');
    if (stateChanged) blockers.push('CONTEXT_TASK_STATE_STALE');
    if (taskContractChanged) blockers.push('CONTEXT_TASK_CONTRACT_STALE');
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
  const readiness = blockers.length > 0 ? 'blocked' : snapshot.readiness;
  const activeWorkflow = actionableChangeWorkflow(db, change.id, rootDir);
  let nextAction;
  if (baselineGate.blockers.length > 0) {
    nextAction = deriveNextAction({
      change, tasks, task, role: snapshot?.role || 'plan', readiness: 'blocked',
      blockers: baselineGate.blockers,
    });
  } else if (!decisionGate.ready) {
    nextAction = decisionNextAction(decisionGate);
  } else if (activeWorkflow?.status === 'blocked') {
    nextAction = workflowNextAction(activeWorkflow);
  } else if (snapshotMissing) {
    nextAction = `Compile change.context for change ${change.id} before continuing.`;
  } else if (legacyContext) {
    nextAction = 'Recompile change.context to upgrade this legacy context snapshot.';
  } else if (headStale) {
    nextAction = 'Git HEAD changed after context compilation; recompile change.context.';
  } else if (worktreeStale) {
    nextAction = 'The worktree changed after context compilation; recompile change.context.';
  } else if (stateChanged) {
    nextAction = 'Task state changed after context compilation; recompile change.context.';
  } else if (taskContractChanged) {
    nextAction = 'The task execution contract changed after context compilation; recompile change.context.';
  } else if (activeWorkflow) {
    nextAction = workflowNextAction(activeWorkflow);
  } else {
    nextAction = deriveNextAction({
      change, tasks, task, role: snapshot?.role || 'plan', readiness,
      blockers,
    });
  }
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
    next_action: nextAction,
    recommended_workflow: baselineGate.blockers.length > 0
      ? (baselineHealth.baseline?.status === 'ready' ? 'ultra-doctor' : 'ultra-init')
      : !decisionGate.ready
        ? 'ultra-think'
        : activeWorkflow
        ? `ultra-${activeWorkflow.kind}`
        : recommendedWorkflow(change, task, tasks, readiness),
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
  };
}

module.exports = {
  ContextSpineError,
  baselineGateForChange,
  compileRoleContext,
  deriveNextAction,
  readBreadcrumb,
};
