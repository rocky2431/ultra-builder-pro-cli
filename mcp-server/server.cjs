'use strict';

// MCP server (stdio JSON-RPC) exposing the seven task.* tools backed by
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

const { initStateDb, closeStateDb } = require('./lib/state-db.cjs');
const ops = require('./lib/state-ops.cjs');
const projector = require('./lib/projector.cjs');
const { initProject } = require('./lib/init-project.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
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
]);

// init_project mutates the filesystem of an unrelated project, not state.db —
// do NOT run the projector (it would overwrite the freshly-copied template).
const MUTATING_TOOLS = new Set(['task.create', 'task.update', 'task.delete', 'task.append_event']);

function loadTaskTools() {
  const manifest = yaml.load(fs.readFileSync(TOOLS_FILE, 'utf8'));
  return manifest.tools.filter((t) => TASK_TOOLS.includes(t.name));
}

function buildAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

function dispatchTool(name, input, db) {
  switch (name) {
    case 'task.create': {
      const { randomUUID } = require('node:crypto');
      const id = input.id || `task-${randomUUID()}`;
      const task = ops.createTask(db, { ...input, id });
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
        session_id: input.session_id,
        runtime: input.runtime,
        payload: input.payload,
      });
      return { event_id: r.event_id, ts: r.ts };
    }
    case 'task.subscribe_events': {
      return ops.subscribeEventsSince(db, input || {});
    }
    default:
      throw new Error(`unhandled tool ${name}`);
  }
}

function errorResponse(code, message, retriable = false) {
  return {
    isError: true,
    content: [{
      type: 'text',
      text: JSON.stringify({ ok: false, error: { code, message, retriable } }),
    }],
  };
}

function startServer({ dbPath, rootDir, projectOnWrite = true }) {
  const init = initStateDb(dbPath);
  const db = init.db;

  const tools = loadTaskTools();
  const ajv = buildAjv();
  const inputValidators = new Map();
  const outputValidators = new Map();
  for (const t of tools) {
    inputValidators.set(t.name, ajv.compile(t.input_schema));
    outputValidators.set(t.name, ajv.compile(t.output_schema));
  }

  const server = new Server(
    { name: 'ultra-builder-pro-mcp', version: '0.2.0' },
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
    if (!TASK_TOOLS.includes(name)) {
      return errorResponse('UNKNOWN_TOOL', `tool ${name} is not registered on this server`);
    }
    const validateInput = inputValidators.get(name);
    if (!validateInput(args)) {
      return errorResponse('VALIDATION_ERROR', ajv.errorsText(validateInput.errors));
    }

    let result;
    try {
      result = dispatchTool(name, args, db);
    } catch (err) {
      const code = err.code || (err instanceof ops.StateOpsError ? err.code : 'STATE_DB_ERROR');
      return errorResponse(code, err.message, !!err.retriable);
    }

    const validateOutput = outputValidators.get(name);
    if (!validateOutput(result)) {
      return errorResponse('OUTPUT_SCHEMA_DRIFT', ajv.errorsText(validateOutput.errors));
    }

    if (projectOnWrite && MUTATING_TOOLS.has(name)) {
      try { projector.projectAll(db, { rootDir }); }
      catch (err) { process.stderr.write(`projector warning: ${err.message}\n`); }
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  });

  return {
    server,
    db,
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

module.exports = { startServer, dispatchTool, TASK_TOOLS, MUTATING_TOOLS };
