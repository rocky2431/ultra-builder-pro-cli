'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SKILLS = path.join(ROOT, 'skills');
const VALIDATOR = path.join(
  SKILLS,
  'ultra-research',
  'scripts',
  'validate_north_star.cjs',
);
const { classifyText } = require(VALIDATOR);

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function validate(file) {
  const result = spawnSync(process.execPath, [VALIDATOR, file], { encoding: 'utf8' });
  let report = null;
  if (result.stdout.trim()) report = JSON.parse(result.stdout);
  return { ...result, report };
}

function gitBlobDigest(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function writeBoundAccepted(directory, text, {
  decisionRelative = '.ultra/decisions/D-1.md',
  snapshotRelative = '.ultra/research/R-1/north-star-v2-r1.accepted.md',
  ownerRecord = [
    '- Conversation scope: this fixture invocation.',
    '- Exact raw owner acceptance: "accept this fixture"',
    '- Agency boundary: the owner accepts the frame; the model owns final wording.',
    '- Time boundary: not-recorded because the fixture supplies no owner-authored time.',
    '- Revision boundary: this revision only; a future revision does not inherit acceptance.',
  ].join('\n'),
} = {}) {
  const file = path.join(directory, '.ultra', 'north-star.md');
  const decision = path.join(directory, decisionRelative);
  const snapshot = path.join(directory, snapshotRelative);
  const bytes = Buffer.from(text, 'utf8');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(path.dirname(decision), { recursive: true });
  fs.mkdirSync(path.dirname(snapshot), { recursive: true });
  fs.writeFileSync(file, bytes);
  fs.writeFileSync(snapshot, bytes);
  fs.writeFileSync(decision, `# Decision\n\n> **Status**: accepted\n\n## Owner Record\n\n${ownerRecord}\n\n## Accepted Artifact Binding\n\n- North Star content SHA-256: \`${crypto.createHash('sha256').update(bytes).digest('hex')}\`\n- North Star Git blob digest: \`${gitBlobDigest(bytes)}\`\n- Accepted snapshot: \`${snapshotRelative}\`\n`);
  return { file, decision, snapshot };
}

function acceptanceValue(text, name) {
  const match = text.match(new RegExp('^- ' + name + ':\\s*`?([^\\n`]+)`?\\s*$', 'mu'));
  return match ? match[1].trim() : null;
}

function replaceSectionBody(text, heading, body) {
  const expression = new RegExp(`(^## ${heading}\\n\\n)[\\s\\S]*?(?=\\n## |$)`, 'mu');
  assert.match(text, expression, heading);
  return text.replace(expression, `$1${body}`);
}

function numberedEntryParagraph(text, number) {
  const expression = new RegExp(`^${number}\\. [\\s\\S]*?(?=^${number + 1}\\. |^## )`, 'mu');
  const match = text.match(expression);
  assert.ok(match, `missing numbered entry ${number}`);
  return match[0].replace(/\n\s+/gu, ' ');
}

function hasStaleTraceStop(paragraph, effect) {
  return /(?:missing ID|revision mismatch|digest mismatch|missing ID or mismatch)/iu.test(paragraph)
    && new RegExp(`\\b${effect}\\b`, 'iu').test(paragraph)
    && /`ultra-change`/u.test(paragraph)
    && /reconcil/iu.test(paragraph);
}

function acceptedFixture({
  proposition = 'The moon is cheese.',
  duplicate = false,
  dangling = false,
  status = 'accepted',
  revision = 'r1',
  ownerSource = '.ultra/decisions/D-1.md#owner-record',
  fpStatus = 'accepted',
  capability = 'A capability',
  behavior = 'A behavior',
  chain = true,
  extra = '',
} = {}) {
  const outcomeRef = dangling ? 'NS-404' : 'NS-1';
  return `# Project North Star

## Acceptance and Revision

- Schema: \`north-star-v2\`
- Status: \`${status}\`
- Revision: \`${revision}\`
- Owner acceptance source: \`${ownerSource}\`
- Acceptance time: \`not-recorded\`
- Supersedes: \`none\`

## Problem Reality

- Reality: A test reality.
- Evidence: A test source.
- Unknowns: None recorded.

## First-Principle Propositions

### FP-1 — Test proposition

- Proposition: ${proposition}
- Evidence: None.
- Causal consequence: A structural consequence.
- Falsifier or revisit trigger: Contrary evidence.
- Status: \`${fpStatus}\`
${duplicate ? '\n### FP-1 — Duplicate\n\n- Proposition: Duplicate.\n- Evidence: None.\n- Causal consequence: Duplicate.\n- Falsifier or revisit trigger: Contrary evidence.\n- Status: `accepted`\n' : ''}
## Value Causal Chain

| Chain | First principle | Capability | Observable behavior | Outcome |
|---|---|---|---|---|
${chain ? `| VC-1 | \`FP-1\` | ${capability} | ${behavior} | \`${outcomeRef}\` |` : ''}

## North Star Outcomes

### NS-1 — Test outcome

- Outcome: A test outcome.
- Observation method: Inspect the result.
- Baseline: Unknown.
- Target or expected change: The result changes.
- Horizon: This test.
- Anti-metric: Do not optimize a proxy.

## Hard Constraints

### HC-1 — Test constraint

- Protected value or threat: Preserve control.
- Constraint: Do not expand authority.
- Authority or evidence: Owner source.
- Revisit condition: The authority changes.

## Explicit Exclusions

- Everything outside this fixture.

## Uncertainties and Revisit Triggers

- Revisit when test evidence changes.

## Research Trace

- Project Brief: \`project-brief.md\`
- Research runs: none; fixture only.
- Sources and decisions: \`intent.md#execution-approval\`
${extra}
`;
}

function initExistingNorthStar(northStar) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-existing-'));
  const ultra = path.join(project, '.ultra');
  fs.mkdirSync(ultra);
  if (classifyText(northStar) === 'accepted') writeBoundAccepted(project, northStar);
  else fs.writeFileSync(path.join(ultra, 'north-star.md'), northStar);
  const result = spawnSync(process.execPath, [
    path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
    '--project', project,
  ], { encoding: 'utf8' });
  return { project, result, report: result.stdout.trim() ? JSON.parse(result.stdout) : null };
}

function runInitWithPreservedNorthStarRace(project, seam) {
  const shim = path.join(project, `init-race-${seam}.cjs`);
  const mutation = seam === 'before-publication'
    ? [
      "const original = fs.mkdtempSync.bind(fs);",
      'fs.mkdtempSync = function patchedMkdtemp(prefix, ...args) {',
      '  const directory = original(prefix, ...args);',
      "  if (String(prefix).endsWith('.ultra-init-')) mutate();",
      '  return directory;',
      '};',
    ]
    : [
      'const original = fs.linkSync.bind(fs);',
      'let changed = false;',
      'fs.linkSync = function patchedLink(source, target) {',
      '  const result = original(source, target);',
      '  if (!changed) { changed = true; mutate(); }',
      '  return result;',
      '};',
    ];
  fs.writeFileSync(shim, [
    "'use strict';",
    "const fs = require('node:fs');",
    'function mutate() {',
    '  fs.appendFileSync(process.env.UBP_TEST_NORTH_STAR, Buffer.from([0xff]));',
    '}',
    ...mutation,
    '',
  ].join('\n'));
  return spawnSync(process.execPath, [
    '--require', shim,
    path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
    '--project', project,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      UBP_TEST_NORTH_STAR: path.join(project, '.ultra', 'north-star.md'),
    },
  });
}

function runInitWithPreservedFileEdit(project, relative) {
  const shim = path.join(project, 'init-preserved-file-edit.cjs');
  fs.writeFileSync(shim, [
    "'use strict';",
    "const fs = require('node:fs');",
    'const original = fs.linkSync.bind(fs);',
    'let changed = false;',
    'fs.linkSync = function patchedLink(source, target) {',
    '  const result = original(source, target);',
    '  if (!changed) {',
    '    changed = true;',
    "    fs.appendFileSync(process.env.UBP_TEST_PRESERVED_FILE, '\\nordinary owner edit\\n');",
    '  }',
    '  return result;',
    '};',
    '',
  ].join('\n'));
  return spawnSync(process.execPath, [
    '--require', shim,
    path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
    '--project', project,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      UBP_TEST_PRESERVED_FILE: path.join(project, '.ultra', relative),
    },
  });
}

function runInitWithPreservedFileOpenFailure(project, relative, movedStage) {
  const shim = path.join(project, 'init-preserved-file-open-failure.cjs');
  fs.writeFileSync(shim, [
    "'use strict';",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    'const originalOpen = fs.openSync.bind(fs);',
    'const originalRename = fs.renameSync.bind(fs);',
    'let targetOpenCount = 0;',
    'fs.openSync = function patchedOpen(target, flags, ...args) {',
    '  if (path.resolve(target) === path.resolve(process.env.UBP_TEST_PRESERVED_FILE)) {',
    '    targetOpenCount += 1;',
    '    if (targetOpenCount === 3) {',
    '      const stageName = fs.readdirSync(process.env.UBP_TEST_PROJECT)',
    "        .find((entry) => entry.startsWith('.ultra-init-'));",
    "      if (!stageName) throw new Error('expected owned staging directory');",
    '      const stage = path.join(process.env.UBP_TEST_PROJECT, stageName);',
    '      originalRename(stage, process.env.UBP_TEST_MOVED_STAGE);',
    '      fs.mkdirSync(stage);',
    "      fs.writeFileSync(path.join(stage, 'replacement-owner.txt'), 'preserve replacement');",
    "      const error = new Error('injected permission denial with private detail');",
    "      error.code = 'EACCES';",
    "      error.errno = -13;",
    "      error.syscall = 'open';",
    '      throw error;',
    '    }',
    '  }',
    '  return originalOpen(target, flags, ...args);',
    '};',
    '',
  ].join('\n'));
  return spawnSync(process.execPath, [
    '--require', shim,
    path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
    '--project', project,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      UBP_TEST_PRESERVED_FILE: path.join(project, '.ultra', relative),
      UBP_TEST_PROJECT: project,
      UBP_TEST_MOVED_STAGE: movedStage,
    },
  });
}

function runInitWithPublishedFileEdit(project) {
  const shim = path.join(project, 'init-published-file-edit.cjs');
  fs.writeFileSync(shim, [
    "'use strict';",
    "const fs = require('node:fs');",
    'const original = fs.linkSync.bind(fs);',
    'let changed = false;',
    'fs.linkSync = function patchedLink(source, target) {',
    '  const result = original(source, target);',
    '  if (!changed) {',
    '    changed = true;',
    "    fs.appendFileSync(target, '\\nordinary owner edit\\n');",
    '  }',
    '  return result;',
    '};',
    '',
  ].join('\n'));
  return spawnSync(process.execPath, [
    '--require', shim,
    path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
    '--project', project,
  ], { encoding: 'utf8' });
}

