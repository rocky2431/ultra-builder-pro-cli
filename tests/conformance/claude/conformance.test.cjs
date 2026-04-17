'use strict';

// Phase 4.6b — Claude Code conformance suite.
// 5 capability checks: command / skills / hooks / MCP / idempotency.

const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const claude = require('../../../adapters/claude.js');
const { REPO_ROOT, mkTarget, cleanup } = require('../_lib.cjs');
const caps = require('../_capabilities.cjs');

function buildCfg() {
  return {
    adapter: claude,
    commandsDir: (target) => path.join(target, 'commands'),
    skillsDir: (target) => path.join(target, 'skills'),
    expectCommands: ['ultra-init.md', 'ultra-dev.md', 'ultra-plan.md'],
    commandFrontmatterPatterns: [/^---/m, /description:/i],
    expectSkills: ['ultra-init', 'ultra-dev', 'ultra-status'],
    hookCheck: (target) => {
      const settings = JSON.parse(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'));
      assert.ok(settings.hooks, 'claude settings.json must carry hooks');
      // Claude gets the full 8-event hook set; we assert a representative subset
      for (const ev of ['PostToolUse', 'PreToolUse', 'SessionStart']) {
        assert.ok(Array.isArray(settings.hooks[ev]), `claude hook event ${ev} must be an array`);
      }
    },
    readMcpEntry: (target) => {
      const settings = JSON.parse(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'));
      return settings.mcpServers && settings.mcpServers[claude.MCP_SERVER_NAME];
    },
    identityCheck: (entry) => {
      assert.ok(entry._ubp && entry._ubp.source === claude.SOURCE_TAG,
        'claude mcp entry must carry sibling _ubp.source (D45)');
    },
    readIdempotencyArtifact: (target) => fs.readFileSync(path.join(target, 'settings.json'), 'utf8'),
  };
}

test('claude conformance — command surface', () => {
  const target = mkTarget('claude-cap-cmd');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertCommandSurface(target, cfg);
  } finally { cleanup(target); }
});

test('claude conformance — skills packaging', () => {
  const target = mkTarget('claude-cap-skill');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertSkillsPackaging(target, cfg);
  } finally { cleanup(target); }
});

test('claude conformance — hook configuration', () => {
  const target = mkTarget('claude-cap-hook');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertHookConfig(target, cfg);
  } finally { cleanup(target); }
});

test('claude conformance — MCP registration + no env._source leak', () => {
  const target = mkTarget('claude-cap-mcp');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertMcpRegistration(target, cfg);
  } finally { cleanup(target); }
});

test('claude conformance — install idempotency (byte-equal)', () => {
  const target = mkTarget('claude-cap-idem');
  try {
    const cfg = buildCfg();
    caps.assertInstallIdempotency(target, cfg);
  } finally { cleanup(target); }
});
