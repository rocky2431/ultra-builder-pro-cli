'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const MAX_INPUT_BYTES = 64 * 1024;
const OUTPUT_PATTERN = /^state-[A-Za-z0-9-]+-[0-9a-f-]{36}\.db$/i;
const BACKUP_METHOD = 'sqlite-serialize-pinned-fd-v1';
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'ascii');

class BackupWorkerError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function identity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function sameIdentity(left, right) {
  return String(left?.dev) === String(right?.dev)
    && String(left?.ino) === String(right?.ino);
}

function lstatRegular(file, code, label) {
  const stat = fs.lstatSync(file, {
    bigint: true,
    throwIfNoEntry: false,
  });
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
    throw new BackupWorkerError(code, `${label} must be a regular file: ${file}`);
  }
  return stat;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BackupWorkerError(
      'BACKUP_WORKER_PROTOCOL_INVALID',
      'backup worker payload must be an object',
    );
  }
  const sourcePath = payload.source_path;
  const outputName = payload.output_name;
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) {
    throw new BackupWorkerError(
      'BACKUP_WORKER_PROTOCOL_INVALID',
      'source_path must be absolute',
    );
  }
  if (typeof outputName !== 'string' || !OUTPUT_PATTERN.test(outputName)
      || path.basename(outputName) !== outputName) {
    throw new BackupWorkerError(
      'BACKUP_WORKER_PROTOCOL_INVALID',
      'output_name is invalid',
    );
  }
  if (!payload.directory_identity || !payload.source_identity) {
    throw new BackupWorkerError(
      'BACKUP_WORKER_PROTOCOL_INVALID',
      'directory and source identities are required',
    );
  }
  return {
    sourcePath,
    outputName,
    directoryIdentity: payload.directory_identity,
    sourceIdentity: payload.source_identity,
  };
}

function assertCurrentDirectory(expected) {
  const stat = fs.statSync('.', { bigint: true });
  if (!stat.isDirectory() || !sameIdentity(identity(stat), expected)) {
    throw new BackupWorkerError(
      'BACKUP_DIRECTORY_CHANGED',
      'backup worker cwd no longer matches the verified backup directory',
      { expected, actual: identity(stat) },
    );
  }
}

function fsyncCurrentDirectory() {
  const fd = fs.openSync('.', fs.constants.O_RDONLY);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function cleanupOwnedTemp(file, expectedIdentity) {
  const stat = fs.lstatSync(file, {
    bigint: true,
    throwIfNoEntry: false,
  });
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) return;
  if (expectedIdentity && !sameIdentity(identity(stat), expectedIdentity)) return;
  fs.unlinkSync(file);
}

function noFollowFlag() {
  if (!Number.isInteger(fs.constants.O_NOFOLLOW) || fs.constants.O_NOFOLLOW === 0) {
    throw new BackupWorkerError(
      'BACKUP_CAPABILITY_UNAVAILABLE',
      'this platform cannot pin backup files without following symbolic links',
    );
  }
  return fs.constants.O_NOFOLLOW;
}

function sqliteSnapshot(source) {
  if (typeof source.serialize !== 'function') {
    throw new BackupWorkerError(
      'BACKUP_CAPABILITY_UNAVAILABLE',
      'the SQLite runtime does not expose a serialized snapshot capability',
    );
  }
  let snapshot;
  try {
    snapshot = source.serialize();
  } catch (cause) {
    throw new BackupWorkerError(
      'BACKUP_SNAPSHOT_FAILED',
      `SQLite could not create a coherent serialized snapshot: ${cause.message}`,
      { cause: { code: cause.code, message: cause.message } },
    );
  }
  if (!Buffer.isBuffer(snapshot) || snapshot.length < 100
      || !snapshot.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)) {
    throw new BackupWorkerError(
      'BACKUP_SNAPSHOT_FAILED',
      'SQLite returned an invalid serialized snapshot',
    );
  }
  return snapshot;
}

function verifySnapshot(snapshot) {
  const verificationBytes = Buffer.from(snapshot);
  // An in-memory SQLite database cannot retain WAL journal mode. The serialized
  // pages already contain the connection's coherent view, so only the verifier
  // copy uses rollback-journal header flags. Published bytes remain unchanged.
  verificationBytes[18] = 1;
  verificationBytes[19] = 1;
  let verification;
  try {
    verification = new Database(verificationBytes);
    verification.pragma('query_only = ON');
    const integrity = verification.pragma('quick_check', { simple: true });
    const userVersion = Number(verification.pragma('user_version', { simple: true }));
    if (integrity !== 'ok') {
      throw new BackupWorkerError(
        'BACKUP_VERIFICATION_FAILED',
        `SQLite backup quick_check failed: ${String(integrity)}`,
      );
    }
    return { integrity, userVersion };
  } catch (cause) {
    if (cause instanceof BackupWorkerError) throw cause;
    throw new BackupWorkerError(
      'BACKUP_VERIFICATION_FAILED',
      `SQLite could not verify the serialized snapshot: ${cause.message}`,
      { cause: { code: cause.code, message: cause.message } },
    );
  } finally {
    if (verification) verification.close();
  }
}

