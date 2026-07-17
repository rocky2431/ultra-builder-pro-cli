'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const opencode = require('../opencode.js');
const { parse: parseFm } = require('../_shared/frontmatter.cjs');
const { skillsForRuntime } = require('../_shared/runtime-assets.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function mkTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-opencode-'));
}

test('install builds a native OpenCode plugin and copies only allowlisted skills', () => {
  const target = mkTarget();
  try {
    const r = opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    assert.ok(r.copied.commands.includes('ultra-init.md'));
    assert.ok(r.copied.skills.some((p) => p.includes('ultra-init/SKILL.md')));
    assert.ok(r.copied.plugins.includes('ultra-builder-pro.js'));
    assert.ok(fs.existsSync(path.join(target, 'plugins', 'ultra-builder-pro.js')));
    assert.deepEqual(
      fs.readdirSync(path.join(target, 'skills'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
      skillsForRuntime('opencode').sort(),
    );

    // OpenCode commands expose only fields accepted by the native command contract.
    const dst = fs.readFileSync(path.join(target, 'commands', 'ultra-init.md'), 'utf8');
    const { fm: dstFm } = parseFm(dst);
    assert.deepEqual(Object.keys(dstFm), ['description']);

    // forge an upper-case key to prove the transform works
    const hack = path.join(target, 'commands', 'upper.md');
    fs.writeFileSync(hack, '---\nDescription: mixed\n---\nbody\n');
    opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    // reinstall re-runs the transform; the hack was outside commands/ in repo so
    // install doesn't touch it; we verify transform via a direct call:
    const { lowercaseKeys } = require('../_shared/frontmatter.cjs');
    assert.deepEqual(lowercaseKeys({ Description: 'x', Tags: ['A'] }), { description: 'x', tags: ['A'] });
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install performs content-level OpenCode adaptation for commands, skills, references, and agents', () => {
  const target = mkTarget();
  try {
    opencode.install({ configDir: target, repoRoot: REPO_ROOT });

    const plan = fs.readFileSync(path.join(target, 'skills', 'ultra-plan', 'SKILL.md'), 'utf8');
    const learn = fs.readFileSync(path.join(target, 'skills', 'learn', 'SKILL.md'), 'utf8');
    const review = fs.readFileSync(path.join(target, 'skills', 'ultra-review', 'SKILL.md'), 'utf8');
    const codexCollab = fs.readFileSync(path.join(target, 'skills', 'codex-collab', 'SKILL.md'), 'utf8');
    const verify = fs.readFileSync(path.join(target, 'skills', 'ultra-verify', 'SKILL.md'), 'utf8');

    assert.deepEqual(Object.keys(parseFm(plan).fm), ['name', 'description']);
    assert.match(learn, /~\/.config\/opencode\/skills\/learned-<pattern-slug>-unverified\/SKILL\.md/);
    assert.doesNotMatch(learn, /_unverified\.md/);
    assert.match(review, /~\/.config\/opencode\/skills\/ultra-review\/scripts\/review_wait\.py/);
    assert.match(codexCollab, /OpenCode remains primary/);
    assert.match(verify, /OpenCode remains primary/);
    assert.match(verify, /opencode-analysis\.md/);
    assert.match(verify, /codex exec -s read-only/);
    assert.match(plan, /LEGACY_STATE_MIGRATION_REQUIRED/);
    assert.match(plan, /never read or write .*tasks\.json/i);
    assert.doesNotMatch(plan, /ultra-tools task create/);

    const markdown = [];
    for (const root of ['commands', 'skills', 'agents']) {
      const pending = [path.join(target, root)];
      while (pending.length) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const file = path.join(current, entry.name);
          if (entry.isDirectory()) pending.push(file);
          else if (entry.isFile() && entry.name.endsWith('.md')) markdown.push(file);
        }
      }
    }
    const incompatible = /~\/.claude|CLAUDE\.md|AskUserQuestion|TaskCreate|TaskUpdate|TaskList|run_in_background:\s*true|--yolo|--full-auto|\/codex:|ask\.question|review\.run/;
    for (const file of markdown) {
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), incompatible, file);
    }
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install translates Claude agent metadata to native OpenCode agent contracts', () => {
  const target = mkTarget();
  try {
    opencode.install({ configDir: target, repoRoot: REPO_ROOT });

    const reviewTests = parseFm(
      fs.readFileSync(path.join(target, 'agents', 'review-tests.md'), 'utf8'),
    ).fm;
    assert.equal(reviewTests.mode, 'subagent');
    assert.equal(reviewTests.steps, 18);
    assert.equal(reviewTests.name, undefined);
    assert.equal(reviewTests.model, undefined);
    assert.equal(reviewTests.maxturns, undefined);
    assert.equal(reviewTests.tools, undefined);
    assert.equal(reviewTests.skills, undefined);
    assert.deepEqual(reviewTests.permission, {
      read: 'allow',
      edit: 'allow',
      glob: 'allow',
      grep: 'allow',
      list: 'allow',
      bash: 'allow',
      task: 'deny',
      external_directory: 'deny',
      todowrite: 'deny',
      question: 'deny',
      webfetch: 'deny',
      websearch: 'deny',
      codesearch: 'deny',
      lsp: 'deny',
      doom_loop: 'deny',
      skill: {
        '*': 'deny',
        'testing-rules': 'allow',
      },
    });

    const tddRunner = parseFm(
      fs.readFileSync(path.join(target, 'agents', 'tdd-runner.md'), 'utf8'),
    ).fm;
    assert.equal(tddRunner.permission.edit, 'deny');
    assert.deepEqual(tddRunner.permission.skill, {
      '*': 'deny',
      'testing-rules': 'allow',
    });

    const debuggerAgent = parseFm(
      fs.readFileSync(path.join(target, 'agents', 'debugger.md'), 'utf8'),
    ).fm;
    assert.equal(debuggerAgent.steps, 40);
    assert.equal(debuggerAgent.permission.skill, 'deny');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install writes a schema-safe opencode.json and keeps ownership outside host config', () => {
  const target = mkTarget();
  try {
    opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    const config = JSON.parse(fs.readFileSync(path.join(target, 'opencode.json'), 'utf8'));
    assert.ok(config.mcp);
    assert.ok(config.mcp[opencode.MCP_SERVER_NAME]);
    assert.equal(config.mcp[opencode.MCP_SERVER_NAME].type, 'local');
    assert.equal(config.mcp[opencode.MCP_SERVER_NAME].enabled, true);
    assert.ok(Array.isArray(config.mcp[opencode.MCP_SERVER_NAME].command));
    assert.equal('_ubp_manifest' in config, false);
    assert.ok(fs.existsSync(path.join(target, opencode.BUNDLE_DIR, '.ubp-managed')));

    const plugin = fs.readFileSync(path.join(target, 'plugins', 'ultra-builder-pro.js'), 'utf8');
    assert.match(plugin, /experimental\.chat\.system\.transform/);
    assert.match(plugin, /experimental\.session\.compacting/);
    assert.match(plugin, /tool\.execute\.before/);
    assert.match(plugin, /\.ultra[\\/]tasks[\\/]tasks\.json/);
    assert.match(plugin, /throw new Error/);
    assert.match(plugin, /session\.compacted/);
    assert.doesNotMatch(plugin, /memory\.(?:retain|recall|reflect)|journal|observation|prompt[_ -]?capture/);
    assert.match(plugin, /Ultra context spine/);
    assert.doesNotMatch(plugin, /providerMetadata|External providers/);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('OpenCode context covers active changes and projection writes are blocked for Ultra projects', async () => {
  const target = mkTarget();
  const project = mkTarget();
  try {
    opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    const pluginFile = path.join(target, 'plugins', 'ultra-builder-pro.js');
    const module = await import(pathToFileURL(pluginFile).href);
    const plugin = await module.UltraBuilderProPlugin({ directory: project });

    fs.mkdirSync(path.join(project, '.ultra'), { recursive: true });
    fs.writeFileSync(path.join(project, '.ultra', 'state.db'), 'owned-by-ultra');
    execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
    fs.writeFileSync(path.join(project, 'app.txt'), 'initial\n');
    execFileSync('git', ['add', 'app.txt'], { cwd: project, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=Ultra Tests', '-c', 'user.email=ultra@example.invalid', 'commit', '-m', 'initial'], {
      cwd: project, stdio: 'ignore',
    });
    const compiledHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8' }).trim();
    const changeRoot = path.join(project, '.ultra', 'changes', 'active', 'daily-fix');
    fs.mkdirSync(changeRoot, { recursive: true });
    fs.writeFileSync(path.join(changeRoot, 'context-manifest.json'), JSON.stringify({
      schema_version: '2.0',
      change: { id: 'daily-fix', title: 'Daily fix', kind: 'quick', status: 'active', intent: 'Fix drift' },
      role: 'implement',
      gate: 'implementation',
      next_action: 'Run the exact regression test.',
      readiness: { status: 'ready', blockers: [] },
      git: { head: compiledHead },
      selected_task: { id: 'daily-task', status: 'in_progress' },
      context: { token_estimate: 1200, budget: { max_tokens: 8000, max_files: 8 } },
      providers: { memory: { provider: 'cloud-mem', status: 'available' } },
    }));

    const output = { system: [] };
    await plugin['experimental.chat.system.transform']({}, output);
    assert.match(output.system.join('\n'), /Ultra context spine/);
    assert.match(output.system.join('\n'), /daily-fix/);
    assert.match(output.system.join('\n'), /daily-task/);
    assert.match(output.system.join('\n'), /Role: implement/);
    assert.match(output.system.join('\n'), /Gate: implementation/);
    assert.match(output.system.join('\n'), /Readiness: ready/);
    assert.match(output.system.join('\n'), /Run the exact regression test/);
    assert.doesNotMatch(output.system.join('\n'), /Fix drift|cloud-mem/);

    const manifestFile = path.join(changeRoot, 'context-manifest.json');
    const legacyManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    legacyManifest.schema_version = '1.0';
    fs.writeFileSync(manifestFile, JSON.stringify(legacyManifest));
    const legacyOutput = { system: [] };
    await plugin['experimental.chat.system.transform']({}, legacyOutput);
    assert.match(legacyOutput.system.join('\n'), /CONTEXT_SNAPSHOT_UPGRADE_REQUIRED/);
    legacyManifest.schema_version = '2.0';
    fs.writeFileSync(manifestFile, JSON.stringify(legacyManifest));

    fs.writeFileSync(path.join(project, 'app.txt'), 'changed\n');
    execFileSync('git', ['add', 'app.txt'], { cwd: project, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=Ultra Tests', '-c', 'user.email=ultra@example.invalid', 'commit', '-m', 'change'], {
      cwd: project, stdio: 'ignore',
    });
    const staleOutput = { system: [] };
    await plugin['experimental.chat.system.transform']({}, staleOutput);
    assert.match(staleOutput.system.join('\n'), /Readiness: blocked/);
    assert.match(staleOutput.system.join('\n'), /CONTEXT_HEAD_STALE/);
    assert.match(staleOutput.system.join('\n'), /recompile change\.context/);

    await assert.rejects(
      plugin['tool.execute.before'](
        { tool: 'apply_patch' },
        { args: { patch: '*** Begin Patch\n*** Update File: .ultra/tasks/tasks.json\n*** End Patch' } },
      ),
      /state\.db is authoritative/,
    );
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('install preserves user mcp entries; uninstall removes only owned Ultra assets', () => {
  const target = mkTarget();
  const configFile = path.join(target, 'opencode.json');
  try {
    fs.writeFileSync(configFile, JSON.stringify({
      theme: 'dark',
      mcp: { my_server: { command: 'node', args: ['./mine.js'] } },
    }, null, 2));

    opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    const merged = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.equal(merged.theme, 'dark');
    assert.ok(merged.mcp.my_server);
    assert.ok(merged.mcp[opencode.MCP_SERVER_NAME]);

    opencode.uninstall({ configDir: target });
    const after = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.equal(after.theme, 'dark');
    assert.ok(after.mcp.my_server);
    assert.ok(!after.mcp[opencode.MCP_SERVER_NAME]);
    assert.ok(!('_ubp_manifest' in after));
    assert.ok(!fs.existsSync(path.join(target, 'commands')));
    assert.ok(!fs.existsSync(path.join(target, 'plugins', 'ultra-builder-pro.js')));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('shared OpenCode asset roots keep unrelated user commands, skills, agents, and runtime files', () => {
  const target = mkTarget();
  const userFiles = [
    ['commands', 'user-command.md'],
    ['skills', 'user-skill', 'SKILL.md'],
    ['agents', 'user-agent.md'],
    ['runtime', 'user-runtime.txt'],
  ];
  try {
    for (const parts of userFiles) {
      const file = path.join(target, ...parts);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'user-owned');
    }

    opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    opencode.uninstall({ configDir: target });

    for (const parts of userFiles) {
      assert.equal(fs.readFileSync(path.join(target, ...parts), 'utf8'), 'user-owned');
    }
    assert.equal(fs.existsSync(path.join(target, 'commands', '.ubp-managed')), false);
    assert.equal(fs.existsSync(path.join(target, 'skills', '.ubp-managed')), false);
    assert.equal(fs.existsSync(path.join(target, 'agents', '.ubp-managed')), false);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install refuses to overwrite an unmanaged OpenCode asset with the same name', () => {
  const target = mkTarget();
  const conflict = path.join(target, 'skills', 'ultra-init', 'SKILL.md');
  try {
    fs.mkdirSync(path.dirname(conflict), { recursive: true });
    fs.writeFileSync(conflict, 'user-owned');
    assert.throws(
      () => opencode.install({ configDir: target, repoRoot: REPO_ROOT }),
      /unmanaged OpenCode skill/,
    );
    assert.equal(fs.readFileSync(conflict, 'utf8'), 'user-owned');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
