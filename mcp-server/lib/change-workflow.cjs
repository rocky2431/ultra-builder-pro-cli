'use strict';

const baselines = require('./baseline-workflow.cjs');
const kernel = require('./kernel-change-workflow.cjs');

function createChange(db, input, options = {}) {
  return kernel.createChange(db, input, options);
}

function updateChange(db, id, patch = {}, options = {}) {
  return kernel.updateChange(db, id, patch, options);
}

function supersedeChange(db, input = {}, options = {}) {
  return kernel.supersedeChange(db, input, options);
}

function assertTaskCreationAllowed(db, input = {}, {
  rootDir = process.cwd(),
} = {}) {
  const change = input.change_id ? kernel.readChange(db, input.change_id) : null;
  if (input.change_id && !change) {
    throw new kernel.ChangeWorkflowError(
      'CHANGE_NOT_FOUND',
      `change ${input.change_id} not found`,
    );
  }
  if (change && !['active', 'blocked'].includes(change.status)) {
    throw new kernel.ChangeWorkflowError(
      'CHANGE_NOT_MUTABLE',
      `change ${change.id} is ${change.status}`,
    );
  }
  const health = baselines.inspectBaseline(db, { rootDir });
  return {
    allowed: true,
    diagnostics: health.status === 'pass'
      ? []
      : (health.blockers || []).map((code) => ({
        code,
        severity: 'needs_attention',
      })),
  };
}

function archiveChange(db, input, options = {}) {
  return kernel.archiveChange(db, input, options);
}

module.exports = {
  ChangeWorkflowError: kernel.ChangeWorkflowError,
  createChange,
  readChange: kernel.readChange,
  listChanges: kernel.listChanges,
  updateChange,
  supersedeChange,
  recordDelta: kernel.recordDelta,
  recordDocumentationReconciliation: kernel.recordDocumentationReconciliation,
  archiveChange,
  normalizeDocsImpact: kernel.normalizeDocsImpact,
  normalizeProviderRefs: kernel.normalizeProviderRefs,
  normalizeBaselineBypass: kernel.normalizeBaselineBypass,
  assertTaskCreationAllowed,
  recoverInterruptedArchives: kernel.recoverInterruptedArchives,
};
