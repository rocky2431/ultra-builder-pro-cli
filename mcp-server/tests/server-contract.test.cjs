'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const yaml = require('js-yaml');
const Database = require('better-sqlite3');

const { Client, InMemoryTransport } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SERVER = path.join(REPO_ROOT, 'mcp-server', 'server.cjs');
const PACKAGE_VERSION = require(path.join(REPO_ROOT, 'package.json')).version;
const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const { dispatchTool, startServer } = require('../server.cjs');
const changes = require('../lib/change-workflow.cjs');
const ops = require('../lib/state-ops.cjs');
const artifactRegistry = require('../lib/artifact-registry.cjs');
const planStore = require('../lib/plan-store.cjs');
const { seedReadyBaseline: seedCompleteBaseline } = require('../test-support/ready-baseline.cjs');
const {
  researchCoverage, semanticRecordsForStep,
} = require('../test-support/semantic-records.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mcp-'));
  return { dir, dbPath: path.join(dir, '.ultra', '.runtime', 'state.db') };
}

function ensureGitProject(project) {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project.dir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: project.dir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: project.dir });
  fs.writeFileSync(
    path.join(project.dir, '.gitignore'),
    '!.ultra/\n!.ultra/**\n.ultra/.runtime\n'
      + '.ultra/[s]tate.db\n.ultra/[s]tate.db-wal\n.ultra/[s]tate.db-shm\n',
  );
  execFileSync('git', ['add', '.gitignore'], { cwd: project.dir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: project.dir });
}

function seedReadyBaseline(project) {
  const { db } = initStateDb(project.dbPath);
  seedCompleteBaseline(db, { rootDir: project.dir });
  closeStateDb(db);
}

function seedBaseline(project, { mode, status }) {
  const { db } = initStateDb(project.dbPath);
  db.prepare(
    `INSERT OR REPLACE INTO baselines
     (id, project_name, mode, status)
     VALUES ('test-baseline', 'fixture', ?, ?)`,
  ).run(mode, status);
  closeStateDb(db);
}

async function withClient({ dir, dbPath }, fn, extraEnv = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: {
      ...process.env,
      UBP_DB_PATH: dbPath,
      UBP_ROOT_DIR: dir,
      ...extraEnv,
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'ubp-test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
  }
}

async function withDefaultAuthorityClient({ dir }, fn) {
  const env = { ...process.env, UBP_ROOT_DIR: dir };
  delete env.UBP_DB_PATH;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'ubp-default-authority', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try { await fn(client); } finally { await client.close(); }
}

async function withClientNoLlmKey({ dir, dbPath }, fn) {
  const env = { ...process.env, UBP_DB_PATH: dbPath, UBP_ROOT_DIR: dir };
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENAI_API_KEY;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'ubp-test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try { await fn(client); } finally { await client.close(); }
}

async function withInProcessClient({ dir, dbPath }, fn) {
  const handle = startServer({
    dbPath,
    rootDir: dir,
    projectOnWrite: false,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'ubp-in-process-test', version: '0.0.0' },
    { capabilities: {} },
  );
  await handle.server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await fn(client);
  } finally {
    await client.close();
    await handle.close();
  }
}

function readToolPayload(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content[0].text;
  return JSON.parse(text);
}

function expectError(result) {
  assert.equal(result.isError, true, 'expected isError result');
  return JSON.parse(result.content[0].text).error;
}

function prdTasks(taskId) {
  return [{
    id: taskId,
    title: `Implement ${taskId}`,
    type: 'feature',
    priority: 'P1',
    deps: [],
    files_modified: [`src/${taskId}.js`],
  }];
}

