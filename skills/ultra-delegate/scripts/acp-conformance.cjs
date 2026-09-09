#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { run: runDelegate } = require('./delegate.cjs');
const { hostProfile, ZCODE_ACP_SOURCE } = require('./host-profile.cjs');
const { probeProcessAlive, resolveAcpEntry } = require('./agent-execution-driver.cjs');

const HOSTS = new Set(['claude', 'codex', 'opencode', 'kimi', 'grok', 'zcode']);
const RECEIPT_SCHEMA = 'ultra-acp-conformance-receipt-v1';

function parseArgs(argv) {
  const allowed = new Set(['--host', '--output', '--timeout', '--command', '--args-json']);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || value === undefined || value === '' || values[key] !== undefined) {
      throw new Error(`invalid ACP conformance argument: ${key || '<missing>'}`);
    }
    values[key] = value;
  }
  if (!HOSTS.has(values['--host'])) throw new Error('ACP conformance requires a supported --host');
  if (!values['--output']) throw new Error('ACP conformance requires --output');
  const timeoutSeconds = values['--timeout'] === undefined ? 240 : Number(values['--timeout']);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 600) {
    throw new Error('ACP conformance --timeout must be between 1 and 600 seconds');
  }
  const hasCommand = values['--command'] !== undefined;
  const hasArgs = values['--args-json'] !== undefined;
  if (hasCommand !== hasArgs) throw new Error('--command and --args-json must be supplied together');
  let argsOverride = null;
  if (hasArgs) {
    try { argsOverride = JSON.parse(values['--args-json']); } catch {
      throw new Error('--args-json must be a JSON string array');
    }
    if (!Array.isArray(argsOverride) || !argsOverride.every((item) => typeof item === 'string')) {
      throw new Error('--args-json must be a JSON string array');
    }
  }
  return {
    host: values['--host'],
    output: path.resolve(values['--output']),
    timeoutSeconds,
    commandOverride: values['--command'] || null,
    argsOverride,
  };
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function artifactDigest(file) {
  const stat = fs.statSync(file);
  return { sha256: sha256(file), bytes: stat.size };
}

// The worker exit observation is itself a boundary claim: only ESRCH-proven
// death counts as an observed exit, so an EPERM or otherwise unprovable
// liveness outcome keeps the conformance receipt failing honestly instead of
// reporting an exit that was never proven.
async function waitForExit(pid, timeoutMs = 5000, kill = process.kill) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!probeProcessAlive(pid, kill)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !probeProcessAlive(pid, kill);
}

async function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('ACP conformance worker did not publish a terminal result before timeout');
}

