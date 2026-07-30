'use strict';

const path = require('node:path');

const { version: PACKAGE_VERSION } = require('../../package.json');
const artifactRegistry = require('./artifact-registry.cjs');
const baselines = require('./baseline-workflow.cjs');
const canonical = require('./canonical-json.cjs');
const changes = require('./change-workflow.cjs');
const decisions = require('./decision-records.cjs');
const { writeManagedJson } = require('./managed-file-write.cjs');
const ops = require('./state-ops.cjs');
const { readStableProjectFile } = require('./safe-project-file.cjs');
const checkpoints = require('./stage-checkpoints.cjs');
const taskLedger = require('./task-ledger.cjs');

const SUMMARY_LIMIT = 16 * 1024;
const FULL_LIMIT = 64 * 1024;

class ContextEnvelopeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ContextEnvelopeError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function parseJson(value, fallback) {
  try { return value == null ? fallback : JSON.parse(value); }
  catch { return fallback; }
}

function text(value, max) {
  if (typeof value !== 'string') return value;
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 32))}…[truncated ${value.length - max + 32} chars]`;
}

function compactValue(value, {
  depth = 0,
  maxDepth = 5,
  textLimit = 2000,
  arrayLimit = 50,
} = {}) {
  if (typeof value === 'string') return text(value, textLimit);
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (depth >= maxDepth) return Array.isArray(value) ? `[${value.length} items]` : '[object]';
  if (Array.isArray(value)) {
    return value.slice(0, arrayLimit).map((item) => compactValue(item, {
      depth: depth + 1, maxDepth, textLimit, arrayLimit,
    }));
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    compactValue(child, { depth: depth + 1, maxDepth, textLimit, arrayLimit }),
  ]));
}

function selectedChange(db, changeId) {
  if (!changeId) return null;
  return changes.readChange(db, changeId);
}

function selectedTask(db, taskId) {
  if (!taskId) return null;
  return ops.readTask(db, taskId);
}

function resolvedScope(db, input = {}) {
  const requested = input.scope || {};
  const task = selectedTask(db, requested.task_id);
  const changeId = requested.change_id || task?.change_id || null;
  const change = selectedChange(db, changeId);
  const baseline = baselines.readBaseline(db);
  if (task) return { type: 'task', id: task.id, baseline, change, task };
  if (change) return { type: 'change', id: change.id, baseline, change, task: null };
  if (!requested.task_id && !requested.change_id) {
    const activeChangeRow = db.prepare(
      `SELECT id FROM changes
       WHERE status IN ('active', 'blocked', 'ready')
       ORDER BY
         CASE status WHEN 'active' THEN 0 WHEN 'blocked' THEN 1 ELSE 2 END,
         updated_at DESC,
         rowid DESC
       LIMIT 1`,
    ).get();
    if (activeChangeRow) {
      const activeChange = selectedChange(db, activeChangeRow.id);
      const activeTaskRow = db.prepare(
        `SELECT id FROM tasks
         WHERE change_id = ? AND status IN ('in_progress', 'blocked', 'pending')
         ORDER BY
           CASE status WHEN 'in_progress' THEN 0 WHEN 'blocked' THEN 1 ELSE 2 END,
           updated_at DESC,
           rowid DESC
         LIMIT 1`,
      ).get(activeChangeRow.id);
      const activeTask = activeTaskRow ? selectedTask(db, activeTaskRow.id) : null;
      if (activeTask) {
        return {
          type: 'task',
          id: activeTask.id,
          baseline,
          change: activeChange,
          task: activeTask,
        };
      }
      return {
        type: 'change',
        id: activeChange.id,
        baseline,
        change: activeChange,
        task: null,
      };
    }
  }
  if (baseline) return { type: 'baseline', id: baseline.id, baseline, change: null, task: null };
  return { type: 'project', id: 'project', baseline: null, change: null, task: null };
}

function acceptedDecisionRows(db, scope, rootDir) {
  const rows = [];
  if (scope.baseline) {
    rows.push(...decisions.listAcceptedDecisions(
      db,
      { baseline_id: scope.baseline.id },
      { limit: 200, rootDir, validateFiles: true },
    ));
  }
  if (scope.change) {
    rows.push(...decisions.listAcceptedDecisions(
      db,
      { change_id: scope.change.id },
      { limit: 200, rootDir, validateFiles: true },
    ));
  }
  return rows;
}

function checkpointRows(db, scope) {
  const rows = [];
  if (scope.change) {
    rows.push(...checkpoints.listCheckpoints(
      db,
      { scope: { change_id: scope.change.id }, limit: 100 },
    ).filter((item) => item.status !== 'superseded'));
  }
  if (scope.task) {
    rows.push(...checkpoints.listCheckpoints(
      db,
      { scope: { task_id: scope.task.id }, limit: 100 },
    ).filter((item) => item.status !== 'superseded'));
  }
  if (!scope.change && scope.baseline) {
    rows.push(...checkpoints.listCheckpoints(
      db,
      { scope: { baseline_id: scope.baseline.id }, limit: 100 },
    ).filter((item) => item.status !== 'superseded'));
  }
  return rows;
}

function artifactRows(db, scope) {
  const clauses = [
    "status <> 'archived'",
    "kind NOT IN ('context_envelope', 'worker_packet')",
  ];
  const params = [];
  if (scope.task) {
    clauses.push('(task_id = ? OR change_id = ?)');
    params.push(scope.task.id, scope.change?.id || '');
  } else if (scope.change) {
    clauses.push('change_id = ?');
    params.push(scope.change.id);
  } else if (scope.baseline) {
    clauses.push("(owner_type = 'baseline' AND owner_id = ?)");
    params.push(scope.baseline.id);
  } else {
    clauses.push("owner_type = 'project'");
  }
  return db.prepare(
    `SELECT id, owner_type, owner_id, kind, path, digest, status, provenance_json
     FROM artifacts WHERE ${clauses.join(' AND ')}
     ORDER BY updated_at DESC, id ASC LIMIT 500`,
  ).all(...params).map((row) => ({
    id: row.id,
    owner_type: row.owner_type,
    owner_id: row.owner_id,
    kind: row.kind,
    ref: row.path,
    digest: row.digest,
    status: row.status,
    provenance: parseJson(row.provenance_json, {}),
  }));
}

function executionState(db, scope) {
  if (!scope.task) return { session: null };
  const session = db.prepare(
    `SELECT sid, task_id, runtime, worktree_path, artifact_dir, status,
            lease_expires_at, heartbeat_at, started_at
     FROM sessions WHERE task_id = ?
     ORDER BY started_at DESC, rowid DESC LIMIT 1`,
  ).get(scope.task.id) || null;
  const packet = db.prepare(
    `SELECT id, role, context_envelope_id, context_digest, task_digest,
            decision_digest, packet_digest, packet_path, output_path, created_at
     FROM worker_packets WHERE scope_type = 'task' AND scope_id = ?
       AND status = 'assigned'
     ORDER BY created_at DESC, rowid DESC LIMIT 1`,
  ).get(scope.task.id) || null;
  return { session, worker_packet: packet };
}

function ledgerHealth(db, rootDir) {
  try {
    const result = taskLedger.inspectTaskLedger(db, { rootDir });
    return {
      status: result.status || 'available',
      generation: result.generation ?? null,
      state_digest: result.state_digest || null,
      path: taskLedger.LEDGER_RELATIVE_PATH,
    };
  } catch (error) {
    return {
      status: 'migration_required',
      generation: null,
      state_digest: null,
      path: taskLedger.LEDGER_RELATIVE_PATH,
      migration: {
        required: true,
        code: error.code || 'TASK_LEDGER_INVALID',
        action: 'ultra.sync migrate',
      },
    };
  }
}

function authorityPayload(db, input, options) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const stage = input.stage || 'project';
  const scope = resolvedScope(db, input);
  const baselineHealth = scope.baseline
    ? baselines.inspectBaseline(db, { rootDir })
    : { blockers: [], warnings: [] };
  const checkpointList = checkpointRows(db, scope);
  const diagnostics = {
    warnings: (baselineHealth.warnings || []).map((code) => ({ code, severity: 'warning' })),
    needs_attention: checkpointList.flatMap((item) => (
      item.diagnostics.filter((diagnostic) => diagnostic.severity === 'needs_attention')
    )),
    hard_conflicts: checkpointList.flatMap((item) => (
      item.diagnostics.filter((diagnostic) => diagnostic.severity === 'hard_conflict')
    )),
  };
  for (const code of baselineHealth.blockers || []) {
    diagnostics.needs_attention.push({ code, severity: 'needs_attention' });
  }
  const ledger = ledgerHealth(db, rootDir);
  if (ledger.migration?.required) {
    diagnostics.needs_attention.push({
      code: ledger.migration.code,
      severity: 'needs_attention',
      action: ledger.migration.action,
    });
  }
  return {
    schema_version: '1.0',
    project: {
      root: '.',
      runtime: options.runtime || 'unknown',
      plugin_version: PACKAGE_VERSION,
      health: diagnostics.hard_conflicts.length > 0 ? 'conflict' : 'available',
    },
    git: scope.baseline ? {
      head: baselineHealth.current_repository_revision || scope.baseline.repository_revision || null,
      branch: scope.baseline.repository_branch || null,
      scoped_worktree_digest: scope.baseline.worktree_digest || null,
      drift: {
        metadata_only: (baselineHealth.warnings || []).includes('BASELINE_METADATA_ONLY_DRIFT'),
        source_or_spec: (baselineHealth.blockers || []).some((code) => (
          String(code).includes('SOURCE') || String(code).includes('SPEC')
        )),
      },
    } : null,
    baseline: scope.baseline,
    change: scope.change,
    task: scope.task,
    decisions: acceptedDecisionRows(db, scope, rootDir),
    checkpoints: checkpointList,
    evidence: [
      ...(scope.baseline?.evidence || []),
      ...artifactRows(db, scope),
    ],
    execution: {
      stage,
      ...executionState(db, scope),
    },
    team_checkpoint: ledger,
    diagnostics,
  };
}

function presentation(authority, detail) {
  const summary = detail !== 'full';
  return compactValue(authority, {
    maxDepth: summary ? 4 : 7,
    textLimit: summary ? 500 : 4000,
    arrayLimit: summary ? 12 : 100,
  });
}

function fitEnvelope(authority, detail, digest) {
  const limit = detail === 'full' ? FULL_LIMIT : SUMMARY_LIMIT;
  let envelope = presentation(authority, detail);
  let output = { schema_version: '1.0', digest, detail, envelope };
  if (Buffer.byteLength(JSON.stringify(output)) <= limit) return output;
  envelope = {
    ...envelope,
    evidence: (envelope.evidence || []).slice(0, detail === 'full' ? 30 : 6),
    decisions: (envelope.decisions || []).slice(0, detail === 'full' ? 30 : 8),
    checkpoints: (envelope.checkpoints || []).slice(0, detail === 'full' ? 20 : 8),
    cursors: {
      evidence: authority.evidence.length > (detail === 'full' ? 30 : 6)
        ? { available: authority.evidence.length, action: 'ultra.context full with narrower scope' }
        : null,
      decisions: authority.decisions.length > (detail === 'full' ? 30 : 8)
        ? { available: authority.decisions.length, action: 'ultra.context full with narrower scope' }
        : null,
    },
  };
  output = { schema_version: '1.0', digest, detail, envelope };
  if (Buffer.byteLength(JSON.stringify(output)) <= limit) return output;
  envelope = compactValue(envelope, {
    maxDepth: 4,
    textLimit: detail === 'full' ? 1000 : 240,
    arrayLimit: detail === 'full' ? 20 : 6,
  });
  output = { schema_version: '1.0', digest, detail, envelope };
  if (Buffer.byteLength(JSON.stringify(output)) > limit) {
    const error = new Error(`context envelope exceeds ${limit} byte limit after compaction`);
    error.code = 'CONTEXT_ENVELOPE_LIMIT_EXCEEDED';
    throw error;
  }
  return output;
}

function buildEnvelope(db, input = {}, options = {}) {
  const authority = authorityPayload(db, input, options);
  const digest = canonical.digest(authority);
  const output = fitEnvelope(authority, input.detail || 'summary', digest);
  output.bytes = Buffer.byteLength(JSON.stringify(output));
  return output;
}

function contextArtifactPath(scope, id) {
  if (scope.task) return `.ultra/.runtime/projections/contexts/${id}.json`;
  if (scope.change) return `${scope.change.artifact_root}/contexts/${id}.json`;
  return `.ultra/.runtime/projections/contexts/${id}.json`;
}

function readEnvelope(db, id, { rootDir = process.cwd() } = {}) {
  const row = db.prepare('SELECT * FROM context_envelopes WHERE id = ?').get(id);
  if (!row) {
    throw new ContextEnvelopeError(
      'CONTEXT_ENVELOPE_NOT_FOUND',
      `Context Envelope not found: ${id}`,
    );
  }
  const read = readStableProjectFile(rootDir, row.artifact_path, { encoding: 'utf8' });
  if (!row.file_digest || read.digest !== row.file_digest) {
    throw new ContextEnvelopeError(
      'CONTEXT_ENVELOPE_FILE_DRIFT',
      `Context Envelope bytes no longer match ${id}`,
      {
        path: row.artifact_path,
        expected: row.file_digest || null,
        actual: read.digest,
      },
    );
  }
  let document;
  try {
    document = JSON.parse(read.text);
  } catch (cause) {
    throw new ContextEnvelopeError(
      'CONTEXT_ENVELOPE_INVALID',
      `Context Envelope is not valid JSON: ${row.artifact_path}`,
      { cause: cause.message },
    );
  }
  const storedPayload = parseJson(row.payload_json, null);
  if (!storedPayload
      || document.schema_version !== '1.0'
      || document.detail !== 'full'
      || document.digest !== row.digest
      || canonical.canonicalJson(document.envelope)
        !== canonical.canonicalJson(storedPayload)) {
    throw new ContextEnvelopeError(
      'CONTEXT_ENVELOPE_DIGEST_MISMATCH',
      `Context Envelope authority does not match its database record: ${id}`,
      { path: row.artifact_path },
    );
  }
  return {
    id: row.id,
    stage: row.stage,
    scope_type: row.scope_type,
    scope_id: row.scope_id,
    digest: row.digest,
    file_digest: row.file_digest,
    artifact_path: row.artifact_path,
    document,
  };
}

function persistEnvelope(db, input = {}, options = {}) {
  const full = buildEnvelope(db, { ...input, detail: 'full' }, options);
  const existing = db.prepare(
    'SELECT * FROM context_envelopes WHERE digest = ?',
  ).get(full.digest);
  if (existing) {
    readEnvelope(db, existing.id, options);
    return {
      id: existing.id,
      digest: existing.digest,
      artifact_path: existing.artifact_path,
      stage: existing.stage,
      scope_type: existing.scope_type,
      scope_id: existing.scope_id,
      file_digest: existing.file_digest,
    };
  }
  const scope = resolvedScope(db, input);
  const id = `context-${full.digest.slice(0, 24)}`;
  const artifactPath = contextArtifactPath(scope, id);
  const published = writeManagedJson(options.rootDir || process.cwd(), artifactPath, full);
  ops.tx(db, () => {
    db.prepare(
      `INSERT INTO context_envelopes
       (id, stage, scope_type, scope_id, digest, file_digest, payload_json, artifact_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.stage || 'project',
      scope.type,
      scope.id,
      full.digest,
      published.digest,
      JSON.stringify(full.envelope),
      artifactPath,
    );
    if (!artifactPath.startsWith('.ultra/.runtime/')) {
      artifactRegistry.recordArtifactInTx(db, {
        id: `artifact-${id}`,
        owner_type: scope.change ? 'change' : (scope.baseline ? 'baseline' : 'project'),
        owner_id: scope.change?.id || scope.baseline?.id || 'project',
        kind: 'context_envelope',
        path: artifactPath,
        content_digest: published.digest,
        source_refs: [
          ...(scope.change
            ? [{ type: 'change', id: scope.change.id, relation: 'compiled_from' }]
            : []),
          ...(scope.task
            ? [{ type: 'task', id: scope.task.id, relation: 'compiled_from_task_contract' }]
            : []),
          ...(scope.baseline && !scope.change
            ? [{ type: 'baseline', id: scope.baseline.id, relation: 'compiled_from' }]
            : []),
        ],
        consumer_refs: [{
          type: 'external',
          id: 'ultra-context-consumer',
          relation: 'consumed_by',
        }],
        provenance: {
          writer: 'context-envelope',
          envelope_digest: full.digest,
          stage: input.stage || 'project',
        },
        metadata: {
          envelope_id: id,
          semantic_digest: full.digest,
        },
      }, { rootDir: options.rootDir || process.cwd() });
    }
  });
  return {
    id,
    digest: full.digest,
    artifact_path: artifactPath,
    stage: input.stage || 'project',
    scope_type: scope.type,
    scope_id: scope.id,
    file_digest: published.digest,
  };
}

module.exports = {
  ContextEnvelopeError,
  SUMMARY_LIMIT,
  FULL_LIMIT,
  buildEnvelope,
  persistEnvelope,
  readEnvelope,
};
