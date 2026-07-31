'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const grok = require('../grok.js');
const { skillsForRuntime } = require('../_shared/runtime-assets.cjs');
const {
  createFakeGrok,
  readFakeCalls,
  setFakeMode,
} = require('./grok-cli-fixture.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function fixture() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-grok-'));
  const binaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-fake-grok-'));
  return {
    configDir,
    binaryRoot,
    grokBin: createFakeGrok(binaryRoot),
    pluginRoot: null,
  };
}

function cleanup(value) {
  fs.rmSync(value.configDir, { recursive: true, force: true });
  fs.rmSync(value.binaryRoot, { recursive: true, force: true });
}

function install(value) {
  const report = grok.install({
    configDir: value.configDir,
    repoRoot: REPO_ROOT,
    grokBin: value.grokBin,
    scope: 'global',
  });
  value.pluginRoot = report.target;
  return report;
}

function mcpHealthCalls(configDir) {
  return readFakeCalls(configDir).filter((args) => (
    args[0] === 'mcp'
    && args[1] === 'doctor'
    && !args.includes('--help')
  ));
}

function inspectCalls(configDir) {
  return readFakeCalls(configDir).filter((args) => (
    args[0] === 'inspect'
    && !args.includes('--help')
  ));
}

function pluginDetailsCalls(configDir) {
  return readFakeCalls(configDir).filter((args) => (
    args[0] === 'plugin'
    && args[1] === 'details'
    && !args.includes('--help')
  ));
}

function writeFakeActivationConfig(configDir, enabled) {
  fs.writeFileSync(
    path.join(configDir, 'config.toml'),
    [
      '[plugins]',
      `enabled = ${JSON.stringify(enabled ? ['ultra-builder-pro'] : [])}`,
      `disabled = ${JSON.stringify(enabled ? [] : ['ultra-builder-pro'])}`,
      '',
    ].join('\n'),
  );
}

function addActivationRegistrySupport(value) {
  const delegate = value.grokBin;
  const wrapper = path.join(
    value.binaryRoot,
    process.platform === 'win32' ? 'grok-disable.cmd' : 'grok-disable',
  );
  fs.writeFileSync(wrapper, `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const argv = process.argv.slice(2);
const home = process.env.GROK_HOME;
if (
  argv[0] === 'plugin'
  && (argv[1] === 'enable' || argv[1] === 'disable')
  && !argv.includes('--help')
) {
  fs.appendFileSync(path.join(home, 'fake-grok-calls.jsonl'), JSON.stringify(argv) + '\\n');
  const stateFile = path.join(home, 'fake-grok-state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (!state.installed) {
    process.stderr.write('plugin not found\\n');
    process.exit(1);
  }
  state.enabled = argv[1] === 'enable';
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\\n');
  fs.writeFileSync(
    path.join(home, 'config.toml'),
    '[plugins]\\n'
      + 'enabled = ' + JSON.stringify(state.enabled ? ['ultra-builder-pro'] : []) + '\\n'
      + 'disabled = ' + JSON.stringify(state.enabled ? [] : ['ultra-builder-pro']) + '\\n',
  );
  process.stdout.write((state.enabled ? 'Enabled' : 'Disabled') + ' ultra-builder-pro\\n');
  process.exit(0);
}
const result = spawnSync(${JSON.stringify(delegate)}, argv, {
  env: process.env,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
`);
  if (process.platform !== 'win32') fs.chmodSync(wrapper, 0o755);
  value.grokBin = wrapper;
}

test('Grok install emits one native plugin with all owned assets', () => {
  const value = fixture();
  try {
    const report = install(value);
    assert.equal(report.target, value.pluginRoot);
    assert.equal(report.validation.status, 'pass');
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'plugin.json')));
    assert.ok(fs.existsSync(path.join(value.pluginRoot, '.mcp.json')));
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'hooks', 'hooks.json')));
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'hooks', 'adapters', 'grok.py')));
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'runtime', 'native-runtime.json')));
    assert.ok(fs.existsSync(path.join(
      value.pluginRoot,
      'runtime',
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node',
    )));
    const skills = fs.readdirSync(path.join(value.pluginRoot, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(skills, skillsForRuntime('grok').sort());
    assert.equal(
      fs.readdirSync(path.join(value.pluginRoot, 'commands')).length,
      11,
    );
    assert.equal(
      fs.readdirSync(path.join(value.pluginRoot, 'agents')).filter((name) => name.endsWith('.md')).length,
      10,
    );
  } finally {
    cleanup(value);
  }
});

