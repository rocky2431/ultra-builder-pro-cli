'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const INSTALLER = path.join(ROOT, 'bin', 'install.js');
const SESSION_CONTEXT = path.join(ROOT, 'hooks', 'session_context.py');
const JOURNEY_RESULTS = path.join(ROOT, 'docs', 'evals', 'ultra-5-0-journey-results.md');

const ACCEPTED_JOURNEYS = Object.freeze([
  ['J1', 'Greenfield', 'PASS'],
  ['J2', 'Existing project', 'PASS'],
  ['J3', 'Micro edit', 'PASS'],
  ['J4', 'Owner revision', 'PASS'],
  ['J5', 'Fresh session', 'PASS'],
  ['J6', 'Early value', 'PASS'],
  ['J7', 'Degraded state', 'PASS'],
  ['J8', 'Clean install delegation', 'PASS'],
  ['J9', 'ACP happy path', 'PASS'],
  ['J10', 'Permission denial', 'PASS'],
  ['J11', 'Cancellation', 'PASS'],
  ['J12', 'CLI fallback', 'PASS'],
  ['J13', 'ZCode bridge', 'PASS'],
  ['J14', '3.x migration', 'PASS'],
]);

function temporary(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root, relative, bytes, mode = 0o640) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { mode });
}

function seedAccepted3xProject(root) {
  const task = {
    id: 'legacy-task',
    title: 'Preserve accepted behavior',
    type: 'feature',
    priority: 'P1',
    status: 'completed',
    dependencies: [],
    context_file: '.ultra/contexts/task-legacy.md',
    trace_to: '.ultra/specs/product.md#accepted-behavior',
    change_id: 'chg-legacy',
  };
  const files = {
    'CONTEXT.md': '# Domain Context\n\nLegacy accepted vocabulary.\n',
    '.ultra/.gitignore': '.runtime/\nprogress/\nreviews/\n',
    '.ultra/project-brief.md': '# Project Brief\n\n## One-line\n\nPreserve the owner accepted system.\n',
    '.ultra/north-star.md': '# North Star\n\n## Status\n\naccepted legacy fixture\n',
    '.ultra/specs/product.md': '# Product\n\n## Accepted behavior\n\nThe legacy path remains observable.\n',
    '.ultra/specs/architecture.md': '# Architecture\n\nFile-first and host-neutral.\n',
    '.ultra/specs/discovery.md': '# Discovery\n\nAccepted observations.\n',
    '.ultra/specs/research-distillate.md': '# Distillate\n\nPinned legacy evidence.\n',
    '.ultra/tasks.json': `${JSON.stringify({
      $schema: 'ultra-task-ledger-v2',
      tasks: [task],
    }, null, 2)}\n`,
    '.ultra/test-report.json': `${JSON.stringify({
      $schema: 'ultra-test-report-v1',
      passed: true,
      note: 'opaque accepted legacy report',
    }, null, 2)}\n`,
    '.ultra/contexts/task-legacy.md': [
      '# Task legacy-task: Preserve accepted behavior',
      '',
      '## Acceptance Criteria',
      '',
      '- Legacy behavior remains accepted.',
      '',
      '## Resume Note',
      '',
      'Completed before the upgrade.',
      '',
      '## Completion',
      '',
      'Completed.',
      '',
    ].join('\n'),
    '.ultra/changes/active/chg-legacy/intent.md': [
      '# Change: Legacy accepted behavior',
      '',
      '## Status',
      '',
      'accepted',
      '',
      '## Acceptance Criteria',
      '',
      '- Preserve these exact bytes.',
      '',
    ].join('\n'),
    '.ultra/decisions/legacy-owner-acceptance.md': [
      '# Decision: Legacy owner acceptance',
      '',
      '> **Status**: accepted',
      '',
      'This record is immutable history.',
      '',
    ].join('\n'),
    '.ultra/evidence/legacy-task/evidence.json': `${JSON.stringify({
      $schema: 'ultra-task-evidence-v2',
      task_id: 'legacy-task',
      note: 'opaque accepted fixture bytes',
    }, null, 2)}\n`,
    '.ultra/research/legacy-run/report.md': '# Legacy Research\n\nAccepted cited evidence.\n',
    '.ultra/changes/archive/chg-old/intent.md': '# Archived Change\n\nAccepted historical intent.\n',
    '.ultra/changes/archive/chg-old/delivery.md': '# Delivery\n\nDelivered historical outcome.\n',
  };
  for (const [relative, bytes] of Object.entries(files)) write(root, relative, bytes);
  write(root, '.ultra/evidence/legacy-task/raw.bin', Buffer.from([0, 255, 10, 13, 42]), 0o600);
}

