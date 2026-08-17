#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const SNAPSHOT_CHUNK_BYTES = 64 * 1024;
const MAX_OBSERVATION_FILES = 256;
const MAX_OBSERVATION_BYTES = 16 * 1024 * 1024;
const GIT_TIMEOUT_MS = 5000;
const GIT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const PRODUCT_PATHSPEC = [
  '--', '.',
  ':(exclude).ultra/test-report.json',
  ':(exclude).ultra/evidence/**',
  ':(exclude).ultra/reviews/**',
  ':(exclude).ultra/.runtime/**',
  ':(exclude).ultra/progress/**',
  ':(exclude).ultra/changes/active/**',
  ':(exclude).ultra/changes/archive/**',
  ':(exclude).ultra/changes/abandoned/**',
];

function git(cwd, args, encoding = 'utf8') {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding,
      maxBuffer: GIT_MAX_OUTPUT_BYTES,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GIT_TIMEOUT_MS,
    });
  } catch (error) {
    const operation = args.slice(0, 2).join(' ');
    if (error && (error.code === 'ETIMEDOUT' || (error.killed && error.signal))) {
      throw new Error(
        `ULTRA_SNAPSHOT_GIT_TIMEOUT: Git ${JSON.stringify(operation)} exceeded the `
        + `${GIT_TIMEOUT_MS}ms physical observation limit. Restore a responsive repository `
        + 'and Git process, then retry worktree_digest.',
      );
    }
    if (error && error.code === 'ENOBUFS') {
      throw new Error(
        `ULTRA_SNAPSHOT_GIT_OUTPUT_LIMIT: Git ${JSON.stringify(operation)} exceeded the `
        + `${GIT_MAX_OUTPUT_BYTES}-byte output limit. Reduce or split the physical product `
        + 'observation, then retry worktree_digest.',
      );
    }
    const stderr = error && error.stderr
      ? Buffer.from(error.stderr).toString('utf8').trim().split('\n')[0]
      : 'Git returned an unknown failure';
    throw new Error(
      `ULTRA_SNAPSHOT_GIT_FAILED: Git ${JSON.stringify(operation)} failed (${stderr}). `
      + 'Repair the repository and Git operation, then retry worktree_digest.',
    );
  }
}

function optionsFromArgs(argv) {
  const options = { project: process.cwd(), changeId: null };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error('usage: worktree_digest.cjs [--project <repository-root>] [--change-id <id>]');
    if (flag === '--project') options.project = path.resolve(value);
    else if (flag === '--change-id') options.changeId = value;
    else throw new Error('usage: worktree_digest.cjs [--project <repository-root>] [--change-id <id>]');
  }
  if (options.changeId && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.changeId)) {
    throw new Error(`invalid Change id: ${options.changeId}`);
  }
  return options;
}

function snapshotError(code, relative, observation) {
  return new Error(
    `${code}: cannot snapshot ${JSON.stringify(relative)}: ${observation}. `
    + 'Restore the repository path as an ordinary regular non-symlink file within the '
    + '8 MiB limit, then retry worktree_digest.',
  );
}

function repositoryPath(root, relative) {
  if (typeof relative !== 'string'
      || relative.length === 0
      || relative.includes('\0')
      || path.posix.isAbsolute(relative)
      || path.win32.isAbsolute(relative)) {
    throw snapshotError('ULTRA_SNAPSHOT_PATH_ESCAPE', String(relative), 'path is not repository-relative');
  }
  const parts = relative.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')
      || (path.sep === '\\' && parts.some((part) => part.includes('\\')))) {
    throw snapshotError('ULTRA_SNAPSHOT_PATH_ESCAPE', relative, 'path escapes its repository root');
  }
  const absolute = path.join(root, ...parts);
  const resolvedRelative = path.relative(root, absolute);
  if (resolvedRelative === ''
      || resolvedRelative === '..'
      || resolvedRelative.startsWith(`..${path.sep}`)
      || path.isAbsolute(resolvedRelative)) {
    throw snapshotError('ULTRA_SNAPSHOT_PATH_ESCAPE', relative, 'path escapes its repository root');
  }
  return { absolute, parts };
}

