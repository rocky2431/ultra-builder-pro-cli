#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const REPORT_SCHEMA = 'ultra-primary-transfer-validation-v1';
const OFFER_SCHEMA = 'ultra-primary-transfer-offer-v1';
const ACK_SCHEMA = 'ultra-primary-transfer-ack-v1';
const RESULT_SCHEMA = 'ultra-primary-transfer-result-v1';
const RESULT_V2_SCHEMA = 'ultra-primary-transfer-result-v2';
const CLOSEOUT_SCHEMA = 'ultra-primary-transfer-closeout-v1';
// The existing external-review receipt schema this contract binds — never a
// second invented review schema (skills/ultra-plan/references/task-evidence-v2.md).
const EXTERNAL_RECEIPT_SCHEMA = 'ultra-external-review-receipt-v1';
const EXTERNAL_RECEIPT_KEYS = Object.freeze([
  '$schema', 'reviewer', 'reviewer_role', 'task_id', 'change_id',
  'reviewer_authority', 'reviewed_contract', 'subject', 'verdict', 'findings',
  'timestamp',
]);
const EXTERNAL_SEVERITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);
// The task-context sections a prescribed closeout may rewrite; everything
// before the earliest of them stays byte-frozen across the closeout.
const CLOSEOUT_SECTION_HEADINGS = Object.freeze(['## Resume Note', '## Task Review', '## Completion']);
const HANDOFF_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const TERMINAL_STATES = Object.freeze(['completed', 'blocked', 'revoked', 'cancelled', 'failed']);
const RECEIPT_FILES = Object.freeze(['OFFER.json', 'ACK.json', 'RESULT.json', 'CLOSEOUT.json']);
const GIT_TIMEOUT_MS = 5000;
const GIT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 1024 * 1024;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_HANDOFF_ENTRIES = 256;
const DIGEST_TOOL_TIMEOUT_MS = 120000;
const DIGEST_TOOL = path.resolve(__dirname, '..', '..', 'ultra-test', 'scripts', 'worktree_digest.cjs');
// One bounded mechanical primitive set, owned by the worktree-digest tool: the
// product-subject pathspec and the stable repository-contained file snapshot.
const { PRODUCT_PATHSPEC, streamStableRepositoryFile } = require(DIGEST_TOOL);

function diagnostic(code, message, location = null, severity = 'error') {
  return { code, severity, message, location };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonemptyString);
}

function normalizedRelativePath(value) {
  if (!nonemptyString(value) || value.includes('\\') || path.posix.normalize(value) !== value) {
    return false;
  }
  if (value === '.' || value.startsWith('/') || value.includes('../') || value === '..') {
    return false;
  }
  return !value.split('/').includes('..');
}

// Typed mapping from the shared snapshot primitive's codes to receipt
// diagnostics. Every rejection keeps the primitive's own recovery text.
const SNAPSHOT_CODE_MAP = Object.freeze({
  ULTRA_SNAPSHOT_PATH_ESCAPE: 'receipt_path_escape',
  ULTRA_SNAPSHOT_PATH_ENCODING: 'receipt_path_escape',
  ULTRA_SNAPSHOT_SYMLINK: 'receipt_unsafe',
  ULTRA_SNAPSHOT_NOT_DIRECTORY: 'receipt_unsafe',
  ULTRA_SNAPSHOT_UNSUPPORTED: 'receipt_unsafe',
  ULTRA_SNAPSHOT_NOT_REGULAR: 'receipt_not_regular',
  ULTRA_SNAPSHOT_TOO_LARGE: 'receipt_oversize',
  ULTRA_SNAPSHOT_RESOURCE_LIMIT: 'receipt_oversize',
  ULTRA_SNAPSHOT_REPLACED: 'receipt_replaced',
  ULTRA_SNAPSHOT_CHANGED_DURING_OBSERVATION: 'receipt_replaced',
  ULTRA_SNAPSHOT_UNREADABLE: 'receipt_unreadable',
});

// Stable, repository-contained, ordinary-file, no-follow read through the one
// shared bounded snapshot primitive: the repository-relative path is validated
// before any filesystem access, the complete parent chain is walked as
// ordinary non-symlink directories, the leaf opens O_NOFOLLOW|O_NONBLOCK, and
// fresh root rewalks replay every parent and file identity after reading.
function stableReadBytes(repoRoot, relative, maxBytes) {
  const chunks = [];
  try {
    streamStableRepositoryFile(repoRoot, relative, (chunk) => chunks.push(Buffer.from(chunk)));
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const match = /^(ULTRA_SNAPSHOT_[A-Z_]+):/.exec(message);
    const code = match ? SNAPSHOT_CODE_MAP[match[1]] || 'receipt_unreadable' : 'receipt_unreadable';
    if (match && match[1] === 'ULTRA_SNAPSHOT_MISSING') return { missing: true };
    throw { code, message };
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length > maxBytes) {
    throw {
      code: 'receipt_oversize',
      message: `ULTRA_RECEIPT_OVERSIZE: ${relative} exceeds the ${maxBytes}-byte receipt/input ceiling. Split or shrink the file, then re-run the validator.`,
    };
  }
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw {
      code: 'receipt_encoding',
      message: `ULTRA_RECEIPT_ENCODING: ${relative} is not strict UTF-8. Restore the file as valid UTF-8 bytes, then re-run the validator.`,
    };
  }
  return { bytes, text };
}

function readJsonFile(repoRoot, relative) {
  let read;
  try {
    read = stableReadBytes(repoRoot, relative, MAX_RECEIPT_BYTES);
  } catch (error) {
    return { readCode: error.code, readMessage: error.message };
  }
  if (read.missing) return { missing: true };
  try {
    return { parsed: JSON.parse(read.text) };
  } catch (error) {
    return { jsonError: error.message };
  }
}

// One generic ancestor-first directory observation, shared by repo-wide
// optional handoffs-root discovery and required per-handoff validation.
// Starting from the ordinary repository root, every existing path component is
// lstat'd without following links before its child is touched, so a symlinked
// or special ancestor fails typed even when a later component is absent. For
// an optional observation, a genuinely missing component under ordinary
// ancestors is a legal absent boundary — and absence itself is replayed
// before the result is trusted. An existing final directory streams bounded
// under max+1 and is replayed as an exact entry name/type/identity set.
// Replacement, drift, unreadability, and (for required observations)
// absence are typed fail-closed diagnostics with restore-and-retry recovery.
function stableDirectoryObservation(repoRoot, relative, { required = false } = {}) {
  const dirError = (code, message) => ({ code, message });
  const parts = relative.split('/');

  let rootStat;
  try {
    rootStat = fs.lstatSync(repoRoot, { bigint: true });
  } catch (error) {
    throw dirError('receipt_unsafe', `ULTRA_RECEIPT_UNSAFE: cannot observe the repository root (${error && error.code ? error.code : 'unknown error'}). Restore an ordinary repository directory, then re-run the validator.`);
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw dirError('receipt_unsafe', 'ULTRA_RECEIPT_UNSAFE: the repository root is not an ordinary directory. Restore an ordinary repository directory, then re-run the validator.');
  }
  const chain = [{ absolute: repoRoot, stat: rootStat, component: '.' }];

  let absentBoundary = null;
  let current = repoRoot;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const component = parts.slice(0, index + 1).join('/');
    let stat;
    try {
      stat = fs.lstatSync(current, { bigint: true });
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        if (required) {
          throw dirError('handoff_dir_missing', `ULTRA_HANDOFF_DIR_MISSING: the required handoff directory ${relative} is absent. Restore the ordinary directory, then re-run the validator.`);
        }
        // Optional component: record the absent boundary and stop before
        // touching any deeper child.
        absentBoundary = { absolute: current, component };
        break;
      }
      throw dirError('receipt_unsafe', `ULTRA_RECEIPT_UNSAFE: cannot observe ${component} (${error && error.code ? error.code : 'unknown error'}). Restore the ordinary directory, then re-run the validator.`);
    }
    if (stat.isSymbolicLink()) {
      throw dirError('receipt_unsafe', `ULTRA_RECEIPT_UNSAFE: ${component} is a symlink; ancestor components are never followed, and an empty external target never reads as an absent or empty directory. Restore the ordinary repository directory, then re-run the validator.`);
    }
    if (!stat.isDirectory()) {
      throw dirError('receipt_not_regular', `ULTRA_RECEIPT_NOT_REGULAR: ${component} is not an ordinary directory. Restore the ordinary directory, then re-run the validator.`);
    }
    chain.push({ absolute: current, stat, component });
  }

  const replayAncestors = () => {
    for (const link of chain) {
      let again;
      try {
        again = fs.lstatSync(link.absolute, { bigint: true });
      } catch (error) {
        throw dirError('receipt_replaced', `ULTRA_RECEIPT_REPLACED: ${link.component} disappeared during observation. Let the concurrent change finish, then re-run the validator once.`);
      }
      if (again.dev !== link.stat.dev || again.ino !== link.stat.ino
          || again.mode !== link.stat.mode || again.mtimeNs !== link.stat.mtimeNs) {
        throw dirError('receipt_replaced', `ULTRA_RECEIPT_REPLACED: ${link.component} changed identity during observation. Let the concurrent change finish, then re-run the validator once.`);
      }
    }
  };

  if (absentBoundary !== null) {
    replayAncestors();
    // Replay the still-absent boundary: an optional component that appears
    // during the observation is drift, never a quiet success.
    let appeared = false;
    try {
      fs.lstatSync(absentBoundary.absolute, { bigint: true });
      appeared = true;
    } catch (error) {
      if (!(error && (error.code === 'ENOENT' || error.code === 'ENOTDIR'))) {
        throw dirError('receipt_unsafe', `ULTRA_RECEIPT_UNSAFE: cannot re-observe the absent boundary ${absentBoundary.component} (${error && error.code ? error.code : 'unknown error'}). Restore the ordinary directory, then re-run the validator.`);
      }
    }
    if (appeared) {
      throw dirError('receipt_replaced', `ULTRA_RECEIPT_REPLACED: ${absentBoundary.component} appeared during observation; the absent boundary is not stable. Let the concurrent change finish, then re-run the validator once.`);
    }
    return { absent: true, entries: null };
  }

  const finalDir = chain[chain.length - 1].absolute;
  const snapshotEntries = () => {
    const entries = new Map();
    let handle;
    try {
      handle = fs.opendirSync(finalDir);
    } catch (error) {
      throw dirError('receipt_unsafe', `ULTRA_RECEIPT_UNSAFE: cannot open ${relative} (${error && error.code ? error.code : 'unknown error'}). Restore the ordinary directory, then re-run the validator.`);
    }
    try {
      for (;;) {
        const entry = handle.readSync();
        if (!entry) break;
        if (entries.size >= MAX_HANDOFF_ENTRIES) {
          throw dirError('handoff_scan_limit', `${relative} exceeds the ${MAX_HANDOFF_ENTRIES}-entry physical ceiling. Split or archive runtime observations, then re-run the validator.`);
        }
        let stat;
        try {
          stat = fs.lstatSync(path.join(finalDir, entry.name), { bigint: true });
        } catch (error) {
          throw dirError('receipt_replaced', `ULTRA_RECEIPT_REPLACED: ${relative} entry ${entry.name} disappeared during observation. Let the concurrent change finish, then re-run the validator once.`);
        }
        entries.set(entry.name, { name: entry.name, stat });
      }
    } finally {
      handle.closeSync();
    }
    return entries;
  };

  const first = snapshotEntries();
  replayAncestors();
  const second = snapshotEntries();
  if (second.size !== first.size) {
    throw dirError('receipt_replaced', `ULTRA_RECEIPT_REPLACED: the ${relative} entry set changed during observation. Let the concurrent change finish, then re-run the validator once.`);
  }
  for (const [name, entry] of first) {
    const other = second.get(name);
    if (!other
        || other.stat.dev !== entry.stat.dev
        || other.stat.ino !== entry.stat.ino
        || other.stat.mode !== entry.stat.mode) {
      throw dirError('receipt_replaced', `ULTRA_RECEIPT_REPLACED: ${relative} entry ${name} changed identity during observation. Let the concurrent change finish, then re-run the validator once.`);
    }
  }
  return { absent: false, entries: first };
}

