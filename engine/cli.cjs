#!/usr/bin/env node
'use strict';

const { load, status, gate, complete } = require('./project.cjs');
const { execute } = require('./checks.cjs');

function options(args) {
  const result = { root: process.cwd(), json: false, words: [], selector: null, req: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--root' || arg === '--req') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      if (arg === '--root') result.root = value;
      else {
        if (result.selector) throw new Error('Choose only one check selector.');
        result.selector = 'req';
        result.req = value;
      }
    } else if (arg === '--json') result.json = true;
    else if (arg === '--all' || arg === '--stale') {
      if (result.selector) throw new Error('Choose only one check selector.');
      result.selector = arg.slice(2);
    } else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}.`);
    else result.words.push(arg);
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
  return { result: { dirty: after.dirty, runs }, ok };
}

function printResult(command, opts, result, project) {
  if (opts.json) { console.log(JSON.stringify(result)); return; }
  for (const warning of project.warnings) console.error(warning);
  if (command === 'status') console.log(result.line);
  else if (command === 'check') {
    for (const r of result.runs) {
      const reason = r.reason + (r.dirty ? ', dirty: not counted' : '');
      console.log(`${r.check}: ${r.outcome} (${reason})`);
    }
    console.log(status(load(project.root)).line);
  } else {
    const name = command === 'node' ? `node ${result.node}` : 'gate';
    console.log(`${name}: ${result.ok ? 'pass' : 'fail'}`);
    for (const p of result.problems) console.log(`${p.code}: ${p.message} — ${p.hint}`);
  }
}

async function handle(args) {
  try {
    const [command, ...rest] = args;
    if (!['status', 'gate', 'check', 'node'].includes(command)) {
      throw new Error(`Unknown command ${command ?? ''}. Use status, gate, check or node done.`);
    }
    const opts = options(rest);
    const { words } = opts;
    if (command !== 'check' && opts.selector) {
      throw new Error('Check selectors are only valid for check.');
    }
    if ((['status', 'gate'].includes(command) && words.length)
        || (command === 'node' && (words.length !== 2 || words[0] !== 'done'))) {
      const usage = command === 'node' ? 'node done <id>' : command;
      throw new Error(`Usage: ${usage} [--root <dir>] [--json]`);
    }
    const project = load(opts.root);
    let result;
    let checkPassed;
    if (command === 'status') result = status(project);
    if (command === 'gate') result = gate(project);
    if (command === 'node') result = complete(project, words[1]);
    if (command === 'check') {
      const checked = await runChecks(project, opts);
      result = checked.result;
      checkPassed = checked.ok;
    }
    printResult(command, opts, result, project);
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