function lstatSnapshot(absolute, relative) {
  try {
    return fs.lstatSync(absolute, { bigint: true });
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      throw snapshotError('ULTRA_SNAPSHOT_MISSING', relative, 'path disappeared during observation');
    }
    throw snapshotError(
      'ULTRA_SNAPSHOT_UNREADABLE',
      relative,
      `lstat failed with ${error && error.code ? error.code : 'an unknown error'}`,
    );
  }
}

function sameNode(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode;
}

function sameFileVersion(left, right) {
  return sameNode(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function walkSnapshotPath(root, relative) {
  const resolved = repositoryPath(root, relative);
  const parents = [];
  let current = root;
  const rootStat = lstatSnapshot(root, '.');
  if (rootStat.isSymbolicLink()) {
    throw snapshotError('ULTRA_SNAPSHOT_SYMLINK', relative, 'repository root is a symlink');
  }
  if (!rootStat.isDirectory()) {
    throw snapshotError('ULTRA_SNAPSHOT_NOT_DIRECTORY', relative, 'repository root is not a directory');
  }
  parents.push({ absolute: root, relative: '.', stat: rootStat });

  for (const part of resolved.parts.slice(0, -1)) {
    current = path.join(current, part);
    const observedRelative = path.relative(root, current) || '.';
    const stat = lstatSnapshot(current, observedRelative);
    if (stat.isSymbolicLink()) {
      throw snapshotError(
        'ULTRA_SNAPSHOT_SYMLINK',
        relative,
        `parent ${JSON.stringify(observedRelative)} is a symlink`,
      );
    }
    if (!stat.isDirectory()) {
      throw snapshotError(
        'ULTRA_SNAPSHOT_NOT_DIRECTORY',
        relative,
        `parent ${JSON.stringify(observedRelative)} is not a directory`,
      );
    }
    parents.push({ absolute: current, relative: observedRelative, stat });
  }

  const finalStat = lstatSnapshot(resolved.absolute, relative);
  if (finalStat.isSymbolicLink()) {
    throw snapshotError('ULTRA_SNAPSHOT_SYMLINK', relative, 'final entry is a symlink');
  }
  if (!finalStat.isFile()) {
    throw snapshotError('ULTRA_SNAPSHOT_NOT_REGULAR', relative, 'final entry is not a regular file');
  }
  if (finalStat.size > BigInt(MAX_SNAPSHOT_BYTES)) {
    throw snapshotError(
      'ULTRA_SNAPSHOT_TOO_LARGE',
      relative,
      `regular file exceeds the ${MAX_SNAPSHOT_BYTES}-byte physical ceiling`,
    );
  }
  return {
    absolute: resolved.absolute,
    final: { absolute: resolved.absolute, relative, stat: finalStat },
    parents,
  };
}

function verifyFreshRewalk(root, relative, initial, phase) {
  let current;
  try {
    current = walkSnapshotPath(root, relative);
  } catch (error) {
    throw snapshotError(
      'ULTRA_SNAPSHOT_REPLACED',
      relative,
      `${phase} rewalk no longer resolves the initial identities (${error.message})`,
    );
  }
  const parentsStable = current.parents.length === initial.parents.length
    && current.parents.every((entry, index) => sameNode(entry.stat, initial.parents[index].stat));
  if (!parentsStable || !sameFileVersion(current.final.stat, initial.final.stat)) {
    throw snapshotError(
      'ULTRA_SNAPSHOT_REPLACED',
      relative,
      `${phase} rewalk observed a replaced root, parent, or final identity`,
    );
  }
}

function openSnapshotFile(absolute, relative) {
  const { O_NOFOLLOW, O_NONBLOCK, O_RDONLY } = fs.constants;
  if (![O_NOFOLLOW, O_NONBLOCK, O_RDONLY].every(Number.isInteger)) {
    throw snapshotError(
      'ULTRA_SNAPSHOT_UNSUPPORTED',
      relative,
      'this host cannot enforce O_NONBLOCK and O_NOFOLLOW',
    );
  }
  try {
    return fs.openSync(absolute, O_RDONLY | O_NONBLOCK | O_NOFOLLOW);
  } catch (error) {
    const observed = error && error.code ? error.code : 'an unknown error';
    if (['ELOOP', 'ENOENT', 'ENOTDIR', 'ENXIO'].includes(observed)) {
      throw snapshotError(
        'ULTRA_SNAPSHOT_REPLACED',
        relative,
        `no-follow nonblocking open observed ${observed}`,
      );
    }
    throw snapshotError(
      'ULTRA_SNAPSHOT_UNREADABLE',
      relative,
      `no-follow nonblocking open failed with ${observed}`,
    );
  }
}

function streamStableRepositoryFile(root, relative, consume, budget = null) {
  const initial = walkSnapshotPath(root, relative);
  if (budget) budget.reserve(relative, initial.final.stat.size);
  let descriptor;
  try {
    descriptor = openSnapshotFile(initial.absolute, relative);
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || !sameFileVersion(opened, initial.final.stat)) {
      throw snapshotError(
        'ULTRA_SNAPSHOT_REPLACED',
        relative,
        'opened descriptor does not match the initial regular-file identity',
      );
    }
    verifyFreshRewalk(root, relative, initial, 'pre-read');

    const buffer = Buffer.allocUnsafe(SNAPSHOT_CHUNK_BYTES);
    let offset = 0;
    for (;;) {
      const remaining = MAX_SNAPSHOT_BYTES - offset;
      const requested = Math.min(buffer.length, remaining + 1);
      let bytesRead;
      try {
        bytesRead = fs.readSync(descriptor, buffer, 0, requested, offset);
      } catch (error) {
        throw snapshotError(
          'ULTRA_SNAPSHOT_UNREADABLE',
          relative,
          `stream read failed with ${error && error.code ? error.code : 'an unknown error'}`,
        );
      }
      if (bytesRead === 0) break;
      offset += bytesRead;
      if (offset > MAX_SNAPSHOT_BYTES) {
        throw snapshotError(
          'ULTRA_SNAPSHOT_TOO_LARGE',
          relative,
          `stream exceeded the ${MAX_SNAPSHOT_BYTES}-byte physical ceiling`,
        );
      }
      consume(buffer.subarray(0, bytesRead));
    }

    const finished = fs.fstatSync(descriptor, { bigint: true });
    if (!finished.isFile()
        || !sameFileVersion(finished, initial.final.stat)
        || BigInt(offset) !== finished.size) {
      throw snapshotError(
        'ULTRA_SNAPSHOT_REPLACED',
        relative,
        'file identity or byte extent changed during the streamed read',
      );
    }
    verifyFreshRewalk(root, relative, initial, 'post-read');
    return initial;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function resourceError(relative, nextFiles, nextBytes) {
  return new Error(
    `ULTRA_SNAPSHOT_RESOURCE_LIMIT: cannot snapshot ${JSON.stringify(relative)}: aggregate `
    + `product observation would reach ${nextFiles} files and ${nextBytes} bytes, above the `
    + `${MAX_OBSERVATION_FILES}-file or ${MAX_OBSERVATION_BYTES}-byte physical ceiling. `
    + 'Reduce or split the included physical product observation, then retry worktree_digest; '
    + 'this ceiling is not a semantic quality verdict.',
  );
}

function observationBudget() {
  let files = 0;
  let bytes = 0;
  return {
    reserve(relative, size) {
      const nextFiles = files + 1;
      const nextBytes = bytes + Number(size);
      if (nextFiles > MAX_OBSERVATION_FILES || nextBytes > MAX_OBSERVATION_BYTES) {
        throw resourceError(relative, nextFiles, nextBytes);
      }
      files = nextFiles;
      bytes = nextBytes;
    },
  };
}

function candidateExists(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false;
    throw error;
  }
}

function intentSnapshot(root, changeId) {
  if (!changeId) return { change_id: null, intent_digest: null };
  const matches = ['active', 'archive', 'abandoned']
    .map((state) => path.join(root, '.ultra', 'changes', state, changeId, 'intent.md'))
    .filter(candidateExists);
  if (matches.length !== 1) {
    throw new Error(`expected exactly one intent.md for Change ${changeId}; found ${matches.length}`);
  }
  const intentHash = crypto.createHash('sha256');
  const relative = path.relative(root, matches[0]).split(path.sep).join('/');
  const snapshot = streamStableRepositoryFile(root, relative, (chunk) => intentHash.update(chunk));
  return {
    change_id: changeId,
    intent_digest: intentHash.digest('hex'),
    relative,
    identity: snapshotIdentity(snapshot),
  };
}

function snapshotIdentity(snapshot) {
  const statIdentity = (stat) => [
    stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs,
  ].map((value) => value.toString()).join(':');
  return [
    ...snapshot.parents.map((entry) => statIdentity(entry.stat)),
    statIdentity(snapshot.final.stat),
  ].join('|');
}

function excluded(file) {
  return file === '.ultra/test-report.json'
    || /^\.ultra\/evidence(?:\/|$)/.test(file)
    || /^\.ultra\/(?:reviews|\.runtime|progress)(?:\/|$)/.test(file)
    || /^\.ultra\/changes\/(?:active|archive|abandoned)(?:\/|$)/.test(file);
}

function changedDuringObservation(observation) {
  return new Error(
    `ULTRA_SNAPSHOT_CHANGED_DURING_OBSERVATION: ${observation}. `
    + 'Finish or restore the concurrent repository change, then retry worktree_digest once; '
    + 'no digest was accepted.',
  );
}

function splitNul(buffer, label) {
  if (buffer.length === 0) return [];
  if (buffer[buffer.length - 1] !== 0) {
    throw new Error(
      `ULTRA_SNAPSHOT_GIT_FAILED: ${label} was not NUL terminated. `
      + 'Repair the Git observation, then retry worktree_digest.',
    );
  }
  const values = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    values.push(buffer.subarray(start, index));
    start = index + 1;
  }
  return values;
}

function decodeGitPath(bytes, label) {
  const relative = bytes.toString('utf8');
  if (!Buffer.from(relative, 'utf8').equals(bytes)) {
    throw snapshotError(
      'ULTRA_SNAPSHOT_PATH_ENCODING',
      label,
      'Git returned a path that is not valid UTF-8',
    );
  }
  return relative;
}

function trackedManifest(root, head) {
  const raw = git(root, [
    'diff', '--raw', '-z', '--no-renames', '--abbrev=64', head, ...PRODUCT_PATHSPEC,
  ], 'buffer');
  const fields = splitNul(raw, 'tracked manifest');
  if (fields.length % 2 !== 0) {
    throw new Error(
      'ULTRA_SNAPSHOT_GIT_FAILED: tracked manifest has an incomplete raw record. '
      + 'Repair the Git observation, then retry worktree_digest.',
    );
  }
  const files = [];
  for (let index = 0; index < fields.length; index += 2) {
    const header = fields[index].toString('ascii');
    const match = header.match(
      /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])(?:[0-9]+)?$/u,
    );
    if (!match) {
      throw new Error(
        `ULTRA_SNAPSHOT_GIT_FAILED: tracked manifest record ${JSON.stringify(header)} is invalid. `
        + 'Repair the Git observation, then retry worktree_digest.',
      );
    }
    const relative = decodeGitPath(fields[index + 1], 'tracked manifest path');
    files.push({
      path: relative,
      status: match[5],
      present: match[5] !== 'D',
      old_mode: match[1],
      new_mode: match[2],
    });
  }
  return { raw, files };
}

