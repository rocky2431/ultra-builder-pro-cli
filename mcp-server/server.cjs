'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const yaml = require('js-yaml');
const { Server } = require('@modelcontextprotocol/server');
const { StdioServerTransport } = require('@modelcontextprotocol/server/stdio');

const { version: PACKAGE_VERSION } = require('../package.json');
const {
  closeStateDb,
  ensureSchemaVersion,
  initStateDb,
  openStateDb,
} = require('./lib/state-db.cjs');
const { assertStateAuthority } = require('./lib/state-authority.cjs');
const gitBootstrap = require('./lib/git-bootstrap.cjs');
const ops = require('./lib/state-ops.cjs');
const planStore = require('./lib/plan-store.cjs');
const projector = require('./lib/projector.cjs');
const {
  readProjectContextEnvelope,
  renderProjectContextEnvelope,
} = require('./lib/project-context.cjs');
const runtimePaths = require('./lib/runtime-paths.cjs');
const runtimeState = require('./lib/runtime-state.cjs');
const taskLedger = require('./lib/task-ledger.cjs');
const telemetry = require('./lib/telemetry.cjs');
const ultraFacade = require('./lib/ultra-facade.cjs');

const REPO_ROOT = process.env.UBP_RUNTIME_ROOT
  ? path.resolve(process.env.UBP_RUNTIME_ROOT)
  : path.resolve(__dirname, '..');
const TOOLS_FILE = path.join(REPO_ROOT, 'spec', 'mcp-tools.yaml');
const PUBLIC_TOOLS = ultraFacade.PUBLIC_TOOLS;
const REGISTERED_TOOLS = PUBLIC_TOOLS;

function loadToolContracts() {
  const manifest = yaml.load(fs.readFileSync(TOOLS_FILE, 'utf8'));
  const names = manifest.tools.map((tool) => tool.name).sort();
  const expected = [...PUBLIC_TOOLS].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    const error = new Error('published MCP manifest does not match the seven-tool kernel');
    error.code = 'PUBLIC_CONTRACT_DRIFT';
    throw error;
  }
  return manifest.tools;
}

function buildAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
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

function publicToolError(error) {
  const code = String(error?.code || 'STATE_DB_ERROR');
  if (code.startsWith('SQLITE_')) {
    return {
      code: 'STATE_DB_ERROR',
      message: 'Ultra state persistence failed',
      retriable: code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED',
      details: undefined,
    };
  }
  return {
    code,
    message: error?.message || 'Ultra state operation failed',
    retriable: Boolean(error?.retriable),
    details: error?.details,
  };
}

function isInitializeCall(name, input = {}) {
  return name === 'ultra.record'
    && Array.isArray(input.entries)
    && input.entries.length === 1
    && input.entries[0]?.kind === 'baseline'
    && input.entries[0]?.action === 'initialize';
}

function isMutation(name, input = {}) {
  if (name === 'ultra.record' || name === 'ultra.checkpoint' || name === 'ultra.archive') {
    return true;
  }
  if (name === 'ultra.sync') return input.action !== 'inspect';
  if (name === 'ultra.session') {
    return ['acquire', 'heartbeat', 'release'].includes(input.action);
  }
  return name === 'ultra.doctor' && input.repair === true;
}

function requiresTeamSync(name, input = {}) {
  return name === 'ultra.record'
    || name === 'ultra.checkpoint'
    || name === 'ultra.archive'
    || (name === 'ultra.session' && input.action === 'acquire');
}

function ownsTeamAuthorityInspection(name) {
  return ['ultra.context', 'ultra.sync', 'ultra.doctor'].includes(name);
}