function gitText(cwd, args, maxBuffer = 1024 * 1024) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GIT_TIMEOUT_MS,
  }).trim();
}

function gitHead(cwd) {
  try {
    return gitText(cwd, ['rev-parse', 'HEAD']);
  } catch {
    return null;
  }
}

function gitIsAncestor(cwd, ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GIT_TIMEOUT_MS,
    });
    return true;
  } catch (error) {
    if (error && error.status === 1) return false;
    return false;
  }
}

// The full final worktree subject against a base HEAD, using the digest
// primitive's own product pathspec and untracked file list: present tracked
// changes plus product-scope untracked files, and separately deleted paths.
function manifestAgainst(root, baseHead, digestObservation) {
  const raw = execFileSync('git', [
    'diff', '--raw', '-z', '--no-renames', baseHead, ...PRODUCT_PATHSPEC,
  ], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: GIT_MAX_OUTPUT_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GIT_TIMEOUT_MS,
  });
  const fields = raw.toString('utf8').split('\0').filter(Boolean);
  const present = [];
  const deleted = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index].split(' ').at(-1);
    const file = fields[index + 1];
    if (status === 'D') deleted.push(file);
    else present.push(file);
  }
  return {
    changed: [...new Set([...present, ...digestObservation.untracked_files])].sort(),
    deleted: deleted.sort(),
  };
}

function digestObservation(root) {
  try {
    const stdout = execFileSync(process.execPath, [DIGEST_TOOL, '--project', root], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: DIGEST_TOOL_TIMEOUT_MS,
    });
    const parsed = JSON.parse(stdout);
    if (!isPlainObject(parsed) || !SHA256_PATTERN.test(String(parsed.diff_digest || ''))) {
      return { error: 'the worktree-digest primitive returned an unusable report' };
    }
    return {
      head: parsed.head,
      diff_digest: parsed.diff_digest,
      dirty: parsed.dirty,
      untracked_files: Array.isArray(parsed.untracked_files) ? parsed.untracked_files : [],
    };
  } catch (error) {
    const detail = error && error.stderr
      ? Buffer.from(error.stderr).toString('utf8').trim().split('\n')[0]
      : (error && error.message ? error.message.split('\n')[0] : 'the worktree-digest primitive failed');
    return { error: detail };
  }
}

function handoffRootFor(handoffDir) {
  // <repoRoot>/.ultra/.runtime/handoffs/<handoff-id>
  const id = path.basename(handoffDir);
  const handoffs = path.dirname(handoffDir);
  if (path.basename(handoffs) !== 'handoffs') return null;
  const runtime = path.dirname(handoffs);
  if (path.basename(runtime) !== '.runtime') return null;
  const ultra = path.dirname(runtime);
  if (path.basename(ultra) !== '.ultra') return null;
  const root = path.dirname(ultra);
  return { root, id };
}

const HANDOFFS_ROOT_RELATIVE = '.ultra/.runtime/handoffs';

// Repo-wide handoff-root discovery is one optional ancestor-first directory
// observation — no separate final-leaf preflight. A genuinely missing .ultra,
// .runtime, or handoffs leaf under ordinary ancestors means zero transfers;
// a symlinked, special, unreadable, replaced, or drifting component at any
// depth is a typed failure, even when a later component is absent; and every
// existing entry must be a normalized-id ordinary directory.
function listHandoffDirs(repoRoot) {
  const observation = stableDirectoryObservation(repoRoot, HANDOFFS_ROOT_RELATIVE, { required: false });
  if (observation.absent) return [];
  const handoffsRoot = path.join(repoRoot, HANDOFFS_ROOT_RELATIVE);
  const dirs = [];
  for (const [name, entry] of observation.entries) {
    if (!HANDOFF_ID_PATTERN.test(name)) {
      throw {
        code: 'handoff_entry_malformed',
        message: `the handoffs root holds an entry that is not a normalized handoff id: ${name}. Remove or rename the stray entry, then re-run the validator.`,
      };
    }
    if (entry.stat.isSymbolicLink()) {
      throw {
        code: 'receipt_unsafe',
        message: `ULTRA_RECEIPT_UNSAFE: handoff entry ${name} is a symlink; symlinked handoffs are never followed. Restore the ordinary directory, then re-run the validator.`,
      };
    }
    if (!entry.stat.isDirectory()) {
      throw {
        code: 'handoff_entry_malformed',
        message: `the handoffs root holds a non-directory entry under a handoff id: ${name}. Remove the stray entry, then re-run the validator.`,
      };
    }
    dirs.push(path.join(handoffsRoot, name));
  }
  return dirs.sort();
}

