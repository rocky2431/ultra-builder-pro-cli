'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'skills', 'ultra-review', 'scripts', 'review_wait.py');

function tempSession() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-review-wait-'));
}

function run(session, ...args) {
  return spawnSync('python3', [SCRIPT, session, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      UBP_REVIEW_WAIT_TIMEOUT: '0.05',
      UBP_REVIEW_WAIT_POLL: '0.01',
    },
  });
}

function specialist(agent, axis) {
  return {
    $schema: 'ultra-review-findings-v2',
    agent,
    axis,
    session: 'review-session',
    timestamp: '2026-07-18T00:00:00Z',
    scope: {
      head: '0123456789abcdef',
      range: 'HEAD~1..HEAD',
      files_analyzed: ['src/example.js'],
      diff_only: true,
    },
    status: 'complete',
    findings: [],
    positive_observations: [],
    limitations: [],
  };
}

function finding(axis, severity) {
  return {
    id: `${axis}-${severity}`,
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
  };
}

test('review waiter validates named v2 specialist artifacts including spec fidelity', () => {
  const session = tempSession();
  try {
    fs.writeFileSync(path.join(session, 'spec-fidelity.json'), JSON.stringify(specialist('review-spec', 'spec_fidelity')));
    fs.writeFileSync(path.join(session, 'review-code.json'), JSON.stringify(specialist('review-code', 'engineering_standards')));
    const result = run(session, 'agents', 'spec-fidelity', 'review-code');
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'complete');
    assert.deepEqual(output.artifacts_done, ['spec-fidelity', 'review-code']);
    assert.deepEqual(output.artifacts_invalid, []);
  } finally {
    fs.rmSync(session, { recursive: true, force: true });
  }
});

test('review waiter rejects a present artifact using the retired schema', () => {
  const session = tempSession();
  try {
    fs.writeFileSync(path.join(session, 'review-code.json'), JSON.stringify({
      $schema: 'ultra-review-findings-v1',
      findings: [],
    }));
    const result = run(session, 'agents', 'review-code');
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'incomplete');
    assert.deepEqual(output.artifacts_invalid, ['review-code']);
  } finally {
    fs.rmSync(session, { recursive: true, force: true });
  }
});

test('review waiter validates the two-axis summary and derives severity counts', () => {
  const session = tempSession();
  try {
    fs.writeFileSync(path.join(session, 'SUMMARY.json'), JSON.stringify({
      $schema: 'ultra-review-summary-v2',
      mode: 'change',
      session: 'review-session',
      change_id: 'review-change',
      task_ids: ['review-task'],
      head: '0123456789abcdef',
      worktree_digest: 'a'.repeat(64),
      context_digest: 'b'.repeat(64),
      status: 'complete',
      verdict: 'REQUEST_CHANGES',
      axes: {
        spec_fidelity: { verdict: 'PASS', evidence_refs: ['spec-fidelity.json'] },
        engineering_standards: { verdict: 'FAIL', evidence_refs: ['review-code.json'] },
      },
      workers: { completed: ['review-spec', 'review-code'], failed: [], skipped: [] },
      worker_selection: [
        { worker: 'review-spec', status: 'selected', rationale: 'Required specification axis.' },
        { worker: 'review-code', status: 'selected', rationale: 'Changed runtime code.' },
      ],
      findings: [
        finding('engineering_standards', 'P1'),
        finding('engineering_standards', 'P2'),
      ],
      positive_observations: [],
      limitations: [],
    }));
    const result = run(session, 'summary');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /REQUEST_CHANGES/);
    assert.match(result.stdout, /P1:1/);
    assert.match(result.stdout, /total:2/);
  } finally {
    fs.rmSync(session, { recursive: true, force: true });
  }
});

test('review waiter rejects a summary without mode-bound worker selection provenance', () => {
  const session = tempSession();
  try {
    fs.writeFileSync(path.join(session, 'SUMMARY.json'), JSON.stringify({
      $schema: 'ultra-review-summary-v2',
      session: 'review-session', change_id: 'review-change', task_ids: [],
      head: '0123456789abcdef', worktree_digest: null, context_digest: 'b'.repeat(64),
      status: 'complete', verdict: 'APPROVE',
      axes: {
        spec_fidelity: { verdict: 'PASS', evidence_refs: ['spec-fidelity.json'] },
        engineering_standards: { verdict: 'PASS', evidence_refs: ['review-code.json'] },
      },
      workers: { completed: ['review-spec', 'review-code'], failed: [], skipped: [] },
      findings: [], positive_observations: [], limitations: [],
    }));
    const result = run(session, 'summary');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /mode|worker_selection/);
  } finally {
    fs.rmSync(session, { recursive: true, force: true });
  }
});
