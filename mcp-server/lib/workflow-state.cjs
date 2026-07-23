'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const ops = require('./state-ops.cjs');
const decisionDialogue = require('./decision-dialogue.cjs');
const testReportSchema = require('../../spec/schemas/test-report.v1.schema.json');
const deliveryReportSchema = require('../../spec/schemas/delivery-report.v1.schema.json');

const DEFINITION_VERSION = '2.0';
const RUN_KINDS = new Set(['init', 'research', 'plan', 'change', 'dev', 'test', 'review', 'deliver']);
const RUN_STATUSES = new Set(['active', 'blocked', 'ready', 'completed', 'cancelled']);
const STEP_STATUSES = new Set(['pending', 'in_progress', 'completed', 'skipped', 'blocked']);

const reportAjv = new Ajv({ allErrors: true, strict: false });
addFormats(reportAjv);
const REPORT_VALIDATORS = Object.freeze({
  test: reportAjv.compile(testReportSchema),
  delivery: reportAjv.compile(deliveryReportSchema),
});

function step(id, title, options = {}) {
  return Object.freeze({ id, title, ...options });
}

const WORKFLOW_DEFINITIONS = Object.freeze({
  init: Object.freeze([
    step('inspect-authority', 'Inspect repository and existing Ultra authority'),
    step('classify-repository', 'Classify greenfield, brownfield, or migrated state'),
    step('scaffold-authority', 'Create or resume the authoritative state and scaffold'),
    step('verify-initialization', 'Verify authority, projections, and the initialization result', { evidence_required: true }),
  ]),
  research: Object.freeze([
    step('00-problem-validation', 'Validate the problem and demand evidence', { evidence_required: true, output_required: true }),
    step('01-opportunity-discovery', 'Map outcomes and opportunity space', { evidence_required: true, output_required: true }),
    step('02-market-assessment', 'Assess the relevant market and constraints', { evidence_required: true, output_required: true }),
    step('03-competitive-landscape', 'Assess direct, adjacent, and substitute alternatives', { evidence_required: true, output_required: true }),
    step('04-product-strategy', 'Define product strategy and explicit tradeoffs', { evidence_required: true, output_required: true }),
    step('05-assumptions-validation', 'Identify assumptions and validation evidence', { evidence_required: true, output_required: true }),
    step('10-user-personas', 'Describe evidence-backed actors and jobs', { evidence_required: true, output_required: true }),
    step('11-user-scenarios', 'Trace current and desired user scenarios', { evidence_required: true, output_required: true }),
    step('20-user-stories', 'Define behavior and acceptance contracts', { evidence_required: true, output_required: true }),
    step('21-features-scope', 'Define scope, exclusions, and dependencies', { evidence_required: true, output_required: true }),
    step('22-success-metrics', 'Define measurable outcomes and anti-metrics', { evidence_required: true, output_required: true }),
    step('30-architecture-context', 'Record quality goals, constraints, and system context', { evidence_required: true, output_required: true }),
    step('31-solution-strategy', 'Select solution strategy from accepted constraints', { evidence_required: true, output_required: true }),
    step('32-building-blocks', 'Define building blocks and runtime paths', { evidence_required: true, output_required: true }),
    step('40-deployment', 'Define environments, delivery, rollback, and operations', { evidence_required: true, output_required: true }),
    step('41-quality-risks', 'Define quality scenarios, risks, and recovery', { evidence_required: true, output_required: true }),
    step('99-synthesis', 'Validate traceability and compile planning context', { evidence_required: true, output_required: true }),
  ]),
  plan: Object.freeze([
    step('validate-baseline', 'Validate baseline and research coverage', { evidence_required: true }),
    step('analyze-requirements', 'Trace requirements and acceptance'),
    step('analyze-codebase', 'Inspect current codebase patterns and boundaries', { evidence_required: true }),
    step('design-slices', 'Design walking skeleton and vertical slices'),
    step('validate-dependencies', 'Validate ownership, dependencies, and parallel waves', { evidence_required: true }),
    step('persist-task-contracts', 'Persist tasks and complete execution contracts', { evidence_required: true }),
    step('verify-plan', 'Read back and verify the authoritative plan', {
      evidence_required: true, output_required: true,
    }),
  ]),
  change: Object.freeze([
    step('bind-baseline', 'Bind current baseline and repository revision', { evidence_required: true }),
    step('classify-change', 'Classify quick, standard, major, or incident'),
    step('record-intent', 'Record intent, scope, acceptance, and documentation impact', { evidence_required: true }),
  ]),
  dev: Object.freeze([
    step('bind-task', 'Bind the authoritative task and dependencies', { evidence_required: true }),
    step('compile-context', 'Compile fresh implementation context', { evidence_required: true, output_required: true }),
    step('establish-feedback-loop', 'Establish the failing or characterization signal', { evidence_required: true }),
    step('implement-slice', 'Implement the complete live-path slice'),
    step('verify-slice', 'Run focused, adjacent, build, and public-seam checks', { evidence_required: true }),
    step('review-slice', 'Run independent specification and engineering review', { evidence_required: true }),
    step('record-completion', 'Record completion evidence and final task state', { evidence_required: true }),
  ]),
  test: Object.freeze([
    step('bind-scope', 'Bind completed tasks and current revision', { evidence_required: true }),
    step('compile-context', 'Compile independent checking context', { evidence_required: true, output_required: true }),
    step('map-acceptance', 'Map acceptance claims to executable checks'),
    step('execute-checks', 'Execute the risk-selected verification profile', { evidence_required: true }),
    step('verify-public-seam', 'Verify the declared public seam', { evidence_required: true }),
    step('write-report', 'Write the current test evidence report', { evidence_required: true, output_required: true }),
    step('verify-test-gate', 'Verify report freshness and expose valid transitions', { evidence_required: true }),
  ]),
  review: Object.freeze([
    step('bind-diff', 'Bind one current diff and acceptance scope', { evidence_required: true }),
    step('compile-context', 'Compile independent review context', { evidence_required: true, output_required: true }),
    step('review-specification', 'Run specification-fidelity review', { evidence_required: true, output_required: true }),
    step('review-engineering', 'Run engineering-standards review', { evidence_required: true, output_required: true }),
    step('coordinate-findings', 'Coordinate findings without collapsing axes', { evidence_required: true, output_required: true }),
    step('verify-review-gate', 'Verify both verdict axes and current revision', { evidence_required: true }),
  ]),
  deliver: Object.freeze([
    step('bind-evidence', 'Bind current test, review, task, and revision evidence', { evidence_required: true }),
    step('reconcile-specifications', 'Resolve learning and reconcile specifications', { evidence_required: true }),
    step('verify-candidate', 'Verify the local delivery candidate and recovery path', { evidence_required: true, output_required: true }),
    step('converge-authority', 'Converge baseline or change authority', { evidence_required: true }),
    step('archive-change', 'Archive the converged change when applicable', { evidence_required: true }),
    step('verify-delivery', 'Verify local delivery and recovery evidence', { evidence_required: true, output_required: true }),
  ]),
});

const RESEARCH_DISPOSITIONS = new Set([
  'execute', 'verify_existing', 'reuse', 'not_applicable', 'deferred',
]);

const RESEARCH_MODES = Object.freeze({
  full: WORKFLOW_DEFINITIONS.research.map((item) => item.id),
  adoption: WORKFLOW_DEFINITIONS.research.map((item) => item.id),
  product: WORKFLOW_DEFINITIONS.research
    .filter((item) => Number.parseInt(item.id, 10) < 30 || item.id === '99-synthesis')
    .map((item) => item.id),
  feature: ['10-user-personas', '11-user-scenarios', '20-user-stories', '21-features-scope', '22-success-metrics', '99-synthesis'],
  architecture: ['30-architecture-context', '31-solution-strategy', '32-building-blocks', '40-deployment', '41-quality-risks', '99-synthesis'],
});

const RESEARCH_SEMANTIC_CONTRACTS = Object.freeze({
  '00-problem-validation': ['problem', ['actor', 'current_workaround', 'consequence', 'evidence_status']],
  '01-opportunity-discovery': ['opportunity', ['actor', 'desired_outcome', 'evidence_status']],
  '02-market-assessment': ['market_constraint', ['constraint', 'decision_impact', 'freshness']],
  '03-competitive-landscape': ['alternative', ['category', 'switching_constraint', 'strategy_implication']],
  '04-product-strategy': ['strategy_decision', ['tradeoff', 'rationale']],
  '05-assumptions-validation': ['assumption', [
    'category', 'consequence', 'validation_signal', 'success_rule', 'failure_rule', 'ambiguous_rule',
  ]],
  '10-user-personas': ['actor', ['job', 'current_workflow', 'goal', 'constraint']],
  '11-user-scenarios': ['scenario', [
    'actor_id', 'trigger', 'preconditions', 'flow', 'success', 'failure', 'recovery',
  ]],
  '20-user-stories': ['requirement', [
    'preconditions', 'action', 'observable_result', 'error_recovery', 'verification',
  ]],
  '21-features-scope': ['capability', ['requirement_ids', 'scope_status', 'rationale']],
  '22-success-metrics': ['metric', ['definition', 'source', 'window', 'owner', 'decision_use']],
  '30-architecture-context': ['architecture_context', [
    'boundary', 'inputs_outputs', 'trust_authority', 'consumers',
  ]],
  '31-solution-strategy': ['architecture_decision', [
    'drivers', 'direction', 'consequences', 'compatibility', 'recovery',
  ]],
  '32-building-blocks': ['runtime_path', [
    'entry_point', 'state_side_effects', 'observable_result', 'failure_recovery', 'consumers',
  ]],
  '40-deployment': ['deployment', [
    'environment', 'entry_point', 'config_migration', 'observation', 'rollback_recovery',
  ]],
  '41-quality-risks': ['risk', [
    'trigger_condition', 'expected_response', 'measurement', 'mitigation', 'recovery', 'owner',
  ]],
  '99-synthesis': ['synthesis_trace', [
    'problem_id', 'scenario_id', 'requirement_ids', 'architecture_path_ids', 'verification_refs',
  ]],
});

const SEMANTIC_STATUSES = new Set(['observed', 'verified', 'decided', 'accepted', 'unknown', 'not_applicable']);
const SEMANTIC_ID = /^[a-zA-Z0-9_-]+$/;

class WorkflowStateError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'WorkflowStateError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function assertReportSchema(report, kind) {
  const validate = REPORT_VALIDATORS[kind];
  if (!validate(report)) {
    throw new WorkflowStateError(
      'WORKFLOW_REPORT_INVALID',
      `${kind} report does not satisfy its published schema: ${reportAjv.errorsText(validate.errors)}`,
      validate.errors,
    );
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, field, fallback) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); }
  catch (error) {
    throw new WorkflowStateError('STATE_CORRUPT', `invalid ${field}: ${error.message}`);
  }
}

function nonEmpty(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new WorkflowStateError('VALIDATION_ERROR', `${field} must be a non-empty string`);
  return text;
}

function safeProjectFile(rootDir, candidate, field) {
  const relative = nonEmpty(candidate, field);
  if (path.isAbsolute(relative)) {
    throw new WorkflowStateError('VALIDATION_ERROR', `${field} must be project-relative`);
  }
  const root = path.resolve(rootDir);
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    throw new WorkflowStateError('VALIDATION_ERROR', `${field} escapes project root`);
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new WorkflowStateError('WORKFLOW_OUTPUT_MISSING', `workflow output does not exist: ${relative}`);
  }
  return { relative, file };
}

