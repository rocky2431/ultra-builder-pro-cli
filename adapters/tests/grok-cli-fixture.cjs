'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SCRIPT = `#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const home = process.env.GROK_HOME;
if (!home) {
  process.stderr.write('GROK_HOME is required by the fake Grok CLI\\n');
  process.exit(2);
}

fs.mkdirSync(home, { recursive: true });
const stateFile = path.join(home, 'fake-grok-state.json');
const callsFile = path.join(home, 'fake-grok-calls.jsonl');
const modeFile = path.join(home, 'fake-grok-mode');
const argv = process.argv.slice(2);
fs.appendFileSync(callsFile, JSON.stringify(argv) + '\\n');

function readState() {
  if (!fs.existsSync(stateFile)) return { installed: null, enabled: false };
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

function writeState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\\n');
}

function mode() {
  return fs.existsSync(modeFile) ? fs.readFileSync(modeFile, 'utf8').trim() : '';
}

function hasMode(name) {
  return mode().split(',').filter(Boolean).includes(name);
}

function bumpCounter(name) {
  const file = path.join(home, 'fake-grok-' + name + '-count');
  const current = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0;
  const next = current + 1;
  fs.writeFileSync(file, String(next));
  return next;
}

function activationRollbackFailureStarted() {
  return (
    hasMode('activation-fail-rollback-fail')
    && fs.existsSync(path.join(home, 'fake-grok-plugin-install-count'))
  );
}

function fail(message, status = 1) {
  process.stderr.write(message + '\\n');
  process.exit(status);
}

function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\\n');
}

function pluginEntry(state) {
  if (!state.installed) return null;
  return {
    status: 'installed',
    name: 'ultra-builder-pro',
    repo_key: 'ultra-builder-pro-testkey',
    version: state.installed.version,
    path: state.installed.path,
    source: state.installed.source,
    marketplace: null,
  };
}

if (argv.length === 1 && argv[0] === '--version') {
  process.stdout.write('grok fixture current\\n');
  process.exit(0);
}

if (argv.at(-1) === '--help') {
  const key = argv.slice(0, -1).join(' ');
  const help = {
    'plugin install': 'Usage: grok plugin install [OPTIONS] <SOURCE>\\n  --trust',
    'plugin list': 'Usage: grok plugin list [OPTIONS]\\n  --json',
    'plugin details': 'Usage: grok plugin details <NAME>',
    'plugin enable': 'Usage: grok plugin enable <NAME>',
    'plugin uninstall': 'Usage: grok plugin uninstall <NAME>\\n  --confirm\\n  --keep-data',
    'inspect': 'Usage: grok inspect [OPTIONS]\\n  --json',
    'mcp doctor': 'Usage: grok mcp doctor [OPTIONS] [NAME]\\n  --json',
  }[key];
  if (!help) fail('unsupported help command: ' + key);
  process.stdout.write(help + '\\n');
  process.exit(0);
}

if (argv[0] === 'plugin' && argv[1] === 'validate') {
  const root = path.resolve(argv[2]);
  if (!fs.existsSync(path.join(root, 'plugin.json'))) fail('plugin.json missing');
  process.stdout.write('Plugin manifest is valid\\n');
  process.exit(0);
}

if (argv[0] === 'plugin' && argv[1] === 'install') {
  if (hasMode('install-fail')) fail('simulated native install failure');
  if (
    hasMode('uninstall-readback-fail-restore-fail')
    && fs.existsSync(path.join(home, 'fake-grok-uninstall-completed'))
  ) {
    fail('simulated uninstall rollback install failure');
  }
  if (
    hasMode('activation-fail-rollback-fail')
    && bumpCounter('plugin-install') > 1
  ) {
    fail('simulated rollback install failure');
  }
  const source = path.resolve(argv[2]);
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'plugin.json'), 'utf8'));
  const storeName = hasMode('alternate-store')
    ? 'native-plugin-store-v2'
    : 'installed-plugins';
  const installedRoot = path.join(home, storeName, 'ultra-builder-pro-testkey');
  fs.rmSync(installedRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(installedRoot), { recursive: true });
  fs.cpSync(source, installedRoot, { recursive: true });
  writeState({
    installed: {
      source,
      path: installedRoot,
      version: manifest.version,
    },
    enabled: mode() !== 'installed-disabled',
  });
  process.stdout.write('Installed 1 plugin(s): ultra-builder-pro\\n');
  process.exit(0);
}

if (argv[0] === 'plugin' && argv[1] === 'list') {
  if (hasMode('validate-only')) {
    printJson([]);
    process.exit(0);
  }
  const uninstallReadbackMarker = path.join(home, 'fake-grok-uninstall-completed');
  const uninstallReadbackConsumed = path.join(home, 'fake-grok-uninstall-readback-consumed');
  if (
    (hasMode('uninstall-readback-fail-once')
      || hasMode('uninstall-readback-fail-restore-fail'))
    && fs.existsSync(uninstallReadbackMarker)
    && !fs.existsSync(uninstallReadbackConsumed)
  ) {
    fs.writeFileSync(uninstallReadbackConsumed, '1');
    fail('simulated uninstall registry read-back failure');
  }
  const entry = pluginEntry(readState());
  printJson(entry ? [entry] : []);
  process.exit(0);
}

