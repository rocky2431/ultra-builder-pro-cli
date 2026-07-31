'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const runtimeAssets = require('../runtime-assets.cjs');
const {
  CORE_PUBLIC_SKILLS,
  PUBLIC_CAPABILITY_GRAPH,
  INTERNAL_AGENT_SKILLS,
  SUPPORTED_RUNTIMES,
  COLLAB_SKILLS_BY_RUNTIME,
  MCP_DEPENDENT_SKILLS,
  RUNTIME_SUPPORT_FILES,
  RUNTIME_WORKER_FILES,
  WORKFLOW_HOOK_FILES,
  skillPolicy,
  skillsForRuntime,
} = runtimeAssets;

const CORE = [
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

const GRAPH_MODES = {
  'ultra-init': 'setup',
  'ultra-research': 'workflow',
  'ultra-plan': 'workflow',
  'ultra-dev': 'workflow',
  'ultra-test': 'workflow',
  'ultra-review': 'workflow',
  'ultra-deliver': 'workflow',
  'ultra-status': 'read_only',
  'ultra-think': 'reasoning',
  'ultra-change': 'workflow',
  'ultra-doctor': 'diagnostic',
};

const INTERNAL = [
  'code-review-expert',
  'security-rules',
  'integration-rules',
  'testing-rules',
];

const MODEL_INVOKED = [
  'ultra-grilling',
  'ultra-domain-modeling',
  'ultra-tdd',
];

test('runtime asset manifest exposes only Ultra-owned core and internal skills', () => {
  assert.deepEqual(CORE_PUBLIC_SKILLS, CORE);
  assert.deepEqual(INTERNAL_AGENT_SKILLS, INTERNAL);
  assert.equal(
    Object.hasOwn(runtimeAssets, 'RETIRED_SKILLS'),
    false,
    'published runtime code must not carry a retired-skill name registry',
  );

  assert.deepEqual(COLLAB_SKILLS_BY_RUNTIME.claude, [
    'codex-collab', 'ultra-verify',
  ]);
  assert.deepEqual(COLLAB_SKILLS_BY_RUNTIME.codex, [
    'cc-collab', 'ultra-verify',
  ]);
  assert.deepEqual(COLLAB_SKILLS_BY_RUNTIME.opencode, [
    'cc-collab', 'codex-collab', 'ultra-verify',
  ]);
  assert.deepEqual(COLLAB_SKILLS_BY_RUNTIME.kimi, [
    'cc-collab', 'codex-collab', 'ultra-verify',
  ]);
  assert.deepEqual(COLLAB_SKILLS_BY_RUNTIME.grok, [
    'cc-collab', 'codex-collab', 'ultra-verify',
  ]);
  assert.deepEqual(SUPPORTED_RUNTIMES, ['claude', 'opencode', 'codex', 'kimi', 'grok']);
  assert.deepEqual(RUNTIME_WORKER_FILES, [
    'session-close-journal-worker.cjs',
    'doctor-backup-worker.cjs',
  ]);
  assert.deepEqual(RUNTIME_SUPPORT_FILES, [
    'archive-mutation-worker.py',
  ]);

  for (const runtime of SUPPORTED_RUNTIMES) {
    const names = skillsForRuntime(runtime);
    assert.ok(names.every((name) => (
      CORE.includes(name)
      || INTERNAL.includes(name)
      || MODEL_INVOKED.includes(name)
      || COLLAB_SKILLS_BY_RUNTIME[runtime].includes(name)
    )));
  }
});

test('model-invoked skills ship on every host, stay file-first, and are never user-routed', () => {
  assert.deepEqual(runtimeAssets.MODEL_INVOKED_SKILLS, MODEL_INVOKED);
  for (const name of MODEL_INVOKED) {
    assert.ok(!CORE_PUBLIC_SKILLS.includes(name), `${name} must not be a public capability`);
    assert.ok(!INTERNAL_AGENT_SKILLS.includes(name), `${name} is reusable discipline, not a worker prompt`);
    assert.ok(!MCP_DEPENDENT_SKILLS.includes(name), `${name} must not require the MCP kernel`);
    const policy = skillPolicy(name);
    assert.equal(policy.userInvocable, false, `${name} is reached by another skill, not by a launcher`);
    assert.equal(policy.requiresUltraMcp, false, name);
    assert.equal(policy.allowImplicitInvocation, false, name);
    for (const runtime of SUPPORTED_RUNTIMES) {
      assert.ok(skillsForRuntime(runtime).includes(name), `${name} is missing from ${runtime}`);
    }
  }
});

test('the public capability graph is exact and every handoff remains explicit', () => {
  assert.deepEqual(Object.keys(PUBLIC_CAPABILITY_GRAPH), CORE);
  assert.equal(Object.keys(PUBLIC_CAPABILITY_GRAPH).length, 11);
  for (const name of CORE) {
    assert.deepEqual(PUBLIC_CAPABILITY_GRAPH[name], {
      mode: GRAPH_MODES[name],
      activation: 'explicit_only',
      next_capability_source: 'host_model_from_ultra_context',
      recommendation_owner: 'host_model',
      selection_owner: 'user',
      automatic_invocation: false,
    }, name);
  }
});

test('host invocation and MCP metadata live outside source SKILL frontmatter', () => {
  const all = new Set(SUPPORTED_RUNTIMES.flatMap((runtime) => skillsForRuntime(runtime)));
  for (const name of all) {
    const policy = skillPolicy(name);
    assert.equal(policy.allowImplicitInvocation, false, name);
    assert.equal(
      policy.userInvocable,
      !INTERNAL_AGENT_SKILLS.includes(name) && !MODEL_INVOKED.includes(name),
      name,
    );
    assert.equal(policy.requiresUltraMcp, MCP_DEPENDENT_SKILLS.includes(name), name);
  }
  assert.throws(() => skillPolicy('not-packaged'), /unknown packaged Ultra skill/);
  assert.ok(MCP_DEPENDENT_SKILLS.includes('ultra-research'));
});

test('packaged collaboration prompts use current CLI contracts and one source prompt', () => {
  const skills = ['codex-collab', 'ultra-verify'];
  for (const name of skills) {
    const text = fs.readFileSync(path.join(REPO_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(text, /codex exec[^\n]*\s-a(?:\s|$)|^\s*-a\s+never/m, name);
    assert.doesNotMatch(text, /The (?:OpenCode|Kimi Code) owns/, name);
  }

  const adapterSource = fs.readFileSync(
    path.join(REPO_ROOT, 'adapters', '_shared', 'codex-assets.cjs'),
    'utf8',
  );
  assert.doesNotMatch(adapterSource, /const (?:CC_COLLAB_BODY|ULTRA_VERIFY_BODY)\s*=/);
});

test('workflow hook allowlist contains no memory, prompt capture, or generic policy hook', () => {
  assert.deepEqual(WORKFLOW_HOOK_FILES, [
    'active_task_context.py',
    'context_envelope.py',
    'health_check.py',
    'pre_stop_check.py',
    'runtime_paths.py',
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

test('runtime documentation matches the canonical host, hook, and agent assets', () => {
  const compatibilityMatrix = fs.readFileSync(
    path.join(REPO_ROOT, 'docs', 'RUNTIME-COMPAT-MATRIX.md'),
    'utf8',
  );
  const workerRow = compatibilityMatrix
    .split('\n')
    .find((line) => line.startsWith('| Bundled review/debug workers |'));
  const workerCells = workerRow?.split('|').slice(1, -1).map((cell) => cell.trim()) || [];
  const bundledAgentCount = fs.readdirSync(path.join(REPO_ROOT, 'agents'))
    .filter((name) => name.endsWith('.md'))
    .length;

  assert.equal(workerCells.length, 6, 'runtime matrix worker row is missing or malformed');
  assert.match(workerCells[3], new RegExp(`\\b${bundledAgentCount}\\b managed TOML agents\\b`));
  assert.match(workerCells[4], new RegExp(`\\b${bundledAgentCount}\\b prompt templates\\b`));
  assert.match(workerCells[5], new RegExp(`\\b${bundledAgentCount}\\b prompt templates\\b`));

  const roadmap = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'ROADMAP.md'), 'utf8');
  const adapterInventory = roadmap;
  const hookInventory = roadmap;

  for (const runtime of SUPPORTED_RUNTIMES) {
    assert.match(
      adapterInventory,
      new RegExp(`(?:├──|└──) ${runtime}\\.js\\b`),
      `ROADMAP adapter inventory missing adapters/${runtime}.js`,
    );
  }
  for (const hook of WORKFLOW_HOOK_FILES) {
    assert.match(
      hookInventory,
      new RegExp(`(?:├──|└──) ${hook.replace('.', '\\.')}\\b`),
      `ROADMAP hook inventory missing hooks/${hook}`,
    );
  }
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
    ...MODEL_INVOKED,
    ...Object.values(COLLAB_SKILLS_BY_RUNTIME).flat(),
  ])].sort();

  assert.ok(!pkg.files.includes('skills'));
  assert.ok(!pkg.files.includes('CLAUDE.md'));
  assert.ok(!pkg.files.includes('AGENTS.md'));
  assert.ok(!pkg.files.includes('skills/learn'));
  assert.ok(!pkg.files.some(
    (entry) => entry === 'output-styles' || entry.startsWith('output-styles/'),
  ));
  assert.ok(!publishedSkills.includes('graphify'));
  assert.deepEqual(publishedSkills, expected);
  assert.equal(pkg.dependencies['@anthropic-ai/sdk'], undefined);
  assert.equal(pkg.dependencies.openai, undefined);
  for (const legacyModule of [
    'workflow-state.cjs',
    'decision-dialogue.cjs',
    'context-spine.cjs',
    'project-breadcrumb.cjs',
    'spec-learning.cjs',
  ]) {
    assert.ok(
      pkg.files.includes(`!mcp-server/lib/${legacyModule}`),
      `npm package must retire mcp-server/lib/${legacyModule}`,
    );
  }
});

test('canonical product documents describe the v0.24 kernel and all five hosts', () => {
  const documents = [
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    'docs/ARCHITECTURE.md',
    'docs/AGENT-CONTEXT.md',
    'docs/WORKFLOW-LIFECYCLE.md',
    'docs/RUNTIME-COMPAT-MATRIX.md',
    'docs/PLUGIN-ISOLATION-CONTRACT.md',
  ].map((relative) => [
    relative,
    fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8'),
  ]);
  for (const [relative, text] of documents) {
    assert.match(text, /Grok Build/, `${relative} must include Grok Build`);
    assert.doesNotMatch(
      text,
      /60 (?:hidden|fine-grained|compatibility)|remain callable but undiscoverable|one compatibility release/i,
      `${relative} must not preserve the retired hidden MCP surface`,
    );
    assert.doesNotMatch(
      text,
      /workflow\.abandon|decision-dialogue\.md/,
      `${relative} must not route current recovery through retired semantic supervision`,
    );
  }
});