test('Grok manifest uses only native component discovery and seven-tool MCP', () => {
  const value = fixture();
  try {
    install(value);
    const manifest = JSON.parse(fs.readFileSync(path.join(value.pluginRoot, 'plugin.json'), 'utf8'));
    assert.equal(manifest.name, 'ultra-builder-pro');
    assert.equal(typeof manifest.author.name, 'string');
    assert.equal(typeof manifest.repository, 'string');
    const mcp = JSON.parse(fs.readFileSync(path.join(value.pluginRoot, '.mcp.json'), 'utf8'))
      .mcpServers['ultra-builder-pro'];
    assert.equal(mcp.type, 'stdio');
    assert.equal(mcp.command, process.platform === 'win32' ? 'node.exe' : '/usr/bin/env');
    assert.deepEqual(
      mcp.args,
      process.platform === 'win32'
        ? ['${GROK_PLUGIN_ROOT}/runtime/launch.cjs']
        : ['node', '${GROK_PLUGIN_ROOT}/runtime/launch.cjs'],
    );
    const spec = fs.readFileSync(path.join(value.pluginRoot, 'spec', 'mcp-tools.yaml'), 'utf8');
    assert.equal((spec.match(/^\s+- name: ultra\./gm) || []).length, 7);
  } finally {
    cleanup(value);
  }
});

