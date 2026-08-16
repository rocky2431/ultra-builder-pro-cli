'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const VALIDATOR = path.join(
  ROOT,
  'skills',
  'ultra-plan',
  'scripts',
  'validate_task_evidence.cjs',
);
const V027_IDS = [
  'v027-north-star-v2',
  'v027-task-acceptance-v2',
  'v027-autonomy-packet',
  'v027-adversarial-lifecycle',
  'v027-delegation-snapshot',
  'v027-host-adapters-hooks',
  'v027-doctor-provenance',
  'v027-migration-acceptance',
];
const DIMENSIONS = [
  'feature_flags_audit',
  'persistence_real',
  'spec_trace',
  'tests_passed',
  'tests_written',
  'vertical_slice',
];
const CONTEXT_HEADINGS = [
  'Context',
  'Implementation',
  'Planned Path Inventory',
  'Public Seams',
  'Narrow Verification',
  'Acceptance Criteria',
  'Definition of Drift',
  'Trace',
  'Change Log',
  'Open Questions',
  'Resume Note',
  'Completion',
  'Task Review',
];

function freshness() {
  return {
    git_head: 'a'.repeat(40),
    worktree_digest: 'b'.repeat(64),
    observed_at: '2026-08-15T13:00:05+08:00',
  };
}

function evidenceFor(verificationType) {
  if (verificationType === 'command') {
    return {
      command: 'node --test tests/example.test.cjs',
      cwd: '.',
      exit_code: 0,
      raw_evidence_ref: '.ultra/evidence/task-1/command.log',
      raw_evidence_sha256: 'f'.repeat(64),
      freshness_identity: freshness(),
    };
  }
  if (verificationType === 'inspection') {
    return {
      source: 'src/example.cjs',
      observation: 'The public entry point consumes the canonical record.',
      revision: 'a'.repeat(40),
    };
  }
  if (verificationType === 'owner-judgment') {
    return {
      owner_record_ref: '.ultra/changes/active/chg-1/intent.md#acceptance',
      owner_statement_or_disposition: 'Owner explicitly accepted this trade-off.',
    };
  }
  return {
    provider: 'zcode',
    run_id: 'run-123',
    observed_at: '2026-08-15T13:00:05+08:00',
    raw_evidence_ref: 'docs/evals/zcode-run.md',
    raw_evidence_sha256: '9'.repeat(64),
    observation: 'The provider returned the schema-bound terminal result.',
  };
}

function v2Record(verificationType, overrides = {}) {
  const authority = verificationType === 'owner-judgment' ? 'owner' : 'model';
  const dimensions = Object.fromEntries(DIMENSIONS.map((name) => [name, {
    status: 'satisfied',
    evidence_refs: ['tests/example.test.cjs'],
    rationale: `Observed ${name} through the named repository seam.`,
  }]));
  return {
    $schema: 'ultra-task-evidence-v2',
    task_id: 'task-1',
    change_id: 'chg-1',
    context: {
      path: '.ultra/contexts/task-task-1.md',
      acceptance_sha256: 'c'.repeat(64),
    },
    subject: freshness(),
    acceptance: [{
      criterion_id: 'A-01',
      verification_type: verificationType,
      evidence: evidenceFor(verificationType),
      disposition: {
        authority,
        result: 'satisfied',
        rationale: 'The named evidence supports this explicit disposition.',
      },
    }],
    dimensions,
    task_review: {
      execution_packet: {
        state: 'available',
        digest: 'd'.repeat(64),
        limitation: null,
      },
      session_id: 'task-1-final',
      summary_ref: '.ultra/reviews/task-1-final/SUMMARY.json',
      summary_digest: 'e'.repeat(64),
      blocking_findings: [],
      retention: (
        'Retain the exact strict review session, including WORKER-PACKET.json, ' +
        'ADMISSION.json, every selected specialist artifact, and SUMMARY.json, until ' +
        'aggregate Test and Deliver have both consumed it successfully. Premature loss ' +
        'requires a fresh Review and Test; never reconstruct the old receipt.'
      ),
    },
    artifacts: ['src/example.cjs'],
    limitations: [],
    timestamp: '2026-08-15T13:00:05+08:00',
    ...overrides,
  };
}

