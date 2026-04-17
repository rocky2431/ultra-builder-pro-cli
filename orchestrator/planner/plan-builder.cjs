'use strict';

// Phase 8A.4a — Execution plan builder (Functional Core, no IO).
//
// buildPlan(tasks) → { waves, ownership_forecast, conflict_surface,
// estimated_cost_usd, estimated_duration_min, cycles }.
// Composes topo.computeWaves + pricing.computeCost with a file-overlap
// conflict detector. Downstream 8A.4b writes this object to
// .ultra/execution-plan.json.

const { computeWaves } = require('../../mcp-server/lib/topo.cjs');
const { computeCost } = require('../../mcp-server/lib/pricing.cjs');

const DEFAULT_COMPLEXITY = 3;
const TOKENS_PER_COMPLEXITY = Object.freeze({ input: 5000, output: 2000 });
const DURATION_MIN_PER_COMPLEXITY = 5;

function buildPlan(tasks, { runtime = 'claude', model = null } = {}) {
  if (!Array.isArray(tasks)) {
    throw new TypeError('buildPlan: tasks must be an array');
  }

  const graph = tasks.map((t) => ({
    id: t.id,
    deps: Array.isArray(t.deps) ? t.deps : [],
  }));
  const { waves, cycles } = computeWaves(graph);

  const byId = new Map(tasks.map((t) => [t.id, t]));

  const conflict_surface = [];
  const wavePayload = waves.map((waveTasks, idx) => {
    const pairs = listWaveConflicts(waveTasks, byId);
    for (const p of pairs) {
      conflict_surface.push({
        files: p.files,
        tasks: p.tasks,
        recommend: 'sequentialize',
      });
    }
    const hasConflict = pairs.length > 0;
    const entry = {
      id: idx + 1,
      tasks: waveTasks,
      parallel: !hasConflict && waveTasks.length > 1,
    };
    if (hasConflict) {
      const sharedFiles = [...new Set(pairs.flatMap((p) => p.files))];
      entry.reason = `shared files: ${sharedFiles.join(', ')}`;
    }
    return entry;
  });

  const ownership_forecast = {};
  for (const t of tasks) {
    ownership_forecast[t.id] = Array.isArray(t.files_modified) ? t.files_modified : [];
  }

  const estimated_cost_usd = round4(
    tasks.reduce((sum, t) => {
      const complexity = Number(t.complexity || DEFAULT_COMPLEXITY);
      const ti = complexity * TOKENS_PER_COMPLEXITY.input;
      const to = complexity * TOKENS_PER_COMPLEXITY.output;
      return sum + (computeCost(runtime, model, ti, to) || 0);
    }, 0),
  );

  const estimated_duration_min = wavePayload.reduce((acc, wv) => {
    const complexities = wv.tasks.map(
      (id) => Number(byId.get(id)?.complexity || DEFAULT_COMPLEXITY),
    );
    if (wv.parallel) {
      return acc + Math.max(0, ...complexities) * DURATION_MIN_PER_COMPLEXITY;
    }
    return acc + complexities.reduce((a, b) => a + b, 0) * DURATION_MIN_PER_COMPLEXITY;
  }, 0);

  return {
    waves: wavePayload,
    ownership_forecast,
    conflict_surface,
    estimated_cost_usd,
    estimated_duration_min,
    cycles,
  };
}

function listWaveConflicts(waveTasks, byId) {
  const conflicts = [];
  for (let i = 0; i < waveTasks.length; i++) {
    for (let j = i + 1; j < waveTasks.length; j++) {
      const a = waveTasks[i];
      const b = waveTasks[j];
      const aFiles = new Set(byId.get(a)?.files_modified || []);
      const bFiles = new Set(byId.get(b)?.files_modified || []);
      const overlap = [];
      for (const f of aFiles) if (bFiles.has(f)) overlap.push(f);
      if (overlap.length > 0) {
        conflicts.push({ files: overlap, tasks: [a, b] });
      }
    }
  }
  return conflicts;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = {
  buildPlan,
  listWaveConflicts,
  DEFAULT_COMPLEXITY,
  TOKENS_PER_COMPLEXITY,
  DURATION_MIN_PER_COMPLEXITY,
};
