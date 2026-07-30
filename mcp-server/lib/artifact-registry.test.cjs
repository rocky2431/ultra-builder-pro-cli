'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const ops = require('./state-ops.cjs');
const artifacts = require('./artifact-registry.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-artifacts-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  return { rootDir, db };
}

function cleanup({ rootDir, db }) {
  closeStateDb(db);
  fs.rmSync(rootDir, { recursive: true, force: true });
}

function write(rootDir, relative, contents) {
  const file = path.join(rootDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return file;
}

function endpoint(type, id, relation) {
  return { type, id, relation };
}

test('artifact.record persists typed ownership, provenance, digest, and normalized edges', () => {
  const fx = fixture();
  try {
    ops.createTask(fx.db, {
      id: 'artifact-consumer', title: 'Consume artifact', type: 'feature', priority: 'P1',
    });
    write(fx.rootDir, '.ultra/specs/product.md', '# Product\n');

    const recorded = artifacts.recordArtifact(fx.db, {
      owner_type: 'project',
      owner_id: 'project',
      kind: 'spec',
      path: '.ultra/specs/product.md',
      provenance: { actor: 'model', workflow_run_id: 'research-1' },
      source_refs: [endpoint('external', 'owner-decision:scope', 'decided_by')],
      consumer_refs: [endpoint('task', 'artifact-consumer', 'consumed_by')],
    }, { rootDir: fx.rootDir });

    assert.equal(recorded.changed, true);
    assert.equal(recorded.artifact.owner_type, 'project');
    assert.equal(recorded.artifact.owner_id, 'project');
    assert.equal(recorded.artifact.before_digest, null);
    assert.match(recorded.artifact.after_digest, /^[a-f0-9]{64}$/);
    assert.equal(recorded.artifact.digest, recorded.artifact.after_digest);
    assert.deepEqual(recorded.artifact.provenance, {
      actor: 'model', workflow_run_id: 'research-1',
    });
    assert.deepEqual(recorded.artifact.source_refs, [
      endpoint('external', 'owner-decision:scope', 'decided_by'),
    ]);
    assert.deepEqual(recorded.artifact.consumer_refs, [
      endpoint('task', 'artifact-consumer', 'consumed_by'),
    ]);

    const fetched = artifacts.getArtifact(fx.db, { id: recorded.artifact.id });
    assert.deepEqual(fetched, recorded.artifact);
    assert.equal(
      fx.db.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'artifact_recorded'",
      ).get().count,
      1,
    );
    assert.equal(
      fx.db.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'spec_changed'",
      ).get().count,
      0,
      'first registration is not a change to an existing specification',
    );
  } finally {
    cleanup(fx);
  }
});

