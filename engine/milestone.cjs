'use strict';

const path = require('node:path');
const { hash, problem, unique, markdown, readRecord } = require('./formats.cjs');
const { withLock, append } = require('./ledger.cjs');
const { load } = require('./loading.cjs');
const { status, invariantProblems } = require('./states.cjs');

function reviewPath(root, requested) {
  const relative = path.relative(root, path.resolve(root, requested));
  if (!relative || path.isAbsolute(requested) || relative === '..'
      || relative.startsWith(`..${path.sep}`)) {
    throw new Error('--review must be a relative path inside the project root.');
  }
  return relative.split(path.sep).join('/');
}

function reviewVerdict(bytes, requireReviewer = false) {
  const text = bytes?.toString('utf8').replace(/^\uFEFF/u, '');
  if (!text || (requireReviewer && !text.startsWith('Reviewer: '))) return null;
  const verdicts = [];
  markdown(text, (line, number, outside) => {
    if (outside && line.startsWith('Verdict:')) verdicts.push(line.trimEnd());
  });
  return verdicts.length === 1 && /^Verdict: (accept|revise)$/u.test(verdicts[0])
    ? verdicts[0].slice(9) : null;
}

function readReview(root, relative, add) {
  const { bytes } = readRecord(root, relative);
  if (!bytes) {
    add('review-missing', `${relative} is not a regular file`,
      'Write the milestone review as a regular file at this path.');
    return null;
  }
  if (reviewVerdict(bytes) !== 'accept') {
    add('review-not-accepted', `${relative} does not hold exactly one accepting verdict`,
      'Have the reviewer write exactly one Verdict: accept line after accepting the review.');
  }
  return { path: relative, sha256: hash(bytes) };
}

function recordClosure(project, id, opts) {
  const milestone = project.milestones.find((m) => m.id === id);
  if (!milestone) throw new Error(`Unknown milestone ${id}. Use an id from plan.json.`);
  const relative = reviewPath(project.root, opts.review);
  const state = status(project);
  const problems = [];
  const add = (code, message, hint) => problems.push(problem(code, message, hint));
  if (state.gate !== 'pass') add('plan-gate', `Plan gate is ${state.gate}`,
    'Fix plan problems and rerun gate.');
  if (state.dirty) add('dirty-tree', 'Code tree is dirty',
    'Commit or restore code changes before closing the milestone.');
  const closed = new Set(project.closures.map((c) => c.milestone));
  if (closed.has(id) || project.milestones.find((m) => !closed.has(m.id))?.id !== id) {
    add('not-current', `${id} is already closed or is not the first open milestone`,
      'Close milestones in plan order, once each.');
  }
  for (const node of state.nodes.filter((n) => n.milestone === id)) {
    if (node.state !== 'done') add('node-not-done', `${node.id} is not done`,
      'Complete the milestone node first.');
  }
  const required = unique(project.milestones.filter((m) => m.id === id || closed.has(m.id))
    .flatMap((m) => m.requirements));
  problems.push(...required.filter((req) => !state.requirements.some((r) =>
    r.id === req && r.state === 'green'))
    .map((req) => problem('requirement-not-green', `${req} is not green`,
      'Run its checks on clean, current code.')));
  if (milestone.journey === undefined) add('no-journey', `${id} names no journey check`,
    'Set journey to the registered end-to-end check for this milestone.');
  const journey = state.checks.find((c) => c.id === milestone.journey);
  if (journey && journey.state !== 'green') {
    add('journey-not-green', `${journey.id} is not green`,
      'Run the journey check on clean, current code.');
  }
  problems.push(...invariantProblems(state));
  const review = readReview(project.root, relative, add);
  if (!problems.length) {
    append(project.root, 'milestones', { v: 1, milestone: id, code: project.code,
      reqs: Object.fromEntries(milestone.requirements.map((r) => [r, project.reqs.get(r)])),
      journey: { check: milestone.journey, run: journey.last_run },
      review, owner: { words: opts.owner, proxy: opts.proxy } }, true);
  }
  return { ok: !problems.length, milestone: id, problems };
}

const close = ({ root }, id, opts) => withLock(root, () => recordClosure(load(root), id, opts));

module.exports = { close, reviewVerdict };
