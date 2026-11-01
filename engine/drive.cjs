'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { load, status, gate } = require('./project.cjs');
const { context } = require('./context.cjs');
const { runChecks, runShell } = require('./checks.cjs');
const { git, codeState } = require('./git-state.cjs');
const { problem, readRecord, markdown } = require('./formats.cjs');

const truth = ['.ultra/spec.md', '.ultra/checks.json', '.ultra/plan.json',
  '.ultra/ledger/milestones.jsonl', '.ultra/ledger/approvals.jsonl'];
const quote = (word) => `'${word.replace(/'/gu, "'\\''")}'`;
const issue = (code, subject) => problem(code, `${subject}: ${code}`,
  'Resolve this stop before resuming drive.');
const head = (root) => git(root, ['rev-parse', 'HEAD']).toString('utf8').trim();

function truthBlobs(root, revision) {
  return new Map(git(root, ['ls-tree', '-r', '-z', revision, '--', ...truth])
    .toString('utf8').split('\0').filter(Boolean).map((entry) => {
      const tab = entry.indexOf('\t');
      return [entry.slice(tab + 1), entry.slice(0, tab).split(' ')[2]];
    }));
}

function writerBoundary(root, before, node) {
  if (codeState(root).dirty) return [issue('writer-left-dirty', node.id)];
  const after = head(root);
  const old = truthBlobs(root, before);
  const current = truthBlobs(root, after);
  const touched = truth.filter((file) => old.get(file) !== current.get(file));
  if (touched.length) return touched.map((file) => issue('truth-touched', file));
  const changed = git(root, ['diff', '--no-renames', '--name-only', '-z', before, after, '--'])
    .toString('utf8').split('\0').filter(Boolean).sort();
  return changed.filter((file) => !truth.includes(file) && file !== '.ultra/rulings.md'
    && !['.ultra/records/', '.ultra/ledger/', ...(node.scope ?? [])]
      .some((prefix) => file.startsWith(prefix))).map((file) => issue('out-of-scope', file));
}

function reviewVerdict(root, relative) {
  const { bytes } = readRecord(root, relative);
  if (!bytes) return null;
  const text = bytes.toString('utf8').replace(/^\uFEFF/u, '');
  if (!/^Reviewer: [^\r\n]+\r?\n/u.test(text)) return null;
  const verdicts = [];
  markdown(text, (line, number, outside) => {
    if (outside && line.startsWith('Verdict:')) verdicts.push(line.trimEnd());
  });
  return verdicts.length === 1 && /^Verdict: (accept|revise)$/u.test(verdicts[0])
    ? verdicts[0].slice(9) : null;
}

