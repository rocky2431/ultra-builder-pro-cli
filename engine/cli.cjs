#!/usr/bin/env node
'use strict';

const { load, status, gate, complete } = require('./project.cjs');
const { runChecks } = require('./checks.cjs');
const { drive } = require('./drive.cjs');
const { close } = require('./milestone.cjs');
const { context } = require('./context.cjs');
const { approve } = require('./plan.cjs');
const { retro } = require('./states.cjs');
const { merge } = require('./merge.cjs');

function options(args, command) {
  const local = { check: ['--all', '--stale', '--req'],
    milestone: ['--owner', '--review', '--proxy'], approve: ['--owner', '--proxy'],
    context: ['--budget'], merge: ['--expect-head'],
    drive: ['--writer', '--reviewer', '--attempts', '--timeout-sec'] };
  const allowed = new Set(['--root', '--json', ...(local[command] || [])]);
  const result = { root: process.cwd(), json: false, words: [], selector: null, req: null,
    owner: null, review: null, proxy: false, budget: 32768 };
  const values = ['--root', '--req', '--owner', '--review', '--budget', '--expect-head',
    ...local.drive];
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-') && !allowed.has(arg)) {
      throw new Error(`Option ${arg} is not valid for ${command}.`);
    }
    if (values.includes(arg)) {
      if (!['--root', '--req'].includes(arg) && seen.has(arg)) {
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

function printResult(command, opts, result, project, after) {
  if (opts.json) { console.log(JSON.stringify(result)); return; }
  for (const warning of project.warnings) console.error(warning);
  if (command === 'status') console.log(result.line);
  else if (command === 'drive') {
    for (const s of result.steps) {
      console.log(`drive: ${s.action} ${s.subject}: ${s.result}`);
    }
    console.log(`drive: stop ${result.stop}`);
  }
  else if (command === 'approve') console.log(`approved: ${result.items.join(', ')}`);
  else if (command === 'retro') {
    for (const c of result.classes) {
      console.log(`${c.count} × ${c.class} · ${c.checks.join(', ')}`);
    }
    console.log(`重复两次及以上：${result.classes.filter((c) => c.count >= 2).length} 类`);
  } else if (command === 'merge') {
    const verdict = result.ok ? `pass ${result.merged.slice(0, 7)}` : 'refused';
    console.log(`merge ${opts.words[0]}: ${verdict}`);
    for (const p of result.problems) console.log(`${p.code}: ${p.message} — ${p.hint}`);
    for (const warning of result.warnings) console.error(`warning: ${warning}`);
  }
  else if (command === 'context') {
    if (result.ok) process.stdout.write(result.brief);
    else for (const p of result.problems) console.error(`${p.code}: ${p.message} — ${p.hint}`);
  }
  else if (command === 'check') {
    for (const r of result.runs) {
      const reason = r.reason + (r.dirty ? ', dirty: not counted' : '');
      console.log(`${r.check}: ${r.outcome} (${reason})`);
      const check = project.checks.find((c) => c.id === r.check);
      if (check.fix !== undefined && r.outcome !== 'pass') console.log(`  fix: ${check.fix}`);
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
    const commands = ['status', 'gate', 'check', 'node', 'milestone', 'context', 'approve',
      'retro', 'merge', 'drive'];
    if (!commands.includes(command)) {
      throw new Error(`Unknown command ${command ?? ''}. `
        + `Use ${commands.join(', ')}.`);
    }
    const opts = options(rest, command);
    const { words } = opts;
    if ((['status', 'gate', 'retro'].includes(command) && words.length)
        || (command === 'node' && (words.length !== 2 || words[0] !== 'done'))
        || (command === 'milestone' && (words.length !== 2 || words[0] !== 'close'))
        || (command === 'context' && words.length !== 1)
        || (command === 'merge' && (words.length !== 1 || !opts['expect-head']))
        || (command === 'approve' && !words.length)) {
      const usage = { node: 'node done <id>',
        milestone: 'milestone close <id> --owner <words> --review <path>',
        context: 'context <id>', approve: 'approve <milestone>/<id>… --owner <words>',
        merge: 'merge <branch> --expect-head <commit>'
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
    if (command === 'drive') result = await drive(project, opts);
    if (command === 'status') result = status(project);
    if (command === 'gate') result = gate(project);
    if (command === 'node') result = complete(project, words[1]);
    if (command === 'milestone') result = close(project, words[1], opts);
    if (command === 'context') result = context(project, words[0], opts.budget);
    if (command === 'approve') result = approve(project, words, opts);
    if (command === 'retro') result = retro(project);
    if (command === 'merge') result = await merge(project, words[0], opts['expect-head']);
    if (command === 'check') {
      const checked = await runChecks(project, opts);
      result = checked.result;
      checkPassed = checked.ok;
      after = checked.after;
    }
    printResult(command, opts, result, project, after);
    if (command === 'drive') {
      return ['milestone-gate', 'all-done'].includes(result.stop) ? 0 : 1;
    }
    if (command === 'status' || command === 'retro') return 0;
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
