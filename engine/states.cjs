'use strict';

const { unique } = require('./formats.cjs');
const { latest } = require('./ledger.cjs');
const { planProblems, pendingPlans } = require('./plan.cjs');

function checkState(project, check, record, ids = check.covers) {
  if (!record) return { state: 'unknown', reasons: ['not-run'] };
  if (record.dirty) return { state: 'unknown', reasons: ['dirty-run'] };
  const reasons = [];
  if (check.fp !== record.check_fp) reasons.push('check-changed');
  if (project.code !== record.code) reasons.push('code-changed');
  for (const id of unique(ids)) {
    if (!project.reqs.has(id) || project.reqs.get(id) !== record.reqs[id]) {
      reasons.push(`req-changed:${id}`);
    }
  }
  if (reasons.length) return { state: 'stale', reasons };
  return { state: { pass: 'green', fail: 'red', unknown: 'unknown' }[record.outcome],
    reasons: record.outcome === 'pass' ? [] : [record.reason] };
}

function checkStates(project) {
  const evidence = new Map();
  for (const r of project.evidence) {
    const previous = evidence.get(r.check);
    if (!previous || r.at >= previous.at) evidence.set(r.check, r);
  }
  const checks = project.checks.map((c) => ({ id: c.id,
    ...checkState(project, c, evidence.get(c.id)), last_run: evidence.get(c.id)?.run ?? null }));
  return { evidence, checks };
}

function requirementStates(project, evidence) {
  return [...project.reqs.keys()].map((id) => {
    const pairs = project.checks.filter((c) => c.covers.includes(id))
      .map((c) => ({ id: c.id, ...checkState(project, c, evidence.get(c.id), [id]) }));
    const state = !pairs.length ? 'uncovered'
      : ['red', 'unknown', 'stale', 'green'].find((s) => pairs.some((p) => p.state === s));
    return { id, milestone: project.milestones.find((m) => m.requirements.includes(id))?.id ?? null,
      state, reasons: unique(pairs.flatMap((p) => p.reasons)), checks: pairs };
  });
}

function nodeStates(project) {
  const ns = new Map(project.nodes.map((n) => [n.id, n]));
  const states = new Map();
  // Memoized recursion follows dependencies. The gate rejects cycles, so a valid
  // graph terminates. Cache a blocked state before descending so status also
  // terminates on a cycle before the gate has passed.
  const nodeState = (id) => {
    if (states.has(id)) return states.get(id);
    const n = ns.get(id);
    if (!n) return { state: 'blocked', reasons: [] };
    const record = latest(project.completions, 'node', id);
    const reasons = record ? unique(n.covers).filter((r) => !project.reqs.has(r)
      || project.reqs.get(r) !== record.reqs[r]).map((r) => `req-changed:${r}`) : [];
    let state = 'blocked';
    if (record) state = reasons.length ? 'stale' : 'done';
    const result = { id, milestone: n.milestone, state, reasons };
    states.set(id, result);
    if (!record && n.depends.every((dep) => nodeState(dep).state === 'done')) {
      result.state = 'ready';
    }
    return result;
  };
  return project.nodes.map((n) => nodeState(n.id));
}

function milestoneProgress(project, requirements, nodes) {
  const closed = new Set(project.closures.map((c) => c.milestone));
  const current = project.milestones.find((m) => !closed.has(m.id)) || project.milestones.at(-1);
  const currentReqs = requirements.filter((r) => current?.requirements.includes(r.id));
  const counts = { total: currentReqs.length,
    green: 0, red: 0, stale: 0, unknown: 0, uncovered: 0 };
  currentReqs.forEach((r) => counts[r.state]++);
  const relevant = project.milestones.filter((m) => closed.has(m.id) || m.id === current?.id);
  const reqIds = new Set(relevant.flatMap((m) => m.requirements));
  const relevantNodes = nodes.filter((n) => relevant.some((m) => m.id === n.milestone));
  const actionable = relevantNodes.find((n) => n.state === 'ready' || (n.state === 'stale'
    && project.nodes.find((p) => p.id === n.id).depends
      .every((dep) => nodes.some((d) => d.id === dep && d.state === 'done'))));
  const ownNodes = nodes.filter((n) => n.milestone === current?.id);
  let next = '无（受阻）';
  if (actionable) next = actionable.id;
  else if (requirements.some((r) => reqIds.has(r.id) && r.state !== 'green')) next = '检查';
  else if (current && ownNodes.every((n) => n.state === 'done')) next = '里程碑门';
  const closedIds = new Set(project.milestones.filter((m) => closed.has(m.id)
    && m.id !== current?.id).flatMap((m) => m.requirements));
  const closed_not_green = requirements.filter((r) => closedIds.has(r.id)
    && r.state !== 'green').length;
  const lastClosure = project.closures.reduce((at, record) => record.at > at ? record.at : at, '');
  const plan_changes = project.plans.filter((p) => ['change', 'removed'].includes(p.type)
    && p.at > lastClosure).length;
  return { milestone: current?.id ?? null, counts, next, closed_not_green, plan_changes };
}

function progressLine(progress, gate, dirty) {
  const { milestone, counts, next, plan_changes, closed_not_green } = progress;
  let line = `${milestone ?? '无'} · ${counts.green}/${counts.total} 绿`;
  for (const [key, label] of [['red', '红'], ['stale', '过期'], ['unknown', '未知'],
    ['uncovered', '未覆盖']]) {
    if (counts[key]) line += ` · ${counts[key]} ${label}`;
  }
  line += ` · 下一项 ${next} · 本里程碑计划变更 ${plan_changes} 次`;
  if (closed_not_green) line += ` · 已关闭里程碑 ${closed_not_green} 项未绿`;
  if (dirty) line += ' · 工作区未提交';
  if (gate !== 'pass') line += gate === 'fail' ? ' · 计划门未通过' : ' · 计划门待重跑';
  return line;
}

function status(project) {
  const { evidence, checks } = checkStates(project);
  const requirements = requirementStates(project, evidence);
  const nodes = nodeStates(project);
  const progress = milestoneProgress(project, requirements, nodes);
  const problems = planProblems(project);
  let gate = 'pass';
  if (problems.length) gate = 'fail';
  else if (pendingPlans(project).length) gate = 'stale';
  return { ...progress, line: progressLine(progress, gate, project.dirty), gate, problems,
    warnings: project.warnings, dirty: project.dirty, requirements, checks, nodes };
}

module.exports = { status };
