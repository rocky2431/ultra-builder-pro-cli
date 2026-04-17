'use strict';

// Phase 6.1 — RTK soft dependency.
//
// RTK (Rust Token Killer) is an external CLI proxy the user installs
// separately. We never hard-require it: installation continues even when
// rtk is missing, we just print an install hint. This mirrors PLAN Phase
// 6.1: "无 rtk → 提示安装 + 跳过（不硬依赖）".
//
// Tests inject a PATH override so we can exercise the happy/missing paths
// without touching the real rtk binary on the machine.

const { execFileSync } = require('node:child_process');

const INSTALL_HINT =
  'rtk not found. RTK is a token-saving proxy that rewrites Bash/git/npm\n' +
  '  commands transparently. Install: https://github.com/rcrocky/rtk\n' +
  '  (or run `cargo install rtk`). Continuing without RTK.';

function envWithPath(pathOverride) {
  if (!pathOverride) return process.env;
  // Isolate rtk lookup to pathOverride + minimal system dirs (so shebangs
  // like `/usr/bin/env bash` still resolve). Tests use this to cut off the
  // real rtk binary on the developer's machine.
  return { ...process.env, PATH: `${pathOverride}:/usr/bin:/bin` };
}

function detectRtk({ pathOverride = null, timeoutMs = 3000 } = {}) {
  try {
    const stdout = execFileSync('rtk', ['--version'], {
      env: envWithPath(pathOverride),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    return { available: true, version: stdout.toString().trim() };
  } catch (err) {
    return {
      available: false,
      reason: err && err.code === 'ENOENT' ? 'binary not on PATH' : (err && err.message) || 'unknown',
    };
  }
}

function initRtk({ pathOverride = null, scope = 'global', timeoutMs = 10000 } = {}) {
  const args = ['init'];
  if (scope === 'global') args.push('-g');
  try {
    const stdout = execFileSync('rtk', args, {
      env: envWithPath(pathOverride),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    return { ok: true, stdout: stdout.toString() };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'unknown' };
  }
}

// High-level entry: detect + optionally init, never throws.
// Caller passes {skip:true} to honor --skip-rtk flag.
function installHook({ skip = false, pathOverride = null, scope = 'global' } = {}) {
  if (skip) return { skipped: true };
  const detection = detectRtk({ pathOverride });
  if (!detection.available) {
    return {
      available: false,
      initialized: false,
      reason: detection.reason,
      hint: INSTALL_HINT,
    };
  }
  const initResult = initRtk({ pathOverride, scope });
  return {
    available: true,
    initialized: initResult.ok,
    version: detection.version,
    init_error: initResult.ok ? undefined : initResult.error,
  };
}

module.exports = {
  detectRtk,
  initRtk,
  installHook,
  INSTALL_HINT,
};
