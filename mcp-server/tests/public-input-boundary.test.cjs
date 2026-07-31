'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const taskLedger = require('../lib/task-ledger.cjs');
const { seedReadyBaseline } = require('../test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'mcp-server', 'server.cjs');

function fixture({ readyBaseline = true } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-public-input-boundary-'));
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  const { db } = initStateDb(dbPath);
  if (readyBaseline) seedReadyBaseline(db, { rootDir });
  closeStateDb(db);
  return { rootDir, dbPath };
}

function cleanup(fx) {
  fs.rmSync(fx.rootDir, { recursive: true, force: true });
}

function readState(fx, read) {
  const { db } = initStateDb(fx.dbPath);
  try {
    return read(db);
  } finally {
    closeStateDb(db);
  }
}

function count(db, table, where = '1 = 1', bindings = []) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`)
    .get(...bindings).count;
}

function validTaskData(id, overrides = {}) {
  return {
    id,
    title: `Validate ${id}`,
    type: 'feature',
    priority: 'P1',
    ...overrides,
  };
}

function validChangeData(id, overrides = {}) {
  return completeChangeInput({
    id,
    title: `Validate ${id}`,
    kind: 'standard',
    intent: `Exercise the public input boundary for ${id}.`,
    ...overrides,
  });
}

function decisionData(id, baselineId, overrides = {}) {
  return {
    id,
    scope: { baseline_id: baselineId },
    question: `What must ${id} decide?`,
    recommendation: `Reject malformed authority for ${id}.`,
    selection: `Keep ${id} typed.`,
    owner: 'public-input-boundary-test',
    source: 'public-input-boundary-test',
    ...overrides,
  };
}

function writeFixtureFile(fx, relative, content = 'public input boundary\n') {
  const file = path.join(fx.rootDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

async function withClient(fx, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: {
      ...process.env,
      UBP_ROOT_DIR: fx.rootDir,
      UBP_DB_PATH: fx.dbPath,
    },
    stderr: 'pipe',
  });
  const client = new Client(
    { name: 'ubp-public-input-boundary-test', version: '0.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function callRecord(fx, entries) {
  return withClient(fx, (client) => client.callTool({
    name: 'ultra.record',
    arguments: { entries },
  }));
}

function assertRecordAccepted(result) {
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  assert.equal(
    result.structuredContent?.accepted,
    true,
    JSON.stringify(result.structuredContent, null, 2),
  );
}

function assertValidationRejected(result, expectedEntries = 1) {
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  assert.equal(
    result.structuredContent?.accepted,
    false,
    JSON.stringify(result.structuredContent, null, 2),
  );
  assert.equal(result.structuredContent.results.length, expectedEntries);
  for (const item of result.structuredContent.results) {
    assert.equal(item.accepted, false, JSON.stringify(item, null, 2));
    assert.deepEqual(
      item.diagnostics.map((diagnostic) => diagnostic.code),
      ['VALIDATION_ERROR'],
      JSON.stringify(item, null, 2),
    );
  }
}

function latestRejectedAttempt(fx) {
  return readState(fx, (db) => {
    const row = db.prepare(
      `SELECT payload_json FROM events
       WHERE type = 'ultra_kernel_attempt'
       ORDER BY id DESC LIMIT 1`,
    ).get();
    return row ? JSON.parse(row.payload_json) : null;
  });
}

test('baseline start rejects scalar identifiers and text fields before SQLite affinity can coerce them', async () => {
  const fx = fixture({ readyBaseline: false });
  const cases = [
    ['id', 123],
    ['project_name', 42],
    ['project_type', 42],
    ['stack', 5],
    ['repository_revision', 77],
    ['replace_migrated', 'true'],
    ['replace_ready', 'true'],
  ];
  try {
    for (const [field, value] of cases) {
      const result = await callRecord(fx, [{
        kind: 'baseline',
        action: 'start',
        data: {
          id: 'boundary-baseline-start-scalars',
          project_name: 'Boundary baseline',
          mode: 'greenfield',
          [field]: value,
        },
        idempotency_key: `boundary-baseline-start-${field}`,
      }]);
      assertValidationRejected(result);
      assert.equal(readState(fx, (db) => count(db, 'baselines')), 0);
    }
  } finally {
    cleanup(fx);
  }
});

test('baseline observe rejects a string blocking flag without rewriting it to false', async () => {
  const fx = fixture({ readyBaseline: false });
  const start = {
    kind: 'baseline',
    action: 'start',
    data: {
      id: 'boundary-observe-baseline',
      project_name: 'Boundary observe baseline',
      mode: 'greenfield',
    },
    idempotency_key: 'boundary-observe-baseline-start',
  };
  const observe = {
    kind: 'baseline',
    action: 'observe',
    data: {
      id: 'boundary-observe-baseline',
      unknowns: [{
        summary: 'The blocking flag must remain typed.',
        blocking: 'true',
      }],
    },
    idempotency_key: 'boundary-observe-baseline-invalid-blocking',
  };
  try {
    assertRecordAccepted(await callRecord(fx, [start]));
    const result = await callRecord(fx, [observe]);
    assertValidationRejected(result);
    assert.deepEqual(
      readState(fx, (db) => JSON.parse(
        db.prepare(
          "SELECT unknowns_json FROM baselines WHERE id = 'boundary-observe-baseline'",
        ).get().unknowns_json,
      )),
      [],
    );
  } finally {
    cleanup(fx);
  }
});

test('baseline accept rejects scalar approver and approval note without converging authority', async () => {
  const fx = fixture();
  let baseline;
  try {
    baseline = readState(fx, (db) => {
      const current = db.prepare(
        "SELECT id, repository_revision FROM baselines WHERE status = 'ready'",
      ).get();
      db.prepare(
        `UPDATE baselines
         SET status = 'draft', approved_by = NULL, approval_note = NULL,
             converged_at = NULL
         WHERE id = ?`,
      ).run(current.id);
      taskLedger.publishTaskLedger(db, {
        rootDir: fx.rootDir,
        reason: 'public_input_boundary_baseline_accept_fixture',
      });
      return current;
    });
    for (const [field, value] of [['approved_by', true], ['approval_note', 99]]) {
      const result = await callRecord(fx, [{
        kind: 'baseline',
        action: 'accept',
        data: {
          id: baseline.id,
          expected_revision: baseline.repository_revision,
          approved_by: 'boundary-owner',
          approval_note: 'Boundary approval note.',
          [field]: value,
        },
        idempotency_key: `boundary-baseline-accept-${field}`,
      }]);
      assertValidationRejected(result);
    }
    assert.deepEqual(
      readState(fx, (db) => db.prepare(
        'SELECT status, approved_by, approval_note FROM baselines WHERE id = ?',
      ).get(baseline.id)),
      { status: 'draft', approved_by: null, approval_note: null },
    );
  } finally {
    cleanup(fx);
  }
});

test('change revise rejects a numeric title without string coercion', async () => {
  const fx = fixture();
  const changeId = 'boundary-change-numeric-title';
  try {
    assertRecordAccepted(await callRecord(fx, [{
      kind: 'change_contract',
      action: 'open',
      data: validChangeData(changeId),
      idempotency_key: `${changeId}:open`,
    }]));
    const before = readState(
      fx,
      (db) => db.prepare('SELECT title FROM changes WHERE id = ?').get(changeId).title,
    );
    const result = await callRecord(fx, [{
      kind: 'change_contract',
      action: 'revise',
      data: { id: changeId, patch: { title: 123 } },
      idempotency_key: `${changeId}:numeric-title`,
    }]);
    assertValidationRejected(result);
    assert.equal(
      readState(
        fx,
        (db) => db.prepare('SELECT title FROM changes WHERE id = ?').get(changeId).title,
      ),
      before,
    );
  } finally {
    cleanup(fx);
  }
});

test('change revise rejects a false patch instead of accepting an empty no-op', async () => {
  const fx = fixture();
  const changeId = 'boundary-change-false-patch';
  try {
    assertRecordAccepted(await callRecord(fx, [{
      kind: 'change_contract',
      action: 'open',
      data: validChangeData(changeId),
      idempotency_key: `${changeId}:open`,
    }]));
    const result = await callRecord(fx, [{
      kind: 'change_contract',
      action: 'revise',
      data: { id: changeId, patch: false },
      idempotency_key: `${changeId}:false-patch`,
    }]);
    assertValidationRejected(result);
  } finally {
    cleanup(fx);
  }
});

test('change open rejects scalar docs impact and string unresolved-decision blocking flags', async () => {
  const fx = fixture();
  const docsImpactId = 'boundary-change-docs-impact';
  const blockingId = 'boundary-change-blocking-decision';
  const blocking = validChangeData(blockingId);
  blocking.contract = {
    ...blocking.contract,
    unresolved_decisions: [{
      id: 'boundary-decision',
      summary: 'This decision remains blocking until resolved.',
      blocking: 'true',
    }],
  };
  const entries = [
    {
      kind: 'change_contract',
      action: 'open',
      data: validChangeData(docsImpactId, { docs_impact: 7 }),
      idempotency_key: `${docsImpactId}:open`,
    },
    {
      kind: 'change_contract',
      action: 'open',
      data: blocking,
      idempotency_key: `${blockingId}:open`,
    },
  ];
  try {
    const result = await callRecord(fx, entries);
    assertValidationRejected(result, entries.length);
    assert.equal(
      readState(
        fx,
        (db) => count(db, 'changes', 'id IN (?, ?)', [docsImpactId, blockingId]),
      ),
      0,
    );
  } finally {
    cleanup(fx);
  }
});

test('change receipt failure removes newly published intent bytes with rolled-back authority', async () => {
  const fx = fixture();
  const changeId = 'boundary-change-receipt-failure';
  const intentFile = path.join(
    fx.rootDir,
    '.ultra',
    'changes',
    'active',
    changeId,
    'intent.md',
  );
  try {
    readState(fx, (db) => db.exec(`
      CREATE TRIGGER reject_boundary_change_receipt
      BEFORE INSERT ON events
      WHEN NEW.type = 'ultra_kernel_call'
      BEGIN
        SELECT RAISE(ABORT, 'forced receipt failure');
      END;
    `));
    const result = await callRecord(fx, [{
      kind: 'change_contract',
      action: 'open',
      data: validChangeData(changeId),
      idempotency_key: `${changeId}:open`,
    }]);
    assert.equal(result.isError, true, JSON.stringify(result.structuredContent, null, 2));
    assert.equal(
      readState(fx, (db) => count(db, 'changes', 'id = ?', [changeId])),
      0,
    );
    assert.equal(
      fs.existsSync(intentFile),
      false,
      'a failed idempotency receipt must not leave a new Change intent behind',
    );
  } finally {
    cleanup(fx);
  }
});

test('change revise receipt failure restores the previously accepted intent bytes', async () => {
  const fx = fixture();
  const changeId = 'boundary-change-revise-receipt-failure';
  const intentFile = path.join(
    fx.rootDir,
    '.ultra',
    'changes',
    'active',
    changeId,
    'intent.md',
  );
  try {
    assertRecordAccepted(await callRecord(fx, [{
      kind: 'change_contract',
      action: 'open',
      data: validChangeData(changeId),
      idempotency_key: `${changeId}:open`,
    }]));
    const beforeTitle = readState(
      fx,
      (db) => db.prepare('SELECT title FROM changes WHERE id = ?').get(changeId).title,
    );
    const beforeBytes = fs.readFileSync(intentFile);
    readState(fx, (db) => db.exec(`
      CREATE TRIGGER reject_boundary_change_revise_receipt
      BEFORE INSERT ON events
      WHEN NEW.type = 'ultra_kernel_call'
      BEGIN
        SELECT RAISE(ABORT, 'forced receipt failure');
      END;
    `));
    const result = await callRecord(fx, [{
      kind: 'change_contract',
      action: 'revise',
      data: { id: changeId, patch: { title: 'Title that must roll back' } },
      idempotency_key: `${changeId}:revise`,
    }]);
    assert.equal(result.isError, true, JSON.stringify(result.structuredContent, null, 2));
    assert.equal(
      readState(
        fx,
        (db) => db.prepare('SELECT title FROM changes WHERE id = ?').get(changeId).title,
      ),
      beforeTitle,
    );
    assert.deepEqual(
      fs.readFileSync(intentFile),
      beforeBytes,
      'a failed idempotency receipt must restore the prior Change intent bytes',
    );
  } finally {
    cleanup(fx);
  }
});

test('event append rejects numeric type and identifiers before SQLite TEXT affinity can rewrite them', async () => {
  const fx = fixture();
  const cases = [
    ['type', 123],
    ['task_id', 7],
    ['change_id', 0],
    ['session_id', 9],
    ['runtime', 4],
    ['payload', []],
  ];
  try {
    for (const [field, value] of cases) {
      const payload = { numeric_public_input_boundary: field };
      const result = await callRecord(fx, [{
        kind: 'event',
        action: 'append',
        data: {
          type: 'boundary_event_numeric_scalar',
          payload,
          [field]: value,
        },
        idempotency_key: `boundary-event-numeric-${field}`,
      }]);
      assertValidationRejected(result);
      assert.equal(
        readState(
          fx,
          (db) => count(db, 'events', 'payload_json = ?', [JSON.stringify(payload)]),
        ),
        0,
      );
    }
  } finally {
    cleanup(fx);
  }
});

test('event append reports typed validation for booleans instead of leaking a raw TypeError', async () => {
  const fx = fixture();
  const payload = { boolean_public_input_boundary: true };
  try {
    const result = await callRecord(fx, [{
      kind: 'event',
      action: 'append',
      data: { type: true, payload },
      idempotency_key: 'boundary-event-boolean-type',
    }]);
    assertValidationRejected(result);
    assert.equal(
      readState(
        fx,
        (db) => count(db, 'events', 'payload_json = ?', [JSON.stringify(payload)]),
      ),
      0,
    );
  } finally {
    cleanup(fx);
  }
});

test('artifact bind rejects wrong known-field types and unknown fields instead of defaulting them', async () => {
  const fx = fixture();
  const unknownPath = '.ultra/public-input-boundary/artifact-unknown.txt';
  writeFixtureFile(fx, unknownPath);
  const wrongTypes = [
    ['id', 99],
    ['owner_type', 99],
    ['owner_id', 99],
    ['kind', 99],
    ['path', 99],
    ['status', false],
    ['source_refs', 'not-an-array'],
    ['consumer_refs', 'also-not-an-array'],
    ['provenance', 7],
    ['metadata', 'not-an-object'],
    ['content_digest', 7],
    ['expected_before_digest', false],
  ];
  const entries = wrongTypes.map(([field, value], index) => {
    const artifactPath = `.ultra/public-input-boundary/artifact-known-${index}.txt`;
    writeFixtureFile(fx, artifactPath);
    return {
      kind: 'artifact',
      action: 'bind',
      data: {
        id: `boundary-artifact-known-${index}`,
        owner_type: 'project',
        owner_id: 'project',
        kind: 'boundary_known_types',
        path: artifactPath,
        status: 'current',
        source_refs: [],
        consumer_refs: [],
        provenance: {},
        metadata: {},
        [field]: value,
      },
      idempotency_key: `boundary-artifact-known-type-${field}`,
    };
  });
  entries.push(
    {
      kind: 'artifact',
      action: 'bind',
      data: {
        id: 'boundary-artifact-unknown',
        owner_type: 'project',
        owner_id: 'project',
        kind: 'boundary_unknown_field',
        path: unknownPath,
        source_refs: [],
        consumer_refs: [],
        provenance: { writer: 'public-input-boundary-test' },
        metadata: {},
        unexpected_authority: 'must be rejected',
      },
      idempotency_key: 'boundary-artifact-unknown-field',
    },
  );
  try {
    const result = await callRecord(fx, entries);
    assertValidationRejected(result, entries.length);
    assert.equal(
      readState(
        fx,
        (db) => count(
          db,
          'artifacts',
          'kind IN (?, ?)',
          ['boundary_known_types', 'boundary_unknown_field'],
        ),
      ),
      0,
    );
  } finally {
    cleanup(fx);
  }
});

test('task contract revise rejects a false patch instead of accepting an empty no-op', async () => {
  const fx = fixture();
  const taskId = 'boundary-task-false-patch';
  try {
    assertRecordAccepted(await callRecord(fx, [{
      kind: 'task_contract',
      action: 'define',
      data: validTaskData(taskId),
      idempotency_key: `${taskId}:define`,
    }]));
    const result = await callRecord(fx, [{
      kind: 'task_contract',
      action: 'revise',
      data: { id: taskId, patch: false },
      idempotency_key: `${taskId}:false-patch`,
    }]);
    assertValidationRejected(result);
  } finally {
    cleanup(fx);
  }
});

test('decision accept rejects false supersedes_id instead of silently storing NULL', async () => {
  const fx = fixture();
  const baselineId = readState(
    fx,
    (db) => db.prepare("SELECT id FROM baselines WHERE status = 'ready'").get().id,
  );
  const decisionId = 'boundary-decision-false-supersedes';
  const artifactFile = path.join(
    fx.rootDir,
    '.ultra',
    'decisions',
    'baseline',
    `${decisionId}.json`,
  );
  try {
    const result = await callRecord(fx, [{
      kind: 'decision',
      action: 'accept',
      data: decisionData(decisionId, baselineId, { supersedes_id: false }),
      idempotency_key: `${decisionId}:accept`,
    }]);
    assertValidationRejected(result);
    assert.equal(
      readState(fx, (db) => count(db, 'decision_records', 'id = ?', [decisionId])),
      0,
    );
    assert.equal(fs.existsSync(artifactFile), false);
  } finally {
    cleanup(fx);
  }
});

test('decision rejection for a missing owner leaves neither database authority nor a managed file', async () => {
  const fx = fixture();
  const decisionId = 'boundary-decision-missing-owner';
  const artifactFile = path.join(
    fx.rootDir,
    '.ultra',
    'decisions',
    'baseline',
    `${decisionId}.json`,
  );
  try {
    const result = await callRecord(fx, [{
      kind: 'decision',
      action: 'accept',
      data: decisionData(decisionId, 'missing-baseline'),
      idempotency_key: `${decisionId}:accept`,
    }]);
    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    assert.equal(
      result.structuredContent?.accepted,
      false,
      JSON.stringify(result.structuredContent, null, 2),
    );
    assert.equal(result.structuredContent.results[0].accepted, false);
    assert.ok(result.structuredContent.results[0].diagnostics.length > 0);
    assert.equal(
      readState(fx, (db) => count(db, 'decision_records', 'id = ?', [decisionId])),
      0,
    );
    assert.equal(
      readState(
        fx,
        (db) => count(db, 'artifacts', 'id = ?', [`artifact-decision-${decisionId}`]),
      ),
      0,
    );
    assert.equal(
      fs.existsSync(artifactFile),
      false,
      'a rejected Decision must not leave authority-looking managed bytes',
    );
  } finally {
    cleanup(fx);
  }
});

test('decision receipt failure rolls back both SQLite authority and managed file bytes', async () => {
  const fx = fixture();
  const baselineId = readState(
    fx,
    (db) => db.prepare("SELECT id FROM baselines WHERE status = 'ready'").get().id,
  );
  const decisionId = 'boundary-decision-receipt-failure';
  const artifactFile = path.join(
    fx.rootDir,
    '.ultra',
    'decisions',
    'baseline',
    `${decisionId}.json`,
  );
  try {
    readState(fx, (db) => db.exec(`
      CREATE TRIGGER reject_boundary_decision_receipt
      BEFORE INSERT ON events
      WHEN NEW.type = 'ultra_kernel_call'
      BEGIN
        SELECT RAISE(ABORT, 'forced receipt failure');
      END;
    `));
    const result = await callRecord(fx, [{
      kind: 'decision',
      action: 'accept',
      data: decisionData(decisionId, baselineId),
      idempotency_key: `${decisionId}:accept`,
    }]);
    assert.equal(result.isError, true, JSON.stringify(result.structuredContent, null, 2));
    assert.equal(
      readState(fx, (db) => count(db, 'decision_records', 'id = ?', [decisionId])),
      0,
    );
    assert.equal(
      readState(
        fx,
        (db) => count(db, 'artifacts', 'id = ?', [`artifact-decision-${decisionId}`]),
      ),
      0,
    );
    assert.equal(
      fs.existsSync(artifactFile),
      false,
      'a failed idempotency receipt must roll managed bytes back with SQLite',
    );
  } finally {
    cleanup(fx);
  }
});

test('every public record kind rejects unknown semantic fields instead of silently discarding them', async () => {
  const baselineFx = fixture({ readyBaseline: false });
  const fx = fixture();
  const baselineId = readState(
    fx,
    (db) => db.prepare("SELECT id FROM baselines WHERE status = 'ready'").get().id,
  );
  const changeId = 'boundary-unknown-field-change';
  const decisionId = 'boundary-unknown-field-decision';
  const decisionFile = path.join(
    fx.rootDir,
    '.ultra',
    'decisions',
    'baseline',
    `${decisionId}.json`,
  );
  const baselineEntry = {
      kind: 'baseline',
      action: 'start',
      data: {
        id: 'boundary-unknown-field-baseline',
        project_name: 'Boundary unknown field baseline',
        mode: 'greenfield',
        unexpected_semantic_authority: true,
      },
      idempotency_key: 'boundary-baseline-unknown-field',
    };
  const entries = [
    {
      kind: 'change_contract',
      action: 'open',
      data: validChangeData(changeId, {
        unexpected_semantic_authority: true,
      }),
      idempotency_key: 'boundary-change-unknown-field',
    },
    {
      kind: 'decision',
      action: 'accept',
      data: decisionData(decisionId, baselineId, {
        unexpected_semantic_authority: true,
      }),
      idempotency_key: 'boundary-decision-unknown-field',
    },
    {
      kind: 'event',
      action: 'append',
      data: {
        type: 'boundary_unknown_field_event',
        payload: {},
        unexpected_semantic_authority: true,
      },
      idempotency_key: 'boundary-event-unknown-field',
    },
  ];
  try {
    assertValidationRejected(await callRecord(baselineFx, [baselineEntry]));
    assert.equal(readState(baselineFx, (db) => count(db, 'baselines')), 0);
    const result = await callRecord(fx, entries);
    assertValidationRejected(result, entries.length);
    assert.equal(readState(fx, (db) => count(db, 'changes', 'id = ?', [changeId])), 0);
    assert.equal(
      readState(fx, (db) => count(db, 'decision_records', 'id = ?', [decisionId])),
      0,
    );
    assert.equal(
      readState(
        fx,
        (db) => count(db, 'events', 'type = ?', ['boundary_unknown_field_event']),
      ),
      0,
    );
    assert.equal(fs.existsSync(decisionFile), false);
  } finally {
    cleanup(baselineFx);
    cleanup(fx);
  }
});

test('mixed record batch commits its legal sibling and audits every rejected entry', async () => {
  const fx = fixture();
  const baselineId = readState(
    fx,
    (db) => db.prepare("SELECT id FROM baselines WHERE status = 'ready'").get().id,
  );
  const taskId = 'boundary-mixed-task';
  const artifactId = 'boundary-mixed-artifact';
  const artifactPath = '.ultra/public-input-boundary/mixed-artifact.txt';
  const decisionId = 'boundary-mixed-decision';
  const validPayload = { mixed_batch_legal_sibling: true };
  writeFixtureFile(fx, artifactPath);
  const entries = [
    {
      kind: 'event',
      action: 'append',
      data: { type: 'boundary_mixed_legal', payload: validPayload },
      idempotency_key: 'boundary-mixed-legal-event',
    },
    {
      kind: 'task_contract',
      action: 'revise',
      data: { id: taskId, patch: false },
      idempotency_key: 'boundary-mixed-invalid-task',
    },
    {
      kind: 'artifact',
      action: 'bind',
      data: {
        id: artifactId,
        owner_type: 'project',
        owner_id: 'project',
        kind: 'boundary_mixed_unknown',
        path: artifactPath,
        source_refs: [],
        consumer_refs: [],
        provenance: { writer: 'public-input-boundary-test' },
        unexpected_authority: true,
      },
      idempotency_key: 'boundary-mixed-invalid-artifact',
    },
    {
      kind: 'decision',
      action: 'accept',
      data: decisionData(decisionId, baselineId, { supersedes_id: false }),
      idempotency_key: 'boundary-mixed-invalid-decision',
    },
  ];
  try {
    assertRecordAccepted(await callRecord(fx, [{
      kind: 'task_contract',
      action: 'define',
      data: validTaskData(taskId),
      idempotency_key: `${taskId}:define`,
    }]));

    const result = await callRecord(fx, entries);
    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    assert.equal(
      result.structuredContent?.accepted,
      false,
      JSON.stringify(result.structuredContent, null, 2),
    );
    assert.deepEqual(
      result.structuredContent.results.map((item) => item.accepted),
      [true, false, false, false],
    );
    for (const item of result.structuredContent.results.slice(1)) {
      assert.deepEqual(
        item.diagnostics.map((diagnostic) => diagnostic.code),
        ['VALIDATION_ERROR'],
      );
    }

    assert.equal(
      readState(
        fx,
        (db) => count(db, 'events', 'type = ? AND payload_json = ?', [
          'boundary_mixed_legal',
          JSON.stringify(validPayload),
        ]),
      ),
      1,
      'the legal sibling must commit even when other entries are rejected',
    );
    assert.equal(
      readState(fx, (db) => count(db, 'artifacts', 'id = ?', [artifactId])),
      0,
    );
    assert.equal(
      readState(fx, (db) => count(db, 'decision_records', 'id = ?', [decisionId])),
      0,
    );

    const attempt = latestRejectedAttempt(fx);
    assert.ok(attempt, 'the mixed batch rejection must be audited');
    assert.equal(attempt.tool, 'ultra.record');
    assert.deepEqual(
      attempt.operations,
      entries.map((entry) => `${entry.kind}:${entry.action}`),
    );
    const rejectedDiagnostics = result.structuredContent.results
      .slice(1)
      .flatMap((item) => item.diagnostics)
      .map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
      }));
    assert.deepEqual(
      attempt.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
      })),
      rejectedDiagnostics,
      'every rejected entry diagnostic must be present in the durable attempt audit',
    );
  } finally {
    cleanup(fx);
  }
});
