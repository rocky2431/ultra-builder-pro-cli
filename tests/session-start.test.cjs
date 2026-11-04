'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../hooks/session-start.cjs');
const CLI = path.resolve(__dirname, '../engine/cli.cjs');
// The hook is silent inside a drive's writer or reviewer; these tests run it as a session
// does, even when the suite itself runs inside a drive (review of 97e94dd, 2026-11-04).
delete process.env.UBP_DRIVE;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.ultra'));
  fs.mkdirSync(path.join(root, 'src', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, '.ultra', 'spec.md'),
    '# Spec\n\n## REQ-001 Hello\nSay hello.\n');
  fs.writeFileSync(path.join(root, '.ultra', 'checks.json'), JSON.stringify({
    version: 1, checks: [{ id: 'C-1', covers: ['REQ-001'], run: 'echo pass', expect: 'pass' }],
  }));
  fs.writeFileSync(path.join(root, '.ultra', 'plan.json'), JSON.stringify({
    version: 1,
    milestones: [{ id: 'M1', title: 'Hello', requirements: ['REQ-001'], journey: 'C-1' }],
    nodes: [{ id: 'N-1', milestone: 'M1', title: 'Hello', covers: ['REQ-001'], depends: [] }],
  }));
  for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'fixture']]) {
    const git = spawnSync('git', [
      '-c', 'user.name=UBP Test', '-c', 'user.email=ubp@example.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(git.status, 0, git.stderr);
  }
  const status = spawnSync(process.execPath, [CLI, 'status', '--root', root], {
    encoding: 'utf8',
  });
  assert.equal(status.status, 0, status.stderr);
  return { root, line: status.stdout.trim() };
}

function snapshot(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? snapshot(file) : [[file, fs.readFileSync(file).toString('hex')]];
  });
}

for (const input of ['', '{invalid', JSON.stringify({ cwd: 'src/nested' })]) {
  test(`SessionStart finds an ancestor and falls back on malformed input: ${input}`, (t) => {
    const { root, line } = fixture(t);
    const before = snapshot(root);
    const cwd = path.join(root, 'src', 'nested');
    const value = input.startsWith('{"cwd"') ? JSON.stringify({ cwd }) : input;
    const result = spawnSync(process.execPath, [HOOK], { cwd, input: value, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${line}\nUse the ultra Skill to drive this project.\n`);
    assert.deepEqual(snapshot(root), before, 'the hook must not write files');
  });
}

test('SessionStart honors input cwd and selects the nearest v6 project', (t) => {
  const outer = fixture(t);
  const inner = path.join(outer.root, 'src');
  fs.cpSync(path.join(outer.root, '.ultra'), path.join(inner, '.ultra'), { recursive: true });
  const plan = path.join(inner, '.ultra', 'plan.json');
  fs.writeFileSync(plan, fs.readFileSync(plan, 'utf8').replaceAll('M1', 'M2'));
  for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'nested fixture']]) {
    const git = spawnSync('git', [
      '-c', 'user.name=UBP Test', '-c', 'user.email=ubp@example.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args,
    ], { cwd: inner, encoding: 'utf8' });
    assert.equal(git.status, 0, git.stderr);
  }
  const result = spawnSync(process.execPath, [HOOK], {
    cwd: outer.root, input: JSON.stringify({ cwd: path.join(inner, 'nested') }), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^M2 · /u);
});

test('SessionStart stops reading an open stdin within one second', async (t) => {
  const { root, line } = fixture(t);
  const start = Date.now();
  const child = spawn(process.execPath, [HOOK], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { child.stdin.destroy(); child.kill(); });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 2500);
  const code = await new Promise((resolve) => child.on('close', resolve));
  clearTimeout(timeout);
  assert.equal(code, 0, 'the hook must finish even though stdin remains open');
  assert.ok(Date.now() - start < 2500, 'includes startup and engine status after the 1s read');
  assert.ok(output.includes(line));
});

test('SessionStart is silent outside a v6 project, including malformed input', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-no-project-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [HOOK], {
    cwd: root, input: '{bad', encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.deepEqual(fs.readdirSync(root), []);
});

test('SessionStart is silent inside a drive writer or reviewer', (t) => {
  // A writer the drive starts follows its brief; the method's row for a running drive would
  // tell it to stop (review of 8736647, 2026-11-04).
  const { root } = fixture(t);
  const result = spawnSync(process.execPath, [HOOK], {
    cwd: root, input: '', encoding: 'utf8', env: { ...process.env, UBP_DRIVE: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});
