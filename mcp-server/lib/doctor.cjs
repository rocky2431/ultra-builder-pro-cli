'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { REQUIRED_TABLES, tableNames } = require('./state-db.cjs');
const ops = require('./state-ops.cjs');
const runtime = require('./runtime-state.cjs');
const projector = require('./projector.cjs');
const recovery = require('../../orchestrator/recovery.cjs');
const baselines = require('./baseline-workflow.cjs');
const changes = require('./change-workflow.cjs');
const archiveJournal = require('./archive-journal.cjs');
const workflows = require('./workflow-state.cjs');
const decisions = require('./decision-dialogue.cjs');

const SPEC_CONSUMER = 'spec-staleness';

class DoctorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DoctorError';
    this.code = code;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function inspectSystem(db, { rootDir = process.cwd() } = {}) {
  const tables = new Set(tableNames(db));
  const missing = REQUIRED_TABLES.filter((name) => !tables.has(name));
  const integrity = db.pragma('quick_check', { simple: true });
  const incidents = missing.length === 0 ? runtime.listIncidents(db, { status: 'open' }) : [];
  const pending = missing.length === 0 ? runtime.listProjectionJobs(db, { status: 'pending' }) : [];
  const running = missing.length === 0 ? runtime.listProjectionJobs(db, { status: 'running' }) : [];
  const failed = missing.length === 0 ? runtime.listProjectionJobs(db, { status: 'failed' }) : [];
  const orphanSessions = missing.length === 0
    ? db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE status = 'orphan'").get().count
    : 0;
  const eventCursor = missing.length === 0
    ? Number(db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM events').get().id)
    : 0;
  const projectedCursor = missing.length === 0
    ? Number(db.prepare(
        "SELECT COALESCE(MAX(event_cursor), 0) AS id FROM projection_jobs WHERE status = 'completed'",
      ).get().id)
    : 0;
  const activeMissing = missing.length === 0
    ? db.prepare(
        `SELECT artifact_root FROM changes
         WHERE status IN ('active', 'blocked', 'ready') AND artifact_root IS NOT NULL`,
      ).all().filter((row) => row.artifact_root && !fs.existsSync(path.resolve(rootDir, row.artifact_root))).length
    : 0;
  const archiveIntents = missing.length === 0 ? archiveJournal.listArchiveIntents(rootDir) : [];
  const corruptArchiveIntents = archiveIntents.filter((item) => item.error).length;
  const baseline = missing.length === 0
    ? baselines.inspectBaseline(db, { rootDir })
    : { status: 'fail', blockers: ['BASELINE_STATE_UNAVAILABLE'], warnings: [], baseline: null };
  const workflowHealth = missing.length === 0
    ? workflows.inspectWorkflowHealth(db, { rootDir })
    : {
      status: 'fail', active: 0, blocked: 0, ready: 0, stale_outputs: [],
      historical_stale_outputs: [], terminal_authority_runs: [], untracked_active_changes: [],
    };
  const decisionHealth = missing.length === 0
    ? decisions.inspectDecisionHealth(db, { rootDir })
    : {
      status: 'fail', active: 0, completed: 0, awaiting_owner: 0, awaiting_blocking: 0,
      checkpoint_ready: 0,
      deferred_blocking: 0, stale_artifacts: [], current: null, current_thread_id: null,
    };
  const baselineCheckStatus = baseline.status === 'pass'
    ? 'pass'
    : (baseline.baseline?.status === 'ready' ? 'fail' : 'warning');
  const degraded = integrity !== 'ok' || missing.length > 0 || incidents.length > 0
    || pending.length > 0 || running.length > 0 || failed.length > 0 || orphanSessions > 0 || activeMissing > 0
    || archiveIntents.length > 0
    || eventCursor > projectedCursor || workflowHealth.status === 'fail'
    || decisionHealth.status === 'fail'
    || baselineCheckStatus === 'fail';
  return {
    status: degraded ? 'degraded' : 'healthy',
    checks: {
      state_db: { status: integrity === 'ok' && missing.length === 0 ? 'pass' : 'fail', integrity, missing_tables: missing },
      incidents: { status: incidents.length === 0 ? 'pass' : 'fail', open: incidents.length, items: incidents },
      projections: {
        status: pending.length === 0 && running.length === 0 && failed.length === 0 && eventCursor <= projectedCursor ? 'pass' : 'fail',
        pending: pending.length, running: running.length, failed: failed.length,
        event_cursor: eventCursor, projected_cursor: projectedCursor,
      },
      sessions: { status: orphanSessions === 0 ? 'pass' : 'fail', orphan: orphanSessions },
      change_artifacts: { status: activeMissing === 0 ? 'pass' : 'fail', missing: activeMissing },
      archive_recovery: {
        status: archiveIntents.length === 0 ? 'pass' : 'fail',
        pending: archiveIntents.length, corrupt: corruptArchiveIntents,
      },
      baseline: {
        status: baselineCheckStatus,
        readiness: baseline.status,
        mode: baseline.baseline?.mode || null,
        baseline_status: baseline.baseline?.status || null,
        id: baseline.baseline?.id || null,
        repository_revision: baseline.baseline?.repository_revision || null,
        repository_branch: baseline.baseline?.repository_branch || null,
        worktree_state: baseline.baseline?.worktree_state || 'unavailable',
        gaps: baseline.baseline ? baselines.summarizeGaps(baseline.baseline.gaps) : null,
        blockers: baseline.blockers,
        warnings: baseline.warnings,
      },
      workflows: {
        status: workflowHealth.status === 'fail'
          ? 'fail'
          : (workflowHealth.blocked > 0
            || workflowHealth.historical_stale_outputs.length > 0
            || workflowHealth.terminal_authority_runs.length > 0
            || workflowHealth.untracked_active_changes.length > 0 ? 'warning' : 'pass'),
        active: workflowHealth.active,
        blocked: workflowHealth.blocked,
        ready: workflowHealth.ready,
        stale_outputs: workflowHealth.stale_outputs,
        historical_stale_outputs: workflowHealth.historical_stale_outputs,
        terminal_authority_runs: workflowHealth.terminal_authority_runs,
        untracked_active_changes: workflowHealth.untracked_active_changes,
      },
      decisions: decisionHealth,
      external_providers: {
        status: 'pass', ownership: 'external',
        note: 'Ultra stores provider metadata references only and never owns memory or code-graph content.',
      },
    },
  };
}

async function backupDatabase(db, rootDir) {
  const backupDir = path.join(rootDir, '.ultra', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `state-${timestamp()}.db`);
  try { await db.backup(backupPath); }
  catch (error) { throw new DoctorError('BACKUP_FAILED', `state.db backup failed: ${error.message}`); }
  return backupPath;
}

async function runDoctor(db, {
  rootDir = process.cwd(), repair = false, project = projector.projectAll,
  projectionStaleAfterMs = 5 * 60 * 1000,
} = {}) {
  if (!repair) return { ...inspectSystem(db, { rootDir }), repair_performed: false };
  const backupPath = await backupDatabase(db, rootDir);
  const archives = changes.recoverInterruptedArchives(db, { rootDir });
  const workflowRecovery = workflows.recoverUntrackedChangeWorkflows(db, { rootDir });
  const recovered = recovery.recoverOnBoot(db);
  const cursor = runtime.readConsumerCursor(db, SPEC_CONSUMER);
  const consumed = ops.consumeSpecChangedEvents(db, { since_id: cursor, limit: 500 });
  runtime.writeConsumerCursor(db, SPEC_CONSUMER, consumed.next_since_id);
  const interrupted = runtime.requeueInterruptedProjections(db, {
    staleBefore: new Date(Date.now() - Math.max(0, projectionStaleAfterMs)).toISOString(),
  });
  const requeued = runtime.requeueFailedProjections(db);
  const ensured = runtime.ensureProjectionJob(db, { tool_name: 'system.doctor' });
  const projections = runtime.processProjectionJobs(db, { rootDir, project, limit: 500 });
  return {
    ...inspectSystem(db, { rootDir }),
    repair_performed: true,
    backup_path: backupPath,
    repair: {
      archives, workflows: workflowRecovery, recovered, consumed,
      interrupted, requeued, ensured, projections,
    },
  };
}

module.exports = {
  DoctorError,
  SPEC_CONSUMER,
  inspectSystem,
  runDoctor,
};
