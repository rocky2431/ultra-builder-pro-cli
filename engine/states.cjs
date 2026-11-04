'use strict';

const { unique, problem } = require('./formats.cjs');
const { latest, lockPid } = require('./ledger.cjs');
const { planProblems, pendingPlans } = require('./plan.cjs');

function checkState(project, check, record, ids = check.covers) {
  if (!record) return { state: 'unknown', reasons: ['not-run'] };
  if (record.dirty) return { state: 'unknown', reasons: ['dirty-run'] };
  const reasons = [];
  if (check.fp !== record.check_fp) reasons.push('check-changed');
  if (project.code !== record.code) reasons.push('code-changed');
  if (project.shared !== record.shared) reasons.push('shared-changed');
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

function dependencies(project, node) {
  const earlier = node.kind === 'cleanup' ? project.nodes.slice(0, project.nodes.indexOf(node))
    .filter((n) => n.milestone === node.milestone).map((n) => n.id) : [];
  return unique([...node.depends, ...earlier]);
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
    if (record && project.shared !== record.shared) reasons.unshift('shared-changed');
    let state = 'blocked';
    if (record) state = reasons.length ? 'stale' : 'done';
    const result = { id, milestone: n.milestone, state, reasons };
    states.set(id, result);
    if (!record && dependencies(project, n).every((dep) => nodeState(dep).state === 'done')) {
      result.state = 'ready';
    }
    return result;
  };
  return project.nodes.map((n) => nodeState(n.id));
}

function milestoneProgress(project, requirements, nodes, invariants) {
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
    && dependencies(project, project.nodes.find((p) => p.id === n.id))
      .every((dep) => nodes.some((d) => d.id === dep && d.state === 'done'))));
  const ownNodes = nodes.filter((n) => n.milestone === current?.id);
  let next = '无（受阻）';
  if (actionable) next = actionable.id;
  else if (requirements.some((r) => reqIds.has(r.id) && r.state !== 'green')
      || invariants.some((i) => i.state !== 'green')) next = '检查';
  else if (current && project.milestones.every((m) => closed.has(m.id))) next = '全部完成';
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

function progressLine(progress, gate, dirty, invariants, drive) {
  const { milestone, counts, next, plan_changes, closed_not_green } = progress;
  let line = `${milestone ?? '无'} · ${counts.green}/${counts.total} 绿`;
  for (const [key, label] of [['red', '红'], ['stale', '过期'], ['unknown', '未知'],
    ['uncovered', '未覆盖']]) {
    if (counts[key]) line += ` · ${counts[key]} ${label}`;
  }
  line += ` · 下一项 ${next} · 本里程碑计划变更 ${plan_changes} 次`;
  const notGreen = invariants.filter((i) => i.state !== 'green').length;
  if (notGreen) line += ` · 不变量 ${notGreen} 未绿`;
  if (closed_not_green) line += ` · 已关闭里程碑 ${closed_not_green} 项未绿`;
  if (dirty) line += ' · 工作区未提交';
  if (gate !== 'pass') {
    line += gate === 'fail' ? ' · 计划门未通过' : ' · 计划门待重跑';
  }
  return line + (drive ? ' · drive 运行中' : '');
}

function status(project) {
  const drive = lockPid(project.root, 'drive');
  const { evidence, checks } = checkStates(project);
  const invariants = project.checks.filter((c) => Object.hasOwn(c, 'fix')).map((c) => {
    const { id, state, reasons } = checks.find((s) => s.id === c.id);
    return { id, state, reasons, fix: c.fix };
  });
  const requirements = requirementStates(project, evidence);
  const nodes = nodeStates(project);
  const progress = milestoneProgress(project, requirements, nodes, invariants);
  const problems = planProblems(project);
  let gate = 'pass';
  if (problems.length) gate = 'fail';
  else if (pendingPlans(project).length) gate = 'stale';
  return { ...progress, line: progressLine(progress, gate, project.dirty, invariants, drive),
    drive, gate, problems, warnings: project.warnings, dirty: project.dirty,
    requirements, checks, nodes, invariants };
}

function invariantProblems(state) {
  return state.invariants.filter((i) => i.state !== 'green')
    .map((i) => problem('invariant-not-green', `${i.id} is not green`,
      i.state === 'red' ? i.fix : `Run \`ubp check ${i.id}\`.`));
}

function retro(project) {
  const since = project.closures.reduce((at, r) => !at || r.at > at ? r.at : at, null);
  const classes = new Map();
  const green = new Set();
  const records = project.evidence.filter((r) => {
    if (r.dirty) return false;
    if (r.outcome === 'pass') { green.add(r.check); return false; }
    return (!since || r.at > since) && (green.has(r.check)
      || ['timeout', 'expect-timeout', 'not-runnable', 'spawn-error'].includes(r.reason));
  }).sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
  for (const r of records) {
    const key = (r.error_line || r.reason).replace(/[0-9]+/gu, '#').replace(/\s+/gu, ' ').trim();
    if (!classes.has(key)) classes.set(key, { class: key, count: 0, checks: [], runs: [] });
    const entry = classes.get(key);
    entry.count++;
    entry.checks.push(r.check);
    entry.runs.push(r.run);
  }
  const entries = [...classes.values()];
  for (const entry of entries) entry.checks = unique(entry.checks).sort();
  entries.sort((a, b) => b.count - a.count || (a.class < b.class ? -1 : a.class > b.class ? 1 : 0));
  return { since, classes: entries };
}

module.exports = { status, invariantProblems, retro, dependencies };
