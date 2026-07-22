'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Ajv = require('ajv/dist/2020');

const ops = require('./state-ops.cjs');
const contextSpine = require('./context-spine.cjs');
const specLearning = require('./spec-learning.cjs');
const providerRefs = require('./provider-refs.cjs');
const baselines = require('./baseline-workflow.cjs');
const archiveJournal = require('./archive-journal.cjs');
const workflows = require('./workflow-state.cjs');
const reconciliationSchema = require('../../spec/schemas/baseline-reconciliation.v1.schema.json');

const reconciliationAjv = new Ajv({ allErrors: true, strict: false });
const validateReconciliationSchema = reconciliationAjv.compile(reconciliationSchema);

const CHANGE_ID = /^[a-zA-Z0-9_-]+$/;
const CHANGE_PATCH_FIELDS = new Set([
  'title', 'intent', 'status', 'docs_impact', 'provider_refs',
  'contract', 'classification', 'research_disposition',
]);
const CHANGE_TRANSITIONS = Object.freeze({
  active: new Set(['active', 'blocked', 'cancelled']),
  blocked: new Set(['active', 'blocked', 'cancelled']),
  ready: new Set(['ready']),
  archived: new Set(),
  cancelled: new Set(),
});
const CHANGE_KINDS = new Set(['quick', 'standard', 'major', 'incident']);
const CHANGE_RISK_FLAGS = new Set([
  'public_contract', 'schema_migration', 'data_migration', 'authorization', 'security',
  'multi_module', 'external_integration', 'release_semantics',
]);
const QUICK_EXCLUSION_FLAGS = new Set(CHANGE_RISK_FLAGS);
const RESEARCH_DISPOSITIONS = new Set(['none', 'bounded', 'required']);
const CHANGE_RESEARCH_MODES = new Set(['product', 'feature', 'architecture', 'custom']);
const INCIDENT_DIAGNOSIS_SECTIONS = Object.freeze([
  { heading: 'Reproduction', key: 'reproduction' },
  { heading: 'Hypotheses', key: 'hypotheses' },
  { heading: 'Root cause', key: 'root-cause' },
  { heading: 'Regression test', key: 'regression-test' },
  { heading: 'Recovery', key: 'recovery' },
]);

class ChangeWorkflowError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ChangeWorkflowError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, field) {
  try { return JSON.parse(value); }
  catch (error) {
    throw new ChangeWorkflowError('STATE_CORRUPT', `invalid ${field}: ${error.message}`);
  }
}

function rowToChange(row) {
  if (!row) return null;
  const change = {
    ...row,
    docs_impact: parseJson(row.docs_impact_json, 'docs_impact_json'),
    provider_refs: parseJson(row.provider_refs_json, 'provider_refs_json'),
    baseline_bypass: row.baseline_bypass_json
      ? parseJson(row.baseline_bypass_json, 'baseline_bypass_json') : null,
    contract: parseJson(row.contract_json || '{}', 'contract_json'),
    classification: parseJson(row.classification_json || '{}', 'classification_json'),
    research_disposition: parseJson(
      row.research_disposition_json || '{}', 'research_disposition_json',
    ),
  };
  delete change.docs_impact_json;
  delete change.provider_refs_json;
  delete change.baseline_bypass_json;
  delete change.contract_json;
  delete change.classification_json;
  delete change.research_disposition_json;
  return change;
}

function normalizeDocsImpact(value) {
  const input = value || {};
  const status = input.status || 'unknown';
  if (!['unknown', 'required', 'none'].includes(status)) {
    throw new ChangeWorkflowError('VALIDATION_ERROR', `invalid docs impact status: ${status}`);
  }
  const files = input.files === undefined ? [] : input.files;
  if (!Array.isArray(files) || files.some((file) => typeof file !== 'string' || !file.trim())) {
    throw new ChangeWorkflowError('VALIDATION_ERROR', 'docs impact files must be non-empty strings');
  }
  const rationale = input.rationale == null ? null : String(input.rationale).trim();
  return { status, files: [...new Set(files)], rationale };
}

function normalizeProviderRefs(value) {
  return providerRefs.normalizeProviderRefs(value, ChangeWorkflowError);
}

function requiredText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ChangeWorkflowError('CHANGE_CONTRACT_REQUIRED', `${field} is required`);
  return text;
}

function stringList(value, field, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
    || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new ChangeWorkflowError(
      'CHANGE_CONTRACT_REQUIRED', `${field} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings`,
    );
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function normalizeChangeContract(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChangeWorkflowError('CHANGE_CONTRACT_REQUIRED', 'contract is required');
  }
  if (!Array.isArray(value.acceptance) || value.acceptance.length === 0) {
    throw new ChangeWorkflowError('CHANGE_CONTRACT_REQUIRED', 'contract.acceptance is required');
  }
  const ids = new Set();
  const acceptance = value.acceptance.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ChangeWorkflowError('CHANGE_CONTRACT_REQUIRED', `contract.acceptance[${index}] is invalid`);
    }
    const id = requiredText(item.id, `contract.acceptance[${index}].id`);
    if (!CHANGE_ID.test(id) || ids.has(id)) {
      throw new ChangeWorkflowError('CHANGE_CONTRACT_REQUIRED', `acceptance id is invalid or duplicated: ${id}`);
    }
    ids.add(id);
    return {
      id,
      criterion: requiredText(item.criterion, `contract.acceptance[${index}].criterion`),
      verification: requiredText(item.verification, `contract.acceptance[${index}].verification`),
    };
  });
  const recovery = value.recovery;
  if (!recovery || typeof recovery !== 'object' || Array.isArray(recovery)) {
    throw new ChangeWorkflowError('CHANGE_CONTRACT_REQUIRED', 'contract.recovery is required');
  }
  if (!Array.isArray(value.unresolved_decisions)) {
    throw new ChangeWorkflowError(
      'CHANGE_CONTRACT_REQUIRED', 'contract.unresolved_decisions must be an explicit array',
    );
  }
  const decisions = value.unresolved_decisions.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ChangeWorkflowError('CHANGE_CONTRACT_REQUIRED', `unresolved decision ${index} is invalid`);
    }
    return {
      id: requiredText(item.id, `contract.unresolved_decisions[${index}].id`),
      summary: requiredText(item.summary, `contract.unresolved_decisions[${index}].summary`),
      blocking: item.blocking === true,
      owner: item.owner == null ? null : requiredText(item.owner, `contract.unresolved_decisions[${index}].owner`),
    };
  });
  return {
    outcome: requiredText(value.outcome, 'contract.outcome'),
    acceptance,
    non_goals: stringList(value.non_goals, 'contract.non_goals'),
    public_seams: stringList(value.public_seams, 'contract.public_seams'),
    recovery: {
      strategy: requiredText(recovery.strategy, 'contract.recovery.strategy'),
      verification: requiredText(recovery.verification, 'contract.recovery.verification'),
    },
    unresolved_decisions: decisions,
  };
}

