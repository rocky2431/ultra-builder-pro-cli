'use strict';

// Argument-boundary validators shared by bin/install.js (and anything else
// that accepts user-supplied paths). Keep small and pure: input → verdict.

function validateConfigDir(configDir) {
  if (configDir === undefined || configDir === null) {
    return { ok: true, configDir: null };
  }
  if (typeof configDir !== 'string') {
    return { ok: false, error: '--config-dir must be a string' };
  }
  if (configDir.includes('\0')) {
    // P3 #13 / D45 — NUL bytes in a path are a classic path-traversal
    // smuggling vector. Node's child_process layer also rejects NUL in
    // argv, but defense-in-depth is cheap here.
    return { ok: false, error: '--config-dir must not contain NUL bytes (path traversal)' };
  }
  return { ok: true, configDir };
}

module.exports = {
  validateConfigDir,
};