function runNewInitWithPublishedFileEdit(project) {
  const shim = path.join(project, 'init-new-publication-edit.cjs');
  fs.writeFileSync(shim, [
    "'use strict';",
    "const fs = require('node:fs');",
    'const original = fs.renameSync.bind(fs);',
    'let changed = false;',
    'fs.renameSync = function patchedRename(source, target) {',
    '  const result = original(source, target);',
    "  if (!changed && String(source).includes('.ultra-init-')) {",
    '    changed = true;',
    "    fs.appendFileSync(`${target}/.gitignore`, '\\nordinary owner edit\\n');",
    '  }',
    '  return result;',
    '};',
    '',
  ].join('\n'));
  return spawnSync(process.execPath, [
    '--require', shim,
    path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
    '--project', project,
  ], { encoding: 'utf8' });
}

function runInitWithReplacedStageRoot(project, movedStage) {
  const shim = path.join(project, 'init-stage-root-replacement.cjs');
  fs.writeFileSync(shim, [
    "'use strict';",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    'const originalCopy = fs.copyFileSync.bind(fs);',
    'const originalRename = fs.renameSync.bind(fs);',
    'let changed = false;',
    'fs.copyFileSync = function patchedCopy(source, target, ...args) {',
    '  const result = originalCopy(source, target, ...args);',
    "  if (!changed && String(target).includes('.ultra-init-')) {",
    '    changed = true;',
    '    let stage = path.dirname(target);',
    "    while (!path.basename(stage).startsWith('.ultra-init-')) stage = path.dirname(stage);",
    '    originalRename(stage, process.env.UBP_TEST_MOVED_STAGE);',
    '    fs.mkdirSync(stage);',
    "    fs.writeFileSync(path.join(stage, 'replacement-owner.txt'), 'preserve replacement');",
    "    const error = new Error('injected stage failure');",
    "    error.code = 'EIO';",
    '    throw error;',
    '  }',
    '  return result;',
    '};',
    '',
  ].join('\n'));
  return spawnSync(process.execPath, [
    '--require', shim,
    path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
    '--project', project,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      UBP_TEST_MOVED_STAGE: movedStage,
    },
  });
}

function runInitWithPrimaryAndCleanupConflict(project, movedStage) {
  const shim = path.join(project, 'init-primary-and-cleanup-conflict.cjs');
  fs.writeFileSync(shim, [
    "'use strict';",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    'const originalCopy = fs.copyFileSync.bind(fs);',
    'const originalRename = fs.renameSync.bind(fs);',
    'let changed = false;',
    'fs.copyFileSync = function patchedCopy(source, target, ...args) {',
    '  const result = originalCopy(source, target, ...args);',
    "  if (!changed && String(target).includes('.ultra-init-')) {",
    '    changed = true;',
    '    let stage = path.dirname(target);',
    "    while (!path.basename(stage).startsWith('.ultra-init-')) stage = path.dirname(stage);",
    '    originalRename(stage, process.env.UBP_TEST_MOVED_STAGE);',
    '    fs.mkdirSync(stage);',
    "    fs.writeFileSync(path.join(stage, 'replacement-owner.txt'), 'preserve replacement');",
    "    const error = new Error('Primary staged-file snapshot failed.');",
    "    error.code = 'initialization_snapshot_changed';",
    '    error.retryable = true;',
    "    error.phase = 'stage_snapshot';",
    "    error.path = '.gitignore';",
    '    error.recovery = {',
    "      manual_action: 'Preserve the observed project bytes and retry initialization.',",
    '    };',
    '    throw error;',
    '  }',
    '  return result;',
    '};',
    '',
  ].join('\n'));
  return spawnSync(process.execPath, [
    '--require', shim,
    path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
    '--project', project,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      UBP_TEST_MOVED_STAGE: movedStage,
    },
  });
}

function runInitWithPreservedParentReplacement(project, relative, movedParent) {
  const shim = path.join(project, 'init-preserved-parent-replacement.cjs');
  fs.writeFileSync(shim, [
    "'use strict';",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    'const originalLstat = fs.lstatSync.bind(fs);',
    'const originalRename = fs.renameSync.bind(fs);',
    'let changed = false;',
    'fs.lstatSync = function patchedLstat(target, ...args) {',
    '  if (!changed && path.resolve(target) === path.resolve(process.env.UBP_TEST_PRESERVED_FILE)) {',
    '    changed = true;',
    '    const parent = path.dirname(target);',
    '    originalRename(parent, process.env.UBP_TEST_MOVED_PARENT);',
    '    fs.mkdirSync(parent);',
    '    fs.linkSync(',
    '      path.join(process.env.UBP_TEST_MOVED_PARENT, path.basename(target)),',
    '      target,',
    '    );',
    '  }',
    '  return originalLstat(target, ...args);',
    '};',
    '',
  ].join('\n'));
  return spawnSync(process.execPath, [
    '--require', shim,
    path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
    '--project', project,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      UBP_TEST_PRESERVED_FILE: path.join(project, '.ultra', relative),
      UBP_TEST_MOVED_PARENT: movedParent,
    },
  });
}

function runInitWithPackagedTemplate(templateText) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-init-package-'));
  const project = path.join(sandbox, 'project');
  const skills = path.join(sandbox, 'skills');
  const initRoot = path.join(skills, 'ultra-init');
  const researchScripts = path.join(skills, 'ultra-research', 'scripts');
  fs.mkdirSync(project);
  fs.mkdirSync(path.join(initRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(initRoot, 'assets', 'project-template'), { recursive: true });
  fs.mkdirSync(researchScripts, { recursive: true });
  const initScript = path.join(initRoot, 'scripts', 'init_project.cjs');
  const installedTemplate = path.join(initRoot, 'assets', 'project-template', 'north-star.md');
  fs.copyFileSync(
    path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
    initScript,
  );
  fs.copyFileSync(VALIDATOR, path.join(researchScripts, 'validate_north_star.cjs'));
  fs.writeFileSync(installedTemplate, templateText);
  const result = spawnSync(process.execPath, [
    initScript, '--project', project,
  ], { encoding: 'utf8' });
  return {
    sandbox, project, result, initScript, installedTemplate,
  };
}

test('the packaged North Star is a structurally valid unresearched placeholder', () => {
  const template = read('.ultra-template/north-star.md');
  for (const heading of [
    'Acceptance and Revision',
    'Problem Reality',
    'First-Principle Propositions',
    'Value Causal Chain',
    'North Star Outcomes',
    'Hard Constraints',
    'Explicit Exclusions',
    'Uncertainties and Revisit Triggers',
    'Research Trace',
  ]) {
    assert.match(template, new RegExp(`^## ${heading}$`, 'mu'), heading);
  }
  assert.match(template, /^- Status: `unresearched`$/mu);
  assert.doesNotMatch(template, /^### (?:FP|NS|HC)-[A-Za-z0-9._-]+\b/mu);

  const result = validate(path.join(ROOT, '.ultra-template', 'north-star.md'));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.report.$schema, 'ultra-north-star-validation-v1');
  assert.equal(result.report.kind, 'north-star-v2');
  assert.equal(result.report.status, 'unresearched');
  assert.equal(result.report.valid, true);
});

