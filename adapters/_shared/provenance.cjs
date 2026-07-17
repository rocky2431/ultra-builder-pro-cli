'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { listRelative, writeAtomic } = require('./file-ops.cjs');

const SCHEMA_VERSION = 1;
const DIGEST_ALGORITHM = 'sha256';

function issue(code, details = {}) {
  return { code, ...details };
}

function safeRelative(value) {
  if (typeof value !== 'string' || !value.trim() || path.isAbsolute(value)) {
    throw new Error(`provenance asset path must be relative: ${String(value)}`);
  }
  const normalized = path.normalize(value);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`provenance asset path escapes its root: ${value}`);
  }
  return normalized;
}

function normalizeRoots(roots) {
  if (!roots || typeof roots !== 'object' || Array.isArray(roots)) {
    throw new Error('provenance roots must be an object');
  }
  const normalized = {};
  for (const [name, root] of Object.entries(roots)) {
    if (!/^[a-z][a-z0-9_-]*$/.test(name) || typeof root !== 'string' || !root.trim()) {
      throw new Error(`invalid provenance root: ${name}`);
    }
    normalized[name] = path.resolve(root);
  }
  if (Object.keys(normalized).length === 0) throw new Error('at least one provenance root is required');
  return normalized;
}

function normalizeRef(ref, roots) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref) || !roots[ref.root]) {
    throw new Error(`invalid provenance asset root: ${ref && ref.root}`);
  }
  return { root: ref.root, path: safeRelative(ref.path) };
}

function resolveRef(roots, ref) {
  const normalized = normalizeRef(ref, roots);
  const root = roots[normalized.root];
  const target = path.resolve(root, normalized.path);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`provenance asset escapes root ${normalized.root}: ${normalized.path}`);
  }
  return { ...normalized, target };
}

function hashFile(file) {
  return crypto.createHash(DIGEST_ALGORITHM).update(fs.readFileSync(file)).digest('hex');
}

function normalizeAssetRefs(assets, roots) {
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error('at least one provenance asset is required');
  }
  const unique = new Map();
  for (const input of assets) {
    const ref = normalizeRef(input, roots);
    unique.set(`${ref.root}\0${ref.path}`, ref);
  }
  return [...unique.values()].sort((a, b) => (
    a.root.localeCompare(b.root) || a.path.localeCompare(b.path)
  ));
}

