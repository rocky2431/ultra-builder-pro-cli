#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_IDENTIFIER_BYTES = 128;
const MAX_REPOSITORY_REF_BYTES = 4096;

const ROOT_KEYS = [
  '$schema',
  'task_id',
  'change_id',
  'context',
  'subject',
  'acceptance',
  'dimensions',
  'task_review',
  'artifacts',
  'limitations',
  'timestamp',
];
const DIMENSION_KEYS = [
  'feature_flags_audit',
  'persistence_real',
  'spec_trace',
  'tests_passed',
  'tests_written',
  'vertical_slice',
];
const VERIFICATION_TYPES = new Set([
  'command',
  'inspection',
  'owner-judgment',
  'external-observation',
]);
const RESULT_TYPES = new Set(['satisfied', 'gap', 'not_applicable']);
const TASK_REVIEW_MODES = new Set(['strict-v4', 'external-manual']);
const EXTERNAL_RECEIPT_SCHEMA = 'ultra-external-review-receipt-v1';
const EXTERNAL_VERDICTS = new Set(['approve', 'request_changes']);
const FINDING_SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const MAX_EXTERNAL_RECEIPT_BYTES = 8 * 1024 * 1024;

function exactKeys(value, expected) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeIdentifier(value) {
  return typeof value === 'string'
    && Buffer.byteLength(value, 'utf8') <= MAX_IDENTIFIER_BYTES
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function safeRepositoryRef(value) {
  if (!nonempty(value)
      || Buffer.byteLength(value, 'utf8') > MAX_REPOSITORY_REF_BYTES
      || value.includes('\\')
      || /[\u0000-\u001f\u007f]/u.test(value)
      || path.posix.isAbsolute(value)
      || path.win32.isAbsolute(value)
      || path.posix.normalize(value) !== value) {
    return false;
  }
  const segments = value.split('/');
  return segments.length > 0
    && segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function digest(value, length) {
  return typeof value === 'string'
    && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
}

function timestamp(value) {
  if (!nonempty(value)) return false;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/,
  );
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    offsetSign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]
      || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  if (offsetSign
      && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

function strings(value, { nonemptyArray = false } = {}) {
  return Array.isArray(value)
    && (!nonemptyArray || value.length > 0)
    && value.every(nonempty);
}

function diagnostic(diagnostics, code, at, message) {
  diagnostics.push({ code, at, message });
}

function inputFailure(code, inputPath, message) {
  return {
    valid: false,
    classification: 'invalid',
    diagnostics: [{ code, at: inputPath, message }],
  };
}

function sameFileObservation(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readBoundedStablePath(input) {
  const resolved = path.resolve(input);
  let beforePath;
  try {
    beforePath = fs.lstatSync(resolved, { bigint: true });
  } catch (error) {
    return {
      failure: inputFailure(
        'input_read_error',
        resolved,
        `Task evidence path could not be inspected: ${error.message}`,
      ),
    };
  }
  if (beforePath.isSymbolicLink()) {
    return {
      failure: inputFailure(
        'input_symlink',
        resolved,
        'Task evidence input must be a regular non-symlink file',
      ),
    };
  }
  if (!beforePath.isFile()) {
    return {
      failure: inputFailure(
        'input_not_regular',
        resolved,
        'Task evidence input must be a regular non-symlink file',
      ),
    };
  }
  if (beforePath.size > BigInt(MAX_EVIDENCE_BYTES)) {
    return {
      failure: inputFailure(
        'input_too_large',
        resolved,
        `Task evidence exceeds the ${MAX_EVIDENCE_BYTES}-byte snapshot limit`,
      ),
    };
  }

  let descriptor;
  const chunks = [];
  let observed = 0;
  try {
    descriptor = fs.openSync(
      resolved,
      fs.constants.O_RDONLY
        | fs.constants.O_NONBLOCK
        | (fs.constants.O_NOFOLLOW || 0),
    );
    const beforeDescriptor = fs.fstatSync(descriptor, { bigint: true });
    if (!beforeDescriptor.isFile()
        || !sameFileObservation(beforePath, beforeDescriptor)) {
      return {
        failure: inputFailure(
          'input_changed',
          resolved,
          'Task evidence changed before its stable byte snapshot could be read; retry after writes settle',
        ),
      };
    }

    while (true) {
      const capacity = Math.min(
        READ_CHUNK_BYTES,
        MAX_EVIDENCE_BYTES + 1 - observed,
      );
      const chunk = Buffer.allocUnsafe(capacity);
      const count = fs.readSync(descriptor, chunk, 0, capacity, null);
      if (count === 0) break;
      observed += count;
      if (observed > MAX_EVIDENCE_BYTES) {
        return {
          failure: inputFailure(
            'input_too_large',
            resolved,
            `Task evidence exceeds the ${MAX_EVIDENCE_BYTES}-byte snapshot limit`,
          ),
        };
      }
      chunks.push(Buffer.from(chunk.subarray(0, count)));
    }

    const afterDescriptor = fs.fstatSync(descriptor, { bigint: true });
    const afterPath = fs.lstatSync(resolved, { bigint: true });
    if (afterPath.isSymbolicLink()
        || !afterPath.isFile()
        || !sameFileObservation(beforeDescriptor, afterDescriptor)
        || !sameFileObservation(afterDescriptor, afterPath)
        || BigInt(observed) !== afterDescriptor.size) {
      return {
        failure: inputFailure(
          'input_changed',
          resolved,
          'Task evidence changed while its stable byte snapshot was read; retry after writes settle',
        ),
      };
    }
    return { resolved, bytes: Buffer.concat(chunks, observed) };
  } catch (error) {
    return {
      failure: inputFailure(
        'input_read_error',
        resolved,
        `Task evidence stable byte snapshot could not be read: ${error.message}`,
      ),
    };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function parseCapturedJson(snapshot) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(snapshot.bytes);
  } catch (error) {
    return {
      failure: inputFailure(
        'input_invalid_utf8',
        snapshot.resolved,
        `Task evidence must be strict UTF-8: ${error.message}`,
      ),
    };
  }
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return {
      failure: inputFailure(
        'input_invalid_json',
        snapshot.resolved,
        `Task evidence must be valid JSON: ${error.message}`,
      ),
    };
  }
}

function directoryIdentity(stat) {
  return `${stat.dev}:${stat.ino}:${stat.mode}`;
}

function labelFailure(label, base, at, message) {
  return {
    valid: false,
    classification: 'invalid',
    diagnostics: [{ code: `${label}_${base}`, at, message }],
  };
}

function readRepositoryStableFile(repoRoot, ref, label) {
  // Bounded repository-chain snapshot: the repository root is resolved to its
  // real path (host-level environment links above the root are not managed
  // surface), then the root itself and every managed parent below it must stay
  // ordinary non-symlink directories, the final entry an ordinary regular file
  // opened no-follow, and identities are rechecked after reading. A symlinked
  // or replaced managed ancestor is typed rejection, never followed.
  let root;
  try {
    root = fs.realpathSync(path.resolve(repoRoot));
  } catch (error) {
    return {
      failure: labelFailure(label, 'read_error', ref, `${label} repository root is unavailable: ${error.message}`),
    };
  }
  const segments = ref.split('/');
  const identities = [];
  try {
    {
      const before = fs.lstatSync(root);
      if (before.isSymbolicLink() || !before.isDirectory()) {
        return {
          failure: labelFailure(label, 'ancestor_not_ordinary', ref, `${label} repository root must be an ordinary non-symlink directory`),
        };
      }
      identities.push([root, directoryIdentity(before)]);
    }
    let node = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
      node = path.join(node, segments[index]);
      const before = fs.lstatSync(node);
      if (before.isSymbolicLink() || !before.isDirectory()) {
        return {
          failure: labelFailure(label, 'ancestor_not_ordinary', ref, `${label} path parents must be ordinary non-symlink directories`),
        };
      }
      identities.push([node, directoryIdentity(before)]);
    }
    const filePath = path.join(node, segments[segments.length - 1]);
    const snapshot = readBoundedStablePath(filePath);
    if (snapshot.failure) {
      const base = snapshot.failure.diagnostics[0];
      const mapped = base.code === 'input_read_error' && /ENOENT/.test(base.message)
        ? 'missing'
        : base.code.replace(/^input_/, '');
      return { failure: labelFailure(label, mapped, ref, `${label} could not be observed (${mapped}): ${base.message}`) };
    }
    for (const [directory, identity] of identities) {
      const after = fs.lstatSync(directory);
      if (after.isSymbolicLink() || !after.isDirectory()
        || directoryIdentity(after) !== identity) {
        return {
          failure: labelFailure(label, 'ancestor_replaced', ref, `${label} path changed during its stable snapshot; retry after writes settle`),
        };
      }
    }
    return { resolved: filePath, bytes: snapshot.bytes };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { failure: labelFailure(label, 'missing', ref, `${label} is missing below the repository root`) };
    }
    return { failure: labelFailure(label, 'read_error', ref, `${label} could not be observed: ${error.message}`) };
  }
}

