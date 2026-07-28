'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const LEGACY_LITERAL = '.ultra/' + 'state.db';
const LEGACY_RUNTIME_ROOTS = [
  'backups',
  'collab',
  'debug',
  'runtime',
  'sessions',
  'worktrees',
  'telemetry',
  'orchestrator',
].map((entry) => `.ultra/${entry}`);
const ALLOWED_COMPATIBILITY_FILES = new Set([
  'CHANGELOG.md',
  'hooks/runtime_paths.py',
  'mcp-server/lib/runtime-paths.cjs',
  'mcp-server/lib/runtime-paths.test.cjs',
  'mcp-server/tests/init-project.test.cjs',
]);
const ALLOWED_RUNTIME_COMPATIBILITY_FILES = new Set([
  'CHANGELOG.md',
  'docs/LEGACY-HERMES.md',
  'hooks/runtime_paths.py',
  'mcp-server/lib/runtime-paths.cjs',
  'mcp-server/lib/runtime-paths.test.cjs',
  'mcp-server/tests/init-project.test.cjs',
  'ultra-tools/commands/system.cjs',
  'ultra-tools/legacy-memory.test.cjs',
]);
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.js', '.json', '.md', '.py', '.sql', '.toml', '.yaml', '.yml',
]);

function repositoryFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: REPO_ROOT },
  );
  return output.toString('utf8').split('\0').filter(Boolean);
}

test('non-compatibility files use the canonical runtime state path', () => {
  const stale = [];
  for (const relative of repositoryFiles()) {
    if (ALLOWED_COMPATIBILITY_FILES.has(relative)) continue;
    if (!TEXT_EXTENSIONS.has(path.extname(relative))) continue;
    const absolute = path.join(REPO_ROOT, relative);
    let stat;
    try { stat = fs.lstatSync(absolute); } catch { continue; }
    if (!stat.isFile()) continue;
    const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes(LEGACY_LITERAL)) stale.push(`${relative}:${index + 1}`);
    });
  }
  assert.deepEqual(
    stale,
    [],
    `replace stale ${LEGACY_LITERAL} literals with .ultra/.runtime/state.db`,
  );
});

test('mutable Ultra paths stay below .ultra/.runtime', () => {
  const stale = [];
  for (const relative of repositoryFiles()) {
    if (ALLOWED_RUNTIME_COMPATIBILITY_FILES.has(relative)) continue;
    if (!TEXT_EXTENSIONS.has(path.extname(relative))) continue;
    const absolute = path.join(REPO_ROOT, relative);
    let stat;
    try { stat = fs.lstatSync(absolute); } catch { continue; }
    if (!stat.isFile()) continue;
    const text = fs.readFileSync(absolute, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes('runtime-path-compatibility')) return;
      for (const legacyRoot of LEGACY_RUNTIME_ROOTS) {
        if (line.includes(legacyRoot)) {
          stale.push(`${relative}:${index + 1}:${legacyRoot}`);
        }
      }
    });
    for (const pattern of [
      /path\.join\([^)]{0,240}?["']\.ultra["']\s*,\s*["'](state\.db|backups|collab|debug|runtime|sessions|worktrees|telemetry|orchestrator)["']/gu,
      /(?:root|project|tmp_path|ultra)\s*\/\s*["']\.ultra["']\s*\/\s*["'](state\.db|backups|collab|debug|runtime|sessions|worktrees|telemetry|orchestrator)["']/gu,
    ]) {
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split(/\r?\n/).length;
        const sourceLine = lines[line - 1] || '';
        if (!sourceLine.includes('runtime-path-compatibility')) {
          stale.push(`${relative}:${line}:constructed legacy runtime path`);
        }
      }
    }
  }
  assert.deepEqual(
    stale,
    [],
    'move mutable Ultra paths below .ultra/.runtime',
  );
});

test('repository Git rules track every semantic Ultra artifact class and ignore runtime', () => {
  assert.doesNotThrow(() => execFileSync(
    'git',
    ['check-ignore', '--quiet', '--no-index', '--', '.ultra/.runtime/state.db'],
    { cwd: REPO_ROOT },
  ));
  for (const semanticPath of [
    '.ultra/specs/product.md',
    '.ultra/tasks/tasks.json',
    '.ultra/reports/templates/test-report.json',
    '.ultra/docs/research/README.md',
    '.ultra/changes/active/example/intent.md',
  ]) {
    assert.throws(
      () => execFileSync(
        'git',
        ['check-ignore', '--quiet', '--no-index', '--', semanticPath],
        { cwd: REPO_ROOT },
      ),
      undefined,
      `${semanticPath} must remain trackable`,
    );
  }
});
