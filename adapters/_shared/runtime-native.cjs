'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_FILE = 'native-runtime.json';

class RuntimeNativeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RuntimeNativeError';
    this.code = code;
    this.details = details;
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readManifest(runtimeRoot) {
  const file = path.join(path.resolve(runtimeRoot), MANIFEST_FILE);
  if (!fs.existsSync(file)) {
    throw new RuntimeNativeError(
      'RUNTIME_NATIVE_MISSING',
      `Ultra native runtime manifest is missing: ${file}`,
      { path: file },
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new RuntimeNativeError(
      'RUNTIME_NATIVE_MISSING',
      `Ultra native runtime manifest is invalid: ${file}`,
      { path: file, cause: cause.message },
    );
  }
  if (manifest?.schema_version !== 1
      || typeof manifest.native_module !== 'string'
      || !/^[0-9a-f]{64}$/i.test(manifest.native_sha256 || '')) {
    throw new RuntimeNativeError(
      'RUNTIME_NATIVE_MISSING',
      `Ultra native runtime manifest is incomplete: ${file}`,
      { path: file },
    );
  }
  return { file, manifest };
}

function inspectRuntimeNative(runtimeRoot, { load = true } = {}) {
  const root = path.resolve(runtimeRoot);
  const { file, manifest } = readManifest(root);
  const expected = {
    platform: process.platform,
    arch: process.arch,
    modules: process.versions.modules,
  };
  const actual = {
    platform: manifest.platform,
    arch: manifest.arch,
    modules: String(manifest.modules || ''),
  };
  if (actual.platform !== expected.platform
      || actual.arch !== expected.arch
      || actual.modules !== expected.modules) {
    throw new RuntimeNativeError(
      'RUNTIME_ABI_MISMATCH',
      `Ultra native runtime requires ${actual.platform}/${actual.arch} ABI ${
        actual.modules
      }, but the active Node is ${expected.platform}/${expected.arch} ABI ${expected.modules}`,
      { expected: actual, actual: expected, manifest: file },
    );
  }
  const nativeFile = path.resolve(root, manifest.native_module);
  if (nativeFile !== root && !nativeFile.startsWith(`${root}${path.sep}`)) {
    throw new RuntimeNativeError(
      'RUNTIME_NATIVE_MISSING',
      'Ultra native module path escapes the runtime root',
      { path: manifest.native_module },
    );
  }
  if (!fs.existsSync(nativeFile) || !fs.statSync(nativeFile).isFile()) {
    throw new RuntimeNativeError(
      'RUNTIME_NATIVE_MISSING',
      `Ultra native SQLite driver is missing: ${nativeFile}`,
      { path: nativeFile },
    );
  }
  const digest = sha256(nativeFile);
  if (digest !== manifest.native_sha256) {
    throw new RuntimeNativeError(
      'RUNTIME_NATIVE_MISSING',
      `Ultra native SQLite driver digest does not match its manifest: ${nativeFile}`,
      { path: nativeFile, expected: manifest.native_sha256, actual: digest },
    );
  }
  if (load) {
    let Database;
    try {
      Database = require(require.resolve('better-sqlite3', {
        paths: [path.join(root, 'node_modules')],
      }));
      const db = new Database(':memory:');
      db.prepare('SELECT 1 AS ok').get();
      db.close();
    } catch (cause) {
      throw new RuntimeNativeError(
        'RUNTIME_ABI_MISMATCH',
        `Ultra native SQLite driver cannot load in the active Node runtime: ${cause.message}`,
        { path: nativeFile, cause: cause.code || cause.message },
      );
    }
  }
  return {
    status: 'healthy',
    manifest: file,
    platform: actual.platform,
    arch: actual.arch,
    modules: actual.modules,
    native_module: nativeFile,
    native_sha256: digest,
  };
}

module.exports = {
  MANIFEST_FILE,
  RuntimeNativeError,
  inspectRuntimeNative,
};
