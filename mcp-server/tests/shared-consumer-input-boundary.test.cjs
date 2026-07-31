'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const artifacts = require('../lib/artifact-registry.cjs');
const baselines = require('../lib/baseline-workflow.cjs');
const changes = require('../lib/legacy-change-workflow.cjs');
const decisions = require('../lib/decision-records.cjs');
const ops = require('../lib/state-ops.cjs');
const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-shared-consumer-boundary-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  return {
    rootDir,
    db,
    close() {
      closeStateDb(db);
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

function assertValidation(call) {
  assert.throws(call, (error) => error.code === 'VALIDATION_ERROR');
}

function validDecision(id, baselineId, overrides = {}) {
  return {
    id,
    scope: { baseline_id: baselineId },
    question: 'Which bytes are authoritative?',
    recommendation: 'Keep database and managed files atomic.',
    selection: 'Restore the prior bytes on failure.',
    owner: 'shared-consumer-boundary-test',
    source: 'direct-module-test',
    ...overrides,
  };
}

test('Event rejects malformed direct input before SQLite binding', () => {
  const fx = fixture();
  try {
    for (const event of [
      { type: 7 },
      { type: 'event', task_id: 7 },
      { type: 'event', change_id: false },
      { type: 'event', session_id: 9 },
      { type: 'event', runtime: 4 },
      { type: 'event', payload: [] },
      { type: 'event', payload: {}, unexpected: true },
    ]) {
      assertValidation(() => ops.appendEvent(fx.db, event));
    }
    assert.equal(fx.db.prepare('SELECT COUNT(*) AS count FROM events').get().count, 0);
  } finally {
    fx.close();
  }
});

test('Baseline rejects scalar text, unknown fields, and non-boolean nested authority', () => {
  const fx = fixture();
  try {
    assertValidation(() => baselines.startBaseline(fx.db, {
      id: 'direct-invalid-text',
      project_name: 'Direct invalid baseline',
      project_type: 7,
      mode: 'greenfield',
    }, { rootDir: fx.rootDir }));
    assertValidation(() => baselines.startBaseline(fx.db, {
      id: 'direct-unknown-field',
      project_name: 'Direct invalid baseline',
      mode: 'greenfield',
      unexpected: true,
    }, { rootDir: fx.rootDir }));
    assert.equal(fx.db.prepare('SELECT COUNT(*) AS count FROM baselines').get().count, 0);

    baselines.startBaseline(fx.db, {
      id: 'direct-baseline',
      project_name: 'Direct baseline',
      mode: 'greenfield',
    }, { rootDir: fx.rootDir });
    assertValidation(() => baselines.recordBaseline(fx.db, {
      id: 'direct-baseline',
      unknowns: [{ summary: 'Type must remain visible.', blocking: 'true' }],
    }, { rootDir: fx.rootDir }));
    assertValidation(() => baselines.convergeBaseline(fx.db, {
      id: 'direct-baseline',
      approved_by: true,
    }, { rootDir: fx.rootDir }));
    assert.equal(
      fx.db.prepare("SELECT unknowns_json FROM baselines WHERE id = 'direct-baseline'")
        .get().unknowns_json,
      '[]',
    );
  } finally {
    fx.close();
  }
});

test('Change rejects malformed direct contracts and patches without mutation', () => {
  const fx = fixture();
  const base = completeChangeInput({
    id: 'direct-change',
    title: 'Direct change boundary',
    kind: 'standard',
    intent: 'Reject malformed shared-consumer input.',
  });
  try {
    assertValidation(() => changes.createKernelChange(fx.db, {
      ...base,
      docs_impact: 7,
    }, { rootDir: fx.rootDir }));
    assertValidation(() => changes.createKernelChange(fx.db, {
      ...base,
      contract: {
        ...base.contract,
        unresolved_decisions: [{
          id: 'direct-decision',
          summary: 'This flag must remain typed.',
          blocking: 'true',
        }],
      },
    }, { rootDir: fx.rootDir }));
    assertValidation(() => changes.createKernelChange(fx.db, {
      ...base,
      unexpected: true,
    }, { rootDir: fx.rootDir }));
    assertValidation(() => changes.updateKernelChange(
      fx.db,
      'direct-change',
      false,
      { rootDir: fx.rootDir },
    ));
    assert.equal(fx.db.prepare('SELECT COUNT(*) AS count FROM changes').get().count, 0);
  } finally {
    fx.close();
  }
});

test('Artifact rejects malformed direct registry declarations before reading bytes', () => {
  const fx = fixture();
  const relative = '.ultra/direct-boundary/artifact.txt';
  const file = path.join(fx.rootDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'direct artifact boundary\n');
  const valid = {
    id: 'direct-artifact',
    owner_type: 'project',
    owner_id: 'project',
    kind: 'direct_boundary',
    path: relative,
    source_refs: [],
    consumer_refs: [],
    provenance: {},
    metadata: {},
  };
  try {
    for (const patch of [
      { id: 9 },
      { status: false },
      { source_refs: 'not-an-array' },
      { provenance: 7 },
      { content_digest: 7 },
      { unexpected: true },
    ]) {
      assertValidation(() => artifacts.recordArtifact(
        fx.db,
        { ...valid, ...patch },
        { rootDir: fx.rootDir },
      ));
    }
    assert.equal(fx.db.prepare('SELECT COUNT(*) AS count FROM artifacts').get().count, 0);
  } finally {
    fx.close();
  }
});

test('Decision validates authority before publication and restores files after internal DB failure', () => {
  const fx = fixture();
  fx.db.prepare(
    `INSERT INTO baselines (id, project_name, mode, status, repository_root)
     VALUES ('direct-owner', 'Direct owner', 'greenfield', 'draft', '.')`,
  ).run();
  try {
    assertValidation(() => decisions.acceptDecision(
      fx.db,
      validDecision('direct-false-supersedes', 'direct-owner', { supersedes_id: false }),
      { rootDir: fx.rootDir },
    ));
    assertValidation(() => decisions.acceptDecision(
      fx.db,
      validDecision('direct-unknown-field', 'direct-owner', { unexpected: true }),
      { rootDir: fx.rootDir },
    ));
    const missingOwnerFile = path.join(
      fx.rootDir,
      '.ultra/decisions/baseline/direct-missing-owner.json',
    );
    assert.throws(
      () => decisions.acceptDecision(
        fx.db,
        validDecision('direct-missing-owner', 'missing-owner'),
        { rootDir: fx.rootDir },
      ),
      (error) => error.code === 'ARTIFACT_OWNER_MISSING',
    );
    assert.equal(fs.existsSync(missingOwnerFile), false);

    fx.db.exec(
      `CREATE TRIGGER reject_direct_decision_event
       BEFORE INSERT ON events WHEN NEW.type = 'decision_recorded'
       BEGIN SELECT RAISE(ABORT, 'forced direct decision failure'); END`,
    );
    for (const [id, prior] of [
      ['direct-new-file', null],
      ['direct-existing-file', Buffer.from('prior managed bytes\n')],
    ]) {
      const file = path.join(fx.rootDir, `.ultra/decisions/baseline/${id}.json`);
      if (prior) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, prior);
      }
      assert.throws(() => decisions.acceptDecision(
        fx.db,
        validDecision(id, 'direct-owner'),
        { rootDir: fx.rootDir },
      ));
      assert.equal(
        fx.db.prepare('SELECT COUNT(*) AS count FROM decision_records WHERE id = ?')
          .get(id).count,
        0,
      );
      assert.equal(
        fx.db.prepare('SELECT COUNT(*) AS count FROM artifacts WHERE id = ?')
          .get(`artifact-decision-${id}`).count,
        0,
      );
      if (prior) assert.deepEqual(fs.readFileSync(file), prior);
      else assert.equal(fs.existsSync(file), false);
    }
  } finally {
    fx.close();
  }
});
