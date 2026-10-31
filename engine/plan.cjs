'use strict';

const { unique, problem, rulingProblems } = require('./formats.cjs');
const { latest, withLock, append } = require('./ledger.cjs');
const { load } = require('./loading.cjs');

function requirementProblems(project, add) {
  const { reqs, checks, milestones, nodes } = project;
  for (const [entries, field] of [[milestones, 'requirements'], [nodes, 'covers'],
    [checks, 'covers']]) {
    for (const entry of entries) {
      for (const id of entry[field]) {
        if (!reqs.has(id)) add('unknown-requirement', `${entry.id} names unknown requirement ${id}`,
          'Add the requirement to spec.md or correct the reference.');
      }
    }
  }
  for (const id of reqs.keys()) {
    const owners = milestones.filter((m) => m.requirements.includes(id));
    if (!owners.length) add('unplanned-requirement', `${id} has no milestone`,
      'Assign the requirement to a milestone.');
    if (owners.length > 1) add('requirement-in-multiple-milestones',
      `${id} belongs to multiple milestones`, 'Keep the requirement in exactly one milestone.');
  }
  if (!milestones.length) add('empty-plan', 'The plan has no milestones', 'Add a milestone.');
  for (const m of milestones) {
    const ownNodes = nodes.filter((n) => n.milestone === m.id);
    if (!m.requirements.length || !ownNodes.length) add('empty-milestone',
      `${m.id} has no requirements or nodes`, 'Add requirements and nodes or remove the milestone');
    for (const id of unique(m.requirements)) {
      if (!checks.some((c) => c.covers.includes(id))) add('uncovered-requirement',
        `${id} has no check`, 'Register a check covering this requirement in checks.json.');
      if (!ownNodes.some((n) => n.covers.includes(id))) add('requirement-without-node',
        `${id} has no node in ${m.id}`, 'Add a node covering this requirement to its milestone.');
    }
  }
}

function nodeProblems(project, add) {
  const ms = new Map(project.milestones.map((m, i) => [m.id, { ...m, order: i }]));
  const ns = new Map(project.nodes.map((n) => [n.id, n]));
  for (const n of project.nodes) {
    const m = ms.get(n.milestone);
    if (!m) add('unknown-milestone', `${n.id} names unknown milestone ${n.milestone}`,
      'Correct the milestone reference or add the milestone.');
    if (!n.covers.length) add('empty-node', `${n.id} covers no requirement`,
      'Link the node to a requirement or remove it.');
    for (const id of n.covers) {
      if (m && project.reqs.has(id) && !m.requirements.includes(id)) {
        add('node-outside-milestone', `${n.id} covers ${id} outside ${m.id}`,
          'Move the node or correct its requirement links.');
      }
    }
    for (const dep of n.depends) {
      const dependency = ns.get(dep);
      if (!dependency) add('unknown-dependency', `${n.id} depends on unknown node ${dep}`,
        'Add the dependency node or correct the reference.');
      else if (m && ms.has(dependency.milestone) && ms.get(dependency.milestone).order > m.order) {
        add('dependency-on-later-milestone', `${n.id} depends on later milestone node ${dep}`,
          'Move the dependency to this or an earlier milestone.');
      }
    }
  }
  const visited = new Set();
  const active = new Set();
  const visit = (id) => {
    if (active.has(id)) {
      add('dependency-cycle', `Dependency cycle at ${id}`,
        'Remove a dependency edge to break the cycle.');
      return;
    }
    if (visited.has(id) || !ns.has(id)) return;
    visited.add(id);
    active.add(id);
    ns.get(id).depends.forEach(visit);
    active.delete(id);
  };
  project.nodes.forEach((n) => visit(n.id));
}

function planProblems(project) {
  const problems = [];
  const add = (code, message, hint) => problems.push(problem(code, message, hint));
  requirementProblems(project, add);
  nodeProblems(project, add);
  return problems.concat(rulingProblems(project.rulings));
}

function snapshot(project, milestone) {
  return {
    requirements: Object.fromEntries(unique(milestone.requirements).sort()
      .map((id) => [id, project.reqs.get(id)])),
    nodes: project.nodes.filter((n) => n.milestone === milestone.id).map((n) => n.id).sort(),
    checks: Object.fromEntries(project.checks.filter((check) =>
      check.covers.some((id) => milestone.requirements.includes(id))).map((check) =>
      [check.id, { fp: check.fp, covers: unique(check.covers.filter((id) =>
        milestone.requirements.includes(id))).sort() }])),
  };
}

function sameSnapshot(current, previous) {
  if (!previous || previous.type === 'removed') return false;
  return Object.values(snapshotDiff(current, previous)).every((ids) => ids.length === 0);
}

function snapshotDiff(now, before) {
  return {
    added: Object.keys(now.requirements).filter((id) => !(id in before.requirements)).sort(),
    removed: Object.keys(before.requirements).filter((id) => !(id in now.requirements)).sort(),
    modified: Object.keys(now.requirements).filter((id) => id in before.requirements
      && now.requirements[id] !== before.requirements[id]).sort(),
    nodes_added: now.nodes.filter((id) => !before.nodes.includes(id)).sort(),
    nodes_removed: before.nodes.filter((id) => !now.nodes.includes(id)).sort(),
    checks_added: Object.keys(now.checks).filter((id) => !(id in before.checks)).sort(),
    checks_removed: Object.keys(before.checks).filter((id) => !(id in now.checks)).sort(),
    checks_modified: Object.keys(now.checks).filter((id) => id in before.checks
      && (now.checks[id].fp !== before.checks[id].fp
        || JSON.stringify(now.checks[id].covers) !== JSON.stringify(before.checks[id].covers)))
      .sort(),
  };
}

function pendingPlans(project) {
  const pending = [];
  const add = (id, now, before, type) => {
    const record = { v: 1, type, milestone: id, at: new Date().toISOString(), ...now };
    if (before) record.diff = snapshotDiff(now, before);
    pending.push(record);
  };
  for (const m of project.milestones) {
    const now = snapshot(project, m);
    const before = latest(project.plans, 'milestone', m.id);
    if (!sameSnapshot(now, before)) add(m.id, now, before, before ? 'change' : 'baseline');
  }
  for (const id of unique(project.plans.map((p) => p.milestone))) {
    const before = latest(project.plans, 'milestone', id);
    if (before.type !== 'removed' && !project.milestones.some((m) => m.id === id)) {
      add(id, { requirements: {}, nodes: [], checks: {} }, before, 'removed');
    }
  }
  return pending;
}

function gate(project) {
  return withLock(project.root, () => {
    const current = load(project.root);
    const problems = planProblems(current);
    const records = problems.length ? [] : pendingPlans(current);
    for (const record of records) append(current.root, 'plan-log', record, true);
    return { ok: !problems.length, problems,
      recorded: records.map(({ milestone, type }) => ({ milestone, type })) };
  });
}

module.exports = { planProblems, pendingPlans, gate };
