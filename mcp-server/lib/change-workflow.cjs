'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Ajv = require('ajv/dist/2020');

const ops = require('./state-ops.cjs');
const artifacts = require('./artifact-registry.cjs');
const canonical = require('./canonical-json.cjs');
const changeAuthority = require('./change-authority.cjs');
const { writeManagedFile } = require('./managed-file-write.cjs');
const providerRefs = require('./provider-refs.cjs');
const baselines = require('./baseline-workflow.cjs');
const archiveJournal = require('./archive-journal.cjs');
const changePacket = require('./change-packet.cjs');
const deliveryTransaction = require('./delivery-transaction.cjs');
const {
  openStableProjectRead,
  readStableProjectFile,
  walkStableProjectTree,
} = require('./safe-project-file.cjs');
const stageCheckpoints = require('./stage-checkpoints.cjs');
const reconciliationSchema = require('../../spec/schemas/baseline-reconciliation.v1.schema.json');

const reconciliationAjv = new Ajv({ allErrors: true, strict: false });
const validateReconciliationSchema = reconciliationAjv.compile(reconciliationSchema);

function loadLegacyModule(filename) {
  return module.require(path.join(__dirname, filename));
}

function legacySpecLearning() {
  return loadLegacyModule('spec-learning.cjs');
}

function legacyWorkflows() {
  return loadLegacyModule('workflow-state.cjs');
}

function legacyDecisions() {
  return loadLegacyModule('decision-dialogue.cjs');
}

function legacyContextSpine() {
  return loadLegacyModule('context-spine.cjs');
}

const CHANGE_ID = /^[a-zA-Z0-9_-]+$/;
const CHANGE_PATCH_FIELDS = new Set([
  'title', 'intent', 'status', 'docs_impact', 'provider_refs',
  'contract', 'classification', 'research_disposition',
]);
const SEMANTIC_AUTHORITY_FIELDS = new Set([
  'intent', 'docs_impact', 'provider_refs', 'contract', 'classification',
  'research_disposition',
]);
const CHANGE_TRANSITIONS = Object.freeze({
  active: new Set(['active', 'blocked', 'cancelled']),
  blocked: new Set(['active', 'blocked', 'cancelled']),
  ready: new Set(['active', 'ready', 'cancelled']),
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

function rebindRegistryPath(candidate, source, destination) {
  const current = artifacts.normalizeRelativePath(candidate);
  const from = artifacts.normalizeRelativePath(source);
  const to = artifacts.normalizeRelativePath(destination);
  if (current !== from && !current.startsWith(`${from}/`)) return null;
  const suffix = current === from ? '' : path.posix.relative(from, current);
  return suffix ? path.posix.join(to, suffix) : to;
}

function assertReconciliationAuthority(db, change, relative, digest) {
  const rows = db.prepare(
    "SELECT * FROM artifacts WHERE status <> 'archived' ORDER BY id",
  ).all().filter((item) => {
    try { return artifacts.normalizeRelativePath(item.path) === relative; }
    catch { return false; }
  });
  const row = rows.length === 1 ? rows[0] : null;
  const authorityDigest = row?.digest || row?.content_hash || null;
  if (!row || row.managed !== 1 || row.owner_type !== 'change'
    || row.owner_id !== change.id || row.change_id !== change.id
    || row.kind !== 'baseline_reconciliation' || row.status !== 'current'
    || authorityDigest !== digest) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_AUTHORITY_INVALID',
      'reconciliation manifest must match one current managed Change artifact authority',
      {
        path: relative,
        artifact_ids: rows.map((item) => item.id),
        expected_owner: `change:${change.id}`,
        expected_kind: 'baseline_reconciliation',
        expected_digest: digest,
        actual_digest: authorityDigest,
      },
    );
  }
  return row;
}

function openReconciliationReader(rootDir, relative) {
  try {
    return openStableProjectRead(rootDir, relative);
  } catch (error) {
    if (error?.code === 'PROJECT_FILE_MISSING') return null;
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_UNSAFE',
      `reconciliation manifest cannot be read safely: ${relative}`,
      { cause: error.code || error.message },
    );
  }
}

