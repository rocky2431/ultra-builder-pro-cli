'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const VALIDATOR = path.join(ROOT, 'skills', 'ultra-change', 'scripts', 'validate_primary_transfer.cjs');
const DIGEST_TOOL = path.join(ROOT, 'skills', 'ultra-test', 'scripts', 'worktree_digest.cjs');
const LIVE_HANDOFF = path.join(ROOT, '.ultra', '.runtime', 'handoffs', 'ubp3-r3-zcode');

const TERMINAL_STATES = ['completed', 'blocked', 'revoked', 'cancelled', 'failed'];
const RESULT_V2_SCHEMA = 'ultra-primary-transfer-result-v2';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fixture(name = 'h1') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-transfer-')));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'transfer@example.invalid');
  git(root, 'config', 'user.name', 'Transfer Fixture');
  fs.writeFileSync(path.join(root, 'design.md'), '# Accepted design\nStable frozen input bytes.\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n');
  git(root, 'add', 'design.md', 'README.md');
  git(root, 'commit', '-m', 'fixture');
  const handoff = path.join(root, '.ultra', '.runtime', 'handoffs', name);
  fs.mkdirSync(handoff, { recursive: true });
  writeJson(path.join(root, '.ultra', 'tasks.json'), {
    $schema: 'ultra-task-ledger-v2',
    tasks: [{
      id: 'fixture-task-1',
      title: 'Fixture task',
      type: 'architecture',
      priority: 'P0',
      status: 'in_progress',
      dependencies: [],
      context_file: '.ultra/contexts/task-fixture-task-1.md',
      trace_to: '.ultra/north-star.md#north-star-outcomes',
      change_id: 'chg-fixture',
    }],
  });
  return { root, handoff, name };
}

function offerFor(fx, overrides = {}) {
  return {
    $schema: 'ultra-primary-transfer-offer-v1',
    handoff_id: fx.name,
    mode: 'primary-transfer',
    state: 'offered',
    created_at: '2026-08-17T00:00:00+08:00',
    sender: { agent: 'Sender CLI', role: 'primary-writer' },
    receiver: { agent: 'Receiver CLI', role: 'sole-implementation-writer' },
    repository: {
      root: fx.root,
      origin: 'https://example.invalid/fixture.git',
      base_head: git(fx.root, 'rev-parse', 'HEAD'),
      worktree_digest: sha256Bytes(Buffer.from('fixture-diff')),
      dirty: false,
      known_untracked: [],
    },
    owner_authorization: {
      accepted_direction: 'Transfer the accepted work package to the receiver.',
      review_budget: { maximum_total_rounds: 10, target_total_rounds: 5 },
    },
    frozen_inputs: [
      {
        purpose: 'accepted implementation design',
        path: 'design.md',
        sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, 'design.md'))),
      },
    ],
    accepted_scope: {
      source: 'design.md#work-package',
      required_items: 1,
      new_task_identity: 'fixture-task-1',
      requirements: ['One requirement.'],
    },
    effects: {
      allowed: ['local repository file create/edit/delete'],
      forbidden: ['git commit', 'git push'],
    },
    receiver_protocol: {
      ack_path: `.ultra/.runtime/handoffs/${fx.name}/ACK.json`,
      result_path: `.ultra/.runtime/handoffs/${fx.name}/RESULT.json`,
      before_product_write: ['Stable-read every frozen input and verify its exact SHA-256.'],
      terminal_states: [...TERMINAL_STATES],
    },
    ...overrides,
  };
}

function ackFor(fx, offer, overrides = {}) {
  return {
    $schema: 'ultra-primary-transfer-ack-v1',
    handoff_id: fx.name,
    state: 'ready',
    created_at: '2026-08-17T00:10:00+08:00',
    receiver: { agent: offer.receiver.agent, accepted_role: offer.receiver.role },
    observed: {
      repository: {
        root: offer.repository.root,
        origin: offer.repository.origin,
        base_head: offer.repository.base_head,
      },
      worktree_digest: { diff_digest: offer.repository.worktree_digest },
      frozen_inputs: offer.frozen_inputs.map((input) => ({
        path: input.path,
        offered_sha256: input.sha256,
        observed_sha256: input.sha256,
        match: true,
      })),
    },
    ...overrides,
  };
}

function resultFor(fx, overrides = {}) {
  return {
    $schema: 'ultra-primary-transfer-result-v1',
    handoff_id: fx.name,
    terminal_state: 'completed',
    final_head: git(fx.root, 'rev-parse', 'HEAD'),
    final_worktree_digest: sha256Bytes(Buffer.from('final-diff')),
    changed_paths: ['src/feature.js'],
    deleted_paths: [],
    commands: [{ command: 'npm run test:node', exit_code: 0 }],
    evidence_refs: ['.ultra/evidence/fixture-task-1/verification.log'],
    fakes: [],
    limitations: [],
    not_done: [],
    external_effects: [],
    review_risks: [],
    ...overrides,
  };
}

function writeJson(file, payload) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function validate(target, ...extraArgs) {
  const result = spawnSync(process.execPath, [VALIDATOR, target, ...extraArgs], {
    encoding: 'utf8',
  });
  let report = null;
  try {
    report = JSON.parse(result.stdout);
  } catch {}
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, report };
}

function codes(report, handoffId = 'h1') {
  const handoff = report?.handoffs?.find((entry) => entry.handoff_id === handoffId);
  return new Set((handoff?.diagnostics || []).filter((item) => item.severity === 'error').map((item) => item.code));
}

function repoCodes(report) {
  return new Set((report?.diagnostics || []).filter((item) => item.severity === 'error').map((item) => item.code));
}

// Union of repo-level and per-handoff error codes: root-discovery failures
// surface at repo level, per-receipt failures inside a handoff.
function allCodes(report, handoffId = 'h1') {
  return new Set([...codes(report, handoffId), ...repoCodes(report)]);
}

// The real bounded digest primitive, run against a fixture repository, so ACK and
// RESULT fixtures bind the actual starting and final subjects instead of copied strings.
function digestOf(root) {
  const observed = spawnSync(process.execPath, [DIGEST_TOOL, '--project', root], { encoding: 'utf8' });
  assert.equal(observed.status, 0, observed.stderr);
  return JSON.parse(observed.stdout);
}

// The full final worktree subject against a base HEAD: present tracked changes plus
// product-scope untracked files, and separately the deleted tracked paths.
function manifestOf(root, baseHead) {
  const raw = execFileSync('git', [
    'diff', '--raw', '-z', '--no-renames', baseHead, '--', '.',
    ':(exclude).ultra/test-report.json',
    ':(exclude).ultra/evidence/**',
    ':(exclude).ultra/reviews/**',
    ':(exclude).ultra/.runtime/**',
    ':(exclude).ultra/progress/**',
    ':(exclude).ultra/changes/active/**',
    ':(exclude).ultra/changes/archive/**',
    ':(exclude).ultra/changes/abandoned/**',
  ], { cwd: root, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
  const fields = raw.toString('utf8').split('\0').filter(Boolean);
  const present = [];
  const deleted = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index].split(' ').at(-1);
    const file = fields[index + 1];
    if (status === 'D') deleted.push(file);
    else present.push(file);
  }
  const untracked = digestOf(root).untracked_files;
  return {
    changed: [...new Set([...present, ...untracked])].sort(),
    deleted: deleted.sort(),
  };
}

function bindRealDigest(fx, offer) {
  const observed = digestOf(fx.root);
  offer.repository.worktree_digest = observed.diff_digest;
  offer.repository.dirty = observed.dirty;
  return offer;
}

function resultV2For(fx, offer, overrides = {}) {
  const observed = digestOf(fx.root);
  const manifest = manifestOf(fx.root, offer.repository.base_head);
  return {
    $schema: RESULT_V2_SCHEMA,
    handoff_id: fx.name,
    terminal_state: 'completed',
    final_head: git(fx.root, 'rev-parse', 'HEAD'),
    final_worktree_digest: observed.diff_digest,
    changed_paths: manifest.changed,
    deleted_paths: manifest.deleted,
    frozen_input_final_digests: offer.frozen_inputs.map((input) => ({
      path: input.path,
      sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, input.path))),
    })),
    commands: [{ command: 'npm run test:node', exit_code: 0 }],
    evidence_refs: ['.ultra/evidence/fixture-task-1/verification.log'],
    fakes: [],
    limitations: [],
    not_done: [],
    external_effects: [],
    review_risks: [],
    ...overrides,
  };
}