function receiptTime(payload) {
  if (!isPlainObject(payload) || typeof payload.created_at !== 'string') return null;
  const parsed = Date.parse(payload.created_at);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateOffer(handoffId, repoRoot, payload, diagnostics) {
  if (!isPlainObject(payload)) {
    diagnostics.push(diagnostic('offer_schema', 'OFFER.json must be a JSON object', 'OFFER.json'));
    return;
  }
  const offer = payload;
  if (offer.$schema !== OFFER_SCHEMA) {
    diagnostics.push(diagnostic('offer_schema', `OFFER $schema must be ${OFFER_SCHEMA}`, 'OFFER.json.$schema'));
  }
  if (offer.handoff_id !== handoffId) {
    diagnostics.push(diagnostic('offer_field_invalid', 'OFFER handoff_id must match the handoff directory name', 'OFFER.json.handoff_id'));
  }
  if (offer.mode !== 'primary-transfer') {
    diagnostics.push(diagnostic('offer_mode_invalid', 'primary-transfer is the only handoff mode; delegated workers use ultra-delegate receipts', 'OFFER.json.mode'));
  }
  if (offer.state !== 'offered') {
    diagnostics.push(diagnostic('offer_state_invalid', 'OFFER state must be offered', 'OFFER.json.state'));
  }
  for (const [holder, field] of [['sender', 'agent'], ['sender', 'role'], ['receiver', 'agent'], ['receiver', 'role']]) {
    if (!nonemptyString(offer[holder]?.[field])) {
      diagnostics.push(diagnostic('offer_field_missing', `OFFER ${holder}.${field} is required`, `OFFER.json.${holder}.${field}`));
    }
  }
  const repository = offer.repository;
  if (!isPlainObject(repository)) {
    diagnostics.push(diagnostic('offer_field_missing', 'OFFER repository is required', 'OFFER.json.repository'));
  } else {
    if (!nonemptyString(repository.origin)) {
      diagnostics.push(diagnostic('offer_field_missing', 'OFFER repository.origin is required', 'OFFER.json.repository.origin'));
    }
    if (!HEAD_PATTERN.test(String(repository.base_head || ''))) {
      diagnostics.push(diagnostic('offer_field_invalid', 'OFFER repository.base_head must be a 40-character lowercase commit id', 'OFFER.json.repository.base_head'));
    }
    const digest = repository.worktree_digest;
    if (typeof digest === 'string') {
      if (!SHA256_PATTERN.test(digest)) {
        diagnostics.push(diagnostic('offer_field_invalid', 'OFFER repository.worktree_digest must be a 64-character lowercase SHA-256', 'OFFER.json.repository.worktree_digest'));
      }
    } else if (isPlainObject(digest)) {
      if (!SHA256_PATTERN.test(String(digest.diff_digest || ''))) {
        diagnostics.push(diagnostic('offer_field_invalid', 'OFFER repository.worktree_digest.diff_digest must be a 64-character lowercase SHA-256', 'OFFER.json.repository.worktree_digest.diff_digest'));
      }
    } else {
      diagnostics.push(diagnostic('offer_field_invalid', 'OFFER repository.worktree_digest is required', 'OFFER.json.repository.worktree_digest'));
    }
    if (typeof repository.dirty !== 'boolean') {
      diagnostics.push(diagnostic('offer_field_invalid', 'OFFER repository.dirty must be a boolean', 'OFFER.json.repository.dirty'));
    }
    if (!Array.isArray(repository.known_untracked)
        || !repository.known_untracked.every((entry) => nonemptyString(entry) && normalizedRelativePath(entry))) {
      diagnostics.push(diagnostic('offer_field_invalid', 'OFFER repository.known_untracked must list normalized repository-relative paths', 'OFFER.json.repository.known_untracked'));
    }
    if (nonemptyString(repository.root)) {
      let observedRoot = null;
      try {
        observedRoot = fs.realpathSync(repository.root);
      } catch {
        observedRoot = null;
      }
      if (observedRoot === null || observedRoot !== repoRoot) {
        diagnostics.push(diagnostic('repository_root_mismatch', 'OFFER repository.root must be the repository that contains this handoff directory', 'OFFER.json.repository.root'));
      }
    } else {
      diagnostics.push(diagnostic('offer_field_missing', 'OFFER repository.root is required', 'OFFER.json.repository.root'));
    }
  }
  if (!nonemptyString(offer.owner_authorization?.accepted_direction)) {
    diagnostics.push(diagnostic('offer_field_missing', 'OFFER owner_authorization.accepted_direction is required', 'OFFER.json.owner_authorization.accepted_direction'));
  }
  const frozenInputs = offer.frozen_inputs;
  if (!Array.isArray(frozenInputs) || frozenInputs.length === 0) {
    diagnostics.push(diagnostic('offer_field_invalid', 'OFFER frozen_inputs must list at least one frozen input', 'OFFER.json.frozen_inputs'));
  } else {
    const seen = new Set();
    for (const input of frozenInputs) {
      if (!isPlainObject(input)) {
        diagnostics.push(diagnostic('offer_field_invalid', 'each frozen input must be an object', 'OFFER.json.frozen_inputs'));
        continue;
      }
      if (!nonemptyString(input.purpose)
          || !normalizedRelativePath(input.path)
          || !SHA256_PATTERN.test(String(input.sha256 || ''))) {
        diagnostics.push(diagnostic(
          'offer_field_invalid',
          'each frozen input requires a nonempty purpose, a normalized repository-relative path, and a 64-character SHA-256',
          `OFFER.json.frozen_inputs[${input.path || '?'}]`,
        ));
      }
      if (seen.has(input.path)) {
        diagnostics.push(diagnostic('offer_field_invalid', `frozen input path repeated: ${input.path}`, `OFFER.json.frozen_inputs[${input.path}]`));
      }
      seen.add(input.path);
    }
  }
  if (!nonemptyString(offer.accepted_scope?.new_task_identity)) {
    diagnostics.push(diagnostic('offer_field_invalid', 'OFFER accepted_scope.new_task_identity is required', 'OFFER.json.accepted_scope.new_task_identity'));
  }
  const effects = offer.effects;
  if (!isPlainObject(effects)
      || !stringArray(effects.allowed)
      || !stringArray(effects.forbidden)) {
    diagnostics.push(diagnostic('offer_field_invalid', 'OFFER effects.allowed and effects.forbidden must list at least one entry each', 'OFFER.json.effects'));
  }
  const protocol = offer.receiver_protocol;
  if (!isPlainObject(protocol)) {
    diagnostics.push(diagnostic('offer_field_missing', 'OFFER receiver_protocol is required', 'OFFER.json.receiver_protocol'));
  } else {
    if (protocol.ack_path !== `.ultra/.runtime/handoffs/${handoffId}/ACK.json`
        || protocol.result_path !== `.ultra/.runtime/handoffs/${handoffId}/RESULT.json`) {
      diagnostics.push(diagnostic('offer_field_invalid', 'receiver_protocol receipt paths must address this handoff directory', 'OFFER.json.receiver_protocol'));
    }
    if (!Array.isArray(protocol.terminal_states)
        || !TERMINAL_STATES.every((state) => protocol.terminal_states.includes(state))) {
      diagnostics.push(diagnostic(
        'offer_field_invalid',
        `receiver_protocol.terminal_states must include ${TERMINAL_STATES.join(', ')}`,
        'OFFER.json.receiver_protocol.terminal_states',
      ));
    }
  }
}

function offeredDigest(offer) {
  const digest = offer?.repository?.worktree_digest;
  if (typeof digest === 'string') return digest;
  if (isPlainObject(digest)) return typeof digest.diff_digest === 'string' ? digest.diff_digest : null;
  return null;
}

function observedDigest(ack) {
  const digest = ack?.observed?.worktree_digest;
  if (typeof digest === 'string') return digest;
  if (isPlainObject(digest)) return typeof digest.diff_digest === 'string' ? digest.diff_digest : null;
  return null;
}

function validateAck(offer, payload, handoffId, diagnostics) {
  if (!isPlainObject(payload)) {
    diagnostics.push(diagnostic('ack_schema', 'ACK.json must be a JSON object', 'ACK.json'));
    return null;
  }
  const ack = payload;
  if (ack.$schema !== ACK_SCHEMA) {
    diagnostics.push(diagnostic('ack_schema', `ACK $schema must be ${ACK_SCHEMA}`, 'ACK.json.$schema'));
  }
  if (ack.handoff_id !== handoffId) {
    diagnostics.push(diagnostic('ack_schema', 'ACK handoff_id must match the OFFER handoff id', 'ACK.json.handoff_id'));
  }
  const state = ack.state;
  if (state !== 'ready' && state !== 'blocked') {
    diagnostics.push(diagnostic('ack_state_invalid', 'ACK state must be ready or blocked', 'ACK.json.state'));
    return null;
  }
  const acceptedRole = ack.receiver?.accepted_role;
  if (acceptedRole !== offer?.receiver?.role) {
    diagnostics.push(diagnostic('ack_role_mismatch', 'ACK accepted_role must equal the OFFER receiver role', 'ACK.json.receiver.accepted_role'));
  }
  const observations = Array.isArray(ack.observed?.frozen_inputs) ? ack.observed.frozen_inputs : [];
  const byPath = new Map(observations.filter(isPlainObject).map((entry) => [entry.path, entry]));
  const offeredInputs = Array.isArray(offer?.frozen_inputs) ? offer.frozen_inputs.filter(isPlainObject) : [];
  for (const input of offeredInputs) {
    const observed = byPath.get(input.path);
    if (!observed) {
      diagnostics.push(diagnostic(
        'ack_missing_input_observation',
        `ACK must record a stable-read observation for frozen input ${input.path}`,
        `ACK.json.observed.frozen_inputs[${input.path}]`,
      ));
      continue;
    }
    if (observed.offered_sha256 !== input.sha256) {
      diagnostics.push(diagnostic(
        'ack_ready_with_mismatch',
        `ACK offered_sha256 must copy the OFFER sha256 for ${input.path}`,
        `ACK.json.observed.frozen_inputs[${input.path}].offered_sha256`,
      ));
    }
  }
  if (state === 'ready') {
    for (const input of offeredInputs) {
      const observed = byPath.get(input.path);
      if (observed && (observed.match !== true || observed.observed_sha256 !== input.sha256)) {
        diagnostics.push(diagnostic(
          'ack_ready_with_mismatch',
          'a ready ACK requires every frozen input observation to match; a mismatch must be recorded as blocked',
          `ACK.json.observed.frozen_inputs[${input.path}]`,
        ));
      }
    }
    if (ack.observed?.repository?.base_head !== offer?.repository?.base_head) {
      diagnostics.push(diagnostic('ack_ready_with_mismatch', 'a ready ACK must observe the OFFER base HEAD', 'ACK.json.observed.repository.base_head'));
    }
    const offerDigest = offeredDigest(offer);
    const ackDigest = observedDigest(ack);
    if (offerDigest !== null && ackDigest !== offerDigest) {
      diagnostics.push(diagnostic('ack_ready_with_mismatch', 'a ready ACK must observe the OFFER worktree digest', 'ACK.json.observed.worktree_digest'));
    }
  }
  if (state === 'blocked') {
    if (!stringArray(ack.blocked_reasons)) {
      diagnostics.push(diagnostic('ack_blocked_without_reason', 'a blocked ACK must record at least one blocked reason', 'ACK.json.blocked_reasons'));
    }
  }
  return state;
}

function validateResultPaths(handoffId, values, field, diagnostics) {
  if (!Array.isArray(values) || !values.every(nonemptyString)) {
    diagnostics.push(diagnostic('result_schema', `RESULT ${field} must be an array of strings`, `RESULT.json.${field}`));
    return;
  }
  for (const value of values) {
    if (!normalizedRelativePath(value)) {
      diagnostics.push(diagnostic('result_path_invalid', `RESULT ${field} entries must be normalized repository-relative paths: ${value}`, `RESULT.json.${field}`));
      continue;
    }
    const ownReceiptRoot = `.ultra/.runtime/handoffs/${handoffId}/`;
    if (value.startsWith('.ultra/.runtime/') && !value.startsWith(ownReceiptRoot)) {
      diagnostics.push(diagnostic(
        'result_path_invalid',
        `RESULT ${field} may not claim unrelated runtime state: ${value}`,
        `RESULT.json.${field}`,
      ));
    }
  }
}

function validateResult(offer, ackState, payload, handoffId, repoRoot, diagnostics) {
  if (!isPlainObject(payload)) {
    diagnostics.push(diagnostic('result_schema', 'RESULT.json must be a JSON object', 'RESULT.json'));
    return null;
  }
  const result = payload;
  if (result.$schema !== RESULT_SCHEMA && result.$schema !== RESULT_V2_SCHEMA) {
    diagnostics.push(diagnostic('result_schema', `RESULT $schema must be ${RESULT_SCHEMA} or ${RESULT_V2_SCHEMA}`, 'RESULT.json.$schema'));
  }
  if (result.handoff_id !== handoffId) {
    diagnostics.push(diagnostic('result_schema', 'RESULT handoff_id must match the OFFER handoff id', 'RESULT.json.handoff_id'));
  }
  const terminal = result.terminal_state;
  if (!TERMINAL_STATES.includes(terminal)) {
    diagnostics.push(diagnostic('result_terminal_invalid', `RESULT terminal_state must be one of ${TERMINAL_STATES.join(', ')}`, 'RESULT.json.terminal_state'));
  }
  if (terminal === 'completed' && ackState !== 'ready') {
    diagnostics.push(diagnostic(
      'result_without_ready_ack',
      'a completed RESULT requires a ready ACK; no ACK or a blocked ACK cannot complete a transfer',
      'RESULT.json.terminal_state',
    ));
  }
  if (terminal === 'blocked' && ackState !== 'blocked' && !stringArray(result.blocked_reasons)) {
    diagnostics.push(diagnostic(
      'result_blocked_without_reason',
      'a blocked RESULT requires either a blocked ACK or explicit blocked_reasons',
      'RESULT.json.blocked_reasons',
    ));
  }
  if (terminal === 'revoked') {
    const refs = Array.isArray(result.evidence_refs) ? result.evidence_refs.filter(nonemptyString) : [];
    const revocation = refs.filter((ref) => /^\.ultra\/decisions\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/u.test(ref));
    // Revocation evidence must be an ordinary stable repository-contained file,
    // never a symlink or special file that existsSync would follow or trust.
    const readable = revocation.some((ref) => {
      try {
        return !stableReadBytes(repoRoot, ref, MAX_INPUT_BYTES).missing;
      } catch {
        return false;
      }
    });
    if (revocation.length === 0 || !readable) {
      diagnostics.push(diagnostic(
        'result_revocation_evidence_missing',
        'a revoked RESULT must cite an existing ordinary .ultra/decisions owner record',
        'RESULT.json.evidence_refs',
      ));
    }
  }
  if (!HEAD_PATTERN.test(String(result.final_head || ''))) {
    diagnostics.push(diagnostic('result_schema', 'RESULT final_head must be a 40-character lowercase commit id', 'RESULT.json.final_head'));
  }
  if (!SHA256_PATTERN.test(String(result.final_worktree_digest || ''))) {
    diagnostics.push(diagnostic('result_schema', 'RESULT final_worktree_digest must be a 64-character lowercase SHA-256', 'RESULT.json.final_worktree_digest'));
  }
  validateResultPaths(handoffId, result.changed_paths, 'changed_paths', diagnostics);
  validateResultPaths(handoffId, result.deleted_paths, 'deleted_paths', diagnostics);
  if (!Array.isArray(result.commands)
      || !result.commands.every((entry) => isPlainObject(entry) && nonemptyString(entry.command) && Number.isInteger(entry.exit_code))) {
    diagnostics.push(diagnostic('result_schema', 'RESULT commands must record exact commands with integer exit codes', 'RESULT.json.commands'));
  }
  for (const field of ['evidence_refs', 'fakes', 'limitations', 'not_done', 'external_effects', 'review_risks']) {
    if (!Array.isArray(result[field]) || !result[field].every(nonemptyString)) {
      diagnostics.push(diagnostic('result_schema', `RESULT ${field} must be an array of strings`, `RESULT.json.${field}`));
    }
  }
  if (result.$schema === RESULT_V2_SCHEMA) {
    validateFrozenInputFinalDigests(offer, result, diagnostics);
  }
  return terminal;
}

// A v2 RESULT separately binds the final bytes of every OFFER frozen input: each
// entry declares either the actual final SHA-256 or an explicit absence. The
// structural pass checks coverage and shape; the live pass recomputes the bytes.
function validateFrozenInputFinalDigests(offer, result, diagnostics) {
  const entries = result.frozen_input_final_digests;
  if (!Array.isArray(entries) || !entries.every(isPlainObject)) {
    diagnostics.push(diagnostic(
      'result_frozen_input_digest_missing',
      `a ${RESULT_V2_SCHEMA} RESULT must list frozen_input_final_digests covering every OFFER frozen input`,
      'RESULT.json.frozen_input_final_digests',
    ));
    return;
  }
  const byPath = new Map();
  for (const entry of entries) {
    if (!normalizedRelativePath(entry.path)
        || !(entry.absent === true || SHA256_PATTERN.test(String(entry.sha256 || '')))) {
      diagnostics.push(diagnostic(
        'result_frozen_input_digest_missing',
        'each frozen_input_final_digests entry needs a normalized path and a 64-character SHA-256 or an explicit absent flag',
        `RESULT.json.frozen_input_final_digests[${entry.path || '?'}]`,
      ));
      continue;
    }
    if (byPath.has(entry.path)) {
      diagnostics.push(diagnostic(
        'result_frozen_input_digest_missing',
        `frozen_input_final_digests path repeated: ${entry.path}`,
        `RESULT.json.frozen_input_final_digests[${entry.path}]`,
      ));
    }
    byPath.set(entry.path, entry);
  }
  const offeredInputs = Array.isArray(offer?.frozen_inputs) ? offer.frozen_inputs.filter(isPlainObject) : [];
  for (const input of offeredInputs) {
    if (!byPath.has(input.path)) {
      diagnostics.push(diagnostic(
        'result_frozen_input_digest_missing',
        `frozen_input_final_digests must cover the OFFER frozen input ${input.path}`,
        `RESULT.json.frozen_input_final_digests[${input.path}]`,
      ));
    }
  }
  for (const entryPath of byPath.keys()) {
    if (!offeredInputs.some((input) => input.path === entryPath)) {
      diagnostics.push(diagnostic(
        'result_frozen_input_digest_missing',
        `frozen_input_final_digests lists a path the OFFER never froze: ${entryPath}`,
        `RESULT.json.frozen_input_final_digests[${entryPath}]`,
      ));
    }
  }
}

// Phase-correct live observation. The ACK's bytes are a pre-write boundary
// record, never present-current freshness: expected receiver edits after a
// ready ACK are legal, so active validation observes HEAD, the ledger row, and
// whether the product worktree digest still equals the ACK-observed digest
// (boundary intact) or receiver writes have begun. Terminal v1 receipts and any
// handoff superseded by a newer handoff are historical structure. A newest v2
// terminal receipt is bound to current reality: final HEAD, the recomputed
// worktree digest, the exact final product path inventory, and the final bytes
// of every frozen input.
function liveObservations(offer, ack, ackState, terminal, result, repoRoot, diagnostics, live, superseded, closeout) {
  if (ackState !== 'ready') return live;
  const currentHead = gitHead(repoRoot);
  live.current_head = currentHead;
  if (currentHead === null) {
    diagnostics.push(diagnostic(
      'git_unavailable',
      'the repository HEAD could not be observed (Git missing from PATH, unresponsive, or the path is not a worktree); restore a responsive Git, then re-run the validator — live validation fails closed and never guesses',
      'live.head',
    ));
    return live;
  }
  const baseHead = offer?.repository?.base_head;

  if (terminal === null) {
    if (baseHead !== currentHead) {
      diagnostics.push(diagnostic(
        'stale_head',
        'the current repository HEAD differs from the ACK-verified base HEAD; the active transfer subject is stale',
        'live.head',
      ));
    }
    const identity = offer?.accepted_scope?.new_task_identity;
    if (nonemptyString(identity)) {
      observeTaskIdentity(repoRoot, identity, diagnostics, live);
    }
    const digest = digestObservation(repoRoot);
    if (digest.error) {
      diagnostics.push(diagnostic(
        'live_digest_unavailable',
        `the worktree digest could not be observed: ${digest.error}`,
        'live.worktree_digest',
        'warning',
      ));
    } else {
      const ackDigest = observedDigest(ack);
      live.worktree_digest = digest.diff_digest;
      live.boundary_intact = ackDigest !== null && digest.diff_digest === ackDigest;
      live.receiver_writes_begun = !live.boundary_intact;
    }
    return live;
  }

  live.historical = superseded === true || result?.$schema !== RESULT_V2_SCHEMA;
  if (live.historical) return live;

  if (currentHead !== result.final_head) {
    if (gitIsAncestor(repoRoot, result.final_head, currentHead)) {
      diagnostics.push(diagnostic(
        'result_head_advanced',
        'history advanced past the frozen final HEAD (for example an owner commit); the receipt stays historical and current reality lives in Git',
        'live.head',
        'warning',
      ));
      return live;
    }
    diagnostics.push(diagnostic(
      'result_head_diverged',
      'the current repository HEAD diverged from the RESULT final HEAD without preserving it in history; recapture from Git or record the divergence for the owner',
      'live.head',
    ));
    return live;
  }

  // The prescribed closeout transition: current reality binds to the recorded
  // closeout end-state instead of the freeze digest, while every reviewed
  // byte outside the prescribed paths stays pinned. Without a CLOSEOUT
  // receipt, the freeze binding below applies unchanged.
  if (closeout) {
    if (closeout.continuation === undefined
        && closeout.subject_before?.worktree_digest !== result.final_worktree_digest) {
      diagnostics.push(diagnostic(
        'closeout_binding',
        'the closeout starts from a worktree digest the RESULT never froze and records no owner-authorized continuation; record the continuation or return to the owner',
        'live.subject_before',
      ));
      return live;
    }
    return liveCloseoutObservations(offer, result, closeout, repoRoot, diagnostics, live);
  }

  const digest = digestObservation(repoRoot);
  if (digest.error) {
    diagnostics.push(diagnostic(
      'result_binding_unverifiable',
      `the terminal subject could not be re-observed: ${digest.error}`,
      'live.final_worktree_digest',
    ));
    verifyFrozenInputFinalDigests(repoRoot, result, diagnostics);
    return live;
  }

  let manifest = null;
  try {
    manifest = manifestAgainst(repoRoot, baseHead, digest);
  } catch (error) {
    diagnostics.push(diagnostic(
      'result_binding_unverifiable',
      `the final product path inventory could not be observed: ${error && error.message ? error.message.split('\n')[0] : 'git failed'}`,
      'live.final_path_inventory',
    ));
  }
  if (manifest) {
    const changed = new Set((Array.isArray(result.changed_paths) ? result.changed_paths : []).filter(nonemptyString));
    const manifestChanged = new Set(manifest.changed);
    const missing = manifest.changed.filter((file) => !changed.has(file));
    const extra = [...changed].filter((file) => !manifestChanged.has(file));
    if (missing.length > 0) {
      diagnostics.push(diagnostic(
        'result_inventory_missing',
        `RESULT changed_paths omits final product paths: ${missing.join(', ')}`,
        'live.final_path_inventory',
      ));
    }
    if (extra.length > 0) {
      diagnostics.push(diagnostic(
        'result_inventory_extra',
        `RESULT changed_paths claims paths outside the final product subject: ${extra.join(', ')}`,
        'live.final_path_inventory',
      ));
    }
    const deleted = new Set((Array.isArray(result.deleted_paths) ? result.deleted_paths : []).filter(nonemptyString));
    const manifestDeleted = new Set(manifest.deleted);
    const deletedMismatch = [
      ...manifest.deleted.filter((file) => !deleted.has(file)),
      ...[...deleted].filter((file) => !manifestDeleted.has(file)),
    ];
    if (deletedMismatch.length > 0) {
      diagnostics.push(diagnostic(
        'result_inventory_deleted_mismatch',
        `RESULT deleted_paths disagrees with the deleted paths of the final product subject: ${deletedMismatch.join(', ')}`,
        'live.final_path_inventory',
      ));
    }
  }
  // Frozen-input final bytes are verified independently of the aggregate digest
  // so a single unsafe identity is reported as itself, not masked by the
  // digest tool's own refusal to observe the repository.
  verifyFrozenInputFinalDigests(repoRoot, result, diagnostics);

  // One finite coherent observation: the digest is re-observed exactly once
  // after the manifest and frozen-input reads. A different second digest means
  // the subject moved across the digest-to-manifest boundary and the receipt
  // cannot be bound to what was actually verified — fail closed, re-run once
  // after the repository is quiet. No retry loop.
  const digestSecond = digestObservation(repoRoot);
  if (digestSecond.error) {
    diagnostics.push(diagnostic(
      'result_binding_unverifiable',
      `the terminal subject could not be re-observed coherently: ${digestSecond.error}`,
      'live.final_worktree_digest',
    ));
    return live;
  }
  if (digestSecond.diff_digest !== digest.diff_digest) {
    diagnostics.push(diagnostic(
      'subject_changed_during_observation',
      'the product worktree digest changed between the first and the closing observation of this validation; the manifest and frozen-input reads were taken against a moving subject. Let the concurrent change finish, then re-run the validator once',
      'live.final_worktree_digest',
    ));
    return live;
  }
  live.final_worktree_digest = digestSecond.diff_digest;
  if (digestSecond.diff_digest !== result.final_worktree_digest) {
    diagnostics.push(diagnostic(
      'result_digest_mismatch',
      'the recomputed current product worktree digest differs from the RESULT final_worktree_digest; if this is the prescribed post-review closeout, publish the CLOSEOUT receipt of the closeout-transition contract — never rewrite the frozen RESULT, open a new handoff for it, or commit',
      'live.final_worktree_digest',
    ));
  }
  return live;
}

function observeTaskIdentity(repoRoot, identity, diagnostics, live) {
  const read = readJsonFile(repoRoot, '.ultra/tasks.json');
  if (read.readCode || read.jsonError) {
    diagnostics.push(diagnostic(
      'task_ledger_unreadable',
      `the task ledger could not be stably read${read.readCode ? ` (${read.readCode})` : ''}: ${read.readMessage || read.jsonError}. Restore the ordinary ledger file, then re-run the validator`,
      'live.task_identity',
    ));
    return;
  }
  if (read.missing) {
    diagnostics.push(diagnostic(
      'task_identity_missing',
      `the task ledger is missing; the accepted task identity ${identity} cannot be confirmed`,
      'live.task_identity',
    ));
    return;
  }
  live.task_identity_present = isPlainObject(read.parsed) && Array.isArray(read.parsed.tasks)
    && read.parsed.tasks.some((row) => isPlainObject(row) && row.id === identity);
  if (!live.task_identity_present) {
    diagnostics.push(diagnostic(
      'task_identity_missing',
      `the accepted task identity ${identity} is not present in .ultra/tasks.json`,
      'live.task_identity',
    ));
  }
}

function verifyFrozenInputFinalDigests(repoRoot, result, diagnostics, skipPaths = new Set()) {
  const entries = Array.isArray(result.frozen_input_final_digests)
    ? result.frozen_input_final_digests.filter(isPlainObject)
    : [];
  for (const entry of entries) {
    // An invalid or escaping path is rejected structurally and never accessed:
    // no filesystem operation runs through it.
    if (!normalizedRelativePath(entry.path)) continue;
    if (skipPaths.has(entry.path)) continue;
    if (entry.absent === true) {
      let present = true;
      try {
        fs.lstatSync(path.join(repoRoot, entry.path));
      } catch (error) {
        if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) present = false;
      }
      if (present) {
        diagnostics.push(diagnostic(
          'result_frozen_input_digest_mismatch',
          `frozen_input_final_digests declares ${entry.path} absent, but the path exists`,
          `live.frozen_inputs[${entry.path}]`,
        ));
      }
      continue;
    }
    let read;
    try {
      read = stableReadBytes(repoRoot, entry.path, MAX_INPUT_BYTES);
    } catch (error) {
      diagnostics.push(diagnostic(
        'result_frozen_input_unreadable',
        `frozen input ${entry.path}: ${error.message}`,
        `live.frozen_inputs[${entry.path}]`,
      ));
      continue;
    }
    if (read.missing) {
      diagnostics.push(diagnostic(
        'result_frozen_input_digest_mismatch',
        `frozen_input_final_digests declares a digest for ${entry.path}, but the path no longer exists; declare it absent instead`,
        `live.frozen_inputs[${entry.path}]`,
      ));
      continue;
    }
    const sha = require('node:crypto').createHash('sha256').update(read.bytes).digest('hex');
    if (sha !== entry.sha256) {
      diagnostics.push(diagnostic(
        'result_frozen_input_digest_mismatch',
        `the recomputed final bytes of frozen input ${entry.path} differ from the declared SHA-256`,
        `live.frozen_inputs[${entry.path}]`,
      ));
    }
  }
}

