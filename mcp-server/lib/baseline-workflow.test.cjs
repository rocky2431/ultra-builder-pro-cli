'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const baselines = require('./baseline-workflow.cjs');
const checkpoints = require('./stage-checkpoints.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-baseline-'));
  execFileSync('git', ['init', '-q'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: rootDir });
  fs.mkdirSync(path.join(rootDir, '.ultra', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'discovery.md'), '# Discovery\n\nObserved evidence.\n');
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'product.md'), '# Product\n\nObserved behavior.\n');
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'architecture.md'), '# Architecture\n\nCurrent boundary.\n');
  fs.writeFileSync(path.join(rootDir, 'src', 'index.js'), 'module.exports = true;\n');
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: rootDir });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim();
  const { db } = initStateDb(
    path.join(rootDir, '.ultra', '.runtime', 'state.db'),
  );
  return { rootDir, db, revision };
}

function cleanup(fx) {
  closeStateDb(fx.db);
  fs.rmSync(fx.rootDir, { recursive: true, force: true });
}

function adoptionEvidence() {
  return {
    spec_refs: [
      { kind: 'discovery', path: '.ultra/specs/discovery.md' },
      { kind: 'product', path: '.ultra/specs/product.md' },
      { kind: 'architecture', path: '.ultra/specs/architecture.md' },
    ],
    evidence: [
      { kind: 'source', ref: 'src/index.js', summary: 'Current public module entry point.' },
      { kind: 'docs', ref: '.ultra/specs/product.md', summary: 'Observed behavior baseline.' },
    ],
    verification: [
      { name: 'module smoke', command: 'node -e "require(\'./src\')"', status: 'pass', evidence: 'exit 0' },
    ],
    unknowns: [],
  };
}

function completeResearch(fx, baselineId, mode = 'adoption') {
  const report = path.join('.ultra', 'docs', 'research', baselineId, 'summary.md');
  fs.mkdirSync(path.dirname(path.join(fx.rootDir, report)), { recursive: true });
  fs.writeFileSync(path.join(fx.rootDir, report), [
    '# Research checkpoint evidence',
    '',
    'The fixture specifications and source evidence have been inspected.',
    '',
  ].join('\n'));
  const draft = checkpoints.saveDraft(fx.db, {
    stage: 'research',
    scope: { baseline_id: baselineId },
    payload: {
      mode,
      summary: 'Complete the baseline research contract.',
    },
    evidence: [{
      kind: 'docs',
      ref: report,
      summary: 'Fixture research synthesis.',
    }],
    diagnostics: [],
    idempotency_key: `research-${baselineId}:draft`,
  });
  return checkpoints.acceptDraft(fx.db, {
    id: draft.id,
    idempotency_key: `research-${baselineId}:accept`,
  });
}

test('brownfield baseline converges only after current specs, source evidence, verification, and approval', () => {
  const fx = fixture();
  try {
    const started = baselines.startBaseline(fx.db, {
      id: 'project-baseline', project_name: 'fixture', project_type: 'cli', stack: 'node',
      mode: 'brownfield', repository_revision: fx.revision, scope: ['.'],
    }, { rootDir: fx.rootDir });
    assert.equal(started.status, 'adopting');

    completeResearch(fx, started.id);

    const recorded = baselines.recordBaseline(fx.db, {
      id: started.id, repository_revision: fx.revision, ...adoptionEvidence(),
    }, { rootDir: fx.rootDir });
    assert.match(recorded.spec_refs[0].digest, /^[0-9a-f]{64}$/);
    assert.equal(recorded.evidence[0].summary, 'Current public module entry point.');

    const converged = baselines.convergeBaseline(fx.db, {
      id: started.id,
      expected_revision: fx.revision,
      approved_by: 'project-owner',
      approval_note: 'The captured baseline matches the current checkout.',
      accept_known_red: false,
    }, { rootDir: fx.rootDir });
    assert.deepEqual(converged.blockers, []);
    assert.equal(converged.ready, true);
    assert.equal(converged.baseline.status, 'ready');
    assert.equal(converged.baseline.approved_by, 'project-owner');
    assert.equal(converged.baseline.known_red_accepted, false);
  } finally {
    cleanup(fx);
  }
});

