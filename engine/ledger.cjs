'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ID, object, strings, read } = require('./formats.cjs');

const hashValue = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const hashes = (value) => object(value) && Object.values(value).every(hashValue);
const textFields = (record, fields) => fields.every((key) => typeof record[key] === 'string');
const checkSnapshots = (value) => object(value) && Object.values(value).every((check) =>
  object(check) && hashValue(check.fp) && strings(check.covers));
const LEDGERS = ['evidence', 'plan-log', 'nodes', 'milestones', 'approvals'];
const approvalItem = (value) => typeof value === 'string' && value.split('/').length === 2
  && value.split('/').every((part) => ID.test(part));

function validApproval(record) {
  return strings(record.items) && record.items.length > 0
    && record.items.every((item, i) => approvalItem(item) && (!i || record.items[i - 1] < item))
    && object(record.owner) && typeof record.owner.words === 'string'
    && record.owner.words.trim().length > 0 && typeof record.owner.proxy === 'boolean';
}

function validClosure(record) {
  const fields = {
    code: hashValue,
    reqs: hashes,
    journey: (v) => object(v) && textFields(v, ['check', 'run']),
    review: (v) => object(v) && textFields(v, ['path']) && hashValue(v.sha256),
    owner: (v) => object(v) && textFields(v, ['words']) && typeof v.proxy === 'boolean',
  };
  return typeof record.milestone === 'string'
    && Object.entries(fields).every(([key, valid]) => !Object.hasOwn(record, key)
      || valid(record[key]));
}

function recordTime(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validRecord(record, name) {
  if (!object(record) || record.v !== 1 || !recordTime(record.at)) return false;
  if (['evidence', 'plan-log', 'nodes'].includes(name)
      && Object.hasOwn(record, 'shared') && !hashValue(record.shared)) return false;
  if (name === 'evidence') {
    return textFields(record, ['check', 'run', 'reason', 'log'])
      && typeof record.dirty === 'boolean' && hashValue(record.code)
      && hashValue(record.check_fp) && hashes(record.reqs)
      && ['pass', 'fail', 'unknown'].includes(record.outcome)
      && (record.exit_code === null || Number.isInteger(record.exit_code))
      && Number.isInteger(record.duration_ms) && record.duration_ms >= 0
      && (record.error_line === null || typeof record.error_line === 'string');
  }
  if (name === 'plan-log') {
    const diff = record.diff;
    return typeof record.milestone === 'string' && hashes(record.requirements)
      && strings(record.nodes) && checkSnapshots(record.checks)
      && (!object(diff) || !Object.hasOwn(diff, 'shared') || diff.shared === true)
      && ['baseline', 'change', 'removed'].includes(record.type)
      && (record.type !== 'removed' || (!Object.keys(record.requirements).length
        && !record.nodes.length && !Object.keys(record.checks).length))
      && (record.type === 'baseline' || (object(diff)
        && ['added', 'removed', 'modified', 'nodes_added', 'nodes_removed',
          'checks_added', 'checks_removed', 'checks_modified']
          .every((key) => strings(diff[key]))));
  }
  if (name === 'nodes') return textFields(record, ['node']) && hashValue(record.code)
    && hashes(record.reqs) && strings(record.runs);
  if (name === 'approvals') return validApproval(record);
  return name === 'milestones' && validClosure(record);
}

function ledger(root, name) {
  const file = `ledger/${name}.jsonl`;
  const text = read(root, file, true);
  const lines = text.split('\n');
  const records = [];
  const warnings = [];
  let repairEnd = null;
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    let record;
    try { record = JSON.parse(line); } catch { /* validated below */ }
    if (validRecord(record, name)) { records.push(record); return; }
    const location = `.ultra/${file}:${index + 1}`;
    if (index === lines.length - 1 && !text.endsWith('\n')) {
      repairEnd = Buffer.byteLength(text.slice(0, text.lastIndexOf('\n') + 1));
      warnings.push(`${location}: incomplete final ledger record ignored; repaired on next append`);
    } else throw new Error(`${location}: malformed ledger record; remove or repair that line.`);
  });
  return { records, warnings, repairEnd, needsNewline: !!text && !text.endsWith('\n') };
}

function latest(records, field, id) {
  let result;
  for (const record of records) {
    if (record[field] === id && (!result || record.at >= result.at)) result = record;
  }
  return result;
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === 'EPERM') return true;
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function removeOwnedLock(file, pid) {
  try {
    if (Number(fs.readFileSync(file, 'utf8')) === pid) fs.unlinkSync(file);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function breakDeadLock(file, pid) {
  const breaker = `${file}.break`;
  let fd;
  try { fd = fs.openSync(breaker, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      if (Date.now() - fs.statSync(breaker).mtimeMs > 10000) {
        fs.unlinkSync(breaker);
        return breakDeadLock(file, pid);
      }
    } catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
    return;
  }
  try {
    // Only one breaker rechecks and removes a dead pid; other waiters cannot race it.
    if (!alive(pid)) removeOwnedLock(file, pid);
  } finally {
    fs.closeSync(fd);
    try { fs.unlinkSync(breaker); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function acquireLock(root, name) {
  const file = path.join(root, '.ultra', '.runtime', `${name}.lock`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try { fd = fs.openSync(file, 'wx'); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (fd !== undefined) {
      try { fs.writeFileSync(fd, String(process.pid)); }
      finally { fs.closeSync(fd); }
      return () => removeOwnedLock(file, process.pid);
    }
    try {
      const pid = Number(fs.readFileSync(file, 'utf8'));
      if (Number.isInteger(pid) && pid > 0 && !alive(pid)) breakDeadLock(file, pid);
      else return null;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return null;
}

function withLock(root, action) {
  const deadline = Date.now() + 30000;
  while (true) {
    const release = acquireLock(root, 'engine');
    if (release) {
      try { return action(); } finally { release(); }
    }
    if (Date.now() >= deadline) {
      throw new Error('.ultra/.runtime/engine.lock: lock wait exceeded 30 s; check its holder.');
    }
    // Sleep without polling the filesystem in a busy loop while the holder works.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}

function append(root, name, record, locked = false) {
  const write = () => {
    const ledgers = new Map(LEDGERS.map((key) => [key, ledger(root, key)]));
    const state = ledgers.get(name);
    // Read and advance under the same lock so clock rollback cannot hide a new record.
    const greatest = [...ledgers.values()].flatMap((s) => s.records)
      .reduce((time, r) => Math.max(time, Date.parse(r.at)), -1);
    record.at = new Date(Math.max(Date.now(), greatest + 1)).toISOString();
    if (!validRecord(record, name)) {
      throw new Error(`.ultra/ledger/${name}.jsonl: refusing to append a malformed ledger record.`);
    }
    const file = path.join(root, '.ultra', 'ledger', `${name}.jsonl`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (state.repairEnd !== null) fs.truncateSync(file, state.repairEnd);
    const prefix = state.repairEnd === null && state.needsNewline ? '\n' : '';
    fs.appendFileSync(file, `${prefix}${JSON.stringify(record)}\n`);
  };
  return locked ? write() : withLock(root, write);
}

module.exports = { ledger, latest, withLock, acquireLock, append, approvalItem };
