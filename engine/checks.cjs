'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { codeState, gitEnvironment } = require('./git-state.cjs');
const { append } = require('./ledger.cjs');
const { expectOutput } = require('./expect.cjs');
const { load } = require('./loading.cjs');
const { status } = require('./states.cjs');
const INTERRUPTS = require('./signals.cjs');

// The output tail: the last 4 MiB of the log, where `expect` and `error_line` look.
function readTail(fd) {
  const size = fs.fstatSync(fd).size;
  const length = Math.min(size, 4 * 1024 * 1024);
  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, size - length);
  return buffer.toString('utf8');
}

function killGroup(child, signal = 'SIGKILL') {
  if (!(child.pid > 0)) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if (!['ESRCH', 'EPERM'].includes(error.code)) throw error; }
}

// The shell writes straight into the log file: no pipe is read, so output size never
// costs memory and a descendant that escaped the group cannot keep the engine waiting.
function runShell(root, check, fd, extraEnv = {}, graceMs = 0) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', check.run], { cwd: root,
      env: { ...gitEnvironment(root), ...extraEnv },
      detached: true, stdio: ['ignore', fd, fd] });
    const result = { code: null, signal: null, timedOut: false, spawnError: false,
      interrupted: 0 };
    let graceTimer, exited = false;
    const finish = (error) => {
      for (const t of [timer, graceTimer]) clearTimeout(t);
      for (const [signal, handler] of handlers) process.off(signal, handler);
      if (error) reject(error); else resolve(result);
    };
    const kill = (signal) => {
      try { killGroup(child, signal); } catch (error) { finish(error); }
    };
    const stop = () => {
      if (!graceMs) return kill();
      if (graceTimer) return;
      kill('SIGTERM');
      graceTimer = setTimeout(() => {
        graceTimer = null;
        kill();
        if (exited) finish();
      }, graceMs);
    };
    const handlers = Object.entries(INTERRUPTS).map(([signal, exitCode]) =>
      [signal, () => { result.interrupted = exitCode; stop(); }]);
    const timer = setTimeout(() => { result.timedOut = true; stop(); }, check.timeout * 1000);
    for (const [signal, handler] of handlers) process.on(signal, handler);
    child.on('error', (error) => {
      result.spawnError = true;
      fs.writeSync(fd, `${error.message}\n`);
      finish();
    });
    child.on('exit', (code, signal) => {
      Object.assign(result, { code, signal });
      exited = true;
      // A terminating agent gets its grace period even if the shell exits first.
      if (!graceTimer) { kill(); finish(); }
    });
  });
}

async function outcomeFor(exit, check, output) {
  if (exit.timedOut) return ['unknown', 'timeout'];
  if (exit.spawnError) return ['unknown', 'spawn-error'];
  if (exit.signal) return ['unknown', `signal-${exit.signal}`];
  if (exit.code === 126 || exit.code === 127) return ['unknown', 'not-runnable'];
  if (exit.code !== 0) return ['fail', `exit-${exit.code}`];
  const reason = await expectOutput(check.expect, output);
  return [reason === 'exit-0' ? 'pass' : 'unknown', reason];
}

function errorLine(output) {
  const lines = output.split(/\r?\n/u).filter((line) => line.trim());
  const pattern = /^\s*(?:✖|not ok\b|FAIL(?:ED)?\b)|\b(?:[A-Z][A-Za-z]*)?Error\b/u;
  return (lines.find((line) => pattern.test(line)) ?? lines.at(-1) ?? '').slice(0, 200);
}

async function execute(project, check) {
  const run = randomUUID();
  const log = `.ultra/.runtime/checks/${run}.log`;
  fs.mkdirSync(path.dirname(path.join(project.root, log)), { recursive: true });
  const fd = fs.openSync(path.join(project.root, log), 'w+');
  const started = performance.now();
  const before = codeState(project.root);
  let exit, output;
  try {
    exit = await runShell(project.root, check, fd);
    output = readTail(fd);
  } finally { fs.closeSync(fd); }
  if (exit.interrupted) throw Object.assign(new Error('Check interrupted.'),
    { exitCode: exit.interrupted });
  const [outcome, reason] = await outcomeFor(exit, check, output);
  const after = codeState(project.root);
  const record = { v: 1, run, check: check.id, at: new Date().toISOString(), outcome, reason,
    exit_code: exit.code, duration_ms: Math.round(performance.now() - started), code: before.code,
    dirty: before.dirty || after.dirty || before.code !== after.code, check_fp: check.fp,
    reqs: Object.fromEntries(check.covers.filter((id) => project.reqs.has(id))
      .map((id) => [id, project.reqs.get(id)])),
    shared: project.shared, log, error_line: outcome === 'pass' ? null : errorLine(output) };
  append(project.root, 'evidence', record);
  return record;
}

function selectedChecks(project, opts) {
  const { words } = opts;
  if (words.length && opts.selector) throw new Error('Choose check ids or a check selector.');
  const badId = words.find((id) => !project.checks.some((c) => c.id === id));
  if (badId !== undefined) throw new Error(`Unknown check ${badId}. Use an id from checks.json.`);
  if (opts.req !== null && !project.reqs.has(opts.req)) {
    throw new Error(`Unknown requirement ${opts.req}. Use an id from spec.md.`);
  }
  const scope = project.checks.filter((c) => words.length ? words.includes(c.id)
    : opts.selector === 'req' ? c.covers.includes(opts.req) : true);
  const stale = !words.length && (!opts.selector || opts.selector === 'stale');
  const pending = stale ? status(project).checks
    .filter((c) => ['stale', 'unknown'].includes(c.state)).map((c) => c.id) : null;
  return { scope, selected: pending ? scope.filter((c) => pending.includes(c.id)) : scope };
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

module.exports = { execute, runShell, runChecks };
