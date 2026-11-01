'use strict';

// v6 package contract (.ultra/decisions/2026-11-01-v6-product-shape.md): Claude Code and
// Codex only; one Skill, `ultra`, whose body is the method; the engine as `ubp`; one
// SessionStart hook that prints the progress line in a v6 project. Everything 5.x-only is
// gone from the branch. Black-box through the installer and the package manifest.

const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'install.js');
const PACKAGE = require('../package.json');

const temporary = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

// A stand-in for the Codex CLI's plugin commands, as the install suite uses.
const HOST_BIN = temporary('ubp-v6-host-bin-');
fs.writeFileSync(path.join(HOST_BIN, 'codex'), `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.CODEX_HOME || process.env.HOME;
const state = path.join(root, '.ubp-test-codex-plugin.json');
const args = process.argv.slice(2);
if (args.join(' ') === 'plugin list --json') {
  const installed = fs.existsSync(state)
    ? [{ name: 'ultra-builder-pro', installed: true, enabled: true }] : [];
  process.stdout.write(JSON.stringify({ installed, available: [] }) + '\\n');
  process.exit(0);
}
if (args[0] === 'plugin' && args[1] === 'add') {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(state, '{}\\n');
  process.stdout.write('{}\\n');
  process.exit(0);
}
if (args[0] === 'plugin' && args[1] === 'remove') {
  fs.rmSync(state, { force: true });
  process.stdout.write('{}\\n');
  process.exit(0);
}
process.stderr.write('unsupported synthetic Codex command: ' + args.join(' ') + '\\n');
process.exit(2);
`);
fs.chmodSync(path.join(HOST_BIN, 'codex'), 0o755);
after(() => fs.rmSync(HOST_BIN, { recursive: true, force: true }));

function run(args, { env = {}, cwd = ROOT, input } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd, input, encoding: 'utf8', timeout: 120000,
    env: { ...process.env,
      PATH: [HOST_BIN, path.dirname(process.execPath), process.env.PATH || ''].join(path.delimiter),
      ...env },
  });
}

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

const body = (markdown) => markdown.replace(/^---\n[\s\S]*?\n---\n/u, '');

function git(root, args) {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null',
    ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

// A minimal v6 project: one requirement, one check, one node.
function v6Project(t) {
  const root = temporary('ubp-v6-project-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'UBP Test']);
  git(root, ['config', 'user.email', 'ubp@example.invalid']);
  const files = {
    '.gitignore': '.ultra/.runtime/\n',
    '.ultra/spec.md': '# Spec\n\n## REQ-001 Say hello\nThe user sees hello.\n',
    '.ultra/checks.json': `${JSON.stringify({ version: 1, checks: [{ id: 'C-1',
      covers: ['REQ-001'], run: 'node -e "console.log(\'pass 1\')"', expect: 'pass 1' }] })}\n`,
    '.ultra/plan.json': `${JSON.stringify({ version: 1,
      milestones: [{ id: 'M1', title: 'Hello', requirements: ['REQ-001'], journey: 'C-1' }],
      nodes: [{ id: 'N-1', milestone: 'M1', title: 'Hello', covers: ['REQ-001'], depends: [] }] })}\n`,
  };
  for (const [relative, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), content);
  }
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'fixture']);
  return root;
}

test('package metadata names v6, Claude Code and Codex only', () => {
  assert.equal(PACKAGE.version, '6.0.0');
  assert.match(PACKAGE.description, /Claude Code/u);
  assert.match(PACKAGE.description, /Codex/u);
  for (const gone of ['OpenCode', 'Kimi', 'Grok', 'ZCode']) {
    assert.doesNotMatch(PACKAGE.description, new RegExp(gone, 'iu'));
    assert.equal((PACKAGE.keywords || []).some((k) => k.toLowerCase().includes(gone.toLowerCase())),
      false, `keyword ${gone}`);
  }
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, '6.0.0');
  assert.equal(lock.packages[''].version, '6.0.0');
});

test('the runtime list is Claude Code and Codex', () => {
  const { SUPPORTED_RUNTIMES } = require('../adapters/_shared/runtime-assets.cjs');
  assert.deepEqual([...SUPPORTED_RUNTIMES], ['claude', 'codex']);
});

