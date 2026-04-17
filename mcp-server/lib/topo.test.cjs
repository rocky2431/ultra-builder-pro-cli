'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeWaves } = require('./topo.cjs');

function makeTask(id, deps = []) {
  return { id, deps };
}

function idsSet(ids) {
  return new Set(ids);
}

function asWaveSets(waves) {
  return waves.map(idsSet);
}

test('topo: empty array → empty waves and cycles', () => {
  const r = computeWaves([]);
  assert.deepEqual(r.waves, []);
  assert.deepEqual(r.cycles, []);
});

test('topo: single task with no deps → single wave', () => {
  const r = computeWaves([makeTask('A')]);
  assert.deepEqual(r.waves, [['A']]);
  assert.deepEqual(r.cycles, []);
});

test('topo fixture 1: linear chain A, B(A), C(B) → three serial waves', () => {
  const r = computeWaves([
    makeTask('A'),
    makeTask('B', ['A']),
    makeTask('C', ['B']),
  ]);
  assert.deepEqual(asWaveSets(r.waves), [idsSet(['A']), idsSet(['B']), idsSet(['C'])]);
  assert.deepEqual(r.cycles, []);
});

test('topo fixture 2: fan-out A→{B,C} + independent D→E → 2 waves', () => {
  const r = computeWaves([
    makeTask('A'),
    makeTask('B', ['A']),
    makeTask('C', ['A']),
    makeTask('D'),
    makeTask('E', ['D']),
  ]);
  assert.equal(r.waves.length, 2);
  assert.deepEqual(asWaveSets(r.waves), [
    idsSet(['A', 'D']),
    idsSet(['B', 'C', 'E']),
  ]);
  assert.deepEqual(r.cycles, []);
});

test('topo fixture 3: double diamond merges waves correctly', () => {
  const r = computeWaves([
    makeTask('A'),
    makeTask('B', ['A']),
    makeTask('C', ['A']),
    makeTask('D', ['B', 'C']),
    makeTask('E'),
    makeTask('F', ['E']),
    makeTask('G', ['E']),
    makeTask('H', ['F', 'G']),
  ]);
  assert.deepEqual(asWaveSets(r.waves), [
    idsSet(['A', 'E']),
    idsSet(['B', 'C', 'F', 'G']),
    idsSet(['D', 'H']),
  ]);
  assert.deepEqual(r.cycles, []);
});

test('topo fixture 4: 2-node cycle A↔B → cycle reported, no waves', () => {
  const r = computeWaves([
    makeTask('A', ['B']),
    makeTask('B', ['A']),
  ]);
  assert.deepEqual(r.waves, []);
  assert.equal(r.cycles.length, 1);
  assert.deepEqual(idsSet(r.cycles[0]), idsSet(['A', 'B']));
});

test('topo fixture 5: two independent cycles A↔B and C↔D → both reported', () => {
  const r = computeWaves([
    makeTask('A', ['B']),
    makeTask('B', ['A']),
    makeTask('C', ['D']),
    makeTask('D', ['C']),
  ]);
  assert.deepEqual(r.waves, []);
  assert.equal(r.cycles.length, 2);
  const cycleSets = r.cycles.map((c) => idsSet(c));
  const expected = [idsSet(['A', 'B']), idsSet(['C', 'D'])];
  for (const exp of expected) {
    const found = cycleSets.some(
      (s) => s.size === exp.size && [...s].every((x) => exp.has(x)),
    );
    assert.ok(found, `cycle ${[...exp].join(',')} not reported`);
  }
});

test('topo: self-loop counts as cycle', () => {
  const r = computeWaves([makeTask('A', ['A'])]);
  assert.deepEqual(r.waves, []);
  assert.equal(r.cycles.length, 1);
  assert.deepEqual(r.cycles[0], ['A']);
});

test('topo: cycle plus acyclic tail — tail is waved, cycle isolated', () => {
  const r = computeWaves([
    makeTask('A', ['B']),
    makeTask('B', ['A']),
    makeTask('X'),
    makeTask('Y', ['X']),
  ]);
  assert.deepEqual(asWaveSets(r.waves), [idsSet(['X']), idsSet(['Y'])]);
  assert.equal(r.cycles.length, 1);
  assert.deepEqual(idsSet(r.cycles[0]), idsSet(['A', 'B']));
});

test('topo: external deps (ids not in task_ids) are treated as satisfied', () => {
  const r = computeWaves([makeTask('A', ['X'])]);
  assert.deepEqual(r.waves, [['A']]);
  assert.deepEqual(r.cycles, []);
});

test('topo: input order does not change wave membership', () => {
  const tasks = [
    makeTask('A'),
    makeTask('B', ['A']),
    makeTask('C', ['A']),
    makeTask('D', ['B', 'C']),
  ];
  const r1 = computeWaves(tasks);
  const r2 = computeWaves([...tasks].reverse());
  assert.deepEqual(asWaveSets(r1.waves), asWaveSets(r2.waves));
  assert.deepEqual(r1.cycles, r2.cycles);
});

test('topo: rejects non-array input', () => {
  assert.throws(() => computeWaves(null), TypeError);
  assert.throws(() => computeWaves({}), TypeError);
});

test('topo: 3-node cycle A→B→C→A surfaced intact', () => {
  const r = computeWaves([
    makeTask('A', ['C']),
    makeTask('B', ['A']),
    makeTask('C', ['B']),
  ]);
  assert.deepEqual(r.waves, []);
  assert.equal(r.cycles.length, 1);
  assert.deepEqual(idsSet(r.cycles[0]), idsSet(['A', 'B', 'C']));
});