function readReconciliationManifest(db, change, input, rootDir) {
  const requested = typeof input.reconciliation_path === 'string'
    ? input.reconciliation_path.trim() : '';
  if (!requested) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_REQUIRED', 'reconciliation_path is required',
    );
  }
  let relative;
  try { relative = artifacts.normalizeRelativePath(requested); }
  catch (error) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_REQUIRED', error.message,
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
  let reader = openReconciliationReader(rootDir, relative);
  let manifest;
  let digest;
  let expectedDigest = null;
  let authorityDigest = null;
  let journalIntent = null;
  if (!reader) {
    const pending = archiveJournal.listArchiveIntents(rootDir).find(
      (item) => !item.error && item.intent.change_id === change.id
        && item.intent.reconciliation_path === relative,
    );
    if (pending) {
      journalIntent = pending.intent;
      const suffix = path.posix.relative(pending.intent.source, relative);
      const archivedRelative = path.posix.join(pending.intent.destination, suffix);
      file = safeRelativePath(rootDir, archivedRelative);
      reader = openReconciliationReader(rootDir, archivedRelative);
      expectedDigest = pending.intent.reconciliation_digest;
      authorityDigest = pending.intent.reconciliation_digest;
      const rebind = archiveJournal.readArchiveRebind(rootDir, pending.intent);
      const rebound = rebind?.entries.find(
        (entry) => entry.relative_path
          === path.posix.relative(pending.intent.destination, archivedRelative),
      );
      if (rebound) {
        if (rebound.before_digest !== pending.intent.reconciliation_digest) {
          throw new ChangeWorkflowError(
            'BASELINE_RECONCILIATION_AUTHORITY_INVALID',
            'archive rebind journal does not begin from the prepared reconciliation authority',
            {
              expected_digest: pending.intent.reconciliation_digest,
              actual_digest: rebound.before_digest,
            },
          );
        }
        expectedDigest = rebound.after_digest;
        authorityDigest = rebound.before_digest;
      }
    }
  }
  if (!reader) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_REQUIRED', 'reconciliation manifest file is missing',
    );
  }
  try {
    digest = reader.digest;
    if (expectedDigest && digest !== expectedDigest) {
      throw new ChangeWorkflowError(
        'BASELINE_RECONCILIATION_AUTHORITY_INVALID',
        'archived reconciliation bytes do not match the prepared journal digest',
        { expected_digest: expectedDigest, actual_digest: digest },
      );
    }
    assertReconciliationAuthority(db, change, relative, authorityDigest || digest);
    manifest = JSON.parse(reader.bytes.toString('utf8'));
    reader.verify();
  } catch (error) {
    if (error instanceof ChangeWorkflowError) throw error;
    if (error?.code === 'PROJECT_FILE_CHANGED' || error?.code === 'PROJECT_FILE_UNSAFE') {
      throw new ChangeWorkflowError(
        'BASELINE_RECONCILIATION_MANIFEST_UNSAFE',
        `reconciliation manifest changed while it was read: ${relative}`,
        { cause: error.code },
      );
    }
    throw new ChangeWorkflowError('BASELINE_RECONCILIATION_MANIFEST_INVALID', error.message);
  } finally {
    reader.close();
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
    try {
      resolved = legacyWorkflows().resolveProjectSourceRef(
        rootDir,
        item.source_ref,
        'semantic_change.source_ref',
      );
    }
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
  return {
    manifest, relative, file,
    digest,
    journal_intent: journalIntent,
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
    `- Alignment checkpoint: \`${change.alignment_thread_id || 'not-required'}\``,
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

function latestWorkflowConsumer(db, changeId) {
  const workflow = db.prepare(
    `SELECT id FROM workflow_runs WHERE change_id = ?
     ORDER BY started_at DESC, rowid DESC LIMIT 1`,
  ).get(changeId);
  if (!workflow) {
    throw new ChangeWorkflowError(
      'ARTIFACT_CONSUMER_MISSING',
      `change ${changeId} has no workflow consumer for its durable artifacts`,
    );
  }
  return { type: 'workflow', id: workflow.id, relation: 'consumed_by' };
}

function upsertArtifact(
  db,
  {
    change_id, task_id = null, kind, artifactPath, contentHash, metadata,
    workflow_id = null, consumer_ref = null, terminal = false,
    writer = 'change-workflow', rootDir = process.cwd(),
  },
) {
  const ownerType = task_id ? 'task' : 'change';
  const ownerId = task_id || change_id;
  const consumer = terminal
    ? null
    : consumer_ref
      ? consumer_ref
      : task_id
    ? { type: 'task', id: task_id, relation: 'consumed_by' }
    : workflow_id
      ? { type: 'workflow', id: workflow_id, relation: 'consumed_by' }
      : latestWorkflowConsumer(db, change_id);
  return artifacts.recordArtifactInTx(db, {
    owner_type: ownerType,
    owner_id: ownerId,
    kind,
    path: artifactPath,
    content_digest: contentHash || undefined,
    source_refs: [{ type: 'change', id: change_id, relation: 'produced_for' }],
    consumer_refs: consumer ? [consumer] : [],
    provenance: {
      writer,
      workflow_run_id: consumer?.type === 'workflow' ? consumer.id : null,
    },
    metadata: { ...(metadata || {}), ...(terminal ? { terminal_role: true } : {}) },
  }, { rootDir });
}

function compileContext(db, input, { rootDir = process.cwd() } = {}) {
  const change = readChange(db, input.id);
  if (!change) throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${input.id} not found`);
  if (['archived', 'cancelled'].includes(change.status)) {
    throw new ChangeWorkflowError('CHANGE_TERMINAL', `change ${input.id} is ${change.status}`);
  }
  if (Object.hasOwn(input, 'provider_refs')) {
    throw new ChangeWorkflowError(
      'CONTEXT_PROVIDER_REFS_MUTATION_UNSUPPORTED',
      'provider refs are Change authority; update them through change.update before compiling context',
    );
  }
  const providers = change.provider_refs;
  const tasks = db.prepare(
    'SELECT id FROM tasks WHERE change_id = ? ORDER BY created_at ASC',
  ).all(change.id).map((task) => ops.readTask(db, task.id));
  const specs = Array.isArray(input.spec_refs) ? input.spec_refs : [];
  const spine = legacyContextSpine().compileRoleContext(
    db,
    { input, change, tasks, rootDir },
  );
  const recommendation = spine.recommendation;
  const durableSpine = { ...spine };
  delete durableSpine.recommendation;
  const semanticManifest = {
    schema_version: '3.0',
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
    tasks: spine.task_scope,
    selected_task: spine.selected_task,
    specs,
    role: spine.role,
    gate: spine.gate,
    control: spine.control,
    readiness: spine.readiness,
    context: spine.context,
    execution_contract: spine.execution_contract,
    task_context_contract: spine.task_context_contract,
    baseline: spine.baseline,
    resume: spine.resume,
    providers,
    provider_boundary: 'metadata references only; memory and code graph content remain external',
  };
  const identityHash = crypto.createHash('sha256')
    .update(JSON.stringify(semanticManifest))
    .digest('hex');
  const snapshotId = `ctx-${identityHash.slice(0, 12)}`;
  const existing = db.prepare(
    `SELECT manifest_path, manifest_hash
     FROM context_snapshots WHERE id = ?`,
  ).get(snapshotId);
  if (existing) {
    const existingPath = path.resolve(rootDir, existing.manifest_path);
    if (!fs.existsSync(existingPath)) {
      throw new ChangeWorkflowError(
        'CONTEXT_SNAPSHOT_CORRUPT',
        `content-addressed Context snapshot is missing: ${existing.manifest_path}`,
      );
    }
    const bytes = fs.readFileSync(existingPath);
    const existingHash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (existingHash !== existing.manifest_hash) {
      throw new ChangeWorkflowError(
        'CONTEXT_SNAPSHOT_CORRUPT',
        `content-addressed Context snapshot digest changed: ${existing.manifest_path}`,
      );
    }
    return {
      manifest: JSON.parse(bytes.toString('utf8')),
      recommendation,
      context_manifest_path: existingPath,
      manifest_hash: existingHash,
    };
  }
  const manifest = {
    schema_version: semanticManifest.schema_version,
    snapshot_id: snapshotId,
    generated_at: nowIso(),
    ...Object.fromEntries(Object.entries(semanticManifest).filter(([key]) => key !== 'schema_version')),
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
        role, gate, next_action, allowed_transitions_json, required_transition,
        readiness, blockers_json, context_json, token_estimate, token_budget)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      snapshotId, change.id, input.task_id || null,
      spine.resume.git_head, JSON.stringify(providers), relative, hash,
      spine.role, spine.gate, '',
      JSON.stringify(spine.control.allowed_transitions), spine.control.required_transition,
      spine.readiness.status,
      JSON.stringify(spine.readiness.blockers), JSON.stringify(durableSpine),
      spine.context.token_estimate, spine.context.budget.max_tokens,
    );
    upsertArtifact(db, {
      change_id: change.id, task_id: input.task_id || null, kind: 'context_manifest',
      artifactPath: relative, contentHash: hash,
      rootDir,
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
    ops.appendEventInTx(db, {
      type: 'context_updated', change_id: change.id, task_id: input.task_id || null,
      payload: {
        manifest_path: relative, manifest_hash: hash, git_head: spine.resume.git_head,
        worktree_digest: spine.resume.worktree_digest,
        role: spine.role, gate: spine.gate, readiness: spine.readiness.status,
        allowed_transitions: spine.control.allowed_transitions,
        required_transition: spine.control.required_transition,
      },
    });
  });
  return {
    manifest,
    recommendation,
    context_manifest_path: manifestPath,
    manifest_hash: hash,
  };
}

function createChange(db, input, {
  rootDir = process.cwd(),
  kernelMode = false,
} = {}) {
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
  if (baselineHealth.status !== 'pass' && !kernelMode) {
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
  const alignmentGate = kernelMode ? { ready: true, blockers: [] } : legacyDecisions().decisionGate(
    db, { baseline_id: baselineHealth.baseline?.id || null }, { rootDir },
  );
  if (!alignmentGate.ready) {
    throw new ChangeWorkflowError(
      'CHANGE_ALIGNMENT_REQUIRED',
      `resolve and confirm the active baseline alignment before creating a change: ${alignmentGate.blockers.join(', ')}`,
      { blockers: alignmentGate.blockers, thread_id: alignmentGate.thread?.id || null },
    );
  }
  const docsImpact = normalizeDocsImpact(input.docs_impact);
  const providers = normalizeProviderRefs(input.provider_refs);
  const contract = normalizeChangeContract(input.contract);
  const classification = normalizeClassification(input.classification, input.kind);
  const researchDisposition = normalizeResearchDisposition(input.research_disposition, input.kind);
  let alignmentThread = null;
  if (input.alignment_thread_id !== undefined) {
    try {
      alignmentThread = legacyDecisions().assertConfirmedDecisionCheckpoint(
        db, input.alignment_thread_id, { rootDir, requireArtifact: true },
      );
    } catch (error) {
      throw new ChangeWorkflowError(
        'CHANGE_ALIGNMENT_REQUIRED',
        `alignment_thread_id must name a current artifact-bound checkpoint: ${error.message}`,
      );
    }
    if (alignmentThread.change_id) {
      throw new ChangeWorkflowError(
        'CHANGE_ALIGNMENT_REQUIRED', `alignment thread already belongs to ${alignmentThread.change_id}`,
      );
    }
    if (!baselineHealth.baseline?.id || alignmentThread.baseline_id !== baselineHealth.baseline.id
      || alignmentThread.workflow_run_id) {
      throw new ChangeWorkflowError(
        'CHANGE_ALIGNMENT_REQUIRED',
        'change alignment must be bound only to the current baseline before change creation',
      );
    }
  }
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
    alignment_thread_id: alignmentThread?.id || null,
    base_commit: input.base_commit || gitHead(rootDir), artifact_root: artifactRoot,
    created_at: ts, updated_at: ts,
  };
  try {
    return ops.tx(db, () => {
      db.prepare(
        `INSERT INTO changes
         (id, title, kind, status, intent, docs_impact_json, provider_refs_json,
          baseline_bypass_json, contract_json, classification_json,
          research_disposition_json, alignment_thread_id, base_commit, artifact_root,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.id, row.title, row.kind, row.status, row.intent, JSON.stringify(row.docs_impact),
        JSON.stringify(row.provider_refs), row.baseline_bypass
          ? JSON.stringify(row.baseline_bypass) : null,
        JSON.stringify(row.contract), JSON.stringify(row.classification),
        JSON.stringify(row.research_disposition), row.alignment_thread_id,
        row.base_commit, row.artifact_root, ts, ts,
      );
      if (row.alignment_thread_id) {
        db.prepare(
          'UPDATE decision_threads SET change_id = ?, updated_at = ? WHERE id = ?',
        ).run(row.id, ts, row.alignment_thread_id);
      }
      fs.mkdirSync(artifactDir, { recursive: true });
      const intentPath = path.join(artifactDir, 'intent.md');
      writeIntent(intentPath, row);
      if (row.kind === 'incident') {
        const diagnosisPath = path.join(artifactDir, 'diagnosis.md');
        writeIncidentDiagnosis(diagnosisPath, row);
      }
      ops.appendEventInTx(db, {
        type: 'change_created', change_id: row.id,
        payload: {
          kind: row.kind, artifact_root: row.artifact_root,
          alignment_thread_id: row.alignment_thread_id,
        },
      });
      let workflow = kernelMode ? null : legacyWorkflows().startWorkflow(db, {
        kind: 'change', baseline_id: baselineHealth.baseline?.id || null,
        change_id: row.id, subject: `Establish executable readiness for ${row.title}.`,
        metadata: { change_kind: row.kind, base_commit: row.base_commit },
      }, { rootDir });
      upsertArtifact(db, {
        change_id: row.id, kind: 'intent', artifactPath: path.relative(rootDir, intentPath),
        contentHash: crypto.createHash('sha256').update(fs.readFileSync(intentPath)).digest('hex'),
        workflow_id: workflow?.id || null,
        consumer_ref: kernelMode
          ? { type: 'external', id: 'ultra-plan', relation: 'consumed_by' }
          : null,
        writer: kernelMode ? 'ultra.record' : 'change-workflow',
        rootDir,
      });
      if (row.kind === 'incident') {
        const diagnosisPath = path.join(artifactDir, 'diagnosis.md');
        upsertArtifact(db, {
          change_id: row.id,
          kind: 'diagnosis',
          artifactPath: path.relative(rootDir, diagnosisPath),
          contentHash: crypto.createHash('sha256').update(fs.readFileSync(diagnosisPath)).digest('hex'),
          metadata: { required_sections: INCIDENT_DIAGNOSIS_SECTIONS.map(({ key }) => key) },
          workflow_id: workflow?.id || null,
          consumer_ref: kernelMode
            ? { type: 'external', id: 'ultra-dev', relation: 'consumed_by' }
            : null,
          writer: kernelMode ? 'ultra.record' : 'change-workflow',
          rootDir,
        });
      }
      if (kernelMode) {
        return {
          change: readChange(db, row.id),
          intent_path: intentPath,
          context_manifest_path: null,
          workflow: null,
          diagnostics: baselineHealth.status === 'pass'
            ? []
            : (baselineHealth.blockers || []).map((code) => ({
              code,
              severity: 'needs_attention',
            })),
        };
      }
      workflow = legacyWorkflows().recordWorkflowStep(db, {
        id: workflow.id, step_id: 'bind-baseline', status: 'completed',
        evidence: [{
          kind: 'baseline', ref: baselineHealth.baseline?.id || 'incident-break-glass',
          summary: baselineHealth.status === 'pass'
            ? `Bound ready baseline at ${baselineHealth.baseline.repository_revision}.`
            : 'Bound the approved incident break-glass authority.',
        }],
      }, { rootDir });
      workflow = legacyWorkflows().recordWorkflowStep(db, {
        id: workflow.id, step_id: 'classify-change', status: 'completed',
        decisions: [{
          kind: 'change_kind', value: row.kind,
          rationale: row.classification.rationale, risk_flags: row.classification.risk_flags,
        }],
      }, { rootDir });
      workflow = legacyWorkflows().recordWorkflowStep(db, {
        id: workflow.id, step_id: 'record-intent', status: 'completed',
        evidence: [{ kind: 'intent', ref: path.relative(rootDir, intentPath), summary: row.intent }],
        outputs: [{ path: path.relative(rootDir, intentPath), kind: 'change-intent' }],
        decisions: [{
          kind: 'change_contract', acceptance_ids: row.contract.acceptance.map((item) => item.id),
          research_disposition: row.research_disposition,
        }],
      }, { rootDir });
      workflow = legacyWorkflows().completeWorkflow(db, { id: workflow.id }, { rootDir });
      return {
        change: readChange(db, row.id), intent_path: intentPath,
        context_manifest_path: null,
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
    ? legacyContextSpine().baselineGateForChange(db, change, baselineHealth)
    : { blockers: baselineHealth.blockers };
  if (gate.blockers.length === 0) return;
  throw new ChangeWorkflowError(
    'BASELINE_NOT_READY',
    `task creation requires healthy baseline authority or an approved incident break-glass record: ${gate.blockers.join(', ')}`,
    { blockers: gate.blockers, change_id: input.change_id || null },
  );
}

function updateChange(db, id, patch = {}, {
  rootDir = process.cwd(),
  kernelMode = false,
} = {}) {
  const current = readChange(db, id);
  if (!current) throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${id} not found`);
  if (['archived', 'cancelled'].includes(current.status)) {
    throw new ChangeWorkflowError('CHANGE_NOT_MUTABLE', `change ${id} is ${current.status}`);
  }
  for (const field of Object.keys(patch)) {
    if (!CHANGE_PATCH_FIELDS.has(field)) {
      throw new ChangeWorkflowError('VALIDATION_ERROR', `change field ${field} is not patchable`);
    }
  }
  if (kernelMode && patch.status !== undefined
      && !['active', 'cancelled'].includes(patch.status)) {
    throw new ChangeWorkflowError(
      'VALIDATION_ERROR',
      'kernel Change status may only be active or cancelled; readiness is derived from checkpoints',
    );
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
        const allowed = kernelMode
          ? new Set(['active', 'cancelled'])
          : (CHANGE_TRANSITIONS[current.status] || new Set());
        if (!allowed.has(patch.status)) {
          throw new ChangeWorkflowError(
            'ILLEGAL_CHANGE_TRANSITION', `cannot transition change ${id} from ${current.status} to ${patch.status}`,
          );
        }
        sets.push('status = ?'); values.push(patch.status);
      } else if (['ready', 'blocked'].includes(current.status)
          && Object.keys(patch).length > 0) {
        sets.push('status = ?'); values.push('active');
      }
      if (sets.length === 0) return current;
      sets.push('updated_at = ?'); values.push(nowIso(), id);
      db.prepare(`UPDATE changes SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      const updated = readChange(db, id);
      const invalidated = [];
      let intentArtifactId = null;
      if (syncIntent) {
        fs.mkdirSync(path.dirname(intentPath), { recursive: true });
        writeIntent(intentPath, updated);
        const recorded = upsertArtifact(db, {
          change_id: id,
          kind: 'intent',
          artifactPath: path.relative(rootDir, intentPath),
          contentHash: crypto.createHash('sha256').update(fs.readFileSync(intentPath)).digest('hex'),
          consumer_ref: kernelMode
            ? { type: 'external', id: 'ultra-plan', relation: 'consumed_by' }
            : null,
          writer: kernelMode ? 'ultra.record' : 'change-workflow',
          rootDir,
        });
        intentArtifactId = recorded.artifact.id;
        invalidated.push(...recorded.invalidated);
      }
      const semanticFields = Object.keys(patch)
        .filter((field) => SEMANTIC_AUTHORITY_FIELDS.has(field));
      if (semanticFields.length > 0
        && changeAuthority.changeStateDigest(current)
          !== changeAuthority.changeStateDigest(updated)) {
        invalidated.push(...artifacts.invalidateConsumersFromEndpointInTx(
          db,
          { type: 'change', id },
          {
            reason: 'change_semantic_authority_updated',
            exclude: intentArtifactId ? [{ type: 'artifact', id: intentArtifactId }] : [],
          },
        ));
      }
      const invalidatedTasks = [...new Set(
        invalidated.filter((item) => item.type === 'task').map((item) => item.id),
      )].sort();
      ops.appendEventInTx(db, {
        type: 'change_updated',
        change_id: id,
        payload: {
          fields: Object.keys(patch),
          invalidated_tasks: invalidatedTasks,
          invalidated_authorities: invalidated,
        },
      });
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

function recordDelta(db, input, { rootDir = process.cwd() } = {}) {
  const change = readChange(db, input?.id);
  if (!change) {
    throw new ChangeWorkflowError(
      'CHANGE_NOT_FOUND', `change ${input?.id || '(missing)'} not found`,
    );
  }
  return changePacket.recordDelta(db, change, input, { rootDir });
}

function recordDocumentationReconciliation(
  db,
  input,
  { rootDir = process.cwd() } = {},
) {
  const change = readChange(db, input?.id);
  if (!change) {
    throw new ChangeWorkflowError(
      'CHANGE_NOT_FOUND', `change ${input?.id || '(missing)'} not found`,
    );
  }
  return changePacket.recordDocumentationReconciliation(
    db,
    change,
    input,
    { rootDir },
  );
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

function markdownAnchor(text, fallback) {
  const heading = String(text).match(/^#{1,6}\s+(.+?)\s*#*\s*$/m)?.[1] || fallback;
  return String(heading || 'change')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function generatePacketReconciliation(db, change, packet, rootDir) {
  const baseline = baselines.readBaseline(db);
  const semanticChanges = packet.delta.value.mutations.map((mutation) => {
    const overlay = safeRelativePath(rootDir, mutation.overlay_path);
    const anchor = markdownAnchor(
      fs.readFileSync(overlay, 'utf8'),
      path.basename(mutation.target_path, path.extname(mutation.target_path)),
    );
    return {
      id: `delta-${mutation.id}`,
      action: mutation.action,
      source_ref: `${mutation.target_path}#${anchor}`,
      before_digest: mutation.before_digest,
      after_digest: mutation.after_digest,
    };
  });
  const verification = [{
    name: 'typed Change packet read-back',
    command: 'change.delta',
    status: 'pass',
    evidence: `Change delta ${packet.delta.artifact.id} @ ${packet.delta.artifact.digest} and documentation reconciliation ${packet.documentation?.artifact.id || 'none-required'} were read back before Deliver.`,
  }];
  const manifest = {
    $schema: 'ultra-baseline-reconciliation-v1',
    change_id: change.id,
    baseline_id: baseline?.id || null,
    baseline_updates: packet.baseline_updates,
    semantic_changes: semanticChanges,
    resolved_gap_ids: [],
    resolved_unknowns: [],
    verification,
    ...(semanticChanges.length === 0
      ? {
        semantic_no_change_reason: packet.delta.value.no_semantic_change_reason
          || 'The accepted Change has no baseline specification mutation.',
      }
      : {}),
  };
  const relative = `${change.artifact_root}/baseline-reconciliation.json`;
  const file = safeRelativePath(rootDir, relative);
  const previous = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(file, serialized);
  try {
    const recorded = artifacts.recordArtifact(db, {
      id: `${change.id}-baseline-reconciliation`,
      owner_type: 'change',
      owner_id: change.id,
      kind: 'baseline_reconciliation',
      path: relative,
      content_digest: crypto.createHash('sha256').update(serialized).digest('hex'),
      source_refs: [
        { type: 'artifact', id: packet.delta.artifact.id, relation: 'reconciles' },
        ...(packet.documentation
          ? [{
            type: 'artifact',
            id: packet.documentation.artifact.id,
            relation: 'reconciles_documentation',
          }]
          : []),
      ],
      consumer_refs: [],
      provenance: { writer: 'change.deliver', generated: true },
      metadata: { terminal_role: true, schema: manifest.$schema },
    }, { rootDir }).artifact;
    return {
      manifest,
      relative,
      file,
      digest: recorded.digest,
      artifact: recorded,
    };
  } catch (error) {
    if (previous === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, previous);
    throw error;
  }
}

function generateCallerNoChangeReconciliation(db, change, input, rootDir) {
  const baseline = baselines.readBaseline(db);
  const manifest = {
    $schema: 'ultra-baseline-reconciliation-v1',
    change_id: change.id,
    baseline_id: baseline?.id || null,
    baseline_updates: [],
    semantic_changes: [],
    semantic_no_change_reason: String(input.no_baseline_change_reason).trim(),
    resolved_gap_ids: [],
    resolved_unknowns: [],
    verification: [{
      name: 'explicit archive handoff',
      command: 'ultra.archive',
      status: 'pass',
      evidence: String(input.summary).trim(),
    }],
  };
  const relative = `${change.artifact_root}/baseline-reconciliation.json`;
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  const file = safeRelativePath(rootDir, relative);
  const previous = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const published = writeManagedFile(rootDir, relative, Buffer.from(serialized));
  try {
    const recorded = artifacts.recordArtifact(db, {
      id: `${change.id}-baseline-reconciliation`,
      owner_type: 'change',
      owner_id: change.id,
      kind: 'baseline_reconciliation',
      path: relative,
      content_digest: published.digest,
      source_refs: [],
      consumer_refs: [],
      provenance: { writer: 'ultra.archive', generated: true },
      metadata: {
        terminal_role: true,
        schema: manifest.$schema,
        caller_declared: true,
      },
    }, { rootDir }).artifact;
    return {
      manifest,
      relative,
      file,
      digest: recorded.digest,
      artifact: recorded,
    };
  } catch (error) {
    if (previous === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, previous);
    throw error;
  }
}

function baselineConvergenceBlockers(db, change, rootDir) {
  const baselineHealth = baselines.inspectBaseline(db, { rootDir });
  return legacyContextSpine().baselineGateForChange(db, change, baselineHealth).blockers;
}

function deriveConvergenceEvidence(db, change, tasks, workflowGate, diagnosis, rootDir) {
  const devRuns = db.prepare(
    `SELECT id, task_id, summary_json, metadata_json FROM workflow_runs
     WHERE kind = 'dev' AND change_id = ? AND status = 'completed'
     ORDER BY completed_at ASC, rowid ASC`,
  ).all(change.id)
    .filter((row) => legacyWorkflows().isConsumableWorkflowAuthority({
      metadata: parseJson(row.metadata_json, 'workflow_runs.metadata_json'),
    }))
    .map((row) => ({
      id: row.id, task_id: row.task_id,
      summary: parseJson(row.summary_json, 'workflow_runs.summary_json'),
    }));
  const deltaAuthority = changePacket.readDeltaAuthority(db, change.id);
  const deltaPaths = deltaAuthority
    ? [deltaAuthority.path, deltaAuthority.digest]
    : [];
  const appliedLearning = legacySpecLearning().listSpecLearning(db, change.id)
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
    workflowGate = legacyWorkflows().validateDeliveryPrerequisites(
      db,
      { change_id: change.id },
      rootDir,
    );
  } catch (error) {
    blockers.add(error.code || 'WORKFLOW_GATE_UNAVAILABLE');
  }
  for (const blocker of baselineConvergenceBlockers(db, change, rootDir)) blockers.add(blocker);
  if (tasks.length === 0) blockers.add('NO_TASKS');
  if (tasks.some((task) => !['completed', 'expanded'].includes(task.status))) blockers.add('TASKS_INCOMPLETE');
  if (tasks.some((task) => Boolean(task.stale))) blockers.add('TASK_CONTEXT_STALE');
  for (const task of tasks.filter((item) => item.status !== 'expanded')) {
    const validation = legacyContextSpine().validateContextSnapshot(db, {
      change_id: change.id,
      task_id: task.id,
      role: 'implement',
      gate: 'implementation',
    }, { rootDir });
    if (!validation.snapshot) {
      blockers.add(`TASK_CONTEXT_MISSING:${task.id}`);
      continue;
    }
    for (const blocker of validation.blockers) {
      blockers.add(`TASK_CONTEXT_INVALID:${task.id}:${blocker}`);
    }
    if (!validation.manifest?.execution_contract?.public_seam) {
      blockers.add(`TASK_SEAM_MISSING:${task.id}`);
    }
    if (!validation.manifest?.execution_contract?.verification_command) {
      blockers.add(`TASK_VERIFICATION_MISSING:${task.id}`);
    }
  }

  for (const candidate of legacySpecLearning().listSpecLearning(db, change.id)) {
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
    let delta = null;
    try {
      delta = changePacket.loadDelta(db, change.id, { rootDir });
    } catch (error) {
      blockers.add(error.code || 'CHANGE_DELTA_AUTHORITY_MISSING');
    }
    if (delta) {
      try {
        const documentation = changePacket.loadDocumentationReconciliation(
          db, change.id, { rootDir },
        );
        if (documentation.value.delta_artifact_id !== delta.artifact.id
          || documentation.value.delta_digest !== delta.artifact.digest) {
          blockers.add('DOCUMENTATION_DELTA_AUTHORITY_INVALID');
        }
      } catch (error) {
        blockers.add(error.code || 'DOCUMENTATION_RECONCILIATION_MISSING');
      }
    }
    const planArtifact = db.prepare(
      `SELECT id FROM artifacts
       WHERE owner_type = 'change' AND owner_id = ? AND kind = 'execution_plan'
         AND status = 'current'
       ORDER BY updated_at DESC, rowid DESC`,
    ).all(change.id);
    if (planArtifact.length !== 1) blockers.add('CHANGE_PLAN_AUTHORITY_MISSING');
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
      if (diagnosis.artifact) upsertArtifact(db, { ...diagnosis.artifact, rootDir });
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
    if (diagnosis.artifact) upsertArtifact(db, { ...diagnosis.artifact, rootDir });
    upsertArtifact(db, {
      change_id: change.id, kind: 'verification', artifactPath: path.relative(rootDir, verificationPath),
      contentHash: crypto.createHash('sha256').update(fs.readFileSync(verificationPath)).digest('hex'),
      metadata: { evidence: derivedEvidence },
      rootDir,
    });
    ops.appendEventInTx(db, {
      type: 'change_converged', change_id: change.id,
      payload: { evidence_categories: derivedEvidence.map((row) => row.category) },
    });
  });
  return { ready: true, status: 'ready', blockers: [], verification_path: verificationPath };
}

function replaceArchiveAuthorityText(
  text,
  source,
  destination,
  digestMap = new Map(),
  { normalizePath = false } = {},
) {
  const original = String(text);
  const windowsSource = source.replaceAll('/', '\\');
  let result = original
    .replaceAll(source, destination)
    .replaceAll(windowsSource, destination);
  if (normalizePath && original.includes(windowsSource)) {
    result = result.replaceAll('\\', '/');
  }
  for (const [before, after] of digestMap) {
    if (before !== after) result = result.replaceAll(before, after);
  }
  return result;
}

function kernelArchiveContextPath(change, id) {
  return `${change.artifact_root}/authority/context-envelopes/${id}.json`;
}

function kernelArchiveWorkerPath(change, id) {
  return `${change.artifact_root}/authority/worker-packets/${id}.json`;
}

function materializeKernelArchiveAuthority(db, change, rootDir) {
  const taskIds = db.prepare(
    'SELECT id FROM tasks WHERE change_id = ? ORDER BY id',
  ).all(change.id).map((row) => row.id);
  const contexts = db.prepare(
    `SELECT * FROM context_envelopes
     WHERE (scope_type = 'change' AND scope_id = ?)
        OR (scope_type = 'task' AND scope_id IN (
          SELECT id FROM tasks WHERE change_id = ?
        ))
     ORDER BY id`,
  ).all(change.id, change.id);
  for (const row of contexts) {
    const read = readStableProjectFile(rootDir, row.artifact_path);
    if (!row.file_digest || read.digest !== row.file_digest) {
      throw new ChangeWorkflowError(
        'CONTEXT_ENVELOPE_FILE_DRIFT',
        `cannot archive unbound Context Envelope ${row.id}`,
        {
          path: row.artifact_path,
          expected: row.file_digest || null,
          actual: read.digest,
        },
      );
    }
    const target = kernelArchiveContextPath(change, row.id);
    const published = writeManagedFile(rootDir, target, read.bytes);
    upsertArtifact(db, {
      change_id: change.id,
      task_id: row.scope_type === 'task' ? row.scope_id : null,
      kind: 'archive_context_envelope',
      artifactPath: target,
      contentHash: published.digest,
      consumer_ref: {
        type: 'external',
        id: 'ultra.archive',
        relation: 'archived_by',
      },
      writer: 'ultra.archive',
      rootDir,
    });
  }
  if (taskIds.length === 0) return;
  const packets = db.prepare(
    `SELECT * FROM worker_packets
     WHERE scope_type = 'task' AND status = 'assigned'
       AND scope_id IN (SELECT id FROM tasks WHERE change_id = ?)
     ORDER BY id`,
  ).all(change.id);
  for (const row of packets) {
    const read = readStableProjectFile(rootDir, row.packet_path);
    if (!row.file_digest || read.digest !== row.file_digest) {
      throw new ChangeWorkflowError(
        'WORKER_PACKET_FILE_DRIFT',
        `cannot archive unbound Worker Packet ${row.id}`,
        {
          path: row.packet_path,
          expected: row.file_digest || null,
          actual: read.digest,
        },
      );
    }
    const target = kernelArchiveWorkerPath(change, row.id);
    const published = writeManagedFile(rootDir, target, read.bytes);
    upsertArtifact(db, {
      change_id: change.id,
      task_id: row.scope_id,
      kind: 'archive_worker_packet',
      artifactPath: target,
      contentHash: published.digest,
      consumer_ref: {
        type: 'external',
        id: 'ultra.archive',
        relation: 'archived_by',
      },
      writer: 'ultra.archive',
      rootDir,
    });
  }
}

function normalizedArchiveDocument(bytes, intent) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return { bytes, semanticDigest: null };
  let document;
  try { document = JSON.parse(text); }
  catch { return { bytes, semanticDigest: null }; }
  let semanticDigest = null;
  if (document?.schema_version === '1.0'
      && document.detail === 'full'
      && document.envelope
      && document.digest) {
    if (document.envelope.change?.id === intent.change_id) {
      document.envelope.change.status = 'archived';
    }
    semanticDigest = canonical.digest(document.envelope);
    document.digest = semanticDigest;
  } else if (document?.packet_version && document.packet_digest) {
    const { packet_digest: _prior, ...value } = document;
    semanticDigest = canonical.digest(value);
    document.packet_digest = semanticDigest;
  } else if (document?.schema_version === '1.0'
      && document.question
      && document.selection
      && document.digest) {
    const { digest: _prior, ...value } = document;
    semanticDigest = canonical.digest(value);
    document.digest = semanticDigest;
  } else if (document?.change?.id === intent.change_id) {
    document.change.status = 'archived';
  }
  return {
    bytes: Buffer.from(`${JSON.stringify(document, null, 2)}\n`),
    semanticDigest,
  };
}

function archiveRebindAuthorityValue(value, source, destination, digestMap) {
  if (typeof value === 'string') {
    return replaceArchiveAuthorityText(
      value, source, destination, digestMap, { normalizePath: true },
    );
  }
  if (Array.isArray(value)) {
    return value.map(
      (item) => archiveRebindAuthorityValue(item, source, destination, digestMap),
    );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      archiveRebindAuthorityValue(item, source, destination, digestMap),
    ]));
  }
  return value;
}

function buildArchiveRebindEntries(db, intent, rootDir) {
  const tree = walkStableProjectTree(rootDir, intent.destination, {
    ignore: (relative) => (
      relative === `${intent.destination}/${archiveJournal.INTENT_FILE}`
      || relative === `${intent.destination}/${archiveJournal.REBIND_FILE}`
    ),
  });
  if (tree.unsafe.length > 0) {
    throw new ChangeWorkflowError(
      'ARCHIVE_PATH_UNSAFE',
      `archive packet contains unsafe entries: ${tree.unsafe.map((item) => item.path).join(', ')}`,
      { unsafe: tree.unsafe },
    );
  }
  const originalByPath = new Map();
  const semanticByPath = new Map();
  for (const artifact of db.prepare(
    'SELECT path, digest, content_hash FROM artifacts WHERE change_id = ?',
  ).all(intent.change_id)) {
    const archivedPath = rebindRegistryPath(
      artifact.path, intent.source, intent.destination,
    );
    const digest = artifact.digest || artifact.content_hash;
    if (archivedPath && digest) originalByPath.set(archivedPath, digest);
  }
  const contextPaths = new Set();
  for (const snapshot of db.prepare(
    'SELECT manifest_path, manifest_hash FROM context_snapshots WHERE change_id = ?',
  ).all(intent.change_id)) {
    const archivedPath = rebindRegistryPath(
      snapshot.manifest_path, intent.source, intent.destination,
    );
    if (archivedPath) {
      contextPaths.add(archivedPath);
      originalByPath.set(archivedPath, snapshot.manifest_hash);
    }
  }
  for (const row of db.prepare(
    `SELECT id, digest FROM decision_records
     WHERE scope_type = 'change' AND scope_id = ?`,
  ).all(intent.change_id)) {
    const archivedPath = `${intent.destination}/decisions/${row.id}.json`;
    semanticByPath.set(archivedPath, row.digest);
  }
  for (const row of db.prepare(
    `SELECT id, digest FROM context_envelopes
     WHERE (scope_type = 'change' AND scope_id = ?)
        OR (scope_type = 'task' AND scope_id IN (
          SELECT id FROM tasks WHERE change_id = ?
        ))`,
  ).all(intent.change_id, intent.change_id)) {
    semanticByPath.set(
      `${intent.destination}/authority/context-envelopes/${row.id}.json`,
      row.digest,
    );
  }
  for (const row of db.prepare(
    `SELECT id, packet_digest FROM worker_packets
     WHERE scope_type = 'task' AND status = 'assigned'
       AND scope_id IN (SELECT id FROM tasks WHERE change_id = ?)`,
  ).all(intent.change_id)) {
    semanticByPath.set(
      `${intent.destination}/authority/worker-packets/${row.id}.json`,
      row.packet_digest,
    );
  }
  const original = new Map();
  const pathRebound = new Map();
  for (const relative of tree.files) {
    const read = readStableProjectFile(rootDir, relative);
    original.set(relative, read.bytes);
    const text = read.bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(read.bytes)) {
      if (read.bytes.includes(Buffer.from(intent.source))) {
        throw new ChangeWorkflowError(
          'ARCHIVE_REBIND_UNSUPPORTED',
          `archive packet contains a binary active-root reference: ${relative}`,
        );
      }
      pathRebound.set(relative, read.bytes);
      continue;
    }
    let next = replaceArchiveAuthorityText(
      text, intent.source, intent.destination,
    );
    if (contextPaths.has(relative)) {
      let manifest;
      try { manifest = JSON.parse(next); } catch (error) {
        throw new ChangeWorkflowError(
          'ARCHIVE_CONTEXT_INVALID',
          `archived Context Manifest cannot be parsed: ${relative}: ${error.message}`,
        );
      }
      if (manifest.change?.id !== intent.change_id) {
        throw new ChangeWorkflowError(
          'ARCHIVE_CONTEXT_INVALID',
          `archived Context Manifest belongs to another change: ${relative}`,
        );
      }
      manifest.change.status = 'archived';
      next = `${JSON.stringify(manifest, null, 2)}\n`;
    }
    pathRebound.set(
      relative,
      normalizedArchiveDocument(Buffer.from(next), intent).bytes,
    );
  }

  let current = new Map(pathRebound);
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const digestMap = new Map();
    for (const [relative, beforeDigest] of originalByPath) {
      const bytes = current.get(relative);
      if (bytes) {
        digestMap.set(
          beforeDigest,
          crypto.createHash('sha256').update(bytes).digest('hex'),
        );
      }
    }
    for (const [relative, beforeDigest] of semanticByPath) {
      const bytes = current.get(relative);
      if (!bytes) continue;
      const normalized = normalizedArchiveDocument(bytes, intent);
      if (normalized.semanticDigest) {
        digestMap.set(beforeDigest, normalized.semanticDigest);
      }
    }
    const next = new Map();
    let changed = false;
    for (const [relative, baseBytes] of pathRebound) {
      const text = baseBytes.toString('utf8');
      if (!Buffer.from(text, 'utf8').equals(baseBytes)) {
        next.set(relative, baseBytes);
        continue;
      }
      const replaced = Buffer.from(
        replaceArchiveAuthorityText(
          text, intent.source, intent.destination, digestMap,
        ),
      );
      const bytes = normalizedArchiveDocument(replaced, intent).bytes;
      next.set(relative, bytes);
      if (!bytes.equals(current.get(relative))) changed = true;
    }
    current = next;
    if (!changed) break;
    if (iteration === 19) {
      throw new ChangeWorkflowError(
        'ARCHIVE_REBIND_CYCLE',
        'archive packet digest references did not converge',
      );
    }
  }
  return [...original.entries()].flatMap(([relative, before]) => {
    const after = current.get(relative);
    if (after.equals(before)) return [];
    return [{
      relative_path: path.posix.relative(intent.destination, relative),
      before_digest: crypto.createHash('sha256').update(before).digest('hex'),
      after_digest: crypto.createHash('sha256').update(after).digest('hex'),
      before_base64: before.toString('base64'),
      after_base64: after.toString('base64'),
    }];
  }).sort((left, right) => left.relative_path.localeCompare(right.relative_path));
}

