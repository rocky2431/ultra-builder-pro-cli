'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const codex = require('../codex.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function mkTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-codex-'));
}

test('install copies skills/prompts/hooks + writes config.toml managed block', () => {
  const target = mkTarget();
  try {
    const r = codex.install({ configDir: target, repoRoot: REPO_ROOT });
    assert.ok(r.copied.skills.some((p) => p.includes('ultra-init/SKILL.md')));
    assert.ok(r.copied.prompts.includes('ultra-init.md'));
    assert.ok(r.copied.hooks.includes('post_edit_guard.py'));

    const toml = fs.readFileSync(path.join(target, 'config.toml'), 'utf8');
    assert.match(toml, />>> ultra-builder-pro managed block/);
    assert.match(toml, /\[mcp_servers\.ultra-builder-pro\]/);
    assert.match(toml, /command = "/);
    assert.match(toml, /\[mcp_servers\.ultra-builder-pro\.env\]/);
    assert.match(toml, /UBP_DB_PATH = "/);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install preserves user-authored config.toml content around managed block', () => {
  const target = mkTarget();
  const configFile = path.join(target, 'config.toml');
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(configFile, '[profile]\nname = "dev"\n\n[mcp_servers.mine]\ncommand = "node"\n');

    codex.install({ configDir: target, repoRoot: REPO_ROOT });
    const merged = fs.readFileSync(configFile, 'utf8');
    assert.match(merged, /name = "dev"/);
    assert.match(merged, /\[mcp_servers\.mine\]/);
    assert.match(merged, /\[mcp_servers\.ultra-builder-pro\]/);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install is byte-equal on re-run (P1 #2 idempotency)', () => {
  const target = mkTarget();
  const configFile = path.join(target, 'config.toml');
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(configFile, '[profile]\nname = "dev"\n');
    codex.install({ configDir: target, repoRoot: REPO_ROOT });
    const first = fs.readFileSync(configFile, 'utf8');
    codex.install({ configDir: target, repoRoot: REPO_ROOT });
    const second = fs.readFileSync(configFile, 'utf8');
    assert.equal(second, first, 'second install should produce byte-equal config.toml');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install is idempotent + uninstall strips only managed block', () => {
  const target = mkTarget();
  const configFile = path.join(target, 'config.toml');
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(configFile, '[profile]\nname = "dev"\n');

    codex.install({ configDir: target, repoRoot: REPO_ROOT });
    const firstLen = fs.readFileSync(configFile, 'utf8').length;
    codex.install({ configDir: target, repoRoot: REPO_ROOT });
    const secondLen = fs.readFileSync(configFile, 'utf8').length;
    assert.equal(secondLen, firstLen, 'idempotent install should not grow the file');

    codex.uninstall({ configDir: target });
    const after = fs.readFileSync(configFile, 'utf8');
    assert.match(after, /name = "dev"/);
    assert.ok(!after.includes('ultra-builder-pro managed block'));
    assert.ok(!after.includes('[mcp_servers.ultra-builder-pro]'));
    assert.ok(!fs.existsSync(path.join(target, 'skills')));
    assert.ok(!fs.existsSync(path.join(target, 'prompts')));
    assert.ok(!fs.existsSync(path.join(target, 'hooks')));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

// P2 #4 / D45: TOML basic-string escape must cover newline + control chars,
// otherwise paths containing those bytes produce invalid TOML that Codex
// rejects on startup.
test('tomlEscape covers newline / tab / control / quote / backslash', () => {
  const { _internal } = codex;
  // Build a tiny artificial fragment so we can inspect the escape result.
  // The real buildMcpBlock also wraps in markers, but here we want the
  // isolated tomlEscape output. Re-export via _internal if you add a helper.
  const fragment = _internal.buildMcpBlock('/repo', '/weird\ndir\twith\x01ctl"end');
  assert.match(fragment, /\\n/, 'newline must escape to \\\\n');
  assert.match(fragment, /\\t/, 'tab must escape to \\\\t');
  assert.match(fragment, /\\u0001/, 'control byte must escape to \\\\u0001');
  assert.match(fragment, /\\"/, 'double quote must escape to \\\\"');
  assert.ok(!fragment.includes('\n/weird'), 'raw newline must not appear inside quoted values');
});