test('the only Skill is ultra, and its body is the method', () => {
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'skills')).filter((n) => !n.startsWith('.')),
    ['ultra']);
  const skill = fs.readFileSync(path.join(ROOT, 'skills', 'ultra', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: ultra\n/u);
  assert.match(skill, /\ndescription: \S/u);
  for (const heading of ['## Every session starts the same way', '## Node loop',
    '## Escalation', '## Milestone gate', '## Changes after 0→1', '## Keeping it tidy',
    '## Owner touches', '## Rulings']) {
    assert.ok(body(skill).includes(heading), heading);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'method')), false,
    'the Skill is the single source of the method');
});

test('5.x-only paths are gone from the branch', () => {
  for (const gone of ['adapters/opencode.js', 'adapters/kimi.js', 'adapters/grok.js',
    'adapters/zcode.js', 'bin/run.cjs', 'bin/delegate.cjs', 'bin/delegate-worker.cjs',
    'bin/unified-entry.md', 'hooks/_common.py', 'hooks/session_context.py',
    'hooks/compact_context.py', 'hooks/mid_workflow_recall.py',
    'hooks/block_dangerous_commands.py', 'hooks/post_edit_guard.py', 'hooks/adapters',
    '.ultra-template']) {
    assert.equal(fs.existsSync(path.join(ROOT, gone)), false, gone);
  }
  assert.equal(walk(path.join(ROOT, 'hooks')).some((f) => f.endsWith('.py')), false,
    'no Python hook remains');
});

test('removed hosts and commands are refused and write nothing', () => {
  const config = temporary('ubp-v6-refused-');
  try {
    for (const args of [['--opencode'], ['--kimi'], ['--grok'], ['--zcode'], ['run', 'a goal'],
      ['delegate', 'status']]) {
      const result = run([...args, '--global', '--config-dir', config]);
      assert.notEqual(result.status, 0, `${args.join(' ')}: ${result.stdout}`);
      assert.deepEqual(fs.readdirSync(config), [], args.join(' '));
    }
  } finally {
    fs.rmSync(config, { recursive: true, force: true });
  }
});

test('help lists the two hosts and the engine commands only', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  for (const want of ['--claude', '--codex', '--all', '--doctor', '--uninstall', 'status',
    'gate', 'check', 'node done', 'milestone close', 'context', 'approve', 'retro', 'merge']) {
    assert.ok(help.stdout.includes(want), want);
  }
  for (const gone of ['--opencode', '--kimi', '--grok', '--zcode', 'ubp run', 'delegate']) {
    assert.equal(help.stdout.includes(gone), false, gone);
  }
});

