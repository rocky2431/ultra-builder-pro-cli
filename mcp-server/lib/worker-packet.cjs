'use strict';

const Ajv = require('ajv');

const canonical = require('./canonical-json.cjs');
const contextEnvelope = require('./context-envelope.cjs');
const decisionRecords = require('./decision-records.cjs');
const { writeManagedJson } = require('./managed-file-write.cjs');
const ops = require('./state-ops.cjs');
const {
  normalizeProjectRelative,
  readStableProjectFile,
} = require('./safe-project-file.cjs');
const taskLedger = require('./task-ledger.cjs');

class WorkerPacketError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'WorkerPacketError';
    this.code = code;
    if (details) this.details = details;
  }
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new WorkerPacketError('VALIDATION_ERROR', `${field} is required`);
  return normalized;
}

function packetValueFromDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) return null;
  const { packet_digest: _packetDigest, ...value } = document;
  return value;
}

function readWorkerPacket(db, id, { rootDir = process.cwd() } = {}) {
  const row = db.prepare('SELECT * FROM worker_packets WHERE id = ?').get(id);
  if (!row) {
    throw new WorkerPacketError('WORKER_PACKET_NOT_FOUND', `Worker Packet not found: ${id}`);
  }
  const read = readStableProjectFile(rootDir, row.packet_path, { encoding: 'utf8' });
  if (!row.file_digest || read.digest !== row.file_digest) {
    throw new WorkerPacketError(
      'WORKER_PACKET_FILE_DRIFT',
      `Worker Packet bytes no longer match ${id}`,
      {
        path: row.packet_path,
        expected: row.file_digest || null,
        actual: read.digest,
      },
    );
  }
  let document;
  try {
    document = JSON.parse(read.text);
  } catch (cause) {
    throw new WorkerPacketError(
      'WORKER_PACKET_INVALID',
      `Worker Packet is not valid JSON: ${row.packet_path}`,
      { cause: cause.message },
    );
  }
  const computed = canonical.digest(packetValueFromDocument(document));
  if (document.packet_digest !== row.packet_digest || computed !== row.packet_digest) {
    throw new WorkerPacketError(
      'WORKER_PACKET_DIGEST_MISMATCH',
      `Worker Packet authority does not match its database record: ${id}`,
      {
        expected: row.packet_digest,
        document: document.packet_digest || null,
        computed,
      },
    );
  }
  contextEnvelope.readEnvelope(db, row.context_envelope_id, { rootDir });
  return {
    ...document,
    id: row.id,
    status: row.status,
    packet_path: row.packet_path,
    file_digest: row.file_digest,
    context_digest: row.context_digest,
    task_digest: row.task_digest,
    decision_digest: row.decision_digest,
    output_path: row.output_path,
  };
}

function markWorkerPacketAssigned(db, id) {
  return ops.tx(db, () => {
    const row = db.prepare('SELECT * FROM worker_packets WHERE id = ?').get(id);
    if (!row) {
      throw new WorkerPacketError('WORKER_PACKET_NOT_FOUND', `Worker Packet not found: ${id}`);
    }
    if (row.status === 'assigned') return row;
    if (row.status !== 'pending') {
      throw new WorkerPacketError(
        'WORKER_PACKET_STATUS_CONFLICT',
        `Worker Packet ${id} is ${row.status}`,
      );
    }
    db.prepare(
      `UPDATE worker_packets
       SET status = 'assigned',
           assigned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           abandoned_at = NULL,
           abandon_reason = NULL
       WHERE id = ? AND status = 'pending'`,
    ).run(id);
    ops.appendEventInTx(db, {
      type: 'worker_packet_assigned',
      task_id: row.scope_type === 'task' ? row.scope_id : null,
      payload: { packet_id: id, packet_digest: row.packet_digest },
    });
    return db.prepare('SELECT * FROM worker_packets WHERE id = ?').get(id);
  });
}

