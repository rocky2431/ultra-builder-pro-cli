'use strict';

// Phase 4.6b — shared capability-level assertions.
//
// Each runtime's conformance.test.cjs plugs a runtime config object into
// the helpers below and runs 5 capability checks against its adapter.
// Keeping the assertions here avoids copy-paste between 4 runtime files.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const { REPO_ROOT } = require('./_lib.cjs');

function stripTimestamps(s) {
  return s.replace(/"__generated_at":\s*"[^"]+"/g, '"__generated_at": "<t>"');
}

// Capability 1 — Command surface installed with runtime-specific frontmatter
function assertCommandSurface(target, cfg) {
  assert.ok(fs.existsSync(cfg.commandsDir(target)), `commands dir missing at ${cfg.commandsDir(target)}`);
  for (const expected of cfg.expectCommands) {
    const p = path.join(cfg.commandsDir(target), expected);
    assert.ok(fs.existsSync(p), `expected command ${expected} at ${p}`);
    const text = fs.readFileSync(p, 'utf8');
    for (const re of cfg.commandFrontmatterPatterns || []) {
      assert.match(text, re, `command ${expected} missing expected content ${re}`);
    }
  }
}

// Capability 2 — Skills packaging (SKILL.md present + frontmatter readable)
function assertSkillsPackaging(target, cfg) {
  assert.ok(fs.existsSync(cfg.skillsDir(target)), `skills dir missing at ${cfg.skillsDir(target)}`);
  for (const slug of cfg.expectSkills) {
    const p = path.join(cfg.skillsDir(target), slug, 'SKILL.md');
    assert.ok(fs.existsSync(p), `expected skill ${slug} at ${p}`);
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /^---/m, `skill ${slug} missing frontmatter delimiter`);
    assert.match(text, /name:\s*\S+/, `skill ${slug} missing name field`);
  }
}

// Capability 3 — Hook configuration in runtime-native location
function assertHookConfig(target, cfg) {
  if (cfg.hookCheck === 'skip') {
    // Matrix says N/A for this runtime (Gemini) — documented graceful no-op.
    return;
  }
  cfg.hookCheck(target);
}

// Capability 4 — MCP server registered + no _source leakage in env (D45)
function assertMcpRegistration(target, cfg) {
  const entry = cfg.readMcpEntry(target);
  assert.ok(entry, 'MCP entry not found');
  assert.ok(entry.env, 'MCP entry has no env block');
  assert.equal(entry.env._source, undefined, 'env must not leak _source (D45)');
  if (cfg.identityCheck) cfg.identityCheck(entry, target);
}

// Capability 5 — Install idempotency: second install yields byte-equal output
function assertInstallIdempotency(target, cfg) {
  cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
  const first = cfg.readIdempotencyArtifact(target);
  cfg.adapter.install({ configDir: target, repoRoot: REPO_ROOT });
  const second = cfg.readIdempotencyArtifact(target);
  assert.equal(stripTimestamps(second), stripTimestamps(first), 'second install must be byte-equal (timestamps stripped)');
}

module.exports = {
  stripTimestamps,
  assertCommandSurface,
  assertSkillsPackaging,
  assertHookConfig,
  assertMcpRegistration,
  assertInstallIdempotency,
};
