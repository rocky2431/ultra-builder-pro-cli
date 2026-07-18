'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const ops = require('./state-ops.cjs');
const changes = require('./change-workflow.cjs');
const baselines = require('./baseline-workflow.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-change-'));
  execFileSync('git', ['init', '-q'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: rootDir });
  fs.writeFileSync(path.join(rootDir, 'README.md'), '# Fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: rootDir });
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  db.prepare(
    `INSERT INTO baselines
     (id, project_name, mode, status, approved_by, approval_note, converged_at)
     VALUES ('test-baseline', 'fixture', 'migrated', 'ready', 'test', 'legacy fixture', ?)`,
  ).run(new Date().toISOString());
  return { rootDir, db };
}

function cleanup({ rootDir, db }) {
  closeStateDb(db);
  fs.rmSync(rootDir, { recursive: true, force: true });
}

function standardEvidence() {
  return [
    { category: 'diff', status: 'pass', evidence: 'git diff reviewed' },
    {
      category: 'tests', status: 'pass', evidence: 'node --test passed',
      seam: 'public change workflow contract',
    },
    { category: 'spec', status: 'pass', evidence: 'delta reconciled' },
    { category: 'docs', status: 'pass', evidence: 'docs/feature.md updated' },
    {
      category: 'review', axis: 'spec_fidelity', status: 'pass',
      evidence: 'Acceptance behavior matches the approved delta.',
    },
    {
      category: 'review', axis: 'engineering_standards', status: 'pass',
      evidence: 'Engineering findings are resolved.',
    },
  ];
}

function incidentEvidence() {
  return [
    { category: 'diagnosis', status: 'pass', evidence: 'Structured diagnosis artifact reviewed.' },
    { category: 'diff', status: 'pass', evidence: 'Root-cause fix diff reviewed.' },
    {
      category: 'tests', status: 'pass', evidence: 'Regression test reproduces then verifies the fix.',
      seam: 'projection recovery boundary',
      signal: {
        command: 'node --test recovery.test.cjs',
        expected_red: 'stale projection remains running',
        observed_red: true,
        observed_green: true,
        deterministic: true,
        duration_ms: 25,
      },
    },
  ];
}

function executionContext(taskId, overrides = {}) {
  return {
    task_id: taskId,
    role: 'implement',
    gate: 'implementation',
    next_action: `Implement and verify ${taskId}.`,
    context_refs: [
      {
        ref: 'README.md', kind: 'spec', reason: 'Public behavior contract', required: true,
      },
    ],
    budget: { max_tokens: 2_000, max_files: 4 },
    execution_contract: {
      slice_kind: 'tracer_bullet',
      public_seam: `public seam for ${taskId}`,
      verification_command: `node --test ${taskId}.test.cjs`,
      context_budget_percent: 40,
    },
    ...overrides,
  };
}

test('createChange persists a change and an inspectable external-provider context manifest', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, {
      id: 'chg-context',
      title: 'Keep context current',
      kind: 'standard',
      intent: 'Add a continuous change lane after project delivery.',
      provider_refs: {
        memory: { provider: 'cloud-mem', reference: 'cmem://project/fixture', status: 'available' },
        code_graph: {
          provider: 'codebase-memory-mcp', project: 'fixture', revision: 'graph-7',
          indexed_head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fx.rootDir, encoding: 'utf8' }).trim(),
          status: 'fresh',
        },
      },
    }, { rootDir: fx.rootDir });

    assert.equal(created.change.status, 'active');
    assert.equal(created.change.kind, 'standard');
    assert.ok(fs.existsSync(created.intent_path));
    assert.ok(fs.existsSync(created.context_manifest_path));

    const manifest = JSON.parse(fs.readFileSync(created.context_manifest_path, 'utf8'));
    assert.equal(manifest.change.id, 'chg-context');
    assert.equal(manifest.providers.memory.provider, 'cloud-mem');
    assert.equal(manifest.providers.code_graph.provider, 'codebase-memory-mcp');
    assert.equal(manifest.providers.code_graph.status, 'fresh');
    assert.equal(JSON.stringify(manifest).includes('prompt'), false);
    assert.equal(JSON.stringify(manifest).includes('transcript'), false);
  } finally {
    cleanup(fx);
  }
});

