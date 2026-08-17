'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ULTRA = path.join(ROOT, '.ultra');
const MAX_CHANGE_INTENT_BYTES = 8 * 1024 * 1024;
const MAX_ACTIVE_CHANGE_ROOT_ENTRIES = 2;

function headingSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function headingAnchors(file) {
  return new Set(
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => /^#{1,6}\s+/.test(line))
      .map((line) => headingSlug(line.replace(/^#{1,6}\s+/, ''))),
  );
}

function contextStatus(file) {
  const match = fs.readFileSync(file, 'utf8').match(/^> \*\*Status\*\*: ([a-z_]+)/m);
  assert.ok(match, `${path.relative(ROOT, file)} has no status header`);
  return match[1];
}

function acceptanceSection(file) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('## Acceptance Criteria\n');
  assert.notEqual(start, -1, `${path.relative(ROOT, file)} has no Acceptance Criteria`);
  const next = source.slice(start + 1).match(/\n## /);
  const end = next ? start + 1 + next.index : source.length;
  return source.slice(start, end);
}

function ordinaryDirectoryIdentity(file, label) {
  const stat = fs.lstatSync(file);
  assert.equal(
    stat.isDirectory(),
    true,
    `${label} must be an ordinary non-symlink directory`,
  );
  return { dev: stat.dev, ino: stat.ino };
}

function ordinaryFileIdentity(file, label) {
  const stat = fs.lstatSync(file);
  assert.equal(
    stat.isFile(),
    true,
    `${label} must be an ordinary non-symlink file`,
  );
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  };
}

function snapshotOrdinaryDirectoryChain(entries) {
  return entries.map(({ file, label }) => ({
    file,
    label,
    identity: ordinaryDirectoryIdentity(file, label),
  }));
}

function assertOrdinaryDirectoryChainUnchanged(entries) {
  for (const entry of entries) {
    assert.deepEqual(
      ordinaryDirectoryIdentity(entry.file, entry.label),
      entry.identity,
      `${entry.label} identity changed during audit`,
    );
  }
}

function scanActiveChangeRoot(activeRoot) {
  const entries = [];
  const directory = fs.opendirSync(activeRoot);
  let candidateCount = 0;
  let entryCount = 0;
  let marker;
  let candidate;
  try {
    for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
      entryCount += 1;
      assert.ok(
        entryCount <= MAX_ACTIVE_CHANGE_ROOT_ENTRIES,
        `active Change root exceeds the physical entry ceiling of ${MAX_ACTIVE_CHANGE_ROOT_ENTRIES}; keep only one active Change directory and an optional regular .gitkeep, then rerun the audit`,
      );
      if (entry.name === '.gitkeep') {
        assert.equal(
          entry.isFile(),
          true,
          '.gitkeep must be an ordinary regular file; replace or remove the marker, then rerun the audit',
        );
        const markerFile = path.join(activeRoot, entry.name);
        const markerLabel = 'active Change .gitkeep marker';
        marker = {
          file: markerFile,
          label: markerLabel,
          identity: ordinaryFileIdentity(markerFile, markerLabel),
        };
        entries.push({ name: entry.name, type: 'file', identity: marker.identity });
        continue;
      }
      assert.equal(
        entry.isDirectory(),
        true,
        `${entry.name}: active Change root entries must be directories that are ordinary and non-symlink; remove or replace the malformed entry, then rerun the audit`,
      );
      candidateCount += 1;
      assert.ok(
        candidateCount <= 1,
        'at most one active Change directory; move every other candidate to archive or abandoned after owner disposition, then rerun the audit',
      );
      const candidateDirectory = path.join(activeRoot, entry.name);
      const directoryIdentity = ordinaryDirectoryIdentity(
        candidateDirectory,
        `${entry.name}: active Change directory`,
      );
      candidate = {
        name: entry.name,
        directory: candidateDirectory,
        directoryIdentity,
      };
      entries.push({ name: entry.name, type: 'directory', identity: directoryIdentity });
    }
  } finally {
    directory.closeSync();
  }
  entries.sort((left, right) => {
    if (left.name === right.name) return 0;
    return left.name < right.name ? -1 : 1;
  });
  return { candidate, entries, marker };
}

function assertActiveChangeRootSnapshotUnchanged(snapshot) {
  if (snapshot.marker) {
    assert.deepEqual(
      ordinaryFileIdentity(snapshot.marker.file, snapshot.marker.label),
      snapshot.marker.identity,
      `${snapshot.marker.label} identity changed during audit`,
    );
  }
  if (snapshot.candidate) {
    assert.deepEqual(
      ordinaryDirectoryIdentity(
        snapshot.candidate.directory,
        'selected active Change directory',
      ),
      snapshot.candidate.directoryIdentity,
      'selected active Change directory identity changed during audit',
    );
  }
}

function activeChangeIntents(ultraRoot = ULTRA) {
  const changesRoot = path.join(ultraRoot, 'changes');
  const activeRoot = path.join(ultraRoot, 'changes', 'active');
  const directoryChain = snapshotOrdinaryDirectoryChain([
    { file: ultraRoot, label: 'active Change .ultra ancestor' },
    { file: changesRoot, label: 'active Change changes ancestor' },
    { file: activeRoot, label: 'active Change root' },
  ]);
  const initial = scanActiveChangeRoot(activeRoot);
  assertOrdinaryDirectoryChainUnchanged(directoryChain);
  assertActiveChangeRootSnapshotUnchanged(initial);

  const replay = scanActiveChangeRoot(activeRoot);
  assertOrdinaryDirectoryChainUnchanged(directoryChain);
  assertActiveChangeRootSnapshotUnchanged(replay);
  assert.deepEqual(
    replay.entries,
    initial.entries,
    'active Change root entry set changed during audit; restore one ordinary active Change directory and the optional regular .gitkeep, then rerun the audit',
  );
  assertActiveChangeRootSnapshotUnchanged(initial);
  if (!initial.candidate) return [];

  const intent = path.join(initial.candidate.directory, 'intent.md');
  const intentIdentity = ordinaryFileIdentity(
    intent,
    `${initial.candidate.name}: active Change intent`,
  );
  assertOrdinaryDirectoryChainUnchanged(directoryChain);
  assertActiveChangeRootSnapshotUnchanged(initial);
  assert.deepEqual(
    ordinaryFileIdentity(intent, 'selected active Change intent'),
    intentIdentity,
    'selected active Change intent identity changed during audit',
  );
  return [intent];
}

function storedChangeIntentCandidate(state, changeId, ultraRoot) {
  const changesRoot = path.join(ultraRoot, 'changes');
  const stateRoot = path.join(changesRoot, state);
  const rootChain = snapshotOrdinaryDirectoryChain([
    { file: ultraRoot, label: `${state}: stored Change .ultra ancestor` },
    { file: changesRoot, label: `${state}: stored Change changes ancestor` },
    { file: stateRoot, label: `${state}: stored Change root` },
  ]);
  const directory = path.join(stateRoot, changeId);
  let directoryIdentity;
  try {
    directoryIdentity = ordinaryDirectoryIdentity(
      directory,
      `${state}/${changeId}: stored Change directory`,
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    assertOrdinaryDirectoryChainUnchanged(rootChain);
    return null;
  }
  const directoryChain = [
    ...rootChain,
    {
      file: directory,
      label: `${state}/${changeId}: stored Change directory`,
      identity: directoryIdentity,
    },
  ];
  const file = path.join(directory, 'intent.md');
  const label = `${state}/${changeId}: stored Change intent`;
  const identity = ordinaryFileIdentity(file, label);
  assertOrdinaryDirectoryChainUnchanged(directoryChain);
  return { file, label, identity, directoryChain };
}

function activeChangeIntentCandidate(file, ultraRoot) {
  const changesRoot = path.join(ultraRoot, 'changes');
  const activeRoot = path.join(changesRoot, 'active');
  const directory = path.dirname(file);
  const changeId = path.basename(directory);
  const directoryChain = snapshotOrdinaryDirectoryChain([
    { file: ultraRoot, label: 'selected active Change .ultra ancestor' },
    { file: changesRoot, label: 'selected active Change changes ancestor' },
    { file: activeRoot, label: 'selected active Change root' },
    { file: directory, label: 'selected active Change directory' },
  ]);
  const label = `${changeId}: selected active Change intent`;
  const identity = ordinaryFileIdentity(file, label);
  assertOrdinaryDirectoryChainUnchanged(directoryChain);
  return { file, label, identity, directoryChain };
}

function boundedStableFileSnapshot(candidate) {
  assert.ok(
    candidate.identity.size <= MAX_CHANGE_INTENT_BYTES,
    `${candidate.label} must not exceed ${MAX_CHANGE_INTENT_BYTES} bytes`,
  );
  const flags = fs.constants.O_RDONLY
    | fs.constants.O_NONBLOCK
    | (fs.constants.O_NOFOLLOW || 0);
  const descriptor = fs.openSync(candidate.file, flags);
  const chunks = [];
  let total = 0;
  try {
    const opened = fs.fstatSync(descriptor);
    assert.equal(opened.isFile(), true, `${candidate.label} must be an ordinary file`);
    assert.deepEqual(
      {
        dev: opened.dev,
        ino: opened.ino,
        size: opened.size,
        mtimeMs: opened.mtimeMs,
        ctimeMs: opened.ctimeMs,
      },
      candidate.identity,
      `${candidate.label} identity changed during audit`,
    );
    assertOrdinaryDirectoryChainUnchanged(candidate.directoryChain);
    while (total <= MAX_CHANGE_INTENT_BYTES) {
      const chunk = Buffer.allocUnsafe(Math.min(
        64 * 1024,
        MAX_CHANGE_INTENT_BYTES + 1 - total,
      ));
      const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      total += count;
      chunks.push(chunk.subarray(0, count));
    }
    assert.ok(
      total <= MAX_CHANGE_INTENT_BYTES,
      `${candidate.label} must not exceed ${MAX_CHANGE_INTENT_BYTES} bytes`,
    );
    const afterRead = fs.fstatSync(descriptor);
    assert.deepEqual(
      {
        dev: afterRead.dev,
        ino: afterRead.ino,
        size: afterRead.size,
        mtimeMs: afterRead.mtimeMs,
        ctimeMs: afterRead.ctimeMs,
      },
      candidate.identity,
      `${candidate.label} identity changed during audit`,
    );
  } finally {
    fs.closeSync(descriptor);
  }
  assertOrdinaryDirectoryChainUnchanged(candidate.directoryChain);
  assert.deepEqual(
    ordinaryFileIdentity(candidate.file, candidate.label),
    candidate.identity,
    `${candidate.label} identity changed during audit`,
  );
  return Buffer.concat(chunks, total);
}

function repositoryFileSnapshot(relative, label) {
  assert.equal(path.posix.isAbsolute(relative), false, `${label}: ref must be relative`);
  assert.equal(path.win32.isAbsolute(relative), false, `${label}: ref must be relative`);
  assert.equal(relative.includes('\\'), false, `${label}: ref must use forward slashes`);
  assert.equal(path.posix.normalize(relative), relative, `${label}: ref must be normalized`);
  const segments = relative.split('/');
  assert.ok(
    segments.length > 0
      && segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    `${label}: ref must stay inside the repository`,
  );
  const file = path.join(ROOT, ...segments);
  assert.equal(
    file.startsWith(`${ROOT}${path.sep}`),
    true,
    `${label}: ref must stay inside the repository`,
  );
  const directoryChain = snapshotOrdinaryDirectoryChain([
    { file: ROOT, label: `${label}: repository root` },
    ...segments.slice(0, -1).map((_, index) => ({
      file: path.join(ROOT, ...segments.slice(0, index + 1)),
      label: `${label}: parent ${index + 1}`,
    })),
  ]);
  const candidate = {
    file,
    label,
    identity: ordinaryFileIdentity(file, label),
    directoryChain,
  };
  return boundedStableFileSnapshot(candidate);
}

function changeIntent(changeId, ultraRoot = ULTRA) {
  const activeMatches = activeChangeIntents(ultraRoot)
    .filter((file) => path.basename(path.dirname(file)) === changeId)
    .map((file) => activeChangeIntentCandidate(file, ultraRoot));
  const storedMatches = ['archive', 'abandoned']
    .map((state) => storedChangeIntentCandidate(state, changeId, ultraRoot))
    .filter(Boolean);
  const matches = [...activeMatches, ...storedMatches];
  assert.equal(matches.length, 1, `${changeId}: expected exactly one Change intent`);
  return {
    path: matches[0].file,
    bytes: boundedStableFileSnapshot(matches[0]),
  };
}

async function listenUnixSocket(file) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(file, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return async () => {
    await new Promise((resolve) => server.close(resolve));
  };
}

test('active Change root audit is a bounded stream with reachable recovery', async (t) => {
  function fixture(entries) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'u-active-audit-'));
    const ultraRoot = path.join(root, '.ultra');
    const activeRoot = path.join(ultraRoot, 'changes', 'active');
    fs.mkdirSync(activeRoot, { recursive: true });
    for (const entry of entries) {
      const target = path.join(activeRoot, entry.name);
      if (entry.type === 'directory') {
        fs.mkdirSync(target);
        if (entry.intent) fs.writeFileSync(path.join(target, 'intent.md'), '# Change\n');
      } else {
        fs.writeFileSync(target, entry.contents || 'marker\n');
      }
    }
    return { root, ultraRoot, activeRoot };
  }

  function deterministicStream(current, orderedNames, maximumReads, onRead = () => {}) {
    const originalOpendirSync = fs.opendirSync;
    const originalReaddirSync = fs.readdirSync;
    const dirents = new Map(
      originalReaddirSync(current.activeRoot, { withFileTypes: true })
        .map((entry) => [entry.name, entry]),
    );
    const observation = { closeCount: 0, readCount: 0 };

    fs.readdirSync = function rejectActiveRootMaterialization(target, ...args) {
      if (path.resolve(target) === current.activeRoot) {
        assert.fail('active Change audit must not materialize the root directory');
      }
      return Reflect.apply(originalReaddirSync, fs, [target, ...args]);
    };
    fs.opendirSync = function openDeterministicActiveRoot(target, ...args) {
      if (path.resolve(target) !== current.activeRoot) {
        return Reflect.apply(originalOpendirSync, fs, [target, ...args]);
      }
      let handleReadCount = 0;
      return {
        closeSync() {
          observation.closeCount += 1;
        },
        readSync() {
          handleReadCount += 1;
          observation.readCount += 1;
          assert.ok(
            handleReadCount <= maximumReads,
            'active Change audit read past the required stop point',
          );
          const name = orderedNames[handleReadCount - 1];
          const entry = name === undefined ? null : dirents.get(name);
          if (entry !== null) onRead({ entry, name, readCount: handleReadCount });
          return entry;
        },
      };
    };

    return {
      observation,
      restore() {
        fs.opendirSync = originalOpendirSync;
        fs.readdirSync = originalReaddirSync;
      },
    };
  }

  await t.test('ordinary .gitkeep and one Change are read without materialization', () => {
    const current = fixture([
      { name: '.gitkeep', type: 'file' },
      { name: 'only', type: 'directory', intent: true },
    ]);
    const stream = deterministicStream(current, ['.gitkeep', 'only'], 3);
    try {
      assert.deepEqual(
        activeChangeIntents(current.ultraRoot),
        [path.join(current.activeRoot, 'only', 'intent.md')],
      );
      assert.deepEqual(stream.observation, { closeCount: 2, readCount: 6 });
    } finally {
      stream.restore();
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  await t.test('empty active root remains valid', () => {
    const current = fixture([]);
    const stream = deterministicStream(current, [], 1);
    try {
      assert.deepEqual(activeChangeIntents(current.ultraRoot), []);
      assert.deepEqual(stream.observation, { closeCount: 2, readCount: 2 });
    } finally {
      stream.restore();
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  await t.test('marker-only active root remains valid', () => {
    const current = fixture([{ name: '.gitkeep', type: 'file' }]);
    const stream = deterministicStream(current, ['.gitkeep'], 2);
    try {
      assert.deepEqual(activeChangeIntents(current.ultraRoot), []);
      assert.deepEqual(stream.observation, { closeCount: 2, readCount: 4 });
    } finally {
      stream.restore();
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  await t.test('entry-set insertion after first EOF is rejected by bounded replay', () => {
    const current = fixture([{ name: 'first', type: 'directory', intent: true }]);
    const originalOpendirSync = fs.opendirSync;
    let closeCount = 0;
    let inserted = false;
    fs.opendirSync = function insertAfterFirstEof(target, ...args) {
      const directory = Reflect.apply(originalOpendirSync, fs, [target, ...args]);
      if (path.resolve(target) !== current.activeRoot) return directory;
      return {
        closeSync() {
          closeCount += 1;
          directory.closeSync();
        },
        readSync() {
          const entry = directory.readSync();
          if (entry === null && !inserted) {
            inserted = true;
            const late = path.join(current.activeRoot, 'late');
            fs.mkdirSync(late);
            fs.writeFileSync(path.join(late, 'intent.md'), '# Late Change\n');
          }
          return entry;
        },
      };
    };
    try {
      assert.throws(
        () => activeChangeIntents(current.ultraRoot),
        /at most one active Change directory|active Change root entry set changed during audit/u,
      );
      assert.equal(inserted, true);
      assert.equal(closeCount, 2, 'both bounded directory observations must close');
    } finally {
      fs.opendirSync = originalOpendirSync;
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  await t.test('cached regular Dirent cannot hide .gitkeep symlink replacement', () => {
    const current = fixture([{ name: '.gitkeep', type: 'file' }]);
    const marker = path.join(current.activeRoot, '.gitkeep');
    const originalMarker = path.join(current.root, 'original-marker');
    let replaced = false;
    const stream = deterministicStream(current, ['.gitkeep'], 2, ({ name }) => {
      if (name !== '.gitkeep' || replaced) return;
      replaced = true;
      fs.renameSync(marker, originalMarker);
      fs.symlinkSync(originalMarker, marker);
    });
    try {
      assert.throws(
        () => activeChangeIntents(current.ultraRoot),
        (error) => {
          assert.equal(error.code, 'ERR_ASSERTION');
          assert.match(
            error.message,
            /active Change \.gitkeep marker must be an ordinary non-symlink file/u,
          );
          return true;
        },
      );
      assert.deepEqual(stream.observation, { closeCount: 1, readCount: 1 });
    } finally {
      stream.restore();
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  await t.test('ordinary .gitkeep identity drift after classification is rejected', () => {
    const current = fixture([{ name: '.gitkeep', type: 'file' }]);
    const marker = path.join(current.activeRoot, '.gitkeep');
    const stream = deterministicStream(current, ['.gitkeep'], 2);
    const originalLstatSync = fs.lstatSync;
    let markerSnapshots = 0;
    fs.lstatSync = function mutateAfterMarkerSnapshot(target, ...args) {
      const stat = Reflect.apply(originalLstatSync, fs, [target, ...args]);
      if (path.resolve(target) === marker && markerSnapshots === 0) {
        markerSnapshots += 1;
        fs.writeFileSync(marker, 'marker identity changed after classification\n');
      }
      return stat;
    };
    try {
      assert.throws(
        () => activeChangeIntents(current.ultraRoot),
        (error) => {
          assert.equal(error.code, 'ERR_ASSERTION');
          assert.match(
            error.message,
            /active Change \.gitkeep marker identity changed during audit/u,
          );
          return true;
        },
      );
      assert.equal(markerSnapshots, 1);
      assert.deepEqual(stream.observation, { closeCount: 1, readCount: 2 });
    } finally {
      fs.lstatSync = originalLstatSync;
      stream.restore();
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  await t.test('the second non-placeholder Change stops the scan', () => {
    const current = fixture([
      { name: 'first', type: 'directory', intent: true },
      { name: 'second', type: 'directory', intent: true },
      { name: 'later-malformed', type: 'file' },
    ]);
    const stream = deterministicStream(current, ['first', 'second', 'later-malformed'], 2);
    try {
      assert.throws(
        () => activeChangeIntents(current.ultraRoot),
        (error) => {
          assert.equal(error.code, 'ERR_ASSERTION');
          assert.match(
            error.message,
            /at most one active Change directory; move every other candidate to archive or abandoned after owner disposition, then rerun the audit/u,
          );
          return true;
        },
      );
      assert.deepEqual(stream.observation, { closeCount: 1, readCount: 2 });
    } finally {
      stream.restore();
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  await t.test('a malformed .gitkeep stops before a later candidate', () => {
    const current = fixture([
      { name: '.gitkeep', type: 'directory' },
      { name: 'later', type: 'directory', intent: true },
    ]);
    const stream = deterministicStream(current, ['.gitkeep', 'later'], 1);
    try {
      assert.throws(
        () => activeChangeIntents(current.ultraRoot),
        (error) => {
          assert.equal(error.code, 'ERR_ASSERTION');
          assert.match(
            error.message,
            /\.gitkeep must be an ordinary regular file; replace or remove the marker, then rerun the audit/u,
          );
          return true;
        },
      );
      assert.deepEqual(stream.observation, { closeCount: 1, readCount: 1 });
    } finally {
      stream.restore();
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });

  await t.test('a ceiling plus one mutation fails at the physical boundary', () => {
    const current = fixture([
      { name: '.gitkeep', type: 'file' },
      { name: 'first', type: 'directory', intent: true },
    ]);
    fs.mkdirSync(path.join(current.activeRoot, 'ceiling-plus-one'));
    fs.writeFileSync(
      path.join(current.activeRoot, 'ceiling-plus-one', 'intent.md'),
      '# Extra Change\n',
    );
    const stream = deterministicStream(
      current,
      ['.gitkeep', 'first', 'ceiling-plus-one'],
      MAX_ACTIVE_CHANGE_ROOT_ENTRIES + 1,
    );
    try {
      assert.throws(
        () => activeChangeIntents(current.ultraRoot),
        (error) => {
          assert.equal(error.code, 'ERR_ASSERTION');
          assert.match(
            error.message,
            /active Change root exceeds the physical entry ceiling of 2; keep only one active Change directory and an optional regular \.gitkeep, then rerun the audit/u,
          );
          return true;
        },
      );
      assert.deepEqual(stream.observation, { closeCount: 1, readCount: 3 });
    } finally {
      stream.restore();
      fs.rmSync(current.root, { recursive: true, force: true });
    }
  });
});

test('active Change identity is rejected before stored intent fallback', async (t) => {
  function fixture(storedState) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'u-'));
    const ultraRoot = path.join(root, '.ultra');
    const changeId = 'c';
    const activePath = path.join(ultraRoot, 'changes', 'active', changeId);
    fs.mkdirSync(path.dirname(activePath), { recursive: true });
    fs.mkdirSync(path.join(ultraRoot, 'changes', 'archive'), { recursive: true });
    fs.mkdirSync(path.join(ultraRoot, 'changes', 'abandoned'), { recursive: true });
    if (storedState) {
      fs.mkdirSync(path.join(ultraRoot, 'changes', storedState, changeId));
      fs.writeFileSync(
        path.join(ultraRoot, 'changes', storedState, changeId, 'intent.md'),
        '# Stored Change\n',
      );
    }
    return { root, ultraRoot, changeId, activePath };
  }

  async function rejects(
    label,
    storedState,
    createEntry,
    pattern = /active Change root entries must be directories/u,
  ) {
    await t.test(label, async () => {
      const current = fixture(storedState);
      let dispose;
      try {
        dispose = await createEntry(current);
        assert.throws(
          () => changeIntent(current.changeId, current.ultraRoot),
          pattern,
        );
      } finally {
        if (dispose) await dispose();
        fs.rmSync(current.root, { recursive: true, force: true });
      }
    });
  }

  function replaceDirectoryWithSpecial(target, kind) {
    fs.rmSync(target, { recursive: true });
    if (kind === 'FIFO') {
      execFileSync('mkfifo', [target]);
      return undefined;
    }
    return listenUnixSocket(target);
  }

  await rejects('regular file cannot fall back to archive', 'archive', ({ activePath }) => {
    fs.writeFileSync(activePath, 'not a directory\n');
  });
  await rejects('symlink cannot fall back to abandoned', 'abandoned', ({ root, activePath }) => {
    const target = path.join(root, 'target');
    fs.mkdirSync(target);
    fs.symlinkSync(target, activePath);
  });
  await rejects('FIFO cannot appear absent', null, ({ activePath }) => {
    execFileSync('mkfifo', [activePath]);
  });
  await rejects('AF_UNIX socket cannot fall back to archive', 'archive', ({ activePath }) => (
    listenUnixSocket(activePath)
  ));
  await rejects('symlinked active root cannot select external intent', null, ({ root, activePath }) => {
    const activeRoot = path.dirname(activePath);
    const outside = path.join(root, 'outside-active');
    fs.rmSync(activeRoot, { recursive: true });
    fs.mkdirSync(path.join(outside, 'c'), { recursive: true });
    fs.writeFileSync(path.join(outside, 'c', 'intent.md'), '# External Change\n');
    fs.symlinkSync(outside, activeRoot);
  }, /active Change root must be an ordinary non-symlink directory/u);
  await rejects('symlinked changes ancestor cannot select external intent', null, ({ root, activePath }) => {
    const changesRoot = path.dirname(path.dirname(activePath));
    const outside = path.join(root, 'outside-changes');
    fs.rmSync(changesRoot, { recursive: true });
    fs.mkdirSync(path.join(outside, 'active', 'c'), { recursive: true });
    fs.writeFileSync(path.join(outside, 'active', 'c', 'intent.md'), '# External Change\n');
    fs.mkdirSync(path.join(outside, 'archive'));
    fs.mkdirSync(path.join(outside, 'abandoned'));
    fs.symlinkSync(outside, changesRoot);
  }, /active Change changes ancestor must be an ordinary non-symlink directory/u);
  await rejects('symlinked .ultra ancestor cannot select external intent', null, ({ root, ultraRoot }) => {
    const outside = path.join(root, 'outside-ultra');
    fs.rmSync(ultraRoot, { recursive: true });
    fs.mkdirSync(path.join(outside, 'changes', 'active', 'c'), { recursive: true });
    fs.writeFileSync(
      path.join(outside, 'changes', 'active', 'c', 'intent.md'),
      '# External Change\n',
    );
    fs.mkdirSync(path.join(outside, 'changes', 'archive'));
    fs.mkdirSync(path.join(outside, 'changes', 'abandoned'));
    fs.symlinkSync(outside, ultraRoot);
  }, /active Change \.ultra ancestor must be an ordinary non-symlink directory/u);
  for (const kind of ['FIFO', 'AF_UNIX socket']) {
    await rejects(`${kind} active root cannot fall back to archive`, 'archive', ({ activePath }) => (
      replaceDirectoryWithSpecial(path.dirname(activePath), kind)
    ), /active Change root must be an ordinary non-symlink directory/u);
    await rejects(`${kind} changes ancestor is rejected before lookup`, null, ({ activePath }) => (
      replaceDirectoryWithSpecial(path.dirname(path.dirname(activePath)), kind)
    ), /active Change changes ancestor must be an ordinary non-symlink directory/u);
    await rejects(`${kind} .ultra ancestor is rejected before lookup`, null, ({ ultraRoot }) => (
      replaceDirectoryWithSpecial(ultraRoot, kind)
    ), /active Change \.ultra ancestor must be an ordinary non-symlink directory/u);
  }
  await rejects('symlinked intent cannot select external bytes', null, ({ root, activePath }) => {
    const outside = path.join(root, 'outside-intent.md');
    fs.mkdirSync(activePath);
    fs.writeFileSync(outside, '# External Change\n');
    fs.symlinkSync(outside, path.join(activePath, 'intent.md'));
  }, /active Change intent must be an ordinary non-symlink file/u);
  await rejects('FIFO intent cannot fall back to archive', 'archive', ({ activePath }) => {
    fs.mkdirSync(activePath);
    execFileSync('mkfifo', [path.join(activePath, 'intent.md')]);
  }, /active Change intent must be an ordinary non-symlink file/u);
  await rejects('AF_UNIX socket intent cannot fall back to abandoned', 'abandoned', ({ activePath }) => {
    fs.mkdirSync(activePath);
    return listenUnixSocket(path.join(activePath, 'intent.md'));
  }, /active Change intent must be an ordinary non-symlink file/u);
});

test('stored Change identity is rejected before intent consumption', async (t) => {
  function fixture(state) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'u-stored-'));
    const ultraRoot = path.join(root, '.ultra');
    const changeId = 'c';
    const changesRoot = path.join(ultraRoot, 'changes');
    const stateRoot = path.join(changesRoot, state);
    const changeDirectory = path.join(stateRoot, changeId);
    const intent = path.join(changeDirectory, 'intent.md');
    fs.mkdirSync(path.join(changesRoot, 'active'), { recursive: true });
    fs.mkdirSync(path.join(changesRoot, 'archive'));
    fs.mkdirSync(path.join(changesRoot, 'abandoned'));
    fs.mkdirSync(changeDirectory);
    fs.writeFileSync(intent, '# Stored Change\n');
    return {
      root,
      ultraRoot,
      changeId,
      stateRoot,
      changeDirectory,
      intent,
    };
  }

  async function replaceWithSpecial(current, component, kind) {
    const target = current[component];
    fs.rmSync(target, { recursive: true, force: true });
    if (kind === 'FIFO') {
      execFileSync('mkfifo', [target]);
      return undefined;
    }
    if (kind === 'AF_UNIX socket') return listenUnixSocket(target);

    const outside = path.join(current.root, `outside-${component}`);
    if (component === 'intent') {
      fs.writeFileSync(outside, 'EXTERNAL-STORED-INTENT\n');
    } else if (component === 'changeDirectory') {
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, 'intent.md'), 'EXTERNAL-STORED-INTENT\n');
    } else {
      fs.mkdirSync(path.join(outside, current.changeId), { recursive: true });
      fs.writeFileSync(
        path.join(outside, current.changeId, 'intent.md'),
        'EXTERNAL-STORED-INTENT\n',
      );
    }
    fs.symlinkSync(outside, target);
    return undefined;
  }

  for (const state of ['archive', 'abandoned']) {
    for (const [component, expectedKind] of [
      ['stateRoot', 'directory'],
      ['changeDirectory', 'directory'],
      ['intent', 'file'],
    ]) {
      for (const kind of ['symlink', 'FIFO', 'AF_UNIX socket']) {
        await t.test(`${state} ${component} ${kind}`, async () => {
          const current = fixture(state);
          const originalOpenSync = fs.openSync;
          let openCount = 0;
          let dispose;
          try {
            dispose = await replaceWithSpecial(current, component, kind);
            fs.openSync = function countUnexpectedOpen(...args) {
              openCount += 1;
              return originalOpenSync(...args);
            };
            assert.throws(
              () => changeIntent(current.changeId, current.ultraRoot),
              new RegExp(
                `${state}.*stored Change.*must be an ordinary non-symlink ${expectedKind}`,
                'u',
              ),
            );
            assert.equal(openCount, 0, 'special stored entries must fail before file open');
          } finally {
            fs.openSync = originalOpenSync;
            if (dispose) await dispose();
            fs.rmSync(current.root, { recursive: true, force: true });
          }
        });
      }
    }

    await t.test(`${state} intent is bounded`, () => {
      const current = fixture(state);
      try {
        fs.writeFileSync(current.intent, Buffer.alloc(MAX_CHANGE_INTENT_BYTES + 1));
        assert.throws(
          () => changeIntent(current.changeId, current.ultraRoot),
          new RegExp(`${state}.*stored Change intent.*must not exceed`, 'u'),
        );
      } finally {
        fs.rmSync(current.root, { recursive: true, force: true });
      }
    });

    await t.test(`${state} intent replacement invalidates the snapshot`, () => {
      const current = fixture(state);
      const originalOpenSync = fs.openSync;
      let replaced = false;
      try {
        fs.openSync = function openAndReplace(file, ...args) {
          const descriptor = originalOpenSync(file, ...args);
          if (!replaced && file === current.intent) {
            replaced = true;
            fs.renameSync(current.intent, `${current.intent}.original`);
            fs.writeFileSync(current.intent, 'REPLACEMENT-STORED-INTENT\n');
          }
          return descriptor;
        };
        assert.throws(
          () => changeIntent(current.changeId, current.ultraRoot),
          /stored Change intent identity changed during audit/u,
        );
      } finally {
        fs.openSync = originalOpenSync;
        fs.rmSync(current.root, { recursive: true, force: true });
      }
    });
  }
});

function plannedPathInventory(root, task) {
  const contextPath = path.join(root, task.context_file);
  const source = fs.readFileSync(contextPath, 'utf8');
  const heading = '## Planned Path Inventory\n';
  const start = source.indexOf(heading);
  assert.notEqual(start, -1, `${task.context_file}: missing Planned Path Inventory`);
  const remainder = source.slice(start + heading.length);
  const nextHeading = remainder.match(/\n## /u);
  const section = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  return new Set(
    [...section.matchAll(/^- `([^`\n]+)`$/gmu)].map((match) => match[1]),
  );
}

function projectPlannedPathInventory(root, tasks) {
  const inventory = new Set();
  for (const task of tasks) {
    const contextPath = path.join(root, task.context_file);
    const source = fs.readFileSync(contextPath, 'utf8');
    if (!source.includes('## Planned Path Inventory\n')) continue;
    for (const relative of plannedPathInventory(root, task)) inventory.add(relative);
  }
  return inventory;
}

function auditEvidenceDirectories(root, tasks) {
  const evidenceRoot = path.join(root, '.ultra', 'evidence');
  const directoryChain = snapshotOrdinaryDirectoryChain([
    { file: path.join(root, '.ultra'), label: 'canonical evidence .ultra ancestor' },
    { file: evidenceRoot, label: 'canonical evidence root' },
  ]);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const inventory = projectPlannedPathInventory(root, tasks);
  const canonicalTaskIds = [];

  for (const directoryEntry of fs.readdirSync(evidenceRoot, { withFileTypes: true })) {
    const directoryRelative = `.ultra/evidence/${directoryEntry.name}`;
    assert.equal(
      directoryEntry.isDirectory(),
      true,
      `${directoryRelative}: evidence root entries must be directories`,
    );
    const task = byId.get(directoryEntry.name);
    assert.ok(task, `${directoryRelative}: orphan evidence directory`);

    const directory = path.join(evidenceRoot, directoryEntry.name);
    const directoryIdentity = ordinaryDirectoryIdentity(
      directory,
      `${directoryRelative}: task evidence directory`,
    );
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const evidenceEntry = entries.find((entry) => entry.name === 'evidence.json');
    const rawEntries = entries.filter((entry) => entry.name !== 'evidence.json');
    let evidenceIdentity;
    if (evidenceEntry) {
      assert.equal(
        evidenceEntry.isFile(),
        true,
        `${directoryRelative}/evidence.json: canonical final evidence must be a regular file`,
      );
      evidenceIdentity = ordinaryFileIdentity(
        path.join(directory, 'evidence.json'),
        `${directoryRelative}/evidence.json: canonical final evidence`,
      );
      canonicalTaskIds.push(task.id);
    } else {
      assert.equal(
        task.status,
        'in_progress',
        `${directoryRelative}: raw-only evidence requires an in_progress task`,
      );
      assert.ok(
        rawEntries.length > 0,
        `${directoryRelative}: raw-only evidence must contain at least one regular file`,
      );
    }

    for (const entry of rawEntries) {
      const relative = `${directoryRelative}/${entry.name}`;
      assert.equal(
        entry.isFile(),
        true,
        `${relative}: raw evidence entries must be ordinary regular files`,
      );
      const rawPath = path.join(directory, entry.name);
      const rawIdentity = ordinaryFileIdentity(rawPath, `${relative}: raw evidence entry`);
      assert.ok(
        inventory.has(relative),
        `${relative}: not an exact Planned Path Inventory entry`,
      );
      assert.deepEqual(
        ordinaryFileIdentity(rawPath, `${relative}: raw evidence entry`),
        rawIdentity,
        `${relative}: raw evidence identity changed during audit`,
      );
    }
    if (evidenceIdentity) {
      assert.deepEqual(
        ordinaryFileIdentity(
          path.join(directory, 'evidence.json'),
          `${directoryRelative}/evidence.json: canonical final evidence`,
        ),
        evidenceIdentity,
        `${directoryRelative}/evidence.json: identity changed during audit`,
      );
    }
    assert.deepEqual(
      ordinaryDirectoryIdentity(directory, `${directoryRelative}: task evidence directory`),
      directoryIdentity,
      `${directoryRelative}: task evidence directory identity changed during audit`,
    );
  }

  assertOrdinaryDirectoryChainUnchanged(directoryChain);
  canonicalTaskIds.sort();
  const completedTaskIds = tasks
    .filter((task) => task.status === 'completed')
    .map((task) => task.id)
    .sort();
  assert.deepEqual(
    canonicalTaskIds,
    completedTaskIds,
    'canonical final evidence task ids must exactly match completed task ids',
  );
  return canonicalTaskIds;
}

test('this repository uses the canonical file-first project layout', () => {
  for (const relative of [
    'project-brief.md',
    'north-star.md',
    'tasks.json',
    'test-report.json',
    'specs/product.md',
    'specs/architecture.md',
    'specs/discovery.md',
    'specs/research-distillate.md',
  ]) {
    assert.ok(fs.existsSync(path.join(ULTRA, relative)), relative);
  }
  const brief = fs.readFileSync(path.join(ULTRA, 'project-brief.md'), 'utf8');
  assert.match(brief, /^## One-line$/m);
  assert.match(brief, /^## Open Questions for Research$/m);
  const northStar = fs.readFileSync(path.join(ULTRA, 'north-star.md'), 'utf8');
  assert.match(northStar, /^## Acceptance and Revision$/m);
  assert.match(northStar, /^## First-Principle Propositions$/m);
  assert.match(northStar, /^## North Star Outcomes$/m);
  assert.match(northStar, /^## Uncertainties and Revisit Triggers$/m);
  assert.match(northStar, /^## Research Trace$/m);
  assert.doesNotMatch(northStar, /^## One-line$/m);
  const validation = JSON.parse(execFileSync(process.execPath, [
    path.join(ROOT, 'skills', 'ultra-research', 'scripts', 'validate_north_star.cjs'),
    path.join(ULTRA, 'north-star.md'),
  ], { cwd: ROOT, encoding: 'utf8' }));
  assert.equal(validation.valid, true);
  assert.equal(validation.status, 'accepted');
  assert.ok(fs.existsSync(path.join(ROOT, 'CONTEXT.md')));
  const context = fs.readFileSync(path.join(ROOT, 'CONTEXT.md'), 'utf8');
  for (const heading of ['Language', 'Relationships', 'Flagged ambiguities']) {
    assert.match(context, new RegExp(`^## ${heading}$`, 'm'), heading);
  }
  assert.equal(
    fs.readFileSync(path.join(ULTRA, '.gitignore'), 'utf8'),
    '.runtime/\nprogress/\nreviews/\n',
  );
  for (const directory of ['changes/active', 'changes/archive', 'changes/abandoned', 'contexts', 'decisions', 'evidence', 'research']) {
    assert.ok(fs.statSync(path.join(ULTRA, directory)).isDirectory(), directory);
  }
  for (const retired of ['tasks', 'reports/templates', 'docs/research', '.runtime/state.db']) {
    assert.equal(fs.existsSync(path.join(ULTRA, retired)), false, retired);
  }
  for (const file of [
    path.join(ULTRA, 'specs', 'product.md'),
    path.join(ULTRA, 'specs', 'architecture.md'),
    path.join(ULTRA, 'specs', 'discovery.md'),
    path.join(ULTRA, 'specs', 'research-distillate.md'),
  ]) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /source:\s*\.ultra\/\.runtime\/state\.db|Gap ids? from `?\.ultra\/\.runtime\/state\.db/i);
  }

  const distillate = fs.readFileSync(path.join(ULTRA, 'specs', 'research-distillate.md'), 'utf8');
  const sourceRevisions = [...distillate.matchAll(
    /^\| `(\.ultra\/specs\/(?:product|architecture|discovery)\.md)` \| `([0-9a-f]{40})` \|/gmu,
  )];
  assert.equal(sourceRevisions.length, 3, 'distillate must bind all three baseline specifications');
  for (const [, relative, expected] of sourceRevisions) {
    const actual = execFileSync('git', ['hash-object', relative], { cwd: ROOT, encoding: 'utf8' }).trim();
    assert.equal(expected, actual, `${relative}: stale distillate hash`);
  }
});

test('task ledger, contexts, dependencies, traces, and active Change cross-resolve', () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(ULTRA, 'tasks.json'), 'utf8'));
  const northStar = fs.readFileSync(path.join(ULTRA, 'north-star.md'), 'utf8');
  const northStarIds = new Set(
    [...northStar.matchAll(/^### ((?:FP|NS|HC)-\d+)\b/gmu)].map((match) => match[1]),
  );
  assert.deepEqual(Object.keys(ledger), ['$schema', 'tasks']);
  assert.equal(ledger.$schema, 'ultra-task-ledger-v2');
  assert.ok(Array.isArray(ledger.tasks) && ledger.tasks.length > 0);

  const ids = new Set(ledger.tasks.map((task) => task.id));
  assert.equal(ids.size, ledger.tasks.length, 'task ids must be unique');
  const byId = new Map(ledger.tasks.map((task) => [task.id, task]));
  const contextPaths = [];
  for (const task of ledger.tasks) {
    const legacy = task.id.startsWith('v026-');
    assert.deepEqual(
      Object.keys(task).sort(),
      (legacy ? [
        'change_id', 'complexity', 'context_file', 'dependencies', 'id', 'priority',
        'status', 'title', 'trace_to', 'type',
      ] : [
        'change_id', 'context_file', 'dependencies', 'id', 'priority',
        'status', 'title', 'trace_to', 'type',
      ]).sort(),
      task.id,
    );
    assert.match(task.change_id, /^[A-Za-z0-9][A-Za-z0-9._-]*$/, `${task.id}: invalid change_id`);
    assert.ok(['pending', 'in_progress', 'completed'].includes(task.status), task.id);
    if (legacy) assert.ok(Number.isInteger(task.complexity), `${task.id}: readable legacy complexity`);
    for (const dependency of task.dependencies) {
      assert.ok(ids.has(dependency), `${task.id}: ${dependency}`);
      assert.equal(
        byId.get(dependency).change_id,
        task.change_id,
        `${task.id}: dependency ${dependency} crosses a Change boundary`,
      );
    }

    const context = path.join(ROOT, task.context_file);
    contextPaths.push(path.resolve(context));
    assert.ok(fs.existsSync(context), `${task.id}: missing context`);
    const contextSource = fs.readFileSync(context, 'utf8');
    if (legacy) {
      assert.equal(contextStatus(context), task.status, `${task.id}: legacy status observation mismatch`);
    } else {
      assert.doesNotMatch(contextSource, /^> \*\*(?:Status|Priority|Complexity)\*\*/m, task.id);
      assert.match(
        contextSource,
        /^\| ID \| Criterion \| Verification type \| Required evidence \|$/m,
        task.id,
      );
      const trace = contextSource.match(/^## Trace\n([\s\S]*?)(?=^## Change Log$)/m);
      assert.ok(trace, `${task.id}: missing v2 Trace body`);
      for (const field of ['First principles', 'Serves', 'Causal contribution', 'Hard constraints']) {
        assert.match(trace[1], new RegExp(`^\\*\\*${field}\\*\\*:\\s+\\S`, 'mu'), `${task.id}: ${field}`);
      }
      const traceIds = [...trace[1].matchAll(/`((?:FP|NS|HC)-\d+)`/gu)].map((match) => match[1]);
      assert.ok(traceIds.some((id) => id.startsWith('FP-')), `${task.id}: no FP trace`);
      assert.ok(traceIds.some((id) => id.startsWith('NS-')), `${task.id}: no NS trace`);
      for (const id of traceIds) assert.ok(northStarIds.has(id), `${task.id}: unresolved ${id}`);
      const taskReview = contextSource.match(/^## Task Review\n([\s\S]*)$/m);
      assert.ok(taskReview, `${task.id}: missing Task Review body`);
      assert.match(taskReview[1], /Execution (?:Packet|Grant)[^\n]*(?:state|limitation)/iu, `${task.id}: grant state`);
      assert.match(taskReview[1], /Review session[^\n]*summary digest|Summary (?:ref|digest)/iu, `${task.id}: review summary binding`);
      assert.match(taskReview[1], /Blocking finding/iu, `${task.id}: blocking findings`);
      assert.match(taskReview[1], /Retention/iu, `${task.id}: review retention`);
      if (task.id === 'v027-host-adapters-hooks') {
        assert.match(contextSource, /pytest -q hooks\/tests\/test_v026_hooks\.py/u);
        assert.doesNotMatch(contextSource, /unittest discover/u);
      }
    }
    assert.match(contextSource, /^## Resume Note$/m, `${task.id}: missing Resume Note`);
    assert.ok(changeIntent(task.change_id).path, `${task.id}: missing Change`);

    const [tracePath, anchor] = task.trace_to.split('#');
    const traceFile = path.join(ROOT, tracePath);
    assert.ok(fs.existsSync(traceFile), `${task.id}: missing trace file`);
    assert.ok(anchor && headingAnchors(traceFile).has(anchor), `${task.id}: missing trace anchor ${anchor}`);
  }

  const currentContexts = fs.readdirSync(path.join(ULTRA, 'contexts'))
    .filter((name) => name.startsWith('task-') && name.endsWith('.md'))
    .map((name) => path.resolve(path.join(ULTRA, 'contexts', name)))
    .sort();
  assert.deepEqual([...new Set(contextPaths)].sort(), currentContexts, 'orphan or missing task context');

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    assert.equal(visiting.has(id), false, `task dependency cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids) visit(id);

  const active = activeChangeIntents();
  assert.ok(active.length <= 1, 'at most one active Change may exist');
  const changeIds = [...new Set(ledger.tasks.map((task) => task.change_id))];
  for (const changeId of changeIds) {
    const intentSnapshot = changeIntent(changeId);
    const intentPath = intentSnapshot.path;
    const state = path.basename(path.dirname(path.dirname(intentPath)));
    const changeTasks = ledger.tasks.filter((task) => task.change_id === changeId);
    if (state === 'archive') {
      assert.ok(changeTasks.every((task) => task.status === 'completed'), `${changeId}: archived with unfinished tasks`);
      assert.ok(fs.existsSync(path.join(path.dirname(intentPath), 'delivery.md')));
    }
    const intent = intentSnapshot.bytes.toString('utf8');
    if (state === 'abandoned') assert.match(intent, /^## Abandonment$/m, `${changeId}: Abandonment`);
    for (const heading of [
      'Outcome', 'Acceptance', 'Non-goals', 'Public Seams', 'Reconciliation',
      'Research Disposition', 'Planning Posture', 'Recovery', 'Unresolved Decisions',
    ]) {
      assert.match(intent, new RegExp(`^## ${heading}$`, 'm'), `${changeId}: ${heading}`);
    }
    if (state === 'active') {
      assert.deepEqual(
        [...intent.matchAll(/^## ([^#].*)$/gm)].map((match) => match[1]),
        [
          'Outcome', 'Acceptance', 'Non-goals', 'Public Seams', 'Reconciliation',
          'Research Disposition', 'North Star Trace', 'Execution Grant',
          'Planning Posture', 'Recovery', 'Unresolved Decisions',
        ],
        `${changeId}: exact Change heading order`,
      );
      const reconciliation = intent.match(
        /^## Reconciliation\n([\s\S]*?)^## Research Disposition$/m,
      );
      assert.ok(reconciliation, `${changeId}: Reconciliation boundary`);
      assert.deepEqual(
        [...reconciliation[1].matchAll(/^### ([^#].*)$/gm)].map((match) => match[1]),
        ['Promised and Missing', 'Built and Unpromised', 'Contradictory'],
        `${changeId}: exact Reconciliation buckets`,
      );
      assert.match(intent, /^## Execution Grant$/m, `${changeId}: Execution Grant`);
      for (const field of [
        'Grant', 'Allowed workflows', 'Agent topology', 'Allowed local effects',
        'Budgets and expiry', 'Mandatory reviews', 'Stop conditions',
        'Invalidation', 'Never granted', 'Activation',
      ]) {
        assert.match(intent, new RegExp(`^- ${field}:\\s+\\S`, 'm'), `${changeId}: ${field}`);
      }
      assert.match(
        intent,
        /^- Grant: (?:`session-local`|`durable work-package`)/m,
        `${changeId}: grant names an accepted mode`,
      );
      assert.match(
        intent,
        /(?:stored grant text alone is inactive|stored text alone is inactive|inert without current-session activation)/iu,
        `${changeId}: inactive stored activation`,
      );
    }
  }
});

test('retired custom-agent methods have explicit portable Skill homes', () => {
  const architecture = fs.readFileSync(path.join(ULTRA, 'specs', 'architecture.md'), 'utf8');
  const mappings = {
    'review-code': 'skills/ultra-review/references/code.md',
    'review-design': 'skills/ultra-review/references/design.md',
    'review-errors': 'skills/ultra-review/references/errors.md',
    'review-tests': 'skills/ultra-review/references/tests.md',
    'review-spec': 'skills/ultra-review/references/spec.md',
    'review-comments': 'skills/ultra-review/references/comments.md',
    debugger: 'skills/ultra-dev/references/debugging.md',
    'tdd-runner': 'skills/ultra-tdd/references/test-execution.md',
  };
  for (const [retired, current] of Object.entries(mappings)) {
    assert.match(architecture, new RegExp(`\\b${retired}\\b`), retired);
    assert.ok(fs.existsSync(path.join(ROOT, current)), current);
  }
  assert.match(architecture, /review-coordinator/);
  assert.match(architecture, /code-reviewer/);
  assert.equal(fs.existsSync(path.join(ROOT, 'agents')), false);
});

test('artifact audit distinguishes final evidence from planned in-progress raw receipts', {
  timeout: 5000,
}, async (t) => {
  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'u-'));
    const evidenceRoot = path.join(root, '.ultra', 'evidence');
    const contextsRoot = path.join(root, '.ultra', 'contexts');
    fs.mkdirSync(path.join(evidenceRoot, 'done'), { recursive: true });
    fs.mkdirSync(path.join(evidenceRoot, 'work'), { recursive: true });
    fs.mkdirSync(contextsRoot, { recursive: true });
    fs.writeFileSync(path.join(evidenceRoot, 'done', 'evidence.json'), '{}\n');
    fs.writeFileSync(path.join(evidenceRoot, 'done', 'raw.log'), 'final task output\n');
    fs.writeFileSync(path.join(evidenceRoot, 'work', 'raw.log'), 'real output\n');
    fs.writeFileSync(
      path.join(contextsRoot, 'task-done.md'),
      '# Task\n\n## Planned Path Inventory\n\n`CREATE`:\n\n'
        + '- `.ultra/evidence/done/raw.log`\n\n## Public Seams\n',
    );
    fs.writeFileSync(
      path.join(contextsRoot, 'task-work.md'),
      '# Task\n\n## Planned Path Inventory\n\n`CREATE`:\n\n'
        + '- `.ultra/evidence/work/raw.log`\n\n## Public Seams\n',
    );
    const tasks = [
      {
        id: 'done',
        status: 'completed',
        context_file: '.ultra/contexts/task-done.md',
      },
      {
        id: 'work',
        status: 'in_progress',
        context_file: '.ultra/contexts/task-work.md',
      },
    ];
    return { root, evidenceRoot, tasks };
  }

  async function rejects(label, mutate, pattern) {
    await t.test(label, async () => {
      const current = fixture();
      let dispose;
      try {
        dispose = await mutate(current);
        assert.throws(
          () => auditEvidenceDirectories(current.root, current.tasks),
          pattern,
        );
      } finally {
        if (dispose) await dispose();
        fs.rmSync(current.root, { recursive: true, force: true });
      }
    });
  }

  function createSpecial(current, target, kind, symlinkTargetType) {
    if (kind === 'symlink') {
      const symlinkTarget = path.join(current.root, `target-${path.basename(target)}`);
      if (symlinkTargetType === 'directory') {
        fs.mkdirSync(symlinkTarget);
      } else {
        fs.writeFileSync(symlinkTarget, 'target bytes\n');
      }
      fs.symlinkSync(symlinkTarget, target);
      return undefined;
    }
    if (kind === 'FIFO') {
      execFileSync('mkfifo', [target]);
      return undefined;
    }
    return listenUnixSocket(target);
  }

  await t.test('planned ordinary completed-task raw receipt', () => {
    const accepted = fixture();
    try {
      assert.deepEqual(auditEvidenceDirectories(accepted.root, accepted.tasks), [
        'done',
      ]);
    } finally {
      fs.rmSync(accepted.root, { recursive: true, force: true });
    }
  });

  await rejects('pending raw-only task', ({ tasks }) => {
    tasks[1].status = 'pending';
  }, /raw-only evidence requires an in_progress task/u);
  await rejects('unknown raw-only task status', ({ tasks }) => {
    tasks[1].status = 'unknown';
  }, /raw-only evidence requires an in_progress task/u);
  await rejects('orphan evidence directory', ({ tasks }) => {
    tasks.pop();
  }, /orphan evidence directory/u);
  await rejects('unplanned raw receipt', ({ evidenceRoot }) => {
    fs.renameSync(
      path.join(evidenceRoot, 'work', 'raw.log'),
      path.join(evidenceRoot, 'work', 'unplanned.log'),
    );
  }, /not an exact Planned Path Inventory entry/u);
  await rejects('final evidence for an in-progress task', ({ evidenceRoot }) => {
    fs.writeFileSync(path.join(evidenceRoot, 'work', 'evidence.json'), '{}\n');
  }, /canonical final evidence task ids/u);
  await rejects('nested raw evidence directory', ({ evidenceRoot }) => {
    fs.mkdirSync(path.join(evidenceRoot, 'work', 'nested'));
  }, /raw evidence entries must be ordinary regular files/u);
  await rejects('symlinked canonical evidence root', (current) => {
    const outside = path.join(current.root, 'outside-evidence');
    fs.rmSync(current.evidenceRoot, { recursive: true });
    fs.mkdirSync(path.join(outside, 'done'), { recursive: true });
    fs.mkdirSync(path.join(outside, 'work'));
    fs.writeFileSync(path.join(outside, 'done', 'evidence.json'), '{}\n');
    fs.writeFileSync(path.join(outside, 'work', 'raw.log'), 'external output\n');
    fs.symlinkSync(outside, current.evidenceRoot);
  }, /canonical evidence root must be an ordinary non-symlink directory/u);
  await rejects('symlinked .ultra evidence ancestor', (current) => {
    const ultraRoot = path.dirname(current.evidenceRoot);
    const outside = path.join(current.root, 'outside-ultra');
    fs.rmSync(ultraRoot, { recursive: true });
    fs.mkdirSync(path.join(outside, 'evidence', 'done'), { recursive: true });
    fs.mkdirSync(path.join(outside, 'evidence', 'work'));
    fs.mkdirSync(path.join(outside, 'contexts'));
    fs.writeFileSync(path.join(outside, 'evidence', 'done', 'evidence.json'), '{}\n');
    fs.writeFileSync(path.join(outside, 'evidence', 'work', 'raw.log'), 'external output\n');
    fs.writeFileSync(
      path.join(outside, 'contexts', 'task-work.md'),
      '# Task\n\n## Planned Path Inventory\n\n`CREATE`:\n\n'
        + '- `.ultra/evidence/work/raw.log`\n\n## Public Seams\n',
    );
    fs.symlinkSync(outside, ultraRoot);
  }, /canonical evidence \.ultra ancestor must be an ordinary non-symlink directory/u);
  await rejects('nested completed-task raw receipt', ({ evidenceRoot }) => {
    fs.mkdirSync(path.join(evidenceRoot, 'done', 'nested'));
  }, /raw evidence entries must be ordinary regular files/u);
  await rejects('unplanned completed-task raw receipt', ({ evidenceRoot }) => {
    fs.renameSync(
      path.join(evidenceRoot, 'done', 'raw.log'),
      path.join(evidenceRoot, 'done', 'unplanned.log'),
    );
  }, /not an exact Planned Path Inventory entry/u);

  for (const kind of ['symlink', 'FIFO', 'AF_UNIX socket']) {
    await rejects(`${kind} task evidence directory`, (current) => {
      const target = path.join(current.evidenceRoot, 'work');
      fs.rmSync(target, { recursive: true });
      return createSpecial(current, target, kind, 'directory');
    }, /evidence root entries must be directories/u);

    await rejects(`${kind} raw-only evidence entry`, (current) => {
      const target = path.join(current.evidenceRoot, 'work', 'raw.log');
      fs.rmSync(target);
      return createSpecial(current, target, kind, 'file');
    }, /raw evidence entries must be ordinary regular files/u);

    await rejects(`${kind} completed-task raw evidence entry`, (current) => {
      const target = path.join(current.evidenceRoot, 'done', 'raw.log');
      fs.rmSync(target);
      return createSpecial(current, target, kind, 'file');
    }, /raw evidence entries must be ordinary regular files/u);

    await rejects(`${kind} canonical evidence.json`, (current) => {
      const target = path.join(current.evidenceRoot, 'done', 'evidence.json');
      fs.rmSync(target);
      return createSpecial(current, target, kind, 'file');
    }, /canonical final evidence must be a regular file/u);
  }
});

test('every completed task has one canonical six-dimension evidence record', () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(ULTRA, 'tasks.json'), 'utf8'));
  const dimensions = [
    'feature_flags_audit',
    'persistence_real',
    'spec_trace',
    'tests_passed',
    'tests_written',
    'vertical_slice',
  ];
  const expected = ledger.tasks
    .filter((task) => task.status === 'completed')
    .map((task) => task.id)
    .sort();
  auditEvidenceDirectories(ROOT, ledger.tasks);

  for (const taskId of expected) {
    const relative = path.join('.ultra', 'evidence', taskId, 'evidence.json');
    const evidence = JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
    assert.equal(evidence.task_id, taskId, relative);
    const validated = JSON.parse(execFileSync(process.execPath, [
      path.join(ROOT, 'skills', 'ultra-plan', 'scripts', 'validate_task_evidence.cjs'),
      path.join(ROOT, relative),
    ], { cwd: ROOT, encoding: 'utf8' }));
    assert.equal(validated.valid, true, relative);

    if (taskId.startsWith('v026-')) {
      assert.equal(evidence.$schema, 'ultra-task-evidence-v1', relative);
      assert.equal(validated.classification, 'legacy-v1', relative);
      assert.match(evidence.git_head, /^[0-9a-f]{40}$/, relative);
      assert.ok(Array.isArray(evidence.commands) && evidence.commands.length > 0, relative);
      for (const command of evidence.commands) {
        assert.deepEqual(Object.keys(command).sort(), ['command', 'evidence_ref', 'exit_code'], relative);
        assert.equal(typeof command.command, 'string', relative);
        assert.ok(command.command.length > 0, relative);
        assert.ok(Number.isInteger(command.exit_code), relative);
        assert.equal(typeof command.evidence_ref, 'string', relative);
        assert.ok(command.evidence_ref.length > 0, relative);
      }
    } else {
      assert.equal(evidence.$schema, 'ultra-task-evidence-v2', relative);
      assert.equal(validated.classification, 'current-v2', relative);
      assert.deepEqual(Object.keys(evidence.context), ['path', 'acceptance_sha256'], relative);
      const contextPath = path.join(ROOT, evidence.context.path);
      assert.equal(
        evidence.context.acceptance_sha256,
        crypto.createHash('sha256').update(acceptanceSection(contextPath)).digest('hex'),
        `${relative}: stale Acceptance-section binding`,
      );
      assert.deepEqual(Object.keys(evidence.subject), [
        'git_head', 'worktree_digest', 'observed_at',
      ], relative);
      assert.ok(Array.isArray(evidence.acceptance) && evidence.acceptance.length > 0, relative);
      for (const item of evidence.acceptance) {
        if (!['command', 'external-observation'].includes(item.verification_type)) continue;
        const raw = repositoryFileSnapshot(
          item.evidence.raw_evidence_ref,
          `${relative}: ${item.criterion_id} raw evidence`,
        );
        assert.equal(
          crypto.createHash('sha256').update(raw).digest('hex'),
          item.evidence.raw_evidence_sha256,
          `${relative}: ${item.criterion_id} raw evidence digest`,
        );
      }
      if ((evidence.task_review?.review_mode ?? 'strict-v4') === 'external-manual') {
        assert.equal(typeof evidence.task_review.receipt_ref, 'string', relative);
        assert.ok(evidence.task_review.receipt_ref.length > 0, relative);
        assert.match(evidence.task_review.receipt_sha256, /^[0-9a-f]{64}$/, relative);
        const receiptBytes = fs.readFileSync(path.join(ROOT, evidence.task_review.receipt_ref));
        assert.equal(
          crypto.createHash('sha256').update(receiptBytes).digest('hex'),
          evidence.task_review.receipt_sha256,
          `${relative}: external review receipt digest`,
        );
      } else {
        assert.equal(evidence.task_review.session_id.length > 0, true, relative);
        assert.match(evidence.task_review.summary_digest, /^[0-9a-f]{64}$/, relative);
      }
    }
    assert.deepEqual(Object.keys(evidence.dimensions).sort(), dimensions, relative);
    for (const dimension of Object.values(evidence.dimensions)) {
      assert.ok(['satisfied', 'gap', 'not_applicable'].includes(dimension.status), relative);
      assert.ok(Array.isArray(dimension.evidence_refs), relative);
      assert.equal(typeof dimension.rationale, 'string', relative);
      assert.ok(dimension.rationale.length > 0, relative);
    }
    assert.ok(Array.isArray(evidence.artifacts) && evidence.artifacts.length > 0, relative);
    for (const artifact of evidence.artifacts) {
      assert.equal(typeof artifact, 'string', relative);
      const movableIntentRefs = ['active', 'archive', 'abandoned'].map(
        (state) => `.ultra/changes/${state}/${evidence.change_id}/intent.md`,
      );
      const existsAtRecordedPath = fs.existsSync(path.join(ROOT, artifact));
      const resolvesByStableChangeId = movableIntentRefs.includes(artifact)
        ? Boolean(changeIntent(evidence.change_id).path)
        : false;
      if (artifact.startsWith('.ultra/reviews/')) {
        assert.equal(artifact, evidence.task_review.summary_ref, relative);
        assert.match(evidence.task_review.summary_digest || '', /^[0-9a-f]{64}$/u, relative);
        continue;
      }
      if (artifact.startsWith('.ultra/.runtime/handoffs/')) {
        assert.match(artifact, /^\.ultra\/\.runtime\/handoffs\/[^/]+\/RESULT\.json$/u, relative);
        assert.equal(evidence.task_review.review_mode, 'external-manual', relative);
        assert.ok(fs.existsSync(path.join(ROOT, evidence.task_review.receipt_ref || '')), relative);
        assert.match(evidence.task_review.receipt_sha256 || '', /^[0-9a-f]{64}$/u, relative);
        continue;
      }
      assert.ok(
        existsAtRecordedPath || resolvesByStableChangeId,
        `${relative}: missing artifact ${artifact}`,
      );
    }
    assert.ok(Array.isArray(evidence.limitations), relative);
    assert.ok(evidence.limitations.every((item) => typeof item === 'string' && item.length > 0), relative);
    assert.match(evidence.timestamp, /^\d{4}-\d{2}-\d{2}T/, relative);
  }
});

test('the recorded test report has a complete schema and matches its task snapshot', () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(ULTRA, 'tasks.json'), 'utf8'));
  const report = JSON.parse(fs.readFileSync(path.join(ULTRA, 'test-report.json'), 'utf8'));
  assert.equal(report.$schema, 'ultra-test-report-v2');
  assert.ok(
    Array.isArray(report.task_evidence),
    'the current repository report must carry the ordered task_evidence projection',
  );
  const intent = changeIntent(report.change_id);
  const intentState = path.relative(ULTRA, intent.path).split(path.sep)[1];
  assert.ok(
    intentState === 'active' || intentState === 'archive',
    'report change_id must resolve to the active or archived Change intent it names, never an abandoned one',
  );
  const currentTasks = ledger.tasks.filter((task) => task.change_id === report.change_id);
  assert.deepEqual(report.task_ids, currentTasks.map((task) => task.id));
  assert.match(report.git_commit, /^[0-9a-f]{40}$/);
  assert.match(report.intent_digest, /^[0-9a-f]{64}$/);
  assert.equal(
    report.intent_digest,
    crypto.createHash('sha256').update(changeIntent(report.change_id).bytes).digest('hex'),
  );
  assert.equal(typeof report.worktree.dirty, 'boolean');
  assert.match(report.worktree.diff_digest, /^[0-9a-f]{64}$/);
  assert.ok(Array.isArray(report.commands) && report.commands.length > 0);
  for (const command of report.commands) {
    assert.deepEqual(Object.keys(command).sort(), ['command', 'evidence_ref', 'exit_code']);
    assert.equal(typeof command.command, 'string');
    assert.ok(Number.isInteger(command.exit_code));
    assert.equal(typeof command.evidence_ref, 'string');
  }
  assert.deepEqual(Object.keys(report.areas).sort(), [
    'anti_patterns', 'coverage_gaps', 'e2e', 'performance', 'security', 'wiring',
  ]);
  const allCompleted = currentTasks.every((task) => task.status === 'completed');
  for (const area of Object.values(report.areas)) {
    assert.ok(['passed', 'gap', 'not_applicable', 'not_run'].includes(area.status));
    assert.ok(Array.isArray(area.evidence_refs));
    assert.ok(Array.isArray(area.omissions));
    if (report.passed) assert.notEqual(area.status, 'not_run');
  }
  for (const field of ['verified_seams', 'findings', 'omissions', 'residual_risks', 'owner_disposition']) {
    assert.ok(Array.isArray(report[field]), field);
  }
  if (report.passed) assert.equal(allCompleted, true);
  assert.ok(Number.isInteger(report.run_count) && report.run_count > 0);
  assert.match(report.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

// ---------------------------------------------------------------------------
// v0.27 H0 — Harness Loop Closure canonical artifacts (HL-13, HL-16)
// ---------------------------------------------------------------------------

test('Harness Loop Closure binds the accepted incident contract and one-time bootstrap grant', () => {
  const decisionPath = path.join(ULTRA, 'decisions', '2026-08-16-v027-harness-loop-closure.md');
  assert.ok(fs.existsSync(decisionPath), 'owner acceptance decision exists');
  const decision = fs.readFileSync(decisionPath, 'utf8');

  // HL-16: durable owner acceptance of the exact incident-contract bytes.
  assert.match(decision, /我接受。你把它交给 Zcode 去修复，让 Zcode 去改吧。/u);
  assert.match(
    decision,
    /c39347ca3553175aec06629f710a8541db8a12445e5a17dd90e62e6b75bc2acb/u,
  );
  assert.match(decision, /docs\/V027-HARNESS-LOOP-INCIDENT-REMEDIATION\.zh-CN\.md/u);
  assert.match(decision, /one-?time bootstrap grant|一次性 bootstrap grant/iu);
  assert.match(decision, /is not Execution Packet v1|不是 Execution Packet v1/iu);
  assert.match(
    decision,
    /recovery snapshot[\s\S]{0,200}ultra-builder-pro-cli-h0-20260816-eYVVEB/iu,
  );

  // The H0 task context names the exact planned-path boundary and budget.
  const contextPath = path.join(ULTRA, 'contexts', 'task-v027-harness-loop-closure.md');
  assert.ok(fs.existsSync(contextPath), 'H0 task context exists');
  const context = fs.readFileSync(contextPath, 'utf8');
  assert.match(context, /hooks\/_common\.py/u);
  assert.match(context, /skills\/ultra-review\/SKILL\.md/u);
  assert.match(context, /\.ultra\/tasks\.json/u);
  assert.match(context, /max_zcode_active_time: 4h/u);
  assert.match(context, /awaiting external manual review/iu);
  assert.match(context, /external manual review/iu);
  assert.doesNotMatch(context, /(?:requires?|until|to reach)\s+(?:a\s+)?zero-finding/iu);
});
