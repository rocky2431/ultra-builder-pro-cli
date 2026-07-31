'use strict';

const baselines = require('./baseline-workflow.cjs');
const compatibility = require('./legacy-change-workflow.cjs');

function createChange(db, input, options = {}) {
  return compatibility.createKernelChange(db, input, options);
}

function updateChange(db, id, patch = {}, options = {}) {
  return compatibility.updateKernelChange(db, id, patch, options);
}

function assertTaskCreationAllowed(db, input = {}, {
  rootDir = process.cwd(),
} = {}) {
  const change = input.change_id ? compatibility.readChange(db, input.change_id) : null;
  if (input.change_id && !change) {
    throw new compatibility.ChangeWorkflowError(
      'CHANGE_NOT_FOUND',
      `change ${input.change_id} not found`,
    );
  }
  if (change && !['active', 'blocked'].includes(change.status)) {
    throw new compatibility.ChangeWorkflowError(
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
  return compatibility.archiveKernelChange(db, input, options);
}

module.exports = {
  ChangeWorkflowError: compatibility.ChangeWorkflowError,
  createChange,
  readChange: compatibility.readChange,
  listChanges: compatibility.listChanges,
  updateChange,
  recordDelta: compatibility.recordDelta,
  recordDocumentationReconciliation: compatibility.recordDocumentationReconciliation,
  archiveChange,
  normalizeDocsImpact: compatibility.normalizeDocsImpact,
  normalizeProviderRefs: compatibility.normalizeProviderRefs,
  normalizeBaselineBypass: compatibility.normalizeBaselineBypass,
  assertTaskCreationAllowed,
  recoverInterruptedArchives: compatibility.recoverInterruptedArchives,
};