function validateFreshness(value, diagnostics, at) {
  if (!exactKeys(value, ['git_head', 'worktree_digest', 'observed_at'])) {
    diagnostic(diagnostics, 'freshness_shape', at, 'Expected exact git_head, worktree_digest, and observed_at fields');
    return;
  }
  if (!digest(value.git_head, 40)) {
    diagnostic(diagnostics, 'freshness_shape', `${at}.git_head`, 'Expected a lowercase 40-character Git digest');
  }
  if (!digest(value.worktree_digest, 64)) {
    diagnostic(diagnostics, 'freshness_shape', `${at}.worktree_digest`, 'Expected a lowercase 64-character worktree digest');
  }
  if (!timestamp(value.observed_at)) {
    diagnostic(diagnostics, 'freshness_shape', `${at}.observed_at`, 'Expected an RFC 3339 observation time');
  }
}

function validateEvidence(value, verificationType, diagnostics, at) {
  if (verificationType === 'command') {
    if (!exactKeys(value, [
      'command', 'cwd', 'exit_code', 'raw_evidence_ref', 'raw_evidence_sha256',
      'freshness_identity',
    ])) {
      diagnostic(diagnostics, 'evidence_shape', at, 'Command evidence has the wrong fields');
      return;
    }
    if (!nonempty(value.command) || !nonempty(value.cwd)
      || !Number.isInteger(value.exit_code) || !digest(value.raw_evidence_sha256, 64)) {
      diagnostic(diagnostics, 'evidence_shape', at, 'Command evidence requires command, cwd, integer exit_code, and a lowercase raw_evidence_sha256');
    }
    if (!safeRepositoryRef(value.raw_evidence_ref)) {
      diagnostic(diagnostics, 'evidence_ref_shape', `${at}.raw_evidence_ref`, 'raw_evidence_ref must be one normalized repository-relative file path');
    }
    validateFreshness(value.freshness_identity, diagnostics, `${at}.freshness_identity`);
    return;
  }

  if (verificationType === 'inspection') {
    if (!exactKeys(value, ['source', 'observation', 'revision'])
      || !nonempty(value.source) || !nonempty(value.observation) || !nonempty(value.revision)) {
      diagnostic(diagnostics, 'evidence_shape', at, 'Inspection evidence requires exact non-empty source, observation, and revision fields');
    }
    return;
  }

  if (verificationType === 'owner-judgment') {
    if (!exactKeys(value, ['owner_record_ref', 'owner_statement_or_disposition'])
      || !nonempty(value.owner_record_ref) || !nonempty(value.owner_statement_or_disposition)) {
      diagnostic(diagnostics, 'evidence_shape', at, 'Owner judgment requires a durable owner record and non-empty statement or disposition');
    }
    return;
  }

  if (!exactKeys(value, [
    'provider', 'run_id', 'observed_at', 'raw_evidence_ref',
    'raw_evidence_sha256', 'observation',
  ]) || !nonempty(value.provider) || !nonempty(value.run_id)
    || !timestamp(value.observed_at) || !digest(value.raw_evidence_sha256, 64)
    || !nonempty(value.observation)) {
    diagnostic(diagnostics, 'evidence_shape', at, 'External observation requires exact provider, run_id, observed_at, raw_evidence_ref, raw_evidence_sha256, and observation fields');
  }
  if (exactKeys(value, [
    'provider', 'run_id', 'observed_at', 'raw_evidence_ref',
    'raw_evidence_sha256', 'observation',
  ]) && !safeRepositoryRef(value.raw_evidence_ref)) {
    diagnostic(diagnostics, 'evidence_ref_shape', `${at}.raw_evidence_ref`, 'raw_evidence_ref must be one normalized repository-relative file path');
  }
}

