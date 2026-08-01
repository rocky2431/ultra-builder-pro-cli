'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SKILLS = path.join(ROOT, 'skills');
const {
  USER_INVOKED_SKILLS,
  MODEL_INVOKED_SKILLS,
  ROUTER_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillsForRuntime,
  skillPolicy,
} = require('../adapters/_shared/runtime-assets.cjs');

const USER = [
  'ultra-init',
  'ultra-research',
  'ultra-change',
  'ultra-plan',
  'ultra-dev',
  'ultra-test',
  'ultra-deliver',
  'ultra-delegate',
];

const MODEL = [
  'ultra-grilling',
  'ultra-domain-modeling',
  'ultra-tdd',
  'ultra-review',
  'ultra-think',
];

const ROUTER = ['ultra-status'];
const ALL = [...USER, ...MODEL, ...ROUTER].sort();

function readSkill(name) {
  return fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8');
}

function walk(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

test('v0.26 exposes exactly fourteen file-first skills in three roles', () => {
  assert.deepEqual(USER_INVOKED_SKILLS, USER);
  assert.deepEqual(MODEL_INVOKED_SKILLS, MODEL);
  assert.deepEqual(ROUTER_SKILLS, ROUTER);
  assert.deepEqual(
    fs.readdirSync(SKILLS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    ALL,
  );
  for (const runtime of ['claude', 'opencode', 'codex', 'kimi', 'grok']) {
    assert.deepEqual(skillsForRuntime(runtime).sort(), ALL, runtime);
  }
  for (const name of USER) {
    assert.equal(skillPolicy(name).userInvocable, true, name);
    assert.equal(skillPolicy(name).allowImplicitInvocation, false, name);
  }
  for (const name of MODEL) {
    assert.equal(skillPolicy(name).userInvocable, false, name);
    assert.equal(skillPolicy(name).allowImplicitInvocation, true, name);
  }
  assert.equal(skillPolicy('ultra-status').userInvocable, true);
});

test('every v0.26 skill is file-first and user workflows restore from repository artifacts', () => {
  const mcpCall = /\bultra\.(?:context|record|checkpoint|sync|session|archive|doctor)\b/;
  for (const name of ALL) {
    assert.doesNotMatch(readSkill(name), mcpCall, name);
  }
  for (const name of USER) {
    const text = readSkill(name);
    for (const anchor of [/`\.ultra\/tasks\.json`/, /context_file/, /`CONTEXT\.md`/, /`\.ultra\/decisions\/`/]) {
      assert.match(text, anchor, `${name} must recover through ${anchor.source}`);
    }
  }
});

test('model-invoked disciplines each have at least two canonical callers', () => {
  const callers = Object.fromEntries(MODEL.map((name) => [name, []]));
  for (const caller of [...USER, ...ROUTER]) {
    const text = readSkill(caller);
    for (const callee of MODEL) {
      if (text.includes(`../${callee}/SKILL.md`) || text.includes(`\`${callee}\``)) {
        callers[callee].push(caller);
      }
    }
  }
  for (const [name, names] of Object.entries(callers)) {
    assert.ok(names.length >= 2, `${name} has only ${names.join(', ') || 'zero'} canonical callers`);
  }
  for (const caller of USER) {
    const text = readSkill(caller);
    for (const callee of USER) {
      if (callee !== caller) {
        assert.doesNotMatch(text, new RegExp(`\\.\\./${callee}/SKILL\\.md`), `${caller} calls user workflow ${callee}`);
      }
    }
  }
});

test('remaining workflows preserve their accepted v0.26 contracts', () => {
  const research = readSkill('ultra-research');
  assert.match(research, /seventeen|17/i);
  assert.match(research, /04-product-strategy[\s\S]*21-features-scope[\s\S]*99-synthesis/);
  assert.match(research, /\[UNVERIFIED: no web access\]/);
  assert.match(research, /git blob hash/i);

  const review = readSkill('ultra-review');
  for (const lens of ['code', 'design', 'errors', 'tests', 'spec', 'comments']) {
    assert.match(review, new RegExp(`references/${lens}\\.md`), `missing ${lens} lens`);
    assert.ok(fs.existsSync(path.join(SKILLS, 'ultra-review', 'references', `${lens}.md`)));
  }
  assert.match(review, /Zero Context Pollution/i);
  assert.match(review, /P0\s*\+\s*P1/i);
  assert.match(review, /ARCHITECTURAL_CONCERN/);
  assert.match(review, /12 findings/i);
  assert.doesNotMatch(review, /confidence[^\n]*(?:threshold|75)/i);
  assert.match(review, /references\/worker-packet\.md/);
  assert.ok(fs.existsSync(path.join(SKILLS, 'ultra-review', 'references', 'worker-packet.md')));

  const think = readSkill('ultra-think');
  for (const marker of ['Fact', 'Inference', 'Speculation', 'Steel Man', 'Pre-Mortem', 'Sensitivity', 'Second-Order', 'What would change my mind']) {
    assert.match(think, new RegExp(marker, 'i'), marker);
  }
  assert.match(think, /fog of war/i);
  assert.match(think, /status:\s*open/);

  const deliver = readSkill('ultra-deliver');
  assert.match(deliver, /test-report\.json/);
  assert.match(deliver, /git_commit/);
  assert.match(deliver, /git mv/);
  assert.match(deliver, /commit[\s\S]*push[\s\S]*tag/i);

  const status = readSkill('ultra-status');
  assert.match(status, /\[NEEDS CLARIFICATION\]/);
  assert.match(status, /test-report[\s\S]*git_commit[\s\S]*HEAD/i);
  assert.match(status, /in_progress[^\n]*3 days/i);
  assert.match(status, /installation health/i);

  const init = readSkill('ultra-init');
  assert.match(init, /assets\/project-template/);
  assert.match(init, /references\/brownfield-adoption\.md/);
  assert.doesNotMatch(init, /Write no `\.ultra\/specs\/`/);

  const routeRows = status.indexOf('| A new request exists and no active Change exists |');
  const emptyTasksRow = status.indexOf('| An active Change exists and `.ultra/tasks.json`');
  assert.ok(routeRows >= 0 && emptyTasksRow > routeRows, 'new requests must open a Change before planning empty tasks');
});

test('project template has one canonical v0.26 artifact layout', () => {
  const expectedFiles = [
    '.gitignore',
    'changes/active/.gitkeep',
    'changes/archive/.gitkeep',
    'contexts/TEMPLATE.md',
    'decisions/.gitkeep',
    'evidence/.gitkeep',
    'north-star.md',
    'research/.gitkeep',
    'specs/architecture.md',
    'specs/discovery.md',
    'specs/product.md',
    'specs/research-distillate.md',
    'tasks.json',
    'test-report.json',
  ];
  const root = path.join(ROOT, '.ultra-template');
  const files = walk(root).map((file) => path.relative(root, file)).sort();
  assert.deepEqual(files, expectedFiles);
  assert.equal(
    fs.readFileSync(path.join(root, '.gitignore'), 'utf8'),
    '.runtime/\nprogress/\nreviews/\n',
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'tasks.json'), 'utf8')), { tasks: [] });
  const report = JSON.parse(fs.readFileSync(path.join(root, 'test-report.json'), 'utf8'));
  assert.equal(report.git_commit, null);
  assert.equal(report.passed, false);
  assert.deepEqual(report.worktree, { dirty: null, diff_digest: null });
  assert.ok(Object.values(report.areas).every((area) => area.status === 'not_run'));
  assert.equal(fs.existsSync(path.join(ROOT, 'templates', '.ultra')), false);
});