test('convergeChange blocks incomplete work and marks a fully evidenced standard change ready', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, {
      id: 'chg-converge', title: 'Converge artifacts', kind: 'standard',
      intent: 'Require code, specs, tests, docs, and review evidence to agree.',
    }, { rootDir: fx.rootDir });

    const blocked = changes.convergeChange(fx.db, {
      id: 'chg-converge', evidence: standardEvidence(),
    }, { rootDir: fx.rootDir });
    assert.equal(blocked.ready, false);
    assert.ok(blocked.blockers.includes('NO_TASKS'));
    assert.ok(blocked.blockers.includes('DOCS_IMPACT_UNKNOWN'));
    assert.ok(blocked.blockers.includes('SPEC_DELTA_MISSING'));
    const blockedEvent = fx.db.prepare(
      "SELECT type, change_id FROM events WHERE change_id = ? ORDER BY id DESC LIMIT 1",
    ).get('chg-converge');
    assert.deepEqual(blockedEvent, { type: 'change_blocked', change_id: 'chg-converge' });

    fs.mkdirSync(path.join(fx.rootDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(fx.rootDir, 'docs', 'feature.md'), '# Continuous changes\n');
    const deltaDir = path.join(fx.rootDir, '.ultra', 'changes', 'active', 'chg-converge', 'delta');
    fs.mkdirSync(deltaDir, { recursive: true });
    fs.writeFileSync(path.join(deltaDir, 'product.md'), '# Delta\n\nDaily changes remain traceable.\n');
    fs.writeFileSync(
      path.join(fx.rootDir, '.ultra', 'changes', 'active', 'chg-converge', 'plan.md'),
      '# Plan\n\nImplement and verify the continuous change contract.\n',
    );

    changes.updateChange(fx.db, 'chg-converge', {
      docs_impact: { status: 'required', files: ['docs/feature.md'], rationale: 'User-facing workflow changed.' },
    });
    ops.createTask(fx.db, {
      id: 'change-task', title: 'Implement change lifecycle', type: 'feature', priority: 'P0',
      change_id: 'chg-converge',
    });
    ops.updateTaskStatus(fx.db, 'change-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'change-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-converge', ...executionContext('change-task'),
    }, { rootDir: fx.rootDir });

    const ready = changes.convergeChange(fx.db, {
      id: 'chg-converge', evidence: standardEvidence(),
    }, { rootDir: fx.rootDir });
    assert.equal(ready.ready, true);
    assert.equal(ready.status, 'ready');
    assert.deepEqual(ready.blockers, []);
    assert.ok(fs.existsSync(ready.verification_path));
  } finally {
    cleanup(fx);
  }
});

test('convergeChange requires an approved baseline after active work has remained executable', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, {
      id: 'chg-baseline-gate', title: 'Keep runtime work moving', kind: 'quick',
      intent: 'Defer baseline closure to convergence without losing implementation progress.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal workflow behavior only.' },
    }, { rootDir: fx.rootDir });
    ops.createTask(fx.db, {
      id: 'baseline-gate-task', title: 'Exercise convergence boundary', type: 'feature', priority: 'P0',
      change_id: 'chg-baseline-gate',
    });
    ops.updateTaskStatus(fx.db, 'baseline-gate-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'baseline-gate-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-baseline-gate', ...executionContext('baseline-gate-task'),
    }, { rootDir: fx.rootDir });
    fx.db.prepare('DELETE FROM baselines').run();

    const result = changes.convergeChange(fx.db, {
      id: 'chg-baseline-gate',
      evidence: [
        { category: 'diff', status: 'pass', evidence: 'diff reviewed' },
        { category: 'tests', status: 'pass', evidence: 'workflow regression passed', seam: 'convergence gate' },
        { category: 'spec', status: 'pass', evidence: 'change remains aligned' },
      ],
    }, { rootDir: fx.rootDir });

    assert.equal(result.ready, false);
    assert.ok(result.blockers.includes('BASELINE_MISSING'));
  } finally {
    cleanup(fx);
  }
});

