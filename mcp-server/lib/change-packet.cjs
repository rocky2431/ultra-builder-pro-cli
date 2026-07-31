'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const Ajv = require('ajv/dist/2020');

const ops = require('./state-ops.cjs');
const artifacts = require('./artifact-registry.cjs');
const baselines = require('./baseline-workflow.cjs');
const deltaSchema = require('../../spec/schemas/change-delta.v1.schema.json');
const documentationSchema = require(
  '../../spec/schemas/documentation-reconciliation.v1.schema.json',
);

const ajv = new Ajv({ allErrors: true, strict: false });
const validateDeltaSchema = ajv.compile(deltaSchema);
const validateDocumentationSchema = ajv.compile(documentationSchema);
const ID = /^[a-zA-Z0-9_-]+$/;

class ChangePacketError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ChangePacketError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function digestBytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function digestFile(file) {
  return digestBytes(fs.readFileSync(file));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonical(value[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameValue(left, right) {
  return canonical(left) === canonical(right);
}

function safeFile(rootDir, relative) {
  const normalized = artifacts.normalizeRelativePath(relative);
  const root = path.resolve(rootDir);
  const file = path.resolve(root, normalized);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    throw new ChangePacketError('VALIDATION_ERROR', `path escapes project root: ${relative}`);
  }
  return { relative: normalized, file };
}

function requireInside(rootDir, relative, prefix, field) {
  const resolved = safeFile(rootDir, relative);
  const normalizedPrefix = artifacts.normalizeRelativePath(prefix);
  if (resolved.relative !== normalizedPrefix
    && !resolved.relative.startsWith(`${normalizedPrefix}/`)) {
    throw new ChangePacketError(
      'CHANGE_OVERLAY_PATH_INVALID',
      `${field} must stay inside ${normalizedPrefix}`,
    );
  }
  return resolved;
}

function deliveryConsumer() {
  return { type: 'external', id: 'ultra-deliver', relation: 'consumed_by' };
}

function readCurrentArtifact(db, changeId, kind) {
  const rows = db.prepare(
    `SELECT id FROM artifacts
     WHERE owner_type = 'change' AND owner_id = ? AND kind = ?
       AND status <> 'archived'
     ORDER BY updated_at DESC, rowid DESC`,
  ).all(changeId, kind);
  if (rows.length !== 1) return null;
  const artifact = artifacts.getArtifact(db, { id: rows[0].id });
  return artifact.status === 'current' ? artifact : null;
}

function exactBaselineAnchor(db, change, input) {
  const baseline = baselines.readBaseline(db);
  if (!baseline || baseline.status !== 'ready') {
    throw new ChangePacketError(
      'BASELINE_NOT_READY',
      'typed Change delta requires one approved ready baseline',
    );
  }
  const anchor = input.baseline_anchor;
  if (!anchor || anchor.baseline_id !== baseline.id
    || (anchor.repository_revision || null) !== (baseline.repository_revision || null)) {
    throw new ChangePacketError(
      'CHANGE_DELTA_BASELINE_CONFLICT',
      'delta baseline id or repository revision is stale',
      {
        expected_baseline_id: baseline.id,
        expected_repository_revision: baseline.repository_revision || null,
      },
    );
  }
  const expected = [...baseline.spec_refs]
    .map((item) => ({ path: artifacts.normalizeRelativePath(item.path), digest: item.digest }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const actual = [...(anchor.specs || [])]
    .map((item) => ({ path: artifacts.normalizeRelativePath(item.path), digest: item.digest }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (!sameValue(expected, actual)) {
    throw new ChangePacketError(
      'CHANGE_DELTA_BASELINE_CONFLICT',
      'delta specification anchors do not match the current baseline',
      { expected, actual },
    );
  }
  for (const spec of expected) {
    const resolved = safeFile(input.root_dir, spec.path);
    if (!fs.existsSync(resolved.file) || digestFile(resolved.file) !== spec.digest) {
      throw new ChangePacketError(
        'CHANGE_DELTA_BASELINE_CONFLICT',
        `baseline specification bytes are stale: ${spec.path}`,
      );
    }
  }
  return baseline;
}

function normalizeDelta(db, change, input, rootDir) {
  const candidate = {
    $schema: 'ultra-change-delta-v1',
    change_id: change.id,
    baseline_anchor: input.baseline_anchor,
    decisions: input.decisions || [],
    non_goals: input.non_goals || [],
    acceptance: input.acceptance || [],
    documentation_impact: input.documentation_impact,
    unknowns: input.unknowns || [],
    ...(input.no_semantic_change_reason === undefined
      ? {}
      : { no_semantic_change_reason: input.no_semantic_change_reason }),
    mutations: input.mutations || [],
  };
  if (!validateDeltaSchema(candidate)) {
    throw new ChangePacketError(
      'CHANGE_DELTA_INVALID',
      `change delta does not satisfy its schema: ${ajv.errorsText(validateDeltaSchema.errors)}`,
      validateDeltaSchema.errors,
    );
  }
  const baseline = exactBaselineAnchor(db, change, {
    ...candidate,
    root_dir: rootDir,
  });
  if (!sameValue(candidate.non_goals, change.contract.non_goals)
    || !sameValue(candidate.acceptance, change.contract.acceptance)
    || !sameValue(candidate.documentation_impact, change.docs_impact)) {
    throw new ChangePacketError(
      'CHANGE_DELTA_CONTRACT_MISMATCH',
      'delta non-goals, acceptance, and documentation impact must match accepted Change authority',
    );
  }
  const acceptanceIds = new Set(change.contract.acceptance.map((item) => item.id));
  const documentationPaths = new Set(change.docs_impact.files || []);
  const mutationIds = new Set();
  const targetPaths = new Set();
  const overlayRoot = `${change.artifact_root}/delta`;
  const normalizedMutations = candidate.mutations.map((mutation) => {
    if (!ID.test(mutation.id) || mutationIds.has(mutation.id)) {
      throw new ChangePacketError(
        'CHANGE_DELTA_INVALID', `duplicate or invalid mutation id: ${mutation.id}`,
      );
    }
    mutationIds.add(mutation.id);
    const target = safeFile(rootDir, mutation.target_path);
    if (targetPaths.has(target.relative)) {
      throw new ChangePacketError(
        'CHANGE_DELTA_INVALID', `duplicate mutation target: ${target.relative}`,
      );
    }
    targetPaths.add(target.relative);
    const overlay = requireInside(
      rootDir, mutation.overlay_path, overlayRoot, 'mutations.overlay_path',
    );
    if (!fs.existsSync(overlay.file) || !fs.statSync(overlay.file).isFile()) {
      throw new ChangePacketError(
        'CHANGE_DELTA_PAYLOAD_MISSING', `delta overlay file is missing: ${overlay.relative}`,
      );
    }
    const actualAfter = digestFile(overlay.file);
    if (actualAfter !== mutation.after_digest) {
      throw new ChangePacketError(
        'CHANGE_DELTA_PAYLOAD_STALE',
        `delta overlay digest is stale: ${overlay.relative}`,
      );
    }
    const targetExists = fs.existsSync(target.file);
    const actualBefore = targetExists ? digestFile(target.file) : null;
    if ((mutation.action === 'add' && (targetExists || mutation.before_digest !== null))
      || (mutation.action === 'update'
        && (!targetExists || mutation.before_digest !== actualBefore))) {
      throw new ChangePacketError(
        'CHANGE_DELTA_BASELINE_CONFLICT',
        `delta before-state is stale: ${target.relative}`,
        { expected: mutation.before_digest, actual: actualBefore },
      );
    }
    const baselineRef = baseline.spec_refs.find((item) => (
      artifacts.normalizeRelativePath(item.path) === target.relative
    ));
    if (mutation.action === 'update'
      && (!baselineRef || baselineRef.digest !== mutation.before_digest)) {
      throw new ChangePacketError(
        'CHANGE_DELTA_BASELINE_CONFLICT',
        `delta target is not anchored by the current baseline: ${target.relative}`,
      );
    }
    if (mutation.acceptance_refs.some((id) => !acceptanceIds.has(id))) {
      throw new ChangePacketError(
        'CHANGE_DELTA_ACCEPTANCE_INVALID',
        `delta mutation ${mutation.id} references unknown acceptance`,
      );
    }
    if (mutation.documentation_refs.some((item) => !documentationPaths.has(item))) {
      throw new ChangePacketError(
        'CHANGE_DELTA_DOCUMENTATION_INVALID',
        `delta mutation ${mutation.id} references undeclared documentation`,
      );
    }
    return {
      ...mutation,
      target_path: target.relative,
      overlay_path: overlay.relative,
    };
  });
  const documented = new Set(normalizedMutations.flatMap((item) => item.documentation_refs));
  if ([...documentationPaths].some((item) => !documented.has(item))) {
    throw new ChangePacketError(
      'CHANGE_DELTA_DOCUMENTATION_INVALID',
      'every required documentation path must be traced from at least one mutation',
    );
  }
  return {
    ...candidate,
    baseline_anchor: {
      ...candidate.baseline_anchor,
      specs: [...candidate.baseline_anchor.specs]
        .sort((left, right) => left.path.localeCompare(right.path)),
    },
    decisions: [...candidate.decisions].sort((left, right) => left.id.localeCompare(right.id)),
    non_goals: [...candidate.non_goals].sort(),
    acceptance: [...candidate.acceptance].sort((left, right) => left.id.localeCompare(right.id)),
    unknowns: [...candidate.unknowns].sort((left, right) => left.id.localeCompare(right.id)),
    mutations: normalizedMutations.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function atomicWrite(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const previous = fs.existsSync(file) ? fs.readFileSync(file) : null;
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, file);
  return () => {
    if (previous === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, previous);
  };
}

function renderProgress(change, { delta = null, reconciliation = null } = {}) {
  return [
    `# Progress: ${change.title}`,
    '',
    `Change: \`${change.id}\``,
    `Status: \`${change.status}\``,
    `Delta: ${delta ? `\`${delta.id}\` @ \`${delta.digest}\`` : 'not recorded'}`,
    `Documentation reconciliation: ${reconciliation
      ? `\`${reconciliation.id}\` @ \`${reconciliation.digest}\``
      : 'not recorded'}`,
    '',
    'This file is a deterministic projection of registered Change authorities.',
    '',
  ].join('\n');
}

function writeProgressInTx(db, change, rootDir, { delta = null, reconciliation = null } = {}) {
  const relative = `${change.artifact_root}/progress.md`;
  const resolved = safeFile(rootDir, relative);
  const rollback = atomicWrite(
    resolved.file,
    renderProgress(change, { delta, reconciliation }),
  );
  try {
    const sources = [
      { type: 'change', id: change.id, relation: 'projected_from' },
      ...(delta ? [{ type: 'artifact', id: delta.id, relation: 'projected_from' }] : []),
      ...(reconciliation
        ? [{ type: 'artifact', id: reconciliation.id, relation: 'projected_from' }]
        : []),
    ];
    const result = artifacts.recordArtifactInTx(db, {
      id: `change-${change.id}-progress`,
      owner_type: 'change',
      owner_id: change.id,
      kind: 'progress_projection',
      path: relative,
      source_refs: sources,
      consumer_refs: [],
      provenance: { writer: 'change-packet', generated: true },
      metadata: { projection: true, terminal_role: true },
    }, { rootDir });
    return { result, rollback };
  } catch (error) {
    rollback();
    throw error;
  }
}

function recordDelta(db, change, input, { rootDir = process.cwd() } = {}) {
  if (!change || !['active', 'blocked'].includes(change.status)) {
    throw new ChangePacketError(
      'CHANGE_NOT_MUTABLE',
      `change ${change?.id || '(missing)'} cannot accept delta authority`,
    );
  }
  const delta = normalizeDelta(db, change, input, rootDir);
  const relative = `${change.artifact_root}/delta/change-delta.json`;
  const resolved = safeFile(rootDir, relative);
  const serialized = `${JSON.stringify(delta, null, 2)}\n`;
  const rollbackDelta = atomicWrite(resolved.file, serialized);
  let rollbackProgress = null;
  try {
    const result = ops.tx(db, () => {
      const consumer = deliveryConsumer();
      const payloads = delta.mutations.map((mutation) => (
        artifacts.recordArtifactInTx(db, {
          id: `change-${change.id}-delta-${mutation.id}`,
          owner_type: 'change',
          owner_id: change.id,
          kind: 'delta_payload',
          path: mutation.overlay_path,
          content_digest: mutation.after_digest,
          source_refs: [{ type: 'change', id: change.id, relation: 'proposed_by' }],
          consumer_refs: [consumer],
          provenance: { writer: 'change.delta', mutation_id: mutation.id },
          metadata: {
            target_path: mutation.target_path,
            action: mutation.action,
            before_digest: mutation.before_digest,
            after_digest: mutation.after_digest,
          },
        }, { rootDir }).artifact
      ));
      const recorded = artifacts.recordArtifactInTx(db, {
        id: `change-${change.id}-delta`,
        owner_type: 'change',
        owner_id: change.id,
        kind: 'change_delta',
        path: relative,
        content_digest: digestBytes(serialized),
        source_refs: [
          { type: 'change', id: change.id, relation: 'normalized_from' },
          {
            type: 'baseline',
            id: delta.baseline_anchor.baseline_id,
            relation: 'deltas_from',
          },
          ...payloads.map((artifact) => ({
            type: 'artifact', id: artifact.id, relation: 'contains_payload',
          })),
        ],
        consumer_refs: [consumer],
        provenance: {
          writer: 'change.delta',
          recorded_at: nowIso(),
          baseline_revision: delta.baseline_anchor.repository_revision,
        },
        metadata: {
          mutation_ids: delta.mutations.map((item) => item.id),
          acceptance_ids: delta.acceptance.map((item) => item.id),
        },
      }, { rootDir });
      const progress = writeProgressInTx(
        db,
        change,
        rootDir,
        { delta: recorded.artifact },
      );
      rollbackProgress = progress.rollback;
      ops.appendEventInTx(db, {
        type: 'change_delta_recorded',
        change_id: change.id,
        payload: {
          artifact_id: recorded.artifact.id,
          digest: recorded.artifact.digest,
          mutation_ids: delta.mutations.map((item) => item.id),
        },
      });
      return {
        delta,
        artifact: recorded.artifact,
        payload_artifacts: payloads,
        progress_artifact: progress.result.artifact,
      };
    });
    return result;
  } catch (error) {
    if (rollbackProgress) rollbackProgress();
    rollbackDelta();
    throw error;
  }
}

function normalizeDocumentation(db, change, input, rootDir) {
  const candidate = {
    $schema: 'ultra-documentation-reconciliation-v1',
    change_id: change.id,
    delta_artifact_id: input.delta_artifact_id,
    delta_digest: input.delta_digest,
    ...(input.no_change_reason === undefined
      ? {}
      : { no_change_reason: input.no_change_reason }),
    documents: input.documents || [],
  };
  if (!validateDocumentationSchema(candidate)) {
    throw new ChangePacketError(
      'DOCUMENTATION_RECONCILIATION_INVALID',
      `documentation reconciliation does not satisfy its schema: ${ajv.errorsText(validateDocumentationSchema.errors)}`,
      validateDocumentationSchema.errors,
    );
  }
  const deltaArtifact = artifacts.getArtifact(db, { id: candidate.delta_artifact_id });
  if (deltaArtifact.owner_type !== 'change' || deltaArtifact.owner_id !== change.id
    || deltaArtifact.kind !== 'change_delta' || deltaArtifact.status !== 'current'
    || deltaArtifact.digest !== candidate.delta_digest) {
    throw new ChangePacketError(
      'DOCUMENTATION_DELTA_AUTHORITY_INVALID',
      'documentation reconciliation must bind the current Change delta digest',
    );
  }
  const deltaFile = safeFile(rootDir, deltaArtifact.path);
  if (!fs.existsSync(deltaFile.file) || digestFile(deltaFile.file) !== deltaArtifact.digest) {
    throw new ChangePacketError(
      'DOCUMENTATION_DELTA_AUTHORITY_INVALID',
      'documentation reconciliation delta bytes are stale',
    );
  }
  const delta = JSON.parse(fs.readFileSync(deltaFile.file, 'utf8'));
  const deltaIds = new Set(delta.mutations.map((item) => item.id));
  const acceptanceIds = new Set(delta.acceptance.map((item) => item.id));
  const requiredPaths = new Set(change.docs_impact.status === 'required'
    ? change.docs_impact.files
    : []);
  const actualPaths = new Set();
  const documentationRoot = `${change.artifact_root}/documentation`;
  const documents = candidate.documents.map((document) => {
    if (actualPaths.has(document.path)) {
      throw new ChangePacketError(
        'DOCUMENTATION_RECONCILIATION_INVALID',
        `duplicate documentation path: ${document.path}`,
      );
    }
    const target = safeFile(rootDir, document.path);
    actualPaths.add(target.relative);
    const overlay = requireInside(
      rootDir, document.overlay_path, documentationRoot, 'documents.overlay_path',
    );
    if (!fs.existsSync(overlay.file) || !fs.statSync(overlay.file).isFile()
      || digestFile(overlay.file) !== document.after_digest) {
      throw new ChangePacketError(
        'DOCUMENTATION_EVIDENCE_STALE',
        `documentation overlay is missing or stale: ${overlay.relative}`,
      );
    }
    const targetExists = fs.existsSync(target.file);
    const actualBefore = targetExists ? digestFile(target.file) : null;
    if ((document.action === 'add' && (targetExists || document.before_digest !== null))
      || (document.action === 'update'
        && (!targetExists || actualBefore !== document.before_digest))) {
      throw new ChangePacketError(
        'DOCUMENTATION_BASELINE_CONFLICT',
        `documentation before-state is stale: ${target.relative}`,
      );
    }
    if (document.delta_refs.some((id) => !deltaIds.has(id))
      || document.acceptance_refs.some((id) => !acceptanceIds.has(id))) {
      throw new ChangePacketError(
        'DOCUMENTATION_TRACE_INVALID',
        `documentation trace references are invalid: ${target.relative}`,
      );
    }
    if (document.consumers.length === 0
      && String(document.no_consumer_reason || '').trim().length < 3) {
      throw new ChangePacketError(
        'DOCUMENTATION_ORPHAN_UNRESOLVED',
        `documentation path has no verified consumer: ${target.relative}`,
      );
    }
    return {
      ...document,
      path: target.relative,
      overlay_path: overlay.relative,
    };
  });
  if (!sameValue([...requiredPaths].sort(), [...actualPaths].sort())) {
    throw new ChangePacketError(
      'DOCUMENTATION_RECONCILIATION_INCOMPLETE',
      'documentation reconciliation must cover the exact declared documentation impact',
      { required: [...requiredPaths].sort(), actual: [...actualPaths].sort() },
    );
  }
  return {
    reconciliation: {
      ...candidate,
      documents: documents.sort((left, right) => left.path.localeCompare(right.path)),
    },
    deltaArtifact,
  };
}

function recordDocumentationReconciliation(
  db,
  change,
  input,
  { rootDir = process.cwd() } = {},
) {
  if (!change || !['active', 'blocked'].includes(change.status)) {
    throw new ChangePacketError(
      'CHANGE_NOT_MUTABLE',
      `change ${change?.id || '(missing)'} cannot accept documentation reconciliation`,
    );
  }
  const normalized = normalizeDocumentation(db, change, input, rootDir);
  const relative = `${change.artifact_root}/documentation/reconciliation.json`;
  const resolved = safeFile(rootDir, relative);
  const serialized = `${JSON.stringify(normalized.reconciliation, null, 2)}\n`;
  const rollbackReconciliation = atomicWrite(resolved.file, serialized);
  let rollbackProgress = null;
  try {
    return ops.tx(db, () => {
      const fallbackConsumer = deliveryConsumer();
      const payloads = normalized.reconciliation.documents.map((document, index) => (
        artifacts.recordArtifactInTx(db, {
          id: `change-${change.id}-documentation-${index + 1}`,
          owner_type: 'change',
          owner_id: change.id,
          kind: 'documentation_payload',
          path: document.overlay_path,
          content_digest: document.after_digest,
          source_refs: [{
            type: 'artifact',
            id: normalized.deltaArtifact.id,
            relation: 'documents',
          }],
          consumer_refs: document.consumers.length > 0
            ? document.consumers
            : [fallbackConsumer],
          provenance: { writer: 'change.documentation_reconcile', target_path: document.path },
          metadata: {
            target_path: document.path,
            action: document.action,
            before_digest: document.before_digest,
            after_digest: document.after_digest,
            orphan_disposition: document.consumers.length > 0
              ? 'consumers_verified'
              : 'no_consumer_reason',
          },
        }, { rootDir }).artifact
      ));
      const recorded = artifacts.recordArtifactInTx(db, {
        id: `change-${change.id}-documentation-reconciliation`,
        owner_type: 'change',
        owner_id: change.id,
        kind: 'documentation_reconciliation',
        path: relative,
        content_digest: digestBytes(serialized),
        source_refs: [
          {
            type: 'artifact',
            id: normalized.deltaArtifact.id,
            relation: 'reconciles',
          },
          ...payloads.map((artifact) => ({
            type: 'artifact', id: artifact.id, relation: 'contains_document',
          })),
        ],
        consumer_refs: [fallbackConsumer],
        provenance: { writer: 'change.documentation_reconcile', recorded_at: nowIso() },
        metadata: {
          document_paths: normalized.reconciliation.documents.map((item) => item.path),
          orphan_check: 'pass',
        },
      }, { rootDir });
      const progress = writeProgressInTx(db, change, rootDir, {
        delta: normalized.deltaArtifact,
        reconciliation: recorded.artifact,
      });
      rollbackProgress = progress.rollback;
      ops.appendEventInTx(db, {
        type: 'documentation_reconciliation_recorded',
        change_id: change.id,
        payload: {
          artifact_id: recorded.artifact.id,
          digest: recorded.artifact.digest,
          document_paths: normalized.reconciliation.documents.map((item) => item.path),
        },
      });
      return {
        reconciliation: normalized.reconciliation,
        artifact: recorded.artifact,
        payload_artifacts: payloads,
        progress_artifact: progress.result.artifact,
      };
    });
  } catch (error) {
    if (rollbackProgress) rollbackProgress();
    rollbackReconciliation();
    throw error;
  }
}

function readDeltaAuthority(db, changeId) {
  return readCurrentArtifact(db, changeId, 'change_delta');
}

function readDocumentationAuthority(db, changeId) {
  return readCurrentArtifact(db, changeId, 'documentation_reconciliation');
}

function readAuthorityJson(db, changeId, kind, schema, rootDir) {
  const artifact = readCurrentArtifact(db, changeId, kind);
  if (!artifact) {
    throw new ChangePacketError(
      kind === 'change_delta'
        ? 'CHANGE_DELTA_AUTHORITY_MISSING'
        : 'DOCUMENTATION_RECONCILIATION_MISSING',
      `change ${changeId} requires one current ${kind} authority`,
    );
  }
  const resolved = safeFile(rootDir, artifact.path);
  if (!fs.existsSync(resolved.file) || !fs.statSync(resolved.file).isFile()
    || digestFile(resolved.file) !== artifact.digest) {
    throw new ChangePacketError(
      kind === 'change_delta'
        ? 'CHANGE_DELTA_AUTHORITY_STALE'
        : 'DOCUMENTATION_RECONCILIATION_STALE',
      `${kind} bytes do not match registered authority`,
    );
  }
  let value;
  try { value = JSON.parse(fs.readFileSync(resolved.file, 'utf8')); }
  catch (error) {
    throw new ChangePacketError(
      kind === 'change_delta'
        ? 'CHANGE_DELTA_INVALID'
        : 'DOCUMENTATION_RECONCILIATION_INVALID',
      `${kind} is not valid JSON: ${error.message}`,
    );
  }
  const validator = schema === 'delta' ? validateDeltaSchema : validateDocumentationSchema;
  if (!validator(value)) {
    throw new ChangePacketError(
      schema === 'delta'
        ? 'CHANGE_DELTA_INVALID'
        : 'DOCUMENTATION_RECONCILIATION_INVALID',
      `${kind} no longer satisfies its schema: ${ajv.errorsText(validator.errors)}`,
      validator.errors,
    );
  }
  if (value.change_id !== changeId) {
    throw new ChangePacketError(
      'CHANGE_PACKET_AUTHORITY_MISMATCH',
      `${kind} belongs to ${value.change_id}, not ${changeId}`,
    );
  }
  return { artifact, value };
}

function loadDelta(db, changeId, { rootDir = process.cwd() } = {}) {
  return readAuthorityJson(db, changeId, 'change_delta', 'delta', rootDir);
}

function loadDocumentationReconciliation(
  db,
  changeId,
  { rootDir = process.cwd() } = {},
) {
  return readAuthorityJson(
    db,
    changeId,
    'documentation_reconciliation',
    'documentation',
    rootDir,
  );
}

function deliveryEntries(db, change, { rootDir = process.cwd() } = {}) {
  const delta = loadDelta(db, change.id, { rootDir });
  const documentation = loadDocumentationReconciliation(db, change.id, { rootDir });
  if (
    documentation.value.delta_artifact_id !== delta.artifact.id
    || documentation.value.delta_digest !== delta.artifact.digest
  ) {
    throw new ChangePacketError(
      'DOCUMENTATION_DELTA_AUTHORITY_INVALID',
      'documentation reconciliation is not bound to the current Change delta',
    );
  }
  const entries = [
    ...delta.value.mutations.map((item) => ({
      kind: 'baseline_specification',
      id: item.id,
      target_path: item.target_path,
      overlay_path: item.overlay_path,
      action: item.action,
      before_digest: item.before_digest,
      after_digest: item.after_digest,
    })),
    ...documentation.value.documents.map((item, index) => ({
      kind: 'documentation',
      id: `documentation-${index + 1}`,
      target_path: item.path,
      overlay_path: item.overlay_path,
      action: item.action,
      before_digest: item.before_digest,
      after_digest: item.after_digest,
    })),
  ];
  const targets = new Set();
  for (const entry of entries) {
    if (targets.has(entry.target_path)) {
      throw new ChangePacketError(
        'CHANGE_PACKET_TARGET_CONFLICT',
        `multiple delivery entries target ${entry.target_path}`,
      );
    }
    targets.add(entry.target_path);
    const target = safeFile(rootDir, entry.target_path);
    const overlay = safeFile(rootDir, entry.overlay_path);
    const actualBefore = fs.existsSync(target.file) ? digestFile(target.file) : null;
    const actualAfter = fs.existsSync(overlay.file) ? digestFile(overlay.file) : null;
    if (actualBefore !== entry.before_digest) {
      throw new ChangePacketError(
        entry.kind === 'documentation'
          ? 'DOCUMENTATION_BASELINE_CONFLICT'
          : 'CHANGE_DELTA_BASELINE_CONFLICT',
        `delivery before-state changed: ${entry.target_path}`,
        { expected: entry.before_digest, actual: actualBefore },
      );
    }
    if (actualAfter !== entry.after_digest) {
      throw new ChangePacketError(
        entry.kind === 'documentation'
          ? 'DOCUMENTATION_EVIDENCE_STALE'
          : 'CHANGE_DELTA_PAYLOAD_STALE',
        `delivery overlay changed: ${entry.overlay_path}`,
        { expected: entry.after_digest, actual: actualAfter },
      );
    }
  }
  return {
    delta,
    documentation,
    entries,
    baseline_updates: delta.value.mutations.map((item) => item.target_path),
  };
}

module.exports = {
  ChangePacketError,
  recordDelta,
  recordDocumentationReconciliation,
  readDeltaAuthority,
  readDocumentationAuthority,
  loadDelta,
  loadDocumentationReconciliation,
  deliveryEntries,
};
