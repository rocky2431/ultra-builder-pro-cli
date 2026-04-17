'use strict';

// Phase 6.4 — code-review-graph live watcher.
//
// fs-watch the project's source tree, debounce bursts of editor saves, and
// hand batches off to an onBatch callback. Callers wire the callback to
// whatever keeps the graph fresh (e.g. the external code-review-graph MCP
// server's build_or_update_graph_tool). Keeping the glue in callers means
// this module has no MCP-client dependency and is trivial to unit-test.
//
// PLAN D24: real-time feedback beats startup rebuilds; agents learn about
// impact radius immediately after save, not after the next phase boot.

const chokidar = require('chokidar');

const DEFAULT_INCLUDE_EXT = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb', '.php',
  '.c', '.cc', '.cpp', '.h', '.hpp',
  '.swift', '.kt', '.scala',
]);

const DEFAULT_EXCLUDE_GLOBS = Object.freeze([
  '**/node_modules/**',
  '**/.git/**',
  '**/.ultra/**',
  '**/.code-review-graph/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
]);

function hasCodeExt(p, includeExt) {
  const idx = p.lastIndexOf('.');
  if (idx < 0) return false;
  return includeExt.has(p.slice(idx).toLowerCase());
}

function startWatcher({
  repoRoot,
  debounceMs = 500,
  includeExt = DEFAULT_INCLUDE_EXT,
  excludeGlobs = DEFAULT_EXCLUDE_GLOBS,
  largeBatchThreshold = 50,
  onBatch,
} = {}) {
  if (!repoRoot) throw new Error('startWatcher: repoRoot required');
  if (typeof onBatch !== 'function') throw new Error('startWatcher: onBatch required');

  let stopped = false;
  let ready = false;
  let timer = null;
  // kind → latest kind; path → {kind, ts} so rapid edit+add collapses cleanly.
  const pending = new Map();

  const w = chokidar.watch(repoRoot, {
    ignored: excludeGlobs,
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 20, pollInterval: 10 },
  });

  const readyPromise = new Promise((resolve) => {
    w.once('ready', () => { ready = true; resolve(); });
  });

  function record(kind, p) {
    // Drop events fired during chokidar's initial scan — ignoreInitial=true
    // mostly handles this but awaitWriteFinish can still surface add events
    // from files that existed when the watcher started.
    if (stopped || !ready) return;
    if (!hasCodeExt(p, includeExt)) return;
    pending.set(p, { kind, ts: Date.now() });
    schedule();
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(flush, debounceMs);
  }

  function flush() {
    timer = null;
    if (pending.size === 0) return;
    const changes = Array.from(pending.entries()).map(([p, meta]) => ({ path: p, kind: meta.kind, ts: meta.ts }));
    pending.clear();
    const batch = {
      changes,
      large_batch: changes.length >= largeBatchThreshold,
      ts: new Date().toISOString(),
    };
    try { onBatch(batch); }
    catch (err) { process.stderr.write(`code-graph-watcher onBatch error: ${err.message}\n`); }
  }

  w.on('add', (p) => record('add', p));
  w.on('change', (p) => record('change', p));
  w.on('unlink', (p) => record('unlink', p));
  w.on('error', (err) => process.stderr.write(`watcher error: ${err.message}\n`));

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      w.close().catch(() => { /* ignore close errors */ });
    },
    ready() { return readyPromise; },
    get running() { return !stopped; },
    get pendingCount() { return pending.size; },
    flushNow: flush,
  };
}

module.exports = {
  startWatcher,
  DEFAULT_INCLUDE_EXT,
  DEFAULT_EXCLUDE_GLOBS,
};
