'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const kimi = require('../kimi.js');
const { parse: parseFm } = require('../_shared/frontmatter.cjs');
const { PUBLIC_TOOLS } = require('../../mcp-server/lib/ultra-facade.cjs');
const {
  CORE_PUBLIC_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillPolicy,
  skillsForRuntime,
} = require('../_shared/runtime-assets.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLUGIN_ID = 'ultra-builder-pro';

function mkTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-kimi-'));
}

function writeFakeKimi(
  home,
  {
    doctorExitCode = 0,
    plugins = [],
    mcpServers = {},
    mcpConnections = [],
    mcpTools = [],
    eventFile = '',
    hangCleanup = false,
    pidFile = '',
    consumerHomeFile = '',
  } = {},
) {
  const file = path.join(home, 'fake-kimi.cjs');
  const expectedRegistry = fs.readFileSync(path.join(home, 'plugins', 'installed.json'));
  const expectedPluginRoot = path.join(home, 'plugins', 'managed', PLUGIN_ID);
  fs.writeFileSync(file, `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const args = process.argv.slice(2);
const actualHome = ${JSON.stringify(home)};
const expectedRegistry = Buffer.from(${JSON.stringify(expectedRegistry.toString('base64'))}, 'base64');
const expectedPluginRoot = ${JSON.stringify(expectedPluginRoot)};
const eventFile = ${JSON.stringify(eventFile)};
const consumerHome = path.resolve(process.env.KIMI_CODE_HOME || '');
if (!consumerHome || consumerHome === path.resolve(actualHome)) {
  process.stderr.write('Kimi probe did not isolate KIMI_CODE_HOME');
  process.exit(9);
}
const consumerRegistry = path.join(consumerHome, 'plugins', 'installed.json');
if (!fs.existsSync(consumerRegistry)
    || !fs.readFileSync(consumerRegistry).equals(expectedRegistry)) {
  process.stderr.write('Kimi probe did not use a byte-for-byte registry clone');
  process.exit(10);
}
const registry = JSON.parse(fs.readFileSync(consumerRegistry, 'utf8'));
const installed = registry.plugins.find((entry) => entry && entry.id === ${JSON.stringify(PLUGIN_ID)});
if (!installed || path.resolve(installed.root || '') !== path.resolve(expectedPluginRoot)) {
  process.stderr.write('Kimi probe synthesized a different plugin registry entry');
  process.exit(11);
}
if (args.join(' ') === 'doctor') {
  if (${JSON.stringify(doctorExitCode)} !== 0) {
    process.stderr.write('simulated Kimi doctor failure');
  }
  process.exit(${JSON.stringify(doctorExitCode)});
}
if (args[0] === 'web') {
  if (${JSON.stringify(pidFile)}) fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
  if (${JSON.stringify(consumerHomeFile)}) {
    fs.writeFileSync(${JSON.stringify(consumerHomeFile)}, consumerHome);
  }
  if (${JSON.stringify(hangCleanup)}) {
    process.on('SIGTERM', () => {
      if (eventFile) fs.appendFileSync(eventFile, JSON.stringify({ action: 'sigterm' }) + '\\n');
    });
  }
  const port = Number(args[args.indexOf('--port') + 1]);
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/v1/debug/channels') {
      response.end(JSON.stringify({ code: 0, data: {} }));
      return;
    }
    if (request.url === '/api/v1/debug/pluginService/listPlugins') {
      response.end(JSON.stringify({ code: 0, data: ${JSON.stringify(plugins)} }));
      return;
    }
    if (request.url === '/api/v1/debug/pluginService/enabledMcpServers') {
      response.end(JSON.stringify({ code: 0, data: ${JSON.stringify(mcpServers)} }));
      return;
    }
    if (request.url === '/api/v1/sessions' && request.method === 'POST') {
      if (eventFile) fs.appendFileSync(eventFile, JSON.stringify({
        action: 'create',
        sessionId: 'session-probe',
      }) + '\\n');
      response.end(JSON.stringify({ code: 0, data: { id: 'session-probe' } }));
      return;
    }
    if (request.url.endsWith('/agentMcpService/waitForInitialLoad')) {
      response.end(JSON.stringify({ code: 0, data: null }));
      return;
    }
    if (request.url.endsWith('/agentMcpService/list')) {
      response.end(JSON.stringify({ code: 0, data: ${JSON.stringify(mcpConnections)} }));
      return;
    }
    if (request.url.startsWith('/api/v1/tools?session_id=')) {
      response.end(JSON.stringify({ code: 0, data: { tools: ${JSON.stringify(mcpTools)} } }));
      return;
    }
    if (request.url === '/api/v1/sessions/session-probe:archive' && request.method === 'POST') {
      if (eventFile) fs.appendFileSync(eventFile, JSON.stringify({
        action: 'archive',
        sessionId: 'session-probe',
      }) + '\\n');
      if (${JSON.stringify(hangCleanup)}) return;
      response.end(JSON.stringify({ code: 0, data: { archived: true } }));
      return;
    }
    if (request.url === '/api/v1/shutdown' && request.method === 'POST') {
      if (${JSON.stringify(hangCleanup)}) {
        if (eventFile) fs.appendFileSync(eventFile, JSON.stringify({ action: 'shutdown' }) + '\\n');
        return;
      }
      response.end(JSON.stringify({ code: 0 }));
      server.close(() => process.exit(0));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: 404 }));
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write('Local: http://127.0.0.1:' + server.address().port + '/#token=fake-kimi-token\\n');
    process.stdout.write('Token: fake-kimi-token\\n');
  });
  return;
}
process.stderr.write('unexpected fake Kimi invocation: ' + args.join(' '));
process.exit(2);
`);
  fs.chmodSync(file, 0o755);
  return file;
}