// The versioned closeout-transition contract. A CLOSEOUT receipt separates the
// immutable reviewed subject (the newest terminal v2 RESULT and the bytes it
// froze) from exactly one uncommitted prescribed closeout: the post-review
// ledger `completed` flip, the task context's closeout sections, and the final
// evidence record. It never rewrites OFFER/ACK/RESULT bytes, never commits, and
// starts no review and no handoff.
function prescribedCloseoutPaths(identity) {
  return [
    '.ultra/tasks.json',
    `.ultra/contexts/task-${identity}.md`,
    `.ultra/evidence/${identity}/evidence.json`,
  ];
}

function closeoutBoundaryIndex(text) {
  let best = -1;
  for (const heading of CLOSEOUT_SECTION_HEADINGS) {
    const at = text.indexOf(`${heading}\n`);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }
  return best;
}

function closeoutSiblingsShape(value, identity) {
  if (!Array.isArray(value)) return false;
  const pattern = new RegExp(`^\\.ultra/evidence/${identity}/[A-Za-z0-9][A-Za-z0-9._-]*$`);
  const seen = new Set();
  for (const entry of value) {
    if (!isPlainObject(entry) || !pattern.test(String(entry.path || ''))
        || entry.path === `.ultra/evidence/${identity}/evidence.json`
        || !SHA256_PATTERN.test(String(entry.sha256 || ''))) return false;
    if (seen.has(entry.path)) return false;
    seen.add(entry.path);
  }
  return true;
}

