'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { load, status, gate } = require('./project.cjs');
const { context } = require('./context.cjs');
const { runChecks, runShell } = require('./checks.cjs');
const { git, codeState } = require('./git-state.cjs');
const { problem, readRecord, hash } = require('./formats.cjs');
const { reviewVerdict } = require('./milestone.cjs');

const truth = ['.ultra/spec.md', '.ultra/checks.json', '.ultra/plan.json',
  '.ultra/ledger/milestones.jsonl', '.ultra/ledger/approvals.jsonl',
  '.ultra/ledger/plan-log.jsonl'];
const exempt = [...truth, '.ultra/ledger/evidence.jsonl', '.ultra/ledger/nodes.jsonl'];
const quote = (word) => `'${word.replace(/'/gu, "'\\''")}'`;
const issue = (code, subject) => problem(code, `${subject}: ${code}`,
  'Resolve this stop before resuming drive.');
const paths = (root, args) => git(root, args).toString('utf8').split('\0').filter(Boolean);
const within = (file, prefix) => file === prefix || file.startsWith(`${prefix}/`);
const clean = (root, review) => !codeState(root, (file) => file === review
  || ['.ultra/.runtime', '.ultra/ledger'].some((dir) => within(file, dir))).dirty;
function snapshot(root) {
  const head = git(root, ['rev-parse', 'HEAD']).toString('utf8').trim();
  const entries = new Map(paths(root, ['ls-tree', '-r', '-z', head, '--', ...truth])
    .map((entry) => [entry.slice(entry.indexOf('\t') + 1), entry.split(/[ \t]/u)[2]]));
  return { head, truth: truth.map((file) => {
    const { bytes, exists } = readRecord(root, file);
    return [bytes ? hash(bytes) : exists ? 'not-regular' : null,
      entries.has(file) ? hash(git(root, ['cat-file', 'blob', entries.get(file)])) : null];
  }) };
}
const touched = (before, after) => truth.filter((file, i) =>
  after.truth[i][0] !== before.truth[i][0] || !before.truth[i].includes(after.truth[i][1]));
