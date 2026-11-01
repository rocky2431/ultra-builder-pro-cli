#!/usr/bin/env node
'use strict';

const { load, status, gate, complete } = require('./project.cjs');
const { execute } = require('./checks.cjs');
const { close } = require('./milestone.cjs');
const { context } = require('./context.cjs');
const { approve } = require('./plan.cjs');

function options(args, command) {
  const local = { check: ['--all', '--stale', '--req'],
    milestone: ['--owner', '--review', '--proxy'], approve: ['--owner', '--proxy'],
    context: ['--budget'] };
  const allowed = new Set(['--root', '--json', ...(local[command] || [])]);
  const result = { root: process.cwd(), json: false, words: [], selector: null, req: null,
    owner: null, review: null, proxy: false, budget: 32768 };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-') && !allowed.has(arg)) {
      throw new Error(`Option ${arg} is not valid for ${command}.`);
    }
    if (['--root', '--req', '--owner', '--review', '--budget'].includes(arg)) {
      if (['--owner', '--review', '--budget'].includes(arg) && seen.has(arg)) {
        throw new Error(`${arg} may only be given once.`);
      }
      seen.add(arg);
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      if (arg === '--req') {
        if (result.selector) throw new Error('Choose only one check selector.');
        result.selector = 'req';
        result.req = value;
      } else if (arg === '--budget') {
        if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
          throw new Error('--budget requires a positive integer byte count.');
        }
        result.budget = Number(value);
      } else {
        result[arg.slice(2)] = value;
      }
    } else if (arg === '--json') result.json = true;
    else if (arg === '--proxy') result.proxy = true;
    else if (arg === '--all' || arg === '--stale') {
      if (result.selector) throw new Error('Choose only one check selector.');
      result.selector = arg.slice(2);
    } else result.words.push(arg);
  }
  return result;
}

function selectedChecks(project, opts) {
  const { words } = opts;
  if (words.length && opts.selector) throw new Error('Choose check ids or a check selector.');
  for (const id of words) {
    if (!project.checks.some((c) => c.id === id)) {
      throw new Error(`Unknown check ${id}. Use an id from checks.json.`);
    }
  }
  if (opts.req !== null && !project.reqs.has(opts.req)) {
    throw new Error(`Unknown requirement ${opts.req}. Use an id from spec.md.`);
  }
  const scope = project.checks.filter((check) => {
    if (words.length) return words.includes(check.id);
    if (opts.selector === 'req') return check.covers.includes(opts.req);
    return true;
  });
  let selected = scope;
  if (!words.length && (!opts.selector || opts.selector === 'stale')) {
    const states = new Map(status(project).checks.map((c) => [c.id, c.state]));
    selected = scope.filter((c) => ['stale', 'unknown'].includes(states.get(c.id)));
  }
  return { scope, selected };
}

async function runChecks(project, opts) {
  const runs = [];
  const { scope, selected } = selectedChecks(project, opts);
  for (const check of selected) {
    const { check: id, run, outcome, reason, dirty } = await execute(project, check);
    runs.push({ check: id, run, outcome, reason, dirty });
  }
  const after = status(load(project.root));
  const ok = after.checks.filter((c) => scope.some((check) => check.id === c.id))
    .every((c) => c.state === 'green');
  return { result: { dirty: after.dirty, runs }, ok, after };
}

function printResult(command, opts, result, project, after) {
  if (opts.json) { console.log(JSON.stringify(result)); return; }
  for (const warning of project.warnings) console.error(warning);
  if (command === 'status') console.log(result.line);
  else if (command === 'approve') console.log(`approved: ${result.items.join(', ')}`);
  else if (command === 'context') {
    if (result.ok) process.stdout.write(result.brief);
    else for (const p of result.problems) console.error(`${p.code}: ${p.message} — ${p.hint}`);
  }
  else if (command === 'check') {
    for (const r of result.runs) {
      const reason = r.reason + (r.dirty ? ', dirty: not counted' : '');
      console.log(`${r.check}: ${r.outcome} (${reason})`);
    }
    console.log(after.line);
  } else {
    let name = 'gate';
    if (command === 'node') name = `node ${result.node}`;
    if (command === 'milestone') name = `milestone ${result.milestone}`;
    console.log(`${name}: ${result.ok ? 'pass' : 'fail'}`);
    for (const p of result.problems) console.log(`${p.code}: ${p.message} — ${p.hint}`);
  }
}

async function handle(args) {
  try {
    const [command, ...rest] = args;
    if (!['status', 'gate', 'check', 'node', 'milestone', 'context', 'approve'].includes(command)) {
      throw new Error(`Unknown command ${command ?? ''}. `
        + 'Use status, gate, check, node done, milestone close, context or approve.');
    }
    const opts = options(rest, command);
    const { words } = opts;
    if ((['status', 'gate'].includes(command) && words.length)
        || (command === 'node' && (words.length !== 2 || words[0] !== 'done'))
        || (command === 'milestone' && (words.length !== 2 || words[0] !== 'close'))
        || (command === 'context' && words.length !== 1)
        || (command === 'approve' && !words.length)) {
      const usage = { node: 'node done <id>',
        milestone: 'milestone close <id> --owner <words> --review <path>',
        context: 'context <id>', approve: 'approve <milestone>/<id>… --owner <words>'
      }[command] || command;
      throw new Error(`Usage: ${usage} [--root <dir>] [--json]`);
    }
    if (command === 'milestone' && (!opts.owner?.trim() || !opts.review)) {
      throw new Error('milestone close requires --owner <non-empty words> and --review <path>.');
    }
    if (command === 'approve' && !opts.owner?.trim()) {
      throw new Error('approve requires --owner <non-empty words>.');
    }
    const project = load(opts.root);
    let result;
    let checkPassed;
    let after;
    if (command === 'status') result = status(project);
    if (command === 'gate') result = gate(project);
    if (command === 'node') result = complete(project, words[1]);
    if (command === 'milestone') result = close(project, words[1], opts);
    if (command === 'context') result = context(project, words[0], opts.budget);
    if (command === 'approve') result = approve(project, words, opts);
    if (command === 'check') {
      const checked = await runChecks(project, opts);
      result = checked.result;
      checkPassed = checked.ok;
      after = checked.after;
    }
    printResult(command, opts, result, project, after);
    if (command === 'status') return 0;
    if (command === 'check') {
      return checkPassed ? 0 : 1;
    }
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    return error.exitCode ?? 2;
  }
}

if (require.main === module) {
  handle(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}

module.exports = { handle };