function stableShaOr(report, relative) {
  let read;
  try {
    read = stableReadBytes(report.root, relative, MAX_INPUT_BYTES);
  } catch (error) {
    return { error: error.message };
  }
  if (read.missing) return { missing: true };
  return { sha256: crypto.createHash('sha256').update(read.bytes).digest('hex'), text: read.text };
}

// Canonical structure-preserving JSON with sorted object keys, so a row digest
// never depends on key order — only on the row's fields and their values.
function canonicalJsonDigest(value) {
  const canonical = (item) => {
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    if (isPlainObject(item)) {
      return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(',')}}`;
    }
    return JSON.stringify(item);
  };
  return crypto.createHash('sha256').update(Buffer.from(canonical(value))).digest('hex');
}

function rowExStatusDigest(row) {
  const { status, ...rest } = row;
  return canonicalJsonDigest(rest);
}

// Exactly-one lookup of the closed task's ledger row.
function ledgerTaskRows(repoRoot, identity) {
  const read = readJsonFile(repoRoot, '.ultra/tasks.json');
  if (read.missing) return { error: 'the task ledger is missing' };
  if (read.readCode || read.jsonError) {
    return { error: read.readMessage || read.jsonError || 'the task ledger is unreadable' };
  }
  if (!isPlainObject(read.parsed) || !Array.isArray(read.parsed.tasks)) {
    return { error: 'the task ledger is not a task-ledger object' };
  }
  return {
    rows: read.parsed.tasks.filter((row) => isPlainObject(row) && row.id === identity),
  };
}

// Bind the existing external-review receipt semantics: read-only reviewer,
// exact task/change identity, reviewer authority and reviewed contract by
// stable bytes, subject equal to the closeout start, approve verdict with no
// P0/P1 finding. Anything else is a typed authorization stop.
function bindExternalReviewReceipt(text, closeout, repoRoot, diagnostics) {
  const stop = (message, location = 'CLOSEOUT.json.authorized_by') => diagnostics.push(
    diagnostic('closeout_authorization', message, location),
  );
  let receipt = null;
  try {
    receipt = JSON.parse(text);
  } catch {
    return stop('the authorized_by receipt is not valid JSON');
  }
  if (!isPlainObject(receipt)) return stop('the authorized_by receipt must be a JSON object');
  if (receipt.$schema !== EXTERNAL_RECEIPT_SCHEMA) {
    stop(`the authorized_by receipt must use ${EXTERNAL_RECEIPT_SCHEMA}; a strict SUMMARY or invented schema never authorizes a closeout`);
  }
  const keys = Object.keys(receipt).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...EXTERNAL_RECEIPT_KEYS].sort())) {
    stop('the authorized_by receipt must carry exactly the external-review receipt fields');
  }
  if (!nonemptyString(receipt.reviewer) || receipt.reviewer_role !== 'read-only') {
    stop('the external reviewer must be identified and read-only');
  }
  if (receipt.task_id !== closeout.task_identity) {
    stop('the external receipt task_id must equal the closeout task identity');
  }
  if (receipt.verdict !== 'approve') {
    stop('a prescribed closeout is authorized only by an approve verdict');
  }
  if (typeof receipt.timestamp !== 'string' || !Number.isFinite(Date.parse(receipt.timestamp))) {
    stop('the authorized_by receipt needs an RFC 3339 timestamp');
  }
  const findings = receipt.findings;
  if (!Array.isArray(findings)
      || !findings.every((finding) => isPlainObject(finding)
        && nonemptyString(finding.id)
        && nonemptyString(finding.title)
        && EXTERNAL_SEVERITIES.includes(finding.severity))) {
    stop('the authorized_by findings must be an exact array of {id, severity P0-P3, title}');
  } else {
    const ids = new Set(findings.map((finding) => finding.id));
    if (ids.size !== findings.length) stop('the authorized_by finding ids must be unique');
    if (findings.some((finding) => finding.severity === 'P0' || finding.severity === 'P1')) {
      stop('an approve verdict with unresolved P0/P1 findings cannot authorize a closeout');
    }
  }
  const subject = receipt.subject;
  if (!isPlainObject(subject)
      || !HEAD_PATTERN.test(String(subject.git_head || ''))
      || !SHA256_PATTERN.test(String(subject.worktree_digest || ''))
      || subject.git_head !== closeout.subject_before?.head
      || subject.worktree_digest !== closeout.subject_before?.worktree_digest) {
    stop('the reviewed subject must be exactly the closeout-start HEAD and worktree digest');
  }
  for (const field of ['reviewed_contract', 'reviewer_authority']) {
    const ref = receipt[field];
    if (!isPlainObject(ref) || !normalizedRelativePath(String(ref.ref || ''))
        || !SHA256_PATTERN.test(String(ref.sha256 || ''))) {
      stop(`the authorized_by ${field} must cite a repository ref and SHA-256`);
      continue;
    }
    const observed = stableShaOr({ root: repoRoot }, ref.ref);
    if (observed.error || observed.missing) {
      stop(`the authorized_by ${field} ref cannot be stably read: ${ref.ref}`);
    } else if (observed.sha256 !== ref.sha256) {
      stop(`the recomputed bytes of the authorized_by ${field} differ from the cited SHA-256`);
    }
  }
  // The receipt must be planned in the task context's Planned Path Inventory
  // before the review: the repository's evidence audit and this contract
  // agree only when the receipt path is a planned entry of the closed task.
  const authPath = closeout.authorized_by?.path;
  const contextRelative = `.ultra/contexts/task-${closeout.task_identity}.md`;
  const contextObserved = stableShaOr({ root: repoRoot }, contextRelative);
  if (contextObserved.error || contextObserved.missing) {
    stop('the task context cannot be stably read to verify the review receipt is planned');
  } else if (typeof authPath === 'string') {
    const heading = '## Planned Path Inventory';
    const at = contextObserved.text.indexOf(heading);
    const after = at === -1 ? -1 : at + heading.length;
    const end = after === -1 ? -1 : contextObserved.text.indexOf('\n## ', after);
    const section = after === -1 || end === -1 ? null : contextObserved.text.slice(after, end);
    // The same exact bullet-path set the repository artifact audit accepts:
    // `- `path`` lines only, so a near-match line (for example a planned
    // `external-review.json.bak`) is not the planned receipt.
    const planned = section === null
      ? new Set()
      : new Set([...section.matchAll(/^- `([^`\n]+)`$/gmu)].map((match) => match[1]));
    if (!planned.has(authPath)) {
      stop('the external review receipt must be a Planned Path Inventory entry of the task context before the review');
    }
  }
  return receipt;
}

