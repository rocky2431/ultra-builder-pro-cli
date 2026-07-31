'use strict';

/** Build and register a Kimi Code 0.26+ native Ultra Builder Pro plugin. */

const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  copyTree,
  ensureDir,
  isManaged,
  markManaged,
  removeTree,
  writeAtomic,
} = require('./_shared/file-ops.cjs');
const {
  applyNativeDoctor,
  buildMcpRuntime,
} = require('./_shared/codex-assets.cjs');
const { parse: parseFm, serialize: serializeFm } = require('./_shared/frontmatter.cjs');
const { adaptInteractionGuidance } = require('./_shared/interaction-contract.cjs');
const provenance = require('./_shared/provenance.cjs');
const { PUBLIC_TOOLS } = require('../mcp-server/lib/ultra-facade.cjs');
const {
  CORE_PUBLIC_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillPolicy,
  skillsForRuntime,
} = require('./_shared/runtime-assets.cjs');

const PLUGIN_ID = 'ultra-builder-pro';
const MCP_SERVER_NAME = PLUGIN_ID;
const PROVENANCE_FILE = 'provenance.json';
const REGISTRY_RELATIVE = path.join('plugins', 'installed.json');
const MANAGED_RELATIVE = path.join('plugins', 'managed', PLUGIN_ID);
const KIMI_PLUGIN_PROBE = String.raw`
'use strict';
const { spawn } = require('node:child_process');

const kimiBin = process.argv[1];
const pluginRoot = process.argv[2];
const pluginId = process.argv[3];
const sessionCwd = process.argv[4];
const kimiHome = process.argv[5];
const probeTimeoutMs = Number(process.argv[6]);
const cleanupHttpTimeoutMs = Number(process.argv[7]);
const termWaitMs = Number(process.argv[8]);
const killWaitMs = Number(process.argv[9]);
let child = null;
let activeBaseUrl = '';
let activeHeaders = {};
let activeSessionId = '';
let cleanupPromise = null;

async function readJson(url, headers, options = {}, attempts = 1) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, headers: {
        ...headers,
        ...(options.headers || {}),
      } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  throw lastError;
}

function childExited() {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

async function waitForExitWithin(timeoutMs) {
  if (childExited()) return true;
  return await new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(childExited());
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

function signalChild(signal) {
  if (childExited()) return;
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  try {
    child.kill(signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  signalChild('SIGTERM');
  if (!await waitForExitWithin(termWaitMs)) {
    signalChild('SIGKILL');
    if (!await waitForExitWithin(killWaitMs)) {
      throw new Error('Kimi probe process group did not exit after SIGKILL');
    }
  }
}

async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    let cleanupError = null;
    if (activeBaseUrl && activeSessionId) {
      try {
        const archived = await readJson(
          activeBaseUrl + '/api/v1/sessions/' + encodeURIComponent(activeSessionId) + ':archive',
          activeHeaders,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
            signal: AbortSignal.timeout(cleanupHttpTimeoutMs),
          },
        );
        if (archived.code !== 0 || archived.data?.archived !== true) {
          throw new Error('Kimi failed to archive probe session ' + activeSessionId);
        }
        activeSessionId = '';
      } catch (error) {
        cleanupError = error;
      }
    }
    if (activeBaseUrl) {
      try {
        await fetch(activeBaseUrl + '/api/v1/shutdown', {
          method: 'POST',
          headers: activeHeaders,
          signal: AbortSignal.timeout(cleanupHttpTimeoutMs),
        });
      } catch (_) {
        // The server may close the socket before returning its shutdown response.
      }
    }
    try {
      await stopChild();
    } catch (error) {
      cleanupError ||= error;
    }
    if (cleanupError) {
      throw new Error('KIMI_PLUGIN_PROBE_TIMEOUT: ' + cleanupError.message);
    }
  })();
  return cleanupPromise;
}

async function main() {
  let stdout = '';
  let stderr = '';
  child = spawn(kimiBin, [
    'web',
    '--port', '0',
    '--host', '127.0.0.1',
    '--no-open',
    '--debug-endpoints',
  ], {
    cwd: sessionCwd,
    env: { ...process.env, KIMI_CODE_HOME: kimiHome },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  try {
    let token = null;
    let baseUrl = null;
    for (let attempt = 0; attempt < 200 && (!token || !baseUrl); attempt += 1) {
      token = stdout.match(/Token:\s+(\S+)/)?.[1] || null;
      baseUrl = stdout.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)?.[1] || null;
      if (!token || !baseUrl) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!token) throw new Error('Kimi web did not publish a loopback bearer token');
    if (!baseUrl) throw new Error('Kimi web did not publish its loopback URL');
    const headers = { Authorization: 'Bearer ' + token };
    activeBaseUrl = baseUrl;
    activeHeaders = headers;
    await readJson(baseUrl + '/api/v1/debug/channels', headers, {}, 200);
    const response = await readJson(
      baseUrl + '/api/v1/debug/pluginService/listPlugins',
      headers,
    );
    if (response.code !== 0 || !Array.isArray(response.data)) {
      throw new Error('Kimi pluginService.listPlugins returned an invalid response');
    }
    const plugin = response.data.find((entry) => entry && entry.id === pluginId);
    const mcpResponse = await readJson(
      baseUrl + '/api/v1/debug/pluginService/enabledMcpServers',
      headers,
    );
    if (mcpResponse.code !== 0 || !mcpResponse.data || typeof mcpResponse.data !== 'object') {
      throw new Error('Kimi pluginService.enabledMcpServers returned an invalid response');
    }
    const sessionResponse = await readJson(
      baseUrl + '/api/v1/sessions',
      headers,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ metadata: { cwd: sessionCwd } }),
      },
    );
    const sessionId = sessionResponse.data?.id;
    if (sessionResponse.code !== 0 || !sessionId) {
      throw new Error('Kimi failed to create a probe session');
    }
    activeSessionId = sessionId;
    const agentBase = baseUrl
      + '/api/v1/debug/session/' + encodeURIComponent(sessionId)
      + '/agent/main/agentMcpService/';
    const initialLoad = await readJson(
      agentBase + 'waitForInitialLoad',
      headers,
    );
    if (initialLoad.code !== 0) {
      throw new Error('Kimi agentMcpService.waitForInitialLoad failed');
    }
    const connectionResponse = await readJson(agentBase + 'list', headers);
    if (connectionResponse.code !== 0 || !Array.isArray(connectionResponse.data)) {
      throw new Error('Kimi agentMcpService.list returned an invalid response');
    }
    const toolsResponse = await readJson(
      baseUrl + '/api/v1/tools?session_id=' + encodeURIComponent(sessionId),
      headers,
    );
    if (toolsResponse.code !== 0 || !Array.isArray(toolsResponse.data?.tools)) {
      throw new Error('Kimi session tool registry returned an invalid response');
    }
    process.stdout.write(JSON.stringify({
      plugin,
      mcpServers: mcpResponse.data,
      mcpConnections: connectionResponse.data,
      tools: toolsResponse.data.tools,
    }));
  } catch (error) {
    const detail = stderr.trim();
    throw new Error(error.message + (detail ? ': ' + detail : ''));
  } finally {
    await cleanup();
  }
}

let handlingSignal = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (handlingSignal) return;
    handlingSignal = true;
    void cleanup().finally(() => process.exit(1));
  });
}

let watchdogFired = false;
const watchdog = setTimeout(() => {
  watchdogFired = true;
  void cleanup().catch(() => {}).finally(() => {
    process.stderr.write('KIMI_PLUGIN_PROBE_TIMEOUT');
    process.exit(124);
  });
}, probeTimeoutMs);

main().then(() => {
  clearTimeout(watchdog);
}).catch((error) => {
  clearTimeout(watchdog);
  if (watchdogFired) return;
  process.stderr.write(error.stack || error.message);
  process.exitCode = 1;
});
`;

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return path.resolve(ctx.configDir);
  if (ctx.scope === 'global') {
    return path.resolve(process.env.KIMI_CODE_HOME || path.join(ctx.homeDir || os.homedir(), '.kimi-code'));
  }
  return path.join(ctx.cwd || process.cwd(), '.kimi-code');
}

