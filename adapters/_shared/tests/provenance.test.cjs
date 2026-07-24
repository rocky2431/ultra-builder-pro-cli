'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const provenance = require('../provenance.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-provenance-'));
  fs.mkdirSync(path.join(root, 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runtime', 'launch.cjs'), 'module.exports = true;\n');
  fs.writeFileSync(path.join(root, 'hooks', 'hooks.json'), '{}\n');
  const file = path.join(root, 'provenance.json');
  provenance.writeProvenance({
    file,
    adapter: 'claude',
    packageInfo: { name: 'ultra-builder-pro-cli', version: '1.2.3' },
    repository: 'https://example.test/ultra-builder-pro',
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    sourceDirty: true,
    sourceWorktreeDigest: 'a'.repeat(64),
    roots: { plugin: root },
    assets: [
      { root: 'plugin', path: 'hooks/hooks.json' },
      { root: 'plugin', path: 'runtime/launch.cjs' },
    ],
    contracts: {
      hooks_manifest: { root: 'plugin', path: 'hooks/hooks.json' },
      mcp_launcher: { root: 'plugin', path: 'runtime/launch.cjs' },
    },
  });
  return { root, file };
}

test('writeProvenance + inspectProvenance produce a normalized healthy report', () => {
  const fx = fixture();
  try {
    const manifest = JSON.parse(fs.readFileSync(fx.file, 'utf8'));
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.adapter, 'claude');
    assert.equal(manifest.package.version, '1.2.3');
    assert.equal(manifest.source.repository, 'https://example.test/ultra-builder-pro');
    assert.equal(manifest.source.dirty, true);
    assert.equal(manifest.source.worktree_digest, 'a'.repeat(64));
    assert.match(manifest.content.digest, /^[0-9a-f]{64}$/);
    assert.deepEqual(manifest.assets.map((asset) => asset.path), [
      'hooks/hooks.json', 'runtime/launch.cjs',
    ]);

    const report = provenance.inspectProvenance({
      file: fx.file,
      expectedAdapter: 'claude',
      expectedPackageVersion: '1.2.3',
    });
    assert.equal(report.status, 'healthy');
    assert.deepEqual(report.issues, []);
    assert.equal(report.checks.assets.checked, 2);
    assert.equal(report.checks.contracts.checked, 2);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('inspectProvenance detects content drift and missing contract targets', () => {
  const fx = fixture();
  try {
    fs.writeFileSync(path.join(fx.root, 'runtime', 'launch.cjs'), 'tampered\n');
    fs.unlinkSync(path.join(fx.root, 'hooks', 'hooks.json'));
    const report = provenance.inspectProvenance({
      file: fx.file,
      expectedAdapter: 'claude',
      expectedPackageVersion: '1.2.3',
    });
    assert.equal(report.status, 'degraded');
    assert.ok(report.issues.some((issue) => issue.code === 'ASSET_HASH_MISMATCH'));
    assert.ok(report.issues.some(
      (issue) => issue.code === 'CONTRACT_TARGET_MISSING' && issue.contract === 'hooks_manifest',
    ));
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('inspectProvenance fails closed for missing, corrupt, or mismatched manifests', () => {
  const fx = fixture();
  try {
    const mismatch = provenance.inspectProvenance({
      file: fx.file,
      expectedAdapter: 'codex',
      expectedPackageVersion: '9.9.9',
    });
    assert.equal(mismatch.status, 'degraded');
    assert.ok(mismatch.issues.some((issue) => issue.code === 'ADAPTER_MISMATCH'));
    assert.ok(mismatch.issues.some((issue) => issue.code === 'PACKAGE_VERSION_MISMATCH'));

    fs.writeFileSync(fx.file, 'not-json');
    const corrupt = provenance.inspectProvenance({ file: fx.file });
    assert.equal(corrupt.status, 'degraded');
    assert.equal(corrupt.issues[0].code, 'PROVENANCE_INVALID');

    fs.unlinkSync(fx.file);
    const missing = provenance.inspectProvenance({ file: fx.file });
    assert.equal(missing.status, 'missing');
    assert.equal(missing.issues[0].code, 'PROVENANCE_MISSING');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('packageSource never attributes an enclosing consumer repository commit to the package', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-provenance-source-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: root });
    fs.writeFileSync(path.join(root, 'README.md'), '# consumer\n');
    execFileSync('git', ['add', 'README.md'], { cwd: root });
    execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: root });
    const packageRoot = path.join(root, 'node_modules', 'ultra-builder-pro-cli');
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
      name: 'ultra-builder-pro-cli',
      version: '1.2.3',
      repository: { url: 'https://example.test/ultra-builder-pro' },
    }));

    const source = provenance.packageSource(packageRoot);
    assert.equal(source.sourceCommit, null);
    assert.equal(source.sourceDirty, null);
    assert.equal(source.sourceWorktreeDigest, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('packageSource records clean and dirty local source provenance deterministically', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-provenance-dirty-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: root });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      name: 'ultra-builder-pro-cli',
      version: '1.2.3',
      repository: { url: 'https://example.test/ultra-builder-pro' },
    }));
    fs.writeFileSync(path.join(root, 'source.txt'), 'clean\n');
    execFileSync('git', ['add', 'package.json', 'source.txt'], { cwd: root });
    execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: root });

    const clean = provenance.packageSource(root);
    assert.equal(clean.sourceDirty, false);
    assert.match(clean.sourceWorktreeDigest, /^[0-9a-f]{64}$/);

    fs.appendFileSync(path.join(root, 'source.txt'), 'changed\n');
    fs.writeFileSync(path.join(root, 'untracked.txt'), 'new\n');
    const dirty = provenance.packageSource(root);
    assert.equal(dirty.sourceCommit, clean.sourceCommit);
    assert.equal(dirty.sourceDirty, true);
    assert.match(dirty.sourceWorktreeDigest, /^[0-9a-f]{64}$/);
    assert.notEqual(dirty.sourceWorktreeDigest, clean.sourceWorktreeDigest);

    const repeated = provenance.packageSource(root);
    assert.equal(repeated.sourceWorktreeDigest, dirty.sourceWorktreeDigest);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
