'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');

const { initProject, InitProjectError, DEFAULT_TEMPLATE } = require('../lib/init-project.cjs');
const { EXPECTED_VERSION } = require('../lib/state-db.cjs');

function mkTempDir(prefix = 'ubp-init-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

test('initProject copies bundled template into .ultra/', () => {
  const target = mkTempDir();
  try {
    const r = initProject({
      target_dir: target,
      project_name: 'demo',
      project_type: 'cli',
      stack: 'node',
    });
    assert.equal(r.status, 'created');
    assert.equal(r.mode, 'greenfield');
    assert.equal(r.created_path, path.join(target, '.ultra'));
    assert.ok(r.copied_files.includes('tasks/tasks.json'));
    assert.ok(r.copied_files.includes('specs/product.md'));
    assert.ok(r.copied_files.includes('changes/active/.gitkeep'));
    assert.ok(r.copied_files.includes('changes/archive/.gitkeep'));
    assert.equal(r.state_db_path, path.join(target, '.ultra', 'state.db'));
    assert.ok(fs.existsSync(r.state_db_path));
    const db = new Database(r.state_db_path, { readonly: true });
    try {
      const version = db.prepare('SELECT version FROM schema_version WHERE version = ?').get(EXPECTED_VERSION);
      assert.equal(version.version, EXPECTED_VERSION);
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'changes'").get());
      const baseline = db.prepare('SELECT mode, status, project_name FROM baselines').get();
      assert.deepEqual(baseline, { mode: 'greenfield', status: 'draft', project_name: 'demo' });
    } finally {
      db.close();
    }
    assert.ok(!r.copied_files.some((f) => f.endsWith('.DS_Store')));
  } finally { cleanup(target); }
});

test('initProject auto-detects existing source as brownfield and starts adoption', () => {
  const target = mkTempDir();
  try {
    fs.mkdirSync(path.join(target, 'src'));
    fs.writeFileSync(path.join(target, 'package.json'), '{"name":"legacy-app"}\n');
    fs.writeFileSync(path.join(target, 'src', 'index.js'), 'module.exports = true;\n');
    const result = initProject({ target_dir: target, project_name: 'legacy-app' });
    assert.equal(result.mode, 'brownfield');
    const db = new Database(result.state_db_path, { readonly: true });
    try {
      const baseline = db.prepare('SELECT mode, status, scope_json FROM baselines').get();
      assert.equal(baseline.mode, 'brownfield');
      assert.equal(baseline.status, 'adopting');
      assert.deepEqual(JSON.parse(baseline.scope_json), ['.']);
    } finally {
      db.close();
    }
  } finally { cleanup(target); }
});

test('maintenance CLI forwards an explicit initialization mode', () => {
  const target = mkTempDir();
  try {
    fs.writeFileSync(path.join(target, 'README.md'), '# Intentional greenfield notes\n');
    const output = execFileSync(process.execPath, [
      path.resolve(__dirname, '..', '..', 'ultra-tools', 'cli.cjs'),
      'task', 'init-project', '--target-dir', target, '--project-name', 'explicit-mode',
      '--mode', 'greenfield',
    ], { encoding: 'utf8' });
    const envelope = JSON.parse(output);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.mode, 'greenfield');
  } finally { cleanup(target); }
});

test('initProject keeps project metadata in authoritative baseline state and tasks.json as a projection', () => {
  const target = mkTempDir();
  try {
    initProject({
      target_dir: target,
      project_name: 'meta-demo',
      project_type: 'web',
      stack: 'next',
    });
    const tasksJson = JSON.parse(fs.readFileSync(path.join(target, '.ultra', 'tasks', 'tasks.json'), 'utf8'));
    assert.equal(tasksJson.schema_version, '4.5');
    assert.equal(tasksJson.source, '.ultra/state.db');
    assert.deepEqual(tasksJson.tasks, []);
    assert.equal('project' in tasksJson, false);
    const db = new Database(path.join(target, '.ultra', 'state.db'), { readonly: true });
    try {
      const baseline = db.prepare('SELECT project_name, project_type, stack FROM baselines').get();
      assert.deepEqual(baseline, { project_name: 'meta-demo', project_type: 'web', stack: 'next' });
    } finally {
      db.close();
    }
  } finally { cleanup(target); }
});

