'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  savePlanArtifact,
  loadPlanArtifact,
  selectSection,
  renderPlanMd,
  DEFAULT_ARTIFACT_RELPATH,
} = require('./plan-store.cjs');

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