function untrackedManifest(root) {
  const raw = git(root, ['ls-files', '--others', '--exclude-standard', '-z'], 'buffer');
  const entries = splitNul(raw, 'untracked manifest')
    .map((bytes) => ({ bytes, path: decodeGitPath(bytes, 'untracked manifest path') }))
    .filter((entry) => !excluded(entry.path))
    .sort((left, right) => Buffer.compare(left.bytes, right.bytes));
  return {
    files: entries.map((entry) => entry.path),
    raw: Buffer.concat(entries.flatMap((entry) => [entry.bytes, Buffer.from([0])])),
  };
}

function exactDiff(root, head) {
  return git(root, [
    'diff', '--binary', '--no-ext-diff', head, ...PRODUCT_PATHSPEC,
  ], 'buffer');
}

function verifyObservedPaths(root, records) {
  for (const record of records) {
    try {
      verifyFreshRewalk(root, record.relative, record.snapshot, 'final');
    } catch (error) {
      throw changedDuringObservation(
        `included path ${JSON.stringify(record.relative)} changed after its stable read (${error.message})`,
      );
    }
  }
}

function sameIntent(left, right) {
  return left.change_id === right.change_id
    && left.intent_digest === right.intent_digest
    && left.relative === right.relative
    && left.identity === right.identity;
}

