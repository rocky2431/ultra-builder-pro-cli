'use strict';

// Integration tests for task-expander — real SQLite (Testcontainers-style
// in-process) so parent_id column + status transition + task_expanded event
// are exercised end-to-end. The only Test Double is the LLM client, which
// we inject with deterministic child fixtures.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const ops = require('./state-ops.cjs');
const { expandTask, TaskExpandError } = require('./task-expander.cjs');

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-expand-'));
  const { db } = initStateDb(path.join(dir, 'state.db'));
  return { dir, db };
}

function cleanup({ dir, db }) {
  closeStateDb(db);
  fs.rmSync(dir, { recursive: true, force: true });
}

function fakeLlm(childrenJson, { shouldFail = false, usage = {} } = {}) {
  return {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    async completeJson() {
      if (shouldFail) throw new Error('upstream LLM 500');
      return {
        json: { children: childrenJson },
        raw: JSON.stringify({ children: childrenJson }),
        usage,
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
      };
    },
  };
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
  { id: 'child-1', title: 'Design auth schema',       type: 'architecture', priority: 'P1', complexity: 4, deps: [],          files_modified: ['src/auth/schema.ts'] },
  { id: 'child-2', title: 'Implement login endpoint', type: 'feature',      priority: 'P1', complexity: 5, deps: ['child-1'], files_modified: ['src/auth/login.ts']  },
  { id: 'child-3', title: 'Add signup endpoint',      type: 'feature',      priority: 'P2', complexity: 3, deps: ['child-1'], files_modified: ['src/auth/signup.ts'] },
];

test('expandTask happy path: creates children, flips parent status, emits task_expanded', async () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    const result = await expandTask(ctx.db, {
      id: 'parent-1',
      strategy: 'llm',
      llmClient: fakeLlm(HAPPY_CHILDREN),
    });
    assert.equal(result.parent_id, 'parent-1');
    assert.equal(result.children.length, 3);

    const parentAfter = ops.readTask(ctx.db, 'parent-1');
    assert.equal(parentAfter.status, 'expanded');

    for (const child of HAPPY_CHILDREN) {
      const row = ops.readTask(ctx.db, child.id);
      assert.ok(row, `child ${child.id} missing`);
      assert.equal(row.parent_id, 'parent-1');
      assert.equal(row.status, 'pending');
    }

    const events = ops.subscribeEventsSince(ctx.db, { since_id: 0, limit: 100 });
    const expandedEvents = events.events.filter((e) => e.type === 'task_expanded');
    assert.equal(expandedEvents.length, 1);
    assert.equal(expandedEvents[0].task_id, 'parent-1');
    const createdEvents = events.events.filter((e) => e.type === 'task_created');
    assert.ok(createdEvents.length >= 4, 'parent + 3 children task_created events');
  } finally {
    cleanup(ctx);
  }
});

test('expandTask: missing parent → TASK_NOT_FOUND', async () => {
  const ctx = tmpDb();
  try {
    await assert.rejects(
      expandTask(ctx.db, {
        id: 'does-not-exist',
        llmClient: fakeLlm(HAPPY_CHILDREN),
      }),
      (err) => err instanceof TaskExpandError && err.code === 'TASK_NOT_FOUND',
    );
  } finally {
    cleanup(ctx);
  }
});

test('expandTask: already-expanded parent → ALREADY_EXPANDED', async () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    // First expansion succeeds
    await expandTask(ctx.db, {
      id: 'parent-1',
      llmClient: fakeLlm(HAPPY_CHILDREN),
    });
    // Second attempt must refuse
    await assert.rejects(
      expandTask(ctx.db, {
        id: 'parent-1',
        llmClient: fakeLlm(HAPPY_CHILDREN.map((c, i) => ({ ...c, id: `other-${i}` }))),
      }),
      (err) => err instanceof TaskExpandError && err.code === 'ALREADY_EXPANDED',
    );
  } finally {
    cleanup(ctx);
  }
});