test('archiveChange moves a ready change into immutable history and records baseline reconciliation', () => {
  const fx = fixture();
  try {
    fs.mkdirSync(path.join(fx.rootDir, '.ultra', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(fx.rootDir, '.ultra', 'specs', 'product.md'), '# Product\n\nCurrent behavior.\n');
    fs.writeFileSync(path.join(fx.rootDir, '.ultra', 'specs', 'architecture.md'), '# Architecture\n\nCurrent boundary.\n');
    const fileDigest = (file) => require('node:crypto').createHash('sha256')
      .update(fs.readFileSync(file)).digest('hex');
    fx.db.prepare(
      `UPDATE baselines SET mode = 'brownfield', repository_revision = ?, spec_refs_json = ?
       WHERE id = 'test-baseline'`,
    ).run(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fx.rootDir, encoding: 'utf8' }).trim(),
      JSON.stringify([
        {
          kind: 'product', path: '.ultra/specs/product.md',
          digest: fileDigest(path.join(fx.rootDir, '.ultra', 'specs', 'product.md')),
        },
        {
          kind: 'architecture', path: '.ultra/specs/architecture.md',
          digest: fileDigest(path.join(fx.rootDir, '.ultra', 'specs', 'architecture.md')),
        },
      ]),
    );
    changes.createChange(fx.db, {
      id: 'chg-archive', title: 'Archive verified change', kind: 'quick',
      intent: 'Preserve the completed change as project history.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal test-only behavior.' },
    }, { rootDir: fx.rootDir });
    fs.appendFileSync(
      path.join(fx.rootDir, '.ultra', 'specs', 'product.md'),
      '\nBehavior learned and approved by this change.\n',
    );
    execFileSync('git', ['add', '.ultra/specs/product.md'], { cwd: fx.rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'update baseline behavior'], { cwd: fx.rootDir });
    const changedHead = execFileSync(
      'git', ['rev-parse', 'HEAD'], { cwd: fx.rootDir, encoding: 'utf8' },
    ).trim();
    const drift = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.ok(drift.blockers.includes('BASELINE_HEAD_STALE'));
    assert.ok(drift.blockers.includes('BASELINE_SPEC_STALE:.ultra/specs/product.md'));
    ops.createTask(fx.db, {
      id: 'archive-task', title: 'Complete archive path', type: 'bugfix', priority: 'P1',
      change_id: 'chg-archive',
    });
    ops.updateTaskStatus(fx.db, 'archive-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'archive-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-archive', ...executionContext('archive-task'),
    }, { rootDir: fx.rootDir });
    const converged = changes.convergeChange(fx.db, {
      id: 'chg-archive',
      evidence: [
        { category: 'diff', status: 'pass', evidence: 'diff reviewed' },
        {
          category: 'tests', status: 'pass', evidence: 'tests passed', seam: 'archive command',
          signal: {
            command: 'node --test archive-task.test.cjs', expected_red: 'archive accepts stale context',
            observed_red: true, observed_green: true, deterministic: true, duration_ms: 10,
          },
        },
        { category: 'spec', status: 'not_applicable', evidence: 'No behavior contract changed.' },
      ],
    }, { rootDir: fx.rootDir });
    assert.equal(converged.ready, true);

    const archived = changes.archiveChange(fx.db, {
      id: 'chg-archive', summary: 'Verified quick fix archived.',
      baseline_updates: ['.ultra/specs/product.md'],
    }, { rootDir: fx.rootDir });
    assert.equal(archived.change.status, 'archived');
    assert.ok(fs.existsSync(archived.archive_path));
    assert.equal(fs.existsSync(path.join(fx.rootDir, '.ultra', 'changes', 'active', 'chg-archive')), false);
    const artifacts = fx.db.prepare(
      'SELECT kind, path, status FROM artifacts WHERE change_id = ? ORDER BY kind',
    ).all('chg-archive');
    assert.ok(artifacts.some((artifact) => artifact.kind === 'archive_summary'));
    for (const artifact of artifacts) {
      assert.equal(artifact.status, 'archived');
      assert.doesNotMatch(artifact.path, /changes\/active/);
      assert.ok(fs.existsSync(path.join(fx.rootDir, artifact.path)), artifact.path);
    }
    const reconciliation = fx.db.prepare(
      "SELECT type, payload_json FROM events WHERE type = 'baseline_reconciled' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.equal(reconciliation.type, 'baseline_reconciled');
    assert.deepEqual(JSON.parse(reconciliation.payload_json).baseline_updates, ['.ultra/specs/product.md']);
    const reconciled = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.equal(reconciled.status, 'pass');
    assert.equal(reconciled.baseline.repository_revision, changedHead);
  } finally {
    cleanup(fx);
  }
});