function boundary(root, before, after, node, project) {
  const changedTruth = touched(before, after).map((file) => issue('truth-touched', file));
  if (changedTruth.length) return changedTruth;
  try { git(root, ['merge-base', '--is-ancestor', before.head, after.head]); }
  catch (error) {
    if (error.status !== 1) throw error;
    return [issue('history-rewritten', node.id)];
  }
  if (!clean(root)) return [issue('writer-left-dirty', node.id)];
  const named = new Set(project.checks.flatMap((c) => c.run.split(/\s+/u)
    .map((word) => word.replace(/^["']|["']$/gu, '').replace(/^\.\//u, ''))));
  const scopes = [...node.scope, '.ultra/rulings.md', '.ultra/records/handoffs']
    .map((prefix) => prefix.replace(/\/+$/u, ''));
  return paths(root, ['diff', '--no-renames', '--name-only', '-z', before.head, after.head])
    .filter((file) => !exempt.includes(file)).sort().flatMap((file) => {
      const code = named.has(file) ? 'check-touched'
        : scopes.some((prefix) => within(file, prefix)) ? null : 'out-of-scope';
      return code ? [issue(code, file)] : [];
    });
}
async function verify(project, node, before, after, baseline) {
  const { root } = project;
  const problems = boundary(root, before, after, node, project);
  if (problems.some((p) => !['out-of-scope', 'check-touched'].includes(p.code))) return problems;
  const current = load(root);
  const previous = project.completions.map((r) => JSON.stringify(r));
  const added = current.completions.filter((r) => {
    const index = previous.indexOf(JSON.stringify(r));
    if (index < 0) return true;
    previous.splice(index, 1);
    return false;
  });
  problems.push(...project.nodes.filter((n) => n.id !== node.id
    && added.some((r) => r.node === n.id)).map((n) => issue('out-of-scope', n.id)));
  if (problems.length) return problems;
  const state = status(current);
  if (state.gate !== 'pass') return [issue('plan-gate', node.id), ...state.problems];
  const runs = new Set(project.evidence.map((r) => r.run));
  const checks = current.checks.filter((c) => c.covers.some((id) => node.covers.includes(id))
    || current.evidence.some((r) => r.check === c.id && !runs.has(r.run))
    || state.checks.some((s) => s.id === c.id && ['stale', 'unknown'].includes(s.state)));
  const checked = await runChecks(current, { words: checks.map((c) => c.id), req: null });
  const required = new Set([baseline.milestone, ...project.closures.map((c) => c.milestone)]);
  problems.push(...baseline.requirements.filter((r) => required.has(r.milestone)
    && r.state === 'green' && !checked.after.requirements.some((s) => s.id === r.id
      && s.state === 'green')).map((r) => issue('ratchet-broken', r.id)));
  if (problems.length) return problems;
  if (!checked.after.nodes.some((n) => n.id === node.id && n.state === 'done')) {
    return [issue('node-not-done', node.id)];
  }
  return checked.after.checks.filter((s) => s.state !== 'green' && current.checks.some((c) =>
    c.id === s.id && c.covers.some((id) => node.covers.includes(id))))
    .map((c) => issue('node-not-green', c.id));
}

async function drive(project, opts) {
  if (opts.words.length || !opts.writer?.trim()
      || (opts.reviewer !== undefined && !opts.reviewer.trim())) {
    throw new Error('drive requires --writer <command> and an optional non-empty --reviewer.');
  }
  const root = project.root;
  const result = { run: randomUUID(), stop: null, verdict: null, steps: [], problems: [] };
  (opts.json ? console.error : console.log)(`drive: run ${result.run}`);
  const directory = path.join(root, '.ultra/.runtime/drive', result.run);
  const bin = path.join(directory, 'bin');
  const base = { UBP_ROOT: root, UBP_DRIVE: '1', PATH: `${bin}:${process.env.PATH ?? ''}`,
    UBP: [process.execPath, path.join(__dirname, 'cli.cjs')].map(quote).join(' ') };
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'ubp'), `#!/bin/sh\nexec ${base.UBP} "$@"\n`, { mode: 0o755 });
  const record = (action, subject, attempt, value, problems = [], exit = null) => {
    result.steps.push({ action, subject, attempt, result: value, exit, problems });
    if (!opts.json) console.log(`drive: ${action} ${subject}: ${value}`
      + (['writer', 'reviewer'].includes(action) ? ` (exit ${exit})` : ''));
  };
  const stop = (reason, problems = []) => {
    if (!opts.json) {
      for (const p of problems) console.log(`${p.code}: ${p.message} — ${p.hint}`);
      console.log(`drive: stop ${reason}`);
    }
    return Object.assign(result, { stop: reason, problems });
  };
  const shell = async (command, log, env) => {
    const fd = fs.openSync(path.join(directory, log), 'w');
    let exit;
    try { exit = await runShell(root, { run: command, timeout: opts['timeout-sec'] }, fd,
      { ...base, ...env }, 5000); } finally { fs.closeSync(fd); }
    if (exit.interrupted) throw Object.assign(new Error('Drive interrupted.'),
      { exitCode: exit.interrupted });
    return exit.timedOut ? 'timeout' : exit.signal ? `signal-${exit.signal}` : exit.code;
  };
  const check = async (selector) => {
    const checked = await runChecks(load(root), { words: [], req: null, selector });
    const pass = checked.result.runs.every((r) => r.outcome === 'pass' && !r.dirty);
    record('check', selector, null, pass ? 'pass' : 'fail');
    return checked.after;
  };
  const tried = new Map();
  let writers = 0;
  for (;;) {
    if (!clean(root)) return stop('dirty-tree', [issue('dirty-tree', root)]);
    project = load(root);
    let state = status(project);
    if (state.gate !== 'pass') {
      if (state.gate === 'fail') return stop('plan-gate', state.problems);
      const gated = gate(project);
      record('gate', state.milestone, null, gated.ok ? 'pass' : 'fail', gated.problems);
      if (!gated.ok) return stop('plan-gate', gated.problems);
      continue;
    }
    const node = project.nodes.find((n) => n.id === state.next);
    if (node) {
      if (!node.scope?.length) return stop('scope-missing', [issue('scope-missing', node.id)]);
      const brief = context(project, node.id, 32768);
      if (!brief.ok) {
        record('context', node.id, null, 'brief-over-budget', brief.problems);
        return stop('brief-over-budget', brief.problems);
      }
      if (writers >= opts['max-writers']) return stop('writer-budget',
        [issue('writer-budget', node.id)]);
      if (state.checks.some((c) => ['stale', 'unknown'].includes(c.state))) {
        state = await check('stale');
        project = load(root);
      }
      const file = path.join(root, '.ultra/.runtime/briefs', `${node.id}.md`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, brief.brief);
      const before = snapshot(root);
      const attempt = (tried.get(node.id) ?? 0) + 1;
      tried.set(node.id, attempt);
      writers++;
      const exit = await shell(opts.writer, `${node.id}-${attempt}.log`,
        { UBP_NODE: node.id, UBP_BRIEF: file, UBP_ATTEMPT: String(attempt) });
      const problems = await verify(project, node, before, snapshot(root), state);
      const failure = problems[0]?.code;
      record('writer', node.id, attempt, failure ?? 'done', problems, exit);
      if (failure && failure !== 'node-not-done') return stop(failure, problems);
      if (failure && attempt >= opts.attempts) return stop('attempts-exhausted', problems);
      continue;
    }
    if (state.next === '检查') {
      if ((await check('stale')).next === '检查') return stop('checks-not-green',
        [issue('checks-not-green', state.milestone)]);
      continue;
    }
    if (state.next === '里程碑门') {
      if ((await check('all')).next !== '里程碑门') continue;
      if (opts.reviewer) {
        const relative = `.ultra/records/milestones/${state.milestone}-review.md`;
        const file = path.join(root, relative);
        let failure = readRecord(root, relative).exists ? 'review-exists' : null;
        let exit = null;
        if (!failure) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          const before = snapshot(root);
          exit = await shell(opts.reviewer, 'review.log',
            { UBP_MILESTONE: state.milestone, UBP_REVIEW: file });
          const after = snapshot(root);
          if (before.head !== after.head || touched(before, after).length || !clean(root, relative)
              || status(load(root)).next !== '里程碑门') failure = 'reviewer-changed-tree';
          else {
            result.verdict = reviewVerdict(readRecord(root, relative).bytes, true);
            if (!result.verdict) failure = 'review-invalid';
          }
        }
        const problems = failure ? [issue(failure, relative)] : [];
        record('reviewer', state.milestone, null, failure ?? result.verdict, problems, exit);
        if (failure) return stop(failure, problems);
      }
      return stop('milestone-gate');
    }
    return stop(state.next === '全部完成' ? 'all-done' : 'blocked');
  }
}
module.exports = { drive };