function validate(record) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-evidence-v2-'));
  try {
    const input = path.join(sandbox, 'evidence.json');
    fs.writeFileSync(input, `${JSON.stringify(record, null, 2)}\n`);
    const result = spawnSync(process.execPath, [VALIDATOR, input], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return {
      ...result,
      report: JSON.parse(result.stdout || result.stderr),
    };
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

function validatePath(input) {
  const result = spawnSync(process.execPath, [VALIDATOR, input], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return {
    ...result,
    report: JSON.parse(result.stdout || result.stderr),
  };
}

test('the repository and packaged skeleton use ledger/context/Test v2 authority', () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, '.ultra', 'tasks.json'), 'utf8'));
  const templateLedger = JSON.parse(fs.readFileSync(path.join(ROOT, '.ultra-template', 'tasks.json'), 'utf8'));
  assert.deepEqual(Object.keys(ledger), ['$schema', 'tasks']);
  assert.equal(ledger.$schema, 'ultra-task-ledger-v2');
  assert.deepEqual(templateLedger, { $schema: 'ultra-task-ledger-v2', tasks: [] });

  const v026 = ledger.tasks.filter((task) => task.id.startsWith('v026-'));
  assert.equal(v026.length, 6);
  assert.ok(v026.every((task) => Number.isInteger(task.complexity)), 'legacy rows retain complexity');
  for (const id of V027_IDS) {
    const task = ledger.tasks.find((item) => item.id === id);
    assert.ok(task, id);
    assert.deepEqual(Object.keys(task), [
      'id', 'title', 'type', 'priority', 'status', 'dependencies',
      'context_file', 'trace_to', 'change_id',
    ]);
    const context = fs.readFileSync(path.join(ROOT, task.context_file), 'utf8');
    assert.deepEqual(
      [...context.matchAll(/^## ([^#].*)$/gm)].map((match) => match[1]),
      CONTEXT_HEADINGS,
      `${id}: exact v2 context headings`,
    );
    assert.doesNotMatch(context, /^> \*\*(?:Status|Priority|Complexity)\*\*/m, id);
    assert.match(
      context,
      /^\| ID \| Criterion \| Verification type \| Required evidence \|$/m,
      id,
    );
    assert.doesNotMatch(context, /^- \*\*Commit\*\*:/m, `${id}: completion must not require a commit`);
  }

  const templateContext = fs.readFileSync(
    path.join(ROOT, '.ultra-template', 'contexts', 'TEMPLATE.md'),
    'utf8',
  );
  assert.deepEqual(
    [...templateContext.matchAll(/^## ([^#].*)$/gm)].map((match) => match[1]),
    CONTEXT_HEADINGS,
    'template: exact v2 context headings',
  );
  assert.doesNotMatch(templateContext, /^> \*\*(?:Status|Priority|Complexity)\*\*/m);
  assert.match(
    templateContext,
    /^\| ID \| Criterion \| Verification type \| Required evidence \|$/m,
  );
  assert.doesNotMatch(templateContext, /^- \*\*Commit\*\*:/m);

  const testTemplate = JSON.parse(fs.readFileSync(
    path.join(ROOT, '.ultra-template', 'test-report.json'),
    'utf8',
  ));
  assert.equal(testTemplate.$schema, 'ultra-test-report-v2');
  assert.ok(Array.isArray(testTemplate.task_evidence));
  assert.deepEqual(testTemplate.task_evidence, []);
  assert.ok(
    Object.keys(testTemplate).indexOf('task_evidence')
      > Object.keys(testTemplate).indexOf('task_ids'),
    'ordered task evidence follows the ordered task ids',
  );
});

for (const verificationType of [
  'command',
  'inspection',
  'owner-judgment',
  'external-observation',
]) {
  test(`task evidence v2 validates ${verificationType} through the public CLI`, () => {
    const result = validate(v2Record(verificationType));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.valid, true);
    assert.equal(result.report.classification, 'current-v2');
    assert.equal(Object.hasOwn(result.report, 'passed'), false);
  });
}

test('task evidence v2 rejects a reordered canonical root', () => {
  const record = v2Record('command');
  const entries = Object.entries(record);
  const reordered = Object.fromEntries([
    entries[1],
    entries[0],
    ...entries.slice(2),
  ]);
  assert.deepEqual(
    Object.keys(reordered).sort(),
    Object.keys(record).sort(),
    'mutation preserves the exact root-key set',
  );

  const result = validate(reordered);
  assert.equal(result.status, 1);
  assert.equal(result.report.valid, false);
  assert.ok(
    result.report.diagnostics.some(
      (item) => item.code === 'root_shape' && item.at === '$',
    ),
  );
});

for (const mutation of [
  {
    label: 'unrelated context',
    diagnostic: 'context_identity',
    mutate(record) {
      record.context.path = '.ultra/contexts/task-unrelated.md';
    },
  },
  {
    label: 'context traversal',
    diagnostic: 'context_identity',
    mutate(record) {
      record.context.path = '.ultra/contexts/../contexts/task-task-1.md';
    },
  },
  {
    label: 'absolute context',
    diagnostic: 'context_identity',
    mutate(record) {
      record.context.path = '/tmp/task-task-1.md';
    },
  },
  {
    label: 'context backslash',
    diagnostic: 'context_identity',
    mutate(record) {
      record.context.path = '.ultra\\contexts\\task-task-1.md';
    },
  },
  {
    label: 'context dot segment',
    diagnostic: 'context_identity',
    mutate(record) {
      record.context.path = '.ultra/contexts/./task-task-1.md';
    },
  },
  {
    label: 'review session mismatch',
    diagnostic: 'review_summary_identity',
    mutate(record) {
      record.task_review.summary_ref = '.ultra/reviews/unrelated/SUMMARY.json';
    },
  },
  {
    label: 'review summary traversal',
    diagnostic: 'review_summary_identity',
    mutate(record) {
      record.task_review.summary_ref = '.ultra/reviews/../task-1-final/SUMMARY.json';
    },
  },
  {
    label: 'absolute review summary',
    diagnostic: 'review_summary_identity',
    mutate(record) {
      record.task_review.summary_ref = '/tmp/task-1-final/SUMMARY.json';
    },
  },
  {
    label: 'review summary backslash',
    diagnostic: 'review_summary_identity',
    mutate(record) {
      record.task_review.summary_ref = '.ultra\\reviews\\task-1-final\\SUMMARY.json';
    },
  },
  {
    label: 'review summary dot segment',
    diagnostic: 'review_summary_identity',
    mutate(record) {
      record.task_review.summary_ref = '.ultra/reviews/./task-1-final/SUMMARY.json';
    },
  },
]) {
  test(`task evidence rejects ${mutation.label} identity`, () => {
    const record = v2Record('command');
    mutation.mutate(record);
    const result = validate(record);
    assert.equal(result.status, 1, mutation.label);
    assert.equal(result.report.valid, false, mutation.label);
    assert.match(
      result.report.diagnostics.map((item) => item.code).join('\n'),
      new RegExp(mutation.diagnostic),
      mutation.label,
    );
  });
}

for (const mutation of [
  {
    label: 'traversal task id',
    at: 'task_id',
    mutate(record) {
      record.task_id = '../task-1';
      record.context.path = '.ultra/contexts/task-../task-1.md';
    },
  },
  {
    label: 'absolute change id',
    at: 'change_id',
    mutate(record) {
      record.change_id = '/chg-1';
    },
  },
  {
    label: 'backslash review session id',
    at: 'task_review.session_id',
    mutate(record) {
      record.task_review.session_id = 'task\\final';
      record.task_review.summary_ref = '.ultra/reviews/task\\final/SUMMARY.json';
    },
  },
]) {
  test(`task evidence rejects ${mutation.label}`, () => {
    const record = v2Record('command');
    mutation.mutate(record);
    const result = validate(record);
    assert.equal(result.status, 1, mutation.label);
    assert.equal(result.report.valid, false, mutation.label);
    assert.ok(
      result.report.diagnostics.some(
        (item) => item.code === 'identity_shape' && item.at === mutation.at,
      ),
      mutation.label,
    );
  });
}

test('typed evidence objects reject a shape borrowed from another verification type', () => {
  for (const verificationType of [
    'command',
    'inspection',
    'owner-judgment',
    'external-observation',
  ]) {
    const record = v2Record(verificationType);
    record.acceptance[0].evidence = evidenceFor(
      verificationType === 'command' ? 'inspection' : 'command',
    );
    const result = validate(record);
    assert.equal(result.status, 1, verificationType);
    assert.equal(result.report.valid, false, verificationType);
    assert.match(
      result.report.diagnostics.map((item) => item.code).join('\n'),
      /evidence_shape/,
      verificationType,
    );
  }
});

for (const verificationType of ['command', 'external-observation']) {
  test(`${verificationType} evidence requires an exact raw receipt SHA-256`, () => {
    const missing = v2Record(verificationType);
    delete missing.acceptance[0].evidence.raw_evidence_sha256;
    const missingResult = validate(missing);
    assert.equal(missingResult.status, 1);
    assert.match(
      missingResult.report.diagnostics.map((item) => item.code).join('\n'),
      /evidence_shape/u,
    );

    for (const invalid of ['f'.repeat(63), 'F'.repeat(64), 'not-a-digest']) {
      const record = v2Record(verificationType);
      record.acceptance[0].evidence.raw_evidence_sha256 = invalid;
      const result = validate(record);
      assert.equal(result.status, 1, invalid);
      assert.match(
        result.report.diagnostics.map((item) => item.code).join('\n'),
        /evidence_shape/u,
        invalid,
      );
    }
  });

  test(`${verificationType} evidence requires a safe repository-relative raw receipt ref`, () => {
    for (const unsafe of [
      '../receipt.log',
      '/tmp/receipt.log',
      'C:/temp/receipt.log',
      '.ultra/evidence/./receipt.log',
      '.ultra\\evidence\\receipt.log',
      '.ultra/evidence/receipt.log/',
    ]) {
      const record = v2Record(verificationType);
      record.acceptance[0].evidence.raw_evidence_ref = unsafe;
      const result = validate(record);
      assert.equal(result.status, 1, unsafe);
      assert.ok(
        result.report.diagnostics.some(
          (item) => item.code === 'evidence_ref_shape'
            && item.at === 'acceptance[0].evidence.raw_evidence_ref',
        ),
        unsafe,
      );
    }
  });
}

test('owner-judgment structural sensor requires the owner authority token and nonempty record fields', () => {
  const shapeOnly = v2Record('owner-judgment');
  shapeOnly.acceptance[0].evidence.owner_record_ref = (
    '.ultra/changes/active/not-present/intent.md#acceptance'
  );
  const shapeOnlyResult = validate(shapeOnly);
  assert.equal(shapeOnlyResult.status, 0, shapeOnlyResult.stderr);
  assert.equal(shapeOnlyResult.report.valid, true);
  assert.equal(shapeOnlyResult.report.classification, 'current-v2');

  const modelDisposition = v2Record('owner-judgment');
  modelDisposition.acceptance[0].disposition.authority = 'model';
  const modelResult = validate(modelDisposition);
  assert.equal(modelResult.status, 1);
  assert.equal(modelResult.report.valid, false);
  assert.match(
    modelResult.report.diagnostics.map((item) => item.code).join('\n'),
    /owner_authority_required/,
  );

  for (const field of ['owner_record_ref', 'owner_statement_or_disposition']) {
    const emptyField = v2Record('owner-judgment');
    emptyField.acceptance[0].evidence[field] = '';
    const emptyResult = validate(emptyField);
    assert.equal(emptyResult.status, 1, field);
    assert.match(
      emptyResult.report.diagnostics.map((item) => item.code).join('\n'),
      /evidence_shape/,
      field,
    );
  }
});

test('the validator observes explicit dispositions and never infers semantic pass', () => {
  const record = v2Record('command');
  record.acceptance[0].disposition.result = 'gap';
  const result = validate(record);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.valid, true);
  assert.equal(Object.hasOwn(result.report, 'passed'), false);
  assert.equal(Object.hasOwn(result.report, 'result'), false);
});

test('freshness and external observations require real RFC 3339 timestamps', () => {
  const impossibleSubject = v2Record('command');
  impossibleSubject.subject.observed_at = '2026-02-30T00:00:00Z';
  const subjectResult = validate(impossibleSubject);
  assert.equal(subjectResult.status, 1);
  assert.match(
    subjectResult.report.diagnostics.map((item) => item.code).join('\n'),
    /freshness_shape/,
  );

  const impossibleExternal = v2Record('external-observation');
  impossibleExternal.acceptance[0].evidence.observed_at = '2026-02-30T00:00:00Z';
  const externalResult = validate(impossibleExternal);
  assert.equal(externalResult.status, 1);
  assert.match(
    externalResult.report.diagnostics.map((item) => item.code).join('\n'),
    /evidence_shape/,
  );
});

test('bootstrap evidence requires an honest pre-v1 packet limitation', () => {
  const record = v2Record('inspection');
  record.task_review.execution_packet = {
    state: 'pre-v1-unavailable',
    digest: null,
    limitation: 'Execution Packet v1 did not exist when this bootstrap task began.',
  };
  const accepted = validate(record);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(accepted.report.valid, true);

  record.task_review.execution_packet.limitation = '';
  const rejected = validate(record);
  assert.equal(rejected.status, 1);
  assert.match(
    rejected.report.diagnostics.map((item) => item.code).join('\n'),
    /bootstrap_packet_limitation/,
  );
});

test('legacy v1 evidence remains classifiable without becoming current v2', () => {
  const result = validate({
    $schema: 'ultra-task-evidence-v1',
    task_id: 'legacy-task',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.valid, true);
  assert.equal(result.report.classification, 'legacy-v1');
  assert.match(
    result.report.diagnostics.map((item) => item.code).join('\n'),
    /legacy_evidence_v1/,
  );
});

test('the validator reads one bounded regular non-symlink byte snapshot', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-evidence-input-'));
  try {
    const valid = path.join(sandbox, 'valid.json');
    fs.writeFileSync(valid, `${JSON.stringify(v2Record('command'))}\n`);

    const symlink = path.join(sandbox, 'symlink.json');
    fs.symlinkSync(valid, symlink);
    const symlinkResult = validatePath(symlink);
    assert.equal(symlinkResult.status, 1);
    assert.equal(symlinkResult.report.diagnostics[0].code, 'input_symlink');

    const directoryResult = validatePath(sandbox);
    assert.equal(directoryResult.status, 1);
    assert.equal(directoryResult.report.diagnostics[0].code, 'input_not_regular');

    const oversized = path.join(sandbox, 'oversized.json');
    fs.writeFileSync(oversized, Buffer.alloc((8 * 1024 * 1024) + 1, 0x20));
    const oversizedResult = validatePath(oversized);
    assert.equal(oversizedResult.status, 1);
    assert.equal(oversizedResult.report.diagnostics[0].code, 'input_too_large');

    const invalidUtf8 = path.join(sandbox, 'invalid-utf8.json');
    fs.writeFileSync(invalidUtf8, Buffer.from([0x7b, 0xff, 0x7d]));
    const invalidUtf8Result = validatePath(invalidUtf8);
    assert.equal(invalidUtf8Result.status, 1);
    assert.equal(invalidUtf8Result.report.diagnostics[0].code, 'input_invalid_utf8');

    const invalidJson = path.join(sandbox, 'invalid-json.json');
    fs.writeFileSync(invalidJson, '{"unterminated":');
    const invalidJsonResult = validatePath(invalidJson);
    assert.equal(invalidJsonResult.status, 1);
    assert.equal(invalidJsonResult.report.diagnostics[0].code, 'input_invalid_json');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('task review retention stays exact through aggregate Test and Deliver', () => {
  const expected = (
    'Retain the exact strict review session, including WORKER-PACKET.json, ' +
    'ADMISSION.json, every selected specialist artifact, and SUMMARY.json, until ' +
    'aggregate Test and Deliver have both consumed it successfully. Premature loss ' +
    'requires a fresh Review and Test; never reconstruct the old receipt.'
  );
  const evidencePath = path.join(
    ROOT,
    '.ultra',
    'evidence',
    'v027-north-star-v2',
    'evidence.json',
  );
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

  assert.deepEqual({
    fixture: v2Record('command').task_review.retention,
    migrated: evidence.task_review.retention,
  }, {
    fixture: expected,
    migrated: expected,
  });
});

test('the migrated Phase 1 evidence binds only its Acceptance section and strict review', () => {
  const evidencePath = path.join(
    ROOT,
    '.ultra',
    'evidence',
    'v027-north-star-v2',
    'evidence.json',
  );
  const result = spawnSync(process.execPath, [VALIDATOR, evidencePath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.valid, true);
  assert.equal(report.classification, 'current-v2');

  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.deepEqual(Object.keys(evidence.context), ['path', 'acceptance_sha256']);
  assert.deepEqual(Object.keys(evidence.task_review.execution_packet), [
    'state', 'digest', 'limitation',
  ]);
  assert.equal(evidence.task_review.execution_packet.state, 'pre-v1-unavailable');
  assert.equal(evidence.task_review.execution_packet.digest, null);
});

// ---------------------------------------------------------------------------
// v0.27 H0 — blocking dispositions bind only current P0/P1 (HL-03)
// ---------------------------------------------------------------------------

test('blocking dispositions bind only current P0/P1 while P2/P3 stay recorded but non-blocking', () => {
  const contract = fs.readFileSync(
    path.join(ROOT, 'skills', 'ultra-plan', 'references', 'task-evidence-v2.md'),
    'utf8',
  );
  const schema = fs.readFileSync(
    path.join(ROOT, 'skills', 'ultra-review', 'references', 'unified-schema.md'),
    'utf8',
  );

  assert.match(
    contract,
    /blocking[\s\S]{0,200}(?:only|exactly)[\s\S]{0,80}(?:current )?P0\/P1/iu,
    'task-evidence: blocking set is P0/P1-only',
  );
  assert.match(
    contract,
    /P2[\s\S]{0,120}(?:and|\/) P3[\s\S]{0,200}(?:not block|non-?blocking|never block)/iu,
    'task-evidence: P2/P3 never block closeout',
  );
  assert.match(
    schema,
    /P2[\s\S]{0,220}(?:backlog|owner-selected|report)/iu,
    'schema: P2 route is report/backlog, not repair',
  );
  // No implicit in-task promotion of P2/P3 to blockers.
  assert.doesNotMatch(
    `${contract}\n${schema}`,
    /P2[\s\S]{0,80}(?:is|are|as) block(?:ing|er)/iu,
  );
});

// ---------------------------------------------------------------------------
// v0.27 H0 Phase A — external-manual task-review provenance branch (repaired)
// ---------------------------------------------------------------------------

const crypto = require('node:crypto');

function sha256OfText(value) {
  return crypto.createHash('sha256')
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest('hex');
}

function sha256OfBytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function baseReceipt() {
  return {
    $schema: 'ultra-external-review-receipt-v1',
    reviewer: 'Codex root',
    reviewer_role: 'read-only',
    task_id: 'task-1',
    change_id: 'chg-1',
    reviewer_authority: {
      ref: '.ultra/decisions/external-review-authority.json',
      sha256: null,
    },
    reviewed_contract: {
      ref: 'docs/ACCEPTED-CONTRACT.md',
      sha256: null,
    },
    subject: {
      git_head: 'a'.repeat(40),
      worktree_digest: 'b'.repeat(64),
    },
    verdict: 'request_changes',
    findings: [
      { id: 'ext-001', severity: 'P1', title: 'Blocking defect observed by the external reviewer' },
      { id: 'ext-002', severity: 'P2', title: 'Non-blocking observation retained for the owner' },
    ],
    timestamp: '2026-08-16T15:00:00+08:00',
  };
}

function externalManualTaskReview(receiptBytes, receipt) {
  return {
    review_mode: 'external-manual',
    execution_packet: {
      state: 'pre-v1-unavailable',
      digest: null,
      limitation: 'No Execution Packet exists; the task ran under a one-time bootstrap grant.',
    },
    receipt_ref: '.ultra/evidence/task-1/external-review.json',
    receipt_sha256: sha256OfBytes(receiptBytes),
    blocking_findings: receipt.verdict === 'request_changes'
      ? [{
        id: 'ext-001',
        resolution: 'Repaired the exact blocking defect named by the external review.',
        disposition: 'resolved',
        evidence_refresh_refs: ['.ultra/evidence/task-1/verification.log'],
      }]
      : [],
    retention: (
      'Retain the exact external-manual receipt bytes bound above; it is a ' +
      'reconstructable observation, never semantic authority and never a strict ' +
      'SUMMARY/ADMISSION substitute.'
    ),
  };
}

function buildExternalFixture(options = {}) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-evidence-ext-'));
  let externalDir = null;
  const contractBytes = Buffer.from('# Accepted contract\n\nReal reviewed bytes.\n', 'utf8');
  const authorityBytes = Buffer.from(
    JSON.stringify({
      $schema: 'ultra-external-review-authority-v1',
      statement: 'The owner designated this reviewer for external-manual review.',
    }, null, 2) + '\n',
    'utf8',
  );
  fs.mkdirSync(path.join(sandbox, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(sandbox, 'docs', 'ACCEPTED-CONTRACT.md'), contractBytes);
  fs.mkdirSync(path.join(sandbox, '.ultra', 'decisions'), { recursive: true });
  fs.writeFileSync(
    path.join(sandbox, '.ultra', 'decisions', 'external-review-authority.json'),
    authorityBytes,
  );

  const receipt = baseReceipt();
  if (options.receiptOverrides) Object.assign(receipt, options.receiptOverrides);
  if (receipt.reviewed_contract.sha256 === null) {
    receipt.reviewed_contract.sha256 = options.contractDigest ?? sha256OfBytes(contractBytes);
  }
  if (receipt.reviewer_authority.sha256 === null) {
    receipt.reviewer_authority.sha256 = options.authorityDigest ?? sha256OfBytes(authorityBytes);
  }
  const receiptBytes = options.receiptBytes
    ?? Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  const record = v2Record('command', { task_review: externalManualTaskReview(receiptBytes, receipt) });
  const evidenceFile = path.join(sandbox, 'evidence.json');
  fs.writeFileSync(evidenceFile, `${JSON.stringify(record, null, 2)}\n`);

  if (options.symlinkReceiptParent) {
    externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-ext-receipt-'));
    fs.writeFileSync(
      path.join(externalDir, 'external-review.json'),
      options.receiptBytes ?? Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8'),
    );
    fs.mkdirSync(path.join(sandbox, '.ultra', 'evidence'), { recursive: true });
    fs.rmSync(path.join(sandbox, '.ultra', 'evidence', 'task-1'), {
      recursive: true, force: true,
    });
    fs.symlinkSync(externalDir, path.join(sandbox, '.ultra', 'evidence', 'task-1'));
  } else if (!options.omitReceipt) {
    const receiptDir = path.join(sandbox, '.ultra', 'evidence', 'task-1');
    fs.mkdirSync(receiptDir, { recursive: true });
    fs.writeFileSync(path.join(receiptDir, 'external-review.json'), receiptBytes);
  }
  if (options.receiptIsFifo) {
    const receiptDir = path.join(sandbox, '.ultra', 'evidence', 'task-1');
    fs.mkdirSync(receiptDir, { recursive: true });
    fs.rmSync(path.join(receiptDir, 'external-review.json'), { force: true });
    fs.mkFifoSync?.(path.join(receiptDir, 'external-review.json'));
  }
  if (options.omitContract) fs.rmSync(path.join(sandbox, 'docs', 'ACCEPTED-CONTRACT.md'));
  if (options.omitAuthority) {
    fs.rmSync(path.join(sandbox, '.ultra', 'decisions', 'external-review-authority.json'));
  }
  return { sandbox, evidenceFile, record, receipt, externalDir };
}

function runSensor(evidenceFile, ...args) {
  const result = spawnSync(process.execPath, [VALIDATOR, evidenceFile, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { ...result, report: JSON.parse(result.stdout || result.stderr || '{}') };
}

function withFixture(options, run) {
  const fixture = buildExternalFixture(options);
  let outcome;
  try {
    outcome = run(fixture);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
    if (fixture.externalDir) {
      fs.rmSync(fixture.externalDir, { recursive: true, force: true });
    }
  }
  return outcome;
}

test('external-manual provenance verifies by default and accepts only fully bound receipts', () => {
  withFixture({}, (fixture) => {
    const standard = runSensor(fixture.evidenceFile);
    assert.equal(standard.status, 0, standard.stdout);
    assert.equal(standard.report.valid, true);
    const alias = runSensor(fixture.evidenceFile, '--verify-external-receipt');
    assert.equal(alias.status, 0, alias.stdout);
    assert.equal(alias.report.valid, true);
  });
});

test('the default invocation rejects an external-manual record whose receipt is missing', () => {
  withFixture({ omitReceipt: true }, (fixture) => {
    const result = runSensor(fixture.evidenceFile);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(result.report.valid, false);
    assert.match(
      JSON.stringify(result.report.diagnostics),
      /receipt.*(?:missing|could not)|(?:missing|could not).*receipt/i,
    );
  });
});

test('reviewed product bytes are bound: worktree digest must equal the evidence subject', () => {
  withFixture({
    receiptOverrides: {
      subject: { git_head: 'a'.repeat(40), worktree_digest: '2'.repeat(64) },
    },
  }, (fixture) => {
    const result = runSensor(fixture.evidenceFile);
    assert.equal(result.status, 1, result.stdout);
    assert.match(
      JSON.stringify(result.report.diagnostics),
      /worktree_digest|subject/i,
    );
  });
});

test('reviewed contract and reviewer authority must be real bound repository bytes', async (t) => {
  await t.test('contract file missing', () => {
    withFixture({ omitContract: true }, (fixture) => {
      const result = runSensor(fixture.evidenceFile);
      assert.equal(result.status, 1);
      assert.match(JSON.stringify(result.report.diagnostics), /contract/i);
    });
  });
  await t.test('contract digest drifted from the real bytes', () => {
    withFixture({ contractDigest: '0'.repeat(64) }, (fixture) => {
      const result = runSensor(fixture.evidenceFile);
      assert.equal(result.status, 1);
      assert.match(JSON.stringify(result.report.diagnostics), /contract.*digest|digest.*contract/i);
    });
  });
  await t.test('authority record missing', () => {
    withFixture({ omitAuthority: true }, (fixture) => {
      const result = runSensor(fixture.evidenceFile);
      assert.equal(result.status, 1);
      assert.match(JSON.stringify(result.report.diagnostics), /authority/i);
    });
  });
  await t.test('authority ref escapes the repository', () => {
    withFixture({
      receiptOverrides: {
        reviewer_authority: { ref: '../outside/authority.json', sha256: '1'.repeat(64) },
      },
    }, (fixture) => {
      const result = runSensor(fixture.evidenceFile);
      assert.equal(result.status, 1);
      assert.match(JSON.stringify(result.report.diagnostics), /authority.*(?:ref|repositor)|(?:ref|repositor).*authority/i);
    });
  });
});

test('managed ancestor symlinks are not followed for bound review bytes', () => {
  withFixture({ symlinkReceiptParent: true }, (fixture) => {
    const result = runSensor(fixture.evidenceFile);
    assert.equal(result.status, 1, result.stdout);
    assert.match(JSON.stringify(result.report.diagnostics), /symlink|ordinary|non-symlink/i);
  });
});

test('the blocking disposition set must equal exactly the receipt P0/P1 findings', async (t) => {
  await t.test('approve verdict with a P1 finding and empty blocking set', () => {
    withFixture({
      receiptOverrides: { verdict: 'approve' },
    }, (fixture) => {
      const result = runSensor(fixture.evidenceFile);
      assert.equal(result.status, 1, result.stdout);
      assert.match(JSON.stringify(result.report.diagnostics), /verdict|blocking/i);
    });
  });
  await t.test('blocking disposition naming an id absent from the receipt', () => {
    withFixture({}, (fixture) => {
      const record = JSON.parse(fs.readFileSync(fixture.evidenceFile, 'utf8'));
      record.task_review.blocking_findings[0].id = 'ext-404';
      fs.writeFileSync(fixture.evidenceFile, `${JSON.stringify(record, null, 2)}\n`);
      const result = runSensor(fixture.evidenceFile);
      assert.equal(result.status, 1);
      assert.match(JSON.stringify(result.report.diagnostics), /blocking/i);
    });
  });
  await t.test('request_changes verdict with no P0/P1 finding at all', () => {
    withFixture({
      receiptOverrides: {
        findings: [{ id: 'ext-002', severity: 'P2', title: 'Only non-blocking findings' }],
      },
    }, (fixture) => {
      const record = JSON.parse(fs.readFileSync(fixture.evidenceFile, 'utf8'));
      record.task_review.blocking_findings = [];
      fs.writeFileSync(fixture.evidenceFile, `${JSON.stringify(record, null, 2)}\n`);
      const result = runSensor(fixture.evidenceFile);
      assert.equal(result.status, 1);
      assert.match(JSON.stringify(result.report.diagnostics), /verdict|blocking/i);
    });
  });
  await t.test('approve with only non-blocking findings and empty blocking set is valid', () => {
    withFixture({
      receiptOverrides: {
        verdict: 'approve',
        findings: [{ id: 'ext-002', severity: 'P2', title: 'Non-blocking only' }],
      },
    }, (fixture) => {
      const result = runSensor(fixture.evidenceFile);
      assert.equal(result.status, 0, result.stdout);
      assert.equal(result.report.valid, true);
    });
  });
});

test('a strict SUMMARY file substituted as the receipt is rejected', () => {
  withFixture({
    receiptBytes: Buffer.from(`${JSON.stringify({
      $schema: 'ultra-review-summary-v4',
      session: 'task-1-final',
      verdict: 'APPROVE',
      findings: [],
    }, null, 2)}\n`, 'utf8'),
  }, (fixture) => {
    const result = runSensor(fixture.evidenceFile);
    assert.equal(result.status, 1);
    assert.match(JSON.stringify(result.report.diagnostics), /schema|receipt/i);
  });
});

test('verify mode still refuses a strict-v4 evidence branch', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-evidence-strict-'));
  try {
    const evidenceFile = path.join(sandbox, 'evidence.json');
    fs.writeFileSync(evidenceFile, `${JSON.stringify(v2Record('command'), null, 2)}\n`);
    const result = runSensor(evidenceFile, '--verify-external-receipt');
    assert.equal(result.status, 1);
    assert.match(JSON.stringify(result.report.diagnostics), /strict-v4|branch|unsupported/i);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('the sensor emits the exact branch-specific aggregate projection', async (t) => {
  await t.test('strict-v4 projection keeps its byte-compatible shape', () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-evidence-strict-'));
    try {
      const evidenceFile = path.join(sandbox, 'evidence.json');
      fs.writeFileSync(evidenceFile, `${JSON.stringify(v2Record('command'), null, 2)}\n`);
      const result = runSensor(evidenceFile, '--projection');
      assert.equal(result.status, 0, result.stdout);
      assert.equal(result.report.valid, true);
      const projection = result.report.projection;
      assert.deepEqual(Object.keys(projection).sort(), [
        'evidence_digest', 'evidence_ref', 'schema', 'task_id',
        'task_review_session', 'task_review_summary_digest',
      ]);
      assert.equal(projection.schema, 'ultra-task-evidence-v2');
      assert.equal(projection.task_review_session, 'task-1-final');
      assert.match(projection.evidence_digest, /^[0-9a-f]{64}$/);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  await t.test('external-manual projection carries receipt identity, never session fields', () => {
    withFixture({}, (fixture) => {
      const result = runSensor(fixture.evidenceFile, '--projection');
      assert.equal(result.status, 0, result.stdout);
      const projection = result.report.projection;
      assert.deepEqual(Object.keys(projection).sort(), [
        'evidence_digest', 'evidence_ref', 'schema', 'task_id',
        'task_review_mode', 'task_review_receipt_digest', 'task_review_receipt_ref',
      ]);
      assert.equal(projection.task_review_mode, 'external-manual');
      assert.equal(projection.task_review_receipt_ref, '.ultra/evidence/task-1/external-review.json');
      assert.match(projection.task_review_receipt_digest, /^[0-9a-f]{64}$/);
      assert.ok(!('task_review_session' in projection));
      assert.ok(!('task_review_summary_digest' in projection));
    });
  });

  await t.test('projection is withheld when verification fails', () => {
    withFixture({ omitReceipt: true }, (fixture) => {
      const result = runSensor(fixture.evidenceFile, '--projection');
      assert.equal(result.status, 1);
      assert.equal(result.report.projection, undefined);
    });
  });
});
