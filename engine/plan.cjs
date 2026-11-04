'use strict';

const { unique, problem, rulingProblems } = require('./formats.cjs');
const { latest, withLock, append, approvalItem } = require('./ledger.cjs');
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
    if (!n.covers.length && n.kind !== 'cleanup') add('empty-node', `${n.id} covers no requirement`,
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
  for (const m of project.milestones) {
    if (m.journey === undefined) continue;
    const check = project.checks.find((c) => c.id === m.journey);
    if (!check) add('unknown-journey', `${m.id} names unknown journey ${m.journey}`,
      'Register the journey check in checks.json or correct its id.');
    else if (!check.covers.some((id) => m.requirements.includes(id))) {
      add('journey-outside-milestone', `${m.journey} covers no requirement of ${m.id}`,
        'Choose a journey check covering a requirement of this milestone.');
    }
  }
  if (project.cleanup_every !== undefined) {
    for (const m of project.milestones) {
      const nodes = project.nodes.filter((n) => n.milestone === m.id);
      let consecutive = 0;
      const tooMany = nodes.some((n) => {
        consecutive = n.kind === 'cleanup' ? 0 : consecutive + 1;
        return consecutive > project.cleanup_every;
      });
      if (tooMany || nodes.at(-1)?.kind !== 'cleanup') {
        add('cleanup-missing', `${m.id} needs cleanup every ${project.cleanup_every} nodes`,
          'End the milestone with cleanup and insert cleanup nodes at the required cadence.');
      }
    }
  }
  reductionProblems(project, add);
  return problems.concat(rulingProblems(project.rulings));
}

function snapshot(project, milestone) {
  const requirements = unique(milestone.requirements).filter((id) => project.reqs.has(id)).sort();
  return {
    shared: project.shared,
    requirements: Object.fromEntries(requirements.map((id) => [id, project.reqs.get(id)])),
    nodes: project.nodes.filter((n) => n.milestone === milestone.id).map((n) => n.id).sort(),
    checks: Object.fromEntries(project.checks.filter((check) =>
      check.covers.some((id) => requirements.includes(id))).map((check) =>
      [check.id, { fp: check.fp, covers: unique(check.covers.filter((id) =>
        requirements.includes(id))).sort() }])),
  };
}

function sameSnapshot(current, previous) {
  if (!previous || previous.type === 'removed') return false;
  return Object.values(snapshotDiff(current, previous))
    .every((value) => Array.isArray(value) && value.length === 0);
}

const has = (object, id) => Object.hasOwn(object, id);

function snapshotDiff(now, before) {
  return {
    added: Object.keys(now.requirements).filter((id) => !has(before.requirements, id)).sort(),
    removed: Object.keys(before.requirements).filter((id) => !has(now.requirements, id)).sort(),
    modified: Object.keys(now.requirements).filter((id) => has(before.requirements, id)
      && now.requirements[id] !== before.requirements[id]).sort(),
    nodes_added: now.nodes.filter((id) => !before.nodes.includes(id)).sort(),
    nodes_removed: before.nodes.filter((id) => !now.nodes.includes(id)).sort(),
    checks_added: Object.keys(now.checks).filter((id) => !has(before.checks, id)).sort(),
    checks_removed: Object.keys(before.checks).filter((id) => !has(now.checks, id)).sort(),
    checks_modified: Object.keys(now.checks).filter((id) => has(before.checks, id)
      && (now.checks[id].fp !== before.checks[id].fp
        || JSON.stringify(now.checks[id].covers) !== JSON.stringify(before.checks[id].covers)))
      .sort(),
    ...(now.shared !== before.shared ? { shared: true } : {}),
  };
}

function emptySnapshot(project) {
  return { shared: project.shared, requirements: {}, nodes: [], checks: {} };
}

function reductionProblems(project, add) {
  for (const id of unique(project.plans.map((p) => p.milestone))) {
    const before = latest(project.plans, 'milestone', id);
    if (before.type === 'removed') continue;
    const milestone = project.milestones.find((m) => m.id === id);
    const now = milestone ? snapshot(project, milestone) : emptySnapshot(project);
    const removed = Object.keys(before.requirements)
      .filter((req) => !Object.hasOwn(now.requirements, req)).sort();
    const checks = Object.keys(before.checks).filter((check) =>
      !Object.hasOwn(now.checks, check) || before.checks[check].covers.some((req) =>
        Object.hasOwn(now.requirements, req) && !now.checks[check].covers.includes(req))).sort();
    // An approval answers the plan as it stood: one given before a later plan change or a
    // closure of the milestone no longer counts.
    const closed = latest(project.closures, 'milestone', id);
    const floor = closed && closed.at > before.at ? closed.at : before.at;
    for (const item of unique([...removed, ...checks]).map((entry) => `${id}/${entry}`)) {
      if (!project.approvals.some((a) => a.at > floor && a.items.includes(item))) {
        add('reduction-unapproved', `Reduction ${item} needs the Owner's approval`,
          `Record approval with ubp approve ${item} --owner "<words>".`);
      }
    }
  }
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
      add(id, emptySnapshot(project), before, 'removed');
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

function approve(project, items, opts) {
  return withLock(project.root, () => {
    const current = load(project.root);
    const sorted = unique(items).sort();
    for (const item of sorted) {
      const [milestone, id] = item.split('/');
      const before = latest(current.plans, 'milestone', milestone);
      if (!approvalItem(item) || !before || before.type === 'removed'
          || !(Object.hasOwn(before.requirements, id) || Object.hasOwn(before.checks, id))) {
        throw new Error(`Invalid approval item ${item}. Use <milestone>/<requirement or check>`
          + ' from the milestone\'s latest plan-log snapshot.');
      }
    }
    append(current.root, 'approvals', { v: 1, items: sorted,
      owner: { words: opts.owner, proxy: opts.proxy } }, true);
    return { ok: true, items: sorted };
  });
}

module.exports = { planProblems, pendingPlans, gate, approve };