test('initProject refuses when .ultra/ already exists and overwrite=false', () => {
  const target = mkTempDir();
  try {
    initProject({ target_dir: target, project_name: 'first' });
    assert.throws(
      () => initProject({ target_dir: target, project_name: 'again' }),
      (err) => err instanceof InitProjectError && err.code === 'ULTRA_DIR_EXISTS',
    );
  } finally { cleanup(target); }
});

test('initProject with overwrite=true backs up existing .ultra/', () => {
  const target = mkTempDir();
  try {
    initProject({ target_dir: target, project_name: 'first' });
    const sentinel = path.join(target, '.ultra', 'sentinel.txt');
    fs.writeFileSync(sentinel, 'before-backup');

    const r = initProject({ target_dir: target, project_name: 'second', overwrite: true });
    assert.equal(r.status, 'overwritten');
    assert.ok(r.backup_path);
    assert.ok(fs.existsSync(path.join(r.backup_path, 'sentinel.txt')));
    assert.equal(
      fs.readFileSync(path.join(r.backup_path, 'sentinel.txt'), 'utf8'),
      'before-backup',
    );
    assert.ok(!fs.existsSync(sentinel));
  } finally { cleanup(target); }
});

test('initProject restores the prior .ultra when overwrite initialization fails', () => {
  const target = mkTempDir();
  const badTemplate = mkTempDir('ubp-bad-template-');
  try {
    initProject({ target_dir: target, project_name: 'first' });
    fs.writeFileSync(path.join(target, '.ultra', 'sentinel.txt'), 'restore-me');
    fs.cpSync(DEFAULT_TEMPLATE, badTemplate, { recursive: true });
    fs.writeFileSync(path.join(badTemplate, 'tasks', 'tasks.json'), '{not-json\n');

    assert.throws(
      () => initProject({
        target_dir: target,
        project_name: 'broken-overwrite',
        overwrite: true,
        source_template: badTemplate,
      }),
      (error) => error instanceof InitProjectError && error.code === 'IO_ERROR',
    );
    assert.equal(
      fs.readFileSync(path.join(target, '.ultra', 'sentinel.txt'), 'utf8'),
      'restore-me',
    );
    assert.equal(
      fs.readdirSync(target).some((name) => name.startsWith('.ultra.backup.')),
      false,
    );
  } finally {
    cleanup(target);
    cleanup(badTemplate);
  }
});

test('initProject rejects empty project_name', () => {
  const target = mkTempDir();
  try {
    assert.throws(
      () => initProject({ target_dir: target, project_name: '' }),
      (err) => err instanceof InitProjectError && err.code === 'VALIDATION_ERROR',
    );
  } finally { cleanup(target); }
});

test('initProject rejects missing source_template', () => {
  const target = mkTempDir();
  try {
    assert.throws(
      () => initProject({
        target_dir: target,
        project_name: 'demo',
        source_template: '/tmp/does-not-exist-ubp-init',
      }),
      (err) => err instanceof InitProjectError && err.code === 'TEMPLATE_MISSING',
    );
  } finally { cleanup(target); }
});

test('initProject surface TARGET_NOT_DIR when target_dir is a file', () => {
  const parent = mkTempDir();
  const filePath = path.join(parent, 'not-a-dir.txt');
  fs.writeFileSync(filePath, 'x');
  try {
    assert.throws(
      () => initProject({ target_dir: filePath, project_name: 'demo' }),
      (err) => err instanceof InitProjectError && err.code === 'TARGET_NOT_DIR',
    );
  } finally { cleanup(parent); }
});

test('copied tree matches bundled templates/.ultra/ (diff-equal excluding .DS_Store)', () => {
  const target = mkTempDir();
  try {
    const r = initProject({ target_dir: target, project_name: 'diff-equal' });
    const templateFiles = [];
    (function walk(dir, prefix = '') {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '.DS_Store') continue;
        const rel = prefix ? path.join(prefix, e.name) : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), rel);
        else if (e.isFile()) templateFiles.push(rel);
      }
    })(DEFAULT_TEMPLATE);
    assert.deepEqual(r.copied_files.sort(), templateFiles.sort());
    for (const rel of templateFiles) {
      if (rel === 'tasks/tasks.json') continue; // metadata injected by design
      const src = fs.readFileSync(path.join(DEFAULT_TEMPLATE, rel));
      const dst = fs.readFileSync(path.join(r.created_path, rel));
      assert.deepEqual(dst, src, `content diff in ${rel}`);
    }
  } finally { cleanup(target); }
});