test('archiveChange rolls back when declared reconciliation leaves a tracked specification stale', () => {
  const fx = fixture();
  try {
    const specPath = path.join(fx.rootDir, '.ultra', 'specs', 'product.md');
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.writeFileSync(specPath, '# Product\n\nOriginal behavior.\n');
    const originalHead = execFileSync(
      'git', ['rev-parse', 'HEAD'], { cwd: fx.rootDir, encoding: 'utf8' },
    ).trim();
    const originalDigest = require('node:crypto').createHash('sha256')
      .update(fs.readFileSync(specPath)).digest('hex');
    fx.db.prepare(
      `UPDATE baselines SET mode = 'brownfield', repository_revision = ?, spec_refs_json = ?
       WHERE id = 'test-baseline'`,
    ).run(originalHead, JSON.stringify([
      { kind: 'product', path: '.ultra/specs/product.md', digest: originalDigest },
    ]));
    changes.createChange(fx.db, {
      id: 'chg-reconcile-rollback', title: 'Reject incomplete reconciliation', kind: 'quick',
      intent: 'Keep the active change recoverable until every tracked specification is reconciled.',
      docs_impact: { status: 'none', files: [], rationale: 'Workflow integrity only.' },
    }, { rootDir: fx.rootDir });
    fs.appendFileSync(specPath, '\nChanged behavior that must be declared.\n');
    execFileSync('git', ['add', '.ultra/specs/product.md'], { cwd: fx.rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'change tracked product spec'], { cwd: fx.rootDir });
    ops.createTask(fx.db, {
      id: 'reconcile-rollback-task', title: 'Exercise archive rollback', type: 'feature', priority: 'P0',
      change_id: 'chg-reconcile-rollback',
    });
    ops.updateTaskStatus(fx.db, 'reconcile-rollback-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'reconcile-rollback-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-reconcile-rollback', ...executionContext('reconcile-rollback-task'),
    }, { rootDir: fx.rootDir });
    const converged = changes.convergeChange(fx.db, {
      id: 'chg-reconcile-rollback',
      evidence: [
        { category: 'diff', status: 'pass', evidence: 'archive diff reviewed' },
        {
          category: 'tests', status: 'pass', evidence: 'archive rollback regression passed',
          seam: 'archive reconciliation boundary',
        },
        { category: 'spec', status: 'pass', evidence: 'tracked specification change identified' },
      ],
    }, { rootDir: fx.rootDir });
    assert.equal(converged.ready, true);

    assert.throws(
      () => changes.archiveChange(fx.db, {
        id: 'chg-reconcile-rollback', summary: 'Attempt an incomplete archive.',
        no_baseline_change_reason: 'No baseline update declared.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_RECONCILIATION_INCOMPLETE'
        && error.details.blockers.includes('BASELINE_SPEC_STALE:.ultra/specs/product.md'),
    );

    const active = changes.readChange(fx.db, 'chg-reconcile-rollback');
    assert.equal(active.status, 'ready');
    assert.ok(fs.existsSync(path.join(fx.rootDir, active.artifact_root)));
    assert.equal(fs.existsSync(path.join(fx.rootDir, active.artifact_root, 'archive-summary.md')), false);
    assert.equal(baselines.readBaseline(fx.db).repository_revision, originalHead);
    const reconciliationEvents = fx.db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE type = 'baseline_reconciled' AND change_id = ?",
    ).get('chg-reconcile-rollback');
    assert.equal(reconciliationEvents.count, 0);
  } finally {
    cleanup(fx);
  }
});