test('listTools returns workflow tools and exposes no general memory-provider API', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const list = await client.listTools();
      const names = list.tools.map((t) => t.name).sort();
      assert.deepEqual(names, [
        'artifact.get',
        'artifact.record',
        'baseline.converge',
        'baseline.get',
        'baseline.record',
        'baseline.start',
        'change.archive',
        'change.breadcrumb',
        'change.context',
        'change.converge',
        'change.create',
        'change.delta',
        'change.documentation_reconcile',
        'change.get',
        'change.learning_propose',
        'change.learning_resolve',
        'change.list',
        'change.update',
        'decision.checkpoint',
        'decision.complete',
        'decision.defer',
        'decision.delegate',
        'decision.get',
        'decision.list',
        'decision.open',
        'decision.resolve',
        'decision.supersede',
        'decision.thread_start',
        'plan.export',
        'plan.get',
        'session.admission_check',
        'session.close',
        'session.get',
        'session.heartbeat',
        'session.list',
        'session.spawn',
        'session.subscribe_events',
        'system.doctor',
        'task.append_event',
        'task.create',
        'task.delete',
        'task.dependency_topo',
        'task.expand',
        'task.get',
        'task.init_project',
        'task.list',
        'task.parse_prd',
        'task.subscribe_events',
        'task.switch_tag',
        'task.update',
        'workflow.complete',
        'workflow.get',
        'workflow.list',
        'workflow.revise',
        'workflow.start',
        'workflow.step',
        'workflow.supersede',
      ]);
      assert.ok(!names.some((name) => name.startsWith('memory.')));
      for (const t of list.tools) {
        assert.equal(typeof t.inputSchema, 'object');
        assert.equal(t.inputSchema.type, 'object');
      }
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('artifact.record and artifact.get expose the live typed registry through MCP', async () => {
  const proj = tmpProject();
  try {
    const relative = '.ultra/specs/mcp-artifact.md';
    const file = path.join(proj.dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# MCP artifact\n');

    await withClient(proj, async (client) => {
      const recorded = await client.callTool({
        name: 'artifact.record',
        arguments: {
          id: 'artifact-mcp',
          owner_type: 'project',
          owner_id: 'project',
          kind: 'spec',
          path: relative,
          status: 'terminal',
          provenance: { actor: 'model', host: 'codex' },
          source_refs: [],
          consumer_refs: [],
        },
      });
      assert.equal(recorded.isError, undefined);
      const recordPayload = readToolPayload(recorded);
      assert.equal(recordPayload.artifact.id, 'artifact-mcp');
      assert.equal(recordPayload.artifact.managed, true);
      assert.match(recordPayload.artifact.digest, /^[a-f0-9]{64}$/);

      const fetched = await client.callTool({
        name: 'artifact.get',
        arguments: { path: relative },
      });
      assert.equal(fetched.isError, undefined);
      const getPayload = readToolPayload(fetched);
      assert.equal(getPayload.artifact.id, 'artifact-mcp');
      assert.equal(getPayload.artifact.managed, true);
      assert.deepEqual(getPayload.artifact.provenance, {
        actor: 'model', host: 'codex',
      });
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('the first state-backed MCP call admits an existing project and repairs legacy runtime exposure', async () => {
  const proj = tmpProject();
  try {
    ensureGitProject(proj);
    fs.writeFileSync(path.join(proj.dir, '.gitignore'), '.ultra\n');
    execFileSync('git', ['add', '.gitignore'], { cwd: proj.dir });
    execFileSync('git', ['commit', '-q', '-m', 'legacy broad ignore'], { cwd: proj.dir });
    seedReadyBaseline(proj);
    const legacySession = path.join( // runtime-path-compatibility fixture
      proj.dir,
      '.ultra',
      'sessions',
      'legacy.json',
    );
    fs.mkdirSync(path.dirname(legacySession), { recursive: true });
    fs.writeFileSync(legacySession, '{"legacy":true}\n');

    await withClient(proj, async (client) => {
      const listed = await client.callTool({ name: 'task.list', arguments: {} });
      assert.equal(listed.isError, undefined);
    });

    const migratedSession = path.join(
      proj.dir,
      '.ultra',
      '.runtime',
      'sessions',
      'legacy.json',
    );
    assert.equal(fs.readFileSync(migratedSession, 'utf8'), '{"legacy":true}\n');
    assert.equal(fs.existsSync(legacySession), false);
    const gitignore = fs.readFileSync(path.join(proj.dir, '.gitignore'), 'utf8');
    assert.match(gitignore, /^!\.ultra\/$/m);
    assert.match(gitignore, /^!\.ultra\/\*\*$/m);
    assert.match(gitignore, /^\.ultra\/\.runtime$/m);
    assert.doesNotThrow(() => execFileSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--', '.ultra/.runtime/state.db'],
      { cwd: proj.dir },
    ));
    assert.throws(() => execFileSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--', '.ultra/specs/product.md'],
      { cwd: proj.dir },
    ));
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('the default stdio MCP authority migrates a legacy project before binding validation', async () => {
  const proj = tmpProject();
  const legacyDb = path.join(proj.dir, '.ultra', 'state.db'); // runtime-path-compatibility
  try {
    const { db } = initStateDb(legacyDb);
    ops.createTask(db, {
      id: 'legacy-default-task',
      title: 'Legacy default task',
      type: 'feature',
      priority: 'P1',
    });
    closeStateDb(db);

    await withDefaultAuthorityClient(proj, async (client) => {
      const listed = await client.callTool({ name: 'task.list', arguments: {} });
      assert.equal(listed.isError, undefined, listed.content?.[0]?.text);
      assert.deepEqual(
        readToolPayload(listed).tasks.map((task) => task.id),
        ['legacy-default-task'],
      );
    });

    assert.equal(fs.lstatSync(legacyDb).isFile(), true);
    assert.equal(fs.existsSync(proj.dbPath), true);
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('a typo UBP_ROOT_DIR fails closed before the MCP creates project state', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mcp-invalid-root-'));
  const typoRoot = path.join(parent, 'does-not-exist');
  const project = {
    dir: typoRoot,
    dbPath: path.join(typoRoot, '.ultra', '.runtime', 'state.db'),
  };
  try {
    await withClient(project, async (client) => {
      const result = await client.callTool({ name: 'task.list', arguments: {} });
      assert.equal(expectError(result).code, 'RUNTIME_ROOT_INVALID');
    });
    assert.equal(fs.existsSync(typoRoot), false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('MCP rejects an unrelated configured DB without mutating either authority', async () => {
  const project = tmpProject();
  const authority = tmpProject();
  try {
    fs.mkdirSync(path.join(project.dir, '.ultra'), { recursive: true });
    const initialized = initStateDb(authority.dbPath);
    closeStateDb(initialized.db);
    const before = fs.readFileSync(authority.dbPath);

    await withClient(
      { dir: project.dir, dbPath: authority.dbPath },
      async (client) => {
        const result = await client.callTool({ name: 'task.list', arguments: {} });
        assert.equal(expectError(result).code, 'RUNTIME_AUTHORITY_MISMATCH');
      },
    );

    assert.deepEqual(fs.readFileSync(authority.dbPath), before);
    assert.equal(fs.existsSync(project.dbPath), false);
  } finally {
    fs.rmSync(project.dir, { recursive: true, force: true });
    fs.rmSync(authority.dir, { recursive: true, force: true });
  }
});

test('decision MCP tools preserve one-question alignment and confirmed checkpoints', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      const started = readToolPayload(await client.callTool({
        name: 'decision.thread_start',
        arguments: {
          id: 'mcp-alignment', baseline_id: 'test-baseline', mode: 'guided',
          purpose: 'Align one consequential change before planning.',
        },
      }));
      assert.equal(started.thread.status, 'active');

      const opened = readToolPayload(await client.callTool({
        name: 'decision.open',
        arguments: {
          id: 'mcp-decision', thread_id: 'mcp-alignment', phase: 'change-contract',
          question: 'Should the public API remain compatible for one release?',
          why_now: 'The answer changes rollout and recovery tasks.',
          recommendation: 'Preserve compatibility while active consumers migrate.',
          options: [
            { id: 'preserve', label: 'Preserve', tradeoff: 'Safer migration with temporary adapter cost.' },
            { id: 'replace', label: 'Replace', tradeoff: 'Simpler code with coordinated consumer migration.' },
          ],
          evidence_refs: ['src/public-api.js#exports'],
          effects: { summary: 'Changes the API contract and rollout plan.' },
          blocking: true,
        },
      }));
      assert.equal(opened.thread.current_decision.id, 'mcp-decision');

      const duplicate = expectError(await client.callTool({
        name: 'decision.open',
        arguments: {
          id: 'mcp-decision-2', thread_id: 'mcp-alignment', phase: 'change-contract',
          question: 'Should another question open concurrently?',
          why_now: 'This verifies cognitive-load enforcement.',
          recommendation: 'Do not open it concurrently.',
          effects: { summary: 'Would violate one-question presentation.' },
        },
      }));
      assert.equal(duplicate.code, 'DECISION_ALREADY_OPEN');

      await client.callTool({
        name: 'decision.resolve',
        arguments: {
          id: 'mcp-decision', decision: 'Preserve compatibility for one release.',
          rationale: 'Active consumers need a migration window.', decided_by: 'owner',
        },
      });
      const prepared = readToolPayload(await client.callTool({
        name: 'decision.checkpoint',
        arguments: {
          id: 'mcp-alignment', action: 'prepare',
          summary: 'Compatibility remains for one release.',
        },
      }));
      assert.equal(prepared.thread.status, 'checkpoint_ready');
      const confirmed = readToolPayload(await client.callTool({
        name: 'decision.checkpoint',
        arguments: {
          id: 'mcp-alignment', action: 'confirm', approved_by: 'owner',
          approval_note: 'Confirmed after reviewing the durable effect.',
          no_artifact_reason: 'Standalone alignment has no project artifact.',
        },
      }));
      assert.equal(confirmed.thread.status, 'confirmed');

      const listed = readToolPayload(await client.callTool({
        name: 'decision.list', arguments: { baseline_id: 'test-baseline' },
      }));
      assert.equal(listed.count, 1);
      assert.equal(listed.threads[0].checkpoint.approved_by, 'owner');

      await client.callTool({
        name: 'decision.thread_start',
        arguments: {
          id: 'mcp-routine-alignment', baseline_id: 'test-baseline', mode: 'fast',
          purpose: 'Close one normalized routine decision without an approval checkpoint.',
        },
      });
      await client.callTool({
        name: 'decision.open',
        arguments: {
          id: 'mcp-routine-decision', thread_id: 'mcp-routine-alignment',
          phase: 'planning-posture',
          question: 'Should planning hold the accepted scope?',
          why_now: 'The answer fixes the planning posture.',
          recommendation: 'Hold the accepted scope.',
          effects: { summary: 'Records the accepted planning posture.' },
        },
      });
      await client.callTool({
        name: 'decision.resolve',
        arguments: {
          id: 'mcp-routine-decision', decision: 'Hold the accepted scope.',
          rationale: 'The current acceptance is already complete.', decided_by: 'owner',
        },
      });
      const completed = readToolPayload(await client.callTool({
        name: 'decision.complete',
        arguments: {
          id: 'mcp-routine-alignment',
          summary: 'Planning posture is normalized; no artifact checkpoint is required.',
          applied_refs: [{
            kind: 'baseline',
            ref: 'test-baseline',
            field: 'status',
            value: 'ready',
          }],
        },
      }));
      assert.equal(completed.thread.status, 'completed');
      assert.equal(completed.thread.checkpoint.decision_digest, undefined);
      assert.deepEqual(completed.thread.summary.applied_refs, [{
        kind: 'baseline',
        ref: 'test-baseline',
        field: 'status',
        value: 'ready',
      }]);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('workflow MCP tools expose durable current-step recovery state', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'workflow-change', title: 'Workflow recovery', kind: 'quick',
          intent: 'Bind review recovery state to one durable change.',
          docs_impact: { status: 'none', rationale: 'Test fixture only.' },
        }),
      });
      const started = readToolPayload(await client.callTool({
        name: 'workflow.start',
        arguments: {
          id: 'workflow-mcp', kind: 'review', change_id: 'workflow-change',
          subject: 'Track one current review workflow.',
        },
      }));
      assert.equal(started.workflow.current_step, 'bind-diff');
      const fetched = readToolPayload(await client.callTool({
        name: 'workflow.get', arguments: { id: 'workflow-mcp' },
      }));
      assert.equal(fetched.workflow.status, 'active');
      const listed = readToolPayload(await client.callTool({
        name: 'workflow.list', arguments: { kind: 'review' },
      }));
      assert.equal(listed.count, 1);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('workflow.revise and workflow.supersede preserve accepted history through MCP', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      const created = readToolPayload(await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'workflow-revision-change',
          title: 'Preserve workflow revision history',
          kind: 'quick',
          intent: 'Replace accepted workflow authority without rewriting its history.',
          docs_impact: { status: 'none', files: [], rationale: 'Contract-only fixture.' },
        }),
      }));
      const priorId = created.workflow.id;
      assert.equal(created.workflow.status, 'completed');

      const replacementId = 'workflow-revision-candidate';
      let replacement = readToolPayload(await client.callTool({
        name: 'workflow.revise',
        arguments: {
          id: priorId,
          replacement_id: replacementId,
          subject: 'Re-confirm the current Change contract.',
          reason: 'New evidence requires a fresh accepted workflow run.',
        },
      })).workflow;
      assert.equal(replacement.metadata.revision.revision_of, priorId);
      assert.equal(replacement.metadata.revision.authority_status, 'candidate');

      const evidence = [{
        kind: 'state',
        ref: 'change:workflow-revision-change',
        summary: 'Current Change authority was read from durable state.',
      }];
      for (const step of replacement.steps.filter((item) => item.required)) {
        replacement = readToolPayload(await client.callTool({
          name: 'workflow.step',
          arguments: {
            id: replacementId,
            step_id: step.step_id,
            status: 'completed',
            ...(step.step_id === 'classify-change' ? {} : { evidence }),
          },
        })).workflow;
      }
      replacement = readToolPayload(await client.callTool({
        name: 'workflow.complete',
        arguments: { id: replacementId },
      })).workflow;
      assert.equal(replacement.status, 'completed');

      const promoted = readToolPayload(await client.callTool({
        name: 'workflow.supersede',
        arguments: {
          id: priorId,
          replacement_id: replacementId,
          reason: 'The completed revision now owns current authority.',
        },
      }));
      assert.equal(promoted.idempotent, false);
      assert.equal(promoted.workflow.metadata.revision.authority_status, 'current');
      assert.equal(promoted.superseded.metadata.revision.superseded_by, replacementId);

      const repeated = readToolPayload(await client.callTool({
        name: 'workflow.supersede',
        arguments: {
          id: priorId,
          replacement_id: replacementId,
          reason: 'The completed revision now owns current authority.',
        },
      }));
      assert.equal(repeated.idempotent, true);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('baseline MCP tools adopt and converge an existing checkout without storing provider payloads', async () => {
  const proj = tmpProject();
  try {
    fs.mkdirSync(path.join(proj.dir, '.ultra', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(proj.dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(proj.dir, '.ultra', 'specs', 'discovery.md'), '# Discovery\n\nObserved evidence.\n');
    fs.writeFileSync(path.join(proj.dir, '.ultra', 'specs', 'product.md'), '# Product\n\nObserved behavior.\n');
    fs.writeFileSync(path.join(proj.dir, '.ultra', 'specs', 'architecture.md'), '# Architecture\n\nCurrent boundary.\n');
    fs.writeFileSync(path.join(proj.dir, 'src', 'index.js'), 'module.exports = true;\n');
    fs.writeFileSync(
      path.join(proj.dir, '.gitignore'),
      '!.ultra/\n!.ultra/**\n.ultra/.runtime\n'
        + '.ultra/[s]tate.db\n.ultra/[s]tate.db-wal\n.ultra/[s]tate.db-shm\n',
    );
    require('node:child_process').execFileSync('git', ['init', '-q'], { cwd: proj.dir });
    require('node:child_process').execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: proj.dir });
    require('node:child_process').execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: proj.dir });
    require('node:child_process').execFileSync('git', ['add', '.'], { cwd: proj.dir });
    require('node:child_process').execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: proj.dir });
    const revision = require('node:child_process').execFileSync(
      'git', ['rev-parse', 'HEAD'], { cwd: proj.dir, encoding: 'utf8' },
    ).trim();

    await withClient(proj, async (client) => {
      const started = readToolPayload(await client.callTool({
        name: 'baseline.start',
        arguments: {
          id: 'mcp-baseline', project_name: 'fixture', mode: 'brownfield',
          repository_revision: revision, scope: ['.'],
        },
      }));
      assert.equal(started.baseline.status, 'adopting');

      let research = readToolPayload(await client.callTool({
        name: 'workflow.start',
        arguments: {
          id: 'mcp-research', kind: 'research', mode: 'adoption', baseline_id: 'mcp-baseline',
          subject: 'Establish the complete observed product and architecture baseline.',
          coverage: researchCoverage(),
          metadata: { selection_reason: 'The owner accepted the applicable adoption evidence areas.' },
        },
      })).workflow;
      for (const step of research.steps.filter((item) => item.required)) {
        let output = '.ultra/specs/architecture.md';
        if (step.step_id.startsWith('0')) output = '.ultra/specs/discovery.md';
        else if (step.step_id.startsWith('1') || step.step_id.startsWith('2')) {
          output = '.ultra/specs/product.md';
        } else if (step.step_id === '99-synthesis') {
          output = '.ultra/specs/research-distillate.md';
        }
        fs.appendFileSync(path.join(proj.dir, output), `\n${step.step_id} evidence.\n`);
        const report = path.join(
          '.ultra', 'docs', 'research', research.id, `${step.step_id}.md`,
        );
        fs.mkdirSync(path.dirname(path.join(proj.dir, report)), { recursive: true });
        fs.writeFileSync(path.join(proj.dir, report), [
          `# ${step.step_id} evidence`, '',
          '## Evidence', '', 'Current checkout evidence.', '',
          '## Specification updates', '', `Updated ${output}.`, '',
          '## Decisions and unknowns', '', 'No unresolved fixture decision.', '',
        ].join('\n'));
        const outputs = [{ path: report, kind: 'research-step-report' }];
        if (step.step_id === '99-synthesis') {
          outputs.push(
            { path: '.ultra/specs/discovery.md', kind: 'baseline-specification' },
            { path: '.ultra/specs/product.md', kind: 'baseline-specification' },
            { path: '.ultra/specs/architecture.md', kind: 'baseline-specification' },
            { path: '.ultra/specs/research-distillate.md', kind: 'research-distillate' },
          );
        }
        research = readToolPayload(await client.callTool({
          name: 'workflow.step',
          arguments: {
            id: research.id, step_id: step.step_id, status: 'completed',
            evidence: [{ kind: 'source', ref: `fixture:${step.step_id}`, summary: 'Current checkout evidence.' }],
            outputs,
            semantic_records: semanticRecordsForStep(research.id, step.step_id),
          },
        })).workflow;
      }
      const researchComplete = readToolPayload(await client.callTool({
        name: 'workflow.complete', arguments: { id: research.id },
      }));
      assert.equal(researchComplete.workflow.status, 'completed');

      const recorded = readToolPayload(await client.callTool({
        name: 'baseline.record',
        arguments: {
          id: 'mcp-baseline', repository_revision: revision,
          spec_refs: [
            { kind: 'discovery', path: '.ultra/specs/discovery.md' },
            { kind: 'product', path: '.ultra/specs/product.md' },
            { kind: 'architecture', path: '.ultra/specs/architecture.md' },
          ],
          evidence: [{ kind: 'source', ref: 'src/index.js', summary: 'Current entry point.' }],
          verification: [{
            name: 'smoke', command: 'node -e "require(\'./src\')"', status: 'pass', evidence: 'exit 0',
          }],
          unknowns: [],
          provider_refs: {
            code_graph: { provider: 'codebase-memory-mcp', project: 'fixture', status: 'fresh' },
          },
        },
      }));
      assert.match(recorded.baseline.spec_refs[0].digest, /^[0-9a-f]{64}$/);

      const converged = readToolPayload(await client.callTool({
        name: 'baseline.converge',
        arguments: {
          id: 'mcp-baseline', expected_revision: revision, approved_by: 'owner',
          approval_note: 'The baseline matches the current checkout.', accept_known_red: false,
        },
      }));
      assert.equal(converged.ready, true, JSON.stringify(converged));
      assert.equal(converged.baseline.status, 'ready');

      const got = readToolPayload(await client.callTool({
        name: 'baseline.get', arguments: {},
      }));
      assert.equal(got.baseline.id, 'mcp-baseline');
      assert.equal(JSON.stringify(got.baseline).includes('captured prompt'), false);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('change.create + change.context expose a continuous change unit with external provider references', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    fs.writeFileSync(path.join(proj.dir, 'README.md'), '# project\n');
    await withClient(proj, async (client) => {
      const created = await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'mcp-change', title: 'Continuous maintenance', kind: 'quick',
          intent: 'Keep daily modifications synchronized after initial delivery.',
          docs_impact: { status: 'none', files: [], rationale: 'Contract-only fixture.' },
          provider_refs: {
            memory: { provider: 'cloud-mem', status: 'available', reference: 'cmem://fixture' },
            code_graph: { provider: 'codebase-memory-mcp', status: 'stale', project: 'fixture' },
          },
        }),
      });
      const payload = readToolPayload(created);
      assert.equal(payload.change.id, 'mcp-change');
      assert.equal(payload.change.status, 'active');
      assert.equal(created._meta.ultra.state_commit, 'committed');
      assert.equal(created._meta.ultra.projection_status, 'completed');

      const baseline = readToolPayload(await client.callTool({
        name: 'baseline.get', arguments: {},
      })).baseline;
      const delta = readToolPayload(await client.callTool({
        name: 'change.delta',
        arguments: {
          id: payload.change.id,
          baseline_anchor: {
            baseline_id: baseline.id,
            repository_revision: baseline.repository_revision,
            specs: baseline.spec_refs.map((item) => ({
              path: item.path,
              digest: item.digest,
            })),
          },
          decisions: [],
          non_goals: payload.change.contract.non_goals,
          acceptance: payload.change.contract.acceptance,
          documentation_impact: payload.change.docs_impact,
          unknowns: [],
          no_semantic_change_reason: 'This contract-only fixture has no baseline mutation.',
          mutations: [],
        },
      }));
      assert.equal(delta.artifact.kind, 'change_delta');
      assert.equal(delta.artifact.owner_id, payload.change.id);

      const reconciliation = readToolPayload(await client.callTool({
        name: 'change.documentation_reconcile',
        arguments: {
          id: payload.change.id,
          delta_artifact_id: delta.artifact.id,
          delta_digest: delta.artifact.digest,
          no_change_reason: 'This contract-only fixture has no documentation change.',
          documents: [],
        },
      }));
      assert.equal(reconciliation.artifact.kind, 'documentation_reconciliation');
      assert.equal(reconciliation.artifact.owner_id, payload.change.id);
      assert.ok(fs.existsSync(path.join(
        proj.dir, payload.change.artifact_root, 'progress.md',
      )));

      const context = readToolPayload(await client.callTool({
        name: 'change.context', arguments: { id: 'mcp-change' },
      }));
      assert.equal(context.manifest.change.id, 'mcp-change');
      assert.equal(context.manifest.schema_version, '3.0');
      assert.equal(context.manifest.role, 'plan');
      assert.equal(context.manifest.readiness.status, 'ready');
      assert.ok(context.manifest.control.allowed_transitions.includes('ultra-plan'));
      assert.equal(context.manifest.control.required_transition, null);
      assert.equal(context.manifest.providers.memory.provider, 'cloud-mem');
      assert.equal(context.manifest.provider_boundary.includes('content remain external'), true);

      const breadcrumb = readToolPayload(await client.callTool({
        name: 'change.breadcrumb', arguments: { id: 'mcp-change' },
      }));
      assert.equal(breadcrumb.breadcrumb.change_id, 'mcp-change');
      assert.ok(breadcrumb.breadcrumb.allowed_transitions.includes('ultra-plan'));
      assert.equal(breadcrumb.breadcrumb.required_transition, null);
      assert.match(breadcrumb.breadcrumb.context_manifest_hash, /^[0-9a-f]{64}$/);

      const listed = readToolPayload(await client.callTool({
        name: 'change.list', arguments: { status: 'active' },
      }));
      assert.equal(listed.count, 1);
      assert.equal(listed.changes[0].id, 'mcp-change');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('spec-learning MCP tools persist an approval-gated candidate and projection', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    fs.writeFileSync(path.join(proj.dir, 'README.md'), '# Fixture\n');
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'learning-change', title: 'Learn stable contract', kind: 'quick',
          intent: 'Persist only approved specification discoveries.',
          docs_impact: { status: 'none', files: [], rationale: 'Contract fixture.' },
        }),
      });
      await client.callTool({
        name: 'task.create',
        arguments: {
          id: 'learning-task', title: 'Discover contract', type: 'feature', priority: 'P1',
          change_id: 'learning-change',
        },
      });
      const proposed = readToolPayload(await client.callTool({
        name: 'change.learning_propose',
        arguments: {
          id: 'learning-contract', change_id: 'learning-change', task_id: 'learning-task',
          target_ref: 'README.md#contract', summary: 'Context compilation fails closed on stale refs.',
          evidence: ['node --test context-spine.test.cjs'],
        },
      }));
      assert.equal(proposed.candidate.status, 'proposed');
      const withLearning = readToolPayload(await client.callTool({
        name: 'change.get', arguments: { id: 'learning-change' },
      }));
      assert.deepEqual(
        withLearning.change.learning_candidates.map((candidate) => candidate.id),
        ['learning-contract'],
      );

      const approved = readToolPayload(await client.callTool({
        name: 'change.learning_resolve',
        arguments: {
          change_id: 'learning-change', candidate_id: 'learning-contract', decision: 'approve',
          resolution: 'Stable behavior contract.',
        },
      }));
      assert.equal(approved.candidate.status, 'approved');
      const readme = path.join(proj.dir, 'README.md');
      const beforeDigest = require('node:crypto').createHash('sha256')
        .update(fs.readFileSync(readme)).digest('hex');
      fs.appendFileSync(readme, '\n## Contract\n\nContext compilation fails closed on stale refs.\n');
      const afterDigest = require('node:crypto').createHash('sha256')
        .update(fs.readFileSync(readme)).digest('hex');
      const applied = readToolPayload(await client.callTool({
        name: 'change.learning_resolve',
        arguments: {
          change_id: 'learning-change', candidate_id: 'learning-contract', decision: 'apply',
          resolution: 'Applied to README.md#contract.',
          applied_ref: 'README.md#contract', before_digest: beforeDigest,
          after_digest: afterDigest, apply_evidence: ['README.md#contract'],
        },
      }));
      assert.equal(applied.candidate.status, 'applied');
      assert.ok(fs.existsSync(path.join(
        proj.dir, '.ultra', 'changes', 'active', 'learning-change', 'spec-learning.json',
      )));
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('system.doctor returns structured provider ownership and projection health', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'doctor-seed', title: 'doctor seed', type: 'feature', priority: 'P1' },
      });
      const result = readToolPayload(await client.callTool({
        name: 'system.doctor', arguments: { repair: false },
      }));
      assert.equal(result.status, 'healthy');
      assert.equal(result.checks.external_providers.ownership, 'external');
      assert.equal(result.repair_performed, false);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('MCP startup fails closed when a reserved plan publication sidecar is unsafe', async () => {
  const proj = tmpProject();
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mcp-plan-sidecar-'));
  try {
    const { db } = initStateDb(proj.dbPath);
    const changeId = 'unsafe-plan-sidecar';
    const artifactRoot = `.ultra/changes/active/${changeId}`;
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES (?, 'Unsafe plan sidecar', 'quick', 'active',
               'Fail closed before any state tool proceeds.', ?)`,
    ).run(changeId, artifactRoot);
    closeStateDb(db);
    const directory = path.join(proj.dir, artifactRoot);
    fs.mkdirSync(directory, { recursive: true });
    const external = path.join(externalRoot, 'sentinel.json');
    fs.writeFileSync(external, '{"external":"sentinel"}\n');
    fs.symlinkSync(
      external,
      path.join(
        directory,
        '.plan-publish-11111111-1111-4111-8111-111111111111.journal.json',
      ),
    );

    await withClient(proj, async (client) => {
      const blocked = await client.callTool({ name: 'task.list', arguments: {} });
      assert.equal(expectError(blocked).code, 'PLAN_RECOVERY_REQUIRED');

      const report = readToolPayload(await client.callTool({
        name: 'system.doctor',
        arguments: { repair: false },
      }));
      assert.equal(report.checks.plan_publications.status, 'fail');
      assert.ok(report.checks.plan_publications.issues.some((issue) => (
        issue.code === 'PLAN_ARTIFACT_PATH_UNSAFE'
      )));
      assert.equal(fs.readFileSync(external, 'utf8'), '{"external":"sentinel"}\n');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('MCP metadata matches the package and tools/list does not create project state', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      assert.equal(client.getServerVersion().version, PACKAGE_VERSION);
      await client.listTools();
      assert.equal(fs.existsSync(proj.dbPath), false, 'tool discovery must not create .ultra/.runtime/state.db');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('published MCP contract contains exactly the live server tools', () => {
  const manifest = yaml.load(fs.readFileSync(path.join(REPO_ROOT, 'spec', 'mcp-tools.yaml'), 'utf8'));
  const declared = manifest.tools.map((tool) => tool.name).sort();
  const { REGISTERED_TOOLS } = require(SERVER);
  assert.deepEqual(declared, [...REGISTERED_TOOLS].sort());
});

test('workflow MCP contracts publish adaptive recovery and freshness failures', () => {
  const manifest = yaml.load(fs.readFileSync(path.join(REPO_ROOT, 'spec', 'mcp-tools.yaml'), 'utf8'));
  const errorCodes = (name) => new Set(
    manifest.tools.find((tool) => tool.name === name).errors.map((error) => error.code),
  );
  const expected = {
    'workflow.start': [
      'WORKFLOW_AUTHORITY_REQUIRED',
      'WORKFLOW_BASELINE_NOT_READY',
      'WORKFLOW_CHANGE_RESEARCH_INCOMPLETE',
      'WORKFLOW_TASK_NOT_EXECUTABLE',
      'WORKFLOW_PLAN_NOT_COMPLETED',
      'WORKFLOW_PLAN_TASK_SET_STALE',
      'WORKFLOW_PLAN_TASK_CONTRACT_STALE',
    ],
    'workflow.step': [
      'WORKFLOW_NOT_MUTABLE',
      'ILLEGAL_WORKFLOW_STEP_TRANSITION',
      'WORKFLOW_SEMANTIC_SOURCE_INVALID',
      'WORKFLOW_CONTEXT_AUTHORITY_MISMATCH',
      'WORKFLOW_GATE_STALE',
      'WORKFLOW_SESSION_ACTIVE',
    ],
    'workflow.complete': [
      'WORKFLOW_PLAN_ARTIFACT_STALE',
      'WORKFLOW_PLAN_COVERAGE_INCOMPLETE',
      'WORKFLOW_PLAN_TASK_CONTRACT_STALE',
      'WORKFLOW_REPORT_TASK_SET_STALE',
      'WORKFLOW_VERIFICATION_PROFILE_INVALID',
      'WORKFLOW_REVIEW_EVIDENCE_MISMATCH',
      'WORKFLOW_REVIEW_FINDINGS_MISMATCH',
      'WORKFLOW_DELIVERY_CHECK_FAILED',
    ],
  };
  for (const [tool, required] of Object.entries(expected)) {
    const actual = errorCodes(tool);
    assert.deepEqual(
      required.filter((code) => !actual.has(code)),
      [],
      `${tool} omits public recovery errors`,
    );
  }
});

test('task.create + task.get round trip via MCP', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      const created = await client.callTool({
        name: 'task.create',
        arguments: { id: 'mcp-1', title: 'first', type: 'feature', priority: 'P1', estimated_days: 2.5 },
      });
      const createdData = readToolPayload(created);
      assert.equal(createdData.id, 'mcp-1');
      assert.equal(createdData.status, 'pending');

      const got = await client.callTool({ name: 'task.get', arguments: { id: 'mcp-1' } });
      const gotData = readToolPayload(got);
      assert.equal(gotData.task.id, 'mcp-1');
      assert.equal(gotData.task.title, 'first');
      assert.equal(gotData.task.estimated_days, 2.5);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.create requires ready baseline authority or an already-authorized active change', async () => {
  for (const baseline of [
    null,
    { mode: 'greenfield', status: 'draft' },
    { mode: 'migrated', status: 'adopting' },
  ]) {
    const proj = tmpProject();
    try {
      if (baseline) seedBaseline(proj, baseline);
      await withClient(proj, async (client) => {
        const result = await client.callTool({
          name: 'task.create',
          arguments: {
            id: `blocked-${baseline?.mode || 'missing'}`,
            title: 'Must wait for baseline readiness', type: 'feature', priority: 'P1',
          },
        });
        assert.equal(expectError(result).code, 'BASELINE_NOT_READY');
      });
    } finally { fs.rmSync(proj.dir, { recursive: true, force: true }); }
  }

  const incidentProject = tmpProject();
  try {
    seedBaseline(incidentProject, { mode: 'brownfield', status: 'adopting' });
    await withClient(incidentProject, async (client) => {
      const change = await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'incident-task-bypass', title: 'Restore production', kind: 'incident',
          intent: 'Repair the urgent production path while adoption remains incomplete.',
          baseline_bypass: {
            reason: 'Production recovery cannot wait for baseline convergence.',
            approved_by: 'incident-commander',
          },
        }),
      });
      assert.equal(readToolPayload(change).change.id, 'incident-task-bypass');
      const task = await client.callTool({
        name: 'task.create',
        arguments: {
          id: 'authorized-incident-task', title: 'Repair the production path',
          type: 'bugfix', priority: 'P0', change_id: 'incident-task-bypass',
        },
      });
      assert.equal(readToolPayload(task).id, 'authorized-incident-task');
    });
  } finally { fs.rmSync(incidentProject.dir, { recursive: true, force: true }); }
});

test('task.create enforces terminal-change and parent ownership invariants at the MCP boundary', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    const initialized = initStateDb(proj.dbPath);
    for (const [id, status] of [
      ['parent-change', 'active'],
      ['other-change', 'active'],
      ['terminal-change', 'archived'],
    ]) {
      initialized.db.prepare(
        `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
         VALUES (?, ?, 'quick', ?, ?, ?)`,
      ).run(id, id, status, `Intent for ${id}.`, `.ultra/changes/active/${id}`);
    }
    closeStateDb(initialized.db);

    await withClient(proj, async (client) => {
      const parent = await client.callTool({
        name: 'task.create',
        arguments: {
          id: 'owned-parent', title: 'Owned parent task', type: 'feature', priority: 'P1',
          change_id: 'parent-change',
        },
      });
      assert.equal(parent.isError, undefined);

      const child = await client.callTool({
        name: 'task.create',
        arguments: {
          id: 'owned-child', title: 'Owned child task', type: 'feature', priority: 'P1',
          parent_id: 'owned-parent',
        },
      });
      assert.equal(child.isError, undefined);
      const inherited = readToolPayload(await client.callTool({
        name: 'task.get', arguments: { id: 'owned-child' },
      }));
      assert.equal(inherited.task.change_id, 'parent-change');

      const mismatch = await client.callTool({
        name: 'task.create',
        arguments: {
          id: 'cross-change-child', title: 'Cross change child', type: 'feature', priority: 'P1',
          parent_id: 'owned-parent', change_id: 'other-change',
        },
      });
      assert.equal(expectError(mismatch).code, 'TASK_CHANGE_OWNERSHIP_MISMATCH');

      const orphan = await client.callTool({
        name: 'task.create',
        arguments: {
          id: 'orphan-child', title: 'Orphan child task', type: 'feature', priority: 'P1',
          parent_id: 'missing-parent',
        },
      });
      assert.equal(expectError(orphan).code, 'TASK_NOT_FOUND');

      const terminal = await client.callTool({
        name: 'task.create',
        arguments: {
          id: 'terminal-task', title: 'Terminal task', type: 'feature', priority: 'P1',
          change_id: 'terminal-change',
        },
      });
      assert.equal(expectError(terminal).code, 'CHANGE_NOT_MUTABLE');

      const missing = await client.callTool({
        name: 'task.create',
        arguments: {
          id: 'missing-change-task', title: 'Missing change task', type: 'feature', priority: 'P1',
          change_id: 'missing-change',
        },
      });
      assert.equal(expectError(missing).code, 'CHANGE_NOT_FOUND');
    });
  } finally { fs.rmSync(proj.dir, { recursive: true, force: true }); }
});

test('task.parse_prd keeps dry runs read-only and requires change ownership for persistence', async () => {
  const dryProject = tmpProject();
  try {
    const { db } = initStateDb(dryProject.dbPath);
    try {
      const result = await dispatchTool('task.parse_prd', {
        tasks: prdTasks('dry-run-task'), dry_run: true,
      }, db, { rootDir: dryProject.dir });
      assert.equal(result.tasks[0].id, 'dry-run-task');
      assert.equal(ops.listTasks(db, {}).length, 0);
    } finally { closeStateDb(db); }
  } finally { fs.rmSync(dryProject.dir, { recursive: true, force: true }); }

  for (const baseline of [
    null,
    { mode: 'greenfield', status: 'draft' },
    { mode: 'migrated', status: 'adopting' },
  ]) {
    const proj = tmpProject();
    try {
      if (baseline) seedBaseline(proj, baseline);
      const { db } = initStateDb(proj.dbPath);
      try {
        await assert.rejects(
          dispatchTool('task.parse_prd', {
            tasks: prdTasks(`blocked-prd-${baseline?.mode || 'missing'}`), dry_run: false,
          }, db, { rootDir: proj.dir }),
          (error) => error.code === 'CHANGE_REQUIRED',
        );
        assert.equal(ops.listTasks(db, {}).length, 0);
      } finally { closeStateDb(db); }
    } finally { fs.rmSync(proj.dir, { recursive: true, force: true }); }
  }
});

test('task.parse_prd persists only under approved-ready change or incident break-glass authority', async () => {
  const readyProject = tmpProject();
  try {
    seedReadyBaseline(readyProject);
    const { db } = initStateDb(readyProject.dbPath);
    try {
      await assert.rejects(
        dispatchTool('task.parse_prd', {
          tasks: prdTasks('ready-prd-task'), dry_run: false,
        }, db, { rootDir: readyProject.dir }),
        (error) => error.code === 'CHANGE_REQUIRED',
      );
      assert.equal(ops.readTask(db, 'ready-prd-task'), null);
    } finally { closeStateDb(db); }
  } finally { fs.rmSync(readyProject.dir, { recursive: true, force: true }); }

  for (const kind of ['quick', 'incident']) {
    const proj = tmpProject();
    try {
      seedReadyBaseline(proj);
      const { db } = initStateDb(proj.dbPath);
      try {
        if (kind === 'incident') {
          db.prepare(
            "UPDATE baselines SET mode = 'brownfield', status = 'adopting' WHERE id = 'test-baseline'",
          ).run();
        }
        const changeId = `parsed-${kind}`;
        changes.createChange(db, completeChangeInput({
          id: changeId,
          title: kind === 'incident' ? 'Recover parsed incident work' : 'Continue parsed ordinary work',
          kind,
          intent: 'Keep parsed tasks bound to the already-authorized continuous change.',
          ...(kind === 'incident' ? {
            baseline_bypass: {
              approved_by: 'incident-commander',
              reason: 'Production recovery requires an approved task graph before adoption converges.',
            },
          } : {}),
        }), { rootDir: proj.dir });
        const taskId = `parsed-${kind}-task`;
        await dispatchTool('task.parse_prd', {
          tasks: prdTasks(taskId), dry_run: false, change_id: changeId,
        }, db, { rootDir: proj.dir });
        assert.equal(ops.readTask(db, taskId).change_id, changeId);
      } finally { closeStateDb(db); }
    } finally { fs.rmSync(proj.dir, { recursive: true, force: true }); }
  }
});

test('state-backed MCP tools fail closed when a non-empty v4.4 tasks.json meets an empty state.db', async () => {
  const proj = tmpProject();
  try {
    const tasksDir = path.join(proj.dir, '.ultra', 'tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.writeFileSync(path.join(tasksDir, 'tasks.json'), JSON.stringify({
      version: '4.4',
      tasks: [{
        id: 'legacy-1', title: 'legacy task', type: 'feature', priority: 'P1',
        status: 'pending', dependencies: [], estimated_days: 1,
        context_file: 'contexts/task-legacy-1.md',
      }],
    }));

    await withClient(proj, async (client) => {
      const listed = await client.callTool({ name: 'task.list', arguments: {} });
      const error = expectError(listed);
      assert.equal(error.code, 'LEGACY_STATE_MIGRATION_REQUIRED');
      assert.match(error.message, /ultra-tools migrate --from=4\.4 --to=4\.5/);
      assert.equal(error.details.legacy_task_count, 1);

      const created = await client.callTool({
        name: 'task.create',
        arguments: { title: 'must not overwrite legacy', type: 'feature', priority: 'P1' },
      });
      assert.equal(expectError(created).code, 'LEGACY_STATE_MIGRATION_REQUIRED');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('state-backed MCP tools return the supported v4.5 projection migration command', async () => {
  const proj = tmpProject();
  try {
    const tasksDir = path.join(proj.dir, '.ultra', 'tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.writeFileSync(path.join(tasksDir, 'tasks.json'), JSON.stringify({
      schema_version: '4.5', source: '.ultra/.runtime/state.db',
      tasks: [{
        id: 'projection-only', title: 'projection-only task', type: 'feature', priority: 'P1',
        status: 'pending', deps: [], estimated_days: 1,
      }],
    }));

    await withClient(proj, async (client) => {
      const listed = await client.callTool({ name: 'task.list', arguments: {} });
      const error = expectError(listed);
      assert.equal(error.code, 'LEGACY_STATE_MIGRATION_REQUIRED');
      assert.match(error.message, /ultra-tools migrate --from=4\.5 --to=12\.0/);
      assert.equal(error.details.projection_version, '4.5');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.update enforces the status state machine', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'sm-1', title: 'state-machine task', type: 'feature', priority: 'P0' },
      });
      const updated = await client.callTool({
        name: 'task.update',
        arguments: { id: 'sm-1', patch: { status: 'in_progress' } },
      });
      assert.equal(readToolPayload(updated).task.status, 'in_progress');

      const completed = await client.callTool({
        name: 'task.update',
        arguments: { id: 'sm-1', patch: { status: 'completed' } },
      });
      assert.equal(readToolPayload(completed).task.status, 'completed');

      const illegal = await client.callTool({
        name: 'task.update',
        arguments: { id: 'sm-1', patch: { status: 'pending' } },
      });
      const err = expectError(illegal);
      assert.equal(err.code, 'ILLEGAL_STATUS_TRANSITION');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.update preserves established change ownership and freezes terminal change tasks', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    const initialized = initStateDb(proj.dbPath);
    try {
      for (const id of ['update-change-a', 'update-change-b', 'update-terminal']) {
        initialized.db.prepare(
          `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
           VALUES (?, ?, 'quick', 'active', ?, ?)`,
        ).run(id, id, `Intent for ${id}.`, `.ultra/changes/active/${id}`);
      }
      ops.createTask(initialized.db, {
        id: 'update-owned-root', title: 'Owned root task', type: 'feature', priority: 'P1',
        change_id: 'update-change-a',
      });
      ops.createTask(initialized.db, {
        id: 'update-terminal-task', title: 'Terminal change task', type: 'feature', priority: 'P1',
        change_id: 'update-terminal',
      });
      initialized.db.prepare("UPDATE changes SET status = 'archived' WHERE id = 'update-terminal'").run();
    } finally { closeStateDb(initialized.db); }

    await withClient(proj, async (client) => {
      const detach = await client.callTool({
        name: 'task.update', arguments: { id: 'update-owned-root', patch: { change_id: null } },
      });
      assert.equal(expectError(detach).code, 'TASK_CHANGE_OWNERSHIP_MISMATCH');

      const cross = await client.callTool({
        name: 'task.update',
        arguments: { id: 'update-owned-root', patch: { change_id: 'update-change-b' } },
      });
      assert.equal(expectError(cross).code, 'TASK_CHANGE_OWNERSHIP_MISMATCH');

      const terminal = await client.callTool({
        name: 'task.update', arguments: { id: 'update-terminal-task', patch: { priority: 'P0' } },
      });
      assert.equal(expectError(terminal).code, 'CHANGE_NOT_MUTABLE');

      await client.callTool({
        name: 'task.create',
        arguments: { id: 'update-unowned', title: 'Unowned task', type: 'feature', priority: 'P1' },
      });
      const firstBinding = readToolPayload(await client.callTool({
        name: 'task.update',
        arguments: { id: 'update-unowned', patch: { change_id: 'update-change-b' } },
      }));
      assert.equal(firstBinding.task.change_id, 'update-change-b');
    });
  } finally { fs.rmSync(proj.dir, { recursive: true, force: true }); }
});

test('task.append_event + subscribe_events drive a monotonic cursor for observations', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'sub-1', title: 'subscribe target', type: 'feature', priority: 'P1' },
      });
      // task.create already emitted event_id=1 (task_created); add 4 observations.
      for (let i = 0; i < 4; i++) {
        await client.callTool({
          name: 'task.append_event',
          arguments: { type: 'cost_alert', task_id: 'sub-1', payload: { i } },
        });
      }

      const first = readToolPayload(await client.callTool({
        name: 'task.subscribe_events',
        arguments: { since_id: 0, limit: 3 },
      }));
      assert.equal(first.events.length, 3);
      assert.equal(first.events[0].id, 1);
      assert.equal(first.next_since_id, 3);

      const tail = readToolPayload(await client.callTool({
        name: 'task.subscribe_events',
        arguments: { since_id: first.next_since_id, limit: 100 },
      }));
      assert.equal(tail.events.length, 2);
      assert.equal(tail.events[0].id, 4);
      assert.equal(tail.next_since_id, 5);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.append_event cannot forge lifecycle authority', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      for (const type of ['task_completed', 'plan_approved', 'change_converged']) {
        const response = await client.callTool({
          name: 'task.append_event',
          arguments: { type, payload: { forged: true } },
        });
        assert.equal(expectError(response).code, 'VALIDATION_ERROR');
      }
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.list filters by status and tag', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({ name: 'task.create', arguments: { id: 'l-1', title: 'list one', type: 'feature', priority: 'P0', tag: 'main' } });
      await client.callTool({ name: 'task.create', arguments: { id: 'l-2', title: 'list two', type: 'feature', priority: 'P1', tag: 'main' } });
      await client.callTool({ name: 'task.create', arguments: { id: 'l-3', title: 'list three', type: 'feature', priority: 'P2', tag: 'feat-x' } });
      await client.callTool({ name: 'task.update', arguments: { id: 'l-2', patch: { status: 'in_progress' } } });

      const inProg = readToolPayload(await client.callTool({
        name: 'task.list', arguments: { status: 'in_progress' },
      }));
      assert.equal(inProg.count, 1);
      assert.equal(inProg.tasks[0].id, 'l-2');

      const onMain = readToolPayload(await client.callTool({
        name: 'task.list', arguments: { tag: 'main' },
      }));
      assert.equal(onMain.count, 2);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.create rejects bad input via the JSON Schema validator', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const bad = await client.callTool({
        name: 'task.create',
        arguments: { title: 'no priority field', type: 'feature' },
      });
      const err = expectError(bad);
      assert.equal(err.code, 'VALIDATION_ERROR');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('change.context publishes bounded exact spec_refs and rejects an inline blob at the MCP boundary', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const listed = await client.listTools();
      const contextTool = listed.tools.find((tool) => tool.name === 'change.context');
      const specRefs = contextTool.inputSchema.properties.spec_refs;
      assert.equal(specRefs.maxItems, 64);
      assert.equal(specRefs.items.additionalProperties, false);
      assert.deepEqual(specRefs.items.required, ['ref']);
      assert.equal(specRefs.items.properties.reason.maxLength, 2_048);
      assert.deepEqual(
        contextTool.inputSchema.not,
        { required: ['context_refs', 'spec_refs'] },
      );

      const invalid = await client.callTool({
        name: 'change.context',
        arguments: {
          id: 'schema-only',
          spec_refs: [{
            ref: '.ultra/specs/product.md',
            reason: 'Current product authority.',
            inline_blob: 'x'.repeat(200_000),
          }],
        },
      });
      assert.equal(expectError(invalid).code, 'VALIDATION_ERROR');
      const ambiguous = await client.callTool({
        name: 'change.context',
        arguments: {
          id: 'schema-only',
          context_refs: [],
          spec_refs: [{
            ref: '.ultra/specs/product.md',
            reason: 'Must not be silently discarded.',
          }],
        },
      });
      assert.equal(expectError(ambiguous).code, 'VALIDATION_ERROR');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('mutating tools trigger the projector — tasks.json appears under .ultra/', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'pj-1', title: 'projection wired', type: 'feature', priority: 'P1' },
      });
    });
    const tasksJson = path.join(proj.dir, '.ultra', 'tasks', 'tasks.json');
    assert.ok(fs.existsSync(tasksJson), 'projector should have written tasks.json');
    const data = JSON.parse(fs.readFileSync(tasksJson, 'utf8'));
    assert.equal(data.schema_version, '4.5');
    assert.equal(data.tasks[0].id, 'pj-1');
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('output schema drift cannot strand a committed mutation without a projection job', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    const runtimeRoot = path.join(proj.dir, 'runtime-contract');
    fs.mkdirSync(path.join(runtimeRoot, 'spec', 'schemas'), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, 'package.json'), path.join(runtimeRoot, 'package.json'));
    fs.copyFileSync(
      path.join(REPO_ROOT, 'spec', 'schemas', 'state-db.sql'),
      path.join(runtimeRoot, 'spec', 'schemas', 'state-db.sql'),
    );
    const manifest = yaml.load(
      fs.readFileSync(path.join(REPO_ROOT, 'spec', 'mcp-tools.yaml'), 'utf8'),
    );
    const createTool = manifest.tools.find((tool) => tool.name === 'task.create');
    createTool.output_schema.required = ['impossible_output_field'];
    createTool.output_schema.properties.impossible_output_field = { type: 'string' };
    fs.writeFileSync(
      path.join(runtimeRoot, 'spec', 'mcp-tools.yaml'),
      yaml.dump(manifest, { noRefs: true, lineWidth: 120 }),
    );

    await withClient(proj, async (client) => {
      const result = await client.callTool({
        name: 'task.create',
        arguments: { id: 'schema-drift', title: 'schema drift', type: 'feature', priority: 'P1' },
      });
      const error = expectError(result);
      assert.equal(error.code, 'OUTPUT_SCHEMA_DRIFT');
      assert.equal(error.details._ultra.state_commit, 'committed');
      assert.equal(error.details._ultra.projection_status, 'completed');
    }, { UBP_RUNTIME_ROOT: runtimeRoot });

    const db = new Database(proj.dbPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE id = ?').get('schema-drift').count, 1);
      const job = db.prepare(
        "SELECT status FROM projection_jobs WHERE tool_name = 'task.create' ORDER BY id DESC LIMIT 1",
      ).get();
      assert.deepEqual(job, { status: 'completed' });
    } finally {
      db.close();
    }
    assert.ok(fs.existsSync(path.join(proj.dir, '.ultra', 'tasks', 'tasks.json')));
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.init_project creates .ultra/ skeleton in a fresh target directory', async () => {
  const proj = tmpProject();
  const freshTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-target-'));
  try {
    await withClient(proj, async (client) => {
      const res = await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: freshTarget, project_name: 'mcp-init', project_type: 'cli' },
      });
      const payload = readToolPayload(res);
      assert.equal(payload.status, 'created');
      assert.equal(payload.created_path, path.join(freshTarget, '.ultra'));
      assert.equal(
        payload.state_db_path,
        path.join(freshTarget, '.ultra', '.runtime', 'state.db'),
      );
      assert.equal(payload.mode, 'greenfield');
      assert.equal(payload.baseline.status, 'draft');
      assert.ok(fs.existsSync(payload.state_db_path));
      assert.ok(payload.copied_files.includes('tasks/tasks.json'));
      const tasksJson = JSON.parse(fs.readFileSync(path.join(payload.created_path, 'tasks', 'tasks.json'), 'utf8'));
      assert.equal(tasksJson.source, '.ultra/.runtime/state.db');
      assert.deepEqual(tasksJson.tasks, []);
      const state = new Database(payload.state_db_path, { readonly: true });
      try {
        assert.deepEqual(
          state.prepare('SELECT project_name, project_type, mode FROM baselines').get(),
          { project_name: 'mcp-init', project_type: 'cli', mode: 'greenfield' },
        );
      } finally {
        state.close();
      }
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
    fs.rmSync(freshTarget, { recursive: true, force: true });
  }
});

test('task.init_project returns ULTRA_DIR_EXISTS on re-init without overwrite', async () => {
  const proj = tmpProject();
  const freshTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-target-'));
  try {
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: freshTarget, project_name: 'once' },
      });
      const second = await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: freshTarget, project_name: 'twice' },
      });
      const err = expectError(second);
      assert.equal(err.code, 'ULTRA_DIR_EXISTS');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
    fs.rmSync(freshTarget, { recursive: true, force: true });
  }
});

test('task.init_project resume preserves existing files and installs missing current assets', async () => {
  const proj = tmpProject();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-resume-'));
  try {
    fs.mkdirSync(path.join(target, '.ultra', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(target, '.ultra', 'specs', 'product.md'), '# Preserved contract\n');
    await withClient(proj, async (client) => {
      const result = await client.callTool({
        name: 'task.init_project',
        arguments: {
          target_dir: target, project_name: 'resume-project', mode: 'brownfield', resume: true,
        },
      });
      const payload = readToolPayload(result);
      assert.equal(payload.status, 'resumed');
      assert.equal(payload.baseline.status, 'adopting');
      assert.equal(
        fs.readFileSync(path.join(target, '.ultra', 'specs', 'product.md'), 'utf8'),
        '# Preserved contract\n',
      );
      assert.ok(payload.copied_files.includes('specs/architecture.md'));
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  }
});

async function seedTask(client, id = 's-1') {
  await client.callTool({
    name: 'task.create',
    arguments: { id, title: 'session target', type: 'feature', priority: 'P1' },
  });
}

test('session.admission_check + session.spawn: happy path returns sid and paths', async () => {
  const proj = tmpProject();
  try {
    ensureGitProject(proj);
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await seedTask(client, 's-happy');

      const admission = await client.callTool({
        name: 'session.admission_check',
        arguments: { task_id: 's-happy' },
      });
      const verdict = readToolPayload(admission);
      assert.equal(verdict.can_spawn, true, JSON.stringify(verdict));
      assert.equal(verdict.recommended_action, 'spawn');

      const spawn = await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-happy', runtime: 'claude' },
      });
      const session = readToolPayload(spawn);
      assert.match(session.sid, /^sess-/);
      assert.ok(session.worktree_path.includes(session.sid));
      assert.ok(
        session.artifact_dir.endsWith(
          path.join('.ultra', '.runtime', 'sessions', session.sid),
        ),
      );
      assert.ok(session.lease_expires_at);
      assert.equal(session.worktree_created, true);
      assert.ok(fs.existsSync(session.worktree_path));
      assert.ok(fs.existsSync(session.artifact_dir));
      assert.equal(
        execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: session.worktree_path, encoding: 'utf8',
        }).trim(),
        execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: proj.dir, encoding: 'utf8',
        }).trim(),
      );
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.admission_check reports the same plan gate enforced by session.spawn', async () => {
  const proj = tmpProject();
  const { db } = initStateDb(proj.dbPath);
  try {
    ensureGitProject(proj);
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES ('session-gate-change', 'Session gate', 'standard', 'active',
               'Require approved plan authority before session creation.',
               '.ultra/changes/active/session-gate-change')`,
    ).run();
    ops.createTask(db, {
      id: 'session-gate-task',
      title: 'Reject unapproved session work',
      type: 'feature',
      priority: 'P1',
      change_id: 'session-gate-change',
      outcome: 'Admission and spawn share one plan gate.',
      slice_kind: 'tracer_bullet',
      public_seam: 'session admission',
      verification_command: 'npm run test:state',
      acceptance: [{
        id: 'same-gate',
        criterion: 'Unapproved change work is not admitted.',
        verification: 'npm run test:state',
      }],
      context_refs: [{ ref: 'spec/mcp-tools.yaml', reason: 'Session contract.', required: true }],
      docs_impact: { status: 'none', files: [], rationale: 'No user-facing docs.' },
      ownership: { owner: 'test-owner', reviewers: [] },
      trace_to: 'spec/mcp-tools.yaml#session-family',
    });
    await assert.rejects(
      dispatchTool(
        'session.admission_check',
        { task_id: 'session-gate-task' },
        db,
        { rootDir: proj.dir },
      ),
      (error) => error.code === 'WORKFLOW_PLAN_NOT_COMPLETED',
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
  } finally {
    closeStateDb(db);
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('an active worker cannot recursively spawn a nested Ultra session', async () => {
  const proj = tmpProject();
  try {
    ensureGitProject(proj);
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await seedTask(client, 's-nested');
      const result = await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-nested', runtime: 'codex', takeover: true },
      });
      assert.equal(expectError(result).code, 'NESTED_SESSION_FORBIDDEN');
      const { db } = initStateDb(proj.dbPath);
      try {
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
      } finally {
        closeStateDb(db);
      }
    }, { UBP_SESSION_ID: 'sess-current-worker' });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('an active worker cannot close its parent-owned lease before process settlement', async () => {
  const proj = tmpProject();
  const child = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 60000);'],
    { stdio: 'ignore' },
  );
  try {
    ensureGitProject(proj);
    seedReadyBaseline(proj);
    const { db } = initStateDb(proj.dbPath);
    try {
      ops.createTask(db, {
        id: 's-self-close', title: 'self close', type: 'feature', priority: 'P1',
      });
      ops.createSession(db, {
        sid: 'sess-self-close',
        task_id: 's-self-close',
        runtime: 'codex',
        pid: child.pid,
        worktree_path: proj.dir,
        artifact_dir: path.join(
          proj.dir,
          '.ultra',
          '.runtime',
          'sessions',
          'sess-self-close',
        ),
      });
    } finally {
      closeStateDb(db);
    }

    await withClient(proj, async (client) => {
      const result = await client.callTool({
        name: 'session.close',
        arguments: { sid: 'sess-self-close', status: 'completed' },
      });
      assert.equal(expectError(result).code, 'WORKER_SESSION_PARENT_OWNED');
      assert.doesNotThrow(() => process.kill(child.pid, 0));
      const { db } = initStateDb(proj.dbPath);
      try {
        assert.equal(ops.readSession(db, 'sess-self-close').status, 'running');
      } finally {
        closeStateDb(db);
      }
    }, { UBP_SESSION_ID: 'sess-self-close' });
  } finally {
    try { process.kill(child.pid, 'SIGKILL'); } catch { /* already stopped */ }
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.spawn rejects a retired runtime at the MCP schema boundary', async () => {
  const proj = tmpProject();
  const retiredRuntime = ['gem', 'ini'].join('');
  try {
    await withClient(proj, async (client) => {
      await seedTask(client, 's-runtime-guard');
      const spawn = await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-runtime-guard', runtime: retiredRuntime },
      });
      assert.equal(expectError(spawn).code, 'VALIDATION_ERROR');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.spawn refuses second session for same task without takeover (ADMISSION_DENIED)', async () => {
  const proj = tmpProject();
  try {
    ensureGitProject(proj);
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await seedTask(client, 's-conflict');
      await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-conflict', runtime: 'claude' },
      });

      const admissionAgain = await client.callTool({
        name: 'session.admission_check',
        arguments: { task_id: 's-conflict' },
      });
      const verdict = readToolPayload(admissionAgain);
      assert.equal(verdict.can_spawn, false);
      assert.ok(verdict.conflict);

      const second = await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-conflict', runtime: 'opencode' },
      });
      const err = expectError(second);
      assert.equal(err.code, 'ADMISSION_DENIED');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.spawn with takeover=true crashes the old session and succeeds', async () => {
  const proj = tmpProject();
  try {
    ensureGitProject(proj);
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await seedTask(client, 's-takeover');
      const first = readToolPayload(await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-takeover', runtime: 'claude' },
      }));

      const second = readToolPayload(await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-takeover', runtime: 'codex', takeover: true },
      }));
      assert.notEqual(second.sid, first.sid);

      const firstAfter = readToolPayload(await client.callTool({
        name: 'session.get', arguments: { sid: first.sid },
      }));
      assert.equal(firstAfter.session.status, 'crashed');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.subscribe_events sees task events with ≤1s latency (D31 id cursor)', async () => {
  const proj = tmpProject();
  try {
    ensureGitProject(proj);
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await seedTask(client, 's-sub');

      // pin cursor before any writes
      const before = readToolPayload(await client.callTool({
        name: 'session.subscribe_events',
        arguments: { since_id: 0 },
      }));
      const cursor = before.next_since_id;

      const t0 = Date.now();
      await client.callTool({
        name: 'task.update',
        arguments: { id: 's-sub', patch: { status: 'in_progress' } },
      });

      const after = readToolPayload(await client.callTool({
        name: 'session.subscribe_events',
        arguments: { since_id: cursor },
      }));
      const elapsedMs = Date.now() - t0;
      assert.ok(after.events.length >= 1, 'expected at least one new event');
      const types = after.events.map((e) => e.type);
      const sawTransition = types.some((t) => t === 'task_started' || t === 'task_status_changed');
      assert.ok(sawTransition, `got event types ${JSON.stringify(types)}`);
      assert.ok(elapsedMs < 1000, `latency ${elapsedMs}ms exceeds 1s budget`);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.subscribe_events filters events by sid', async () => {
  const proj = tmpProject();
  try {
    ensureGitProject(proj);
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await seedTask(client, 's-filter-a');
      await seedTask(client, 's-filter-b');
      const sessionA = readToolPayload(await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-filter-a', runtime: 'claude' },
      }));
      const sessionB = readToolPayload(await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-filter-b', runtime: 'codex' },
      }));
      const before = readToolPayload(await client.callTool({
        name: 'session.subscribe_events',
        arguments: { since_id: 0 },
      }));

      await client.callTool({
        name: 'task.append_event',
        arguments: { type: 'context_updated', task_id: 's-filter-a', session_id: sessionA.sid },
      });
      await client.callTool({
        name: 'task.append_event',
        arguments: { type: 'context_updated', task_id: 's-filter-b', session_id: sessionB.sid },
      });

      const filtered = readToolPayload(await client.callTool({
        name: 'session.subscribe_events',
        arguments: { since_id: before.next_since_id, sid: sessionA.sid },
      }));
      assert.equal(filtered.events.length, 1);
      assert.equal(filtered.events[0].session_id, sessionA.sid);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('MCP rejects declared inputs that have no runtime behavior', async () => {
  const proj = tmpProject();
  try {
    ensureGitProject(proj);
    await withClient(proj, async (client) => {
      await seedTask(client, 'unused-inputs');
      const session = readToolPayload(await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 'unused-inputs', runtime: 'claude' },
      }));

      const manual = await client.callTool({
        name: 'task.expand',
        arguments: { id: 'unused-inputs', strategy: 'manual' },
      });
      assert.equal(expectError(manual).code, 'VALIDATION_ERROR');

      const notes = await client.callTool({
        name: 'session.close',
        arguments: { sid: session.sid, status: 'completed', notes: 'ignored before contract fix' },
      });
      assert.equal(expectError(notes).code, 'VALIDATION_ERROR');

      const tag = await client.callTool({
        name: 'plan.get',
        arguments: { tag: 'ignored-before-contract-fix' },
      });
      assert.equal(expectError(tag).code, 'VALIDATION_ERROR');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.heartbeat refreshes lease; session.close marks completed', async () => {
  const proj = tmpProject();
  try {
    ensureGitProject(proj);
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await seedTask(client, 's-heart');
      const spawn = readToolPayload(await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-heart', runtime: 'claude' },
      }));
      const firstLease = spawn.lease_expires_at;

      // heartbeat extends the lease
      await new Promise((r) => setTimeout(r, 5));
      const hb = readToolPayload(await client.callTool({
        name: 'session.heartbeat', arguments: { sid: spawn.sid },
      }));
      assert.equal(hb.ok, true);
      assert.ok(Date.parse(hb.lease_expires_at) >= Date.parse(firstLease));

      // close flips status
      const closed = readToolPayload(await client.callTool({
        name: 'session.close',
        arguments: { sid: spawn.sid, status: 'completed' },
      }));
      assert.equal(closed.ok, true);
      assert.equal(closed.worktree_preserved, true);
      assert.ok(fs.existsSync(spawn.worktree_path));

      const got = readToolPayload(await client.callTool({
        name: 'session.get', arguments: { sid: spawn.sid },
      }));
      assert.equal(got.session.status, 'completed');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.close removes only a clean worktree whose commit is integrated', async () => {
  const proj = tmpProject();
  try {
    ensureGitProject(proj);
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await seedTask(client, 's-cleanup');
      const spawned = readToolPayload(await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-cleanup', runtime: 'codex' },
      }));

      const closed = readToolPayload(await client.callTool({
        name: 'session.close',
        arguments: {
          sid: spawned.sid,
          status: 'completed',
          remove_worktree: true,
        },
      }));
      assert.equal(closed.ok, true);
      assert.equal(closed.worktree_preserved, false);
      assert.equal(fs.existsSync(spawned.worktree_path), false);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.close refuses to delete uncommitted work', async () => {
  const proj = tmpProject();
  try {
    ensureGitProject(proj);
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await seedTask(client, 's-unsafe-cleanup');
      const spawned = readToolPayload(await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-unsafe-cleanup', runtime: 'opencode' },
      }));
      fs.writeFileSync(path.join(spawned.worktree_path, 'preserve.txt'), 'uncommitted\n');

      const result = await client.callTool({
        name: 'session.close',
        arguments: {
          sid: spawned.sid,
          status: 'completed',
          remove_worktree: true,
        },
      });
      assert.equal(expectError(result).code, 'WORKTREE_NOT_INTEGRATED');
      assert.equal(fs.existsSync(spawned.worktree_path), true);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('retired memory tools are rejected as unknown', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const result = await client.callTool({
        name: 'memory.retain',
        arguments: { kind: 'decision', content: 'must not be retained' },
      });
      assert.equal(expectError(result).code, 'UNKNOWN_TOOL');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.dependency_topo: happy path groups tasks into correct waves', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      for (const [id, deps] of [['A', []], ['B', ['A']], ['C', ['A']]]) {
        await client.callTool({
          name: 'task.create',
          arguments: { id, title: `task ${id}`, type: 'feature', priority: 'P2', deps },
        });
      }
      const resp = await client.callTool({
        name: 'task.dependency_topo',
        arguments: { task_ids: ['A', 'B', 'C'] },
      });
      const data = readToolPayload(resp);
      assert.equal(data.waves.length, 2);
      assert.deepEqual(new Set(data.waves[0]), new Set(['A']));
      assert.deepEqual(new Set(data.waves[1]), new Set(['B', 'C']));
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.dependency_topo scopes a plan graph to one owning change and rejects an implicit all-task graph', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'topo-change', title: 'Scope dependency topology', kind: 'standard',
          intent: 'Keep execution-plan topology isolated to its owning change.',
          docs_impact: { status: 'none', files: [], rationale: 'Contract fixture.' },
        }),
      });
      for (const [id, deps, changeId] of [
        ['scope-a', [], 'topo-change'],
        ['scope-b', ['scope-a'], 'topo-change'],
        ['unrelated-task', [], null],
      ]) {
        await client.callTool({
          name: 'task.create',
          arguments: {
            id, title: `task ${id}`, type: 'feature', priority: 'P2', deps,
            ...(changeId ? { change_id: changeId } : {}),
          },
        });
      }
      const scoped = readToolPayload(await client.callTool({
        name: 'task.dependency_topo', arguments: { change_id: 'topo-change' },
      }));
      assert.deepEqual(scoped.waves, [['scope-a'], ['scope-b']]);

      const implicit = await client.callTool({
        name: 'task.dependency_topo', arguments: {},
      });
      assert.equal(expectError(implicit).code, 'VALIDATION_ERROR');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.parse_prd: missing host-derived tasks → validation error', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const resp = await client.callTool({ name: 'task.parse_prd', arguments: {} });
      const err = expectError(resp);
      assert.equal(err.code, 'VALIDATION_ERROR');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.parse_prd works without provider credentials', async () => {
  const proj = tmpProject();
  try {
    await withClientNoLlmKey(proj, async (client) => {
      const resp = await client.callTool({
        name: 'task.parse_prd',
        arguments: { tasks: prdTasks('no-key-prd'), dry_run: true },
      });
      const data = readToolPayload(resp);
      assert.equal(data.tasks[0].id, 'no-key-prd');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.expand: unknown parent → TASK_NOT_FOUND without a provider key', async () => {
  const proj = tmpProject();
  try {
    await withClientNoLlmKey(proj, async (client) => {
      const resp = await client.callTool({
        name: 'task.expand',
        arguments: {
          id: 'nonexistent-parent',
          children: [{
            id: 'unused-child', title: 'Unused child task',
            type: 'feature', priority: 'P1',
          }],
        },
      });
      const err = expectError(resp);
      assert.equal(err.code, 'TASK_NOT_FOUND');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.expand persists host-derived children without provider credentials', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClientNoLlmKey(proj, async (client) => {
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'parent-1', title: 'Build something complex', type: 'feature', priority: 'P1', complexity: 9 },
      });
      const resp = await client.callTool({
        name: 'task.expand',
        arguments: {
          id: 'parent-1',
          children: [{
            id: 'child-no-key', title: 'Implement child without provider key',
            type: 'feature', priority: 'P1', complexity: 4, deps: [], files_modified: [],
          }],
        },
      });
      const data = readToolPayload(resp);
      assert.equal(data.children[0].id, 'child-no-key');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('plan.export: no tasks → NO_TASKS', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'empty-plan-change', title: 'Empty plan change', kind: 'quick',
          intent: 'Prove that an empty change cannot be exported.',
          docs_impact: { status: 'none', files: [], rationale: 'Test fixture.' },
        }),
      });
      const resp = await client.callTool({
        name: 'plan.export',
        arguments: { change_id: 'empty-plan-change' },
      });
      const err = expectError(resp);
      assert.equal(err.code, 'NO_TASKS');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('plan.export → plan.get round trip: artifact on disk + retrievable', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'plan-change', title: 'Plan one bounded change', kind: 'standard',
          intent: 'Export only tasks owned by this change.',
          docs_impact: { status: 'none', files: [], rationale: 'Test fixture.' },
        }),
      });
      for (const [id, deps, files] of [
        ['p-a', [], ['src/a.ts']],
        ['p-b', ['p-a'], ['src/b.ts']],
        ['p-c', ['p-a'], ['src/c.ts']],
      ]) {
        await client.callTool({
          name: 'task.create',
          arguments: {
            id, title: `task ${id}`, type: 'feature', priority: 'P2', complexity: 3,
            deps, files_modified: files, change_id: 'plan-change',
          },
        });
      }
      const context = readToolPayload(await client.callTool({
        name: 'change.context',
        arguments: { id: 'plan-change', role: 'plan', gate: 'planning' },
      }));
      assert.equal(context.manifest.readiness.status, 'ready');
      const exp = await client.callTool({
        name: 'plan.export',
        arguments: { change_id: 'plan-change' },
      });
      const expData = readToolPayload(exp);
      assert.equal(expData.wave_count, 2);
      assert.ok(fs.existsSync(expData.plan_path), 'artifact file must exist');
      assert.ok(fs.existsSync(expData.plan_md_path), 'human-readable plan must exist');
      assert.match(
        expData.plan_path,
        /\.ultra\/changes\/active\/plan-change\/plan\.json$/,
      );
      assert.equal(exp._meta.ultra.projection_status, 'completed');
      const planArtifact = readToolPayload(await client.callTool({
        name: 'artifact.get',
        arguments: { path: path.relative(proj.dir, expData.plan_path) },
      })).artifact;
      assert.equal(planArtifact.metadata.context_snapshot_id, context.manifest.snapshot_id);
      assert.equal(planArtifact.metadata.context_digest, context.manifest_hash);
      assert.match(
        planArtifact.provenance.publication_transaction_id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const exportedEvents = readToolPayload(await client.callTool({
        name: 'task.subscribe_events',
        arguments: { since_id: 0, types: ['plan_exported', 'plan_approved'], limit: 100 },
      }));
      assert.deepEqual(exportedEvents.events.map((event) => event.type), ['plan_exported']);
      assert.equal(
        exportedEvents.events[0].payload.publication_transaction_id,
        planArtifact.provenance.publication_transaction_id,
      );

      const got = await client.callTool({
        name: 'plan.get', arguments: { change_id: 'plan-change', section: 'topo' },
      });
      const gotData = readToolPayload(got);
      assert.ok(Array.isArray(gotData.plan.waves));
      assert.equal(gotData.plan.waves.length, 2);

      const forged = path.join(proj.dir, 'forged-plan.json');
      fs.writeFileSync(forged, `${JSON.stringify({
        ...gotData.plan,
        change_id: 'plan-change',
        waves: [{ id: 1, tasks: ['forged-task'], parallel: false }],
      })}\n`);
      fs.rmSync(expData.plan_path);
      fs.symlinkSync(forged, expData.plan_path);
      const rejected = await client.callTool({
        name: 'plan.get', arguments: { change_id: 'plan-change' },
      });
      assert.equal(expectError(rejected).code, 'PLAN_ARTIFACT_INVALID');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('plan.export surfaces commit cleanup residue and marks in-process recovery dirty', async () => {
  const proj = tmpProject();
  const { db } = initStateDb(proj.dbPath);
  const originalRecord = artifactRegistry.recordArtifactInTx;
  let marked = null;
  try {
    seedCompleteBaseline(db, { rootDir: proj.dir });
    await dispatchTool('change.create', completeChangeInput({
      id: 'plan-cleanup-fault',
      title: 'Surface plan cleanup residue',
      kind: 'standard',
      intent: 'Never acknowledge a plan export while publication cleanup is incomplete.',
      docs_impact: { status: 'none', files: [], rationale: 'Test fixture.' },
    }), db, { rootDir: proj.dir });
    await dispatchTool('task.create', {
      id: 'plan-cleanup-task',
      title: 'Publish a recoverable plan',
      type: 'feature',
      priority: 'P1',
      complexity: 3,
      deps: [],
      files_modified: ['src/plan-cleanup.ts'],
      change_id: 'plan-cleanup-fault',
    }, db, { rootDir: proj.dir });
    await dispatchTool('change.context', {
      id: 'plan-cleanup-fault',
      role: 'plan',
      gate: 'planning',
    }, db, { rootDir: proj.dir });
    await dispatchTool('plan.export', {
      change_id: 'plan-cleanup-fault',
    }, db, { rootDir: proj.dir });
    await dispatchTool('task.update', {
      id: 'plan-cleanup-task',
      patch: { complexity: 4 },
    }, db, { rootDir: proj.dir });
    await dispatchTool('change.context', {
      id: 'plan-cleanup-fault',
      role: 'plan',
      gate: 'planning',
    }, db, { rootDir: proj.dir });

    let injected = false;
    artifactRegistry.recordArtifactInTx = (...args) => {
      const recorded = originalRecord(...args);
      if (!injected) {
        injected = true;
        const directory = path.join(
          proj.dir,
          '.ultra',
          'changes',
          'active',
          'plan-cleanup-fault',
        );
        const journalPath = path.join(
          directory,
          fs.readdirSync(directory).find((name) => name.endsWith('.journal.json')),
        );
        const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
        const backup = path.join(directory, journal.entries[0].backup);
        fs.rmSync(backup);
        fs.mkdirSync(backup);
      }
      return recorded;
    };

    await assert.rejects(
      dispatchTool('plan.export', {
        change_id: 'plan-cleanup-fault',
      }, db, {
        rootDir: proj.dir,
        markPlanRecoveryRequired(details) {
          marked = details;
        },
      }),
      (error) => error.code === 'PLAN_RECOVERY_REQUIRED',
    );
    assert.equal(marked.pending, 1);
    assert.equal(marked.issues[0].code, 'PLAN_ARTIFACT_PATH_UNSAFE');
    const pending = planStore.inspectPlanPublications(db, { rootDir: proj.dir });
    assert.ok(pending.pending >= 1);
    assert.equal(pending.status, 'fail');
  } finally {
    artifactRegistry.recordArtifactInTx = originalRecord;
    closeStateDb(db);
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('plan.export rollback residue blocks the next mutation in the same MCP process', async () => {
  const proj = tmpProject();
  const { db } = initStateDb(proj.dbPath);
  const originalRecord = artifactRegistry.recordArtifactInTx;
  try {
    seedCompleteBaseline(db, { rootDir: proj.dir });
    await dispatchTool('change.create', completeChangeInput({
      id: 'plan-rollback-residue',
      title: 'Keep rollback residue authoritative',
      kind: 'standard',
      intent: 'Block all later mutations until failed Plan publication recovery is clean.',
      docs_impact: { status: 'none', files: [], rationale: 'Test fixture.' },
    }), db, { rootDir: proj.dir });
    await dispatchTool('task.create', {
      id: 'plan-rollback-residue-task',
      title: 'Fail Plan publication rollback',
      type: 'feature',
      priority: 'P1',
      complexity: 3,
      deps: [],
      files_modified: ['src/plan-rollback-residue.ts'],
      change_id: 'plan-rollback-residue',
    }, db, { rootDir: proj.dir });
    await dispatchTool('change.context', {
      id: 'plan-rollback-residue',
      role: 'plan',
      gate: 'planning',
    }, db, { rootDir: proj.dir });
    closeStateDb(db);

    let injected = false;
    artifactRegistry.recordArtifactInTx = (...args) => {
      const recorded = originalRecord(...args);
      if (!injected) {
        injected = true;
        const target = path.join(
          proj.dir,
          '.ultra',
          'changes',
          'active',
          'plan-rollback-residue',
          'plan.json',
        );
        fs.rmSync(target);
        fs.mkdirSync(target);
        const error = new Error('injected registry transaction failure');
        error.code = 'REGISTRY_WRITE_FAILED';
        throw error;
      }
      return recorded;
    };

    await withInProcessClient(proj, async (client) => {
      const failed = await client.callTool({
        name: 'plan.export',
        arguments: { change_id: 'plan-rollback-residue' },
      });
      const failure = expectError(failed);
      assert.equal(failure.code, 'PLAN_RECOVERY_REQUIRED');
      assert.equal(failure.details.original_error.code, 'REGISTRY_WRITE_FAILED');
      assert.equal(failure.details.rollback_issue.code, 'PLAN_ARTIFACT_PATH_UNSAFE');

      const blocked = await client.callTool({
        name: 'task.create',
        arguments: {
          id: 'must-not-mutate-after-plan-residue',
          title: 'Must remain blocked',
          type: 'feature',
          priority: 'P1',
        },
      });
      assert.equal(expectError(blocked).code, 'PLAN_RECOVERY_REQUIRED');
    });

    const verification = initStateDb(proj.dbPath).db;
    try {
      assert.equal(
        verification.prepare(
          "SELECT COUNT(*) AS count FROM tasks WHERE id = 'must-not-mutate-after-plan-residue'",
        ).get().count,
        0,
      );
      assert.equal(
        planStore.inspectPlanPublications(verification, { rootDir: proj.dir }).status,
        'fail',
      );
    } finally {
      closeStateDb(verification);
    }
  } finally {
    artifactRegistry.recordArtifactInTx = originalRecord;
    try { closeStateDb(db); } catch {}
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('canonical plan remains Change-owned across exports outside and inside distinct Plan workflows', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'stable-plan-owner',
          title: 'Keep canonical plan authority stable',
          kind: 'standard',
          intent: 'Plan workflows update one Change-owned canonical execution plan.',
          docs_impact: { status: 'none', files: [], rationale: 'Test fixture.' },
        }),
      });
      await client.callTool({
        name: 'task.create',
        arguments: {
          id: 'stable-plan-task',
          title: 'Generate one stable plan',
          type: 'feature',
          priority: 'P1',
          complexity: 3,
          deps: [],
          files_modified: ['src/stable-plan.ts'],
          change_id: 'stable-plan-owner',
        },
      });
      await client.callTool({
        name: 'change.context',
        arguments: { id: 'stable-plan-owner', role: 'plan', gate: 'planning' },
      });
      const firstExport = readToolPayload(await client.callTool({
        name: 'plan.export',
        arguments: { change_id: 'stable-plan-owner' },
      }));
      const relativePlan = path.relative(proj.dir, firstExport.plan_path);
      const firstArtifact = readToolPayload(await client.callTool({
        name: 'artifact.get',
        arguments: { path: relativePlan },
      })).artifact;
      assert.equal(firstArtifact.owner_type, 'change');
      assert.equal(firstArtifact.owner_id, 'stable-plan-owner');
      assert.equal(firstArtifact.provenance.workflow_run_id, null);

      const direct = new Database(proj.dbPath);
      try {
        direct.prepare(
          `INSERT INTO workflow_runs
           (id, kind, subject, definition_version, status, change_id)
           VALUES (?, 'plan', ?, 'test', 'active', ?)`,
        ).run('stable-plan-workflow-1', 'First plan workflow.', 'stable-plan-owner');
      } finally {
        direct.close();
      }
      await client.callTool({
        name: 'plan.export',
        arguments: { change_id: 'stable-plan-owner' },
      });
      const withinFirst = readToolPayload(await client.callTool({
        name: 'artifact.get',
        arguments: { path: relativePlan },
      })).artifact;
      assert.equal(withinFirst.id, firstArtifact.id);
      assert.equal(withinFirst.owner_type, 'change');
      assert.equal(withinFirst.owner_id, 'stable-plan-owner');
      assert.equal(withinFirst.provenance.workflow_run_id, 'stable-plan-workflow-1');

      const secondDirect = new Database(proj.dbPath);
      try {
        secondDirect.prepare(
          `UPDATE workflow_runs
           SET status = 'completed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = 'stable-plan-workflow-1'`,
        ).run();
        secondDirect.prepare(
          `INSERT INTO workflow_runs
           (id, kind, subject, definition_version, status, change_id)
           VALUES (?, 'plan', ?, 'test', 'active', ?)`,
        ).run('stable-plan-workflow-2', 'Second plan workflow.', 'stable-plan-owner');
      } finally {
        secondDirect.close();
      }
      await client.callTool({
        name: 'task.update',
        arguments: {
          id: 'stable-plan-task',
          patch: { title: 'Generate the refreshed stable plan' },
        },
      });
      await client.callTool({
        name: 'change.context',
        arguments: { id: 'stable-plan-owner', role: 'plan', gate: 'planning' },
      });
      const secondResponse = await client.callTool({
        name: 'plan.export',
        arguments: { change_id: 'stable-plan-owner' },
      });
      assert.equal(secondResponse.isError, undefined, JSON.stringify(secondResponse));
      const withinSecond = readToolPayload(await client.callTool({
        name: 'artifact.get',
        arguments: { path: relativePlan },
      })).artifact;
      assert.equal(withinSecond.id, firstArtifact.id);
      assert.equal(withinSecond.owner_type, 'change');
      assert.equal(withinSecond.owner_id, 'stable-plan-owner');
      assert.equal(withinSecond.provenance.workflow_run_id, 'stable-plan-workflow-2');
      assert.ok(withinSecond.source_refs.some(
        (ref) => ref.type === 'task' && ref.id === 'stable-plan-task',
      ));
      assert.equal(withinSecond.consumer_refs.some((ref) => ref.type === 'task'), false);
      const task = readToolPayload(await client.callTool({
        name: 'task.get',
        arguments: { id: 'stable-plan-task' },
      })).task;
      assert.equal(task.stale, false);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('plan.export preflights both authorities and leaves files and registry unchanged on conflict', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'plan-atomic-conflict',
          title: 'Keep plan publication atomic',
          kind: 'standard',
          intent: 'Reject a conflicting plan authority without publishing either plan artifact.',
          docs_impact: { status: 'none', files: [], rationale: 'Test fixture.' },
        }),
      });
      await client.callTool({
        name: 'task.create',
        arguments: {
          id: 'plan-atomic-task',
          title: 'Publish one plan',
          type: 'feature',
          priority: 'P1',
          complexity: 3,
          deps: [],
          files_modified: ['src/plan-atomic.ts'],
          change_id: 'plan-atomic-conflict',
        },
      });
      const context = readToolPayload(await client.callTool({
        name: 'change.context',
        arguments: { id: 'plan-atomic-conflict', role: 'plan', gate: 'planning' },
      }));
      assert.equal(context.manifest.readiness.status, 'ready');

      const artifactRoot = path.join(
        proj.dir, '.ultra', 'changes', 'active', 'plan-atomic-conflict',
      );
      const planJson = path.join(artifactRoot, 'plan.json');
      const planMd = path.join(artifactRoot, 'plan.md');
      fs.mkdirSync(artifactRoot, { recursive: true });
      fs.writeFileSync(planJson, '{"prior":"json-authority"}\n');
      fs.writeFileSync(planMd, '# Prior markdown authority\n');
      const conflictResponse = await client.callTool({
        name: 'artifact.record',
        arguments: {
          id: 'plan-md-conflict',
          owner_type: 'change',
          owner_id: 'plan-atomic-conflict',
          kind: 'manual_plan',
          path: path.relative(proj.dir, planMd),
          provenance: { actor: 'fixture', purpose: 'authority-conflict' },
          source_refs: [],
          consumer_refs: [],
        },
      });
      assert.equal(
        conflictResponse.isError,
        undefined,
        JSON.stringify(conflictResponse),
      );
      const conflict = readToolPayload(conflictResponse).artifact;
      const priorJson = fs.readFileSync(planJson);
      const priorMd = fs.readFileSync(planMd);

      const response = await client.callTool({
        name: 'plan.export',
        arguments: { change_id: 'plan-atomic-conflict' },
      });
      assert.equal(expectError(response).code, 'ARTIFACT_AUTHORITY_CONFLICT');
      assert.deepEqual(fs.readFileSync(planJson), priorJson);
      assert.deepEqual(fs.readFileSync(planMd), priorMd);

      const afterConflict = readToolPayload(await client.callTool({
        name: 'artifact.get',
        arguments: { path: path.relative(proj.dir, planMd) },
      })).artifact;
      assert.equal(afterConflict.id, conflict.id);
      assert.equal(afterConflict.digest, conflict.digest);
      const exported = readToolPayload(await client.callTool({
        name: 'task.subscribe_events',
        arguments: { since_id: 0, types: ['plan_exported'], limit: 100 },
      }));
      assert.deepEqual(exported.events, []);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('plan.get: no plan written yet → NO_PLAN', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'missing-plan-change', title: 'No persisted plan', kind: 'quick',
          intent: 'Read a real Change that has no plan artifact yet.',
          docs_impact: { status: 'none', files: [], rationale: 'Test fixture.' },
        }),
      });
      const resp = await client.callTool({
        name: 'plan.get', arguments: { change_id: 'missing-plan-change' },
      });
      const err = expectError(resp);
      assert.equal(err.code, 'NO_PLAN');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.dependency_topo: cycle returns CYCLE_DETECTED with cycles in details', async () => {
  const proj = tmpProject();
  try {
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'X', title: 'task X', type: 'feature', priority: 'P2', deps: ['Y'] },
      });
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'Y', title: 'task Y', type: 'feature', priority: 'P2', deps: ['X'] },
      });
      const resp = await client.callTool({
        name: 'task.dependency_topo',
        arguments: { task_ids: ['X', 'Y'] },
      });
      const err = expectError(resp);
      assert.equal(err.code, 'CYCLE_DETECTED');
      assert.ok(err.details && Array.isArray(err.details.cycles));
      assert.equal(err.details.cycles.length, 1);
      assert.deepEqual(new Set(err.details.cycles[0]), new Set(['X', 'Y']));
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});
