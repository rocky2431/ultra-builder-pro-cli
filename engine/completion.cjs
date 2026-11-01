'use strict';

const { unique, problem } = require('./formats.cjs');
const { withLock, append } = require('./ledger.cjs');
const { load } = require('./loading.cjs');
const { status, invariantProblems, dependencies } = require('./states.cjs');

function complete(project, id) {
  return withLock(project.root, () => recordCompletion(load(project.root), id));
}

function recordCompletion(project, id) {
  const node = project.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`Unknown node ${id}. Use an id from plan.json.`);
  const state = status(project);
  const problems = [];
  if (state.gate !== 'pass') problems.push(problem('plan-gate', `Plan gate is ${state.gate}`,
    'Fix plan problems and rerun gate.'));
  if (state.dirty) problems.push(problem('dirty-tree', 'Code tree is dirty',
    'Commit or restore code changes before completing the node.'));
  for (const dep of dependencies(project, node)) {
    if (!state.nodes.some((n) => n.id === dep && n.state === 'done')) {
      problems.push(problem('dependency-not-done', `${dep} is not done`,
        'Complete the dependency first.'));
    }
  }
  let required = node.covers;
  if (node.kind === 'cleanup') {
    const closed = new Set(project.closures.map((c) => c.milestone));
    const done = project.nodes.filter((n) => n.milestone === node.milestone
      && state.nodes.some((s) => s.id === n.id && s.state === 'done'));
    const covered = new Set(done.flatMap((n) => n.covers));
    required = unique(project.milestones.flatMap((m) => closed.has(m.id) ? m.requirements
      : m.id === node.milestone ? m.requirements.filter((r) => covered.has(r)) : []));
  }
  for (const req of required) {
    if (!state.requirements.some((r) => r.id === req && r.state === 'green')) {
      problems.push(problem('requirement-not-green', `${req} is not green`,
        'Run its checks on clean, current code.'));
    }
  }
  problems.push(...invariantProblems(state));
  if (!problems.length) {
    const ids = state.requirements.filter((r) => node.covers.includes(r.id))
      .flatMap((r) => r.checks.map((c) => c.id));
    append(project.root, 'nodes', { v: 1, node: id, at: new Date().toISOString(),
      code: project.code, shared: project.shared,
      reqs: Object.fromEntries(node.covers.map((r) => [r, project.reqs.get(r)])),
      runs: unique(state.checks.filter((c) => ids.includes(c.id)).map((c) => c.last_run)) }, true);
  }
  return { ok: !problems.length, node: id, problems };
}

module.exports = { complete };