test('worktree digest accepts an explicit project from outside the checkout', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-digest-cwd-'));
  try {
    const result = spawnSync(process.execPath, [
      path.join(SKILLS, 'ultra-test', 'scripts', 'worktree_digest.cjs'),
      '--project', ROOT,
    ], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.$schema, 'ultra-worktree-digest-v1');
    assert.equal(report.head, require('node:child_process').execFileSync(
      'git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' },
    ).trim());
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('runtime package has no legacy semantic supervisor or duplicate projection', () => {
  for (const retired of ['mcp-server', 'orchestrator', 'ultra-tools', 'commands', 'agents']) {
    assert.equal(fs.existsSync(path.join(ROOT, retired)), false, retired);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.bin), ['ultra-builder-pro-cli', 'ubp']);
  assert.equal(pkg.dependencies['@modelcontextprotocol/server'], undefined);
  assert.equal(pkg.dependencies['better-sqlite3'], undefined);
  assert.ok(!pkg.files.some((entry) => /^(?:mcp-server|orchestrator|ultra-tools|commands|agents)(?:\/|$)/.test(entry)));
});

test('the runtime allowlist contains the five advisory and safety hooks only', () => {
  assert.deepEqual(WORKFLOW_HOOK_FILES, [
    'session_context.py',
    'mid_workflow_recall.py',
    'compact_context.py',
    'post_edit_guard.py',
    'block_dangerous_commands.py',
  ]);
  for (const name of WORKFLOW_HOOK_FILES) {
    const file = path.join(ROOT, 'hooks', name);
    assert.ok(fs.existsSync(file), name);
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /\.ultra/, `${name} lacks the idle guard`);
  }
});
