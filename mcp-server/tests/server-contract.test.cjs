'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const Database = require('better-sqlite3');

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SERVER = path.join(REPO_ROOT, 'mcp-server', 'server.cjs');
const PACKAGE_VERSION = require(path.join(REPO_ROOT, 'package.json')).version;
const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const { dispatchTool } = require('../server.cjs');
const changes = require('../lib/change-workflow.cjs');
const ops = require('../lib/state-ops.cjs');
const { seedReadyBaseline: seedCompleteBaseline } = require('../test-support/ready-baseline.cjs');
const { semanticRecordsForStep } = require('../test-support/semantic-records.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mcp-'));
  return { dir, dbPath: path.join(dir, '.ultra', 'state.db') };
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

test('listTools returns workflow tools and exposes no Ultra memory API', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const list = await client.listTools();
      const names = list.tools.map((t) => t.name).sort();
      assert.deepEqual(names, [
        'baseline.converge',
        'baseline.get',
        'baseline.record',
        'baseline.start',
        'change.archive',
        'change.breadcrumb',
        'change.context',
        'change.converge',
        'change.create',
        'change.get',
        'change.learning_propose',
        'change.learning_resolve',
        'change.list',
        'change.update',
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
        'workflow.start',
        'workflow.step',
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

test('baseline MCP tools adopt and converge an existing checkout without storing provider payloads', async () => {
  const proj = tmpProject();
  try {
    fs.mkdirSync(path.join(proj.dir, '.ultra', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(proj.dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(proj.dir, '.ultra', 'specs', 'discovery.md'), '# Discovery\n\nObserved evidence.\n');
    fs.writeFileSync(path.join(proj.dir, '.ultra', 'specs', 'product.md'), '# Product\n\nObserved behavior.\n');
    fs.writeFileSync(path.join(proj.dir, '.ultra', 'specs', 'architecture.md'), '# Architecture\n\nCurrent boundary.\n');
    fs.writeFileSync(path.join(proj.dir, 'src', 'index.js'), 'module.exports = true;\n');
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
      assert.equal(converged.ready, true);
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

      const context = readToolPayload(await client.callTool({
        name: 'change.context', arguments: { id: 'mcp-change' },
      }));
      assert.equal(context.manifest.change.id, 'mcp-change');
      assert.equal(context.manifest.schema_version, '2.0');
      assert.equal(context.manifest.role, 'plan');
      assert.equal(context.manifest.readiness.status, 'ready');
      assert.equal(context.manifest.providers.memory.provider, 'cloud-mem');
      assert.equal(context.manifest.provider_boundary.includes('content remain external'), true);

      const breadcrumb = readToolPayload(await client.callTool({
        name: 'change.breadcrumb', arguments: { id: 'mcp-change' },
      }));
      assert.equal(breadcrumb.breadcrumb.change_id, 'mcp-change');
      assert.equal(breadcrumb.breadcrumb.recommended_workflow, 'ultra-change');
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

test('MCP metadata matches the package and tools/list does not create project state', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      assert.equal(client.getServerVersion().version, PACKAGE_VERSION);
      await client.listTools();
      assert.equal(fs.existsSync(proj.dbPath), false, 'tool discovery must not create .ultra/state.db');
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
      schema_version: '4.5', source: '.ultra/state.db',
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
      assert.equal(payload.state_db_path, path.join(freshTarget, '.ultra', 'state.db'));
      assert.equal(payload.mode, 'greenfield');
      assert.equal(payload.baseline.status, 'draft');
      assert.ok(fs.existsSync(payload.state_db_path));
      assert.ok(payload.copied_files.includes('tasks/tasks.json'));
      const tasksJson = JSON.parse(fs.readFileSync(path.join(payload.created_path, 'tasks', 'tasks.json'), 'utf8'));
      assert.equal(tasksJson.source, '.ultra/state.db');
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
    seedReadyBaseline(proj);
    await withClient(proj, async (client) => {
      await seedTask(client, 's-happy');

      const admission = await client.callTool({
        name: 'session.admission_check',
        arguments: { task_id: 's-happy' },
      });
      const verdict = readToolPayload(admission);
      assert.equal(verdict.can_spawn, true);
      assert.equal(verdict.recommended_action, 'spawn');

      const spawn = await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-happy', runtime: 'claude' },
      });
      const session = readToolPayload(spawn);
      assert.match(session.sid, /^sess-/);
      assert.ok(session.worktree_path.includes(session.sid));
      assert.ok(session.artifact_dir.endsWith(path.join('.ultra', 'sessions', session.sid)));
      assert.ok(session.lease_expires_at);
    });
  } finally {
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

      const got = readToolPayload(await client.callTool({
        name: 'session.get', arguments: { sid: spawn.sid },
      }));
      assert.equal(got.session.status, 'completed');
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
        arguments: { change_id: 'empty-plan-change', out_path: '.ultra/execution-plan.json' },
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
      const exp = await client.callTool({
        name: 'plan.export',
        arguments: {
          change_id: 'plan-change', out_path: '.ultra/execution-plan.json', format: 'json',
        },
      });
      const expData = readToolPayload(exp);
      assert.equal(expData.wave_count, 2);
      assert.ok(fs.existsSync(expData.plan_path), 'artifact file must exist');
      assert.equal(exp._meta.ultra.projection_status, 'completed');

      const exportedEvents = readToolPayload(await client.callTool({
        name: 'task.subscribe_events',
        arguments: { since_id: 0, types: ['plan_exported', 'plan_approved'], limit: 100 },
      }));
      assert.deepEqual(exportedEvents.events.map((event) => event.type), ['plan_exported']);

      const got = await client.callTool({
        name: 'plan.get', arguments: { change_id: 'plan-change', section: 'topo' },
      });
      const gotData = readToolPayload(got);
      assert.ok(Array.isArray(gotData.plan.waves));
      assert.equal(gotData.plan.waves.length, 2);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('plan.get: no plan written yet → NO_PLAN', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
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