function validateCloseout(offer, result, payload, handoffId, repoRoot, diagnostics) {
  if (!isPlainObject(payload)) {
    diagnostics.push(diagnostic('closeout_schema', 'CLOSEOUT.json must be a JSON object', 'CLOSEOUT.json'));
    return null;
  }
  const bad = (message, location) => diagnostics.push(diagnostic('closeout_schema', message, location));
  if (payload.$schema !== CLOSEOUT_SCHEMA) {
    bad(`CLOSEOUT $schema must be ${CLOSEOUT_SCHEMA}`, 'CLOSEOUT.json.$schema');
  }
  if (payload.handoff_id !== handoffId) {
    bad('CLOSEOUT handoff_id must match the OFFER handoff id', 'CLOSEOUT.json.handoff_id');
  }
  const identity = offer?.accepted_scope?.new_task_identity;
  if (!nonemptyString(payload.task_identity) || payload.task_identity !== identity) {
    bad('CLOSEOUT task_identity must equal the OFFER accepted task identity', 'CLOSEOUT.json.task_identity');
  }
  const closes = payload.closes_result;
  if (!isPlainObject(closes) || closes.$schema !== RESULT_V2_SCHEMA
      || closes.final_head !== result.final_head
      || closes.final_worktree_digest !== result.final_worktree_digest) {
    bad('CLOSEOUT closes_result must cite this handoff RESULT schema, final HEAD, and final worktree digest exactly', 'CLOSEOUT.json.closes_result');
  }
  const expectedPaths = prescribedCloseoutPaths(String(identity || ''));
  const prescribedSet = new Set(expectedPaths);
  const prescribed = Array.isArray(payload.prescribed_paths) ? [...payload.prescribed_paths].sort() : null;
  if (prescribed === null || prescribed.length !== expectedPaths.length
      || JSON.stringify(prescribed) !== JSON.stringify([...expectedPaths].sort())) {
    bad('CLOSEOUT prescribed_paths must be exactly the task ledger, the task context, and the final evidence record of the accepted task identity', 'CLOSEOUT.json.prescribed_paths');
  }
  const auth = payload.authorized_by;
  let authText = null;
  if (!isPlainObject(auth) || !normalizedRelativePath(String(auth.path || ''))
      || !SHA256_PATTERN.test(String(auth.sha256 || ''))
      || !String(auth.path || '').startsWith(`.ultra/evidence/${payload.task_identity}/`)) {
    bad('CLOSEOUT authorized_by must cite an evidence receipt of the accepted task identity by path and SHA-256', 'CLOSEOUT.json.authorized_by');
  } else {
    const observed = stableShaOr({ root: repoRoot }, auth.path);
    if (observed.error || observed.missing) {
      bad(`the CLOSEOUT authorized_by receipt cannot be stably read: ${auth.path}`, 'CLOSEOUT.json.authorized_by');
    } else if (observed.sha256 !== auth.sha256) {
      bad('the recomputed bytes of the CLOSEOUT authorized_by receipt differ from the cited SHA-256', 'CLOSEOUT.json.authorized_by');
    } else {
      authText = observed.text;
    }
  }
  const effects = payload.effects_declined;
  if (!isPlainObject(effects) || effects.commit !== false
      || effects.review_started !== false || effects.handoff_started !== false) {
    bad('a prescribed closeout declines commit, review, and handoff effects exactly (all three false)', 'CLOSEOUT.json.effects_declined');
  }
  const shaFields = Object.freeze([
    'worktree_digest', 'ledger_sha256', 'context_sha256',
    'ledger_rows_ex_task_sha256', 'ledger_row_ex_status_sha256',
    'context_prefix_sha256',
  ]);
  const before = payload.subject_before;
  const after = payload.subject_after;
  const shapeSubject = (subject, label) => {
    if (!isPlainObject(subject)) {
      bad(`CLOSEOUT ${label} must be an object`, `CLOSEOUT.json.${label}`);
      return false;
    }
    for (const field of shaFields) {
      if (!SHA256_PATTERN.test(String(subject[field] || ''))) {
        bad(`CLOSEOUT ${label}.${field} must be a 64-character lowercase SHA-256`, `CLOSEOUT.json.${label}.${field}`);
      }
    }
    if (!HEAD_PATTERN.test(String(subject.head || ''))) {
      bad(`CLOSEOUT ${label}.head must be a 40-character lowercase commit id`, `CLOSEOUT.json.${label}.head`);
    }
    if (!closeoutSiblingsShape(subject.evidence_siblings, String(payload.task_identity || ''))) {
      bad(`CLOSEOUT ${label}.evidence_siblings must list distinct sibling evidence receipts with their SHA-256`, `CLOSEOUT.json.${label}.evidence_siblings`);
    }
    return true;
  };
  const beforeOk = shapeSubject(before, 'subject_before');
  const afterOk = shapeSubject(after, 'subject_after');
  if (beforeOk && before.evidence_json_absent !== true) {
    bad('the final evidence record is written only at closeout; CLOSEOUT subject_before must record it absent', 'CLOSEOUT.json.subject_before.evidence_json_absent');
  }
  if (afterOk && !SHA256_PATTERN.test(String(after.evidence_json_sha256 || ''))) {
    bad('CLOSEOUT subject_after.evidence_json_sha256 must be a 64-character lowercase SHA-256', 'CLOSEOUT.json.subject_after.evidence_json_sha256');
  }
  const continuationEntries = Array.isArray(payload.continuation?.delta_paths)
    ? payload.continuation.delta_paths.filter(isPlainObject)
    : [];
  const deltaByPath = new Map(continuationEntries.map((entry) => [entry.path, entry]));
  if (beforeOk && afterOk) {
    const rowStop = (message) => diagnostics.push(diagnostic(
      'closeout_task_row',
      message,
      'CLOSEOUT.json.task_row',
    ));
    if (HEAD_PATTERN.test(String(before.head || '')) && before.head !== result.final_head) {
      bad('CLOSEOUT subject_before.head must be the frozen final HEAD; the closeout never starts from a moved history', 'CLOSEOUT.json.subject_before.head');
    }
    if (HEAD_PATTERN.test(String(after.head || '')) && after.head !== result.final_head) {
      bad('CLOSEOUT subject_after.head must be the frozen final HEAD; the closeout never commits', 'CLOSEOUT.json.subject_after.head');
    }
    if (before.ledger_row_status !== 'in_progress') {
      rowStop('the closed task row must start in_progress at closeout (subject_before.ledger_row_status)');
    }
    if (after.ledger_row_status !== 'completed') {
      rowStop('the closed task row must end completed (subject_after.ledger_row_status)');
    }
    if (SHA256_PATTERN.test(String(before.ledger_row_ex_status_sha256 || ''))
        && SHA256_PATTERN.test(String(after.ledger_row_ex_status_sha256 || ''))
        && before.ledger_row_ex_status_sha256 !== after.ledger_row_ex_status_sha256) {
      rowStop('the task row changed beyond its status flip across the closeout: the canonical ex-status digests disagree');
    }
    for (const field of ['ledger_rows_ex_task_sha256', 'context_prefix_sha256']) {
      if (SHA256_PATTERN.test(String(before[field] || '')) && before[field] !== after[field]) {
        bad(`CLOSEOUT subject_before.${field} must equal subject_after.${field}: the closeout never touches that scope`, `CLOSEOUT.json.subject_after.${field}`);
      }
    }
    if (JSON.stringify(before.evidence_siblings || []) !== JSON.stringify(after.evidence_siblings || [])) {
      bad('CLOSEOUT evidence siblings must be identical before and after the closeout; pre-review evidence stays untouched', 'CLOSEOUT.json.subject_after.evidence_siblings');
    }
    // A prescribed path that is also an OFFER frozen input must reach closeout
    // still on its frozen final bytes, or carry that delta in a declared
    // continuation. With no continuation at all, the live binding decides —
    // a moved subject without any recorded continuation is a binding stop.
    const continuationDeclared = payload.continuation !== undefined;
    const beforeShaFor = (relative) => {
      if (relative === '.ultra/tasks.json') return before.ledger_sha256;
      if (relative === `.ultra/contexts/task-${payload.task_identity}.md`) return before.context_sha256;
      return null;
    };
    if (continuationDeclared) {
      for (const entry of Array.isArray(result.frozen_input_final_digests)
        ? result.frozen_input_final_digests.filter(isPlainObject)
        : []) {
        if (!prescribedSet.has(entry.path) || entry.absent === true) continue;
        const beforeSha = beforeShaFor(entry.path);
        if (beforeSha === null || beforeSha === entry.sha256) continue;
        const delta = deltaByPath.get(entry.path);
        if (!isPlainObject(delta) || delta.sha256 !== beforeSha) {
          bad(`the prescribed path ${entry.path} moved off its frozen final bytes before closeout; record that owner-authorized continuation delta or return to the owner`, `CLOSEOUT.json.continuation.delta_paths[${entry.path}]`);
        }
      }
    }
  }
  const continuation = payload.continuation;
  if (continuation !== undefined) {
    if (!isPlainObject(continuation)
        || !SHA256_PATTERN.test(String(continuation.from_worktree_digest || ''))
        || continuation.from_worktree_digest !== result.final_worktree_digest) {
      bad('CLOSEOUT continuation must anchor from_worktree_digest at the RESULT final_worktree_digest', 'CLOSEOUT.json.continuation.from_worktree_digest');
    }
    const deltaPaths = continuation?.delta_paths;
    if (!Array.isArray(deltaPaths) || deltaPaths.length === 0
        || !deltaPaths.every((entry) => isPlainObject(entry)
          && normalizedRelativePath(entry.path)
          && SHA256_PATTERN.test(String(entry.sha256 || '')))) {
      bad('CLOSEOUT continuation.delta_paths must list normalized repository-relative paths with SHA-256 bytes', 'CLOSEOUT.json.continuation.delta_paths');
    } else {
      const seen = new Set();
      for (const entry of deltaPaths) {
        if (seen.has(entry.path)) {
          bad(`CLOSEOUT continuation.delta_paths repeats ${entry.path}`, `CLOSEOUT.json.continuation.delta_paths[${entry.path}]`);
        }
        seen.add(entry.path);
        if (!prescribedSet.has(entry.path)) continue;
        const beforeSha = entry.path === '.ultra/tasks.json' ? before?.ledger_sha256 : before?.context_sha256;
        if (beforeSha !== entry.sha256) {
          bad(`the continuation delta for the prescribed path ${entry.path} must equal the closeout-start bytes`, `CLOSEOUT.json.continuation.delta_paths[${entry.path}]`);
        }
      }
    }
    const refs = continuation?.authority_refs;
    if (!Array.isArray(refs) || refs.length === 0
        || !refs.every((ref) => isPlainObject(ref) && normalizedRelativePath(String(ref.path || ''))
          && SHA256_PATTERN.test(String(ref.sha256 || '')))) {
      bad('CLOSEOUT continuation.authority_refs must cite readable canonical records by path and SHA-256', 'CLOSEOUT.json.continuation.authority_refs');
    } else {
      for (const ref of refs) {
        const observed = stableShaOr({ root: repoRoot }, ref.path);
        if (observed.error || observed.missing) {
          bad(`the continuation authority ref cannot be stably read: ${ref.path}`, `CLOSEOUT.json.continuation.authority_refs[${ref.path}]`);
        } else if (observed.sha256 !== ref.sha256) {
          bad(`the recomputed bytes of the continuation authority ref ${ref.path} differ from the cited SHA-256`, `CLOSEOUT.json.continuation.authority_refs[${ref.path}]`);
        }
      }
    }
  }
  // The closed task's ledger row is unique and present — missing or duplicate
  // rows are typed stops in every validation mode.
  const rows = ledgerTaskRows(repoRoot, String(payload.task_identity || ''));
  let singleRow = null;
  const rowStopS = (message) => diagnostics.push(diagnostic('closeout_task_row', message, 'CLOSEOUT.json.task_row'));
  if (rows.error) {
    rowStopS(`the task ledger could not be read (${rows.error})`);
  } else if (rows.rows.length === 0) {
    rowStopS(`the task ledger no longer carries the closed task row ${payload.task_identity}`);
  } else if (rows.rows.length > 1) {
    rowStopS(`the task ledger carries duplicate rows for ${payload.task_identity}`);
  } else {
    singleRow = rows.rows[0];
  }

  // Bind the authorization receipt to the existing external-review semantics,
  // and its change identity to the closed ledger row's own change_id.
  if (authText !== null) {
    const bound = bindExternalReviewReceipt(authText, payload, repoRoot, diagnostics);
    if (isPlainObject(bound) && singleRow && bound.change_id !== singleRow.change_id) {
      diagnostics.push(diagnostic(
        'closeout_authorization',
        'the external receipt change_id must equal the closed task ledger row change_id',
        'CLOSEOUT.json.authorized_by',
      ));
    }
  }

  if (diagnostics.some((item) => item.code === 'closeout_schema' && item.location?.startsWith('CLOSEOUT.json'))) {
    return null;
  }
  return payload;
}

