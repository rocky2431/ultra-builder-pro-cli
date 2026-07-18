'use strict';

// MCP server (stdio JSON-RPC) exposing task.* + session.* tools backed by
// .ultra/state.db. Uses the low-level Server API from
// @modelcontextprotocol/sdk so we can pass raw JSON Schema (Draft 2020-12)
// straight from spec/mcp-tools.yaml without translating to zod.

const fs = require('node:fs');
const path = require('node:path');

const yaml = require('js-yaml');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { version: PACKAGE_VERSION } = require('../package.json');

const { initStateDb, closeStateDb } = require('./lib/state-db.cjs');
const { assertStateAuthority } = require('./lib/state-authority.cjs');
const ops = require('./lib/state-ops.cjs');
const projector = require('./lib/projector.cjs');
const telemetry = require('./lib/telemetry.cjs');
const topo = require('./lib/topo.cjs');
const llm = require('./lib/llm-client.cjs');
const parser = require('./lib/prd-parser.cjs');
const expander = require('./lib/task-expander.cjs');
const planStore = require('./lib/plan-store.cjs');
const { initProject } = require('./lib/init-project.cjs');
const baselines = require('./lib/baseline-workflow.cjs');
const changes = require('./lib/change-workflow.cjs');
const runtimeState = require('./lib/runtime-state.cjs');
const doctor = require('./lib/doctor.cjs');

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
  'change.get',
  'change.list',
  'change.context',
  'change.breadcrumb',
  'change.learning_propose',
  'change.learning_resolve',
  'change.converge',
  'change.archive',
]);

const SYSTEM_TOOLS = Object.freeze([
  'system.doctor',
]);