function validateAcceptance(value, diagnostics) {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostic(diagnostics, 'acceptance_shape', 'acceptance', 'Acceptance must be a non-empty array');
    return;
  }
  const ids = new Set();
  value.forEach((item, index) => {
    const at = `acceptance[${index}]`;
    if (!exactKeys(item, [
      'criterion_id', 'verification_type', 'evidence', 'disposition',
    ])) {
      diagnostic(diagnostics, 'acceptance_shape', at, 'Acceptance item has the wrong fields');
      return;
    }
    if (!nonempty(item.criterion_id) || ids.has(item.criterion_id)) {
      diagnostic(diagnostics, 'acceptance_shape', `${at}.criterion_id`, 'Criterion ids must be non-empty and unique');
    } else {
      ids.add(item.criterion_id);
    }
    if (!VERIFICATION_TYPES.has(item.verification_type)) {
      diagnostic(diagnostics, 'verification_type', `${at}.verification_type`, 'Unknown verification type');
      return;
    }
    validateEvidence(item.evidence, item.verification_type, diagnostics, `${at}.evidence`);
    if (!exactKeys(item.disposition, ['authority', 'result', 'rationale'])
      || !['model', 'owner'].includes(item.disposition?.authority)
      || !RESULT_TYPES.has(item.disposition?.result)
      || !nonempty(item.disposition?.rationale)) {
      diagnostic(diagnostics, 'disposition_shape', `${at}.disposition`, 'Disposition requires authority, result, and rationale');
      return;
    }
    if (item.verification_type === 'owner-judgment'
      && item.disposition.authority !== 'owner') {
      diagnostic(diagnostics, 'owner_authority_required', `${at}.disposition.authority`, 'Only the owner may disposition owner-judgment acceptance');
    }
  });
}