test('a complete offered-plus-ready handoff validates as the active primary transfer', () => {
  const fx = fixture();
  try {
    const offer = offerFor(fx);
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));

    const result = validate(fx.root);
    assert.equal(result.status, 0, result.stdout || result.stderr);
    assert.equal(result.report.valid, true);
    const handoff = result.report.handoffs.find((entry) => entry.handoff_id === 'h1');
    assert.equal(handoff.state, 'active');
    assert.equal(handoff.valid, true);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('offer schema violations produce typed diagnostics instead of crashes', () => {
  const fx = fixture();
  try {
    const cases = [
      [offerFor(fx, { mode: 'delegated-worker' }), 'offer_mode_invalid'],
      [offerFor(fx, { state: 'accepted' }), 'offer_state_invalid'],
      [offerFor(fx, { repository: { ...offerFor(fx).repository, base_head: 'not-a-head' } }), 'offer_field_invalid'],
      [offerFor(fx, { frozen_inputs: [] }), 'offer_field_invalid'],
      [offerFor(fx, { frozen_inputs: [{ purpose: 'p', path: '../escape.md', sha256: '0'.repeat(64) }] }), 'offer_field_invalid'],
      [offerFor(fx, { repository: { ...offerFor(fx).repository, root: fx.root, base_head: 'z'.repeat(40) } }), 'offer_field_invalid'],
      [offerFor(fx, { accepted_scope: { ...offerFor(fx).accepted_scope, new_task_identity: '' } }), 'offer_field_invalid'],
      [offerFor(fx, { effects: { allowed: [], forbidden: [] } }), 'offer_field_invalid'],
      [offerFor(fx, { receiver_protocol: { ...offerFor(fx).receiver_protocol, terminal_states: ['completed'] } }), 'offer_field_invalid'],
      [offerFor(fx, { repository: { ...offerFor(fx).repository, root: path.dirname(fx.root) } }), 'repository_root_mismatch'],
    ];
    for (const [payload, expectedCode] of cases) {
      writeJson(path.join(fx.handoff, 'OFFER.json'), payload);
      const result = validate(fx.root);
      assert.equal(result.status, 1, `expected invalid for ${expectedCode}: ${result.stdout}`);
      assert.ok(codes(result.report).has(expectedCode), `expected ${expectedCode} in ${result.stdout}`);
    }
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('an ACK that claims ready with any mismatch is rejected; the same observation must be blocked', () => {
  const fx = fixture();
  try {
    const offer = offerFor(fx);
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    const mismatchedAck = ackFor(fx, offer, {
      observed: {
        repository: offer.repository,
        worktree_digest: { diff_digest: offer.repository.worktree_digest },
        frozen_inputs: [{
          path: 'design.md',
          offered_sha256: offer.frozen_inputs[0].sha256,
          observed_sha256: 'f'.repeat(64),
          match: true,
        }],
      },
    });
    writeJson(path.join(fx.handoff, 'ACK.json'), mismatchedAck);
    const ready = validate(fx.root);
    assert.equal(ready.status, 1, ready.stdout);
    assert.ok(codes(ready.report).has('ack_ready_with_mismatch'), ready.stdout);

    mismatchedAck.observed.frozen_inputs[0].match = false;
    mismatchedAck.state = 'blocked';
    mismatchedAck.blocked_reasons = ['frozen input digest mismatch'];
    writeJson(path.join(fx.handoff, 'ACK.json'), mismatchedAck);
    const blocked = validate(fx.root);
    assert.equal(blocked.status, 0, blocked.stdout);
    const handoff = blocked.report.handoffs.find((entry) => entry.handoff_id === 'h1');
    assert.equal(handoff.state, 'blocked');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('an ACK must observe every offered frozen input and accept the offered receiver role', () => {
  const fx = fixture();
  try {
    const offer = offerFor(fx, {
      frozen_inputs: [
        {
          purpose: 'accepted implementation design',
          path: 'design.md',
          sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, 'design.md'))),
        },
        {
          purpose: 'second frozen input',
          path: 'README.md',
          sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, 'README.md'))),
        },
      ],
    });
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    const partial = ackFor(fx, offer);
    partial.observed.frozen_inputs = partial.observed.frozen_inputs.slice(0, 1);
    writeJson(path.join(fx.handoff, 'ACK.json'), partial);
    const missing = validate(fx.root);
    assert.equal(missing.status, 1, missing.stdout);
    assert.ok(codes(missing.report).has('ack_missing_input_observation'), missing.stdout);

    const wrongRole = ackFor(fx, offer, {
      receiver: { agent: offer.receiver.agent, accepted_role: 'delegated-worker' },
    });
    writeJson(path.join(fx.handoff, 'ACK.json'), wrongRole);
    const role = validate(fx.root);
    assert.equal(role.status, 1, role.stdout);
    assert.ok(codes(role.report).has('ack_role_mismatch'), role.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a completed RESULT requires a ready ACK; every terminal state stays reachable and typed', () => {
  const fx = fixture();
  try {
    const offer = offerFor(fx);
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx));
    const orphan = validate(fx.root);
    assert.equal(orphan.status, 1, orphan.stdout);
    assert.ok(codes(orphan.report).has('result_without_ready_ack'), orphan.stdout);

    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    const completed = validate(fx.root);
    assert.equal(completed.status, 0, completed.stdout);
    let handoff = completed.report.handoffs.find((entry) => entry.handoff_id === 'h1');
    assert.equal(handoff.state, 'completed');

    writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx, {
      terminal_state: 'blocked',
      blocked_reasons: ['unresolvable material decision'],
    }));
    assert.equal(validate(fx.root).status, 0);

    writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx, {
      terminal_state: 'blocked',
    }));
    const unexplained = validate(fx.root);
    assert.equal(unexplained.status, 1, unexplained.stdout);
    assert.ok(codes(unexplained.report).has('result_blocked_without_reason'), unexplained.stdout);

    const decision = path.join(fx.root, '.ultra', 'decisions', 'revoke-fixture.md');
    fs.mkdirSync(path.dirname(decision), { recursive: true });
    fs.writeFileSync(decision, '# Decision: revoke the transfer\n');
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx, {
      terminal_state: 'revoked',
      evidence_refs: ['.ultra/decisions/revoke-fixture.md'],
    }));
    assert.equal(validate(fx.root).status, 0);

    writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx, {
      terminal_state: 'revoked',
      evidence_refs: ['.ultra/decisions/absent.md'],
    }));
    const noEvidence = validate(fx.root);
    assert.equal(noEvidence.status, 1, noEvidence.stdout);
    assert.ok(codes(noEvidence.report).has('result_revocation_evidence_missing'), noEvidence.stdout);

    writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx, { terminal_state: 'cancelled' }));
    assert.equal(validate(fx.root).status, 0);
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx, { terminal_state: 'failed' }));
    assert.equal(validate(fx.root).status, 0);
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx, { terminal_state: 'finished' }));
    const badTerminal = validate(fx.root);
    assert.equal(badTerminal.status, 1, badTerminal.stdout);
    assert.ok(codes(badTerminal.report).has('result_terminal_invalid'), badTerminal.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('two simultaneously active ready handoffs violate the one-canonical-writer invariant', () => {
  const fx = fixture();
  try {
    const second = path.join(fx.root, '.ultra', '.runtime', 'handoffs', 'h2');
    fs.mkdirSync(second, { recursive: true });
    const firstOffer = offerFor(fx);
    const secondFx = { ...fx, name: 'h2' };
    const secondOffer = offerFor(secondFx, {
      accepted_scope: { ...firstOffer.accepted_scope, new_task_identity: 'fixture-task-2' },
    });
    writeJson(path.join(fx.handoff, 'OFFER.json'), firstOffer);
    writeJson(path.join(second, 'OFFER.json'), secondOffer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, firstOffer));
    writeJson(path.join(second, 'ACK.json'), ackFor(secondFx, secondOffer));

    const conflict = validate(fx.root);
    assert.equal(conflict.status, 1, conflict.stdout);
    assert.ok(repoCodes(conflict.report).has('multiple_active_transfers'), conflict.stdout);

    writeJson(path.join(second, 'RESULT.json'), resultFor(secondFx, {
      terminal_state: 'cancelled',
    }));
    const resolved = validate(fx.root);
    assert.equal(resolved.status, 0, resolved.stdout);
    const active = resolved.report.handoffs.find((entry) => entry.handoff_id === 'h1');
    assert.equal(active.state, 'active');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a delegation receipt never masquerades as a primary transfer', () => {
  const fx = fixture();
  try {
    const offer = offerFor(fx);
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'receipt.json'), {
      $schema: 'ultra-delegation-receipt-v1',
      status: 'started',
      delegation_id: 'run-1',
    });
    const result = validate(fx.root);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(codes(result.report).has('delegation_receipt_in_handoff'), result.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('missing receipts recover through fresh handoff identities, never repaired old ones', () => {
  const fx = fixture();
  try {
    writeJson(path.join(fx.handoff, 'OFFER.json'), offerFor(fx));
    const offered = validate(fx.root);
    assert.equal(offered.status, 0, offered.stdout);
    let handoff = offered.report.handoffs.find((entry) => entry.handoff_id === 'h1');
    assert.equal(handoff.state, 'offered');

    writeJson(path.join(fx.handoff, 'OFFER-2.json'), offerFor(fx));
    const reused = validate(fx.root);
    assert.equal(reused.status, 1, reused.stdout);
    assert.ok(codes(reused.report).has('unknown_receipt_file'), reused.stdout);
    fs.unlinkSync(path.join(fx.handoff, 'OFFER-2.json'));

    const freshDir = path.join(fx.root, '.ultra', '.runtime', 'handoffs', 'h1-fresh');
    fs.mkdirSync(freshDir, { recursive: true });
    const freshFx = { ...fx, name: 'h1-fresh', handoff: freshDir };
    writeJson(path.join(freshDir, 'OFFER.json'), offerFor(freshFx));
    const fresh = validate(fx.root);
    assert.equal(fresh.status, 0, fresh.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('live re-verification reports stale heads and missing task identity; expected receiver writes are legal', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));

    const before = validate(fx.root, '--live');
    assert.equal(before.status, 0, before.stdout);
    let live = before.report.handoffs.find((entry) => entry.handoff_id === 'h1');
    assert.equal(live.live.boundary_intact, true, before.stdout);
    assert.equal(live.live.receiver_writes_begun, false, before.stdout);

    // A frozen input the receiver was expected to modify is a legal receiver edit:
    // active validation must not reuse ACK-start bytes as present-current freshness.
    fs.writeFileSync(path.join(fx.root, 'design.md'), '# Accepted design\nReceiver-reconciled reality.\n');
    const edited = validate(fx.root, '--live');
    assert.equal(edited.status, 0, edited.stdout);
    assert.ok(!codes(edited.report).has('stale_frozen_input'), edited.stdout);
    live = edited.report.handoffs.find((entry) => entry.handoff_id === 'h1');
    assert.equal(live.live.receiver_writes_begun, true, edited.stdout);
    assert.equal(live.live.boundary_intact, false, edited.stdout);

    fs.writeFileSync(path.join(fx.root, 'design.md'), '# Accepted design\nStable frozen input bytes.\n');
    fs.writeFileSync(path.join(fx.root, 'ledger-note.md'), 'ledger drift\n');
    git(fx.root, 'add', 'ledger-note.md');
    git(fx.root, 'commit', '-m', 'move HEAD');
    const moved = validate(fx.root, '--live');
    assert.equal(moved.status, 1, moved.stdout);
    assert.ok(codes(moved.report).has('stale_head'), moved.stdout);

    live = moved.report.handoffs.find((entry) => entry.handoff_id === 'h1');
    assert.equal(live.live.current_head, git(fx.root, 'rev-parse', 'HEAD'));

    fs.rmSync(path.join(fx.root, '.ultra', 'tasks.json'));
    const noLedger = validate(fx.root, '--live');
    assert.ok(codes(noLedger.report).has('task_identity_missing'), noLedger.stdout);

    writeJson(path.join(fx.root, '.ultra', 'tasks.json'), {
      $schema: 'ultra-task-ledger-v2',
      tasks: [{
        id: 'fixture-task-1',
        title: 'Fixture task',
        type: 'architecture',
        priority: 'P0',
        status: 'in_progress',
        dependencies: [],
        context_file: '.ultra/contexts/task-fixture-task-1.md',
        trace_to: '.ultra/north-star.md#north-star-outcomes',
        change_id: 'chg-fixture',
      }],
    });
    const withLedger = validate(fx.root, '--live');
    assert.ok(!codes(withLedger.report).has('task_identity_missing'), withLedger.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a completed handoff stays valid after expected receiver edits to its frozen inputs', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    // Legitimate receiver work: the task-reality and WIP frozen inputs change after
    // the ACK, then the receiver freezes a v1 terminal RESULT.
    fs.writeFileSync(path.join(fx.root, 'design.md'), '# Accepted design\nReceiver-reconciled reality.\n');
    const result = resultFor(fx);
    result.final_head = offer.repository.base_head;
    result.final_worktree_digest = digestOf(fx.root).diff_digest;
    writeJson(path.join(fx.handoff, 'RESULT.json'), result);

    const completed = validate(fx.root, '--live');
    assert.equal(completed.status, 0, completed.stdout);
    assert.ok(!codes(completed.report).has('stale_frozen_input'), completed.stdout);
    const handoff = completed.report.handoffs.find((entry) => entry.handoff_id === 'h1');
    assert.equal(handoff.state, 'completed');
    assert.equal(handoff.valid, true);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a terminal v2 RESULT recomputes and binds the actual final HEAD, digest, inventory, and frozen-input digests', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    fs.mkdirSync(path.join(fx.root, 'src'));
    fs.writeFileSync(path.join(fx.root, 'src', 'feature.js'), 'module.exports = 1;\n');

    const honest = validate(fx.root, '--live');
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultV2For(fx, offer));
    const frozen = validate(fx.root, '--live');
    assert.equal(frozen.status, 0, frozen.stdout);
    assert.equal(honest.status, 0, honest.stdout);

    const rejected = [
      ['final_worktree_digest', 'f'.repeat(64), 'result_digest_mismatch'],
      ['final_head', '0'.repeat(40), 'result_head_diverged'],
      ['changed_paths', [], 'result_inventory_missing'],
      ['changed_paths', ['docs/ghost.md'], 'result_inventory_extra'],
      ['deleted_paths', ['README.md'], 'result_inventory_deleted_mismatch'],
    ];
    for (const [field, value, expectedCode] of rejected) {
      writeJson(path.join(fx.handoff, 'RESULT.json'), resultV2For(fx, offer, { [field]: value }));
      const bad = validate(fx.root, '--live');
      assert.equal(bad.status, 1, `expected rejection for ${field}=${JSON.stringify(value)}: ${bad.stdout}`);
      assert.ok(codes(bad.report).has(expectedCode), `expected ${expectedCode} in ${bad.stdout}`);
    }

    writeJson(path.join(fx.handoff, 'RESULT.json'), resultV2For(fx, offer, {
      frozen_input_final_digests: [],
    }));
    const uncovered = validate(fx.root, '--live');
    assert.equal(uncovered.status, 1, uncovered.stdout);
    assert.ok(codes(uncovered.report).has('result_frozen_input_digest_missing'), uncovered.stdout);

    writeJson(path.join(fx.handoff, 'RESULT.json'), resultV2For(fx, offer, {
      frozen_input_final_digests: [{
        path: 'design.md',
        sha256: sha256Bytes(Buffer.from('forged design bytes')),
      }],
    }));
    const forged = validate(fx.root, '--live');
    assert.equal(forged.status, 1, forged.stdout);
    assert.ok(codes(forged.report).has('result_frozen_input_digest_mismatch'), forged.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a same-subject newer handoff supersedes this terminal receipt as history', () => {
  const fx = fixture();
  try {
    const older = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), older);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, older));
    const olderResult = resultFor(fx);
    olderResult.final_head = older.repository.base_head;
    olderResult.final_worktree_digest = digestOf(fx.root).diff_digest;
    writeJson(path.join(fx.handoff, 'RESULT.json'), olderResult);

    // The newer handoff continues the SAME task under the SAME authority (the
    // real r1 -> r2 pattern): it supersedes the older terminal receipt, whose
    // bytes legitimately move under the newer round.
    const newerDir = path.join(fx.root, '.ultra', '.runtime', 'handoffs', 'h2');
    fs.mkdirSync(newerDir, { recursive: true });
    const newerFx = { ...fx, name: 'h2', handoff: newerDir };
    const newer = bindRealDigest(fx, offerFor(newerFx, {
      created_at: '2026-08-17T12:00:00+08:00',
    }));
    writeJson(path.join(newerDir, 'OFFER.json'), newer);
    writeJson(path.join(newerDir, 'ACK.json'), ackFor(newerFx, newer));

    fs.writeFileSync(path.join(fx.root, 'design.md'), '# Accepted design\nNewer receiver round.\n');
    fs.mkdirSync(path.join(fx.root, 'src'));
    fs.writeFileSync(path.join(fx.root, 'src', 'feature.js'), 'module.exports = 1;\n');
    writeJson(path.join(newerDir, 'RESULT.json'), resultV2For(newerFx, newer));

    const report = validate(fx.root, '--live');
    assert.equal(report.status, 0, report.stdout);
    const oldHandoff = report.report.handoffs.find((entry) => entry.handoff_id === 'h1');
    assert.equal(oldHandoff.state, 'completed');
    assert.equal(oldHandoff.valid, true);
    const oldErrors = (oldHandoff.diagnostics || []).filter((item) => item.severity === 'error');
    assert.deepEqual(oldErrors, [], report.stdout);
    const newHandoff = report.report.handoffs.find((entry) => entry.handoff_id === 'h2');
    assert.equal(newHandoff.valid, true);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('receipt reads are bounded, ordinary-file, no-follow, and typed', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));

    // A symlinked receipt must be rejected as an unsafe identity, never followed.
    const elsewhere = path.join(fx.root, 'elsewhere-offer.json');
    writeJson(elsewhere, offer);
    fs.rmSync(path.join(fx.handoff, 'OFFER.json'));
    fs.symlinkSync(elsewhere, path.join(fx.handoff, 'OFFER.json'));
    let report = validate(fx.root);
    assert.equal(report.status, 1, report.stdout);
    assert.ok(codes(report.report).has('receipt_unsafe'), report.stdout);

    // A receipt replaced by a directory is not a regular file.
    fs.unlinkSync(path.join(fx.handoff, 'OFFER.json'));
    fs.writeFileSync(path.join(fx.handoff, 'OFFER.json'), `${JSON.stringify(offer, null, 2)}\n`);
    fs.rmSync(path.join(fx.handoff, 'ACK.json'), { recursive: true, force: true });
    fs.mkdirSync(path.join(fx.handoff, 'ACK.json'));
    report = validate(fx.root);
    assert.equal(report.status, 1, report.stdout);
    assert.ok(codes(report.report).has('receipt_not_regular'), report.stdout);

    // An oversize receipt stays inside the physical byte ceiling.
    fs.rmSync(path.join(fx.handoff, 'ACK.json'), { recursive: true, force: true });
    const padded = ackFor(fx, offer);
    padded.observed.repository.note = 'x'.repeat(1024 * 1024 + 4096);
    writeJson(path.join(fx.handoff, 'ACK.json'), padded);
    report = validate(fx.root);
    assert.equal(report.status, 1, report.stdout);
    assert.ok(codes(report.report).has('receipt_oversize'), report.stdout);

    // A frozen input swapped for a symlink with identical bytes is still an unsafe
    // identity when the terminal v2 binding re-reads it.
    fs.rmSync(path.join(fx.handoff, 'ACK.json'));
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    fs.mkdirSync(path.join(fx.root, 'src'));
    fs.writeFileSync(path.join(fx.root, 'src', 'feature.js'), 'module.exports = 1;\n');
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultV2For(fx, offer));
    const linked = validate(fx.root, '--live');
    assert.equal(linked.status, 0, linked.stdout);
    const designCopy = path.join(fx.root, 'design-copy.md');
    fs.copyFileSync(path.join(fx.root, 'design.md'), designCopy);
    fs.rmSync(path.join(fx.root, 'design.md'));
    fs.symlinkSync(designCopy, path.join(fx.root, 'design.md'));
    const unsafe = validate(fx.root, '--live');
    assert.equal(unsafe.status, 1, unsafe.stdout);
    assert.ok(codes(unsafe.report).has('result_frozen_input_unreadable'), unsafe.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('RESULT paths stay normalized, repository-relative, and outside unrelated runtime state', () => {
  const fx = fixture();
  try {
    const offer = offerFor(fx);
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    for (const changed of [['/absolute/path.js'], ['../outside.js'], ['back\\slash.js']]) {
      writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx, { changed_paths: changed }));
      const result = validate(fx.root);
      assert.equal(result.status, 1, `expected rejection for ${changed}: ${result.stdout}`);
      assert.ok(codes(result.report).has('result_path_invalid'), result.stdout);
    }
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx, {
      changed_paths: ['.ultra/.runtime/handoffs/h2/ACK.json'],
    }));
    const foreign = validate(fx.root);
    assert.equal(foreign.status, 1, foreign.stdout);
    assert.ok(codes(foreign.report).has('result_path_invalid'), foreign.stdout);
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx, {
      changed_paths: ['.ultra/.runtime/handoffs/h1/ACK.json'],
    }));
    const ownReceipt = validate(fx.root);
    assert.equal(ownReceipt.status, 0, ownReceipt.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('the live repository handoff stays internally consistent at every protocol stage', () => {
  const result = validate(LIVE_HANDOFF);
  assert.equal(result.status, 0, result.stdout || result.stderr);
  assert.equal(result.report.valid, true);
  const handoff = result.report.handoffs.find((entry) => entry.handoff_id === 'ubp3-r3-zcode');
  assert.ok(handoff, result.stdout);
  assert.ok(['offered', 'blocked', 'active', ...TERMINAL_STATES].includes(handoff.state));
});

test('repo-wide handoff-root discovery is bounded, no-follow, and typed', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    const baseline = validate(fx.root);
    assert.equal(baseline.status, 0, baseline.stdout);
    const handoffsRoot = path.join(fx.root, '.ultra', '.runtime', 'handoffs');

    // Reproduced false green: the handoffs root as a symlink to an empty
    // external directory must never read as zero handoffs with valid=true.
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-external-'));
    fs.renameSync(handoffsRoot, path.join(fx.root, 'real-handoffs'));
    fs.symlinkSync(external, handoffsRoot);
    const symlinked = validate(fx.root);
    assert.equal(symlinked.status, 1, symlinked.stdout);
    assert.equal(symlinked.report.valid, false, symlinked.stdout);
    assert.ok(allCodes(symlinked.report).has('receipt_unsafe'), symlinked.stdout);
    fs.unlinkSync(handoffsRoot);
    fs.renameSync(path.join(fx.root, 'real-handoffs'), handoffsRoot);
    fs.rmSync(external, { recursive: true, force: true });

    // An unsafe non-directory entry in the handoffs root fails typed.
    fs.writeFileSync(path.join(handoffsRoot, 'stray.txt'), 'stray\n');
    const stray = validate(fx.root);
    assert.equal(stray.status, 1, stray.stdout);
    assert.ok(allCodes(stray.report).has('handoff_entry_malformed'), stray.stdout);
    fs.rmSync(path.join(handoffsRoot, 'stray.txt'));

    // A symlinked handoff entry is an unsafe identity, never silently filtered.
    const externalHandoff = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-ext-handoff-'));
    fs.symlinkSync(externalHandoff, path.join(handoffsRoot, 'linked-handoff'));
    const linked = validate(fx.root);
    assert.equal(linked.status, 1, linked.stdout);
    assert.ok(allCodes(linked.report).has('receipt_unsafe'), linked.stdout);
    fs.unlinkSync(path.join(handoffsRoot, 'linked-handoff'));
    fs.rmSync(externalHandoff, { recursive: true, force: true });

    // An absent handoffs root means no transfers — not an error.
    fs.renameSync(handoffsRoot, path.join(fx.root, 'parked-handoffs'));
    const absent = validate(fx.root);
    assert.equal(absent.status, 0, absent.stdout);
    assert.equal(absent.report.handoffs.length, 0, absent.stdout);
    fs.renameSync(path.join(fx.root, 'parked-handoffs'), handoffsRoot);

    // The physical entry ceiling holds at discovery without whole-root
    // materialization: ceiling+1 directories fail typed.
    for (let index = 0; index < 257; index += 1) {
      fs.mkdirSync(path.join(handoffsRoot, `extra-${index}`));
    }
    const over = validate(fx.root);
    assert.equal(over.status, 1, over.stdout);
    assert.ok(allCodes(over.report).has('handoff_scan_limit'), over.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('deterministic entry-set drift between the two bounded root scans fails typed', () => {
  const validator = require(VALIDATOR);
  const fx = fixture();
  let realOpendir;
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    const handoffsRoot = path.join(fx.root, '.ultra', '.runtime', 'handoffs');

    // Inject a deterministic drift between the two bounded scans: when the
    // first handoffs-root scan closes, add one entry before the replay reads.
    realOpendir = fs.opendirSync;
    let armed = true;
    fs.opendirSync = function patchedOpendir(target, options) {
      const handle = realOpendir.call(fs, target, options);
      if (armed && path.resolve(String(target)) === path.resolve(handoffsRoot)) {
        armed = false;
        const realClose = handle.closeSync.bind(handle);
        handle.closeSync = () => {
          fs.writeFileSync(path.join(handoffsRoot, 'drift-entry.json'), '{}\n');
          return realClose();
        };
      }
      return handle;
    };
    const report = validator.validateRepo(fx.root, { live: false });
    assert.equal(report.valid, false, JSON.stringify(report));
    const drift = report.diagnostics.some((item) => item.severity === 'error'
      && (item.code === 'receipt_replaced' || item.code === 'handoff_scan_limit'));
    assert.ok(drift, JSON.stringify(report));
  } finally {
    if (realOpendir) fs.opendirSync = realOpendir;
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('ancestor components are observed no-follow before their children (architecture reset)', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    assert.equal(validate(fx.root).status, 0);
    const ultra = path.join(fx.root, '.ultra');
    const runtime = path.join(ultra, '.runtime');
    const handoffsRoot = path.join(runtime, 'handoffs');

    // A symlinked .ultra ancestor to an external empty directory must fail
    // typed even though the handoffs leaf beneath it is absent.
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-external-'));
    fs.renameSync(ultra, path.join(fx.root, 'real-ultra'));
    fs.symlinkSync(external, ultra);
    const ultraLink = validate(fx.root);
    assert.equal(ultraLink.status, 1, ultraLink.stdout);
    assert.equal(ultraLink.report.valid, false, ultraLink.stdout);
    assert.ok(allCodes(ultraLink.report).has('receipt_unsafe'), ultraLink.stdout);
    fs.unlinkSync(ultra);
    fs.renameSync(path.join(fx.root, 'real-ultra'), ultra);

    // A symlinked .ultra/.runtime ancestor to an external empty directory
    // fails typed the same way.
    fs.renameSync(runtime, path.join(ultra, 'real-runtime'));
    fs.symlinkSync(external, runtime);
    const runtimeLink = validate(fx.root);
    assert.equal(runtimeLink.status, 1, runtimeLink.stdout);
    assert.equal(runtimeLink.report.valid, false, runtimeLink.stdout);
    assert.ok(allCodes(runtimeLink.report).has('receipt_unsafe'), runtimeLink.stdout);
    fs.unlinkSync(runtime);
    fs.renameSync(path.join(ultra, 'real-runtime'), runtime);
    fs.rmSync(external, { recursive: true, force: true });

    // A genuinely absent .ultra means no transfers, not an error.
    fs.renameSync(ultra, path.join(fx.root, 'parked-ultra'));
    const noUltra = validate(fx.root);
    assert.equal(noUltra.status, 0, noUltra.stdout);
    assert.equal(noUltra.report.handoffs.length, 0, noUltra.stdout);
    fs.renameSync(path.join(fx.root, 'parked-ultra'), ultra);

    // An ordinary .ultra with an absent .runtime means no transfers.
    fs.renameSync(runtime, path.join(ultra, 'parked-runtime'));
    const noRuntime = validate(fx.root);
    assert.equal(noRuntime.status, 0, noRuntime.stdout);
    assert.equal(noRuntime.report.handoffs.length, 0, noRuntime.stdout);
    fs.renameSync(path.join(ultra, 'parked-runtime'), runtime);

    // Ordinary ancestors with an absent handoffs leaf means no transfers.
    fs.renameSync(handoffsRoot, path.join(runtime, 'parked-handoffs'));
    const noHandoffs = validate(fx.root);
    assert.equal(noHandoffs.status, 0, noHandoffs.stdout);
    assert.equal(noHandoffs.report.handoffs.length, 0, noHandoffs.stdout);
    fs.renameSync(path.join(runtime, 'parked-handoffs'), handoffsRoot);

    // Baseline intact after the ladder.
    assert.equal(validate(fx.root).status, 0);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a required handoff directory that is absent is a typed error', () => {
  const fx = fixture();
  try {
    const missing = path.join(fx.root, '.ultra', '.runtime', 'handoffs', 'absent-handoff');
    const result = validate(missing);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(allCodes(result.report, 'absent-handoff').has('handoff_dir_missing'), result.stdout);
    assert.match(JSON.stringify(result.report), /Restore the ordinary directory/iu);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('usage errors exit 2 without inventing a report', () => {
  const result = spawnSync(process.execPath, [VALIDATOR], { encoding: 'utf8' });
  assert.equal(result.status, 2);
});

test('live validation fails closed when Git is unavailable', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    fs.mkdirSync(path.join(fx.root, 'src'));
    fs.writeFileSync(path.join(fx.root, 'src', 'feature.js'), 'module.exports = 1;\n');
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultV2For(fx, offer));

    // Reproduced defect: with Git unresolvable, a newest v2 terminal RESULT
    // validated --live exited 0 with valid=true and only a warning.
    const result = spawnSync(process.execPath, [VALIDATOR, fx.root, '--live'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '/nonexistent' },
    });
    assert.notEqual(result.status, 0, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.valid, false, result.stdout);
    assert.ok(codes(report).has('git_unavailable'), result.stdout);
    assert.match(
      JSON.stringify(report),
      /restore a responsive Git/iu,
      'the failure must name the restore-and-retry recovery',
    );
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a symlinked parent directory is never followed for receipts', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);

    // Replace the handoffs parent with a symlink to the real directory.
    const realParent = path.join(fx.root, 'real-handoffs');
    fs.renameSync(path.join(fx.root, '.ultra', '.runtime', 'handoffs'), realParent);
    fs.symlinkSync(realParent, path.join(fx.root, '.ultra', '.runtime', 'handoffs'));
    const result = validate(fx.root);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(allCodes(result.report).has('receipt_unsafe'), result.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a receipt leaf replaced by a FIFO is rejected as not a regular file', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    spawnSync('mkfifo', [path.join(fx.handoff, 'ACK.json')]);
    const result = validate(fx.root);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(codes(result.report).has('receipt_not_regular'), result.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a handoff directory holds exactly the three receipts under a bounded replay', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);

    // Any unexpected entry — even a non-receipt file — fails typed.
    fs.writeFileSync(path.join(fx.handoff, 'stray.txt'), 'stray\n');
    let result = validate(fx.root);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(codes(result.report).has('unknown_receipt_file'), result.stdout);
    fs.rmSync(path.join(fx.handoff, 'stray.txt'));

    // A symlinked unexpected entry is an unsafe identity, never followed.
    const elsewhere = path.join(fx.root, 'elsewhere.json');
    writeJson(elsewhere, { $schema: 'ultra-delegation-receipt-v1' });
    fs.symlinkSync(elsewhere, path.join(fx.handoff, 'notes.json'));
    result = validate(fx.root);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(codes(result.report).has('unknown_receipt_file'), result.stdout);
    fs.rmSync(path.join(fx.handoff, 'notes.json'));

    // Exactly OFFER.json validates again.
    assert.equal(validate(fx.root).status, 0);

    // The physical entry ceiling is enforced: ceiling+1 entries fail typed.
    for (let index = 0; index < 257; index += 1) {
      fs.writeFileSync(path.join(fx.handoff, `extra-${index}.json`), '{}\n');
    }
    result = validate(fx.root);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(codes(result.report).has('handoff_scan_limit'), result.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('an unrelated newer handoff does not supersede this terminal receipt', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    fs.mkdirSync(path.join(fx.root, 'src'));
    fs.writeFileSync(path.join(fx.root, 'src', 'feature.js'), 'module.exports = 1;\n');
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultV2For(fx, offer));

    // A newer handoff for a DIFFERENT task identity is unrelated work: it must
    // not downgrade strict live validation of this receipt.
    const newerDir = path.join(fx.root, '.ultra', '.runtime', 'handoffs', 'h2');
    fs.mkdirSync(newerDir, { recursive: true });
    const newerFx = { ...fx, name: 'h2', handoff: newerDir };
    const newer = bindRealDigest(fx, offerFor(newerFx, {
      created_at: '2026-08-17T12:00:00+08:00',
      accepted_scope: {
        ...offerFor(newerFx).accepted_scope,
        new_task_identity: 'an-unrelated-task',
      },
    }));
    writeJson(path.join(newerDir, 'OFFER.json'), newer);
    writeJson(path.join(newerDir, 'ACK.json'), ackFor(newerFx, newer));

    fs.writeFileSync(path.join(fx.root, 'design.md'), '# Accepted design\nBytes moved by unrelated work.\n');

    const report = validate(fx.root, '--live');
    assert.equal(report.status, 1, report.stdout);
    assert.ok(codes(report.report).has('result_digest_mismatch'), report.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('an invalid frozen-input path is rejected without any filesystem access', () => {
  const fx = fixture();
  try {
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    fs.mkdirSync(path.join(fx.root, 'src'));
    fs.writeFileSync(path.join(fx.root, 'src', 'feature.js'), 'module.exports = 1;\n');
    // An escaping path: structurally rejected, and the validator must never
    // touch the filesystem through it. If it did, the read attempt would
    // surface as a typed unreadable/mismatch diagnostic for that path.
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultV2For(fx, offer, {
      frozen_input_final_digests: [
        ...resultV2For(fx, offer).frozen_input_final_digests,
        { path: '../../../../etc/hostname', sha256: '0'.repeat(64) },
      ],
    }));
    const result = validate(fx.root, '--live');
    assert.equal(result.status, 1, result.stdout);
    assert.ok(codes(result.report).has('result_frozen_input_digest_missing'), result.stdout);
    // No read was attempted through the escaping path: an access would surface
    // as a typed unreadable or digest-mismatch diagnostic for that entry.
    assert.ok(!codes(result.report).has('result_frozen_input_unreadable'), result.stdout);
    assert.ok(!codes(result.report).has('result_frozen_input_digest_mismatch'), result.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('terminal binding is one coherent observation across digest and manifest', () => {
  const fx = fixture();
  try {
    // design.md is already a modified tracked path in the frozen subject, so a
    // mid-observation byte append changes the worktree without changing the
    // manifest path set — only a coherent digest re-observation catches it.
    fs.writeFileSync(path.join(fx.root, 'design.md'), '# Accepted design\nModified by receiver.\n');
    const offer = bindRealDigest(fx, offerFor(fx));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    writeJson(path.join(fx.handoff, 'RESULT.json'), resultV2For(fx, offer));

    // A git shim mutates design.md exactly once, on the validator's manifest
    // invocation (diff --raw without --abbrev=64), then delegates to real git.
    const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-git-shim-'));
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    const designPath = path.join(fx.root, 'design.md');
    fs.writeFileSync(path.join(shimDir, 'git'), [
      '#!/bin/sh\n',
      `if [ "$1" = "diff" ] && echo "$@" | grep -q -- '--raw' && ! echo "$@" | grep -q -- '--abbrev=64'; then\n`,
      `  if [ ! -f "${shimDir}/mutated" ]; then touch "${shimDir}/mutated"; printf 'x' >> ${JSON.stringify(designPath)}; fi\n`,
      'fi\n',
      `exec ${realGit} "$@"\n`,
    ].join(''));
    fs.chmodSync(path.join(shimDir, 'git'), 0o755);

    const result = spawnSync(process.execPath, [VALIDATOR, fx.root, '--live'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${shimDir}:${process.env.PATH}` },
    });
    fs.rmSync(shimDir, { recursive: true, force: true });
    assert.equal(result.status, 1, `expected the mutated subject to fail: ${result.stdout}`);
    assert.ok(
      codes(JSON.parse(result.stdout)).has('subject_changed_during_observation')
        || codes(JSON.parse(result.stdout)).has('result_digest_mismatch'),
      result.stdout,
    );
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

// ---- closeout-transition contract (versioned closeout receipt) ----
//
// The versioned contract separates the immutable reviewed subject (the newest
// terminal v2 RESULT and the bytes it froze) from exactly one uncommitted
// prescribed closeout (post-review evidence/context/ledger writes), recorded in
// a CLOSEOUT receipt. The closeout starts no review and no handoff, never
// commits, and never rewrites OFFER/ACK/RESULT bytes.

const CLOSEOUT_SCHEMA = 'ultra-primary-transfer-closeout-v1';
const TASK_ID = 'fixture-task-1';
const CONTEXT_RELATIVE = `.ultra/contexts/task-${TASK_ID}.md`;
const LEDGER_RELATIVE = '.ultra/tasks.json';
const EVIDENCE_JSON_RELATIVE = `.ultra/evidence/${TASK_ID}/evidence.json`;

function fixtureContextText() {
  return [
    `# Task ${TASK_ID}: Fixture task`,
    '',
    '## Context',
    '',
    'Fixture closeout subject.',
    '',
    '## Planned Path Inventory',
    '',
    '`CREATE`:',
    '',
    '- `src/feature.js`',
    '- `.ultra/evidence/fixture-task-1/external-review.json`',
    '',
    '## Acceptance Criteria',
    '',
    'One criterion.',
    '',
    '## Change Log',
    '',
    '| Date | Change |',
    '|---|---|',
    '| 2026-08-17 | Initial |',
    '',
    '## Open Questions',
    '',
    '- none',
    '',
    '## Resume Note',
    '',
    'Awaiting external manual review.',
    '',
    '## Task Review',
    '',
    '- pending',
    '',
    '## Completion',
    '',
    'Pending.',
    '',
  ].join('\n');
}

// The pinned closeout prefix ends at the earliest closeout-section heading, so
// implementation records, the PPI, and Acceptance stay byte-frozen at closeout.
function closeoutBoundaryIndex(text) {
  let best = -1;
  for (const heading of ['## Resume Note', '## Task Review', '## Completion']) {
    const at = text.indexOf(`${heading}\n`);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }
  return best;
}

// Canonical digest over the ledger rows outside the closed-out task: every
// unrelated authority row stays stale at closeout.
function rowsExTaskDigest(ledgerBytes, taskId) {
  const parsed = JSON.parse(ledgerBytes.toString('utf8'));
  const without = parsed.tasks.filter((row) => row.id !== taskId);
  return sha256Bytes(Buffer.from(JSON.stringify({ ...parsed, tasks: without })));
}

// Canonical digest over the closed task's own row with the status field
// removed: every field except status stays structure-equivalent at closeout.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function rowExStatusDigest(ledgerBytes, taskId) {
  const parsed = JSON.parse(ledgerBytes.toString('utf8'));
  const row = parsed.tasks.find((entry) => entry.id === taskId);
  const { status, ...rest } = row;
  return sha256Bytes(Buffer.from(canonicalJson(rest)));
}

// The existing external-review receipt schema, exactly as
// skills/ultra-plan/references/task-evidence-v2.md defines it — the closeout
// binds these semantics; it never invents a second review schema.
function writeExternalReviewReceipt(root, mutate = (receipt) => receipt) {
  const ledgerBytes = fs.readFileSync(path.join(root, LEDGER_RELATIVE));
  const row = JSON.parse(ledgerBytes.toString('utf8')).tasks.find((entry) => entry.id === TASK_ID);
  const receipt = mutate({
    $schema: 'ultra-external-review-receipt-v1',
    reviewer: 'External root reviewer',
    reviewer_role: 'read-only',
    task_id: TASK_ID,
    change_id: row.change_id,
    reviewer_authority: {
      ref: '.ultra/decisions/fixture-grant.md',
      sha256: sha256Bytes(fs.readFileSync(path.join(root, '.ultra', 'decisions', 'fixture-grant.md'))),
    },
    reviewed_contract: {
      ref: 'design.md',
      sha256: sha256Bytes(fs.readFileSync(path.join(root, 'design.md'))),
    },
    subject: {
      git_head: git(root, 'rev-parse', 'HEAD'),
      worktree_digest: digestOf(root).diff_digest,
    },
    verdict: 'approve',
    findings: [],
    timestamp: '2026-08-17T15:00:00+08:00',
  });
  fs.mkdirSync(path.join(root, '.ultra', 'evidence', TASK_ID), { recursive: true });
  writeJson(path.join(root, '.ultra', 'evidence', TASK_ID, 'external-review.json'), receipt);
  return receipt;
}

function evidenceSiblingsOf(root) {
  const evidenceDir = path.join(root, '.ultra', 'evidence', TASK_ID);
  const siblings = [];
  if (fs.existsSync(evidenceDir)) {
    for (const name of fs.readdirSync(evidenceDir).sort()) {
      if (name === 'evidence.json') continue;
      siblings.push({
        path: `.ultra/evidence/${TASK_ID}/${name}`,
        sha256: sha256Bytes(fs.readFileSync(path.join(evidenceDir, name))),
      });
    }
  }
  return siblings;
}

function observeCloseoutSubject(root) {
  const ledgerBytes = fs.readFileSync(path.join(root, LEDGER_RELATIVE));
  const contextBytes = fs.readFileSync(path.join(root, CONTEXT_RELATIVE));
  const boundary = closeoutBoundaryIndex(contextBytes.toString('utf8'));
  assert.ok(boundary > 0, 'fixture context must carry a closeout-section heading');
  const row = JSON.parse(ledgerBytes.toString('utf8')).tasks.find((entry) => entry.id === TASK_ID);
  return {
    head: git(root, 'rev-parse', 'HEAD'),
    worktree_digest: digestOf(root).diff_digest,
    ledger_sha256: sha256Bytes(ledgerBytes),
    context_sha256: sha256Bytes(contextBytes),
    ledger_rows_ex_task_sha256: rowsExTaskDigest(ledgerBytes, TASK_ID),
    ledger_row_ex_status_sha256: rowExStatusDigest(ledgerBytes, TASK_ID),
    ledger_row_status: row.status,
    context_prefix_sha256: sha256Bytes(contextBytes.subarray(0, boundary)),
    evidence_siblings: evidenceSiblingsOf(root),
  };
}

// The one prescribed closeout: ledger `completed`, context Resume/Task
// Review/Completion sections, and the final evidence record. Nothing else.
function applyPrescribedCloseout(root) {
  const ledgerPath = path.join(root, LEDGER_RELATIVE);
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  for (const row of ledger.tasks) if (row.id === TASK_ID) row.status = 'completed';
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

  const contextPath = path.join(root, CONTEXT_RELATIVE);
  const text = fs.readFileSync(contextPath, 'utf8');
  const boundary = closeoutBoundaryIndex(text);
  fs.writeFileSync(contextPath, `${text.slice(0, boundary)}## Resume Note

Closed out under the closeout-transition contract.

## Task Review

External manual review approve, zero findings.

## Completion

Completed 2026-08-17.
`);

  fs.mkdirSync(path.dirname(path.join(root, EVIDENCE_JSON_RELATIVE)), { recursive: true });
  fs.writeFileSync(path.join(root, EVIDENCE_JSON_RELATIVE), '{"$schema":"ultra-task-evidence-v2"}\n');
}

function closeoutReceipt(fx, result, before, overrides = {}) {
  const evidenceJsonPath = path.join(fx.root, EVIDENCE_JSON_RELATIVE);
  const after = observeCloseoutSubject(fx.root);
  return {
    $schema: CLOSEOUT_SCHEMA,
    handoff_id: fx.name,
    task_identity: TASK_ID,
    created_at: '2026-08-17T13:00:00+08:00',
    closes_result: {
      $schema: RESULT_V2_SCHEMA,
      final_head: result.final_head,
      final_worktree_digest: result.final_worktree_digest,
    },
    authorized_by: {
      path: `.ultra/evidence/${TASK_ID}/external-review.json`,
      sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, '.ultra', 'evidence', TASK_ID, 'external-review.json'))),
    },
    prescribed_paths: [LEDGER_RELATIVE, CONTEXT_RELATIVE, EVIDENCE_JSON_RELATIVE],
    subject_before: {
      head: before.head,
      worktree_digest: before.worktree_digest,
      ledger_sha256: before.ledger_sha256,
      context_sha256: before.context_sha256,
      ledger_rows_ex_task_sha256: before.ledger_rows_ex_task_sha256,
      ledger_row_ex_status_sha256: before.ledger_row_ex_status_sha256,
      ledger_row_status: before.ledger_row_status,
      context_prefix_sha256: before.context_prefix_sha256,
      evidence_json_absent: true,
      evidence_siblings: before.evidence_siblings,
    },
    subject_after: {
      head: after.head,
      worktree_digest: after.worktree_digest,
      ledger_sha256: after.ledger_sha256,
      context_sha256: after.context_sha256,
      evidence_json_sha256: sha256Bytes(fs.readFileSync(evidenceJsonPath)),
      ledger_rows_ex_task_sha256: after.ledger_rows_ex_task_sha256,
      ledger_row_ex_status_sha256: after.ledger_row_ex_status_sha256,
      ledger_row_status: after.ledger_row_status,
      context_prefix_sha256: after.context_prefix_sha256,
      evidence_siblings: after.evidence_siblings,
    },
    effects_declined: { commit: false, review_started: false, handoff_started: false },
    ...overrides,
  };
}

// Full green setup shared by the closeout regressions: freeze a newest v2
// RESULT with the task context as a frozen input, land the external review
// receipt, and (unless the caller drives the continuation scenario) apply the
// prescribed closeout writes.
function closeoutFixture(name = 'h1', { apply = true } = {}) {
  const fx = fixture(name);
  fs.mkdirSync(path.join(fx.root, '.ultra', 'contexts'), { recursive: true });
  fs.writeFileSync(path.join(fx.root, CONTEXT_RELATIVE), `${fixtureContextText()}\n`);
  fs.mkdirSync(path.join(fx.root, 'src'));
  fs.writeFileSync(path.join(fx.root, 'src', 'feature.js'), 'module.exports = 1;\n');
  fs.mkdirSync(path.join(fx.root, '.ultra', 'decisions'), { recursive: true });
  fs.writeFileSync(path.join(fx.root, '.ultra', 'decisions', 'fixture-grant.md'), '# Fixture owner grant\n\nAuthorizes the fixture external review.\n');

  const inputs = [
    {
      purpose: 'accepted implementation design',
      path: 'design.md',
      sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, 'design.md'))),
    },
    {
      purpose: 'canonical task context',
      path: CONTEXT_RELATIVE,
      sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, CONTEXT_RELATIVE))),
    },
  ];
  const offer = bindRealDigest(fx, offerFor(fx, { frozen_inputs: inputs }));
  writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
  writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
  const result = resultV2For(fx, offer);
  writeJson(path.join(fx.handoff, 'RESULT.json'), result);

  let before = null;
  if (apply) {
    // The external review receipt lands post-freeze in the evidence
    // directory (outside the product digest) and reviews the closeout-start
    // subject, which for the plain path is the frozen subject itself.
    writeExternalReviewReceipt(fx.root);
    before = observeCloseoutSubject(fx.root);
    applyPrescribedCloseout(fx.root);
  }
  return { fx, offer, result, before };
}

test('the prescribed closeout is terminal without RESULT edit or commit', () => {
    const fx = fixture();
    try {
      fs.mkdirSync(path.join(fx.root, '.ultra', 'contexts'), { recursive: true });
      fs.writeFileSync(path.join(fx.root, CONTEXT_RELATIVE), `${fixtureContextText()}\n`);
      fs.mkdirSync(path.join(fx.root, 'src'));
      fs.writeFileSync(path.join(fx.root, 'src', 'feature.js'), 'module.exports = 1;\n');
      fs.mkdirSync(path.join(fx.root, '.ultra', 'decisions'), { recursive: true });
      fs.writeFileSync(path.join(fx.root, '.ultra', 'decisions', 'fixture-grant.md'), '# Fixture owner grant\n\nAuthorizes the fixture external review.\n');

    const inputs = [
      {
        purpose: 'accepted implementation design',
        path: 'design.md',
        sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, 'design.md'))),
      },
      {
        purpose: 'canonical task context',
        path: CONTEXT_RELATIVE,
        sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, CONTEXT_RELATIVE))),
      },
    ];
    const offer = bindRealDigest(fx, offerFor(fx, { frozen_inputs: inputs }));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    const result = resultV2For(fx, offer);
    writeJson(path.join(fx.handoff, 'RESULT.json'), result);
    assert.equal(validate(fx.root, '--live').status, 0);

    const resultBytesBefore = fs.readFileSync(path.join(fx.handoff, 'RESULT.json'));
    const headBefore = git(fx.root, 'rev-parse', 'HEAD');

    fs.mkdirSync(path.join(fx.root, '.ultra', 'evidence', TASK_ID), { recursive: true });
    writeExternalReviewReceipt(fx.root);
    const before = observeCloseoutSubject(fx.root);

    // RED baseline — the architecture root itself: the mandated closeout
    // writes, with no closeout receipt, invalidate the immutable newest v2
    // RESULT (digest and frozen-context drift), and the only escapes are the
    // forbidden RESULT re-freeze, a new handoff, or a commit.
    applyPrescribedCloseout(fx.root);
    const looped = validate(fx.root, '--live');
    assert.equal(looped.status, 1, looped.stdout);
    assert.ok(codes(looped.report).has('result_digest_mismatch'), looped.stdout);
    assert.ok(codes(looped.report).has('result_frozen_input_digest_mismatch'), looped.stdout);

    // GREEN: one CLOSEOUT receipt records the transition; the RESULT bytes
    // stay untouched, HEAD stays untouched, and the handoff is terminal.
    writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), closeoutReceipt(fx, result, before));
    const terminal = validate(fx.root, '--live');
    assert.equal(terminal.status, 0, terminal.stdout);
    assert.deepEqual(fs.readFileSync(path.join(fx.handoff, 'RESULT.json')), resultBytesBefore);
    assert.equal(git(fx.root, 'rev-parse', 'HEAD'), headBefore);
    const handoff = terminal.report.handoffs.find((entry) => entry.handoff_id === fx.name);
    assert.equal(handoff.state, 'completed');
    assert.equal(handoff.live.closeout, 'applied');
    assert.match(handoff.live.final_worktree_digest, /^[0-9a-f]{64}$/);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a closeout receipt is rejected structurally with typed stops', () => {
  const base = closeoutFixture();
  try {
    const { fx, result, before } = base;
    const honest = closeoutReceipt(fx, result, before);

    // Every structural violation is a typed closeout_schema stop.
    const structural = [
      ['closes_result', { ...honest.closes_result, final_worktree_digest: 'f'.repeat(64) }],
      ['task_identity', 'someone-elses-task'],
      ['prescribed_paths', [LEDGER_RELATIVE, CONTEXT_RELATIVE, EVIDENCE_JSON_RELATIVE, 'src/feature.js']],
      ['effects_declined', { commit: true, review_started: false, handoff_started: false }],
      ['authorized_by', { path: `.ultra/evidence/${TASK_ID}/external-review.json`, sha256: 'f'.repeat(64) }],
      ['authorized_by', { path: '.ultra/evidence/fixture-task-1/missing-receipt.json', sha256: '0'.repeat(64) }],
      ['subject_before', { ...honest.subject_before, evidence_json_absent: false }],
      ['subject_after', { ...honest.subject_after, ledger_rows_ex_task_sha256: 'f'.repeat(64) }],
    ];
    for (const [field, value] of structural) {
      writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), closeoutReceipt(fx, result, before, { [field]: value }));
      const bad = validate(fx.root, '--live');
      assert.equal(bad.status, 1, `expected closeout_schema rejection for ${field}: ${bad.stdout}`);
      assert.ok(codes(bad.report).has('closeout_schema'), bad.stdout);
    }

    // A CLOSEOUT receipt requires a completed v2 RESULT in the same handoff.
    writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), honest);
    fs.rmSync(path.join(fx.handoff, 'RESULT.json'));
    let noResult = validate(fx.root, '--live');
    assert.equal(noResult.status, 1, noResult.stdout);
    assert.ok(codes(noResult.report).has('closeout_without_result'), noResult.stdout);

    writeJson(path.join(fx.handoff, 'RESULT.json'), resultFor(fx));
    let v1Result = validate(fx.root, '--live');
    assert.ok(codes(v1Result.report).has('closeout_without_result'), v1Result.stdout);
  } finally {
    fs.rmSync(base.fx.root, { recursive: true, force: true });
  }
});

