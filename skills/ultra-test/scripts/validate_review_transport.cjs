#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const MAX_REVIEW_JSON_BYTES = 8 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;

function diagnostic(code, message) {
  return { code, message };
}

function parseObject(bytes, diagnostics, label) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      diagnostics.push(diagnostic(`${label}_not_object`, `${label} must be a JSON object`));
      return null;
    }
    return value;
  } catch (error) {
    diagnostics.push(diagnostic(`${label}_unreadable`, `${label} is unreadable JSON: ${error.message}`));
    return null;
  }
}

function reportLocation(reportFile, diagnostics) {
  const reportDirectory = path.dirname(reportFile);
  if (path.basename(reportFile) !== 'test-report.json'
      || path.basename(reportDirectory) !== '.ultra') {
    diagnostics.push(diagnostic(
      'report_canonical_path',
      'report must be the canonical repository .ultra/test-report.json',
    ));
    return null;
  }
  try {
    const inputProjectRoot = path.dirname(reportDirectory);
    const root = fs.realpathSync(inputProjectRoot);
    return {
      projectRoot: root,
      inputProjectRoot,
      relative: '.ultra/test-report.json',
      path: path.join(root, '.ultra', 'test-report.json'),
    };
  } catch (error) {
    diagnostics.push(diagnostic(
      'report_repository_root',
      `report repository root cannot be resolved: ${error.message}`,
    ));
    return null;
  }
}

function inspectRepositoryPath(projectRoot, relative, label) {
  const segments = relative.split('/');
  const directories = [projectRoot];
  for (const segment of segments.slice(0, -1)) {
    directories.push(path.join(directories[directories.length - 1], segment));
  }
  const componentIdentities = [];
  const directoryFlags = fs.constants.O_RDONLY
    | (fs.constants.O_DIRECTORY || 0)
    | (fs.constants.O_NOFOLLOW || 0);
  for (let index = 0; index < directories.length; index += 1) {
    const target = directories[index];
    const component = index === 0 ? 'repository root' : segments[index - 1];
    let entry;
    let descriptor;
    try {
      entry = fs.lstatSync(target, { bigint: true });
      if (entry.isSymbolicLink()) {
        return {
          error: diagnostic(
            `${label}_snapshot_symlink_component`,
            `${label} canonical path must not contain a symlink component: ${component}`,
          ),
        };
      }
      if (!entry.isDirectory()) {
        return {
          error: diagnostic(
            `${label}_snapshot_not_regular`,
            `${label} canonical path must end in a regular file beneath real directories; retry after workspace writes settle`,
          ),
        };
      }
      descriptor = fs.openSync(target, directoryFlags);
      const opened = fs.fstatSync(descriptor, { bigint: true });
      if (!opened.isDirectory() || !sameComponentIdentity(entry, opened)) {
        return {
          error: diagnostic(
            `${label}_snapshot_changed`,
            `${label} path component changed before its stable raw-byte snapshot could be read; retry after writes settle`,
          ),
        };
      }
      componentIdentities.push(componentIdentity(opened));
    } catch (error) {
      return {
        error: diagnostic(
          `${label}_snapshot_missing`,
          `${label} canonical path is missing or unreadable: ${error.message}`,
        ),
      };
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }

  const target = path.join(projectRoot, ...segments);
  let entry;
  try {
    entry = fs.lstatSync(target, { bigint: true });
  } catch (error) {
    return {
      error: diagnostic(
        `${label}_snapshot_missing`,
        `${label} canonical path is missing or unreadable: ${error.message}`,
      ),
    };
  }
  if (entry.isSymbolicLink()) {
    return {
      error: diagnostic(
        `${label}_snapshot_symlink_component`,
        `${label} canonical path must not contain a symlink component: ${segments.at(-1)}`,
      ),
    };
  }
  if (!entry.isFile()) {
    return {
      error: diagnostic(
        `${label}_snapshot_not_regular`,
        `${label} canonical path must end in a regular file beneath real directories; retry after workspace writes settle`,
      ),
    };
  }
  return { target, entry, componentIdentities };
}

function componentIdentity(value) {
  return {
    dev: value.dev,
    ino: value.ino,
    mode: value.mode,
  };
}

function sameComponentIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode;
}

