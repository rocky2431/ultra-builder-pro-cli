'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const packets = require('./worker-packet.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-worker-packet-'));
  fs.mkdirSync(path.join(rootDir, '.ultra'), { recursive: true });
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  const { db } = initStateDb(dbPath);
  db.prepare(
    `INSERT INTO baselines
     (id, project_name, mode, status, repository_root)
     VALUES ('baseline-1', 'Worker fixture', 'greenfield', 'ready', '.')`,
  ).run();
  db.prepare(
    `INSERT INTO changes
     (id, title, kind, status, intent, artifact_root)
     VALUES ('change-1', 'Worker change', 'standard', 'active',
             'Generate one digest-bound handoff.', '.ultra/changes/active/change-1')`,
  ).run();
  db.prepare(
    `INSERT INTO tasks
     (id, title, type, priority, status, outcome, public_seam,
      verification_command, acceptance_json, context_refs_json,
      docs_impact_json, ownership_json, change_id)
     VALUES ('task-1', 'Execute packet', 'feature', 'P1', 'pending',
             'The worker consumes one immutable packet.', 'worker packet',
             'node --test mcp-server/lib/worker-packet.test.cjs', ?, ?,
             '{"status":"none","files":[],"rationale":"No docs"}',
             '{"owner":"worker","reviewers":[]}', 'change-1')`,
  ).run(
    JSON.stringify([{ id: 'ac-1', criterion: 'Packet is bound.', verification: 'node --test' }]),
    JSON.stringify([{ ref: '.ultra/specs/product.md', reason: 'Authority', required: true }]),
  );
  return { rootDir, db, close() { closeStateDb(db); fs.rmSync(rootDir, { recursive: true, force: true }); } };
}

test('worker packet binds the exact context, task, output, and role', () => {
  const fx = fixture();
  try {
    const packet = packets.createWorkerPacket(fx.db, {
      role: 'implement',
      task_id: 'task-1',
      runtime: 'codex',
      output_path: '.ultra/changes/active/change-1/review/worker-task-1.json',
      output_schema: { type: 'object', required: ['packet_digest', 'summary'] },
      evidence_refs: [{ ref: '.ultra/specs/product.md', kind: 'spec' }],
    }, { rootDir: fx.rootDir });

    assert.match(packet.packet_digest, /^[0-9a-f]{64}$/);
    assert.match(packet.context_digest, /^[0-9a-f]{64}$/);
    assert.match(packet.task_digest, /^[0-9a-f]{64}$/);
    assert.equal(packet.status, 'pending');
    assert.ok(fs.existsSync(path.join(fx.rootDir, packet.packet_path)));
    packets.markWorkerPacketAssigned(fx.db, packet.id);
    assert.equal(
      packets.readWorkerPacket(fx.db, packet.id, { rootDir: fx.rootDir }).status,
      'assigned',
    );
    assert.equal(
      packets.verifyWorkerResult(packet, {
        packet_digest: packet.packet_digest,
        summary: 'Implemented the bounded packet.',
      }),
      true,
    );
    assert.throws(
      () => packets.verifyWorkerResult(packet, { packet_digest: '0'.repeat(64) }),
      (error) => error.code === 'WORKER_PACKET_DIGEST_MISMATCH',
    );
  } finally {
    fx.close();
  }
});

test('Worker Packet bytes are immutable and failed assignment is explicitly abandoned', () => {
  const fx = fixture();
  try {
    const packet = packets.createWorkerPacket(fx.db, {
      role: 'implement',
      task_id: 'task-1',
      runtime: 'codex',
      output_path: '.ultra/changes/active/change-1/delivery/task-1.json',
    }, { rootDir: fx.rootDir });
    packets.abandonWorkerPacket(fx.db, packet.id, 'test admission failure');
    assert.equal(
      fx.db.prepare('SELECT status FROM worker_packets WHERE id = ?').get(packet.id).status,
      'abandoned',
    );

    const retried = packets.createWorkerPacket(fx.db, {
      role: 'implement',
      task_id: 'task-1',
      runtime: 'codex',
      output_path: '.ultra/changes/active/change-1/delivery/task-1.json',
    }, { rootDir: fx.rootDir });
    assert.equal(retried.id, packet.id);
    assert.equal(retried.status, 'pending');

    const file = path.join(fx.rootDir, retried.packet_path);
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    document.role = 'tampered';
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    assert.throws(
      () => packets.readWorkerPacket(fx.db, retried.id, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKER_PACKET_FILE_DRIFT',
    );
  } finally {
    fx.close();
  }
});