test('implementation, PPI, unrelated-ledger, evidence, and inventory drift stay stale at closeout', () => {
  const base = closeoutFixture();
  try {
    const { fx, result, before } = base;
    writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), closeoutReceipt(fx, result, before));
    assert.equal(validate(fx.root, '--live').status, 0);

    const ledgerPath = path.join(fx.root, LEDGER_RELATIVE);
    const ledgerOriginal = fs.readFileSync(ledgerPath, 'utf8');
    const ledgerParsed = JSON.parse(ledgerOriginal);
    ledgerParsed.tasks.push({
      id: 'unrelated-task',
      title: 'Unrelated',
      type: 'feature',
      priority: 'P2',
      status: 'pending',
      dependencies: [],
      context_file: '.ultra/contexts/task-unrelated-task.md',
      trace_to: '.ultra/north-star.md#north-star-outcomes',
      change_id: 'chg-fixture',
    });

    const contextPath = path.join(fx.root, CONTEXT_RELATIVE);
    const contextOriginal = fs.readFileSync(contextPath, 'utf8');
    const featurePath = path.join(fx.root, 'src', 'feature.js');
    const featureOriginal = fs.readFileSync(featurePath, 'utf8');
    const evidenceJsonPath = path.join(fx.root, EVIDENCE_JSON_RELATIVE);
    const evidenceOriginal = fs.readFileSync(evidenceJsonPath, 'utf8');
    const designPath = path.join(fx.root, 'design.md');
    const designOriginal = fs.readFileSync(designPath, 'utf8');
    const externalReceiptPath = path.join(fx.root, '.ultra', 'evidence', TASK_ID, 'external-review.json');
    const externalOriginal = fs.readFileSync(externalReceiptPath, 'utf8');

    const drift = [
      {
        mutate: () => fs.writeFileSync(featurePath, 'module.exports = 2;\n'),
        restore: () => fs.writeFileSync(featurePath, featureOriginal),
        code: 'closeout_binding',
        why: 'implementation change after closeout',
      },
      {
        mutate: () => fs.writeFileSync(ledgerPath, `${JSON.stringify(ledgerParsed, null, 2)}\n`),
        restore: () => fs.writeFileSync(ledgerPath, ledgerOriginal),
        code: 'closeout_scope_drift',
        why: 'unrelated ledger authority change',
      },
      {
        mutate: () => fs.writeFileSync(contextPath, contextOriginal.replace('- `src/feature.js`', '- `src/feature.js`\n- `src/smuggled.js`')),
        restore: () => fs.writeFileSync(contextPath, contextOriginal),
        code: 'closeout_scope_drift',
        why: 'PPI edit inside the prescribed closeout path',
      },
      {
        mutate: () => fs.writeFileSync(evidenceJsonPath, '{"$schema":"ultra-task-evidence-v2","tampered":true}\n'),
        restore: () => fs.writeFileSync(evidenceJsonPath, evidenceOriginal),
        code: 'closeout_scope_drift',
        why: 'final evidence tampering',
      },
      {
        mutate: () => fs.writeFileSync(path.join(fx.root, 'src', 'extra.js'), 'module.exports = 3;\n'),
        restore: () => fs.rmSync(path.join(fx.root, 'src', 'extra.js')),
        code: 'closeout_binding',
        why: 'new unpinned product path',
      },
      {
        mutate: () => fs.writeFileSync(designPath, '# Accepted design\nDrifted frozen input.\n'),
        restore: () => fs.writeFileSync(designPath, designOriginal),
        code: 'result_frozen_input_digest_mismatch',
        why: 'frozen implementation input drift',
      },
      {
        mutate: () => fs.writeFileSync(externalReceiptPath, `${JSON.stringify({
          ...JSON.parse(externalOriginal),
          findings: [{ id: 'F3', severity: 'P3', title: 'Tampered observation' }],
        }, null, 2)}\n`),
        restore: () => fs.writeFileSync(externalReceiptPath, externalOriginal),
        code: 'closeout_schema',
        why: 'authorization receipt tampering',
      },
    ];

    for (const { mutate, restore, code, why } of drift) {
      mutate();
      const bad = validate(fx.root, '--live');
      assert.equal(bad.status, 1, `expected typed drift stop for: ${why}: ${bad.stdout}`);
      assert.ok(codes(bad.report).has(code), `expected ${code} for ${why}: ${bad.stdout}`);
      restore();
      assert.equal(validate(fx.root, '--live').status, 0, `restore failed for: ${why}`);
    }
  } finally {
    fs.rmSync(base.fx.root, { recursive: true, force: true });
  }
});

