'use strict';

// Phase 4.6b — Codex conformance suite.
// Codex packs commands under `prompts/` as plain-text TOML-adjacent files;
// MCP lives inside config.toml marker-block.

const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const codex = require('../../../adapters/codex.js');
const { REPO_ROOT, mkTarget, cleanup } = require('../_lib.cjs');
const caps = require('../_capabilities.cjs');

function buildCfg() {
  return {
    adapter: codex,
    commandsDir: (target) => path.join(target, 'prompts'),
    skillsDir: (target) => path.join(target, 'skills'),
    expectCommands: ['ultra-init.md', 'ultra-dev.md', 'ultra-plan.md'],
    commandFrontmatterPatterns: [/ultra-/i],
    expectSkills: ['ultra-init', 'ultra-dev', 'ultra-status'],
    hookCheck: (target) => {
      // Codex degrades to pre-tool-exec + post-session stubs; adapter drops
      // hooks/*.py stubs. Presence of at least the Python stub directory is
      // our smoke signal; matrix §3 marks full events N/A.
      const hooksDir = path.join(target, 'hooks');
      assert.ok(fs.existsSync(hooksDir), 'codex hooks stub dir must exist');
    },
    readMcpEntry: (target) => {
      // Codex MCP lives in config.toml; expose a synthetic entry {env} so
      // shared assertion runs on a consistent shape.
      const text = fs.readFileSync(path.join(target, 'config.toml'), 'utf8');
      const envMatch = text.match(/\[mcp_servers\.ultra-builder-pro\.env\]([\s\S]*?)(?:\n\[|\n#|$)/);
      assert.ok(envMatch, 'codex config.toml must carry [mcp_servers.ultra-builder-pro.env] block');
      const envBody = envMatch[1];
      const env = {};
      for (const line of envBody.split('\n')) {
        const m = line.match(/^(\w+)\s*=\s*"(.*)"$/);
        if (m) env[m[1]] = m[2];
      }
      return { env };
    },
    identityCheck: (_entry, target) => {
      // Codex identification is the MARKER_BEGIN/END fence, not a sibling field.
      const text = fs.readFileSync(path.join(target, 'config.toml'), 'utf8');
      assert.match(text, /# >>> ultra-builder-pro managed block/, 'codex must keep MARKER_BEGIN');
      assert.match(text, /# <<< ultra-builder-pro managed block/, 'codex must keep MARKER_END');
    },
    readIdempotencyArtifact: (target) => fs.readFileSync(path.join(target, 'config.toml'), 'utf8'),
  };
}

test('codex conformance — command surface', () => {
  const target = mkTarget('codex-cap-cmd');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertCommandSurface(target, cfg);
  } finally { cleanup(target); }
});

test('codex conformance — skills packaging', () => {
  const target = mkTarget('codex-cap-skill');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertSkillsPackaging(target, cfg);
  } finally { cleanup(target); }
});

test('codex conformance — hook stubs (matrix §3 DEGRADED)', () => {
  const target = mkTarget('codex-cap-hook');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertHookConfig(target, cfg);
  } finally { cleanup(target); }
});

test('codex conformance — MCP registration + no env._source leak', () => {
  const target = mkTarget('codex-cap-mcp');
  try {
    const cfg = buildCfg();
    cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
    caps.assertMcpRegistration(target, cfg);
  } finally { cleanup(target); }
});

test('codex conformance — install idempotency (byte-equal)', () => {
  const target = mkTarget('codex-cap-idem');
  try {
    const cfg = buildCfg();
    caps.assertInstallIdempotency(target, cfg);
  } finally { cleanup(target); }
});