function abandonWorkerPacket(db, id, reason) {
  return ops.tx(db, () => {
    const row = db.prepare('SELECT * FROM worker_packets WHERE id = ?').get(id);
    if (!row || row.status === 'abandoned') return row || null;
    if (row.status !== 'pending') return row;
    db.prepare(
      `UPDATE worker_packets
       SET status = 'abandoned',
           abandoned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           abandon_reason = ?
       WHERE id = ? AND status = 'pending'`,
    ).run(String(reason || 'session acquisition failed'), id);
    ops.appendEventInTx(db, {
      type: 'worker_packet_abandoned',
      task_id: row.scope_type === 'task' ? row.scope_id : null,
      payload: {
        packet_id: id,
        packet_digest: row.packet_digest,
        reason: String(reason || 'session acquisition failed'),
      },
    });
    return db.prepare('SELECT * FROM worker_packets WHERE id = ?').get(id);
  });
}

function createWorkerPacket(db, input = {}, { rootDir = process.cwd() } = {}) {
  const role = requiredText(input.role, 'role');
  const taskId = requiredText(input.task_id, 'task_id');
  const task = ops.readTask(db, taskId);
  if (!task) throw new WorkerPacketError('TASK_NOT_FOUND', `task not found: ${taskId}`);
  if (!task.change_id) {
    throw new WorkerPacketError(
      'TASK_CHANGE_REQUIRED',
      `task ${taskId} must belong to an active Change`,
    );
  }
  const change = db.prepare(
    'SELECT id, artifact_root FROM changes WHERE id = ?',
  ).get(task.change_id);
  if (!change) {
    throw new WorkerPacketError('CHANGE_NOT_FOUND', `change not found: ${task.change_id}`);
  }
  for (const reference of task.context_refs || []) {
    if (!reference?.required || !reference.expected_digest) continue;
    const current = readStableProjectFile(rootDir, reference.ref, { encoding: null });
    if (current.digest !== reference.expected_digest) {
      throw new WorkerPacketError(
        'CONTEXT_REQUIRED_REF_STALE',
        `required Context reference changed after Plan acceptance: ${reference.ref}`,
        {
          ref: reference.ref,
          expected_digest: reference.expected_digest,
          actual_digest: current.digest,
        },
      );
    }
  }
  const context = contextEnvelope.persistEnvelope(db, {
    stage: role === 'review' ? 'review' : 'dev',
    scope: { change_id: task.change_id, task_id: taskId },
  }, { rootDir, runtime: input.runtime || 'unknown' });
  const durableTask = taskLedger.durableTask(task);
  const acceptedDecisions = [
    ...decisionRecords.listAcceptedDecisions(
      db,
      { change_id: task.change_id },
      { limit: 200, rootDir, validateFiles: true },
    ),
  ];
  const decisionDigest = canonical.digest(
    acceptedDecisions.map((decision) => ({
      id: decision.id,
      digest: decision.digest,
      status: decision.status,
    })),
  );
  const outputPath = normalizeProjectRelative(requiredText(input.output_path, 'output_path'));
  const packetValue = {
    packet_version: '1.0',
    role,
    runtime: input.runtime || 'unknown',
    scope: { change_id: task.change_id, task_id: taskId },
    context_envelope: {
      id: context.id,
      path: context.artifact_path,
      digest: context.digest,
    },
    accepted_decisions: acceptedDecisions.map((decision) => ({
      id: decision.id,
      selection: decision.selection,
      effects: decision.effects,
      artifact_path: decision.artifact_path,
      digest: decision.digest,
    })),
    git: {
      head: db.prepare(
        `SELECT repository_revision FROM baselines
         WHERE status <> 'superseded' ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
      ).get()?.repository_revision || null,
      diff_range: input.diff_range || null,
      changed_files: Array.isArray(input.changed_files) ? input.changed_files : [],
    },
    task: {
      id: task.id,
      title: task.title,
      outcome: task.outcome,
      acceptance: task.acceptance,
      verification_command: task.verification_command,
      digest: durableTask.digest,
    },
    evidence_refs: Array.isArray(input.evidence_refs) ? input.evidence_refs : [],
    output: {
      path: outputPath,
      schema: input.output_schema && typeof input.output_schema === 'object'
        ? input.output_schema
        : { type: 'object', required: ['packet_digest'] },
    },
  };
  const packetDigest = canonical.digest(packetValue);
  const packet = { ...packetValue, packet_digest: packetDigest };
  const id = `worker-${packetDigest.slice(0, 24)}`;
  const packetPath = `.ultra/.runtime/worker-packets/${id}.json`;
  const existing = db.prepare(
    'SELECT * FROM worker_packets WHERE packet_digest = ?',
  ).get(packetDigest);
  if (existing) {
    readWorkerPacket(db, existing.id, { rootDir });
    if (existing.status === 'abandoned') {
      db.prepare(
        `UPDATE worker_packets
         SET status = 'pending', assigned_at = NULL, abandoned_at = NULL,
             abandon_reason = NULL
         WHERE id = ? AND status = 'abandoned'`,
      ).run(existing.id);
    }
    return {
      ...packet,
      id: existing.id,
      packet_path: existing.packet_path,
      context_digest: existing.context_digest,
      task_digest: existing.task_digest,
      decision_digest: existing.decision_digest,
      status: existing.status === 'abandoned' ? 'pending' : existing.status,
      file_digest: existing.file_digest,
      created: false,
    };
  }
  const published = writeManagedJson(rootDir, packetPath, packet);
  ops.tx(db, () => {
    db.prepare(
      `INSERT INTO worker_packets
       (id, role, scope_type, scope_id, context_envelope_id, context_digest,
        task_digest, decision_digest, packet_digest, file_digest, status,
        packet_path, output_path)
       VALUES (?, ?, 'task', ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(
      id,
      role,
      taskId,
      context.id,
      context.digest,
      durableTask.digest,
      decisionDigest,
      packetDigest,
      published.digest,
      packetPath,
      outputPath,
    );
    ops.appendEventInTx(db, {
      type: 'worker_packet_created',
      change_id: task.change_id,
      task_id: taskId,
      payload: {
        packet_id: id,
        packet_digest: packetDigest,
        context_digest: context.digest,
        task_digest: durableTask.digest,
        output_path: outputPath,
      },
    });
  });
  return {
    ...packet,
    id,
    packet_path: packetPath,
    context_digest: context.digest,
    task_digest: durableTask.digest,
    decision_digest: decisionDigest,
    file_digest: published.digest,
    status: 'pending',
    created: true,
  };
}

function verifyWorkerResult(packet, result = {}) {
  if (!packet || typeof packet !== 'object') {
    throw new WorkerPacketError('VALIDATION_ERROR', 'packet is required');
  }
  if (result.packet_digest !== packet.packet_digest) {
    throw new WorkerPacketError(
      'WORKER_PACKET_DIGEST_MISMATCH',
      'worker result does not reference the exact assigned packet',
      {
        expected: packet.packet_digest,
        actual: result.packet_digest || null,
      },
    );
  }
  const schema = packet.output?.schema;
  if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
    let validate;
    try {
      validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
    } catch (cause) {
      throw new WorkerPacketError(
        'WORKER_OUTPUT_SCHEMA_INVALID',
        'worker packet contains an invalid output schema',
        { cause: cause.message },
      );
    }
    if (!validate(result)) {
      throw new WorkerPacketError(
        'WORKER_OUTPUT_INVALID',
        'worker result does not satisfy the assigned output schema',
        { errors: validate.errors || [] },
      );
    }
  }
  return true;
}

module.exports = {
  WorkerPacketError,
  createWorkerPacket,
  readWorkerPacket,
  markWorkerPacketAssigned,
  abandonWorkerPacket,
  verifyWorkerResult,
};
