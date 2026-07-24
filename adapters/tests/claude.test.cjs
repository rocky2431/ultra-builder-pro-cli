'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const claude = require('../claude.js');
const { parse: parseFrontmatter } = require('../_shared/frontmatter.cjs');
const {
  INTERNAL_AGENT_SKILLS,
  skillsForRuntime,
  WORKFLOW_HOOK_FILES,
} = require('../_shared/runtime-assets.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function mkTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-claude-'));
}

function skillNames(root) {
  return fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, 'skills', entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

test('install builds the Claude-native plugin from the explicit Ultra allowlist', () => {
  const parent = mkTarget();
  const target = path.join(parent, 'skills', 'ultra-builder-pro');
  try {
    const report = claude.install({ configDir: parent, repoRoot: REPO_ROOT });
    assert.deepEqual(skillNames(target), skillsForRuntime('claude').sort());
    assert.deepEqual(report.copied.hooks.sort(), WORKFLOW_HOOK_FILES.slice().sort());
    assert.ok(fs.existsSync(path.join(target, '.claude-plugin', 'plugin.json')));
    assert.ok(fs.existsSync(path.join(target, 'hooks', 'hooks.json')));
    assert.ok(fs.existsSync(path.join(target, '.mcp.json')));
    assert.ok(fs.existsSync(path.join(target, 'agents', 'code-reviewer.md')));

    const hooks = JSON.parse(fs.readFileSync(path.join(target, 'hooks', 'hooks.json'), 'utf8'));
    const serialized = JSON.stringify(hooks);
    for (const name of WORKFLOW_HOOK_FILES.filter((value) => value !== 'context_spine.py')) {
      assert.match(serialized, new RegExp(name.replace('.', '\\.')));
    }
    assert.ok(fs.existsSync(path.join(target, 'hooks', 'context_spine.py')));
    assert.doesNotMatch(serialized, /memory|recall|journal|observation_capture|user_prompt_capture|block_dangerous|post_edit_guard/);
    assert.match(serialized, /\$\{CLAUDE_PLUGIN_ROOT\}/);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('Claude plugin collaboration and learn workflows are safe native plugin assets', () => {
  const parent = mkTarget();
  const target = path.join(parent, 'skills', 'ultra-builder-pro');
  try {
    claude.install({ configDir: parent, repoRoot: REPO_ROOT });
    const read = (name) => fs.readFileSync(path.join(target, 'skills', name, 'SKILL.md'), 'utf8');
    const learn = read('learn');
    const codexCollab = read('codex-collab');
    const verify = read('ultra-verify');
    const review = read('ultra-review');
    const plan = read('ultra-plan');
    const status = read('ultra-status');

    assert.match(learn, /`~\/.claude\/skills`/);
    assert.doesNotMatch(learn, /_unverified|learned-[^\s/]*-unverified/i);
    assert.match(codexCollab, /-s read-only/);
    assert.match(codexCollab, /--ephemeral/);
    assert.match(codexCollab, /--ignore-user-config/);
    assert.match(verify, /Keep the current host responsible/);
    assert.match(verify, /installed collaboration companion/);
    assert.doesNotMatch(verify, /codex exec|claude --safe-mode/);
    assert.match(verify, /scripts\/verify_wait\.py/);
    assert.match(review, /Claude Code Task workers/);
    assert.match(review, /scripts\/review_wait\.py/);
    assert.doesNotMatch(plan, /LEGACY_STATE_MIGRATION_REQUIRED|v4\.4|v4\.5/);
    assert.match(plan, /Never read or\s+write .*tasks\.json/i);
    assert.match(status, /Never fall\s+back to generated task JSON/i);
    assert.doesNotMatch(plan, /ultra-tools task create/);

    for (const name of skillsForRuntime('claude')) {
      const contents = read(name);
      const { fm } = parseFrontmatter(contents);
      assert.equal(fm['user-invocable'], !INTERNAL_AGENT_SKILLS.includes(name), name);
      assert.doesNotMatch(contents, /\bgraphify\b/i, `${name} contains an external Skill binding`);
    }

    for (const [name, contents] of Object.entries({ codexCollab, verify })) {
      assert.doesNotMatch(contents, /--yolo|--full-auto|\/codex:/, name);
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('global target is a Claude skills-directory plugin', () => {
  const homeDir = mkTarget();
  try {
    const ctx = { scope: 'global', homeDir };
    assert.equal(claude.resolveTarget(ctx), path.join(homeDir, '.claude'));
    assert.equal(claude.resolvePluginRoot(ctx), path.join(homeDir, '.claude', 'skills', 'ultra-builder-pro'));
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('reinstall is deterministic and uninstall removes only the managed plugin root', () => {
  const parent = mkTarget();
  const target = path.join(parent, 'skills', 'ultra-builder-pro');
  const sibling = path.join(parent, 'user-plugin');
  try {
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(sibling, 'keep.txt'), 'keep');
    claude.install({ configDir: parent, repoRoot: REPO_ROOT });
    claude.install({ configDir: parent, repoRoot: REPO_ROOT });
    claude.uninstall({ configDir: parent });
    assert.ok(!fs.existsSync(target));
    assert.equal(fs.readFileSync(path.join(sibling, 'keep.txt'), 'utf8'), 'keep');
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('install refuses to replace an unmanaged directory', () => {
  const parent = mkTarget();
  const target = path.join(parent, 'skills', 'ultra-builder-pro');
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'user.txt'), 'keep');
    assert.throws(
      () => claude.install({ configDir: parent, repoRoot: REPO_ROOT }),
      /unmanaged Claude plugin/,
    );
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