function validateDimensions(value, diagnostics) {
  if (!exactKeys(value, DIMENSION_KEYS)) {
    diagnostic(diagnostics, 'dimensions_shape', 'dimensions', 'Expected exactly the six coverage dimensions');
    return;
  }
  for (const name of DIMENSION_KEYS) {
    const dimension = value[name];
    if (!exactKeys(dimension, ['status', 'evidence_refs', 'rationale'])
      || !RESULT_TYPES.has(dimension?.status)
      || !strings(dimension?.evidence_refs)
      || !nonempty(dimension?.rationale)) {
      diagnostic(diagnostics, 'dimensions_shape', `dimensions.${name}`, 'Dimension requires status, evidence_refs, and rationale');
    }
  }
}

function validateTaskReview(value, diagnostics, taskId) {
  const mode = Object.hasOwn(value, 'review_mode') ? value.review_mode : 'strict-v4';
  if (!TASK_REVIEW_MODES.has(mode)) {
    diagnostic(diagnostics, 'task_review_shape', 'task_review.review_mode', 'Unknown task review mode');
    return;
  }
  const sharedKeys = ['execution_packet', 'blocking_findings', 'retention'];
  const strictKeys = mode === 'strict-v4'
    ? (Object.hasOwn(value, 'review_mode')
      ? ['review_mode', ...sharedKeys.slice(0, 1), 'session_id', 'summary_ref', 'summary_digest', ...sharedKeys.slice(1)]
      : [...sharedKeys.slice(0, 1), 'session_id', 'summary_ref', 'summary_digest', ...sharedKeys.slice(1)])
    : ['review_mode', ...sharedKeys.slice(0, 1), 'receipt_ref', 'receipt_sha256', ...sharedKeys.slice(1)];
  if (!exactKeys(value, strictKeys)) {
    diagnostic(diagnostics, 'task_review_shape', 'task_review', `Task review has the wrong fields for the ${mode} branch`);
    return;
  }
  const packet = value.execution_packet;
  if (!exactKeys(packet, ['state', 'digest', 'limitation'])) {
    diagnostic(diagnostics, 'task_review_shape', 'task_review.execution_packet', 'Execution packet has the wrong fields');
  } else if (packet.state === 'pre-v1-unavailable') {
    if (packet.digest !== null || !nonempty(packet.limitation)) {
      diagnostic(diagnostics, 'bootstrap_packet_limitation', 'task_review.execution_packet', 'pre-v1-unavailable requires digest null and a non-empty limitation');
    }
  } else if (packet.state === 'available') {
    if (!digest(packet.digest, 64) || (packet.limitation !== null && !nonempty(packet.limitation))) {
      diagnostic(diagnostics, 'task_review_shape', 'task_review.execution_packet', 'available requires a packet digest and null or non-empty limitation');
    }
  } else {
    diagnostic(diagnostics, 'task_review_shape', 'task_review.execution_packet.state', 'Unknown execution packet state');
  }
  if (!nonempty(value.retention)) {
    diagnostic(diagnostics, 'task_review_shape', 'task_review.retention', 'Task review requires a retention instruction');
  }
  if (mode === 'strict-v4') {
    const validSessionId = safeIdentifier(value.session_id);
    if (!validSessionId) {
      diagnostic(diagnostics, 'identity_shape', 'task_review.session_id', 'Review session_id must be one safe identifier component');
    }
    if (!nonempty(value.summary_ref)
      || !digest(value.summary_digest, 64)) {
      diagnostic(diagnostics, 'task_review_shape', 'task_review', 'Task review requires a session, summary identity, and retention instruction');
    }
    if (validSessionId
      && value.summary_ref !== `.ultra/reviews/${value.session_id}/SUMMARY.json`) {
      diagnostic(diagnostics, 'review_summary_identity', 'task_review.summary_ref', 'Review summary_ref must exactly match the declared session_id');
    }
  } else if (!safeRepositoryRef(value.receipt_ref)
    || value.receipt_ref.startsWith('.ultra/reviews/')
    || !value.receipt_ref.endsWith('.json')) {
    diagnostic(diagnostics, 'receipt_ref_shape', 'task_review.receipt_ref', 'External receipt ref must be one normalized repository-relative JSON file path outside .ultra/reviews');
  } else if (safeIdentifier(taskId)
    && !new RegExp(`^\\.ultra/evidence/${taskId}/[A-Za-z0-9][A-Za-z0-9._-]*\\.json$`).test(value.receipt_ref)) {
    diagnostic(diagnostics, 'receipt_ref_shape', 'task_review.receipt_ref', 'External receipt ref must live inside the task evidence directory of the declared task_id');
  }
  if (mode === 'external-manual' && !digest(value.receipt_sha256, 64)) {
    diagnostic(diagnostics, 'task_review_shape', 'task_review.receipt_sha256', 'External receipt binding requires a lowercase SHA-256 digest of the exact receipt bytes');
  }
  if (!Array.isArray(value.blocking_findings)) {
    diagnostic(diagnostics, 'task_review_shape', 'task_review.blocking_findings', 'Blocking findings must be an array');
    return;
  }
  const ids = new Set();
  value.blocking_findings.forEach((finding, index) => {
    const at = `task_review.blocking_findings[${index}]`;
    if (!exactKeys(finding, [
      'id', 'resolution', 'disposition', 'evidence_refresh_refs',
    ]) || !nonempty(finding?.id) || ids.has(finding?.id)
      || !nonempty(finding?.resolution) || !nonempty(finding?.disposition)
      || !strings(finding?.evidence_refresh_refs, { nonemptyArray: true })) {
      diagnostic(diagnostics, 'task_review_shape', at, 'Blocking finding requires a unique id, resolution, disposition, and evidence refresh refs');
    }
    if (nonempty(finding?.id)) ids.add(finding.id);
  });
}

