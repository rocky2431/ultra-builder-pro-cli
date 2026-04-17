'use strict';

// Phase 4.6b — Gemini conformance suite.
// Gemini packages into an extension directory; hooks are N/A per matrix §3.

const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const gemini = require('../../../adapters/gemini.js');
const { REPO_ROOT, mkTarget, cleanup } = require('../_lib.cjs');
const caps = require('../_capabilities.cjs');

function buildCfg() {
  // resolveExtensionRoot translates configDir → extensions/ultra-builder-pro/
  const extRoot = (target) => gemini.resolveExtensionRoot({ configDir: target });
  return {
    adapter: gemini,
    commandsDir: (target) => path.join(extRoot(target), 'commands'),
    skillsDir: (target) => path.join(extRoot(target), 'skills'),
    expectCommands: ['ultra-init.toml', 'ultra-dev.toml', 'ultra-plan.toml'],
    commandFrontmatterPatterns: [/description\s*=/i, /prompt\s*=/i],
    expectSkills: ['ultra-init', 'ultra-dev', 'ultra-status'],
    // Matrix §3: Gemini has 0 reachable hook events — graceful no-op.
    hookCheck: 'skip',
    readMcpEntry: (target) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(extRoot(target), 'gemini-extension.json'), 'utf8'));
      return manifest.mcpServers && manifest.mcpServers[gemini.MCP_SERVER_NAME];
    },
    identityCheck: (entry, target) => {
      assert.ok(entry._ubp && entry._ubp.source === gemini.SOURCE_TAG,
        'gemini mcp entry must carry sibling _ubp.source (D45)');
      const manifest = JSON.parse(fs.readFileSync(path.join(extRoot(target), 'gemini-extension.json'), 'utf8'));
      assert.ok(manifest._ubp && manifest._ubp.source === gemini.SOURCE_TAG,
        'gemini manifest must carry top-level _ubp.source');
    },
    readIdempotencyArtifact: (target) => fs.readFileSync(path.join(extRoot(target), 'gemini-extension.json'), 'utf8'),
  };
}

test('gemini conformance — command surface (md → toml)', () => {
  const target = mkTarget('gm-cap-cmd');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertCommandSurface(target, cfg);
  } finally { cleanup(target); }
});

test('gemini conformance — skills packaging', () => {
  const target = mkTarget('gm-cap-skill');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertSkillsPackaging(target, cfg);
  } finally { cleanup(target); }
});

test('gemini conformance — hooks (matrix §3 N/A — graceful skip)', () => {
  const target = mkTarget('gm-cap-hook');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertHookConfig(target, cfg);
  } finally { cleanup(target); }
});

test('gemini conformance — MCP registration + no env._source leak', () => {
  const target = mkTarget('gm-cap-mcp');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertMcpRegistration(target, cfg);
  } finally { cleanup(target); }
});

test('gemini conformance — install idempotency (byte-equal)', () => {
  const target = mkTarget('gm-cap-idem');
  try {
    const cfg = buildCfg();
    caps.assertInstallIdempotency(target, cfg);
  } finally { cleanup(target); }
});
