'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const grok = require('../../../adapters/grok.js');
const {
  CORE_PUBLIC_SKILLS,
  skillsForRuntime,
} = require('../../../adapters/_shared/runtime-assets.cjs');
const { createFakeGrok } = require('../../../adapters/tests/grok-cli-fixture.cjs');
const { REPO_ROOT, mkTarget, cleanup } = require('../_lib.cjs');

function layout(prefix) {
  const configDir = mkTarget(prefix);
  const binaryRoot = mkTarget(`${prefix}-binary`);
  return {
    configDir,
    binaryRoot,
    grokBin: createFakeGrok(binaryRoot),
    pluginRoot: null,
  };
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

function cleanupLayout(value) {
  cleanup(value.configDir);
  cleanup(value.binaryRoot);
}

test('grok conformance — commands, skills, and bounded agents are native assets', () => {
  const value = layout('grok-cap-assets');
  try {
    install(value);
    assert.deepEqual(
      fs.readdirSync(path.join(value.pluginRoot, 'commands')).sort(),
      CORE_PUBLIC_SKILLS.map((name) => `${name}.md`).sort(),
    );
    assert.deepEqual(
      fs.readdirSync(path.join(value.pluginRoot, 'skills'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
      skillsForRuntime('grok').sort(),
    );
    const review = fs.readFileSync(
      path.join(value.pluginRoot, 'skills', 'ultra-review', 'SKILL.md'),
      'utf8',
    );
    assert.match(review, /Grok Build subagents/);
    const agent = fs.readFileSync(path.join(value.pluginRoot, 'agents', 'review-spec.md'), 'utf8');
    assert.match(agent, /mcpInheritance: all/);
    assert.match(agent, /packet_digest/);
    assert.doesNotMatch(agent, /^model:|^hooks:|^mcpServers:/m);
  } finally {
    cleanupLayout(value);
  }
});

test('grok conformance — plugin has truthful hooks and stable native MCP', () => {
  const value = layout('grok-cap-runtime');
  try {
    install(value);
    const hooks = JSON.parse(fs.readFileSync(
      path.join(value.pluginRoot, 'hooks', 'hooks.json'),
      'utf8',
    ));
    assert.deepEqual(Object.keys(hooks.hooks).sort(), [
      'PreCompact', 'PreToolUse', 'SessionStart', 'Stop', 'SubagentStart', 'SubagentStop',
    ].sort());
    assert.match(hooks.description, /Grok ignores SessionStart\/PostCompact stdout/);
    const entry = JSON.parse(fs.readFileSync(
      path.join(value.pluginRoot, '.mcp.json'),
      'utf8',
    )).mcpServers['ultra-builder-pro'];
    assert.equal(entry.command, process.platform === 'win32' ? 'node.exe' : '/usr/bin/env');
    assert.deepEqual(
      entry.args,
      process.platform === 'win32'
        ? ['${GROK_PLUGIN_ROOT}/runtime/launch.cjs']
        : ['node', '${GROK_PLUGIN_ROOT}/runtime/launch.cjs'],
    );
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'runtime', 'runtime-native.cjs')));
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'runtime', 'native-runtime.json')));
    const runtimeSource = fs.readFileSync(
      path.join(value.pluginRoot, 'runtime', 'index.cjs'),
      'utf8',
    );
    assert.doesNotMatch(
      runtimeSource,
      /const WORKFLOW_DEFINITIONS|function startWorkflow\(/,
      'installed runtime must not bundle the retired semantic supervisor',
    );
  } finally {
    cleanupLayout(value);
  }
});

test('grok conformance — install is byte-idempotent', () => {
  const value = layout('grok-cap-idempotent');
  try {
    install(value);
    const files = [
      path.join(value.pluginRoot, 'plugin.json'),
      path.join(value.pluginRoot, '.mcp.json'),
      path.join(value.pluginRoot, 'hooks', 'hooks.json'),
      path.join(value.pluginRoot, 'skills', 'ultra-review', 'SKILL.md'),
    ];
    const first = files.map((file) => fs.readFileSync(file));
    install(value);
    files.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), first[index]));
  } finally {
    cleanupLayout(value);
  }
});
