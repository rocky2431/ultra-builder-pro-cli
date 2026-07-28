#!/usr/bin/env node

/**
 * ubp-orchestrator — Phase 5.4 daemon CLI.
 *
 * Subcommands:
 *   execute-plan  resume the current plan through the first unfinished dependency wave.
 *   run     foreground daemon (debug / test).
 *   start   detached background daemon, writes .ultra/.runtime/orchestrator.pid.
 *   stop    reads pidfile, SIGTERM the process, deletes pidfile.
 *   status  prints pidfile + running session summary.
 *
 * Opt-in gate: `start` and `run` require settings.json
 * `orchestrator.auto_dispatch: true` — default off per PLAN Phase 5.4 AC.
 *
 * Dispatch requires both explicit opt-in and an explicit executable command.
 * A daemon may never reserve a session/worktree without a real worker process.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { isSupportedRuntime } = require('../adapters/_shared/runtime-assets.cjs');
const runtimePaths = require('../mcp-server/lib/runtime-paths.cjs');

const REPO_ROOT = process.env.UBP_REPO_ROOT || process.cwd();
const RUNTIME_PATHS = runtimePaths.pathsFor(REPO_ROOT);
const PIDFILE = RUNTIME_PATHS.orchestratorPidPath;
const LOGFILE = RUNTIME_PATHS.orchestratorLogPath;
const SETTINGS_FILES = [
  path.join(REPO_ROOT, 'settings.json'),
  path.join(REPO_ROOT, '.claude', 'settings.json'),
];

function readSettings() {
  for (const f of SETTINGS_FILES) {
    if (fs.existsSync(f)) {
      try { return JSON.parse(fs.readFileSync(f, 'utf8')) || {}; }
      catch { /* fall through */ }
    }
  }
  return {};
}

function optInAllowed(settings) {
  return !!(settings && settings.orchestrator && settings.orchestrator.auto_dispatch === true);
}

function parseRuntimes() {
  const raw = process.env.UBP_ORCH_RUNTIMES || 'claude,opencode,codex,kimi';
  const runtimes = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  const invalid = runtimes.filter((runtime) => !isSupportedRuntime(runtime));
  if (invalid.length > 0) {
    throw new Error(`unsupported orchestrator runtime(s): ${invalid.join(', ')}`);
  }
  return runtimes;
}

function commandConfigError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function resolveDispatchCommand(settings, env = process.env) {
  const configured = settings?.orchestrator || {};
  const fromEnvironment = typeof env.UBP_ORCH_COMMAND === 'string'
    && env.UBP_ORCH_COMMAND.trim() !== '';
  const command = fromEnvironment
    ? env.UBP_ORCH_COMMAND.trim()
    : (typeof configured.command === 'string' ? configured.command.trim() : '');
  if (!command) {
    throw commandConfigError(
      'ORCHESTRATOR_COMMAND_REQUIRED',
      'orchestrator dispatch requires orchestrator.command or UBP_ORCH_COMMAND',
    );
  }
  if (/\s/.test(command) && !fs.existsSync(command)) {
    throw commandConfigError(
      'ORCHESTRATOR_COMMAND_INVALID',
      'orchestrator.command must contain only the executable; put arguments in command_args',
    );
  }

  let commandArgs;
  if (fromEnvironment && env.UBP_ORCH_ARGS_JSON !== undefined) {
    try {
      commandArgs = JSON.parse(env.UBP_ORCH_ARGS_JSON);
    } catch (error) {
      throw commandConfigError(
        'ORCHESTRATOR_COMMAND_INVALID',
        `UBP_ORCH_ARGS_JSON must be a JSON array: ${error.message}`,
      );
    }
  } else {
    commandArgs = configured.command_args === undefined ? [] : configured.command_args;
  }
  if (!Array.isArray(commandArgs) || commandArgs.some((arg) => typeof arg !== 'string')) {
    throw commandConfigError(
      'ORCHESTRATOR_COMMAND_INVALID',
      'orchestrator command arguments must be an array of strings',
    );
  }
  return {
    command,
    commandArgs: commandArgs.slice(),
    source: fromEnvironment ? 'environment' : 'settings',
  };
}