function normalizeObjects(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new WorkflowStateError('VALIDATION_ERROR', `${field} must be an array of objects`);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeEvidence(value) {
  const evidence = normalizeObjects(value, 'evidence');
  return evidence.map((item, index) => ({
    kind: nonEmpty(item.kind, `evidence[${index}].kind`),
    ref: nonEmpty(item.ref, `evidence[${index}].ref`),
    summary: nonEmpty(item.summary, `evidence[${index}].summary`),
  }));
}

function normalizeOutputs(value, rootDir) {
  const outputs = normalizeObjects(value, 'outputs');
  return outputs.map((item, index) => {
    const resolved = safeProjectFile(rootDir, item.path, `outputs[${index}].path`);
    return {
      path: resolved.relative,
      kind: nonEmpty(item.kind, `outputs[${index}].kind`),
      digest: crypto.createHash('sha256').update(fs.readFileSync(resolved.file)).digest('hex'),
    };
  });
}

function markdownSlug(value) {
  return String(value).trim().toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function sourceRefFile(rootDir, sourceRef, field) {
  const ref = nonEmpty(sourceRef, field);
  const separator = ref.lastIndexOf('#');
  if (separator <= 0 || separator === ref.length - 1) {
    throw new WorkflowStateError('WORKFLOW_SEMANTIC_SOURCE_INVALID', `${field} must use path#anchor`);
  }
  const relative = ref.slice(0, separator);
  const anchor = ref.slice(separator + 1).trim().toLowerCase();
  const resolved = safeProjectFile(rootDir, relative, field);
  const content = fs.readFileSync(resolved.file, 'utf8');
  const anchors = new Set();
  for (const match of content.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) anchors.add(markdownSlug(match[1]));
  for (const match of content.matchAll(/<a\s+(?:name|id)=["']([^"']+)["'][^>]*>/gi)) {
    anchors.add(match[1].trim().toLowerCase());
  }
  if (!anchors.has(anchor)) {
    throw new WorkflowStateError(
      'WORKFLOW_SEMANTIC_SOURCE_INVALID', `${field} anchor does not exist: ${ref}`,
    );
  }
  return {
    ref, relative, anchor,
    digest: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

function semanticValuePresent(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0 && value.every(semanticValuePresent);
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function normalizeSemanticRecords(value, stepId, rootDir) {
  const records = normalizeObjects(value, 'semantic_records');
  const contract = RESEARCH_SEMANTIC_CONTRACTS[stepId];
  if (!contract) return records;
  if (records.length === 0) {
    throw new WorkflowStateError(
      'WORKFLOW_SEMANTIC_RECORDS_REQUIRED', `${stepId} requires at least one typed semantic record`,
    );
  }
  const [expectedKind, requiredAttributes] = contract;
  const ids = new Set();
  return records.map((record, index) => {
    const label = `semantic_records[${index}]`;
    const id = nonEmpty(record.id, `${label}.id`);
    if (!SEMANTIC_ID.test(id) || ids.has(id)) {
      throw new WorkflowStateError('WORKFLOW_SEMANTIC_RECORD_INVALID', `${label}.id is invalid or duplicated`);
    }
    ids.add(id);
    const kind = nonEmpty(record.kind, `${label}.kind`);
    if (kind !== expectedKind) {
      throw new WorkflowStateError(
        'WORKFLOW_SEMANTIC_RECORD_INVALID', `${stepId} requires semantic kind ${expectedKind}, got ${kind}`,
      );
    }
    const status = nonEmpty(record.status, `${label}.status`);
    if (!SEMANTIC_STATUSES.has(status)) {
      throw new WorkflowStateError('WORKFLOW_SEMANTIC_RECORD_INVALID', `${label}.status is invalid`);
    }
    const attributes = record.attributes;
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
      throw new WorkflowStateError('WORKFLOW_SEMANTIC_RECORD_INVALID', `${label}.attributes must be an object`);
    }
    const required = status === 'not_applicable' ? ['rationale'] : requiredAttributes;
    const missing = required.filter((field) => !semanticValuePresent(attributes[field]));
    if (missing.length > 0) {
      throw new WorkflowStateError(
        'WORKFLOW_SEMANTIC_RECORD_INVALID', `${label}.attributes is missing: ${missing.join(', ')}`,
      );
    }
    const evidenceRefs = record.evidence_refs;
    if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0
      || evidenceRefs.some((ref) => typeof ref !== 'string' || !ref.trim())) {
      throw new WorkflowStateError(
        'WORKFLOW_SEMANTIC_RECORD_INVALID', `${label}.evidence_refs must contain non-empty references`,
      );
    }
    const links = record.links === undefined ? [] : record.links;
    if (!Array.isArray(links) || links.some((link) => (
      !link || typeof link !== 'object' || Array.isArray(link)
      || !String(link.relation || '').trim() || !String(link.target || '').trim()
    ))) {
      throw new WorkflowStateError('WORKFLOW_SEMANTIC_RECORD_INVALID', `${label}.links is invalid`);
    }
    const source = sourceRefFile(rootDir, record.source_ref, `${label}.source_ref`);
    return {
      id, kind, status,
      summary: nonEmpty(record.summary, `${label}.summary`),
      source_ref: source.ref,
      source_digest: source.digest,
      evidence_refs: [...new Set(evidenceRefs.map((ref) => ref.trim()))],
      attributes: JSON.parse(JSON.stringify(attributes)),
      links: links.map((link) => ({
        relation: String(link.relation).trim(), target: String(link.target).trim(),
      })),
    };
  });
}

function validateSynthesisTrace(db, runRow, semanticRecords) {
  if (runRow.kind !== 'research' || !['full', 'adoption'].includes(runRow.mode)) return;
  const rows = db.prepare(
    'SELECT semantic_records_json FROM workflow_steps WHERE run_id = ? AND step_id != ?',
  ).all(runRow.id, '99-synthesis');
  const known = new Set(rows.flatMap((row) => (
    parseJson(row.semantic_records_json, 'workflow_steps.semantic_records_json', [])
  )).map((record) => record.id));
  const trace = semanticRecords.find((record) => record.kind === 'synthesis_trace');
  const refs = [
    trace?.attributes?.problem_id,
    trace?.attributes?.scenario_id,
    ...(trace?.attributes?.requirement_ids || []),
    ...(trace?.attributes?.architecture_path_ids || []),
  ];
  const missing = refs.filter((ref) => !known.has(ref));
  if (missing.length > 0) {
    throw new WorkflowStateError(
      'WORKFLOW_SYNTHESIS_TRACE_INVALID', `99-synthesis references missing semantic records: ${missing.join(', ')}`,
    );
  }
}

function validateResearchStepReport(run, stepId, outputs, rootDir) {
  const expected = path.join(
    '.ultra', 'docs', 'research', run.id, `${stepId}.md`,
  );
  const report = outputs.find((output) => path.normalize(output.path) === path.normalize(expected));
  if (!report) {
    throw new WorkflowStateError(
      'WORKFLOW_RESEARCH_REPORT_REQUIRED',
      `${stepId} requires its immutable research report at ${expected}`,
    );
  }
  const resolved = safeProjectFile(rootDir, report.path, `${stepId}.research_report`);
  const content = fs.readFileSync(resolved.file, 'utf8');
  const requiredSections = ['Evidence', 'Specification updates', 'Decisions and unknowns'];
  const missing = requiredSections.filter(
    (heading) => !new RegExp(`^##\\s+${heading}\\s*$`, 'im').test(content),
  );
  if (!/^#\s+\S/m.test(content) || missing.length > 0) {
    throw new WorkflowStateError(
      'WORKFLOW_RESEARCH_REPORT_INVALID',
      `${report.path} is missing a title or required sections: ${missing.join(', ')}`,
    );
  }
  if (stepId === '99-synthesis' && ['full', 'adoption'].includes(run.mode)) {
    const recorded = new Set(outputs.map((output) => path.normalize(output.path)));
    const required = [
      '.ultra/specs/discovery.md',
      '.ultra/specs/product.md',
      '.ultra/specs/architecture.md',
      '.ultra/specs/research-distillate.md',
    ].map((item) => path.normalize(item));
    const missingArtifacts = required.filter((item) => !recorded.has(item));
    if (missingArtifacts.length > 0) {
      throw new WorkflowStateError(
        'WORKFLOW_RESEARCH_SYNTHESIS_INCOMPLETE',
        `99-synthesis must bind the current baseline specifications and distillate: ${missingArtifacts.join(', ')}`,
      );
    }
  }
}

function rowToStep(row) {
  if (!row) return null;
  const value = {
    ...row,
    required: Boolean(row.required),
    evidence: parseJson(row.evidence_json, 'workflow_steps.evidence_json', []),
    outputs: parseJson(row.outputs_json, 'workflow_steps.outputs_json', []),
    decisions: parseJson(row.decisions_json, 'workflow_steps.decisions_json', []),
    semantic_records: parseJson(row.semantic_records_json, 'workflow_steps.semantic_records_json', []),
    blockers: parseJson(row.blockers_json, 'workflow_steps.blockers_json', []),
  };
  for (const field of [
    'evidence_json', 'outputs_json', 'decisions_json', 'semantic_records_json', 'blockers_json',
  ]) {
    delete value[field];
  }
  return value;
}

function decorateRun(db, row, rootDir) {
  if (!row) return null;
  const steps = db.prepare(
    'SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY position ASC',
  ).all(row.id).map(rowToStep);
  const nextStep = steps.find((item) => item.required && !['completed', 'skipped'].includes(item.status)) || null;
  const value = {
    ...row,
    metadata: parseJson(row.metadata_json, 'workflow_runs.metadata_json', {}),
    blockers: parseJson(row.blockers_json, 'workflow_runs.blockers_json', []),
    approval: parseJson(row.approval_json, 'workflow_runs.approval_json', null),
    summary: parseJson(row.summary_json, 'workflow_runs.summary_json', {}),
    steps,
    next_step: nextStep,
    artifact_health: inspectRunHealth(row, steps, rootDir),
  };
  for (const field of ['metadata_json', 'blockers_json', 'approval_json', 'summary_json']) {
    delete value[field];
  }
  return value;
}

function inspectRunHealth(run, steps, rootDir) {
  const blockers = [...inspectOutputHealth(steps, rootDir).blockers];
  const definition = WORKFLOW_DEFINITIONS[run.kind] || [];
  const expectedIds = new Set(definition.map((item) => item.id));
  const actualIds = new Set(steps.map((item) => item.step_id));
  if (run.definition_version !== DEFINITION_VERSION) {
    blockers.push(`WORKFLOW_DEFINITION_VERSION_STALE:${run.definition_version || 'missing'}`);
  }
  definition.forEach((item, position) => {
    const actual = steps.find((candidate) => candidate.step_id === item.id);
    if (!actual) blockers.push(`WORKFLOW_STEP_MISSING:${item.id}`);
    else if (actual.position !== position) blockers.push(`WORKFLOW_STEP_POSITION_INVALID:${item.id}`);
  });
  for (const item of steps) {
    if (!expectedIds.has(item.step_id)) blockers.push(`WORKFLOW_STEP_UNKNOWN:${item.step_id}`);
    if (!item.required && item.status !== 'skipped') {
      blockers.push(`WORKFLOW_OPTIONAL_STEP_STATE_INVALID:${item.step_id}`);
    }
  }
  if (run.status === 'completed') {
    for (const item of steps.filter((candidate) => candidate.required)) {
      if (item.status !== 'completed') blockers.push(`WORKFLOW_COMPLETED_STEP_INVALID:${item.step_id}`);
    }
    if (run.current_step) blockers.push('WORKFLOW_COMPLETED_CURRENT_STEP_PRESENT');
  }
  if (run.kind === 'research') {
    for (const item of steps.filter((candidate) => candidate.required && candidate.status === 'completed')) {
      if (!Array.isArray(item.semantic_records) || item.semantic_records.length === 0) {
        blockers.push(`WORKFLOW_SEMANTIC_RECORDS_MISSING:${item.step_id}`);
        continue;
      }
      for (const record of item.semantic_records) {
        try {
          const source = sourceRefFile(
            rootDir, record.source_ref,
            `workflow ${run.id} semantic record ${record.id || 'unknown'}`,
          );
          if (source.digest !== record.source_digest) {
            blockers.push(`WORKFLOW_SEMANTIC_SOURCE_STALE:${item.step_id}:${record.id || 'unknown'}`);
          }
        } catch (_error) {
          blockers.push(`WORKFLOW_SEMANTIC_SOURCE_INVALID:${item.step_id}:${record.id || 'unknown'}`);
        }
      }
    }
  }
  if (run.status === 'ready') {
    const incomplete = steps.filter(
      (item) => item.required && item.status !== 'completed',
    );
    if (incomplete.length > 0) {
      blockers.push(...incomplete.map((item) => `WORKFLOW_READY_STEP_INCOMPLETE:${item.step_id}`));
    }
    if (run.current_step) blockers.push('WORKFLOW_READY_CURRENT_STEP_PRESENT');
  }
  if (['active', 'blocked'].includes(run.status)) {
    const firstOpen = steps.find(
      (item) => item.required && !['completed', 'skipped'].includes(item.status),
    );
    if (!firstOpen) blockers.push('WORKFLOW_ACTIVE_WITHOUT_OPEN_STEP');
    else if (run.current_step !== firstOpen.step_id) {
      blockers.push(`WORKFLOW_CURRENT_STEP_INVALID:${run.current_step || 'missing'}`);
    }
  }
  if (actualIds.size !== steps.length) blockers.push('WORKFLOW_DUPLICATE_STEP_ID');
  return {
    status: blockers.length === 0 ? 'pass' : 'fail',
    blockers: [...new Set(blockers)].sort(),
  };
}

function inspectOutputHealth(steps, rootDir) {
  const blockers = [];
  const latestByPath = new Map();
  for (const workflowStep of steps) {
    for (const output of workflowStep.outputs) latestByPath.set(output.path, output);
  }
  for (const output of latestByPath.values()) {
    try {
      const resolved = safeProjectFile(rootDir, output.path, 'output.path');
      const current = crypto.createHash('sha256').update(fs.readFileSync(resolved.file)).digest('hex');
      if (current !== output.digest) blockers.push(`WORKFLOW_OUTPUT_STALE:${output.path}`);
    } catch (error) {
      blockers.push(error.code === 'WORKFLOW_OUTPUT_MISSING'
        ? `WORKFLOW_OUTPUT_MISSING:${output.path}`
        : `WORKFLOW_OUTPUT_INVALID:${output.path}`);
    }
  }
  return { status: blockers.length === 0 ? 'pass' : 'fail', blockers };
}

function readWorkflow(db, id, { rootDir = process.cwd() } = {}) {
  const row = db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(id);
  return decorateRun(db, row, rootDir);
}

function listWorkflows(db, filter = {}, { rootDir = process.cwd() } = {}) {
  const rows = db.prepare(
    `SELECT * FROM workflow_runs
     WHERE (? IS NULL OR kind = ?) AND (? IS NULL OR status = ?)
       AND (? IS NULL OR baseline_id = ?) AND (? IS NULL OR change_id = ?)
       AND (? IS NULL OR task_id = ?)
     ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
  ).all(
    filter.kind || null, filter.kind || null,
    filter.status || null, filter.status || null,
    filter.baseline_id || null, filter.baseline_id || null,
    filter.change_id || null, filter.change_id || null,
    filter.task_id || null, filter.task_id || null,
    Math.min(Math.max(filter.limit || 100, 1), 500),
  );
  return rows.map((row) => decorateRun(db, row, rootDir));
}

function normalizeResearchCoverage(mode, coverage, selectedSteps, metadata = {}) {
  const knownSteps = WORKFLOW_DEFINITIONS.research.map((item) => item.id);
  const known = new Set(knownSteps);
  if (coverage !== undefined) {
    if (!Array.isArray(coverage) || coverage.length === 0) {
      throw new WorkflowStateError(
        'WORKFLOW_RESEARCH_COVERAGE_REQUIRED',
        'research coverage must be a non-empty array of semantic dispositions',
      );
    }
    const seen = new Set();
    const normalized = coverage.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new WorkflowStateError('VALIDATION_ERROR', 'research coverage entries must be objects');
      }
      const stepId = String(item.step_id || '').trim();
      const disposition = String(item.disposition || '').trim();
      const rationale = String(item.rationale || '').trim();
      const evidenceRefs = Array.isArray(item.evidence_refs)
        ? [...new Set(item.evidence_refs.map((ref) => String(ref).trim()).filter(Boolean))]
        : [];
      if (!known.has(stepId)) {
        throw new WorkflowStateError('VALIDATION_ERROR', `unknown research step: ${stepId || '(missing)'}`);
      }
      if (seen.has(stepId)) {
        throw new WorkflowStateError('VALIDATION_ERROR', `duplicate research coverage: ${stepId}`);
      }
      if (!RESEARCH_DISPOSITIONS.has(disposition)) {
        throw new WorkflowStateError(
          'VALIDATION_ERROR',
          `unsupported research disposition for ${stepId}: ${disposition || '(missing)'}`,
        );
      }
      if (rationale.length < 3) {
        throw new WorkflowStateError(
          'VALIDATION_ERROR', `research coverage ${stepId} requires a rationale`,
        );
      }
      if (['verify_existing', 'reuse', 'not_applicable'].includes(disposition)
        && evidenceRefs.length === 0) {
        throw new WorkflowStateError(
          'WORKFLOW_RESEARCH_COVERAGE_EVIDENCE_REQUIRED',
          `${stepId} ${disposition} requires at least one evidence reference`,
        );
      }
      const acceptedBy = item.accepted_by === undefined ? null : String(item.accepted_by).trim();
      const consequence = item.consequence === undefined ? null : String(item.consequence).trim();
      if (disposition === 'deferred' && (!consequence || consequence.length < 3)) {
        throw new WorkflowStateError(
          'VALIDATION_ERROR', `${stepId} deferred coverage requires a consequence`,
        );
      }
      seen.add(stepId);
      return {
        step_id: stepId,
        disposition,
        rationale,
        evidence_refs: evidenceRefs,
        ...(acceptedBy ? { accepted_by: acceptedBy } : {}),
        ...(consequence ? { consequence } : {}),
      };
    });
    if (['full', 'adoption'].includes(mode)) {
      const missing = knownSteps.filter((stepId) => !seen.has(stepId));
      if (missing.length > 0) {
        throw new WorkflowStateError(
          'WORKFLOW_RESEARCH_COVERAGE_REQUIRED',
          `${mode} research must disposition every semantic area: ${missing.join(', ')}`,
        );
      }
      const synthesis = normalized.find((item) => item.step_id === '99-synthesis');
      if (!synthesis || !['execute', 'verify_existing', 'reuse'].includes(synthesis.disposition)) {
        throw new WorkflowStateError(
          'WORKFLOW_RESEARCH_SYNTHESIS_REQUIRED',
          `${mode} research requires an executable or reusable 99-synthesis disposition`,
        );
      }
    }
    return normalized.sort(
      (left, right) => knownSteps.indexOf(left.step_id) - knownSteps.indexOf(right.step_id),
    );
  }

  if (['full', 'adoption'].includes(mode)) {
    throw new WorkflowStateError(
      'WORKFLOW_RESEARCH_COVERAGE_REQUIRED',
      `${mode} research requires model-selected coverage dispositions`,
    );
  }
  if (mode === 'custom') {
    if (!Array.isArray(selectedSteps) || selectedSteps.length === 0) {
      throw new WorkflowStateError('VALIDATION_ERROR', 'custom research requires selected_steps');
    }
    const known = new Set(WORKFLOW_DEFINITIONS.research.map((item) => item.id));
    const invalid = selectedSteps.find((item) => !known.has(item));
    if (invalid) throw new WorkflowStateError('VALIDATION_ERROR', `unknown research step: ${invalid}`);
    return [...new Set([...selectedSteps, '99-synthesis'])].map((stepId) => ({
      step_id: stepId,
      disposition: 'execute',
      rationale: String(metadata.selection_reason || 'Explicit bounded research selection.').trim(),
      evidence_refs: [],
    }));
  }
  const selected = RESEARCH_MODES[mode];
  if (!selected) throw new WorkflowStateError('VALIDATION_ERROR', `unsupported research mode: ${mode}`);
  return selected.map((stepId) => ({
    step_id: stepId,
    disposition: 'execute',
    rationale: String(metadata.selection_reason || `${mode} research profile selected by the host model.`).trim(),
    evidence_refs: [],
  }));
}

function assertReference(db, table, id, field) {
  if (!id) return;
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) {
    throw new WorkflowStateError('VALIDATION_ERROR', `${field} does not exist: ${id}`);
  }
}

function assertWorkflowAuthority(db, input, mode) {
  const requireField = (field) => {
    if (!input[field]) {
      throw new WorkflowStateError(
        'WORKFLOW_AUTHORITY_REQUIRED', `${input.kind} workflow requires ${field}`,
      );
    }
  };
  if (input.kind !== 'research'
    && (input.mode !== undefined || input.selected_steps !== undefined || input.coverage !== undefined)) {
    throw new WorkflowStateError(
      'VALIDATION_ERROR', 'mode, selected_steps, and coverage are valid only for research workflows',
    );
  }
  if (input.kind === 'init') requireField('baseline_id');
  if (input.kind === 'plan') {
    requireField('change_id');
  }
  if (input.kind === 'dev') {
    requireField('change_id');
    requireField('task_id');
  }
  if (['change', 'test', 'review', 'deliver'].includes(input.kind)) requireField('change_id');
  if (input.kind === 'research') {
    if (!input.baseline_id && !input.change_id) {
      throw new WorkflowStateError(
        'WORKFLOW_AUTHORITY_REQUIRED', 'research workflow requires baseline_id or change_id',
      );
    }
    if (['product', 'feature', 'architecture', 'custom'].includes(mode)) {
      requireField('change_id');
      if (!String(input.metadata?.selection_reason || '').trim()) {
        throw new WorkflowStateError(
          'WORKFLOW_SELECTION_REASON_REQUIRED',
          `${mode} research requires an explicit owner-selected scope reason`,
        );
      }
    }
    if (input.baseline_id && !input.change_id) {
      const baseline = db.prepare('SELECT mode FROM baselines WHERE id = ?').get(input.baseline_id);
      const expectedMode = baseline?.mode === 'brownfield' ? 'adoption' : 'full';
      if (mode !== expectedMode) {
        throw new WorkflowStateError(
          'WORKFLOW_RESEARCH_MODE_MISMATCH',
          `${baseline?.mode || 'greenfield'} baseline research requires ${expectedMode} mode`,
        );
      }
    }
  }
}

function assertPlanWorkflowAuthority(db, input) {
  const change = db.prepare(
    `SELECT id, kind, status, baseline_bypass_json, contract_json,
     research_disposition_json FROM changes WHERE id = ?`,
  ).get(input.change_id);
  if (!change) return;
  if (!['active', 'blocked'].includes(change.status)) {
    throw new WorkflowStateError(
      'WORKFLOW_CHANGE_NOT_MUTABLE', `plan change ${change.id} is ${change.status}`,
    );
  }
  const linked = db.prepare(
    `SELECT id, baseline_id FROM workflow_runs
     WHERE kind = 'change' AND change_id = ?
     ORDER BY started_at DESC, rowid DESC LIMIT 1`,
  ).get(change.id);
  if (!linked) {
    throw new WorkflowStateError(
      'WORKFLOW_CHANGE_RUN_REQUIRED',
      `change ${change.id} has no durable change workflow; run ultra-doctor repair before planning`,
    );
  }
  const expectedBaseline = linked.baseline_id || null;
  const suppliedBaseline = input.baseline_id || null;
  if (suppliedBaseline !== expectedBaseline) {
    throw new WorkflowStateError(
      'WORKFLOW_BASELINE_MISMATCH',
      `plan baseline ${suppliedBaseline || '(none)'} does not match change workflow ${linked.id} baseline ${expectedBaseline || '(none)'}`,
    );
  }
  if (expectedBaseline === null) {
    const bypass = parseJson(change.baseline_bypass_json, 'changes.baseline_bypass_json', null);
    if (change.kind !== 'incident' || bypass?.mode !== 'incident_break_glass'
      || !String(bypass.reason || '').trim() || !String(bypass.approved_by || '').trim()) {
      throw new WorkflowStateError(
        'WORKFLOW_BASELINE_REQUIRED',
        `ordinary plan ${change.id} requires the baseline bound by its change workflow`,
      );
    }
  }
  const contract = parseJson(change.contract_json || '{}', 'changes.contract_json', {});
  const blockingDecisions = (contract.unresolved_decisions || []).filter((item) => item?.blocking === true);
  if (blockingDecisions.length > 0) {
    throw new WorkflowStateError(
      'WORKFLOW_CHANGE_DECISION_BLOCKING',
      `change ${change.id} has unresolved blocking decisions: ${blockingDecisions.map((item) => item.id).join(', ')}`,
    );
  }
  const disposition = parseJson(
    change.research_disposition_json || '{}', 'changes.research_disposition_json', {},
  );
  if (['bounded', 'required'].includes(disposition.status)) {
    const row = db.prepare(
      `SELECT id FROM workflow_runs
       WHERE kind = 'research' AND change_id = ? AND mode = ? AND status = 'completed'
       ORDER BY completed_at DESC, rowid DESC LIMIT 1`,
    ).get(change.id, disposition.mode);
    const research = row ? readWorkflow(db, row.id, { rootDir: input.root_dir || process.cwd() }) : null;
    const expectedSteps = new Set([
      ...(Array.isArray(disposition.selected_steps) ? disposition.selected_steps : []),
      '99-synthesis',
    ]);
    const actualSteps = new Set(
      (research?.steps || []).filter((item) => item.required).map((item) => item.step_id),
    );
    const selectionMatches = expectedSteps.size === actualSteps.size
      && [...expectedSteps].every((item) => actualSteps.has(item));
    if (!research || research.artifact_health.status !== 'pass' || !selectionMatches) {
      throw new WorkflowStateError(
        'WORKFLOW_CHANGE_RESEARCH_INCOMPLETE',
        `change ${change.id} requires completed current ${disposition.mode} research before planning`,
      );
    }
  }
}

const CHANGE_BOUND_STAGE_KINDS = new Set([
  'research', 'plan', 'dev', 'test', 'review', 'deliver',
]);

function bindChangeWorkflowAuthority(db, input) {
  if (!input.change_id || !CHANGE_BOUND_STAGE_KINDS.has(input.kind)) return input;
  const change = db.prepare(
    'SELECT id, kind, status, baseline_bypass_json FROM changes WHERE id = ?',
  ).get(input.change_id);
  if (!change) {
    throw new WorkflowStateError(
      'WORKFLOW_CHANGE_NOT_FOUND', `workflow change does not exist: ${input.change_id}`,
    );
  }
  const allowedStatuses = input.kind === 'deliver'
    ? new Set(['active', 'blocked', 'ready'])
    : new Set(['active', 'blocked']);
  if (!allowedStatuses.has(change.status)) {
    throw new WorkflowStateError(
      'WORKFLOW_CHANGE_NOT_MUTABLE',
      `${input.kind} workflow cannot start while change ${change.id} is ${change.status}`,
    );
  }
  const linked = db.prepare(
    `SELECT id, baseline_id FROM workflow_runs
     WHERE kind = 'change' AND change_id = ?
     ORDER BY started_at DESC, rowid DESC LIMIT 1`,
  ).get(change.id);
  if (!linked) {
    throw new WorkflowStateError(
      'WORKFLOW_CHANGE_RUN_REQUIRED',
      `change ${change.id} has no durable change workflow; run ultra-doctor repair before ${input.kind}`,
    );
  }
  const expectedBaseline = linked.baseline_id || null;
  if (input.baseline_id !== undefined && (input.baseline_id || null) !== expectedBaseline) {
    throw new WorkflowStateError(
      'WORKFLOW_BASELINE_MISMATCH',
      `${input.kind} baseline ${input.baseline_id || '(none)'} does not match change workflow ${linked.id} baseline ${expectedBaseline || '(none)'}`,
    );
  }
  if (expectedBaseline) {
    const baseline = db.prepare('SELECT mode, status FROM baselines WHERE id = ?').get(expectedBaseline);
    if (!baseline || baseline.status !== 'ready' || baseline.mode === 'migrated') {
      throw new WorkflowStateError(
        'WORKFLOW_BASELINE_NOT_READY',
        `${input.kind} workflow requires its bound baseline ${expectedBaseline} to remain approved and ready`,
      );
    }
  } else {
    const bypass = parseJson(change.baseline_bypass_json, 'changes.baseline_bypass_json', null);
    if (change.kind !== 'incident' || bypass?.mode !== 'incident_break_glass'
      || !String(bypass.reason || '').trim() || !String(bypass.approved_by || '').trim()) {
      throw new WorkflowStateError(
        'WORKFLOW_BASELINE_REQUIRED',
        `${input.kind} workflow requires a bound ready baseline or approved incident break-glass authority`,
      );
    }
  }
  return { ...input, baseline_id: expectedBaseline };
}

function insertWorkflowInTx(db, input = {}, { rootDir = process.cwd() } = {}) {
  if (!RUN_KINDS.has(input.kind)) {
    throw new WorkflowStateError('VALIDATION_ERROR', `unsupported workflow kind: ${input.kind}`);
  }
  input = bindChangeWorkflowAuthority(db, input);
  const definition = WORKFLOW_DEFINITIONS[input.kind];
  const mode = input.kind === 'research' ? (input.mode || 'full') : null;
  assertWorkflowAuthority(db, input, mode);
  const id = input.id || `wf-${input.kind}-${crypto.randomUUID().slice(0, 12)}`;
  const subject = nonEmpty(input.subject, 'subject');
  if (db.prepare('SELECT 1 FROM workflow_runs WHERE id = ?').get(id)) {
    throw new WorkflowStateError('DUPLICATE_WORKFLOW_ID', `workflow ${id} already exists`);
  }
  assertReference(db, 'baselines', input.baseline_id, 'baseline_id');
  assertReference(db, 'changes', input.change_id, 'change_id');
  assertReference(db, 'tasks', input.task_id, 'task_id');
  if (input.task_id && input.change_id) {
    const taskOwner = db.prepare('SELECT change_id FROM tasks WHERE id = ?').get(input.task_id);
    if (taskOwner?.change_id !== input.change_id) {
      throw new WorkflowStateError(
        'TASK_CHANGE_OWNERSHIP_MISMATCH',
        `task ${input.task_id} belongs to ${taskOwner?.change_id || '(none)'}, not ${input.change_id}`,
      );
    }
  }
  if (input.kind === 'plan') assertPlanWorkflowAuthority(db, { ...input, root_dir: rootDir });
  if (input.kind === 'dev') {
    if (!input.task_id) {
      throw new WorkflowStateError('VALIDATION_ERROR', 'dev workflow requires task_id');
    }
    const task = ops.readTask(db, input.task_id);
    ops.assertTaskExecutionContract(task);
    if (!task.change_id) {
      throw new WorkflowStateError(
        'WORKFLOW_AUTHORITY_REQUIRED', `dev task ${task.id} is not owned by a change`,
      );
    }
    if (!['pending', 'in_progress', 'blocked'].includes(task.status) || task.stale) {
      throw new WorkflowStateError(
        'WORKFLOW_TASK_NOT_EXECUTABLE',
        `task ${task.id} is not executable from status ${task.status}${task.stale ? ' (stale)' : ''}`,
      );
    }
    const incompleteDependencies = (task.deps || []).filter((id) => {
      const dependency = ops.readTask(db, id);
      return !dependency || !['completed', 'expanded'].includes(dependency.status);
    });
    if (incompleteDependencies.length > 0) {
      throw new WorkflowStateError(
        'TASK_DEPENDENCIES_INCOMPLETE',
        `task ${task.id} has incomplete dependencies: ${incompleteDependencies.join(', ')}`,
      );
    }
    if (input.change_id && task.change_id !== input.change_id) {
      throw new WorkflowStateError(
        'TASK_CHANGE_OWNERSHIP_MISMATCH',
        `task ${task.id} belongs to ${task.change_id || '(none)'}, not ${input.change_id}`,
      );
    }
    assertCurrentPlan(db, task.change_id, rootDir);
  }

  const active = db.prepare(
    `SELECT id FROM workflow_runs
     WHERE kind = ? AND status IN ('active', 'blocked', 'ready')
       AND baseline_id IS ? AND change_id IS ? AND task_id IS ? LIMIT 1`,
  ).get(input.kind, input.baseline_id || null, input.change_id || null, input.task_id || null);
  if (active) {
    throw new WorkflowStateError('WORKFLOW_IN_PROGRESS', `workflow ${active.id} is already active`);
  }

  const researchCoverage = input.kind === 'research'
    ? normalizeResearchCoverage(mode, input.coverage, input.selected_steps, input.metadata)
    : null;
  const coverageByStep = new Map((researchCoverage || []).map((item) => [item.step_id, item]));
  const selected = new Set(input.kind === 'research'
    ? researchCoverage
      .filter((item) => ['execute', 'verify_existing', 'reuse'].includes(item.disposition)
        || (item.disposition === 'deferred' && !item.accepted_by))
      .map((item) => item.step_id)
    : definition.map((item) => item.id));
  let metadata = input.kind === 'research'
    ? {
      ...(input.metadata || {}),
      selected_steps: [...selected],
      coverage: researchCoverage,
    }
    : (input.metadata || {});
  if (input.kind === 'plan') {
    const profile = db.prepare('SELECT kind FROM changes WHERE id = ?').get(input.change_id)?.kind;
    metadata = { ...metadata, profile };
  }
  const ts = nowIso();
  const currentStep = definition.find((item) => selected.has(item.id))?.id || null;
  db.prepare(
    `INSERT INTO workflow_runs
     (id, kind, mode, subject, definition_version, status, current_step, baseline_id,
      change_id, task_id, metadata_json, blockers_json, summary_json, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, '[]', '{}', ?, ?)`,
  ).run(
    id, input.kind, mode, subject, DEFINITION_VERSION, currentStep,
    input.baseline_id || null, input.change_id || null, input.task_id || null,
    JSON.stringify(metadata), ts, ts,
  );
  const insertStep = db.prepare(
    `INSERT INTO workflow_steps
     (run_id, step_id, position, title, required, status, skip_reason, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  definition.forEach((item, position) => {
    const required = selected.has(item.id);
    const coverage = coverageByStep.get(item.id);
    const disposition = coverage?.disposition || null;
    const deferred = disposition === 'deferred' && !coverage.accepted_by;
    const skippedReason = coverage && !required
      ? `${disposition}: ${coverage.rationale}${coverage.accepted_by ? ` (accepted by ${coverage.accepted_by})` : ''}`
      : (required ? null : `Excluded by ${mode} mode.`);
    insertStep.run(
      id, item.id, position, item.title, required ? 1 : 0,
      deferred ? 'blocked' : (required ? 'pending' : 'skipped'), skippedReason, ts,
    );
  });
  if (researchCoverage?.some((item) => item.disposition === 'deferred' && !item.accepted_by)) {
    const blockers = researchCoverage
      .filter((item) => item.disposition === 'deferred' && !item.accepted_by)
      .map((item) => `RESEARCH_DEFERRED:${item.step_id}`);
    db.prepare(
      "UPDATE workflow_runs SET status = 'blocked', blockers_json = ? WHERE id = ?",
    ).run(JSON.stringify(blockers), id);
    for (const blocker of blockers) {
      const stepId = blocker.split(':')[1];
      db.prepare(
        'UPDATE workflow_steps SET blockers_json = ? WHERE run_id = ? AND step_id = ?',
      ).run(JSON.stringify([blocker]), id, stepId);
    }
  }
  ops.appendEventInTx(db, {
    type: 'workflow_started', task_id: input.task_id, change_id: input.change_id,
    payload: { workflow_id: id, kind: input.kind, mode, baseline_id: input.baseline_id || null },
  });
  return id;
}

function startWorkflow(db, input = {}, { rootDir = process.cwd() } = {}) {
  const id = ops.tx(db, () => insertWorkflowInTx(db, input, { rootDir }));
  return readWorkflow(db, id, { rootDir });
}

function allowedStepTransition(from, to, required) {
  if (from === to) return true;
  if (from === 'pending') return ['in_progress', 'completed', 'blocked'].includes(to)
    || (!required && to === 'skipped');
  if (from === 'in_progress') return ['completed', 'blocked'].includes(to);
  if (from === 'blocked') return ['in_progress', 'completed'].includes(to);
  return false;
}

function recordWorkflowStep(db, input = {}, { rootDir = process.cwd() } = {}) {
  const id = nonEmpty(input.id, 'id');
  const stepId = nonEmpty(input.step_id, 'step_id');
  if (!STEP_STATUSES.has(input.status) || input.status === 'pending') {
    throw new WorkflowStateError('VALIDATION_ERROR', `unsupported step status: ${input.status}`);
  }
  return ops.tx(db, () => {
    const runRow = db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(id);
    if (!runRow) throw new WorkflowStateError('WORKFLOW_NOT_FOUND', `workflow ${id} not found`);
    if (['completed', 'cancelled'].includes(runRow.status)) {
      throw new WorkflowStateError('WORKFLOW_NOT_MUTABLE', `workflow ${id} is ${runRow.status}`);
    }
    const stepRow = db.prepare('SELECT * FROM workflow_steps WHERE run_id = ? AND step_id = ?').get(id, stepId);
    if (!stepRow) throw new WorkflowStateError('WORKFLOW_STEP_NOT_FOUND', `workflow step ${stepId} not found`);
    if (!allowedStepTransition(stepRow.status, input.status, Boolean(stepRow.required))) {
      throw new WorkflowStateError(
        'ILLEGAL_WORKFLOW_STEP_TRANSITION',
        `cannot transition ${id}/${stepId} from ${stepRow.status} to ${input.status}`,
      );
    }
    if (input.status === 'completed') {
      decisionDialogue.assertDecisionGate(db, {
        workflow_run_id: runRow.id,
        change_id: runRow.change_id,
        baseline_id: runRow.baseline_id,
      }, { rootDir });
    }
    const firstOpen = db.prepare(
      `SELECT step_id FROM workflow_steps
       WHERE run_id = ? AND required = 1 AND status NOT IN ('completed', 'skipped')
       ORDER BY position ASC LIMIT 1`,
    ).get(id);
    if (firstOpen && firstOpen.step_id !== stepId) {
      throw new WorkflowStateError(
        'WORKFLOW_STEP_OUT_OF_ORDER',
        `complete ${firstOpen.step_id} before ${stepId}`,
      );
    }

    const definition = WORKFLOW_DEFINITIONS[runRow.kind].find((item) => item.id === stepId);
    const evidence = input.evidence === undefined
      ? parseJson(stepRow.evidence_json, 'evidence_json', [])
      : normalizeEvidence(input.evidence);
    const outputs = input.outputs === undefined
      ? parseJson(stepRow.outputs_json, 'outputs_json', [])
      : normalizeOutputs(input.outputs, rootDir);
    const decisions = input.decisions === undefined
      ? parseJson(stepRow.decisions_json, 'decisions_json', [])
      : normalizeObjects(input.decisions, 'decisions');
    const semanticRecords = input.semantic_records === undefined
      ? parseJson(stepRow.semantic_records_json, 'semantic_records_json', [])
      : (runRow.kind === 'research'
        ? normalizeSemanticRecords(input.semantic_records, stepId, rootDir)
        : normalizeObjects(input.semantic_records, 'semantic_records'));
    const blockers = input.blockers === undefined ? [] : input.blockers;
    if (!Array.isArray(blockers) || blockers.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new WorkflowStateError('VALIDATION_ERROR', 'blockers must be an array of non-empty strings');
    }
    if (input.status === 'completed' && definition.evidence_required && evidence.length === 0) {
      throw new WorkflowStateError('WORKFLOW_EVIDENCE_REQUIRED', `${stepId} requires evidence`);
    }
    if (input.status === 'completed' && definition.output_required && outputs.length === 0) {
      throw new WorkflowStateError('WORKFLOW_OUTPUT_REQUIRED', `${stepId} requires a durable output`);
    }
    if (input.status === 'completed' && runRow.kind === 'research') {
      validateResearchStepReport(runRow, stepId, outputs, rootDir);
      if (semanticRecords.length === 0) {
        throw new WorkflowStateError(
          'WORKFLOW_SEMANTIC_RECORDS_REQUIRED', `${stepId} requires at least one typed semantic record`,
        );
      }
      if (stepId === '99-synthesis') validateSynthesisTrace(db, runRow, semanticRecords);
    }
    if (input.status === 'completed' && contextStepForKind(runRow.kind) === stepId) {
      validateContextManifestOutput(db, runRow, outputs, rootDir, { current: true });
    }
    if (input.status === 'blocked' && blockers.length === 0) {
      throw new WorkflowStateError('WORKFLOW_BLOCKER_REQUIRED', `${stepId} requires a blocker code`);
    }
    if (input.status === 'completed' && runRow.kind === 'test' && stepId === 'bind-scope') {
      assertDevelopmentComplete(db, runRow.change_id, rootDir, runRow.task_id);
    }
    if (input.status === 'completed' && runRow.kind === 'dev' && stepId === 'review-slice') {
      assertApprovedReview(db, runRow.change_id, runRow.task_id, rootDir);
    }
    if (input.status === 'completed' && runRow.kind === 'deliver' && stepId === 'bind-evidence') {
      validateDeliveryPrerequisites(db, { change_id: runRow.change_id }, rootDir);
    }
    const ts = nowIso();
    const startedAt = stepRow.started_at || ts;
    const completedAt = input.status === 'completed' ? ts : null;
    db.prepare(
      `UPDATE workflow_steps SET status = ?, evidence_json = ?, outputs_json = ?,
       decisions_json = ?, semantic_records_json = ?, blockers_json = ?,
       started_at = ?, completed_at = ?, updated_at = ?
       WHERE run_id = ? AND step_id = ?`,
    ).run(
      input.status, JSON.stringify(evidence), JSON.stringify(outputs), JSON.stringify(decisions),
      JSON.stringify(semanticRecords), JSON.stringify(blockers),
      startedAt, completedAt, ts, id, stepId,
    );

    const next = db.prepare(
      `SELECT step_id FROM workflow_steps
       WHERE run_id = ? AND required = 1 AND status NOT IN ('completed', 'skipped')
       ORDER BY position ASC LIMIT 1`,
    ).get(id);
    let runStatus = 'active';
    let runBlockers = [];
    if (input.status === 'blocked') {
      runStatus = 'blocked';
      runBlockers = blockers.map((item) => item.trim());
    } else if (!next) {
      runStatus = 'ready';
    }
    db.prepare(
      `UPDATE workflow_runs SET status = ?, current_step = ?, blockers_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(runStatus, next?.step_id || null, JSON.stringify(runBlockers), ts, id);
    ops.appendEventInTx(db, {
      type: input.status === 'blocked' ? 'workflow_blocked' : 'workflow_step_updated',
      task_id: runRow.task_id, change_id: runRow.change_id,
      payload: { workflow_id: id, kind: runRow.kind, step_id: stepId, status: input.status },
    });
    return readWorkflow(db, id, { rootDir });
  });
}

function currentCheckout(rootDir) {
  const baselines = require('./baseline-workflow.cjs');
  return baselines.gitWorktreeSnapshot(rootDir, ['.']);
}

function assertIsoTimestamp(value, field) {
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `${field} must be an ISO-8601 timestamp`);
  }
}

function readOutputJson(run, stepId, rootDir, schema) {
  const workflowStep = run.steps.find((item) => item.step_id === stepId);
  const candidates = workflowStep?.outputs || [];
  for (const output of candidates) {
    const resolved = safeProjectFile(rootDir, output.path, `${stepId}.output`);
    let value;
    try { value = JSON.parse(fs.readFileSync(resolved.file, 'utf8')); }
    catch (error) {
      throw new WorkflowStateError(
        'WORKFLOW_REPORT_INVALID', `${output.path} is not valid JSON: ${error.message}`,
      );
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && value.$schema === schema) {
      return { value, output };
    }
  }
  throw new WorkflowStateError(
    'WORKFLOW_REPORT_INVALID', `${stepId} requires a ${schema} output`,
  );
}

function contextStepForKind(kind) {
  return {
    change: 'compile-context',
    dev: 'compile-context',
    test: 'compile-context',
    review: 'compile-context',
    deliver: 'verify-candidate',
  }[kind] || null;
}

function contextExpectation(kind) {
  return {
    change: { roles: ['plan', 'implement'], gates: ['planning', 'implementation'] },
    dev: { roles: ['implement'], gates: ['implementation'] },
    test: { roles: ['check'], gates: ['verification'] },
    review: { roles: ['review'], gates: ['review'] },
    deliver: { roles: ['check'], gates: ['convergence'] },
  }[kind] || null;
}

function validateContextManifestOutput(db, run, outputs, rootDir, { current = true } = {}) {
  const expectation = contextExpectation(run.kind);
  if (!expectation) return null;
  let candidate = null;
  let manifest = null;
  for (const output of outputs || []) {
    const resolved = safeProjectFile(rootDir, output.path, 'context output');
    let value;
    try { value = JSON.parse(fs.readFileSync(resolved.file, 'utf8')); }
    catch { continue; }
    if (value?.schema_version === '3.0' && value?.snapshot_id) {
      candidate = output;
      manifest = value;
      break;
    }
  }
  if (!candidate) {
    throw new WorkflowStateError(
      'WORKFLOW_CONTEXT_OUTPUT_REQUIRED', `${run.kind} requires a current Context Manifest output`,
    );
  }
  if (manifest.change?.id !== run.change_id
    || !expectation.roles.includes(manifest.role)
    || !expectation.gates.includes(manifest.gate)
    || manifest.readiness?.status !== 'ready') {
    throw new WorkflowStateError(
      'WORKFLOW_CONTEXT_MISMATCH', `${run.kind} context is not bound to the expected change, role, gate, or readiness`,
    );
  }
  if (run.task_id && manifest.resume?.task_id !== run.task_id) {
    throw new WorkflowStateError(
      'WORKFLOW_CONTEXT_MISMATCH', `${run.kind} context is not bound to task ${run.task_id}`,
    );
  }
  const stored = db.prepare(
    `SELECT manifest_path, manifest_hash, role, gate, readiness, change_id, task_id
     FROM context_snapshots WHERE id = ?`,
  ).get(manifest.snapshot_id);
  if (!stored || stored.manifest_path !== candidate.path || stored.manifest_hash !== candidate.digest
    || stored.change_id !== run.change_id || stored.role !== manifest.role
    || stored.gate !== manifest.gate || stored.readiness !== 'ready'
    || (run.task_id && stored.task_id !== run.task_id)) {
    throw new WorkflowStateError(
      'WORKFLOW_CONTEXT_AUTHORITY_MISMATCH', 'context output does not match its authoritative snapshot row',
    );
  }
  if (current) {
    const checkout = currentCheckout(rootDir);
    if ((checkout.head && manifest.git?.head !== checkout.head)
      || (checkout.digest && manifest.git?.worktree_digest !== checkout.digest)) {
      throw new WorkflowStateError(
        'WORKFLOW_CONTEXT_STALE', `${run.kind} context does not match the current checkout`,
      );
    }
  }
  return { manifest, output: candidate };
}

function recordedContext(db, run, rootDir, options) {
  const stepId = contextStepForKind(run.kind);
  const workflowStep = run.steps.find((item) => item.step_id === stepId);
  return validateContextManifestOutput(db, run, workflowStep?.outputs || [], rootDir, options);
}

function expectedTaskIds(db, run) {
  if (run.task_id) return [run.task_id];
  return db.prepare('SELECT id FROM tasks WHERE change_id = ? ORDER BY id')
    .all(run.change_id).map((row) => row.id);
}

function changeTasks(db, changeId) {
  return db.prepare('SELECT id FROM tasks WHERE change_id = ? ORDER BY id')
    .all(changeId).map((row) => ops.readTask(db, row.id));
}

function taskPlanDigest(task) {
  const contract = {
    id: task.id,
    change_id: task.change_id,
    parent_id: task.parent_id,
    title: task.title,
    type: task.type,
    priority: task.priority,
    complexity: task.complexity,
    estimated_days: task.estimated_days,
    deps: task.deps || [],
    files_modified: task.files_modified || [],
    tag: task.tag,
    trace_to: task.trace_to,
    outcome: task.outcome,
    slice_kind: task.slice_kind,
    public_seam: task.public_seam,
    verification_command: task.verification_command,
    acceptance: task.acceptance || [],
    context_refs: task.context_refs || [],
    docs_impact: task.docs_impact || {},
    ownership: task.ownership || {},
  };
  return crypto.createHash('sha256').update(JSON.stringify(contract)).digest('hex');
}

function latestCompletedWorkflow(db, { kind, changeId, taskId = null }, rootDir) {
  const row = db.prepare(
    `SELECT id FROM workflow_runs
     WHERE kind = ? AND change_id = ? AND task_id IS ? AND status = 'completed'
     ORDER BY completed_at DESC, rowid DESC LIMIT 1`,
  ).get(kind, changeId, taskId);
  return row ? readWorkflow(db, row.id, { rootDir }) : null;
}

function assertCurrentPlan(db, changeId, rootDir) {
  const plan = latestCompletedWorkflow(
    db, { kind: 'plan', changeId, taskId: null }, rootDir,
  );
  if (!plan || plan.artifact_health.status !== 'pass') {
    throw new WorkflowStateError(
      'WORKFLOW_PLAN_NOT_COMPLETED', `change ${changeId} requires a completed current plan workflow`,
    );
  }
  const tasks = changeTasks(db, changeId);
  const ids = tasks.map((task) => task.id);
  if (JSON.stringify(ids) !== JSON.stringify([...(plan.summary.task_ids || [])].sort())) {
    throw new WorkflowStateError(
      'WORKFLOW_PLAN_TASK_SET_STALE', `change ${changeId} task set changed after planning`,
    );
  }
  const plannedDigests = plan.summary.task_contract_digests;
  if (!plannedDigests || typeof plannedDigests !== 'object' || Array.isArray(plannedDigests)) {
    throw new WorkflowStateError(
      'WORKFLOW_PLAN_TASK_CONTRACT_STALE', `change ${changeId} plan has no task-contract provenance`,
    );
  }
  for (const task of tasks) {
    if (task.stale) {
      throw new WorkflowStateError(
        'WORKFLOW_PLAN_TASK_CONTRACT_STALE',
        `task ${task.id} was invalidated by newer change authority and must be reconciled`,
      );
    }
    if (plannedDigests[task.id] !== taskPlanDigest(task)) {
      throw new WorkflowStateError(
        'WORKFLOW_PLAN_TASK_CONTRACT_STALE', `task ${task.id} changed after plan convergence`,
      );
    }
  }
  return { plan, tasks, taskIds: ids };
}

function assertGateCheckoutCurrent(run, rootDir, label) {
  if (!run || run.artifact_health.status !== 'pass') {
    throw new WorkflowStateError(
      'WORKFLOW_GATE_MISSING', `${label} workflow is missing or has stale outputs`,
    );
  }
  const checkout = currentCheckout(rootDir);
  if (checkout.head && run.summary.git_commit !== checkout.head) {
    throw new WorkflowStateError('WORKFLOW_GATE_STALE', `${label} workflow does not match current HEAD`);
  }
  if (checkout.digest && run.summary.worktree_digest !== checkout.digest) {
    throw new WorkflowStateError('WORKFLOW_GATE_STALE', `${label} workflow does not match current worktree`);
  }
  return run;
}

function gitCommitIsAncestor(rootDir, ancestor, descendant) {
  if (!ancestor || !descendant) return true;
  const result = spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
    cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'],
  });
  return result.status === 0;
}

function assertCompletedDevelopmentEvidence(run, task, rootDir) {
  if (!run || run.artifact_health.status !== 'pass') {
    throw new WorkflowStateError(
      'WORKFLOW_GATE_MISSING', `dev:${task.id} workflow is missing or has stale outputs`,
    );
  }
  if (run.summary.task_id !== task.id
    || (run.summary.public_seam !== undefined && run.summary.public_seam !== task.public_seam)
    || (run.summary.verification_command !== undefined
      && run.summary.verification_command !== task.verification_command)) {
    throw new WorkflowStateError(
      'WORKFLOW_GATE_STALE', `dev:${task.id} workflow no longer matches the task contract`,
    );
  }
  const checkout = currentCheckout(rootDir);
  if (!gitCommitIsAncestor(rootDir, run.summary.git_commit, checkout.head)) {
    throw new WorkflowStateError(
      'WORKFLOW_GATE_STALE', `dev:${task.id} commit is not an ancestor of current HEAD`,
    );
  }
  if (task.completion_commit
    && !gitCommitIsAncestor(rootDir, task.completion_commit, checkout.head)) {
    throw new WorkflowStateError(
      'WORKFLOW_GATE_STALE', `task ${task.id} completion commit is not an ancestor of current HEAD`,
    );
  }
  return run;
}

function assertDevelopmentComplete(db, changeId, rootDir, taskId = null) {
  const tasks = taskId
    ? [ops.readTask(db, taskId)].filter((task) => task?.change_id === changeId)
    : changeTasks(db, changeId);
  if (tasks.length === 0) {
    throw new WorkflowStateError(
      'WORKFLOW_TASKS_REQUIRED',
      taskId ? `task ${taskId} is not owned by change ${changeId}` : `change ${changeId} has no tasks`,
    );
  }
  for (const task of tasks) {
    if (task.stale) {
      throw new WorkflowStateError(
        'WORKFLOW_GATE_STALE',
        `task ${task.id} was invalidated by newer change authority and must be replanned`,
      );
    }
    if (!['completed', 'expanded'].includes(task.status)) {
      throw new WorkflowStateError(
        'WORKFLOW_TASK_NOT_COMPLETED', `task ${task.id} is ${task.status}`,
      );
    }
    if (task.status === 'expanded') continue;
    const dev = latestCompletedWorkflow(
      db, { kind: 'dev', changeId, taskId: task.id }, rootDir,
    );
    assertCompletedDevelopmentEvidence(dev, task, rootDir);
  }
  return tasks;
}

function assertApprovedReview(db, changeId, taskId, rootDir, expectedMode = taskId ? 'task' : 'change') {
  const review = latestCompletedWorkflow(
    db, { kind: 'review', changeId, taskId }, rootDir,
  );
  assertGateCheckoutCurrent(review, rootDir, `review:${taskId || changeId}`);
  if (review.summary.verdict !== 'APPROVE'
    || review.summary.axes?.spec_fidelity?.verdict !== 'PASS'
    || review.summary.axes?.engineering_standards?.verdict !== 'PASS') {
    throw new WorkflowStateError(
      'WORKFLOW_REVIEW_NOT_APPROVED', `review for ${taskId || changeId} is not approved on both axes`,
    );
  }
  if (review.summary.mode !== expectedMode) {
    throw new WorkflowStateError(
      'WORKFLOW_REVIEW_MODE_MISMATCH',
      `review for ${taskId || changeId} uses ${review.summary.mode || 'missing'} mode; expected ${expectedMode}`,
    );
  }
  return review;
}

function validateDevCompletion(db, run, rootDir) {
  const task = ops.readTask(db, run.task_id);
  if (!task || task.status !== 'completed') {
    throw new WorkflowStateError(
      'WORKFLOW_TASK_NOT_COMPLETED', `task ${run.task_id} must be completed before dev workflow convergence`,
    );
  }
  const context = recordedContext(db, run, rootDir, { current: false });
  if (context.manifest.execution_contract?.public_seam !== task.public_seam
    || context.manifest.execution_contract?.verification_command !== task.verification_command) {
    throw new WorkflowStateError(
      'WORKFLOW_CONTEXT_NOT_READY', `task ${task.id} has no current executable context contract`,
    );
  }
  const sessions = db.prepare(
    "SELECT sid FROM sessions WHERE task_id = ? AND status = 'running'",
  ).all(task.id);
  if (sessions.length > 0) {
    throw new WorkflowStateError(
      'WORKFLOW_SESSION_ACTIVE', `task ${task.id} still has active sessions: ${sessions.map((row) => row.sid).join(', ')}`,
    );
  }
  const review = assertApprovedReview(db, run.change_id, task.id, rootDir);
  const checkout = currentCheckout(rootDir);
  return {
    change_id: run.change_id,
    task_id: task.id,
    outcome: task.outcome,
    public_seam: task.public_seam,
    verification_command: task.verification_command,
    context_path: context.output.path,
    context_digest: context.output.digest,
    git_commit: checkout.head,
    worktree_digest: checkout.digest,
    review_workflow_id: review.id,
  };
}

function validateChangeCompletion(db, run, rootDir) {
  const change = db.prepare(
    `SELECT id, kind, intent, contract_json, classification_json, research_disposition_json
     FROM changes WHERE id = ?`,
  ).get(run.change_id);
  if (!change) {
    throw new WorkflowStateError(
      'WORKFLOW_CHANGE_NOT_FOUND', `change ${run.change_id || '(missing)'} does not exist`,
    );
  }
  const contract = parseJson(change.contract_json, 'changes.contract_json', {});
  const classification = parseJson(change.classification_json, 'changes.classification_json', {});
  const researchDisposition = parseJson(
    change.research_disposition_json, 'changes.research_disposition_json', {},
  );
  return {
    change_id: change.id,
    change_kind: change.kind,
    acceptance_ids: Array.isArray(contract.acceptance)
      ? contract.acceptance.map((item) => item.id)
      : [],
    classification,
    research_disposition: researchDisposition,
    authority_basis: 'accepted_change_contract',
  };
}

function validateDeliveryPrerequisites(db, run, rootDir) {
  const tasks = assertDevelopmentComplete(db, run.change_id, rootDir);
  const taskIds = tasks.map((task) => task.id).sort();
  const test = latestCompletedWorkflow(
    db, { kind: 'test', changeId: run.change_id, taskId: null }, rootDir,
  );
  assertGateCheckoutCurrent(test, rootDir, `test:${run.change_id}`);
  if (test.summary.passed !== true) {
    throw new WorkflowStateError('WORKFLOW_TEST_NOT_PASSED', `test gate for ${run.change_id} did not pass`);
  }
  if (JSON.stringify([...(test.summary.task_ids || [])].sort()) !== JSON.stringify(taskIds)) {
    throw new WorkflowStateError(
      'WORKFLOW_GATE_STALE', `test gate for ${run.change_id} does not cover the current task set`,
    );
  }
  const review = assertApprovedReview(db, run.change_id, null, rootDir);
  if (JSON.stringify([...(review.summary.task_ids || [])].sort()) !== JSON.stringify(taskIds)) {
    throw new WorkflowStateError(
      'WORKFLOW_GATE_STALE', `review gate for ${run.change_id} does not cover the current task set`,
    );
  }
  return {
    task_ids: taskIds,
    test_workflow_id: test.id,
    review_workflow_id: review.id,
    test_summary: test.summary,
    review_summary: review.summary,
  };
}

function assertBoundTaskSet(db, run, report) {
  if (!Array.isArray(report.task_ids)
    || report.task_ids.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', 'report.task_ids must be an array of task ids');
  }
  const actual = [...report.task_ids].sort();
  const expected = expectedTaskIds(db, run);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new WorkflowStateError(
      'WORKFLOW_REPORT_TASK_SET_STALE',
      `report task set does not match ${run.change_id}: expected ${expected.join(', ') || '(none)'}`,
    );
  }
}

function assertCurrentCheckout(report, rootDir) {
  const checkout = currentCheckout(rootDir);
  if (checkout.head && report.git_commit !== checkout.head && report.head !== checkout.head) {
    throw new WorkflowStateError(
      'WORKFLOW_REPORT_REVISION_STALE', `report revision does not match current HEAD ${checkout.head}`,
    );
  }
  if (checkout.digest && report.worktree_digest !== checkout.digest) {
    throw new WorkflowStateError(
      'WORKFLOW_REPORT_WORKTREE_STALE', 'report worktree digest does not match the current checkout',
    );
  }
  return checkout;
}

const VERIFICATION_DIMENSIONS = Object.freeze([
  'acceptance',
  'regression',
  'integration',
  'static_analysis',
  'build',
  'performance',
  'security',
  'recovery',
]);

function validateVerificationProfile(report) {
  const profile = report.verification_profile;
  const selected = new Set(profile?.selected_dimensions || []);
  const dimensions = new Set(Object.keys(report.verification_dimensions || {}));
  const excludedItems = Array.isArray(profile?.excluded_dimensions)
    ? profile.excluded_dimensions : [];
  const excluded = new Set(excludedItems.map((item) => item.dimension));
  const known = new Set(VERIFICATION_DIMENSIONS);
  const sameSet = (left, right) => left.size === right.size
    && [...left].every((item) => right.has(item));
  const invalid = [...selected, ...dimensions, ...excluded].some((item) => !known.has(item));
  const overlap = [...selected].some((item) => excluded.has(item));
  const duplicateExclusion = excluded.size !== excludedItems.length;
  const completeDisposition = VERIFICATION_DIMENSIONS.every(
    (dimension) => selected.has(dimension) || excluded.has(dimension),
  );
  if (!profile || typeof profile.rationale !== 'string' || profile.rationale.trim().length < 3
    || !selected.has('acceptance') || !sameSet(selected, dimensions) || invalid || overlap
    || duplicateExclusion || !completeDisposition) {
    throw new WorkflowStateError(
      'WORKFLOW_VERIFICATION_PROFILE_INVALID',
      'verification profile must select exactly the recorded dimensions, include acceptance, and explain every excluded dimension',
    );
  }
  return {
    rationale: profile.rationale.trim(),
    selected_dimensions: [...selected],
    excluded_dimensions: excludedItems,
  };
}

function validateTestCompletion(db, run, rootDir) {
  assertDevelopmentComplete(db, run.change_id, rootDir, run.task_id);
  const context = recordedContext(db, run, rootDir, { current: true });
  const { value: report, output } = readOutputJson(
    run, 'write-report', rootDir, 'ultra-test-report-v1',
  );
  assertReportSchema(report, 'test');
  const verificationProfile = validateVerificationProfile(report);
  if (report.change_id !== run.change_id) {
    throw new WorkflowStateError('WORKFLOW_REPORT_CHANGE_MISMATCH', 'test report change_id is not bound to the workflow');
  }
  assertBoundTaskSet(db, run, report);
  const change = db.prepare('SELECT kind FROM changes WHERE id = ?').get(run.change_id);
  const requiresRegressionSignal = change?.kind === 'incident'
    || changeTasks(db, run.change_id).some((task) => task.type === 'bugfix');
  if (requiresRegressionSignal) {
    const signal = report.regression_signal;
    if (!signal || signal.observed_red !== true || signal.observed_green !== true
      || signal.deterministic !== true) {
      throw new WorkflowStateError(
        'WORKFLOW_REGRESSION_SIGNAL_MISSING',
        'incident and bugfix testing requires one deterministic observed red-to-green regression signal',
      );
    }
  }
  const checkout = assertCurrentCheckout(report, rootDir);
  assertIsoTimestamp(report.timestamp, 'test report timestamp');
  if (!Number.isInteger(report.run_count) || report.run_count < 1) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', 'test report run_count must be a positive integer');
  }
  for (const field of ['acceptance', 'commands', 'public_seams', 'failures', 'recovery', 'blocking_issues']) {
    if (!Array.isArray(report[field])) {
      throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `test report ${field} must be an array`);
    }
  }
  if (!String(report.context_digest || '').trim()) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', 'test report context_digest is required');
  }
  if (report.context_digest !== context.output.digest) {
    throw new WorkflowStateError(
      'WORKFLOW_REPORT_CONTEXT_MISMATCH', 'test report context_digest does not match the checking context',
    );
  }
  if (report.commands.length === 0 || report.public_seams.length === 0) {
    throw new WorkflowStateError(
      'WORKFLOW_REPORT_INVALID', 'test report requires commands and public_seams evidence',
    );
  }
  const claimedPass = report.acceptance.length > 0
    && report.acceptance.every((item) => item.status === 'pass')
    && report.commands.every((item) => item.status === 'pass' && item.exit_code === 0)
    && report.public_seams.every((item) => item?.status === 'pass')
    && report.failures.every((item) => item.status === 'resolved')
    && report.recovery.every((item) => item.status === 'pass')
    && Object.values(report.verification_dimensions || {}).every((item) => item?.status === 'pass')
    && report.blocking_issues.length === 0;
  if (typeof report.passed !== 'boolean' || report.passed !== claimedPass) {
    throw new WorkflowStateError(
      'WORKFLOW_REPORT_VERDICT_CONFLICT', 'test report passed conflicts with command, seam, or blocker evidence',
    );
  }
  return {
    change_id: run.change_id,
    task_ids: report.task_ids,
    passed: report.passed,
    git_commit: checkout.head,
    worktree_digest: checkout.digest,
    report_path: output.path,
    report_digest: output.digest,
    context_path: context.output.path,
    context_digest: context.output.digest,
    regression_signal: report.regression_signal,
    verification_profile: verificationProfile,
    verification_dimensions: report.verification_dimensions,
    blocking_issues: report.blocking_issues,
  };
}

const REVIEW_AXES = new Set(['spec_fidelity', 'engineering_standards']);
const REVIEW_WORKERS = new Set([
  'review-spec',
  'review-code',
  'review-tests',
  'review-errors',
  'review-design',
  'review-comments',
]);
const REVIEW_SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const REVIEW_FINDING_FIELDS = [
  'id', 'axis', 'severity', 'category', 'title', 'file', 'line',
  'trigger', 'impact', 'evidence', 'suggestion',
];

function validateReviewFinding(finding, axis, seenIds, label) {
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `${label} finding must be an object`);
  }
  for (const field of REVIEW_FINDING_FIELDS) {
    if (field === 'line') {
      if (!Number.isInteger(finding.line) || finding.line < 1) {
        throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `${label} finding.line must be positive`);
      }
    } else if (!String(finding[field] || '').trim()) {
      throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `${label} finding.${field} is required`);
    }
  }
  if (finding.axis !== axis || !REVIEW_AXES.has(finding.axis)) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `${label} finding axis does not match ${axis}`);
  }
  if (!REVIEW_SEVERITIES.has(finding.severity)) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `${label} finding severity is invalid`);
  }
  if (finding.line_end !== undefined
    && (!Number.isInteger(finding.line_end) || finding.line_end < finding.line)) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `${label} finding.line_end is invalid`);
  }
  if (seenIds.has(finding.id)) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `duplicate review finding id: ${finding.id}`);
  }
  seenIds.add(finding.id);
}

function readReviewSpecialists(run, rootDir) {
  const axes = [
    ['review-specification', 'spec_fidelity'],
    ['review-engineering', 'engineering_standards'],
  ];
  const checkout = currentCheckout(rootDir);
  const expectedHead = checkout.head || 'workspace';
  const seenIds = new Set();
  const seenAgents = new Set();
  const artifacts = [];
  for (const [stepId, expectedAxis] of axes) {
    const outputs = run.steps.find((item) => item.step_id === stepId)?.outputs || [];
    if (outputs.length === 0) {
      throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `${stepId} has no specialist artifact`);
    }
    for (const output of outputs) {
      const resolved = safeProjectFile(rootDir, output.path, `${stepId}.output`);
      let artifact;
      try { artifact = JSON.parse(fs.readFileSync(resolved.file, 'utf8')); }
      catch (error) {
        throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `${output.path} is not valid JSON: ${error.message}`);
      }
      if (artifact?.$schema !== 'ultra-review-findings-v2'
        || artifact.axis !== expectedAxis || artifact.status !== 'complete'
        || !String(artifact.agent || '').trim() || !String(artifact.session || '').trim()
        || !String(artifact.timestamp || '').trim() || Number.isNaN(Date.parse(artifact.timestamp))
        || !artifact.scope || typeof artifact.scope !== 'object'
        || artifact.scope.head !== expectedHead || !String(artifact.scope.range || '').trim()
        || !Array.isArray(artifact.scope.files_analyzed)
        || artifact.scope.files_analyzed.some((file) => !String(file || '').trim())
        || typeof artifact.scope.diff_only !== 'boolean'
        || !Array.isArray(artifact.findings)
        || !Array.isArray(artifact.positive_observations)
        || !Array.isArray(artifact.limitations)) {
        throw new WorkflowStateError(
          'WORKFLOW_REPORT_INVALID', `${output.path} is not a complete ${expectedAxis} artifact`,
        );
      }
      if (!REVIEW_WORKERS.has(artifact.agent) || seenAgents.has(artifact.agent)) {
        throw new WorkflowStateError(
          'WORKFLOW_REPORT_INVALID',
          `${output.path} uses an unknown or duplicate review worker: ${artifact.agent}`,
        );
      }
      seenAgents.add(artifact.agent);
      for (const finding of artifact.findings) {
        validateReviewFinding(finding, expectedAxis, seenIds, output.path);
      }
      artifacts.push({ path: output.path, digest: output.digest, ...artifact });
    }
  }
  return { artifacts, findings: artifacts.flatMap((artifact) => artifact.findings) };
}

function assertCoordinatedReviewEvidence(report, specialists) {
  const sameSet = (left, right) => left.size === right.size
    && [...left].every((item) => right.has(item));
  const artifactPathsByAxis = Object.fromEntries([...REVIEW_AXES].map((axis) => [
    axis,
    specialists.artifacts.filter((artifact) => artifact.axis === axis).map((artifact) => artifact.path).sort(),
  ]));
  for (const axis of REVIEW_AXES) {
    const refs = [...(report.axes?.[axis]?.evidence_refs || [])].sort();
    if (JSON.stringify(refs) !== JSON.stringify(artifactPathsByAxis[axis])) {
      throw new WorkflowStateError(
        'WORKFLOW_REVIEW_EVIDENCE_MISMATCH',
        `review summary ${axis} evidence_refs do not match specialist outputs`,
      );
    }
  }
  const sessions = new Set(specialists.artifacts.map((artifact) => artifact.session));
  if (sessions.size !== 1 || !sessions.has(report.session)) {
    throw new WorkflowStateError(
      'WORKFLOW_REVIEW_EVIDENCE_MISMATCH', 'review summary session does not match specialist artifacts',
    );
  }
  const completed = new Set(report.workers?.completed || []);
  const artifactAgents = new Set(specialists.artifacts.map((artifact) => artifact.agent));
  if (!sameSet(completed, artifactAgents)
    || (report.workers?.failed || []).length > 0) {
    throw new WorkflowStateError(
      'WORKFLOW_REVIEW_EVIDENCE_MISMATCH',
      'completed review workers must match specialist artifacts exactly',
    );
  }
  const selection = Array.isArray(report.worker_selection) ? report.worker_selection : [];
  const seenWorkers = new Set();
  const selected = new Set();
  const skipped = new Set();
  for (const item of selection) {
    const worker = String(item?.worker || '').trim();
    const status = item?.status;
    if (!worker || !['selected', 'skipped'].includes(status)
      || !String(item?.rationale || '').trim() || seenWorkers.has(worker)) {
      throw new WorkflowStateError(
        'WORKFLOW_REVIEW_EVIDENCE_MISMATCH', 'review worker selection provenance is invalid',
      );
    }
    seenWorkers.add(worker);
    (status === 'selected' ? selected : skipped).add(worker);
  }
  const expectedSelected = new Set([
    ...(report.workers?.completed || []), ...(report.workers?.failed || []),
  ]);
  const expectedSkipped = new Set(report.workers?.skipped || []);
  if (!sameSet(seenWorkers, REVIEW_WORKERS)
    || !sameSet(selected, expectedSelected)
    || !sameSet(skipped, expectedSkipped)
    || !selected.has('review-spec') || !completed.has('review-spec')) {
    throw new WorkflowStateError(
      'WORKFLOW_REVIEW_EVIDENCE_MISMATCH',
      'review worker selection must disposition the complete worker roster and match completed, failed, and skipped state',
    );
  }

  const specialistById = new Map(specialists.findings.map((finding) => [finding.id, finding]));
  const summaryById = new Map((report.findings || []).map((finding) => [finding.id, finding]));
  if (specialistById.size !== summaryById.size
    || [...specialistById.keys()].some((id) => !summaryById.has(id))) {
    throw new WorkflowStateError(
      'WORKFLOW_REVIEW_FINDINGS_MISMATCH', 'review summary must preserve every specialist finding',
    );
  }
  const identityFields = [...REVIEW_FINDING_FIELDS, 'line_end'];
  for (const [id, source] of specialistById) {
    const coordinated = summaryById.get(id);
    for (const field of identityFields) {
      if ((coordinated?.[field] ?? null) !== (source[field] ?? null)) {
        throw new WorkflowStateError(
          'WORKFLOW_REVIEW_FINDINGS_MISMATCH',
          `review summary changed ${id}.${field} from its specialist artifact`,
        );
      }
    }
  }

  const axes = Object.fromEntries([...REVIEW_AXES].map((axis) => {
    const hasBlocking = specialists.findings.some(
      (finding) => finding.axis === axis && ['P0', 'P1'].includes(finding.severity),
    );
    return [axis, {
      verdict: hasBlocking ? 'FAIL' : 'PASS',
      evidence_refs: artifactPathsByAxis[axis],
    }];
  }));
  return axes;
}

function validateReviewCompletion(db, run, rootDir) {
  const context = recordedContext(db, run, rootDir, { current: true });
  const specialists = readReviewSpecialists(run, rootDir);
  const { value: report, output } = readOutputJson(
    run, 'coordinate-findings', rootDir, 'ultra-review-summary-v2',
  );
  if (report.change_id !== run.change_id) {
    throw new WorkflowStateError('WORKFLOW_REPORT_CHANGE_MISMATCH', 'review summary change_id is not bound to the workflow');
  }
  if (!['task', 'change', 'plan'].includes(report.mode)
    || (run.task_id && report.mode !== 'task')
    || (!run.task_id && report.mode === 'task')) {
    throw new WorkflowStateError(
      'WORKFLOW_REVIEW_MODE_MISMATCH', 'review summary mode does not match its workflow scope',
    );
  }
  assertBoundTaskSet(db, run, report);
  const checkout = assertCurrentCheckout(report, rootDir);
  if (report.status !== 'complete' || !report.axes || typeof report.axes !== 'object') {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', 'review summary must be complete and contain both axes');
  }
  const spec = report.axes.spec_fidelity;
  const engineering = report.axes.engineering_standards;
  for (const [name, axis] of [['spec_fidelity', spec], ['engineering_standards', engineering]]) {
    if (!axis || !['PASS', 'FAIL', 'INCOMPLETE'].includes(axis.verdict)
      || !Array.isArray(axis.evidence_refs) || axis.evidence_refs.length === 0) {
      throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', `review summary ${name} axis is incomplete`);
    }
  }
  if (!Array.isArray(report.findings)) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', 'review summary findings must be an array');
  }
  if (!report.workers || typeof report.workers !== 'object'
    || ['completed', 'failed', 'skipped'].some((field) => !Array.isArray(report.workers[field]))
    || !Array.isArray(report.positive_observations) || !Array.isArray(report.limitations)) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', 'review summary worker and observation fields are incomplete');
  }
  const summaryFindingIds = new Set();
  for (const finding of report.findings) {
    validateReviewFinding(finding, finding?.axis, summaryFindingIds, 'review summary');
  }
  if (report.context_digest !== context.output.digest) {
    throw new WorkflowStateError(
      'WORKFLOW_REPORT_CONTEXT_MISMATCH', 'review summary context_digest does not match the review context',
    );
  }
  const derivedAxes = assertCoordinatedReviewEvidence(report, specialists);
  for (const axis of REVIEW_AXES) {
    if (report.axes[axis].verdict !== derivedAxes[axis].verdict) {
      throw new WorkflowStateError(
        'WORKFLOW_REPORT_VERDICT_CONFLICT',
        `review ${axis} verdict conflicts with specialist findings; expected ${derivedAxes[axis].verdict}`,
      );
    }
  }
  const expectedVerdict = Object.values(derivedAxes).some((axis) => axis.verdict === 'FAIL')
    ? 'REQUEST_CHANGES' : 'APPROVE';
  if (report.verdict !== expectedVerdict) {
    throw new WorkflowStateError(
      'WORKFLOW_REPORT_VERDICT_CONFLICT',
      `review verdict ${report.verdict} conflicts with evidence; expected ${expectedVerdict}`,
    );
  }
  return {
    change_id: run.change_id,
    task_ids: report.task_ids,
    mode: report.mode,
    worker_selection: report.worker_selection,
    verdict: report.verdict,
    axes: derivedAxes,
    findings: specialists.findings,
    git_commit: checkout.head,
    worktree_digest: checkout.digest,
    report_path: output.path,
    report_digest: output.digest,
    context_path: context.output.path,
    context_digest: context.output.digest,
  };
}

function validateDeliveryCompletion(db, run, rootDir) {
  const gates = validateDeliveryPrerequisites(db, run, rootDir);
  const context = recordedContext(db, run, rootDir, { current: true });
  const change = db.prepare('SELECT status FROM changes WHERE id = ?').get(run.change_id);
  if (change?.status !== 'archived') {
    throw new WorkflowStateError(
      'WORKFLOW_CHANGE_NOT_ARCHIVED', `change ${run.change_id} must be archived before delivery completion`,
    );
  }
  const { value: report, output } = readOutputJson(
    run, 'verify-delivery', rootDir, 'ultra-delivery-report-v1',
  );
  if (report.release !== undefined) {
    throw new WorkflowStateError(
      'WORKFLOW_RELEASE_AUTHORITY_MISMATCH',
      'delivery reports cannot create release authority; record external effects through the host after explicit authorization',
    );
  }
  assertReportSchema(report, 'delivery');
  if (report.change_id !== run.change_id || report.archive_status !== 'archived') {
    throw new WorkflowStateError(
      'WORKFLOW_REPORT_CHANGE_MISMATCH', 'delivery report is not bound to the archived change',
    );
  }
  const baseline = run.baseline_id
    ? db.prepare('SELECT id, status FROM baselines WHERE id = ?').get(run.baseline_id)
    : db.prepare("SELECT id, status FROM baselines WHERE status != 'superseded' ORDER BY updated_at DESC LIMIT 1").get();
  if (!baseline || report.baseline_id !== baseline.id || report.baseline_status !== baseline.status) {
    throw new WorkflowStateError('WORKFLOW_REPORT_BASELINE_MISMATCH', 'delivery report baseline state is stale');
  }
  const checkout = assertCurrentCheckout(report, rootDir);
  assertIsoTimestamp(report.timestamp, 'delivery report timestamp');
  if (!Array.isArray(report.checks) || report.checks.length === 0
    || report.checks.some((item) => item?.status !== 'pass')) {
    throw new WorkflowStateError('WORKFLOW_DELIVERY_CHECK_FAILED', 'delivery checks must all pass');
  }
  if (!String(report.rollback || '').trim()) {
    throw new WorkflowStateError('WORKFLOW_REPORT_INVALID', 'delivery report rollback guidance is required');
  }
  if (report.context_digest !== context.output.digest) {
    throw new WorkflowStateError(
      'WORKFLOW_REPORT_CONTEXT_MISMATCH', 'delivery report context_digest does not match the convergence context',
    );
  }
  return {
    change_id: run.change_id,
    archive_status: report.archive_status,
    baseline_id: baseline.id,
    baseline_status: baseline.status,
    git_commit: checkout.head,
    worktree_digest: checkout.digest,
    report_path: output.path,
    report_digest: output.digest,
    context_path: context.output.path,
    context_digest: context.output.digest,
    ...gates,
  };
}

function validateStageCompletion(db, run, rootDir) {
  if (run.kind === 'plan') return validatePlanArtifact(db, run, rootDir);
  if (run.kind === 'change') return validateChangeCompletion(db, run, rootDir);
  if (run.kind === 'dev') return validateDevCompletion(db, run, rootDir);
  if (run.kind === 'test') return validateTestCompletion(db, run, rootDir);
  if (run.kind === 'review') return validateReviewCompletion(db, run, rootDir);
  if (run.kind === 'deliver') return validateDeliveryCompletion(db, run, rootDir);
  return {};
}

function validatePlanArtifact(db, run, rootDir) {
  const workflowStep = run.steps.find((item) => item.step_id === 'verify-plan');
  const outputs = workflowStep?.outputs || [];
  if (outputs.length !== 1) {
    throw new WorkflowStateError(
      'WORKFLOW_PLAN_ARTIFACT_INVALID',
      'verify-plan requires exactly one JSON execution-plan output',
    );
  }
  const output = outputs[0];
  const resolved = safeProjectFile(rootDir, output.path, 'verify-plan.output');
  let actual;
  try { actual = JSON.parse(fs.readFileSync(resolved.file, 'utf8')); }
  catch (error) {
    throw new WorkflowStateError(
      'WORKFLOW_PLAN_ARTIFACT_INVALID',
      `${output.path} is not valid JSON: ${error.message}`,
    );
  }
  const tasks = changeTasks(db, run.change_id);
  const planStore = require('./plan-store.cjs');
  const expected = planStore.buildPlan(tasks, { changeId: run.change_id });
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new WorkflowStateError(
      'WORKFLOW_PLAN_ARTIFACT_STALE',
      'execution-plan artifact does not match the current change task graph and contracts',
      {
        change_id: run.change_id,
        expected_task_ids: tasks.map((task) => task.id),
        actual_change_id: actual?.change_id || null,
      },
    );
  }
  return {
    plan_path: output.path,
    plan_digest: output.digest,
    plan_schema_version: actual.schema_version,
    plan_wave_count: actual.waves.length,
  };
}

function completeWorkflow(db, input = {}, { rootDir = process.cwd() } = {}) {
  const id = nonEmpty(input.id, 'id');
  return ops.tx(db, () => {
    const run = readWorkflow(db, id, { rootDir });
    if (!run) throw new WorkflowStateError('WORKFLOW_NOT_FOUND', `workflow ${id} not found`);
    if (run.status === 'completed') return run;
    if (run.status !== 'ready') {
      throw new WorkflowStateError('WORKFLOW_NOT_READY', `workflow ${id} is ${run.status}`);
    }
    decisionDialogue.assertDecisionGate(db, {
      workflow_run_id: run.id,
      change_id: run.change_id,
      baseline_id: run.baseline_id,
    }, { rootDir });
    if (run.artifact_health.status !== 'pass') {
      throw new WorkflowStateError('WORKFLOW_OUTPUT_STALE', 'workflow outputs are missing or stale', run.artifact_health);
    }
    const approval = input.approval === undefined ? null : input.approval;
    if (approval !== null && (!approval || typeof approval !== 'object' || Array.isArray(approval))) {
      throw new WorkflowStateError('VALIDATION_ERROR', 'approval must be an object');
    }
    const suppliedSummary = input.summary === undefined ? {} : input.summary;
    if (!suppliedSummary || typeof suppliedSummary !== 'object' || Array.isArray(suppliedSummary)) {
      throw new WorkflowStateError('VALIDATION_ERROR', 'summary must be an object');
    }
    const unauthorizedSummaryFields = Object.keys(suppliedSummary);
    if (unauthorizedSummaryFields.length > 0) {
      throw new WorkflowStateError(
        'WORKFLOW_SUMMARY_AUTHORITY_VIOLATION',
        `workflow ${run.kind} summary is derived from DB-backed evidence; unsupported fields: ${unauthorizedSummaryFields.join(', ')}`,
      );
    }
    if (run.kind !== 'plan' && approval !== null) {
      throw new WorkflowStateError(
        'WORKFLOW_APPROVAL_AUTHORITY_VIOLATION',
        `workflow ${run.kind} does not accept completion approval`,
      );
    }
    let summary = {};
    if (run.kind === 'plan') {
      const contract = validatePlanContract(db, run, rootDir);
      summary = {
        task_ids: contract.task_ids,
        task_contract_digests: contract.task_contract_digests,
        profile: contract.profile,
        coverage: contract.coverage,
        authority_basis: 'accepted_change_contract',
      };
      if (approval !== null) validatePlanApproval(approval);
    }
    if (run.kind === 'dev' && ops.readTask(db, run.task_id)?.status !== 'completed') {
      throw new WorkflowStateError(
        'WORKFLOW_TASK_NOT_COMPLETED', `task ${run.task_id} must be completed before dev workflow convergence`,
      );
    }
    summary = { ...summary, ...validateStageCompletion(db, run, rootDir) };
    const ts = nowIso();
    db.prepare(
      `UPDATE workflow_runs SET status = 'completed', approval_json = ?, summary_json = ?,
       blockers_json = '[]', current_step = NULL, completed_at = ?, updated_at = ? WHERE id = ?`,
    ).run(approval === null ? null : JSON.stringify(approval), JSON.stringify(summary), ts, ts, id);
    ops.appendEventInTx(db, {
      type: 'workflow_completed', task_id: run.task_id, change_id: run.change_id,
      payload: { workflow_id: id, kind: run.kind, baseline_id: run.baseline_id },
    });
    if (run.kind === 'plan' && approval !== null) {
      ops.appendEventInTx(db, {
        type: 'plan_approved', change_id: run.change_id,
        payload: {
          workflow_id: id,
          approved_by: approval.approved_by.trim(),
          approved_at: approval.approved_at || ts,
          plan_path: summary.plan_path,
          plan_digest: summary.plan_digest,
          task_ids: summary.task_ids,
        },
      });
    }
    return readWorkflow(db, id, { rootDir });
  });
}

function validatePlanApproval(approval) {
  const approvedBy = typeof approval?.approved_by === 'string' ? approval.approved_by.trim() : '';
  const note = typeof approval?.approval_note === 'string' ? approval.approval_note.trim() : '';
  if (!approvedBy || note.length < 3) {
    throw new WorkflowStateError(
      'WORKFLOW_APPROVAL_REQUIRED',
      'plan completion requires approved_by and an approval_note for the accepted scope',
    );
  }
  if (approval.approved_at !== undefined
    && (typeof approval.approved_at !== 'string' || Number.isNaN(Date.parse(approval.approved_at)))) {
    throw new WorkflowStateError('VALIDATION_ERROR', 'approval.approved_at must be an ISO-8601 timestamp');
  }
}

function completedResearchSemantics(db, changeId) {
  return db.prepare(
    `SELECT ws.semantic_records_json
     FROM workflow_steps ws JOIN workflow_runs wr ON wr.id = ws.run_id
     WHERE wr.kind = 'research' AND wr.change_id = ? AND wr.status = 'completed'
       AND ws.required = 1 AND ws.status = 'completed'`,
  ).all(changeId).flatMap((row) => (
    parseJson(row.semantic_records_json, 'workflow_steps.semantic_records_json', [])
  ));
}

function validateTaskTrace(task, acceptedSources, rootDir) {
  const trace = String(task.trace_to || '').trim();
  if (acceptedSources.has(trace)) return;
  try {
    sourceRefFile(rootDir, trace, `task ${task.id}.trace_to`);
  } catch (error) {
    throw new WorkflowStateError(
      'WORKFLOW_PLAN_ORPHAN_TASK',
      `task ${task.id} trace_to does not resolve to an accepted requirement or source anchor: ${trace}`,
    );
  }
}

function validatePlanContract(db, run, rootDir = process.cwd()) {
  const taskIds = changeTasks(db, run.change_id).map((task) => task.id);
  if (taskIds.length === 0) {
    throw new WorkflowStateError('WORKFLOW_TASKS_REQUIRED', 'plan completion requires task_ids');
  }
  const tasks = taskIds.map((id) => {
    const task = ops.readTask(db, id);
    if (!task) throw new WorkflowStateError('TASK_NOT_FOUND', `planned task ${id} does not exist`);
    if (run.change_id && task.change_id !== run.change_id) {
      throw new WorkflowStateError(
        'TASK_CHANGE_OWNERSHIP_MISMATCH',
        `planned task ${id} is not owned by change ${run.change_id}`,
      );
    }
    ops.assertTaskExecutionContract(task);
    if (task.stale) {
      throw new WorkflowStateError(
        'WORKFLOW_PLAN_TASK_CONTRACT_STALE',
        `task ${id} was invalidated by newer change authority and must be reconciled`,
      );
    }
    return task;
  });
  const changeRow = db.prepare(
    'SELECT kind, contract_json FROM changes WHERE id = ?',
  ).get(run.change_id);
  const profile = changeRow?.kind || 'standard';
  if (profile === 'quick' && tasks.length !== 1) {
    throw new WorkflowStateError(
      'WORKFLOW_QUICK_PLAN_TOO_LARGE', 'quick changes require exactly one executable task',
    );
  }
  const changeContract = parseJson(changeRow?.contract_json || '{}', 'changes.contract_json', {});
  const requiredAcceptance = (changeContract.acceptance || []).map((item) => item.id);
  const coveredAcceptance = new Set(tasks.flatMap((task) => (
    (task.acceptance || []).map((item) => item.id)
  )));
  const missingAcceptance = requiredAcceptance.filter((id) => !coveredAcceptance.has(id));
  if (missingAcceptance.length > 0) {
    throw new WorkflowStateError(
      'WORKFLOW_PLAN_COVERAGE_INCOMPLETE',
      `change acceptance has no executable task coverage: ${missingAcceptance.join(', ')}`,
    );
  }
  const semantics = completedResearchSemantics(db, run.change_id);
  const acceptedSources = new Set([
    ...requiredAcceptance,
    ...semantics.map((record) => record.id),
    ...semantics.map((record) => record.source_ref),
  ]);
  for (const task of tasks) validateTaskTrace(task, acceptedSources, rootDir);
  const planned = new Set(taskIds);
  for (const task of tasks) {
    for (const dep of task.deps || []) {
      if (!ops.readTask(db, dep)) {
        throw new WorkflowStateError('TASK_DEPENDENCY_MISSING', `task ${task.id} depends on missing task ${dep}`);
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(tasks.map((task) => [task.id, task]));
  function visit(id) {
    if (visiting.has(id)) throw new WorkflowStateError('TASK_DEPENDENCY_CYCLE', `planned task dependency cycle includes ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of byId.get(id)?.deps || []) if (planned.has(dep)) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of taskIds) visit(id);
  return {
    task_ids: taskIds,
    profile,
    coverage: {
      required_acceptance_ids: requiredAcceptance,
      covered_acceptance_ids: requiredAcceptance.filter((id) => coveredAcceptance.has(id)),
      orphan_task_ids: [],
    },
    task_contract_digests: Object.fromEntries(
      tasks.map((task) => [task.id, taskPlanDigest(task)]),
    ),
  };
}

function inspectWorkflowHealth(db, { rootDir = process.cwd() } = {}) {
  const all = listWorkflows(db, { limit: 500 }, { rootDir });
  const active = all
    .filter((run) => ['active', 'blocked', 'ready'].includes(run.status));
  const stale = active.filter((run) => run.artifact_health.status !== 'pass');
  const historicalStale = all.filter(
    (run) => run.status === 'completed' && run.artifact_health.status !== 'pass',
  );
  const terminalAuthority = db.prepare(
    `SELECT wr.id, wr.kind, wr.status, wr.change_id, c.status AS change_status
     FROM workflow_runs wr JOIN changes c ON c.id = wr.change_id
     WHERE wr.status IN ('active', 'blocked', 'ready')
       AND c.status IN ('archived', 'cancelled')
     ORDER BY wr.updated_at DESC`,
  ).all();
  const untrackedChanges = db.prepare(
    `SELECT c.id FROM changes c
     WHERE c.status IN ('active', 'blocked', 'ready')
       AND NOT EXISTS (SELECT 1 FROM workflow_runs wr WHERE wr.kind = 'change' AND wr.change_id = c.id)
     ORDER BY c.updated_at DESC`,
  ).all().map((row) => row.id);
  const structuralAuthorityFailure = terminalAuthority.length > 0 || untrackedChanges.length > 0;
  return {
    status: stale.length === 0 && !structuralAuthorityFailure ? 'pass' : 'fail',
    active: active.length,
    blocked: active.filter((run) => run.status === 'blocked').length,
    ready: active.filter((run) => run.status === 'ready').length,
    stale_outputs: stale.map((run) => ({ id: run.id, blockers: run.artifact_health.blockers })),
    historical_stale_outputs: historicalStale.map(
      (run) => ({ id: run.id, blockers: run.artifact_health.blockers }),
    ),
    terminal_authority_runs: terminalAuthority,
    untracked_active_changes: untrackedChanges,
  };
}

function recoverUntrackedChangeWorkflows(db, { rootDir = process.cwd() } = {}) {
  const changes = db.prepare(
    `SELECT id, title FROM changes c
     WHERE c.status IN ('active', 'blocked', 'ready')
       AND NOT EXISTS (
         SELECT 1 FROM workflow_runs wr WHERE wr.kind = 'change' AND wr.change_id = c.id
       )
     ORDER BY c.updated_at ASC, c.id ASC`,
  ).all();
  const baseline = db.prepare(
    "SELECT id FROM baselines WHERE status != 'superseded' ORDER BY updated_at DESC, rowid DESC LIMIT 1",
  ).get();
  const result = { found: changes.length, created: 0, failed: 0, items: [] };
  for (const change of changes) {
    let run = null;
    try {
      run = startWorkflow(db, {
        kind: 'change', baseline_id: baseline?.id || null, change_id: change.id,
        subject: `Recover durable workflow provenance for ${change.title}.`,
        metadata: { recovery: 'legacy_untracked_change' },
      }, { rootDir });
      run = recordWorkflowStep(db, {
        id: run.id, step_id: 'bind-baseline', status: 'blocked',
        blockers: ['LEGACY_CHANGE_PROVENANCE_REQUIRED'],
      }, { rootDir });
      result.created += 1;
      result.items.push({ change_id: change.id, workflow_id: run.id, status: run.status });
    } catch (error) {
      if (run?.id) db.prepare('DELETE FROM workflow_runs WHERE id = ?').run(run.id);
      result.failed += 1;
      result.items.push({ change_id: change.id, status: 'failed', error: error.code || error.message });
    }
  }
  return result;
}

module.exports = {
  DEFINITION_VERSION,
  WORKFLOW_DEFINITIONS,
  RESEARCH_MODES,
  RUN_KINDS,
  RUN_STATUSES,
  WorkflowStateError,
  insertWorkflowInTx,
  startWorkflow,
  readWorkflow,
  listWorkflows,
  recordWorkflowStep,
  completeWorkflow,
  inspectWorkflowHealth,
  recoverUntrackedChangeWorkflows,
  validateDeliveryPrerequisites,
  validatePlanContract,
  assertCurrentPlan,
  assertApprovedReview,
  resolveProjectSourceRef: sourceRefFile,
};