test('an owner-authorized continuation between freeze and closeout is recorded, bounded, and pinned', () => {
  const base = closeoutFixture('h1', { apply: false });
  try {
    const { fx, result } = base;
    // The frozen subject has moved before closeout (this repository's exact
    // Phase-A reality): an owner-authorized repair changed implementation
    // bytes and the task context's Change Log.
    fs.writeFileSync(path.join(fx.root, 'src', 'contract.js'), 'module.exports = { closeout: true };\n');
    const contextPath = path.join(fx.root, CONTEXT_RELATIVE);
    const frozenContext = fs.readFileSync(contextPath, 'utf8');
    fs.writeFileSync(contextPath, frozenContext.replace(
      '| 2026-08-17 | Initial |',
      '| 2026-08-17 | Initial |\n| 2026-08-17 | Owner-authorized continuation |',
    ));
    // The external review lands on the post-continuation subject — the state
    // the closeout starts from.
    writeExternalReviewReceipt(fx.root);
    const movedBefore = observeCloseoutSubject(fx.root);
    applyPrescribedCloseout(fx.root);

    // Without a continuation record the closeout cannot start from a subject
    // the RESULT never froze: typed stop, never a silent rebind.
    writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), closeoutReceipt(fx, result, movedBefore));
    const unrecorded = validate(fx.root, '--live');
    assert.equal(unrecorded.status, 1, unrecorded.stdout);
    assert.ok(codes(unrecorded.report).has('closeout_binding'), unrecorded.stdout);

    const authorityRefs = [{
      path: `.ultra/evidence/${TASK_ID}/external-review.json`,
      sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, '.ultra', 'evidence', TASK_ID, 'external-review.json'))),
    }];
    const continuation = {
      from_worktree_digest: result.final_worktree_digest,
      delta_paths: [
        { path: 'src/contract.js', sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, 'src', 'contract.js'))) },
        { path: CONTEXT_RELATIVE, sha256: movedBefore.context_sha256 },
      ],
      authority_refs: authorityRefs,
    };
    writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), closeoutReceipt(fx, result, movedBefore, { continuation }));
    const recorded = validate(fx.root, '--live');
    assert.equal(recorded.status, 0, recorded.stdout);

    // A continuation that under-reports the delta, pins stale bytes,
    // contradicts the closeout-start bytes of a prescribed path, or cites an
    // unreadable authority stays typed-stale.
    const withContinuation = (overrides) => closeoutReceipt(fx, result, movedBefore, {
      continuation: { ...continuation, ...overrides },
    });

    fs.writeFileSync(path.join(fx.root, 'src', 'unlisted.js'), 'module.exports = 4;\n');
    writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), withContinuation({}));
    let under = validate(fx.root, '--live');
    assert.equal(under.status, 1, under.stdout);
    assert.ok(codes(under.report).has('closeout_binding'), under.stdout);
    fs.rmSync(path.join(fx.root, 'src', 'unlisted.js'));

    writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), withContinuation({
      delta_paths: [
        { path: 'src/contract.js', sha256: 'f'.repeat(64) },
        continuation.delta_paths[1],
      ],
    }));
    let stale = validate(fx.root, '--live');
    assert.equal(stale.status, 1, stale.stdout);
    assert.ok(codes(stale.report).has('closeout_binding'), stale.stdout);

    writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), withContinuation({
      delta_paths: [
        continuation.delta_paths[0],
        { path: CONTEXT_RELATIVE, sha256: '0'.repeat(64) },
      ],
    }));
    let contradicted = validate(fx.root, '--live');
    assert.equal(contradicted.status, 1, contradicted.stdout);
    assert.ok(codes(contradicted.report).has('closeout_schema'), contradicted.stdout);

    writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), withContinuation({
      authority_refs: [{ path: `.ultra/evidence/${TASK_ID}/ghost.log`, sha256: '0'.repeat(64) }],
    }));
    let ghost = validate(fx.root, '--live');
    assert.equal(ghost.status, 1, ghost.stdout);
    assert.ok(codes(ghost.report).has('closeout_schema'), ghost.stdout);
  } finally {
    fs.rmSync(base.fx.root, { recursive: true, force: true });
  }
});

