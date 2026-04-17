'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const claude = require('../claude.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function mkTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-claude-'));
}

test('install copies commands/skills/hooks into target', () => {
  const target = mkTarget();
  try {
    const r = claude.install({ configDir: target, repoRoot: REPO_ROOT });
    assert.equal(r.target, target);
    assert.ok(r.copied.commands.includes('ultra-init.md'));
    assert.ok(r.copied.skills.some((p) => p.includes('ultra-init/SKILL.md')));
    assert.ok(r.copied.hooks.includes('post_edit_guard.py'));
    assert.ok(fs.existsSync(path.join(target, 'commands', 'ultra-init.md')));
    assert.ok(fs.existsSync(path.join(target, 'skills', 'ultra-init', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(target, 'hooks', 'post_edit_guard.py')));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install merges settings.json — user data preserved, ubp hooks tagged, mcpServers registered', () => {
  const target = mkTarget();
  const settingsFile = path.join(target, 'settings.json');
  try {
    // pre-existing user settings
    const userSettings = {
      user_only: 'keep-me',
      env: { USER_VAR: '1' },
      hooks: {
        PostToolUse: [
          { matcher: 'Edit', hooks: [{ type: 'command', command: 'user-hook.sh', timeout: 10 }] },
        ],
      },
      mcpServers: { my_existing_mcp: { command: 'node', args: ['./mine.js'] } },
    };
    fs.writeFileSync(settingsFile, JSON.stringify(userSettings, null, 2));

    claude.install({ configDir: target, repoRoot: REPO_ROOT });

    const merged = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    assert.equal(merged.user_only, 'keep-me');
    assert.equal(merged.env.USER_VAR, '1');
    assert.ok(merged.mcpServers.my_existing_mcp);
    assert.ok(merged.mcpServers[claude.MCP_SERVER_NAME]);
    assert.equal(merged.mcpServers[claude.MCP_SERVER_NAME].env._source, claude.SOURCE_TAG);

    // user's PostToolUse hook preserved; ubp hooks added
    const postToolUse = merged.hooks.PostToolUse;
    const userHookMatcher = postToolUse.find((m) =>
      m.hooks.some((h) => h.command === 'user-hook.sh'),
    );
    assert.ok(userHookMatcher, 'user hook should be preserved');
    const ubpHookMatcher = postToolUse.find((m) =>
      m.hooks.some((h) => h._source === claude.SOURCE_TAG),
    );
    assert.ok(ubpHookMatcher, 'ubp hook should be inserted');

    // sentinel block present
    assert.equal(merged[claude.SENTINEL_KEY].__sentinel, 1);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install is idempotent — running twice yields byte-equal settings.json', () => {
  const target = mkTarget();
  const settingsFile = path.join(target, 'settings.json');
  try {
    claude.install({ configDir: target, repoRoot: REPO_ROOT });
    const first = fs.readFileSync(settingsFile, 'utf8');
    // Strip the timestamp from sentinel for comparison (it changes per run)
    const stripTs = (s) => s.replace(/"__generated_at": "[^"]+"/g, '"__generated_at": "<t>"');

    claude.install({ configDir: target, repoRoot: REPO_ROOT });
    const second = fs.readFileSync(settingsFile, 'utf8');

    assert.equal(stripTs(second), stripTs(first));
    // commands untouched
    assert.ok(fs.existsSync(path.join(target, 'commands', 'ultra-init.md')));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('uninstall refuses to delete user-owned directories missing .ubp-managed sentinel', () => {
  const target = mkTarget();
  try {
    // User had their own commands/ that we should not touch
    const userCommands = path.join(target, 'commands');
    fs.mkdirSync(userCommands, { recursive: true });
    fs.writeFileSync(path.join(userCommands, 'user-cmd.md'), '---\ndescription: user\n---\n');

    // Simulate a prior install adding our sentinel block but (somehow) without marking
    // commands/ managed — e.g. commands/.ubp-managed manually removed.
    fs.writeFileSync(path.join(target, 'settings.json'), JSON.stringify({
      _ubp_manifest: { __sentinel: 1, hook_events: [], mcp_server_name: claude.MCP_SERVER_NAME },
    }, null, 2));

    claude.uninstall({ configDir: target });

    // commands/ untouched because no .ubp-managed file was present
    assert.ok(fs.existsSync(userCommands));
    assert.ok(fs.existsSync(path.join(userCommands, 'user-cmd.md')));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('uninstall removes ubp assets and strips sentinel while preserving user data', () => {
  const target = mkTarget();
  const settingsFile = path.join(target, 'settings.json');
  try {
    const userSettings = {
      user_only: 'keep-me',
      hooks: {
        PostToolUse: [
          { matcher: 'Edit', hooks: [{ type: 'command', command: 'user-hook.sh', timeout: 10 }] },
        ],
      },
    };
    fs.writeFileSync(settingsFile, JSON.stringify(userSettings, null, 2));

    claude.install({ configDir: target, repoRoot: REPO_ROOT });
    claude.uninstall({ configDir: target });

    const after = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    assert.equal(after.user_only, 'keep-me');
    assert.ok(!(claude.SENTINEL_KEY in after));
    // user hook preserved; ubp hooks gone
    const userHook = after.hooks.PostToolUse.find((m) =>
      m.hooks.some((h) => h.command === 'user-hook.sh'),
    );
    assert.ok(userHook);
    const anyUbpHook = after.hooks.PostToolUse.some((m) =>
      m.hooks.some((h) => h._source === claude.SOURCE_TAG),
    );
    assert.ok(!anyUbpHook);
    // mcp ubp entry removed
    assert.ok(!after.mcpServers || !after.mcpServers[claude.MCP_SERVER_NAME]);

    // assets removed
    assert.ok(!fs.existsSync(path.join(target, 'commands')));
    assert.ok(!fs.existsSync(path.join(target, 'skills')));
    assert.ok(!fs.existsSync(path.join(target, 'hooks')));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
