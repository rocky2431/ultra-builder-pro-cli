'use strict';

// MCP server (stdio JSON-RPC) exposing task.* + session.* tools backed by
// .ultra/.runtime/state.db. Uses the low-level Server API from
// @modelcontextprotocol/server so we can pass raw JSON Schema (Draft 2020-12)
// straight from spec/mcp-tools.yaml without translating to zod.

const fs = require('node:fs');
const path = require('node:path');

const yaml = require('js-yaml');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const { Server } = require('@modelcontextprotocol/server');
const { StdioServerTransport } = require('@modelcontextprotocol/server/stdio');
const { version: PACKAGE_VERSION } = require('../package.json');

const {
  initStateDb, closeStateDb, openStateDb, ensureSchemaVersion,
} = require('./lib/state-db.cjs');
const { assertStateAuthority } = require('./lib/state-authority.cjs');
const ops = require('./lib/state-ops.cjs');
const projector = require('./lib/projector.cjs');
const telemetry = require('./lib/telemetry.cjs');
const topo = require('./lib/topo.cjs');
const parser = require('./lib/prd-parser.cjs');
const expander = require('./lib/task-expander.cjs');
const planStore = require('./lib/plan-store.cjs');
const { initProject } = require('./lib/init-project.cjs');
const baselines = require('./lib/baseline-workflow.cjs');
const changes = require('./lib/change-workflow.cjs');
const contextSpine = require('./lib/context-spine.cjs');
const runtimeState = require('./lib/runtime-state.cjs');
const runtimePaths = require('./lib/runtime-paths.cjs');
const gitBootstrap = require('./lib/git-bootstrap.cjs');
const workflows = require('./lib/workflow-state.cjs');
const decisions = require('./lib/decision-dialogue.cjs');
const doctor = require('./lib/doctor.cjs');
const artifactRegistry = require('./lib/artifact-registry.cjs');
const {
  readProjectBreadcrumb,
  renderProjectBreadcrumb,
} = require('./lib/project-breadcrumb.cjs');
const sessionRunner = require('../orchestrator/session-runner.cjs');

const REPO_ROOT = process.env.UBP_RUNTIME_ROOT
  ? path.resolve(process.env.UBP_RUNTIME_ROOT)
  : path.resolve(__dirname, '..');
const TOOLS_FILE = path.join(REPO_ROOT, 'spec', 'mcp-tools.yaml');

const TASK_TOOLS = Object.freeze([
  'task.create',
  'task.update',
  'task.list',
  'task.get',
  'task.delete',
  'task.init_project',
  'task.append_event',
  'task.subscribe_events',
  'task.switch_tag',
  'task.dependency_topo',
  'task.parse_prd',
  'task.expand',
]);

const SESSION_TOOLS = Object.freeze([
  'session.spawn',
  'session.close',
  'session.get',
  'session.list',
  'session.admission_check',
  'session.heartbeat',
  'session.subscribe_events',
]);

const PLAN_TOOLS = Object.freeze([
  'plan.export',
  'plan.get',
]);

const BASELINE_TOOLS = Object.freeze([
  'baseline.start',
  'baseline.record',
  'baseline.get',
  'baseline.converge',
]);

const CHANGE_TOOLS = Object.freeze([
  'change.create',
  'change.update',
  'change.delta',
  'change.documentation_reconcile',
  'change.get',
  'change.list',
  'change.context',
  'change.breadcrumb',
  'change.learning_propose',
  'change.learning_resolve',
  'change.converge',
  'change.archive',
]);

const WORKFLOW_TOOLS = Object.freeze([
  'workflow.start',
  'workflow.get',
  'workflow.list',
  'workflow.step',
  'workflow.revise',
  'workflow.supersede',
  'workflow.complete',
]);

const DECISION_TOOLS = Object.freeze([
  'decision.thread_start',
  'decision.get',
  'decision.list',
  'decision.open',
  'decision.resolve',
  'decision.delegate',
  'decision.defer',
  'decision.supersede',
  'decision.complete',
  'decision.checkpoint',
]);

const SYSTEM_TOOLS = Object.freeze([
  'system.doctor',
]);

const ARTIFACT_TOOLS = Object.freeze([
  'artifact.record',
  'artifact.get',
]);

const REGISTERED_TOOLS = Object.freeze([
  ...TASK_TOOLS, ...SESSION_TOOLS, ...PLAN_TOOLS, ...BASELINE_TOOLS, ...CHANGE_TOOLS,
  ...DECISION_TOOLS,
  ...WORKFLOW_TOOLS,
  ...ARTIFACT_TOOLS,
  ...SYSTEM_TOOLS,
]);