function digestEntries(entries) {
  const hash = crypto.createHash(DIGEST_ALGORITHM);
  for (const entry of entries) {
    hash.update(entry.root);
    hash.update('\0');
    hash.update(entry.path);
    hash.update('\0');
    hash.update(entry.sha256);
    hash.update('\0');
    hash.update(String(entry.size_bytes));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function sourceCommit(repoRoot) {
  if (!fs.existsSync(path.join(repoRoot, '.git'))) return null;
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  const value = result.status === 0 ? result.stdout.trim() : '';
  return /^[0-9a-f]{40,64}$/i.test(value) ? value : null;
}

function repositoryUrl(pkg) {
  if (typeof pkg.repository === 'string') return pkg.repository;
  if (pkg.repository && typeof pkg.repository.url === 'string') return pkg.repository.url;
  return typeof pkg.homepage === 'string' ? pkg.homepage : null;
}

function packageSource(repoRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  return {
    packageInfo: { name: pkg.name, version: pkg.version },
    repository: repositoryUrl(pkg),
    sourceCommit: sourceCommit(repoRoot),
  };
}

function assetRefsForTree(rootName, root, { exclude = [] } = {}) {
  const excluded = new Set(exclude.map((entry) => path.normalize(entry)));
  return listRelative(root)
    .filter((entry) => !excluded.has(path.normalize(entry)))
    .map((entry) => ({ root: rootName, path: entry }));
}

function writeProvenance({
  file, adapter, packageInfo, repository, sourceCommit: commit = null,
  roots: inputRoots, assets: inputAssets, contracts: inputContracts = {},
}) {
  if (!file || !adapter || !packageInfo?.name || !packageInfo?.version || !repository) {
    throw new Error('provenance file, adapter, package, version, and repository are required');
  }
  const roots = normalizeRoots(inputRoots);
  const refs = normalizeAssetRefs(inputAssets, roots);
  const assets = refs.map((ref) => {
    const { target } = resolveRef(roots, ref);
    const stat = fs.statSync(target);
    if (!stat.isFile()) throw new Error(`provenance asset is not a file: ${target}`);
    return { ...ref, size_bytes: stat.size, sha256: hashFile(target) };
  });
  const contracts = {};
  for (const [name, ref] of Object.entries(inputContracts || {})) {
    if (!/^[a-z][a-z0-9_-]*$/.test(name)) throw new Error(`invalid provenance contract: ${name}`);
    contracts[name] = normalizeRef(ref, roots);
  }
  const manifest = {
    schema_version: SCHEMA_VERSION,
    adapter,
    package: { name: packageInfo.name, version: packageInfo.version },
    source: { repository, commit: commit || null },
    installed_at: new Date().toISOString(),
    roots,
    content: { algorithm: DIGEST_ALGORITHM, digest: digestEntries(assets) },
    assets,
    contracts,
  };
  writeAtomic(path.resolve(file), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function invalidReport(file, status, problem, adapter = null) {
  return {
    adapter,
    status,
    manifest_path: path.resolve(file),
    package: null,
    source: null,
    content_digest: null,
    checks: {
      manifest: { status: 'fail' },
      assets: { status: 'unknown', checked: 0, failed: 0 },
      contracts: { status: 'unknown', checked: 0, failed: 0 },
    },
    issues: [problem],
  };
}

function inspectProvenance({ file, expectedAdapter = null, expectedPackageVersion = null }) {
  const manifestPath = path.resolve(file);
  if (!fs.existsSync(manifestPath)) {
    return invalidReport(
      manifestPath, 'missing', issue('PROVENANCE_MISSING', { path: manifestPath }), expectedAdapter,
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('manifest must be an object');
    if (manifest.schema_version !== SCHEMA_VERSION) throw new Error(`unsupported schema ${manifest.schema_version}`);
    if (!manifest.package?.name || !manifest.package?.version || !manifest.source?.repository) {
      throw new Error('package and source metadata required');
    }
  } catch (error) {
    return invalidReport(
      manifestPath, 'degraded', issue('PROVENANCE_INVALID', { message: error.message }), expectedAdapter,
    );
  }

  const issues = [];
  let roots;
  try {
    roots = normalizeRoots(manifest.roots);
  } catch (error) {
    return invalidReport(
      manifestPath, 'degraded', issue('PROVENANCE_INVALID', { message: error.message }), expectedAdapter,
    );
  }
  if (expectedAdapter && manifest.adapter !== expectedAdapter) {
    issues.push(issue('ADAPTER_MISMATCH', { expected: expectedAdapter, actual: manifest.adapter }));
  }
  if (expectedPackageVersion && manifest.package.version !== expectedPackageVersion) {
    issues.push(issue('PACKAGE_VERSION_MISMATCH', {
      expected: expectedPackageVersion, actual: manifest.package.version,
    }));
  }

  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  if (assets.length === 0) issues.push(issue('PROVENANCE_INVALID', { message: 'assets required' }));
  let assetFailures = 0;
  for (const asset of assets) {
    try {
      const { target, root, path: assetPath } = resolveRef(roots, asset);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        assetFailures += 1;
        issues.push(issue('ASSET_MISSING', { root, path: assetPath }));
        continue;
      }
      const actual = hashFile(target);
      if (actual !== asset.sha256) {
        assetFailures += 1;
        issues.push(issue('ASSET_HASH_MISMATCH', {
          root, path: assetPath, expected: asset.sha256, actual,
        }));
      }
    } catch (error) {
      assetFailures += 1;
      issues.push(issue('ASSET_INVALID', { message: error.message }));
    }
  }
  if (manifest.content?.algorithm !== DIGEST_ALGORITHM
    || manifest.content?.digest !== digestEntries(assets)) {
    issues.push(issue('MANIFEST_DIGEST_MISMATCH'));
  }

  const contracts = manifest.contracts && typeof manifest.contracts === 'object'
    && !Array.isArray(manifest.contracts) ? manifest.contracts : {};
  let contractFailures = 0;
  for (const [name, ref] of Object.entries(contracts)) {
    try {
      const { target, root, path: contractPath } = resolveRef(roots, ref);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        contractFailures += 1;
        issues.push(issue('CONTRACT_TARGET_MISSING', { contract: name, root, path: contractPath }));
      }
    } catch (error) {
      contractFailures += 1;
      issues.push(issue('CONTRACT_INVALID', { contract: name, message: error.message }));
    }
  }

  return {
    adapter: manifest.adapter,
    status: issues.length === 0 ? 'healthy' : 'degraded',
    manifest_path: manifestPath,
    package: manifest.package,
    source: manifest.source,
    content_digest: manifest.content?.digest || null,
    checks: {
      manifest: { status: 'pass' },
      assets: { status: assetFailures === 0 ? 'pass' : 'fail', checked: assets.length, failed: assetFailures },
      contracts: {
        status: contractFailures === 0 ? 'pass' : 'fail',
        checked: Object.keys(contracts).length,
        failed: contractFailures,
      },
    },
    issues,
  };
}

module.exports = {
  SCHEMA_VERSION,
  DIGEST_ALGORITHM,
  assetRefsForTree,
  inspectProvenance,
  packageSource,
  writeProvenance,
};
