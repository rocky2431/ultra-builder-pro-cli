'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const ops = require('./state-ops.cjs');
const changes = require('./change-workflow.cjs');
const { expandTask, TaskExpandError } = require('./task-expander.cjs');
const { seedReadyBaseline } = require('../test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-expand-'));
  const { db } = initStateDb(path.join(dir, 'state.db'));
  seedReadyBaseline(db, { rootDir: dir });
  return { dir, db };
}

function cleanup({ dir, db }) {
  closeStateDb(db);
  fs.rmSync(dir, { recursive: true, force: true });
}

function seedParent(db, overrides = {}) {
  return ops.createTask(db, {
    id: 'parent-1',
    title: 'Build authentication module',
    type: 'feature',
    priority: 'P1',
    complexity: 9,
    files_modified: ['src/auth/index.ts'],
    ...overrides,
  });
}

const HAPPY_CHILDREN = [
  { id: 'child-1', title: 'Design auth schema', type: 'architecture', priority: 'P1', complexity: 4, deps: [], files_modified: ['src/auth/schema.ts'] },
  { id: 'child-2', title: 'Implement login endpoint', type: 'feature', priority: 'P1', complexity: 5, deps: ['child-1'], files_modified: ['src/auth/login.ts'] },
  { id: 'child-3', title: 'Add signup endpoint', type: 'feature', priority: 'P2', complexity: 3, deps: ['child-1'], files_modified: ['src/auth/signup.ts'] },
];

test('expandTask atomically persists host-derived children without a provider client', () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    const result = expandTask(ctx.db, {
      id: 'parent-1', children: HAPPY_CHILDREN, rootDir: ctx.dir,
    });
    assert.equal(result.parent_id, 'parent-1');
    assert.equal(result.children.length, 3);
    assert.equal(ops.readTask(ctx.db, 'parent-1').status, 'expanded');
    for (const child of HAPPY_CHILDREN) {
      const row = ops.readTask(ctx.db, child.id);
      assert.equal(row.parent_id, 'parent-1');
      assert.equal(row.status, 'pending');
    }
    const events = ops.subscribeEventsSince(ctx.db, { since_id: 0, limit: 100 }).events;
    assert.equal(events.filter((event) => event.type === 'task_expanded').length, 1);
  } finally { cleanup(ctx); }
});

test('expandTask rejects missing and already expanded parents', () => {
  const ctx = tmpDb();
  try {
    assert.throws(
      () => expandTask(ctx.db, { id: 'missing', children: HAPPY_CHILDREN, rootDir: ctx.dir }),
      (err) => err instanceof TaskExpandError && err.code === 'TASK_NOT_FOUND',
    );
    seedParent(ctx.db);
    expandTask(ctx.db, { id: 'parent-1', children: HAPPY_CHILDREN, rootDir: ctx.dir });
    assert.throws(
      () => expandTask(ctx.db, {
        id: 'parent-1', children: [{ ...HAPPY_CHILDREN[0], id: 'other' }], rootDir: ctx.dir,
      }),
      (err) => err instanceof TaskExpandError && err.code === 'ALREADY_EXPANDED',
    );
  } finally { cleanup(ctx); }
});

test('expandTask requires valid host-derived children and leaves the parent untouched on failure', () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    for (const children of [undefined, [], [{
      id: 'child-1', title: 'x', type: 'feature', priority: 'P1',
    }]]) {
      assert.throws(
        () => expandTask(ctx.db, { id: 'parent-1', children, rootDir: ctx.dir }),
        (err) => err instanceof TaskExpandError && err.code === 'INVALID_OUTPUT',
      );
      assert.equal(ops.readTask(ctx.db, 'parent-1').status, 'pending');
    }
  } finally { cleanup(ctx); }
});

test('expandTask rejects duplicate child ids', () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    assert.throws(
      () => expandTask(ctx.db, { id: 'parent-1', rootDir: ctx.dir, children: [
        { id: 'same', title: 'First child', type: 'feature', priority: 'P2' },
        { id: 'same', title: 'Second child', type: 'feature', priority: 'P2' },
      ] }),
      (err) => err instanceof TaskExpandError && err.code === 'INVALID_OUTPUT',
    );
  } finally { cleanup(ctx); }
});

test('expandTask rolls back every child when one id collides', () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    ops.createTask(ctx.db, {
      id: 'child-1', title: 'Pre-existing task', type: 'bugfix', priority: 'P3',
    });
    assert.throws(() => expandTask(ctx.db, {
      id: 'parent-1', children: HAPPY_CHILDREN, rootDir: ctx.dir,
    }));
    assert.equal(ops.readTask(ctx.db, 'parent-1').status, 'pending');
    assert.equal(ops.readTask(ctx.db, 'child-2'), null);
    assert.equal(ops.readTask(ctx.db, 'child-3'), null);
  } finally { cleanup(ctx); }
});

test('expandTask children inherit parent tag and change ownership', () => {
  const ctx = tmpDb();
  try {
    const { change } = changes.createChange(ctx.db, { ...completeChangeInput(),
      id: 'expand-change', title: 'Expand one task', kind: 'quick',
      intent: 'Keep child ownership inside the active change.',
      docs_impact: { status: 'none', rationale: 'test fixture' },
    }, { rootDir: ctx.dir });
    seedParent(ctx.db, { tag: 'feat-auth', change_id: change.id });
    const result = expandTask(ctx.db, {
      id: 'parent-1', children: HAPPY_CHILDREN, rootDir: ctx.dir,
    });
    for (const child of result.children) {
      const row = ops.readTask(ctx.db, child.id);
      assert.equal(row.tag, 'feat-auth');
      assert.equal(row.change_id, change.id);
    }
  } finally { cleanup(ctx); }
});

test('expandTask reports baseline health without turning it into a semantic gate', () => {
  for (const baseline of ['missing', 'draft', 'migrated']) {
    const ctx = tmpDb();
    try {
      seedParent(ctx.db);
      if (baseline === 'missing') ctx.db.prepare('DELETE FROM baselines').run();
      else if (baseline === 'draft') {
        ctx.db.prepare("UPDATE baselines SET status = 'draft' WHERE id = 'test-baseline'").run();
      } else {
        ctx.db.prepare(
          "UPDATE baselines SET mode = 'migrated', status = 'adopting' WHERE id = 'test-baseline'",
        ).run();
      }
      const result = expandTask(ctx.db, {
        id: 'parent-1', children: HAPPY_CHILDREN, rootDir: ctx.dir,
      });
      assert.ok(result.diagnostics.length > 0);
      assert.ok(ops.readTask(ctx.db, 'child-1'));
      assert.equal(ops.readTask(ctx.db, 'parent-1').status, 'expanded');
    } finally { cleanup(ctx); }
  }
});
