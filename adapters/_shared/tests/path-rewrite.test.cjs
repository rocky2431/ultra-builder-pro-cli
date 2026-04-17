'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  parseSkillRef,
  resolveSkillRef,
  rewriteWorkflowRefInText,
  resolveAssetTarget,
} = require('../path-rewrite.cjs');

test('parseSkillRef accepts canonical @skills/<slug>/SKILL.md only', () => {
  assert.deepEqual(parseSkillRef('@skills/ultra-init/SKILL.md'), {
    name: 'ultra-init',
    filename: 'SKILL.md',
  });
  assert.equal(parseSkillRef('skills/ultra-init/SKILL.md'), null); // missing @
  assert.equal(parseSkillRef('@skills/Bad-Case/SKILL.md'), null);   // uppercase slug
  assert.equal(parseSkillRef(null), null);
});

test('resolveSkillRef routes to runtime-specific root under homeDir', () => {
  const home = '/Users/test';
  const claude = resolveSkillRef('@skills/ultra-init/SKILL.md', { runtime: 'claude', homeDir: home });
  const opencode = resolveSkillRef('@skills/ultra-init/SKILL.md', { runtime: 'opencode', homeDir: home });
  const codex = resolveSkillRef('@skills/ultra-init/SKILL.md', { runtime: 'codex', homeDir: home });
  const gemini = resolveSkillRef('@skills/ultra-init/SKILL.md', { runtime: 'gemini', homeDir: home });

  assert.equal(claude, path.join(home, '.claude/skills/ultra-init/SKILL.md'));
  assert.equal(opencode, path.join(home, '.config/opencode/skills/ultra-init/SKILL.md'));
  assert.equal(codex, path.join(home, '.agents/skills/ultra-init/SKILL.md'));
  assert.equal(gemini, path.join(home, '.gemini/extensions/ultra-builder-pro/skills/ultra-init/SKILL.md'));

  assert.throws(
    () => resolveSkillRef('@skills/ultra-init/SKILL.md', { runtime: 'unknown', homeDir: home }),
    /unknown runtime/,
  );
});

test('rewriteWorkflowRefInText + resolveAssetTarget give predictable paths', () => {
  const home = '/h';
  const cwd = '/w';
  const input = 'see @skills/ultra-init/SKILL.md for details';
  const out = rewriteWorkflowRefInText(input, { runtime: 'claude', homeDir: home });
  assert.equal(out, `see ${path.join(home, '.claude/skills/ultra-init/SKILL.md')} for details`);

  // Cover every runtime × every scope so runtimeRoot/localRoot branches hit
  for (const rt of ['claude', 'opencode', 'codex', 'gemini']) {
    const g = resolveAssetTarget('x', { runtime: rt, scope: 'global', homeDir: home, cwd });
    const l = resolveAssetTarget('x', { runtime: rt, scope: 'local', homeDir: home, cwd });
    assert.ok(g.startsWith(home));
    assert.ok(l.startsWith(cwd));
  }
  assert.throws(
    () => resolveAssetTarget('x', { runtime: 'unknown', scope: 'global', homeDir: home, cwd }),
    /unknown runtime/,
  );
});