function writeSlowKimi(home) {
  const file = path.join(home, 'slow-kimi.cjs');
  fs.writeFileSync(file, `#!/usr/bin/env node
process.on('SIGTERM', () => {});
setTimeout(() => process.exit(0), 750);
`);
  fs.chmodSync(file, 0o755);
  return file;
}

function writeStubbornKimi(home) {
  const file = path.join(home, 'stubborn-kimi.cjs');
  const pidFile = path.join(home, 'stubborn-kimi.pid');
  fs.writeFileSync(file, `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.join(' ') === 'doctor') process.exit(0);
if (args[0] === 'web') {
  fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
}
`);
  fs.chmodSync(file, 0o755);
  return { file, pidFile };
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function stableHash8(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.codePointAt(index);
    hash = Math.trunc(Math.imul(hash, 16777619));
  }
  return hash.toString(16).padStart(8, '0');
}

function qualifiedKimiToolName(name) {
  const full = `mcp__plugin-ultra-builder-pro_ultra-builder-pro__${name.replace('.', '_')}`;
  if (full.length <= 64) return full;
  const hash = stableHash8(full);
  return `${full.slice(0, 64 - hash.length - 1)}_${hash}`;
}

function sessionMcpTools(names = PUBLIC_TOOLS) {
  return names.map((name) => ({
    name: qualifiedKimiToolName(name),
    description: `descriptor for ${name}`,
    source: 'mcp',
    active: true,
    mcp_server_id: 'plugin-ultra-builder-pro_ultra-builder-pro',
  }));
}

