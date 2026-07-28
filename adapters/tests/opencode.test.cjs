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
const { CORE_PUBLIC_SKILLS, skillsForRuntime } = require('../_shared/runtime-assets.cjs');
const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const changes = require('../../mcp-server/lib/change-workflow.cjs');
const { createTask } = require('../../mcp-server/lib/state-ops.cjs');
const { seedReadyBaseline } = require('../../mcp-server/test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../../mcp-server/test-support/change-contract.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function mkTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-opencode-'));
}

test('install builds explicit OpenCode commands without exposing public workflows as model skills', () => {
  const target = mkTarget();
  try {
    const r = opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    assert.ok(r.copied.commands.includes('ultra-init.md'));
    assert.ok(!r.copied.skills.some((p) => p.includes('ultra-init/SKILL.md')));
    assert.ok(r.copied.plugins.includes('ultra-builder-pro.js'));
    assert.ok(fs.existsSync(path.join(target, 'plugins', 'ultra-builder-pro.js')));
    assert.deepEqual(
      fs.readdirSync(path.join(target, 'skills'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
      skillsForRuntime('opencode')
        .filter((name) => !CORE_PUBLIC_SKILLS.includes(name))
        .sort(),
    );

    // OpenCode commands expose only fields accepted by the native command contract.
    const dst = fs.readFileSync(path.join(target, 'commands', 'ultra-init.md'), 'utf8');
    const { fm: dstFm } = parseFm(dst);
    assert.deepEqual(Object.keys(dstFm), ['description']);
    assert.match(dst, /\.ultra-builder-pro[\\/]workflows[\\/]ultra-init[\\/]SKILL\.md/);
    assert.doesNotMatch(dst, /@skills\/ultra-init\/SKILL\.md|Use the registered `ultra-init` skill/);

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

    const workflow = (name) => fs.readFileSync(
      path.join(target, opencode.BUNDLE_DIR, 'workflows', name, 'SKILL.md'),
      'utf8',
    );
    const plan = workflow('ultra-plan');
    const learn = workflow('learn');
    const review = workflow('ultra-review');
    const codexCollab = fs.readFileSync(path.join(target, 'skills', 'codex-collab', 'SKILL.md'), 'utf8');
    const verify = fs.readFileSync(path.join(target, 'skills', 'ultra-verify', 'SKILL.md'), 'utf8');

    assert.deepEqual(Object.keys(parseFm(
      fs.readFileSync(path.join(target, 'commands', 'ultra-plan.md'), 'utf8'),
    ).fm), ['description']);
    assert.match(learn, /`~\/.config\/opencode\/skills`/);
    assert.doesNotMatch(learn, /_unverified|learned-[^\s/]*-unverified/i);
    assert.match(review, /OpenCode `task` tool/);
    assert.match(review, /scripts\/review_wait\.py/);
    assert.match(codexCollab, /OpenCode remains primary/);
    assert.match(verify, /Keep OpenCode responsible/);
    assert.match(verify, /host-analysis\.md/);
    assert.match(verify, /installed collaboration companion/);
    assert.doesNotMatch(verify, /codex exec|claude --safe-mode/);
    assert.doesNotMatch(plan, /LEGACY_STATE_MIGRATION_REQUIRED|v4\.4|v4\.5/);
    assert.match(plan, /never read or\s+write .*tasks\.json/i);
    assert.doesNotMatch(plan, /ultra-tools task create/);

    const markdown = [];
    for (const root of ['commands', 'skills', 'agents', path.join(opencode.BUNDLE_DIR, 'workflows')]) {
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
      const text = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(text, incompatible, file);
      assert.doesNotMatch(text, /[\u3400-\u9fff]|ultra-review-findings-v1|Context7|Exa MCP|graphify|confidence\s*>=?\s*\d+/iu, file);
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
    const interaction = JSON.parse(fs.readFileSync(
      path.join(target, opencode.BUNDLE_DIR, 'spec', 'interaction-contract.json'),
      'utf8',
    ));
    assert.equal(interaction.interaction.question_surface.primary, 'question');
    assert.equal(
      interaction.interaction.question_surface.availability,
      'question_permission_not_denied',
    );
    assert.equal(interaction.persistence.user_interaction_proof, 'not_required');

    const plugin = fs.readFileSync(path.join(target, 'plugins', 'ultra-builder-pro.js'), 'utf8');
    assert.match(plugin, /experimental\.chat\.system\.transform/);
    assert.match(plugin, /experimental\.session\.compacting/);
    assert.match(plugin, /tool\.execute\.before/);
    assert.match(plugin, /\.ultra[\\/]tasks[\\/]tasks\.json/);
    assert.match(plugin, /throw new Error/);
    assert.match(plugin, /session\.compacted/);
    assert.match(plugin, /breadcrumb\.cjs/);
    assert.doesNotMatch(plugin, /workflow-state\.json|context-manifest\.json/);
    assert.doesNotMatch(plugin, /memory\.(?:retain|recall|reflect)|journal|observation|prompt[_ -]?capture/);
    assert.match(plugin, /canonical breadcrumb/);
    assert.doesNotMatch(plugin, /providerMetadata|External providers/);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('OpenCode is silent before initialization and protects projections only after state authority exists', async () => {
  const target = mkTarget();
  const project = mkTarget();
  try {
    opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    fs.mkdirSync(path.join(project, '.ultra'), { recursive: true });
    const module = await import(`${pathToFileURL(path.join(target, 'plugins', 'ultra-builder-pro.js')).href}?baseline`);
    const plugin = await module.UltraBuilderProPlugin({ directory: project });
    const output = { system: [] };
    await plugin['experimental.chat.system.transform']({}, output);
    assert.deepEqual(output.system, []);
    await assert.doesNotReject(
      plugin['tool.execute.before'](
        { tool: 'apply_patch' },
        { args: { patch: '*** Begin Patch\n*** Update File: .ultra/tasks/tasks.json\n*** End Patch' } },
      ),
    );
    const state = initStateDb(path.join(project, '.ultra', 'state.db'));
    closeStateDb(state.db);
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

test('OpenCode injects the DB breadcrumb and ignores conflicting workflow projections', async () => {
  const target = mkTarget();
  const project = mkTarget();
  let state;
  try {
    opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' });
    fs.writeFileSync(path.join(project, 'app.txt'), 'initial\n');
    execFileSync('git', ['add', 'app.txt'], { cwd: project, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=Ultra Tests', '-c', 'user.email=ultra@example.invalid', 'commit', '-m', 'initial'], {
      cwd: project, stdio: 'ignore',
    });
    state = initStateDb(path.join(project, '.ultra', 'state.db'));
    seedReadyBaseline(state.db, { rootDir: project, id: 'baseline-db' });
    const { change } = changes.createChange(state.db, completeChangeInput({
      id: 'db-authority-change', title: 'DB authority', kind: 'quick',
      intent: 'Use one authoritative injected state.',
      docs_impact: { status: 'none', rationale: 'test fixture' },
    }), { rootDir: project });
    const task = createTask(state.db, {
      id: 'db-authority-task', title: 'Use DB authority', type: 'bugfix', priority: 'P0',
      change_id: change.id,
      outcome: 'Inject one authoritative OpenCode task boundary.', slice_kind: 'tracer_bullet',
      public_seam: 'OpenCode injection',
      verification_command: 'node --test adapters/tests/opencode.test.cjs',
      acceptance: [{
        id: 'opencode-injection', criterion: 'The DB task is injected instead of a projection.',
        verification: 'node --test adapters/tests/opencode.test.cjs',
      }],
      context_refs: [{ ref: 'app.txt', kind: 'source', reason: 'Tracked fixture seam', required: true }],
      docs_impact: { status: 'none', files: [], rationale: 'Internal test fixture.' },
      ownership: { owner: 'test-owner', reviewers: [] }, trace_to: 'app.txt#fixture',
    });
    changes.compileContext(state.db, {
        id: change.id,
        task_id: task.id,
        role: 'implement',
        gate: 'implementation',
    }, { rootDir: project });
    state.db.prepare(
      `INSERT INTO workflow_runs
       (id, kind, subject, status, current_step, baseline_id, change_id, task_id)
       VALUES ('wf-opencode-dev', 'dev', 'Explicit OpenCode dev', 'active', 'implement',
               'baseline-db', 'db-authority-change', 'db-authority-task')`,
    ).run();

    fs.writeFileSync(path.join(project, '.ultra', 'workflow-state.json'), JSON.stringify({
      command: 'ultra-dev', task_id: 'projection-task', status: 'active', step: 'wrong',
    }));
    const projectionRoot = path.join(project, '.ultra', 'changes', 'active', 'projection-change');
    fs.mkdirSync(projectionRoot, { recursive: true });
    fs.writeFileSync(path.join(projectionRoot, 'context-manifest.json'), JSON.stringify({
      schema_version: '2.0',
      baseline: { id: 'projection-baseline', mode: 'brownfield', status: 'ready' },
      change: { id: 'projection-change', kind: 'quick', status: 'active' },
      selected_task: { id: 'projection-task', status: 'in_progress' },
      readiness: { status: 'ready', blockers: [], warnings: [] },
    }));

    const module = await import(`${pathToFileURL(path.join(target, 'plugins', 'ultra-builder-pro.js')).href}?db-authority`);
    const plugin = await module.UltraBuilderProPlugin({ directory: project });
    const output = { system: [] };
    await plugin['experimental.chat.system.transform']({}, output);
    const text = output.system.join('\n');
    assert.match(text, /Change: db-authority-change/);
    assert.match(text, /Task: db-authority-task/);
    assert.match(text, /Role: implement/);
    assert.doesNotMatch(text, /projection-change|projection-task|projection-baseline/);
  } finally {
    if (state) closeStateDb(state.db);
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
  const conflict = path.join(target, 'skills', 'code-review-expert', 'SKILL.md');
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
