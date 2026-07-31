'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initProject } = require('../lib/init-project.cjs');
const { openStateDb, closeStateDb } = require('../lib/state-db.cjs');
const facade = require('../lib/ultra-facade.cjs');
const contextEnvelopes = require('../lib/context-envelope.cjs');
const workerPackets = require('../lib/worker-packet.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function git(rootDir, args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function write(rootDir, relative, body) {
  const file = path.join(rootDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return relative.split(path.sep).join('/');
}

function writeJson(rootDir, relative, value) {
  return write(rootDir, relative, `${JSON.stringify(value, null, 2)}\n`);
}

function digest(rootDir, relative) {
  return crypto.createHash('sha256').update(
    fs.readFileSync(path.join(rootDir, relative)),
  ).digest('hex');
}

function commitAll(rootDir, message) {
  git(rootDir, ['add', '-A']);
  git(rootDir, ['commit', '-q', '-m', message]);
  return git(rootDir, ['rev-parse', 'HEAD']);
}

async function record(db, rootDir, entries) {
  return facade.dispatch('ultra.record', { entries }, db, {
    rootDir,
    runtime: 'test',
  });
}

async function checkpoint(db, rootDir, input) {
  return facade.dispatch('ultra.checkpoint', input, db, {
    rootDir,
    runtime: 'test',
  });
}

function artifactEntry({
  id,
  changeId,
  taskId = null,
  kind,
  artifactPath,
  consumer,
}) {
  return {
    kind: 'artifact',
    action: 'bind',
    data: {
      id,
      owner_type: taskId ? 'task' : 'change',
      owner_id: taskId || changeId,
      change_id: changeId,
      task_id: taskId,
      kind,
      path: artifactPath,
      source_refs: [{
        type: taskId ? 'task' : 'change',
        id: taskId || changeId,
        relation: 'produced_for',
      }],
      consumer_refs: consumer ? [{
        type: 'external',
        id: consumer,
        relation: 'consumed_by',
      }] : [],
      provenance: { writer: 'v0.24-public-e2e' },
      metadata: consumer ? {} : { terminal_role: true },
    },
    idempotency_key: `artifact:${id}`,
  };
}

function createProject(mode) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `ubp-v024-${mode}-`));
  write(rootDir, 'README.md', '# v0.24 public workflow fixture\n');
  if (mode === 'brownfield') {
    write(rootDir, 'src/legacy.js', "'use strict';\nexports.legacy = true;\n");
  }
  const initialized = initProject({
    target_dir: rootDir,
    project_name: `v024-${mode}`,
    mode: 'auto',
  });
  assert.equal(initialized.mode, mode);
  assert.equal(initialized.checkpoint.init.status, 'accepted');
  assert.equal(initialized.checkpoint.research, null);
  git(rootDir, ['config', 'user.email', 'test@ubp.dev']);
  git(rootDir, ['config', 'user.name', 'ubp-test']);
  for (const [name, body] of Object.entries({
    discovery: '# Discovery\n\nThe owner needs a visible status seam.\n',
    product: '# Product\n\nThe status seam returns ready.\n',
    architecture: '# Architecture\n\nThe seam is a small CommonJS module.\n',
  })) {
    write(rootDir, `.ultra/specs/${name}.md`, body);
  }
  write(
    rootDir,
    '.ultra/docs/research/project-baseline/summary.md',
    '# Research summary\n\nRepository evidence and intended behavior were inspected.\n',
  );
  const revision = commitAll(rootDir, 'chore: establish v0.24 fixture authority');
  const db = openStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  return { rootDir, db, initialized, revision };
}

