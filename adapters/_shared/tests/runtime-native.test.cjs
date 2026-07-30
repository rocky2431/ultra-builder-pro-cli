'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  inspectRuntimeNative,
} = require('../runtime-native.cjs');

function fixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-native-runtime-'));
  const nativeRelative = path.join('node_modules', 'better-sqlite3', 'better_sqlite3.node');
  const nativeFile = path.join(root, nativeRelative);
  fs.mkdirSync(path.dirname(nativeFile), { recursive: true });
  fs.writeFileSync(nativeFile, 'native-fixture');
  const manifest = {
    schema_version: 1,
    platform: process.platform,
    arch: process.arch,
    modules: process.versions.modules,
    native_module: nativeRelative.split(path.sep).join('/'),
    native_sha256: crypto.createHash('sha256').update(fs.readFileSync(nativeFile)).digest('hex'),
    ...overrides,
  };
  fs.writeFileSync(
    path.join(root, 'native-runtime.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { root, nativeFile };
}

test('native runtime accepts an exact platform, ABI, path, and digest', () => {
  const value = fixture();
  try {
    const report = inspectRuntimeNative(value.root, { load: false });
    assert.equal(report.status, 'healthy');
    assert.equal(report.modules, process.versions.modules);
    assert.equal(report.native_module, value.nativeFile);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('native runtime rejects missing or tampered native bytes', () => {
  const missing = fixture();
  const tampered = fixture();
  try {
    fs.unlinkSync(missing.nativeFile);
    assert.throws(
      () => inspectRuntimeNative(missing.root, { load: false }),
      (error) => error.code === 'RUNTIME_NATIVE_MISSING',
    );
    fs.appendFileSync(tampered.nativeFile, '-tampered');
    assert.throws(
      () => inspectRuntimeNative(tampered.root, { load: false }),
      (error) => error.code === 'RUNTIME_NATIVE_MISSING',
    );
  } finally {
    fs.rmSync(missing.root, { recursive: true, force: true });
    fs.rmSync(tampered.root, { recursive: true, force: true });
  }
});

test('native runtime rejects a different Node ABI before loading the module', () => {
  const value = fixture({ modules: String(Number(process.versions.modules) + 1) });
  try {
    assert.throws(
      () => inspectRuntimeNative(value.root, { load: false }),
      (error) => error.code === 'RUNTIME_ABI_MISMATCH',
    );
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});
