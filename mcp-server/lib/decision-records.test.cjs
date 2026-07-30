'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const records = require('./decision-records.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-decision-record-'));
  fs.mkdirSync(path.join(rootDir, '.ultra'), { recursive: true });
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  const { db } = initStateDb(dbPath);
  db.prepare(
    `INSERT INTO baselines
     (id, project_name, mode, status, repository_root)
     VALUES ('baseline-1', 'Decision fixture', 'greenfield', 'draft', '.')`,
  ).run();
  db.prepare(
    `INSERT INTO changes
     (id, title, kind, status, intent, artifact_root)
     VALUES ('change-1', 'Decision change', 'standard', 'active',
             'Persist normalized decisions.', '.ultra/changes/active/change-1')`,
  ).run();
  return { rootDir, db, close() { closeStateDb(db); fs.rmSync(rootDir, { recursive: true, force: true }); } };
}

test('accepted decisions are deterministic team-visible artifacts without transcript data', () => {
  const fx = fixture();
  try {
    const decision = records.acceptDecision(fx.db, {
      id: 'decision-runtime-boundary',
      scope: { change_id: 'change-1' },
      question: 'Which component owns semantic judgment?',
      recommendation: 'The model owns judgment; MCP owns persistence and safety.',
      selection: 'Keep semantic judgment in Skills and the host model.',
      effects: { mcp: 'persistence_kernel', model: 'semantic_owner' },
      non_goals: ['Persist raw transcripts', 'Store chain of thought'],
      owner: 'project-owner',
      source: 'host-native-question',
      provenance: { runtime: 'codex', command: 'ultra-change' },
      applied_refs: [{ ref: '.ultra/changes/active/change-1/intent.md' }],
    }, { rootDir: fx.rootDir });

    assert.equal(decision.status, 'accepted');
    assert.equal(
      decision.artifact_path,
      '.ultra/changes/active/change-1/decisions/decision-runtime-boundary.json',
    );
    const artifact = JSON.parse(
      fs.readFileSync(path.join(fx.rootDir, decision.artifact_path), 'utf8'),
    );
    assert.equal(artifact.selection, decision.selection);
    assert.equal(artifact.digest, decision.digest);
    assert.equal(Object.hasOwn(artifact, 'transcript'), false);
    assert.equal(Object.hasOwn(artifact, 'prompt'), false);
    assert.equal(Object.hasOwn(artifact, 'chain_of_thought'), false);
  } finally {
    fx.close();
  }
});

test('a revised decision supersedes history instead of mutating accepted intent', () => {
  const fx = fixture();
  try {
    const first = records.acceptDecision(fx.db, {
      id: 'decision-plan-posture',
      scope: { baseline_id: 'baseline-1' },
      question: 'How should Plan checkpoints behave?',
      recommendation: 'Allow a later accepted revision to supersede the prior one.',
      selection: 'Use immutable accepted revisions.',
      effects: {},
      non_goals: [],
      owner: 'project-owner',
      source: 'explicit-owner-intent',
      provenance: {},
      applied_refs: [],
    }, { rootDir: fx.rootDir });

    const second = records.acceptDecision(fx.db, {
      id: 'decision-plan-posture-v2',
      scope: { baseline_id: 'baseline-1' },
      question: 'How should corrected Plan checkpoints behave?',
      recommendation: 'Preserve prior history and supersede it.',
      selection: 'Supersede the first accepted decision.',
      effects: {},
      non_goals: [],
      owner: 'project-owner',
      source: 'explicit-owner-intent',
      provenance: {},
      applied_refs: [],
      supersedes_id: first.id,
    }, { rootDir: fx.rootDir });

    assert.equal(records.readDecision(fx.db, first.id).status, 'superseded');
    assert.equal(second.supersedes_id, first.id);
    assert.deepEqual(
      records.listAcceptedDecisions(fx.db, { baseline_id: 'baseline-1' }).map((item) => item.id),
      [second.id],
    );
  } finally {
    fx.close();
  }
});

test('accepted Decision Record rejects file drift before Context or Worker reuse', () => {
  const fx = fixture();
  try {
    const decision = records.acceptDecision(fx.db, {
      id: 'decision-drift',
      scope: { change_id: 'change-1' },
      question: 'Can accepted decisions drift silently?',
      recommendation: 'Fail closed on byte drift.',
      selection: 'Bind every accepted decision to its artifact bytes.',
      effects: { integrity: 'required' },
      non_goals: [],
      owner: 'project-owner',
      source: 'explicit-owner-intent',
      provenance: {},
      applied_refs: [],
    }, { rootDir: fx.rootDir });
    const file = path.join(fx.rootDir, decision.artifact_path);
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    document.selection = 'tampered selection';
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);

    assert.throws(
      () => records.readDecisionArtifact(
        fx.db,
        decision.id,
        { rootDir: fx.rootDir },
      ),
      (error) => error.code === 'DECISION_FILE_DRIFT',
    );
  } finally {
    fx.close();
  }
});
