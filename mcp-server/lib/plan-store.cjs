'use strict';

// Phase 8A.4b — Persist / load / section-slice the execution-plan artifact.
//
// The plan itself is computed by orchestrator/planner/plan-builder.cjs
// (Functional Core). This module handles IO: atomic write via the shared
// file-ops helper, read-back, md rendering, and section projection for
// plan.get.

const fs = require('node:fs');
const path = require('node:path');
const { writeAtomic } = require('../../adapters/_shared/file-ops.cjs');
const { buildPlan } = require('../../orchestrator/planner/plan-builder.cjs');

const DEFAULT_ARTIFACT_RELPATH = '.ultra/execution-plan.json';

function renderPlanMd(plan) {
  const lines = [];
  lines.push('# Execution Plan');
  lines.push('');
  lines.push(`- Waves: ${plan.waves.length}`);
  lines.push(`- Estimated cost: $${plan.estimated_cost_usd}`);
  lines.push(`- Estimated duration: ${plan.estimated_duration_min} min`);
  if (plan.conflict_surface.length > 0) {
    lines.push(`- Conflicts: ${plan.conflict_surface.length}`);
  }
  if (plan.cycles && plan.cycles.length > 0) {
    lines.push(`- Cycles: ${plan.cycles.length}`);
  }
  lines.push('');
  lines.push('## Waves');
  lines.push('');
  for (const w of plan.waves) {
    lines.push(`### Wave ${w.id} ${w.parallel ? '(parallel)' : '(serial)'}`);
    for (const id of w.tasks) lines.push(`- ${id}`);
    if (w.reason) lines.push(`_reason_: ${w.reason}`);
    lines.push('');
  }
  if (plan.conflict_surface.length > 0) {
    lines.push('## Conflict Surface');
    lines.push('');
    for (const c of plan.conflict_surface) {
      lines.push(`- **files**: ${c.files.join(', ')}; **tasks**: ${c.tasks.join(', ')}; **recommend**: ${c.recommend}`);
    }
  }
  return lines.join('\n') + '\n';
}

function savePlanArtifact(plan, outPath, format = 'json') {
  if (!outPath) {
    const err = new Error('out_path required');
    err.code = 'WRITE_FAILED';
    throw err;
  }
  const abs = path.resolve(outPath);
  const content = format === 'md' ? renderPlanMd(plan) : JSON.stringify(plan, null, 2);
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    writeAtomic(abs, content);
  } catch (err) {
    const wrap = new Error(`cannot write plan: ${err.message}`);
    wrap.code = 'WRITE_FAILED';
    wrap.cause = err;
    throw wrap;
  }
  return { plan_path: abs };
}

function loadPlanArtifact(projectRoot) {
  const abs = path.resolve(projectRoot, DEFAULT_ARTIFACT_RELPATH);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

function selectSection(plan, section) {
  switch (section || 'all') {
    case 'tasks':     return { ownership_forecast: plan.ownership_forecast };
    case 'topo':      return { waves: plan.waves };
    case 'conflicts': return { conflict_surface: plan.conflict_surface };
    case 'all':
    default:          return plan;
  }
}

module.exports = {
  savePlanArtifact,
  loadPlanArtifact,
  selectSection,
  renderPlanMd,
  buildPlan,
  DEFAULT_ARTIFACT_RELPATH,
};