function verifyExpectedObservation(root, expected) {
  const observedHead = git(root, ['rev-parse', 'HEAD']).trim();
  const observedTracked = trackedManifest(root, expected.head);
  const observedUntracked = untrackedManifest(root);
  const observedDiff = exactDiff(root, expected.head);
  if (observedHead !== expected.head
      || !observedTracked.raw.equals(expected.tracked.raw)
      || !observedUntracked.raw.equals(expected.untracked.raw)
      || !observedDiff.equals(expected.diff)) {
    throw changedDuringObservation(
      'HEAD, the exact tracked manifest or diff, or the untracked manifest changed during capture',
    );
  }

  const observedIntent = intentSnapshot(root, expected.intent.change_id);
  if (!sameIntent(expected.intent, observedIntent)) {
    throw changedDuringObservation('the Change intent identity or bytes changed during capture');
  }
  verifyObservedPaths(root, expected.records);
}

function verifyClosingObservation(root, expected) {
  verifyExpectedObservation(root, expected);
  verifyExpectedObservation(root, expected);
}

function main(options) {
  const root = fs.realpathSync(git(options.project, ['rev-parse', '--show-toplevel']).trim());
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const tracked = trackedManifest(root, head);
  const untracked = untrackedManifest(root);
  const intent = intentSnapshot(root, options.changeId);
  const budget = observationBudget();
  const records = [];

  for (const file of tracked.files) {
    if (!file.present) {
      budget.reserve(file.path, 0n);
      continue;
    }
    const snapshot = streamStableRepositoryFile(root, file.path, () => {}, budget);
    records.push({ relative: file.path, snapshot });
  }

  const untrackedBytes = [];
  for (const file of untracked.files) {
    const chunks = [];
    const snapshot = streamStableRepositoryFile(
      root,
      file,
      (chunk) => chunks.push(Buffer.from(chunk)),
      budget,
    );
    records.push({ relative: file, snapshot });
    untrackedBytes.push(chunks);
  }

  const diff = exactDiff(root, head);
  const closingObservation = { diff, head, intent, records, tracked, untracked };
  verifyClosingObservation(root, closingObservation);

  const hash = crypto.createHash('sha256');
  hash.update('ultra-worktree-digest-v1\0').update(head).update('\0').update(diff);
  for (let index = 0; index < untracked.files.length; index += 1) {
    hash.update(untracked.files[index]).update('\0');
    for (const chunk of untrackedBytes[index]) hash.update(chunk);
    hash.update('\0');
  }
  return {
    $schema: 'ultra-worktree-digest-v1',
    change_id: intent.change_id,
    intent_digest: intent.intent_digest,
    head,
    dirty: diff.length > 0 || untracked.files.length > 0,
    diff_digest: hash.digest('hex'),
    untracked_files: untracked.files,
  };
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(main(optionsFromArgs(process.argv.slice(2))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

// The product-subject pathspec and the stable file-snapshot primitive are the
// single bounded mechanical definitions shared with the primary-transfer
// validator, so receipt reads and digest subject bytes can never drift.
module.exports = { PRODUCT_PATHSPEC, streamStableRepositoryFile };