function archiveRebindState(db, intent, rootDir) {
  const existing = archiveJournal.readArchiveRebind(rootDir, intent);
  const entries = existing?.entries || buildArchiveRebindEntries(db, intent, rootDir);
  const journal = archiveJournal.prepareArchiveRebind(
    rootDir, intent, existing ? null : entries,
  );
  const byPath = new Map(journal.entries.map((entry) => [
    `${intent.destination}/${entry.relative_path}`,
    entry,
  ]));
  const digestMap = new Map(journal.entries.map(
    (entry) => [entry.before_digest, entry.after_digest],
  ));
  const semanticEntry = (relativePath) => byPath.get(relativePath);
  for (const row of db.prepare(
    `SELECT id, digest FROM decision_records
     WHERE scope_type = 'change' AND scope_id = ?`,
  ).all(intent.change_id)) {
    const entry = semanticEntry(`${intent.destination}/decisions/${row.id}.json`);
    if (!entry) continue;
    const document = JSON.parse(Buffer.from(entry.after_base64, 'base64').toString('utf8'));
    if (document.digest) digestMap.set(row.digest, document.digest);
  }
  for (const row of db.prepare(
    `SELECT id, digest FROM context_envelopes
     WHERE (scope_type = 'change' AND scope_id = ?)
        OR (scope_type = 'task' AND scope_id IN (
          SELECT id FROM tasks WHERE change_id = ?
        ))`,
  ).all(intent.change_id, intent.change_id)) {
    const entry = semanticEntry(
      `${intent.destination}/authority/context-envelopes/${row.id}.json`,
    );
    if (!entry) continue;
    const document = JSON.parse(Buffer.from(entry.after_base64, 'base64').toString('utf8'));
    if (document.digest) digestMap.set(row.digest, document.digest);
  }
  for (const row of db.prepare(
    `SELECT id, packet_digest FROM worker_packets
     WHERE scope_type = 'task' AND status = 'assigned'
       AND scope_id IN (SELECT id FROM tasks WHERE change_id = ?)`,
  ).all(intent.change_id)) {
    const entry = semanticEntry(
      `${intent.destination}/authority/worker-packets/${row.id}.json`,
    );
    if (!entry) continue;
    const document = JSON.parse(Buffer.from(entry.after_base64, 'base64').toString('utf8'));
    if (document.packet_digest) {
      digestMap.set(row.packet_digest, document.packet_digest);
    }
  }
  return { journal, byPath, digestMap };
}