test('Init materializes the unresearched placeholder and never populates semantic ids', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-init-'));
  try {
    const result = spawnSync(process.execPath, [
      path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
      '--project', project,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.north_star, {
      path: 'north-star.md',
      disposition: 'created_unresearched',
    });
    const northStar = fs.readFileSync(path.join(project, '.ultra', 'north-star.md'), 'utf8');
    assert.match(northStar, /^- Status: `unresearched`$/mu);
    assert.doesNotMatch(northStar, /^### (?:FP|NS|HC)-[A-Za-z0-9._-]+\b/mu);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('Init snapshots large preserved non-North-Star files without retaining bytes and still detects drift', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-snapshot-resource-'));
  const file = path.join(directory, 'test-report.json');
  const initial = Buffer.alloc(4 * 1024 * 1024, 0x61);
  fs.writeFileSync(file, initial);
  try {
    const probe = spawnSync(process.execPath, ['-e', [
      "const fs = require('node:fs');",
      'const { stableFileSnapshot, assertFileSnapshotUnchanged } = require(process.env.UBP_INIT_SCRIPT);',
      'const file = process.env.UBP_SNAPSHOT_FILE;',
      "const snapshot = stableFileSnapshot(file, 'test-report.json', 'classification');",
      'fs.writeFileSync(file, Buffer.alloc(snapshot.size, 0x62));',
      'let drift = null;',
      'try {',
      "  assertFileSnapshotUnchanged(file, 'test-report.json', snapshot, 'after_mutation');",
      '} catch (error) {',
      '  drift = { code: error.code, phase: error.phase, path: error.path };',
      '}',
      'process.stdout.write(JSON.stringify({',
      "  has_bytes: Object.hasOwn(snapshot, 'bytes'),",
      '  size: snapshot.size,',
      '  digest: snapshot.digest,',
      '  drift,',
      '}));',
    ].join('\n')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        UBP_INIT_SCRIPT: path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
        UBP_SNAPSHOT_FILE: file,
      },
    });
    assert.equal(probe.status, 0, probe.stderr || probe.stdout);
    assert.deepEqual(JSON.parse(probe.stdout), {
      has_bytes: false,
      size: initial.length,
      digest: crypto.createHash('sha256').update(initial).digest('hex'),
      drift: {
        code: 'initialization_snapshot_changed',
        phase: 'after_mutation',
        path: 'test-report.json',
      },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Init preserves a replacement staging directory and reports identity-bound manual recovery', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-stage-replacement-'));
  const movedStage = path.join(project, '.owned-stage-recovery');
  try {
    const result = runInitWithReplacedStageRoot(project, movedStage);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^\{/u, result.stderr);
    const failure = JSON.parse(result.stderr);
    assert.equal(failure.$schema, 'ultra-init-error-v1');
    assert.equal(failure.code, 'initialization_cleanup_conflict');
    assert.equal(failure.retryable, true);
    assert.equal(failure.phase, 'stage_cleanup');
    assert.match(failure.path, /^\.ultra-init-/u);
    assert.equal(failure.recovery.destructive_cleanup_attempted, false);
    assert.equal(failure.recovery.current_path_preserved, true);
    assert.match(failure.recovery.current_path, /\.ultra-init-/u);
    assert.match(failure.recovery.owned_directory.device, /^\d+$/u);
    assert.match(failure.recovery.owned_directory.inode, /^\d+$/u);
    assert.match(failure.recovery.manual_action, /device and inode/iu);

    const stageReplacement = failure.recovery.current_path;
    assert.equal(
      fs.readFileSync(path.join(stageReplacement, 'replacement-owner.txt'), 'utf8'),
      'preserve replacement',
    );
    assert.equal(fs.statSync(movedStage).isDirectory(), true);
    assert.ok(fs.readdirSync(movedStage).length > 0);
    assert.equal(fs.existsSync(path.join(project, '.ultra')), false);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('Init retains a pending typed failure and nests a conflicting stage-cleanup recovery', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-primary-cleanup-conflict-'));
  const movedStage = path.join(project, '.owned-stage-recovery');
  try {
    const result = runInitWithPrimaryAndCleanupConflict(project, movedStage);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^\{/u, result.stderr);
    const failure = JSON.parse(result.stderr);
    assert.equal(failure.$schema, 'ultra-init-error-v1');
    assert.equal(failure.code, 'initialization_snapshot_changed');
    assert.equal(failure.retryable, true);
    assert.equal(failure.phase, 'stage_snapshot');
    assert.equal(failure.path, '.gitignore');
    assert.equal(failure.message, 'Primary staged-file snapshot failed.');
    assert.deepEqual(failure.recovery, {
      manual_action: 'Preserve the observed project bytes and retry initialization.',
    });
    assert.equal(failure.cleanup_conflict.code, 'initialization_cleanup_conflict');
    assert.equal(failure.cleanup_conflict.retryable, true);
    assert.equal(failure.cleanup_conflict.phase, 'stage_cleanup');
    assert.match(failure.cleanup_conflict.path, /^\.ultra-init-/u);
    assert.equal(
      failure.cleanup_conflict.recovery.destructive_cleanup_attempted,
      false,
    );
    assert.equal(failure.cleanup_conflict.recovery.current_path_preserved, true);
    assert.match(
      failure.cleanup_conflict.recovery.current_path,
      /\.ultra-init-/u,
    );
    assert.match(
      failure.cleanup_conflict.recovery.manual_action,
      /device and inode/iu,
    );

    assert.equal(
      fs.readFileSync(path.join(
        failure.cleanup_conflict.recovery.current_path,
        'replacement-owner.txt',
      ), 'utf8'),
      'preserve replacement',
    );
    assert.equal(fs.statSync(movedStage).isDirectory(), true);
    assert.ok(fs.readdirSync(movedStage).length > 0);
    assert.equal(fs.existsSync(path.join(project, '.ultra')), false);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('Init reports preserved-file snapshot I/O separately and keeps cleanup recovery reachable', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-preserved-open-failure-'));
  const movedStage = `${project}-owned-stage`;
  const relative = path.join('contexts', 'TEMPLATE.md');
  const preservedFile = path.join(project, '.ultra', relative);
  const preservedBytes = fs.readFileSync(path.join(ROOT, '.ultra-template', relative));
  try {
    fs.mkdirSync(path.dirname(preservedFile), { recursive: true });
    fs.writeFileSync(preservedFile, preservedBytes);

    const result = runInitWithPreservedFileOpenFailure(project, relative, movedStage);

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stdout, '');
    const failure = JSON.parse(result.stderr);
    assert.equal(failure.$schema, 'ultra-init-error-v1');
    assert.equal(failure.code, 'initialization_snapshot_io_error');
    assert.equal(failure.retryable, true);
    assert.equal(failure.phase, 'before_publish');
    assert.equal(failure.path, relative);
    assert.equal(failure.operation, 'open');
    assert.equal(failure.errno, 'EACCES');
    assert.doesNotMatch(failure.message, /private detail/u);
    assert.match(failure.recovery.manual_action, /permissions[\s\S]*retry/iu);
    assert.equal(failure.cleanup_conflict.code, 'initialization_cleanup_conflict');
    assert.equal(failure.cleanup_conflict.phase, 'stage_cleanup');
    assert.equal(failure.cleanup_conflict.recovery.current_path_preserved, true);
    assert.equal(
      fs.readFileSync(path.join(failure.cleanup_conflict.recovery.current_path, 'replacement-owner.txt'), 'utf8'),
      'preserve replacement',
    );
    assert.deepEqual(fs.readFileSync(preservedFile), preservedBytes);
    assert.equal(fs.existsSync(path.join(project, '.ultra', 'tasks.json')), false);
    assert.equal(fs.existsSync(movedStage), true);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(movedStage, { recursive: true, force: true });
  }
});

test('Init rejects a real preserved-parent replacement exposing the same final inode', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-preserved-parent-replacement-'));
  const relative = 'contexts/TEMPLATE.md';
  const parent = path.join(project, '.ultra', 'contexts');
  const movedParent = path.join(project, '.ultra', 'contexts-original');
  const file = path.join(project, '.ultra', relative);
  const templateBytes = fs.readFileSync(path.join(ROOT, '.ultra-template', relative));
  try {
    fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(file, templateBytes);
    const original = fs.lstatSync(file, { bigint: true });

    const result = runInitWithPreservedParentReplacement(project, relative, movedParent);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), {
      $schema: 'ultra-init-error-v1',
      code: 'initialization_snapshot_changed',
      retryable: true,
      phase: 'classification',
      path: relative,
      message: `Initialization path changed during classification: ${relative}; preserve the current bytes and retry after workspace writes settle.`,
    });

    const replacement = fs.lstatSync(file, { bigint: true });
    const preserved = fs.lstatSync(path.join(movedParent, 'TEMPLATE.md'), { bigint: true });
    assert.equal(replacement.ino, original.ino);
    assert.equal(preserved.ino, original.ino);
    assert.deepEqual(fs.readFileSync(file), templateBytes);
    assert.equal(fs.existsSync(path.join(project, '.ultra', 'tasks.json')), false);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('Init rejects a preserved template file reached through a repository-external parent symlink', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-preserved-parent-symlink-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-preserved-parent-outside-'));
  const relative = 'contexts/TEMPLATE.md';
  const ultra = path.join(project, '.ultra');
  const outsideFile = path.join(outside, 'TEMPLATE.md');
  const externalBytes = Buffer.from('# External Context Template\n\nNot repository authority.\n');
  try {
    fs.mkdirSync(ultra);
    fs.writeFileSync(outsideFile, externalBytes);
    fs.symlinkSync(outside, path.join(ultra, 'contexts'), 'dir');
    const outsideStat = fs.lstatSync(outsideFile);
    assert.equal(outsideStat.isFile(), true);
    assert.equal(outsideStat.isSymbolicLink(), false);

    const result = spawnSync(process.execPath, [
      path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
      '--project', project,
    ], { encoding: 'utf8' });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), {
      $schema: 'ultra-init-error-v1',
      code: 'initialization_snapshot_changed',
      retryable: true,
      phase: 'classification',
      path: relative,
      message: `Initialization path changed during classification: ${relative}; preserve the current bytes and retry after workspace writes settle.`,
    });
    assert.deepEqual(fs.readFileSync(outsideFile), externalBytes);
    assert.equal(fs.lstatSync(path.join(ultra, 'contexts')).isSymbolicLink(), true);
    assert.equal(fs.existsSync(path.join(ultra, 'tasks.json')), false);

    fs.unlinkSync(path.join(ultra, 'contexts'));
    fs.mkdirSync(path.join(ultra, 'contexts'));
    const recovered = spawnSync(process.execPath, [
      path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
      '--project', project,
    ], { encoding: 'utf8' });
    assert.equal(recovered.status, 0, recovered.stderr || recovered.stdout);
    const report = JSON.parse(recovered.stdout);
    assert.ok(report.created.includes(relative));
    assert.equal(report.preserved.includes(relative), false);
    assert.deepEqual(
      fs.readFileSync(path.join(ultra, relative)),
      fs.readFileSync(path.join(ROOT, '.ultra-template', relative)),
    );
    assert.deepEqual(fs.readFileSync(outsideFile), externalBytes);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('Init rejects a malformed packaged placeholder through the full North Star validator', () => {
  const malformed = read('.ultra-template/north-star.md').replace(
    '- Reality: [NEEDS RESEARCH]',
    '- Reality: Model-authored product direction.',
  );
  const {
    sandbox, project, result, initScript, installedTemplate,
  } = runInitWithPackagedTemplate(malformed);
  try {
    assert.equal(result.status, 1, result.stdout);
    assert.equal(result.stdout, '');
    const failure = JSON.parse(result.stderr);
    assert.equal(failure.$schema, 'ultra-init-error-v1');
    assert.equal(failure.code, 'north_star_template_invalid');
    assert.equal(failure.retryable, true);
    assert.equal(failure.phase, 'template_validation');
    assert.equal(failure.path, 'north-star.md');
    assert.deepEqual(
      failure.diagnostics.map(({ code, message }) => ({ code, message })),
      [{
        code: 'invalid_unresearched_placeholder',
        message: 'An unresearched North Star must preserve the exact packaged placeholder bytes, fields, and sentinels',
      }],
    );
    assert.equal(fs.existsSync(path.join(project, '.ultra')), false);
    assert.deepEqual(
      fs.readdirSync(project).filter((name) => name.startsWith('.ultra-init-')),
      [],
    );

    const canonical = fs.readFileSync(path.join(ROOT, '.ultra-template', 'north-star.md'));
    fs.writeFileSync(installedTemplate, canonical);
    const recovered = spawnSync(process.execPath, [initScript, '--project', project], {
      encoding: 'utf8',
    });
    assert.equal(recovered.status, 0, recovered.stderr || recovered.stdout);
    assert.equal(JSON.parse(recovered.stdout).north_star.disposition, 'created_unresearched');
    assert.deepEqual(fs.readFileSync(path.join(project, '.ultra', 'north-star.md')), canonical);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('unresearched authority permits only the exact packaged placeholder sentinels', () => {
  const template = read('.ultra-template/north-star.md');
  const mutations = [
    ['title', template.replace('# Project North Star', '# Invented Product Direction')],
    ['authority preamble', template.replace(
      '> owner-readable structure only;',
      '> owner-readable structure only; maximize an invented metric;',
    )],
    ['adoption preamble', template.replace(
      '> Research replaces it only after evidence collection and explicit owner acceptance.',
      '> Research may infer acceptance automatically.',
    )],
    ['acceptance free prose', template.replace(
      '- Supersedes: `none`',
      '- Supersedes: `none`\n\nModel-authored direction.',
    )],
    ['Schema', template.replace('- Schema: `north-star-v2`', '- Schema: `north-star-v3`')],
    ['Status', template.replace('- Status: `unresearched`', '- Status: `draft`')],
    ['Revision', template.replace('- Revision: `none`', '- Revision: `invented-r1`')],
    ['Owner acceptance source', template.replace(
      '- Owner acceptance source: `none`',
      '- Owner acceptance source: `assumed`',
    )],
    ['Acceptance time', template.replace(
      '- Acceptance time: `not-recorded`',
      '- Acceptance time: `2026-08-15`',
    )],
    ['Supersedes', template.replace('- Supersedes: `none`', '- Supersedes: `r0`')],
    ['Problem Reality', replaceSectionBody(
      template,
      'Problem Reality',
      '- Reality: Model-authored reality.\n- Evidence: Assumed.\n- Unknowns: None.',
    )],
    ['First-Principle Propositions', replaceSectionBody(
      template,
      'First-Principle Propositions',
      'No principles yet.',
    )],
    ['Value Causal Chain', replaceSectionBody(template, 'Value Causal Chain', 'A -> B.')],
    ['North Star Outcomes', replaceSectionBody(template, 'North Star Outcomes', 'Ship faster.')],
    ['Hard Constraints', replaceSectionBody(template, 'Hard Constraints', 'Never fail.')],
    ['Explicit Exclusions', replaceSectionBody(template, 'Explicit Exclusions', '- No exclusions.')],
    ['Uncertainties and Revisit Triggers', replaceSectionBody(
      template,
      'Uncertainties and Revisit Triggers',
      '- No uncertainty.',
    )],
    ['Research Trace', replaceSectionBody(
      template,
      'Research Trace',
      '- Project Brief: `project-brief.md`\n- Research runs: inferred\n- Sources and decisions: none',
    )],
    ['interstitial text', template.replace(
      '[NEEDS RESEARCH: do not create an outcome ID or metric during Init.]',
      '[NEEDS RESEARCH: do not create an outcome ID or metric during Init.]\n\nInvented semantic premise.',
    )],
    ['trailing bytes', `${template}\n<!-- invented -->\n`],
  ];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-unresearched-sentinel-'));
  const file = path.join(directory, 'north-star.md');
  try {
    for (const [label, mutation] of mutations) {
      assert.notEqual(mutation, template, label);
      fs.writeFileSync(file, mutation);
      const result = validate(file);
      assert.equal(result.status, 1, `${label}: ${result.stdout}`);
      if (result.report.status === 'unresearched') {
        assert.ok(
          result.report.diagnostics.some((item) => item.code === 'invalid_unresearched_placeholder'),
          `${label}: ${result.stdout}`,
        );
      } else assert.ok(result.report.diagnostics.length > 0, `${label}: ${result.stdout}`);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the migrated repository North Star is an accepted v2 revision backed by owner source', () => {
  const result = validate(path.join(ROOT, '.ultra', 'north-star.md'));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.report.valid, true);
  assert.equal(result.report.status, 'accepted');
  assert.equal(result.report.revision, 'north-star-v2-r3');
  assert.ok(result.report.ids.FP.length >= 1);
  assert.ok(result.report.ids.NS.length >= 1);
  assert.ok(result.report.ids.HC.length >= 1);

  const northStar = read('.ultra/north-star.md');
  assert.match(
    northStar,
    /Owner acceptance source: `\.ultra\/decisions\/2026-08-17-ultra-3-0-north-star-r3\.md#owner-record`/u,
  );
  assert.match(northStar, /Acceptance time: `not-recorded`/u);
  assert.match(northStar, /Supersedes: `north-star-v2-r2`/u);
  assert.doesNotMatch(northStar, /^## Project Direction$/mu);
  assert.doesNotMatch(northStar, /^## North Star Outcome$/mu);
});

test('the validator checks structure and references without deciding semantic truth', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-validation-'));
  const file = path.join(directory, '.ultra', 'north-star.md');
  try {
    writeBoundAccepted(directory, acceptedFixture());
    const absurd = validate(file);
    assert.equal(absurd.status, 0, absurd.stderr || absurd.stdout);
    assert.equal(absurd.report.valid, true);

    fs.writeFileSync(file, acceptedFixture({ duplicate: true }));
    const duplicate = validate(file);
    assert.equal(duplicate.status, 1);
    assert.ok(duplicate.report.diagnostics.some((item) => item.code === 'duplicate_id'));

    fs.writeFileSync(file, acceptedFixture({ dangling: true }));
    const dangling = validate(file);
    assert.equal(dangling.status, 1);
    assert.ok(dangling.report.diagnostics.some((item) => item.code === 'dangling_reference'));

    fs.writeFileSync(
      file,
      acceptedFixture().replace('- Falsifier or revisit trigger: Contrary evidence.\n', ''),
    );
    const missing = validate(file);
    assert.equal(missing.status, 1);
    assert.ok(missing.report.diagnostics.some((item) => item.code === 'missing_field'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('accepted revisions require durable acceptance identity and accepted propositions', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-acceptance-'));
  const file = path.join(directory, 'north-star.md');
  try {
    for (const [candidate, code] of [
      [acceptedFixture({ revision: 'none' }), 'accepted_revision_missing'],
      [acceptedFixture({ ownerSource: 'none' }), 'accepted_owner_source_missing'],
      [acceptedFixture({ fpStatus: 'draft' }), 'unaccepted_proposition'],
    ]) {
      fs.writeFileSync(file, candidate);
      const result = validate(file);
      assert.equal(result.status, 1, result.stdout);
      assert.ok(result.report.diagnostics.some((item) => item.code === code), result.stdout);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('draft revisions are mutable, may carry semantic ids, and cannot claim owner acceptance', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-draft-'));
  const file = path.join(directory, 'candidate.md');
  const canonical = path.join(ROOT, '.ultra', 'north-star.md');
  const before = fs.readFileSync(canonical);
  try {
    fs.writeFileSync(file, acceptedFixture({
      status: 'draft',
      revision: 'candidate-r2',
      ownerSource: 'intent.md#execution-approval',
      fpStatus: 'draft',
    }));
    const claimed = validate(file);
    assert.equal(claimed.status, 1, claimed.stdout);
    assert.ok(claimed.report.diagnostics.some((item) => item.code === 'draft_claims_owner_acceptance'));

    fs.writeFileSync(file, acceptedFixture({
      status: 'draft',
      revision: 'candidate-r2',
      ownerSource: 'none',
      fpStatus: 'draft',
    }));
    const corrected = validate(file);
    assert.equal(corrected.status, 0, corrected.stdout);
    assert.equal(corrected.report.status, 'draft');
    assert.deepEqual(fs.readFileSync(canonical), before, 'candidate validation must not mutate accepted authority');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('v2 structural validation rejects duplicate or reordered headings and misplaced definitions', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-sections-'));
  const file = path.join(directory, 'north-star.md');
  try {
    const base = acceptedFixture();
    for (const [candidate, code] of [
      [base.replace('## Problem Reality\n', '## Problem Reality\n\nDuplicate body.\n\n## Problem Reality\n'), 'duplicate_heading'],
      [base.replace('## Problem Reality', '## TEMP').replace('## First-Principle Propositions', '## Problem Reality').replace('## TEMP', '## First-Principle Propositions'), 'heading_order'],
      [base.replace('## Problem Reality\n', '## Problem Reality\n\n### FP-WRONG — misplaced\n\n- Proposition: misplaced\n- Evidence: source\n- Causal consequence: consequence\n- Falsifier or revisit trigger: trigger\n- Status: `accepted`\n'), 'definition_wrong_section'],
    ]) {
      fs.writeFileSync(file, candidate);
      const result = validate(file);
      assert.equal(result.status, 1, result.stdout);
      assert.ok(result.report.diagnostics.some((item) => item.code === code), result.stdout);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('accepted causal chains require a resolvable row with nonempty capability and behavior', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-chain-'));
  const file = path.join(directory, 'north-star.md');
  try {
    for (const [candidate, code] of [
      [acceptedFixture({ chain: false }), 'missing_causal_chain'],
      [acceptedFixture({ capability: '' }), 'invalid_causal_chain'],
      [acceptedFixture({ behavior: '' }), 'invalid_causal_chain'],
      [acceptedFixture().replace('| VC-1 | `FP-1` | A capability | A behavior | `NS-1` |', '| VC-1 | malformed | A capability | A behavior | `NS-1` |'), 'invalid_causal_chain'],
    ]) {
      fs.writeFileSync(file, candidate);
      const result = validate(file);
      assert.equal(result.status, 1, result.stdout);
      assert.ok(result.report.diagnostics.some((item) => item.code === code), result.stdout);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('accepted revisions reject every NEEDS RESEARCH placeholder spelling', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-placeholder-'));
  const file = path.join(directory, 'north-star.md');
  try {
    fs.writeFileSync(file, acceptedFixture({ proposition: '[NEEDS RESEARCH: verify premise]' }));
    const result = validate(file);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(result.report.diagnostics.some((item) => item.code === 'unresolved_placeholder'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('v2 field lists reject duplicates instead of silently taking the last value', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-duplicate-field-'));
  try {
    const base = acceptedFixture();
    for (const candidate of [
      base.replace('- Status: `accepted`\n', '- Status: `accepted`\n- Status: `accepted`\n'),
      base.replace('- Proposition: The moon is cheese.\n', '- Proposition: The moon is cheese.\n- Proposition: Duplicate.\n'),
      base.replace('- Outcome: A test outcome.\n', '- Outcome: A test outcome.\n- Outcome: Duplicate.\n'),
      base.replace('- Constraint: Do not expand authority.\n', '- Constraint: Do not expand authority.\n- Constraint: Duplicate.\n'),
    ]) {
      const { file } = writeBoundAccepted(directory, candidate);
      const result = validate(file);
      assert.equal(result.status, 1, result.stdout);
      assert.ok(result.report.diagnostics.some((item) => item.code === 'duplicate_field'), result.stdout);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('accepted revisions reject every repository unresolved marker', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-unresolved-'));
  try {
    for (const marker of [
      '[NEEDS CLARIFICATION]',
      '[NEEDS RESEARCH]',
      '[NEEDS RESEARCH: Research creates stable proposition IDs only after owner acceptance.]',
      '[NEEDS RESEARCH: map accepted principles through capability and behavior to outcomes.]',
      '[NEEDS RESEARCH: do not create an outcome ID or metric during Init.]',
      '[NEEDS RESEARCH: do not create a constraint ID during Init.]',
    ]) {
      const { file } = writeBoundAccepted(
        directory,
        acceptedFixture({ proposition: marker }),
      );
      const result = validate(file);
      assert.equal(result.status, 1, result.stdout);
      assert.ok(result.report.diagnostics.some((item) => item.code === 'unresolved_placeholder'), marker);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('accepted authority resolves a repository decision anchor and exact immutable snapshot binding', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-binding-'));
  try {
    const text = acceptedFixture();
    let bound = writeBoundAccepted(directory, text);
    let result = validate(bound.file);
    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.report.acceptance_binding.source, '.ultra/decisions/D-1.md#owner-record');
    assert.equal(result.report.acceptance_binding.snapshot, '.ultra/research/R-1/north-star-v2-r1.accepted.md');
    assert.deepEqual(result.report.source_observations, [
      {
        role: 'decision',
        path: '.ultra/decisions/D-1.md',
        sha256: crypto.createHash('sha256').update(fs.readFileSync(bound.decision)).digest('hex'),
        byte_length: fs.statSync(bound.decision).size,
      },
      {
        role: 'snapshot',
        path: '.ultra/research/R-1/north-star-v2-r1.accepted.md',
        sha256: crypto.createHash('sha256').update(fs.readFileSync(bound.snapshot)).digest('hex'),
        byte_length: fs.statSync(bound.snapshot).size,
      },
    ]);

    for (const [candidate, code] of [
      [acceptedFixture({ ownerSource: 'https://example.com/decision#owner-record' }), 'invalid_owner_source'],
      [acceptedFixture({ ownerSource: '.ultra/decisions/missing.md#owner-record' }), 'owner_source_missing'],
      [acceptedFixture({ ownerSource: '.ultra/decisions/D-1.md#missing-anchor' }), 'owner_anchor_missing'],
      [acceptedFixture({ ownerSource: '../decisions/D-1.md#owner-record' }), 'invalid_owner_source'],
      [acceptedFixture({ ownerSource: 'garbage' }), 'invalid_owner_source'],
    ]) {
      fs.writeFileSync(bound.file, candidate);
      result = validate(bound.file);
      assert.equal(result.status, 1, result.stdout);
      assert.ok(result.report.diagnostics.some((item) => item.code === code), result.stdout);
    }

    bound = writeBoundAccepted(directory, text);
    fs.appendFileSync(bound.decision, '\n- North Star content SHA-256: `0000000000000000000000000000000000000000000000000000000000000000`\n');
    result = validate(bound.file);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(result.report.diagnostics.some((item) => ['duplicate_binding_field', 'content_digest_mismatch'].includes(item.code)), result.stdout);

    bound = writeBoundAccepted(directory, text);
    fs.writeFileSync(bound.snapshot, `${text}\ncorrupt`);
    result = validate(bound.file);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(result.report.diagnostics.some((item) => item.code === 'snapshot_mismatch'), result.stdout);

    for (const [statusLine, code] of [
      ['> **Status**: draft', 'owner_decision_not_accepted'],
      ['> **Status**: rejected', 'owner_decision_not_accepted'],
      ['> **Status**: withdrawn', 'owner_decision_not_accepted'],
      ['', 'owner_decision_status_missing'],
      ['> **Status**: accepted\n> **Status**: accepted', 'duplicate_owner_decision_status'],
    ]) {
      bound = writeBoundAccepted(directory, text);
      const decision = fs.readFileSync(bound.decision, 'utf8');
      fs.writeFileSync(
        bound.decision,
        decision.replace('> **Status**: accepted', statusLine),
      );
      result = validate(bound.file);
      assert.equal(result.status, 1, result.stdout);
      assert.ok(result.report.diagnostics.some((item) => item.code === code), result.stdout);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('accepted publication requires unique nonempty durable owner evidence inside the cited section', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-owner-record-'));
  const fields = [
    'Conversation scope',
    'Exact raw owner acceptance',
    'Agency boundary',
    'Time boundary',
    'Revision boundary',
  ];
  const complete = fields.map((name) => `- ${name}: x`).join('\n');
  try {
    let bound = writeBoundAccepted(directory, acceptedFixture(), { ownerRecord: complete });
    let result = validate(bound.file);
    assert.equal(result.status, 0, result.stdout);

    for (const name of fields) {
      const missing = complete
        .split('\n')
        .filter((line) => !line.startsWith(`- ${name}:`))
        .join('\n');
      bound = writeBoundAccepted(directory, acceptedFixture(), { ownerRecord: missing });
      result = validate(bound.file);
      assert.equal(result.status, 1, `${name}: ${result.stdout}`);
      assert.ok(
        result.report.diagnostics.some(
          (item) => item.code === 'owner_record_field_missing'
            && item.location === `Owner Record.${name}`,
        ),
        `${name}: ${result.stdout}`,
      );
    }

    bound = writeBoundAccepted(directory, acceptedFixture(), {
      ownerRecord: complete.replace('- Exact raw owner acceptance: x', '- Exact raw owner acceptance:'),
    });
    result = validate(bound.file);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(
      result.report.diagnostics.some((item) => item.code === 'owner_record_field_empty'),
      result.stdout,
    );

    bound = writeBoundAccepted(directory, acceptedFixture(), {
      ownerRecord: `${complete}\n- Conversation scope: duplicate`,
    });
    result = validate(bound.file);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(
      result.report.diagnostics.some((item) => item.code === 'duplicate_owner_record_field'),
      result.stdout,
    );

    bound = writeBoundAccepted(directory, acceptedFixture(), { ownerRecord: '' });
    const decision = fs.readFileSync(bound.decision, 'utf8');
    fs.writeFileSync(
      bound.decision,
      decision.replace('## Accepted Artifact Binding', `## Uncited Owner-Like Fields\n\n${complete}\n\n## Accepted Artifact Binding`),
    );
    result = validate(bound.file);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(
      result.report.diagnostics.some((item) => item.code === 'owner_record_field_missing'),
      result.stdout,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('accepted publication rejects an Owner Record heading inside a fenced code block', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-owner-fence-'));
  const ownerRecord = [
    '- Conversation scope: this fixture invocation.',
    '- Exact raw owner acceptance: "accept this fixture"',
    '- Agency boundary: the owner accepts the frame; the model owns final wording.',
    '- Time boundary: not-recorded because the fixture supplies no owner-authored time.',
    '- Revision boundary: this revision only; a future revision does not inherit acceptance.',
  ].join('\n');
  try {
    for (const [opening, closing] of [['```markdown', '```'], ['~~~markdown', '~~~']]) {
      const bound = writeBoundAccepted(directory, acceptedFixture(), { ownerRecord });
      const decision = fs.readFileSync(bound.decision, 'utf8');
      fs.writeFileSync(
        bound.decision,
        decision.replace(
          `## Owner Record\n\n${ownerRecord}`,
          `${opening}\n## Owner Record\n\n${ownerRecord}\n${closing}`,
        ),
      );
      const result = validate(bound.file);
      assert.equal(result.status, 1, `${opening}: ${result.stdout}`);
      assert.ok(
        result.report.diagnostics.some((item) => item.code === 'owner_anchor_missing'),
        `${opening}: ${result.stdout}`,
      );
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('North Star grammar consumes only rendered lines outside backtick and tilde fences', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-rendered-lines-'));
  const ownerRecord = [
    '- Conversation scope: this fixture invocation.',
    '- Exact raw owner acceptance: "accept this fixture"',
    '- Agency boundary: the owner accepts the frame; the model owns final wording.',
    '- Time boundary: not-recorded because the fixture supplies no owner-authored time.',
    '- Revision boundary: this revision only; a future revision does not inherit acceptance.',
  ].join('\n');
  try {
    for (const [opening, closing] of [['```markdown', '```'], ['~~~markdown', '~~~']]) {
      const fenced = (value) => `${opening}\n${value}\n${closing}`;
      const base = acceptedFixture();
      const fpEntry = base.match(/^### FP-1[\s\S]*?(?=^## Value Causal Chain)/mu)[0].trim();
      const cases = [
        [
          'complete v2 grammar',
          `# Project North Star\n\n${fenced(base.replace(/^# Project North Star\n\n/u, ''))}\n`,
          null,
          ['unknown_schema', 'missing_heading'],
        ],
        [
          'top-level heading',
          base.replace('## Problem Reality', fenced('## Problem Reality')),
          null,
          ['missing_heading'],
        ],
        [
          'acceptance field',
          base.replace('- Status: `accepted`', fenced('- Status: `accepted`')),
          null,
          ['missing_field'],
        ],
        [
          'semantic entry',
          replaceSectionBody(
            base,
            'First-Principle Propositions',
            fenced(fpEntry),
          ),
          null,
          ['missing_definition'],
        ],
        [
          'causal row',
          base.replace(
            '| VC-1 | `FP-1` | A capability | A behavior | `NS-1` |',
            fenced('| VC-1 | `FP-1` | A capability | A behavior | `NS-1` |'),
          ),
          null,
          ['missing_causal_chain'],
        ],
        [
          'owner decision status',
          base,
          (decision) => decision.replace(
            '> **Status**: accepted',
            fenced('> **Status**: accepted'),
          ),
          ['owner_decision_status_missing'],
        ],
        [
          'Owner Record fields',
          base,
          (decision) => decision.replace(ownerRecord, fenced(ownerRecord)),
          ['owner_record_field_missing'],
        ],
        [
          'accepted binding fields',
          base,
          (decision) => decision.replace(
            /- North Star content SHA-256:[\s\S]*$/u,
            (fields) => fenced(fields.trim()),
          ),
          ['binding_field_missing'],
        ],
      ];

      for (const [label, candidate, mutateDecision, expectedCodes] of cases) {
        const bound = writeBoundAccepted(directory, candidate, { ownerRecord });
        if (mutateDecision) {
          fs.writeFileSync(
            bound.decision,
            mutateDecision(fs.readFileSync(bound.decision, 'utf8')),
          );
        }
        const result = validate(bound.file);
        assert.equal(result.status, 1, `${opening} ${label}: ${result.stdout}`);
        assert.equal(result.report.valid, false, `${opening} ${label}`);
        assert.ok(
          result.report.diagnostics.some((item) => expectedCodes.includes(item.code)),
          `${opening} ${label}: ${result.stdout}`,
        );
      }

      const illustrativeCode = base.replace(
        '- Reality: A test reality.',
        `- Reality: A test reality.\n\n${fenced('HC-404 [NEEDS RESEARCH: illustrative only]')}`,
      );
      const bound = writeBoundAccepted(directory, illustrativeCode, { ownerRecord });
      const result = validate(bound.file);
      assert.equal(result.status, 0, `${opening} illustrative code: ${result.stdout}`);
      assert.equal(result.report.valid, true);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('bounded stdin validation binds caller-owned bytes to the canonical path with an exact receipt', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp north star stdin '));
  try {
    const bound = writeBoundAccepted(directory, acceptedFixture());
    const canonicalPath = path.resolve(bound.file);
    const acceptedBytes = fs.readFileSync(bound.file);
    fs.writeFileSync(bound.file, '# Replaced after caller snapshot\n');

    const accepted = spawnSync(
      process.execPath,
      [VALIDATOR, '--stdin', '--path', canonicalPath],
      { input: acceptedBytes, encoding: 'utf8' },
    );
    assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
    const acceptedReport = JSON.parse(accepted.stdout);
    assert.equal(acceptedReport.valid, true);
    assert.equal(acceptedReport.classification, 'accepted');
    assert.equal(acceptedReport.path, canonicalPath);
    assert.deepEqual(acceptedReport.input, {
      path: canonicalPath,
      byte_length: acceptedBytes.length,
      sha256: crypto.createHash('sha256').update(acceptedBytes).digest('hex'),
    });

    const invalidBytes = Buffer.from([0x23, 0x20, 0xff, 0x0a]);
    const invalid = spawnSync(
      process.execPath,
      [VALIDATOR, '--stdin', '--path', canonicalPath],
      { input: invalidBytes, encoding: 'utf8' },
    );
    assert.equal(invalid.status, 1, invalid.stderr || invalid.stdout);
    const invalidReport = JSON.parse(invalid.stdout);
    assert.equal(invalidReport.diagnostics[0].code, 'invalid_utf8');
    assert.deepEqual(invalidReport.input, {
      path: canonicalPath,
      byte_length: invalidBytes.length,
      sha256: crypto.createHash('sha256').update(invalidBytes).digest('hex'),
    });

    const oversizedBytes = Buffer.alloc((8 * 1024 * 1024) + 1, 0x78);
    const oversized = spawnSync(
      process.execPath,
      [VALIDATOR, '--stdin', '--path', canonicalPath],
      { input: oversizedBytes, encoding: 'utf8' },
    );
    assert.equal(oversized.status, 1, oversized.stderr || oversized.stdout);
    const oversizedReport = JSON.parse(oversized.stdout);
    assert.equal(oversizedReport.diagnostics[0].code, 'input_too_large');
    assert.deepEqual(oversizedReport.input, {
      path: canonicalPath,
      byte_length: oversizedBytes.length,
      sha256: crypto.createHash('sha256').update(oversizedBytes).digest('hex'),
    });
    assert.ok(Buffer.byteLength(oversized.stdout, 'utf8') < 1024 * 1024);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the validator rejects invalid or non-round-trip UTF-8 before classifying or binding authority', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-invalid-utf8-'));
  const file = path.join(directory, '.ultra', 'north-star.md');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const bytes of [
      Buffer.from([0x23, 0x20, 0xff, 0x0a]),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# North Star\n', 'utf8')]),
    ]) {
      fs.writeFileSync(file, bytes);
      const result = validate(file);
      assert.equal(result.status, 1, result.stdout);
      assert.equal(result.report.valid, false);
      assert.ok(
        result.report.diagnostics.some((item) => item.code === 'invalid_utf8'),
        result.stdout,
      );
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('accepted byte binding preserves repeated markup and repository paths containing spaces', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp north star raw bytes '));
  const directory = path.join(parent, 'project with repeated  spaces');
  const text = acceptedFixture({
    proposition: 'Preserve ``repeated markup`` and  repeated  spaces byte-for-byte.',
  });
  try {
    const bound = writeBoundAccepted(directory, text);
    const result = validate(bound.file);
    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.report.valid, true);
    assert.equal(
      result.report.acceptance_binding.content_sha256,
      crypto.createHash('sha256').update(fs.readFileSync(bound.file)).digest('hex'),
    );
    assert.equal(
      result.report.acceptance_binding.git_blob_digest,
      gitBlobDigest(fs.readFileSync(bound.file)),
    );
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('accepted authority rejects canonical, decision, and snapshot symlink escapes', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-symlink-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-outside-'));
  const text = acceptedFixture();
  try {
    let project = path.join(sandbox, 'authority');
    let bound = writeBoundAccepted(project, text);
    const externalAuthority = path.join(outside, 'north-star.md');
    fs.writeFileSync(externalAuthority, text);
    fs.unlinkSync(bound.file);
    fs.symlinkSync(externalAuthority, bound.file);
    let result = validate(bound.file);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(
      result.report.diagnostics.some((item) => item.code === 'authority_path_escape'),
      result.stdout,
    );

    project = path.join(sandbox, 'decision');
    bound = writeBoundAccepted(project, text);
    const externalDecision = path.join(outside, 'D-1.md');
    fs.copyFileSync(bound.decision, externalDecision);
    fs.unlinkSync(bound.decision);
    fs.symlinkSync(externalDecision, bound.decision);
    result = validate(bound.file);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(
      result.report.diagnostics.some((item) => item.code === 'owner_source_path_escape'),
      result.stdout,
    );

    project = path.join(sandbox, 'snapshot');
    bound = writeBoundAccepted(project, text);
    const externalSnapshot = path.join(outside, 'north-star-v2-r1.accepted.md');
    fs.copyFileSync(bound.snapshot, externalSnapshot);
    fs.unlinkSync(bound.snapshot);
    fs.symlinkSync(externalSnapshot, bound.snapshot);
    result = validate(bound.file);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(
      result.report.diagnostics.some((item) => item.code === 'snapshot_path_escape'),
      result.stdout,
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('the canonical JavaScript validator classifies the strict North Star corpus', () => {
  const draft = acceptedFixture({ status: 'draft', ownerSource: 'none', fpStatus: 'draft' });
  const unquoted = acceptedFixture().replace(/`north-star-v2`/u, 'north-star-v2').replace(/`accepted`/u, 'accepted');
  const corpus = [
    ['accepted', acceptedFixture()],
    ['accepted', unquoted],
    ['draft', draft],
    ['unresearched', read('.ultra-template/north-star.md')],
    ['legacy', '# Project North Star\n\n## One-line\nLegacy authority.\n'],
    ['unknown', '# Project North Star\n\n## One-line\nLegacy authority.\n\n## Notes for agents\nNot allowed on this form.\n'],
    ['legacy', '# Project North Star\n\n## Project Direction\nDirection.\n\n## North Star Outcome\nOutcome.\n\n## Hard Constraints\nConstraint.\n'],
    ['legacy', '# Project North Star\n\n## Project Direction\nDirection.\n\n## North Star Outcome\nOutcome.\n\n## Hard Constraints\nConstraint.\n\n## Notes for agents\nSupported v0.26 note.\n'],
    ['unknown', acceptedFixture().replace('## Problem Reality\n', '## Problem Reality\n\n## Problem Reality\n')],
    ['unknown', '# Project North Star\n\n## Project Direction\nPartial legacy.\n'],
    ['mixed', `${acceptedFixture()}\n## One-line\nLegacy bypass.\n`],
  ];
  for (const [expected, text] of corpus) {
    assert.equal(classifyText(text), expected);
  }
});

test('legacy North Stars remain readable for adoption without being misreported as v2', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-legacy-'));
  const file = path.join(directory, 'north-star.md');
  try {
    fs.writeFileSync(file, '# Project North Star\n\n## One-line\nKeep legacy authority.\n');
    const result = validate(file);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.report.valid, true);
    assert.equal(result.report.kind, 'legacy');
    assert.equal(result.report.status, 'legacy_unadopted');
    assert.ok(result.report.diagnostics.some((item) => item.code === 'legacy_north_star'));

    fs.writeFileSync(file, `# Project North Star

> **Authority**: legacy v0.26 authority.

## Project Direction

Ship a real workflow.

## North Star Outcome

- \`NS-01\` outcome: A real workflow completes.

## Hard Constraints

- \`HC-1\`: Preserve owner authority.

## Explicit Exclusions

- No daemon.

## Research Trace

- Project brief: \`project-brief.md\`
`);
    const v026 = validate(file);
    assert.equal(v026.status, 0, v026.stdout);
    assert.equal(v026.report.kind, 'legacy');
    assert.equal(v026.report.status, 'legacy_unadopted');

    fs.writeFileSync(file, acceptedFixture({ extra: '\n## One-line\nBypass v2 validation.\n' }).replace('- Revision: `r1`', '- Revision: `none`'));
    const mixed = validate(file);
    assert.equal(mixed.status, 1, mixed.stdout);
    assert.notEqual(mixed.report.kind, 'legacy');
    assert.ok(mixed.report.diagnostics.some((item) => ['mixed_schema', 'accepted_revision_missing'].includes(item.code)));

    fs.writeFileSync(file, '# Project North Star\n\n## Project Direction\nOnly one legacy heading.\n');
    const malformed = validate(file);
    assert.equal(malformed.status, 1, malformed.stdout);
    assert.equal(malformed.report.kind, 'unknown');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Init classifies preserved North Stars exactly and never labels unknown content authority', () => {
  const cases = [
    [read('.ultra-template/north-star.md'), 'preserved_unresearched'],
    [acceptedFixture(), 'preserved_accepted'],
    ['# Project North Star\n\n## One-line\nLegacy request.\n', 'preserved_legacy'],
    ['# Project North Star\n\n## Project Direction\nMalformed partial legacy.\n', 'preserved_unknown'],
    [acceptedFixture({ status: 'draft', ownerSource: 'none', fpStatus: 'draft' }), 'preserved_unknown'],
  ];
  for (const [candidate, disposition] of cases) {
    const { project, result, report } = initExistingNorthStar(candidate);
    try {
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(report.north_star.disposition, disposition);
      assert.notEqual(report.north_star.disposition, 'preserved_authority');
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  }
});

test('Init classifies preserved authority from the canonical raw-byte validator report', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-init-invalid-utf8-'));
  try {
    const original = Buffer.from(acceptedFixture({ proposition: 'A raw byte marker.' }), 'utf8');
    const malformed = Buffer.from(original);
    const marker = original.indexOf(Buffer.from('raw byte marker', 'utf8'));
    assert.notEqual(marker, -1);
    malformed[marker] = 0xff;

    const bound = writeBoundAccepted(project, malformed.toString('utf8'));
    fs.writeFileSync(bound.file, malformed);

    const canonical = validate(bound.file);
    assert.equal(canonical.status, 1, canonical.stdout);
    assert.ok(
      canonical.report.diagnostics.some((item) => item.code === 'invalid_utf8'),
      canonical.stdout,
    );

    const result = spawnSync(process.execPath, [
      path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
      '--project', project,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.north_star.disposition, 'preserved_unknown');
    assert.ok(
      report.north_star.diagnostics.some((item) => item.code === 'invalid_utf8'),
      result.stdout,
    );
    assert.deepEqual(fs.readFileSync(bound.file), malformed);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

for (const [seam, phase] of [
  ['before-publication', 'before_publish'],
  ['after-publication', 'after_publish'],
]) {
  test(`Init returns a retryable conflict when preserved North Star changes ${seam}`, () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), `ubp-north-star-init-${seam}-`));
    const accepted = acceptedFixture({ proposition: `Stable authority at ${seam}.` });
    try {
      const bound = writeBoundAccepted(project, accepted);
      const original = fs.readFileSync(bound.file);
      const result = runInitWithPreservedNorthStarRace(project, seam);
      assert.equal(result.status, 1, result.stderr || result.stdout);
      assert.equal(result.stdout, '');
      const conflict = JSON.parse(result.stderr);
      assert.deepEqual(conflict, {
        $schema: 'ultra-init-error-v1',
        code: 'preserved_north_star_changed',
        retryable: true,
        phase,
        path: 'north-star.md',
        message: 'Preserved North Star changed during initialization; retry after the file is stable.',
      });
      assert.deepEqual(
        fs.readFileSync(bound.file),
        Buffer.concat([original, Buffer.from([0xff])]),
      );
      assert.deepEqual(
        fs.readdirSync(path.join(project, '.ultra')).sort(),
        ['decisions', 'north-star.md', 'research'],
      );
      assert.deepEqual(
        fs.readdirSync(project).filter((name) => name.startsWith('.ultra-init-')),
        [],
      );

      writeBoundAccepted(project, accepted);
      const recovered = spawnSync(process.execPath, [
        path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
        '--project', project,
      ], { encoding: 'utf8' });
      assert.equal(recovered.status, 0, recovered.stderr || recovered.stdout);
      assert.equal(JSON.parse(recovered.stdout).north_star.disposition, 'preserved_accepted');
      assert.ok(fs.existsSync(path.join(project, '.ultra', 'tasks.json')));
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });
}

test('Init preserves an ordinary edit to any pre-existing file and returns a retryable conflict', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-preserved-file-edit-'));
  const relative = 'project-brief.md';
  const file = path.join(project, '.ultra', relative);
  try {
    writeBoundAccepted(project, acceptedFixture({ proposition: 'Preserve every existing file.' }));
    fs.writeFileSync(file, '# Project Brief\n\nOwner baseline.\n');
    const original = fs.readFileSync(file);

    const result = runInitWithPreservedFileEdit(project, relative);

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), {
      $schema: 'ultra-init-error-v1',
      code: 'initialization_snapshot_changed',
      retryable: true,
      phase: 'after_publish',
      path: relative,
      message: `Initialization path changed during after_publish: ${relative}; preserve the current bytes and retry after workspace writes settle.`,
    });
    assert.deepEqual(
      fs.readFileSync(file),
      Buffer.concat([original, Buffer.from('\nordinary owner edit\n')]),
    );
    assert.equal(fs.existsSync(path.join(project, '.ultra', '.gitignore')), false);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('Init preserves an ordinary edit to a newly published file during retryable rollback', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-published-file-edit-'));
  const relative = '.gitignore';
  const file = path.join(project, '.ultra', relative);
  try {
    writeBoundAccepted(project, acceptedFixture({ proposition: 'Preserve a changed publication.' }));
    const expected = Buffer.concat([
      fs.readFileSync(path.join(ROOT, '.ultra-template', relative)),
      Buffer.from('\nordinary owner edit\n'),
    ]);

    const result = runInitWithPublishedFileEdit(project);

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^\{/u, result.stderr);
    assert.deepEqual(JSON.parse(result.stderr), {
      $schema: 'ultra-init-error-v1',
      code: 'initialization_snapshot_changed',
      retryable: true,
      phase: 'publish_verify',
      path: relative,
      message: `Initialization path changed during publish_verify: ${relative}; preserve the current bytes and retry after workspace writes settle.`,
    });
    assert.deepEqual(fs.readFileSync(file), expected);
    assert.deepEqual(
      fs.readdirSync(project).filter((name) => name.startsWith('.ultra-init-')),
      [],
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('Init rolls back only unchanged files after an ordinary edit to a new skeleton', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-new-skeleton-edit-'));
  const relative = '.gitignore';
  const file = path.join(project, '.ultra', relative);
  try {
    const expected = Buffer.concat([
      fs.readFileSync(path.join(ROOT, '.ultra-template', relative)),
      Buffer.from('\nordinary owner edit\n'),
    ]);

    const result = runNewInitWithPublishedFileEdit(project);

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), {
      $schema: 'ultra-init-error-v1',
      code: 'initialization_snapshot_changed',
      retryable: true,
      phase: 'after_publish',
      path: relative,
      message: `Initialization path changed during after_publish: ${relative}; preserve the current bytes and retry after workspace writes settle.`,
    });
    assert.deepEqual(fs.readFileSync(file), expected);
    assert.deepEqual(fs.readdirSync(path.join(project, '.ultra')), [relative]);
    assert.deepEqual(
      fs.readdirSync(project).filter((name) => name.startsWith('.ultra-init-')),
      [],
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('the accepted revision cites a stable owner decision and a complete bounded Research run', () => {
  const northStar = read('.ultra/north-star.md');
  const decisionPath = '.ultra/decisions/2026-08-17-ultra-3-0-north-star-r3.md';
  assert.match(northStar, new RegExp(`Owner acceptance source: \`${decisionPath}#owner-record\``, 'u'));
  const decision = read(decisionPath);
  assert.match(decision, /## Owner Record/u);
  assert.match(decision, /You are the sole[\s\S]{0,80}implementation writer[\s\S]{0,80}Ultra Builder Pro 3\.0 r3 work package/u);
  assert.match(decision, /Codex performs read-only review[\s\S]{0,120}same ZCode task\./u);
  assert.match(decision, /model[\s\S]+accepted frame/iu);
  assert.match(decision, /future[\s\S]+does not inherit/iu);
  assert.doesNotMatch(decision, /Acceptance time: (?!not-recorded)/u);
  // The r3 decision binds the accepted r3 design; the r1 research run
  // remains the bounded historical synthesis it cites, and the superseded
  // r2 decision keeps binding its own historical revision.
  assert.match(decision, /95e06a08ac9f3001bebaf7f5b2247aa8a5f4f0faba1da96ce86ef0dde582e694/u);
  const supersededDecision = read('.ultra/decisions/2026-08-17-ultra-3-0-north-star-r2.md');
  assert.match(supersededDecision, /a91b563a48889909f80fc61f608a8198edec86c073a9b039ee57788b38483c1f/u);

  const run = '.ultra/research/2026-08-15-v027-north-star';
  for (const area of [
    '00-problem-validation.md', '04-product-strategy.md',
    '05-assumptions-validation.md', '22-success-metrics.md',
    '41-quality-risks.md',
  ]) {
    const report = read(`${run}/${area}`);
    for (const label of ['Observed', 'Verified', 'Decided', 'Inference', 'Unknown']) {
      assert.match(report, new RegExp(`^## ${label}$`, 'mu'), `${area}: ${label}`);
    }
    assert.match(report, /^- north_star_effect: (?:supports|refines|contradicts|independent)$/mu, area);
    assert.match(report, /^- north_star_claim: .+$/mu, area);
  }
  const traceFields = {
    '00-problem-validation.md': ['actor', 'current_workaround', 'consequence', 'evidence_status'],
    '04-product-strategy.md': ['tradeoff', 'rationale'],
    '05-assumptions-validation.md': ['category', 'consequence', 'validation_signal', 'success_rule', 'failure_rule', 'ambiguous_rule'],
    '22-success-metrics.md': ['definition', 'source', 'window', 'owner', 'decision_use'],
    '41-quality-risks.md': ['trigger_condition', 'expected_response', 'measurement', 'mitigation', 'recovery', 'owner'],
  };
  for (const [area, fields] of Object.entries(traceFields)) {
    const report = read(`${run}/${area}`);
    for (const field of fields) assert.match(report, new RegExp(`^- ${field}: .+$`, 'mu'), `${area}: ${field}`);
    assert.match(report, /^- specification_anchor: `\.ultra\/specs\/(?:discovery|product|architecture)\.md#[a-z0-9-]+`$/mu, area);
  }
  const synthesis = read(`${run}/99-synthesis.md`);
  for (const area of [
    'brief.md', '00-problem-validation.md', '04-product-strategy.md',
    '05-assumptions-validation.md', '22-success-metrics.md', '41-quality-risks.md',
  ]) {
    assert.match(synthesis, new RegExp(area.replace('.', '\\.')), area);
  }
  assert.match(synthesis, /\.ultra\/specs\/discovery\.md/u);
  assert.match(synthesis, /\.ultra\/specs\/product\.md/u);
  assert.match(synthesis, /\.ultra\/specs\/architecture\.md/u);
  for (const field of ['problem_id', 'scenario_id', 'requirement_ids', 'architecture_path_ids', 'verification_refs']) {
    assert.match(synthesis, new RegExp(`^- ${field}: .+$`, 'mu'), field);
  }
});

test('the accepted North Star decision binds current bytes and an exact historical snapshot', () => {
  const northStarPath = path.join(ROOT, '.ultra', 'north-star.md');
  const bytes = fs.readFileSync(northStarPath);
  const decision = read('.ultra/decisions/2026-08-17-ultra-3-0-north-star-r3.md');
  const snapshotPath = path.join(ROOT, '.ultra', 'research', '2026-08-17-ultra-3-0-r3-projection', 'north-star-v2-r3.accepted.md');
  assert.ok(decision.includes(`North Star content SHA-256: \`${crypto.createHash('sha256').update(bytes).digest('hex')}\``));
  assert.ok(decision.includes(`North Star Git blob digest: \`${gitBlobDigest(bytes)}\``));
  assert.match(decision, /Accepted snapshot: `\.ultra\/research\/2026-08-17-ultra-3-0-r3-projection\/north-star-v2-r3\.accepted\.md`/u);
  assert.deepEqual(fs.readFileSync(snapshotPath), bytes);
  // The superseded r2 snapshot keeps binding its own historical revision bytes.
  const r2Decision = read('.ultra/decisions/2026-08-17-ultra-3-0-north-star-r2.md');
  const r2Snapshot = path.join(ROOT, '.ultra', 'research', '2026-08-17-ultra-3-0-projection', 'north-star-v2-r2.accepted.md');
  const r2Bytes = fs.readFileSync(r2Snapshot);
  assert.ok(r2Decision.includes(`North Star content SHA-256: \`${crypto.createHash('sha256').update(r2Bytes).digest('hex')}\``));
  assert.notDeepEqual(r2Bytes, bytes);
  const validation = validate(northStarPath);
  assert.equal(validation.status, 0, validation.stdout);
  assert.equal(validation.report.acceptance_binding.content_sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
});

test('Research conclusions are promoted as compact resolving v2 relations', () => {
  const discovery = read('.ultra/specs/discovery.md');
  const product = read('.ultra/specs/product.md');
  const architecture = read('.ultra/specs/architecture.md');
  const distillate = read('.ultra/specs/research-distillate.md');
  assert.match(discovery, /^## North Star v2 Problem Relations$/mu);
  assert.match(discovery, /`PROB-V027-01`/u);
  assert.match(product, /^## North Star v2 Outcome Relations$/mu);
  assert.match(product, /`SCN-V027-01`/u);
  assert.match(architecture, /^## North Star v2 Architecture Relations$/mu);
  assert.match(architecture, /`ARCH-V027-01`/u);
  assert.match(product, /`north-star-v2` Markdown/u);
  assert.match(distillate, /\.ultra\/research\/2026-08-15-v027-north-star\/99-synthesis\.md/u);
  assert.match(distillate, /north-star-v2-r1/u);
  for (const id of ['FP-1', 'FP-2', 'FP-3', 'FP-4', 'FP-5', 'FP-6', 'NS-01', 'HC-1', 'HC-2', 'HC-3', 'HC-4', 'HC-5', 'HC-6']) {
    assert.match(distillate, new RegExp(`\\b${id}\\b`, 'u'), id);
  }
  assert.doesNotMatch(distillate, /no full\s+`ultra-research` workflow|no new Research run was claimed/iu);
  assert.match(distillate, /v027-north-star-v2/u);
});

test('the delivered Change trace resolves exact v2 ids and digest without erasing supersession evidence', () => {
  const northStarPath = path.join(ROOT, '.ultra', 'north-star.md');
  const validation = validate(northStarPath);
  assert.equal(validation.status, 0, validation.stdout);
  const digest = spawnSync('git', ['hash-object', northStarPath], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  const intentCandidates = ['active', 'archive']
    .map((state) => `.ultra/changes/${state}/chg-ultra-3-0-mode-b/intent.md`)
    .filter((relative) => fs.existsSync(path.join(ROOT, relative)));
  assert.equal(intentCandidates.length, 1, 'the stable Change id resolves in active or archive');
  const intent = read(intentCandidates[0]);
  assert.match(intent, /- First principles: `FP-1`[\s\S]*`FP-7`/u);
  assert.match(intent, /- Serves: `NS-01`, `NS-02`, `NS-03`, `NS-04`, `NS-05`/u);
  assert.match(intent, /- Touches: `HC-1`[\s\S]*`HC-8`/u);
  const revision = acceptanceValue(read('.ultra/north-star.md'), 'Revision');
  assert.ok(revision);
  assert.ok(intent.includes(`- North Star revision: \`${revision}\``));
  assert.match(intent, new RegExp(`- North Star digest: \`${digest}\``, 'u'));
  assert.doesNotMatch(intent, /#north-star-outcome|to be established as stable/u);
  for (const id of ['FP-1', 'FP-2', 'FP-3', 'FP-4', 'FP-5', 'FP-6', 'FP-7']) {
    assert.ok(validation.report.ids.FP.includes(id));
  }
  for (const id of ['NS-01', 'NS-02', 'NS-03', 'NS-04', 'NS-05']) {
    assert.ok(validation.report.ids.NS.includes(id));
  }
  for (const id of ['HC-1', 'HC-2', 'HC-3', 'HC-4', 'HC-5', 'HC-6', 'HC-7', 'HC-8']) {
    assert.ok(validation.report.ids.HC.includes(id));
  }
  // The superseded v0.27 change keeps its historical trace as abandonment
  // evidence instead of being silently rewritten.
  const abandoned = read('.ultra/changes/abandoned/chg-v027-lifecycle-closure/intent.md');
  assert.match(abandoned, /^## Abandonment$/m);
  assert.match(abandoned, /- North Star revision: `north-star-v2-r1`/u);
  assert.match(abandoned, /ubp3-mode-b-2026-08-17/u);
});

test('the review packet keeps semantic revision and product digest as separate trace facts', () => {
  const packet = read('skills/ultra-review/references/worker-packet.md');
  assert.match(packet, /"first_principles": \["FP-1"\]/u);
  assert.match(packet, /"serves": \["NS-01"\]/u);
  assert.match(packet, /"touches": \["HC-2"\]/u);
  assert.match(packet, /"north_star_revision": "north-star-v2-r1"/u);
  assert.match(packet, /"north_star_digest": "<git-blob-hash>"/u);
  assert.doesNotMatch(packet, /"north_star_revision": "<git-blob-hash>"/u);
});

test('Research owns semantic authorship and every later workflow consumes stable trace ids', () => {
  const init = read('skills/ultra-init/SKILL.md');
  const research = read('skills/ultra-research/SKILL.md');
  const change = read('skills/ultra-change/SKILL.md');
  const contract = read('skills/ultra-change/references/change-contract.md');
  const plan = read('skills/ultra-plan/SKILL.md');
  const status = read('skills/ultra-status/SKILL.md');
  const review = read('skills/ultra-review/SKILL.md');
  const testSkill = read('skills/ultra-test/SKILL.md');
  const deliver = read('skills/ultra-deliver/SKILL.md');

  assert.match(init, /unresearched/iu);
  assert.match(init, /does not populate[\s\S]{0,120}`FP-\*`[\s\S]{0,80}`NS-\*`[\s\S]{0,80}`HC-\*`/iu);
  assert.match(research, /first semantic writer/iu);
  assert.match(research, /references\/north-star-v2\.md/u);
  assert.match(research, /validate_north_star\.cjs/u);
  assert.match(research, /owner\s+accepts[\s\S]+atomic/iu);

  for (const field of ['First principles', 'Serves', 'Touches', 'North Star revision', 'North Star digest']) {
    assert.match(contract, new RegExp(`- ${field}:`, 'u'), field);
  }
  assert.match(change, /accepted revision[\s\S]+active Change[\s\S]+stale observation/iu);
  assert.match(change, /preserv[\s\S]{0,120}evidence/iu);
  assert.match(plan, /task context[\s\S]+`FP-<n>`[\s\S]+`NS-<n>`[\s\S]+`HC-<n>`/iu);
  assert.match(status, /`unresearched`[\s\S]+`ultra-research`/iu);
  assert.match(status, /North Star revision[\s\S]+stale/iu);
  assert.match(review, /`FP-\*`[\s\S]+`NS-\*`[\s\S]+`HC-\*`/iu);
  assert.match(testSkill, /`FP-\*`[\s\S]+`NS-\*`[\s\S]+`HC-\*`/iu);
  assert.match(deliver, /`FP-\*`[\s\S]+`NS-\*`[\s\S]+`HC-\*`/iu);
  const dev = read('skills/ultra-dev/SKILL.md');
  for (const skill of [dev, deliver]) {
    assert.match(skill, /active Change[\s\S]+North Star revision[\s\S]+North Star digest/iu);
    assert.match(skill, /every (?:listed|recorded) `FP-\*`[\s\S]+`NS-\*`[\s\S]+`HC-\*`/iu);
  }
  const devEntry = numberedEntryParagraph(dev, 4);
  const deliverEntry = numberedEntryParagraph(deliver, 3);
  assert.equal(hasStaleTraceStop(devEntry, 'stop before editing'), true, devEntry);
  assert.equal(hasStaleTraceStop(deliverEntry, 'stops finalization'), true, deliverEntry);

  const devRecommendationOnly = devEntry.replace('stop before editing', 'continue editing');
  const deliverRecommendationOnly = deliverEntry.replace('stops finalization', 'allows finalization');
  assert.equal(hasStaleTraceStop(devRecommendationOnly, 'stop before editing'), false);
  assert.equal(hasStaleTraceStop(deliverRecommendationOnly, 'stops finalization'), false);
  assert.match(deliver, /intent digest[\s\S]+fresh `ultra-test`/iu);
});

test('the canonical and current task contexts carry resolving causal North Star trace fields', () => {
  const template = read('.ultra-template/contexts/TEMPLATE.md');
  for (const field of ['First principles', 'Serves', 'Causal contribution', 'Hard constraints']) {
    assert.match(template, new RegExp(`\\*\\*${field}\\*\\*:`, 'u'), field);
  }

  const context = read('.ultra/contexts/task-v027-north-star-v2.md');
  const validation = validate(path.join(ROOT, '.ultra', 'north-star.md'));
  assert.equal(validation.status, 0, validation.stdout);
  const trace = {
    FP: context.match(/^\*\*First principles\*\*: \[(.+)\]$/mu),
    NS: context.match(/^\*\*Serves\*\*: \[(.+)\]$/mu),
    HC: context.match(/^\*\*Hard constraints\*\*: \[(.+)\]$/mu),
  };
  for (const [kind, match] of Object.entries(trace)) {
    assert.ok(match, `${kind}: missing trace field`);
    const ids = [...match[1].matchAll(/`((?:FP|NS|HC)-[^`]+)`/gu)].map((item) => item[1]);
    assert.ok(ids.length > 0, `${kind}: empty trace`);
    for (const id of ids) assert.ok(validation.report.ids[kind].includes(id), `${kind}: ${id}`);
  }
  assert.match(context, /^\*\*Causal contribution\*\*: .+$/mu);
});

test('direct path validation rejects a North Star above the bounded snapshot ceiling', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-path-oversize-'));
  const file = path.join(directory, 'candidate.md');
  try {
    fs.writeFileSync(file, Buffer.alloc((8 * 1024 * 1024) + 1, 0x78));

    const result = validate(file);

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.report.diagnostics[0].code, 'input_too_large');
    assert.equal(result.report.input.path, path.resolve(file));
    assert.equal(result.report.input.byte_length, (8 * 1024 * 1024) + 1);
    assert.equal(result.report.input.sha256, null);
    assert.ok(Buffer.byteLength(result.stdout, 'utf8') < 1024 * 1024);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('direct path validation reports a bounded typed read error for a missing file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-path-missing-'));
  const file = path.join(directory, 'missing.md');
  try {
    const result = validate(file);

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stderr, '');
    assert.ok(Buffer.byteLength(result.stdout, 'utf8') < 1024 * 1024);
    assert.equal(result.report.valid, false);
    assert.equal(result.report.diagnostics[0].code, 'read_error');
    assert.equal(result.report.diagnostics[0].severity, 'error');
    assert.deepEqual(result.report.input, {
      path: path.resolve(file),
      byte_length: null,
      sha256: null,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('direct path validation rejects symlinks and special files without blocking', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-path-type-'));
  const target = path.join(directory, 'candidate.md');
  const symlink = path.join(directory, 'candidate-link.md');
  const fifo = path.join(directory, 'candidate.fifo');
  try {
    fs.writeFileSync(target, acceptedFixture({ status: 'draft', ownerSource: 'none' }));
    fs.symlinkSync(target, symlink);
    const fifoCreation = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
    assert.equal(fifoCreation.status, 0, fifoCreation.stderr);

    const symlinkResult = validate(symlink);
    assert.equal(symlinkResult.status, 1, symlinkResult.stderr || symlinkResult.stdout);
    assert.equal(symlinkResult.report.diagnostics[0].code, 'input_symlink');

    const fifoResult = spawnSync(process.execPath, [VALIDATOR, fifo], {
      encoding: 'utf8',
      timeout: 1000,
    });
    assert.equal(fifoResult.status, 1, fifoResult.error?.message || fifoResult.stderr);
    assert.equal(JSON.parse(fifoResult.stdout).diagnostics[0].code, 'input_not_regular');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('direct path validation returns a retryable observation when the path is ordinarily replaced after open', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-north-star-path-replaced-'));
  const file = path.join(directory, 'candidate.md');
  const original = `${file}.original`;
  const shim = path.join(directory, 'replace-after-open.cjs');
  try {
    fs.writeFileSync(file, acceptedFixture({ status: 'draft', ownerSource: 'none' }));
    fs.writeFileSync(shim, [
      "'use strict';",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'const originalOpen = fs.openSync.bind(fs);',
      'let changed = false;',
      'fs.openSync = function replaceAfterOpen(candidate, flags, ...args) {',
      '  const descriptor = originalOpen(candidate, flags, ...args);',
      '  if (!changed && path.resolve(candidate) === path.resolve(process.env.UBP_TEST_NORTH_STAR)) {',
      '    changed = true;',
      '    fs.renameSync(candidate, process.env.UBP_TEST_ORIGINAL);',
      "    fs.writeFileSync(candidate, '# Ordinary replacement\\n');",
      '  }',
      '  return descriptor;',
      '};',
      '',
    ].join('\n'));

    const result = spawnSync(process.execPath, ['--require', shim, VALIDATOR, file], {
      encoding: 'utf8',
      env: {
        ...process.env,
        UBP_TEST_NORTH_STAR: file,
        UBP_TEST_ORIGINAL: original,
      },
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.diagnostics[0].code, 'input_changed');
    assert.equal(report.diagnostics[0].severity, 'error');
    assert.equal(report.input.path, path.resolve(file));
    assert.equal(report.input.sha256, null);
    assert.equal(fs.readFileSync(file, 'utf8'), '# Ordinary replacement\n');
    assert.match(fs.readFileSync(original, 'utf8'), /^# Project North Star/u);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Research documents direct path validation as the bounded stable workflow entry', () => {
  const research = read('skills/ultra-research/SKILL.md');
  const contract = read('skills/ultra-research/references/north-star-v2.md');

  assert.match(research, /validate_north_star\.cjs[\s\S]{0,160}bounded regular non-symlink snapshot/iu);
  assert.match(contract, /Path mode applies the same 8 MiB ceiling itself/u);
  assert.match(contract, /`O_NONBLOCK` and `O_NOFOLLOW`/u);
  for (const code of [
    'input_too_large',
    'input_symlink',
    'input_not_regular',
    'read_error',
    'input_changed',
  ]) {
    assert.match(contract, new RegExp(`\\b${code}\\b`, 'u'), code);
  }
});