for (const runtime of ['claude', 'codex']) {
  test(`${runtime}: install puts one Skill, the engine and one SessionStart hook inside --config-dir`,
    (t) => {
      const config = temporary(`ubp-v6-${runtime}-`);
      const home = temporary(`ubp-v6-home-${runtime}-`);
      t.after(() => {
        fs.rmSync(config, { recursive: true, force: true });
        fs.rmSync(home, { recursive: true, force: true });
      });
      const args = [`--${runtime}`, '--global', '--config-dir', config];
      const env = { HOME: home };
      const first = run(args, { env });
      assert.equal(first.status, 0, first.stderr || first.stdout);

      const files = walk(config);
      const skills = files.filter((f) => path.basename(f) === 'SKILL.md');
      assert.equal(skills.length, 1, skills.join('\n'));
      const installed = fs.readFileSync(skills[0], 'utf8');
      assert.match(installed, /^---\nname: ultra\n/u);
      const source = body(fs.readFileSync(path.join(ROOT, 'skills', 'ultra', 'SKILL.md'), 'utf8'));
      for (const heading of ['## Node loop', '## Milestone gate']) {
        assert.ok(body(installed).includes(heading), heading);
      }
      assert.ok(source.length > 0);

      // The installed plugin carries the engine, and the installed Skill names its absolute
      // path, so `ubp` works without the npm package on disk.
      const engines = files.filter((f) => f.endsWith(`${path.sep}engine${path.sep}cli.cjs`));
      assert.equal(engines.length, 1, engines.join('\n'));
      assert.ok(installed.includes(engines[0]), 'the installed Skill names the installed engine');
      const project = v6Project(t);
      const engineStatus = spawnSync(process.execPath, [engines[0], 'status', '--root', project],
        { encoding: 'utf8' });
      assert.equal(engineStatus.status, 0, engineStatus.stderr);
      const line = engineStatus.stdout.trim();
      assert.match(line, /^M1 · /u);

      // Exactly one hook: SessionStart.
      const manifests = files.filter((f) => path.basename(f) === 'hooks.json');
      assert.equal(manifests.length, 1, manifests.join('\n'));
      const manifest = JSON.parse(fs.readFileSync(manifests[0], 'utf8'));
      assert.deepEqual(Object.keys(manifest.hooks), ['SessionStart']);
      const commands = manifest.hooks.SessionStart.flatMap((group) => group.hooks)
        .map((hook) => hook.command);
      assert.equal(commands.length, 1, JSON.stringify(manifest));
      const pluginRoot = path.dirname(path.dirname(manifests[0]));
      const command = commands[0].replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
      assert.doesNotMatch(command, /python/iu);

      const hook = (cwd) => spawnSync('/bin/sh', ['-c', command], {
        cwd, encoding: 'utf8', timeout: 60000,
        input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd }),
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PROJECT_DIR: cwd },
      });
      const inProject = hook(project);
      assert.equal(inProject.status, 0, inProject.stderr);
      assert.ok(inProject.stdout.includes(line), `hook output: ${inProject.stdout}`);
      const elsewhere = temporary('ubp-v6-not-a-project-');
      t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
      const outside = hook(elsewhere);
      assert.equal(outside.status, 0, outside.stderr);
      assert.equal(outside.stdout.trim(), '');

      const doctor = run([...args, '--doctor', '--json'], { env });
      assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
      assert.equal(JSON.parse(doctor.stdout).status, 'healthy');

      const before = walk(config).map((f) => path.relative(config, f)).sort();
      const again = run(args, { env });
      assert.equal(again.status, 0, again.stderr || again.stdout);
      assert.deepEqual(walk(config).map((f) => path.relative(config, f)).sort(), before);

      const removed = run([...args, '--uninstall'], { env });
      assert.equal(removed.status, 0, removed.stderr || removed.stdout);
      assert.deepEqual(fs.readdirSync(config), [], `${runtime} left config-dir residue`);
      assert.deepEqual(fs.readdirSync(home), [], `${runtime} escaped config-dir`);
    });
}

test('--all installs both hosts, each in its own namespace', (t) => {
  const config = temporary('ubp-v6-all-');
  const home = temporary('ubp-v6-all-home-');
  t.after(() => {
    fs.rmSync(config, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  const args = ['--all', '--global', '--config-dir', config];
  const installed = run(args, { env: { HOME: home } });
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  assert.equal(walk(config).filter((f) => path.basename(f) === 'SKILL.md').length, 2);
  const doctor = run([...args, '--doctor', '--json'], { env: { HOME: home } });
  assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
  assert.equal(JSON.parse(doctor.stdout).status, 'healthy');
  const removed = run([...args, '--uninstall'], { env: { HOME: home } });
  assert.equal(removed.status, 0, removed.stderr || removed.stdout);
  assert.deepEqual(fs.readdirSync(config), []);
});

test('the package ships the engine, the Skill, two adapters and the hook, and nothing 5.x-only',
  () => {
    const packed = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT,
      encoding: 'utf8', timeout: 120000 });
    assert.equal(packed.status, 0, packed.stderr);
    const paths = JSON.parse(packed.stdout)[0].files.map((f) => f.path);
    for (const want of ['bin/install.js', 'engine/cli.cjs', 'engine/FORMATS.md',
      'skills/ultra/SKILL.md', 'adapters/claude.js', 'adapters/codex.js', 'LICENSE',
      'README.md', 'CHANGELOG.md']) {
      assert.ok(paths.includes(want), want);
    }
    assert.ok(paths.some((p) => p.startsWith('hooks/')), 'the hook is packaged');
    for (const p of paths) {
      assert.doesNotMatch(p, /^skills\/ultra-/u);
      assert.doesNotMatch(p, /^adapters\/(opencode|kimi|grok|zcode)\.js$/u);
      assert.doesNotMatch(p, /\.py$/u);
      assert.doesNotMatch(p, /\.test\.cjs$/u);
      assert.doesNotMatch(p, /^\.ultra-template\//u);
    }
  });