async function convergeBaseline(fx, mode) {
  const baselineId = fx.initialized.baseline.id;
  const evidence = mode === 'brownfield'
    ? [{
      kind: 'source',
      ref: 'src/legacy.js',
      summary: 'Existing brownfield behavior was inspected.',
    }]
    : [{
      kind: 'docs',
      ref: 'README.md',
      summary: 'Greenfield intent was recorded.',
    }];
  const observed = await record(fx.db, fx.rootDir, [{
    kind: 'baseline',
    action: 'observe',
    data: {
      id: baselineId,
      repository_revision: fx.revision,
      scope: ['.'],
      spec_refs: [
        { kind: 'discovery', path: '.ultra/specs/discovery.md' },
        { kind: 'product', path: '.ultra/specs/product.md' },
        { kind: 'architecture', path: '.ultra/specs/architecture.md' },
      ],
      evidence,
      verification: [{
        name: 'runtime available',
        command: 'node --version',
        status: 'pass',
        evidence: process.version,
      }],
      unknowns: [],
      gaps: [],
      classification: fx.initialized.repository_profile,
    },
    idempotency_key: `${mode}:baseline-observe`,
  }]);
  assert.equal(observed.accepted, true);
  const research = await checkpoint(fx.db, fx.rootDir, {
    stage: 'research',
    scope: {},
    payload: {
      mode: mode === 'brownfield' ? 'adoption' : 'full',
      evidence: [{
        kind: 'docs',
        ref: '.ultra/docs/research/project-baseline/summary.md',
        summary: 'Research synthesis was read back.',
      }],
    },
    idempotency_key: `${mode}:research-checkpoint`,
  });
  assert.equal(research.accepted, true);
  const accepted = await record(fx.db, fx.rootDir, [{
    kind: 'baseline',
    action: 'accept',
    data: {
      id: baselineId,
      expected_revision: fx.revision,
      approved_by: 'fixture-owner',
      approval_note: 'The recorded specifications and evidence match the checkout.',
    },
    idempotency_key: `${mode}:baseline-accept`,
  }]);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.results[0].result.ready, true);
  const sync = await facade.dispatch('ultra.sync', {
    action: 'publish',
    reason: 'baseline_accepted',
    idempotency_key: `${mode}:baseline-ledger`,
  }, fx.db, { rootDir: fx.rootDir });
  assert.equal(sync.ledger.schema_version, '2.0');
  commitAll(fx.rootDir, 'docs: publish accepted baseline');
}

