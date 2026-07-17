'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const {
  CORE_PUBLIC_SKILLS,
  INTERNAL_AGENT_SKILLS,
  SUPPORTED_RUNTIMES,
  COLLAB_SKILLS_BY_RUNTIME,
  RETIRED_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillsForRuntime,
} = require('../runtime-assets.cjs');

const CORE = [
  'learn',
  'ultra-init',
  'ultra-research',
  'ultra-plan',
  'ultra-dev',
  'ultra-test',
  'ultra-review',
  'ultra-deliver',
  'ultra-status',
  'ultra-think',
  'ultra-change',
  'ultra-doctor',
];

const INTERNAL = [
  'code-review-expert',
  'security-rules',
  'integration-rules',
  'testing-rules',
];

const RETIRED = [
  'agent-browser',
  'find-skills',
  'recall',
  'use-railway',
  'vercel-composition-patterns',
  'vercel-react-best-practices',
  'vercel-react-native-skills',
];

test('runtime asset manifest exposes only Ultra-owned core and internal skills', () => {
  assert.deepEqual(CORE_PUBLIC_SKILLS, CORE);
  assert.deepEqual(INTERNAL_AGENT_SKILLS, INTERNAL);
  assert.deepEqual(RETIRED_SKILLS, RETIRED);

  assert.deepEqual(COLLAB_SKILLS_BY_RUNTIME.claude, [
    'codex-collab', 'ultra-verify',
  ]);
  assert.deepEqual(COLLAB_SKILLS_BY_RUNTIME.codex, [
    'cc-collab', 'ultra-verify',
  ]);
  assert.deepEqual(COLLAB_SKILLS_BY_RUNTIME.opencode, [
    'cc-collab', 'codex-collab', 'ultra-verify',
  ]);
  assert.deepEqual(SUPPORTED_RUNTIMES, ['claude', 'opencode', 'codex']);

  for (const runtime of SUPPORTED_RUNTIMES) {
    const names = skillsForRuntime(runtime);
    for (const retired of RETIRED) assert.ok(!names.includes(retired));
    assert.ok(!names.some((name) => /impeccable/i.test(name)));
  }
});

test('code-review-expert and rule skills are internal, never implicitly exposed', () => {
  const codexAssets = fs.readFileSync(path.join(REPO_ROOT, 'adapters', '_shared', 'codex-assets.cjs'), 'utf8');
  assert.match(codexAssets, /const INTERNAL_SKILLS = new Set\(INTERNAL_AGENT_SKILLS\)/);
  assert.match(codexAssets, /INTERNAL_SKILLS\.has\(name\)/);
});

test('workflow hook allowlist contains no memory, prompt capture, or generic policy hook', () => {
  assert.deepEqual(WORKFLOW_HOOK_FILES, [
    'active_task_context.py',
    'health_check.py',
    'pre_stop_check.py',
    'subagent_tracker.py',
    'workflow_checkpoint.py',
    'workflow_context.py',
    'workflow_resume.py',
  ]);
  assert.doesNotMatch(WORKFLOW_HOOK_FILES.join('\n'), /memory|recall|journal|observation|prompt|dangerous|post_edit/);
});

test('bundled agents never instruct workers to own persistent memory', () => {
  const agentsDir = path.join(REPO_ROOT, 'agents');
  const agentText = fs.readdirSync(agentsDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => fs.readFileSync(path.join(agentsDir, name), 'utf8'))
    .join('\n');

  assert.doesNotMatch(agentText, /^## Memory$/m);
  assert.doesNotMatch(agentText, /Update your project memory|Consult memory before starting work/);
  assert.doesNotMatch(agentText, /\.ultra\/memory|\/recall(?:\s|`|$)/m);
});

test('npm publish list uses the same explicit skill boundary', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const publishedSkills = pkg.files
    .filter((entry) => entry.startsWith('skills/'))
    .map((entry) => entry.slice('skills/'.length))
    .sort();
  const expected = [...new Set([
    ...CORE_PUBLIC_SKILLS,
    ...INTERNAL_AGENT_SKILLS,
    ...Object.values(COLLAB_SKILLS_BY_RUNTIME).flat(),
  ])].sort();

  assert.ok(!pkg.files.includes('skills'));
  assert.ok(!pkg.files.includes('CLAUDE.md'));
  assert.deepEqual(publishedSkills, expected);
});