if (argv[0] === 'plugin' && argv[1] === 'details') {
  const entry = pluginEntry(readState());
  if (!entry) fail('plugin not found');
  process.stdout.write('ultra-builder-pro-testkey\\n  ultra-builder-pro v' + entry.version + '\\n');
  process.exit(0);
}

if (argv[0] === 'plugin' && argv[1] === 'enable') {
  const state = readState();
  if (!state.installed) fail('plugin not found');
  state.enabled = true;
  writeState(state);
  process.stdout.write('Enabled ultra-builder-pro\\n');
  process.exit(0);
}

if (argv[0] === 'plugin' && argv[1] === 'uninstall') {
  const state = readState();
  if (!state.installed) fail('plugin not found');
  if (
    hasMode('require-durable-roots-staged')
    || hasMode('uninstall-fail-after-staging')
  ) {
    const legacy = path.join(home, 'plugins', 'ultra-builder-pro');
    if (fs.existsSync(state.installed.source) || fs.existsSync(legacy)) {
      fail('durable Grok roots were not staged before native uninstall');
    }
    if (hasMode('uninstall-fail-after-staging')) {
      fail('simulated native uninstall failure after staging');
    }
  }
  if (hasMode('uninstall-sticky')) {
    process.stdout.write('Uninstalled ultra-builder-pro\\n');
    process.exit(0);
  }
  fs.rmSync(state.installed.path, { recursive: true, force: true });
  writeState({ installed: null, enabled: false });
  fs.writeFileSync(path.join(home, 'fake-grok-uninstall-completed'), '1');
  process.stdout.write('Uninstalled ultra-builder-pro\\n');
  process.exit(0);
}

if (argv[0] === 'inspect' && argv.includes('--json')) {
  const state = readState();
  const oneShotMarker = path.join(home, 'fake-grok-activation-failure-consumed');
  const failOnce = hasMode('activation-fail-once') && !fs.existsSync(oneShotMarker);
  if (failOnce) fs.writeFileSync(oneShotMarker, '1');
  const active = Boolean(
    state.installed
    && state.enabled
    && !hasMode('inactive')
    && !activationRollbackFailureStarted()
    && !failOnce
  );
  const inspectedPath = hasMode('inspect-shadow')
    ? path.join(home, 'project-shadow', 'ultra-builder-pro')
    : state.installed?.path;
  if (hasMode('inspect-shadow')) fs.mkdirSync(inspectedPath, { recursive: true });
  printJson({
    plugins: state.installed ? [{
      name: 'ultra-builder-pro',
      scope: 'user',
      path: inspectedPath,
      enabled: Boolean(state.enabled),
      provides: { skills: 18, agents: 10, hooks: true, mcpServers: 1 },
    }] : [],
    mcpServers: active ? [{
      name: 'ultra-builder-pro',
      transport: 'stdio',
      target: '/usr/bin/env',
      source: {
        type: 'plugin',
        plugin_name: 'ultra-builder-pro',
        path: inspectedPath,
      },
    }] : [],
  });
  process.exit(0);
}

if (argv[0] === 'mcp' && argv[1] === 'doctor' && argv.includes('--json')) {
  const state = readState();
  const active = Boolean(
    state.installed
    && state.enabled
    && !hasMode('inactive')
    && !activationRollbackFailureStarted()
  );
  printJson({
    sources: active ? [{
      path: 'plugin: ultra-builder-pro',
      status: { status: 'found', server_count: 1 },
    }] : [],
    servers: active ? [{
      name: 'ultra-builder-pro',
      transport: 'stdio',
      source: 'plugin: ultra-builder-pro',
      checks: [
        { label: 'handshake OK', passed: !hasMode('doctor-fail') },
        { label: '7 tools discovered', passed: !hasMode('doctor-fail') },
      ],
      healthy: !hasMode('doctor-fail'),
    }] : [],
    healthy_count: active && !hasMode('doctor-fail') ? 1 : 0,
    failing_count: active && hasMode('doctor-fail') ? 1 : 0,
  });
  process.exit(0);
}

fail('unsupported fake Grok invocation: ' + argv.join(' '));
`;

function createFakeGrok(root) {
  const binary = path.join(root, process.platform === 'win32' ? 'grok.cmd' : 'grok');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(binary, SCRIPT);
  if (process.platform !== 'win32') fs.chmodSync(binary, 0o755);
  return binary;
}

function setFakeMode(grokHome, mode) {
  fs.mkdirSync(grokHome, { recursive: true });
  fs.writeFileSync(path.join(grokHome, 'fake-grok-mode'), `${mode}\n`);
  for (const name of [
    'fake-grok-plugin-install-count',
    'fake-grok-activation-failure-consumed',
    'fake-grok-uninstall-completed',
    'fake-grok-uninstall-readback-consumed',
  ]) {
    fs.rmSync(path.join(grokHome, name), { force: true });
  }
}

function readFakeCalls(grokHome) {
  const file = path.join(grokHome, 'fake-grok-calls.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

module.exports = {
  createFakeGrok,
  readFakeCalls,
  setFakeMode,
};