function normalizeClassification(value, kind) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChangeWorkflowError('CHANGE_CLASSIFICATION_REQUIRED', 'classification is required');
  }
  const flags = stringList(value.risk_flags, 'classification.risk_flags', { allowEmpty: true });
  const invalid = flags.filter((flag) => !CHANGE_RISK_FLAGS.has(flag));
  if (invalid.length > 0) {
    throw new ChangeWorkflowError('CHANGE_CLASSIFICATION_REQUIRED', `unknown risk flags: ${invalid.join(', ')}`);
  }
  if (kind === 'quick') {
    const excluded = flags.filter((flag) => QUICK_EXCLUSION_FLAGS.has(flag));
    if (excluded.length > 0) {
      throw new ChangeWorkflowError(
        'CHANGE_PROFILE_ESCALATION_REQUIRED',
        `quick changes cannot carry these risk flags: ${excluded.join(', ')}`,
      );
    }
  }
  return {
    rationale: requiredText(value.rationale, 'classification.rationale'),
    risk_flags: flags,
  };
}

function normalizeResearchDisposition(value, kind) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChangeWorkflowError('CHANGE_RESEARCH_DISPOSITION_REQUIRED', 'research_disposition is required');
  }
  const status = String(value.status || '').trim();
  if (!RESEARCH_DISPOSITIONS.has(status)) {
    throw new ChangeWorkflowError('CHANGE_RESEARCH_DISPOSITION_REQUIRED', 'research disposition status is invalid');
  }
  const selectedSteps = stringList(
    value.selected_steps || [], 'research_disposition.selected_steps', { allowEmpty: true },
  );
  const mode = value.mode == null ? null : String(value.mode).trim();
  if (status === 'none' && (mode !== null || selectedSteps.length > 0)) {
    throw new ChangeWorkflowError(
      'CHANGE_RESEARCH_DISPOSITION_REQUIRED', 'research status none cannot select a mode or steps',
    );
  }
  if (status !== 'none' && !CHANGE_RESEARCH_MODES.has(mode)) {
    throw new ChangeWorkflowError(
      'CHANGE_RESEARCH_DISPOSITION_REQUIRED', 'bounded or required research needs a supported mode',
    );
  }
  if (mode === 'custom' && selectedSteps.length === 0) {
    throw new ChangeWorkflowError(
      'CHANGE_RESEARCH_DISPOSITION_REQUIRED', 'custom research needs selected_steps',
    );
  }
  if (kind === 'quick' && status !== 'none') {
    throw new ChangeWorkflowError(
      'CHANGE_PROFILE_ESCALATION_REQUIRED', 'a change that requires research cannot use the quick profile',
    );
  }
  return {
    status, mode, selected_steps: selectedSteps,
    rationale: requiredText(value.rationale, 'research_disposition.rationale'),
  };
}

function normalizeBaselineBypass(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChangeWorkflowError(
      'BASELINE_BYPASS_REQUIRED',
      'incident work without a ready baseline requires an explicit baseline_bypass record',
    );
  }
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  const approvedBy = typeof value.approved_by === 'string' ? value.approved_by.trim() : '';
  if (reason.length < 3 || !approvedBy) {
    throw new ChangeWorkflowError(
      'BASELINE_BYPASS_REQUIRED',
      'baseline_bypass requires reason and approved_by',
    );
  }
  return {
    mode: 'incident_break_glass',
    reason,
    approved_by: approvedBy,
    recorded_at: nowIso(),
  };
}

function gitHead(rootDir) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function safeRelativePath(rootDir, candidate) {
  if (typeof candidate !== 'string' || !candidate.trim() || path.isAbsolute(candidate)) {
    throw new ChangeWorkflowError('VALIDATION_ERROR', `path must be project-relative: ${candidate}`);
  }
  const root = path.resolve(rootDir);
  const target = path.resolve(root, candidate);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new ChangeWorkflowError('VALIDATION_ERROR', `path escapes project root: ${candidate}`);
  }
  return target;
}

function readReconciliationManifest(db, change, input, rootDir) {
  const relative = typeof input.reconciliation_path === 'string'
    ? input.reconciliation_path.trim() : '';
  if (!relative) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_REQUIRED', 'reconciliation_path is required',
    );
  }
  let file = safeRelativePath(rootDir, relative);
  const artifactRoot = path.resolve(rootDir, change.artifact_root);
  if (!file.startsWith(`${artifactRoot}${path.sep}`)) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_REQUIRED',
      'reconciliation manifest must be a file inside the active change artifact root',
    );
  }
  let manifest;
  if (!fs.existsSync(file)) {
    const pending = archiveJournal.listArchiveIntents(rootDir).find(
      (item) => !item.error && item.intent.change_id === change.id
        && item.intent.reconciliation_path === relative,
    );
    if (pending) {
      const suffix = path.relative(pending.intent.source, relative);
      file = path.join(pending.destination, suffix);
      manifest = pending.intent.reconciliation_manifest;
    }
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_REQUIRED', 'reconciliation manifest file is missing',
    );
  }
  try { manifest ||= JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    throw new ChangeWorkflowError('BASELINE_RECONCILIATION_MANIFEST_INVALID', error.message);
  }
  if (!validateReconciliationSchema(manifest)) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_INVALID',
      `reconciliation manifest does not satisfy its published schema: ${reconciliationAjv.errorsText(validateReconciliationSchema.errors)}`,
      validateReconciliationSchema.errors,
    );
  }
  const baseline = baselines.readBaseline(db);
  const updates = Array.isArray(input.baseline_updates) ? input.baseline_updates : [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || manifest.$schema !== 'ultra-baseline-reconciliation-v1'
    || manifest.change_id !== change.id || manifest.baseline_id !== (baseline?.id || null)
    || JSON.stringify(manifest.baseline_updates) !== JSON.stringify(updates)
    || !Array.isArray(manifest.semantic_changes)
    || !Array.isArray(manifest.resolved_gap_ids)
    || !Array.isArray(manifest.resolved_unknowns)
    || !Array.isArray(manifest.verification) || manifest.verification.length === 0) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_INVALID', 'reconciliation manifest shape or authority binding is invalid',
    );
  }
  if (manifest.verification.some((item) => (
    !item || typeof item !== 'object' || item.status !== 'pass'
    || !String(item.name || '').trim() || !String(item.command || '').trim()
    || !String(item.evidence || '').trim()
  ))) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_INVALID', 'every reconciliation verification must be an evidenced pass',
    );
  }
  if (updates.length === 0) {
    if (manifest.semantic_changes.length > 0
      || String(manifest.semantic_no_change_reason || '').trim().length < 3) {
      throw new ChangeWorkflowError(
        'BASELINE_RECONCILIATION_MANIFEST_INVALID',
        'no-change reconciliation requires an explicit semantic_no_change_reason and no semantic changes',
      );
    }
  } else if (manifest.semantic_changes.length === 0) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_INVALID', 'baseline updates require semantic change records',
    );
  }
  const specRefs = new Map((baseline?.spec_refs || []).map((ref) => [ref.path, ref]));
  const semanticPaths = new Set();
  for (const item of manifest.semantic_changes) {
    if (!item || typeof item !== 'object' || !CHANGE_ID.test(String(item.id || ''))
      || !['add', 'update'].includes(item.action)
      || !/^[0-9a-f]{64}$/.test(String(item.after_digest || ''))) {
      throw new ChangeWorkflowError(
        'BASELINE_RECONCILIATION_MANIFEST_INVALID', 'semantic change record is invalid',
      );
    }
    let resolved;
    try { resolved = workflows.resolveProjectSourceRef(rootDir, item.source_ref, 'semantic_change.source_ref'); }
    catch (error) {
      throw new ChangeWorkflowError('BASELINE_RECONCILIATION_MANIFEST_INVALID', error.message);
    }
    semanticPaths.add(resolved.relative);
    if (!updates.includes(resolved.relative) || resolved.digest !== item.after_digest) {
      throw new ChangeWorkflowError(
        'BASELINE_RECONCILIATION_MANIFEST_INVALID',
        `semantic change digest or baseline update binding is invalid: ${item.source_ref}`,
      );
    }
    const before = specRefs.get(resolved.relative)?.digest || null;
    if ((item.before_digest || null) !== before || item.action !== (before ? 'update' : 'add')) {
      throw new ChangeWorkflowError(
        'BASELINE_RECONCILIATION_MANIFEST_INVALID',
        `semantic change before-state is invalid: ${item.source_ref}`,
      );
    }
  }
  const missingSemanticUpdates = updates.filter((update) => !semanticPaths.has(update));
  if (missingSemanticUpdates.length > 0) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_INVALID',
      `baseline updates have no semantic record: ${missingSemanticUpdates.join(', ')}`,
    );
  }
  const gapIds = new Set((baseline?.gaps || []).map((gap) => gap.id));
  const unknowns = new Set((baseline?.unknowns || []).map((unknown) => unknown.summary));
  if (manifest.resolved_gap_ids.some((id) => !gapIds.has(id))
    || manifest.resolved_unknowns.some((summary) => !unknowns.has(summary))) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_INVALID', 'resolved gap or unknown does not exist in baseline authority',
    );
  }
  const serialized = fs.readFileSync(file);
  return {
    manifest, relative, file,
    digest: crypto.createHash('sha256').update(serialized).digest('hex'),
  };
}