function parseExecutePlanArgs(argv = []) {
  const options = {
    planPath: null,
    changeId: null,
    autoMerge: false,
    mergeBaseBranch: 'main',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--auto-merge') {
      options.autoMerge = true;
      continue;
    }
    if (arg === '--plan' || arg === '--change' || arg === '--base-branch') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw commandConfigError(
          'ORCHESTRATOR_ARGUMENT_INVALID',
          `${arg} requires a value`,
        );
      }
      if (arg === '--plan') options.planPath = value;
      else if (arg === '--change') options.changeId = value;
      else options.mergeBaseBranch = value;
      index += 1;
      continue;
    }
    throw commandConfigError(
      'ORCHESTRATOR_ARGUMENT_INVALID',
      `unknown execute-plan option: ${arg}`,
    );
  }
  if (options.planPath && options.changeId) {
    throw commandConfigError(
      'ORCHESTRATOR_ARGUMENT_INVALID',
      '--plan is explicit legacy compatibility and cannot be combined with --change',
    );
  }
  return options;
}

function validateOrchestratorRuntime(rootDir = REPO_ROOT, {
  forMutation = false,
} = {}) {
  return runtimePaths.validateProjectLayout(rootDir, {
    env: {},
    forMutation,
    validateRuntimeTree: true,
  });
}

function openNoFollow(file, flags) {
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  return fs.openSync(file, flags | noFollow, 0o600);
}