const STATELESS_TOOLS = new Set(['task.init_project']);

// init_project owns its target project's schema, baseline seed, and first
// projection internally. Do not enqueue a second projection on the caller DB.
const MUTATING_TOOLS = new Set([
  'task.create', 'task.update', 'task.delete', 'task.append_event', 'task.switch_tag',
  'task.parse_prd', 'task.expand',
  'session.spawn', 'session.close', 'session.heartbeat',
  'plan.export',
  'baseline.start', 'baseline.record', 'baseline.converge',
  'change.create', 'change.update', 'change.delta', 'change.documentation_reconcile',
  'change.context', 'change.converge', 'change.archive',
  'change.learning_propose', 'change.learning_resolve',
  'decision.thread_start', 'decision.open', 'decision.resolve', 'decision.delegate',
  'decision.defer', 'decision.supersede', 'decision.complete', 'decision.checkpoint',
  'workflow.start', 'workflow.step', 'workflow.revise', 'workflow.supersede',
  'workflow.complete',
  'artifact.record',
]);

function loadRegisteredTools() {
  const manifest = yaml.load(fs.readFileSync(TOOLS_FILE, 'utf8'));
  return manifest.tools.filter((t) => REGISTERED_TOOLS.includes(t.name));
}

function buildAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

async function dispatchTool(name, input, db, ctx = {}) {
  switch (name) {
    case 'task.create': {
      const { randomUUID } = require('node:crypto');
      const id = input.id || `task-${randomUUID()}`;
      const changeId = ops.resolveTaskCreationChangeId(db, input);
      const authorizedInput = { ...input, change_id: changeId };
      changes.assertTaskCreationAllowed(db, authorizedInput, { rootDir: ctx.rootDir || process.cwd() });
      const task = ops.createTask(db, { ...authorizedInput, id });
      return { id: task.id, status: task.status, created_at: task.created_at };
    }
    case 'task.update': {
      const task = ops.patchTask(db, input.id, input.patch || {});
      return { ok: true, task };
    }
    case 'task.list': {
      const tasks = ops.listTasks(db, input || {});
      return { tasks, count: tasks.length };
    }
    case 'task.get': {
      const task = ops.readTask(db, input.id);
      if (!task) {
        const err = new Error(`task ${input.id} not found`);
        err.code = 'TASK_NOT_FOUND';
        throw err;
      }
      return { task };
    }
    case 'task.delete': {
      return ops.deleteTask(db, input.id, { force: !!input.force });
    }
    case 'task.init_project': {
      return initProject(input);
    }
    case 'task.append_event': {
      const r = ops.appendEvent(db, {
        type: input.type,
        task_id: input.task_id,
        change_id: input.change_id,
        session_id: input.session_id,
        runtime: input.runtime,
        payload: input.payload,
      });
      return { event_id: r.event_id, ts: r.ts };
    }
    case 'task.subscribe_events': {
      return ops.subscribeEventsSince(db, input || {});
    }
    case 'session.spawn': {
      if (ctx.sessionId) {
        const error = new Error(
          `worker session ${ctx.sessionId} already owns an isolated worktree; `
            + 'resume that session instead of recursively spawning another one',
        );
        error.code = 'NESTED_SESSION_FORBIDDEN';
        throw error;
      }
      const rootDir = ctx.rootDir || process.cwd();
      const handle = sessionRunner.spawnSession({
        db,
        repoRoot: rootDir,
        task_id: input.task_id,
        runtime: input.runtime,
        takeover: Boolean(input.takeover),
        worktree_base: input.worktree_base,
      });
      return {
        sid: handle.sid,
        worktree_path: handle.worktree_path,
        artifact_dir: handle.artifact_dir,
        lease_expires_at: handle.lease_expires_at,
        worktree_created: true,
      };
    }
    case 'session.close': {
      if (ctx.sessionId) {
        const error = new Error(
          ctx.sessionId === input.sid
            ? `worker session ${ctx.sessionId} is supervised by its parent; save evidence and exit so the parent can settle the lease`
            : `worker session ${ctx.sessionId} cannot close unrelated session ${input.sid}`,
        );
        error.code = ctx.sessionId === input.sid
          ? 'WORKER_SESSION_PARENT_OWNED'
          : 'SESSION_SCOPE_VIOLATION';
        throw error;
      }
      const closed = sessionRunner.closeSession(
        { db, repoRoot: ctx.rootDir || process.cwd(), sid: input.sid },
        { status: input.status, remove_worktree: input.remove_worktree === true },
      );
      return {
        ok: true,
        worktree_preserved: closed.worktree_preserved,
      };
    }
    case 'session.get': {
      const session = ops.readSession(db, input.sid);
      if (!session) {
        const err = new Error(`session ${input.sid} not found`);
        err.code = 'SESSION_NOT_FOUND';
        throw err;
      }
      return { session };
    }
    case 'session.admission_check': {
      return sessionRunner.admissionCheck(
        db,
        ctx.rootDir || process.cwd(),
        input.task_id,
      );
    }
    case 'session.list': {
      const sessions = ops.listActiveSessions(db, { task_id: input.task_id });
      const status = input.status || 'running';
      const filtered = status === 'running'
        ? sessions
        : db.prepare(
            "SELECT * FROM sessions WHERE status = ? AND (? IS NULL OR task_id = ?) ORDER BY started_at ASC LIMIT ?",
          ).all(status, input.task_id || null, input.task_id || null, Math.min(input.limit || 100, 500));
      const limit = Math.min(input.limit || 100, 500);
      const trimmed = filtered.slice(0, limit);
      return { sessions: trimmed, count: trimmed.length };
    }
    case 'session.heartbeat': {
      return ops.heartbeatSession(db, input.sid);
    }
    case 'session.subscribe_events': {
      return ops.subscribeEventsSince(db, {
        since_id: input.since_id,
        session_id: input.sid,
        limit: input.limit,
      });
    }
    case 'task.switch_tag': {
      return ops.switchTaskTag(db, input.id, input.tag);
    }
    case 'task.dependency_topo': {
      const hasTaskIds = Array.isArray(input && input.task_ids);
      const hasChangeId = typeof input?.change_id === 'string' && input.change_id.trim() !== '';
      if (hasTaskIds === hasChangeId) {
        const err = new Error('provide exactly one of task_ids or change_id');
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
      let rows;
      if (hasTaskIds) {
        rows = input.task_ids.map((id) => {
          const task = ops.readTask(db, id);
          if (!task) {
            const err = new Error(`task ${id} not found`);
            err.code = 'TASK_NOT_FOUND';
            throw err;
          }
          return task;
        });
      } else {
        const change = changes.readChange(db, input.change_id);
        if (!change) {
          const err = new Error(`change ${input.change_id} not found`);
          err.code = 'CHANGE_NOT_FOUND';
          throw err;
        }
        rows = ops.listTasks(db, { change_id: change.id });
      }
      const graph = rows.map((t) => ({
        id: t.id,
        deps: Array.isArray(t.deps) ? t.deps : [],
      }));
      const result = topo.computeWaves(graph);
      if (result.cycles.length > 0) {
        const err = new Error(`dependency graph has ${result.cycles.length} cycle(s)`);
        err.code = 'CYCLE_DETECTED';
        err.details = { cycles: result.cycles };
        throw err;
      }
      return { waves: result.waves };
    }
    case 'task.parse_prd': {
      const dryRun = input.dry_run === true;
      const rootDir = ctx.rootDir || process.cwd();
      if (!dryRun && !String(input.change_id || '').trim()) {
        const err = new Error('persisting a parsed task graph requires change_id');
        err.code = 'CHANGE_REQUIRED';
        throw err;
      }
      const creationAuthority = { change_id: input.change_id };
      if (!dryRun) changes.assertTaskCreationAllowed(db, creationAuthority, { rootDir });
      const parsed = parser.parsePrd(input.tasks, {
        tag: input.tag,
        changeId: input.change_id,
      });
      const shaped = parsed.tasks.map((t) => ({
        id: t.id, title: t.title, type: t.type, priority: t.priority,
        complexity: t.complexity, deps: t.deps, files_modified: t.files_modified,
        tag: t.tag, change_id: t.change_id,
      }));
      const graph = shaped.map((t) => ({ id: t.id, deps: t.deps || [] }));
      const topoResult = topo.computeWaves(graph);
      if (topoResult.cycles.length > 0) {
        const err = new Error(`parsed task graph has ${topoResult.cycles.length} cycle(s)`);
        err.code = 'CYCLE_DETECTED';
        err.details = { cycles: topoResult.cycles };
        throw err;
      }
      if (!dryRun) {
        try {
          ops.tx(db, () => {
            changes.assertTaskCreationAllowed(db, creationAuthority, { rootDir });
            for (const t of shaped) ops.createTask(db, t);
          });
        } catch (err) {
          if (['BASELINE_NOT_READY', 'CHANGE_NOT_FOUND', 'CHANGE_NOT_MUTABLE'].includes(err.code)) throw err;
          const wrap = new Error(`failed to persist parsed tasks: ${err.message}`);
          wrap.code = 'PARSE_FAILED';
          wrap.cause = err;
          throw wrap;
        }
      }
      return { tasks: shaped, topo: topoResult.waves };
    }
    case 'task.expand': {
      const parent = ops.readTask(db, input.id);
      if (!parent) {
        const err = new Error(`no task ${input.id}`);
        err.code = 'TASK_NOT_FOUND';
        throw err;
      }
      if (parent.status === 'expanded') {
        const err = new Error(`task ${input.id} is already expanded`);
        err.code = 'ALREADY_EXPANDED';
        throw err;
      }
      const rootDir = ctx.rootDir || process.cwd();
      changes.assertTaskCreationAllowed(db, { change_id: parent.change_id }, { rootDir });
      const result = expander.expandTask(db, {
        id: input.id,
        children: input.children,
        rootDir,
      });
      return { parent_id: result.parent_id, children: result.children };
    }
    case 'plan.export': {
      const rootDir = ctx.rootDir || process.cwd();
      const change = changes.readChange(db, input.change_id);
      if (!change) {
        const err = new Error(`change ${input.change_id} not found`);
        err.code = 'CHANGE_NOT_FOUND';
        throw err;
      }
      if (!['active', 'blocked'].includes(change.status)) {
        const err = new Error(`change ${change.id} is ${change.status}`);
        err.code = 'CHANGE_NOT_MUTABLE';
        throw err;
      }
      const tasks = ops.listTasks(db, { change_id: change.id });
      if (tasks.length === 0) {
        const err = new Error('no tasks to plan');
        err.code = 'NO_TASKS';
        throw err;
      }
      const context = contextSpine.validateContextSnapshot(db, {
        change_id: change.id,
        task_id: null,
        role: 'plan',
        gate: 'planning',
      }, { rootDir });
      if (!context.snapshot || context.blockers.length > 0) {
        const err = new Error('plan export requires a current planning Context Manifest');
        err.code = context.snapshot ? 'PLAN_CONTEXT_STALE' : 'PLAN_CONTEXT_REQUIRED';
        err.details = { blockers: context.blockers };
        throw err;
      }
      const plan = planStore.buildPlan(tasks, { changeId: change.id });
      const planRun = db.prepare(
        `SELECT id FROM workflow_runs
         WHERE kind = 'plan' AND change_id = ? AND task_id IS NULL
           AND status IN ('active', 'blocked', 'ready')
         ORDER BY started_at DESC, rowid DESC LIMIT 1`,
      ).get(change.id);
      const owner = { type: 'change', id: change.id };
      const contextArtifact = db.prepare(
        `SELECT id FROM artifacts
         WHERE path = ? AND status <> 'archived'
         ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
      ).get(context.snapshot.manifest_path);
      const publication = planStore.prepareChangePlanPublication(plan, {
        rootDir,
        change,
        tasks,
        context: {
          snapshot_id: context.snapshot.id,
          manifest_path: context.snapshot.manifest_path,
          manifest_digest: context.snapshot.manifest_hash,
        },
      });
      const artifactInputs = publication.artifacts.map(({ kind, path: file, digest }) => ({
        kind,
        file,
        digest,
        input: {
          owner_type: owner.type,
          owner_id: owner.id,
          kind,
          path: path.relative(rootDir, file),
          source_refs: [
            { type: 'change', id: change.id, relation: 'planned_for' },
            ...(contextArtifact
              ? [{ type: 'artifact', id: contextArtifact.id, relation: 'compiled_from' }]
              : []),
            ...tasks.map((task) => ({
              type: 'task', id: task.id, relation: 'compiled_from_task_contract',
            })),
          ],
          consumer_refs: planRun
            ? [{ type: 'workflow', id: planRun.id, relation: 'verified_by' }]
            : [],
          provenance: {
            writer: 'plan.export',
            workflow_run_id: planRun?.id || null,
            publication_transaction_id: publication.transaction_id,
          },
          metadata: {
            context_snapshot_id: context.snapshot.id,
            context_digest: context.snapshot.manifest_hash,
            terminal_role: !planRun,
          },
        },
      }));
      try {
        ops.tx(db, () => {
          const preflight = artifactInputs.map((artifact) => (
            artifactRegistry.preflightArtifactPublication(
              db, artifact.input, { rootDir },
            )
          ));
          publication.publish();
          const recorded = artifactInputs.map((artifact, index) => (
            artifactRegistry.recordArtifactInTx(db, {
              ...artifact.input,
              id: preflight[index].artifact_id || undefined,
              expected_before_digest: preflight[index].expected_before_digest,
              content_digest: artifact.digest,
            }, { rootDir })
          ));
          ops.appendEventInTx(db, {
            type: 'plan_exported',
            change_id: change.id,
            payload: {
              change_id: change.id,
              plan_path: publication.plan_path,
              plan_md_path: publication.plan_md_path,
              publication_transaction_id: publication.transaction_id,
              wave_count: plan.waves.length,
            },
          });
          return recorded;
        });
      } catch (error) {
        const rollback = publication.rollback();
        const failure = rollback?.rolled_back === false
          ? planStore.planRecoveryRequiredError(
            error,
            rollback,
            publication.transaction_id,
          )
          : error;
        if (failure.code === 'PLAN_RECOVERY_REQUIRED') {
          const issue = failure.details?.rollback_issue
            || failure.details?.issue
            || {
              code: failure.cause?.code || 'PLAN_RECOVERY_FAILED',
              message: failure.cause?.message || failure.message,
            };
          ctx.markPlanRecoveryRequired?.({
            recovered: 0,
            finalized: 0,
            pending: 1,
            issues: [issue],
          });
        }
        throw failure;
      }
      try {
        publication.commit();
      } catch (error) {
        const issue = error.details?.issue || {
          code: error.cause?.code || 'PLAN_RECOVERY_FAILED',
          message: error.cause?.message || error.message,
        };
        ctx.markPlanRecoveryRequired?.({
          recovered: 0,
          finalized: 0,
          pending: 1,
          issues: [issue],
        });
        // The registry and target bytes committed atomically before cleanup.
        // The remaining journal is still authoritative recovery work, so the
        // caller must see a typed failure and later mutations must stop.
        throw error;
      }
      return {
        plan_path: publication.plan_path,
        plan_md_path: publication.plan_md_path,
        wave_count: plan.waves.length,
      };
    }
    case 'plan.get': {
      const rootDir = ctx.rootDir || process.cwd();
      const change = changes.readChange(db, input.change_id);
      if (!change) {
        const err = new Error(`change ${input.change_id} not found`);
        err.code = 'CHANGE_NOT_FOUND';
        throw err;
      }
      const loaded = planStore.loadChangePlanArtifact(rootDir, change, {
        db,
        strict: true,
      });
      if (!loaded) {
        const err = new Error('no plan has been computed yet');
        err.code = 'NO_PLAN';
        throw err;
      }
      return { plan: planStore.selectSection(loaded, input.section) };
    }
    case 'baseline.start': {
      return {
        baseline: baselines.startBaseline(
          db, input, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'baseline.record': {
      return {
        baseline: baselines.recordBaseline(
          db, input, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'baseline.get': {
      const baseline = baselines.readBaseline(db, input.id);
      if (!baseline) {
        const err = new Error(input.id ? `baseline ${input.id} not found` : 'current baseline not found');
        err.code = 'BASELINE_NOT_FOUND';
        throw err;
      }
      return {
        baseline,
        health: baselines.inspectBaseline(db, {
          rootDir: ctx.rootDir || process.cwd(), id: input.id,
        }),
      };
    }
    case 'baseline.converge': {
      return baselines.convergeBaseline(
        db, input, { rootDir: ctx.rootDir || process.cwd() },
      );
    }
    case 'change.create': {
      const { randomUUID } = require('node:crypto');
      const id = input.id || `chg-${randomUUID().slice(0, 12)}`;
      return changes.createChange(db, { ...input, id }, { rootDir: ctx.rootDir || process.cwd() });
    }
    case 'change.update': {
      return {
        ok: true,
        change: changes.updateChange(
          db, input.id, input.patch || {}, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'change.get': {
      const change = changes.readChange(db, input.id);
      if (!change) {
        const err = new Error(`change ${input.id} not found`);
        err.code = 'CHANGE_NOT_FOUND';
        throw err;
      }
      return {
        change: {
          ...change,
          learning_candidates: changes.listSpecLearning(db, change.id),
        },
      };
    }
    case 'change.list': {
      const rows = changes.listChanges(db, input || {});
      return { changes: rows, count: rows.length };
    }
    case 'change.context': {
      const out = changes.compileContext(db, input, { rootDir: ctx.rootDir || process.cwd() });
      return {
        manifest_path: out.context_manifest_path,
        manifest_hash: out.manifest_hash,
        manifest: out.manifest,
      };
    }
    case 'change.breadcrumb': {
      return {
        breadcrumb: changes.readBreadcrumb(
          db, input || {}, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'change.learning_propose': {
      return {
        candidate: changes.proposeSpecLearning(
          db, input, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'change.learning_resolve': {
      return {
        candidate: changes.resolveSpecLearning(
          db, input, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'change.converge': {
      return changes.convergeChange(db, input, { rootDir: ctx.rootDir || process.cwd() });
    }
    case 'change.archive': {
      return changes.archiveChange(db, input, { rootDir: ctx.rootDir || process.cwd() });
    }
    case 'change.delta': {
      return changes.recordDelta(db, input, { rootDir: ctx.rootDir || process.cwd() });
    }
    case 'change.documentation_reconcile': {
      return changes.recordDocumentationReconciliation(
        db, input, { rootDir: ctx.rootDir || process.cwd() },
      );
    }
    case 'decision.thread_start': {
      return { thread: decisions.startDecisionThread(db, input) };
    }
    case 'decision.get': {
      const thread = decisions.readDecisionThread(db, input.id);
      if (!thread) {
        const error = new Error(`decision thread ${input.id} not found`);
        error.code = 'DECISION_THREAD_NOT_FOUND';
        throw error;
      }
      return { thread };
    }
    case 'decision.list': {
      const threads = decisions.listDecisionThreads(db, input || {});
      return { threads, count: threads.length };
    }
    case 'decision.open': {
      return { thread: decisions.openDecision(db, input) };
    }
    case 'decision.resolve': {
      return { thread: decisions.resolveDecision(db, input) };
    }
    case 'decision.delegate': {
      return { thread: decisions.delegateDecision(db, input) };
    }
    case 'decision.defer': {
      return { thread: decisions.deferDecision(db, input) };
    }
    case 'decision.supersede': {
      return { thread: decisions.supersedeDecision(db, input) };
    }
    case 'decision.complete': {
      return {
        thread: decisions.completeDecisionThread(
          db, input, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'decision.checkpoint': {
      return {
        thread: decisions.checkpointDecisionThread(
          db, input, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'workflow.start': {
      return {
        workflow: workflows.startWorkflow(
          db, input, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'workflow.get': {
      const workflow = workflows.readWorkflow(
        db, input.id, { rootDir: ctx.rootDir || process.cwd() },
      );
      if (!workflow) {
        const error = new Error(`workflow ${input.id} not found`);
        error.code = 'WORKFLOW_NOT_FOUND';
        throw error;
      }
      return { workflow };
    }
    case 'workflow.list': {
      const rows = workflows.listWorkflows(
        db, input || {}, { rootDir: ctx.rootDir || process.cwd() },
      );
      return { workflows: rows, count: rows.length };
    }
    case 'workflow.step': {
      return {
        workflow: workflows.recordWorkflowStep(
          db, input, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'workflow.revise': {
      return {
        workflow: workflows.reviseWorkflow(
          db, input, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'workflow.supersede': {
      return workflows.supersedeWorkflow(
        db, input, { rootDir: ctx.rootDir || process.cwd() },
      );
    }
    case 'workflow.complete': {
      return {
        workflow: workflows.completeWorkflow(
          db, input, { rootDir: ctx.rootDir || process.cwd() },
        ),
      };
    }
    case 'artifact.record': {
      return artifactRegistry.recordArtifact(
        db, input, { rootDir: ctx.rootDir || process.cwd() },
      );
    }
    case 'artifact.get': {
      return { artifact: artifactRegistry.getArtifact(db, input) };
    }
    case 'system.doctor': {
      return doctor.runDoctor(db, {
        rootDir: ctx.rootDir || process.cwd(),
        repair: input.repair === true,
        project: ctx.projector || projector.projectAll,
      });
    }
    default:
      throw new Error(`unhandled tool ${name}`);
  }
}

function errorResponse(code, message, retriable = false, details = undefined) {
  const error = { code, message, retriable };
  if (details !== undefined) error.details = details;
  return {
    isError: true,
    content: [{
      type: 'text',
      text: JSON.stringify({ ok: false, error }),
    }],
  };
}

function startServer({
  dbPath,
  rootDir,
  sessionId = null,
  projectOnWrite = true,
  project = projector.projectAll,
}) {
  let db = null;
  let planRecovery = null;
  let authorityDbPath = path.resolve(dbPath);
  const markPlanRecoveryRequired = (details) => {
    planRecovery = {
      recovered: Number(details?.recovered || 0),
      finalized: Number(details?.finalized || 0),
      pending: Math.max(1, Number(details?.pending || 0)),
      issues: Array.isArray(details?.issues) ? details.issues : [],
    };
  };
  const getDb = (toolName = null) => {
    if (!db) {
      const projectPaths = runtimePaths.pathsFor(rootDir);
      if ([projectPaths.legacyStateDbPath, projectPaths.stateDbPath].includes(authorityDbPath)) {
        // The packaged launcher has no explicit DB override. Its default path
        // is the future canonical runtime location, which can legitimately be
        // absent while a legacy project still owns its project-level DB. Admit and
        // migrate that project before applying configured-authority binding.
        authorityDbPath = runtimePaths.ensureRuntimeState(rootDir, {
          admitStorageBoundary: () => gitBootstrap.ensureExistingProjectStorageBoundary(rootDir),
        }).stateDbPath;
      } else {
        // Only a real external/task-linked override reaches binding
        // validation. It may never invent or borrow project authority.
        runtimePaths.locateStateDb(rootDir, {
          env: { UBP_DB_PATH: authorityDbPath },
        });
        runtimePaths.ensureRuntimeState(rootDir, {
          env: { UBP_DB_PATH: authorityDbPath },
          allowConfiguredRuntimeLink: true,
          migrateState: false,
          admitStorageBoundary: () => gitBootstrap.ensureExistingProjectStorageBoundary(rootDir),
        });
      }
      db = initStateDb(authorityDbPath).db;
      planRecovery = planStore.recoverPlanPublications(db, { rootDir });
    }
    if (toolName !== 'system.doctor'
      && (planRecovery?.pending > 0 || planRecovery?.issues?.length > 0)) {
      planRecovery = planStore.recoverPlanPublications(db, { rootDir });
      if (planRecovery.pending > 0 || planRecovery.issues.length > 0) {
        const error = new Error(
          'plan publication recovery is incomplete; run system.doctor with repair=true',
        );
        error.code = 'PLAN_RECOVERY_REQUIRED';
        error.details = planRecovery;
        throw error;
      }
    }
    return db;
  };

  const tools = loadRegisteredTools();
  const ajv = buildAjv();
  const inputValidators = new Map();
  const outputValidators = new Map();
  for (const t of tools) {
    inputValidators.set(t.name, ajv.compile(t.input_schema));
    outputValidators.set(t.name, ajv.compile(t.output_schema));
  }

  const server = new Server(
    { name: 'ultra-builder-pro-mcp', version: PACKAGE_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler('tools/list', async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema,
    })),
  }));

  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args = {} } = request.params;
    const toolStart = Date.now();
    let toolError = null;

    const emitTelemetry = () => {
      if (!db) return;
      try {
        telemetry.appendTelemetry(db, {
          event_type: 'tool_call',
          tool_name: name,
          session_id: (args && args.sid) || null,
          rootDir,
          payload: {
            duration_ms: Date.now() - toolStart,
            task_id: (args && (args.task_id || args.id)) || null,
            error: toolError,
          },
        });
      } catch (err) {
        process.stderr.write(`telemetry warning: ${err.message}\n`);
      }
    };

    if (!REGISTERED_TOOLS.includes(name)) {
      toolError = 'UNKNOWN_TOOL';
      emitTelemetry();
      return errorResponse('UNKNOWN_TOOL', `tool ${name} is not registered on this server`);
    }
    const validateInput = inputValidators.get(name);
    if (!validateInput(args)) {
      toolError = 'VALIDATION_ERROR';
      emitTelemetry();
      return errorResponse('VALIDATION_ERROR', ajv.errorsText(validateInput.errors));
    }

    let result;
    let toolDb = null;
    try {
      toolDb = STATELESS_TOOLS.has(name) ? null : getDb(name);
      if (toolDb) assertStateAuthority(toolDb, rootDir);
      result = await dispatchTool(
        name,
        args,
        toolDb,
        {
          rootDir,
          sessionId,
          projector: project,
          markPlanRecoveryRequired,
        },
      );
      if (name === 'system.doctor' && args.repair === true) {
        planRecovery = result.repair?.plan_publications || null;
      }
    } catch (err) {
      const code = err.code || (err instanceof ops.StateOpsError ? err.code : 'STATE_DB_ERROR');
      toolError = code;
      emitTelemetry();
      return errorResponse(code, err.message, !!err.retriable, err.details);
    }

    let runtimeMeta = null;
    if (toolDb && projectOnWrite && MUTATING_TOOLS.has(name)) {
      const job = runtimeState.enqueueProjection(toolDb, { tool_name: name });
      const processed = runtimeState.processProjectionJobs(toolDb, { rootDir, project, limit: 500 });
      const own = processed.jobs.find((item) => item.id === job.id);
      runtimeMeta = {
        state_commit: 'committed',
        projection_status: own ? own.status : 'failed',
        projection_job_id: job.id,
      };
      if (own && own.incident_id) runtimeMeta.incident_id = own.incident_id;
    } else if (toolDb && name === 'system.doctor' && args.repair === true) {
      runtimeMeta = {
        state_commit: 'committed',
        projection_status: result.checks.projections.status === 'pass' ? 'completed' : 'failed',
        backup_path: result.backup_path,
      };
    }

    const validateOutput = outputValidators.get(name);
    if (!validateOutput(result)) {
      toolError = 'OUTPUT_SCHEMA_DRIFT';
      emitTelemetry();
      const response = errorResponse(
        'OUTPUT_SCHEMA_DRIFT',
        ajv.errorsText(validateOutput.errors),
        false,
        runtimeMeta ? { _ultra: runtimeMeta } : undefined,
      );
      if (runtimeMeta) response._meta = { ultra: runtimeMeta };
      return response;
    }

    emitTelemetry();
    const visible = runtimeMeta ? { ...result, _ultra: runtimeMeta } : result;
    return {
      content: [{ type: 'text', text: JSON.stringify(visible) }],
      structuredContent: result,
      ...(runtimeMeta ? { _meta: { ultra: runtimeMeta } } : {}),
    };
  });

  return {
    server,
    get db() { return db; },
    tools,
    async close() { closeStateDb(db); },
  };
}

async function main() {
  const rootDir = process.env.UBP_ROOT_DIR
    ? path.resolve(process.env.UBP_ROOT_DIR)
    : path.resolve('.');
  // Keep tools/list side-effect free. Root/layout validation happens inside the
  // first state-backed tool call so clients receive a typed MCP error instead
  // of a transport-level startup failure.
  const configuredDb = typeof process.env.UBP_DB_PATH === 'string'
    ? process.env.UBP_DB_PATH.trim()
    : '';
  const dbPath = configuredDb
    ? path.resolve(configuredDb)
    : runtimePaths.pathsFor(rootDir).stateDbPath;
  const sessionId = process.env.UBP_SESSION_ID || null;
  const handle = startServer({ dbPath, rootDir, sessionId });
  const transport = new StdioServerTransport();
  await handle.server.connect(transport);
  const cleanup = () => handle.close().finally(() => process.exit(0));
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

function hookMetadata(value, fallback = 'unknown', maxLength = 256) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return (normalized || fallback).slice(0, maxLength);
}

function appendHookLifecycleEvent({ rootDir, action, hookInput = {} } = {}) {
  if (!['start', 'stop'].includes(action)) {
    const error = new Error('hook lifecycle action must be start or stop');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const root = path.resolve(rootDir || process.cwd());
  const dbPath = runtimePaths.locateStateDb(root);
  if (!fs.existsSync(dbPath)) return { recorded: false, reason: 'STATE_DB_MISSING' };

  const db = openStateDb(dbPath);
  try {
    ensureSchemaVersion(db);
    const workflow = db.prepare(
      `SELECT change_id, task_id FROM workflow_runs
       WHERE status IN ('active', 'blocked', 'ready') AND change_id IS NOT NULL
       ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
    ).get();
    if (!workflow) return { recorded: false, reason: 'NO_ACTIVE_WORKFLOW' };
    const change = db.prepare(
      `SELECT id FROM changes
       WHERE id = ? AND status IN ('active', 'blocked', 'ready')`,
    ).get(workflow.change_id);
    if (!change) return { recorded: false, reason: 'NO_ACTIVE_CHANGE' };
    const task = workflow.task_id
      ? db.prepare(
        `SELECT id FROM tasks
         WHERE id = ? AND change_id = ?
           AND status IN ('in_progress', 'pending', 'blocked')`,
      ).get(workflow.task_id, change.id)
      : db.prepare(
        `SELECT id FROM tasks WHERE change_id = ? AND status IN ('in_progress', 'pending', 'blocked')
         ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'blocked' THEN 1 ELSE 2 END,
                  updated_at DESC, rowid DESC LIMIT 1`,
      ).get(change.id);
    const payload = {
      agent_id: hookMetadata(hookInput.agent_id),
      agent_type: hookMetadata(hookInput.agent_type),
      host_session_id: hookMetadata(hookInput.session_id, '', 256),
    };
    ops.appendEvent(db, {
      type: action === 'start' ? 'subagent_started' : 'subagent_stopped',
      change_id: change.id,
      task_id: task?.id || null,
      payload,
    });
    return { recorded: true, change_id: change.id, task_id: task?.id || null };
  } finally {
    closeStateDb(db);
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`mcp-server fatal: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  main,
  startServer,
  dispatchTool,
  TASK_TOOLS,
  SESSION_TOOLS,
  PLAN_TOOLS,
  BASELINE_TOOLS,
  CHANGE_TOOLS,
  WORKFLOW_TOOLS,
  ARTIFACT_TOOLS,
  SYSTEM_TOOLS,
  REGISTERED_TOOLS,
  STATELESS_TOOLS,
  MUTATING_TOOLS,
  appendHookLifecycleEvent,
  findProjectRoot: runtimePaths.findProjectRoot,
  readProjectBreadcrumb,
  renderProjectBreadcrumb,
};