function readChange(db, id) {
  return rowToChange(db.prepare('SELECT * FROM changes WHERE id = ?').get(id));
}

const LIST_CHANGES_SQL = "SELECT * FROM changes WHERE (@status IS NULL OR status = @status) AND (@kind IS NULL OR kind = @kind) ORDER BY created_at DESC LIMIT @maxn";

function listChanges(db, { status = null, kind = null, limit = 100 } = {}) {
  return db.prepare(LIST_CHANGES_SQL).all({
    status, kind, maxn: Math.min(Math.max(limit, 1), 500),
  }).map(rowToChange);
}

function writeIntent(file, change) {
  const impact = change.docs_impact;
  const lines = [
    `# ${change.title}`,
    '',
    `- Change: \`${change.id}\``,
    `- Kind: \`${change.kind}\``,
    `- Base commit: \`${change.base_commit || 'unavailable'}\``,
    `- Documentation impact: \`${impact.status}\``,
    `- Research disposition: \`${change.research_disposition.status}\``,
    '',
    '## Intent',
    '',
    change.intent,
    '',
    '## Outcome', '', change.contract.outcome, '',
    '## Acceptance', '',
    ...change.contract.acceptance.flatMap((item) => [
      `### ${item.id}`, '', item.criterion, '', `Verification: \`${item.verification}\``, '',
    ]),
    '## Public seams', '', ...change.contract.public_seams.map((item) => `- ${item}`), '',
    '## Non-goals', '', ...change.contract.non_goals.map((item) => `- ${item}`), '',
    '## Recovery', '', change.contract.recovery.strategy, '',
    `Verification: \`${change.contract.recovery.verification}\``, '',
    '## Classification', '', change.classification.rationale, '',
    `Risk flags: ${change.classification.risk_flags.join(', ') || 'none'}`, '',
    '## Research routing', '', change.research_disposition.rationale, '',
  ];
  if (impact.rationale) lines.push('## Documentation rationale', '', impact.rationale, '');
  if (change.baseline_bypass) {
    lines.push(
      '## Baseline break-glass', '',
      `- Approved by: ${change.baseline_bypass.approved_by}`,
      `- Recorded at: ${change.baseline_bypass.recorded_at}`,
      '', change.baseline_bypass.reason, '',
    );
  }
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function writeIncidentDiagnosis(file, change) {
  const lines = [
    `# Incident diagnosis: ${change.title}`,
    '',
    ...INCIDENT_DIAGNOSIS_SECTIONS.flatMap(({ heading }) => [`## ${heading}`, '', '']),
  ];
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function readMarkdownSections(text) {
  const sections = new Map();
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current).push(line);
  }
  return new Map([...sections].map(([key, lines]) => [key, lines.join('\n').trim()]));
}

function inspectIncidentDiagnosis(change, artifactDir, rootDir) {
  if (change.kind !== 'incident') return { blockers: [], artifact: null };
  const diagnosisPath = path.join(artifactDir, 'diagnosis.md');
  if (!fs.existsSync(diagnosisPath)) {
    return { blockers: ['DIAGNOSIS_ARTIFACT_MISSING'], artifact: null };
  }
  const content = fs.readFileSync(diagnosisPath);
  const sections = readMarkdownSections(content.toString('utf8'));
  const blockers = INCIDENT_DIAGNOSIS_SECTIONS
    .filter(({ key }) => !sections.get(key) || sections.get(key).length < 3)
    .map(({ key }) => `DIAGNOSIS_SECTION_MISSING:${key}`);
  return {
    blockers,
    artifact: {
      change_id: change.id,
      kind: 'diagnosis',
      artifactPath: path.relative(rootDir, diagnosisPath),
      contentHash: crypto.createHash('sha256').update(content).digest('hex'),
      metadata: { required_sections: INCIDENT_DIAGNOSIS_SECTIONS.map(({ key }) => key) },
    },
  };
}

function upsertArtifact(db, { change_id, task_id = null, kind, artifactPath, contentHash, metadata }) {
  const id = `art-${crypto.randomUUID().slice(0, 12)}`;
  db.prepare(
    `INSERT INTO artifacts (id, change_id, task_id, kind, path, content_hash, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(change_id, kind, path) DO UPDATE SET
       task_id = excluded.task_id, content_hash = excluded.content_hash,
       metadata_json = excluded.metadata_json, updated_at = excluded.updated_at`,
  ).run(
    id, change_id, task_id, kind, artifactPath, contentHash || null,
    metadata === undefined ? null : JSON.stringify(metadata),
  );
}