test('known-red acceptance is durable authority and is revalidated after convergence', () => {
  const fx = fixture();
  try {
    const baseline = baselines.startBaseline(fx.db, {
      id: 'known-red-baseline', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision,
    }, { rootDir: fx.rootDir });
    completeResearch(fx, baseline.id);
    baselines.recordBaseline(fx.db, {
      id: baseline.id,
      repository_revision: fx.revision,
      ...adoptionEvidence(),
      verification: [{
        name: 'legacy suite', command: 'npm test', status: 'known_red',
        evidence: 'Two stable failures predate adoption.',
        rationale: 'Accepted as tracked baseline debt.',
      }],
    }, { rootDir: fx.rootDir });
    const converged = baselines.convergeBaseline(fx.db, {
      id: baseline.id, expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Accept the known baseline failures.',
      accept_known_red: true,
    }, { rootDir: fx.rootDir });
    assert.equal(converged.ready, true);
    assert.equal(converged.baseline.known_red_accepted, true);
    assert.equal(baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir }).status, 'pass');

    fx.db.prepare(
      "UPDATE baselines SET known_red_accepted = 0 WHERE id = 'known-red-baseline'",
    ).run();
    const invalid = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.equal(invalid.status, 'fail');
    assert.ok(invalid.blockers.includes('BASELINE_KNOWN_RED_NOT_ACCEPTED:legacy suite'));
  } finally {
    cleanup(fx);
  }
});

test('a ready status row cannot bypass the complete baseline authority contract', () => {
  const fx = fixture();
  try {
    const now = new Date().toISOString();
    fx.db.prepare(
      `INSERT INTO baselines
       (id, project_name, mode, status, scope_json, approved_by, approval_note,
        research_run_id, converged_at)
       VALUES ('forged-ready', 'fixture', 'greenfield', 'ready', '[]', '', '',
               'forged-research', ?)`,
    ).run(now);
    const health = baselines.inspectBaseline(fx.db, {
      rootDir: fx.rootDir, id: 'forged-ready',
    });
    assert.equal(health.status, 'fail');
    for (const blocker of [
      'BASELINE_SCOPE_MISSING',
      'BASELINE_SPEC_MISSING:discovery',
      'BASELINE_SPEC_MISSING:product',
      'BASELINE_SPEC_MISSING:architecture',
      'BASELINE_EVIDENCE_MISSING',
      'BASELINE_VERIFICATION_MISSING',
      'BASELINE_REVISION_MISSING',
      'BASELINE_APPROVER_MISSING',
      'BASELINE_APPROVAL_NOTE_MISSING',
    ]) assert.ok(health.blockers.includes(blocker), `missing ${blocker}`);
    assert.ok(health.blockers.includes('BASELINE_RESEARCH_RECORD_INVALID'));
  } finally {
    cleanup(fx);
  }
});

test('baseline convergence records deterministic blockers for missing evidence and unaccepted known-red verification', () => {
  const fx = fixture();
  try {
    baselines.startBaseline(fx.db, {
      id: 'blocked-baseline', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision,
    }, { rootDir: fx.rootDir });
    baselines.recordBaseline(fx.db, {
      id: 'blocked-baseline',
      repository_revision: fx.revision,
      spec_refs: [{ kind: 'product', path: '.ultra/specs/product.md' }],
      evidence: [],
      verification: [{
        name: 'legacy suite', command: 'npm test', status: 'known_red',
        evidence: 'Two failures predate adoption.', rationale: 'Tracked as existing debt.',
      }],
      unknowns: [{ summary: 'Production authorization behavior is not verified.', blocking: true }],
    }, { rootDir: fx.rootDir });

    const result = baselines.convergeBaseline(fx.db, {
      id: 'blocked-baseline', expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Review attempted.', accept_known_red: false,
    }, { rootDir: fx.rootDir });
    assert.equal(result.ready, false);
    assert.equal(result.status, 'blocked');
    assert.ok(result.blockers.includes('BASELINE_SPEC_MISSING:architecture'));
    assert.ok(result.blockers.includes('BASELINE_SPEC_MISSING:discovery'));
    assert.ok(result.blockers.includes('BASELINE_RESEARCH_INCOMPLETE'));
    assert.ok(result.blockers.includes('BASELINE_SOURCE_EVIDENCE_MISSING'));
    assert.ok(result.blockers.includes('BASELINE_KNOWN_RED_NOT_ACCEPTED:legacy suite'));
    assert.ok(result.blockers.includes('BASELINE_UNKNOWN_BLOCKING:Production authorization behavior is not verified.'));
  } finally {
    cleanup(fx);
  }
});