async function executeChange(fx, mode) {
  const changeId = `status-${mode}`;
  const taskId = `${changeId}-task`;
  const acceptanceId = `${changeId}-ready`;
  const opened = await record(fx.db, fx.rootDir, [{
    kind: 'change_contract',
    action: 'open',
    data: completeChangeInput({
      id: changeId,
      title: `Add ${mode} status seam`,
      kind: 'quick',
      intent: 'Expose one verified ready status through the maintained runtime.',
      docs_impact: {
        status: 'none',
        files: [],
        rationale: 'The fixture adds only an internal module.',
      },
      contract: {
        outcome: 'The runtime exposes a verified ready status.',
        acceptance: [{
          id: acceptanceId,
          criterion: 'getStatus returns ready.',
          verification: 'node --test test/status.test.js',
        }],
        non_goals: ['Unrelated runtime behavior.'],
        public_seams: ['src/status.js#getStatus'],
        recovery: {
          strategy: 'Remove the bounded status seam.',
          verification: 'Run the pre-change test command.',
        },
        unresolved_decisions: [],
      },
    }),
    idempotency_key: `${changeId}:open`,
  }, {
    kind: 'decision',
    action: 'accept',
    data: {
      id: `${changeId}-decision`,
      scope: { change_id: changeId },
      question: 'Which public status value should the seam return?',
      recommendation: 'Return ready because it is the accepted product behavior.',
      selection: 'ready',
      effects: { return_value: 'ready' },
      non_goals: ['No health probing is added.'],
      owner: 'fixture-owner',
      source: 'explicit_owner_instruction',
      provenance: { host: 'test' },
      applied_refs: [{
        ref: `.ultra/changes/active/${changeId}/intent.md`,
      }],
    },
    idempotency_key: `${changeId}:decision`,
  }, {
    kind: 'task_contract',
    action: 'define',
    data: {
      id: taskId,
      title: 'Implement the ready status seam',
      type: 'feature',
      priority: 'P0',
      complexity: 2,
      estimated_days: 1,
      deps: [],
      files_modified: ['src/status.js', 'test/status.test.js'],
      change_id: changeId,
      outcome: 'getStatus returns ready and the test passes.',
      slice_kind: 'tracer_bullet',
      public_seam: 'src/status.js#getStatus',
      verification_command: 'node --test test/status.test.js',
      acceptance: [{
        id: acceptanceId,
        criterion: 'getStatus returns ready.',
        verification: 'node --test test/status.test.js',
      }],
      context_refs: [{
        ref: '.ultra/specs/product.md',
        kind: 'spec',
        reason: 'Accepted product behavior.',
        required: true,
      }],
      docs_impact: {
        status: 'none',
        files: [],
        rationale: 'No public documentation changes are required.',
      },
      ownership: { owner: 'runtime-maintainer', reviewers: ['fixture-owner'] },
      trace_to: acceptanceId,
    },
    idempotency_key: `${taskId}:define`,
  }]);
  assert.equal(opened.accepted, true);

  const planned = await checkpoint(fx.db, fx.rootDir, {
    stage: 'plan',
    scope: { change_id: changeId },
    payload: {
      summary: 'One tracer-bullet task implements and verifies the accepted seam.',
    },
    idempotency_key: `${changeId}:plan`,
  });
  assert.equal(planned.accepted, true);
  assert.equal(planned.result.team_checkpoint.ledger.tasks.length, 1);
  const planHead = commitAll(fx.rootDir, 'plan: publish status change');

  const acquired = await facade.dispatch('ultra.session', {
    action: 'acquire',
    scope: { task_id: taskId },
    payload: {
      runtime: 'codex',
      role: 'implement',
      output_path: `.ultra/changes/active/${changeId}/delivery/${taskId}-outcome.json`,
      output_schema: {
        type: 'object',
        required: ['packet_digest', 'summary', 'verification'],
        additionalProperties: false,
        properties: {
          packet_digest: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          summary: { type: 'string', minLength: 3 },
          verification: { type: 'string', minLength: 3 },
        },
      },
    },
    idempotency_key: `${taskId}:acquire`,
  }, fx.db, { rootDir: fx.rootDir, runtime: 'codex' });
  assert.equal(acquired.accepted, true, JSON.stringify(acquired, null, 2));
  assert.ok(fs.existsSync(path.join(acquired.worktree_path, acquired.packet.packet_path)));

  write(
    acquired.worktree_path,
    'src/status.js',
    "'use strict';\nexports.getStatus = () => 'ready';\n",
  );
  write(
    acquired.worktree_path,
    'test/status.test.js',
    [
      "'use strict';",
      "const test = require('node:test');",
      "const assert = require('node:assert/strict');",
      "const { getStatus } = require('../src/status.js');",
      "test('status is ready', () => assert.equal(getStatus(), 'ready'));",
      '',
    ].join('\n'),
  );
  writeJson(
    acquired.worktree_path,
    acquired.packet.output.path,
    {
      packet_digest: acquired.packet.packet_digest,
      summary: 'Implemented the accepted ready status seam.',
      verification: 'node --test test/status.test.js',
    },
  );
  execFileSync(process.execPath, ['--test', 'test/status.test.js'], {
    cwd: acquired.worktree_path,
    stdio: 'pipe',
  });
  const workerHead = commitAll(acquired.worktree_path, 'feat: implement ready status seam');
  git(fx.rootDir, ['merge', '--no-ff', '--no-commit', workerHead]);

  const completed = await record(fx.db, fx.rootDir, [{
    kind: 'task_outcome',
    action: 'complete',
    data: {
      id: taskId,
      packet_digest: acquired.packet.packet_digest,
    },
    idempotency_key: `${taskId}:complete`,
  }]);
  assert.equal(completed.accepted, true, JSON.stringify(completed, null, 2));
  assert.equal(completed.results[0].result.task.status, 'completed');
  assert.equal(completed.results[0].result.task.completion_commit, null);

  const completionSync = await facade.dispatch('ultra.sync', {
    action: 'publish',
    reason: 'task_completed',
    idempotency_key: `${taskId}:completion-sync`,
  }, fx.db, { rootDir: fx.rootDir, runtime: 'test' });
  const durableTask = completionSync.ledger.tasks.find((task) => task.id === taskId);
  assert.equal(durableTask.status, 'completed');
  assert.equal(Object.hasOwn(durableTask, 'completion_commit'), false);
  const ledgerFile = path.join(fx.rootDir, '.ultra', 'tasks', 'tasks.json');
  const ledgerBeforeAttestation = fs.readFileSync(ledgerFile);

  const integrationHead = commitAll(fx.rootDir, 'feat: integrate ready status seam');
  assert.equal(
    git(fx.rootDir, ['rev-list', '--count', '--first-parent', `${planHead}..${integrationHead}`]),
    '1',
    'durable completion and its team checkpoint must land in one integration commit',
  );

  const attested = await record(fx.db, fx.rootDir, [{
    kind: 'task_outcome',
    action: 'attest_commit',
    data: {
      id: taskId,
      completion_commit: integrationHead,
    },
    idempotency_key: `${taskId}:attest-commit`,
  }]);
  assert.equal(attested.accepted, true, JSON.stringify(attested, null, 2));
  assert.equal(
    attested.results[0].result.task.completion_commit,
    integrationHead,
  );
  assert.equal(git(fx.rootDir, ['rev-parse', 'HEAD']), integrationHead);
  assert.equal(git(fx.rootDir, ['status', '--porcelain']), '');
  assert.deepEqual(fs.readFileSync(ledgerFile), ledgerBeforeAttestation);

  const released = await facade.dispatch('ultra.session', {
    action: 'release',
    scope: { sid: acquired.sid },
    payload: { status: 'completed', remove_worktree: true },
    idempotency_key: `${taskId}:release`,
  }, fx.db, { rootDir: fx.rootDir, runtime: 'codex' });
  assert.equal(released.status, 'completed');
  assert.equal(released.worktree_preserved, false);

  const dev = await checkpoint(fx.db, fx.rootDir, {
    stage: 'dev',
    scope: { task_id: taskId },
    payload: {
      evidence: [{
        kind: 'artifact',
        ref: acquired.packet.output.path,
        summary: 'Worker result is bound to the assigned packet.',
      }],
    },
    idempotency_key: `${taskId}:dev`,
  });
  assert.equal(dev.accepted, true);

  const testReport = writeJson(
    fx.rootDir,
    `.ultra/changes/active/${changeId}/test/report.json`,
    {
      result: 'pass',
      command: 'node --test test/status.test.js',
      head: git(fx.rootDir, ['rev-parse', 'HEAD']),
    },
  );
  const reviewReport = writeJson(
    fx.rootDir,
    `.ultra/changes/active/${changeId}/review/summary.json`,
    {
      verdict: 'approve',
      axes: {
        spec_fidelity: 'pass',
        engineering_quality: 'pass',
      },
    },
  );
  const reconciliationPath = writeJson(
    fx.rootDir,
    `.ultra/changes/active/${changeId}/baseline-reconciliation.json`,
    {
      $schema: 'ultra-baseline-reconciliation-v1',
      change_id: changeId,
      baseline_id: fx.initialized.baseline.id,
      baseline_updates: [],
      semantic_changes: [],
      resolved_gap_ids: [],
      resolved_unknowns: [],
      verification: [{
        name: 'no-change reconciliation',
        command: 'node --test test/status.test.js',
        status: 'pass',
        evidence: 'The Change adds runtime behavior without altering accepted baseline semantics.',
      }],
      semantic_no_change_reason: 'The accepted baseline already specifies the ready status behavior.',
    },
  );
  const deliveryReport = writeJson(
    fx.rootDir,
    `.ultra/changes/active/${changeId}/delivery/report.json`,
    {
      summary: 'Implementation, tests, review, and documentation reconciliation are complete.',
      head: git(fx.rootDir, ['rev-parse', 'HEAD']),
    },
  );
  const bound = await record(fx.db, fx.rootDir, [
    artifactEntry({
      id: `${changeId}-test-report`,
      changeId,
      kind: 'test_report',
      artifactPath: testReport,
      consumer: 'ultra-review',
    }),
    artifactEntry({
      id: `${changeId}-review-summary`,
      changeId,
      kind: 'review_summary',
      artifactPath: reviewReport,
      consumer: 'ultra-deliver',
    }),
    artifactEntry({
      id: `${changeId}-baseline-reconciliation`,
      changeId,
      kind: 'baseline_reconciliation',
      artifactPath: reconciliationPath,
      consumer: null,
    }),
    artifactEntry({
      id: `${changeId}-delivery-report`,
      changeId,
      kind: 'delivery_report',
      artifactPath: deliveryReport,
      consumer: 'ultra-archive',
    }),
  ]);
  assert.equal(bound.accepted, true);

  const tested = await checkpoint(fx.db, fx.rootDir, {
    stage: 'test',
    scope: { change_id: changeId },
    payload: {
      result: 'pass',
      evidence: [{
        kind: 'test_report',
        ref: testReport,
        digest: digest(fx.rootDir, testReport),
      }],
    },
    idempotency_key: `${changeId}:test`,
  });
  assert.equal(tested.accepted, true);
  const reviewed = await checkpoint(fx.db, fx.rootDir, {
    stage: 'review',
    scope: { change_id: changeId },
    payload: {
      verdict: 'approve',
      evidence: [{
        kind: 'review_summary',
        ref: reviewReport,
        digest: digest(fx.rootDir, reviewReport),
      }],
    },
    idempotency_key: `${changeId}:review`,
  });
  assert.equal(reviewed.accepted, true);
  const delivered = await checkpoint(fx.db, fx.rootDir, {
    stage: 'deliver',
    scope: { change_id: changeId },
    payload: {
      summary: 'The bounded Change is ready for local archive.',
      evidence: [{
        kind: 'delivery_report',
        ref: deliveryReport,
        digest: digest(fx.rootDir, deliveryReport),
      }],
    },
    idempotency_key: `${changeId}:deliver`,
  });
  assert.equal(delivered.accepted, true);

  const archived = await facade.dispatch('ultra.archive', {
    change_id: changeId,
    payload: {
      summary: 'Delivered the verified ready status seam.',
      baseline_updates: [],
      no_baseline_change_reason: 'The baseline already specifies ready status behavior.',
      reconciliation_path: reconciliationPath,
    },
    idempotency_key: `${changeId}:archive`,
  }, fx.db, { rootDir: fx.rootDir, runtime: 'test' });
  assert.equal(archived.accepted, true);
  assert.equal(archived.result.change.status, 'archived');
  assert.ok(fs.existsSync(archived.result.archive_path));
  assert.equal(archived.team_checkpoint.ledger.changes[0].status, 'archived');
  const activeRoot = `.ultra/changes/active/${changeId}`;
  const archiveFiles = [];
  for (const entry of fs.readdirSync(archived.result.archive_path, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isFile()) archiveFiles.push(path.join(entry.parentPath, entry.name));
  }
  for (const file of archiveFiles) {
    const bytes = fs.readFileSync(file);
    if (bytes.toString('utf8') === bytes.toString()) {
      assert.doesNotMatch(
        bytes.toString('utf8'),
        new RegExp(activeRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `archived file still points at the active Change root: ${file}`,
      );
    }
  }
  const authorityRows = {
    decisions: fx.db.prepare(
      `SELECT artifact_path, applied_refs_json, provenance_json
       FROM decision_records WHERE scope_type = 'change' AND scope_id = ?`,
    ).all(changeId),
    contexts: fx.db.prepare(
      `SELECT id, artifact_path, payload_json
       FROM context_envelopes
       WHERE (scope_type = 'change' AND scope_id = ?)
          OR (scope_type = 'task' AND scope_id = ?)`,
    ).all(changeId, taskId),
    packets: fx.db.prepare(
      `SELECT id, packet_path, output_path
       FROM worker_packets WHERE scope_type = 'task' AND scope_id = ?`,
    ).all(taskId),
    checkpoints: fx.db.prepare(
      `SELECT payload_json, evidence_json, diagnostics_json
       FROM stage_checkpoints
       WHERE (scope_type = 'change' AND scope_id = ?)
          OR (scope_type = 'task' AND scope_id = ?)`,
    ).all(changeId, taskId),
    artifacts: fx.db.prepare(
      'SELECT path, metadata_json, provenance_json FROM artifacts WHERE change_id = ?',
    ).all(changeId),
  };
  assert.doesNotMatch(JSON.stringify(authorityRows), new RegExp(
    activeRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ));
  for (const row of authorityRows.contexts) {
    contextEnvelopes.readEnvelope(fx.db, row.id, { rootDir: fx.rootDir });
  }
  for (const row of authorityRows.packets) {
    workerPackets.readWorkerPacket(fx.db, row.id, { rootDir: fx.rootDir });
  }

  const context = await facade.dispatch('ultra.context', {
    stage: 'deliver',
    scope: { change_id: changeId },
    detail: 'summary',
  }, fx.db, { rootDir: fx.rootDir, runtime: 'test' });
  assert.ok(context.envelope.decisions.some((item) => item.id === `${changeId}-decision`));
  assert.ok(context.envelope.checkpoints.some((item) => item.stage === 'deliver'));
  assert.equal(
    fx.db.prepare('SELECT COUNT(*) AS count FROM workflow_runs').get().count,
    0,
    'the public v0.24 path must not create legacy workflow authority',
  );
}

for (const mode of ['greenfield', 'brownfield']) {
  test(`${mode} project completes the v0.24 public kernel without workflow supervision`, async () => {
    const fx = createProject(mode);
    try {
      await convergeBaseline(fx, mode);
      await executeChange(fx, mode);
    } finally {
      closeStateDb(fx.db);
      fs.rmSync(fx.rootDir, { recursive: true, force: true });
    }
  });
}
