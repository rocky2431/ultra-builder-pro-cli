'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SKILL_ROOT = path.join(ROOT, 'skills');
const { parse } = require('../adapters/_shared/frontmatter.cjs');
const {
  USER_INVOKED_SKILLS,
  MODEL_INVOKED_SKILLS,
  ROUTER_SKILLS,
  skillsForRuntime,
} = require('../adapters/_shared/runtime-assets.cjs');

const ALL = skillsForRuntime('claude');

function skillFile(name) {
  return path.join(SKILL_ROOT, name, 'SKILL.md');
}

function walk(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

test('all fourteen skills use portable minimal frontmatter and the shared authoring shape', () => {
  assert.equal(ALL.length, 14);
  for (const name of ALL) {
    const text = fs.readFileSync(skillFile(name), 'utf8');
    const { fm, body } = parse(text);
    assert.deepEqual(Object.keys(fm).sort(), ['description', 'name'], name);
    assert.equal(fm.name, name);
    assert.ok(String(fm.description).length >= 40, `${name}: weak description`);
    for (const heading of ['Before you start', 'Definition of done', 'When the owner decides', 'References']) {
      assert.match(body, new RegExp(`^## ${heading}$`, 'm'), `${name}: ${heading}`);
    }
    assert.ok(text.split('\n').length <= 120, `${name}: resident prompt is too large`);
    assert.doesNotMatch(text, /[\u3400-\u9fff]/u, `${name}: model-facing text must be English`);
    assert.doesNotMatch(text, /(?:\.claude|\.codex|\.opencode|\.kimi|\.grok)\//, `${name}: host-specific path`);
  }
});

test('every relative skill reference and focused asset resolves', () => {
  const pattern = /`((?:\.\.\/|references\/)[^`\s]+(?:SKILL\.md|\.md|\.py|\.ts|\.sh))`/g;
  for (const name of ALL) {
    const base = path.dirname(skillFile(name));
    const text = fs.readFileSync(skillFile(name), 'utf8');
    for (const match of text.matchAll(pattern)) {
      const target = path.resolve(base, match[1]);
      assert.ok(fs.existsSync(target), `${name}: dangling ${match[1]}`);
    }
  }
});

test('every non-catalog reference is explicitly routed from its Skill or routed index', () => {
  for (const name of ALL) {
    const root = path.join(SKILL_ROOT, name);
    const skill = fs.readFileSync(skillFile(name), 'utf8');
    const references = path.join(root, 'references');
    if (!fs.existsSync(references) || name === 'ultra-research') continue;
    for (const file of walk(references).filter((entry) => /\.(?:md|py|ts|sh)$/.test(entry))) {
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (relative.startsWith('references/templates/') && relative !== 'references/templates/README.md') {
        const index = fs.readFileSync(path.join(references, 'templates', 'README.md'), 'utf8');
        assert.match(index, new RegExp(path.basename(file).replaceAll('.', '\\.')), `${name}: index orphan ${relative}`);
      } else {
        assert.match(skill, new RegExp(relative.replaceAll('.', '\\.')), `${name}: orphan ${relative}`);
      }
    }
  }
});

test('file-first skills and references contain no retired runtime vocabulary', () => {
  const retired = /\bultra\.(?:context|record|checkpoint|sync|session|archive|doctor)\b|state\.db|mcpServers|persistent safety kernel|\.ultra\/tasks\/tasks\.json/i;
  for (const name of ALL) {
    for (const file of walk(path.join(SKILL_ROOT, name)).filter((entry) => /\.(?:md|py|ts|sh)$/.test(entry))) {
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), retired, path.relative(ROOT, file));
    }
  }
});

test('file-first workflows have no orphan semantic ledgers or unnamed output documents', () => {
  const orphanVocabulary = /\.ultra\/drift-log\.md|technical-debt report|\bChange plan\b|## Semantic record/i;
  for (const name of ALL) {
    for (const file of walk(path.join(SKILL_ROOT, name)).filter((entry) => /\.(?:md|py|ts|sh)$/.test(entry))) {
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), orphanVocabulary, path.relative(ROOT, file));
    }
  }
});

test('role boundaries remain explicit without public-workflow chaining', () => {
  for (const caller of USER_INVOKED_SKILLS) {
    const text = fs.readFileSync(skillFile(caller), 'utf8');
    for (const callee of USER_INVOKED_SKILLS) {
      if (caller !== callee) {
        assert.doesNotMatch(text, new RegExp(`\\.\\./${callee}/SKILL\\.md`), `${caller} invokes ${callee}`);
      }
    }
  }
  const callers = Object.fromEntries(MODEL_INVOKED_SKILLS.map((name) => [name, 0]));
  for (const caller of [...USER_INVOKED_SKILLS, ...ROUTER_SKILLS]) {
    const text = fs.readFileSync(skillFile(caller), 'utf8');
    for (const callee of MODEL_INVOKED_SKILLS) {
      if (text.includes(`../${callee}/SKILL.md`) || text.includes(`\`${callee}\``)) callers[callee] += 1;
    }
  }
  for (const [name, count] of Object.entries(callers)) assert.ok(count >= 2, `${name}: ${count} callers`);
});

