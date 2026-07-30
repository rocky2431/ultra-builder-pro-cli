'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const decisions = require('./decision-records.cjs');
const checkpoints = require('./stage-checkpoints.cjs');
const context = require('./context-envelope.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-context-envelope-'));
  fs.mkdirSync(path.join(rootDir, '.ultra'), { recursive: true });
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  const { db } = initStateDb(dbPath);
  db.prepare(
    `INSERT INTO baselines
     (id, project_name, mode, status, repository_root, scope_json, evidence_json)
     VALUES ('baseline-1', 'Context fixture', 'greenfield', 'ready', '.', '["."]', ?)`,
  ).run(JSON.stringify(Array.from({ length: 200 }, (_, index) => ({
    kind: 'research',
    ref: `.ultra/docs/research/evidence-${index}.md`,
    summary: 'bounded evidence '.repeat(100),
  }))));
  db.prepare(
    `INSERT INTO changes
     (id, title, kind, status, intent, contract_json, artifact_root)
     VALUES ('change-1', 'Context change', 'standard', 'active', ?, ?,
             '.ultra/changes/active/change-1')`,
  ).run(
    'Keep the canonical context bounded and decision-complete.',
    JSON.stringify({ acceptance: [{ id: 'ac-1', criterion: 'Context stays bounded.' }] }),
  );
  db.prepare(
    `INSERT INTO tasks
     (id, title, type, priority, status, outcome, public_seam,
      verification_command, acceptance_json, context_refs_json,
      docs_impact_json, ownership_json, change_id)
     VALUES ('task-1', 'Build canonical context', 'feature', 'P1', 'pending',
             'Every consumer receives one digest.', 'ultra.context',
             'node --test mcp-server/lib/context-envelope.test.cjs', ?, ?,
             '{"status":"none","files":[],"rationale":"No docs"}',
             '{"owner":"test-owner","reviewers":[]}', 'change-1')`,
  ).run(
    JSON.stringify([{ id: 'ac-1', criterion: 'Context stays bounded.', verification: 'node --test' }]),
    JSON.stringify([{ ref: '.ultra/specs/product.md', reason: 'Product authority', required: true }]),
  );
  return { rootDir, db, close() { closeStateDb(db); fs.rmSync(rootDir, { recursive: true, force: true }); } };
}

test('one canonical envelope includes accepted intent and enforces both size ceilings', () => {
  const fx = fixture();
  try {
    decisions.acceptDecision(fx.db, {
      id: 'decision-context-owner',
      scope: { change_id: 'change-1' },
      question: 'Who owns semantic judgment?',
      recommendation: 'The host model owns semantic judgment.',
      selection: 'Keep MCP as persistence and safety kernel.',
      effects: { mcp: 'kernel', model: 'judgment' },
      non_goals: [],
      owner: 'project-owner',
      source: 'explicit-owner-intent',
      provenance: { runtime: 'codex' },
      applied_refs: [],
    }, { rootDir: fx.rootDir });
    const draft = checkpoints.saveDraft(fx.db, {
      stage: 'plan',
      scope: { change_id: 'change-1' },
      payload: { summary: 'A current editable Plan.' },
      evidence: [],
      diagnostics: [{ code: 'PLAN_EVIDENCE_INCOMPLETE', severity: 'needs_attention' }],
      idempotency_key: 'context-plan-draft',
    });

    const summary = context.buildEnvelope(fx.db, {
      stage: 'plan',
      scope: { change_id: 'change-1', task_id: 'task-1' },
      detail: 'summary',
    }, { rootDir: fx.rootDir, runtime: 'codex' });
    const full = context.buildEnvelope(fx.db, {
      stage: 'plan',
      scope: { change_id: 'change-1', task_id: 'task-1' },
      detail: 'full',
    }, { rootDir: fx.rootDir, runtime: 'codex' });

    assert.ok(Buffer.byteLength(JSON.stringify(summary)) <= 16 * 1024);
    assert.ok(Buffer.byteLength(JSON.stringify(full)) <= 64 * 1024);
    assert.equal(summary.digest, full.digest);
    assert.equal(summary.envelope.decisions[0].id, 'decision-context-owner');
    assert.equal(full.envelope.checkpoints[0].id, draft.id);
    assert.ok(
      full.envelope.diagnostics.needs_attention.some(
        (item) => item.code === 'PLAN_EVIDENCE_INCOMPLETE',
      ),
    );
  } finally {
    fx.close();
  }
});

test('persisting identical context reuses the same immutable snapshot and digest', () => {
  const fx = fixture();
  try {
    const first = context.persistEnvelope(fx.db, {
      stage: 'dev',
      scope: { change_id: 'change-1', task_id: 'task-1' },
    }, { rootDir: fx.rootDir, runtime: 'claude' });
    const second = context.persistEnvelope(fx.db, {
      stage: 'dev',
      scope: { change_id: 'change-1', task_id: 'task-1' },
    }, { rootDir: fx.rootDir, runtime: 'claude' });

    assert.equal(second.id, first.id);
    assert.equal(second.digest, first.digest);
    assert.equal(
      fx.db.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
      1,
    );
    assert.ok(fs.existsSync(path.join(fx.rootDir, first.artifact_path)));
  } finally {
    fx.close();
  }
});

test('persisted Context Envelope rejects byte drift before reuse', () => {
  const fx = fixture();
  try {
    const persisted = context.persistEnvelope(fx.db, {
      stage: 'dev',
      scope: { change_id: 'change-1', task_id: 'task-1' },
    }, { rootDir: fx.rootDir, runtime: 'codex' });
    const file = path.join(fx.rootDir, persisted.artifact_path);
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    document.envelope.execution.stage = 'tampered';
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);

    assert.throws(
      () => context.readEnvelope(fx.db, persisted.id, { rootDir: fx.rootDir }),
      (error) => error.code === 'CONTEXT_ENVELOPE_FILE_DRIFT',
    );
    assert.throws(
      () => context.persistEnvelope(fx.db, {
        stage: 'dev',
        scope: { change_id: 'change-1', task_id: 'task-1' },
      }, { rootDir: fx.rootDir, runtime: 'codex' }),
      (error) => error.code === 'CONTEXT_ENVELOPE_FILE_DRIFT',
    );
  } finally {
    fx.close();
  }
});