test('baseline stores provider metadata only and detects specification drift after convergence', () => {
  const fx = fixture();
  try {
    baselines.startBaseline(fx.db, {
      id: 'provider-baseline', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision,
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => baselines.recordBaseline(fx.db, {
        id: 'provider-baseline',
        provider_refs: { memory: { provider: 'cloud-mem', content: 'captured prompt' } },
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'PROVIDER_CONTENT_FORBIDDEN',
    );
    completeResearch(fx, 'provider-baseline');
    baselines.recordBaseline(fx.db, {
      id: 'provider-baseline', repository_revision: fx.revision,
      provider_refs: { memory: { provider: 'cloud-mem', reference: 'cmem://fixture', status: 'fresh' } },
      ...adoptionEvidence(),
    }, { rootDir: fx.rootDir });
    baselines.convergeBaseline(fx.db, {
      id: 'provider-baseline', expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Approved current behavior.',
    }, { rootDir: fx.rootDir });

    fs.appendFileSync(path.join(fx.rootDir, '.ultra', 'specs', 'product.md'), '\nChanged outside convergence.\n');
    const health = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.equal(health.status, 'fail');
    assert.ok(health.blockers.includes('BASELINE_SPEC_STALE:.ultra/specs/product.md'));
  } finally {
    cleanup(fx);
  }
});

test('re-adoption requires explicit replacement and supersedes the prior ready baseline', () => {
  const fx = fixture();
  try {
    const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    fx.db.prepare(
      `INSERT INTO baselines
       (id, project_name, mode, status, repository_revision, spec_refs_json, evidence_json, verification_json,
        approved_by, approval_note, converged_at)
       VALUES (?, ?, 'brownfield', 'ready', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'ready-baseline', 'fixture', fx.revision,
      JSON.stringify([
        { kind: 'product', path: '.ultra/specs/product.md', digest: digest(path.join(fx.rootDir, '.ultra/specs/product.md')) },
        { kind: 'architecture', path: '.ultra/specs/architecture.md', digest: digest(path.join(fx.rootDir, '.ultra/specs/architecture.md')) },
      ]),
      JSON.stringify([{ kind: 'source', ref: 'src/index.js', summary: 'Current entry point.' }]),
      JSON.stringify([{ name: 'smoke', command: 'node -e "require(\'./src\')"', status: 'pass', evidence: 'exit 0' }]),
      'owner', 'approved', new Date().toISOString(),
    );

    assert.throws(
      () => baselines.startBaseline(fx.db, {
        id: 'replacement', project_name: 'fixture', mode: 'brownfield', repository_revision: fx.revision,
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_EXISTS',
    );
    assert.throws(
      () => baselines.startBaseline(fx.db, {
        id: 'replacement', project_name: 'fixture', mode: 'brownfield',
        repository_revision: fx.revision, replace_ready: true,
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_REPLACEMENT_AUTHORIZATION_REQUIRED',
    );
    const replacement = baselines.startBaseline(fx.db, {
      id: 'replacement', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision, replace_ready: true,
      replacement_authorization: {
        approved_by: 'project-owner',
        reason: 'The maintained system boundary changed and requires a new evidence baseline.',
      },
    }, { rootDir: fx.rootDir });
    assert.equal(replacement.status, 'adopting');
    assert.equal(baselines.readBaseline(fx.db, 'ready-baseline').status, 'superseded');
    const supersededHealth = baselines.inspectBaseline(fx.db, {
      rootDir: fx.rootDir, id: 'ready-baseline',
    });
    assert.ok(supersededHealth.blockers.includes('BASELINE_NOT_READY:superseded'));
    const event = fx.db.prepare(
      "SELECT payload_json FROM events WHERE type = 'baseline_started' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.deepEqual(JSON.parse(event.payload_json).replacement_authorization, {
      approved_by: 'project-owner',
      reason: 'The maintained system boundary changed and requires a new evidence baseline.',
      recorded_at: replacement.started_at,
    });
  } finally {
    cleanup(fx);
  }
});

test('greenfield baseline derives a stable workspace revision when Git is not initialized', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-greenfield-baseline-'));
  fs.mkdirSync(path.join(rootDir, '.ultra', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'discovery.md'), '# Discovery\n\nAccepted evidence.\n');
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'product.md'), '# Product\n\nAccepted intent.\n');
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'architecture.md'), '# Architecture\n\nAccepted constraints.\n');
  const { db } = initStateDb(
    path.join(rootDir, '.ultra', '.runtime', 'state.db'),
  );
  try {
    baselines.startBaseline(db, {
      id: 'greenfield', project_name: 'new-project', mode: 'greenfield', scope: ['.'],
    }, { rootDir });
    completeResearch({ rootDir, db }, 'greenfield', 'full');
    const recorded = baselines.recordBaseline(db, {
      id: 'greenfield',
      spec_refs: [
        { kind: 'discovery', path: '.ultra/specs/discovery.md' },
        { kind: 'product', path: '.ultra/specs/product.md' },
        { kind: 'architecture', path: '.ultra/specs/architecture.md' },
      ],
      evidence: [{ kind: 'docs', ref: '.ultra/specs/product.md', summary: 'Owner-approved product intent.' }],
      verification: [{
        name: 'spec review', command: 'review baseline specifications', status: 'pass',
        evidence: 'Product and architecture contracts agree.',
      }],
      unknowns: [],
    }, { rootDir });
    assert.match(recorded.repository_revision, /^workspace:[0-9a-f]{64}$/);
    const result = baselines.convergeBaseline(db, {
      id: 'greenfield', expected_revision: recorded.repository_revision,
      approved_by: 'owner', approval_note: 'Approved before planning.',
    }, { rootDir });
    assert.equal(result.ready, true);
  } finally {
    closeStateDb(db);
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('an initialized but unborn Git repository must receive an owner-authorized checkpoint commit before baseline recording', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-unborn-baseline-'));
  fs.mkdirSync(path.join(rootDir, '.ultra', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'discovery.md'), '# Discovery\n\nAccepted evidence.\n');
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'product.md'), '# Product\n\nAccepted intent.\n');
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'architecture.md'), '# Architecture\n\nAccepted constraints.\n');
  fs.writeFileSync(path.join(rootDir, '.gitignore'), '.ultra/\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: rootDir });
  const { db } = initStateDb(
    path.join(rootDir, '.ultra', '.runtime', 'state.db'),
  );
  try {
    const snapshot = baselines.gitWorktreeSnapshot(rootDir, ['.']);
    assert.equal(snapshot.state, 'unborn');
    assert.equal(snapshot.head, null);
    assert.equal(snapshot.branch, 'main');
    assert.ok(snapshot.files.some((item) => item.includes('.gitignore')));

    baselines.startBaseline(db, {
      id: 'unborn', project_name: 'new-project', mode: 'greenfield', scope: ['.'],
    }, { rootDir });
    completeResearch({ rootDir, db }, 'unborn', 'full');
    assert.throws(
      () => baselines.recordBaseline(db, {
        id: 'unborn',
        spec_refs: [
          { kind: 'discovery', path: '.ultra/specs/discovery.md' },
          { kind: 'product', path: '.ultra/specs/product.md' },
          { kind: 'architecture', path: '.ultra/specs/architecture.md' },
        ],
        evidence: [{
          kind: 'docs', ref: '.ultra/specs/product.md', summary: 'Owner-approved product intent.',
        }],
        verification: [{
          name: 'spec review', command: 'review baseline specifications', status: 'pass',
          evidence: 'Product and architecture contracts agree.',
        }],
        unknowns: [],
      }, { rootDir }),
      (error) => error.code === 'BASELINE_GIT_HEAD_REQUIRED',
    );

    execFileSync('git', ['add', '.gitignore'], { cwd: rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'chore: establish project repository'], { cwd: rootDir });
    const revision = execFileSync(
      'git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8',
      },
    ).trim();
    const recorded = baselines.recordBaseline(db, {
      id: 'unborn', repository_revision: revision,
      spec_refs: [
        { kind: 'discovery', path: '.ultra/specs/discovery.md' },
        { kind: 'product', path: '.ultra/specs/product.md' },
        { kind: 'architecture', path: '.ultra/specs/architecture.md' },
      ],
      evidence: [{
        kind: 'docs', ref: '.ultra/specs/product.md', summary: 'Owner-approved product intent.',
      }],
      verification: [{
        name: 'spec review', command: 'review baseline specifications', status: 'pass',
        evidence: 'Product and architecture contracts agree.',
      }],
      unknowns: [],
    }, { rootDir });
    assert.equal(recorded.repository_revision, revision);
    assert.equal(recorded.worktree_state, 'clean');
  } finally {
    closeStateDb(db);
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('brownfield evidence and scope must resolve to current project files', () => {
  const fx = fixture();
  try {
    assert.throws(
      () => baselines.startBaseline(fx.db, {
        id: 'missing-scope', project_name: 'fixture', mode: 'brownfield',
        scope: ['src/does-not-exist'], repository_revision: fx.revision,
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_SCOPE_MISSING',
    );

    baselines.startBaseline(fx.db, {
      id: 'missing-source', project_name: 'fixture', mode: 'brownfield',
      scope: ['src'], repository_revision: fx.revision,
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => baselines.recordBaseline(fx.db, {
        id: 'missing-source', repository_revision: fx.revision,
        spec_refs: adoptionEvidence().spec_refs,
        evidence: [{
          kind: 'source', ref: 'src/does-not-exist.js', summary: 'Claimed entry point.',
        }],
        verification: adoptionEvidence().verification,
        unknowns: [],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_EVIDENCE_MISSING',
    );
  } finally {
    cleanup(fx);
  }
});

test('brownfield convergence rejects a dirty checkout outside Ultra state', () => {
  const fx = fixture();
  try {
    baselines.startBaseline(fx.db, {
      id: 'dirty-baseline', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision, scope: ['src'],
    }, { rootDir: fx.rootDir });
    baselines.recordBaseline(fx.db, {
      id: 'dirty-baseline', repository_revision: fx.revision, ...adoptionEvidence(),
    }, { rootDir: fx.rootDir });
    fs.appendFileSync(path.join(fx.rootDir, 'src', 'index.js'), 'throw new Error("dirty");\n');

    const result = baselines.convergeBaseline(fx.db, {
      id: 'dirty-baseline', expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Approve only a clean checkout.',
    }, { rootDir: fx.rootDir });
    assert.equal(result.ready, false);
    assert.ok(result.blockers.includes('BASELINE_WORKTREE_DIRTY'));
    assert.ok(result.blockers.includes('BASELINE_EVIDENCE_STALE:src/index.js'));
  } finally {
    cleanup(fx);
  }
});

test('a scoped monorepo baseline records only dirty files inside the selected scope', () => {
  const fx = fixture();
  try {
    fs.mkdirSync(path.join(fx.rootDir, 'packages', 'api'), { recursive: true });
    fs.mkdirSync(path.join(fx.rootDir, 'packages', 'web'), { recursive: true });
    fs.writeFileSync(path.join(fx.rootDir, 'packages', 'api', 'index.js'), 'module.exports = "api";\n');
    fs.writeFileSync(path.join(fx.rootDir, 'packages', 'web', 'index.js'), 'module.exports = "web";\n');
    execFileSync('git', ['add', 'packages'], { cwd: fx.rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'add workspaces'], { cwd: fx.rootDir });
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: fx.rootDir, encoding: 'utf8',
    }).trim();

    fs.appendFileSync(path.join(fx.rootDir, 'packages', 'web', 'index.js'), '// unrelated work\n');
    const started = baselines.startBaseline(fx.db, {
      id: 'scoped-dirty', project_name: 'fixture', mode: 'brownfield',
      repository_revision: revision, scope: ['packages/api'],
    }, { rootDir: fx.rootDir });
    assert.equal(started.worktree_state, 'clean');
    assert.deepEqual(started.worktree_files, []);

    fs.appendFileSync(path.join(fx.rootDir, 'packages', 'api', 'index.js'), '// adopted work\n');
    const recorded = baselines.recordBaseline(fx.db, {
      id: started.id, repository_revision: revision,
    }, { rootDir: fx.rootDir });
    assert.equal(recorded.worktree_state, 'dirty');
    assert.ok(recorded.worktree_files.some((entry) => entry.includes('packages/api/index.js')));
    assert.equal(
      recorded.worktree_files.some((entry) => entry.includes('packages/web/index.js')),
      false,
    );
  } finally { cleanup(fx); }
});

test('ready baseline detects source evidence drift without a new commit', () => {
  const fx = fixture();
  try {
    baselines.startBaseline(fx.db, {
      id: 'source-drift', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision, scope: ['src'],
    }, { rootDir: fx.rootDir });
    completeResearch(fx, 'source-drift');
    const recorded = baselines.recordBaseline(fx.db, {
      id: 'source-drift', repository_revision: fx.revision, ...adoptionEvidence(),
    }, { rootDir: fx.rootDir });
    assert.match(recorded.evidence[0].digest, /^[0-9a-f]{64}$/);
    baselines.convergeBaseline(fx.db, {
      id: 'source-drift', expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Approved clean source evidence.',
    }, { rootDir: fx.rootDir });

    fs.writeFileSync(path.join(fx.rootDir, 'src', 'index.js'), 'throw new Error("regression");\n');
    const health = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.equal(health.status, 'fail');
    assert.ok(health.blockers.includes('BASELINE_WORKTREE_DIRTY'));
    assert.ok(health.blockers.includes('BASELINE_EVIDENCE_STALE:src/index.js'));
  } finally {
    cleanup(fx);
  }
});

test('ready baseline accepts descendant commits that only publish Ultra task metadata', () => {
  const fx = fixture();
  try {
    baselines.startBaseline(fx.db, {
      id: 'metadata-only', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision, scope: ['.'],
    }, { rootDir: fx.rootDir });
    completeResearch(fx, 'metadata-only');
    baselines.recordBaseline(fx.db, {
      id: 'metadata-only', repository_revision: fx.revision, ...adoptionEvidence(),
    }, { rootDir: fx.rootDir });
    baselines.convergeBaseline(fx.db, {
      id: 'metadata-only', expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Approve source and specification evidence.',
    }, { rootDir: fx.rootDir });

    fs.mkdirSync(path.join(fx.rootDir, '.ultra', 'tasks'), { recursive: true });
    fs.writeFileSync(
      path.join(fx.rootDir, '.ultra', 'tasks', 'tasks.json'),
      '{"kind":"ultra-team-task-ledger","tasks":[]}\n',
    );
    execFileSync('git', ['add', '.ultra/tasks/tasks.json'], { cwd: fx.rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'chore: publish Ultra task ledger'], {
      cwd: fx.rootDir,
    });

    const health = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.equal(health.status, 'pass');
    assert.equal(health.blockers.includes('BASELINE_HEAD_STALE'), false);
    assert.equal(health.blockers.includes('BASELINE_WORKTREE_STALE'), false);
  } finally {
    cleanup(fx);
  }
});

test('ready baseline rejects a descendant commit that changes scoped source', () => {
  const fx = fixture();
  try {
    baselines.startBaseline(fx.db, {
      id: 'source-commit', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision, scope: ['src'],
    }, { rootDir: fx.rootDir });
    completeResearch(fx, 'source-commit');
    baselines.recordBaseline(fx.db, {
      id: 'source-commit', repository_revision: fx.revision, ...adoptionEvidence(),
    }, { rootDir: fx.rootDir });
    baselines.convergeBaseline(fx.db, {
      id: 'source-commit', expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Approve current source evidence.',
    }, { rootDir: fx.rootDir });

    fs.appendFileSync(path.join(fx.rootDir, 'src', 'index.js'), '// committed drift\n');
    execFileSync('git', ['add', 'src/index.js'], { cwd: fx.rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'feat: change scoped source'], {
      cwd: fx.rootDir,
    });

    const health = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.equal(health.status, 'fail');
    assert.ok(health.blockers.includes('BASELINE_HEAD_STALE'));
    assert.ok(health.blockers.includes('BASELINE_EVIDENCE_STALE:src/index.js'));
  } finally {
    cleanup(fx);
  }
});

test('scoped content digest is stable across unstaged, staged, and committed representations', () => {
  const fx = fixture();
  try {
    fs.appendFileSync(path.join(fx.rootDir, 'src', 'index.js'), '// same bytes\n');
    const unstaged = baselines.gitWorktreeSnapshot(fx.rootDir, ['src']);
    execFileSync('git', ['add', 'src/index.js'], { cwd: fx.rootDir });
    const staged = baselines.gitWorktreeSnapshot(fx.rootDir, ['src']);
    execFileSync('git', ['commit', '-q', '-m', 'test: preserve content bytes'], {
      cwd: fx.rootDir,
    });
    const committed = baselines.gitWorktreeSnapshot(fx.rootDir, ['src']);

    assert.equal(staged.digest, unstaged.digest);
    assert.equal(committed.digest, unstaged.digest);
    assert.equal(unstaged.state, 'dirty');
    assert.equal(staged.state, 'dirty');
    assert.equal(committed.state, 'clean');
  } finally {
    cleanup(fx);
  }
});

test('ready baseline without its completed research provenance is not healthy authority', () => {
  const fx = fixture();
  try {
    baselines.startBaseline(fx.db, {
      id: 'missing-provenance', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision, scope: ['src'],
    }, { rootDir: fx.rootDir });
    completeResearch(fx, 'missing-provenance');
    baselines.recordBaseline(fx.db, {
      id: 'missing-provenance', repository_revision: fx.revision, ...adoptionEvidence(),
    }, { rootDir: fx.rootDir });
    const converged = baselines.convergeBaseline(fx.db, {
      id: 'missing-provenance', expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Approve the recorded baseline.',
    }, { rootDir: fx.rootDir });
    assert.equal(converged.ready, true);
    fx.db.prepare(
      `UPDATE baselines
       SET research_run_id = NULL, research_checkpoint_id = NULL
       WHERE id = 'missing-provenance'`,
    ).run();

    const health = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.equal(health.status, 'fail');
    assert.ok(health.blockers.includes('BASELINE_RESEARCH_PROVENANCE_MISSING'));
  } finally {
    cleanup(fx);
  }
});

test('ready baseline becomes unhealthy when its accepted research checkpoint is superseded', () => {
  const fx = fixture();
  try {
    const baseline = baselines.startBaseline(fx.db, {
      id: 'research-drift', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision,
    }, { rootDir: fx.rootDir });
    const research = completeResearch(fx, baseline.id);
    baselines.recordBaseline(fx.db, {
      id: baseline.id, repository_revision: fx.revision, ...adoptionEvidence(),
    }, { rootDir: fx.rootDir });
    const converged = baselines.convergeBaseline(fx.db, {
      id: baseline.id, expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Approve immutable research provenance.',
    }, { rootDir: fx.rootDir });
    assert.equal(converged.ready, true);

    const revised = checkpoints.saveDraft(fx.db, {
      stage: 'research',
      scope: { baseline_id: baseline.id },
      payload: { mode: 'adoption', summary: 'Revised research after baseline approval.' },
      evidence: research.evidence,
      diagnostics: [],
      idempotency_key: 'research-drift:revision-2',
    });
    checkpoints.acceptDraft(fx.db, {
      id: revised.id,
      idempotency_key: 'research-drift:revision-2:accept',
    });
    const health = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.equal(health.status, 'fail');
    assert.ok(health.blockers.includes('BASELINE_RESEARCH_RECORD_INVALID'));
  } finally {
    cleanup(fx);
  }
});

test('migrated compatibility baseline requires explicit brownfield re-adoption', () => {
  const fx = fixture();
  try {
    fx.db.prepare(
      `INSERT INTO baselines
       (id, project_name, mode, status, approved_by, approval_note, converged_at)
       VALUES ('migrated-baseline', 'legacy', 'migrated', 'ready',
               'schema-migration', 'compatibility row', ?)`,
    ).run(new Date().toISOString());
    const health = baselines.inspectBaseline(fx.db, {
      rootDir: fx.rootDir, id: 'migrated-baseline',
    });
    assert.equal(health.status, 'fail');
    assert.deepEqual(health.blockers, ['BASELINE_MIGRATION_REVIEW_REQUIRED']);
  } finally {
    cleanup(fx);
  }
});

test('open gap-ledger blockers prevent adoption while accepted debt remains visible', () => {
  const fx = fixture();
  try {
    baselines.startBaseline(fx.db, {
      id: 'gap-baseline', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision, scope: ['src'],
    }, { rootDir: fx.rootDir });
    completeResearch(fx, 'gap-baseline');
    const recorded = baselines.recordBaseline(fx.db, {
      id: 'gap-baseline', repository_revision: fx.revision, ...adoptionEvidence(),
      gaps: [
        {
          id: 'missing-auth-proof', category: 'baseline_blocker', status: 'open',
          summary: 'Authorization authority has not been verified.', blocking: true,
          evidence_refs: ['src/index.js'], owner: 'security-owner',
        },
        {
          id: 'legacy-test-debt', category: 'technical_debt', status: 'accepted',
          summary: 'Legacy integration tests are slow.', blocking: false,
          evidence_refs: ['npm test'], owner: 'maintainers',
        },
      ],
    }, { rootDir: fx.rootDir });
    assert.deepEqual(recorded.gaps.map((gap) => gap.id), [
      'missing-auth-proof', 'legacy-test-debt',
    ]);

    const result = baselines.convergeBaseline(fx.db, {
      id: 'gap-baseline', expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Reviewed the evidence ledger.',
    }, { rootDir: fx.rootDir });
    assert.equal(result.ready, false);
    assert.ok(result.blockers.includes('BASELINE_GAP_BLOCKING:missing-auth-proof'));
  } finally { cleanup(fx); }
});

test('a dirty adoption snapshot requires explicit acceptance and remains drift-detectable', () => {
  const fx = fixture();
  try {
    fs.appendFileSync(path.join(fx.rootDir, 'src', 'index.js'), '// accepted local patch\n');
    baselines.startBaseline(fx.db, {
      id: 'dirty-accepted', project_name: 'fixture', mode: 'brownfield',
      repository_revision: fx.revision, scope: ['src'],
    }, { rootDir: fx.rootDir });
    completeResearch(fx, 'dirty-accepted');
    const recorded = baselines.recordBaseline(fx.db, {
      id: 'dirty-accepted', repository_revision: fx.revision, ...adoptionEvidence(),
    }, { rootDir: fx.rootDir });
    assert.equal(recorded.worktree_state, 'dirty');
    assert.match(recorded.worktree_digest, /^[0-9a-f]{64}$/);

    const rejected = baselines.convergeBaseline(fx.db, {
      id: 'dirty-accepted', expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Review dirty adoption snapshot.',
    }, { rootDir: fx.rootDir });
    assert.ok(rejected.blockers.includes('BASELINE_DIRTY_WORKTREE_NOT_ACCEPTED'));

    const accepted = baselines.convergeBaseline(fx.db, {
      id: 'dirty-accepted', expected_revision: fx.revision,
      approved_by: 'project-owner', approval_note: 'Accept the recorded local patch as baseline evidence.',
      accept_dirty_worktree: true,
    }, { rootDir: fx.rootDir });
    assert.equal(accepted.ready, true);
    assert.equal(accepted.baseline.worktree_accepted, true);

    fs.appendFileSync(path.join(fx.rootDir, 'src', 'index.js'), '// later drift\n');
    const health = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.ok(health.blockers.includes('BASELINE_WORKTREE_STALE'));
  } finally { cleanup(fx); }
});

test('a migrated compatibility row can only be superseded by explicit brownfield re-adoption', () => {
  const fx = fixture();
  try {
    fx.db.prepare(
      `INSERT INTO baselines (id, project_name, mode, status)
       VALUES ('migrated-baseline', 'legacy', 'migrated', 'adopting')`,
    ).run();
    assert.throws(
      () => baselines.startBaseline(fx.db, {
        id: 'replacement', project_name: 'fixture', mode: 'brownfield', scope: ['src'],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_IN_PROGRESS',
    );
    assert.throws(
      () => baselines.startBaseline(fx.db, {
        id: 'wrong-mode', project_name: 'fixture', mode: 'greenfield', scope: ['src'],
        replace_migrated: true,
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_REPLACEMENT_INVALID',
    );
    const replacement = baselines.startBaseline(fx.db, {
      id: 'replacement', project_name: 'fixture', mode: 'brownfield', scope: ['src'],
      replace_migrated: true,
    }, { rootDir: fx.rootDir });
    assert.equal(replacement.status, 'adopting');
    assert.equal(baselines.readBaseline(fx.db, 'migrated-baseline').status, 'superseded');
  } finally { cleanup(fx); }
});