function canonicalSnapshot(root) {
  const snapshot = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (
        relative === '.git'
        || relative.startsWith('.git/')
        || relative === '.ultra/.runtime'
        || relative.startsWith('.ultra/.runtime/')
        || relative === '.ultra/progress'
        || relative.startsWith('.ultra/progress/')
        || relative === '.ultra/reviews'
        || relative.startsWith('.ultra/reviews/')
      ) continue;
      const stat = fs.lstatSync(absolute);
      assert.equal(stat.isSymbolicLink(), false, `canonical fixture contains symlink: ${relative}`);
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) {
        const bytes = fs.readFileSync(absolute);
        snapshot[relative] = {
          mode: stat.mode & 0o777,
          bytes: bytes.length,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        };
      } else assert.fail(`canonical fixture contains unexpected special entry: ${relative}`);
    }
  };
  visit(root);
  return Object.fromEntries(Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createFakeCodex(binRoot) {
  const executable = path.join(binRoot, 'codex');
  write(binRoot, 'codex', `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.CODEX_HOME || process.env.HOME;
const state = path.join(root, '.ubp-journey-codex-plugin.json');
const args = process.argv.slice(2);
if (args.join(' ') === 'plugin list --json') {
  const installed = fs.existsSync(state)
    ? [{ name: 'ultra-builder-pro', installed: true, enabled: true }]
    : [];
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
`, 0o755);
  return executable;
}

function runInstaller(args, { project, home, binRoot }) {
  return spawnSync(process.execPath, [INSTALLER, ...args], {
    cwd: project,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      PATH: [binRoot, path.dirname(process.execPath), process.env.PATH || '']
        .filter(Boolean)
        .join(path.delimiter),
    },
  });
}

function runSessionContext(project) {
  return spawnSync('python3', [SESSION_CONTEXT], {
    cwd: project,
    encoding: 'utf8',
    input: JSON.stringify({ cwd: project, hook_event_name: 'SessionStart' }),
  });
}