async function cmdExecutePlan(argv = []) {
  const settings = readSettings();
  const dispatch = resolveDispatchCommand(settings);
  const options = parseExecutePlanArgs(argv);
  const { initStateDb, closeStateDb } = require('../mcp-server/lib/state-db.cjs');
  const parallelOrchestrator = require('../orchestrator/parallel-orchestrator.cjs');
  const { db } = initStateDb(runtimePaths.ensureRuntimeState(REPO_ROOT).stateDbPath);
  try {
    const result = await parallelOrchestrator.runPlan({
      db,
      repoRoot: REPO_ROOT,
      planPath: options.planPath ? path.resolve(REPO_ROOT, options.planPath) : undefined,
      changeId: options.changeId,
      runtimes: parseRuntimes(),
      command: dispatch.command,
      commandArgs: dispatch.commandArgs,
      autoMerge: options.autoMerge,
      mergeBaseBranch: options.mergeBaseBranch,
      onError: (error) => process.stderr.write(`orchestrator error: ${error.message}\n`),
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      data: {
        ...result,
        auto_merge: options.autoMerge,
        merge_base_branch: options.mergeBaseBranch,
      },
    })}\n`);
    return result;
  } finally {
    closeStateDb(db);
  }
}

function cmdRun(opts = {}) {
  const settings = readSettings();
  if (!opts.skipOptIn && !optInAllowed(settings)) {
    process.stderr.write(
      'orchestrator.auto_dispatch is not enabled in settings.json.\n' +
      'Set {"orchestrator":{"auto_dispatch":true}} to opt in.\n',
    );
    process.exit(2);
  }
  const { initStateDb } = require('../mcp-server/lib/state-db.cjs');
  const { runDaemon } = require('../orchestrator/daemon.cjs');
  const runtimes = parseRuntimes();
  const dispatch = resolveDispatchCommand(settings);
  const { db } = initStateDb(runtimePaths.ensureRuntimeState(REPO_ROOT).stateDbPath);
  const handle = runDaemon({
    db,
    repoRoot: REPO_ROOT,
    runtimes,
    command: dispatch.command,
    commandArgs: dispatch.commandArgs,
    pollMs: Number(process.env.UBP_ORCH_POLL_MS || 1000),
    onError: (err) => process.stderr.write(`orchestrator error: ${err.message}\n`),
  });

  const shutdown = (signal) => {
    process.stderr.write(`orchestrator received ${signal}, stopping\n`);
    handle.stop();
    try { db.close(); } catch (_) { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.stderr.write(
    `orchestrator running (pollMs=${Number(process.env.UBP_ORCH_POLL_MS || 1000)}, ` +
    `runtimes=${runtimes.join(',')}, worker=${dispatch.command}, source=${dispatch.source})\n`,
  );
  // Keep process alive while the setInterval is unref'd.
  setInterval(() => {}, 60000);
}

function cmdStart() {
  const settings = readSettings();
  if (!optInAllowed(settings)) {
    process.stderr.write('orchestrator.auto_dispatch is not enabled; refusing to start.\n');
    process.exit(2);
  }
  resolveDispatchCommand(settings);
  const layout = validateOrchestratorRuntime(REPO_ROOT, { forMutation: true });
  const pidfile = layout.orchestratorPidPath;
  const logfile = layout.orchestratorLogPath;
  if (fs.existsSync(pidfile)) {
    const existing = Number(fs.readFileSync(pidfile, 'utf8'));
    try { process.kill(existing, 0); }
    catch (_) { fs.unlinkSync(pidfile); }
    if (fs.existsSync(pidfile)) {
      process.stderr.write(`orchestrator already running (pid=${existing}).\n`);
      process.exit(1);
    }
  }
  fs.mkdirSync(layout.orchestratorDir, { recursive: true });
  const appendFlags = fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY;
  const out = openNoFollow(logfile, appendFlags);
  const err = openNoFollow(logfile, appendFlags);
  const child = spawn(process.execPath, [__filename, 'run'], {
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env, UBP_REPO_ROOT: REPO_ROOT },
  });
  child.unref();
  const pidFd = openNoFollow(
    pidfile,
    fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_WRONLY,
  );
  try { fs.writeFileSync(pidFd, String(child.pid)); }
  finally { fs.closeSync(pidFd); }
  process.stdout.write(`orchestrator started (pid=${child.pid}, log=${logfile})\n`);
}

function cmdStop() {
  const { orchestratorPidPath: pidfile } = validateOrchestratorRuntime(REPO_ROOT, {
    forMutation: true,
  });
  if (!fs.existsSync(pidfile)) {
    process.stderr.write('no pidfile found; orchestrator not running.\n');
    process.exit(1);
  }
  const pid = Number(fs.readFileSync(pidfile, 'utf8'));
  try { process.kill(pid, 'SIGTERM'); }
  catch (err) {
    if (err.code === 'ESRCH') {
      process.stderr.write(`pid ${pid} already dead; cleaning pidfile.\n`);
      fs.unlinkSync(pidfile);
      return;
    }
    throw err;
  }
  // Wait briefly for the process to exit, then clean up.
  setTimeout(() => {
    try { process.kill(pid, 0); }
    catch (_) { /* dead; good */ }
    if (fs.existsSync(pidfile)) fs.unlinkSync(pidfile);
    process.stdout.write(`orchestrator stopped (pid=${pid})\n`);
  }, 200);
}

function cmdStatus() {
  const { orchestratorPidPath: pidfile } = validateOrchestratorRuntime(REPO_ROOT);
  const out = { pidfile, running: false };
  if (fs.existsSync(pidfile)) {
    const pid = Number(fs.readFileSync(pidfile, 'utf8'));
    try { process.kill(pid, 0); out.pid = pid; out.running = true; }
    catch (_) { out.pid = pid; out.running = false; out.note = 'pidfile stale'; }
  }
  // Session summary.
  try {
    const Database = require('better-sqlite3');
    const dbPath = runtimePaths.locateStateDb(REPO_ROOT);
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true });
      const counts = db.prepare(
        "SELECT status, COUNT(*) AS n FROM sessions GROUP BY status",
      ).all();
      out.sessions = {};
      for (const r of counts) out.sessions[r.status] = r.n;
      db.close();
    }
  } catch (err) {
    out.session_error = err.message;
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

function usage() {
  process.stderr.write(
    'usage: ubp-orchestrator <execute-plan|run|start|stop|status>\n' +
    '\n' +
    '  execute-plan  resume the first unfinished dependency wave [--change <id>] [--plan <legacy-path>] [--auto-merge] [--base-branch <name>]\n' +
    '  run     foreground daemon (requires opt-in)\n' +
    '  start   detached background daemon (requires opt-in)\n' +
    '  stop    terminate running daemon\n' +
    '  status  print pid + session counts\n',
  );
}

async function main(argv = process.argv.slice(2)) {
  const subcommand = argv[0];
  try {
    switch (subcommand) {
      case 'execute-plan': await cmdExecutePlan(argv.slice(1)); break;
      case 'run':    cmdRun();        break;
      case 'start':  cmdStart();      break;
      case 'stop':   cmdStop();       break;
      case 'status': cmdStatus();     break;
      case '-h':
      case '--help':
      case 'help':
        usage(); process.exit(0);
        break;
      default:
        usage(); process.exit(1);
    }
  } catch (error) {
    process.stderr.write(
      `orchestrator configuration error${error.code ? ` [${error.code}]` : ''}: ${error.message}\n`,
    );
    process.exit(2);
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`orchestrator fatal error: ${error.message}\n`);
    process.exit(2);
  });
}

module.exports = {
  readSettings,
  optInAllowed,
  parseRuntimes,
  parseExecutePlanArgs,
  resolveDispatchCommand,
  validateOrchestratorRuntime,
  cmdExecutePlan,
  cmdRun,
  cmdStart,
  cmdStop,
  cmdStatus,
  main,
};