test('the closed task ledger row is bound ex-status: drift, missing, and duplicate rows are typed stops', () => {
  const base = closeoutFixture();
  try {
    const { fx, result, before } = base;
    const ledgerPath = path.join(fx.root, LEDGER_RELATIVE);
    const original = fs.readFileSync(ledgerPath, 'utf8');
    const parsed = JSON.parse(original);
    const bind = () => writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), closeoutReceipt(fx, result, before));
    const rowOf = (ledger) => ledger.tasks.find((row) => row.id === TASK_ID);

    // Codex evidence 1 mutant: the accepted task row's title changes during
    // the prescribed closeout — before/after canonical ex-status digests
    // disagree, so an honestly computed receipt still cannot bind.
    const titleMutated = JSON.parse(original);
    rowOf(titleMutated).title = 'Mutated during closeout';
    fs.writeFileSync(ledgerPath, `${JSON.stringify(titleMutated, null, 2)}\n`);
    bind();
    let drifted = validate(fx.root, '--live');
    assert.equal(drifted.status, 1, drifted.stdout);
    assert.ok(codes(drifted.report).has('closeout_task_row'), drifted.stdout);

    fs.writeFileSync(ledgerPath, original);
    bind();
    assert.equal(validate(fx.root, '--live').status, 0);

    // Post-closeout field drift on the current row (beyond the status flip).
    const contextFileMutated = JSON.parse(original);
    rowOf(contextFileMutated).context_file = '.ultra/contexts/task-smuggled.md';
    fs.writeFileSync(ledgerPath, `${JSON.stringify(contextFileMutated, null, 2)}\n`);
    drifted = validate(fx.root, '--live');
    assert.equal(drifted.status, 1, drifted.stdout);
    assert.ok(codes(drifted.report).has('closeout_task_row'), drifted.stdout);

    // A missing or duplicated current row is a typed stop, never a pass.
    const withoutRow = JSON.parse(original);
    withoutRow.tasks = withoutRow.tasks.filter((row) => row.id !== TASK_ID);
    fs.writeFileSync(ledgerPath, `${JSON.stringify(withoutRow, null, 2)}\n`);
    drifted = validate(fx.root, '--live');
    assert.equal(drifted.status, 1, drifted.stdout);
    assert.ok(codes(drifted.report).has('closeout_task_row'), drifted.stdout);

    const duplicated = JSON.parse(original);
    duplicated.tasks.push({ ...rowOf(duplicated) });
    fs.writeFileSync(ledgerPath, `${JSON.stringify(duplicated, null, 2)}\n`);
    drifted = validate(fx.root, '--live');
    assert.equal(drifted.status, 1, drifted.stdout);
    assert.ok(codes(drifted.report).has('closeout_task_row'), drifted.stdout);

    fs.writeFileSync(ledgerPath, original);
    assert.equal(validate(fx.root, '--live').status, 0);
    assert.equal(parsed.tasks.length, 1);
  } finally {
    fs.rmSync(base.fx.root, { recursive: true, force: true });
  }
});