test('provider references reject embedded memory or graph payloads', () => {
  const fx = fixture();
  try {
    assert.throws(
      () => changes.createChange(fx.db, {
        id: 'chg-provider-content', title: 'Reject provider payload', kind: 'quick',
        intent: 'Keep external provider content outside Ultra state.',
        provider_refs: {
          memory: { provider: 'cloud-mem', status: 'available', content: 'captured transcript' },
        },
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'PROVIDER_CONTENT_FORBIDDEN',
    );
  } finally {
    cleanup(fx);
  }
});

test('createChange rejects whitespace-only title and intent outside the MCP boundary', () => {
  const fx = fixture();
  try {
    assert.throws(
      () => changes.createChange(fx.db, {
        id: 'chg-empty-title', title: '   ', kind: 'quick', intent: 'Valid intent.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
    assert.throws(
      () => changes.createChange(fx.db, {
        id: 'chg-empty-intent', title: 'Valid title', kind: 'quick', intent: '\t',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
  } finally {
    cleanup(fx);
  }
});

test('updateChange keeps intent.md synchronized with authoritative change metadata', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, {
      id: 'chg-update-intent', title: 'Original title', kind: 'quick',
      intent: 'Original intent.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal-only change.' },
    }, { rootDir: fx.rootDir });

    changes.updateChange(fx.db, 'chg-update-intent', {
      title: 'Updated title',
      intent: 'Updated intent with current acceptance behavior.',
      docs_impact: { status: 'required', files: ['README.md'], rationale: 'Usage changed.' },
    }, { rootDir: fx.rootDir });

    const text = fs.readFileSync(created.intent_path, 'utf8');
    assert.match(text, /^# Updated title/m);
    assert.match(text, /Updated intent with current acceptance behavior\./);
    assert.match(text, /Documentation impact: `required`/);
    const artifact = fx.db.prepare(
      "SELECT content_hash FROM artifacts WHERE change_id = ? AND kind = 'intent'",
    ).get('chg-update-intent');
    assert.match(artifact.content_hash, /^[0-9a-f]{64}$/);
  } finally {
    cleanup(fx);
  }
});

test('updateChange rejects whitespace-only title or intent outside the MCP boundary', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, {
      id: 'chg-update-validation', title: 'Valid title', kind: 'quick',
      intent: 'Valid intent.',
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => changes.updateChange(fx.db, 'chg-update-validation', { title: '   ' }, { rootDir: fx.rootDir }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
    assert.throws(
      () => changes.updateChange(fx.db, 'chg-update-validation', { intent: '\t' }, { rootDir: fx.rootDir }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
  } finally {
    cleanup(fx);
  }
});

test('incident changes create a durable structured diagnosis artifact', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, {
      id: 'chg-incident-diagnosis', title: 'Diagnose runtime failure', kind: 'incident',
      intent: 'Reproduce and fix the runtime failure at its root cause.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal runtime repair.' },
    }, { rootDir: fx.rootDir });

    const diagnosisPath = path.join(path.dirname(created.intent_path), 'diagnosis.md');
    assert.ok(fs.existsSync(diagnosisPath));
    const text = fs.readFileSync(diagnosisPath, 'utf8');
    for (const heading of ['Reproduction', 'Hypotheses', 'Root cause', 'Regression test', 'Recovery']) {
      assert.match(text, new RegExp(`^## ${heading}$`, 'm'));
    }
    const artifact = fx.db.prepare(
      "SELECT kind, path, content_hash FROM artifacts WHERE change_id = ? AND kind = 'diagnosis'",
    ).get('chg-incident-diagnosis');
    assert.equal(artifact.kind, 'diagnosis');
    assert.match(artifact.content_hash, /^[0-9a-f]{64}$/);
    assert.equal(path.join(fx.rootDir, artifact.path), diagnosisPath);
  } finally {
    cleanup(fx);
  }
});

test('incident convergence requires every structured diagnosis section and refreshes its artifact hash', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, {
      id: 'chg-incident-converge', title: 'Converge runtime diagnosis', kind: 'incident',
      intent: 'Require inspectable debugging evidence before incident closure.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal runtime repair.' },
    }, { rootDir: fx.rootDir });
    ops.createTask(fx.db, {
      id: 'incident-task', title: 'Fix diagnosed failure', type: 'bugfix', priority: 'P0',
      change_id: 'chg-incident-converge',
    });
    ops.updateTaskStatus(fx.db, 'incident-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'incident-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-incident-converge', ...executionContext('incident-task'),
    }, { rootDir: fx.rootDir });

    const blocked = changes.convergeChange(fx.db, {
      id: 'chg-incident-converge', evidence: incidentEvidence(),
    }, { rootDir: fx.rootDir });
    assert.equal(blocked.ready, false);
    assert.ok(blocked.blockers.includes('DIAGNOSIS_SECTION_MISSING:reproduction'));
    assert.ok(blocked.blockers.includes('DIAGNOSIS_SECTION_MISSING:root-cause'));

    const diagnosisPath = path.join(path.dirname(created.intent_path), 'diagnosis.md');
    const beforeHash = fx.db.prepare(
      "SELECT content_hash FROM artifacts WHERE change_id = ? AND kind = 'diagnosis'",
    ).get('chg-incident-converge').content_hash;
    fs.writeFileSync(diagnosisPath, [
      '# Incident diagnosis: Converge runtime diagnosis', '',
      '## Reproduction', '', 'The projection worker fails after an interrupted claim.', '',
      '## Hypotheses', '', 'A stale running job is never returned to the pending queue.', '',
      '## Root cause', '', 'Boot recovery did not consume interrupted projection state.', '',
      '## Regression test', '', 'The test seeds a stale running job and verifies requeue.', '',
      '## Recovery', '', 'Requeue the job after the stale cutoff and replay projection.', '',
    ].join('\n'));

    const ready = changes.convergeChange(fx.db, {
      id: 'chg-incident-converge', evidence: incidentEvidence(),
    }, { rootDir: fx.rootDir });
    assert.equal(ready.ready, true);
    const afterHash = fx.db.prepare(
      "SELECT content_hash FROM artifacts WHERE change_id = ? AND kind = 'diagnosis'",
    ).get('chg-incident-converge').content_hash;
    assert.notEqual(afterHash, beforeHash);
    assert.equal(
      afterHash,
      require('node:crypto').createHash('sha256').update(fs.readFileSync(diagnosisPath)).digest('hex'),
    );
  } finally {
    cleanup(fx);
  }
});