function finalizeArchive(db, intent, {
  rootDir,
  journalIntent = intent,
  kernelMode = false,
}) {
  const change = readChange(db, intent.change_id);
  if (!change) throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${intent.change_id} not found`);
  try {
    archiveJournal.verifyArchiveIntent(rootDir, journalIntent, { location: 'destination' });
  } catch (error) {
    throw new ChangeWorkflowError(
      'ARCHIVE_PATH_UNSAFE',
      `archive transition cannot trust its physical destination: ${error.message}`,
      { cause: error.code || error.message },
    );
  }
  const relative = artifacts.normalizeRelativePath(intent.destination);
  const destination = safeRelativePath(rootDir, relative);
  if (change.status === 'archived'
    && artifacts.normalizeRelativePath(change.artifact_root) === relative) {
    return { change, archive_path: destination };
  }
  const acceptedStatuses = kernelMode ? ['active', 'ready'] : ['ready'];
  if (!acceptedStatuses.includes(change.status)) {
    throw new ChangeWorkflowError(
      'CHANGE_NOT_READY',
      `change ${change.id} must have complete accepted checkpoints to finish archive`,
    );
  }
  const rebind = archiveRebindState(db, journalIntent, rootDir);
  const archivedReconciliationPath = rebindRegistryPath(
    intent.reconciliation_path, intent.source, relative,
  );
  const reconciliationRead = readStableProjectFile(
    rootDir, archivedReconciliationPath, { encoding: 'utf8' },
  );
  let reconciliationManifest;
  try { reconciliationManifest = JSON.parse(reconciliationRead.text); } catch (error) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_INVALID',
      `archived reconciliation manifest is invalid JSON: ${error.message}`,
    );
  }
  if (!validateReconciliationSchema(reconciliationManifest)
    || reconciliationManifest.change_id !== change.id) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_MANIFEST_INVALID',
      'archived reconciliation manifest no longer matches its accepted schema and Change',
      { errors: validateReconciliationSchema.errors || [] },
    );
  }
  const reconciliationDigest = reconciliationRead.digest;
  let summaryReader;
  try {
    summaryReader = openStableProjectRead(rootDir, `${relative}/archive-summary.md`);
  } catch (error) {
    throw new ChangeWorkflowError(
      'ARCHIVE_PATH_UNSAFE', 'archive summary cannot be read safely',
      { cause: error.code || error.message },
    );
  }
  const baselineHealthBefore = baselines.inspectBaseline(db, { rootDir });
  const breakGlass = Boolean(
    baselineHealthBefore.status !== 'pass'
      && change.kind === 'incident'
      && change.baseline_bypass?.mode === 'incident_break_glass',
  );
  try {
  ops.tx(db, () => {
    db.prepare(
      "UPDATE changes SET status = 'archived', artifact_root = ?, updated_at = ?, closed_at = ? WHERE id = ?",
    ).run(relative, nowIso(), nowIso(), change.id);
    const artifactRows = db.prepare(
      `SELECT id, path, digest, content_hash, before_digest, metadata_json, provenance_json
       FROM artifacts WHERE change_id = ?`,
    ).all(change.id);
    for (const artifact of artifactRows) {
      const archivedPath = rebindRegistryPath(
        artifact.path, intent.source, relative,
      );
      if (!archivedPath) continue;
      const rebound = rebind.byPath.get(archivedPath);
      if (rebound) {
        db.prepare(
          `UPDATE artifacts
           SET digest = ?, content_hash = ?, before_digest = COALESCE(before_digest, ?),
               after_digest = ?, metadata_json = ?, provenance_json = ?
           WHERE id = ?`,
        ).run(
          rebound.after_digest,
          rebound.after_digest,
          artifact.digest || artifact.content_hash || rebound.before_digest,
          rebound.after_digest,
          JSON.stringify(archiveRebindAuthorityValue(
            parseJson(artifact.metadata_json || '{}', 'artifacts.metadata_json'),
            intent.source,
            relative,
            rebind.digestMap,
          )),
          JSON.stringify(archiveRebindAuthorityValue(
            parseJson(artifact.provenance_json || '{}', 'artifacts.provenance_json'),
            intent.source,
            relative,
            rebind.digestMap,
          )),
          artifact.id,
        );
      }
      artifacts.moveArtifactInTx(db, artifact.id, archivedPath, { rootDir });
    }
    const workflowOutputs = db.prepare(
      `SELECT ws.run_id, ws.step_id, ws.outputs_json, ws.evidence_json,
              ws.decisions_json, ws.semantic_records_json, ws.blockers_json
       FROM workflow_steps ws JOIN workflow_runs wr ON wr.id = ws.run_id
       WHERE wr.change_id = ?`,
    ).all(change.id);
    for (const step of workflowOutputs) {
      const rebound = Object.fromEntries([
        ['outputs_json', parseJson(step.outputs_json, 'workflow_steps.outputs_json')],
        ['evidence_json', parseJson(step.evidence_json, 'workflow_steps.evidence_json')],
        ['decisions_json', parseJson(step.decisions_json, 'workflow_steps.decisions_json')],
        ['semantic_records_json', parseJson(
          step.semantic_records_json, 'workflow_steps.semantic_records_json',
        )],
        ['blockers_json', parseJson(step.blockers_json, 'workflow_steps.blockers_json')],
      ].map(([field, value]) => [
        field,
        JSON.stringify(archiveRebindAuthorityValue(
          value, intent.source, relative, rebind.digestMap,
        )),
      ]));
      db.prepare(
        `UPDATE workflow_steps
         SET outputs_json = ?, evidence_json = ?, decisions_json = ?,
             semantic_records_json = ?, blockers_json = ?, updated_at = ?
         WHERE run_id = ? AND step_id = ?`,
      ).run(
        rebound.outputs_json,
        rebound.evidence_json,
        rebound.decisions_json,
        rebound.semantic_records_json,
        rebound.blockers_json,
        nowIso(),
        step.run_id,
        step.step_id,
      );
    }
    const contextRows = db.prepare(
      `SELECT id, manifest_path, manifest_hash, context_json
       FROM context_snapshots WHERE change_id = ?`,
    ).all(change.id);
    for (const snapshot of contextRows) {
      const archivedPath = rebindRegistryPath(
        snapshot.manifest_path, intent.source, relative,
      );
      if (!archivedPath) continue;
      const rebound = rebind.byPath.get(archivedPath);
      db.prepare(
        `UPDATE context_snapshots
         SET manifest_path = ?, manifest_hash = ?, context_json = ? WHERE id = ?`,
      ).run(
        archivedPath,
        rebound?.after_digest || snapshot.manifest_hash,
        JSON.stringify(archiveRebindAuthorityValue(
          parseJson(snapshot.context_json || '{}', 'context_snapshots.context_json'),
          intent.source,
          relative,
          rebind.digestMap,
        )),
        snapshot.id,
      );
    }
    for (const decision of db.prepare(
      `SELECT id FROM decision_records
       WHERE scope_type = 'change' AND scope_id = ?`,
    ).all(change.id)) {
      const archivedPath = `${relative}/decisions/${decision.id}.json`;
      const rebound = rebind.byPath.get(archivedPath);
      if (!rebound) {
        throw new ChangeWorkflowError(
          'ARCHIVE_DECISION_MISSING',
          `archive is missing Decision Record ${decision.id}`,
        );
      }
      const document = JSON.parse(
        Buffer.from(rebound.after_base64, 'base64').toString('utf8'),
      );
      db.prepare(
        `UPDATE decision_records
         SET question = ?, recommendation = ?, selection = ?,
             effects_json = ?, non_goals_json = ?, owner = ?, source = ?,
             provenance_json = ?, applied_refs_json = ?, digest = ?,
             artifact_path = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        document.question,
        document.recommendation,
        document.selection,
        JSON.stringify(document.effects || {}),
        JSON.stringify(document.non_goals || []),
        document.owner,
        document.source,
        JSON.stringify(document.provenance || {}),
        JSON.stringify(document.applied_refs || []),
        document.digest,
        archivedPath,
        nowIso(),
        decision.id,
      );
    }
    for (const envelope of db.prepare(
      `SELECT id FROM context_envelopes
       WHERE (scope_type = 'change' AND scope_id = ?)
          OR (scope_type = 'task' AND scope_id IN (
            SELECT id FROM tasks WHERE change_id = ?
          ))`,
    ).all(change.id, change.id)) {
      const archivedPath = `${relative}/authority/context-envelopes/${envelope.id}.json`;
      const rebound = rebind.byPath.get(archivedPath);
      if (!rebound) {
        throw new ChangeWorkflowError(
          'ARCHIVE_CONTEXT_MISSING',
          `archive is missing Context Envelope ${envelope.id}`,
        );
      }
      const document = JSON.parse(
        Buffer.from(rebound.after_base64, 'base64').toString('utf8'),
      );
      db.prepare(
        `UPDATE context_envelopes
         SET digest = ?, file_digest = ?, payload_json = ?, artifact_path = ?
         WHERE id = ?`,
      ).run(
        document.digest,
        rebound.after_digest,
        JSON.stringify(document.envelope),
        archivedPath,
        envelope.id,
      );
    }
    for (const packet of db.prepare(
      `SELECT id FROM worker_packets
       WHERE scope_type = 'task' AND status = 'assigned'
         AND scope_id IN (SELECT id FROM tasks WHERE change_id = ?)`,
    ).all(change.id)) {
      const archivedPath = `${relative}/authority/worker-packets/${packet.id}.json`;
      const rebound = rebind.byPath.get(archivedPath);
      if (!rebound) {
        throw new ChangeWorkflowError(
          'ARCHIVE_WORKER_PACKET_MISSING',
          `archive is missing Worker Packet ${packet.id}`,
        );
      }
      const document = JSON.parse(
        Buffer.from(rebound.after_base64, 'base64').toString('utf8'),
      );
      const decisionDigest = canonical.digest(
        (document.accepted_decisions || []).map((decision) => ({
          id: decision.id,
          digest: decision.digest,
          status: 'accepted',
        })),
      );
      db.prepare(
        `UPDATE worker_packets
         SET context_digest = ?, task_digest = ?, decision_digest = ?,
             packet_digest = ?, file_digest = ?, packet_path = ?, output_path = ?
         WHERE id = ?`,
      ).run(
        document.context_envelope?.digest || null,
        document.task?.digest || null,
        decisionDigest,
        document.packet_digest,
        rebound.after_digest,
        archivedPath,
        document.output?.path,
        packet.id,
      );
    }
    const checkpointRows = db.prepare(
      `SELECT *
       FROM stage_checkpoints
       WHERE (scope_type = 'change' AND scope_id = ?)
          OR (scope_type = 'task' AND scope_id IN (
            SELECT id FROM tasks WHERE change_id = ?
          ))
       ORDER BY revision`,
    ).all(change.id, change.id);
    for (const row of checkpointRows) {
      const value = {
        stage: row.stage,
        scope_type: row.scope_type,
        scope_id: row.scope_id,
        revision: row.revision,
        payload: archiveRebindAuthorityValue(
          parseJson(row.payload_json || '{}', 'stage_checkpoints.payload_json'),
          intent.source,
          relative,
          rebind.digestMap,
        ),
        evidence: archiveRebindAuthorityValue(
          parseJson(row.evidence_json || '[]', 'stage_checkpoints.evidence_json'),
          intent.source,
          relative,
          rebind.digestMap,
        ),
        diagnostics: archiveRebindAuthorityValue(
          parseJson(row.diagnostics_json || '[]', 'stage_checkpoints.diagnostics_json'),
          intent.source,
          relative,
          rebind.digestMap,
        ),
        context_envelope_id: row.context_envelope_id,
        supersedes_id: row.supersedes_id,
      };
      db.prepare(
        `UPDATE stage_checkpoints
         SET payload_json = ?, evidence_json = ?, diagnostics_json = ?, digest = ?,
             updated_at = ?
         WHERE id = ?`,
      ).run(
        JSON.stringify(value.payload),
        JSON.stringify(value.evidence),
        JSON.stringify(value.diagnostics),
        stageCheckpoints.checkpointDigest(value),
        nowIso(),
        row.id,
      );
    }
    for (const task of db.prepare(
      `SELECT id, context_refs_json, docs_impact_json, ownership_json
       FROM tasks WHERE change_id = ?`,
    ).all(change.id)) {
      db.prepare(
        `UPDATE tasks
         SET context_refs_json = ?, docs_impact_json = ?, ownership_json = ?,
             updated_at = ?
         WHERE id = ?`,
      ).run(
        JSON.stringify(archiveRebindAuthorityValue(
          parseJson(task.context_refs_json || '[]', 'tasks.context_refs_json'),
          intent.source,
          relative,
          rebind.digestMap,
        )),
        JSON.stringify(archiveRebindAuthorityValue(
          parseJson(task.docs_impact_json || '{}', 'tasks.docs_impact_json'),
          intent.source,
          relative,
          rebind.digestMap,
        )),
        JSON.stringify(archiveRebindAuthorityValue(
          parseJson(task.ownership_json || '{}', 'tasks.ownership_json'),
          intent.source,
          relative,
          rebind.digestMap,
        )),
        nowIso(),
        task.id,
      );
    }
    for (const event of db.prepare(
      `SELECT id, payload_json FROM events
       WHERE change_id = ?
          OR task_id IN (SELECT id FROM tasks WHERE change_id = ?)`,
    ).all(change.id, change.id)) {
      db.prepare('UPDATE events SET payload_json = ? WHERE id = ?').run(
        JSON.stringify(archiveRebindAuthorityValue(
          parseJson(event.payload_json || '{}', 'events.payload_json'),
          intent.source,
          relative,
          rebind.digestMap,
        )),
        event.id,
      );
    }
    for (const run of db.prepare(
      `SELECT id, metadata_json, blockers_json, summary_json, approval_json
       FROM workflow_runs WHERE change_id = ?`,
    ).all(change.id)) {
      db.prepare(
        `UPDATE workflow_runs
         SET metadata_json = ?, blockers_json = ?, summary_json = ?, approval_json = ?
         WHERE id = ?`,
      ).run(
        JSON.stringify(archiveRebindAuthorityValue(
          parseJson(run.metadata_json || '{}', 'workflow_runs.metadata_json'),
          intent.source, relative, rebind.digestMap,
        )),
        JSON.stringify(archiveRebindAuthorityValue(
          parseJson(run.blockers_json || '[]', 'workflow_runs.blockers_json'),
          intent.source, relative, rebind.digestMap,
        )),
        JSON.stringify(archiveRebindAuthorityValue(
          parseJson(run.summary_json || '{}', 'workflow_runs.summary_json'),
          intent.source, relative, rebind.digestMap,
        )),
        run.approval_json === null
          ? null
          : JSON.stringify(archiveRebindAuthorityValue(
            parseJson(run.approval_json, 'workflow_runs.approval_json'),
            intent.source, relative, rebind.digestMap,
          )),
        run.id,
      );
    }
    db.prepare(
      `UPDATE trace_links
       SET source_ref = REPLACE(source_ref, ?, ?),
           target_ref = REPLACE(target_ref, ?, ?)
       WHERE change_id = ?`,
    ).run(intent.source, relative, intent.source, relative, change.id);
    upsertArtifact(db, {
      change_id: change.id, kind: 'archive_summary',
      artifactPath: `${relative}/archive-summary.md`,
      contentHash: summaryReader.digest,
      metadata: {
        baseline_updates: intent.baseline_updates,
        no_baseline_change_reason: intent.no_baseline_change_reason,
      },
      terminal: true,
      rootDir,
    });
    upsertArtifact(db, {
      change_id: change.id, kind: 'baseline_reconciliation',
      artifactPath: archivedReconciliationPath,
      contentHash: reconciliationDigest,
      metadata: {
        schema: reconciliationManifest.$schema,
        semantic_changes: reconciliationManifest.semantic_changes.map((item) => item.id),
        resolved_gap_ids: reconciliationManifest.resolved_gap_ids,
        resolved_unknowns: reconciliationManifest.resolved_unknowns,
      },
      terminal: true,
      rootDir,
    });
    for (const artifact of db.prepare(
      'SELECT id FROM artifacts WHERE change_id = ? ORDER BY id',
    ).all(change.id)) {
      artifacts.setArtifactStatusInTx(db, artifact.id, 'archived');
    }
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
        reconciliation: reconciliationManifest,
        accept_delivery_worktree: true,
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
        reconciliation_digest: reconciliationDigest,
        baseline_bypass: breakGlass,
      },
    });
    summaryReader.verify();
    try {
      archiveJournal.verifyArchiveIntent(
        rootDir, journalIntent, { location: 'destination' },
      );
    } catch (error) {
      throw new ChangeWorkflowError(
        'ARCHIVE_PATH_UNSAFE',
        `archive transition changed physical identity before commit: ${error.message}`,
        { cause: error.code || error.message },
      );
    }
  });
  } finally {
    summaryReader.close();
  }
  return {
    change: readChange(db, change.id), archive_path: destination,
    baseline_bypass: breakGlass,
  };
}