test('3.x project install, update, Doctor, and uninstall preserve every seeded canonical byte', (t) => {
  const project = temporary('ubp-5-migration-project-');
  const config = temporary('ubp-5-migration-config-');
  const home = temporary('ubp-5-migration-home-');
  const binRoot = temporary('ubp-5-migration-bin-');
  createFakeCodex(binRoot);
  try {
    seedAccepted3xProject(project);
    const before = canonicalSnapshot(project);
    const beforeDigest = digest(before);
    const args = ['--all', '--global', '--config-dir', config];

    const install = runInstaller(args, { project, home, binRoot });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    const update = runInstaller(args, { project, home, binRoot });
    assert.equal(update.status, 0, update.stderr || update.stdout);

    const doctor = runInstaller([...args, '--doctor', '--json'], { project, home, binRoot });
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
    const health = JSON.parse(doctor.stdout);
    assert.equal(health.status, 'healthy', doctor.stdout);
    assert.equal(health.reports.length, 6, doctor.stdout);
    for (const report of health.reports) {
      assert.equal(report.checks.delegation_runner.status, 'pass', JSON.stringify(report));
      assert.equal(report.checks.acp_capability.status, 'pass', JSON.stringify(report));
      assert.equal(report.checks.agent_execution_driver.status, 'pass', JSON.stringify(report));
      const shouldSelectAcp = report.checks.acp_capability.conformance_status === 'passed'
        && report.checks.acp_capability.executable_available === true
        && report.checks.acp_capability.candidate_valid === true
        && report.checks.acp_capability.candidate_identity_valid !== false;
      assert.equal(
        report.checks.agent_execution_driver.selected,
        shouldSelectAcp ? 'acp' : 'cli',
        JSON.stringify(report),
      );
      assert.equal(
        report.checks.agent_execution_driver.fallback_reason,
        shouldSelectAcp
          ? null
          : (report.checks.acp_capability.candidate_identity_valid === false
            ? report.checks.acp_capability.candidate_identity_fallback_reason
            : report.checks.acp_capability.conformance_status === 'passed'
              ? 'acp_command_unavailable'
            : 'acp_conformance_not_passed'),
        JSON.stringify(report),
      );
    }
    const zcode = health.reports.find((report) => report.adapter === 'zcode');
    assert.equal(zcode.checks.zcode_transport_maturity.status, 'experimental', doctor.stdout);
    assert.equal(zcode.checks.zcode_transport_maturity.installed_runtime_only, true, doctor.stdout);

    const afterUpdate = canonicalSnapshot(project);
    assert.deepEqual(afterUpdate, before);

    const uninstall = runInstaller([...args, '--uninstall'], { project, home, binRoot });
    assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
    const afterUninstall = canonicalSnapshot(project);
    assert.deepEqual(afterUninstall, before);
    assert.deepEqual(fs.readdirSync(config), []);
    assert.deepEqual(fs.readdirSync(home), []);

    t.diagnostic(JSON.stringify({
      journey: '3.x migration',
      canonical_files: Object.keys(before).length,
      before_digest: beforeDigest,
      after_update_digest: digest(afterUpdate),
      after_uninstall_digest: digest(afterUninstall),
      doctor: health.reports.map((report) => ({
        host: report.adapter,
        status: report.status,
        driver: report.checks.agent_execution_driver.selected,
        fallback_reason: report.checks.agent_execution_driver.fallback_reason,
      })),
    }));
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(config, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(binRoot, { recursive: true, force: true });
  }
});

test('ambiguous authority remains a read-only diagnosis with reachable exits', (t) => {
  const project = temporary('ubp-5-degraded-project-');
  try {
    write(project, '.ultra/north-star.md', fs.readFileSync(path.join(ROOT, '.ultra-template', 'north-star.md')));
    write(project, '.ultra/project-brief.md', '# Project Brief\n\n## One-line\n\nRecover this project.\n');
    write(project, '.ultra/tasks.json', '{\n  "$schema": "ultra-task-ledger-v2",\n  "tasks": []\n}\n');
    write(project, '.ultra/changes/active/C-01/intent.md', '# C-01\n\nPRIMARY-INTENT-SENTINEL\n');
    write(project, '.ultra/changes/active/C-02/intent.md', '# C-02\n\nCONFLICTING-INTENT-SENTINEL\n');

    const hook = runSessionContext(project);
    assert.equal(hook.status, 0, hook.stderr || hook.stdout);
    const context = JSON.parse(hook.stdout).hookSpecificOutput.additionalContext;
    assert.match(context, /`active_change_ambiguous`/u);
    assert.match(context, /`C-01`, `C-02`/u);
    assert.match(context, /task selection be retried/iu);
    assert.match(context, /Abandonment/u);
    assert.doesNotMatch(context, /PRIMARY-INTENT-SENTINEL|CONFLICTING-INTENT-SENTINEL/u);
    assert.equal(fs.existsSync(path.join(project, '.ultra', 'progress')), false);

    const statusSkill = fs.readFileSync(path.join(ROOT, 'skills', 'ultra-status', 'SKILL.md'), 'utf8');
    const reviewSkill = fs.readFileSync(path.join(ROOT, 'skills', 'ultra-review', 'SKILL.md'), 'utf8');
    assert.match(statusSkill, /This router is read-only/u);
    assert.match(statusSkill, /repair, retry, cancel, abandon/u);
    assert.match(reviewSkill, /Lens workers are read-only sensors/u);
    assert.match(reviewSkill, /repair, retry,[\s\S]*or abandon path/u);

    t.diagnostic(JSON.stringify({
      journey: 'Degraded state',
      diagnostic: 'active_change_ambiguous',
      intent_body_published: false,
      semantic_write: false,
      exits: ['repair', 'retry', 'cancel', 'abandon'],
    }));
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('a fresh session recovers the exact active task acceptance and Resume Note from files', (t) => {
  const project = temporary('ubp-5-fresh-session-project-');
  try {
    write(project, '.ultra/north-star.md', fs.readFileSync(path.join(ROOT, '.ultra-template', 'north-star.md')));
    write(project, '.ultra/project-brief.md', '# Project Brief\n\n## One-line\n\nResume this project.\n');
    write(project, '.ultra/changes/active/chg-resume/intent.md', '# Change chg-resume\n\n## Status\n\naccepted\n');
    write(project, '.ultra/contexts/task-task-resume.md', [
      '# Task task-resume: Continue from repository facts',
      '',
      '## Acceptance Criteria',
      '',
      'FRESH-ACCEPTANCE-SENTINEL',
      '',
      '## Resume Note',
      '',
      'FRESH-RESUME-SENTINEL',
      '',
    ].join('\n'));
    write(project, '.ultra/tasks.json', `${JSON.stringify({
      $schema: 'ultra-task-ledger-v2',
      tasks: [{
        id: 'task-resume',
        title: 'Continue from repository facts',
        type: 'feature',
        priority: 'P1',
        status: 'in_progress',
        dependencies: [],
        context_file: '.ultra/contexts/task-task-resume.md',
        trace_to: '.ultra/project-brief.md#one-line',
        change_id: 'chg-resume',
      }],
    }, null, 2)}\n`);
    const before = canonicalSnapshot(project);

    const hook = runSessionContext(project);
    assert.equal(hook.status, 0, hook.stderr || hook.stdout);
    const context = JSON.parse(hook.stdout).hookSpecificOutput.additionalContext;
    assert.match(context, /Current task task-resume acceptance:/u);
    assert.match(context, /FRESH-ACCEPTANCE-SENTINEL/u);
    assert.match(context, /Current task task-resume resume note:/u);
    assert.match(context, /FRESH-RESUME-SENTINEL/u);
    assert.match(context, /Resume Note is navigational context/u);
    assert.deepEqual(canonicalSnapshot(project), before);

    t.diagnostic(JSON.stringify({
      journey: 'Fresh session',
      source: 'repository files only',
      task_id: 'task-resume',
      acceptance_recovered: true,
      resume_note_recovered: true,
      semantic_write: false,
    }));
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('the accepted journey register reports one observable PASS or honest STOP per journey', () => {
  const design = fs.readFileSync(path.join(ROOT, 'docs', 'ULTRA-BUILDER-PRO-5.0.zh-CN.md'), 'utf8');
  const results = fs.readFileSync(JOURNEY_RESULTS, 'utf8');
  for (const [id, name, status] of ACCEPTED_JOURNEYS) {
    assert.match(design, new RegExp(`\\| ${escapeRegExp(name)} \\|`, 'u'));
    assert.match(results, new RegExp(`\\| ${id} \\| ${escapeRegExp(name)} \\| ${status} \\|`, 'u'));
  }
  assert.match(results, /live-provider[^\n]*六个 Host/u);
  assert.match(results, /real user-HOME install\/Doctor[\s\S]*完成/iu);
  assert.match(results, /J8 \| Clean install delegation \| PASS[\s\S]*v50-real-home-activation/iu);
  assert.match(results, /ZCode bridge \| PASS[\s\S]*国内 BigModel provider[\s\S]*experimental/iu);
  assert.match(results, /J11 \| Cancellation \| PASS[\s\S]*windows-latest[\s\S]*真实 grandchild/iu);
  assert.match(results, /GitHub Actions run `32935138736`/u);
  assert.match(results, /剩余 registry\/release 缺口属于 public-release task/u);
});

test('daily entry, fresh-session recovery, and earliest observable slice are documented at use sites', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const readmeZh = fs.readFileSync(path.join(ROOT, 'README.zh-CN.md'), 'utf8');
  const lifecycle = fs.readFileSync(path.join(ROOT, 'docs', 'WORKFLOW-LIFECYCLE.md'), 'utf8');
  const template = fs.readFileSync(path.join(ROOT, '.ultra-template', 'contexts', 'TEMPLATE.md'), 'utf8');

  assert.match(readme, /For day-to-day work on an existing project,[\s\S]*starts with `ultra-change`/u);
  assert.match(readme, /A fresh session\s+starts from repository root and `HEAD`/u);
  assert.match(readmeZh, /已有项目的日常工作[\s\S]*从 `ultra-change` 开始/u);
  assert.match(readmeZh, /新会话先从 repository root 和 `HEAD`\s*开始/u);
  assert.match(lifecycle, /Plan names the earliest executable tracer bullet's real consumer, real data path, and\s+owner-visible observation/u);
  assert.match(lifecycle, /It does not rerun completed Research merely because conversation\s+memory is gone/u);
  assert.match(template, /\*\*Earliest observable slice\*\*/u);
  assert.match(template, /\*\*Fresh-session recovery\*\*/u);
});