test('compileContext v2 persists role-scoped context, budget, execution contract, and breadcrumb in state.db', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, {
      id: 'chg-context-v2', title: 'Compile role context', kind: 'standard',
      intent: 'Give each execution role only the context it needs.',
    }, { rootDir: fx.rootDir });
    ops.createTask(fx.db, {
      id: 'context-v2-task', title: 'Build role-scoped manifest', type: 'feature', priority: 'P0',
      change_id: 'chg-context-v2',
    });

    const compiled = changes.compileContext(fx.db, {
      id: 'chg-context-v2',
      ...executionContext('context-v2-task'),
    }, { rootDir: fx.rootDir });

    assert.equal(compiled.manifest.schema_version, '2.0');
    assert.equal(compiled.manifest.role, 'implement');
    assert.equal(compiled.manifest.gate, 'implementation');
    assert.equal(compiled.manifest.readiness.status, 'ready');
    assert.equal(compiled.manifest.context.items[0].ref, 'README.md');
    assert.match(compiled.manifest.context.items[0].digest, /^[0-9a-f]{64}$/);
    assert.equal(compiled.manifest.execution_contract.slice_kind, 'tracer_bullet');
    assert.equal(compiled.manifest.resume.task_id, 'context-v2-task');
    assert.match(compiled.manifest.next_action, /Implement and verify/);

    const snapshot = fx.db.prepare(
      'SELECT role, gate, next_action, readiness, context_json, token_budget FROM context_snapshots ORDER BY created_at DESC LIMIT 1',
    ).get();
    assert.equal(snapshot.role, 'implement');
    assert.equal(snapshot.gate, 'implementation');
    assert.equal(snapshot.readiness, 'ready');
    assert.equal(snapshot.token_budget, 2_000);
    assert.equal(JSON.parse(snapshot.context_json).execution_contract.public_seam, 'public seam for context-v2-task');

    const breadcrumb = changes.readBreadcrumb(fx.db, { id: 'chg-context-v2' }, { rootDir: fx.rootDir });
    assert.equal(breadcrumb.change_id, 'chg-context-v2');
    assert.equal(breadcrumb.task_id, 'context-v2-task');
    assert.equal(breadcrumb.role, 'implement');
    assert.equal(breadcrumb.readiness, 'ready');
    assert.match(breadcrumb.context_manifest_hash, /^[0-9a-f]{64}$/);
  } finally {
    cleanup(fx);
  }
});

