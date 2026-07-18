'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ops = require('./state-ops.cjs');
const contextSpine = require('./context-spine.cjs');
const specLearning = require('./spec-learning.cjs');
const providerRefs = require('./provider-refs.cjs');
const baselines = require('./baseline-workflow.cjs');

const CHANGE_ID = /^[a-zA-Z0-9_-]+$/;
const CHANGE_PATCH_FIELDS = new Set(['title', 'intent', 'status', 'docs_impact', 'provider_refs']);
const CHANGE_TRANSITIONS = Object.freeze({
  active: new Set(['active', 'blocked', 'cancelled']),
  blocked: new Set(['active', 'blocked', 'cancelled']),
  ready: new Set(['ready']),
  archived: new Set(),
  cancelled: new Set(),
});
const REQUIRED_EVIDENCE = Object.freeze({
  quick: ['diff', 'tests', 'spec'],
  standard: ['diff', 'tests', 'spec', 'docs', 'review'],
  major: ['diff', 'tests', 'spec', 'docs', 'review'],
  incident: ['diagnosis', 'diff', 'tests'],
});
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
  };
  delete change.docs_impact_json;
  delete change.provider_refs_json;
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
    '',
    '## Intent',
    '',
    change.intent,
    '',
  ];
  if (impact.rationale) lines.push('## Documentation rationale', '', impact.rationale, '');
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
    `SELECT id, title, type, status, priority, complexity, stale, trace_to,
            context_file, files_modified, session_id, created_at, updated_at
     FROM tasks WHERE change_id = ? ORDER BY created_at ASC`,
  ).all(change.id).map((task) => ({ ...task, stale: Boolean(task.stale) }));
  const specs = Array.isArray(input.spec_refs) ? input.spec_refs : [];
  const allowedPaths = Array.isArray(input.allowed_paths) ? input.allowed_paths : [];
  const head = gitHead(rootDir);
  const spine = contextSpine.compileRoleContext(db, { input, change, tasks, rootDir });
  const manifest = {
    schema_version: '2.0',
    generated_at: nowIso(),
    change: {
      id: change.id, title: change.title, kind: change.kind, status: change.status,
      intent: change.intent, docs_impact: change.docs_impact, base_commit: change.base_commit,
    },
    git: { head },
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
    tool_policy: { allowed_paths: allowedPaths },
  };
  const artifactDir = path.resolve(rootDir, change.artifact_root);
  fs.mkdirSync(artifactDir, { recursive: true });
  const manifestPath = path.join(artifactDir, 'context-manifest.json');
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
      `ctx-${crypto.randomUUID().slice(0, 12)}`, change.id, input.task_id || null,
      head, JSON.stringify(providers), relative, hash,
      spine.role, spine.gate, spine.next_action, spine.readiness.status,
      JSON.stringify(spine.readiness.blockers), JSON.stringify(spine),
      spine.context.token_estimate, spine.context.budget.max_tokens,
    );
    upsertArtifact(db, {
      change_id: change.id, task_id: input.task_id || null, kind: 'context_manifest',
      artifactPath: relative, contentHash: hash,
      metadata: {
        git_head: head, role: spine.role, gate: spine.gate,
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
        manifest_path: relative, manifest_hash: hash, git_head: head,
        role: spine.role, gate: spine.gate, readiness: spine.readiness.status,
        next_action: spine.next_action,
      },
    });
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
  if (!REQUIRED_EVIDENCE[input.kind]) {
    throw new ChangeWorkflowError('VALIDATION_ERROR', `invalid change kind: ${input.kind}`);
  }
  if (readChange(db, input.id)) throw new ChangeWorkflowError('DUPLICATE_CHANGE_ID', `change ${input.id} exists`);
  const docsImpact = normalizeDocsImpact(input.docs_impact);
  const providers = normalizeProviderRefs(input.provider_refs);
  const artifactRoot = path.join('.ultra', 'changes', 'active', input.id);
  const artifactDir = path.resolve(rootDir, artifactRoot);
  if (fs.existsSync(artifactDir)) {
    throw new ChangeWorkflowError('CHANGE_ARTIFACT_EXISTS', `change artifact already exists: ${artifactDir}`);
  }
  const ts = nowIso();
  const row = {
    id: input.id, title, kind: input.kind, status: 'active',
    intent, docs_impact: docsImpact, provider_refs: providers,
    base_commit: input.base_commit || gitHead(rootDir), artifact_root: artifactRoot,
    created_at: ts, updated_at: ts,
  };
  try {
    return ops.tx(db, () => {
      db.prepare(
        `INSERT INTO changes
         (id, title, kind, status, intent, docs_impact_json, provider_refs_json,
          base_commit, artifact_root, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.id, row.title, row.kind, row.status, row.intent, JSON.stringify(row.docs_impact),
        JSON.stringify(row.provider_refs), row.base_commit, row.artifact_root, ts, ts,
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
      const context = compileContext(db, { id: row.id }, { rootDir });
      return {
        change: readChange(db, row.id), intent_path: intentPath,
        context_manifest_path: context.context_manifest_path,
      };
    });
  } catch (error) {
    fs.rmSync(artifactDir, { recursive: true, force: true });
    throw error;
  }
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
  const syncIntent = ['title', 'intent', 'docs_impact'].some((field) => patch[field] !== undefined);
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

function evidenceBlockers(change, evidence, tasks) {
  const blockers = [];
  const rows = Array.isArray(evidence) ? evidence : [];
  const byCategory = new Map(rows.map((row) => [row.category, row]));
  for (const category of REQUIRED_EVIDENCE[change.kind].filter((value) => value !== 'review')) {
    const row = byCategory.get(category);
    if (!row) blockers.push(`EVIDENCE_MISSING:${category}`);
    else if (!['pass', 'not_applicable'].includes(row.status)) blockers.push(`EVIDENCE_FAILED:${category}`);
    else if (!row.evidence || String(row.evidence).trim().length < 3) blockers.push(`EVIDENCE_EMPTY:${category}`);
  }
  if (['standard', 'major'].includes(change.kind)) {
    const reviews = rows.filter((row) => row.category === 'review');
    for (const axis of ['spec_fidelity', 'engineering_standards']) {
      const row = reviews.find((candidate) => candidate.axis === axis);
      if (!row) blockers.push(`REVIEW_AXIS_MISSING:${axis}`);
      else if (row.status !== 'pass') blockers.push(`REVIEW_AXIS_FAILED:${axis}`);
      else if (!row.evidence || String(row.evidence).trim().length < 3) {
        blockers.push(`REVIEW_AXIS_EMPTY:${axis}`);
      }
    }
  }
  const tests = byCategory.get('tests');
  if (tests && ['standard', 'major', 'incident'].includes(change.kind)
    && (!tests.seam || String(tests.seam).trim().length < 3)) {
    blockers.push('TEST_SEAM_MISSING');
  }
  if (tests && (change.kind === 'incident' || tasks.some((task) => task.type === 'bugfix'))) {
    const signal = tests.signal;
    if (!signal) blockers.push('TEST_RED_SIGNAL_MISSING');
    else {
      if (!signal.command || String(signal.command).trim().length < 3) blockers.push('TEST_SIGNAL_COMMAND_MISSING');
      if (!signal.expected_red || String(signal.expected_red).trim().length < 3) blockers.push('TEST_EXPECTED_RED_MISSING');
      if (signal.observed_red !== true) blockers.push('TEST_RED_NOT_OBSERVED');
      if (signal.observed_green !== true) blockers.push('TEST_GREEN_NOT_OBSERVED');
      if (signal.deterministic !== true) blockers.push('TEST_SIGNAL_NOT_DETERMINISTIC');
    }
  }
  return blockers;
}

function baselineConvergenceBlockers(db) {
  const baseline = baselines.readBaseline(db);
  if (!baseline) return ['BASELINE_MISSING'];
  if (baseline.status !== 'ready') return [`BASELINE_NOT_READY:${baseline.status}`];
  return [];
}

function convergeChange(db, input, { rootDir = process.cwd() } = {}) {
  const change = readChange(db, input.id);
  if (!change) throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${input.id} not found`);
  if (!['active', 'blocked'].includes(change.status)) {
    throw new ChangeWorkflowError('CHANGE_NOT_CONVERGEABLE', `change ${input.id} is ${change.status}`);
  }
  const tasks = db.prepare('SELECT id, type, status, stale FROM tasks WHERE change_id = ? ORDER BY id').all(change.id);
  const blockers = new Set(evidenceBlockers(change, input.evidence, tasks));
  for (const blocker of baselineConvergenceBlockers(db)) blockers.add(blocker);
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
  const manifestPath = path.join(artifactDir, 'context-manifest.json');
  if (!fs.existsSync(manifestPath)) blockers.add('CONTEXT_MANIFEST_MISSING');
  else {
    const manifest = parseJson(fs.readFileSync(manifestPath, 'utf8'), 'context-manifest.json');
    if (manifest.git && manifest.git.head !== gitHead(rootDir)) blockers.add('CONTEXT_HEAD_STALE');
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

  const verificationPath = path.join(artifactDir, 'verification.md');
  const lines = [
    `# Verification: ${change.title}`, '',
    ...input.evidence.flatMap((row) => [
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
      metadata: { evidence: input.evidence },
    });
    ops.appendEventInTx(db, {
      type: 'change_converged', change_id: change.id,
      payload: { evidence_categories: input.evidence.map((row) => row.category) },
    });
  });
  return { ready: true, status: 'ready', blockers: [], verification_path: verificationPath };
}

function archiveChange(db, input, { rootDir = process.cwd() } = {}) {
  const change = readChange(db, input.id);
  if (!change) throw new ChangeWorkflowError('CHANGE_NOT_FOUND', `change ${input.id} not found`);
  if (change.status !== 'ready') {
    throw new ChangeWorkflowError('CHANGE_NOT_READY', `change ${input.id} must converge before archive`);
  }
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
  const source = path.resolve(rootDir, change.artifact_root);
  const date = nowIso().slice(0, 10);
  const destination = path.join(rootDir, '.ultra', 'changes', 'archive', `${date}-${change.id}`);
  if (fs.existsSync(destination)) {
    throw new ChangeWorkflowError('ARCHIVE_EXISTS', `archive already exists: ${destination}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const summaryPath = path.join(source, 'archive-summary.md');
  const previousSummary = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath) : null;
  fs.writeFileSync(summaryPath, [
    `# Archived change: ${change.title}`, '', String(input.summary).trim(), '',
    '## Baseline reconciliation', '',
    ...(updates.length > 0 ? updates.map((file) => `- ${file}`) : [noChangeReason]), '',
  ].join('\n'));
  fs.renameSync(source, destination);
  try {
    ops.tx(db, () => {
      const relative = path.relative(rootDir, destination);
      db.prepare(
        "UPDATE changes SET status = 'archived', artifact_root = ?, updated_at = ?, closed_at = ? WHERE id = ?",
      ).run(relative, nowIso(), nowIso(), change.id);
      const prefix = `${change.artifact_root}${path.sep}`;
      const artifactRows = db.prepare('SELECT id, path FROM artifacts WHERE change_id = ?')
        .all(change.id);
      for (const artifact of artifactRows) {
        if (artifact.path !== change.artifact_root && !artifact.path.startsWith(prefix)) continue;
        const suffix = path.relative(change.artifact_root, artifact.path);
        const archivedPath = suffix ? path.join(relative, suffix) : relative;
        db.prepare('UPDATE artifacts SET path = ?, updated_at = ? WHERE id = ?')
          .run(archivedPath, nowIso(), artifact.id);
      }
      const archivedSummary = path.join(destination, 'archive-summary.md');
      upsertArtifact(db, {
        change_id: change.id,
        kind: 'archive_summary',
        artifactPath: path.relative(rootDir, archivedSummary),
        contentHash: crypto.createHash('sha256').update(fs.readFileSync(archivedSummary)).digest('hex'),
        metadata: {
          baseline_updates: updates,
          no_baseline_change_reason: noChangeReason || null,
        },
      });
      db.prepare("UPDATE artifacts SET status = 'archived', updated_at = ? WHERE change_id = ?")
        .run(nowIso(), change.id);
      baselines.reconcileBaseline(db, {
        baseline_updates: updates,
        change_id: change.id,
      }, { rootDir });
      const baselineHealth = baselines.inspectBaseline(db, { rootDir });
      if (baselineHealth.blockers.length > 0) {
        throw new ChangeWorkflowError(
          'BASELINE_RECONCILIATION_INCOMPLETE',
          `baseline reconciliation remains incomplete: ${baselineHealth.blockers.join(', ')}`,
          { blockers: baselineHealth.blockers },
        );
      }
      ops.appendEventInTx(db, {
        type: 'change_archived', change_id: change.id,
        payload: { archive_path: relative, baseline_updates: updates, no_baseline_change_reason: noChangeReason || null },
      });
    });
  } catch (error) {
    fs.renameSync(destination, source);
    if (previousSummary === null) fs.rmSync(summaryPath, { force: true });
    else fs.writeFileSync(summaryPath, previousSummary);
    throw error;
  }
  return { change: readChange(db, change.id), archive_path: destination };
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
};