async function execute(payload, { beforeSnapshotWrite = null } = {}) {
  const {
    sourcePath,
    outputName,
    directoryIdentity,
    sourceIdentity,
  } = validatePayload(payload);
  assertCurrentDirectory(directoryIdentity);
  const sourceStat = lstatRegular(
    sourcePath,
    'BACKUP_SOURCE_CHANGED',
    'canonical state database',
  );
  if (!sameIdentity(identity(sourceStat), sourceIdentity)) {
    throw new BackupWorkerError(
      'BACKUP_SOURCE_CHANGED',
      'canonical state database identity changed before backup',
      { expected: sourceIdentity, actual: identity(sourceStat) },
    );
  }

  const tempName = `.${outputName}.${crypto.randomUUID()}.tmp`;
  let tempFd = fs.openSync(
    tempName,
    fs.constants.O_RDWR
      | fs.constants.O_CREAT
      | fs.constants.O_EXCL
      | noFollowFlag(),
    0o600,
  );
  const tempIdentity = identity(fs.fstatSync(tempFd, { bigint: true }));
  let source;
  try {
    source = new Database(sourcePath, {
      readonly: true,
      fileMustExist: true,
    });
    const openedSource = lstatRegular(
      sourcePath,
      'BACKUP_SOURCE_CHANGED',
      'canonical state database',
    );
    if (!sameIdentity(identity(openedSource), sourceIdentity)) {
      throw new BackupWorkerError(
        'BACKUP_SOURCE_CHANGED',
        'canonical state database identity changed while opening backup source',
      );
    }
    source.pragma('query_only = ON');
    const snapshot = sqliteSnapshot(source);
    source.close();
    source = null;
    const { userVersion } = verifySnapshot(snapshot);

    if (beforeSnapshotWrite) beforeSnapshotWrite({ tempName, tempIdentity });
    fs.ftruncateSync(tempFd, 0);
    fs.writeFileSync(tempFd, snapshot);
    fs.fsyncSync(tempFd);
    const written = fs.fstatSync(tempFd, { bigint: true });
    if (!sameIdentity(identity(written), tempIdentity)
        || Number(written.size) !== snapshot.length) {
      throw new BackupWorkerError(
        'BACKUP_OUTPUT_UNSAFE',
        'backup staging file identity or size changed during snapshot write',
      );
    }

    const completedTemp = lstatRegular(
      tempName,
      'BACKUP_OUTPUT_UNSAFE',
      'backup staging file',
    );
    if (!sameIdentity(identity(completedTemp), tempIdentity)) {
      throw new BackupWorkerError(
        'BACKUP_OUTPUT_UNSAFE',
        'backup staging file identity changed during backup',
      );
    }
    if (Number(completedTemp.size) !== snapshot.length) {
      throw new BackupWorkerError(
        'BACKUP_OUTPUT_UNSAFE',
        'backup staging file size changed before publication',
      );
    }

    fs.linkSync(tempName, outputName);
    const published = lstatRegular(
      outputName,
      'BACKUP_OUTPUT_UNSAFE',
      'published backup',
    );
    if (!sameIdentity(identity(published), tempIdentity)
        || Number(published.size) !== snapshot.length) {
      throw new BackupWorkerError(
        'BACKUP_OUTPUT_UNSAFE',
        'published backup does not match the pinned staging file',
      );
    }
    fs.unlinkSync(tempName);
    fsyncCurrentDirectory();
    fs.closeSync(tempFd);
    tempFd = null;
    return {
      output_name: outputName,
      integrity: 'ok',
      user_version: userVersion,
      size: Number(published.size),
      digest: crypto.createHash('sha256').update(snapshot).digest('hex'),
      method: BACKUP_METHOD,
      directory_identity: directoryIdentity,
      source_identity: sourceIdentity,
      backup_identity: identity(published),
    };
  } catch (error) {
    if (source) {
      try { source.close(); } catch {}
    }
    if (tempFd !== null) {
      try { fs.closeSync(tempFd); } catch {}
    }
    cleanupOwnedTemp(tempName, tempIdentity);
    cleanupOwnedTemp(outputName, tempIdentity);
    throw error;
  }
}

async function main() {
  try {
    const input = fs.readFileSync(0, 'utf8');
    if (Buffer.byteLength(input) > MAX_INPUT_BYTES) {
      throw new BackupWorkerError(
        'BACKUP_WORKER_PROTOCOL_INVALID',
        'backup worker payload is too large',
      );
    }
    const result = await execute(JSON.parse(input));
    process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: {
        code: error.code || 'BACKUP_WORKER_FAILED',
        message: error.message,
        details: error.details,
      },
    })}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  BACKUP_METHOD,
  BackupWorkerError,
  execute,
};
