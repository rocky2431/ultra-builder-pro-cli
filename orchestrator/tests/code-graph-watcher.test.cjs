'use strict';

// Phase 6.4 — code-graph watcher:
//   • fs-watch project code paths, debounce bursts, deliver batches via
//     onBatch callback. The watcher itself does not talk to the external
//     code-review-graph MCP server — that glue lives in callers (daemon /
//     CLI / smoke scripts) so the watcher stays testable with just an
//     onBatch spy.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const watcher = require('../code-graph-watcher.cjs');

function mkTree(layout = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-watch-'));
  for (const [rel, content] of Object.entries(layout)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

function cleanupTree(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function waitForBatches(batches, count, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (batches.length >= count) { clearInterval(timer); resolve(); return; }
      if (Date.now() - start > timeoutMs) { clearInterval(timer); reject(new Error(`timed out waiting for ${count} batches, got ${batches.length}`)); }
    }, 20);
  });
}

async function waitStable(handle) {
  // Block on chokidar's 'ready' so initial add events from pre-existing
  // files don't leak into test assertions.
  await handle.ready();
}

test('touch a watched file → onBatch fires with that path after debounce', async () => {
  const root = mkTree({ 'src/a.js': '// initial\n' });
  const batches = [];
  const handle = watcher.startWatcher({
    repoRoot: root,
    debounceMs: 80,
    onBatch: (b) => batches.push(b),
  });
  try {
    await waitStable(handle);
    fs.writeFileSync(path.join(root, 'src/a.js'), '// changed\n');
    await waitForBatches(batches, 1);
    assert.equal(batches.length, 1);
    assert.ok(batches[0].changes.some((c) => c.path.endsWith('src/a.js')));
  } finally {
    handle.stop();
    cleanupTree(root);
  }
});

test('debounce merges bursts: 3 writes within window → 1 batch', async () => {
  const root = mkTree({ 'src/a.js': '0', 'src/b.js': '0', 'src/c.js': '0' });
  const batches = [];
  const handle = watcher.startWatcher({
    repoRoot: root,
    debounceMs: 100,
    onBatch: (b) => batches.push(b),
  });
  try {
    await waitStable(handle);
    fs.writeFileSync(path.join(root, 'src/a.js'), '1');
    fs.writeFileSync(path.join(root, 'src/b.js'), '1');
    fs.writeFileSync(path.join(root, 'src/c.js'), '1');
    await waitForBatches(batches, 1);
    // Give a bit extra time in case a 2nd batch is coming (it shouldn't).
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(batches.length, 1, `expected 1 merged batch, got ${batches.length}`);
    const paths = new Set(batches[0].changes.map((c) => path.basename(c.path)));
    assert.ok(paths.has('a.js') && paths.has('b.js') && paths.has('c.js'));
  } finally {
    handle.stop();
    cleanupTree(root);
  }
});

test('excludePaths: node_modules changes are ignored', async () => {
  const root = mkTree({
    'src/a.js': '0',
    'node_modules/lib/x.js': '0',
  });
  const batches = [];
  const handle = watcher.startWatcher({
    repoRoot: root,
    debounceMs: 80,
    onBatch: (b) => batches.push(b),
  });
  try {
    await waitStable(handle);
    fs.writeFileSync(path.join(root, 'node_modules/lib/x.js'), '1');
    await new Promise((r) => setTimeout(r, 200));
    // If only node_modules was changed, no batch should fire.
    assert.equal(batches.length, 0, 'node_modules write should be ignored');
    // Sanity: a real source change still fires.
    fs.writeFileSync(path.join(root, 'src/a.js'), '1');
    await waitForBatches(batches, 1);
    assert.equal(batches.length, 1);
    assert.ok(batches[0].changes.every((c) => !c.path.includes('node_modules')));
  } finally {
    handle.stop();
    cleanupTree(root);
  }
});

test('stop(): subsequent writes do not deliver', async () => {
  const root = mkTree({ 'src/a.js': '0' });
  const batches = [];
  const handle = watcher.startWatcher({
    repoRoot: root,
    debounceMs: 80,
    onBatch: (b) => batches.push(b),
  });
  try {
    await waitStable(handle);
    handle.stop();
    fs.writeFileSync(path.join(root, 'src/a.js'), '1');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(batches.length, 0);
  } finally {
    cleanupTree(root);
  }
});

test('large_batch flag: >threshold changes in one burst', async () => {
  const files = {};
  for (let i = 0; i < 12; i++) files[`src/f${i}.js`] = '0';
  const root = mkTree(files);
  const batches = [];
  const handle = watcher.startWatcher({
    repoRoot: root,
    debounceMs: 120,
    largeBatchThreshold: 10, // lower for test speed
    onBatch: (b) => batches.push(b),
  });
  try {
    await waitStable(handle);
    for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(root, `src/f${i}.js`), '1');
    await waitForBatches(batches, 1);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(batches.length, 1);
    assert.equal(batches[0].changes.length, 12);
    assert.equal(batches[0].large_batch, true);
  } finally {
    handle.stop();
    cleanupTree(root);
  }
});

test('non-code files ignored (e.g. .log, .tmp)', async () => {
  const root = mkTree({ 'src/a.js': '0', 'run.log': '0', 'tmp.tmp': '0' });
  const batches = [];
  const handle = watcher.startWatcher({
    repoRoot: root,
    debounceMs: 80,
    onBatch: (b) => batches.push(b),
  });
  try {
    await waitStable(handle);
    fs.writeFileSync(path.join(root, 'run.log'), '1');
    fs.writeFileSync(path.join(root, 'tmp.tmp'), '1');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(batches.length, 0);
  } finally {
    handle.stop();
    cleanupTree(root);
  }
});