function createFixture(host) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ubp-${host}-acp-conformance-`));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'acp-conformance@example.invalid']);
  git(root, ['config', 'user.name', 'Ultra ACP Conformance']);
  fs.writeFileSync(path.join(root, 'README.md'), '# Ultra ACP conformance fixture\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.ultra/.runtime/\n');
  git(root, ['add', 'README.md', '.gitignore']);
  git(root, ['commit', '-m', 'test: create ACP conformance fixture']);

  const id = `${host}-${crypto.randomUUID()}`;
  const delegation = path.join(root, '.ultra', '.runtime', 'delegations', id);
  const worktree = path.join(root, '.ultra', '.runtime', 'worktrees', id);
  fs.mkdirSync(path.dirname(worktree), { recursive: true });
  git(root, ['worktree', 'add', '--detach', worktree, 'HEAD']);
  fs.mkdirSync(delegation, { recursive: true });
  const expectedResult = {
    $schema: 'ultra-delegation-result-v1',
    status: 'finished',
    summary: 'ACP conformance completed.',
    changed_files: [],
    checks: [],
    evidence: [],
    questions: [],
    residual_risks: [],
  };
  fs.writeFileSync(path.join(delegation, 'instruction.md'), [
    '# ACP conformance',
    '',
    'Do not use tools or modify files.',
    'Return exactly this one-line JSON object with no prose, fences, or field changes:',
    JSON.stringify(expectedResult),
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(delegation, 'permission.json'), `${JSON.stringify({
    $schema: 'ultra-delegation-permission-v1',
    writable_roots: [],
    external_effects: [],
  }, null, 2)}\n`);
  return { root, delegation, worktree };
}

function writeReceipt(output, receipt) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
}

async function runConformance(options) {
  const profile = hostProfile(options.host);
  if (!profile.acp || profile.acp.transport !== 'stdio'
      || !profile.acp.protocolVersions.includes(1)) {
    throw new Error(`host ${options.host} has no stable ACP v1 stdio candidate`);
  }
  const command = options.commandOverride || profile.acp.command({
    host: options.host,
    cliCommand: profile.binary,
    env: process.env,
  });
  const args = options.argsOverride || profile.acp.argv({
    host: options.host,
    cliCommand: profile.binary,
    env: process.env,
  });
  const fixture = createFixture(options.host);
  let receipt;
  try {
    const runArgs = [
      '--to', options.host,
      '--instruction', path.join(fixture.delegation, 'instruction.md'),
      '--permission', path.join(fixture.delegation, 'permission.json'),
      '--worktree', fixture.worktree,
      '--timeout', String(options.timeoutSeconds),
    ];
    if (profile.transportMaturity === 'experimental') runArgs.push('--ack-experimental');
    const started = runDelegate(runArgs, {
      projectRoot: fixture.root,
      chooseExecutionDriver: ({ env }) => {
        // The conformance bootstrap is the explicit no-record seam: it
        // overrides the candidate command/args to observe a live probe, but it
        // still binds the one public entry it resolved, exactly like the
        // product selection — the launcher refuses any ACP selection without
        // it, and a future fingerprint-qualified profile would additionally
        // require the verified execution identity this override cannot fake.
        const acpEntryPath = resolveAcpEntry(env);
        const boundEntry = acpEntryPath && sha256(acpEntryPath);
        return {
          driver: 'acp',
          command,
          args,
          protocolVersion: 1,
          fallbackReason: null,
          acpCapability: {
            candidate: true,
            surface: profile.acp.surface,
            transport: 'stdio',
            protocol_versions: [1],
            conformance_status: 'probe',
            conformance_evidence: null,
            conformance_reason: 'Live conformance probe in progress.',
            executable_available: true,
            candidate_valid: true,
          },
          ...(boundEntry ? { acpEntry: { path: acpEntryPath, sha256: boundEntry } } : {}),
        };
      },
    });
    const resultFile = path.join(fixture.delegation, 'result.json');
    await waitForFile(resultFile, (options.timeoutSeconds * 1000) + 10000);
    const terminal = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    const workerExitObserved = await waitForExit(started.worker_pid);
    const changedFiles = Array.isArray(terminal.changed_files) ? terminal.changed_files : [];
    const gitClean = git(fixture.worktree, ['status', '--porcelain=v1', '--untracked-files=all']) === '';
    const artifactFiles = {
      result: resultFile,
      stdout: path.join(fixture.delegation, 'stdout.log'),
      stderr: path.join(fixture.delegation, 'stderr.log'),
      events: path.join(fixture.delegation, 'events.jsonl'),
      host_output: path.join(fixture.delegation, 'host-result.json'),
    };
    const artifactDigests = {};
    for (const [name, file] of Object.entries(artifactFiles)) {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) artifactDigests[name] = artifactDigest(file);
    }
    const events = fs.existsSync(artifactFiles.events)
      ? fs.readFileSync(artifactFiles.events, 'utf8').trim().split('\n').filter(Boolean)
      : [];
    const passed = terminal.status === 'finished'
      && terminal.$schema === 'ultra-delegation-result-v1'
      && terminal.execution_driver === 'acp'
      && terminal.acp_protocol_version === 1
      && terminal.acp_stop_reason === 'end_turn'
      && changedFiles.length === 0
      && gitClean
      && workerExitObserved;
    receipt = {
      $schema: RECEIPT_SCHEMA,
      host: options.host,
      candidate: {
        surface: profile.acp.surface,
        command,
        args,
        protocol_versions: [1],
        override_used: options.commandOverride !== null,
        ...(options.host === 'zcode' ? {
          bridge_source: ZCODE_ACP_SOURCE,
          installed_runtime: profile.binary,
        } : {}),
      },
      result: {
        status: passed ? 'passed' : 'failed',
        execution_driver: terminal.execution_driver || null,
        protocol_version: terminal.acp_protocol_version ?? null,
        stop_reason: terminal.acp_stop_reason ?? null,
        adapter_exit_code: terminal.acp_adapter_exit_code ?? null,
        adapter_exit_signal: terminal.acp_adapter_exit_signal ?? null,
        git_clean: gitClean,
        changed_files_count: changedFiles.length,
        event_count: events.length,
        worker_exit_observed: workerExitObserved,
        failure_type: terminal.failure_type || null,
        validation_diagnostic: terminal.failure_type === 'invalid_result'
          ? terminal.summary
          : null,
        transport_diagnostic: typeof terminal.failure_type === 'string'
          && terminal.failure_type.startsWith('acp_')
          ? terminal.summary
          : null,
      },
      artifact_digests: artifactDigests,
      redaction: {
        provider_content_retained: false,
        prompt_retained: false,
        hidden_reasoning_retained: false,
        credentials_retained: false,
        temporary_artifacts_removed: true,
      },
      observed_at: new Date().toISOString(),
    };
    writeReceipt(options.output, receipt);
    if (!passed) throw new Error(`ACP conformance failed for ${options.host}: ${terminal.failure_type || 'terminal_mismatch'}`);
    return receipt;
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const receipt = await runConformance(options);
  process.stdout.write(`${JSON.stringify({
    host: receipt.host,
    status: receipt.result.status,
    receipt: options.output,
  })}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, runConformance, waitForExit };
