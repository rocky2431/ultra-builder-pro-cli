'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const gemini = require('../gemini.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function mkTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-gemini-'));
}

test('install packages into extensions/ultra-builder-pro with manifest + commands.toml + skills', () => {
  const target = mkTarget();
  try {
    const r = gemini.install({ configDir: target, repoRoot: REPO_ROOT });
    const extRoot = r.target;
    assert.equal(extRoot, path.join(target, 'extensions', 'ultra-builder-pro'));
    assert.ok(fs.existsSync(path.join(extRoot, 'gemini-extension.json')));
    assert.ok(fs.existsSync(path.join(extRoot, 'GEMINI.md')));
    assert.ok(r.copied.commands.includes('ultra-init.toml'));
    assert.ok(r.copied.skills.some((p) => p.includes('ultra-init/SKILL.md')));

    const tomlContent = fs.readFileSync(path.join(extRoot, 'commands', 'ultra-init.toml'), 'utf8');
    assert.match(tomlContent, /description = "/);
    assert.match(tomlContent, /prompt = """/);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('manifest declares mcpServers with _source tag', () => {
  const target = mkTarget();
  try {
    gemini.install({ configDir: target, repoRoot: REPO_ROOT });
    const extRoot = gemini.resolveExtensionRoot({ configDir: target });
    const manifest = JSON.parse(fs.readFileSync(path.join(extRoot, 'gemini-extension.json'), 'utf8'));
    assert.equal(manifest.name, gemini.EXTENSION_NAME);
    assert.equal(manifest._source, gemini.SOURCE_TAG);
    assert.ok(manifest.mcpServers[gemini.MCP_SERVER_NAME]);
    assert.equal(manifest.mcpServers[gemini.MCP_SERVER_NAME].env._source, gemini.SOURCE_TAG);
    assert.equal(manifest.contextFileName, 'GEMINI.md');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('uninstall removes extension dir; refuses on foreign manifest', () => {
  const target = mkTarget();
  const extRoot = gemini.resolveExtensionRoot({ configDir: target });
  try {
    gemini.install({ configDir: target, repoRoot: REPO_ROOT });
    assert.ok(fs.existsSync(extRoot));
    gemini.uninstall({ configDir: target });
    assert.ok(!fs.existsSync(extRoot));

    // Re-install then tamper with the manifest
    gemini.install({ configDir: target, repoRoot: REPO_ROOT });
    const manifestFile = path.join(extRoot, 'gemini-extension.json');
    const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    m._source = 'someone-else';
    fs.writeFileSync(manifestFile, JSON.stringify(m, null, 2));
    assert.throws(() => gemini.uninstall({ configDir: target }), /refusing to uninstall/);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