test('expandTask: strategy="manual" → NOT_IMPLEMENTED', async () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    await assert.rejects(
      expandTask(ctx.db, {
        id: 'parent-1',
        strategy: 'manual',
        llmClient: fakeLlm(HAPPY_CHILDREN),
      }),
      (err) => err instanceof TaskExpandError && err.code === 'NOT_IMPLEMENTED',
    );
  } finally {
    cleanup(ctx);
  }
});

test('expandTask: missing llmClient → NO_LLM_CLIENT', async () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    await assert.rejects(
      expandTask(ctx.db, { id: 'parent-1' }),
      (err) => err instanceof TaskExpandError && err.code === 'NO_LLM_CLIENT',
    );
  } finally {
    cleanup(ctx);
  }
});

test('expandTask: LLM throws → LLM_CALL_FAILED', async () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    await assert.rejects(
      expandTask(ctx.db, {
        id: 'parent-1',
        llmClient: fakeLlm([], { shouldFail: true }),
      }),
      (err) => err instanceof TaskExpandError && err.code === 'LLM_CALL_FAILED',
    );
    // parent status must be unchanged
    assert.equal(ops.readTask(ctx.db, 'parent-1').status, 'pending');
  } finally {
    cleanup(ctx);
  }
});

test('expandTask: invalid child shape → INVALID_OUTPUT, parent untouched', async () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    const bad = [{ id: 'child-1', title: 'x', type: 'feature', priority: 'P1' }]; // title too short
    await assert.rejects(
      expandTask(ctx.db, { id: 'parent-1', llmClient: fakeLlm(bad) }),
      (err) => err instanceof TaskExpandError && err.code === 'INVALID_OUTPUT',
    );
    assert.equal(ops.readTask(ctx.db, 'parent-1').status, 'pending');
  } finally {
    cleanup(ctx);
  }
});

test('expandTask: duplicate child id → INVALID_OUTPUT', async () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    const dup = [
      { id: 'same', title: 'First child',  type: 'feature', priority: 'P2' },
      { id: 'same', title: 'Second child', type: 'feature', priority: 'P2' },
    ];
    await assert.rejects(
      expandTask(ctx.db, { id: 'parent-1', llmClient: fakeLlm(dup) }),
      (err) => err instanceof TaskExpandError && err.code === 'INVALID_OUTPUT',
    );
  } finally {
    cleanup(ctx);
  }
});

test('expandTask: tx rollback — child id collides with existing task → parent status unchanged, no children inserted', async () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db);
    // Pre-create a task with the same id one of the children will try
    ops.createTask(ctx.db, {
      id: 'child-1',
      title: 'Pre-existing task',
      type: 'bugfix',
      priority: 'P3',
    });
    await assert.rejects(
      expandTask(ctx.db, { id: 'parent-1', llmClient: fakeLlm(HAPPY_CHILDREN) }),
      /* any error is acceptable — the point is no partial state */
    );
    assert.equal(ops.readTask(ctx.db, 'parent-1').status, 'pending');
    // child-2 / child-3 must NOT have been inserted
    assert.equal(ops.readTask(ctx.db, 'child-2'), null);
    assert.equal(ops.readTask(ctx.db, 'child-3'), null);
  } finally {
    cleanup(ctx);
  }
});

test('expandTask: children inherit parent tag', async () => {
  const ctx = tmpDb();
  try {
    seedParent(ctx.db, { tag: 'feat-auth' });
    await expandTask(ctx.db, {
      id: 'parent-1',
      llmClient: fakeLlm(HAPPY_CHILDREN),
    });
    for (const child of HAPPY_CHILDREN) {
      const row = ops.readTask(ctx.db, child.id);
      assert.equal(row.tag, 'feat-auth');
    }
  } finally {
    cleanup(ctx);
  }
});
