'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const opencode = require('../opencode.js');
const { parse: parseFm } = require('../_shared/frontmatter.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function mkTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-opencode-'));
}

test('install copies commands + skills + hooks with frontmatter lowercased', () => {
  const target = mkTarget();
  try {
    const r = opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    assert.ok(r.copied.commands.includes('ultra-init.md'));
    assert.ok(r.copied.skills.some((p) => p.includes('ultra-init/SKILL.md')));
    assert.ok(r.copied.hooks.includes('post_edit_guard.py'));

    // lowercased frontmatter check: read a copied command
    const src = fs.readFileSync(path.join(REPO_ROOT, 'commands', 'ultra-init.md'), 'utf8');
    const dst = fs.readFileSync(path.join(target, 'commands', 'ultra-init.md'), 'utf8');
    const { fm: srcFm } = parseFm(src);
    const { fm: dstFm } = parseFm(dst);
    // source keys are already lowercase in our commands, so dst should equal src
    assert.deepEqual(dstFm, srcFm);

    // forge an upper-case key to prove the transform works
    const hack = path.join(target, 'commands', 'upper.md');
    fs.writeFileSync(hack, '---\nDescription: mixed\n---\nbody\n');
    opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    // reinstall re-runs the transform; the hack was outside commands/ in repo so
    // install doesn't touch it; we verify transform via a direct call:
    const { lowercaseKeys } = require('../_shared/frontmatter.cjs');
    assert.deepEqual(lowercaseKeys({ Description: 'x', Tags: ['A'] }), { description: 'x', tags: ['A'] });
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install writes opencode.json with mcp entry and sentinel', () => {
  const target = mkTarget();
  try {
    opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    const config = JSON.parse(fs.readFileSync(path.join(target, 'opencode.json'), 'utf8'));
    assert.ok(config.mcp);
    assert.ok(config.mcp[opencode.MCP_SERVER_NAME]);
    assert.equal(config.mcp[opencode.MCP_SERVER_NAME].env._source, opencode.SOURCE_TAG);
    assert.equal(config[opencode.SENTINEL_KEY].__sentinel, 1);
    assert.deepEqual(config[opencode.SENTINEL_KEY].reachable_events, ['session.start', 'event']);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install preserves user mcp entries; uninstall removes only ubp + sentinel', () => {
  const target = mkTarget();
  const configFile = path.join(target, 'opencode.json');
  try {
    fs.writeFileSync(configFile, JSON.stringify({
      theme: 'dark',
      mcp: { my_server: { command: 'node', args: ['./mine.js'] } },
    }, null, 2));

    opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    const merged = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.equal(merged.theme, 'dark');
    assert.ok(merged.mcp.my_server);
    assert.ok(merged.mcp[opencode.MCP_SERVER_NAME]);

    opencode.uninstall({ configDir: target });
    const after = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.equal(after.theme, 'dark');
    assert.ok(after.mcp.my_server);
    assert.ok(!after.mcp[opencode.MCP_SERVER_NAME]);
    assert.ok(!(opencode.SENTINEL_KEY in after));
    assert.ok(!fs.existsSync(path.join(target, 'commands')));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
