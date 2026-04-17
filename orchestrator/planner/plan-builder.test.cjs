'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPlan, listWaveConflicts } = require('./plan-builder.cjs');

function mk(id, deps = [], files = [], complexity = 3) {
  return { id, deps, files_modified: files, complexity };
}

test('buildPlan fixture 1: 5 tasks, no file overlap → 2 waves, no conflicts', () => {
  const tasks = [
    mk('a', [], ['src/a.ts'], 2),
    mk('b', ['a'], ['src/b.ts'], 3),
    mk('c', ['a'], ['src/c.ts'], 4),
    mk('d', ['b', 'c'], ['src/d.ts'], 5),
    mk('e', [], ['src/e.ts'], 2),
  ];
  const plan = buildPlan(tasks);
  assert.equal(plan.waves.length, 3);
  assert.equal(plan.conflict_surface.length, 0);
  // wave 1 should contain a+e, both parallel-safe
  assert.deepEqual(new Set(plan.waves[0].tasks), new Set(['a', 'e']));
  assert.equal(plan.waves[0].parallel, true);
  assert.deepEqual(plan.cycles, []);
  assert.ok(plan.estimated_cost_usd > 0);
  assert.ok(plan.estimated_duration_min > 0);
});

test('buildPlan fixture 2: same wave, shared file → conflict_surface + parallel=false', () => {
  const tasks = [
    mk('a', []),
    mk('b', ['a'], ['src/utils.ts']),
    mk('c', ['a'], ['src/utils.ts']),
  ];
  const plan = buildPlan(tasks);
  assert.equal(plan.waves.length, 2);
  const w2 = plan.waves[1];
  assert.equal(w2.parallel, false);
  assert.match(w2.reason, /shared files: src\/utils\.ts/);

  assert.equal(plan.conflict_surface.length, 1);
  const c = plan.conflict_surface[0];
  assert.deepEqual(c.files, ['src/utils.ts']);
  assert.deepEqual(new Set(c.tasks), new Set(['b', 'c']));
  assert.equal(c.recommend, 'sequentialize');
});

test('buildPlan fixture 3: cross-wave same file → NOT a conflict', () => {
  const tasks = [
    mk('a', [], ['src/shared.ts']),
    mk('b', ['a'], ['src/shared.ts']),
  ];
  const plan = buildPlan(tasks);
  assert.equal(plan.conflict_surface.length, 0);
  // wave 1 has only `a`, not parallel; wave 2 has only `b`, not parallel
  for (const w of plan.waves) {
    assert.equal(w.parallel, false);
    assert.ok(!w.reason);
  }
});

test('buildPlan fixture 4: empty tasks → empty plan, non-negative numbers', () => {
  const plan = buildPlan([]);
  assert.deepEqual(plan.waves, []);
  assert.deepEqual(plan.conflict_surface, []);
  assert.deepEqual(plan.ownership_forecast, {});
  assert.equal(plan.estimated_cost_usd, 0);
  assert.equal(plan.estimated_duration_min, 0);
  assert.deepEqual(plan.cycles, []);
});

test('buildPlan fixture 5: cost + duration math (parallel vs serial waves)', () => {
  // wave 1 (parallel): a complexity=2, b complexity=4 → max = 4 * 5 = 20 min
  // wave 2 (1 task, not parallel): c complexity=6 → 6 * 5 = 30 min
  // total duration = 50 min
  const tasks = [
    mk('a', [], ['src/a.ts'], 2),
    mk('b', [], ['src/b.ts'], 4),
    mk('c', ['a', 'b'], ['src/c.ts'], 6),
  ];
  const plan = buildPlan(tasks);
  assert.equal(plan.estimated_duration_min, 50);
  // cost: 3 tasks × sum(complexity)=12 × (5000*3e-6 + 2000*15e-6) per complexity unit
  //     = 12 × (0.015 + 0.030) = 12 × 0.045 = 0.54 usd
  assert.ok(Math.abs(plan.estimated_cost_usd - 0.54) < 0.001);
});

test('buildPlan: serial wave (with conflict) sums complexities instead of max', () => {
  // both tasks in same wave share a file → wave is serial
  // wave 1: a(complexity=3), b(complexity=3) → (3+3) * 5 = 30 min
  const tasks = [
    mk('a', [], ['src/utils.ts'], 3),
    mk('b', [], ['src/utils.ts'], 3),
  ];
  const plan = buildPlan(tasks);
  assert.equal(plan.waves[0].parallel, false);
  assert.equal(plan.estimated_duration_min, 30);
});

test('buildPlan: ownership_forecast captures per-task files_modified verbatim', () => {
  const tasks = [
    mk('a', [], ['src/a.ts', 'src/a.util.ts']),
    mk('b', [], ['src/b.ts']),
  ];
  const plan = buildPlan(tasks);
  assert.deepEqual(plan.ownership_forecast, {
    a: ['src/a.ts', 'src/a.util.ts'],
    b: ['src/b.ts'],
  });
});

test('buildPlan: cycle in task graph surfaced in plan.cycles', () => {
  const tasks = [
    mk('x', ['y']),
    mk('y', ['x']),
  ];
  const plan = buildPlan(tasks);
  assert.deepEqual(plan.waves, []);
  assert.equal(plan.cycles.length, 1);
  assert.deepEqual(new Set(plan.cycles[0]), new Set(['x', 'y']));
});

test('buildPlan: missing complexity defaults to DEFAULT_COMPLEXITY for cost calc', () => {
  const tasks = [{ id: 'a', deps: [], files_modified: [] }];
  const plan = buildPlan(tasks);
  // complexity 3 → 15k in, 6k out → cost > 0
  assert.ok(plan.estimated_cost_usd > 0);
  assert.equal(plan.estimated_duration_min, 15); // 3 * 5 (single-task wave, not parallel)
});

test('buildPlan: non-array input → TypeError', () => {
  assert.throws(() => buildPlan(null), TypeError);
  assert.throws(() => buildPlan({}), TypeError);
});

test('listWaveConflicts: no overlap → empty', () => {
  const byId = new Map([
    ['a', { id: 'a', files_modified: ['x.ts'] }],
    ['b', { id: 'b', files_modified: ['y.ts'] }],
  ]);
  assert.deepEqual(listWaveConflicts(['a', 'b'], byId), []);
});

test('listWaveConflicts: pair overlap reported once', () => {
  const byId = new Map([
    ['a', { id: 'a', files_modified: ['shared.ts', 'x.ts'] }],
    ['b', { id: 'b', files_modified: ['shared.ts'] }],
  ]);
  const out = listWaveConflicts(['a', 'b'], byId);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].files, ['shared.ts']);
  assert.deepEqual(out[0].tasks, ['a', 'b']);
});

test('listWaveConflicts: three-way overlap yields C(3,2)=3 pairs', () => {
  const byId = new Map([
    ['a', { id: 'a', files_modified: ['x.ts'] }],
    ['b', { id: 'b', files_modified: ['x.ts'] }],
    ['c', { id: 'c', files_modified: ['x.ts'] }],
  ]);
  const out = listWaveConflicts(['a', 'b', 'c'], byId);
  assert.equal(out.length, 3);
});