function startServer({
  dbPath,
  rootDir,
  sessionId = null,
  projectOnWrite = true,
  project = projector.projectAll,
  runtime = process.env.UBP_RUNTIME || 'unknown',
}) {
  let db = null;
  let authorityDbPath = path.resolve(dbPath);
  let planRecovery = null;

  const markPlanRecoveryRequired = (details) => {
    planRecovery = {
      recovered: Number(details?.recovered || 0),
      finalized: Number(details?.finalized || 0),
      pending: Math.max(1, Number(details?.pending || 0)),
      issues: Array.isArray(details?.issues) ? details.issues : [],
    };
  };

  const getDb = (toolName, input = {}) => {
    if (!db) {
      const projectPaths = runtimePaths.pathsFor(rootDir);
      const usesProjectAuthority = [
        projectPaths.legacyStateDbPath,
        projectPaths.stateDbPath,
      ].includes(authorityDbPath);
      const projectExists = fs.existsSync(path.join(rootDir, '.ultra'));

      if (!projectExists) {
        const error = new Error(
          'Ultra authority is not initialized; invoke ultra-init before using project tools',
        );
        error.code = 'STATE_DB_MISSING';
        throw error;
      }

      if (usesProjectAuthority) {
        authorityDbPath = runtimePaths.ensureRuntimeState(rootDir, {
          admitStorageBoundary: () => (
            gitBootstrap.ensureExistingProjectStorageBoundary(rootDir)
          ),
        }).stateDbPath;
      } else {
        runtimePaths.locateStateDb(rootDir, {
          env: { UBP_DB_PATH: authorityDbPath },
        });
        runtimePaths.ensureRuntimeState(rootDir, {
          env: { UBP_DB_PATH: authorityDbPath },
          allowConfiguredRuntimeLink: true,
          migrateState: false,
          admitStorageBoundary: () => (
            gitBootstrap.ensureExistingProjectStorageBoundary(rootDir)
          ),
        });
      }

      if (['ultra.context', 'ultra.doctor'].includes(toolName)
          && !fs.existsSync(authorityDbPath)) {
        const error = new Error('Ultra runtime state is missing');
        error.code = 'STATE_DB_MISSING';
        throw error;
      }

      db = fs.existsSync(authorityDbPath)
        ? openStateDb(authorityDbPath)
        : initStateDb(authorityDbPath).db;
      ensureSchemaVersion(db);

      if (!ownsTeamAuthorityInspection(toolName)) {
        const teamSync = assertStateAuthority(db, rootDir, {
          importTeamLedger: toolName !== 'ultra.context',
        });
        if (teamSync?.status === 'imported') {
          const job = runtimeState.enqueueProjection(db, { tool_name: 'ultra.sync' });
          runtimeState.processProjectionJobs(db, {
            rootDir,
            project,
            limit: 500,
          });
          if (!job?.id) {
            const error = new Error('team authority import projection was not scheduled');
            error.code = 'STATE_CORRUPT';
            throw error;
          }
        }
      }
      planRecovery = planStore.recoverPlanPublications(db, { rootDir });
    }

    if (!['ultra.context', 'ultra.doctor'].includes(toolName)
        && (planRecovery?.pending > 0 || planRecovery?.issues?.length > 0)) {
      planRecovery = planStore.recoverPlanPublications(db, { rootDir });
      if (planRecovery.pending > 0 || planRecovery.issues.length > 0) {
        const error = new Error(
          'plan publication recovery is incomplete; run ultra.doctor with repair=true',
        );
        error.code = 'PLAN_RECOVERY_REQUIRED';
        error.details = planRecovery;
        throw error;
      }
    }
    return db;
  };

  const toolContracts = loadToolContracts();
  const ajv = buildAjv();
  const inputValidators = new Map();
  const outputValidators = new Map();
  for (const tool of toolContracts) {
    inputValidators.set(tool.name, ajv.compile(tool.input_schema));
    outputValidators.set(tool.name, ajv.compile(tool.output_schema));
  }

  const server = new Server(
    { name: 'ultra-builder-pro-mcp', version: PACKAGE_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler('tools/list', async () => ({
    tools: toolContracts.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.input_schema,
    })),
  }));

  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: input = {} } = request.params;
    const startedAt = Date.now();
    let toolError = null;
    let toolDb = null;

    const emitTelemetry = () => {
      if (!toolDb) return;
      try {
        telemetry.appendTelemetry(toolDb, {
          event_type: 'tool_call',
          tool_name: name,
          session_id: input.scope?.sid || null,
          rootDir,
          payload: {
            duration_ms: Date.now() - startedAt,
            task_id: input.scope?.task_id || null,
            error: toolError,
          },
        });
      } catch (error) {
        process.stderr.write(`telemetry warning: ${error.message}\n`);
      }
    };

    if (!REGISTERED_TOOLS.includes(name)) {
      return errorResponse('UNKNOWN_TOOL', `tool ${name} is not registered on this server`);
    }
    const validateInput = inputValidators.get(name);
    if (!validateInput(input)) {
      return errorResponse('VALIDATION_ERROR', ajv.errorsText(validateInput.errors));
    }

    try {
      toolDb = isInitializeCall(name, input) ? null : getDb(name, input);
      if (toolDb && requiresTeamSync(name, input)) {
        taskLedger.syncTaskLedger(toolDb, { rootDir });
      }
      const result = await ultraFacade.dispatch(name, input, toolDb, {
        rootDir,
        runtime,
        sessionId,
        projector: project,
        markPlanRecoveryRequired,
      });
      if (name === 'ultra.doctor' && input.repair === true) {
        planRecovery = result.repair?.plan_publications || null;
      }

      let runtimeMeta = null;
      if (toolDb && projectOnWrite && isMutation(name, input)) {
        const job = runtimeState.enqueueProjection(toolDb, { tool_name: name });
        const processed = runtimeState.processProjectionJobs(
          toolDb,
          { rootDir, project, limit: 500 },
        );
        const own = processed.jobs.find((item) => item.id === job.id);
        runtimeMeta = {
          projection_commit: 'committed',
          projection_status: own?.status || 'failed',
          projection_job_id: job.id,
        };
        if (own?.incident_id) runtimeMeta.incident_id = own.incident_id;
      }

      const validateOutput = outputValidators.get(name);
      if (!validateOutput(result)) {
        toolError = 'OUTPUT_SCHEMA_DRIFT';
        emitTelemetry();
        return errorResponse(
          'OUTPUT_SCHEMA_DRIFT',
          ajv.errorsText(validateOutput.errors),
          false,
          runtimeMeta ? { _ultra: runtimeMeta } : undefined,
        );
      }

      emitTelemetry();
      const visible = runtimeMeta ? { ...result, _ultra: runtimeMeta } : result;
      return {
        content: [{ type: 'text', text: JSON.stringify(visible) }],
        structuredContent: result,
        ...(runtimeMeta ? { _meta: { ultra: runtimeMeta } } : {}),
      };
    } catch (error) {
      toolError = error.code || 'STATE_DB_ERROR';
      emitTelemetry();
      const visibleError = publicToolError(error);
      return errorResponse(
        visibleError.code,
        visibleError.message,
        visibleError.retriable,
        visibleError.details,
      );
    }
  });

  return {
    server,
    get db() { return db; },
    tools: toolContracts,
    async close() { closeStateDb(db); },
  };
}

