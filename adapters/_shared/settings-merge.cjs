'use strict';

// Sentinel-block merge/remove for JSON settings files (D7).
// Protects user-authored settings by confining our writes to a single
// well-known key (the sentinel). Install writes/updates the sentinel value;
// uninstall deletes it. Everything else in the JSON is left untouched.

const SENTINEL_VERSION = 1;

function readJsonSafe(filepath, { fs = require('node:fs'), rescue = false } = {}) {
  if (!fs.existsSync(filepath)) return {};
  const raw = fs.readFileSync(filepath, 'utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch (err) {
    // rescue mode: back up the corrupt file and treat as empty so install
    // can proceed instead of exploding mid-setup (P2 #7 from Phase 4 review).
    // Callers that need strict semantics leave rescue=false (default).
    if (rescue) {
      const backup = `${filepath}.bak-${Date.now()}`;
      try {
        fs.copyFileSync(filepath, backup);
        process.stderr.write(`settings-merge: corrupt ${filepath}; backed up to ${backup}, continuing with empty object\n`);
      } catch (_backupErr) { /* best-effort */ }
      return {};
    }
    throw new Error(`settings-merge: cannot parse ${filepath}: ${err.message}`);
  }
}

function withSentinelBlock(existing, sentinelKey, block) {
  if (!sentinelKey || typeof sentinelKey !== 'string') {
    throw new TypeError('withSentinelBlock: sentinelKey must be non-empty string');
  }
  const next = { ...existing };
  next[sentinelKey] = {
    __sentinel: SENTINEL_VERSION,
    __generated_by: 'ultra-builder-pro-cli',
    __generated_at: new Date().toISOString(),
    ...block,
  };
  return next;
}

function removeSentinelBlock(existing, sentinelKey) {
  if (!(sentinelKey in existing)) return existing;
  const next = { ...existing };
  delete next[sentinelKey];
  return next;
}

function hasSentinelBlock(existing, sentinelKey) {
  return Boolean(existing && existing[sentinelKey] && existing[sentinelKey].__sentinel);
}

function mergeArrayField(existing, key, items) {
  const current = Array.isArray(existing[key]) ? existing[key] : [];
  const seen = new Set(current.map((x) => JSON.stringify(x)));
  const appended = [...current];
  for (const item of items) {
    const tag = JSON.stringify(item);
    if (seen.has(tag)) continue;
    appended.push(item);
    seen.add(tag);
  }
  return { ...existing, [key]: appended };
}

module.exports = {
  SENTINEL_VERSION,
  readJsonSafe,
  withSentinelBlock,
  removeSentinelBlock,
  hasSentinelBlock,
  mergeArrayField,
};