function resolvePluginRoot(ctx = {}) {
  return path.join(resolveTarget(ctx), MANAGED_RELATIVE);
}

function resolveRegistryFile(ctx = {}) {
  return path.join(resolveTarget(ctx), REGISTRY_RELATIVE);
}

function resolveRepoRoot(ctx = {}) {
  return path.resolve(ctx.repoRoot || path.join(__dirname, '..'));
}

function shouldRunHostCli(ctx = {}) {
  if (typeof ctx.runHostCli === 'boolean') return ctx.runHostCli;
  return ctx.scope === 'global' && !ctx.configDir;
}

function countSkillRoots(pluginRoot) {
  const root = path.join(pluginRoot, 'skills');
  if (!fs.existsSync(root)) return 0;
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => (
      entry.isDirectory()
      && fs.existsSync(path.join(root, entry.name, 'SKILL.md'))
    ))
    .length;
}

function probeKimiPlugin(ctx = {}, consumer = {}) {
  const probeTimeoutMs = ctx.hostCliTimeoutMs || 45000;
  const cleanupHttpTimeoutMs = Math.min(
    1000,
    Math.max(10, Math.floor(probeTimeoutMs / 8)),
  );
  const termWaitMs = Math.min(1000, Math.max(10, Math.floor(probeTimeoutMs / 8)));
  const killWaitMs = Math.min(1000, Math.max(10, Math.floor(probeTimeoutMs / 8)));
  const outerTimeoutMs = probeTimeoutMs
    + (cleanupHttpTimeoutMs * 2)
    + termWaitMs
    + killWaitMs
    + 250;
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      KIMI_PLUGIN_PROBE,
      ctx.kimiBin || 'kimi',
      consumer.pluginRoot || resolvePluginRoot(ctx),
      PLUGIN_ID,
      path.resolve(ctx.cwd || process.cwd()),
      consumer.kimiHome || resolveTarget(ctx),
      String(probeTimeoutMs),
      String(cleanupHttpTimeoutMs),
      String(termWaitMs),
      String(killWaitMs),
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      killSignal: 'SIGKILL',
      env: {
        ...process.env,
      },
      timeout: outerTimeoutMs,
    },
  );
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      const error = new Error('Kimi native plugin probe timed out');
      error.code = 'HOST_CLI_TIMEOUT';
      throw error;
    }
    throw result.error;
  }
  if (result.status === 124 || result.stderr.includes('KIMI_PLUGIN_PROBE_TIMEOUT')) {
    const error = new Error('Kimi native plugin probe timed out');
    error.code = 'HOST_CLI_TIMEOUT';
    throw error;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`Kimi native plugin probe failed${detail ? `: ${detail}` : ''}`);
  }
  const payload = JSON.parse(result.stdout);
  return payload;
}