const REGISTERED_TOOLS = Object.freeze([
  ...TASK_TOOLS, ...SESSION_TOOLS, ...PLAN_TOOLS, ...BASELINE_TOOLS, ...CHANGE_TOOLS,
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
  'change.create', 'change.update', 'change.context', 'change.converge', 'change.archive',
  'change.learning_propose', 'change.learning_resolve',
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

function mintSessionId() {
  const { randomUUID } = require('node:crypto');
  return `sess-${randomUUID().slice(0, 8)}`;
}

function resolvePrdText(input, ctx) {
  if (input.prd_text && String(input.prd_text).trim()) return String(input.prd_text);
  if (input.prd_path) {
    const abs = path.isAbsolute(input.prd_path)
      ? input.prd_path
      : path.join(ctx.rootDir || process.cwd(), input.prd_path);
    return fs.readFileSync(abs, 'utf8');
  }
  return null;
}

function buildLlmClient(ctx) {
  if (ctx && ctx.llmClient) return ctx.llmClient;
  return llm.createLlmClient({});
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
      // admission + takeover logic; actual git worktree + child process is
      // delegated to orchestrator/session-runner (Phase 4.5.1). This tool
      // records intent in state.db and returns the paths the runner should use.
      const rootDir = ctx.rootDir || process.cwd();
      const verdict = ops.admissionCheck(db, input.task_id);
      if (!verdict.can_spawn && !input.takeover) {
        const err = new Error(`active session exists for task ${input.task_id}; pass takeover=true or choose resume/abandon`);
        err.code = 'ADMISSION_DENIED';
        throw err;
      }
      if (!verdict.can_spawn && input.takeover && verdict.conflict) {
        ops.updateSession(db, verdict.conflict.sid, { status: 'crashed' });
      }
      const sid = mintSessionId();
      const worktreeBase = input.worktree_base || path.join(rootDir, '.ultra', 'worktrees');
      const worktree_path = path.join(worktreeBase, sid);
      const artifact_dir = path.join(rootDir, '.ultra', 'sessions', sid);
      const session = ops.createSession(db, {
        sid,
        task_id: input.task_id,
        runtime: input.runtime,
        worktree_path,
        artifact_dir,
      });
      return {
        sid,
        worktree_path,
        artifact_dir,
        lease_expires_at: session.lease_expires_at,
      };
    }
    case 'session.close': {
      ops.updateSession(db, input.sid, { status: input.status });
      return { ok: true };
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
      return ops.admissionCheck(db, input.task_id);
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
      const requested = Array.isArray(input && input.task_ids) ? input.task_ids : null;
      const rows = requested
        ? requested.map((id) => ops.readTask(db, id)).filter(Boolean)
        : ops.listTasks(db, {});
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
      const prdText = resolvePrdText(input, ctx);
      if (!prdText || !prdText.trim()) {
        const err = new Error('one of prd_path or prd_text required');
        err.code = 'NO_INPUT';
        throw err;
      }
      const dryRun = input.dry_run === true;
      const rootDir = ctx.rootDir || process.cwd();
      const creationAuthority = { change_id: input.change_id };
      if (!dryRun) changes.assertTaskCreationAllowed(db, creationAuthority, { rootDir });
      const client = buildLlmClient(ctx);
      const parsed = await parser.parsePrd(prdText, { llmClient: client, tag: input.tag });
      const shaped = parsed.tasks.map((t) => ({
        id: t.id, title: t.title, type: t.type, priority: t.priority,
        complexity: t.complexity, deps: t.deps, files_modified: t.files_modified,
        tag: t.tag, change_id: input.change_id,
      }));
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
      const graph = shaped.map((t) => ({ id: t.id, deps: t.deps || [] }));
      const topoResult = topo.computeWaves(graph);
      return { tasks: shaped, topo: topoResult.waves };
    }
    case 'task.expand': {
      // Cheap guards before paying for LLM client construction (which would
      // throw NO_LLM_CREDENTIALS when env keys are missing).
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
      const client = buildLlmClient(ctx);
      const result = await expander.expandTask(db, {
        id: input.id,
        sub_count: input.sub_count,
        strategy: input.strategy,
        llmClient: client,
        rootDir,
      });
      return { parent_id: result.parent_id, children: result.children };
    }
    case 'plan.export': {
      const rootDir = ctx.rootDir || process.cwd();
      const abs = path.isAbsolute(input.out_path)
        ? input.out_path
        : path.join(rootDir, input.out_path);
      const tasks = ops.listTasks(db, { tag: input.tag });
      if (tasks.length === 0) {
        const err = new Error('no tasks to plan');
        err.code = 'NO_TASKS';
        throw err;
      }
      const plan = planStore.buildPlan(tasks, {});
      const { plan_path } = planStore.savePlanArtifact(plan, abs, input.format || 'json');
      ops.appendEvent(db, {
        type: 'plan_approved',
        payload: { plan_path, wave_count: plan.waves.length, tag: input.tag || null },
      });
      return { plan_path, wave_count: plan.waves.length };
    }
    case 'plan.get': {
      const rootDir = ctx.rootDir || process.cwd();
      const loaded = planStore.loadPlanArtifact(rootDir);
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

function startServer({ dbPath, rootDir, projectOnWrite = true, project = projector.projectAll }) {
  let db = null;
  const getDb = () => {
    if (!db) db = initStateDb(dbPath).db;
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

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
      toolDb = STATELESS_TOOLS.has(name) ? null : getDb();
      if (toolDb) assertStateAuthority(toolDb, rootDir);
      result = await dispatchTool(name, args, toolDb, { rootDir, projector: project });
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
  const dbPath = process.env.UBP_DB_PATH
    ? path.resolve(process.env.UBP_DB_PATH)
    : path.resolve('.ultra', 'state.db');
  const rootDir = process.env.UBP_ROOT_DIR
    ? path.resolve(process.env.UBP_ROOT_DIR)
    : path.resolve('.');
  const handle = startServer({ dbPath, rootDir });
  const transport = new StdioServerTransport();
  await handle.server.connect(transport);
  const cleanup = () => handle.close().finally(() => process.exit(0));
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
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
  SYSTEM_TOOLS,
  REGISTERED_TOOLS,
  STATELESS_TOOLS,
  MUTATING_TOOLS,
};
