'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initProject, InitProjectError, DEFAULT_TEMPLATE } = require('../lib/init-project.cjs');

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
    assert.equal(r.created_path, path.join(target, '.ultra'));
    assert.ok(r.copied_files.includes('tasks/tasks.json'));
    assert.ok(r.copied_files.includes('specs/product.md'));
    assert.ok(!r.copied_files.some((f) => f.endsWith('.DS_Store')));
  } finally { cleanup(target); }
});

test('initProject injects project metadata into tasks.json', () => {
  const target = mkTempDir();
  try {
    initProject({
      target_dir: target,
      project_name: 'meta-demo',
      project_type: 'web',
      stack: 'next',
    });
    const tasksJson = JSON.parse(fs.readFileSync(path.join(target, '.ultra', 'tasks', 'tasks.json'), 'utf8'));
    assert.equal(tasksJson.project.name, 'meta-demo');
    assert.equal(tasksJson.project.type, 'web');
    assert.equal(tasksJson.project.stack, 'next');
    assert.ok(tasksJson.created.length > 0);
    assert.ok(tasksJson.updated.length > 0);
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
