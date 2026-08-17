'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REVIEW_SUBPROCESS_TIMEOUT_MS = 5_000;
const SCRIPT = path.resolve(__dirname, '..', 'skills', 'ultra-review', 'scripts', 'review_wait.py');
const REVIEW_WORKERS = [
  ['review-spec', 'spec_fidelity'],
  ['review-code', 'engineering_standards'],
  ['review-tests', 'engineering_standards'],
  ['review-errors', 'engineering_standards'],
  ['review-design', 'engineering_standards'],
  ['review-comments', 'engineering_standards'],
];
const ADMISSION_CONTRACT_V1 = 'ultra-review-admission-required-v1';
const ADMISSION_CONTRACT_V2 = 'ultra-review-admission-required-v2';
function repositoryNorthStarBindings() {
  const northStar = fs.readFileSync(path.join(ROOT, '.ultra', 'north-star.md'), 'utf8');
  const source = northStar.match(/^- Owner acceptance source: `([^`]+)`/mu);
  const snapshot = northStar.match(/^- Accepted snapshot: `([^`]+)`/mu);
  if (!source || !snapshot) {
    throw new Error('repository north-star must record its owner decision and accepted snapshot');
  }
  return {
    decisionPath: source[1].split('#', 1)[0],
    snapshotPath: snapshot[1],
    firstPrinciples: [...northStar.matchAll(/^### (FP-[A-Za-z0-9-]+) /gmu)].map((m) => m[1]),
    serves: [...northStar.matchAll(/^### (NS-[A-Za-z0-9-]+) /gmu)].map((m) => m[1]),
    touches: [...northStar.matchAll(/^### (HC-[A-Za-z0-9-]+) /gmu)].map((m) => m[1]),
    revision: (northStar.match(/^- Revision: `([^`]+)`/mu) || [])[1],
  };
}
const NORTH_STAR_BINDINGS = repositoryNorthStarBindings();
const NORTH_STAR_DECISION_PATH = NORTH_STAR_BINDINGS.decisionPath;
const NORTH_STAR_SNAPSHOT_PATH = NORTH_STAR_BINDINGS.snapshotPath;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function gitBlobDigest(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function materializeSubject(root, changeId, taskId) {
  const northStar = [
    '# Project North Star',
    '',
    '## Acceptance and Revision',
    '',
    '- Schema: `north-star-v2`',
    '- Status: `accepted`',
    '- Revision: `r1`',
    '',
    '## First-Principle Propositions',
    '',
    '### FP-1 — Durable authority',
    '',
    '### FP-2 — Bounded execution',
    '',
    '## North Star Outcomes',
    '',
    '### NS-1 — Observable outcome',
    '',
    '## Hard Constraints',
    '',
    '### HC-1 — Preserve authority',
    '',
    '### HC-2 — Preserve recovery',
    '',
  ].join('\n');
  const northStarBytes = Buffer.from(northStar, 'utf8');
  const northStarPath = path.join(root, '.ultra', 'north-star.md');
  fs.mkdirSync(path.dirname(northStarPath), { recursive: true });
  fs.writeFileSync(northStarPath, northStarBytes);
  const northStarDigest = gitBlobDigest(northStarBytes);

  const contextPath = `.ultra/contexts/task-${taskId}.md`;
  const contextBytes = Buffer.from([
    `# Task ${taskId}`,
    '',
    '## Acceptance Criteria',
    '',
    '- [x] The accepted public seam works.',
    '',
  ].join('\n'), 'utf8');
  const absoluteContext = path.join(root, contextPath);
  fs.mkdirSync(path.dirname(absoluteContext), { recursive: true });
  fs.writeFileSync(absoluteContext, contextBytes);

  const intentPath = `.ultra/changes/active/${changeId}/intent.md`;
  const acceptanceLine = '| AC-01 | The accepted public seam works. |';
  const intent = [
    `# Change ${changeId}`,
    '',
    '## North Star Trace',
    '',
    '- First principles: `FP-1`, `FP-2`',
    '- Serves: `NS-1`',
    '- Touches: `HC-1`, `HC-2`',
    '- North Star revision: `r1`',
    `- North Star digest: \`${northStarDigest}\``,
    '',
    '## Acceptance',
    '',
    acceptanceLine,
    '',
  ].join('\n');
  const absoluteIntent = path.join(root, intentPath);
  fs.mkdirSync(path.dirname(absoluteIntent), { recursive: true });
  fs.writeFileSync(absoluteIntent, intent, 'utf8');

  return {
    northStarPath,
    northStarBytes,
    northStarDigest,
    contextPath,
    contextBytes,
    absoluteContext,
    intentPath,
    absoluteIntent,
    acceptance: `${intentPath}#acceptance: ${acceptanceLine}`,
  };
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function tempSession(selected = REVIEW_WORKERS.slice(0, 2), options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-wait-'));
  const sessionId = 'review-session';
  const outputDirectory = `.ultra/reviews/${sessionId}`;
  const directory = path.join(root, outputDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const changeId = 'review-change';
  const taskId = 'review-task';
  const subject = materializeSubject(root, changeId, taskId);
  const roster = selected.some(([agent]) => agent === 'review-spec')
    ? selected
    : [REVIEW_WORKERS[0], ...selected];
  const packet = {
    $schema: 'ultra-review-worker-packet-v1',
    session: sessionId,
    mode: 'task',
    created_at: '2026-07-18T00:00:00Z',
    head: '0123456789abcdef0123456789abcdef01234567',
    range: 'HEAD~1..HEAD',
    change_id: changeId,
    task_ids: [taskId],
    acceptance: [subject.acceptance],
    public_seams: ['src/example.js'],
    north_star_trace: {
      path: `${subject.intentPath}#north-star-trace`,
      first_principles: ['FP-1', 'FP-2'],
      serves: ['NS-1'],
      touches: ['HC-1', 'HC-2'],
      north_star_revision: 'r1',
      north_star_digest: subject.northStarDigest,
    },
    context_files: [{
      path: subject.contextPath,
      sha256: sha256(subject.contextBytes),
    }],
    workers: roster.map(([agent, axis]) => ({
      agent,
      axis,
      lens: `skills/ultra-review/references/${agent.replace('review-', '')}.md`,
      output: `${outputDirectory}/${agent}.json`,
    })),
    diff_files: ['src/example.js'],
    output_directory: outputDirectory,
  };
  const bytes = Buffer.from(`${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(directory, 'WORKER-PACKET.json'), bytes);
  const session = {
    root,
    directory,
    packet,
    subject,
    digest: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
  installAcceptedRepositoryNorthStar(session);
  if (options.admissionContract !== false) {
    if (options.admissionContract === 'v1') {
      session.packet.admission_contract = ADMISSION_CONTRACT_V1;
      rewritePacket(session);
    } else {
      useV2AdmissionContract(session);
    }
  }
  git(root, ['init', '-q']);
  git(root, ['add', '.ultra']);
  git(root, [
    '-c', 'user.name=Ultra Review Test',
    '-c', 'user.email=review-test@example.invalid',
    'commit', '-qm', 'test subject',
  ]);
  session.packet.head = git(root, ['rev-parse', 'HEAD']);
  rewritePacket(session);
  if (options.admit !== false) {
    const admitted = run(session, 'packet');
    assert.equal(admitted.status, 0, admitted.stderr || admitted.stdout);
  }
  return session;
}

function rewritePacket(session) {
  const bytes = Buffer.from(`${JSON.stringify(session.packet, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(session.directory, 'WORKER-PACKET.json'), bytes);
  session.digest = crypto.createHash('sha256').update(bytes).digest('hex');
}

function subjectObservation(session, role, relativePath) {
  const bytes = fs.readFileSync(path.join(session.root, relativePath));
  return {
    role,
    path: relativePath,
    sha256: sha256(bytes),
    byte_length: bytes.length,
  };
}

function useV2AdmissionContract(session) {
  const changePath = session.packet.north_star_trace.path.split('#', 1)[0];
  const acceptancePaths = [...new Set(session.packet.acceptance.map(
    (claim) => claim.split(': ', 1)[0].split('#', 1)[0],
  ))].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  session.packet.admission_contract = ADMISSION_CONTRACT_V2;
  session.packet.subject_observations = [
    subjectObservation(session, 'change', changePath),
    ...acceptancePaths.map((relativePath) => (
      subjectObservation(session, 'acceptance_source', relativePath)
    )),
    subjectObservation(session, 'decision', NORTH_STAR_DECISION_PATH),
    subjectObservation(session, 'snapshot', NORTH_STAR_SNAPSHOT_PATH),
  ];
  rewritePacket(session);
}

function addMultipleAcceptanceSources(session) {
  const sources = [
    {
      path: '.ultra/acceptance/β-release.md',
      claims: ['The beta release evidence remains owner-readable.'],
    },
    {
      path: '.ultra/acceptance/z-release.md',
      claims: [
        'The release seam preserves exact evidence.',
        'A repeated claim from one source does not duplicate its byte observation.',
      ],
    },
  ];
  for (const source of sources) {
    const absolute = path.join(session.root, source.path);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${source.claims.join('\n')}\n`, 'utf8');
  }
  session.packet.acceptance = sources.flatMap((source) => source.claims.map(
    (claim) => `${source.path}#acceptance: ${claim}`,
  ));
  useV2AdmissionContract(session);
  return sources.map((source) => source.path).sort(
    (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)),
  );
}

function installAcceptedRepositoryNorthStar(session) {
  const files = [
    '.ultra/north-star.md',
    NORTH_STAR_DECISION_PATH,
    NORTH_STAR_SNAPSHOT_PATH,
  ];
  for (const relative of files) {
    const destination = path.join(session.root, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relative), destination);
  }
  const northStarBytes = fs.readFileSync(path.join(session.root, '.ultra', 'north-star.md'));
  session.subject.northStarPath = path.join(session.root, '.ultra', 'north-star.md');
  session.subject.northStarBytes = northStarBytes;
  session.subject.northStarDigest = gitBlobDigest(northStarBytes);
  session.packet.north_star_trace = {
    ...session.packet.north_star_trace,
    first_principles: NORTH_STAR_BINDINGS.firstPrinciples,
    serves: NORTH_STAR_BINDINGS.serves,
    touches: NORTH_STAR_BINDINGS.touches,
    north_star_revision: NORTH_STAR_BINDINGS.revision,
    north_star_digest: session.subject.northStarDigest,
  };
  rewritePacket(session);
}

function removePath(target, fieldPath) {
  const parts = fieldPath.split('.');
  const field = parts.pop();
  let owner = target;
  for (const part of parts) owner = owner[part];
  delete owner[field];
}

function canonicalContextDigest(contextFiles) {
  if (contextFiles.length === 1) return contextFiles[0].sha256;
  const canonical = [...contextFiles]
    .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)))
    .map(({ path: contextPath, sha256 }) => ({ path: contextPath, sha256 }));
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
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

function admissionBinding(session) {
  const admissionPath = path.join(session.directory, 'ADMISSION.json');
  if (!fs.existsSync(admissionPath)) return {};
  const bytes = fs.readFileSync(admissionPath);
  const receipt = JSON.parse(bytes.toString('utf8'));
  return {
    admission_digest: sha256(bytes),
    subject_digest: receipt.subject_digest,
  };
}

function convertToRetainedV1Admission(session) {
  const admissionPath = path.join(session.directory, 'ADMISSION.json');
  const receipt = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
  session.packet.admission_contract = ADMISSION_CONTRACT_V1;
  delete session.packet.subject_observations;
  rewritePacket(session);
  receipt.$schema = 'ultra-review-admission-v1';
  receipt.version = 1;
  receipt.packet_digest = session.digest;
  receipt.observations = receipt.observations.map(({ byte_length: _byteLength, ...item }) => item);
  const { $schema: _schema, subject_digest: _priorSubject, ...subject } = receipt;
  receipt.subject_digest = canonicalJsonDigest(subject);
  fs.writeFileSync(admissionPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

function rewriteAdmissionWithEquivalentPacketBinding(session) {
  const admissionPath = path.join(session.directory, 'ADMISSION.json');
  const receipt = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
  receipt.north_star_report.sha256 = receipt.north_star_report.sha256 === 'e'.repeat(64)
    ? 'd'.repeat(64)
    : 'e'.repeat(64);
  const { $schema: _schema, subject_digest: _priorSubject, ...subject } = receipt;
  receipt.subject_digest = canonicalJsonDigest(subject);
  fs.writeFileSync(admissionPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return admissionBinding(session);
}

function rewriteRehashedAdmission(session, mutate) {
  const admissionPath = path.join(session.directory, 'ADMISSION.json');
  const receipt = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
  mutate(receipt);
  receipt.subject_digest = canonicalJsonDigest({
    version: receipt.version,
    session: receipt.session,
    packet_digest: receipt.packet_digest,
    head: receipt.head,
    observations: receipt.observations,
    north_star_report: receipt.north_star_report,
  });
  fs.writeFileSync(admissionPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function run(session, mode, ...args) {
  return spawnSync('python3', [
    SCRIPT,
    session.directory,
    mode,
    '--packet-digest',
    session.digest,
    ...args,
  ], {
    encoding: 'utf8',
    timeout: REVIEW_SUBPROCESS_TIMEOUT_MS,
    env: {
      ...process.env,
      UBP_REVIEW_WAIT_TIMEOUT: '0.05',
      UBP_REVIEW_WAIT_POLL: '0.01',
    },
  });
}

function runWithInput(session, mode, input, ...args) {
  return spawnSync('python3', [
    SCRIPT,
    session.directory,
    mode,
    '--packet-digest',
    session.digest,
    ...args,
  ], {
    encoding: 'utf8',
    input,
    timeout: REVIEW_SUBPROCESS_TIMEOUT_MS,
    env: {
      ...process.env,
      UBP_REVIEW_WAIT_TIMEOUT: '0.05',
      UBP_REVIEW_WAIT_POLL: '0.01',
    },
  });
}

function runWithEnv(session, mode, extraEnv, ...args) {
  return spawnSync('python3', [
    SCRIPT,
    session.directory,
    mode,
    '--packet-digest',
    session.digest,
    ...args,
  ], {
    encoding: 'utf8',
    timeout: REVIEW_SUBPROCESS_TIMEOUT_MS,
    env: {
      ...process.env,
      UBP_REVIEW_WAIT_TIMEOUT: '0.05',
      UBP_REVIEW_WAIT_POLL: '0.01',
      ...extraEnv,
    },
  });
}

function runAsyncWithEnv(session, mode, timeoutSeconds, extraEnv, script, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [
      script,
      session.directory,
      mode,
      '--packet-digest',
      session.digest,
      ...args,
    ], {
      env: {
        ...process.env,
        UBP_REVIEW_WAIT_TIMEOUT: String(timeoutSeconds),
        UBP_REVIEW_WAIT_POLL: '0.01',
        ...extraEnv,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const watchdog = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`review waiter child exceeded watchdog; stdout=${stdout}; stderr=${stderr}`));
    }, 2_000);
    child.on('error', reject);
    child.on('close', (status, signal) => {
      clearTimeout(watchdog);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function runAsync(session, mode, timeoutSeconds, ...args) {
  return runAsyncWithEnv(session, mode, timeoutSeconds, {}, SCRIPT, ...args);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForFile(file, timeoutMilliseconds = 1_500) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    await delay(10);
  }
  throw new Error(`timed out waiting for subprocess marker: ${file}`);
}

function runAsyncAfterAdmissionRead(session, mode, timeoutSeconds, ...args) {
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-pin-shim-'));
  const marker = path.join(shim, 'admission-read');
  const wrapper = path.join(shim, 'review_wait_with_marker.py');
  fs.writeFileSync(wrapper, [
    'import importlib.util',
    'import os',
    'from pathlib import Path',
    '',
    '_spec = importlib.util.spec_from_file_location(',
    '    "ultra_review_wait_under_test",',
    '    os.environ["UBP_REVIEW_WAIT_SCRIPT"],',
    ')',
    '_module = importlib.util.module_from_spec(_spec)',
    '_spec.loader.exec_module(_module)',
    '_original = _module.load_admission_receipt',
    '_signaled = False',
    '',
    'def _load_admission_receipt(*args, **kwargs):',
    '    global _signaled',
    '    result = _original(*args, **kwargs)',
    '    if not _signaled and result[0] is not None:',
    '        _signaled = True',
    '        Path(os.environ["UBP_REVIEW_WAIT_MARKER"]).write_text(',
    '            "read\\n", encoding="utf-8"',
    '        )',
    '    return result',
    '',
    '_module.load_admission_receipt = _load_admission_receipt',
    '_module.main()',
    '',
  ].join('\n'));
  return {
    cleanup() {
      fs.rmSync(shim, { recursive: true, force: true });
    },
    pending: runAsyncWithEnv(session, mode, timeoutSeconds, {
      UBP_REVIEW_WAIT_MARKER: marker,
      UBP_REVIEW_WAIT_SCRIPT: SCRIPT,
    }, wrapper, ...args),
    ready: waitForFile(marker),
  };
}

function specialist(session, agent, axis) {
  return {
    $schema: 'ultra-review-findings-v4',
    agent,
    axis,
    packet_digest: session.digest,
    ...admissionBinding(session),
    session: session.packet.session,
    timestamp: '2026-07-18T00:00:00Z',
    scope: {
      head: session.packet.head,
      range: session.packet.range,
      files_analyzed: ['src/example.js'],
      diff_only: true,
    },
    status: 'complete',
    findings: [],
    coverage_refs: ['src/example.js'],
    positive_observations: [],
    limitations: [],
  };
}

function finding(axis, severity, id = `${axis}-${severity}`) {
  return {
    id,
    axis,
    severity,
    category: 'correctness',
    title: 'Observable contract mismatch',
    file: 'src/example.js',
    line: 4,
    trigger: 'The changed path receives the accepted input.',
    impact: 'The delivered behavior violates its accepted contract.',
    evidence: 'The current branch returns the opposite state.',
    suggestion: 'Return the accepted state and cover the public seam.',
    north_star_trace: {
      first_principles: ['FP-1'],
      serves: ['NS-01'],
      touches: ['HC-1'],
    },
  };
}

function writeArtifact(session, agent, axis, findings = []) {
  const artifact = specialist(session, agent, axis);
  artifact.findings = findings;
  fs.writeFileSync(
    path.join(session.directory, `${agent}.json`),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  return artifact;
}

function summaryFor(session, artifacts, overrides = {}) {
  const selected = session.packet.workers.map((worker) => worker.agent);
  const skipped = REVIEW_WORKERS.map(([agent]) => agent).filter((agent) => !selected.includes(agent));
  const union = session.packet.workers.flatMap((worker) => artifacts[worker.agent].findings);
  const findingsByAxis = Object.fromEntries([...new Set(REVIEW_WORKERS.map(([, axis]) => axis))]
    .map((axis) => [axis, union.filter((item) => item.axis === axis)]));
  const refsByAxis = Object.fromEntries(['spec_fidelity', 'engineering_standards'].map((axis) => [
    axis,
    session.packet.workers
      .filter((worker) => worker.axis === axis)
      .map((worker) => path.basename(worker.output)),
  ]));
  const axisVerdict = (axis) => findingsByAxis[axis].some((item) => ['P0', 'P1'].includes(item.severity))
    ? 'FAIL'
    : 'PASS';
  const axes = {
    spec_fidelity: {
      verdict: axisVerdict('spec_fidelity'),
      evidence_refs: refsByAxis.spec_fidelity,
    },
    engineering_standards: {
      verdict: axisVerdict('engineering_standards'),
      evidence_refs: refsByAxis.engineering_standards,
    },
  };
  return {
    $schema: 'ultra-review-summary-v4',
    mode: session.packet.mode,
    execution_mode: 'isolated',
    session: session.packet.session,
    change_id: session.packet.change_id,
    task_ids: session.packet.task_ids,
    head: session.packet.head,
    worktree_digest: null,
    context_digest: canonicalContextDigest(session.packet.context_files),
    packet_digest: session.digest,
    ...admissionBinding(session),
    status: 'complete',
    verdict: Object.values(axes).some((item) => item.verdict === 'FAIL')
      ? 'REQUEST_CHANGES'
      : 'APPROVE',
    axes,
    workers: { completed: selected, failed: [], skipped },
    worker_selection: REVIEW_WORKERS.map(([worker]) => ({
      worker,
      status: selected.includes(worker) ? 'selected' : 'skipped',
      rationale: selected.includes(worker) ? 'Selected by the immutable packet.' : 'Outside this packet.',
    })),
    findings: union,
    coverage_refs: session.packet.workers.map((worker) => path.basename(worker.output)),
    positive_observations: [],
    limitations: [],
    ...overrides,
  };
}

function writeSummary(session, summary) {
  fs.writeFileSync(
    path.join(session.directory, 'SUMMARY.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
}

test('review waiter validates named v4 specialist artifacts bound to the immutable packet roster', () => {
  const session = tempSession();
  try {
    writeArtifact(session, 'review-spec', 'spec_fidelity');
    writeArtifact(session, 'review-code', 'engineering_standards');
    const result = run(session, 'agents', 'review-spec', 'review-code');
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    assert.deepEqual(output.artifacts_done, ['review-spec', 'review-code']);
    assert.deepEqual(output.artifacts_invalid, []);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('strict v4 consumers require packet admission while legacy-v4 stays explicit', () => {
  const session = tempSession([['review-code', 'engineering_standards']], {
    admit: false,
    admissionContract: false,
  });
  try {
    writeArtifact(session, 'review-code', 'engineering_standards');
    const strict = run(session, 'agents', 'review-code');
    assert.equal(strict.status, 1, strict.stderr || strict.stdout);
    assert.match(strict.stdout, /ADMISSION|admission|receipt|packet mode/i);

    const historical = run(session, 'agents', '--legacy-v4', 'review-code');
    assert.equal(historical.status, 0, historical.stderr || historical.stdout);
    assert.equal(JSON.parse(historical.stdout).status, 'complete');
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('the admission contract marker is required for strict v4 and forbidden in legacy-v4', () => {
  const historical = tempSession([['review-code', 'engineering_standards']], {
    admit: false,
    admissionContract: false,
  });
  const current = tempSession([['review-code', 'engineering_standards']], { admit: false });
  try {
    const strict = run(historical, 'packet');
    assert.equal(strict.status, 1, strict.stderr || strict.stdout);
    assert.match(strict.stdout + strict.stderr, /admission_contract|admission contract|required/i);

    writeArtifact(historical, 'review-code', 'engineering_standards');
    const legacy = run(historical, 'agents', '--legacy-v4', 'review-code');
    assert.equal(legacy.status, 0, legacy.stderr || legacy.stdout);

    writeArtifact(current, 'review-code', 'engineering_standards');
    const markedLegacy = run(current, 'agents', '--legacy-v4', 'review-code');
    assert.equal(markedLegacy.status, 1, markedLegacy.stderr || markedLegacy.stdout);
    assert.match(markedLegacy.stdout + markedLegacy.stderr, /admission_contract|legacy-v4|current strict/i);
  } finally {
    fs.rmSync(historical.root, { recursive: true, force: true });
    fs.rmSync(current.root, { recursive: true, force: true });
  }
});

test('both legacy modes reject retained v1 and current v2 strict packet markers', async (t) => {
  for (const contract of ['v1', 'v2']) {
    await t.test(contract, () => {
      const session = tempSession();
      try {
        if (contract === 'v1') convertToRetainedV1Admission(session);
        const artifacts = {
          'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
          'review-code': writeArtifact(session, 'review-code', 'engineering_standards'),
        };

        for (const [flag, artifactSchema, summarySchema] of [
          ['--legacy-v3', 'ultra-review-findings-v3', 'ultra-review-summary-v3'],
          ['--legacy-v4', 'ultra-review-findings-v4', 'ultra-review-summary-v4'],
        ]) {
          for (const [stem, artifact] of Object.entries(artifacts)) {
            artifact.$schema = artifactSchema;
            fs.writeFileSync(
              path.join(session.directory, `${stem}.json`),
              `${JSON.stringify(artifact, null, 2)}\n`,
            );
          }
          const summary = summaryFor(session, artifacts);
          summary.$schema = summarySchema;
          writeSummary(session, summary);

          const agents = run(session, 'agents', flag, 'review-code');
          assert.equal(agents.status, 1, `${contract} ${flag} agents: ${agents.stdout}`);
          assert.match(agents.stdout + agents.stderr, /strict|admission_contract|legacy/i);
          const summaryResult = run(session, 'summary', flag);
          assert.equal(
            summaryResult.status,
            1,
            `${contract} ${flag} summary: ${summaryResult.stdout}`,
          );
          assert.match(
            summaryResult.stdout + summaryResult.stderr,
            /strict|admission_contract|legacy/i,
          );
        }
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('strict v4 specialist artifacts require the exact admission and subject digests', async (t) => {
  const mutations = [
    ['missing admission digest', (artifact) => { delete artifact.admission_digest; }],
    ['different admission digest', (artifact) => { artifact.admission_digest = 'a'.repeat(64); }],
    ['missing subject digest', (artifact) => { delete artifact.subject_digest; }],
    ['different subject digest', (artifact) => { artifact.subject_digest = 'b'.repeat(64); }],
  ];

  for (const [label, mutate] of mutations) {
    await t.test(label, () => {
      const session = tempSession([['review-code', 'engineering_standards']]);
      try {
        const artifact = specialist(session, 'review-code', 'engineering_standards');
        mutate(artifact);
        fs.writeFileSync(
          path.join(session.directory, 'review-code.json'),
          `${JSON.stringify(artifact, null, 2)}\n`,
        );

        const result = run(session, 'agents', 'review-code');

        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        assert.match(result.stdout, /admission_digest|subject_digest|receipt|admission/i, label);
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('strict consumers reject self-consistent rehashed v2 receipts that drift from the packet', async (t) => {
  const mutations = [
    ['ordered subject projection', (receipt) => {
      [receipt.observations[2], receipt.observations[3]] = [
        receipt.observations[3],
        receipt.observations[2],
      ];
    }],
    ['subject byte length', (receipt) => {
      receipt.observations.at(-1).byte_length += 1;
    }],
    ['canonical source observations', (receipt) => {
      receipt.north_star_report.source_observations.reverse();
    }],
  ];

  for (const [label, mutate] of mutations) {
    await t.test(label, () => {
      const session = tempSession();
      try {
        const originalBinding = admissionBinding(session);
        const receipt = rewriteRehashedAdmission(session, mutate);
        assert.equal(
          receipt.subject_digest,
          canonicalJsonDigest({
            version: receipt.version,
            session: receipt.session,
            packet_digest: receipt.packet_digest,
            head: receipt.head,
            observations: receipt.observations,
            north_star_report: receipt.north_star_report,
          }),
        );
        assert.notEqual(admissionBinding(session).admission_digest, originalBinding.admission_digest);

        const artifacts = {
          'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
          'review-code': writeArtifact(session, 'review-code', 'engineering_standards'),
        };
        const agents = run(session, 'agents', 'review-code');
        assert.equal(agents.status, 1, `${label} agents: ${agents.stdout}`);
        assert.match(
          agents.stdout,
          /ADMISSION|observation|packet|projection|byte_length|decision|snapshot/i,
          label,
        );

        writeSummary(session, summaryFor(session, artifacts));
        const summary = run(session, 'summary');
        assert.equal(summary.status, 1, `${label} summary: ${summary.stdout}`);
        assert.match(
          summary.stdout,
          /ADMISSION|observation|packet|projection|byte_length|decision|snapshot/i,
          label,
        );
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('review waiter rejects packet tampering before accepting a v4 artifact', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  try {
    writeArtifact(session, 'review-code', 'engineering_standards');
    fs.appendFileSync(path.join(session.directory, 'WORKER-PACKET.json'), ' ');
    const result = run(session, 'agents', 'review-code');
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout + result.stderr, /WORKER-PACKET|digest|immutable/i);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter permits non-authoritative top-level packet extensions', () => {
  const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
  try {
    session.packet.review_questions = ['Challenge the accepted public seam.'];
    session.packet.historical_review = {
      session: 'prior-review',
      verdict: 'REQUEST_CHANGES',
    };
    rewritePacket(session);
    const admitted = run(session, 'packet');
    assert.equal(admitted.status, 0, admitted.stderr || admitted.stdout);
    writeArtifact(session, 'review-code', 'engineering_standards');
    const result = run(session, 'agents', 'review-code');
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter reports invalid UTF-8 packet JSON as typed incomplete output', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  try {
    const bytes = Buffer.from([0xff, 0xfe]);
    fs.writeFileSync(path.join(session.directory, 'WORKER-PACKET.json'), bytes);
    session.digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const result = run(session, 'agents', 'review-code');
    assert.equal(result.status, 1, result.stdout);
    assert.doesNotMatch(result.stderr, /Traceback/);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'incomplete');
    assert.match(output.errors['WORKER-PACKET'], /UTF-8|JSON/i);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter preflights a packet against the real accepted repository North Star', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  try {
    installAcceptedRepositoryNorthStar(session);
    const result = run(session, 'packet');
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    assert.equal(output.packet_digest, session.digest);
    assert.equal(output.context_digest, session.packet.context_files[0].sha256);
    assert.match(output.subject_digest, /^[0-9a-f]{64}$/);
    assert.match(output.admission_digest, /^[0-9a-f]{64}$/);
    const admissionPath = path.join(session.directory, 'ADMISSION.json');
    const admission = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
    assert.equal(admission.$schema, 'ultra-review-admission-v2');
    assert.equal(admission.version, 2);
    assert.equal(admission.packet_digest, session.digest);
    assert.equal(admission.head, session.packet.head);
    assert.equal(admission.subject_digest, output.subject_digest);
    assert.ok(admission.observations.some((item) => item.role === 'change'));
    assert.ok(admission.observations.some((item) => item.role === 'acceptance_source'));
    assert.equal(fs.readdirSync(session.directory).some((name) => name.startsWith('.ADMISSION.')), false);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('strict admission v2 binds exact ordered packet subject observations', () => {
  const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
  try {
    useV2AdmissionContract(session);

    const result = run(session, 'packet');

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    const admission = JSON.parse(fs.readFileSync(
      path.join(session.directory, 'ADMISSION.json'),
      'utf8',
    ));
    assert.equal(admission.$schema, 'ultra-review-admission-v2');
    assert.equal(admission.version, 2);
    assert.deepEqual(
      admission.observations.slice(2),
      session.packet.subject_observations.slice(0, -2),
    );
    assert.deepEqual(
      admission.north_star_report.source_observations,
      session.packet.subject_observations.slice(-2),
    );
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('strict admission v2 orders and deduplicates multiple acceptance sources by UTF-8 path bytes', async (t) => {
  await t.test('ordered unique packet and receipt projection', () => {
    const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
    try {
      const expectedPaths = addMultipleAcceptanceSources(session);
      assert.equal(session.packet.acceptance.length, 3);
      assert.deepEqual(
        session.packet.subject_observations
          .filter((item) => item.role === 'acceptance_source')
          .map((item) => item.path),
        expectedPaths,
      );

      const result = run(session, 'packet');

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const receipt = JSON.parse(fs.readFileSync(
        path.join(session.directory, 'ADMISSION.json'),
        'utf8',
      ));
      assert.deepEqual(
        receipt.observations
          .filter((item) => item.role === 'acceptance_source')
          .map((item) => item.path),
        expectedPaths,
      );
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });

  await t.test('second ordered acceptance source drift', () => {
    const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
    try {
      const expectedPaths = addMultipleAcceptanceSources(session);
      fs.appendFileSync(
        path.join(session.root, expectedPaths[1]),
        'post-packet second-source drift\n',
      );

      const result = run(session, 'packet');

      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /subject_observations|byte_length|sha256|source/i);
      assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), false);
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });
});

test('retained strict v1 stays readable but packet mode never recreates its receipt', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  const admissionPath = path.join(session.directory, 'ADMISSION.json');
  try {
    convertToRetainedV1Admission(session);
    writeArtifact(session, 'review-code', 'engineering_standards');

    const consumed = run(session, 'agents', 'review-code');
    assert.equal(consumed.status, 0, consumed.stderr || consumed.stdout);
    const existing = run(session, 'packet');
    assert.equal(existing.status, 0, existing.stderr || existing.stdout);
    assert.equal(JSON.parse(existing.stdout).publication, 'existing');

    fs.unlinkSync(admissionPath);
    fs.unlinkSync(path.join(session.directory, 'review-code.json'));
    const missing = run(session, 'packet');
    assert.equal(missing.status, 1, missing.stderr || missing.stdout);
    const output = JSON.parse(missing.stdout);
    assert.equal(output.status, 'incomplete');
    assert.match(output.error, /v1|receipt|fresh|v2|new session/i);
    assert.equal(fs.existsSync(admissionPath), false);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('packet admission publishes once and treats the exact existing receipt as idempotent', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  const admissionPath = path.join(session.directory, 'ADMISSION.json');
  try {
    const beforeBytes = fs.readFileSync(admissionPath);
    const before = fs.statSync(admissionPath);

    const result = run(session, 'packet');

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    assert.equal(output.publication, 'existing');
    assert.deepEqual(fs.readFileSync(admissionPath), beforeBytes);
    assert.equal(fs.statSync(admissionPath).ino, before.ino);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('packet admission never replaces a different receipt and requires a fresh session', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  const admissionPath = path.join(session.directory, 'ADMISSION.json');
  try {
    fs.appendFileSync(admissionPath, ' ');
    const beforeBytes = fs.readFileSync(admissionPath);
    const before = fs.statSync(admissionPath);

    const result = run(session, 'packet');

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'incomplete');
    assert.equal(output.error_code, 'admission_conflict');
    assert.match(output.error, /immutable|different|fresh|new session/i);
    assert.deepEqual(fs.readFileSync(admissionPath), beforeBytes);
    assert.equal(fs.statSync(admissionPath).ino, before.ino);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('packet mode refuses to recreate a missing receipt after any review output exists', async (t) => {
  for (const [label, writeOutput] of [
    ['specialist', (session) => writeArtifact(session, 'review-code', 'engineering_standards')],
    ['SUMMARY', (session) => fs.writeFileSync(path.join(session.directory, 'SUMMARY.json'), '{}\n')],
  ]) {
    await t.test(label, () => {
      const session = tempSession([['review-code', 'engineering_standards']]);
      const admissionPath = path.join(session.directory, 'ADMISSION.json');
      try {
        fs.unlinkSync(admissionPath);
        writeOutput(session);
        fs.appendFileSync(session.subject.absoluteIntent, '\nChanged after first admission.\n');

        const result = run(session, 'packet');

        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        const output = JSON.parse(result.stdout);
        assert.equal(output.status, 'incomplete');
        assert.equal(output.error_code, 'admission_receipt_missing_after_outputs');
        assert.match(output.error, /missing|output|fresh.*session/i);
        assert.equal(fs.existsSync(admissionPath), false);
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('packet mode may recreate the exact v2 receipt before any review output exists', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  const admissionPath = path.join(session.directory, 'ADMISSION.json');
  try {
    const prior = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
    fs.unlinkSync(admissionPath);

    const result = run(session, 'packet');

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    assert.equal(output.publication, 'created');
    assert.equal(output.subject_digest, prior.subject_digest);
    assert.equal(fs.existsSync(admissionPath), true);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('packet admission remains complete when directory fsync fails after publication', () => {
  const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-admission-fsync-'));
  try {
    fs.writeFileSync(path.join(shim, 'sitecustomize.py'), [
      'import errno',
      'import os',
      'import stat',
      '_real_fsync = os.fsync',
      '_failed_directory = False',
      'def _fsync(descriptor):',
      '    global _failed_directory',
      '    if stat.S_ISDIR(os.fstat(descriptor).st_mode) and not _failed_directory:',
      '        _failed_directory = True',
      '        raise OSError(errno.EIO, "injected directory fsync failure")',
      '    return _real_fsync(descriptor)',
      'os.fsync = _fsync',
      '',
    ].join('\n'));

    const result = runWithEnv(session, 'packet', { PYTHONPATH: shim });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    assert.equal(output.durability_warning.code, 'admission_directory_fsync_failed');
    assert.match(output.durability_warning.message, /published|usable|durability/i);
    assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), true);
    assert.equal(fs.readdirSync(session.directory).some((name) => name.startsWith('.ADMISSION.')), false);
    writeArtifact(session, 'review-code', 'engineering_standards');
    const consumed = run(session, 'agents', 'review-code');
    assert.equal(consumed.status, 0, consumed.stderr || consumed.stdout);
  } finally {
    fs.rmSync(shim, { recursive: true, force: true });
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('packet admission omits a temporary cleanup warning when the final retry succeeds', () => {
  const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-admission-cleanup-retry-'));
  try {
    fs.writeFileSync(path.join(shim, 'sitecustomize.py'), [
      'import errno',
      'import os',
      '_real_unlink = os.unlink',
      '_failed_temporary = False',
      'def _unlink(target, *args, **kwargs):',
      '    global _failed_temporary',
      '    if os.path.basename(os.fspath(target)).startswith(".ADMISSION.") and not _failed_temporary:',
      '        _failed_temporary = True',
      '        raise OSError(errno.EBUSY, "injected transient temporary cleanup failure")',
      '    return _real_unlink(target, *args, **kwargs)',
      'os.unlink = _unlink',
      '',
    ].join('\n'));

    const result = runWithEnv(session, 'packet', { PYTHONPATH: shim });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    assert.equal(Object.hasOwn(output, 'durability_warning'), false);
    assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), true);
    assert.equal(fs.readdirSync(session.directory).some((name) => name.startsWith('.ADMISSION.')), false);
  } finally {
    fs.rmSync(shim, { recursive: true, force: true });
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('packet admission never unlinks a replacement at its temporary pathname', () => {
  const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-admission-cleanup-swap-'));
  const replacement = 'workspace-owned replacement\n';
  try {
    fs.writeFileSync(path.join(shim, 'sitecustomize.py'), [
      'import os',
      '_real_link = os.link',
      '_real_unlink = os.unlink',
      'def _link(source, target, *args, **kwargs):',
      '    result = _real_link(source, target, *args, **kwargs)',
      '    if os.path.basename(os.fspath(target)) == "ADMISSION.json":',
      '        _real_unlink(source)',
      `        with open(source, "wb") as stream: stream.write(${JSON.stringify(replacement)}.encode("utf-8"))`,
      '    return result',
      'os.link = _link',
      '',
    ].join('\n'));

    const result = runWithEnv(session, 'packet', { PYTHONPATH: shim });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    assert.equal(output.publication, 'created');
    assert.equal(output.durability_warning.code, 'admission_temp_cleanup_failed');
    assert.match(output.durability_warning.message, /identity|replacement|retained/i);
    const temporaryNames = fs.readdirSync(session.directory)
      .filter((name) => name.startsWith('.ADMISSION.'));
    assert.equal(temporaryNames.length, 1);
    assert.equal(
      fs.readFileSync(path.join(session.directory, temporaryNames[0]), 'utf8'),
      replacement,
    );
    assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), true);
    writeArtifact(session, 'review-code', 'engineering_standards');
    const consumed = run(session, 'agents', 'review-code');
    assert.equal(consumed.status, 0, consumed.stderr || consumed.stdout);
  } finally {
    fs.rmSync(shim, { recursive: true, force: true });
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('packet admission preserves every unresolved durability warning', () => {
  const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-admission-warning-union-'));
  try {
    fs.writeFileSync(path.join(shim, 'sitecustomize.py'), [
      'import errno',
      'import os',
      'import stat',
      '_real_fsync = os.fsync',
      '_real_unlink = os.unlink',
      'def _fsync(descriptor):',
      '    if stat.S_ISDIR(os.fstat(descriptor).st_mode):',
      '        raise OSError(errno.EIO, "injected directory fsync failure")',
      '    return _real_fsync(descriptor)',
      'def _unlink(target, *args, **kwargs):',
      '    if os.path.basename(os.fspath(target)).startswith(".ADMISSION."):',
      '        raise OSError(errno.EBUSY, "injected persistent temporary cleanup failure")',
      '    return _real_unlink(target, *args, **kwargs)',
      'os.fsync = _fsync',
      'os.unlink = _unlink',
      '',
    ].join('\n'));

    const result = runWithEnv(session, 'packet', { PYTHONPATH: shim });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    assert.equal(output.durability_warning.code, 'admission_multiple_durability_warnings');
    assert.deepEqual(
      output.durability_warning.warnings.map((warning) => warning.code),
      ['admission_directory_fsync_failed', 'admission_temp_cleanup_failed'],
    );
    assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), true);
    assert.equal(fs.readdirSync(session.directory).some((name) => name.startsWith('.ADMISSION.')), true);
  } finally {
    fs.rmSync(shim, { recursive: true, force: true });
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('exact existing admission receipt preserves unresolved temporary cleanup warning', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-existing-cleanup-warning-'));
  try {
    fs.writeFileSync(path.join(shim, 'sitecustomize.py'), [
      'import errno',
      'import os',
      '_real_unlink = os.unlink',
      'def _unlink(target, *args, **kwargs):',
      '    if os.path.basename(os.fspath(target)).startswith(".ADMISSION."):',
      '        raise OSError(errno.EBUSY, "injected persistent existing-receipt cleanup failure")',
      '    return _real_unlink(target, *args, **kwargs)',
      'os.unlink = _unlink',
      '',
    ].join('\n'));

    const result = runWithEnv(session, 'packet', { PYTHONPATH: shim });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    assert.equal(output.publication, 'existing');
    assert.equal(output.durability_warning.code, 'admission_temp_cleanup_failed');
    assert.equal(
      fs.readdirSync(session.directory).some((name) => name.startsWith('.ADMISSION.')),
      true,
    );
  } finally {
    fs.rmSync(shim, { recursive: true, force: true });
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('packet admission rejects a canonical session replacement after receipt publication', () => {
  const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-admission-rewalk-'));
  try {
    fs.writeFileSync(path.join(shim, 'sitecustomize.py'), [
      'import os',
      '_real_link = os.link',
      '_replaced = False',
      'def _link(source, target, *args, **kwargs):',
      '    global _replaced',
      '    result = _real_link(source, target, *args, **kwargs)',
      '    if not _replaced and os.path.basename(target) == "ADMISSION.json":',
      '        _replaced = True',
      '        current = os.path.dirname(target)',
      '        os.rename(current, current + "-before-fresh-rewalk")',
      '        os.mkdir(current)',
      '    return result',
      'os.link = _link',
      '',
    ].join('\n'));

    const result = runWithEnv(session, 'packet', { PYTHONPATH: shim });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'incomplete');
    assert.equal(output.error_code, 'admission_publication_changed');
    assert.match(output.error, /canonical|session|receipt|changed|rewalk/i);
    assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), false);
  } finally {
    fs.rmSync(shim, { recursive: true, force: true });
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('packet admission rejects Git, active Change, and acceptance sources not observed now', async (t) => {
  const cases = [
    ['Git HEAD', (session) => {
      session.packet.head = session.packet.head === 'f'.repeat(40) ? 'e'.repeat(40) : 'f'.repeat(40);
      rewritePacket(session);
    }, /Git|HEAD|head/i],
    ['active Change', (session) => {
      fs.rmSync(session.subject.absoluteIntent);
    }, /Change|intent|missing|subject/i],
    ['acceptance source', (session) => {
      session.packet.acceptance = [
        '.ultra/decisions/missing-acceptance.md#owner-record: Captured claim.',
      ];
      rewritePacket(session);
    }, /acceptance|source|missing|subject/i],
  ];

  for (const [label, mutate, pattern] of cases) {
    await t.test(label, () => {
      const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
      try {
        mutate(session);
        const result = run(session, 'packet');
        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        assert.doesNotMatch(result.stderr, /Traceback/, label);
        assert.match(result.stdout + result.stderr, pattern, label);
        assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), false);
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('strict v2 admission uses the exact validated archive or abandoned Change path', async (t) => {
  for (const state of ['archive', 'abandoned']) {
    await t.test(state, () => {
      const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
      try {
        const priorPath = session.subject.intentPath;
        const nextPath = `.ultra/changes/${state}/${session.packet.change_id}/intent.md`;
        const nextAbsolute = path.join(session.root, nextPath);
        fs.mkdirSync(path.dirname(nextAbsolute), { recursive: true });
        fs.renameSync(session.subject.absoluteIntent, nextAbsolute);
        session.subject.intentPath = nextPath;
        session.subject.absoluteIntent = nextAbsolute;
        session.packet.north_star_trace.path = `${nextPath}#north-star-trace`;
        session.packet.acceptance = session.packet.acceptance.map(
          (claim) => claim.replace(priorPath, nextPath),
        );
        useV2AdmissionContract(session);

        const result = run(session, 'packet');

        assert.equal(result.status, 0, result.stderr || result.stdout);
        const admission = JSON.parse(fs.readFileSync(
          path.join(session.directory, 'ADMISSION.json'),
          'utf8',
        ));
        assert.equal(
          admission.observations.find((item) => item.role === 'change').path,
          nextPath,
        );
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('strict v2 admission rejects every packet-captured source after byte drift', async (t) => {
  const cases = [
    ['Change', (session) => session.subject.absoluteIntent],
    ['acceptance source', (session) => {
      const relative = '.ultra/decisions/review-acceptance.md';
      const absolute = path.join(session.root, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, '# Review acceptance\n', 'utf8');
      session.packet.acceptance = [`${relative}#acceptance: Captured claim.`];
      useV2AdmissionContract(session);
      return absolute;
    }],
    ['decision', (session) => path.join(session.root, NORTH_STAR_DECISION_PATH)],
    ['snapshot', (session) => path.join(session.root, NORTH_STAR_SNAPSHOT_PATH)],
  ];

  for (const [label, target] of cases) {
    await t.test(label, () => {
      const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
      try {
        const source = target(session);
        fs.appendFileSync(source, '\npost-packet drift\n');

        const result = run(session, 'packet');

        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        assert.doesNotMatch(result.stderr, /Traceback/, label);
        assert.match(
          result.stdout + result.stderr,
          /subject_observations|bytes|byte_length|sha256|canonical|source/i,
          label,
        );
        assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), false);
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('strict v2 admission rejects canonical source mutation after validator exit', async (t) => {
  for (const [label, relative] of [
    ['decision', NORTH_STAR_DECISION_PATH],
    ['snapshot', NORTH_STAR_SNAPSHOT_PATH],
  ]) {
    await t.test(label, () => {
      const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
      const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-post-validator-drift-'));
      try {
        const wrapper = path.join(shim, 'node');
        fs.writeFileSync(wrapper, [
          '#!/bin/sh',
          `${JSON.stringify(process.execPath)} "$@"`,
          'status=$?',
          'printf "\\npost-validator drift\\n" >> "$UBP_REVIEW_MUTATE_SOURCE"',
          'exit "$status"',
          '',
        ].join('\n'));
        fs.chmodSync(wrapper, 0o755);

        const result = runWithEnv(session, 'packet', {
          PATH: `${shim}:${process.env.PATH}`,
          UBP_REVIEW_MUTATE_SOURCE: path.join(session.root, relative),
        });

        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        assert.match(result.stdout, /subject_observations|bytes|byte_length|sha256|source/i);
        assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), false);
      } finally {
        fs.rmSync(shim, { recursive: true, force: true });
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('strict v2 admission final-rewalks every Change, acceptance, decision, and snapshot source', async (t) => {
  const cases = [
    ['Change', (session) => session.subject.absoluteIntent],
    ['acceptance source', (session) => {
      const acceptancePaths = addMultipleAcceptanceSources(session);
      return path.join(session.root, acceptancePaths[1]);
    }],
    ['decision', (session) => path.join(session.root, NORTH_STAR_DECISION_PATH)],
    ['snapshot', (session) => path.join(session.root, NORTH_STAR_SNAPSHOT_PATH)],
  ];
  for (const [label, target] of cases) {
    await t.test(label, () => {
      const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
      const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-final-source-rewalk-'));
      try {
        const mutationTarget = target(session);
        fs.writeFileSync(path.join(shim, 'sitecustomize.py'), [
          'import os',
          'import subprocess',
          '_real_run = subprocess.run',
          '_git_observations = 0',
          'def _run(*args, **kwargs):',
          '    global _git_observations',
          '    command = args[0] if args else kwargs.get("args")',
          '    if isinstance(command, (list, tuple)) and command and command[0] == "git" and "rev-parse" in command:',
          '        _git_observations += 1',
          '        if _git_observations == 2:',
          '            with open(os.environ["UBP_REVIEW_MUTATE_SOURCE"], "ab") as stream:',
          '                stream.write(b"\\nfinal-rewalk drift\\n")',
          '    return _real_run(*args, **kwargs)',
          'subprocess.run = _run',
          '',
        ].join('\n'));

        const result = runWithEnv(session, 'packet', {
          PYTHONPATH: shim,
          UBP_REVIEW_MUTATE_SOURCE: mutationTarget,
        });

        assert.equal(result.status, 1, `${label}: ${result.stdout}${result.stderr}`);
        assert.match(
          result.stdout,
          /changed during packet admission|bytes|byte length|sha256/i,
          label,
        );
        assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), false);
      } finally {
        fs.rmSync(shim, { recursive: true, force: true });
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('packet admission consumes the canonical validator native same-byte stdin seam', () => {
  const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-node-shim-'));
  try {
    const wrapper = path.join(shim, 'node');
    fs.writeFileSync(wrapper, [
      '#!/bin/sh',
      'if [ "$1" = "-e" ]; then',
      '  echo "inline validator bridge is forbidden" >&2',
      '  exit 64',
      'fi',
      `exec ${JSON.stringify(process.execPath)} "$@"`,
      '',
    ].join('\n'));
    fs.chmodSync(wrapper, 0o755);
    const result = runWithEnv(session, 'packet', {
      PATH: `${shim}:${process.env.PATH}`,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const admission = JSON.parse(fs.readFileSync(
      path.join(session.directory, 'ADMISSION.json'),
      'utf8',
    ));
    const northStar = fs.readFileSync(session.subject.northStarPath);
    assert.equal(admission.north_star_report.input_sha256, sha256(northStar));
    assert.equal(admission.north_star_report.input_byte_length, northStar.length);
    assert.deepEqual(admission.north_star_report.source_observations, [
      NORTH_STAR_DECISION_PATH,
      NORTH_STAR_SNAPSHOT_PATH,
    ].map((relative, index) => {
      const bytes = fs.readFileSync(path.join(session.root, relative));
      return {
        role: index === 0 ? 'decision' : 'snapshot',
        path: relative,
        sha256: sha256(bytes),
        byte_length: bytes.length,
      };
    }));
  } finally {
    fs.rmSync(shim, { recursive: true, force: true });
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('packet admission bounds combined validator streams and reaps immediately', () => {
  const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-node-output-'));
  const pidFile = path.join(shim, 'validator.pid');
  let childPid = null;
  try {
    const fakeNode = path.join(shim, 'node');
    fs.writeFileSync(fakeNode, [
      '#!/usr/bin/python3',
      'import os',
      'import time',
      'with open(os.environ["UBP_REVIEW_FAKE_PID"], "w", encoding="ascii") as stream:',
      '    stream.write(str(os.getpid()))',
      'os.write(1, b"x" * (600 * 1024))',
      'os.write(2, b"y" * (600 * 1024))',
      'time.sleep(10)',
      '',
    ].join('\n'));
    fs.chmodSync(fakeNode, 0o755);
    const result = runWithEnv(session, 'packet', {
      PATH: `${shim}:${process.env.PATH}`,
      UBP_REVIEW_FAKE_PID: pidFile,
    });
    if (fs.existsSync(pidFile)) childPid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.doesNotMatch(result.stderr, /Traceback/);
    assert.match(result.stdout, /validator output|combined|bounded|limit/i);
    assert.ok(Number.isInteger(childPid) && childPid > 0);
    const alive = spawnSync('kill', ['-0', String(childPid)], { encoding: 'utf8' });
    assert.notEqual(alive.status, 0, 'validator child remained alive after bounded failure');
    assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), false);
  } finally {
    if (Number.isInteger(childPid)) spawnSync('kill', ['-KILL', String(childPid)]);
    fs.rmSync(shim, { recursive: true, force: true });
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter packet admission rejects current subject claims not proven by canonical facts', async (t) => {
  const cases = [
    ['context byte drift', (session) => {
      fs.appendFileSync(session.subject.absoluteContext, '\npost-packet drift\n');
    }],
    ['North Star byte drift', (session) => {
      fs.appendFileSync(session.subject.northStarPath, '\npost-packet drift\n');
    }],
    ['North Star revision identity', (session) => {
      session.packet.north_star_trace.north_star_revision = 'r2';
      rewritePacket(session);
    }],
    ['North Star resolving IDs', (session) => {
      session.packet.north_star_trace.first_principles = ['FP-404'];
      rewritePacket(session);
    }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const session = tempSession([['review-code', 'engineering_standards']]);
      try {
        installAcceptedRepositoryNorthStar(session);
        mutate(session);
        const result = run(session, 'packet');
        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        assert.doesNotMatch(result.stderr, /Traceback/, label);
        const output = JSON.parse(result.stdout);
        assert.equal(output.status, 'incomplete', label);
        assert.match(
          output.error,
          /subject|context|North Star|digest|revision|byte|canonical/i,
          label,
        );
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('review waiter freezes admitted subject claims while continuing to enforce packet bytes', async (t) => {
  await t.test('packet bytes', async () => {
    const session = tempSession([['review-code', 'engineering_standards']]);
    const waiter = runAsyncAfterAdmissionRead(session, 'agents', 0.5, 'review-code');
    try {
      assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), true);
      await waiter.ready;
      fs.appendFileSync(path.join(session.directory, 'WORKER-PACKET.json'), ' ');
      writeArtifact(session, 'review-code', 'engineering_standards');
      const result = await waiter.pending;
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /packet|digest|changed|immutable/i);
    } finally {
      waiter.cleanup();
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });

  await t.test('context bytes remain historical observations', async () => {
    const session = tempSession([['review-code', 'engineering_standards']]);
    const waiter = runAsyncAfterAdmissionRead(session, 'agents', 0.5, 'review-code');
    try {
      assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), true);
      await waiter.ready;
      fs.appendFileSync(session.subject.absoluteContext, '\nchanged while polling\n');
      writeArtifact(session, 'review-code', 'engineering_standards');
      const result = await waiter.pending;
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(JSON.parse(result.stdout).status, 'complete');
    } finally {
      waiter.cleanup();
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });
});

test('strict waiters pin one admission receipt throughout polling', async (t) => {
  await t.test('agents', async () => {
    const session = tempSession([['review-code', 'engineering_standards']]);
    const waiter = runAsyncAfterAdmissionRead(session, 'agents', 0.5, 'review-code');
    try {
      await waiter.ready;
      rewriteAdmissionWithEquivalentPacketBinding(session);
      writeArtifact(session, 'review-code', 'engineering_standards');

      const result = await waiter.pending;

      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /ADMISSION|admission|receipt.*changed|immutable/i);
    } finally {
      waiter.cleanup();
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });

  await t.test('summary', async () => {
    const session = tempSession();
    const waiter = runAsyncAfterAdmissionRead(session, 'summary', 0.5);
    try {
      let artifacts = {
        'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
        'review-code': writeArtifact(session, 'review-code', 'engineering_standards'),
      };
      await waiter.ready;
      rewriteAdmissionWithEquivalentPacketBinding(session);
      artifacts = {
        'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
        'review-code': writeArtifact(session, 'review-code', 'engineering_standards'),
      };
      writeSummary(session, summaryFor(session, artifacts));

      const result = await waiter.pending;

      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /ADMISSION|admission|receipt.*changed|immutable/i);
    } finally {
      waiter.cleanup();
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });
});

test('review waiter keeps captured acceptance claims after their mutable source changes', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  try {
    fs.writeFileSync(session.subject.absoluteIntent, '# Change moved forward\n', 'utf8');
    writeArtifact(session, 'review-code', 'engineering_standards');
    const result = run(session, 'agents', 'review-code');
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).status, 'complete');
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter rejects a symlink in any packet-admission subject path component', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  try {
    installAcceptedRepositoryNorthStar(session);
    session.packet.mode = 'change';
    const contextLink = path.join(session.root, '.ultra', 'context-link');
    fs.symlinkSync('contexts', contextLink, 'dir');
    session.packet.context_files[0].path = '.ultra/context-link/task-review-task.md';
    rewritePacket(session);
    const result = run(session, 'packet');
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout + result.stderr, /symlink|stable|component/i);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('packet admission rejects a same-byte subject behind a replaced path component', () => {
  const session = tempSession([['review-code', 'engineering_standards']], { admit: false });
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-python-shim-'));
  try {
    fs.writeFileSync(path.join(shim, 'sitecustomize.py'), [
      'import os',
      'import shutil',
      '_real_open = os.open',
      '_real_read = os.read',
      '_target_fd = None',
      '_replaced = False',
      '_root = os.environ["UBP_REVIEW_TEST_ROOT"]',
      'def _tracked_open(path, flags, mode=0o777, *, dir_fd=None):',
      '    global _target_fd',
      '    if dir_fd is None:',
      '        descriptor = _real_open(path, flags, mode)',
      '    else:',
      '        descriptor = _real_open(path, flags, mode, dir_fd=dir_fd)',
      '    if path == "task-review-task.md":',
      '        _target_fd = descriptor',
      '    return descriptor',
      'def _tracked_read(descriptor, size):',
      '    global _replaced',
      '    chunk = _real_read(descriptor, size)',
      '    if descriptor == _target_fd and chunk and not _replaced:',
      '        _replaced = True',
      '        current = os.path.join(_root, ".ultra", "contexts")',
      '        prior = os.path.join(_root, ".ultra", "contexts-before")',
      '        os.rename(current, prior)',
      '        os.mkdir(current)',
      '        shutil.copyfile(os.path.join(prior, "task-review-task.md"), os.path.join(current, "task-review-task.md"))',
      '    return chunk',
      'os.open = _tracked_open',
      'os.read = _tracked_read',
      '',
    ].join('\n'));
    const result = runWithEnv(session, 'packet', {
      PYTHONPATH: shim,
      UBP_REVIEW_TEST_ROOT: session.root,
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.doesNotMatch(result.stderr, /Traceback/);
    assert.match(result.stdout, /component|identity|changed|stable/i);
    assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), false);
  } finally {
    fs.rmSync(shim, { recursive: true, force: true });
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter rejects deletion of every strict Worker Packet provenance field', async (t) => {
  const requiredPaths = [
    '$schema',
    'session',
    'mode',
    'created_at',
    'head',
    'range',
    'change_id',
    'task_ids',
    'acceptance',
    'public_seams',
    'north_star_trace',
    'north_star_trace.path',
    'north_star_trace.first_principles',
    'north_star_trace.serves',
    'north_star_trace.touches',
    'north_star_trace.north_star_revision',
    'north_star_trace.north_star_digest',
    'context_files',
    'context_files.0.path',
    'context_files.0.sha256',
    'subject_observations',
    'subject_observations.0.role',
    'subject_observations.0.path',
    'subject_observations.0.sha256',
    'subject_observations.0.byte_length',
    'workers',
    'workers.0.agent',
    'workers.0.axis',
    'workers.0.lens',
    'workers.0.output',
    'diff_files',
    'output_directory',
  ];

  for (const fieldPath of requiredPaths) {
    await t.test(fieldPath, () => {
      const session = tempSession([['review-code', 'engineering_standards']]);
      try {
        removePath(session.packet, fieldPath);
        rewritePacket(session);
        writeArtifact(session, 'review-code', 'engineering_standards');
        const result = run(session, 'agents', 'review-code');
        assert.equal(result.status, 1, `${fieldPath}: ${result.stdout}`);
        assert.doesNotMatch(result.stderr, /Traceback/, fieldPath);
        const output = JSON.parse(result.stdout);
        assert.equal(output.status, 'incomplete', fieldPath);
        assert.match(output.errors['WORKER-PACKET'], /WORKER-PACKET|packet|worker|trace|field|schema/i);
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('review waiter rejects non-normalized, absolute, and escaping repository paths', async (t) => {
  const cases = [
    ['absolute output directory', (session) => {
      session.packet.output_directory = session.directory;
    }],
    ['absolute worker output', (session) => {
      session.packet.workers[0].output = path.join(session.directory, 'review-code.json');
    }],
    ['absolute diff path', (session) => {
      session.packet.diff_files = ['/tmp/example.js'];
    }],
    ['backslash diff path', (session) => {
      session.packet.diff_files = ['src\\example.js'];
    }],
    ['Windows drive-relative diff path', (session) => {
      session.packet.diff_files = ['C:src/example.js'];
    }],
    ['dot segment diff path', (session) => {
      session.packet.diff_files = ['src/../src/example.js'];
    }],
    ['parent context path', (session) => {
      session.packet.context_files[0].path = '../review-task.md';
    }],
    ['dot segment North Star path', (session) => {
      session.packet.north_star_trace.path = '.ultra/changes/../intent.md#north-star-trace';
    }],
    ['symlink escape', (session) => {
      fs.symlinkSync(os.tmpdir(), path.join(session.root, 'linked'), 'dir');
      session.packet.diff_files = ['linked/example.js'];
    }],
    ['symlink loop', (session) => {
      fs.symlinkSync('loop', path.join(session.root, 'loop'));
      session.packet.diff_files = ['loop/example.js'];
    }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const session = tempSession([['review-code', 'engineering_standards']]);
      try {
        mutate(session);
        rewritePacket(session);
        // Packet admission is the boundary that validates every packet path;
        // a mutated packet is rejected there before any artifact is read.
        const result = run(session, 'packet');
        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        const output = JSON.parse(result.stdout);
        assert.equal(output.status, 'incomplete');
        assert.match(
          output.error,
          /path|relative|normalized|escape|output|resolv|symlink|director/i,
          label,
        );
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('review waiter enforces the canonical worker agent-axis-lens-output mapping and order', async (t) => {
  const cases = [
    ['axis', (session) => {
      session.packet.workers.find((worker) => worker.agent === 'review-code').axis = 'spec_fidelity';
    }],
    ['lens', (session) => {
      session.packet.workers.find((worker) => worker.agent === 'review-code').lens = 'skills/ultra-review/references/spec.md';
    }],
    ['output', (session) => {
      session.packet.workers.find((worker) => worker.agent === 'review-code').output = `${session.packet.output_directory}/custom.json`;
    }],
    ['order', (session) => {
      session.packet.workers.reverse();
    }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const session = tempSession([['review-code', 'engineering_standards']]);
      try {
        mutate(session);
        rewritePacket(session);
        const requested = label === 'output' ? 'custom' : 'review-code';
        const agent = label === 'axis' ? specialist(session, 'review-code', 'spec_fidelity')
          : specialist(session, 'review-code', 'engineering_standards');
        fs.writeFileSync(path.join(session.directory, `${requested}.json`), JSON.stringify(agent));
        const result = run(session, 'agents', requested);
        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        const output = JSON.parse(result.stdout);
        assert.match(output.errors['WORKER-PACKET'], /canonical|worker|axis|lens|output|order/i, label);
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('review waiter rejects malformed Worker Packet provenance values', async (t) => {
  const cases = [
    ['created_at type', (session) => {
      session.packet.created_at = 123;
    }],
    ['created_at value', (session) => {
      session.packet.created_at = '2026-99-99T99:99:99Z';
    }],
    ['head digest', (session) => {
      session.packet.head = 'ABC123';
    }],
    ['North Star revision type', (session) => {
      session.packet.north_star_trace.north_star_revision = 1;
    }],
    ['North Star digest', (session) => {
      session.packet.north_star_trace.north_star_digest = 'a'.repeat(39);
    }],
    ['context digest', (session) => {
      session.packet.context_files[0].sha256 = 'not-a-digest';
    }],
    ['subject observation order', (session) => {
      session.packet.subject_observations.reverse();
    }],
    ['subject observation digest', (session) => {
      session.packet.subject_observations[0].sha256 = 'not-a-digest';
    }],
    ['subject observation byte length', (session) => {
      session.packet.subject_observations[0].byte_length = -1;
    }],
    ['missing review-spec', (session) => {
      session.packet.workers = session.packet.workers.filter(
        (worker) => worker.agent !== 'review-spec',
      );
    }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const session = tempSession([['review-code', 'engineering_standards']]);
      try {
        mutate(session);
        rewritePacket(session);
        writeArtifact(session, 'review-code', 'engineering_standards');
        const result = run(session, 'agents', 'review-code');
        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        const output = JSON.parse(result.stdout);
        assert.match(
          output.errors['WORKER-PACKET'],
          /created_at|head|revision|digest|sha256|byte_length|observation|provenance|review-spec|worker/i,
          label,
        );
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('review waiter binds each requested stem to packet output, worker identity, session, head, and range', () => {
  const mutations = [
    ['wrong output stem', (session, artifact) => {
      session.packet.workers[0].output = path.join(session.directory, 'different-output.json');
      return artifact;
    }],
    ['wrong agent', (_session, artifact) => ({ ...artifact, agent: 'review-spec' })],
    ['wrong axis', (_session, artifact) => ({ ...artifact, axis: 'spec_fidelity' })],
    ['wrong session', (_session, artifact) => ({ ...artifact, session: 'stale-session' })],
    ['wrong head', (_session, artifact) => ({ ...artifact, scope: { ...artifact.scope, head: 'stale-head' } })],
    ['wrong range', (_session, artifact) => ({ ...artifact, scope: { ...artifact.scope, range: 'stale-range' } })],
  ];
  for (const [label, mutate] of mutations) {
    const session = tempSession([['review-code', 'engineering_standards']]);
    try {
      let artifact = specialist(session, 'review-code', 'engineering_standards');
      artifact = mutate(session, artifact);
      if (label === 'wrong output stem') {
        const bytes = Buffer.from(`${JSON.stringify(session.packet, null, 2)}\n`, 'utf8');
        fs.writeFileSync(path.join(session.directory, 'WORKER-PACKET.json'), bytes);
        session.digest = crypto.createHash('sha256').update(bytes).digest('hex');
        artifact.packet_digest = session.digest;
      }
      fs.writeFileSync(path.join(session.directory, 'review-code.json'), JSON.stringify(artifact));
      const result = run(session, 'agents', 'review-code');
      assert.equal(result.status, 1, `${label}: ${result.stdout}`);
      assert.match(result.stdout + result.stderr, /packet|roster|agent|axis|session|head|range|output|stem/i, label);
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  }
});

test('review waiter rejects v4 finding trace IDs outside the packet trace', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  try {
    const traced = finding('engineering_standards', 'P2');
    traced.north_star_trace = {
      first_principles: ['FP-404'],
      serves: ['NS-404'],
      touches: ['HC-404'],
    };
    writeArtifact(session, 'review-code', 'engineering_standards', [traced]);
    const result = run(session, 'agents', 'review-code');
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /packet|resolv|trace|FP-404|NS-404|HC-404/i);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter binds diff_only, files_analyzed, and finding files to packet diff scope', async (t) => {
  const cases = [
    ['diff_only false', (artifact) => {
      artifact.scope.diff_only = false;
    }],
    ['files_analyzed outside scope', (artifact) => {
      artifact.scope.files_analyzed = ['src/outside.js'];
    }],
    ['absolute analyzed path', (artifact) => {
      artifact.scope.files_analyzed = ['/tmp/example.js'];
    }],
    ['finding outside scope', (artifact) => {
      const item = finding('engineering_standards', 'P2');
      item.file = 'src/outside.js';
      artifact.findings = [item];
    }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const session = tempSession([['review-code', 'engineering_standards']]);
      try {
        const artifact = specialist(session, 'review-code', 'engineering_standards');
        mutate(artifact);
        fs.writeFileSync(path.join(session.directory, 'review-code.json'), JSON.stringify(artifact));
        const result = run(session, 'agents', 'review-code');
        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        const output = JSON.parse(result.stdout);
        assert.match(output.errors['review-code'], /diff_only|files_analyzed|finding file|diff scope|path/i, label);
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('review waiter reports invalid UTF-8 specialist JSON as typed incomplete output', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  try {
    fs.writeFileSync(path.join(session.directory, 'review-code.json'), Buffer.from([0xff, 0xfe]));
    const result = run(session, 'agents', 'review-code');
    assert.equal(result.status, 1, result.stdout);
    assert.doesNotMatch(result.stderr, /Traceback/);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'incomplete');
    assert.deepEqual(output.artifacts_invalid, ['review-code']);
    assert.match(output.errors['review-code'], /UTF-8|JSON|unreadable/i);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter accepts only stable repository-contained regular specialist files', async (t) => {
  await t.test('symlink', () => {
    const session = tempSession([['review-code', 'engineering_standards']]);
    const external = path.join(session.root, 'external-review-code.json');
    try {
      fs.writeFileSync(
        external,
        `${JSON.stringify(specialist(session, 'review-code', 'engineering_standards'))}\n`,
      );
      fs.symlinkSync(external, path.join(session.directory, 'review-code.json'));
      const result = run(session, 'agents', 'review-code');
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.doesNotMatch(result.stderr, /Traceback/);
      const output = JSON.parse(result.stdout);
      assert.match(output.errors['review-code'], /regular|symlink|contained|stable/i);
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });

  await t.test('FIFO', () => {
    if (process.platform === 'win32') return;
    const session = tempSession([['review-code', 'engineering_standards']]);
    try {
      const fifo = path.join(session.directory, 'review-code.json');
      const made = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
      assert.equal(made.status, 0, made.stderr);
      const result = run(session, 'agents', 'review-code');
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.notEqual(result.signal, 'SIGTERM');
      assert.doesNotMatch(result.stderr, /Traceback/);
      const output = JSON.parse(result.stdout);
      assert.match(output.errors['review-code'], /regular|stable|file/i);
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });
});

test('review waiter requires strict RFC 3339 specialist timestamps', async (t) => {
  const invalid = [
    'not-an-iso-time',
    '2026-07-18T00:00:00',
    '2026-02-30T00:00:00Z',
    '2026-07-18T00:00:00+24:00',
  ];
  for (const timestamp of invalid) {
    await t.test(timestamp, () => {
      const session = tempSession([['review-code', 'engineering_standards']]);
      try {
        const artifact = specialist(session, 'review-code', 'engineering_standards');
        artifact.timestamp = timestamp;
        fs.writeFileSync(
          path.join(session.directory, 'review-code.json'),
          `${JSON.stringify(artifact)}\n`,
        );
        const result = run(session, 'agents', 'review-code');
        assert.equal(result.status, 1, `${timestamp}: ${result.stdout}`);
        const output = JSON.parse(result.stdout);
        assert.match(output.errors['review-code'], /timestamp|RFC 3339/i);
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('review waiter still rejects retired schemas, missing trace, and missing packet digest', () => {
  const cases = [
    ['retired schema', (artifact) => ({ ...artifact, $schema: 'ultra-review-findings-v1' }), /schema|v4/i],
    ['missing trace', (artifact) => {
      artifact.findings = [finding('engineering_standards', 'P2')];
      delete artifact.findings[0].north_star_trace;
      return artifact;
    }, /north_star_trace/i],
    ['missing digest', (artifact) => {
      delete artifact.packet_digest;
      return artifact;
    }, /packet_digest/i],
  ];
  for (const [label, mutate, pattern] of cases) {
    const session = tempSession([['review-code', 'engineering_standards']]);
    try {
      const artifact = mutate(specialist(session, 'review-code', 'engineering_standards'));
      fs.writeFileSync(path.join(session.directory, 'review-code.json'), JSON.stringify(artifact));
      const result = run(session, 'agents', 'review-code');
      assert.equal(result.status, 1, `${label}: ${result.stdout}`);
      assert.match(result.stdout, pattern, label);
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  }
});

test('review waiter preserves explicit read compatibility for immutable historical v3 artifacts', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  try {
    const artifact = specialist(session, 'review-code', 'engineering_standards');
    artifact.$schema = 'ultra-review-findings-v3';
    fs.writeFileSync(path.join(session.directory, 'review-code.json'), JSON.stringify(artifact));
    const current = run(session, 'agents', 'review-code');
    assert.equal(current.status, 1, current.stdout);
    assert.match(current.stdout, /v4|schema/i);

    fs.unlinkSync(path.join(session.directory, 'WORKER-PACKET.json'));
    const legacy = run(session, 'agents', '--legacy-v3', 'review-code');
    assert.equal(legacy.status, 0, legacy.stderr || legacy.stdout);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter summary revalidates completed specialists and accepts their exact ordered union', () => {
  const session = tempSession();
  try {
    assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), true);
    const artifacts = {
      'review-spec': writeArtifact(
        session,
        'review-spec',
        'spec_fidelity',
        [finding('spec_fidelity', 'P2', 'review-spec-001')],
      ),
      'review-code': writeArtifact(
        session,
        'review-code',
        'engineering_standards',
        [
          finding('engineering_standards', 'P1', 'review-code-001'),
          finding('engineering_standards', 'P2', 'review-code-002'),
        ],
      ),
    };
    writeSummary(session, summaryFor(session, artifacts));
    const result = run(session, 'summary');
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /REQUEST_CHANGES/);
    assert.match(result.stdout, /P1:1/);
    assert.match(result.stdout, /total:3/);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('strict v4 SUMMARY requires the exact admission and subject digests', async (t) => {
  const mutations = [
    ['missing admission digest', (summary) => { delete summary.admission_digest; }],
    ['different admission digest', (summary) => { summary.admission_digest = 'a'.repeat(64); }],
    ['missing subject digest', (summary) => { delete summary.subject_digest; }],
    ['different subject digest', (summary) => { summary.subject_digest = 'b'.repeat(64); }],
  ];

  for (const [label, mutate] of mutations) {
    await t.test(label, () => {
      const session = tempSession();
      try {
        const artifacts = {
          'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
          'review-code': writeArtifact(session, 'review-code', 'engineering_standards'),
        };
        const summary = summaryFor(session, artifacts);
        mutate(summary);
        writeSummary(session, summary);

        const result = run(session, 'summary');

        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        assert.match(result.stdout, /admission_digest|subject_digest|receipt|admission/i, label);
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('review waiter keeps a completed historical summary readable after task subjects advance', () => {
  const session = tempSession();
  try {
    assert.equal(fs.existsSync(path.join(session.directory, 'ADMISSION.json')), true);
    const artifacts = {
      'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
      'review-code': writeArtifact(session, 'review-code', 'engineering_standards'),
    };
    writeSummary(session, summaryFor(session, artifacts));
    fs.appendFileSync(session.subject.absoluteContext, '\n## Completion\n\n- Status: complete\n');
    fs.writeFileSync(session.subject.absoluteIntent, '# Archived Change\n', 'utf8');
    fs.writeFileSync(session.subject.northStarPath, '# Later North Star revision\n', 'utf8');
    const result = run(session, 'summary');
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).status, 'complete');
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('pre-admission v4 summaries require an explicit legacy-v4 read', () => {
  const session = tempSession(REVIEW_WORKERS.slice(0, 2), {
    admit: false,
    admissionContract: false,
  });
  try {
    const artifacts = {
      'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
      'review-code': writeArtifact(session, 'review-code', 'engineering_standards'),
    };
    writeSummary(session, summaryFor(session, artifacts));

    const strict = run(session, 'summary');
    assert.equal(strict.status, 1, strict.stdout);
    assert.match(strict.stdout, /ADMISSION|admission|receipt|packet mode/i);

    const historical = run(session, 'summary', '--legacy-v4');
    assert.equal(historical.status, 0, historical.stderr || historical.stdout);
    assert.equal(JSON.parse(historical.stdout).status, 'complete');
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter binds summary context provenance and requires an honest null worktree digest', async (t) => {
  const mutations = [
    ['context digest', (summary) => {
      summary.context_digest = 'c'.repeat(64);
    }],
    ['worktree digest', (summary) => {
      summary.worktree_digest = 'a'.repeat(64);
    }],
    ['missing worktree digest', (summary) => {
      delete summary.worktree_digest;
    }],
  ];

  for (const [label, mutate] of mutations) {
    await t.test(label, () => {
      const session = tempSession();
      try {
        const artifacts = {
          'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
          'review-code': writeArtifact(session, 'review-code', 'engineering_standards'),
        };
        const summary = summaryFor(session, artifacts);
        mutate(summary);
        writeSummary(session, summary);
        const result = run(session, 'summary');
        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        assert.match(result.stdout, /context_digest|worktree_digest|packet|provenance|null/i, label);
      } finally {
        fs.rmSync(session.root, { recursive: true, force: true });
      }
    });
  }
});

test('review waiter uses the canonical sorted context-list digest for multiple contexts', () => {
  const session = tempSession(REVIEW_WORKERS.slice(0, 2), { admit: false });
  try {
    session.packet.mode = 'change';
    const zBytes = Buffer.from('# Z context\n', 'utf8');
    const aBytes = Buffer.from('# A context\n', 'utf8');
    fs.writeFileSync(path.join(session.root, '.ultra/contexts/z-last.md'), zBytes);
    fs.writeFileSync(path.join(session.root, '.ultra/contexts/a-first.md'), aBytes);
    session.packet.context_files = [
      { path: '.ultra/contexts/z-last.md', sha256: sha256(zBytes) },
      { path: '.ultra/contexts/a-first.md', sha256: sha256(aBytes) },
    ];
    rewritePacket(session);
    const admitted = run(session, 'packet');
    assert.equal(admitted.status, 0, admitted.stderr || admitted.stdout);
    const artifacts = {
      'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
      'review-code': writeArtifact(session, 'review-code', 'engineering_standards'),
    };
    writeSummary(session, summaryFor(session, artifacts));
    const result = run(session, 'summary');
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter permits the exact empty axis evidence union only for INCOMPLETE', async (t) => {
  await t.test('spec-only packet', () => {
    const session = tempSession([['review-spec', 'spec_fidelity']]);
    try {
      const spec = writeArtifact(session, 'review-spec', 'spec_fidelity');
      const summary = summaryFor(session, { 'review-spec': spec });
      summary.axes.engineering_standards.verdict = 'INCOMPLETE';
      summary.axes.engineering_standards.evidence_refs = [];
      summary.verdict = 'INCOMPLETE';
      writeSummary(session, summary);
      const result = run(session, 'summary');
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, 'complete');
      assert.equal(output.verdict, 'INCOMPLETE');
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });

  await t.test('all selected engineering workers failed', () => {
    const session = tempSession();
    try {
      const spec = writeArtifact(session, 'review-spec', 'spec_fidelity');
      const absentCode = specialist(session, 'review-code', 'engineering_standards');
      const summary = summaryFor(session, {
        'review-spec': spec,
        'review-code': absentCode,
      });
      summary.workers.completed = ['review-spec'];
      summary.workers.failed = ['review-code'];
      summary.axes.engineering_standards = {
        verdict: 'INCOMPLETE',
        evidence_refs: [],
      };
      summary.verdict = 'INCOMPLETE';
      summary.findings = [];
      summary.coverage_refs = ['review-spec.json'];
      writeSummary(session, summary);
      const result = run(session, 'summary');
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, 'complete');
      assert.equal(output.verdict, 'INCOMPLETE');
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });

  await t.test('selected specification worker failed', () => {
    const session = tempSession();
    try {
      const absentSpec = specialist(session, 'review-spec', 'spec_fidelity');
      const code = writeArtifact(session, 'review-code', 'engineering_standards');
      const summary = summaryFor(session, {
        'review-spec': absentSpec,
        'review-code': code,
      });
      summary.workers.completed = ['review-code'];
      summary.workers.failed = ['review-spec'];
      summary.axes.spec_fidelity = { verdict: 'INCOMPLETE', evidence_refs: [] };
      summary.verdict = 'INCOMPLETE';
      summary.coverage_refs = ['review-code.json'];
      writeSummary(session, summary);
      const result = run(session, 'summary');
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, 'complete');
      assert.equal(output.verdict, 'INCOMPLETE');
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });

  await t.test('empty refs cannot claim PASS', () => {
    const session = tempSession([['review-spec', 'spec_fidelity']]);
    try {
      const spec = writeArtifact(session, 'review-spec', 'spec_fidelity');
      const summary = summaryFor(session, { 'review-spec': spec });
      summary.axes.engineering_standards = { verdict: 'PASS', evidence_refs: [] };
      writeSummary(session, summary);
      const result = run(session, 'summary');
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stdout, /INCOMPLETE|evidence_refs|axis|verdict/i);
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  });
});

test('review waiter accepts only a stable canonical regular SUMMARY file', () => {
  const session = tempSession();
  const external = path.join(session.root, 'external-summary.json');
  try {
    const artifacts = {
      'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
      'review-code': writeArtifact(session, 'review-code', 'engineering_standards'),
    };
    fs.writeFileSync(external, `${JSON.stringify(summaryFor(session, artifacts))}\n`);
    fs.symlinkSync(external, path.join(session.directory, 'SUMMARY.json'));
    const result = run(session, 'summary');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.doesNotMatch(result.stderr, /Traceback/);
    const output = JSON.parse(result.stdout);
    assert.match(output.error, /regular|symlink|contained|stable/i);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter validates one caller-owned SUMMARY byte snapshot and returns its digest', () => {
  const session = tempSession();
  try {
    const artifacts = {
      'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
      'review-code': writeArtifact(session, 'review-code', 'engineering_standards'),
    };
    const summaryBytes = Buffer.from(`${JSON.stringify(summaryFor(session, artifacts), null, 2)}\n`);
    const digest = sha256(summaryBytes);
    const result = runWithInput(
      session,
      'summary',
      summaryBytes,
      '--summary-snapshot-digest',
      digest,
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    assert.equal(output.summary_digest, digest);
    assert.equal(output.verdict, 'APPROVE');

    const mismatched = runWithInput(
      session,
      'summary',
      summaryBytes,
      '--summary-snapshot-digest',
      '0'.repeat(64),
    );
    assert.equal(mismatched.status, 1, mismatched.stdout);
    assert.match(mismatched.stdout, /snapshot|digest|bytes/i);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter reports invalid UTF-8 summary JSON as typed incomplete output', () => {
  const session = tempSession();
  try {
    writeArtifact(session, 'review-spec', 'spec_fidelity');
    writeArtifact(session, 'review-code', 'engineering_standards');
    fs.writeFileSync(path.join(session.directory, 'SUMMARY.json'), Buffer.from([0xff, 0xfe]));
    const result = run(session, 'summary');
    assert.equal(result.status, 1, result.stdout);
    assert.doesNotMatch(result.stderr, /Traceback/);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'incomplete');
    assert.match(output.error, /UTF-8|JSON|unreadable/i);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});

test('review waiter summary rejects omitted, mutated, and injected finding objects', () => {
  const mutations = [
    ['omitted', (summary) => {
      summary.findings = summary.findings.slice(0, -1);
      return summary;
    }],
    ['mutated', (summary) => {
      summary.findings[0] = { ...summary.findings[0], suggestion: 'Coordinator rewrite.' };
      return summary;
    }],
    ['injected', (summary) => {
      summary.findings.push(finding('engineering_standards', 'P2', 'summary-only-001'));
      return summary;
    }],
  ];
  for (const [label, mutate] of mutations) {
    const session = tempSession();
    try {
      const artifacts = {
        'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
        'review-code': writeArtifact(
          session,
          'review-code',
          'engineering_standards',
          [finding('engineering_standards', 'P1', 'review-code-001')],
        ),
      };
      writeSummary(session, mutate(summaryFor(session, artifacts)));
      const result = run(session, 'summary');
      assert.equal(result.status, 1, `${label}: ${result.stdout}`);
      assert.match(result.stdout, /finding|union|unchanged|specialist/i, label);
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  }
});

test('review waiter derives axis refs, axis verdicts, and overall verdict from packet-bound artifacts', () => {
  const mutations = [
    ['axis refs', (summary) => {
      summary.axes.engineering_standards.evidence_refs = ['made-up.json'];
    }],
    ['axis verdict', (summary) => {
      summary.axes.engineering_standards.verdict = 'PASS';
    }],
    ['overall verdict', (summary) => {
      summary.verdict = 'APPROVE';
    }],
    ['completed roster', (summary) => {
      summary.workers.completed = ['review-spec'];
      summary.workers.failed = ['review-code'];
    }],
    ['overlapping roster', (summary) => {
      summary.workers.failed = ['review-code'];
    }],
  ];
  for (const [label, mutate] of mutations) {
    const session = tempSession();
    try {
      const artifacts = {
        'review-spec': writeArtifact(session, 'review-spec', 'spec_fidelity'),
        'review-code': writeArtifact(
          session,
          'review-code',
          'engineering_standards',
          [finding('engineering_standards', 'P1', 'review-code-001')],
        ),
      };
      const summary = summaryFor(session, artifacts);
      mutate(summary);
      writeSummary(session, summary);
      const result = run(session, 'summary');
      assert.equal(result.status, 1, `${label}: ${result.stdout}`);
      assert.match(result.stdout, /axis|verdict|evidence|worker|roster|completed|specialist/i, label);
    } finally {
      fs.rmSync(session.root, { recursive: true, force: true });
    }
  }
});

test('review waiter rejects zero-finding artifacts without coverage or a limitation', () => {
  const session = tempSession([['review-code', 'engineering_standards']]);
  try {
    const artifact = specialist(session, 'review-code', 'engineering_standards');
    artifact.coverage_refs = [];
    fs.writeFileSync(path.join(session.directory, 'review-code.json'), JSON.stringify(artifact));
    const uncovered = run(session, 'agents', 'review-code');
    assert.equal(uncovered.status, 1);
    assert.match(uncovered.stdout, /zero findings|coverage|limitation/i);

    artifact.limitations = ['The generated source required to inspect this path is unavailable.'];
    fs.writeFileSync(path.join(session.directory, 'review-code.json'), JSON.stringify(artifact));
    const limited = run(session, 'agents', 'review-code');
    assert.equal(limited.status, 0, limited.stderr || limited.stdout);
  } finally {
    fs.rmSync(session.root, { recursive: true, force: true });
  }
});
