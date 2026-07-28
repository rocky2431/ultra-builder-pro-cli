'use strict';

const crypto = require('node:crypto');
const childProcess = require('node:child_process');
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
const runtimePaths = require('./runtime-paths.cjs');
const artifactRegistry = require('./artifact-registry.cjs');
const planStore = require('./plan-store.cjs');
const closeJournal = require('../../orchestrator/session-close-journal.cjs');

const SPEC_CONSUMER = 'spec-staleness';
const BACKUP_WORKER_FILENAME = 'doctor-backup-worker.cjs';
const BACKUP_WORKER_TIMEOUT_MS = 120 * 1000;
const BACKUP_WORKER_METHOD = 'sqlite-serialize-pinned-fd-v1';

class DoctorError extends Error {
  constructor(code, message, { cause, details } = {}) {
    super(message);
    this.name = 'DoctorError';
    this.code = code;
    if (cause) this.cause = cause;
    if (details !== undefined) this.details = details;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function inspectSessionCloses(db, {
  rootDir = process.cwd(),
  sessionsAvailable = true,
} = {}) {
  let intents;
  try {
    intents = closeJournal.list(rootDir);
  } catch (error) {
    return {
      status: 'fail',
      pending: 1,
      items: [{
        code: error.code || 'SESSION_CLOSE_JOURNAL_INVALID',
        reason: 'journal_invalid',
        message: error.message,
      }],
    };
  }
  const items = intents.map((intent) => {
    const session = sessionsAvailable ? ops.readSession(db, intent.sid) : null;
    let reason = 'recovery_required';
    if (!sessionsAvailable) reason = 'session_state_unavailable';
    else if (!session) reason = 'session_missing';
    else if (session.status === intent.requested_status) reason = 'terminal_reconciliation_required';
    else if (['completed', 'crashed'].includes(session.status)) {
      reason = `terminal_status_conflict:${session.status}`;
    } else if (recovery._internal.isPidAlive(session.pid)) {
      reason = 'worker_still_alive';
    }
    return {
      code: 'SESSION_CLOSE_PENDING',
      sid: intent.sid,
      task_id: intent.task_id,
      requested_status: intent.requested_status,
      phase: intent.phase,
      reason,
    };
  });
  return {
    status: items.length === 0 ? 'pass' : 'fail',
    pending: items.length,
    items,
  };
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
  const sessionCloses = inspectSessionCloses(db, {
    rootDir,
    sessionsAvailable: missing.length === 0,
  });
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
  const artifactHealth = missing.length === 0
    ? artifactRegistry.inspectArtifactHealth(db, { rootDir })
    : { status: 'fail', registered: 0, issues: [], counts: {} };
  const planPublications = missing.length === 0
    ? planStore.inspectPlanPublications(db, { rootDir })
    : { status: 'fail', pending: 0, transactions: [], issues: [] };
  const baselineCheckStatus = baseline.status === 'pass'
    ? 'pass'
    : (baseline.baseline?.status === 'ready' ? 'fail' : 'warning');
  const degraded = integrity !== 'ok' || missing.length > 0 || incidents.length > 0
    || pending.length > 0 || running.length > 0 || failed.length > 0 || orphanSessions > 0 || activeMissing > 0
    || sessionCloses.status === 'fail'
    || archiveIntents.length > 0
    || eventCursor > projectedCursor || workflowHealth.status === 'fail'
    || decisionHealth.status === 'fail'
    || artifactHealth.status === 'fail'
    || planPublications.status === 'fail'
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
      sessions: {
        status: orphanSessions === 0 && sessionCloses.status === 'pass' ? 'pass' : 'fail',
        orphan: orphanSessions,
        close_pending: sessionCloses.pending,
        close_intents: sessionCloses.items,
      },
      change_artifacts: { status: activeMissing === 0 ? 'pass' : 'fail', missing: activeMissing },
      artifacts: artifactHealth,
      plan_publications: planPublications,
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

function statIdentity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function sameIdentity(left, right) {
  return String(left?.dev) === String(right?.dev)
    && String(left?.ino) === String(right?.ino);
}

function backupWorkerPath() {
  const runtimeRoot = process.env.UBP_RUNTIME_ROOT
    ? path.resolve(process.env.UBP_RUNTIME_ROOT)
    : null;
  const candidate = runtimeRoot
    ? path.join(runtimeRoot, 'runtime', BACKUP_WORKER_FILENAME)
    : path.join(__dirname, BACKUP_WORKER_FILENAME);
  const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
    throw new DoctorError(
      'BACKUP_FAILED',
      `Doctor backup worker is missing or unsafe: ${candidate}`,
    );
  }
  return candidate;
}

function canonicalStateDb(db) {
  const main = db.pragma('database_list').find((row) => row.name === 'main');
  const sourcePath = path.resolve(String(main?.file || ''));
  const stat = fs.lstatSync(sourcePath, {
    bigint: true,
    throwIfNoEntry: false,
  });
  if (!main?.file || !stat || stat.isSymbolicLink() || !stat.isFile()) {
    throw new DoctorError(
      'BACKUP_FAILED',
      `canonical state database is missing or unsafe: ${sourcePath}`,
    );
  }
  return { sourcePath, sourceIdentity: statIdentity(stat) };
}

function decodeBackupWorker(result, expected) {
  if (result.error) {
    throw new DoctorError(
      'BACKUP_FAILED',
      `cannot start Doctor backup worker: ${result.error.message}`,
      { cause: result.error },
    );
  }
  let payload;
  try {
    payload = JSON.parse(String(result.stdout || '').trim());
  } catch (cause) {
    throw new DoctorError(
      'BACKUP_FAILED',
      `Doctor backup worker returned invalid output: ${String(result.stderr || '').trim()}`,
      { cause },
    );
  }
  if (!payload?.ok) {
    throw new DoctorError(
      'BACKUP_FAILED',
      payload?.error?.message || 'Doctor backup worker failed',
      { details: payload?.error },
    );
  }
  const value = payload.result;
  const valid = result.status === 0
    && value && typeof value === 'object' && !Array.isArray(value)
    && value.output_name === expected.outputName
    && value.integrity === 'ok'
    && value.method === BACKUP_WORKER_METHOD
    && Number.isSafeInteger(value.size) && value.size > 0
    && /^[0-9a-f]{64}$/.test(value.digest || '')
    && sameIdentity(value.directory_identity, expected.directoryIdentity)
    && sameIdentity(value.source_identity, expected.sourceIdentity)
    && value.backup_identity && typeof value.backup_identity === 'object';
  if (!valid) {
    throw new DoctorError(
      'BACKUP_FAILED',
      'Doctor backup worker returned an invalid success payload',
      { details: { status: result.status, payload } },
    );
  }
  return value;
}

function verifyPublishedBackup(backupDir, backupPath, expected) {
  const directory = fs.lstatSync(backupDir, {
    bigint: true,
    throwIfNoEntry: false,
  });
  if (!directory || directory.isSymbolicLink() || !directory.isDirectory()
      || !sameIdentity(statIdentity(directory), expected.directoryIdentity)) {
    throw new DoctorError(
      'BACKUP_FAILED',
      'Doctor backup directory changed before backup publication could be verified',
    );
  }
  if (!Number.isInteger(fs.constants.O_NOFOLLOW) || fs.constants.O_NOFOLLOW === 0) {
    throw new DoctorError(
      'BACKUP_FAILED',
      'Doctor cannot verify backups without no-follow file support on this platform',
    );
  }
  let backupFd;
  try {
    backupFd = fs.openSync(
      backupPath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
  } catch (cause) {
    throw new DoctorError(
      'BACKUP_FAILED',
      'Doctor backup publication is missing or unsafe',
      { cause },
    );
  }
  let backup;
  let digest;
  try {
    backup = fs.fstatSync(backupFd, { bigint: true });
    if (!backup.isFile()
        || !sameIdentity(statIdentity(backup), expected.backupIdentity)) {
      throw new DoctorError(
        'BACKUP_FAILED',
        'Doctor backup publication does not match the worker-pinned file',
      );
    }
    digest = crypto.createHash('sha256').update(fs.readFileSync(backupFd)).digest('hex');
  } finally {
    fs.closeSync(backupFd);
  }
  if (digest !== expected.digest || Number(backup.size) !== expected.size) {
    throw new DoctorError(
      'BACKUP_FAILED',
      'Doctor backup publication failed post-worker verification',
    );
  }
}

async function backupDatabase(db, rootDir, { beforeWorker = null } = {}) {
  const backupDir = runtimePaths.pathsFor(rootDir).backupsDir;
  const outputName = `state-${timestamp()}-${crypto.randomUUID()}.db`;
  const backupPath = path.join(backupDir, outputName);
  try {
    runtimePaths.validateProjectLayout(rootDir, {
      env: {},
      validateRuntimeTree: true,
    });
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    runtimePaths.assertManagedBackupDestination(rootDir, backupPath);
    const backupDirectory = fs.lstatSync(backupDir, { bigint: true });
    if (backupDirectory.isSymbolicLink() || !backupDirectory.isDirectory()) {
      throw new DoctorError('BACKUP_FAILED', `backup root is unsafe: ${backupDir}`);
    }
    const directoryIdentity = statIdentity(backupDirectory);
    const { sourcePath, sourceIdentity } = canonicalStateDb(db);
    if (beforeWorker) {
      beforeWorker({
        backupDir,
        backupPath,
        directoryIdentity,
        sourcePath,
        sourceIdentity,
      });
    }
    const result = childProcess.spawnSync(
      process.execPath,
      [backupWorkerPath()],
      {
        cwd: backupDir,
        input: JSON.stringify({
          directory_identity: directoryIdentity,
          source_path: sourcePath,
          source_identity: sourceIdentity,
          output_name: outputName,
        }),
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: BACKUP_WORKER_TIMEOUT_MS,
        windowsHide: true,
      },
    );
    const published = decodeBackupWorker(result, {
      outputName,
      directoryIdentity,
      sourceIdentity,
    });
    verifyPublishedBackup(backupDir, backupPath, {
      directoryIdentity,
      backupIdentity: published.backup_identity,
      digest: published.digest,
      size: published.size,
    });
    return backupPath;
  } catch (error) {
    if (error instanceof DoctorError) throw error;
    throw new DoctorError(
      'BACKUP_FAILED',
      `state.db backup failed: ${error.message}`,
      { cause: error },
    );
  }
}

async function runDoctor(db, {
  rootDir = process.cwd(), repair = false, project = projector.projectAll,
  projectionStaleAfterMs = 5 * 60 * 1000,
  _beforeBackupWorker = null,
} = {}) {
  if (!repair) return { ...inspectSystem(db, { rootDir }), repair_performed: false };
  const backupPath = await backupDatabase(db, rootDir, {
    beforeWorker: _beforeBackupWorker,
  });
  const recovered = recovery.recoverOnBoot(db, { repoRoot: rootDir });
  if (recovered.close_pending.length > 0) {
    const deferred = {
      status: 'deferred',
      code: 'SESSION_CLOSE_PENDING',
      pending: recovered.close_pending,
    };
    return {
      ...inspectSystem(db, { rootDir }),
      repair_performed: true,
      backup_path: backupPath,
      repair: {
        close_intents: recovered,
        recovered,
        plan_publications: deferred,
        archives: deferred,
        workflows: deferred,
      },
    };
  }
  const planPublications = planStore.recoverPlanPublications(db, { rootDir });
  if (planPublications.pending > 0 || planPublications.issues.length > 0) {
    const blocked = planPublications.issues.length > 0;
    const planGate = {
      ...planPublications,
      status: blocked ? 'blocked' : 'deferred',
      code: 'PLAN_RECOVERY_REQUIRED',
    };
    const deferred = {
      status: 'deferred',
      code: 'PLAN_RECOVERY_REQUIRED',
      blocked_by: 'plan_publications',
    };
    return {
      ...inspectSystem(db, { rootDir }),
      status: 'degraded',
      repair_performed: true,
      backup_path: backupPath,
      repair: {
        close_intents: recovered,
        recovered,
        plan_publications: planGate,
        archives: deferred,
        workflows: deferred,
        spec_events: deferred,
        interrupted: deferred,
        requeued: deferred,
        ensured: deferred,
        projections: deferred,
      },
    };
  }
  const archives = changes.recoverInterruptedArchives(db, { rootDir });
  const unresolvedArchives = archiveJournal.listArchiveIntents(rootDir);
  if (archives.failed > 0 || unresolvedArchives.length > 0) {
    const archiveGate = {
      ...archives,
      pending: unresolvedArchives.length,
      status: 'blocked',
      code: 'ARCHIVE_RECOVERY_REQUIRED',
    };
    const deferred = {
      status: 'deferred',
      code: 'ARCHIVE_RECOVERY_REQUIRED',
      blocked_by: 'archives',
    };
    return {
      ...inspectSystem(db, { rootDir }),
      status: 'degraded',
      repair_performed: true,
      backup_path: backupPath,
      repair: {
        close_intents: recovered,
        recovered,
        plan_publications: planPublications,
        archives: archiveGate,
        workflows: deferred,
        spec_events: deferred,
        interrupted: deferred,
        requeued: deferred,
        ensured: deferred,
        projections: deferred,
      },
    };
  }
  const workflowRecovery = workflows.recoverUntrackedChangeWorkflows(db, { rootDir });
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
      close_intents: recovered,
      plan_publications: planPublications,
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