test('the authorized_by receipt binds existing ultra-external-review-receipt-v1 semantics', () => {
  // Codex evidence 2 and its siblings: each mutant IS the review receipt at
  // closeout start, with authorized_by citing its exact recomputed SHA — only
  // the bound semantics can still reject it.
  const mutants = [
    ['request_changes verdict with a P1 finding', (r) => ({
      ...r, verdict: 'request_changes', findings: [{ id: 'F1', severity: 'P1', title: 'Blocking' }],
    })],
    ['approve with an unresolved P1 finding', (r) => ({
      ...r, findings: [{ id: 'F1', severity: 'P1', title: 'Blocking' }],
    })],
    ['non-read-only reviewer role', (r) => ({ ...r, reviewer_role: 'writer' })],
    ['foreign task identity', (r) => ({ ...r, task_id: 'someone-elses-task' })],
    ['foreign change identity', (r) => ({ ...r, change_id: 'chg-someone-else' })],
    ['subject digest off the closeout start', (r) => ({
      ...r, subject: { ...r.subject, worktree_digest: 'f'.repeat(64) },
    })],
    ['subject head off the frozen HEAD', (r) => ({
      ...r, subject: { ...r.subject, git_head: '0'.repeat(40) },
    })],
    ['reviewed contract digest drift', (r) => ({
      ...r, reviewed_contract: { ...r.reviewed_contract, sha256: 'f'.repeat(64) },
    })],
    ['reviewer authority digest drift', (r) => ({
      ...r, reviewer_authority: { ...r.reviewer_authority, sha256: 'f'.repeat(64) },
    })],
    ['strict-summary masquerade', (r) => ({ ...r, $schema: 'ultra-review-summary-v1' })],
  ];

  const scenario = (mutate) => {
    const base = closeoutFixture('h1', { apply: false });
    try {
      const { fx, result } = base;
      writeExternalReviewReceipt(fx.root, mutate);
      const before = observeCloseoutSubject(fx.root);
      applyPrescribedCloseout(fx.root);
      writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), closeoutReceipt(fx, result, before));
      return validate(fx.root, '--live');
    } finally {
      fs.rmSync(base.fx.root, { recursive: true, force: true });
    }
  };

  for (const [name, mutate] of mutants) {
    const bad = scenario(mutate);
    assert.equal(bad.status, 1, `expected a closeout_authorization stop for ${name}: ${bad.stdout}`);
    assert.ok(codes(bad.report).has('closeout_authorization'), `expected closeout_authorization for ${name}: ${bad.stdout}`);
  }

  // The honest receipt — and a retained, non-blocking P2 — stay green.
  let honest = scenario((r) => r);
  assert.equal(honest.status, 0, honest.stdout);
  let retained = scenario((r) => ({ ...r, findings: [{ id: 'F2', severity: 'P2', title: 'Retained, non-blocking' }] }));
  assert.equal(retained.status, 0, retained.stdout);
});

