'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(
  ROOT,
  'skills',
  'ultra-test',
  'scripts',
  'validate_review_transport.cjs',
);
const { validateTransport } = require(SCRIPT);
const MAX_REVIEW_JSON_BYTES = 8 * 1024 * 1024;

function tracedFinding() {
  return {
    id: 'review-code-001',
    axis: 'engineering_standards',
    severity: 'P1',
    category: 'correctness',
    title: 'Exact finding transport fixture',
    file: 'src/example.js',
    line: 7,
    line_end: 9,
    trigger: 'The reviewed input reaches the changed seam.',
    impact: 'The accepted result is not preserved.',
    evidence: 'The specialist artifact records the mismatch.',
    suggestion: 'Repair the seam and retain this finding unchanged.',
    north_star_trace: {
      first_principles: ['FP-1'],
      serves: ['NS-01'],
      touches: ['HC-4'],
    },
  };
}

function gitBlobDigest(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

function canonicalJsonDigest(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalJson(value)), 'utf8'));
}

function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-transport-'));
  const summaryRef = '.ultra/reviews/transport-session/SUMMARY.json';
  const summaryFile = path.join(directory, summaryRef);
  const sessionDirectory = path.dirname(summaryFile);
  const reportFile = path.join(directory, '.ultra', 'test-report.json');
  const contextRef = '.ultra/contexts/task-task-a.md';
  const contextFile = path.join(directory, contextRef);
  const contextBytes = Buffer.from('# Task A\n', 'utf8');
  fs.mkdirSync(path.dirname(contextFile), { recursive: true });
  fs.writeFileSync(contextFile, contextBytes);
  const northStarBytes = Buffer.from([
    '# Project North Star',
    '',
    '## Acceptance and Revision',
    '',
    '- Status: `accepted`',
    '- Revision: `north-star-v2-r1`',
    '',
    '## First-Principle Propositions',
    '',
    '### FP-1 — Durable authority',
    '',
    '## North Star Outcomes',
    '',
    '### NS-01 — Exact finding transport',
    '',
    '## Hard Constraints',
    '',
    '### HC-4 — Derived evidence stays derived',
    '',
  ].join('\n'), 'utf8');
  const northStarFile = path.join(directory, '.ultra', 'north-star.md');
  fs.writeFileSync(northStarFile, northStarBytes);
  const northStarDigest = gitBlobDigest(northStarBytes);
  const decisionRef = '.ultra/decisions/transport-north-star-acceptance.md';
  const decisionBytes = Buffer.from([
    '# Transport North Star Acceptance',
    '',
    '## Owner Record',
    '',
    '- Decision: accepted',
    '',
  ].join('\n'), 'utf8');
  const decisionFile = path.join(directory, decisionRef);
  fs.mkdirSync(path.dirname(decisionFile), { recursive: true });
  fs.writeFileSync(decisionFile, decisionBytes);
  const snapshotRef = '.ultra/research/transport-session/north-star-v2-r1.accepted.md';
  const snapshotBytes = Buffer.from(northStarBytes);
  const snapshotFile = path.join(directory, snapshotRef);
  fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
  fs.writeFileSync(snapshotFile, snapshotBytes);
  const intentRef = '.ultra/changes/active/change-a/intent.md';
  const intentFile = path.join(directory, intentRef);
  const acceptanceLine = '- [x] Exact review transport remains byte-bound.';
  fs.mkdirSync(path.dirname(intentFile), { recursive: true });
  fs.writeFileSync(intentFile, [
    '# Change change-a',
    '',
    '## North Star Trace',
    '',
    '- First principles: `FP-1`',
    '- Serves: `NS-01`',
    '- Touches: `HC-4`',
    '- North Star revision: `north-star-v2-r1`',
    `- North Star digest: \`${northStarDigest}\``,
    '',
    '## Acceptance',
    '',
    acceptanceLine,
    '',
  ].join('\n'), 'utf8');
  const head = 'c'.repeat(40);
  const range = 'frozen Phase 1 transport fixture';
  const workers = [
    {
      agent: 'review-spec',
      axis: 'spec_fidelity',
      lens: 'skills/ultra-review/references/spec.md',
      output: '.ultra/reviews/transport-session/review-spec.json',
    },
    {
      agent: 'review-code',
      axis: 'engineering_standards',
      lens: 'skills/ultra-review/references/code.md',
      output: '.ultra/reviews/transport-session/review-code.json',
    },
  ];
  const packet = {
    $schema: 'ultra-review-worker-packet-v1',
    session: 'transport-session',
    mode: 'task',
    created_at: '2026-08-15T00:00:00Z',
    head,
    range,
    change_id: 'change-a',
    task_ids: ['task-a'],
    acceptance: [`${intentRef}#acceptance: ${acceptanceLine}`],
    public_seams: ['Review summary into Test report'],
    north_star_trace: {
      path: '.ultra/changes/active/change-a/intent.md#north-star-trace',
      first_principles: ['FP-1'],
      serves: ['NS-01'],
      touches: ['HC-4'],
      north_star_revision: 'north-star-v2-r1',
      north_star_digest: northStarDigest,
    },
    context_files: [{
      path: contextRef,
      sha256: crypto.createHash('sha256').update(contextBytes).digest('hex'),
    }],
    workers,
    diff_files: ['src/example.js'],
    output_directory: '.ultra/reviews/transport-session',
  };
  if (options.admissionContract !== false) {
    packet.admission_contract = 'ultra-review-admission-required-v2';
    packet.subject_observations = [
      {
        role: 'change',
        path: intentRef,
        sha256: sha256(fs.readFileSync(intentFile)),
        byte_length: fs.statSync(intentFile).size,
      },
      {
        role: 'acceptance_source',
        path: intentRef,
        sha256: sha256(fs.readFileSync(intentFile)),
        byte_length: fs.statSync(intentFile).size,
      },
      { role: 'decision', path: decisionRef, sha256: sha256(decisionBytes), byte_length: decisionBytes.length },
      { role: 'snapshot', path: snapshotRef, sha256: sha256(snapshotBytes), byte_length: snapshotBytes.length },
    ];
  }
  const packetBytes = Buffer.from(`${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  const packetDigest = sha256(packetBytes);
  let receiptBinding;
  const artifact = (worker, findings, coverageRefs) => ({
    $schema: 'ultra-review-findings-v4',
    agent: worker.agent,
    axis: worker.axis,
    packet_digest: packetDigest,
    ...receiptBinding,
    session: packet.session,
    timestamp: '2026-08-15T00:00:01Z',
    scope: {
      head,
      range,
      files_analyzed: ['src/example.js'],
      diff_only: true,
    },
    status: 'complete',
    findings,
    coverage_refs: coverageRefs,
    positive_observations: [],
    limitations: [],
  });
  fs.mkdirSync(sessionDirectory, { recursive: true });
  fs.writeFileSync(path.join(sessionDirectory, 'WORKER-PACKET.json'), packetBytes);
  const observations = [
    { role: 'context', path: contextRef, sha256: sha256(contextBytes), byte_length: contextBytes.length },
    { role: 'north_star', path: '.ultra/north-star.md', sha256: sha256(northStarBytes), byte_length: northStarBytes.length },
    ...(packet.subject_observations || []).slice(0, -2),
  ];
  const admissionSubject = {
    version: 2,
    session: packet.session,
    packet_digest: packetDigest,
    head: packet.head,
    observations,
    north_star_report: {
      schema: 'ultra-north-star-validation-v1',
      sha256: sha256(Buffer.from('transport fixture validator report', 'utf8')),
      input_sha256: sha256(northStarBytes),
      input_byte_length: northStarBytes.length,
      source_observations: (packet.subject_observations || []).slice(-2),
    },
  };
  const admission = {
    $schema: 'ultra-review-admission-v2',
    ...admissionSubject,
    subject_digest: canonicalJsonDigest(admissionSubject),
  };
  const admissionBytes = Buffer.from(`${JSON.stringify(admission, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(sessionDirectory, 'ADMISSION.json'), admissionBytes);
  receiptBinding = {
    admission_digest: sha256(admissionBytes),
    subject_digest: admission.subject_digest,
  };
  const specArtifact = artifact(workers[0], [], ['src/example.js']);
  const codeArtifact = artifact(workers[1], [tracedFinding()], ['src/example.js']);
  fs.writeFileSync(
    path.join(sessionDirectory, 'review-spec.json'),
    `${JSON.stringify(specArtifact, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(sessionDirectory, 'review-code.json'),
    `${JSON.stringify(codeArtifact, null, 2)}\n`,
  );
  const summary = {
    $schema: 'ultra-review-summary-v4',
    mode: 'task',
    execution_mode: 'isolated',
    session: 'transport-session',
    change_id: packet.change_id,
    task_ids: packet.task_ids,
    head,
    worktree_digest: null,
    context_digest: packet.context_files[0].sha256,
    packet_digest: packetDigest,
    ...receiptBinding,
    status: 'complete',
    verdict: 'REQUEST_CHANGES',
    axes: {
      spec_fidelity: { verdict: 'PASS', evidence_refs: ['review-spec.json'] },
      engineering_standards: { verdict: 'FAIL', evidence_refs: ['review-code.json'] },
    },
    workers: {
      completed: ['review-spec', 'review-code'],
      failed: [],
      skipped: ['review-tests', 'review-errors', 'review-design', 'review-comments'],
    },
    worker_selection: [
      { worker: 'review-spec', status: 'selected', rationale: 'Required specification axis.' },
      { worker: 'review-code', status: 'selected', rationale: 'Executable transport seam.' },
      { worker: 'review-tests', status: 'skipped', rationale: 'Fixture keeps one engineering lens.' },
      { worker: 'review-errors', status: 'skipped', rationale: 'Fixture keeps one engineering lens.' },
      { worker: 'review-design', status: 'skipped', rationale: 'Fixture keeps one engineering lens.' },
      { worker: 'review-comments', status: 'skipped', rationale: 'Fixture keeps one engineering lens.' },
    ],
    findings: [tracedFinding()],
    coverage_refs: ['review-spec.json', 'review-code.json'],
    positive_observations: [],
    limitations: ['Provider drill belongs to the later host phase.'],
  };
  const summaryBytes = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.mkdirSync(path.dirname(summaryFile), { recursive: true });
  fs.writeFileSync(summaryFile, summaryBytes);
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, '.ultra-template', 'test-report.json'), 'utf8'));
  Object.assign(report, {
    change_id: summary.change_id,
    task_ids: summary.task_ids,
    git_commit: summary.head,
  });
  Object.assign(report.review, {
    session: summary.session,
    packet_digest: summary.packet_digest,
    admission_digest: summary.admission_digest,
    subject_digest: summary.subject_digest,
    execution_mode: summary.execution_mode,
    finding_schema: 'ultra-review-findings-v4',
    summary_ref: summaryRef,
    summary_digest: crypto.createHash('sha256').update(summaryBytes).digest('hex'),
    verdict: summary.verdict,
    context_digest: summary.context_digest,
    worktree_digest: summary.worktree_digest,
    coverage_refs: summary.coverage_refs,
    limitations: summary.limitations,
  });
  report.findings = structuredClone(summary.findings);
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return {
    directory,
    sessionDirectory,
    summaryFile,
    reportFile,
    packet,
    packetDigest,
    summary,
    report,
  };
}

function persist(value) {
  const summaryBytes = Buffer.from(`${JSON.stringify(value.summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(value.summaryFile, summaryBytes);
  value.report.review.summary_digest = crypto.createHash('sha256').update(summaryBytes).digest('hex');
  fs.writeFileSync(value.reportFile, `${JSON.stringify(value.report, null, 2)}\n`);
}

function run(summaryFile, reportFile, options = {}) {
  const argv = [
    SCRIPT,
    '--summary', summaryFile,
    '--report', reportFile,
  ];
  if (options.legacyV4) argv.push('--legacy-v4');
  return spawnSync(process.execPath, argv, {
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
  });
}

function diagnosticCodes(result) {
  return JSON.parse(result.stdout).diagnostics.map((item) => item.code);
}

function validateWhileReplacing(target, summaryFile, reportFile) {
  const originalOpen = fs.openSync;
  const originalRead = fs.readSync;
  const originalReadFile = fs.readFileSync;
  const descriptorPaths = new Map();
  const targetReal = fs.realpathSync(target);
  let replaced = false;

  const replaceTarget = () => {
    if (replaced) return;
    replaced = true;
    const bytes = originalReadFile(target);
    const prior = `${target}.prior`;
    fs.renameSync(target, prior);
    fs.writeFileSync(target, bytes);
  };

  fs.openSync = function trackedOpen(file, ...args) {
    const descriptor = originalOpen.call(fs, file, ...args);
    descriptorPaths.set(descriptor, fs.realpathSync(String(file)));
    return descriptor;
  };
  fs.readSync = function mutatingRead(descriptor, ...args) {
    const count = originalRead.call(fs, descriptor, ...args);
    if (count > 0 && descriptorPaths.get(descriptor) === targetReal) {
      replaceTarget();
    }
    return count;
  };
  fs.readFileSync = function mutatingReadFile(file, ...args) {
    const bytes = originalReadFile.call(fs, file, ...args);
    const observed = typeof file === 'number'
      ? descriptorPaths.get(file)
      : fs.realpathSync(String(file));
    if (observed === targetReal) replaceTarget();
    return bytes;
  };

  try {
    return validateTransport(summaryFile, reportFile);
  } finally {
    fs.openSync = originalOpen;
    fs.readSync = originalRead;
    fs.readFileSync = originalReadFile;
  }
}

function validateWhileReplacingAncestorWithSameFile(
  target,
  ancestor,
  summaryFile,
  reportFile,
) {
  const originalOpen = fs.openSync;
  const originalRead = fs.readSync;
  const descriptorPaths = new Map();
  const targetReal = fs.realpathSync(target);
  const replacement = `${ancestor}.replacement`;
  const prior = `${ancestor}.prior`;
  const relativeTarget = path.relative(ancestor, target);
  const replacementTarget = path.join(replacement, relativeTarget);
  let replaced = false;

  fs.mkdirSync(path.dirname(replacementTarget), { recursive: true });
  fs.linkSync(target, replacementTarget);

  fs.openSync = function trackedOpen(file, ...args) {
    const descriptor = originalOpen.call(fs, file, ...args);
    descriptorPaths.set(descriptor, fs.realpathSync(String(file)));
    return descriptor;
  };
  fs.readSync = function replacingRead(descriptor, ...args) {
    const count = originalRead.call(fs, descriptor, ...args);
    if (!replaced && count > 0 && descriptorPaths.get(descriptor) === targetReal) {
      replaced = true;
      fs.renameSync(ancestor, prior);
      fs.renameSync(replacement, ancestor);
    }
    return count;
  };

  try {
    return validateTransport(summaryFile, reportFile);
  } finally {
    fs.openSync = originalOpen;
    fs.readSync = originalRead;
    if (replaced) {
      fs.renameSync(ancestor, replacement);
      fs.renameSync(prior, ancestor);
    }
    fs.rmSync(replacement, { recursive: true, force: true });
  }
}

function validateWithOpenSubstitution(target, replacement, summaryFile, reportFile) {
  const originalOpen = fs.openSync;
  const targetReal = fs.realpathSync(target);
  let observedFlags = null;
  fs.openSync = function substitutedOpen(file, flags, ...args) {
    if (fs.realpathSync(String(file)) === targetReal) {
      observedFlags = flags;
      return originalOpen.call(fs, replacement, flags, ...args);
    }
    return originalOpen.call(fs, file, flags, ...args);
  };
  try {
    return {
      result: validateTransport(summaryFile, reportFile),
      flags: observedFlags,
    };
  } finally {
    fs.openSync = originalOpen;
  }
}

function pythonSummaryMutationShim(value, alternateBytes) {
  const realPython = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' })
    .stdout.trim();
  assert.ok(realPython, 'python3 is required by the review waiter fixture');
  const shimDirectory = path.join(value.directory, 'shim');
  const shim = path.join(shimDirectory, 'python3');
  fs.mkdirSync(shimDirectory);
  fs.writeFileSync(
    shim,
    `#!${realPython}\n`
      + 'import os, pathlib, sys\n'
      + `pathlib.Path(sys.argv[2], "SUMMARY.json").write_bytes(${JSON.stringify(alternateBytes.toString('base64'))}.encode("ascii"))\n`
      + 'import base64\n'
      + 'summary = pathlib.Path(sys.argv[2], "SUMMARY.json")\n'
      + 'summary.write_bytes(base64.b64decode(summary.read_bytes()))\n'
      + `os.execv(${JSON.stringify(realPython)}, [${JSON.stringify(realPython)}, *sys.argv[1:]])\n`,
    { mode: 0o755 },
  );
  return shimDirectory;
}

function pythonDelayShim(value, delaySeconds) {
  const realPython = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' })
    .stdout.trim();
  assert.ok(realPython, 'python3 is required by the review waiter fixture');
  const shimDirectory = path.join(value.directory, 'delay-shim');
  const shim = path.join(shimDirectory, 'python3');
  fs.mkdirSync(shimDirectory);
  fs.writeFileSync(
    shim,
    `#!${realPython}\n`
      + 'import os, time, sys\n'
      + `time.sleep(${JSON.stringify(delaySeconds)})\n`
      + `os.execv(${JSON.stringify(realPython)}, [${JSON.stringify(realPython)}, *sys.argv[1:]])\n`,
    { mode: 0o755 },
  );
  return shimDirectory;
}

test('Review-to-Test transport accepts the exact v4 finding objects and summary identity', () => {
  const value = fixture();
  try {
    assert.equal(value.report.$schema, 'ultra-test-report-v2');
    assert.ok(Array.isArray(value.report.task_evidence));
    const result = run(value.summaryFile, value.reportFile);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.valid, true);
    assert.equal(output.finding_count, 1);
  } finally {
    fs.rmSync(value.directory, { recursive: true, force: true });
  }
});

test('Review-to-Test keeps canonical waiter startup bounded without a load-sensitive deadline', () => {
  const value = fixture();
  try {
    const shimDirectory = pythonDelayShim(value, 2.25);
    const result = run(value.summaryFile, value.reportFile, {
      env: { PATH: `${shimDirectory}${path.delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stdout || result.stderr);
    assert.equal(JSON.parse(result.stdout).valid, true);
  } finally {
    fs.rmSync(value.directory, { recursive: true, force: true });
  }
});

test('Review-to-Test transport preserves v1 reports and accepts only structural v2 task evidence', () => {
  const historical = fixture();
  const missingV2Evidence = fixture();
  const unknown = fixture();
  try {
    historical.report.$schema = 'ultra-test-report-v1';
    delete historical.report.task_evidence;
    persist(historical);
    const v1Result = run(historical.summaryFile, historical.reportFile);
    assert.equal(v1Result.status, 0, v1Result.stderr || v1Result.stdout);

    delete missingV2Evidence.report.task_evidence;
    persist(missingV2Evidence);
    const missingResult = run(missingV2Evidence.summaryFile, missingV2Evidence.reportFile);
    assert.equal(missingResult.status, 1, missingResult.stderr || missingResult.stdout);
    assert.ok(diagnosticCodes(missingResult).includes('report_task_evidence'));

    unknown.report.$schema = 'ultra-test-report-v99';
    persist(unknown);
    const unknownResult = run(unknown.summaryFile, unknown.reportFile);
    assert.equal(unknownResult.status, 1, unknownResult.stderr || unknownResult.stdout);
    assert.ok(diagnosticCodes(unknownResult).includes('report_schema'));
  } finally {
    fs.rmSync(historical.directory, { recursive: true, force: true });
    fs.rmSync(missingV2Evidence.directory, { recursive: true, force: true });
    fs.rmSync(unknown.directory, { recursive: true, force: true });
  }
});

test('Review-to-Test requires admission by default and reads historical v4 only explicitly', () => {
  const value = fixture();
  const historicalValue = fixture({ admissionContract: false });
  try {
    fs.unlinkSync(path.join(value.sessionDirectory, 'ADMISSION.json'));
    fs.unlinkSync(path.join(historicalValue.sessionDirectory, 'ADMISSION.json'));

    const strict = run(value.summaryFile, value.reportFile);
    assert.equal(strict.status, 1, strict.stderr || strict.stdout);
    assert.ok(
      diagnosticCodes(strict).includes('summary_waiter_validation'),
      strict.stdout,
    );
    assert.match(strict.stdout, /ADMISSION|admission|receipt|packet mode/i);

    const currentLegacy = run(value.summaryFile, value.reportFile, { legacyV4: true });
    assert.equal(currentLegacy.status, 1, currentLegacy.stderr || currentLegacy.stdout);
    assert.match(currentLegacy.stdout, /admission_contract|current strict|legacy-v4/i);

    const historical = run(
      historicalValue.summaryFile,
      historicalValue.reportFile,
      { legacyV4: true },
    );
    assert.equal(historical.status, 0, historical.stderr || historical.stdout);
    assert.equal(JSON.parse(historical.stdout).valid, true);
  } finally {
    fs.rmSync(value.directory, { recursive: true, force: true });
    fs.rmSync(historicalValue.directory, { recursive: true, force: true });
  }
});

test('Review-to-Test consumes a frozen review after the current task context advances', () => {
  const value = fixture();
  try {
    fs.appendFileSync(
      path.join(value.directory, value.packet.context_files[0].path),
      '\n## Completion\n\n- Status: complete\n',
    );
    const result = run(value.summaryFile, value.reportFile);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).valid, true);
  } finally {
    fs.rmSync(value.directory, { recursive: true, force: true });
  }
});

test('Review-to-Test transport rejects omitted, mutated, and injected finding objects', () => {
  const mutations = [
    ['omitted', (report) => { report.findings = []; }],
    ['mutated', (report) => { report.findings[0].north_star_trace.touches = ['HC-2']; }],
    ['injected', (report) => {
      report.findings.push({ ...tracedFinding(), id: 'test-only-001' });
    }],
  ];
  for (const [label, mutate] of mutations) {
    const value = fixture();
    try {
      mutate(value.report);
      fs.writeFileSync(value.reportFile, `${JSON.stringify(value.report, null, 2)}\n`);
      const result = run(value.summaryFile, value.reportFile);
      assert.equal(result.status, 1, `${label}: ${result.stdout}`);
      assert.match(result.stdout + result.stderr, /finding|transport|unchanged/i, label);
    } finally {
      fs.rmSync(value.directory, { recursive: true, force: true });
    }
  }
});

test('Review-to-Test transport rejects summary byte drift and rewritten review metadata', () => {
  const mutations = [
    ['summary digest', (value) => { value.report.review.summary_digest = 'b'.repeat(64); }],
    ['session', (value) => { value.report.review.session = 'other-session'; }],
    ['packet digest', (value) => { value.report.review.packet_digest = 'b'.repeat(64); }],
    ['admission digest', (value) => { value.report.review.admission_digest = 'd'.repeat(64); }],
    ['subject digest', (value) => { value.report.review.subject_digest = 'e'.repeat(64); }],
    ['summary ref', (value) => { value.report.review.summary_ref = path.join(value.directory, 'other.json'); }],
  ];
  for (const [label, mutate] of mutations) {
    const value = fixture();
    try {
      mutate(value);
      fs.writeFileSync(value.reportFile, `${JSON.stringify(value.report, null, 2)}\n`);
      const result = run(value.summaryFile, value.reportFile);
      assert.equal(result.status, 1, `${label}: ${result.stdout}`);
      assert.match(result.stdout + result.stderr, /summary|session|packet|digest|metadata/i, label);
    } finally {
      fs.rmSync(value.directory, { recursive: true, force: true });
    }
  }
});

test('canonical Test report template exposes retained admission receipt bindings', () => {
  const template = JSON.parse(fs.readFileSync(
    path.join(ROOT, '.ultra-template', 'test-report.json'),
    'utf8',
  ));
  assert.equal(template.review.admission_digest, null);
  assert.equal(template.review.subject_digest, null);
});

test('Review-to-Test transport rejects cross-Change, task, HEAD, context, and worktree subjects', () => {
  const mutations = [
    ['change', (value) => { value.report.change_id = 'change-b'; }],
    ['tasks', (value) => { value.report.task_ids = ['task-b']; }],
    ['HEAD', (value) => { value.report.git_commit = 'e'.repeat(40); }],
    ['context', (value) => { value.report.review.context_digest = 'e'.repeat(64); }],
    ['worktree', (value) => { value.report.review.worktree_digest = 'e'.repeat(64); }],
  ];
  for (const [label, mutate] of mutations) {
    const value = fixture();
    try {
      mutate(value);
      persist(value);
      const result = run(value.summaryFile, value.reportFile);
      assert.equal(result.status, 1, `${label}: ${result.stdout}`);
      assert.match(result.stdout + result.stderr, /change|task|head|context|worktree|subject/i, label);
    } finally {
      fs.rmSync(value.directory, { recursive: true, force: true });
    }
  }
});

test('Review-to-Test transport rejects a SUMMARY that the canonical waiter cannot validate', () => {
  const value = fixture();
  try {
    value.summary.axes.engineering_standards.verdict = 'PASS';
    value.report.review.verdict = value.summary.verdict;
    persist(value);
    const result = run(value.summaryFile, value.reportFile);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout + result.stderr, /summary|waiter|verdict|evidence/i);
  } finally {
    fs.rmSync(value.directory, { recursive: true, force: true });
  }
});

test('Review-to-Test transport rejects an otherwise valid SUMMARY from another repository', () => {
  const reportProject = fixture();
  const externalProject = fixture();
  try {
    Object.assign(reportProject.report, {
      change_id: externalProject.summary.change_id,
      task_ids: externalProject.summary.task_ids,
      git_commit: externalProject.summary.head,
      findings: structuredClone(externalProject.summary.findings),
    });
    Object.assign(reportProject.report.review, {
      session: externalProject.summary.session,
      packet_digest: externalProject.summary.packet_digest,
      execution_mode: externalProject.summary.execution_mode,
      summary_digest: crypto.createHash('sha256')
        .update(fs.readFileSync(externalProject.summaryFile))
        .digest('hex'),
      verdict: externalProject.summary.verdict,
      context_digest: externalProject.summary.context_digest,
      worktree_digest: externalProject.summary.worktree_digest,
      coverage_refs: externalProject.summary.coverage_refs,
      limitations: externalProject.summary.limitations,
    });
    const references = [
      ['absolute', externalProject.summaryFile],
      [
        'parent traversal',
        path.relative(reportProject.directory, externalProject.summaryFile)
          .split(path.sep)
          .join('/'),
      ],
    ];
    for (const [label, summaryRef] of references) {
      reportProject.report.review.summary_ref = summaryRef;
      fs.writeFileSync(
        reportProject.reportFile,
        `${JSON.stringify(reportProject.report, null, 2)}\n`,
      );
      const result = run(externalProject.summaryFile, reportProject.reportFile);
      assert.equal(result.status, 1, `${label}: ${result.stdout}`);
      assert.match(
        result.stdout + result.stderr,
        /repository|relative|contained|summary_ref/i,
        label,
      );
    }
  } finally {
    fs.rmSync(reportProject.directory, { recursive: true, force: true });
    fs.rmSync(externalProject.directory, { recursive: true, force: true });
  }
});

test('Review-to-Test transport rejects a symlink SUMMARY instead of following it', () => {
  const value = fixture();
  const target = path.join(value.directory, 'summary-target.json');
  try {
    fs.renameSync(value.summaryFile, target);
    fs.symlinkSync(target, value.summaryFile);
    const result = run(value.summaryFile, value.reportFile);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout + result.stderr, /regular|symlink|summary/i);
  } finally {
    fs.rmSync(value.directory, { recursive: true, force: true });
  }
});

test('Review-to-Test rejects an external report behind the canonical report path', () => {
  const value = fixture();
  const outsideDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-external-report-'));
  const outsideReport = path.join(outsideDirectory, 'test-report.json');
  try {
    fs.copyFileSync(value.reportFile, outsideReport);
    fs.unlinkSync(value.reportFile);
    fs.symlinkSync(outsideReport, value.reportFile);

    const result = run(value.summaryFile, value.reportFile);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(
      diagnosticCodes(result).includes('report_snapshot_symlink_component'),
      result.stdout,
    );
  } finally {
    fs.rmSync(value.directory, { recursive: true, force: true });
    fs.rmSync(outsideDirectory, { recursive: true, force: true });
  }
});

test('Review-to-Test rejects a symlink in the canonical SUMMARY path components', () => {
  const value = fixture();
  const reviews = path.join(value.directory, '.ultra', 'reviews');
  const reviewStore = path.join(value.directory, '.ultra', 'review-store');
  try {
    fs.renameSync(reviews, reviewStore);
    fs.symlinkSync('review-store', reviews);

    const result = run(value.summaryFile, value.reportFile);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(
      diagnosticCodes(result).includes('summary_snapshot_symlink_component'),
      result.stdout,
    );
  } finally {
    fs.rmSync(value.directory, { recursive: true, force: true });
  }
});

test('Review-to-Test bounds both canonical JSON snapshots before parsing or hashing', async (t) => {
  for (const [label, field, code] of [
    ['report', 'reportFile', 'report_snapshot_oversize'],
    ['summary', 'summaryFile', 'summary_snapshot_oversize'],
  ]) {
    await t.test(label, () => {
      const value = fixture();
      try {
        fs.writeFileSync(value[field], Buffer.alloc(MAX_REVIEW_JSON_BYTES + 1, 0x20));
        const result = run(value.summaryFile, value.reportFile);
        assert.equal(result.status, 1, result.stdout);
        assert.ok(diagnosticCodes(result).includes(code), result.stdout);

        const originalCreateHash = crypto.createHash;
        crypto.createHash = () => {
          throw new Error(`${label} oversize input reached hashing`);
        };
        try {
          const direct = validateTransport(value.summaryFile, value.reportFile);
          assert.equal(direct.valid, false, JSON.stringify(direct));
          assert.ok(
            direct.diagnostics.some((item) => item.code === code),
            JSON.stringify(direct),
          );
        } finally {
          crypto.createHash = originalCreateHash;
        }
      } finally {
        fs.rmSync(value.directory, { recursive: true, force: true });
      }
    });
  }
});

test('Review-to-Test rejects report or SUMMARY replacement during its raw snapshot', async (t) => {
  for (const [label, field, code] of [
    ['report', 'reportFile', 'report_snapshot_changed'],
    ['summary', 'summaryFile', 'summary_snapshot_changed'],
  ]) {
    await t.test(label, () => {
      const value = fixture();
      try {
        const result = validateWhileReplacing(
          value[field],
          value.summaryFile,
          value.reportFile,
        );
        assert.equal(result.valid, false, JSON.stringify(result));
        assert.ok(
          result.diagnostics.some((item) => item.code === code),
          JSON.stringify(result),
        );
      } finally {
        fs.rmSync(value.directory, { recursive: true, force: true });
      }
    });
  }
});

test('Review-to-Test fresh-rewalks the repository root and every managed directory identity', async (t) => {
  const cases = [
    ['report repository root', 'reportFile', (value) => value.directory, 'report_snapshot_changed'],
    ['report ancestor', 'reportFile', (value) => path.dirname(value.reportFile), 'report_snapshot_changed'],
    ['SUMMARY ancestor', 'summaryFile', (value) => path.dirname(value.summaryFile), 'summary_snapshot_changed'],
  ];
  for (const [label, field, ancestor, code] of cases) {
    await t.test(label, () => {
      const value = fixture();
      try {
        const result = validateWhileReplacingAncestorWithSameFile(
          value[field],
          ancestor(value),
          value.summaryFile,
          value.reportFile,
        );
        assert.equal(result.valid, false, JSON.stringify(result));
        assert.ok(
          result.diagnostics.some((item) => item.code === code),
          JSON.stringify(result),
        );
      } finally {
        fs.rmSync(value.directory, { recursive: true, force: true });
      }
    });
  }
});

test('Review-to-Test opens inputs nonblocking and rejects an unexpected descriptor immediately', async (t) => {
  for (const [label, field, code] of [
    ['report', 'reportFile', 'report_snapshot_changed'],
    ['summary', 'summaryFile', 'summary_snapshot_changed'],
  ]) {
    await t.test(label, () => {
      const value = fixture();
      const replacement = path.join(value.directory, `${label}-replacement.json`);
      try {
        fs.writeFileSync(replacement, '{}\n');
        const observed = validateWithOpenSubstitution(
          value[field],
          replacement,
          value.summaryFile,
          value.reportFile,
        );
        assert.equal(observed.result.valid, false, JSON.stringify(observed.result));
        assert.equal(
          observed.flags & fs.constants.O_NONBLOCK,
          fs.constants.O_NONBLOCK,
        );
        const changed = observed.result.diagnostics.find((item) => item.code === code);
        assert.ok(changed, JSON.stringify(observed.result));
        assert.match(changed.message, /retry after writes settle/i);
      } finally {
        fs.rmSync(value.directory, { recursive: true, force: true });
      }
    });
  }
});

test('Review-to-Test binds parsing, waiter validation, and digest to one raw-byte snapshot', () => {
  const value = fixture();
  try {
    const alternateBytes = Buffer.from(`${JSON.stringify(value.summary)}\n`, 'utf8');
    value.report.review.summary_digest = crypto.createHash('sha256')
      .update(alternateBytes)
      .digest('hex');
    fs.writeFileSync(value.reportFile, `${JSON.stringify(value.report, null, 2)}\n`);

    const shimDirectory = pythonSummaryMutationShim(value, alternateBytes);

    const result = run(value.summaryFile, value.reportFile, {
      env: { PATH: `${shimDirectory}${path.delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout + result.stderr, /snapshot|digest|summary/i);
  } finally {
    fs.rmSync(value.directory, { recursive: true, force: true });
  }
});

test('Review-to-Test waiter validates the captured bytes after the canonical path changes', () => {
  const value = fixture();
  try {
    const originalBytes = fs.readFileSync(value.summaryFile);
    const alternateBytes = Buffer.from(`${JSON.stringify(value.summary)}\n`, 'utf8');
    assert.notEqual(
      crypto.createHash('sha256').update(originalBytes).digest('hex'),
      crypto.createHash('sha256').update(alternateBytes).digest('hex'),
    );
    const shimDirectory = pythonSummaryMutationShim(value, alternateBytes);

    const result = run(value.summaryFile, value.reportFile, {
      env: { PATH: `${shimDirectory}${path.delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stdout);
    const receipt = JSON.parse(result.stdout);
    assert.equal(
      receipt.summary_digest,
      crypto.createHash('sha256').update(originalBytes).digest('hex'),
    );
    assert.deepEqual(fs.readFileSync(value.summaryFile), alternateBytes);
  } finally {
    fs.rmSync(value.directory, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// v0.27 H0 — direct-parent packet history (HL-09, incident mutant 7)
// ---------------------------------------------------------------------------

const REVIEW_WAIT_SCRIPT = path.join(
  ROOT,
  'skills',
  'ultra-review',
  'scripts',
  'review_wait.py',
);

function rewriteWaitPacket(session) {
  const bytes = Buffer.from(`${JSON.stringify(session.packet, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(session.directory, 'WORKER-PACKET.json'), bytes);
  session.digest = sha256(bytes);
}

function packetModeSession(extraPacketFields = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-parent-'));
  const sessionId = 'review-session';
  const outputDirectory = `.ultra/reviews/${sessionId}`;
  const directory = path.join(root, outputDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const repositoryNorthStar = fs.readFileSync(path.join(ROOT, '.ultra', 'north-star.md'), 'utf8');
  const repositoryDecision = repositoryNorthStar
    .match(/^- Owner acceptance source: `([^`]+)`/mu)[1].split('#', 1)[0];
  const repositorySnapshot = repositoryNorthStar
    .match(/^- Accepted snapshot: `([^`]+)`/mu)[1];
  for (const relative of [
    '.ultra/north-star.md',
    repositoryDecision,
    repositorySnapshot,
  ]) {
    const destination = path.join(root, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relative), destination);
  }
  const northStarDigest = gitBlobDigest(fs.readFileSync(
    path.join(root, '.ultra', 'north-star.md'),
  ));
  const intentRef = '.ultra/changes/active/review-change/intent.md';
  const acceptanceLine = '| AC-01 | The accepted public seam works. |';
  fs.mkdirSync(path.dirname(path.join(root, intentRef)), { recursive: true });
  fs.writeFileSync(path.join(root, intentRef), [
    '# Change review-change',
    '',
    '## North Star Trace',
    '',
    '- First principles: `FP-1`, `FP-2`',
    '- Serves: `NS-01`',
    '- Touches: `HC-1`, `HC-2`',
    '- North Star revision: `' + repositoryNorthStar.match(/^- Revision: `([^`]+)`/mu)[1] + '`,',
    `- North Star digest: \`${northStarDigest}\``,
    '',
    '## Acceptance',
    '',
    acceptanceLine,
    '',
  ].join('\n'), 'utf8');
  const contextRef = '.ultra/contexts/task-review-task.md';
  const contextBytes = Buffer.from(
    '# Task review-task\n\n## Acceptance Criteria\n\n- [x] The seam works.\n',
    'utf8',
  );
  fs.mkdirSync(path.dirname(path.join(root, contextRef)), { recursive: true });
  fs.writeFileSync(path.join(root, contextRef), contextBytes);
  const observation = (role, relative) => {
    const bytes = fs.readFileSync(path.join(root, relative));
    return {
      role,
      path: relative,
      sha256: sha256(bytes),
      byte_length: bytes.length,
    };
  };
  const session = {
    root,
    directory,
    packet: {
      $schema: 'ultra-review-worker-packet-v1',
      admission_contract: 'ultra-review-admission-required-v2',
      session: sessionId,
      mode: 'task',
      created_at: '2026-08-16T00:00:00Z',
      head: '0'.repeat(40),
      range: 'HEAD~1..HEAD',
      change_id: 'review-change',
      task_ids: ['review-task'],
      acceptance: [`${intentRef}#acceptance: ${acceptanceLine}`],
      public_seams: ['src/example.js'],
      north_star_trace: {
        path: `${intentRef}#north-star-trace`,
        first_principles: ['FP-1', 'FP-2'],
        serves: ['NS-01'],
        touches: ['HC-1', 'HC-2'],
        north_star_revision: repositoryNorthStar.match(/^- Revision: `([^`]+)`/mu)[1],
        north_star_digest: northStarDigest,
      },
      context_files: [{ path: contextRef, sha256: sha256(contextBytes) }],
      subject_observations: [
        observation('change', intentRef),
        observation('acceptance_source', intentRef),
        observation(
          'decision',
          repositoryDecision,
        ),
        observation(
          'snapshot',
          repositorySnapshot,
        ),
      ],
      workers: [
        {
          agent: 'review-spec',
          axis: 'spec_fidelity',
          lens: 'skills/ultra-review/references/spec.md',
          output: `${outputDirectory}/review-spec.json`,
        },
        {
          agent: 'review-code',
          axis: 'engineering_standards',
          lens: 'skills/ultra-review/references/code.md',
          output: `${outputDirectory}/review-code.json`,
        },
      ],
      diff_files: ['src/example.js'],
      output_directory: outputDirectory,
      ...extraPacketFields,
    },
  };
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  };
  git('init', '-q');
  git('add', '.ultra');
  git(
    '-c', 'user.name=Ultra Review Test',
    '-c', 'user.email=review-test@example.invalid',
    'commit', '-qm', 'test subject',
  );
  session.packet.head = git('rev-parse', 'HEAD');
  rewriteWaitPacket(session);
  return session;
}

function runWaitPacketMode(session) {
  return spawnSync('python3', [
    REVIEW_WAIT_SCRIPT,
    session.directory,
    'packet',
    '--packet-digest',
    session.digest,
  ], { encoding: 'utf8', timeout: 10_000 });
}

function writeParentSummary(session, overrides = {}) {
  const parentRef = '.ultra/reviews/prior-review-session/SUMMARY.json';
  const parent = {
    $schema: 'ultra-review-summary-v4',
    mode: 'task',
    change_id: 'review-change',
    task_ids: ['review-task'],
    verdict: 'REQUEST_CHANGES',
    findings: [
      {
        id: 'review-code-001',
        axis: 'engineering_standards',
        severity: 'P1',
        title: 'Blocking finding carried from the parent',
      },
      {
        id: 'review-code-002',
        axis: 'engineering_standards',
        severity: 'P2',
        title: 'Non-blocking parent finding',
      },
    ],
    ...overrides,
  };
  const bytes = Buffer.from(`${JSON.stringify(parent, null, 2)}\n`, 'utf8');
  const parentFile = path.join(session.root, parentRef);
  fs.mkdirSync(path.dirname(parentFile), { recursive: true });
  fs.writeFileSync(parentFile, bytes);
  return { parentRef, bytes, digest: sha256(bytes) };
}

function reviewHistoryFor(parent, blockingIds) {
  return {
    parent_summary_ref: parent.parentRef,
    parent_summary_digest: parent.digest,
    unresolved_blocking_ids: blockingIds,
  };
}

test('review packet parent history is bounded to one direct parent summary', () => {
  // Sanctioned positive case: one direct parent, observed bytes matching the
  // recorded digest, and only unresolved current P0/P1 blockers from it.
  const valid = packetModeSession();
  try {
    const parent = writeParentSummary(valid);
    valid.packet.review_history = reviewHistoryFor(parent, ['review-code-001']);
    rewriteWaitPacket(valid);
    const admitted = runWaitPacketMode(valid);
    assert.equal(admitted.status, 0, admitted.stderr || admitted.stdout);
    assert.equal(JSON.parse(admitted.stdout).status, 'complete');
  } finally {
    fs.rmSync(valid.root, { recursive: true, force: true });
  }

  const rejections = [
    {
      label: 'two direct parents in the sanctioned channel',
      packet: {
        review_history: [
          {
            parent_summary_ref: '.ultra/reviews/prior-review-session/SUMMARY.json',
            parent_summary_digest: 'a'.repeat(64),
          },
          {
            parent_summary_ref: '.ultra/reviews/second-parent-session/SUMMARY.json',
            parent_summary_digest: 'b'.repeat(64),
          },
        ],
      },
    },
    {
      label: 'transitive summary chain in an extension field',
      packet: {
        historical_summaries: [
          { ref: '.ultra/reviews/h1-session/SUMMARY.json', digest: 'c'.repeat(64) },
          { ref: '.ultra/reviews/h2-session/SUMMARY.json', digest: 'd'.repeat(64) },
          { ref: '.ultra/reviews/h3-session/SUMMARY.json', digest: 'e'.repeat(64) },
        ],
      },
    },
    {
      label: 'foreign review sessions referenced across extension fields',
      packet: {
        review_history: {
          parent_summary_ref: '.ultra/reviews/prior-review-session/SUMMARY.json',
          parent_summary_digest: 'a'.repeat(64),
          unresolved_blocking_ids: [],
        },
        prior_dispositions: [
          '.ultra/reviews/other-session-1/SUMMARY.json',
          '.ultra/reviews/other-session-2/SUMMARY.json',
        ],
      },
    },
    {
      label: 'parent session repeated in an extension field beside review_history',
      prepare: (session) => {
        const parent = writeParentSummary(session);
        session.packet.review_history = reviewHistoryFor(parent, ['review-code-001']);
        session.packet.parent_copy = parent.parentRef;
      },
    },
    {
      label: 'lone foreign review reference outside any review_history',
      packet: {
        parent_carryover: '.ultra/reviews/prior-review-session/SUMMARY.json',
      },
    },
    {
      label: 'parent SUMMARY missing from the repository',
      prepare: (session) => {
        const parent = writeParentSummary(session);
        fs.rmSync(path.join(session.root, parent.parentRef));
        session.packet.review_history = reviewHistoryFor(parent, ['review-code-001']);
      },
    },
    {
      label: 'parent digest does not match the observed bytes',
      prepare: (session) => {
        const parent = writeParentSummary(session);
        session.packet.review_history = {
          parent_summary_ref: parent.parentRef,
          parent_summary_digest: '0'.repeat(64),
          unresolved_blocking_ids: ['review-code-001'],
        };
      },
    },
    {
      label: 'duplicate blocker ids',
      prepare: (session) => {
        const parent = writeParentSummary(session);
        session.packet.review_history = reviewHistoryFor(parent, [
          'review-code-001',
          'review-code-001',
        ]);
      },
    },
    {
      label: 'blocker id absent from the parent findings',
      prepare: (session) => {
        const parent = writeParentSummary(session);
        session.packet.review_history = reviewHistoryFor(parent, ['review-code-404']);
      },
    },
    {
      label: 'blocker id whose parent severity is P2',
      prepare: (session) => {
        const parent = writeParentSummary(session);
        session.packet.review_history = reviewHistoryFor(parent, ['review-code-002']);
      },
    },
    {
      label: 'parent change_id differs from the packet',
      prepare: (session) => {
        const parent = writeParentSummary(session, { change_id: 'other-change' });
        session.packet.review_history = reviewHistoryFor(parent, ['review-code-001']);
      },
    },
    {
      label: 'parent task_ids differ from the packet',
      prepare: (session) => {
        const parent = writeParentSummary(session, { task_ids: ['other-task'] });
        session.packet.review_history = reviewHistoryFor(parent, ['review-code-001']);
      },
    },
    {
      label: 'parent mode differs from the packet',
      prepare: (session) => {
        const parent = writeParentSummary(session, { mode: 'change' });
        session.packet.review_history = reviewHistoryFor(parent, ['review-code-001']);
      },
    },
  ];

  for (const item of rejections) {
    const session = packetModeSession();
    try {
      if (item.prepare) {
        item.prepare(session);
      } else {
        Object.assign(session.packet, item.packet);
      }
      rewriteWaitPacket(session);
      const result = runWaitPacketMode(session);
      assert.equal(result.status, 1, `${item.label}: expected rejection`);
      assert.match(
        result.stdout + result.stderr,
        /direct parent|foreign review|history|parent|digest|blocking|mode|change|task/iu,
        item.label,
      );
      assert.doesNotMatch(result.stderr, /Traceback/u, item.label);
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  }

  // An initial packet with no foreign review reference at all stays valid.
  const initial = packetModeSession();
  try {
    const admitted = runWaitPacketMode(initial);
    assert.equal(admitted.status, 0, admitted.stderr || admitted.stdout);
    assert.equal(JSON.parse(admitted.stdout).status, 'complete');
  } finally {
    fs.rmSync(initial.root, { recursive: true, force: true });
  }
});
