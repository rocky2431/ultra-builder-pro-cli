'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const hash = (text) => createHash('sha256').update(text).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value) => Array.isArray(value) && value.every((v) => typeof v === 'string');
const unique = (items) => [...new Set(items)];
const problem = (code, message, hint) => ({ code, message, hint });

function assertFile(ok, file, message) {
  if (!ok) throw new Error(`${file}: ${message}`);
}

function read(root, file, optional = false) {
  try { return fs.readFileSync(path.join(root, '.ultra', file), 'utf8'); }
  catch (error) {
    if (optional && error.code === 'ENOENT') return '';
    throw new Error(`.ultra/${file}: ${error.message}`);
  }
}

function readRecord(root, relative) {
  const file = path.join(root, relative);
  const result = { exists: true, bytes: null };
  let fd;
  try {
    const entry = fs.lstatSync(file, { throwIfNoEntry: false });
    result.exists = entry !== undefined;
    if (!entry?.isFile()) return result;
    const parent = fs.realpathSync(path.dirname(file));
    const location = path.relative(fs.realpathSync(root), parent);
    if (path.isAbsolute(location) || location === '..' || location.startsWith(`..${path.sep}`)) {
      return result;
    }
    fd = fs.openSync(path.join(parent, path.basename(file)),
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    if (fs.fstatSync(fd).isFile()) result.bytes = fs.readFileSync(fd);
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) {
      throw new Error(`${relative}: ${error.message}`);
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return result;
}

function parse(text, file) {
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`${file}: ${error.message}`); }
}

function markdown(text, visit) {
  let fence = null;
  const lines = text.replace(/\r\n/gu, '\n').split('\n');
  lines.forEach((line, index) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    if (fence) {
      visit(line, index + 1, false);
      if (marker && marker[1][0] === fence.marker[0]
          && marker[1].length >= fence.marker.length && !marker[2].trim()) fence = null;
    } else if (marker && (marker[1][0] !== '`' || !marker[2].includes('`'))) {
      fence = { marker: marker[1], line: index + 1 };
      visit(line, index + 1, false);
    } else visit(line, index + 1, true);
  });
  return fence?.line ?? null;
}

function requirements(text) {
  const result = new Map();
  const requirementText = new Map();
  const shared = [];
  let current = null;
  const finish = () => {
    if (!current) return;
    const lines = current.lines.map((line) => line.trimEnd());
    while (lines.length && lines.at(-1) === '') lines.pop();
    while (lines.length && lines[0] === '') lines.shift();
    const text = lines.join('\n');
    result.set(current.id, hash(text));
    requirementText.set(current.id, text);
    current = null;
  };
  const unclosed = markdown(text, (line, number, outside) => {
    const heading = outside && line.match(/^ {0,3}(#{1,2})(?:[ \t]+(.*)|[ \t]*)$/u);
    const isRequirement = heading && heading[1] === '##' && heading[2]?.startsWith('REQ-');
    if (outside && /^ {0,3}#+\s*REQ(?:[-_]|\s+\d)/iu.test(line) && !isRequirement) {
      assertFile(false, `.ultra/spec.md:${number}`, `malformed requirement heading: ${line}`);
    }
    if (heading) {
      finish();
      const title = heading[2] || '';
      if (heading[1] === '##' && title.startsWith('REQ-')) {
        const id = title.split(/\s/u)[0];
        const file = `.ultra/spec.md:${number}`;
        assertFile(ID.test(id.slice(4)), file, `malformed requirement heading: ${line}`);
        assertFile(!result.has(id), file, `duplicate requirement id ${id}`);
        current = { id, lines: [] };
      }
    }
    if (current) current.lines.push(line);
    else if (line.trimEnd()) shared.push(line.trimEnd());
  });
  assertFile(!unclosed, `.ultra/spec.md:${unclosed}`, 'unclosed fence');
  finish();
  return { reqs: result, requirementText, shared: hash(shared.join('\n')) };
}

function validateCheck(item, valid) {
  valid(item.covers.length > 0 && item.run.trim().length > 0,
    `${item.id}: covers and run must be non-empty`);
  const timeout = item.timeout_sec === undefined ? 600 : item.timeout_sec;
  valid(Number.isInteger(timeout) && timeout > 0 && timeout <= 86400,
    `${item.id}: invalid timeout_sec`);
  valid(typeof item.expect === 'string' && item.expect.length > 0,
    `${item.id}: expect must be a non-empty regular expression string`);
  let pattern;
  try { pattern = new RegExp(item.expect, 'mu'); }
  catch (error) { valid(false, `${item.id}: invalid expect: ${error.message}`); }
  valid(!pattern.test(''), `${item.id}: expect must not match the empty string`);
}

function registry(root, file, kinds) {
  const data = parse(read(root, file), `.ultra/${file}`);
  const valid = (ok, message) => assertFile(ok, `.ultra/${file}`, message);
  valid(object(data) && data.version === 1, 'expected an object with version 1');
  for (const [kind, fields] of Object.entries(kinds)) {
    valid(Array.isArray(data[kind]), `${kind} must be an array`);
    const ids = new Set();
    for (const item of data[kind]) {
      valid(object(item) && typeof item.id === 'string' && ID.test(item.id),
        `invalid ${kind} id`);
      valid(!ids.has(item.id), `duplicate id ${item.id}`);
      ids.add(item.id);
      for (const [field, type] of Object.entries(fields)) {
        valid(type === 'array' ? strings(item[field]) : typeof item[field] === type,
          `${item.id}: invalid or missing ${field}`);
      }
      if (kind === 'checks') validateCheck(item, valid);
      if (kind === 'nodes' && item.scope !== undefined) {
        valid(strings(item.scope), `${item.id}: scope must be an array of strings`);
      }
      if (kind === 'milestones' && item.journey !== undefined) {
        valid(typeof item.journey === 'string', `${item.id}: journey must be a string`);
      }
    }
  }
  return data;
}

function rulingProblems(text) {
  const problems = [];
  const ruling = new RegExp('^- \\d{4}-\\d{2}-\\d{2} L[0-4] 裁决：(.*?) — 因为(.*?)'
    + ' — 如果判断错了，代价是(.*)$', 'u');
  const hint = 'Use: - YYYY-MM-DD L0–L4 裁决：decision — 因为 reason '
    + '— 如果判断错了，代价是 cost';
  const unclosed = markdown(text, (line, number, outside) => {
    const match = outside && line.match(ruling);
    if (outside && /^\s*[-*+] /u.test(line)
        && (!match || !match.slice(1).every((part) => part.trim()))) {
      problems.push(problem('malformed-ruling', `.ultra/rulings.md:${number}: ${line}`, hint));
    }
  });
  if (unclosed) problems.push(problem('malformed-ruling',
    `.ultra/rulings.md:${unclosed}: unclosed fence`, 'Close the fence opened on this line.'));
  return problems;
}

module.exports = { ID, hash, object, strings, unique, problem, read, readRecord, markdown,
  requirements, registry, rulingProblems };