async function drive(project, opts) {
  if (opts.words.length || !opts.writer?.trim()
      || (opts.reviewer !== undefined && !opts.reviewer.trim())) {
    throw new Error('drive requires --writer <command> and an optional non-empty --reviewer.');
  }
  const positive = (key, fallback) => {
    const value = opts[key] ?? String(fallback);
    if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
      throw new Error(`--${key} requires a positive integer.`);
    }
    return Number(value);
  };
  const attempts = positive('attempts', 3);
  const timeout = positive('timeout-sec', 3600);
  const root = project.root;
  const result = { run: randomUUID(), stop: null, verdict: null, steps: [], problems: [] };
  const base = { UBP_ROOT: root,
    UBP: [process.execPath, path.join(__dirname, 'cli.cjs')].map(quote).join(' ') };
  const record = (action, subject, attempt, value, problems = []) => {
    result.steps.push({ action, subject, attempt, result: value, problems });
    return problems;
  };
  const stop = (reason, problems = []) => {
    if (problems.length && result.steps.at(-1)?.problems !== problems) {
      record('status', project.root, null, reason, problems);
    }
    return Object.assign(result, { stop: reason, problems });
  };
  const shell = async (command, log, env) => {
    const file = path.join(root, '.ultra/.runtime/drive', result.run, log);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(file, 'w');
    let exit;
    try { exit = await runShell(root, { run: command, timeout }, fd, { ...base, ...env }); }
    finally { fs.closeSync(fd); }
    if (exit.interrupted) throw Object.assign(new Error('Drive interrupted.'),
      { exitCode: exit.interrupted });
  };
  const check = async (all = false) => {
    const checked = await runChecks(load(root),
      { words: [], req: null, selector: all ? 'all' : 'stale' });
    record('check', all ? 'all' : 'stale', null, checked.ok ? 'pass' : 'fail');
    return checked.after;
  };
  const tried = new Map();
  for (;;) {
    project = load(root);
    const state = status(project);
    if (state.dirty) return stop('dirty-tree', [issue('dirty-tree', root)]);
    if (state.gate !== 'pass') {
      if (state.gate === 'fail') return stop('plan-gate', state.problems);
      const gated = gate(project);
      record('gate', state.milestone, null, gated.ok ? 'pass' : 'fail', gated.problems);
      if (!gated.ok) return stop('plan-gate', gated.problems);
      continue;
    }
    const node = project.nodes.find((n) => n.id === state.next);
    if (node) {
      const attempt = (tried.get(node.id) ?? 0) + 1;
      tried.set(node.id, attempt);
      const brief = context(project, node.id, 32768);
      if (!brief.ok) {
        record('context', node.id, attempt, 'brief-over-budget', brief.problems);
        return stop('brief-over-budget', brief.problems);
      }
      const file = path.join(root, '.ultra/.runtime/briefs', `${node.id}.md`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, brief.brief);
      const before = head(root);
      await shell(opts.writer, `${node.id}-${attempt}.log`,
        { UBP_NODE: node.id, UBP_BRIEF: file, UBP_ATTEMPT: String(attempt) });
      let problems = writerBoundary(root, before, node);
      if (!problems.length) {
        const gated = gate(load(root));
        if (!gated.ok) problems = [issue('plan-gate', node.id), ...gated.problems];
      }
      if (!problems.length) {
        const after = await check();
        const relevant = new Set([state.milestone, ...project.closures.map((c) => c.milestone)]);
        problems = state.requirements.filter((r) => relevant.has(r.milestone)
          && r.state === 'green' && !after.requirements.some((a) => a.id === r.id
            && a.state === 'green')).map((r) => issue('ratchet-broken', r.id));
        if (!problems.length && !after.nodes.some((n) => n.id === node.id && n.state === 'done')) {
          problems = [issue('node-not-done', node.id)];
        }
      }
      const failure = problems[0]?.code;
      record('writer', node.id, attempt, failure ?? 'done', problems);
      if (failure && failure !== 'node-not-done') return stop(failure, problems);
      if (failure && attempt >= attempts) return stop('attempts-exhausted', problems);
      continue;
    }
    if (state.next === '检查') {
      if ((await check()).next === '检查') {
        return stop('checks-not-green', [issue('checks-not-green', state.milestone)]);
      }
      continue;
    }
    if (state.next === '里程碑门') {
      if ((await check(true)).next !== '里程碑门') continue;
      if (opts.reviewer) {
        const relative = `.ultra/records/milestones/${state.milestone}-review.md`;
        const file = path.join(root, relative);
        let failure = readRecord(root, relative).exists ? 'review-exists' : null;
        if (!failure) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          await shell(opts.reviewer, 'review.log',
            { UBP_MILESTONE: state.milestone, UBP_REVIEW: file });
          result.verdict = reviewVerdict(root, relative);
          if (!result.verdict) failure = 'review-invalid';
        }
        const problems = failure ? [issue(failure, relative)] : [];
        record('reviewer', state.milestone, null, failure ?? result.verdict, problems);
        if (failure) return stop(failure, problems);
      }
      return stop('milestone-gate');
    }
    return stop(state.next === '全部完成' ? 'all-done' : 'blocked');
  }
}

module.exports = { drive };