test('an unplanned external review receipt is a typed closeout stop', () => {
  // The owner blocker: the external review receipt must be a Planned Path
  // Inventory entry of the task context before the review, or the closeout
  // is a typed authorization stop — the repository evidence audit and the
  // closeout contract must never disagree at closeout time. Planning is the
  // audit's exact Markdown bullet, so a near-match line ending
  // external-review.json.bak is not the planned receipt either.
  const receiptLine = '- `.ultra/evidence/fixture-task-1/external-review.json`';
  for (const variant of ['absent', 'near-match']) {
    const fx = fixture();
    try {
      fs.mkdirSync(path.join(fx.root, '.ultra', 'contexts'), { recursive: true });
      const planned = variant === 'absent'
        ? fixtureContextText().replace(`\n${receiptLine}`, '')
        : fixtureContextText().replace(receiptLine, `${receiptLine}.bak`);
      fs.writeFileSync(path.join(fx.root, CONTEXT_RELATIVE), `${planned}\n`);
      fs.mkdirSync(path.join(fx.root, 'src'));
      fs.writeFileSync(path.join(fx.root, 'src', 'feature.js'), 'module.exports = 1;\n');
      fs.mkdirSync(path.join(fx.root, '.ultra', 'decisions'), { recursive: true });
      fs.writeFileSync(path.join(fx.root, '.ultra', 'decisions', 'fixture-grant.md'), '# Fixture owner grant\n\nAuthorizes the fixture external review.\n');

      const inputs = [
        {
          purpose: 'accepted implementation design',
          path: 'design.md',
          sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, 'design.md'))),
        },
        {
          purpose: 'canonical task context',
          path: CONTEXT_RELATIVE,
          sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, CONTEXT_RELATIVE))),
        },
      ];
      const offer = bindRealDigest(fx, offerFor(fx, { frozen_inputs: inputs }));
      writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
      writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
      const result = resultV2For(fx, offer);
      writeJson(path.join(fx.handoff, 'RESULT.json'), result);

      writeExternalReviewReceipt(fx.root);
      const before = observeCloseoutSubject(fx.root);
      applyPrescribedCloseout(fx.root);
      writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), closeoutReceipt(fx, result, before));

      const bad = validate(fx.root, '--live');
      assert.equal(bad.status, 1, `expected a closeout_authorization stop for the ${variant} receipt entry: ${bad.stdout}`);
      assert.ok(codes(bad.report).has('closeout_authorization'), `expected closeout_authorization for the ${variant} variant: ${bad.stdout}`);
    } finally {
      fs.rmSync(fx.root, { recursive: true, force: true });
    }
  }

  // Planning the receipt in the PPI is a pre-review duty, not a closeout
  // write: adding the entry only after the closeout started still leaves
  // the pinned prefix frozen, so the stop stands until the owner restarts
  // the closeout from a properly planned context.
  const fx = fixture();
  try {
    fs.mkdirSync(path.join(fx.root, '.ultra', 'contexts'), { recursive: true });
    fs.writeFileSync(path.join(fx.root, CONTEXT_RELATIVE), `${fixtureContextText().replace(`\n${receiptLine}`, '')}\n`);
    fs.mkdirSync(path.join(fx.root, 'src'));
    fs.writeFileSync(path.join(fx.root, 'src', 'feature.js'), 'module.exports = 1;\n');
    fs.mkdirSync(path.join(fx.root, '.ultra', 'decisions'), { recursive: true });
    fs.writeFileSync(path.join(fx.root, '.ultra', 'decisions', 'fixture-grant.md'), '# Fixture owner grant\n\nAuthorizes the fixture external review.\n');
    const inputs = [
      {
        purpose: 'accepted implementation design',
        path: 'design.md',
        sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, 'design.md'))),
      },
      {
        purpose: 'canonical task context',
        path: CONTEXT_RELATIVE,
        sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, CONTEXT_RELATIVE))),
      },
    ];
    const offer = bindRealDigest(fx, offerFor(fx, { frozen_inputs: inputs }));
    writeJson(path.join(fx.handoff, 'OFFER.json'), offer);
    writeJson(path.join(fx.handoff, 'ACK.json'), ackFor(fx, offer));
    const result = resultV2For(fx, offer);
    writeJson(path.join(fx.handoff, 'RESULT.json'), result);
    writeExternalReviewReceipt(fx.root);
    const before = observeCloseoutSubject(fx.root);
    applyPrescribedCloseout(fx.root);
    writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), closeoutReceipt(fx, result, before));
    const contextPath = path.join(fx.root, CONTEXT_RELATIVE);
    const text = fs.readFileSync(contextPath, 'utf8');
    fs.writeFileSync(contextPath, text.replace('- `src/feature.js`', '- `src/feature.js`\n- `.ultra/evidence/fixture-task-1/external-review.json`'));
    const stillStopped = validate(fx.root, '--live');
    assert.equal(stillStopped.status, 1, stillStopped.stdout);
    assert.ok(codes(stillStopped.report).has('closeout_scope_drift'), stillStopped.stdout);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('history stays preserved: a superseded closeout receipt is historical, and v1 stays v1', () => {
  const base = closeoutFixture('h1');
  try {
    const { fx, result, before } = base;
    writeJson(path.join(fx.handoff, 'CLOSEOUT.json'), closeoutReceipt(fx, result, before));
    assert.equal(validate(fx.root, '--live').status, 0);

    // A newer same-subject handoff supersedes the closed-out receipt exactly
    // like a plain terminal receipt; the closeout stays readable history.
    const newerDir = path.join(fx.root, '.ultra', '.runtime', 'handoffs', 'h2');
    fs.mkdirSync(newerDir, { recursive: true });
    const newerFx = { ...fx, name: 'h2', handoff: newerDir };
    const newer = bindRealDigest(newerFx, offerFor(newerFx, {
      created_at: '2026-08-17T14:00:00+08:00',
      frozen_inputs: [
        {
          purpose: 'accepted implementation design',
          path: 'design.md',
          sha256: sha256Bytes(fs.readFileSync(path.join(fx.root, 'design.md'))),
        },
      ],
    }));
    writeJson(path.join(newerDir, 'OFFER.json'), newer);
    writeJson(path.join(newerDir, 'ACK.json'), ackFor(newerFx, newer));

    const report = validate(fx.root, '--live');
    assert.equal(report.status, 0, report.stdout);
    const older = report.report.handoffs.find((entry) => entry.handoff_id === 'h1');
    assert.equal(older.valid, true);
    assert.equal(older.live.historical, true);
    assert.equal(older.live.closeout, undefined);
  } finally {
    fs.rmSync(base.fx.root, { recursive: true, force: true });
  }
});
