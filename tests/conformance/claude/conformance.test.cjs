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
  const pluginRoot = (target) => path.join(target, 'skills', 'ultra-builder-pro');
  return {
    adapter: claude,
    commandsDir: (target) => path.join(pluginRoot(target), 'commands'),
    skillsDir: (target) => path.join(pluginRoot(target), 'skills'),
    expectCommands: ['ultra-init.md', 'ultra-dev.md', 'ultra-plan.md'],
    commandFrontmatterPatterns: [/^---/m, /description:/i],
    expectSkills: ['ultra-init', 'ultra-dev', 'ultra-status'],
    hookCheck: (target) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot(target), 'hooks', 'hooks.json'), 'utf8'));
      for (const ev of ['PreCompact', 'PreToolUse', 'SessionStart', 'Stop']) {
        assert.ok(Array.isArray(manifest.hooks[ev]), `claude hook event ${ev} must be an array`);
      }
      assert.match(JSON.stringify(manifest), /\$\{CLAUDE_PLUGIN_ROOT\}/);
    },
    readMcpEntry: (target) => {
      const mcp = JSON.parse(fs.readFileSync(path.join(pluginRoot(target), '.mcp.json'), 'utf8'));
      return mcp.mcpServers && mcp.mcpServers[claude.MCP_SERVER_NAME];
    },
    expectNoEnv: true,
    identityCheck: (entry, target) => {
      assert.equal(entry.command, process.platform === 'win32' ? 'node.exe' : '/usr/bin/env');
      assert.deepEqual(
        entry.args,
        process.platform === 'win32'
          ? [path.join(pluginRoot(target), 'runtime', 'launch.cjs')]
          : ['node', path.join(pluginRoot(target), 'runtime', 'launch.cjs')],
      );
    },
    readIdempotencyArtifact: (target) => fs.readFileSync(path.join(pluginRoot(target), '.claude-plugin', 'plugin.json'), 'utf8'),
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
