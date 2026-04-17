'use strict';

// Phase 4.6b — OpenCode conformance suite.

const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const opencode = require('../../../adapters/opencode.js');
const { REPO_ROOT, mkTarget, cleanup } = require('../_lib.cjs');
const caps = require('../_capabilities.cjs');

function buildCfg() {
  return {
    adapter: opencode,
    commandsDir: (target) => path.join(target, 'commands'),
    skillsDir: (target) => path.join(target, 'skills'),
    // OpenCode gets .md commands with lowercased frontmatter keys
    expectCommands: ['ultra-init.md', 'ultra-dev.md', 'ultra-plan.md'],
    commandFrontmatterPatterns: [/^---/m, /description:/i],
    expectSkills: ['ultra-init', 'ultra-dev', 'ultra-status'],
    hookCheck: (target) => {
      // OpenCode hooks land in opencode.json under sentinel-managed shape
      const cfg = JSON.parse(fs.readFileSync(path.join(target, 'opencode.json'), 'utf8'));
      assert.ok(cfg[opencode.SENTINEL_KEY], 'opencode sentinel missing');
      // Matrix: OpenCode reaches session.start + event (2 events)
      assert.ok(
        Array.isArray(cfg[opencode.SENTINEL_KEY].reachable_events),
        'reachable_events list must be documented',
      );
    },
    readMcpEntry: (target) => {
      const cfg = JSON.parse(fs.readFileSync(path.join(target, 'opencode.json'), 'utf8'));
      return cfg.mcp && cfg.mcp[opencode.MCP_SERVER_NAME];
    },
    identityCheck: (entry) => {
      assert.ok(entry._ubp && entry._ubp.source === opencode.SOURCE_TAG,
        'opencode mcp entry must carry sibling _ubp.source (D45)');
    },
    readIdempotencyArtifact: (target) => fs.readFileSync(path.join(target, 'opencode.json'), 'utf8'),
  };
}

test('opencode conformance — command surface', () => {
  const target = mkTarget('oc-cap-cmd');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertCommandSurface(target, cfg);
  } finally { cleanup(target); }
});

test('opencode conformance — skills packaging', () => {
  const target = mkTarget('oc-cap-skill');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertSkillsPackaging(target, cfg);
  } finally { cleanup(target); }
});

test('opencode conformance — hook configuration', () => {
  const target = mkTarget('oc-cap-hook');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertHookConfig(target, cfg);
  } finally { cleanup(target); }
});

test('opencode conformance — MCP registration + no env._source leak', () => {
  const target = mkTarget('oc-cap-mcp');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertMcpRegistration(target, cfg);
  } finally { cleanup(target); }
});

test('opencode conformance — install idempotency (byte-equal)', () => {
  const target = mkTarget('oc-cap-idem');
  try {
    const cfg = buildCfg();
    caps.assertInstallIdempotency(target, cfg);
  } finally { cleanup(target); }
});