function layout(home) {
  return {
    pluginRoot: path.join(home, 'plugins', 'managed', PLUGIN_ID),
    registryFile: path.join(home, 'plugins', 'installed.json'),
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('install builds and registers one Kimi-native plugin without changing config.toml', () => {
  const home = mkTarget();
  const { pluginRoot, registryFile } = layout(home);
  const configFile = path.join(home, 'config.toml');
  const userConfig = '[[hooks]]\nevent = "Stop"\ncommand = "/user/hook.sh"\n';
  try {
    fs.writeFileSync(configFile, userConfig);
    const report = kimi.install({ configDir: home, repoRoot: REPO_ROOT });

    assert.equal(report.target, pluginRoot);
    assert.equal(fs.readFileSync(configFile, 'utf8'), userConfig);
    assert.ok(fs.existsSync(path.join(pluginRoot, '.ubp-managed')));
    assert.ok(fs.existsSync(path.join(pluginRoot, 'provenance.json')));
    assert.ok(fs.existsSync(path.join(
      pluginRoot,
      'runtime',
      'session-close-journal-worker.cjs',
    )));
    assert.ok(fs.existsSync(path.join(
      pluginRoot,
      'runtime',
      'doctor-backup-worker.cjs',
    )));
    assert.ok(fs.existsSync(path.join(
      pluginRoot,
      'runtime',
      'archive-mutation-worker.py',
    )));

    const registry = readJson(registryFile);
    assert.equal(registry.version, 1);
    assert.equal(registry.plugins.length, 1);
    assert.deepEqual(registry.plugins[0], {
      id: PLUGIN_ID,
      root: pluginRoot,
      source: 'local-path',
      enabled: true,
      installedAt: registry.plugins[0].installedAt,
      updatedAt: registry.plugins[0].updatedAt,
      originalSource: REPO_ROOT,
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Kimi manifest exposes explicit native skills, commands, hooks, and MCP without session bootstrap', () => {
  const home = mkTarget();
  const { pluginRoot } = layout(home);
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const manifest = readJson(path.join(pluginRoot, 'kimi.plugin.json'));

    assert.equal(manifest.name, PLUGIN_ID);
    assert.deepEqual(manifest.skills, ['./skills']);
    assert.deepEqual(manifest.commands, ['./commands']);
    assert.equal(manifest.sessionStart, undefined);
    assert.equal(manifest.agents, undefined, 'Kimi 0.26/0.27 has no custom-agent manifest field');
    assert.deepEqual(manifest.mcpServers[PLUGIN_ID], {
      transport: 'stdio',
      command: process.platform === 'win32' ? 'node.exe' : 'env',
      args: process.platform === 'win32'
        ? ['./runtime/launch.cjs']
        : ['node', './runtime/launch.cjs'],
      enabled: true,
      enabledTools: [...PUBLIC_TOOLS],
    });

    const hookText = JSON.stringify(manifest.hooks);
    assert.match(hookText, /hooks\/adapters\/kimi\.py/);
    for (const hook of WORKFLOW_HOOK_FILES.filter(
      (value) => !['context_envelope.py', 'runtime_paths.py'].includes(value),
    )) {
      assert.match(hookText, new RegExp(hook.replace('.', '\\.')));
    }
    assert.ok(fs.existsSync(path.join(pluginRoot, 'hooks', 'context_envelope.py')));
    assert.doesNotMatch(hookText, /memory|recall|journal|prompt[_ -]?capture|block_dangerous|post_edit_guard/i);
    const launched = spawnSync(
      'python3',
      [
        path.join(pluginRoot, 'hooks', 'adapters', 'kimi.py'),
        'health_check.py',
      ],
      {
        cwd: home,
        input: JSON.stringify({ cwd: home, hook_event_name: 'SessionStart' }),
        encoding: 'utf8',
      },
    );
    assert.equal(launched.status, 0, launched.stderr);
    assert.deepEqual(JSON.parse(launched.stdout), {});
    const interaction = readJson(path.join(pluginRoot, 'spec', 'interaction-contract.json'));
    assert.equal(interaction.interaction.question_surface.primary, 'AskUserQuestion');
    assert.equal(interaction.interaction.question_surface.availability, 'interactive_non_auto_mode');
    const interactionBoundary = fs.readFileSync(
      path.join(pluginRoot, 'skills', 'ultra-think', 'references', 'interaction-boundary.md'),
      'utf8',
    );
    assert.match(interactionBoundary, /AskUserQuestion/);
    assert.doesNotMatch(interactionBoundary, /host-native structured question surface declared/);

    const commands = fs.readdirSync(path.join(pluginRoot, 'commands')).sort();
    assert.deepEqual(commands, CORE_PUBLIC_SKILLS.map((name) => `${name}.md`).sort());
    const commandText = fs.readFileSync(path.join(pluginRoot, 'commands', 'ultra-init.md'), 'utf8');
    assert.match(commandText, /Use the registered `ultra-init` skill/);
    assert.match(commandText, /\$ARGUMENTS/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Kimi assets are allowlisted, explicit-only, and adapted to native tools and paths', () => {
  const home = mkTarget();
  const { pluginRoot } = layout(home);
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });

    const skills = fs.readdirSync(path.join(pluginRoot, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()
        && fs.existsSync(path.join(pluginRoot, 'skills', entry.name, 'SKILL.md')))
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(skills, skillsForRuntime('kimi').sort());

    const review = fs.readFileSync(path.join(pluginRoot, 'skills', 'ultra-review', 'SKILL.md'), 'utf8');
    const init = fs.readFileSync(path.join(pluginRoot, 'skills', 'ultra-init', 'SKILL.md'), 'utf8');
    assert.match(review, /Kimi `AgentSwarm`/);
    assert.match(review, /\$KIMI_PLUGIN_ROOT\/agents\//);
    assert.match(review, /scripts\/review_wait\.py/);
    assert.match(review, /spec_fidelity/);
    assert.match(review, /engineering_standards/);
    assert.doesNotMatch(review, /background mode|run_in_background/);
    assert.match(init, /ultra\.record/);
    assert.doesNotMatch(init, /Claude Code|OpenCode|Codex/);
    assert.match(fs.readFileSync(path.join(pluginRoot, 'skills', 'codex-collab', 'SKILL.md'), 'utf8'), /--ephemeral/);
    for (const name of skillsForRuntime('kimi')) {
      const contents = fs.readFileSync(path.join(pluginRoot, 'skills', name, 'SKILL.md'), 'utf8');
      const { fm } = parseFm(contents);
      assert.equal(
        fm.disableModelInvocation,
        skillPolicy(name).userInvocable ? true : undefined,
        `${name} invocation ownership`,
      );
    }

    const allPromptAssets = [];
    for (const root of ['commands', 'skills', 'agents']) {
      const pending = [path.join(pluginRoot, root)];
      while (pending.length) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const file = path.join(current, entry.name);
          if (entry.isDirectory()) pending.push(file);
          else if (entry.isFile() && /\.(?:md|json)$/.test(entry.name)) allPromptAssets.push(file);
        }
      }
    }
    const foreign = /~\/.claude|~\/.codex|~\/.config\/opencode|CLAUDE\.md|TaskCreate|TaskUpdate|TaskList|run_in_background:\s*true|\$CLAUDE_PLUGIN_ROOT|Kimi `Shell`/;
    for (const file of allPromptAssets) {
      const text = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(text, foreign, file);
      assert.doesNotMatch(text, /(^|[\s`("'])\/ultra-(?!builder-pro:)[a-z]/m, file);
      assert.doesNotMatch(text, /[\u3400-\u9fff]|ultra-review-findings-v1|Context7|Exa MCP|graphify|confidence\s*>=?\s*\d+/iu, file);
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('reinstall preserves unrelated records and existing Kimi capability choices', () => {
  const home = mkTarget();
  const { registryFile } = layout(home);
  try {
    fs.mkdirSync(path.dirname(registryFile), { recursive: true });
    fs.writeFileSync(registryFile, JSON.stringify({
      version: 1,
      plugins: [{
        id: 'mine', root: '/tmp/mine', source: 'local-path', enabled: true,
        installedAt: '2026-01-01T00:00:00.000Z', originalSource: '/tmp/mine',
      }],
    }, null, 2));

    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const first = readJson(registryFile);
    const ultra = first.plugins.find((entry) => entry.id === PLUGIN_ID);
    ultra.enabled = false;
    ultra.capabilities = { mcpServers: { [PLUGIN_ID]: { enabled: false } } };
    fs.writeFileSync(registryFile, JSON.stringify(first, null, 2));

    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const second = readJson(registryFile);
    assert.deepEqual(second.plugins.map((entry) => entry.id).sort(), ['mine', PLUGIN_ID]);
    const refreshed = second.plugins.find((entry) => entry.id === PLUGIN_ID);
    assert.equal(refreshed.installedAt, ultra.installedAt);
    assert.equal(refreshed.enabled, false);
    assert.deepEqual(refreshed.capabilities, ultra.capabilities);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('uninstall removes only the owned Kimi plugin record and managed root', () => {
  const home = mkTarget();
  const { pluginRoot, registryFile } = layout(home);
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const registry = readJson(registryFile);
    registry.plugins.unshift({
      id: 'mine', root: '/tmp/mine', source: 'local-path', enabled: true,
      installedAt: '2026-01-01T00:00:00.000Z', originalSource: '/tmp/mine',
    });
    fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2));

    kimi.uninstall({ configDir: home });
    assert.equal(fs.existsSync(pluginRoot), false);
    assert.deepEqual(readJson(registryFile).plugins.map((entry) => entry.id), ['mine']);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('uninstall rolls back the plugin tree and exact registry bytes when registry publication fails', () => {
  const home = mkTarget();
  const { pluginRoot, registryFile } = layout(home);
  const originalRename = fs.renameSync;
  let injected = false;
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const pluginBefore = fs.readFileSync(path.join(pluginRoot, 'kimi.plugin.json'));
    const registryBefore = fs.readFileSync(registryFile);
    fs.renameSync = (source, target) => {
      if (!injected
          && target === registryFile
          && source.startsWith(`${registryFile}.tmp-`)) {
        injected = true;
        throw new Error('injected registry publication failure');
      }
      return originalRename(source, target);
    };

    assert.throws(
      () => kimi.uninstall({ configDir: home }),
      /injected registry publication failure/,
    );
    assert.equal(injected, true);
    assert.deepEqual(fs.readFileSync(registryFile), registryBefore);
    assert.deepEqual(fs.readFileSync(path.join(pluginRoot, 'kimi.plugin.json')), pluginBefore);
    assert.equal(
      fs.readdirSync(path.dirname(pluginRoot))
        .some((name) => name.includes('.uninstall-backup-')),
      false,
      'failed uninstall must not leave a backup residue',
    );
  } finally {
    fs.renameSync = originalRename;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('install and uninstall refuse to replace or remove an unmanaged Kimi root', () => {
  const home = mkTarget();
  const { pluginRoot, registryFile } = layout(home);
  try {
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, 'user.txt'), 'keep');
    assert.throws(
      () => kimi.install({ configDir: home, repoRoot: REPO_ROOT }),
      /unmanaged Kimi plugin/,
    );

    fs.mkdirSync(path.dirname(registryFile), { recursive: true });
    fs.writeFileSync(registryFile, JSON.stringify({
      version: 1,
      plugins: [{
        id: PLUGIN_ID, root: pluginRoot, source: 'local-path', enabled: true,
        installedAt: '2026-01-01T00:00:00.000Z', originalSource: '/tmp/foreign',
      }],
    }));
    assert.throws(() => kimi.uninstall({ configDir: home }), /unmanaged Kimi plugin/);
    assert.equal(fs.readFileSync(path.join(pluginRoot, 'user.txt'), 'utf8'), 'keep');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('doctor validates registration and provenance without mutating the Kimi home', () => {
  const home = mkTarget();
  const { registryFile } = layout(home);
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const before = fs.readFileSync(registryFile);
    const healthy = kimi.doctor({ configDir: home, repoRoot: REPO_ROOT });
    assert.equal(healthy.status, 'healthy', JSON.stringify(healthy, null, 2));
    assert.deepEqual(fs.readFileSync(registryFile), before);

    const registry = readJson(registryFile);
    registry.plugins[0].enabled = false;
    fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2));
    const degraded = kimi.doctor({ configDir: home, repoRoot: REPO_ROOT });
    assert.equal(degraded.status, 'degraded');
    assert.ok(degraded.issues.some((issue) => issue.code === 'PLUGIN_REGISTRATION_INVALID'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('doctor reports whether Kimi natively discovers the enabled plugin and MCP server', () => {
  const home = mkTarget();
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const degraded = kimi.doctor({
      configDir: home,
      repoRoot: REPO_ROOT,
      runHostCli: true,
      kimiBin: writeFakeKimi(home),
    });
    assert.equal(degraded.status, 'degraded');
    assert.equal(degraded.checks.actual_registry.status, 'pass');
    assert.equal(degraded.checks.actual_plugin_root.status, 'pass');
    assert.equal(degraded.checks.isolated_consumer_cli.status, 'pass');
    assert.equal(degraded.checks.isolated_consumer_plugin.status, 'fail');
    assert.equal(degraded.checks.isolated_consumer_mcp.status, 'fail');
    assert.ok(degraded.issues.some((issue) => issue.code === 'HOST_PLUGIN_NOT_DISCOVERED'));
    assert.ok(degraded.issues.some((issue) => issue.code === 'HOST_MCP_NOT_DISCOVERED'));

    const manifest = readJson(path.join(layout(home).pluginRoot, 'kimi.plugin.json'));
    const fakePlugin = {
      id: PLUGIN_ID,
      version: manifest.version,
      enabled: true,
      state: 'ok',
      skillCount: skillsForRuntime('kimi').length,
      mcpServerCount: Object.keys(manifest.mcpServers).length,
      enabledMcpServerCount: Object.keys(manifest.mcpServers).length,
      hookCount: manifest.hooks.length,
      commandCount: CORE_PUBLIC_SKILLS.length,
      hasErrors: false,
    };
    const configOnly = kimi.doctor({
      configDir: home,
      repoRoot: REPO_ROOT,
      runHostCli: true,
      kimiBin: writeFakeKimi(home, {
        plugins: [fakePlugin],
        mcpServers: {
          'plugin-ultra-builder-pro:ultra-builder-pro': {
            ...manifest.mcpServers[PLUGIN_ID],
            cwd: layout(home).pluginRoot,
          },
        },
      }),
    });
    assert.equal(configOnly.status, 'degraded', JSON.stringify(configOnly, null, 2));
    assert.equal(configOnly.checks.isolated_consumer_cli.status, 'pass');
    assert.equal(configOnly.checks.isolated_consumer_plugin.status, 'pass');
    assert.equal(configOnly.checks.isolated_consumer_mcp.status, 'fail');

    const hostMcp = {
      mcpServers: {
        'plugin-ultra-builder-pro:ultra-builder-pro': {
          ...manifest.mcpServers[PLUGIN_ID],
          cwd: layout(home).pluginRoot,
        },
      },
      mcpConnections: [{
        name: 'plugin-ultra-builder-pro:ultra-builder-pro',
        status: 'connected',
        toolCount: PUBLIC_TOOLS.length,
      }],
    };
    const doctorWithTools = (mcpTools, eventFile = '') => kimi.doctor({
      configDir: home,
      repoRoot: REPO_ROOT,
      runHostCli: true,
      kimiBin: writeFakeKimi(home, {
        plugins: [fakePlugin],
        ...hostMcp,
        mcpTools,
        eventFile,
      }),
    });

    const partialContract = doctorWithTools(sessionMcpTools(PUBLIC_TOOLS.slice(0, -1)));
    assert.equal(partialContract.status, 'degraded', JSON.stringify(partialContract, null, 2));
    assert.equal(partialContract.checks.isolated_consumer_mcp.status, 'fail');

    const wrongNames = doctorWithTools(sessionMcpTools([
      ...PUBLIC_TOOLS.slice(0, -1),
      'ultra.wrong',
    ]));
    assert.equal(wrongNames.checks.isolated_consumer_mcp.status, 'fail');

    const duplicateNames = doctorWithTools(sessionMcpTools([
      ...PUBLIC_TOOLS.slice(0, -1),
      PUBLIC_TOOLS[0],
    ]));
    assert.equal(duplicateNames.checks.isolated_consumer_mcp.status, 'fail');

    const extraNames = doctorWithTools(sessionMcpTools([...PUBLIC_TOOLS, 'ultra.extra']));
    assert.equal(extraNames.checks.isolated_consumer_mcp.status, 'fail');

    const eventFile = path.join(home, 'probe-events.jsonl');
    const registryBefore = fs.readFileSync(layout(home).registryFile);
    const healthy = doctorWithTools(sessionMcpTools([...PUBLIC_TOOLS].reverse()), eventFile);
    assert.equal(healthy.status, 'healthy', JSON.stringify(healthy, null, 2));
    assert.equal(healthy.checks.actual_registry.status, 'pass');
    assert.equal(healthy.checks.actual_plugin_root.status, 'pass');
    assert.equal(healthy.checks.isolated_consumer_mcp.status, 'pass');
    assert.deepEqual(fs.readFileSync(layout(home).registryFile), registryBefore);
    assert.deepEqual(
      fs.readFileSync(eventFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)),
      [
        { action: 'create', sessionId: 'session-probe' },
        { action: 'archive', sessionId: 'session-probe' },
      ],
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('doctor refuses an invalid actual registry before starting an isolated consumer', () => {
  const home = mkTarget();
  const invocationFile = path.join(home, 'consumer-invoked');
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const registryFile = layout(home).registryFile;
    const registry = readJson(registryFile);
    registry.plugins[0].root = path.join(home, 'different-root');
    fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2) + '\n');
    const fake = path.join(home, 'must-not-run.cjs');
    fs.writeFileSync(fake, `#!/usr/bin/env node
require('node:fs').writeFileSync(${JSON.stringify(invocationFile)}, 'invoked');
process.exit(0);
`);
    fs.chmodSync(fake, 0o755);

    const report = kimi.doctor({
      configDir: home,
      repoRoot: REPO_ROOT,
      runHostCli: true,
      kimiBin: fake,
    });
    assert.equal(report.checks.actual_registry.status, 'fail');
    assert.equal(report.checks.actual_plugin_root.status, 'fail');
    assert.equal(report.checks.isolated_consumer_cli.status, 'fail');
    assert.equal(fs.existsSync(invocationFile), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('doctor completes bounded cleanup after a session exists even when HTTP hangs and Kimi ignores SIGTERM', () => {
  const home = mkTarget();
  const eventFile = path.join(home, 'hung-cleanup-events.jsonl');
  const pidFile = path.join(home, 'hung-cleanup.pid');
  const consumerHomeFile = path.join(home, 'consumer-home.txt');
  let childPid = null;
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const manifest = readJson(path.join(layout(home).pluginRoot, 'kimi.plugin.json'));
    const plugin = {
      id: PLUGIN_ID,
      version: manifest.version,
      enabled: true,
      state: 'ok',
      skillCount: skillsForRuntime('kimi').length,
      mcpServerCount: 1,
      enabledMcpServerCount: 1,
      hookCount: manifest.hooks.length,
      commandCount: CORE_PUBLIC_SKILLS.length,
      hasErrors: false,
    };
    const nativeName = 'plugin-ultra-builder-pro:ultra-builder-pro';
    const fake = writeFakeKimi(home, {
      plugins: [plugin],
      mcpServers: {
        [nativeName]: {
          ...manifest.mcpServers[PLUGIN_ID],
          cwd: layout(home).pluginRoot,
        },
      },
      mcpConnections: [{
        name: nativeName,
        status: 'connected',
        toolCount: PUBLIC_TOOLS.length,
      }],
      mcpTools: sessionMcpTools(),
      eventFile,
      hangCleanup: true,
      pidFile,
      consumerHomeFile,
    });
    const startedAt = Date.now();
    const report = kimi.doctor({
      configDir: home,
      repoRoot: REPO_ROOT,
      runHostCli: true,
      hostCliTimeoutMs: 1000,
      kimiBin: fake,
    });
    assert.ok(Date.now() - startedAt < 3500, 'cleanup must remain bounded');
    assert.ok(report.issues.some((issue) => issue.code === 'HOST_CLI_TIMEOUT'));
    assert.ok(fs.existsSync(pidFile), JSON.stringify(report, null, 2));
    childPid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.equal(processIsAlive(childPid), false, 'SIGTERM-ignoring Kimi child must be reaped');
    const consumerHome = fs.readFileSync(consumerHomeFile, 'utf8');
    assert.notEqual(path.resolve(consumerHome), path.resolve(home));
    assert.equal(fs.existsSync(consumerHome), false, 'isolated registry clone must be removed');
    const actions = fs.readFileSync(eventFile, 'utf8').trim().split('\n')
      .map((line) => JSON.parse(line).action);
    assert.ok(actions.includes('create'), 'probe must establish a session before cleanup');
    assert.ok(actions.includes('archive'), 'cleanup must attempt archive');
    assert.ok(actions.includes('shutdown'), 'cleanup must attempt shutdown after archive timeout');
    assert.ok(actions.includes('sigterm'), 'cleanup must attempt SIGTERM before SIGKILL');
  } finally {
    if (Number.isInteger(childPid) && processIsAlive(childPid)) {
      process.kill(childPid, 'SIGKILL');
    }
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('doctor kills a Kimi probe child that ignores SIGTERM after timeout', () => {
  const home = mkTarget();
  let stubbornPid = null;
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const stubborn = writeStubbornKimi(home);
    const report = kimi.doctor({
      configDir: home,
      repoRoot: REPO_ROOT,
      runHostCli: true,
      hostCliTimeoutMs: 1000,
      kimiBin: stubborn.file,
    });
    assert.ok(report.issues.some((issue) => issue.code === 'HOST_CLI_TIMEOUT'));
    stubbornPid = Number(fs.readFileSync(stubborn.pidFile, 'utf8'));
    assert.equal(processIsAlive(stubbornPid), false, 'timed-out Kimi web child must be reaped');
  } finally {
    if (Number.isInteger(stubbornPid) && processIsAlive(stubbornPid)) {
      process.kill(stubbornPid, 'SIGKILL');
    }
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('doctor bounds Kimi host inspection and reports a typed timeout', () => {
  const home = mkTarget();
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const stubbornBin = writeSlowKimi(home);
    const startedAt = Date.now();
    assert.throws(
      () => kimi.inspectKimiHost({
        configDir: home,
        repoRoot: REPO_ROOT,
        hostCliTimeoutMs: 50,
        kimiBin: stubbornBin,
      }),
      (error) => error.code === 'HOST_CLI_TIMEOUT',
    );
    assert.ok(Date.now() - startedAt < 400, 'Kimi doctor timeout must SIGKILL a stubborn child');
    const report = kimi.doctor({
      configDir: home,
      repoRoot: REPO_ROOT,
      runHostCli: true,
      hostCliTimeoutMs: 50,
      kimiBin: stubbornBin,
    });
    assert.ok(report.issues.some((issue) => issue.code === 'HOST_CLI_TIMEOUT'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