test('Grok hooks are observational except exact managed-file protection', () => {
  const value = fixture();
  try {
    install(value);
    const hooks = JSON.parse(fs.readFileSync(
      path.join(value.pluginRoot, 'hooks', 'hooks.json'),
      'utf8',
    ));
    assert.deepEqual(Object.keys(hooks.hooks).sort(), [
      'PreCompact', 'PreToolUse', 'SessionStart', 'Stop', 'SubagentStart', 'SubagentStop',
    ].sort());
    assert.doesNotMatch(JSON.stringify(hooks), /workflow_context|workflow_resume/);
    const adapter = path.join(value.pluginRoot, 'hooks', 'adapters', 'grok.py');
    const result = spawnSync('python3', [adapter, 'pre_stop_check.py'], {
      cwd: value.configDir,
      input: JSON.stringify({
        hookEventName: 'Stop',
        reason: 'end_turn',
        cwd: value.configDir,
      }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
  } finally {
    cleanup(value);
  }
});

test('Grok reinstall is deterministic and uninstall is ownership-scoped', () => {
  const value = fixture();
  try {
    install(value);
    const first = fs.readFileSync(path.join(value.pluginRoot, 'plugin.json'));
    install(value);
    assert.deepEqual(fs.readFileSync(path.join(value.pluginRoot, 'plugin.json')), first);
    grok.uninstall({
      configDir: value.configDir,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(fs.existsSync(value.pluginRoot), false);
    assert.equal(fs.existsSync(value.configDir), true);
  } finally {
    cleanup(value);
  }
});

test('Grok global install is registered through the native plugin lifecycle', () => {
  const value = fixture();
  try {
    const report = grok.install({
      configDir: value.configDir,
      repoRoot: REPO_ROOT,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.match(
      report.target,
      new RegExp(`${path.sep}installed-plugins${path.sep}ultra-builder-pro-testkey$`),
    );
    assert.equal(report.native_registry.status, 'pass');
    assert.equal(report.native_consumer.status, 'pass');
    const mcp = JSON.parse(fs.readFileSync(path.join(report.target, '.mcp.json'), 'utf8'))
      .mcpServers['ultra-builder-pro'];
    assert.deepEqual(
      mcp.args,
      process.platform === 'win32'
        ? ['${GROK_PLUGIN_ROOT}/runtime/launch.cjs']
        : ['node', '${GROK_PLUGIN_ROOT}/runtime/launch.cjs'],
    );
    const calls = readFakeCalls(value.configDir);
    assert.ok(calls.some((args) => args[0] === 'plugin' && args[1] === 'install'));
    assert.ok(calls.some((args) => args[0] === 'plugin' && args[1] === 'list'));
    assert.ok(calls.some((args) => args[0] === 'inspect' && args.includes('--json')));
    assert.ok(calls.some((args) => args[0] === 'mcp' && args[1] === 'doctor'));
    assert.equal(
      calls.some((args) => args[0] === 'mcp' && args[1] === 'list'),
      false,
      'plugin MCP must not be duplicated into user MCP config merely to populate mcp list',
    );
  } finally {
    cleanup(value);
  }
});

test('Grok trusts a fully bound native registration outside the current store layout', () => {
  const value = fixture();
  try {
    setFakeMode(value.configDir, 'alternate-store');
    const first = install(value);
    const expectedTarget = fs.realpathSync(path.join(
      value.configDir,
      'native-plugin-store-v2',
      'ultra-builder-pro-testkey',
    ));
    const expectedSource = grok.resolveSourceRoot({
      configDir: value.configDir,
      scope: 'global',
    });
    assert.equal(first.target, expectedTarget);
    assert.equal(fs.existsSync(path.join(first.target, '.ubp-managed')), true);

    const targetProvenance = JSON.parse(fs.readFileSync(
      path.join(first.target, 'provenance.json'),
      'utf8',
    ));
    const sourceProvenance = JSON.parse(fs.readFileSync(
      path.join(expectedSource, 'provenance.json'),
      'utf8',
    ));
    assert.equal(path.resolve(targetProvenance.roots.plugin), first.target);
    assert.equal(path.resolve(sourceProvenance.roots.plugin), expectedSource);
    assert.equal(targetProvenance.package.version, sourceProvenance.package.version);

    const state = JSON.parse(fs.readFileSync(
      path.join(value.configDir, 'fake-grok-state.json'),
      'utf8',
    ));
    assert.equal(fs.realpathSync(state.installed.path), first.target);
    assert.equal(path.resolve(state.installed.source), expectedSource);
    assert.equal(state.installed.version, targetProvenance.package.version);

    const doctor = grok.doctor({
      configDir: value.configDir,
      repoRoot: REPO_ROOT,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(doctor.status, 'healthy', JSON.stringify(doctor, null, 2));
    assert.equal(doctor.checks.native_registry.status, 'pass');
    assert.equal(doctor.checks.native_consumer.status, 'pass');

    const reinstalled = install(value);
    assert.equal(reinstalled.target, expectedTarget);
    const removed = grok.uninstall({
      configDir: value.configDir,
      repoRoot: REPO_ROOT,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(removed.removed.native_plugin, true);
    assert.equal(fs.existsSync(expectedTarget), false);
  } finally {
    cleanup(value);
  }
});

test('Grok doctor rejects a validate-only raw plugin false positive', () => {
  const value = fixture();
  try {
    const rawRoot = path.join(value.configDir, 'plugins', 'ultra-builder-pro');
    fs.mkdirSync(rawRoot, { recursive: true });
    fs.writeFileSync(path.join(rawRoot, 'plugin.json'), JSON.stringify({
      name: 'ultra-builder-pro',
      version: '0.0.0-test',
    }));
    setFakeMode(value.configDir, 'validate-only');
    const report = grok.doctor({
      configDir: value.configDir,
      repoRoot: REPO_ROOT,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(report.status, 'degraded');
    assert.ok(report.issues.some((issue) => issue.code === 'GROK_PLUGIN_NOT_REGISTERED'));
  } finally {
    cleanup(value);
  }
});

test('Grok install migrates an owned raw user plugin into native registration with backup', () => {
  const value = fixture();
  const rawRoot = path.join(value.configDir, 'plugins', 'ultra-builder-pro');
  try {
    fs.mkdirSync(rawRoot, { recursive: true });
    fs.writeFileSync(path.join(rawRoot, '.ubp-managed'), '{"source":"ubp"}\n');
    fs.writeFileSync(path.join(rawRoot, 'legacy.txt'), 'legacy plugin bytes\n');
    const report = install(value);
    assert.equal(fs.existsSync(rawRoot), false);
    assert.equal(report.migration.legacy_source_removed, true);
    assert.equal(
      fs.readFileSync(path.join(report.migration.legacy_backup, 'legacy.txt'), 'utf8'),
      'legacy plugin bytes\n',
    );
    const doctor = grok.doctor({
      configDir: value.configDir,
      repoRoot: REPO_ROOT,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(doctor.status, 'healthy', JSON.stringify(doctor, null, 2));
  } finally {
    cleanup(value);
  }
});

test('Grok native install failure restores the raw plugin and leaves no false registration', () => {
  const value = fixture();
  const rawRoot = path.join(value.configDir, 'plugins', 'ultra-builder-pro');
  try {
    fs.mkdirSync(rawRoot, { recursive: true });
    fs.writeFileSync(path.join(rawRoot, '.ubp-managed'), '{"source":"ubp"}\n');
    fs.writeFileSync(path.join(rawRoot, 'legacy.txt'), 'restore me exactly\n');
    setFakeMode(value.configDir, 'install-fail');
    assert.throws(
      () => install(value),
      /simulated native install failure/,
    );
    assert.equal(
      fs.readFileSync(path.join(rawRoot, 'legacy.txt'), 'utf8'),
      'restore me exactly\n',
    );
    assert.equal(
      fs.existsSync(path.join(
        value.configDir,
        'installed-plugins',
        'ultra-builder-pro-testkey',
      )),
      false,
    );
    assert.equal(fs.existsSync(grok.resolveSourceRoot({
      configDir: value.configDir,
      scope: 'global',
    })), false);
  } finally {
    cleanup(value);
  }
});

test('Grok adapter capability detection is version-independent', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'adapters', 'grok.js'), 'utf8');
  assert.doesNotMatch(source, /0\.2\.114|0\.21114/);
  const value = fixture();
  try {
    const capability = grok.probeNativeCapabilities({
      configDir: value.configDir,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(capability.status, 'pass');
    assert.equal(capability.version, 'grok fixture current');
    assert.equal(capability.capabilities.plugin_install, true);
    assert.equal(capability.capabilities.mcp_doctor, true);
  } finally {
    cleanup(value);
  }
});

test('Grok install fails closed without the CLI and preserves existing source and registry', () => {
  const value = fixture();
  const missingBinary = path.join(value.configDir, 'missing-grok');
  try {
    install(value);
    const sourceRoot = grok.resolveSourceRoot({
      configDir: value.configDir,
      scope: 'global',
    });
    const marker = path.join(sourceRoot, 'existing-source-marker.txt');
    fs.writeFileSync(marker, 'preserve existing source\n');

    assert.throws(
      () => grok.install({
        configDir: value.configDir,
        repoRoot: REPO_ROOT,
        grokBin: missingBinary,
        scope: 'global',
      }),
      (error) => error.code === 'GROK_CLI_UNAVAILABLE',
    );
    assert.equal(fs.readFileSync(marker, 'utf8'), 'preserve existing source\n');
    assert.equal(readFakeCalls(value.configDir).filter(
      (args) => (
        args[0] === 'plugin'
        && args[1] === 'uninstall'
        && !args.includes('--help')
      ),
    ).length, 0);
    const doctor = grok.doctor({
      configDir: value.configDir,
      repoRoot: REPO_ROOT,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(doctor.status, 'healthy', JSON.stringify(doctor, null, 2));
  } finally {
    cleanup(value);
  }
});

test('Grok uninstall fails closed without the CLI and removes nothing', () => {
  const value = fixture();
  const missingBinary = path.join(value.configDir, 'missing-grok');
  try {
    install(value);
    const sourceRoot = grok.resolveSourceRoot({
      configDir: value.configDir,
      scope: 'global',
    });
    assert.throws(
      () => grok.uninstall({
        configDir: value.configDir,
        grokBin: missingBinary,
        scope: 'global',
      }),
      (error) => error.code === 'GROK_CLI_UNAVAILABLE',
    );
    assert.equal(fs.existsSync(sourceRoot), true);
    const doctor = grok.doctor({
      configDir: value.configDir,
      repoRoot: REPO_ROOT,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(doctor.status, 'healthy', JSON.stringify(doctor, null, 2));
  } finally {
    cleanup(value);
  }
});

test('Grok uninstall removes disabled, inactive, and broken native consumers', () => {
  const cases = [
    {
      name: 'disabled',
      breakConsumer(value) {
        const stateFile = path.join(value.configDir, 'fake-grok-state.json');
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        state.enabled = false;
        fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
      },
    },
    {
      name: 'inactive',
      breakConsumer(value) {
        setFakeMode(value.configDir, 'inactive');
      },
    },
    {
      name: 'broken',
      breakConsumer(value) {
        setFakeMode(value.configDir, 'doctor-fail');
      },
    },
  ];

  for (const entry of cases) {
    const value = fixture();
    try {
      install(value);
      entry.breakConsumer(value);
      const sourceRoot = grok.resolveSourceRoot({
        configDir: value.configDir,
        scope: 'global',
      });
      const degraded = grok.doctor({
        configDir: value.configDir,
        repoRoot: REPO_ROOT,
        grokBin: value.grokBin,
        scope: 'global',
      });
      assert.equal(degraded.status, 'degraded', entry.name);
      assert.equal(degraded.checks.native_consumer.status, 'fail', entry.name);
      const healthCallsBefore = mcpHealthCalls(value.configDir).length;

      const removed = grok.uninstall({
        configDir: value.configDir,
        repoRoot: REPO_ROOT,
        grokBin: value.grokBin,
        scope: 'global',
      });

      assert.equal(removed.removed.native_plugin, true, entry.name);
      assert.equal(fs.existsSync(value.pluginRoot), false, entry.name);
      assert.equal(fs.existsSync(sourceRoot), false, entry.name);
      assert.equal(
        mcpHealthCalls(value.configDir).length,
        healthCallsBefore,
        `${entry.name} uninstall must not probe native consumer health`,
      );
    } finally {
      cleanup(value);
    }
  }
});

test('Grok rollback failure preserves stable recovery material and reports both errors', () => {
  const value = fixture();
  try {
    install(value);
    const sourceRoot = grok.resolveSourceRoot({
      configDir: value.configDir,
      scope: 'global',
    });
    const marker = path.join(sourceRoot, 'old-source-marker.txt');
    fs.writeFileSync(marker, 'old source survives\n');
    setFakeMode(value.configDir, 'activation-fail-rollback-fail');

    assert.throws(
      () => install(value),
      (error) => (
        error.code === 'GROK_INSTALL_ROLLBACK_FAILED'
        && /did not activate/.test(error.message)
        && /simulated rollback install failure/.test(error.message)
      ),
    );
    assert.equal(fs.readFileSync(marker, 'utf8'), 'old source survives\n');
    const recoveryRoots = fs.readdirSync(
      path.join(value.configDir, '.ubp', 'backups'),
      { withFileTypes: true },
    ).filter((entry) => entry.isDirectory() && entry.name.startsWith('native-plugin-'));
    assert.equal(recoveryRoots.length, 1);
    assert.equal(fs.existsSync(path.join(
      value.configDir,
      '.ubp',
      'backups',
      recoveryRoots[0].name,
      'plugin.json',
    )), true);
  } finally {
    cleanup(value);
  }
});

test('Grok reinstall fails closed before mutation when the registered source is missing', () => {
  const value = fixture();
  try {
    install(value);
    const sourceRoot = grok.resolveSourceRoot({
      configDir: value.configDir,
      scope: 'global',
    });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    const stateFile = path.join(value.configDir, 'fake-grok-state.json');
    const stateBefore = fs.readFileSync(stateFile, 'utf8');
    const mutationCallsBefore = readFakeCalls(value.configDir).filter(
      (args) => (
        args[0] === 'plugin'
        && ['install', 'uninstall'].includes(args[1])
        && !args.includes('--help')
      ),
    ).length;
    assert.throws(
      () => install(value),
      (error) => (
        error.code === 'GROK_INSTALL_PREFLIGHT_FAILED'
        && error.details.cause_code === 'GROK_PLUGIN_SOURCE_MISSING'
      ),
    );
    assert.equal(fs.existsSync(sourceRoot), false);
    assert.equal(fs.readFileSync(stateFile, 'utf8'), stateBefore);
    assert.equal(readFakeCalls(value.configDir).filter(
      (args) => (
        args[0] === 'plugin'
        && ['install', 'uninstall'].includes(args[1])
        && !args.includes('--help')
      ),
    ).length, mutationCallsBefore);
    const doctor = grok.doctor({
      configDir: value.configDir,
      repoRoot: REPO_ROOT,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(doctor.status, 'degraded');
    assert.ok(doctor.issues.some((issue) => issue.code === 'GROK_PLUGIN_SOURCE_MISSING'));
  } finally {
    cleanup(value);
  }
});

test('Grok uninstall preflights target, source, and legacy ownership before native mutation', () => {
  const cases = [
    {
      name: 'managed target',
      corrupt(value) {
        fs.rmSync(path.join(value.pluginRoot, '.ubp-managed'));
        return value.pluginRoot;
      },
    },
    {
      name: 'persistent source',
      corrupt(value) {
        const source = grok.resolveSourceRoot({
          configDir: value.configDir,
          scope: 'global',
        });
        fs.rmSync(path.join(source, '.ubp-managed'));
        return source;
      },
    },
    {
      name: 'legacy raw plugin',
      corrupt(value) {
        const legacy = path.join(value.configDir, 'plugins', 'ultra-builder-pro');
        fs.mkdirSync(legacy, { recursive: true });
        fs.writeFileSync(path.join(legacy, 'unmanaged.txt'), 'owner data\n');
        return legacy;
      },
    },
  ];

  for (const entry of cases) {
    const value = fixture();
    try {
      install(value);
      const target = entry.corrupt(value);
      const priorUninstalls = readFakeCalls(value.configDir).filter(
        (args) => (
          args[0] === 'plugin'
          && args[1] === 'uninstall'
          && !args.includes('--help')
        ),
      ).length;
      assert.throws(
        () => grok.uninstall({
          configDir: value.configDir,
          grokBin: value.grokBin,
          scope: 'global',
        }),
        (error) => (
          error.code === 'GROK_UNINSTALL_OWNERSHIP_CONFLICT'
          && error.message.includes(entry.name)
        ),
      );
      assert.equal(fs.existsSync(target), true);
      assert.equal(readFakeCalls(value.configDir).filter(
        (args) => (
          args[0] === 'plugin'
          && args[1] === 'uninstall'
          && !args.includes('--help')
        ),
      ).length, priorUninstalls);
      assert.equal(JSON.parse(fs.readFileSync(
        path.join(value.configDir, 'fake-grok-state.json'),
        'utf8',
      )).installed !== null, true);
    } finally {
      cleanup(value);
    }
  }
});

test('Grok uninstall requires registry read-back before deleting durable sources', () => {
  const value = fixture();
  try {
    install(value);
    const sourceRoot = grok.resolveSourceRoot({
      configDir: value.configDir,
      scope: 'global',
    });
    setFakeMode(value.configDir, 'uninstall-sticky');
    assert.throws(
      () => grok.uninstall({
        configDir: value.configDir,
        grokBin: value.grokBin,
        scope: 'global',
      }),
      (error) => error.code === 'GROK_UNINSTALL_NOT_REMOVED',
    );
    assert.equal(fs.existsSync(sourceRoot), true);
    assert.equal(JSON.parse(fs.readFileSync(
      path.join(value.configDir, 'fake-grok-state.json'),
      'utf8',
    )).installed !== null, true);
  } finally {
    cleanup(value);
  }
});

test('Grok uninstall rollback validates registration ownership without consumer health', () => {
  const cases = [
    {
      mode: 'doctor-fail,uninstall-sticky',
      expected(error) {
        return error.code === 'GROK_UNINSTALL_NOT_REMOVED';
      },
    },
    {
      mode: 'doctor-fail,uninstall-readback-fail-once',
      expected(error) {
        return (
          error.code === 'GROK_CLI_COMMAND_FAILED'
          && /registry read-back failure/.test(error.message)
        );
      },
    },
  ];

  for (const entry of cases) {
    const value = fixture();
    try {
      install(value);
      const sourceRoot = grok.resolveSourceRoot({
        configDir: value.configDir,
        scope: 'global',
      });
      setFakeMode(value.configDir, entry.mode);
      const healthCallsBefore = mcpHealthCalls(value.configDir).length;

      assert.throws(
        () => grok.uninstall({
          configDir: value.configDir,
          repoRoot: REPO_ROOT,
          grokBin: value.grokBin,
          scope: 'global',
        }),
        entry.expected,
      );

      assert.equal(fs.existsSync(sourceRoot), true);
      assert.equal(JSON.parse(fs.readFileSync(
        path.join(value.configDir, 'fake-grok-state.json'),
        'utf8',
      )).installed !== null, true);
      assert.equal(
        mcpHealthCalls(value.configDir).length,
        healthCallsBefore,
        'rollback must not turn consumer health into an uninstall recovery gate',
      );
    } finally {
      cleanup(value);
    }
  }
});

test('Grok uninstall rollback preserves enabled and disabled activation exactly', () => {
  for (const expectedEnabled of [false, true]) {
    const value = fixture();
    try {
      addActivationRegistrySupport(value);
      install(value);
      const stateFile = path.join(value.configDir, 'fake-grok-state.json');
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      state.enabled = expectedEnabled;
      fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
      writeFakeActivationConfig(value.configDir, expectedEnabled);
      setFakeMode(value.configDir, 'uninstall-readback-fail-once');
      const callsBefore = readFakeCalls(value.configDir).length;
      const inspectCallsBefore = inspectCalls(value.configDir).length;
      const detailsCallsBefore = pluginDetailsCalls(value.configDir).length;
      const healthCallsBefore = mcpHealthCalls(value.configDir).length;

      assert.throws(
        () => grok.uninstall({
          configDir: value.configDir,
          repoRoot: REPO_ROOT,
          grokBin: value.grokBin,
          scope: 'global',
        }),
        /registry read-back failure/,
      );

      const restored = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.equal(restored.installed !== null, true);
      assert.equal(restored.enabled, expectedEnabled);
      assert.equal(
        inspectCalls(value.configDir).length,
        inspectCallsBefore,
        'activation registry snapshot and rollback must not depend on consumer inspection',
      );
      assert.equal(
        pluginDetailsCalls(value.configDir).length,
        detailsCallsBefore + 2,
        'uninstall must bind activation to native details before mutation and after rollback',
      );
      assert.equal(
        mcpHealthCalls(value.configDir).length,
        healthCallsBefore,
        'activation snapshot and rollback must not invoke MCP Doctor',
      );
      const rollbackCalls = readFakeCalls(value.configDir).slice(callsBefore);
      const expectedCommand = expectedEnabled ? 'enable' : 'disable';
      assert.ok(rollbackCalls.some((args) => (
        args[0] === 'plugin'
        && args[1] === expectedCommand
        && args[2] === 'ultra-builder-pro'
      )));
      assert.equal(rollbackCalls.some((args) => (
        args[0] === 'plugin'
        && args[1] === (expectedEnabled ? 'disable' : 'enable')
        && args[2] === 'ultra-builder-pro'
      )), false);
    } finally {
      cleanup(value);
    }
  }
});

test('Grok uninstall read-back failure restores the prior native registration', () => {
  const value = fixture();
  try {
    install(value);
    const sourceRoot = grok.resolveSourceRoot({
      configDir: value.configDir,
      scope: 'global',
    });
    setFakeMode(value.configDir, 'uninstall-readback-fail-once');
    assert.throws(
      () => grok.uninstall({
        configDir: value.configDir,
        grokBin: value.grokBin,
        scope: 'global',
      }),
      /registry read-back failure/,
    );
    assert.equal(fs.existsSync(sourceRoot), true);
    const doctor = grok.doctor({
      configDir: value.configDir,
      repoRoot: REPO_ROOT,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(doctor.status, 'healthy', JSON.stringify(doctor, null, 2));
  } finally {
    cleanup(value);
  }
});

test('Grok uninstall rollback failure keeps recovery material and returns a typed error', () => {
  const value = fixture();
  try {
    install(value);
    setFakeMode(value.configDir, 'uninstall-readback-fail-restore-fail');
    assert.throws(
      () => grok.uninstall({
        configDir: value.configDir,
        grokBin: value.grokBin,
        scope: 'global',
      }),
      (error) => (
        error.code === 'GROK_UNINSTALL_ROLLBACK_FAILED'
        && /registry read-back failure/.test(error.message)
        && /rollback install failure/.test(error.message)
      ),
    );
    const backups = fs.readdirSync(
      path.join(value.configDir, '.ubp', 'backups'),
      { withFileTypes: true },
    ).filter((entry) => entry.isDirectory() && entry.name.startsWith('uninstall-native-'));
    assert.equal(backups.length, 1);
    assert.equal(fs.existsSync(path.join(
      value.configDir,
      '.ubp',
      'backups',
      backups[0].name,
      'plugin.json',
    )), true);
  } finally {
    cleanup(value);
  }
});

test('Grok native consumer rejects a project plugin shadowing the registered target', () => {
  const value = fixture();
  try {
    install(value);
    setFakeMode(value.configDir, 'inspect-shadow');
    const report = grok.doctor({
      configDir: value.configDir,
      repoRoot: REPO_ROOT,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(report.status, 'degraded');
    assert.ok(report.issues.some((issue) => issue.code === 'GROK_PLUGIN_PATH_SHADOWED'));
  } finally {
    cleanup(value);
  }
});

test('Grok target and binary resolution share the configured GROK_HOME', () => {
  const value = fixture();
  try {
    const grokHome = path.join(value.configDir, 'custom-grok-home');
    const binary = createFakeGrok(path.join(grokHome, 'bin'));
    assert.equal(grok.resolveTarget({
      grokHome,
      homeDir: path.join(value.configDir, 'wrong-home'),
      scope: 'global',
    }), path.resolve(grokHome));
    assert.equal(grok.resolveGrokBinary({
      grokHome,
      homeDir: path.join(value.configDir, 'wrong-home'),
      scope: 'global',
    }), binary);
    assert.equal(grok.resolveTarget({
      configDir: path.join(value.configDir, 'explicit'),
      grokHome,
      scope: 'global',
    }), path.resolve(value.configDir, 'explicit'));
  } finally {
    cleanup(value);
  }
});

test('Grok install preflights registry provenance and declared source before publishing', () => {
  const value = fixture();
  try {
    install(value);
    const sourceRoot = grok.resolveSourceRoot({
      configDir: value.configDir,
      scope: 'global',
    });
    const marker = path.join(sourceRoot, 'preflight-marker.txt');
    fs.writeFileSync(marker, 'must remain byte exact\n');
    fs.appendFileSync(path.join(value.pluginRoot, 'plugin.json'), '\n');
    const beforeCalls = readFakeCalls(value.configDir).filter(
      (args) => (
        args[0] === 'plugin'
        && ['install', 'uninstall'].includes(args[1])
        && !args.includes('--help')
      ),
    ).length;
    assert.throws(
      () => install(value),
      (error) => error.code === 'GROK_INSTALL_PREFLIGHT_FAILED',
    );
    assert.equal(fs.readFileSync(marker, 'utf8'), 'must remain byte exact\n');
    assert.equal(readFakeCalls(value.configDir).filter(
      (args) => (
        args[0] === 'plugin'
        && ['install', 'uninstall'].includes(args[1])
        && !args.includes('--help')
      ),
    ).length, beforeCalls);

    fs.truncateSync(path.join(value.pluginRoot, 'plugin.json'));
    const stateFile = path.join(value.configDir, 'fake-grok-state.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const unmanagedSource = path.join(value.configDir, 'unmanaged-source');
    fs.mkdirSync(unmanagedSource);
    fs.writeFileSync(path.join(unmanagedSource, 'plugin.json'), '{}\n');
    state.installed.source = unmanagedSource;
    fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
    assert.throws(
      () => install(value),
      (error) => error.code === 'GROK_INSTALL_PREFLIGHT_FAILED',
    );
  } finally {
    cleanup(value);
  }
});

test('Grok uninstall stages durable roots before native mutation and restores them on failure', () => {
  const value = fixture();
  try {
    install(value);
    const sourceRoot = grok.resolveSourceRoot({
      configDir: value.configDir,
      scope: 'global',
    });
    const legacyRoot = path.join(value.configDir, 'plugins', 'ultra-builder-pro');
    fs.mkdirSync(legacyRoot, { recursive: true });
    fs.writeFileSync(path.join(legacyRoot, '.ubp-managed'), '{"source":"ubp"}\n');
    fs.writeFileSync(path.join(legacyRoot, 'legacy.txt'), 'legacy exact bytes\n');
    const sourceBefore = fs.readFileSync(path.join(sourceRoot, 'plugin.json'));
    setFakeMode(value.configDir, 'uninstall-fail-after-staging');
    assert.throws(
      () => grok.uninstall({
        configDir: value.configDir,
        grokBin: value.grokBin,
        scope: 'global',
      }),
      /simulated native uninstall failure after staging/,
    );
    assert.deepEqual(fs.readFileSync(path.join(sourceRoot, 'plugin.json')), sourceBefore);
    assert.equal(
      fs.readFileSync(path.join(legacyRoot, 'legacy.txt'), 'utf8'),
      'legacy exact bytes\n',
    );
    const doctor = grok.doctor({
      configDir: value.configDir,
      repoRoot: REPO_ROOT,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(doctor.status, 'healthy', JSON.stringify(doctor, null, 2));

    setFakeMode(value.configDir, 'require-durable-roots-staged');
    const removed = grok.uninstall({
      configDir: value.configDir,
      grokBin: value.grokBin,
      scope: 'global',
    });
    assert.equal(removed.removed.native_plugin, true);
    assert.equal(fs.existsSync(sourceRoot), false);
    assert.equal(fs.existsSync(legacyRoot), false);
  } finally {
    cleanup(value);
  }
});

test('Grok Doctor degrades with typed issues for stale or unsafe registry paths', () => {
  for (const kind of ['missing', 'unsafe']) {
    const value = fixture();
    try {
      install(value);
      const stateFile = path.join(value.configDir, 'fake-grok-state.json');
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      state.installed.path = kind === 'missing'
        ? path.join(value.configDir, 'installed-plugins', 'missing-plugin')
        : fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-grok-unsafe-'));
      fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
      const report = grok.doctor({
        configDir: value.configDir,
        repoRoot: REPO_ROOT,
        grokBin: value.grokBin,
        scope: 'global',
      });
      assert.equal(report.status, 'degraded');
      assert.ok(report.issues.some((issue) => (
        issue.code === (kind === 'missing'
          ? 'GROK_PLUGIN_PATH_MISSING'
          : 'GROK_PLUGIN_PATH_UNSAFE')
      )));
      if (kind === 'unsafe') fs.rmSync(state.installed.path, { recursive: true, force: true });
    } finally {
      cleanup(value);
    }
  }
});