// Live binding of the newest terminal v2 RESULT with an attached CLOSEOUT
// receipt: current reality must equal the recorded closeout end-state, the
// reviewed implementation subject stays pinned (aggregate digest, inventory,
// frozen inputs outside the prescribed paths), and the closeout-only scopes
// (ledger rows outside the task, the context before its closeout sections, the
// pre-review evidence siblings) stay byte-frozen. Any later write fails typed;
// the contract offers no re-freeze, no second closeout, and no retry loop.
function liveCloseoutObservations(offer, result, closeout, repoRoot, diagnostics, live) {
  const identity = closeout.task_identity;
  const prescribed = prescribedCloseoutPaths(identity);
  const prescribedSet = new Set(prescribed);
  const digest = digestObservation(repoRoot);
  if (digest.error) {
    diagnostics.push(diagnostic(
      'result_binding_unverifiable',
      `the closed-out subject could not be re-observed: ${digest.error}`,
      'live.final_worktree_digest',
    ));
    return live;
  }
  let manifest = null;
  try {
    manifest = manifestAgainst(repoRoot, offer?.repository?.base_head, digest);
  } catch (error) {
    diagnostics.push(diagnostic(
      'result_binding_unverifiable',
      `the closed-out product path inventory could not be observed: ${error && error.message ? error.message.split('\n')[0] : 'git failed'}`,
      'live.final_path_inventory',
    ));
  }
  if (manifest) {
    const expected = new Set([
      ...(Array.isArray(result.changed_paths) ? result.changed_paths.filter(nonemptyString) : []),
      prescribed[0],
      prescribed[1],
    ]);
    for (const entry of closeout.continuation?.delta_paths || []) {
      if (isPlainObject(entry) && normalizedRelativePath(entry.path)) expected.add(entry.path);
    }
    const manifestChanged = new Set(manifest.changed);
    const unpinned = manifest.changed.filter((file) => !expected.has(file));
    if (unpinned.length > 0) {
      diagnostics.push(diagnostic(
        'closeout_binding',
        `product paths outside the closed-out subject and its recorded continuation: ${unpinned.join(', ')}`,
        'live.final_path_inventory',
      ));
    }
    const vanished = [...expected].filter((file) => file !== prescribed[2] && !manifestChanged.has(file));
    if (vanished.length > 0) {
      diagnostics.push(diagnostic(
        'closeout_binding',
        `pinned product paths disappeared from the closed-out subject: ${vanished.join(', ')}`,
        'live.final_path_inventory',
      ));
    }
    const deleted = new Set((Array.isArray(result.deleted_paths) ? result.deleted_paths : []).filter(nonemptyString));
    const deletedMismatch = [
      ...manifest.deleted.filter((file) => !deleted.has(file)),
      ...[...deleted].filter((file) => !new Set(manifest.deleted).has(file)),
    ];
    if (deletedMismatch.length > 0) {
      diagnostics.push(diagnostic(
        'closeout_binding',
        `deletions disagree with the closed-out subject: ${deletedMismatch.join(', ')}`,
        'live.final_path_inventory',
      ));
    }
  }
  for (const entry of closeout.continuation?.delta_paths || []) {
    if (!isPlainObject(entry) || !normalizedRelativePath(entry.path) || prescribedSet.has(entry.path)) continue;
    const observed = stableShaOr({ root: repoRoot }, entry.path);
    if (observed.error || observed.missing) {
      diagnostics.push(diagnostic(
        'closeout_binding',
        `the continuation path ${entry.path} can no longer be observed (${observed.missing ? 'missing' : 'unreadable'})`,
        `live.continuation[${entry.path}]`,
      ));
    } else if (observed.sha256 !== entry.sha256) {
      diagnostics.push(diagnostic(
        'closeout_binding',
        `the current bytes of the continuation path ${entry.path} differ from the recorded continuation SHA-256`,
        `live.continuation[${entry.path}]`,
      ));
    }
  }
  verifyFrozenInputFinalDigests(repoRoot, result, diagnostics, prescribedSet);

  const scope = (message, location) => diagnostics.push(diagnostic('closeout_scope_drift', message, location));
  const pinFile = (relative, expectedSha, label) => {
    let read;
    try {
      read = stableReadBytes(repoRoot, relative, MAX_INPUT_BYTES);
    } catch (error) {
      scope(`the ${label} ${relative} cannot be stably observed: ${error.message}`, `live.closeout.${label}`);
      return null;
    }
    if (read.missing) {
      scope(`the ${label} ${relative} is missing after closeout`, `live.closeout.${label}`);
      return null;
    }
    const sha = crypto.createHash('sha256').update(read.bytes).digest('hex');
    if (sha !== expectedSha) {
      scope(`the current bytes of the ${label} differ from the closeout end-state SHA-256`, `live.closeout.${label}`);
    }
    return read;
  };
  const ledgerRead = pinFile(prescribed[0], closeout.subject_after.ledger_sha256, 'ledger');
  const contextRead = pinFile(prescribed[1], closeout.subject_after.context_sha256, 'context');
  pinFile(prescribed[2], closeout.subject_after.evidence_json_sha256, 'evidence');

  if (ledgerRead && !ledgerRead.missing) {
    try {
      const parsed = JSON.parse(ledgerRead.text);
      if (!isPlainObject(parsed) || !Array.isArray(parsed.tasks)) throw new Error('not a task ledger object');
      const rowsDigest = crypto.createHash('sha256').update(Buffer.from(JSON.stringify({
        ...parsed,
        tasks: parsed.tasks.filter((row) => isPlainObject(row) && row.id !== identity),
      }))).digest('hex');
      if (rowsDigest !== closeout.subject_after.ledger_rows_ex_task_sha256) {
        scope('ledger rows outside the closed-out task changed; unrelated authority stays stale at closeout', 'live.closeout.ledger_rows');
      }
      // Live readback of the closed task's own row: unique, completed, and
      // byte/structure-equivalent beyond the status flip.
      const rowStop = (message) => diagnostics.push(diagnostic('closeout_task_row', message, 'live.closeout.task_row'));
      const currentRows = parsed.tasks.filter((row) => isPlainObject(row) && row.id === identity);
      if (currentRows.length === 0) {
        rowStop(`the task ledger no longer carries the closed task row ${identity}`);
      } else if (currentRows.length > 1) {
        rowStop(`the task ledger carries duplicate rows for ${identity}`);
      } else {
        if (currentRows[0].status !== 'completed') {
          rowStop('the closed task row did not end completed');
        }
        if (rowExStatusDigest(currentRows[0]) !== closeout.subject_after.ledger_row_ex_status_sha256) {
          rowStop('the current task row drifted beyond its status flip: canonical ex-status digest mismatch');
        }
      }
    } catch (error) {
      scope(`the task ledger could not be parsed to verify the unrelated-row scope (${error.message})`, 'live.closeout.ledger_rows');
    }
  }
  if (contextRead && !contextRead.missing) {
    const boundary = closeoutBoundaryIndex(contextRead.text);
    if (boundary === -1) {
      scope('the task context no longer carries a closeout-section boundary', 'live.closeout.context_prefix');
    } else {
      const prefixSha = crypto.createHash('sha256')
        .update(Buffer.from(contextRead.text.slice(0, boundary), 'utf8')).digest('hex');
      if (prefixSha !== closeout.subject_after.context_prefix_sha256) {
        scope('the task-context bytes before the closeout sections changed; implementation records, the PPI, and Acceptance stay stale at closeout', 'live.closeout.context_prefix');
      }
    }
  }
  const evidenceRelative = `.ultra/evidence/${identity}`;
  try {
    const observation = stableDirectoryObservation(repoRoot, evidenceRelative, { required: true });
    const current = [];
    for (const [name, entry] of observation.entries) {
      if (name === 'evidence.json') continue;
      if (entry.stat.isSymbolicLink() || !entry.stat.isFile()) {
        scope(`the evidence sibling ${name} is not an ordinary regular file`, 'live.closeout.evidence_siblings');
        continue;
      }
      const relative = `${evidenceRelative}/${name}`;
      const observed = stableShaOr({ root: repoRoot }, relative);
      if (observed.error || observed.missing) continue;
      current.push({ path: relative, sha256: observed.sha256 });
    }
    current.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    if (JSON.stringify(current) !== JSON.stringify(closeout.subject_after.evidence_siblings || [])) {
      scope('the evidence directory outside the final evidence record changed; pre-review evidence stays untouched at closeout', 'live.closeout.evidence_siblings');
    }
  } catch (error) {
    scope(`the task evidence directory could not be observed (${error.message})`, 'live.closeout.evidence_siblings');
  }

  const digestSecond = digestObservation(repoRoot);
  if (digestSecond.error) {
    diagnostics.push(diagnostic(
      'result_binding_unverifiable',
      `the closed-out subject could not be re-observed coherently: ${digestSecond.error}`,
      'live.final_worktree_digest',
    ));
    return live;
  }
  if (digestSecond.diff_digest !== digest.diff_digest) {
    diagnostics.push(diagnostic(
      'subject_changed_during_observation',
      'the product worktree digest changed between the first and the closing observation of this validation; let the concurrent change finish, then re-run the validator once',
      'live.final_worktree_digest',
    ));
    return live;
  }
  live.final_worktree_digest = digestSecond.diff_digest;
  live.closeout = 'applied';
  if (digestSecond.diff_digest !== closeout.subject_after.worktree_digest) {
    diagnostics.push(diagnostic(
      'closeout_binding',
      'the recomputed current product worktree digest differs from the closeout end-state digest; the subject moved after the closeout — a typed stop for the owner, never permission for a re-freeze or a new handoff',
      'live.final_worktree_digest',
    ));
  }
  return live;
}