function compileContext(db, input, { rootDir = process.cwd() } = {}) {
  const change = readChange(db, input.id);
  if (!change) throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${input.id} not found`);
  if (['archived', 'cancelled'].includes(change.status)) {
    throw new ChangeWorkflowError('CHANGE_TERMINAL', `change ${input.id} is ${change.status}`);
  }
  const providers = input.provider_refs === undefined
    ? change.provider_refs
    : normalizeProviderRefs(input.provider_refs);
  const tasks = db.prepare(
    'SELECT id FROM tasks WHERE change_id = ? ORDER BY created_at ASC',
  ).all(change.id).map((task) => ops.readTask(db, task.id));
  const specs = Array.isArray(input.spec_refs) ? input.spec_refs : [];
  const spine = contextSpine.compileRoleContext(db, { input, change, tasks, rootDir });
  const snapshotId = `ctx-${crypto.randomUUID().slice(0, 12)}`;
  const manifest = {
    schema_version: '2.0',
    snapshot_id: snapshotId,
    generated_at: nowIso(),
    change: {
      id: change.id, title: change.title, kind: change.kind, status: change.status,
      intent: change.intent, docs_impact: change.docs_impact, base_commit: change.base_commit,
      baseline_bypass: change.baseline_bypass,
      contract: change.contract, classification: change.classification,
      research_disposition: change.research_disposition,
    },
    git: {
      head: spine.resume.git_head,
      worktree_state: spine.resume.worktree_state,
      worktree_digest: spine.resume.worktree_digest,
    },
    tasks,
    selected_task: spine.selected_task,
    specs,
    role: spine.role,
    gate: spine.gate,
    next_action: spine.next_action,
    readiness: spine.readiness,
    context: spine.context,
    execution_contract: spine.execution_contract,
    baseline: spine.baseline,
    resume: spine.resume,
    providers,
    provider_boundary: 'metadata references only; memory and code graph content remain external',
  };
  const artifactDir = path.resolve(rootDir, change.artifact_root);
  fs.mkdirSync(artifactDir, { recursive: true });
  const manifestPath = path.join(artifactDir, 'contexts', `${snapshotId}.json`);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(manifestPath, serialized);
  const hash = crypto.createHash('sha256').update(serialized).digest('hex');
  const relative = path.relative(rootDir, manifestPath);

  ops.tx(db, () => {
    db.prepare(
      `INSERT INTO context_snapshots
       (id, change_id, task_id, git_head, provider_refs_json, manifest_path, manifest_hash,
        role, gate, next_action, readiness, blockers_json, context_json,
        token_estimate, token_budget)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      snapshotId, change.id, input.task_id || null,
      spine.resume.git_head, JSON.stringify(providers), relative, hash,
      spine.role, spine.gate, spine.next_action, spine.readiness.status,
      JSON.stringify(spine.readiness.blockers), JSON.stringify(spine),
      spine.context.token_estimate, spine.context.budget.max_tokens,
    );
    upsertArtifact(db, {
      change_id: change.id, task_id: input.task_id || null, kind: 'context_manifest',
      artifactPath: relative, contentHash: hash,
      metadata: {
        git_head: spine.resume.git_head,
        worktree_digest: spine.resume.worktree_digest,
        role: spine.role, gate: spine.gate,
        readiness: spine.readiness.status, token_estimate: spine.context.token_estimate,
      },
    });
    for (const task of tasks) {
      if (!task.trace_to) continue;
      db.prepare(
        `INSERT OR IGNORE INTO trace_links
         (change_id, task_id, source_ref, target_ref, relation) VALUES (?, ?, ?, ?, ?)`,
      ).run(change.id, task.id, task.trace_to, `task:${task.id}`, 'specified_by');
    }
    db.prepare('UPDATE changes SET provider_refs_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(providers), nowIso(), change.id);
    ops.appendEventInTx(db, {
      type: 'context_updated', change_id: change.id, task_id: input.task_id || null,
      payload: {
        manifest_path: relative, manifest_hash: hash, git_head: spine.resume.git_head,
        worktree_digest: spine.resume.worktree_digest,
        role: spine.role, gate: spine.gate, readiness: spine.readiness.status,
        next_action: spine.next_action,
      },
    });
    const linkedWorkflow = db.prepare(
      `SELECT id FROM workflow_runs
       WHERE kind = 'change' AND change_id = ? AND current_step = 'compile-context'
         AND status IN ('active', 'blocked')
       ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
    ).get(change.id);
    if (linkedWorkflow) {
      if (spine.readiness.status === 'ready') {
        workflows.recordWorkflowStep(db, {
          id: linkedWorkflow.id, step_id: 'compile-context', status: 'completed',
          evidence: [{
            kind: 'context', ref: relative,
            summary: `Role ${spine.role} context is ready for ${input.task_id || 'change planning'}.`,
          }],
          outputs: [{ path: relative, kind: 'context-manifest' }],
        }, { rootDir });
      } else {
        workflows.recordWorkflowStep(db, {
          id: linkedWorkflow.id, step_id: 'compile-context', status: 'blocked',
          blockers: spine.readiness.blockers,
        }, { rootDir });
      }
    }
  });
  return { manifest, context_manifest_path: manifestPath, manifest_hash: hash };
}

function createChange(db, input, { rootDir = process.cwd() } = {}) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const intent = typeof input?.intent === 'string' ? input.intent.trim() : '';
  if (!input || !CHANGE_ID.test(input.id || '') || title.length < 3 || intent.length < 3) {
    throw new ChangeWorkflowError(
      'VALIDATION_ERROR',
      'id plus non-blank title and intent of at least three characters are required',
    );
  }
  if (!CHANGE_KINDS.has(input.kind)) {
    throw new ChangeWorkflowError('VALIDATION_ERROR', `invalid change kind: ${input.kind}`);
  }
  if (input.baseline_bypass !== undefined && input.kind !== 'incident') {
    throw new ChangeWorkflowError(
      'VALIDATION_ERROR', 'baseline_bypass is valid only for incident changes',
    );
  }
  if (readChange(db, input.id)) throw new ChangeWorkflowError('DUPLICATE_CHANGE_ID', `change ${input.id} exists`);
  const baselineHealth = baselines.inspectBaseline(db, { rootDir });
  let baselineBypass = null;
  if (baselineHealth.status !== 'pass') {
    if (input.kind !== 'incident') {
      throw new ChangeWorkflowError(
        'BASELINE_NOT_READY',
        `ordinary changes require a ready baseline: ${baselineHealth.blockers.join(', ')}`,
        { blockers: baselineHealth.blockers },
      );
    }
    baselineBypass = normalizeBaselineBypass(input.baseline_bypass);
  } else if (input.baseline_bypass !== undefined) {
    throw new ChangeWorkflowError(
      'VALIDATION_ERROR', 'baseline_bypass is not valid while the project baseline is healthy',
    );
  }
  const docsImpact = normalizeDocsImpact(input.docs_impact);
  const providers = normalizeProviderRefs(input.provider_refs);
  const contract = normalizeChangeContract(input.contract);
  const classification = normalizeClassification(input.classification, input.kind);
  const researchDisposition = normalizeResearchDisposition(input.research_disposition, input.kind);
  const artifactRoot = path.join('.ultra', 'changes', 'active', input.id);
  const artifactDir = path.resolve(rootDir, artifactRoot);
  if (fs.existsSync(artifactDir)) {
    throw new ChangeWorkflowError('CHANGE_ARTIFACT_EXISTS', `change artifact already exists: ${artifactDir}`);
  }
  const ts = nowIso();
  const row = {
    id: input.id, title, kind: input.kind, status: 'active',
    intent, docs_impact: docsImpact, provider_refs: providers, baseline_bypass: baselineBypass,
    contract, classification, research_disposition: researchDisposition,
    base_commit: input.base_commit || gitHead(rootDir), artifact_root: artifactRoot,
    created_at: ts, updated_at: ts,
  };
  try {
    return ops.tx(db, () => {
      db.prepare(
        `INSERT INTO changes
         (id, title, kind, status, intent, docs_impact_json, provider_refs_json,
          baseline_bypass_json, contract_json, classification_json,
          research_disposition_json, base_commit, artifact_root, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.id, row.title, row.kind, row.status, row.intent, JSON.stringify(row.docs_impact),
        JSON.stringify(row.provider_refs), row.baseline_bypass
          ? JSON.stringify(row.baseline_bypass) : null,
        JSON.stringify(row.contract), JSON.stringify(row.classification),
        JSON.stringify(row.research_disposition), row.base_commit, row.artifact_root, ts, ts,
      );
      fs.mkdirSync(artifactDir, { recursive: true });
      const intentPath = path.join(artifactDir, 'intent.md');
      writeIntent(intentPath, row);
      upsertArtifact(db, {
        change_id: row.id, kind: 'intent', artifactPath: path.relative(rootDir, intentPath),
        contentHash: crypto.createHash('sha256').update(fs.readFileSync(intentPath)).digest('hex'),
      });
      if (row.kind === 'incident') {
        const diagnosisPath = path.join(artifactDir, 'diagnosis.md');
        writeIncidentDiagnosis(diagnosisPath, row);
        upsertArtifact(db, {
          change_id: row.id,
          kind: 'diagnosis',
          artifactPath: path.relative(rootDir, diagnosisPath),
          contentHash: crypto.createHash('sha256').update(fs.readFileSync(diagnosisPath)).digest('hex'),
          metadata: { required_sections: INCIDENT_DIAGNOSIS_SECTIONS.map(({ key }) => key) },
        });
      }
      ops.appendEventInTx(db, {
        type: 'change_created', change_id: row.id,
        payload: { kind: row.kind, artifact_root: row.artifact_root },
      });
      let workflow = workflows.startWorkflow(db, {
        kind: 'change', baseline_id: baselineHealth.baseline?.id || null,
        change_id: row.id, subject: `Establish executable readiness for ${row.title}.`,
        metadata: { change_kind: row.kind, base_commit: row.base_commit },
      }, { rootDir });
      const context = compileContext(db, { id: row.id }, { rootDir });
      workflow = workflows.recordWorkflowStep(db, {
        id: workflow.id, step_id: 'bind-baseline', status: 'completed',
        evidence: [{
          kind: 'baseline', ref: baselineHealth.baseline?.id || 'incident-break-glass',
          summary: baselineHealth.status === 'pass'
            ? `Bound ready baseline at ${baselineHealth.baseline.repository_revision}.`
            : 'Bound the approved incident break-glass authority.',
        }],
      }, { rootDir });
      workflow = workflows.recordWorkflowStep(db, {
        id: workflow.id, step_id: 'classify-change', status: 'completed',
        decisions: [{
          kind: 'change_kind', value: row.kind,
          rationale: row.classification.rationale, risk_flags: row.classification.risk_flags,
        }],
      }, { rootDir });
      workflow = workflows.recordWorkflowStep(db, {
        id: workflow.id, step_id: 'record-intent', status: 'completed',
        evidence: [{ kind: 'intent', ref: path.relative(rootDir, intentPath), summary: row.intent }],
        outputs: [{ path: path.relative(rootDir, intentPath), kind: 'change-intent' }],
        decisions: [{
          kind: 'change_contract', acceptance_ids: row.contract.acceptance.map((item) => item.id),
          research_disposition: row.research_disposition,
        }],
      }, { rootDir });
      return {
        change: readChange(db, row.id), intent_path: intentPath,
        context_manifest_path: context.context_manifest_path,
        workflow,
      };
    });
  } catch (error) {
    fs.rmSync(artifactDir, { recursive: true, force: true });
    throw error;
  }
}

