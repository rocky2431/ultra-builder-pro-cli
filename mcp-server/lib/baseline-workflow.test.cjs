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

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-baseline-'));
  execFileSync('git', ['init', '-q'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: rootDir });
  fs.mkdirSync(path.join(rootDir, '.ultra', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'product.md'), '# Product\n\nObserved behavior.\n');
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'architecture.md'), '# Architecture\n\nCurrent boundary.\n');
  fs.writeFileSync(path.join(rootDir, 'src', 'index.js'), 'module.exports = true;\n');
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: rootDir });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim();
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  return { rootDir, db, revision };
}

function cleanup(fx) {
  closeStateDb(fx.db);
  fs.rmSync(fx.rootDir, { recursive: true, force: true });
}

function adoptionEvidence() {
  return {
    spec_refs: [
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

test('brownfield baseline converges only after current specs, source evidence, verification, and approval', () => {
  const fx = fixture();
  try {
    const started = baselines.startBaseline(fx.db, {
      id: 'project-baseline', project_name: 'fixture', project_type: 'cli', stack: 'node',
      mode: 'brownfield', repository_revision: fx.revision, scope: ['.'],
    }, { rootDir: fx.rootDir });
    assert.equal(started.status, 'adopting');

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
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'product.md'), '# Product\n\nAccepted intent.\n');
  fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'architecture.md'), '# Architecture\n\nAccepted constraints.\n');
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    baselines.startBaseline(db, {
      id: 'greenfield', project_name: 'new-project', mode: 'greenfield', scope: ['.'],
    }, { rootDir });
    const recorded = baselines.recordBaseline(db, {
      id: 'greenfield',
      spec_refs: [
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
