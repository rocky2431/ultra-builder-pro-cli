'use strict';

// Phase 6.1 — RTK soft dependency:
//   • detectRtk(opts): locates the `rtk` binary via PATH; returns false
//     (never throws) when missing or on any exec error.
//   • initRtk(opts): runs `rtk init -g`; only call after detectRtk() true.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const rtk = require('../rtk-detect.cjs');

function mkEmptyBinDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-rtk-empty-bin-'));
}

function mkFakeBinDir({ succeed = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-rtk-fake-bin-'));
  const script = succeed
    ? '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "rtk 1.2.3"; exit 0; fi\nif [ "$1" = "init" ]; then echo "init ok"; exit 0; fi\nexit 0\n'
    : '#!/usr/bin/env bash\nexit 42\n';
  const target = path.join(dir, 'rtk');
  fs.writeFileSync(target, script);
  fs.chmodSync(target, 0o755);
  return dir;
}

test('detectRtk returns true when rtk --version succeeds', () => {
  const binDir = mkFakeBinDir({ succeed: true });
  try {
    const result = rtk.detectRtk({ pathOverride: binDir });
    assert.equal(result.available, true);
    assert.match(result.version, /rtk/i);
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test('detectRtk returns false when rtk missing from PATH (no throw)', () => {
  const binDir = mkEmptyBinDir();
  try {
    const result = rtk.detectRtk({ pathOverride: binDir });
    assert.equal(result.available, false);
    assert.ok(result.reason);
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test('detectRtk returns false when rtk exits non-zero (no throw)', () => {
  const binDir = mkFakeBinDir({ succeed: false });
  try {
    const result = rtk.detectRtk({ pathOverride: binDir });
    assert.equal(result.available, false);
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test('initRtk runs rtk init -g and returns success', () => {
  const binDir = mkFakeBinDir({ succeed: true });
  try {
    const result = rtk.initRtk({ pathOverride: binDir, scope: 'global' });
    assert.equal(result.ok, true);
    assert.match(result.stdout, /init ok/);
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test('initRtk reports failure when binary is missing (does not throw)', () => {
  const binDir = mkEmptyBinDir();
  try {
    const result = rtk.initRtk({ pathOverride: binDir, scope: 'global' });
    assert.equal(result.ok, false);
    assert.ok(result.error);
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test('installHook: skip=true short-circuits with a skipped=true record', () => {
  const binDir = mkEmptyBinDir();
  try {
    const result = rtk.installHook({ skip: true, pathOverride: binDir });
    assert.equal(result.skipped, true);
    assert.equal(result.available, undefined);
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test('installHook: missing rtk → returns {available:false} with install hint', () => {
  const binDir = mkEmptyBinDir();
  try {
    const result = rtk.installHook({ skip: false, pathOverride: binDir });
    assert.equal(result.available, false);
    assert.ok(result.hint, 'should surface an install hint');
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test('installHook: present rtk → runs init and returns {available:true, initialized:true}', () => {
  const binDir = mkFakeBinDir({ succeed: true });
  try {
    const result = rtk.installHook({ skip: false, pathOverride: binDir, scope: 'global' });
    assert.equal(result.available, true);
    assert.equal(result.initialized, true);
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});
