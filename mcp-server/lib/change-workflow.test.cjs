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

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-change-'));
  execFileSync('git', ['init', '-q'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: rootDir });
  fs.writeFileSync(path.join(rootDir, 'README.md'), '# Fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: rootDir });
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  return { rootDir, db };
}

function cleanup({ rootDir, db }) {
  closeStateDb(db);
  fs.rmSync(rootDir, { recursive: true, force: true });
}

function standardEvidence() {
  return [
    { category: 'diff', status: 'pass', evidence: 'git diff reviewed' },
    { category: 'tests', status: 'pass', evidence: 'node --test passed' },
    { category: 'spec', status: 'pass', evidence: 'delta reconciled' },
    { category: 'docs', status: 'pass', evidence: 'docs/feature.md updated' },
    { category: 'review', status: 'pass', evidence: 'review findings resolved' },
  ];
}

function incidentEvidence() {
  return [
    { category: 'diagnosis', status: 'pass', evidence: 'Structured diagnosis artifact reviewed.' },
    { category: 'diff', status: 'pass', evidence: 'Root-cause fix diff reviewed.' },
    { category: 'tests', status: 'pass', evidence: 'Regression test reproduces then verifies the fix.' },
  ];
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
    changes.compileContext(fx.db, { id: 'chg-converge' }, { rootDir: fx.rootDir });

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

test('archiveChange moves a ready change into immutable history and records baseline reconciliation', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, {
      id: 'chg-archive', title: 'Archive verified change', kind: 'quick',
      intent: 'Preserve the completed change as project history.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal test-only behavior.' },
    }, { rootDir: fx.rootDir });
    ops.createTask(fx.db, {
      id: 'archive-task', title: 'Complete archive path', type: 'bugfix', priority: 'P1',
      change_id: 'chg-archive',
    });
    ops.updateTaskStatus(fx.db, 'archive-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'archive-task', 'completed');
    changes.compileContext(fx.db, { id: 'chg-archive' }, { rootDir: fx.rootDir });
    const converged = changes.convergeChange(fx.db, {
      id: 'chg-archive',
      evidence: [
        { category: 'diff', status: 'pass', evidence: 'diff reviewed' },
        { category: 'tests', status: 'pass', evidence: 'tests passed' },
        { category: 'spec', status: 'not_applicable', evidence: 'No behavior contract changed.' },
      ],
    }, { rootDir: fx.rootDir });
    assert.equal(converged.ready, true);

    const archived = changes.archiveChange(fx.db, {
      id: 'chg-archive', summary: 'Verified quick fix archived.',
      no_baseline_change_reason: 'No canonical spec changed.',
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
    changes.compileContext(fx.db, { id: 'chg-incident-converge' }, { rootDir: fx.rootDir });

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