function assertTaskCreationAllowed(db, input = {}, { rootDir = process.cwd() } = {}) {
  const change = input.change_id ? readChange(db, input.change_id) : null;
  if (input.change_id && !change) {
    throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${input.change_id} not found`);
  }
  if (change && !['active', 'blocked'].includes(change.status)) {
    throw new ChangeWorkflowError('CHANGE_NOT_MUTABLE', `change ${change.id} is ${change.status}`);
  }
  const baselineHealth = baselines.inspectBaseline(db, { rootDir });
  if (baselineHealth.status === 'pass') return;
  const gate = change
    ? contextSpine.baselineGateForChange(db, change, baselineHealth)
    : { blockers: baselineHealth.blockers };
  if (gate.blockers.length === 0) return;
  throw new ChangeWorkflowError(
    'BASELINE_NOT_READY',
    `task creation requires healthy baseline authority or an approved incident break-glass record: ${gate.blockers.join(', ')}`,
    { blockers: gate.blockers, change_id: input.change_id || null },
  );
}

function updateChange(db, id, patch = {}, { rootDir = process.cwd() } = {}) {
  const current = readChange(db, id);
  if (!current) throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${id} not found`);
  if (['ready', 'archived', 'cancelled'].includes(current.status)) {
    throw new ChangeWorkflowError('CHANGE_NOT_MUTABLE', `change ${id} is ${current.status}`);
  }
  for (const field of Object.keys(patch)) {
    if (!CHANGE_PATCH_FIELDS.has(field)) {
      throw new ChangeWorkflowError('VALIDATION_ERROR', `change field ${field} is not patchable`);
    }
  }
  const syncIntent = [
    'title', 'intent', 'docs_impact', 'contract', 'classification', 'research_disposition',
  ].some((field) => patch[field] !== undefined);
  const intentPath = path.resolve(rootDir, current.artifact_root, 'intent.md');
  const previousIntent = syncIntent && fs.existsSync(intentPath)
    ? fs.readFileSync(intentPath)
    : null;
  try {
    return ops.tx(db, () => {
      const sets = [];
      const values = [];
      if (patch.title !== undefined) {
        const title = String(patch.title).trim();
        if (!title) throw new ChangeWorkflowError('VALIDATION_ERROR', 'change title cannot be empty');
        sets.push('title = ?'); values.push(title);
      }
      if (patch.intent !== undefined) {
        const intent = String(patch.intent).trim();
        if (!intent) throw new ChangeWorkflowError('VALIDATION_ERROR', 'change intent cannot be empty');
        sets.push('intent = ?'); values.push(intent);
      }
      if (patch.docs_impact !== undefined) {
        sets.push('docs_impact_json = ?'); values.push(JSON.stringify(normalizeDocsImpact(patch.docs_impact)));
      }
      if (patch.provider_refs !== undefined) {
        sets.push('provider_refs_json = ?'); values.push(JSON.stringify(normalizeProviderRefs(patch.provider_refs)));
      }
      if (patch.contract !== undefined) {
        sets.push('contract_json = ?'); values.push(JSON.stringify(normalizeChangeContract(patch.contract)));
      }
      if (patch.classification !== undefined) {
        sets.push('classification_json = ?');
        values.push(JSON.stringify(normalizeClassification(patch.classification, current.kind)));
      }
      if (patch.research_disposition !== undefined) {
        sets.push('research_disposition_json = ?');
        values.push(JSON.stringify(normalizeResearchDisposition(patch.research_disposition, current.kind)));
      }
      if (patch.status !== undefined) {
        const allowed = CHANGE_TRANSITIONS[current.status] || new Set();
        if (!allowed.has(patch.status)) {
          throw new ChangeWorkflowError(
            'ILLEGAL_CHANGE_TRANSITION', `cannot transition change ${id} from ${current.status} to ${patch.status}`,
          );
        }
        sets.push('status = ?'); values.push(patch.status);
      }
      if (sets.length === 0) return current;
      sets.push('updated_at = ?'); values.push(nowIso(), id);
      db.prepare(`UPDATE changes SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      const updated = readChange(db, id);
      if (syncIntent) {
        fs.mkdirSync(path.dirname(intentPath), { recursive: true });
        writeIntent(intentPath, updated);
        upsertArtifact(db, {
          change_id: id,
          kind: 'intent',
          artifactPath: path.relative(rootDir, intentPath),
          contentHash: crypto.createHash('sha256').update(fs.readFileSync(intentPath)).digest('hex'),
        });
      }
      ops.appendEventInTx(db, { type: 'change_updated', change_id: id, payload: { fields: Object.keys(patch) } });
      return updated;
    });
  } catch (error) {
    if (syncIntent) {
      if (previousIntent === null) fs.rmSync(intentPath, { force: true });
      else fs.writeFileSync(intentPath, previousIntent);
    }
    throw error;
  }
}

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function baselineConvergenceBlockers(db, change, rootDir) {
  const baselineHealth = baselines.inspectBaseline(db, { rootDir });
  return contextSpine.baselineGateForChange(db, change, baselineHealth).blockers;
}

function deriveConvergenceEvidence(db, change, tasks, workflowGate, diagnosis, rootDir) {
  const devRuns = db.prepare(
    `SELECT id, task_id, summary_json FROM workflow_runs
     WHERE kind = 'dev' AND change_id = ? AND status = 'completed'
     ORDER BY completed_at ASC, rowid ASC`,
  ).all(change.id).map((row) => ({
    id: row.id, task_id: row.task_id, summary: parseJson(row.summary_json, 'workflow_runs.summary_json'),
  }));
  const deltaPaths = filesUnder(path.join(rootDir, change.artifact_root, 'delta'))
    .map((file) => path.relative(rootDir, file));
  const appliedLearning = specLearning.listSpecLearning(db, change.id)
    .filter((candidate) => candidate.status === 'applied')
    .map((candidate) => candidate.target_ref);
  const rows = [
    {
      category: 'diff', status: 'pass',
      evidence: `Completed dev workflows: ${devRuns.map((run) => `${run.task_id}:${run.id}`).join(', ')}`,
      refs: devRuns.map((run) => run.id),
    },
    {
      category: 'tests', status: 'pass',
      evidence: `DB-derived passing test workflow ${workflowGate.test_workflow_id}.`,
      refs: [workflowGate.test_summary.report_path, workflowGate.test_summary.report_digest].filter(Boolean),
      regression_signal: workflowGate.test_summary.regression_signal || null,
    },
    {
      category: 'spec', status: 'pass',
      evidence: deltaPaths.length > 0
        ? `Current delta artifacts: ${deltaPaths.join(', ')}`
        : `Change intent and resolved specification learning for ${change.id}.`,
      refs: [...deltaPaths, ...appliedLearning],
    },
    {
      category: 'docs', status: 'pass',
      evidence: change.docs_impact.status === 'required'
        ? `Declared documentation files: ${change.docs_impact.files.join(', ')}`
        : `No documentation change: ${change.docs_impact.rationale}`,
      refs: change.docs_impact.files,
    },
    ...['spec_fidelity', 'engineering_standards'].map((axis) => ({
      category: 'review', axis, status: 'pass',
      evidence: `DB-derived ${axis} verdict from ${workflowGate.review_workflow_id}.`,
      refs: workflowGate.review_summary.axes?.[axis]?.evidence_refs || [],
    })),
  ];
  if (diagnosis.artifact) {
    rows.unshift({
      category: 'diagnosis', status: 'pass',
      evidence: `Structured incident diagnosis ${diagnosis.artifact.artifactPath}.`,
      refs: [diagnosis.artifact.artifactPath, diagnosis.artifact.contentHash],
    });
  }
  return rows;
}

function convergeChange(db, input, { rootDir = process.cwd() } = {}) {
  if (Object.hasOwn(input || {}, 'evidence')) {
    throw new ChangeWorkflowError(
      'CONVERGENCE_EVIDENCE_AUTHORITY_VIOLATION',
      'change convergence evidence is derived from DB-backed dev, test, review, specification, and documentation authority',
    );
  }
  const change = readChange(db, input.id);
  if (!change) throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${input.id} not found`);
  if (!['active', 'blocked'].includes(change.status)) {
    throw new ChangeWorkflowError('CHANGE_NOT_CONVERGEABLE', `change ${input.id} is ${change.status}`);
  }
  const tasks = db.prepare('SELECT id FROM tasks WHERE change_id = ? ORDER BY id')
    .all(change.id).map((task) => ops.readTask(db, task.id));
  const blockers = new Set();
  let workflowGate = null;
  try {
    workflowGate = workflows.validateDeliveryPrerequisites(db, { change_id: change.id }, rootDir);
  } catch (error) {
    blockers.add(error.code || 'WORKFLOW_GATE_UNAVAILABLE');
  }
  for (const blocker of baselineConvergenceBlockers(db, change, rootDir)) blockers.add(blocker);
  if (tasks.length === 0) blockers.add('NO_TASKS');
  if (tasks.some((task) => !['completed', 'expanded'].includes(task.status))) blockers.add('TASKS_INCOMPLETE');
  if (tasks.some((task) => Boolean(task.stale))) blockers.add('TASK_CONTEXT_STALE');
  for (const task of tasks) {
    const snapshot = db.prepare(
      `SELECT readiness, context_json FROM context_snapshots
       WHERE change_id = ? AND task_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ).get(change.id, task.id);
    if (!snapshot) {
      blockers.add(`TASK_CONTEXT_MISSING:${task.id}`);
      continue;
    }
    const context = parseJson(snapshot.context_json, 'context_snapshots.context_json');
    if (snapshot.readiness !== 'ready') blockers.add(`TASK_CONTEXT_NOT_READY:${task.id}`);
    if (!context.execution_contract?.public_seam) blockers.add(`TASK_SEAM_MISSING:${task.id}`);
    if (!context.execution_contract?.verification_command) blockers.add(`TASK_VERIFICATION_MISSING:${task.id}`);
  }

  for (const candidate of specLearning.listSpecLearning(db, change.id)) {
    if (candidate.status === 'proposed') blockers.add(`SPEC_LEARNING_UNRESOLVED:${candidate.id}`);
    if (candidate.status === 'approved') blockers.add(`SPEC_LEARNING_NOT_APPLIED:${candidate.id}`);
  }

  if (change.docs_impact.status === 'unknown') blockers.add('DOCS_IMPACT_UNKNOWN');
  if (change.docs_impact.status === 'none' && (!change.docs_impact.rationale || change.docs_impact.rationale.length < 3)) {
    blockers.add('DOCS_IMPACT_RATIONALE_MISSING');
  }
  if (change.docs_impact.status === 'required') {
    if (change.docs_impact.files.length === 0) blockers.add('DOCS_FILES_UNDECLARED');
    for (const file of change.docs_impact.files) {
      if (!fs.existsSync(safeRelativePath(rootDir, file))) blockers.add(`DOCS_FILE_MISSING:${file}`);
    }
  }

  const artifactDir = path.resolve(rootDir, change.artifact_root);
  const diagnosis = inspectIncidentDiagnosis(change, artifactDir, rootDir);
  for (const blocker of diagnosis.blockers) blockers.add(blocker);
  if (['standard', 'major'].includes(change.kind)) {
    if (filesUnder(path.join(artifactDir, 'delta')).length === 0) blockers.add('SPEC_DELTA_MISSING');
    if (!fs.existsSync(path.join(artifactDir, 'plan.md'))) blockers.add('CHANGE_PLAN_MISSING');
  }
  const latestContext = db.prepare(
    `SELECT manifest_path, manifest_hash FROM context_snapshots
     WHERE change_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
  ).get(change.id);
  const manifestPath = latestContext?.manifest_path
    ? safeRelativePath(rootDir, latestContext.manifest_path)
    : null;
  if (!manifestPath || !fs.existsSync(manifestPath)) blockers.add('CONTEXT_MANIFEST_MISSING');
  else {
    const manifest = parseJson(fs.readFileSync(manifestPath, 'utf8'), 'context-manifest.json');
    const manifestHash = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
    if (latestContext.manifest_hash !== manifestHash) blockers.add('CONTEXT_MANIFEST_STALE');
    if (manifest.git && manifest.git.head !== gitHead(rootDir)) blockers.add('CONTEXT_HEAD_STALE');
    const checkout = baselines.gitWorktreeSnapshot(rootDir, ['.']);
    if (manifest.git?.worktree_digest && checkout.digest
      && manifest.git.worktree_digest !== checkout.digest) {
      blockers.add('CONTEXT_WORKTREE_STALE');
    }
    const manifestTasks = (manifest.tasks || []).map((task) => task.id).sort();
    const currentTasks = tasks.map((task) => task.id).sort();
    if (JSON.stringify(manifestTasks) !== JSON.stringify(currentTasks)) blockers.add('CONTEXT_TASK_SET_STALE');
  }
  const openIncidents = db.prepare(
    `SELECT COUNT(*) AS count FROM incidents WHERE status = 'open'
     AND (change_id = ? OR task_id IN (SELECT id FROM tasks WHERE change_id = ?))`,
  ).get(change.id, change.id).count;
  if (openIncidents > 0) blockers.add('OPEN_INCIDENTS');

  const blockerList = [...blockers].sort();
  if (blockerList.length > 0) {
    ops.tx(db, () => {
      db.prepare("UPDATE changes SET status = 'blocked', updated_at = ? WHERE id = ?")
        .run(nowIso(), change.id);
      if (diagnosis.artifact) upsertArtifact(db, diagnosis.artifact);
      ops.appendEventInTx(db, {
        type: 'change_blocked', change_id: change.id, payload: { blockers: blockerList },
      });
    });
    return { ready: false, status: 'blocked', blockers: blockerList };
  }

  const derivedEvidence = deriveConvergenceEvidence(
    db, change, tasks, workflowGate, diagnosis, rootDir,
  );
  const verificationPath = path.join(artifactDir, 'verification.md');
  const lines = [
    `# Verification: ${change.title}`, '',
    ...derivedEvidence.flatMap((row) => [
      `## ${row.category}${row.axis ? `:${row.axis}` : ''}`, '',
      `Status: **${row.status}**`, '', String(row.evidence).trim(), '',
    ]),
  ];
  fs.writeFileSync(verificationPath, `${lines.join('\n')}\n`);
  ops.tx(db, () => {
    db.prepare("UPDATE changes SET status = 'ready', updated_at = ? WHERE id = ?")
      .run(nowIso(), change.id);
    if (diagnosis.artifact) upsertArtifact(db, diagnosis.artifact);
    upsertArtifact(db, {
      change_id: change.id, kind: 'verification', artifactPath: path.relative(rootDir, verificationPath),
      contentHash: crypto.createHash('sha256').update(fs.readFileSync(verificationPath)).digest('hex'),
      metadata: { evidence: derivedEvidence },
    });
    ops.appendEventInTx(db, {
      type: 'change_converged', change_id: change.id,
      payload: { evidence_categories: derivedEvidence.map((row) => row.category) },
    });
  });
  return { ready: true, status: 'ready', blockers: [], verification_path: verificationPath };
}

function finalizeArchive(db, intent, { rootDir }) {
  const change = readChange(db, intent.change_id);
  if (!change) throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${intent.change_id} not found`);
  const destination = safeRelativePath(rootDir, intent.destination);
  const relative = path.relative(rootDir, destination);
  if (change.status === 'archived' && change.artifact_root === relative) {
    return { change, archive_path: destination };
  }
  if (change.status !== 'ready') {
    throw new ChangeWorkflowError('CHANGE_NOT_READY', `change ${change.id} must be ready to finish archive`);
  }
  if (!fs.existsSync(destination)) {
    throw new ChangeWorkflowError('ARCHIVE_DESTINATION_MISSING', `archive destination missing: ${relative}`);
  }
  const baselineHealthBefore = baselines.inspectBaseline(db, { rootDir });
  const breakGlass = Boolean(
    baselineHealthBefore.status !== 'pass'
      && change.kind === 'incident'
      && change.baseline_bypass?.mode === 'incident_break_glass',
  );
  ops.tx(db, () => {
    db.prepare(
      "UPDATE changes SET status = 'archived', artifact_root = ?, updated_at = ?, closed_at = ? WHERE id = ?",
    ).run(relative, nowIso(), nowIso(), change.id);
    const prefix = `${intent.source}${path.sep}`;
    const artifactRows = db.prepare('SELECT id, path FROM artifacts WHERE change_id = ?').all(change.id);
    for (const artifact of artifactRows) {
      if (artifact.path !== intent.source && !artifact.path.startsWith(prefix)) continue;
      const suffix = path.relative(intent.source, artifact.path);
      const archivedPath = suffix ? path.join(relative, suffix) : relative;
      db.prepare('UPDATE artifacts SET path = ?, updated_at = ? WHERE id = ?')
        .run(archivedPath, nowIso(), artifact.id);
    }
    const workflowOutputs = db.prepare(
      `SELECT ws.run_id, ws.step_id, ws.outputs_json
       FROM workflow_steps ws JOIN workflow_runs wr ON wr.id = ws.run_id
       WHERE wr.change_id = ?`,
    ).all(change.id);
    for (const step of workflowOutputs) {
      const outputs = parseJson(step.outputs_json, 'workflow_steps.outputs_json');
      let changed = false;
      const moved = outputs.map((output) => {
        if (output.path !== intent.source && !output.path.startsWith(prefix)) return output;
        changed = true;
        const suffix = path.relative(intent.source, output.path);
        return { ...output, path: suffix ? path.join(relative, suffix) : relative };
      });
      if (changed) {
        db.prepare(
          'UPDATE workflow_steps SET outputs_json = ?, updated_at = ? WHERE run_id = ? AND step_id = ?',
        ).run(JSON.stringify(moved), nowIso(), step.run_id, step.step_id);
      }
    }
    const contextRows = db.prepare(
      'SELECT id, manifest_path FROM context_snapshots WHERE change_id = ?',
    ).all(change.id);
    for (const snapshot of contextRows) {
      if (snapshot.manifest_path !== intent.source && !snapshot.manifest_path.startsWith(prefix)) continue;
      const suffix = path.relative(intent.source, snapshot.manifest_path);
      const archivedPath = suffix ? path.join(relative, suffix) : relative;
      db.prepare('UPDATE context_snapshots SET manifest_path = ? WHERE id = ?')
        .run(archivedPath, snapshot.id);
    }
    const archivedSummary = path.join(destination, 'archive-summary.md');
    upsertArtifact(db, {
      change_id: change.id, kind: 'archive_summary',
      artifactPath: path.relative(rootDir, archivedSummary),
      contentHash: crypto.createHash('sha256').update(fs.readFileSync(archivedSummary)).digest('hex'),
      metadata: {
        baseline_updates: intent.baseline_updates,
        no_baseline_change_reason: intent.no_baseline_change_reason,
      },
    });
    const reconciliationSuffix = path.relative(intent.source, intent.reconciliation_path);
    const archivedReconciliationPath = path.join(relative, reconciliationSuffix);
    upsertArtifact(db, {
      change_id: change.id, kind: 'baseline_reconciliation',
      artifactPath: archivedReconciliationPath,
      contentHash: intent.reconciliation_digest,
      metadata: {
        schema: intent.reconciliation_manifest.$schema,
        semantic_changes: intent.reconciliation_manifest.semantic_changes.map((item) => item.id),
        resolved_gap_ids: intent.reconciliation_manifest.resolved_gap_ids,
        resolved_unknowns: intent.reconciliation_manifest.resolved_unknowns,
      },
    });
    db.prepare("UPDATE artifacts SET status = 'archived', updated_at = ? WHERE change_id = ?")
      .run(nowIso(), change.id);
    if (breakGlass) {
      const currentBaseline = baselines.readBaseline(db);
      if (currentBaseline) {
        baselines.appendGapInTx(db, {
          baseline_id: currentBaseline.id,
          gap: {
            id: `incident-${change.id}-reconciliation`,
            category: 'baseline_blocker',
            status: 'open',
            blocking: true,
            summary: `Incident ${change.id} was archived under break-glass and requires baseline reconciliation.`,
            evidence_refs: [relative],
            owner: change.baseline_bypass.approved_by,
          },
        });
      }
    } else {
      baselines.reconcileBaseline(db, {
        baseline_updates: intent.baseline_updates, change_id: change.id,
        reconciliation: intent.reconciliation_manifest,
      }, { rootDir });
      const baselineHealth = baselines.inspectBaseline(db, { rootDir });
      if (baselineHealth.blockers.length > 0) {
        throw new ChangeWorkflowError(
          'BASELINE_RECONCILIATION_INCOMPLETE',
          `baseline reconciliation remains incomplete: ${baselineHealth.blockers.join(', ')}`,
          { blockers: baselineHealth.blockers },
        );
      }
    }
    ops.appendEventInTx(db, {
      type: 'change_archived', change_id: change.id,
      payload: {
        archive_path: relative, baseline_updates: intent.baseline_updates,
        no_baseline_change_reason: intent.no_baseline_change_reason,
        reconciliation_path: archivedReconciliationPath,
        reconciliation_digest: intent.reconciliation_digest,
        baseline_bypass: breakGlass,
      },
    });
  });
  return {
    change: readChange(db, change.id), archive_path: destination,
    baseline_bypass: breakGlass,
  };
}

function archiveChange(db, input, { rootDir = process.cwd() } = {}) {
  const change = readChange(db, input.id);
  if (!change) throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${input.id} not found`);
  if (!input.summary || String(input.summary).trim().length < 3) {
    throw new ChangeWorkflowError('VALIDATION_ERROR', 'archive summary required');
  }
  const updates = Array.isArray(input.baseline_updates) ? input.baseline_updates : [];
  const noChangeReason = input.no_baseline_change_reason && String(input.no_baseline_change_reason).trim();
  if (updates.length === 0 && !noChangeReason) {
    throw new ChangeWorkflowError('BASELINE_RECONCILIATION_REQUIRED', 'baseline updates or no-change reason required');
  }
  for (const file of updates) {
    if (!fs.existsSync(safeRelativePath(rootDir, file))) {
      throw new ChangeWorkflowError('BASELINE_FILE_MISSING', `baseline update missing: ${file}`);
    }
  }
  if (!['ready', 'archived'].includes(change.status)) {
    throw new ChangeWorkflowError('CHANGE_NOT_READY', `change ${input.id} must converge before archive`);
  }
  const reconciliation = readReconciliationManifest(db, change, input, rootDir);
  const prepared = archiveJournal.prepareArchiveMove({
    rootDir, change, summary: String(input.summary), baselineUpdates: updates,
    noBaselineChangeReason: noChangeReason || null,
    reconciliationPath: reconciliation.relative,
    reconciliationDigest: reconciliation.digest,
    reconciliationManifest: reconciliation.manifest,
  });
  let result;
  try {
    result = finalizeArchive(db, prepared.intent, { rootDir });
  } catch (error) {
    try { archiveJournal.rollbackArchiveIntent(rootDir, prepared.intent); }
    catch (rollbackError) {
      throw new ChangeWorkflowError('ARCHIVE_RECOVERY_REQUIRED', error.message, {
        cause: error.code || error.message, rollback: rollbackError.code || rollbackError.message,
      });
    }
    throw error;
  }
  try { archiveJournal.completeArchiveIntent(rootDir, prepared.intent); }
  catch (error) { result.recovery_warning = `ARCHIVE_JOURNAL_CLEANUP_PENDING:${error.message}`; }
  return result;
}

function recoverInterruptedArchives(db, { rootDir = process.cwd() } = {}) {
  const records = archiveJournal.listArchiveIntents(rootDir);
  const result = { found: records.length, resumed: 0, rolled_back: 0, cleaned: 0, failed: 0, items: [] };
  for (const record of records) {
    if (record.error) {
      result.failed += 1;
      result.items.push({ file: record.file, status: 'failed', error: record.error.code || record.error.message });
      continue;
    }
    const change = readChange(db, record.intent.change_id);
    try {
      if (change?.status === 'archived' && change.artifact_root === record.intent.destination) {
        archiveJournal.completeArchiveIntent(rootDir, record.intent);
        result.cleaned += 1;
        result.items.push({ change_id: change.id, status: 'cleaned' });
      } else if (change?.status === 'ready' && fs.existsSync(record.destination)
        && !fs.existsSync(record.source)) {
        finalizeArchive(db, record.intent, { rootDir });
        archiveJournal.completeArchiveIntent(rootDir, record.intent);
        result.resumed += 1;
        result.items.push({ change_id: change.id, status: 'resumed' });
      } else {
        archiveJournal.rollbackArchiveIntent(rootDir, record.intent);
        result.rolled_back += 1;
        result.items.push({ change_id: record.intent.change_id, status: 'rolled_back' });
      }
    } catch (error) {
      try {
        archiveJournal.rollbackArchiveIntent(rootDir, record.intent);
        result.rolled_back += 1;
        result.items.push({
          change_id: record.intent.change_id, status: 'rolled_back',
          error: error.code || error.message,
        });
      } catch (rollbackError) {
        result.failed += 1;
        result.items.push({
          change_id: record.intent.change_id, status: 'failed',
          error: `${error.code || error.message}; ${rollbackError.code || rollbackError.message}`,
        });
      }
    }
  }
  return result;
}

module.exports = {
  ChangeWorkflowError,
  createChange,
  readChange,
  listChanges,
  updateChange,
  compileContext,
  readBreadcrumb: contextSpine.readBreadcrumb,
  proposeSpecLearning: specLearning.proposeSpecLearning,
  resolveSpecLearning: specLearning.resolveSpecLearning,
  listSpecLearning: specLearning.listSpecLearning,
  convergeChange,
  archiveChange,
  normalizeDocsImpact,
  normalizeProviderRefs,
  normalizeBaselineBypass,
  assertTaskCreationAllowed,
  recoverInterruptedArchives,
};