async function main() {
  const rootDir = process.env.UBP_ROOT_DIR
    ? path.resolve(process.env.UBP_ROOT_DIR)
    : path.resolve('.');
  const configuredDb = String(process.env.UBP_DB_PATH || '').trim();
  const dbPath = configuredDb
    ? path.resolve(configuredDb)
    : runtimePaths.pathsFor(rootDir).stateDbPath;
  const handle = startServer({
    dbPath,
    rootDir,
    sessionId: process.env.UBP_SESSION_ID || null,
  });
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
    const change = db.prepare(
      `SELECT id FROM changes
       WHERE status = 'active'
       ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
    ).get();
    if (!change) return { recorded: false, reason: 'NO_ACTIVE_CHANGE' };
    const task = db.prepare(
      `SELECT id FROM tasks
       WHERE change_id = ? AND status IN ('in_progress', 'pending', 'blocked')
       ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'blocked' THEN 1 ELSE 2 END,
                updated_at DESC, rowid DESC LIMIT 1`,
    ).get(change.id);
    const payload = {
      agent_id: hookMetadata(hookInput.agent_id),
      agent_type: hookMetadata(hookInput.agent_type),
      host_session_id: hookMetadata(hookInput.session_id, '', 256),
    };
    const hookRuntime = hookMetadata(hookInput.runtime, '', 64) || null;
    ops.appendEvent(db, {
      type: action === 'start' ? 'subagent_started' : 'subagent_stopped',
      change_id: change.id,
      task_id: task?.id || null,
      runtime: hookRuntime,
      payload,
    });
    return { recorded: true, change_id: change.id, task_id: task?.id || null };
  } finally {
    closeStateDb(db);
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`mcp-server fatal: ${error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  main,
  startServer,
  REGISTERED_TOOLS,
  PUBLIC_TOOLS,
  appendHookLifecycleEvent,
  findProjectRoot: runtimePaths.findProjectRoot,
  readProjectContextEnvelope,
  renderProjectContextEnvelope,
};
