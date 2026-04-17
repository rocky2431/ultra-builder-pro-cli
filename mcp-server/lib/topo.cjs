'use strict';

// Phase 8A.2 — Dependency topology (Functional Core, no IO).
//
// computeWaves groups tasks into execution waves where every task in wave N
// has all its deps satisfied by waves < N. Cycles are surfaced as separate
// SCCs via Tarjan so each independent loop is reported on its own.
//
// Input:  tasks = [{ id: string, deps: string[] }, ...]
// Output: { waves: string[][], cycles: string[][] }
//   - waves[i] is the set of task ids runnable in wave i. Order within a
//     wave is not meaningful — callers should treat each wave as a set.
//   - cycles[j] holds the ids of a strongly-connected component (size >= 2,
//     or size 1 with a self-dep). Empty when the graph is acyclic.
//
// Deps that point to ids not present in the input set are treated as
// already satisfied (the task was completed in a previous plan, or lives
// outside the current topo scope).

function computeWaves(tasks) {
  if (!Array.isArray(tasks)) {
    throw new TypeError('computeWaves: tasks must be an array');
  }

  const ids = new Set(tasks.map((t) => t.id));

  // adj: prerequisite id → [dependent ids]
  // inDeg: id → count of in-scope deps not yet satisfied
  const adj = new Map();
  const inDeg = new Map();

  for (const t of tasks) {
    if (!inDeg.has(t.id)) inDeg.set(t.id, 0);
  }
  for (const t of tasks) {
    const deps = Array.isArray(t.deps) ? t.deps : [];
    for (const d of deps) {
      if (!ids.has(d)) continue;
      if (!adj.has(d)) adj.set(d, []);
      adj.get(d).push(t.id);
      inDeg.set(t.id, (inDeg.get(t.id) || 0) + 1);
    }
  }

  const waves = [];
  const processed = new Set();
  let current = tasks.map((t) => t.id).filter((id) => inDeg.get(id) === 0);

  while (current.length > 0) {
    waves.push(current);
    for (const id of current) processed.add(id);
    const next = [];
    for (const id of current) {
      const children = adj.get(id) || [];
      for (const c of children) {
        const newDeg = (inDeg.get(c) || 0) - 1;
        inDeg.set(c, newDeg);
        if (newDeg === 0 && !processed.has(c)) next.push(c);
      }
    }
    current = next;
  }

  const residual = tasks.map((t) => t.id).filter((id) => !processed.has(id));
  const cycles = residual.length === 0 ? [] : findSccs(residual, tasks);

  return { waves, cycles };
}

function findSccs(residualIds, tasks) {
  const inScope = new Set(residualIds);
  const adj = new Map();
  const selfLoops = new Set();

  for (const t of tasks) {
    if (!inScope.has(t.id)) continue;
    const deps = Array.isArray(t.deps) ? t.deps : [];
    for (const d of deps) {
      if (!inScope.has(d)) continue;
      if (d === t.id) { selfLoops.add(t.id); continue; }
      if (!adj.has(d)) adj.set(d, []);
      adj.get(d).push(t.id);
    }
  }

  let index = 0;
  const indices = new Map();
  const lowlinks = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];

  function strongconnect(v) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const succ = adj.get(v) || [];
    for (const w of succ) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(w)));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(w)));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1 || selfLoops.has(v)) {
        sccs.push(scc);
      }
    }
  }

  for (const v of residualIds) {
    if (!indices.has(v)) strongconnect(v);
  }

  return sccs;
}

module.exports = { computeWaves };