test('compileContext blocks a required missing ref', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, {
      id: 'chg-context-budget', title: 'Bound context packet', kind: 'quick',
      intent: 'Fail closed when required context is missing while reporting size pressure.',
    }, { rootDir: fx.rootDir });
    ops.createTask(fx.db, {
      id: 'budget-task', title: 'Compile bounded packet', type: 'bugfix', priority: 'P0',
      change_id: 'chg-context-budget',
    });

    const compiled = changes.compileContext(fx.db, {
      id: 'chg-context-budget',
      ...executionContext('budget-task', {
        context_refs: [
          { ref: 'missing-contract.md', kind: 'spec', reason: 'Required contract', required: true },
          { ref: 'README.md', kind: 'source', reason: 'Current implementation', required: true },
        ],
        budget: { max_tokens: 2_000, max_files: 4 },
      }),
    }, { rootDir: fx.rootDir });

    assert.equal(compiled.manifest.readiness.status, 'blocked');
    assert.ok(compiled.manifest.readiness.blockers.includes('CONTEXT_REQUIRED_REF_MISSING:missing-contract.md'));
  } finally {
    cleanup(fx);
  }
});

test('an incident can proceed with four necessary large files while context budgets remain advisory', () => {
  const fx = fixture();
  try {
    const refs = [];
    for (let index = 1; index <= 4; index += 1) {
      const ref = `incident-runtime-${index}.cjs`;
      fs.writeFileSync(path.join(fx.rootDir, ref), 'x'.repeat(8_000));
      refs.push({
        ref, kind: 'source', reason: `Required incident runtime boundary ${index}`, required: true,
      });
    }
    changes.createChange(fx.db, {
      id: 'chg-incident-context', title: 'Recover IM runtime', kind: 'incident',
      intent: 'Keep an urgent root-cause fix executable when its required files exceed guidance.',
    }, { rootDir: fx.rootDir });
    ops.createTask(fx.db, {
      id: 'incident-context-task', title: 'Repair IM terminal transition', type: 'bugfix', priority: 'P0',
      change_id: 'chg-incident-context',
    });

    const compiled = changes.compileContext(fx.db, {
      id: 'chg-incident-context',
      ...executionContext('incident-context-task', {
        context_refs: refs,
        budget: { max_tokens: 100, max_files: 2 },
        execution_contract: {
          slice_kind: 'tracer_bullet',
          public_seam: 'IM terminal transition',
          verification_command: 'node --test im-terminal.test.cjs',
          context_budget_percent: 80,
        },
      }),
    }, { rootDir: fx.rootDir });

    assert.equal(compiled.manifest.readiness.status, 'ready');
    assert.deepEqual(compiled.manifest.readiness.blockers, []);
    assert.ok(compiled.manifest.readiness.warnings.includes('CONTEXT_FILE_BUDGET_EXCEEDED'));
    assert.ok(compiled.manifest.readiness.warnings.includes('CONTEXT_TOKEN_BUDGET_EXCEEDED'));
    assert.ok(compiled.manifest.readiness.warnings.includes('EXECUTION_CONTEXT_BUDGET_ADVISORY'));
    assert.equal(compiled.manifest.context.file_count, 4);
    assert.ok(compiled.manifest.context.token_estimate > 100);
  } finally {
    cleanup(fx);
  }
});

