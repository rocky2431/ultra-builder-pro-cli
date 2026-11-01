'use strict';

const { hash, read, requirements, registry } = require('./formats.cjs');
const { codeState, projectRoot } = require('./git-state.cjs');
const { ledger } = require('./ledger.cjs');

function load(requested) {
  const root = projectRoot(requested);
  const code = codeState(root);
  const { reqs, requirementText, shared } = requirements(read(root, 'spec.md'));
  const validated = registry(root, 'checks.json', { checks: { covers: 'array', run: 'string' } });
  const checks = validated.checks.map((check) => {
    const timeout = check.timeout_sec === undefined ? 600 : check.timeout_sec;
    return { ...check, timeout, fp: hash(JSON.stringify([check.run, timeout, check.expect])) };
  });
  const { milestones, nodes } = registry(root, 'plan.json', {
    milestones: { title: 'string', requirements: 'array' },
    nodes: { milestone: 'string', title: 'string', covers: 'array', depends: 'array' },
  });
  const history = ['evidence', 'plan-log', 'nodes', 'milestones', 'approvals']
    .map((name) => ledger(root, name));
  return { root, ...code, reqs, requirementText, shared, checks, milestones, nodes,
    rulings: read(root, 'rulings.md', true), warnings: history.flatMap((h) => h.warnings),
    evidence: history[0].records, plans: history[1].records,
    completions: history[2].records, closures: history[3].records, approvals: history[4].records };
}

module.exports = { load };