test('artifact.record rolls back when current bytes mutate in place before publication commits', () => {
  const fx = fixture();
  try {
    const file = write(fx.rootDir, '.ultra/specs/mutable.md', '# Before\n');
    fx.db.function('mutate_artifact_file', () => {
      fs.writeFileSync(file, '# Mutated during publication\n');
      return 1;
    });
    fx.db.exec(
      `CREATE TEMP TRIGGER mutate_artifact_before_insert
       BEFORE INSERT ON artifacts
       BEGIN
         SELECT mutate_artifact_file();
       END`,
    );

    assert.throws(
      () => artifacts.recordArtifact(fx.db, {
        id: 'artifact-mutable',
        owner_type: 'project',
        owner_id: 'project',
        kind: 'spec',
        path: '.ultra/specs/mutable.md',
        provenance: { actor: 'test' },
        source_refs: [],
        consumer_refs: [],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ARTIFACT_DIGEST_CONFLICT',
    );
    assert.equal(
      fx.db.prepare("SELECT COUNT(*) AS count FROM artifacts WHERE id = 'artifact-mutable'").get().count,
      0,
    );
    assert.equal(
      fx.db.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'artifact_recorded'",
      ).get().count,
      0,
    );
  } finally {
    cleanup(fx);
  }
});

test('artifact.record replaces edges transactionally and invalidates only exact downstream consumers', () => {
  const fx = fixture();
  try {
    for (const id of ['old-consumer', 'new-consumer', 'unrelated']) {
      ops.createTask(fx.db, {
        id, title: `Task ${id}`, type: 'feature', priority: 'P1',
      });
    }
    write(fx.rootDir, '.ultra/specs/architecture.md', '# Architecture v1\n');
    const first = artifacts.recordArtifact(fx.db, {
      id: 'artifact-architecture',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'spec',
      path: '.ultra/specs/architecture.md',
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [endpoint('task', 'old-consumer', 'specified_by')],
    }, { rootDir: fx.rootDir });

    write(fx.rootDir, '.ultra/specs/architecture.md', '# Architecture v2\n');
    const second = artifacts.recordArtifact(fx.db, {
      id: 'artifact-architecture',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'spec',
      path: '.ultra/specs/architecture.md',
      expected_before_digest: first.artifact.digest,
      provenance: { actor: 'model', reason: 'accepted change' },
      source_refs: [endpoint('external', 'change:accepted', 'derived_from')],
      consumer_refs: [endpoint('task', 'new-consumer', 'specified_by')],
    }, { rootDir: fx.rootDir });

    assert.equal(second.artifact.before_digest, first.artifact.digest);
    assert.notEqual(second.artifact.after_digest, first.artifact.digest);
    assert.deepEqual(
      second.invalidated.map((item) => `${item.type}:${item.id}`).sort(),
      ['task:new-consumer', 'task:old-consumer'],
    );
    assert.equal(ops.readTask(fx.db, 'old-consumer').stale, true);
    assert.equal(ops.readTask(fx.db, 'new-consumer').stale, true);
    assert.equal(ops.readTask(fx.db, 'unrelated').stale, false);
    assert.deepEqual(second.artifact.consumer_refs, [
      endpoint('task', 'new-consumer', 'specified_by'),
    ]);
    const oldEdge = fx.db.prepare(
      `SELECT COUNT(*) AS count FROM artifact_edges
       WHERE source_type = 'artifact' AND source_id = ?
         AND target_type = 'task' AND target_id = 'old-consumer'`,
    ).get(first.artifact.id);
    assert.equal(oldEdge.count, 0, 'removed consumer edges must not accumulate');

    const specEvent = fx.db.prepare(
      "SELECT payload_json FROM events WHERE type = 'spec_changed' ORDER BY id DESC LIMIT 1",
    ).get();
    const payload = JSON.parse(specEvent.payload_json);
    assert.equal(payload.artifact_id, first.artifact.id);
    assert.equal(payload.before_digest, first.artifact.digest);
    assert.equal(payload.after_digest, second.artifact.digest);
    assert.deepEqual(payload.sections, ['.ultra/specs/architecture.md']);
  } finally {
    cleanup(fx);
  }
});

test('updating an active draft artifact reopens its workflow instead of self-invalidating it', () => {
  const fx = fixture();
  try {
    fx.db.prepare(
      `INSERT INTO workflow_runs
       (id, kind, subject, definition_version, status, metadata_json, blockers_json, summary_json)
       VALUES ('draft-workflow', 'plan', 'Mutable plan draft', '20.0', 'ready', '{}', '[]', '{}')`,
    ).run();
    write(fx.rootDir, '.ultra/changes/active/draft/plan.md', '# Plan v1\n');
    const first = artifacts.recordArtifact(fx.db, {
      id: 'draft-plan',
      owner_type: 'workflow',
      owner_id: 'draft-workflow',
      kind: 'execution_plan_markdown',
      path: '.ultra/changes/active/draft/plan.md',
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [endpoint('workflow', 'draft-workflow', 'verified_by')],
    }, { rootDir: fx.rootDir });

    write(fx.rootDir, '.ultra/changes/active/draft/plan.md', '# Plan v2\n');
    artifacts.recordArtifact(fx.db, {
      id: 'draft-plan',
      owner_type: 'workflow',
      owner_id: 'draft-workflow',
      kind: 'execution_plan_markdown',
      path: '.ultra/changes/active/draft/plan.md',
      expected_before_digest: first.artifact.digest,
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [endpoint('workflow', 'draft-workflow', 'verified_by')],
    }, { rootDir: fx.rootDir });

    const row = fx.db.prepare(
      "SELECT status, metadata_json FROM workflow_runs WHERE id = 'draft-workflow'",
    ).get();
    const metadata = JSON.parse(row.metadata_json);
    assert.equal(row.status, 'active');
    assert.equal(metadata.draft_dirty, true);
    assert.equal(metadata.authority_invalidation, undefined);
  } finally {
    cleanup(fx);
  }
});

test('artifact.record rejects an invalid replacement without changing the prior row or edges', () => {
  const fx = fixture();
  try {
    ops.createTask(fx.db, {
      id: 'valid-consumer', title: 'Valid consumer', type: 'feature', priority: 'P1',
    });
    write(fx.rootDir, '.ultra/specs/api.md', '# API v1\n');
    const first = artifacts.recordArtifact(fx.db, {
      id: 'artifact-api',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'spec',
      path: '.ultra/specs/api.md',
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [endpoint('task', 'valid-consumer', 'specified_by')],
    }, { rootDir: fx.rootDir });
    write(fx.rootDir, '.ultra/specs/api.md', '# API v2\n');

    assert.throws(
      () => artifacts.recordArtifact(fx.db, {
        id: 'artifact-api',
        owner_type: 'project',
        owner_id: 'project',
        kind: 'spec',
        path: '.ultra/specs/api.md',
        expected_before_digest: first.artifact.digest,
        provenance: { actor: 'model' },
        source_refs: [],
        consumer_refs: [endpoint('task', 'missing-consumer', 'specified_by')],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ARTIFACT_ENDPOINT_MISSING',
    );

    const after = artifacts.getArtifact(fx.db, { id: 'artifact-api' });
    assert.equal(after.digest, first.artifact.digest);
    assert.deepEqual(after.consumer_refs, [
      endpoint('task', 'valid-consumer', 'specified_by'),
    ]);
  } finally {
    cleanup(fx);
  }
});

test('artifact.record rejects an explicit id when the same authority already has another id', () => {
  const fx = fixture();
  try {
    write(fx.rootDir, '.ultra/specs/security.md', '# Security\n');
    const first = artifacts.recordArtifact(fx.db, {
      id: 'artifact-security',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'spec',
      path: '.ultra/specs/security.md',
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [],
      status: 'terminal',
    }, { rootDir: fx.rootDir });

    assert.throws(
      () => artifacts.recordArtifact(fx.db, {
        id: 'artifact-security-alias',
        owner_type: 'project',
        owner_id: 'project',
        kind: 'spec',
        path: '.ultra/specs/security.md',
        provenance: { actor: 'model' },
        source_refs: [],
        consumer_refs: [],
        status: 'terminal',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ARTIFACT_AUTHORITY_CONFLICT',
    );
    assert.equal(
      fx.db.prepare('SELECT COUNT(*) AS count FROM artifacts').get().count,
      1,
    );
    assert.equal(
      artifacts.getArtifact(fx.db, { id: first.artifact.id }).id,
      'artifact-security',
    );
  } finally {
    cleanup(fx);
  }
});

test('artifact.get rejects an ambiguous path instead of choosing a silent authority', () => {
  const fx = fixture();
  try {
    write(fx.rootDir, '.ultra/specs/shared.md', '# Shared\n');
    artifacts.recordArtifact(fx.db, {
      id: 'artifact-shared-spec',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'spec',
      path: '.ultra/specs/shared.md',
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [],
      status: 'terminal',
    }, { rootDir: fx.rootDir });
    fx.db.exec('DROP INDEX IF EXISTS artifacts_one_active_path');
    const digest = artifacts.digestFile(path.join(fx.rootDir, '.ultra/specs/shared.md'));
    fx.db.prepare(
      `INSERT INTO artifacts
       (id, owner_type, owner_id, kind, path, digest, content_hash, after_digest,
        status, provenance_json, managed)
       VALUES ('artifact-shared-evidence', 'project', 'project', 'evidence',
               '.ultra/specs/shared.md', ?, ?, ?, 'terminal', '{}', 1)`,
    ).run(digest, digest, digest);

    assert.throws(
      () => artifacts.getArtifact(fx.db, { path: '.ultra/specs/shared.md' }),
      (error) => error.code === 'ARTIFACT_DUPLICATE_AUTHORITY',
    );
  } finally {
    cleanup(fx);
  }
});

test('artifact.record enforces one active authority for a canonical path across owners and kinds', () => {
  const fx = fixture();
  try {
    ops.createTask(fx.db, {
      id: 'path-owner', title: 'Path owner', type: 'feature', priority: 'P1',
    });
    write(fx.rootDir, '.ultra/specs/canonical.md', '# Canonical\n');
    const first = artifacts.recordArtifact(fx.db, {
      id: 'artifact-canonical',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'spec',
      path: './.ultra/specs/canonical.md',
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [endpoint('task', 'path-owner', 'consumed_by')],
    }, { rootDir: fx.rootDir });

    assert.equal(first.artifact.path, '.ultra/specs/canonical.md');
    assert.throws(
      () => artifacts.recordArtifact(fx.db, {
        id: 'artifact-canonical-alias',
        owner_type: 'task',
        owner_id: 'path-owner',
        kind: 'evidence',
        path: '.ultra/specs/canonical.md',
        provenance: { actor: 'model' },
        source_refs: [],
        consumer_refs: [endpoint('task', 'path-owner', 'consumed_by')],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ARTIFACT_AUTHORITY_CONFLICT',
    );
    assert.equal(
      fx.db.prepare(
        "SELECT COUNT(*) AS count FROM artifacts WHERE path = '.ultra/specs/canonical.md'",
      ).get().count,
      1,
    );
  } finally {
    cleanup(fx);
  }
});

test('artifact invalidation traverses task and artifact intermediates to exact terminal tasks', () => {
  const fx = fixture();
  try {
    for (const id of ['bridge-task', 'terminal-task', 'unrelated-task']) {
      ops.createTask(fx.db, {
        id, title: id, type: 'feature', priority: 'P1',
      });
    }
    write(fx.rootDir, '.ultra/specs/downstream.md', '# Downstream\n');
    const downstream = artifacts.recordArtifact(fx.db, {
      id: 'artifact-downstream',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'derived-spec',
      path: '.ultra/specs/downstream.md',
      provenance: { actor: 'model' },
      source_refs: [endpoint('task', 'bridge-task', 'derived_from')],
      consumer_refs: [endpoint('task', 'terminal-task', 'consumed_by')],
    }, { rootDir: fx.rootDir });
    write(fx.rootDir, '.ultra/specs/upstream.md', '# Upstream v1\n');
    const upstream = artifacts.recordArtifact(fx.db, {
      id: 'artifact-upstream',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'source-spec',
      path: '.ultra/specs/upstream.md',
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [endpoint('task', 'bridge-task', 'consumed_by')],
    }, { rootDir: fx.rootDir });

    write(fx.rootDir, '.ultra/specs/upstream.md', '# Upstream v2\n');
    const updated = artifacts.recordArtifact(fx.db, {
      id: 'artifact-upstream',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'source-spec',
      path: '.ultra/specs/upstream.md',
      expected_before_digest: upstream.artifact.digest,
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [endpoint('task', 'bridge-task', 'consumed_by')],
    }, { rootDir: fx.rootDir });

    assert.deepEqual(
      updated.invalidated.map((item) => `${item.type}:${item.id}`).sort(),
      [
        'artifact:artifact-downstream',
        'task:bridge-task',
        'task:terminal-task',
      ],
    );
    assert.equal(
      artifacts.getArtifact(fx.db, { id: downstream.artifact.id }).status,
      'stale',
    );
    assert.equal(ops.readTask(fx.db, 'bridge-task').stale, true);
    assert.equal(ops.readTask(fx.db, 'terminal-task').stale, true);
    assert.equal(ops.readTask(fx.db, 'unrelated-task').stale, false);
  } finally {
    cleanup(fx);
  }
});

test('artifact.record rejects self-edges and graph cycles without changing prior edges', () => {
  const fx = fixture();
  try {
    ops.createTask(fx.db, {
      id: 'cycle-bridge', title: 'Cycle bridge', type: 'feature', priority: 'P1',
    });
    write(fx.rootDir, '.ultra/specs/cycle-a.md', '# A\n');
    artifacts.recordArtifact(fx.db, {
      id: 'artifact-cycle-a',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'spec-a',
      path: '.ultra/specs/cycle-a.md',
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [endpoint('task', 'cycle-bridge', 'consumed_by')],
    }, { rootDir: fx.rootDir });

    assert.throws(
      () => artifacts.recordArtifact(fx.db, {
        id: 'artifact-cycle-a',
        owner_type: 'project',
        owner_id: 'project',
        kind: 'spec-a',
        path: '.ultra/specs/cycle-a.md',
        provenance: { actor: 'model' },
        source_refs: [],
        consumer_refs: [endpoint('artifact', 'artifact-cycle-a', 'consumed_by')],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ARTIFACT_GRAPH_SELF_EDGE',
    );

    write(fx.rootDir, '.ultra/specs/cycle-b.md', '# B\n');
    assert.throws(
      () => artifacts.recordArtifact(fx.db, {
        id: 'artifact-cycle-b',
        owner_type: 'project',
        owner_id: 'project',
        kind: 'spec-b',
        path: '.ultra/specs/cycle-b.md',
        provenance: { actor: 'model' },
        source_refs: [endpoint('task', 'cycle-bridge', 'derived_from')],
        consumer_refs: [endpoint('artifact', 'artifact-cycle-a', 'feeds')],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ARTIFACT_GRAPH_CYCLE',
    );
    assert.equal(
      fx.db.prepare("SELECT COUNT(*) AS count FROM artifacts WHERE id = 'artifact-cycle-b'").get().count,
      0,
    );
    assert.deepEqual(
      artifacts.getArtifact(fx.db, { id: 'artifact-cycle-a' }).consumer_refs,
      [endpoint('task', 'cycle-bridge', 'consumed_by')],
    );
  } finally {
    cleanup(fx);
  }
});

test('artifact.record rejects runtime and scratch files outside semantic authority', () => {
  const fx = fixture();
  try {
    for (const relative of [
      '.ultra/.runtime/debug/observation.md',
      '.ultra/scratch/note.md',
      '.ultra/tasks/contexts/task-generated.md',
    ]) {
      write(fx.rootDir, relative, '# local only\n');
      assert.throws(
        () => artifacts.recordArtifact(fx.db, {
          owner_type: 'project',
          owner_id: 'project',
          kind: 'spec',
          path: relative,
          provenance: { actor: 'model' },
          source_refs: [],
          consumer_refs: [],
          status: 'terminal',
        }, { rootDir: fx.rootDir }),
        (error) => error.code === 'ARTIFACT_PATH_EXEMPT',
      );
    }
  } finally {
    cleanup(fx);
  }
});

test('artifact authority rejects final and ancestor symlinks that leave the project', () => {
  const fx = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-artifacts-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'final.md'), '# outside final\n');
    fs.mkdirSync(path.join(fx.rootDir, '.ultra', 'specs'), { recursive: true });
    fs.symlinkSync(
      path.join(outside, 'final.md'),
      path.join(fx.rootDir, '.ultra', 'specs', 'final.md'),
    );
    assert.throws(
      () => artifacts.recordArtifact(fx.db, {
        owner_type: 'project',
        owner_id: 'project',
        kind: 'spec',
        path: '.ultra/specs/final.md',
        provenance: { actor: 'model' },
        source_refs: [],
        consumer_refs: [],
        status: 'terminal',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ARTIFACT_PATH_INVALID',
    );

    fs.rmSync(path.join(fx.rootDir, '.ultra', 'specs'), { recursive: true, force: true });
    fs.symlinkSync(outside, path.join(fx.rootDir, '.ultra', 'specs'), 'dir');
    assert.throws(
      () => artifacts.recordArtifact(fx.db, {
        owner_type: 'project',
        owner_id: 'project',
        kind: 'spec',
        path: '.ultra/specs/final.md',
        provenance: { actor: 'model' },
        source_refs: [],
        consumer_refs: [],
        status: 'terminal',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ARTIFACT_PATH_INVALID',
    );
    assert.throws(
      () => artifacts.preflightArtifactPublication(fx.db, {
        owner_type: 'project',
        owner_id: 'project',
        kind: 'spec',
        path: '.ultra/specs/new.md',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ARTIFACT_PATH_INVALID',
    );
    assert.equal(fx.db.prepare('SELECT COUNT(*) AS count FROM artifacts').get().count, 0);
  } finally {
    cleanup(fx);
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('artifact.record rejects a deterministic ancestor swap at the stable read boundary', () => {
  const fx = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-artifacts-swap-'));
  const specs = path.join(fx.rootDir, '.ultra', 'specs');
  const owned = path.join(fx.rootDir, '.ultra', 'specs-owned');
  const target = path.join(fs.realpathSync(fx.rootDir), '.ultra', 'specs', 'swap.md');
  const realOpen = fs.openSync;
  let swapped = false;
  try {
    write(fx.rootDir, '.ultra/specs/swap.md', '# project bytes\n');
    fs.writeFileSync(path.join(outside, 'swap.md'), '# external bytes\n');
    fs.openSync = (file, ...args) => {
      if (!swapped && typeof file === 'string' && path.resolve(file) === path.resolve(target)) {
        fs.renameSync(specs, owned);
        fs.symlinkSync(outside, specs, 'dir');
        swapped = true;
      }
      return realOpen(file, ...args);
    };

    assert.throws(
      () => artifacts.recordArtifact(fx.db, {
        owner_type: 'project',
        owner_id: 'project',
        kind: 'spec',
        path: '.ultra/specs/swap.md',
        provenance: { actor: 'model' },
        source_refs: [],
        consumer_refs: [],
        status: 'terminal',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ARTIFACT_PATH_INVALID',
    );
    assert.equal(fx.db.prepare('SELECT COUNT(*) AS count FROM artifacts').get().count, 0);
  } finally {
    fs.openSync = realOpen;
    if (swapped) {
      fs.rmSync(specs, { force: true });
      fs.renameSync(owned, specs);
    }
    cleanup(fx);
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('artifact.move rejects a symlinked ancestor instead of rebinding authority externally', () => {
  const fx = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-artifacts-move-'));
  try {
    write(fx.rootDir, '.ultra/specs/source.md', '# same bytes\n');
    const recorded = artifacts.recordArtifact(fx.db, {
      id: 'artifact-move-symlink',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'spec',
      path: '.ultra/specs/source.md',
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [],
      status: 'terminal',
    }, { rootDir: fx.rootDir });
    fs.writeFileSync(path.join(outside, 'moved.md'), '# same bytes\n');
    const specs = path.join(fx.rootDir, '.ultra', 'specs');
    fs.renameSync(specs, path.join(fx.rootDir, '.ultra', 'specs-owned'));
    fs.symlinkSync(outside, specs, 'dir');

    assert.throws(
      () => artifacts.moveArtifactInTx(
        fx.db,
        recorded.artifact.id,
        '.ultra/specs/moved.md',
        { rootDir: fx.rootDir },
      ),
      (error) => error.code === 'ARTIFACT_PATH_INVALID',
    );
    assert.equal(
      artifacts.getArtifact(fx.db, { id: recorded.artifact.id }).path,
      '.ultra/specs/source.md',
    );
  } finally {
    cleanup(fx);
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('artifact health reports an unsafe registered path when an ancestor becomes a symlink', () => {
  const fx = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-artifacts-doctor-'));
  try {
    write(fx.rootDir, '.ultra/specs/doctor.md', '# same bytes\n');
    const recorded = artifacts.recordArtifact(fx.db, {
      id: 'artifact-doctor-symlink',
      owner_type: 'project',
      owner_id: 'project',
      kind: 'spec',
      path: '.ultra/specs/doctor.md',
      provenance: { actor: 'model' },
      source_refs: [],
      consumer_refs: [],
      status: 'terminal',
    }, { rootDir: fx.rootDir });
    fs.writeFileSync(path.join(outside, 'doctor.md'), '# same bytes\n');
    const specs = path.join(fx.rootDir, '.ultra', 'specs');
    fs.renameSync(specs, path.join(fx.rootDir, '.ultra', 'specs-owned'));
    fs.symlinkSync(outside, specs, 'dir');

    const health = artifacts.inspectArtifactHealth(fx.db, { rootDir: fx.rootDir });
    assert.ok(health.issues.some((issue) => (
      issue.code === 'ARTIFACT_PATH_UNSAFE'
      && issue.artifact_id === recorded.artifact.id
    )));
  } finally {
    cleanup(fx);
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('artifact health rejects an unsafe .ultra root without traversing external files', () => {
  const fx = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-artifacts-root-'));
  try {
    closeStateDb(fx.db);
    fs.rmSync(path.join(fx.rootDir, '.ultra'), { recursive: true, force: true });
    fs.writeFileSync(path.join(outside, 'external.md'), '# external\n');
    fs.symlinkSync(outside, path.join(fx.rootDir, '.ultra'), 'dir');
    const reopened = initStateDb(path.join(fx.rootDir, 'state.db'));
    fx.db = reopened.db;

    const health = artifacts.inspectArtifactHealth(fx.db, { rootDir: fx.rootDir });

    assert.ok(health.issues.some((issue) => issue.code === 'ARTIFACT_TREE_UNSAFE'));
    assert.equal(
      health.issues.some((issue) => issue.path === '.ultra/external.md'),
      false,
    );
  } finally {
    cleanup(fx);
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('artifact health rejects symlinked tree entries and never reports their external children', () => {
  const fx = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-artifacts-entry-'));
  try {
    fs.writeFileSync(path.join(outside, 'external.md'), '# external\n');
    fs.symlinkSync(outside, path.join(fx.rootDir, '.ultra', 'linked'), 'dir');

    const health = artifacts.inspectArtifactHealth(fx.db, { rootDir: fx.rootDir });

    assert.ok(health.issues.some((issue) => (
      issue.code === 'ARTIFACT_TREE_UNSAFE' && issue.path === '.ultra/linked'
    )));
    assert.equal(
      health.issues.some((issue) => issue.path === '.ultra/linked/external.md'),
      false,
    );
  } finally {
    cleanup(fx);
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('artifact health does not let ignored runtime paths hide unsafe tree entries', () => {
  const fx = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-artifacts-runtime-'));
  try {
    closeStateDb(fx.db);
    fs.rmSync(path.join(fx.rootDir, '.ultra', '.runtime'), {
      recursive: true,
      force: true,
    });
    fs.writeFileSync(path.join(outside, 'external.md'), '# external\n');
    fs.symlinkSync(outside, path.join(fx.rootDir, '.ultra', '.runtime'), 'dir');
    const reopened = initStateDb(path.join(fx.rootDir, 'state.db'));
    fx.db = reopened.db;

    const health = artifacts.inspectArtifactHealth(fx.db, { rootDir: fx.rootDir });

    assert.ok(health.issues.some((issue) => (
      issue.code === 'ARTIFACT_TREE_UNSAFE' && issue.path === '.ultra/.runtime'
    )));
    assert.equal(
      health.issues.some((issue) => issue.path === '.ultra/.runtime/external.md'),
      false,
    );
  } finally {
    cleanup(fx);
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