function sameComponentIdentities(left, right) {
  return left.length === right.length
    && left.every((identity, index) => sameComponentIdentity(identity, right[index]));
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readBoundedStableSnapshot(projectRoot, relative, diagnostics, label) {
  const beforePath = inspectRepositoryPath(projectRoot, relative, label);
  if (beforePath.error) {
    diagnostics.push(beforePath.error);
    return null;
  }
  if (beforePath.entry.size > BigInt(MAX_REVIEW_JSON_BYTES)) {
    diagnostics.push(diagnostic(
      `${label}_snapshot_oversize`,
      `${label} exceeds the ${MAX_REVIEW_JSON_BYTES}-byte snapshot limit`,
    ));
    return null;
  }

  let descriptor;
  const chunks = [];
  let observed = 0;
  let beforeDescriptor;
  let afterDescriptor;
  try {
    descriptor = fs.openSync(
      beforePath.target,
      fs.constants.O_RDONLY
        | fs.constants.O_NONBLOCK
        | (fs.constants.O_NOFOLLOW || 0),
    );
    beforeDescriptor = fs.fstatSync(descriptor, { bigint: true });
    if (!beforeDescriptor.isFile()
        || !sameFileIdentity(beforePath.entry, beforeDescriptor)) {
      diagnostics.push(diagnostic(
        `${label}_snapshot_changed`,
        `${label} changed before its stable raw-byte snapshot could be read; retry after writes settle`,
      ));
      return null;
    }

    while (true) {
      const capacity = Math.min(
        READ_CHUNK_BYTES,
        MAX_REVIEW_JSON_BYTES + 1 - observed,
      );
      const chunk = Buffer.allocUnsafe(capacity);
      const count = fs.readSync(descriptor, chunk, 0, capacity, null);
      if (count === 0) break;
      observed += count;
      if (observed > MAX_REVIEW_JSON_BYTES) {
        diagnostics.push(diagnostic(
          `${label}_snapshot_oversize`,
          `${label} exceeds the ${MAX_REVIEW_JSON_BYTES}-byte snapshot limit`,
        ));
        return null;
      }
      chunks.push(chunk.subarray(0, count));
    }
    afterDescriptor = fs.fstatSync(descriptor, { bigint: true });
  } catch (error) {
    diagnostics.push(diagnostic(
      `${label}_snapshot_unreadable`,
      `${label} raw-byte snapshot could not be captured safely; retry after writes settle: ${error.message}`,
    ));
    return null;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }

  const afterPath = inspectRepositoryPath(projectRoot, relative, label);
  if (afterPath.error
      || !sameComponentIdentities(
        beforePath.componentIdentities,
        afterPath.componentIdentities,
      )
      || !sameFileIdentity(beforeDescriptor, afterDescriptor)
      || !sameFileIdentity(afterDescriptor, afterPath.entry)
      || BigInt(observed) !== afterDescriptor.size) {
    diagnostics.push(diagnostic(
      `${label}_snapshot_changed`,
      `${label} changed while its stable raw-byte snapshot was captured; retry after writes settle`,
    ));
    return null;
  }
  return {
    path: beforePath.target,
    bytes: Buffer.concat(chunks, observed),
  };
}

function canonicalSummaryPath(location, summaryFile, value, diagnostics) {
  if (!location || typeof value !== 'string') {
    diagnostics.push(diagnostic(
      'review_summary_ref',
      'report review.summary_ref must be a normalized repository-relative summary path',
    ));
    return null;
  }
  const segments = value.split('/');
  const canonical = segments.length === 4
    && segments[0] === '.ultra'
    && segments[1] === 'reviews'
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segments[2])
    && segments[3] === 'SUMMARY.json'
    && !value.includes('\\')
    && !value.includes('\0')
    && path.posix.normalize(value) === value;
  if (!canonical) {
    diagnostics.push(diagnostic(
      'review_summary_ref',
      'report review.summary_ref must be .ultra/reviews/<session>/SUMMARY.json as a normalized repository-relative POSIX path',
    ));
    return null;
  }

  const candidate = path.join(location.projectRoot, ...segments);
  const supplied = path.resolve(summaryFile);
  const inputCandidate = path.join(location.inputProjectRoot, ...segments);
  if (supplied !== candidate && supplied !== inputCandidate) {
    diagnostics.push(diagnostic(
      'review_summary_ref',
      'the CLI summary path must equal the report repository summary_ref',
    ));
    return null;
  }
  return {
    path: candidate,
    relative: value,
  };
}