test('spec-learning candidates are approval-gated and unresolved candidates block convergence', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, {
      id: 'chg-learning', title: 'Converge learned contract', kind: 'quick',
      intent: 'Promote stable implementation discoveries into an approved baseline update.',
      docs_impact: { status: 'none', files: [], rationale: 'Fixture exercises the approval state machine.' },
    }, { rootDir: fx.rootDir });
    ops.createTask(fx.db, {
      id: 'learning-task', title: 'Capture stable contract', type: 'bugfix', priority: 'P0',
      change_id: 'chg-learning',
    });
    ops.updateTaskStatus(fx.db, 'learning-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'learning-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-learning', ...executionContext('learning-task'),
    }, { rootDir: fx.rootDir });

    const proposed = changes.proposeSpecLearning(fx.db, {
      id: 'learning-1', change_id: 'chg-learning', task_id: 'learning-task',
      target_ref: 'README.md#contract', summary: 'The public command fails closed on stale context.',
      evidence: ['node --test learning-task.test.cjs'],
    }, { rootDir: fx.rootDir });
    assert.equal(proposed.status, 'proposed');

    const blocked = changes.convergeChange(fx.db, {
      id: 'chg-learning',
      evidence: [
        { category: 'diff', status: 'pass', evidence: 'diff reviewed' },
        {
          category: 'tests', status: 'pass', evidence: 'regression passed', seam: 'public command',
          signal: {
            command: 'node --test learning-task.test.cjs', expected_red: 'stale context accepted',
            observed_red: true, observed_green: true, deterministic: true, duration_ms: 20,
          },
        },
        { category: 'spec', status: 'pass', evidence: 'candidate recorded' },
      ],
    }, { rootDir: fx.rootDir });
    assert.ok(blocked.blockers.includes('SPEC_LEARNING_UNRESOLVED:learning-1'));

    assert.equal(changes.resolveSpecLearning(fx.db, {
      change_id: 'chg-learning', candidate_id: 'learning-1', decision: 'approve',
      resolution: 'Stable public contract.',
    }, { rootDir: fx.rootDir }).status, 'approved');
    assert.equal(changes.resolveSpecLearning(fx.db, {
      change_id: 'chg-learning', candidate_id: 'learning-1', decision: 'apply',
      resolution: 'Applied to README.md#contract.',
    }, { rootDir: fx.rootDir }).status, 'applied');

    const projection = JSON.parse(fs.readFileSync(
      path.join(fx.rootDir, '.ultra', 'changes', 'active', 'chg-learning', 'spec-learning.json'),
      'utf8',
    ));
    assert.equal(projection.source, '.ultra/state.db');
    assert.equal(projection.candidates[0].status, 'applied');
  } finally {
    cleanup(fx);
  }
});
