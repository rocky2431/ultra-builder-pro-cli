'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  savePlanArtifact,
  loadPlanArtifact,
  saveChangePlanArtifacts,
  prepareChangePlanPublication,
  inspectPlanPublications,
  recoverPlanPublications,
  loadChangePlanArtifact,
  changePlanPaths,
  selectSection,
  renderPlanMd,
  DEFAULT_ARTIFACT_RELPATH,
} = require('./plan-store.cjs');
const { initStateDb, closeStateDb } = require('./state-db.cjs');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-plan-'));
}

const SAMPLE_PLAN = Object.freeze({
  waves: [
    { id: 1, tasks: ['a', 'b'], parallel: true },
    { id: 2, tasks: ['c'], parallel: false },
  ],
  ownership_forecast: { a: ['src/a.ts'], b: ['src/b.ts'], c: ['src/c.ts'] },
  conflict_surface: [],
  estimated_cost_usd: 0.12,
  estimated_duration_min: 35,
  cycles: [],
});

test('savePlanArtifact: json format writes a file we can JSON.parse back', () => {
  const root = tmpRoot();
  try {
    const outPath = path.join(root, '.ultra', 'execution-plan.json');
    const { plan_path } = savePlanArtifact(SAMPLE_PLAN, outPath, 'json');
    assert.equal(plan_path, path.resolve(outPath));
    assert.ok(fs.existsSync(plan_path));
    const parsed = JSON.parse(fs.readFileSync(plan_path, 'utf8'));
    assert.deepEqual(parsed.waves, SAMPLE_PLAN.waves);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('savePlanArtifact: md format writes a human-readable report', () => {
  const root = tmpRoot();
  try {
    const outPath = path.join(root, '.ultra', 'execution-plan.md');
    savePlanArtifact(SAMPLE_PLAN, outPath, 'md');
    const text = fs.readFileSync(outPath, 'utf8');
    assert.match(text, /# Execution Plan/);
    assert.match(text, /Wave 1/);
    assert.match(text, /parallel/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('savePlanArtifact: missing out_path → WRITE_FAILED', () => {
  assert.throws(
    () => savePlanArtifact(SAMPLE_PLAN, '', 'json'),
    (err) => err.code === 'WRITE_FAILED',
  );
});

test('loadPlanArtifact: no file → null', () => {
  const root = tmpRoot();
  try {
    assert.equal(loadPlanArtifact(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('loadPlanArtifact: round-trip via DEFAULT_ARTIFACT_RELPATH', () => {
  const root = tmpRoot();
  try {
    const target = path.join(root, DEFAULT_ARTIFACT_RELPATH);
    savePlanArtifact(SAMPLE_PLAN, target, 'json');
    const loaded = loadPlanArtifact(root);
    assert.deepEqual(loaded.waves, SAMPLE_PLAN.waves);
    assert.equal(loaded.estimated_cost_usd, 0.12);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('loadPlanArtifact: corrupt file → null (no throw)', () => {
  const root = tmpRoot();
  try {
    const target = path.join(root, DEFAULT_ARTIFACT_RELPATH);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{not json');
    assert.equal(loadPlanArtifact(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('change-scoped plan writes deterministic plan.json and plan.md under the owning artifact root', () => {
  const root = tmpRoot();
  try {
    const change = {
      id: 'change-scoped',
      artifact_root: '.ultra/changes/active/change-scoped',
    };
    const plan = { ...SAMPLE_PLAN, change_id: change.id };
    const tasks = [{
      id: 'a',
      title: 'Implement one seam',
      outcome: 'One public seam works.',
      trace_to: '.ultra/specs/product.md#accepted-behavior',
      files_modified: ['src/a.ts'],
      public_seam: 'src/a.ts#run',
      verification_command: 'node --test a.test.cjs',
      acceptance: [{ id: 'accepted-behavior', criterion: 'The seam works.', verification: 'node --test a.test.cjs' }],
      context_refs: [{ ref: 'src/a.ts', reason: 'Current implementation pattern.', kind: 'source' }],
      docs_impact: { status: 'none', files: [], rationale: 'No public documentation change.' },
    }];
    const context = {
      snapshot_id: 'ctx-plan',
      manifest_path: '.ultra/changes/active/change-scoped/contexts/ctx-plan.json',
      manifest_digest: 'b'.repeat(64),
    };
    const saved = saveChangePlanArtifacts(plan, {
      rootDir: root, change, tasks, context,
    });
    const expected = changePlanPaths(root, change);
    assert.equal(saved.plan_path, expected.json);
    assert.equal(saved.plan_md_path, expected.md);
    assert.equal(fs.existsSync(expected.json), true);
    assert.equal(fs.existsSync(expected.md), true);
    assert.equal(JSON.parse(fs.readFileSync(expected.json, 'utf8')).context.manifest_digest, 'b'.repeat(64));
    const markdown = fs.readFileSync(expected.md, 'utf8');
    assert.match(markdown, /## Task a/);
    assert.match(markdown, /Purpose: One public seam works/);
    assert.match(markdown, /Recovery and drift/);
    assert.deepEqual(loadChangePlanArtifact(root, change), JSON.parse(fs.readFileSync(expected.json, 'utf8')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('change-scoped plan rejects a symlink target without changing external bytes', () => {
  const root = tmpRoot();
  const externalRoot = tmpRoot();
  try {
    const change = {
      id: 'change-symlink',
      artifact_root: '.ultra/changes/active/change-symlink',
    };
    const paths = changePlanPaths(root, change);
    fs.mkdirSync(path.dirname(paths.json), { recursive: true });
    const external = path.join(externalRoot, 'outside.json');
    fs.writeFileSync(external, 'outside-authority\n');
    fs.symlinkSync(external, paths.json);

    assert.throws(
      () => saveChangePlanArtifacts(
        { ...SAMPLE_PLAN, change_id: change.id },
        {
          rootDir: root,
          change,
          context: {
            snapshot_id: 'ctx-symlink',
            manifest_path: '.ultra/changes/active/change-symlink/contexts/ctx-symlink.json',
            manifest_digest: 'c'.repeat(64),
          },
        },
      ),
      (error) => error.code === 'PLAN_ARTIFACT_PATH_UNSAFE',
    );
    assert.equal(fs.readFileSync(external, 'utf8'), 'outside-authority\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('change-scoped plan rejects a symlink artifact ancestor without writing externally', () => {
  const root = tmpRoot();
  const externalRoot = tmpRoot();
  try {
    fs.mkdirSync(path.join(root, '.ultra'));
    fs.symlinkSync(externalRoot, path.join(root, '.ultra', 'changes'));
    const change = {
      id: 'change-ancestor-symlink',
      artifact_root: '.ultra/changes/active/change-ancestor-symlink',
    };
    assert.throws(
      () => saveChangePlanArtifacts(
        { ...SAMPLE_PLAN, change_id: change.id },
        {
          rootDir: root,
          change,
          context: {
            snapshot_id: 'ctx-ancestor-symlink',
            manifest_path: '.ultra/changes/active/change-ancestor-symlink/contexts/context.json',
            manifest_digest: 'd'.repeat(64),
          },
        },
      ),
      (error) => error.code === 'PLAN_ARTIFACT_PATH_UNSAFE',
    );
    assert.deepEqual(fs.readdirSync(externalRoot), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('journaled change plan publication restores both prior artifacts when its owner transaction fails', () => {
  const root = tmpRoot();
  try {
    const change = {
      id: 'change-publication-rollback',
      artifact_root: '.ultra/changes/active/change-publication-rollback',
    };
    const paths = changePlanPaths(root, change);
    fs.mkdirSync(path.dirname(paths.json), { recursive: true });
    fs.writeFileSync(paths.json, '{"prior":"json"}\n');
    fs.writeFileSync(paths.md, '# Prior markdown\n');
    const publication = prepareChangePlanPublication(
      { ...SAMPLE_PLAN, change_id: change.id },
      {
        rootDir: root,
        change,
        context: {
          snapshot_id: 'ctx-publication-rollback',
          manifest_path: '.ultra/changes/active/change-publication-rollback/contexts/context.json',
          manifest_digest: 'e'.repeat(64),
        },
      },
    );
    publication.publish();
    assert.notEqual(fs.readFileSync(paths.json, 'utf8'), '{"prior":"json"}\n');
    assert.notEqual(fs.readFileSync(paths.md, 'utf8'), '# Prior markdown\n');
    publication.rollback();

    assert.equal(fs.readFileSync(paths.json, 'utf8'), '{"prior":"json"}\n');
    assert.equal(fs.readFileSync(paths.md, 'utf8'), '# Prior markdown\n');
    assert.deepEqual(
      fs.readdirSync(path.dirname(paths.json)).sort(),
      ['plan.json', 'plan.md'],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan publish preserves the original failure and rollback issue when recovery residue remains', () => {
  const root = tmpRoot();
  try {
    const change = {
      id: 'change-publish-rollback-fault',
      artifact_root: '.ultra/changes/active/change-publish-rollback-fault',
    };
    const paths = changePlanPaths(root, change);
    fs.mkdirSync(path.dirname(paths.json), { recursive: true });
    fs.writeFileSync(paths.json, '{"prior":"json"}\n');
    fs.writeFileSync(paths.md, '# Prior markdown\n');
    const publication = prepareChangePlanPublication(
      { ...SAMPLE_PLAN, change_id: change.id },
      {
        rootDir: root,
        change,
        context: {
          snapshot_id: 'ctx-publish-rollback-fault',
          manifest_path: `${change.artifact_root}/contexts/context.json`,
          manifest_digest: 'f'.repeat(64),
        },
      },
    );

    fs.writeFileSync(paths.json, '{"concurrent":"replacement"}\n');

    assert.throws(
      () => publication.publish(),
      (error) => {
        assert.equal(error.code, 'PLAN_RECOVERY_REQUIRED');
        assert.equal(error.cause.code, 'PLAN_PUBLISH_CONFLICT');
        assert.equal(error.details.original_error.code, 'PLAN_PUBLISH_CONFLICT');
        assert.equal(error.details.rollback_issue.code, 'PLAN_RECOVERY_CONFLICT');
        assert.equal(error.details.transaction_id, publication.transaction_id);
        return true;
      },
    );
    assert.ok(
      fs.readdirSync(path.dirname(paths.json))
        .some((name) => name.endsWith('.journal.json')),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan recovery infers rename progress when the journal phase lags the filesystem', () => {
  const crashWindows = [
    {
      name: 'after-backup-rename',
      mutate(entries) {
        fs.renameSync(entries[0].target, entries[0].backup);
      },
    },
    {
      name: 'after-first-install',
      mutate(entries) {
        for (const entry of entries) fs.renameSync(entry.target, entry.backup);
        fs.renameSync(entries[0].temp, entries[0].target);
      },
    },
  ];
  for (const crashWindow of crashWindows) {
    const root = tmpRoot();
    try {
      const change = {
        id: `change-publication-${crashWindow.name}`,
        artifact_root: `.ultra/changes/active/change-publication-${crashWindow.name}`,
      };
      const paths = changePlanPaths(root, change);
      fs.mkdirSync(path.dirname(paths.json), { recursive: true });
      fs.writeFileSync(paths.json, '{"prior":"json"}\n');
      fs.writeFileSync(paths.md, '# Prior markdown\n');
      prepareChangePlanPublication(
        { ...SAMPLE_PLAN, change_id: change.id },
        {
          rootDir: root,
          change,
          context: {
            snapshot_id: `ctx-${crashWindow.name}`,
            manifest_path: `${change.artifact_root}/contexts/context.json`,
            manifest_digest: 'a'.repeat(64),
          },
        },
      );
      const directory = path.dirname(paths.json);
      const journalPath = path.join(
        directory,
        fs.readdirSync(directory).find((name) => name.endsWith('.journal.json')),
      );
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      const entries = journal.entries.map((entry) => ({
        ...entry,
        target: path.join(directory, entry.target),
        backup: path.join(directory, entry.backup),
        temp: path.join(directory, entry.temp),
      }));
      crashWindow.mutate(entries);

      const db = {
        prepare(sql) {
          if (sql.includes('FROM changes')) return { all: () => [change] };
          if (sql.includes('FROM artifacts')) return { all: () => [] };
          throw new Error(`unexpected query: ${sql}`);
        },
      };
      const recovered = recoverPlanPublications(db, { rootDir: root });
      assert.equal(recovered.recovered, 1, crashWindow.name);
      assert.equal(recovered.pending, 0, crashWindow.name);
      assert.deepEqual(recovered.issues, [], crashWindow.name);
      assert.equal(fs.readFileSync(paths.json, 'utf8'), '{"prior":"json"}\n');
      assert.equal(fs.readFileSync(paths.md, 'utf8'), '# Prior markdown\n');
      assert.deepEqual(
        fs.readdirSync(directory).sort(),
        ['plan.json', 'plan.md'],
        crashWindow.name,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('plan recovery preserves journal residue when prior bytes become unrecoverable', () => {
  const cases = [
    {
      name: 'changed-before-backup',
      mutate(entry) {
        fs.writeFileSync(entry.target, '{"concurrent":"replacement"}\n');
      },
    },
    {
      name: 'missing-before-backup',
      mutate(entry) {
        fs.rmSync(entry.target);
      },
    },
    {
      name: 'missing-after-backup-loss',
      mutate(entry) {
        fs.renameSync(entry.target, entry.backup);
        fs.rmSync(entry.backup);
      },
    },
  ];
  for (const scenario of cases) {
    const root = tmpRoot();
    try {
      const change = {
        id: `change-recovery-conflict-${scenario.name}`,
        artifact_root: `.ultra/changes/active/change-recovery-conflict-${scenario.name}`,
      };
      const paths = changePlanPaths(root, change);
      fs.mkdirSync(path.dirname(paths.json), { recursive: true });
      fs.writeFileSync(paths.json, '{"prior":"json"}\n');
      fs.writeFileSync(paths.md, '# Prior markdown\n');
      prepareChangePlanPublication(
        { ...SAMPLE_PLAN, change_id: change.id },
        {
          rootDir: root,
          change,
          context: {
            snapshot_id: `ctx-recovery-conflict-${scenario.name}`,
            manifest_path: `${change.artifact_root}/contexts/context.json`,
            manifest_digest: 'b'.repeat(64),
          },
        },
      );
      const directory = path.dirname(paths.json);
      const journalPath = path.join(
        directory,
        fs.readdirSync(directory).find((name) => name.endsWith('.journal.json')),
      );
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      const entry = journal.entries.find((item) => item.kind === 'execution_plan');
      scenario.mutate({
        target: path.join(directory, entry.target),
        backup: path.join(directory, entry.backup),
        temp: path.join(directory, entry.temp),
      });
      const residueBefore = fs.readdirSync(directory)
        .filter((name) => name.startsWith('.plan-publish-'))
        .sort();
      const db = {
        prepare(sql) {
          if (sql.includes('FROM changes')) return { all: () => [change] };
          if (sql.includes('FROM artifacts')) return { all: () => [] };
          throw new Error(`unexpected query: ${sql}`);
        },
      };

      const recovered = recoverPlanPublications(db, { rootDir: root });

      assert.equal(recovered.recovered, 0, scenario.name);
      assert.equal(recovered.finalized, 0, scenario.name);
      assert.equal(recovered.pending, 1, scenario.name);
      assert.ok(
        recovered.issues.some((issue) => issue.code === 'PLAN_RECOVERY_CONFLICT'),
        scenario.name,
      );
      assert.ok(fs.existsSync(journalPath), scenario.name);
      assert.deepEqual(
        fs.readdirSync(directory)
          .filter((name) => name.startsWith('.plan-publish-'))
          .sort(),
        residueBefore,
        scenario.name,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('commit residue surfaces recovery-required and blocks an overlapping publication', () => {
  const root = tmpRoot();
  try {
    const change = {
      id: 'change-commit-cleanup-fault',
      artifact_root: '.ultra/changes/active/change-commit-cleanup-fault',
    };
    const paths = changePlanPaths(root, change);
    fs.mkdirSync(path.dirname(paths.json), { recursive: true });
    fs.writeFileSync(paths.json, '{"prior":"json"}\n');
    fs.writeFileSync(paths.md, '# Prior markdown\n');
    const publication = prepareChangePlanPublication(
      { ...SAMPLE_PLAN, change_id: change.id },
      {
        rootDir: root,
        change,
        context: {
          snapshot_id: 'ctx-commit-cleanup-fault',
          manifest_path: `${change.artifact_root}/contexts/context.json`,
          manifest_digest: 'c'.repeat(64),
        },
      },
    );
    publication.publish();
    const directory = path.dirname(paths.json);
    const journalPath = path.join(
      directory,
      fs.readdirSync(directory).find((name) => name.endsWith('.journal.json')),
    );
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    const backup = path.join(directory, journal.entries[0].backup);
    fs.rmSync(backup);
    fs.mkdirSync(backup);

    assert.throws(
      () => publication.commit(),
      (error) => error.code === 'PLAN_RECOVERY_REQUIRED',
    );
    assert.ok(fs.existsSync(journalPath));
    assert.throws(
      () => prepareChangePlanPublication(
        { ...SAMPLE_PLAN, change_id: change.id },
        {
          rootDir: root,
          change,
          context: {
            snapshot_id: 'ctx-overlapping-publication',
            manifest_path: `${change.artifact_root}/contexts/context-2.json`,
            manifest_digest: 'd'.repeat(64),
          },
        },
      ),
      (error) => error.code === 'PLAN_RECOVERY_REQUIRED',
    );
    assert.ok(fs.existsSync(journalPath));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan publication inspection and recovery fail closed for unsafe journal and sidecar entries', () => {
  for (const unsafeKind of ['journal', 'temp', 'backup']) {
    const root = tmpRoot();
    const externalRoot = tmpRoot();
    try {
      const change = {
        id: `change-unsafe-${unsafeKind}`,
        artifact_root: `.ultra/changes/active/change-unsafe-${unsafeKind}`,
      };
      const paths = changePlanPaths(root, change);
      prepareChangePlanPublication(
        { ...SAMPLE_PLAN, change_id: change.id },
        {
          rootDir: root,
          change,
          context: {
            snapshot_id: `ctx-unsafe-${unsafeKind}`,
            manifest_path: `${change.artifact_root}/contexts/context.json`,
            manifest_digest: '4'.repeat(64),
          },
        },
      );
      const directory = path.dirname(paths.json);
      const journalPath = path.join(
        directory,
        fs.readdirSync(directory).find((name) => name.endsWith('.journal.json')),
      );
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      const entry = journal.entries[0];
      const unsafePath = {
        journal: journalPath,
        temp: path.join(directory, entry.temp),
        backup: path.join(directory, entry.backup),
      }[unsafeKind];
      fs.rmSync(unsafePath, { force: true });
      const external = path.join(externalRoot, `${unsafeKind}-sentinel`);
      fs.writeFileSync(external, `${unsafeKind}-external-sentinel\n`);
      fs.symlinkSync(external, unsafePath);
      const db = {
        prepare(sql) {
          if (sql.includes('FROM changes')) return { all: () => [change] };
          if (sql.includes('FROM artifacts')) return { all: () => [] };
          throw new Error(`unexpected query: ${sql}`);
        },
      };

      const inspected = inspectPlanPublications(db, { rootDir: root });
      assert.equal(inspected.status, 'fail', unsafeKind);
      assert.ok(
        inspected.issues.some((issue) => issue.code === 'PLAN_ARTIFACT_PATH_UNSAFE'),
        `inspect ignored unsafe ${unsafeKind}`,
      );
      const recovered = recoverPlanPublications(db, { rootDir: root });
      assert.equal(recovered.recovered, 0, unsafeKind);
      assert.equal(recovered.finalized, 0, unsafeKind);
      assert.ok(
        recovered.issues.some((issue) => issue.code === 'PLAN_ARTIFACT_PATH_UNSAFE'),
        `recovery ignored unsafe ${unsafeKind}`,
      );
      assert.equal(fs.readFileSync(external, 'utf8'), `${unsafeKind}-external-sentinel\n`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(externalRoot, { recursive: true, force: true });
    }
  }
});

test('plan recovery rejects a copied journal whose recorded directory identity no longer matches cwd', () => {
  const root = tmpRoot();
  try {
    const originalChange = {
      id: 'change-copied-journal',
      artifact_root: '.ultra/changes/active/change-copied-journal',
    };
    const originalPaths = changePlanPaths(root, originalChange);
    prepareChangePlanPublication(
      { ...SAMPLE_PLAN, change_id: originalChange.id },
      {
        rootDir: root,
        change: originalChange,
        context: {
          snapshot_id: 'ctx-copied-journal',
          manifest_path: `${originalChange.artifact_root}/contexts/context.json`,
          manifest_digest: '5'.repeat(64),
        },
      },
    );
    const copiedChange = {
      ...originalChange,
      artifact_root: '.ultra/changes/active/change-copied-journal-new-inode',
    };
    const copiedPaths = changePlanPaths(root, copiedChange);
    fs.cpSync(path.dirname(originalPaths.json), path.dirname(copiedPaths.json), {
      recursive: true,
    });
    fs.rmSync(path.dirname(originalPaths.json), { recursive: true, force: true });
    const db = {
      prepare(sql) {
        if (sql.includes('FROM changes')) return { all: () => [copiedChange] };
        if (sql.includes('FROM artifacts')) return { all: () => [] };
        throw new Error(`unexpected query: ${sql}`);
      },
    };

    const inspected = inspectPlanPublications(db, { rootDir: root });
    assert.equal(inspected.status, 'fail');
    assert.ok(inspected.issues.some((issue) => (
      issue.code === 'PLAN_ARTIFACT_PATH_UNSAFE'
        && /directory identity/i.test(issue.message)
    )));
    const recovered = recoverPlanPublications(db, { rootDir: root });
    assert.equal(recovered.recovered, 0);
    assert.equal(recovered.finalized, 0);
    assert.ok(recovered.issues.some((issue) => (
      issue.code === 'PLAN_ARTIFACT_PATH_UNSAFE'
        && /directory identity/i.test(issue.message)
    )));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan recovery does not finalize manual rows that merely match published digests', () => {
  const root = tmpRoot();
  const { db } = initStateDb(path.join(root, '.ultra', '.runtime', 'state.db'));
  try {
    const change = {
      id: 'change-manual-plan-authority',
      artifact_root: '.ultra/changes/active/change-manual-plan-authority',
    };
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES (?, 'Manual plan authority', 'quick', 'active',
               'Reject digest-only recovery authority.', ?)`,
    ).run(change.id, change.artifact_root);
    const paths = changePlanPaths(root, change);
    fs.mkdirSync(path.dirname(paths.json), { recursive: true });
    const priorJson = '{"prior":"json"}\n';
    const priorMd = '# Prior markdown\n';
    fs.writeFileSync(paths.json, priorJson);
    fs.writeFileSync(paths.md, priorMd);
    const publication = prepareChangePlanPublication(
      { ...SAMPLE_PLAN, change_id: change.id },
      {
        rootDir: root,
        change,
        context: {
          snapshot_id: 'ctx-manual-plan-authority',
          manifest_path: `${change.artifact_root}/contexts/context.json`,
          manifest_digest: '6'.repeat(64),
        },
      },
    );
    publication.publish();
    assert.match(publication.transaction_id, /^[0-9a-f-]{36}$/);
    const insert = db.prepare(
      `INSERT INTO artifacts
       (id, owner_type, owner_id, change_id, kind, path, digest, content_hash,
        after_digest, provenance_json, managed, status)
       VALUES (?, 'change', ?, ?, ?, ?, ?, ?, ?, ?, 1, 'current')`,
    );
    for (const [index, artifact] of publication.artifacts.entries()) {
      insert.run(
        `manual-plan-${index}`,
        change.id,
        change.id,
        index === 0 ? 'manual_plan' : 'manual_markdown',
        path.relative(root, artifact.path).split(path.sep).join('/'),
        artifact.digest,
        artifact.digest,
        artifact.digest,
        JSON.stringify({
          writer: 'manual',
          publication_transaction_id: publication.transaction_id,
        }),
      );
    }

    const recovered = recoverPlanPublications(db, { rootDir: root });
    assert.equal(recovered.recovered, 1);
    assert.equal(recovered.finalized, 0);
    assert.deepEqual(recovered.issues, []);
    assert.equal(fs.readFileSync(paths.json, 'utf8'), priorJson);
    assert.equal(fs.readFileSync(paths.md, 'utf8'), priorMd);
  } finally {
    closeStateDb(db);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan recovery finalizes only the exact active Change authority and publication token', () => {
  const root = tmpRoot();
  const { db } = initStateDb(path.join(root, '.ultra', '.runtime', 'state.db'));
  try {
    const change = {
      id: 'change-exact-plan-authority',
      artifact_root: '.ultra/changes/active/change-exact-plan-authority',
    };
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES (?, 'Exact plan authority', 'quick', 'active',
               'Finalize only exact publication authority.', ?)`,
    ).run(change.id, change.artifact_root);
    const publication = prepareChangePlanPublication(
      { ...SAMPLE_PLAN, change_id: change.id },
      {
        rootDir: root,
        change,
        context: {
          snapshot_id: 'ctx-exact-plan-authority',
          manifest_path: `${change.artifact_root}/contexts/context.json`,
          manifest_digest: '7'.repeat(64),
        },
      },
    );
    publication.publish();
    const insert = db.prepare(
      `INSERT INTO artifacts
       (id, owner_type, owner_id, change_id, kind, path, digest, content_hash,
        after_digest, provenance_json, managed, status)
       VALUES (?, 'change', ?, ?, ?, ?, ?, ?, ?, ?, 1, 'current')`,
    );
    for (const artifact of publication.artifacts) {
      insert.run(
        `exact-${artifact.kind}`,
        change.id,
        change.id,
        artifact.kind,
        path.relative(root, artifact.path).split(path.sep).join('/'),
        artifact.digest,
        artifact.digest,
        artifact.digest,
        JSON.stringify({
          writer: 'plan.export',
          publication_transaction_id: publication.transaction_id,
        }),
      );
    }

    const before = new Map(publication.artifacts.map((artifact) => [
      artifact.kind,
      crypto.createHash('sha256').update(fs.readFileSync(artifact.path)).digest('hex'),
    ]));
    const recovered = recoverPlanPublications(db, { rootDir: root });
    assert.equal(recovered.recovered, 0);
    assert.equal(recovered.finalized, 1);
    assert.deepEqual(recovered.issues, []);
    for (const artifact of publication.artifacts) {
      assert.equal(
        crypto.createHash('sha256').update(fs.readFileSync(artifact.path)).digest('hex'),
        before.get(artifact.kind),
      );
    }
    assert.deepEqual(
      fs.readdirSync(path.dirname(publication.plan_path))
        .filter((name) => name.startsWith('.plan-publish-')),
      [],
    );
  } finally {
    closeStateDb(db);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('change plan publication rejects targets created or changed after prepare without touching concurrent bytes', () => {
  for (const scenario of [
    {
      name: 'created',
      seed() {},
      mutate(paths) {
        fs.writeFileSync(paths.json, '{"concurrent":"json"}\n');
        fs.writeFileSync(paths.md, '# Concurrent markdown\n');
      },
      expectedJson: '{"concurrent":"json"}\n',
      expectedMd: '# Concurrent markdown\n',
      recoveryRequired: false,
    },
    {
      name: 'changed',
      seed(paths) {
        fs.mkdirSync(path.dirname(paths.json), { recursive: true });
        fs.writeFileSync(paths.json, '{"prior":"json"}\n');
        fs.writeFileSync(paths.md, '# Prior markdown\n');
      },
      mutate(paths) {
        fs.writeFileSync(paths.json, '{"changed":"after-prepare"}\n');
      },
      expectedJson: '{"changed":"after-prepare"}\n',
      expectedMd: '# Prior markdown\n',
      recoveryRequired: true,
    },
  ]) {
    const root = tmpRoot();
    try {
      const change = {
        id: `change-publication-cas-${scenario.name}`,
        artifact_root: `.ultra/changes/active/change-publication-cas-${scenario.name}`,
      };
      const paths = changePlanPaths(root, change);
      scenario.seed(paths);
      const publication = prepareChangePlanPublication(
        { ...SAMPLE_PLAN, change_id: change.id },
        {
          rootDir: root,
          change,
          context: {
            snapshot_id: `ctx-publication-cas-${scenario.name}`,
            manifest_path: `${change.artifact_root}/contexts/context.json`,
            manifest_digest: 'f'.repeat(64),
          },
        },
      );
      scenario.mutate(paths);

      assert.throws(
        () => publication.publish(),
        (error) => {
          if (!scenario.recoveryRequired) {
            assert.equal(error.code, 'PLAN_PUBLISH_CONFLICT');
            return true;
          }
          assert.equal(error.code, 'PLAN_RECOVERY_REQUIRED');
          assert.equal(error.cause.code, 'PLAN_PUBLISH_CONFLICT');
          assert.equal(error.details.rollback_issue.code, 'PLAN_RECOVERY_CONFLICT');
          return true;
        },
      );
      assert.equal(fs.readFileSync(paths.json, 'utf8'), scenario.expectedJson);
      assert.equal(fs.readFileSync(paths.md, 'utf8'), scenario.expectedMd);
      const hasJournal = fs.readdirSync(path.dirname(paths.json))
        .some((name) => name.endsWith('.journal.json'));
      assert.equal(hasJournal, scenario.recoveryRequired);
      const prepareNext = () => prepareChangePlanPublication(
        { ...SAMPLE_PLAN, change_id: change.id },
        {
          rootDir: root,
          change,
          context: {
            snapshot_id: `ctx-publication-cas-${scenario.name}-next`,
            manifest_path: `${change.artifact_root}/contexts/context-next.json`,
            manifest_digest: '0'.repeat(64),
          },
        },
      );
      if (scenario.recoveryRequired) {
        assert.throws(
          prepareNext,
          (error) => error.code === 'PLAN_RECOVERY_REQUIRED',
        );
      } else {
        const next = prepareNext();
        assert.deepEqual(next.rollback(), { rolled_back: true });
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('change plan publication keeps an opened directory identity when its canonical ancestor is swapped', () => {
  const root = tmpRoot();
  const externalRoot = tmpRoot();
  try {
    const change = {
      id: 'change-publication-directory-race',
      artifact_root: '.ultra/changes/active/change-publication-directory-race',
    };
    const paths = changePlanPaths(root, change);
    fs.mkdirSync(path.dirname(paths.json), { recursive: true });
    fs.writeFileSync(paths.json, '{"prior":"json"}\n');
    fs.writeFileSync(paths.md, '# Prior markdown\n');
    const publication = prepareChangePlanPublication(
      { ...SAMPLE_PLAN, change_id: change.id },
      {
        rootDir: root,
        change,
        context: {
          snapshot_id: 'ctx-publication-directory-race',
          manifest_path: `${change.artifact_root}/contexts/context.json`,
          manifest_digest: '1'.repeat(64),
        },
      },
    );
    const originalDirectory = path.dirname(paths.json);
    const movedDirectory = `${originalDirectory}.moved`;
    fs.renameSync(originalDirectory, movedDirectory);
    fs.writeFileSync(path.join(externalRoot, 'plan.json'), 'external-json-sentinel\n');
    fs.writeFileSync(path.join(externalRoot, 'plan.md'), 'external-md-sentinel\n');
    fs.symlinkSync(externalRoot, originalDirectory);

    assert.throws(
      () => publication.publish(),
      (error) => {
        assert.equal(error.code, 'PLAN_RECOVERY_REQUIRED');
        assert.equal(error.cause.code, 'PLAN_ARTIFACT_PATH_UNSAFE');
        assert.equal(error.details.rollback_issue.code, 'PLAN_ARTIFACT_PATH_UNSAFE');
        return true;
      },
    );
    assert.equal(
      fs.readFileSync(path.join(externalRoot, 'plan.json'), 'utf8'),
      'external-json-sentinel\n',
    );
    assert.equal(
      fs.readFileSync(path.join(externalRoot, 'plan.md'), 'utf8'),
      'external-md-sentinel\n',
    );
    assert.equal(fs.readFileSync(path.join(movedDirectory, 'plan.json'), 'utf8'), '{"prior":"json"}\n');
    assert.equal(fs.readFileSync(path.join(movedDirectory, 'plan.md'), 'utf8'), '# Prior markdown\n');
    assert.ok(
      fs.readdirSync(movedDirectory)
        .some((name) => name.endsWith('.journal.json')),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('change-scoped loading rejects a plan.json symlink even when the external JSON names the change', () => {
  const root = tmpRoot();
  const externalRoot = tmpRoot();
  try {
    const change = {
      id: 'change-reader-symlink',
      artifact_root: '.ultra/changes/active/change-reader-symlink',
    };
    const paths = changePlanPaths(root, change);
    fs.mkdirSync(path.dirname(paths.json), { recursive: true });
    const forged = path.join(externalRoot, 'forged-plan.json');
    fs.writeFileSync(forged, `${JSON.stringify({
      ...SAMPLE_PLAN,
      change_id: change.id,
      waves: [{ id: 1, tasks: ['forged'], parallel: false }],
    })}\n`);
    fs.symlinkSync(forged, paths.json);
    assert.equal(loadChangePlanArtifact(root, change), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('plan publication recovery fails closed when a pending journal directory is replaced by a symlink', () => {
  const root = tmpRoot();
  const externalRoot = tmpRoot();
  try {
    const change = {
      id: 'change-recovery-directory-race',
      artifact_root: '.ultra/changes/active/change-recovery-directory-race',
    };
    const paths = changePlanPaths(root, change);
    const publication = prepareChangePlanPublication(
      { ...SAMPLE_PLAN, change_id: change.id },
      {
        rootDir: root,
        change,
        context: {
          snapshot_id: 'ctx-recovery-directory-race',
          manifest_path: `${change.artifact_root}/contexts/context.json`,
          manifest_digest: '2'.repeat(64),
        },
      },
    );
    publication.publish();
    const originalDirectory = path.dirname(paths.json);
    const movedDirectory = `${originalDirectory}.moved`;
    fs.renameSync(originalDirectory, movedDirectory);
    fs.writeFileSync(path.join(externalRoot, 'plan.json'), 'external-recovery-json\n');
    fs.writeFileSync(path.join(externalRoot, 'plan.md'), 'external-recovery-md\n');
    fs.symlinkSync(externalRoot, originalDirectory);
    const db = {
      prepare() {
        return {
          all: () => [change],
          get: () => null,
        };
      },
    };

    const inspected = inspectPlanPublications(db, { rootDir: root });
    assert.equal(inspected.pending, 1);
    assert.equal(inspected.issues[0].code, 'PLAN_ARTIFACT_PATH_UNSAFE');
    const recovered = recoverPlanPublications(db, { rootDir: root });
    assert.equal(recovered.recovered, 0);
    assert.equal(recovered.issues[0].code, 'PLAN_ARTIFACT_PATH_UNSAFE');
    assert.equal(fs.readFileSync(path.join(externalRoot, 'plan.json'), 'utf8'), 'external-recovery-json\n');
    assert.equal(fs.readFileSync(path.join(externalRoot, 'plan.md'), 'utf8'), 'external-recovery-md\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('change-scoped loading never lets another change global plan become authority', () => {
  const root = tmpRoot();
  try {
    const legacy = { ...SAMPLE_PLAN, change_id: 'legacy-other' };
    savePlanArtifact(legacy, path.join(root, DEFAULT_ARTIFACT_RELPATH), 'json');
    assert.equal(loadChangePlanArtifact(root, {
      id: 'current-change',
      artifact_root: '.ultra/changes/active/current-change',
    }), null);
    assert.deepEqual(loadPlanArtifact(root), legacy);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('selectSection: tasks returns ownership_forecast only', () => {
  const r = selectSection(SAMPLE_PLAN, 'tasks');
  assert.deepEqual(Object.keys(r), ['ownership_forecast']);
});

test('selectSection: topo returns waves only', () => {
  const r = selectSection(SAMPLE_PLAN, 'topo');
  assert.deepEqual(Object.keys(r), ['waves']);
});

test('selectSection: conflicts returns conflict_surface only', () => {
  const r = selectSection(SAMPLE_PLAN, 'conflicts');
  assert.deepEqual(Object.keys(r), ['conflict_surface']);
});

test('selectSection: all (default) returns whole plan', () => {
  assert.deepEqual(selectSection(SAMPLE_PLAN, 'all'), SAMPLE_PLAN);
  assert.deepEqual(selectSection(SAMPLE_PLAN), SAMPLE_PLAN);
});

test('renderPlanMd: reports cycles + conflicts counts when present', () => {
  const planWithConflicts = {
    ...SAMPLE_PLAN,
    conflict_surface: [{ files: ['x.ts'], tasks: ['a', 'b'], recommend: 'sequentialize' }],
    cycles: [['z', 'y']],
  };
  const md = renderPlanMd(planWithConflicts);
  assert.match(md, /Conflicts: 1/);
  assert.match(md, /Cycles: 1/);
  assert.match(md, /## Conflict Surface/);
});

test('renderPlanMd: labels a missing exact-model price as unavailable', () => {
  const md = renderPlanMd({ ...SAMPLE_PLAN, estimated_cost_usd: null });
  assert.match(md, /Estimated cost: unavailable/);
  assert.doesNotMatch(md, /\$null/);
});