function validateSummaryWithWaiter(
  summaryFile,
  summary,
  snapshot,
  diagnostics,
  legacyV4,
) {
  if (!summary || typeof summary.packet_digest !== 'string'
      || !/^[0-9a-f]{64}$/.test(summary.packet_digest)) {
    diagnostics.push(diagnostic(
      'summary_packet_digest',
      'summary packet_digest must be a lowercase SHA-256 before waiter validation',
    ));
    return;
  }
  const waiter = path.resolve(
    __dirname,
    '..',
    '..',
    'ultra-review',
    'scripts',
    'review_wait.py',
  );
  const waiterArguments = [
    waiter,
    path.dirname(summaryFile),
    'summary',
    '--packet-digest',
    summary.packet_digest,
  ];
  if (legacyV4) waiterArguments.push('--legacy-v4');
  waiterArguments.push(
    '--summary-snapshot-digest',
    snapshot.digest,
  );
  const result = spawnSync('python3', waiterArguments, {
    encoding: 'utf8',
    input: snapshot.bytes,
    timeout: 10_000,
    maxBuffer: 64 * 1024,
    env: {
      ...process.env,
      UBP_REVIEW_WAIT_TIMEOUT: '0.05',
      UBP_REVIEW_WAIT_POLL: '0.01',
    },
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message
      || result.stdout?.trim()
      || result.stderr?.trim()
      || `exit ${result.status}`;
    diagnostics.push(diagnostic(
      'summary_waiter_validation',
      `summary failed canonical review_wait.py validation: ${detail}`,
    ));
    return;
  }
  try {
    const receipt = JSON.parse(result.stdout);
    if (receipt.status !== 'complete' || receipt.summary_digest !== snapshot.digest) {
      diagnostics.push(diagnostic(
        'summary_waiter_snapshot',
        'canonical review_wait.py did not validate the exact supplied SUMMARY.json snapshot',
      ));
    }
  } catch (error) {
    diagnostics.push(diagnostic(
      'summary_waiter_snapshot',
      `canonical review_wait.py returned an invalid snapshot receipt: ${error.message}`,
    ));
  }
}

function validateTransport(summaryFile, reportFile, options = {}) {
  const resolvedReport = path.resolve(reportFile);
  const diagnostics = [];
  const location = reportLocation(resolvedReport, diagnostics);
  const reportSnapshot = location
    ? readBoundedStableSnapshot(
      location.projectRoot,
      location.relative,
      diagnostics,
      'report',
    )
    : null;
  const report = reportSnapshot
    ? parseObject(reportSnapshot.bytes, diagnostics, 'report')
    : null;
  const review = report && report.review;
  const summaryLocation = report
    ? canonicalSummaryPath(
      location,
      summaryFile,
      review && typeof review === 'object' && !Array.isArray(review)
        ? review.summary_ref
        : null,
      diagnostics,
    )
    : null;
  const summarySnapshot = summaryLocation
    ? readBoundedStableSnapshot(
      location.projectRoot,
      summaryLocation.relative,
      diagnostics,
      'summary',
    )
    : null;
  const summary = summarySnapshot
    ? parseObject(summarySnapshot.bytes, diagnostics, 'summary')
    : null;
  const summaryDigest = summarySnapshot
    ? crypto.createHash('sha256').update(summarySnapshot.bytes).digest('hex')
    : null;
  if (summaryLocation && summarySnapshot) {
    validateSummaryWithWaiter(
      summaryLocation.path,
      summary,
      { bytes: summarySnapshot.bytes, digest: summaryDigest },
      diagnostics,
      options.legacyV4 === true,
    );
  }

  if (summary && summary.$schema !== 'ultra-review-summary-v4') {
    diagnostics.push(diagnostic(
      'summary_schema',
      'summary must use ultra-review-summary-v4',
    ));
  }
  if (report && !['ultra-test-report-v1', 'ultra-test-report-v2'].includes(report.$schema)) {
    diagnostics.push(diagnostic(
      'report_schema',
      'report must use ultra-test-report-v1 or ultra-test-report-v2',
    ));
  }
  if (report && report.$schema === 'ultra-test-report-v2' && !Array.isArray(report.task_evidence)) {
    diagnostics.push(diagnostic(
      'report_task_evidence',
      'ultra-test-report-v2 task_evidence must be an array',
    ));
  }
  if (summary && !Array.isArray(summary.findings)) {
    diagnostics.push(diagnostic('summary_findings', 'summary findings must be an array'));
  }
  if (report && !Array.isArray(report.findings)) {
    diagnostics.push(diagnostic('report_findings', 'report findings must be an array'));
  }

  if (report && (!review || Array.isArray(review) || typeof review !== 'object')) {
    diagnostics.push(diagnostic('report_review', 'report review must be an object'));
  }
  if (summary && review && typeof review === 'object' && !Array.isArray(review)) {
    const exactMetadata = [
      ['session', summary.session],
      ['packet_digest', summary.packet_digest],
      ['execution_mode', summary.execution_mode],
      ['verdict', summary.verdict],
      ['context_digest', summary.context_digest],
      ['worktree_digest', summary.worktree_digest],
    ];
    if (options.legacyV4 !== true) {
      exactMetadata.push(
        ['admission_digest', summary.admission_digest],
        ['subject_digest', summary.subject_digest],
      );
    }
    for (const [field, expected] of exactMetadata) {
      if (review[field] !== expected) {
        diagnostics.push(diagnostic(
          `review_${field}`,
          `report review.${field} must equal SUMMARY.json ${field}`,
        ));
      }
    }
    if (review.finding_schema !== 'ultra-review-findings-v4') {
      diagnostics.push(diagnostic(
        'review_finding_schema',
        'report review.finding_schema must be ultra-review-findings-v4',
      ));
    }
    if (review.summary_digest !== summaryDigest) {
      diagnostics.push(diagnostic(
        'review_summary_digest',
        'report review.summary_digest must equal the SHA-256 of exact SUMMARY.json bytes',
      ));
    }
    for (const field of ['coverage_refs', 'limitations']) {
      if (!isDeepStrictEqual(review[field], summary[field])) {
        diagnostics.push(diagnostic(
          `review_${field}`,
          `report review.${field} must equal SUMMARY.json ${field} unchanged`,
        ));
      }
    }
  }
  if (summary && report) {
    const exactSubjects = [
      ['change_id', report.change_id, summary.change_id],
      ['task_ids', report.task_ids, summary.task_ids],
      ['git_commit', report.git_commit, summary.head],
    ];
    for (const [field, observed, expected] of exactSubjects) {
      if (!isDeepStrictEqual(observed, expected)) {
        diagnostics.push(diagnostic(
          `review_subject_${field}`,
          `report ${field} must equal SUMMARY.json ${field === 'git_commit' ? 'head' : field}`,
        ));
      }
    }
  }
  if (summary && report && Array.isArray(summary.findings) && Array.isArray(report.findings)
      && !isDeepStrictEqual(report.findings, summary.findings)) {
    diagnostics.push(diagnostic(
      'finding_transport_mismatch',
      'report findings must equal every SUMMARY.json finding object in order and unchanged',
    ));
  }

  return {
    $schema: 'ultra-review-transport-validation-v1',
    summary: summaryLocation?.path || path.resolve(summaryFile),
    report: resolvedReport,
    summary_digest: summaryDigest,
    finding_count: Array.isArray(summary?.findings) ? summary.findings.length : 0,
    valid: diagnostics.length === 0,
    diagnostics,
  };
}

function main(argv) {
  const legacyV4 = argv.length === 5 && argv[4] === '--legacy-v4';
  if ((argv.length !== 4 && !legacyV4)
      || argv[0] !== '--summary'
      || argv[2] !== '--report') {
    process.stderr.write(
      'usage: validate_review_transport.cjs --summary <SUMMARY.json> --report <test-report.json> [--legacy-v4]\n',
    );
    process.exitCode = 2;
    return;
  }
  const result = validateTransport(argv[1], argv[3], { legacyV4 });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { validateTransport };