function findRepositoryRoot(evidencePath) {
  let current = path.resolve(path.dirname(evidencePath));
  while (true) {
    if (fs.existsSync(path.join(current, '.ultra'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function validateExternalReceipt(receipt, evidence, diagnostics) {
  if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)) {
    diagnostic(diagnostics, 'receipt_shape', 'external_receipt', 'External receipt must be a JSON object');
    return;
  }
  if (receipt.$schema !== EXTERNAL_RECEIPT_SCHEMA) {
    diagnostic(diagnostics, 'receipt_schema', 'external_receipt.$schema', `External receipt must use ${EXTERNAL_RECEIPT_SCHEMA}; a strict review SUMMARY is not an external receipt`);
    return;
  }
  if (!exactKeys(receipt, [
    '$schema', 'reviewer', 'reviewer_role', 'task_id', 'change_id',
    'reviewer_authority', 'reviewed_contract', 'subject', 'verdict', 'findings',
    'timestamp',
  ])) {
    diagnostic(diagnostics, 'receipt_shape', 'external_receipt', 'External receipt has the wrong fields');
    return;
  }
  if (!nonempty(receipt.reviewer) || receipt.reviewer_role !== 'read-only') {
    diagnostic(diagnostics, 'receipt_shape', 'external_receipt.reviewer', 'External receipt must name its reviewer and record the read-only role');
  }
  if (!safeIdentifier(receipt.task_id) || !safeIdentifier(receipt.change_id)) {
    diagnostic(diagnostics, 'receipt_shape', 'external_receipt.identity', 'External receipt task_id and change_id must be safe identifiers');
  }
  for (const [label, binding] of [
    ['reviewer_authority', receipt.reviewer_authority],
    ['reviewed_contract', receipt.reviewed_contract],
  ]) {
    if (!exactKeys(binding, ['ref', 'sha256'])
      || !safeRepositoryRef(binding?.ref)
      || !digest(binding?.sha256, 64)) {
      diagnostic(diagnostics, 'receipt_shape', `external_receipt.${label}`, `${label} needs a safe repository ref and lowercase SHA-256`);
    }
  }
  if (!digest(receipt.subject?.git_head, 40) || !digest(receipt.subject?.worktree_digest, 64)) {
    diagnostic(diagnostics, 'receipt_shape', 'external_receipt.subject', 'Reviewed subject needs a lowercase 40-hex Git HEAD and 64-hex product-worktree digest');
  }
  if (!EXTERNAL_VERDICTS.has(receipt.verdict)) {
    diagnostic(diagnostics, 'receipt_shape', 'external_receipt.verdict', 'External receipt verdict must be approve or request_changes');
  }
  if (!timestamp(receipt.timestamp)) {
    diagnostic(diagnostics, 'receipt_shape', 'external_receipt.timestamp', 'External receipt needs an RFC 3339 timestamp');
  }
  if (receipt.task_id !== evidence.task_id || receipt.change_id !== evidence.change_id) {
    diagnostic(diagnostics, 'receipt_identity_mismatch', 'external_receipt', 'External receipt task_id/change_id must match the evidence record exactly');
  }
  if (digest(receipt.subject?.git_head, 40)
    && receipt.subject.git_head !== evidence.subject?.git_head) {
    diagnostic(diagnostics, 'receipt_subject_mismatch', 'external_receipt.subject.git_head', 'External receipt reviewed HEAD must match the evidence completion subject HEAD');
  }
  if (digest(receipt.subject?.worktree_digest, 64)
    && receipt.subject.worktree_digest !== evidence.subject?.worktree_digest) {
    diagnostic(diagnostics, 'receipt_subject_mismatch', 'external_receipt.subject.worktree_digest', 'External receipt reviewed product-worktree digest must match the evidence completion subject digest');
  }
  const severityById = new Map();
  if (Array.isArray(receipt.findings)) {
    receipt.findings.forEach((finding, index) => {
      if (!exactKeys(finding, ['id', 'severity', 'title'])
        || !nonempty(finding?.id) || !nonempty(finding?.title)
        || !FINDING_SEVERITIES.has(finding?.severity)) {
        diagnostic(diagnostics, 'receipt_shape', `external_receipt.findings[${index}]`, 'External finding requires id, P0-P3 severity, and title');
      }
      if (nonempty(finding?.id)) {
        if (severityById.has(finding.id)) {
          diagnostic(diagnostics, 'receipt_shape', `external_receipt.findings[${index}].id`, 'External finding ids must be unique');
        }
        severityById.set(finding.id, finding?.severity);
      }
    });
  } else {
    diagnostic(diagnostics, 'receipt_shape', 'external_receipt.findings', 'External findings must be an array');
  }
  const blockingIds = new Set(
    (evidence.task_review?.blocking_findings ?? [])
      .map((finding) => finding?.id)
      .filter((id) => typeof id === 'string' && id.length > 0),
  );
  const receiptBlockingIds = new Set(
    [...severityById.entries()]
      .filter(([, severity]) => severity === 'P0' || severity === 'P1')
      .map(([id]) => id),
  );
  for (const id of receiptBlockingIds) {
    if (!blockingIds.has(id)) {
      diagnostic(diagnostics, 'receipt_blocking_set_unbound', `external_receipt.findings.${id}`, 'Every current P0/P1 receipt finding must have a matching blocking disposition');
    }
  }
  for (const id of blockingIds) {
    const severity = severityById.get(id);
    if (severity === undefined) {
      diagnostic(diagnostics, 'receipt_blocking_set_unbound', `task_review.blocking_findings.${id}`, 'Every blocking disposition must name a finding carried by the external receipt');
    } else if (severity !== 'P0' && severity !== 'P1') {
      diagnostic(diagnostics, 'receipt_blocking_set_unbound', `task_review.blocking_findings.${id}`, 'Blocking dispositions may bind only receipt findings whose severity is P0 or P1');
    }
  }
  if (receipt.verdict === 'approve' && receiptBlockingIds.size > 0) {
    diagnostic(diagnostics, 'receipt_verdict_inconsistent', 'external_receipt.verdict', 'An approve verdict cannot carry unresolved P0/P1 findings');
  }
  if (receipt.verdict === 'request_changes' && receiptBlockingIds.size === 0) {
    diagnostic(diagnostics, 'receipt_verdict_inconsistent', 'external_receipt.verdict', 'A request_changes verdict must carry at least one current P0/P1 finding');
  }
}

function verifyExternalReceipt(evidencePath, evidence) {
  const diagnostics = [];
  if ((evidence?.task_review?.review_mode ?? 'strict-v4') !== 'external-manual') {
    diagnostic(diagnostics, 'unsupported_review_branch', 'task_review.review_mode', 'External receipt verification applies only to the external-manual branch; strict-v4 summaries use the review waiter');
    return diagnostics;
  }
  const repositoryRoot = findRepositoryRoot(evidencePath);
  if (repositoryRoot === null) {
    diagnostic(diagnostics, 'receipt_read_error', '$', 'External receipt could not be resolved: no repository root with a .ultra directory was found above the evidence file');
    return diagnostics;
  }
  const receiptSnapshot = readRepositoryStableFile(
    repositoryRoot,
    evidence.task_review.receipt_ref,
    'receipt',
  );
  if (receiptSnapshot.failure) {
    diagnostics.push(...receiptSnapshot.failure.diagnostics);
    return diagnostics;
  }
  const observedDigest = crypto.createHash('sha256').update(receiptSnapshot.bytes).digest('hex');
  if (observedDigest !== evidence.task_review.receipt_sha256) {
    diagnostic(diagnostics, 'receipt_digest_mismatch', evidence.task_review.receipt_ref, 'Recorded receipt_sha256 does not match the observed stable receipt bytes');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(receiptSnapshot.bytes);
  } catch (error) {
    diagnostic(diagnostics, 'receipt_invalid_utf8', evidence.task_review.receipt_ref, `External review receipt must be strict UTF-8: ${error.message}`);
    return diagnostics;
  }
  let receipt;
  try {
    receipt = JSON.parse(text);
  } catch (error) {
    diagnostic(diagnostics, 'receipt_invalid_json', evidence.task_review.receipt_ref, `External review receipt must be valid JSON: ${error.message}`);
    return diagnostics;
  }
  validateExternalReceipt(receipt, evidence, diagnostics);
  for (const [label, binding] of [
    ['receipt_contract', receipt?.reviewed_contract],
    ['receipt_authority', receipt?.reviewer_authority],
  ]) {
    if (!exactKeys(binding, ['ref', 'sha256']) || !safeRepositoryRef(binding?.ref)) continue;
    const bound = readRepositoryStableFile(repositoryRoot, binding.ref, label);
    if (bound.failure) {
      diagnostics.push(...bound.failure.diagnostics);
      continue;
    }
    const boundDigest = crypto.createHash('sha256').update(bound.bytes).digest('hex');
    if (boundDigest !== binding.sha256) {
      diagnostic(diagnostics, `${label}_digest_mismatch`, binding.ref, `${label} digest does not match the observed repository bytes`);
    }
  }
  return diagnostics;
}

function projectionFor(value, evidencePath, evidenceBytes) {
  const repositoryRoot = findRepositoryRoot(evidencePath);
  const evidenceRef = repositoryRoot !== null
    ? path.relative(repositoryRoot, path.resolve(evidencePath)).split(path.sep).join('/')
    : path.basename(evidencePath);
  const evidenceDigest = crypto.createHash('sha256').update(evidenceBytes).digest('hex');
  const base = {
    task_id: value.task_id,
    schema: 'ultra-task-evidence-v2',
    evidence_ref: evidenceRef,
    evidence_digest: evidenceDigest,
  };
  if ((value.task_review?.review_mode ?? 'strict-v4') === 'external-manual') {
    return {
      ...base,
      task_review_mode: 'external-manual',
      task_review_receipt_ref: value.task_review.receipt_ref,
      task_review_receipt_digest: value.task_review.receipt_sha256,
    };
  }
  return {
    ...base,
    task_review_session: value.task_review.session_id,
    task_review_summary_digest: value.task_review.summary_digest,
  };
}

function validateV2(value) {
  const diagnostics = [];
  if (!exactKeys(value, ROOT_KEYS)
      || !Object.keys(value).every((key, index) => key === ROOT_KEYS[index])) {
    diagnostic(diagnostics, 'root_shape', '$', `Expected exact root fields: ${ROOT_KEYS.join(', ')}`);
    return diagnostics;
  }
  const validTaskId = safeIdentifier(value.task_id);
  if (!validTaskId) {
    diagnostic(diagnostics, 'identity_shape', 'task_id', 'task_id must be one safe identifier component');
  }
  if (!safeIdentifier(value.change_id)) {
    diagnostic(diagnostics, 'identity_shape', 'change_id', 'change_id must be one safe identifier component');
  }
  if (!exactKeys(value.context, ['path', 'acceptance_sha256'])
    || !nonempty(value.context?.path) || !digest(value.context?.acceptance_sha256, 64)) {
    diagnostic(diagnostics, 'context_shape', 'context', 'Context requires only path and Acceptance-section SHA-256');
  } else if (validTaskId
      && value.context.path !== `.ultra/contexts/task-${value.task_id}.md`) {
    diagnostic(diagnostics, 'context_identity', 'context.path', 'Context path must exactly match the declared task_id');
  }
  validateFreshness(value.subject, diagnostics, 'subject');
  validateAcceptance(value.acceptance, diagnostics);
  validateDimensions(value.dimensions, diagnostics);
  validateTaskReview(value.task_review, diagnostics, value.task_id);
  if (!strings(value.artifacts, { nonemptyArray: true })) {
    diagnostic(diagnostics, 'artifacts_shape', 'artifacts', 'Artifacts must be a non-empty string array');
  }
  if (!strings(value.limitations)) {
    diagnostic(diagnostics, 'limitations_shape', 'limitations', 'Limitations must be a string array');
  }
  if (!timestamp(value.timestamp)) {
    diagnostic(diagnostics, 'timestamp_shape', 'timestamp', 'Expected an RFC 3339 timestamp');
  }
  return diagnostics;
}

function main(argv) {
  const verifyReceipt = argv.includes('--verify-external-receipt');
  const wantProjection = argv.includes('--projection');
  const inputs = argv.filter((argument) =>
    argument !== '--verify-external-receipt' && argument !== '--projection');
  if (inputs.length !== 1) {
    process.stdout.write(`${JSON.stringify({
      valid: false,
      classification: 'invalid',
      diagnostics: [{
        code: 'usage',
        at: '$',
        message: 'usage: validate_task_evidence.cjs <evidence.json> [--verify-external-receipt] [--projection]',
      }],
    })}\n`);
    return 1;
  }

  const snapshot = readBoundedStablePath(inputs[0]);
  if (snapshot.failure) {
    process.stdout.write(`${JSON.stringify(snapshot.failure)}\n`);
    return 1;
  }
  const parsed = parseCapturedJson(snapshot);
  if (parsed.failure) {
    process.stdout.write(`${JSON.stringify(parsed.failure)}\n`);
    return 1;
  }
  const { value } = parsed;

  if (value?.$schema === 'ultra-task-evidence-v1') {
    process.stdout.write(`${JSON.stringify({
      valid: true,
      classification: 'legacy-v1',
      diagnostics: [{
        code: 'legacy_evidence_v1',
        at: '$schema',
        message: 'Readable historical evidence; migrate before using it for a v2 completion claim',
      }],
    })}\n`);
    return 0;
  }

  if (value?.$schema !== 'ultra-task-evidence-v2') {
    process.stdout.write(`${JSON.stringify({
      valid: false,
      classification: 'unknown',
      diagnostics: [{ code: 'unknown_schema', at: '$schema', message: 'Unknown task evidence schema' }],
    })}\n`);
    return 1;
  }

  const diagnostics = validateV2(value);
  // An external-manual record's receipt verification is mandatory on every
  // canonical invocation; --verify-external-receipt stays a compatible alias.
  const branch = value?.task_review?.review_mode ?? 'strict-v4';
  if (diagnostics.length === 0 && branch === 'external-manual') {
    diagnostics.push(...verifyExternalReceipt(inputs[0], value));
  } else if (verifyReceipt && diagnostics.length === 0 && branch === 'strict-v4') {
    diagnostics.push(...verifyExternalReceipt(inputs[0], value));
  }
  const output = {
    valid: diagnostics.length === 0,
    classification: 'current-v2',
    diagnostics,
  };
  if (wantProjection && diagnostics.length === 0) {
    output.projection = projectionFor(value, inputs[0], snapshot.bytes);
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
  return diagnostics.length === 0 ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