function archiveChange(db, input, {
  rootDir = process.cwd(),
  kernelMode = false,
} = {}) {
  const change = readChange(db, input.id);
  if (!change) throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${input.id} not found`);
  if (!input.summary || String(input.summary).trim().length < 3) {
    throw new ChangeWorkflowError('VALIDATION_ERROR', 'archive summary required');
  }
  const allowedArchiveStatuses = kernelMode
    ? ['active', 'archived']
    : ['ready', 'archived'];
  if (!allowedArchiveStatuses.includes(change.status)) {
    throw new ChangeWorkflowError('CHANGE_NOT_READY', `change ${input.id} must converge before archive`);
  }
  if (change.status === 'archived') {
    deliveryTransaction.completeDeliveryTransaction({
      rootDir,
      changeId: change.id,
    });
    return {
      change,
      archive_path: safeRelativePath(rootDir, change.artifact_root),
      idempotent: true,
    };
  }

  let packet = null;
  if (changePacket.readDeltaAuthority(db, change.id)) {
    if (!kernelMode) {
      legacyWorkflows().validateDeliveryPrerequisites(
        db,
        { change_id: change.id },
        rootDir,
      );
    }
    packet = changePacket.deliveryEntries(db, change, { rootDir });
  }
  const requestedUpdates = Array.isArray(input.baseline_updates)
    ? input.baseline_updates.map((item) => artifacts.normalizeRelativePath(item))
    : null;
  const updates = packet
    ? packet.baseline_updates
    : (requestedUpdates || []);
  if (packet && requestedUpdates
    && JSON.stringify([...requestedUpdates].sort()) !== JSON.stringify([...updates].sort())) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_CONFLICT',
      'baseline_updates must match the typed Change delta exactly',
    );
  }
  const requestedNoChange = input.no_baseline_change_reason
    && String(input.no_baseline_change_reason).trim();
  const noChangeReason = packet
    ? (packet.delta.value.no_semantic_change_reason || requestedNoChange || null)
    : requestedNoChange;
  if (updates.length === 0 && !noChangeReason) {
    throw new ChangeWorkflowError(
      'BASELINE_RECONCILIATION_REQUIRED',
      'baseline updates or no-change reason required',
    );
  }

  const reconciliation = packet
    ? generatePacketReconciliation(db, change, packet, rootDir)
    : (
      kernelMode && updates.length === 0 && !String(input.reconciliation_path || '').trim()
        ? generateCallerNoChangeReconciliation(db, change, {
          summary: input.summary,
          no_baseline_change_reason: noChangeReason,
        }, rootDir)
        : readReconciliationManifest(db, change, input, rootDir)
    );
  if (kernelMode) {
    materializeKernelArchiveAuthority(db, change, rootDir);
  }
  let delivery = null;
  let prepared = null;
  try {
    if (packet) {
      delivery = deliveryTransaction.beginDeliveryTransaction({
        rootDir,
        changeId: change.id,
        entries: packet.entries,
      });
    }
    for (const file of updates) {
      if (!fs.existsSync(safeRelativePath(rootDir, file))) {
        throw new ChangeWorkflowError(
          'BASELINE_FILE_MISSING', `baseline update missing: ${file}`,
        );
      }
    }
    prepared = archiveJournal.prepareArchiveMove({
      rootDir, change, summary: String(input.summary), baselineUpdates: updates,
      noBaselineChangeReason: noChangeReason || null,
      reconciliationPath: reconciliation.relative,
      reconciliationDigest: reconciliation.journal_intent?.reconciliation_digest
        || reconciliation.digest,
      reconciliationManifest: reconciliation.journal_intent?.reconciliation_manifest
        || reconciliation.manifest,
    });
  } catch (error) {
    if (delivery) {
      try {
        deliveryTransaction.rollbackDeliveryTransaction({
          rootDir,
          changeId: change.id,
        });
      } catch (rollbackError) {
        throw new ChangeWorkflowError('DELIVERY_RECOVERY_REQUIRED', error.message, {
          cause: error.code || error.message,
          rollback: rollbackError.code || rollbackError.message,
        });
      }
    }
    throw error;
  }
  const authoritativeIntent = {
    ...prepared.intent,
    reconciliation_digest: reconciliation.digest,
    reconciliation_manifest: reconciliation.manifest,
  };
  let result;
  try {
    result = finalizeArchive(db, authoritativeIntent, {
      rootDir,
      journalIntent: prepared.intent,
      kernelMode,
    });
  } catch (error) {
    try { archiveJournal.rollbackArchiveIntent(rootDir, prepared.intent); }
    catch (rollbackError) {
      throw new ChangeWorkflowError('ARCHIVE_RECOVERY_REQUIRED', error.message, {
        cause: error.code || error.message, rollback: rollbackError.code || rollbackError.message,
      });
    }
    if (delivery) {
      try {
        deliveryTransaction.rollbackDeliveryTransaction({
          rootDir,
          changeId: change.id,
        });
      } catch (rollbackError) {
        throw new ChangeWorkflowError('DELIVERY_RECOVERY_REQUIRED', error.message, {
          cause: error.code || error.message,
          rollback: rollbackError.code || rollbackError.message,
        });
      }
    }
    throw error;
  }
  try { archiveJournal.completeArchiveIntent(rootDir, prepared.intent); }
  catch (error) { result.recovery_warning = `ARCHIVE_JOURNAL_CLEANUP_PENDING:${error.message}`; }
  if (delivery) {
    try {
      deliveryTransaction.completeDeliveryTransaction({
        rootDir,
        changeId: change.id,
      });
    } catch (error) {
      result.recovery_warning = [
        result.recovery_warning,
        `DELIVERY_JOURNAL_CLEANUP_PENDING:${error.message}`,
      ].filter(Boolean).join(';');
    }
  }
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
      } else if (['active', 'ready'].includes(change?.status) && record.location === 'destination') {
        const reconciliation = readReconciliationManifest(db, change, {
          reconciliation_path: record.intent.reconciliation_path,
          baseline_updates: record.intent.baseline_updates,
        }, rootDir);
        const authoritativeIntent = {
          ...record.intent,
          reconciliation_digest: reconciliation.digest,
          reconciliation_manifest: reconciliation.manifest,
        };
        finalizeArchive(db, authoritativeIntent, {
          rootDir,
          journalIntent: record.intent,
          // Recovery is a mechanical continuation of an already prepared
          // archive intent. It must never re-enter the retired semantic
          // workflow supervisor, including for a v0.23 `ready` Change.
          kernelMode: true,
        });
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
  const archivedChangeIds = new Set(
    db.prepare("SELECT id FROM changes WHERE status = 'archived'").all().map((row) => row.id),
  );
  result.delivery = deliveryTransaction.recoverDeliveryTransactions({
    rootDir,
    archivedChangeIds,
  });
  result.failed += result.delivery.failed;
  return result;
}

module.exports = {
  ChangeWorkflowError,
  createChange,
  readChange,
  listChanges,
  updateChange,
  recordDelta,
  recordDocumentationReconciliation,
  compileContext,
  readBreadcrumb(...args) {
    return legacyContextSpine().readBreadcrumb(...args);
  },
  proposeSpecLearning(...args) {
    return legacySpecLearning().proposeSpecLearning(...args);
  },
  resolveSpecLearning(...args) {
    return legacySpecLearning().resolveSpecLearning(...args);
  },
  listSpecLearning(...args) {
    return legacySpecLearning().listSpecLearning(...args);
  },
  convergeChange,
  archiveChange,
  normalizeDocsImpact,
  normalizeProviderRefs,
  normalizeBaselineBypass,
  assertTaskCreationAllowed,
  recoverInterruptedArchives,
};
