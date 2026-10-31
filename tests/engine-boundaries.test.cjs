'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '../engine/cli.cjs');

function fixture(t, check = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-boundaries-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=UBP Test', '-c', 'user.email=ubp@example.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  git('init', '-q');
  fs.mkdirSync(path.join(root, '.ultra'));
  const files = {
    '.ultra/spec.md': '## REQ-1 Example\nThe command passes.\n',
    '.ultra/checks.json': JSON.stringify({ version: 1, checks: [{ id: 'C1', covers: ['REQ-1'], run: 'echo pass', expect: 'pass', ...check }] }),
    '.ultra/plan.json': JSON.stringify({ version: 1,
      milestones: [{ id: 'M1', title: 'Example', requirements: ['REQ-1'] }],
      nodes: [{ id: 'N1', milestone: 'M1', title: 'Example', covers: ['REQ-1'], depends: [] }] }),
    'zz ': 'A tracked path ending with a space.\n',
  };
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(root, name), content);
  git('add', '-A');
  git('commit', '-qm', 'fixture');
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args, '--root', root, '--json'], { encoding: 'utf8', timeout: 8000 });
  return { root, git, run };
}

test('a null timeout is a malformed check, not the default timeout', (t) => {
  const fx = fixture(t, { timeout_sec: null });
  const result = fx.run('status');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /checks\.json.*timeout_sec/u);
});

test('code fingerprints preserve significant whitespace in Git tree entries', (t) => {
  const fx = fixture(t);
  const result = fx.run('check');
  assert.equal(result.status, 0, result.stderr);
  const entries = fx.git('ls-tree', '--full-tree', '-z', 'HEAD').split('\0')
    .filter((entry) => entry && entry.slice(entry.indexOf('\t') + 1) !== '.ultra');
  const expected = createHash('sha256').update(entries.map((entry) => `${entry}\0`).join('')).digest('hex');
  const record = JSON.parse(fs.readFileSync(path.join(fx.root, '.ultra/ledger/evidence.jsonl'), 'utf8').trim());
  assert.equal(record.code, expected);
});

test('expect and full logs preserve UTF-8 characters split across output chunks', (t) => {
  const program = "const b=Buffer.from('验证通过'); process.stdout.write(b.subarray(0,1)); setTimeout(()=>process.stdout.write(b.subarray(1)),100);";
  const fx = fixture(t, { run: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(program)}`, expect: '验证通过' });
  const result = fx.run('check');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const record = JSON.parse(fs.readFileSync(path.join(fx.root, '.ultra/ledger/evidence.jsonl'), 'utf8').trim());
  assert.equal(fs.readFileSync(path.join(fx.root, record.log), 'utf8'), '验证通过');
});

test('shell exit kills descendants holding pipes and returns promptly', async (t) => {
  const fx = fixture(t, { run: `${JSON.stringify(process.execPath)} -e 'setTimeout(()=>{},30000)' & echo $! > .ultra/child.pid`, timeout_sec: 1 });
  const started = Date.now();
  const result = fx.run('check');
  const pid = Number(fs.readFileSync(path.join(fx.root, '.ultra/child.pid'), 'utf8'));
  t.after(() => {
    if (pid > 0) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
  });
  assert.ok(Date.now() - started < 5000);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(result.signal, null);
  assert.deepEqual(JSON.parse(result.stdout).runs.map((r) => [r.outcome, r.reason]), [['unknown', 'expect-unmet']]);
  assert.ok(pid > 0);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); }
    catch (error) {
      assert.equal(error.code, 'ESRCH');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('unrelated check fields cannot hide unknown requirement references', (t) => {
  const fx = fixture(t, { covers: ['REQ-missing'], requirements: [] });
  const result = fx.run('gate');
  assert.equal(result.status, 1);
  assert(JSON.parse(result.stdout).problems.some((p) => p.code === 'unknown-requirement' && p.message.includes('REQ-missing')));
});

test('unrelated plan fields cannot replace the validated check registry', (t) => {
  const fx = fixture(t);
  const file = path.join(fx.root, '.ultra/plan.json');
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...plan, checks: [] }));
  const result = fx.run('gate');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
});