function stableHash8(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.codePointAt(index);
    hash = Math.trunc(Math.imul(hash, 16777619));
  }
  return hash.toString(16).padStart(8, '0');
}

function sanitizeKimiMcpNamePart(value) {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, '_').replaceAll(/_+/g, '_');
}

function matchesQualifiedKimiToolName(observed, serverId, publicName) {
  if (typeof observed !== 'string') return false;
  const full = `mcp__${sanitizeKimiMcpNamePart(serverId)}__${sanitizeKimiMcpNamePart(publicName)}`;
  if (observed === full) return true;
  const truncated = /^(.*)_(-?[0-9a-f]{8})$/.exec(observed);
  return !!truncated
    && truncated[2] === stableHash8(full)
    && truncated[1] === full.slice(0, truncated[1].length);
}

function normalizeKimiToolIdentity(descriptor, serverId, expectedTools) {
  if (typeof serverId !== 'string' || !serverId) return null;
  const matches = expectedTools.filter((name) => (
    matchesQualifiedKimiToolName(descriptor?.name, serverId, name)
  ));
  return matches.length === 1 ? matches[0] : null;
}

function sameStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  return actualSet.size === expected.length
    && expected.every((value) => actualSet.has(value));
}

function inspectActualKimiRegistration(ctx = {}) {
  const registryFile = resolveRegistryFile(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  if (!fs.existsSync(registryFile)) {
    return {
      registryFile,
      pluginRoot,
      registryBytes: null,
      record: null,
      registryOk: false,
      pluginRootOk: false,
    };
  }
  const registryBytes = fs.readFileSync(registryFile);
  const registry = loadRegistry(registryFile);
  const record = registry.plugins.find((entry) => entry && entry.id === PLUGIN_ID) || null;
  const registryOk = !!record
    && path.resolve(record.root || '') === path.resolve(pluginRoot)
    && record.source === 'local-path'
    && record.enabled === true;
  let pluginRootOk = false;
  if (registryOk) {
    try {
      const stat = fs.lstatSync(pluginRoot);
      pluginRootOk = stat.isDirectory()
        && !stat.isSymbolicLink()
        && isManaged(pluginRoot)
        && fs.existsSync(path.join(pluginRoot, 'kimi.plugin.json'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return {
    registryFile,
    pluginRoot,
    registryBytes,
    record,
    registryOk,
    pluginRootOk,
  };
}

function createIsolatedKimiRegistry(actual) {
  const kimiHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-kimi-doctor-'));
  const registryFile = path.join(kimiHome, REGISTRY_RELATIVE);
  ensureDir(path.dirname(registryFile));
  fs.writeFileSync(registryFile, actual.registryBytes);
  if (!fs.readFileSync(registryFile).equals(actual.registryBytes)) {
    removeTree(kimiHome);
    throw new Error('failed to create a byte-for-byte Kimi registry clone');
  }
  return { kimiHome, registryFile };
}

function invalidActualKimiRegistration(actual) {
  const error = new Error(
    `Kimi actual registration is invalid: ${actual.registryFile} -> ${actual.pluginRoot}`,
  );
  error.code = 'ACTUAL_KIMI_REGISTRATION_INVALID';
  error.actual = actual;
  return error;
}

function inspectKimiHost(ctx = {}) {
  const actual = inspectActualKimiRegistration(ctx);
  if (!actual.registryOk || !actual.pluginRootOk || !actual.registryBytes) {
    throw invalidActualKimiRegistration(actual);
  }
  const target = actual.pluginRoot;
  const manifest = JSON.parse(fs.readFileSync(path.join(target, 'kimi.plugin.json'), 'utf8'));
  const isolated = createIsolatedKimiRegistry(actual);
  try {
    const doctorResult = spawnSync(ctx.kimiBin || 'kimi', ['doctor'], {
      encoding: 'utf8',
      timeout: ctx.hostCliTimeoutMs || 30000,
      killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        KIMI_CODE_HOME: isolated.kimiHome,
      },
    });
    if (doctorResult.error) {
      if (doctorResult.error.code === 'ETIMEDOUT') {
        const error = new Error('kimi doctor timed out');
        error.code = 'HOST_CLI_TIMEOUT';
        throw error;
      }
      throw doctorResult.error;
    }
    if (doctorResult.status !== 0) {
      const detail = (doctorResult.stderr || doctorResult.stdout || '').trim();
      throw new Error(`kimi doctor failed${detail ? `: ${detail}` : ''}`);
    }
    if (!fs.readFileSync(isolated.registryFile).equals(actual.registryBytes)) {
      throw new Error('isolated Kimi doctor mutated its registry clone');
    }
    const probe = probeKimiPlugin(ctx, {
      kimiHome: isolated.kimiHome,
      pluginRoot: actual.pluginRoot,
    });
    const plugin = probe.plugin || null;
    const expected = {
      skillCount: countSkillRoots(target),
      mcpServerCount: Object.keys(manifest.mcpServers || {}).length,
      hookCount: Array.isArray(manifest.hooks) ? manifest.hooks.length : 0,
      commandCount: fs.readdirSync(path.join(target, 'commands'))
        .filter((name) => name.endsWith('.md')).length,
    };
    const pluginOk = !!plugin
      && plugin.enabled === true
      && plugin.state === 'ok'
      && plugin.hasErrors === false
      && plugin.version === manifest.version
      && plugin.skillCount === expected.skillCount
      && plugin.hookCount === expected.hookCount
      && plugin.commandCount === expected.commandCount;
    const nativeServerName = `plugin-${PLUGIN_ID}:${MCP_SERVER_NAME}`;
    const nativeMcp = probe.mcpServers?.[nativeServerName];
    const mcpConnection = (probe.mcpConnections || []).find((entry) => (
      entry?.name === nativeServerName
    ));
    const enabledTools = manifest.mcpServers?.[MCP_SERVER_NAME]?.enabledTools;
    const expectedTools = [...PUBLIC_TOOLS];
    const connectionToolServerId = mcpConnection?.name?.replaceAll(':', '_');
    const connectedTools = (probe.tools || []).filter((entry) => (
      entry?.source === 'mcp'
      && entry.mcp_server_id === connectionToolServerId
      && entry.active !== false
    ));
    const normalizedTools = connectedTools.map((entry) => (
      normalizeKimiToolIdentity(entry, connectionToolServerId, expectedTools)
    ));
    const mcpOk = pluginOk
      && plugin.mcpServerCount === expected.mcpServerCount
      && plugin.enabledMcpServerCount === expected.mcpServerCount
      && nativeMcp?.enabled === true
      && path.resolve(nativeMcp.cwd || '') === path.resolve(target)
      && nativeMcp.command === manifest.mcpServers?.[MCP_SERVER_NAME]?.command
      && JSON.stringify(nativeMcp.args) === JSON.stringify(
        manifest.mcpServers?.[MCP_SERVER_NAME]?.args,
      )
      && sameStringSet(nativeMcp.enabledTools, expectedTools)
      && sameStringSet(enabledTools, expectedTools)
      && mcpConnection?.status === 'connected'
      && Number.isInteger(mcpConnection.toolCount)
      && mcpConnection.toolCount === expectedTools.length
      && normalizedTools.every((name) => name !== null)
      && sameStringSet(normalizedTools, expectedTools);
    return {
      stdout: doctorResult.stdout,
      plugin,
      pluginOk,
      mcpOk,
      nativeMcp,
      mcpConnection,
      expected,
      actualRegistry: {
        file: actual.registryFile,
        bytes: actual.registryBytes.length,
        sha256: crypto.createHash('sha256').update(actual.registryBytes).digest('hex'),
      },
      actualPluginRoot: actual.pluginRoot,
      isolatedConsumer: { kimiHome: isolated.kimiHome },
    };
  } finally {
    const unchanged = fs.existsSync(actual.registryFile)
      && fs.readFileSync(actual.registryFile).equals(actual.registryBytes);
    removeTree(isolated.kimiHome);
    if (!unchanged) {
      const error = new Error(`Kimi doctor mutated the actual registry: ${actual.registryFile}`);
      error.code = 'ACTUAL_KIMI_REGISTRY_MUTATED';
      throw error;
    }
  }
}

function loadRegistry(file) {
  if (!fs.existsSync(file)) return { version: 1, plugins: [] };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse ${file}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || parsed.version !== 1 || !Array.isArray(parsed.plugins)) {
    throw new Error(`${file} is not a valid Kimi installed.json document`);
  }
  return parsed;
}

function kimiTextTransform(input, assetName = '') {
  let text = adaptInteractionGuidance(input, 'kimi');
  text = text.replaceAll('$CLAUDE_PLUGIN_ROOT', '$KIMI_PLUGIN_ROOT');
  text = text.replaceAll('~/.claude/skills', '~/.kimi-code/skills');
  text = text.replaceAll('~/.claude/hooks', '~/.kimi-code/hooks');
  text = text.replaceAll('~/.claude', '~/.kimi-code');
  text = text.replaceAll('~/.codex', '~/.kimi-code');
  text = text.replaceAll('~/.config/opencode', '~/.kimi-code');
  text = text.replaceAll('CLAUDE.md', 'AGENTS.md');
  text = text.replace(/@skills\/([a-z0-9-]+)\/SKILL\.md/g, '$KIMI_PLUGIN_ROOT/skills/$1/SKILL.md');

  if (assetName === 'codex-collab') {
    text = text.replaceAll('the current host', 'Kimi Code');
    text = text.replaceAll('current host', 'Kimi Code');
    text = text.replaceAll('Claude Code remains primary', 'Kimi Code remains primary');
    text = text.replaceAll('one Claude Code-owned conclusion', 'one Kimi Code-owned conclusion');
  }
  if (assetName === 'ultra-verify') {
    text = text.replaceAll('the current host', 'Kimi Code');
    text = text.replaceAll('current host', 'Kimi Code');
    text = text.replaceAll('Claude Code', 'Kimi Code');
    text = text.replaceAll('Claude', 'Kimi');
    text = text.replaceAll('claude-analysis.md', 'kimi-analysis.md');
  }
  if (assetName === 'cc-collab') {
    text = text.replaceAll('the current host', 'Kimi Code');
    text = text.replaceAll('current host', 'Kimi Code');
  }
  if (assetName === 'ultra-review') {
    text = text.replace(
      /(?:the current host's native|the host-native) bounded-worker\s+mechanism/g,
      'Kimi `AgentSwarm` for parallel reviewers or one foreground Kimi `Agent` for a single reviewer, using the worker prompt files under `$KIMI_PLUGIN_ROOT/agents/`',
    );
  }
  text = text.replace(
    /(^|[\s`("'])\/ultra-(?!builder-pro:)([a-z][a-z0-9-]*)/gm,
    '$1/ultra-builder-pro:ultra-$2',
  );
  text = text.replace(
    /(^|[\s`("'])\/clear(?=$|[\s`),.;:])/gm,
    '$1/new',
  );
  return text;
}

function transformSkill(buf, relPath, skillName) {
  const source = buf.toString('utf8');
  if (relPath.endsWith('.json')) {
    const transformed = kimiTextTransform(source, skillName);
    JSON.parse(transformed);
    return Buffer.from(transformed, 'utf8');
  }
  if (!relPath.endsWith('.md')) return buf;
  const { fm, body } = parseFm(source);
  if (!fm) return Buffer.from(kimiTextTransform(source, skillName), 'utf8');
  const policy = skillPolicy(skillName);
  const nativeFm = {
    name: String(fm.name || skillName),
    description: kimiTextTransform(fm.description || `${skillName} workflow`, skillName)
      .replace(/\s+/g, ' ')
      .trim(),
    ...(policy.userInvocable ? { disableModelInvocation: true } : {}),
  };
  return Buffer.from(serializeFm(nativeFm, kimiTextTransform(body, skillName)), 'utf8');
}

function transformAgent(buf, relPath) {
  if (!relPath.endsWith('.md')) return buf;
  const source = buf.toString('utf8');
  const { fm, body } = parseFm(source);
  const name = path.basename(relPath, '.md');
  if (!fm) return Buffer.from(kimiTextTransform(source, name), 'utf8');
  return Buffer.from(serializeFm({
    name: String(fm.name || name),
    description: kimiTextTransform(fm.description || `${name} worker`, name)
      .replace(/\s+/g, ' ')
      .trim(),
  }, kimiTextTransform(body, name)), 'utf8');
}

function copySkills(repoRoot, pluginRoot) {
  const installed = [];
  for (const name of skillsForRuntime('kimi')) {
    const source = path.join(repoRoot, 'skills', name);
    if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
      throw new Error(`missing allowlisted Kimi skill: ${name}`);
    }
    copyTree(source, path.join(pluginRoot, 'skills', name), {
      transform: (buf, relPath) => transformSkill(buf, relPath, name),
    });
    installed.push(name);
  }
  return installed;
}

function commandDescription(repoRoot, name) {
  const source = path.join(repoRoot, 'commands', `${name}.md`);
  if (fs.existsSync(source)) {
    const { fm } = parseFm(fs.readFileSync(source, 'utf8'));
    if (fm && typeof fm.description === 'string' && fm.description.trim()) {
      return kimiTextTransform(fm.description, name).replace(/\s+/g, ' ').trim();
    }
  }
  return `Run the ${name} Ultra Builder Pro workflow.`;
}

function copyCommands(repoRoot, pluginRoot) {
  const root = path.join(pluginRoot, 'commands');
  ensureDir(root);
  for (const name of CORE_PUBLIC_SKILLS) {
    writeAtomic(path.join(root, `${name}.md`), `---
description: ${JSON.stringify(commandDescription(repoRoot, name))}
---

Use the registered \`${name}\` skill now and follow its complete workflow. Treat the current Kimi
Code session as the primary host; use native Kimi tools and the bundled Ultra MCP. Do not mutate
generated Ultra projections directly.

Arguments: $ARGUMENTS
`);
  }
  return CORE_PUBLIC_SKILLS.map((name) => `${name}.md`);
}

function copyAgents(repoRoot, pluginRoot) {
  return copyTree(path.join(repoRoot, 'agents'), path.join(pluginRoot, 'agents'), {
    transform: transformAgent,
  });
}

function hookCommand(feature, ...args) {
  return [
    'python3 ./hooks/adapters/kimi.py',
    JSON.stringify(feature),
    ...args.map((arg) => JSON.stringify(arg)),
  ].join(' ');
}

function buildHooksManifest() {
  return [
    { event: 'SessionStart', command: hookCommand('health_check.py'), timeout: 5 },
    { event: 'SessionStart', command: hookCommand('workflow_context.py'), timeout: 10 },
    { event: 'PreToolUse', matcher: 'Edit|Write', command: hookCommand('active_task_context.py'), timeout: 5 },
    { event: 'PreCompact', command: hookCommand('workflow_checkpoint.py'), timeout: 10 },
    { event: 'PostCompact', command: hookCommand('workflow_resume.py'), timeout: 10 },
    { event: 'Stop', command: hookCommand('pre_stop_check.py'), timeout: 5 },
    { event: 'SubagentStart', command: hookCommand('subagent_tracker.py', 'start'), timeout: 5 },
    { event: 'SubagentStop', command: hookCommand('subagent_tracker.py', 'stop'), timeout: 5 },
  ];
}

function copyHooks(repoRoot, pluginRoot) {
  const root = path.join(pluginRoot, 'hooks');
  ensureDir(root);
  for (const name of WORKFLOW_HOOK_FILES) {
    const source = path.join(repoRoot, 'hooks', name);
    if (!fs.existsSync(source)) throw new Error(`missing allowlisted Kimi hook: ${name}`);
    fs.copyFileSync(source, path.join(root, name));
  }
  ensureDir(path.join(root, 'adapters'));
  fs.copyFileSync(
    path.join(repoRoot, 'hooks', 'adapters', 'kimi.py'),
    path.join(root, 'adapters', 'kimi.py'),
  );
  return [...WORKFLOW_HOOK_FILES, path.join('adapters', 'kimi.py')];
}

function mcpManifest() {
  const enabledTools = [...PUBLIC_TOOLS];
  if (process.platform === 'win32') {
    return {
      transport: 'stdio',
      command: 'node.exe',
      args: ['./runtime/launch.cjs'],
      enabled: true,
      enabledTools,
    };
  }
  // Kimi's built-in `node` fallback uses the host binary's ABI. Ultra bundles
  // better-sqlite3 for the Node that runs `ubp`, so use PATH Node explicitly.
  return {
    transport: 'stdio',
    command: 'env',
    args: ['node', './runtime/launch.cjs'],
    enabled: true,
    enabledTools,
  };
}

function writeManifest(repoRoot, pluginRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const manifest = {
    name: PLUGIN_ID,
    version: pkg.version,
    description: 'Kimi-native Ultra Builder Pro workflows, lifecycle hooks, review workers, and project-local MCP state.',
    keywords: ['kimi-code', 'skills', 'hooks', 'mcp', 'ultra-builder-pro'],
    author: { name: typeof pkg.author === 'string' ? pkg.author : 'Ultra Builder Pro contributors' },
    homepage: pkg.homepage,
    license: pkg.license || 'MIT',
    skills: ['./skills'],
    mcpServers: { [MCP_SERVER_NAME]: mcpManifest() },
    hooks: buildHooksManifest(),
    commands: ['./commands'],
    interface: {
      displayName: 'Ultra Builder Pro',
      shortDescription: 'Kimi-native engineering workflows and verification gates.',
      longDescription: 'Ultra workflows, continuous-change state, review worker templates, lifecycle recovery hooks, and a project-local MCP server adapted to Kimi Code.',
      developerName: typeof pkg.author === 'string' ? pkg.author : 'Ultra Builder Pro contributors',
      websiteURL: pkg.homepage,
    },
    skillInstructions: 'Kimi Code remains primary. Use Ultra MCP for durable state, TodoList for session coordination, and Agent or AgentSwarm with bundled prompt templates for bounded workers.',
  };
  writeAtomic(path.join(pluginRoot, 'kimi.plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function buildStaging(repoRoot, staging) {
  const copied = {
    commands: copyCommands(repoRoot, staging),
    skills: copySkills(repoRoot, staging),
    agents: copyAgents(repoRoot, staging),
    hooks: copyHooks(repoRoot, staging),
  };
  buildMcpRuntime(repoRoot, staging, { runtime: 'kimi' });
  writeManifest(repoRoot, staging);
  if (fs.existsSync(path.join(repoRoot, 'LICENSE'))) {
    fs.copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(staging, 'LICENSE'));
  }
  markManaged(staging, { adapter: 'kimi', plugin: PLUGIN_ID });
  return copied;
}

function upsertRegistry(registry, target, repoRoot) {
  const existing = registry.plugins.find((entry) => entry && entry.id === PLUGIN_ID);
  if (existing && path.resolve(existing.root || '') !== path.resolve(target)) {
    throw new Error(`refusing to replace conflicting Kimi registration: ${existing.root}`);
  }
  const now = new Date().toISOString();
  const record = {
    id: PLUGIN_ID,
    root: target,
    source: 'local-path',
    enabled: existing?.enabled ?? true,
    installedAt: existing?.installedAt || now,
    updatedAt: now,
    originalSource: repoRoot,
    ...(existing?.capabilities ? { capabilities: existing.capabilities } : {}),
  };
  return {
    version: 1,
    plugins: [...registry.plugins.filter((entry) => !entry || entry.id !== PLUGIN_ID), record],
  };
}

function writePluginProvenance(repoRoot, target) {
  const source = provenance.packageSource(repoRoot);
  const file = path.join(target, PROVENANCE_FILE);
  const manifest = provenance.writeProvenance({
    file,
    adapter: 'kimi',
    ...source,
    roots: { plugin: target },
    assets: provenance.assetRefsForTree('plugin', target, {
      exclude: ['.ubp-managed', PROVENANCE_FILE],
    }),
    contracts: {
      plugin_manifest: { root: 'plugin', path: 'kimi.plugin.json' },
      mcp_launcher: { root: 'plugin', path: path.join('runtime', 'launch.cjs') },
      native_runtime: { root: 'plugin', path: path.join('runtime', 'native-runtime.json') },
      context_envelope_helper: { root: 'plugin', path: path.join('runtime', 'hook-context.cjs') },
      hook_event_helper: { root: 'plugin', path: path.join('runtime', 'hook-event.cjs') },
      hook_adapter: { root: 'plugin', path: path.join('hooks', 'adapters', 'kimi.py') },
    },
  });
  return { file, manifest };
}

function install(ctx = {}) {
  const target = resolvePluginRoot(ctx);
  const registryFile = resolveRegistryFile(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const registry = loadRegistry(registryFile);
  const existingRecord = registry.plugins.find((entry) => entry && entry.id === PLUGIN_ID);
  if (existingRecord && path.resolve(existingRecord.root || '') !== path.resolve(target)) {
    throw new Error(`refusing to replace conflicting Kimi registration: ${existingRecord.root}`);
  }
  if (fs.existsSync(target) && !isManaged(target)) {
    throw new Error(`refusing to replace unmanaged Kimi plugin: ${target}`);
  }

  const managedDir = path.dirname(target);
  ensureDir(managedDir);
  const staging = fs.mkdtempSync(path.join(managedDir, `${PLUGIN_ID}-`));
  const backup = `${staging}-previous`;
  let movedPrevious = false;
  let published = false;
  try {
    const copied = buildStaging(repoRoot, staging);
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      movedPrevious = true;
    }
    fs.renameSync(staging, target);
    published = true;
    const provenanceReport = writePluginProvenance(repoRoot, target);
    writeAtomic(registryFile, `${JSON.stringify(upsertRegistry(registry, target, repoRoot), null, 2)}\n`);
    if (movedPrevious) removeTree(backup);
    return {
      target,
      registry: registryFile,
      copied,
      provenance: provenanceReport,
      reload_required: true,
    };
  } catch (error) {
    if (published && fs.existsSync(target)) removeTree(target);
    else if (fs.existsSync(staging)) removeTree(staging);
    if (movedPrevious && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  }
}

function addIssue(report, code, details = {}) {
  report.issues.push({ code, ...details });
}

function doctor(ctx = {}) {
  const target = resolvePluginRoot(ctx);
  const registryFile = resolveRegistryFile(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const source = provenance.packageSource(repoRoot);
  const report = provenance.inspectProvenance({
    file: path.join(target, PROVENANCE_FILE),
    expectedAdapter: 'kimi',
    expectedPackageVersion: source.packageInfo.version,
  });

  let registrationOk = false;
  try {
    const registry = loadRegistry(registryFile);
    const record = registry.plugins.find((entry) => entry && entry.id === PLUGIN_ID);
    registrationOk = !!record
      && path.resolve(record.root || '') === path.resolve(target)
      && record.source === 'local-path'
      && record.enabled === true;
  } catch (error) {
    addIssue(report, 'PLUGIN_REGISTRATION_INVALID', { path: registryFile, message: error.message });
  }
  if (!registrationOk && !report.issues.some((issue) => issue.code === 'PLUGIN_REGISTRATION_INVALID')) {
    addIssue(report, 'PLUGIN_REGISTRATION_INVALID', { path: registryFile, expected_root: target });
  }

  let manifestOk = false;
  let mcpOk = false;
  let hooksOk = false;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'kimi.plugin.json'), 'utf8'));
    manifestOk = manifest.name === PLUGIN_ID
      && Array.isArray(manifest.skills)
      && manifest.skills.includes('./skills')
      && Array.isArray(manifest.commands)
      && manifest.commands.includes('./commands')
      && manifest.sessionStart === undefined;
    const mcp = manifest.mcpServers?.[MCP_SERVER_NAME];
    const expected = mcpManifest();
    mcpOk = !!mcp
      && mcp.transport === expected.transport
      && mcp.command === expected.command
      && JSON.stringify(mcp.args) === JSON.stringify(expected.args)
      && mcp.enabled === true;
    hooksOk = Array.isArray(manifest.hooks)
      && buildHooksManifest().every((expectedHook) => manifest.hooks.some((hook) => (
        hook.event === expectedHook.event
        && hook.command === expectedHook.command
        && hook.matcher === expectedHook.matcher
      )));
  } catch (error) {
    addIssue(report, 'PLUGIN_MANIFEST_INVALID', {
      path: path.join(target, 'kimi.plugin.json'), message: error.message,
    });
  }
  if (!manifestOk && !report.issues.some((issue) => issue.code === 'PLUGIN_MANIFEST_INVALID')) {
    addIssue(report, 'PLUGIN_MANIFEST_INVALID', { path: path.join(target, 'kimi.plugin.json') });
  }
  if (!mcpOk) addIssue(report, 'MCP_REGISTRATION_INVALID', { path: path.join(target, 'kimi.plugin.json') });
  if (!hooksOk) addIssue(report, 'HOOK_REGISTRATION_INVALID', { path: path.join(target, 'kimi.plugin.json') });

  report.checks.registration = { status: registrationOk ? 'pass' : 'fail' };
  report.checks.plugin_manifest = { status: manifestOk ? 'pass' : 'fail' };
  report.checks.mcp_registration = { status: mcpOk ? 'pass' : 'fail' };
  report.checks.hook_registration = { status: hooksOk ? 'pass' : 'fail' };
  if (shouldRunHostCli(ctx)) {
    let actual = null;
    try {
      actual = inspectActualKimiRegistration(ctx);
    } catch (error) {
      addIssue(report, 'ACTUAL_REGISTRY_INVALID', {
        path: registryFile,
        message: error.message,
      });
    }
    const actualRegistryOk = !!actual?.registryOk;
    const actualPluginRootOk = actualRegistryOk && actual.pluginRootOk;
    report.checks.actual_registry = { status: actualRegistryOk ? 'pass' : 'fail' };
    report.checks.actual_plugin_root = { status: actualPluginRootOk ? 'pass' : 'fail' };
    if (!actualRegistryOk) {
      addIssue(report, 'ACTUAL_REGISTRY_INVALID', {
        path: registryFile,
        expected_root: target,
      });
    }
    if (!actualPluginRootOk) {
      addIssue(report, 'ACTUAL_PLUGIN_ROOT_INVALID', { path: target });
    }
    if (!actualRegistryOk || !actualPluginRootOk) {
      report.checks.isolated_consumer_cli = { status: 'fail' };
      report.checks.isolated_consumer_plugin = { status: 'fail' };
      report.checks.isolated_consumer_mcp = { status: 'fail' };
      return applyNativeDoctor(report, path.join(target, 'runtime'));
    }
    try {
      const host = inspectKimiHost(ctx);
      report.checks.isolated_consumer_cli = { status: 'pass' };
      report.checks.isolated_consumer_plugin = { status: host.pluginOk ? 'pass' : 'fail' };
      report.checks.isolated_consumer_mcp = { status: host.mcpOk ? 'pass' : 'fail' };
      if (!host.pluginOk) {
        addIssue(report, 'HOST_PLUGIN_NOT_DISCOVERED', { plugin_id: PLUGIN_ID });
      }
      if (!host.mcpOk) {
        addIssue(report, 'HOST_MCP_NOT_DISCOVERED', {
          plugin_id: PLUGIN_ID,
          server: MCP_SERVER_NAME,
        });
      }
    } catch (error) {
      report.checks.isolated_consumer_cli = { status: 'fail' };
      report.checks.isolated_consumer_plugin = { status: 'fail' };
      report.checks.isolated_consumer_mcp = { status: 'fail' };
      addIssue(
        report,
        error.code === 'HOST_CLI_TIMEOUT' ? 'HOST_CLI_TIMEOUT' : 'HOST_CLI_DOCTOR_FAILED',
        { message: error.message },
      );
    }
  }
  return applyNativeDoctor(report, path.join(target, 'runtime'));
}

function uninstall(ctx = {}) {
  const target = resolvePluginRoot(ctx);
  const registryFile = resolveRegistryFile(ctx);
  const registryExisted = fs.existsSync(registryFile);
  const registryBytes = registryExisted ? fs.readFileSync(registryFile) : null;
  const registry = loadRegistry(registryFile);
  const record = registry.plugins.find((entry) => entry && entry.id === PLUGIN_ID);
  if (record && path.resolve(record.root || '') !== path.resolve(target)) {
    throw new Error(`refusing to remove conflicting Kimi registration: ${record.root}`);
  }
  if (fs.existsSync(target) && !isManaged(target)) {
    throw new Error(`refusing to remove unmanaged Kimi plugin: ${target}`);
  }

  const report = { target, registry: registryFile, removed: {} };
  const backup = path.join(
    path.dirname(target),
    `.${PLUGIN_ID}.uninstall-backup-${crypto.randomUUID()}`,
  );
  let pluginMoved = false;
  let registryPublicationAttempted = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      pluginMoved = true;
    }
    if (record) {
      const expectedBytes = Buffer.from(`${JSON.stringify({
        version: 1,
        plugins: registry.plugins.filter((entry) => !entry || entry.id !== PLUGIN_ID),
      }, null, 2)}\n`);
      registryPublicationAttempted = true;
      writeAtomic(registryFile, expectedBytes);
      const readback = fs.readFileSync(registryFile);
      if (!readback.equals(expectedBytes)) {
        throw new Error(`Kimi registry readback mismatch after uninstall: ${registryFile}`);
      }
      const verified = loadRegistry(registryFile);
      if (verified.plugins.some((entry) => entry && entry.id === PLUGIN_ID)) {
        throw new Error(`Kimi registry still contains ${PLUGIN_ID} after uninstall`);
      }
      report.removed.registration = true;
    }
    if (pluginMoved) {
      removeTree(backup);
      report.removed.plugin = true;
    }
    return report;
  } catch (error) {
    const rollbackErrors = [];
    if (registryPublicationAttempted) {
      try {
        if (registryExisted) {
          writeAtomic(registryFile, registryBytes);
        } else if (fs.existsSync(registryFile)) {
          fs.unlinkSync(registryFile);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (pluginMoved && fs.existsSync(backup)) {
      try {
        if (fs.existsSync(target)) removeTree(target);
        fs.renameSync(backup, target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        'Kimi uninstall and rollback both failed',
      );
    }
    throw error;
  }
}

module.exports = {
  name: 'kimi',
  PLUGIN_ID,
  MCP_SERVER_NAME,
  buildHooksManifest,
  inspectKimiHost,
  kimiTextTransform,
  resolveTarget,
  resolvePluginRoot,
  resolveRegistryFile,
  install,
  doctor,
  uninstall,
};