function validateHandoffDir(handoffDir, options) {
  const anchor = handoffRootFor(handoffDir);
  const handoffId = path.basename(handoffDir);
  const diagnostics = [];
  const live = { observed: true };
  if (!HANDOFF_ID_PATTERN.test(handoffId) || anchor === null) {
    diagnostics.push(diagnostic(
      'handoff_id_invalid',
      'a handoff directory must be .ultra/.runtime/handoffs/<id> with a normalized id',
      handoffDir,
    ));
    return {
      handoff_id: handoffId,
      state: 'unknown',
      valid: false,
      diagnostics,
      live: null,
    };
  }
  // Anchor all stable reads on the real repository root so parent-chain walks
  // never depend on symlinked path components above the repository.
  let repoRoot = anchor.root;
  try {
    repoRoot = fs.realpathSync(anchor.root);
  } catch {
    repoRoot = anchor.root;
  }
  const handoffRelative = path.relative(anchor.root, handoffDir).split(path.sep).join('/');

  let observation;
  try {
    observation = stableDirectoryObservation(repoRoot, handoffRelative, { required: true });
  } catch (error) {
    diagnostics.push(diagnostic(error.code, error.message, handoffDir));
    return { handoff_id: handoffId, state: 'unknown', valid: false, diagnostics, live: null };
  }
  const entries = observation.entries;

  // A handoff directory holds exactly OFFER.json, optional ACK.json, optional
  // RESULT.json, and — only beside a completed v2 RESULT — the optional
  // CLOSEOUT receipt of the prescribed closeout transition; every other entry
  // of any type is a typed stop.
  for (const [name] of entries) {
    if (RECEIPT_FILES.includes(name)) continue;
    let kind = 'unknown_receipt_file';
    if (name.endsWith('.json')) {
      const extraRead = readJsonFile(repoRoot, `${handoffRelative}/${name}`);
      const parsed = extraRead.parsed;
      if (isPlainObject(parsed) && typeof parsed.$schema === 'string' && parsed.$schema.startsWith('ultra-delegation-')) {
        kind = 'delegation_receipt_in_handoff';
      }
    }
    diagnostics.push(diagnostic(
      kind,
      'a handoff directory holds exactly OFFER.json, optional ACK.json, optional RESULT.json, and — only beside a completed v2 RESULT — optional CLOSEOUT.json; use a fresh handoff id instead of extra receipts',
      name,
    ));
  }

  const offerRead = readReceipt(repoRoot, `${handoffRelative}/OFFER.json`, 'OFFER', diagnostics);
  const ackRead = readReceipt(repoRoot, `${handoffRelative}/ACK.json`, 'ACK', diagnostics);
  const resultRead = readReceipt(repoRoot, `${handoffRelative}/RESULT.json`, 'RESULT', diagnostics);
  const closeoutRead = readReceipt(repoRoot, `${handoffRelative}/CLOSEOUT.json`, 'CLOSEOUT', diagnostics);

  const offer = offerRead.payload || null;
  if (offerRead.read && offer) {
    validateOffer(handoffId, repoRoot, offer, diagnostics);
  }

  let ackState = null;
  if (ackRead.read) {
    if (offer) {
      ackState = validateAck(offer, ackRead.payload, handoffId, diagnostics);
    } else {
      diagnostics.push(diagnostic('ack_schema', 'an ACK cannot be validated without its OFFER', 'ACK.json'));
    }
  }

  let terminal = null;
  if (resultRead.read) {
    if (offer) {
      terminal = validateResult(offer, ackState, resultRead.payload, handoffId, repoRoot, diagnostics);
    } else {
      diagnostics.push(diagnostic('result_schema', 'a RESULT cannot be validated without its OFFER', 'RESULT.json'));
    }
  }

  let closeout = null;
  if (closeoutRead.read) {
    if (resultRead.read && offer && terminal === 'completed'
        && resultRead.payload?.$schema === RESULT_V2_SCHEMA) {
      closeout = validateCloseout(offer, resultRead.payload, closeoutRead.payload, handoffId, repoRoot, diagnostics);
    } else {
      diagnostics.push(diagnostic(
        'closeout_without_result',
        'a CLOSEOUT receipt attaches only to a completed v2 RESULT in the same handoff; a fresh handoff or the owner boundary — never an invented receipt — is the other route',
        'CLOSEOUT.json',
      ));
    }
  }

  let state = 'offered';
  if (!offerRead.read) state = 'unknown';
  if (ackState === 'blocked') state = 'blocked';
  if (ackState === 'ready') state = 'active';
  if (TERMINAL_STATES.includes(terminal)) state = terminal;

  const entry = {
    handoff_id: handoffId,
    state,
    valid: false,
    diagnostics,
    live: null,
    time: latestReceiptTime([offerRead.payload, ackRead.payload, resultRead.payload, closeoutRead.payload]),
  };

  if (options.live) {
    const superseded = options.superseded !== undefined
      ? options.superseded
      : supersededByNewerHandoff(repoRoot, handoffId, entry.time, offer);
    entry.live = liveObservations(
      offer,
      ackRead.payload,
      ackState,
      terminal,
      resultRead.payload,
      repoRoot,
      diagnostics,
      live,
      superseded,
      closeout,
    );
  }
  entry.valid = diagnostics.every((item) => item.severity !== 'error');
  return entry;
}

function readReceipt(repoRoot, relative, label, diagnostics) {
  const read = readJsonFile(repoRoot, relative);
  if (read.missing) return { read: false };
  if (read.readCode) {
    diagnostics.push(diagnostic(read.readCode, `${label}.json: ${read.readMessage}`, `${label}.json`));
    return { read: true, payload: null };
  }
  if (read.jsonError) {
    diagnostics.push(diagnostic(`${label.toLowerCase()}_invalid_json`, `${label}.json is not valid JSON: ${read.jsonError}`, `${label}.json`));
    return { read: true, payload: null };
  }
  return { read: true, payload: read.parsed };
}

function latestReceiptTime(payloads) {
  let latest = null;
  for (const payload of payloads) {
    const time = receiptTime(payload);
    if (time !== null && (latest === null || time > latest)) latest = time;
  }
  return latest;
}

// A newer handoff supersedes an older terminal receipt only when it continues
// the same transfer subject and authority: the same repository root, the same
// accepted task identity, and the same owner-grant decision bytes.
function subjectKey(offer) {
  if (!isPlainObject(offer)) return null;
  const grants = Array.isArray(offer.frozen_inputs)
    ? offer.frozen_inputs
      .filter(isPlainObject)
      .filter((input) => typeof input.path === 'string' && input.path.startsWith('.ultra/decisions/'))
      .map((input) => `${input.path}:${input.sha256}`)
      .sort()
    : [];
  return JSON.stringify([
    offer.repository && typeof offer.repository.root === 'string' ? offer.repository.root : null,
    offer.accepted_scope && typeof offer.accepted_scope.new_task_identity === 'string'
      ? offer.accepted_scope.new_task_identity
      : null,
    grants,
  ]);
}

function supersededByNewerHandoff(repoRoot, ownId, ownTime, ownOffer) {
  const ownKey = subjectKey(ownOffer);
  if (ownKey === null) return false;
  let siblings;
  try {
    siblings = listHandoffDirs(repoRoot);
  } catch {
    return false;
  }
  for (const dir of siblings) {
    if (path.basename(dir) === ownId) continue;
    const siblingRelative = path.relative(repoRoot, dir).split(path.sep).join('/');
    const offerRead = readJsonFile(repoRoot, `${siblingRelative}/OFFER.json`);
    const ackRead = readJsonFile(repoRoot, `${siblingRelative}/ACK.json`);
    const resultRead = readJsonFile(repoRoot, `${siblingRelative}/RESULT.json`);
    const other = Math.max(
      receiptTime(offerRead.parsed),
      receiptTime(ackRead.parsed),
      receiptTime(resultRead.parsed),
    );
    if (other === null) continue;
    if (ownTime !== null && other <= ownTime) continue;
    if (subjectKey(offerRead.parsed) === ownKey) return true;
  }
  return false;
}

function validateRepo(repoRoot, options) {
  const diagnostics = [];
  let handoffs = [];
  try {
    handoffs = listHandoffDirs(repoRoot).map((dir) => validateHandoffDir(dir, options));
  } catch (error) {
    diagnostics.push(diagnostic(
      error && error.code ? error.code : 'handoff_scan_limit',
      `${error && error.message ? error.message : error}`,
      HANDOFFS_ROOT_RELATIVE,
    ));
  }
  const active = handoffs.filter((entry) => entry.state === 'active');
  if (active.length > 1) {
    diagnostics.push(diagnostic(
      'multiple_active_transfers',
      `more than one ACK-ready handoff is active (${active.map((entry) => entry.handoff_id).join(', ')}); a work package has one canonical primary writer`,
      '.ultra/.runtime/handoffs',
    ));
  }
  return {
    $schema: REPORT_SCHEMA,
    path: repoRoot,
    handoffs,
    diagnostics,
    valid: diagnostics.every((item) => item.severity !== 'error')
      && handoffs.every((entry) => entry.valid),
  };
}

function usage() {
  process.stderr.write(
    'usage: validate_primary_transfer.cjs <handoff-dir | repo-root> [--live]\n'
    + 'Validates OFFER/ACK/RESULT primary-transfer receipts structurally.\n'
    + '--live additionally observes the active-transfer HEAD and ledger row, whether\n'
    + 'the ACK-start worktree digest still holds, and — for the newest v2 terminal\n'
    + 'RESULT — the recomputed final HEAD, worktree digest, exact product path\n'
    + 'inventory, and final frozen-input digests. A CLOSEOUT receipt beside a\n'
    + 'completed v2 RESULT binds the one prescribed post-review closeout instead:\n'
    + 'the closeout end-state digest, the pinned reviewed subject, and the frozen\n'
    + 'ledger-row, context-prefix, and pre-review-evidence scopes.\n',
  );
  process.exitCode = 2;
}

function main(argv) {
  const live = argv.includes('--live');
  const targets = argv.filter((arg) => arg !== '--live');
  if (targets.length !== 1 || !targets[0]) {
    usage();
    return;
  }
  const target = path.resolve(targets[0]);
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    usage();
    return;
  }
  const anchor = fs.existsSync(path.join(target, 'OFFER.json'))
    || (path.basename(target) !== 'handoffs'
      && path.basename(path.dirname(target)) === 'handoffs');
  let report;
  if (anchor) {
    const single = validateHandoffDir(target, { live });
    report = {
      $schema: REPORT_SCHEMA,
      path: target,
      handoffs: [single],
      diagnostics: [],
      valid: single.valid,
    };
  } else {
    report = validateRepo(target, { live });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  TERMINAL_STATES,
  validateHandoffDir,
  validateRepo,
};