test('research keeps seventeen evidence lenses and one progressively disclosed wayfinding method', () => {
  const root = path.join(SKILL_ROOT, 'ultra-research', 'references');
  const files = fs.readdirSync(root).filter((name) => name.endsWith('.md')).sort();
  const steps = files.filter((name) => name !== 'wayfinding.md');
  assert.deepEqual(steps, [
    '00-problem-validation.md',
    '01-opportunity-discovery.md',
    '02-market-assessment.md',
    '03-alternatives.md',
    '04-product-strategy.md',
    '05-assumptions-validation.md',
    '10-user-personas.md',
    '11-user-scenarios.md',
    '20-user-stories.md',
    '21-features-scope.md',
    '22-success-metrics.md',
    '30-architecture-context.md',
    '31-solution-strategy.md',
    '32-building-blocks.md',
    '40-deployment.md',
    '41-quality-risks.md',
    '99-synthesis.md',
  ]);
  assert.ok(files.includes('wayfinding.md'));
  const skill = fs.readFileSync(skillFile('ultra-research'), 'utf8');
  assert.match(skill, /Load one reference\s+at a time/i);
  assert.match(skill, /git blob hash/i);
  assert.match(skill, /references\/wayfinding\.md/);
});

test('every enabling template is present and the index maps the real alternatives', () => {
  const root = path.join(SKILL_ROOT, 'ultra-tdd', 'references', 'templates');
  const expected = [
    'feature-flag-default-audit.sh',
    'persistence-real.ts',
    'testcontainer-postgres.py',
    'testcontainer-postgres.ts',
    'vertical-slice.ts',
  ];
  const index = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  for (const name of expected) {
    assert.ok(fs.existsSync(path.join(root, name)), name);
    assert.match(index, new RegExp(name.replaceAll('.', '\\.')));
  }
  assert.match(index, /rule-side examples/i);
  assert.doesNotMatch(index, /\.ultra\/templates|forbidden_patterns/);
});

test('the three-defence fixture is locally green while all three independent defects remain observable', () => {
  const fixture = path.join(__dirname, 'fixtures', 'v026-three-defenses');
  const local = spawnSync(process.execPath, ['--test'], { cwd: fixture, encoding: 'utf8' });
  assert.equal(local.status, 0, local.stderr || local.stdout);

  const task = JSON.parse(
    fs.readFileSync(path.join(fixture, '.ultra', 'tasks.json'), 'utf8'),
  ).tasks[0];
  const context = fs.readFileSync(path.join(fixture, task.context_file), 'utf8');
  assert.match(context, /Persistence only/);
  assert.doesNotMatch(context, /HTTP.*Persistence/is);

  const flags = require(path.join(fixture, 'src', 'flags.js'));
  assert.equal(flags.checkoutEnabled, false);

  const symbol = 'formatCheckoutDebug';
  const nonTests = walk(path.join(fixture, 'src'));
  const consumers = nonTests.filter((file) => {
    if (file.endsWith('unused-export.js')) return false;
    return fs.readFileSync(file, 'utf8').includes(symbol);
  });
  assert.deepEqual(consumers, []);

  const { handleCheckout } = require(path.join(fixture, 'src', 'http.js'));
  assert.equal(handleCheckout({ customerId: 'c-1' }).status, 404);
});
