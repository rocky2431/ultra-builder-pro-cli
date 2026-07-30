'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workflows = require('../lib/workflow-state.cjs');
const baselines = require('../lib/baseline-workflow.cjs');
const checkpoints = require('../lib/stage-checkpoints.cjs');
const runtime = require('../lib/runtime-state.cjs');
const projector = require('../lib/projector.cjs');

function write(rootDir, relative, content) {
  const file = path.join(rootDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function seedCompletedWorkflowStructure(db, runId, kind, timestamp = new Date().toISOString()) {
  const definition = workflows.WORKFLOW_DEFINITIONS[kind];
  if (!definition) throw new Error(`unknown workflow kind: ${kind}`);
  const insert = db.prepare(
    `INSERT OR REPLACE INTO workflow_steps
     (run_id, step_id, position, title, required, status, evidence_json,
      outputs_json, decisions_json, blockers_json, started_at, completed_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 'completed', ?, '[]', '[]', '[]', ?, ?, ?)`,
  );
  definition.forEach((item, position) => {
    insert.run(
      runId, item.id, position, item.title,
      JSON.stringify([{ kind: 'test', ref: `fixture:${item.id}`, summary: 'Fixture gate evidence.' }]),
      timestamp, timestamp, timestamp,
    );
  });
}

function seedReadyBaseline(db, {
  rootDir,
  id = 'test-baseline',
  mode = 'greenfield',
  projectName = 'fixture',
} = {}) {
  if (!rootDir) throw new Error('seedReadyBaseline requires rootDir');
  const existing = db.prepare('SELECT id FROM baselines WHERE id = ?').get(id);
  if (existing) return id;

  const researchId = `${id}-research`;
  const now = new Date().toISOString();
  const specFiles = {
    discovery: '.ultra/specs/discovery.md',
    product: '.ultra/specs/product.md',
    architecture: '.ultra/specs/architecture.md',
  };
  for (const [kind, relative] of Object.entries(specFiles)) {
    write(rootDir, relative, `# ${kind}\n\nVerified fixture baseline.\n`);
  }
  write(rootDir, '.ultra/fixture-source.js', "'use strict';\nmodule.exports = true;\n");

  const specRefs = Object.entries(specFiles).map(([kind, relative]) => ({
    kind, path: relative, digest: digest(path.join(rootDir, relative)),
  }));
  const evidence = [{
    kind: 'source',
    ref: '.ultra/fixture-source.js',
    summary: 'Stable source fixture for baseline authority tests.',
    digest: digest(path.join(rootDir, '.ultra/fixture-source.js')),
  }];
  const verification = [{
    name: 'fixture verification',
    command: 'node --version',
    status: 'pass',
    evidence: 'Fixture establishes an executable verification record.',
  }];
  const git = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  const repositoryRevision = git.status === 0
    ? git.stdout.trim()
    : `workspace:${crypto.createHash('sha256').update(JSON.stringify({
      scope: ['.'], specs: specRefs,
      evidence: evidence.map((item) => ({
        kind: item.kind, ref: item.ref, digest: item.digest,
      })),
    })).digest('hex')}`;
  const worktree = baselines.gitWorktreeSnapshot(rootDir, ['.']);

  db.prepare(
    `INSERT INTO baselines
     (id, project_name, mode, status, scope_json, repository_revision,
      repository_branch, worktree_state, worktree_digest, worktree_files_json,
      spec_refs_json, evidence_json,
      verification_json, unknowns_json, gaps_json, classification_json,
      known_red_accepted, approved_by, approval_note, research_run_id, converged_at)
     VALUES (?, ?, ?, 'ready', '["."]', ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, 0,
             'test-owner', 'Accepted complete test fixture baseline.', ?, ?)`,
  ).run(
    id, projectName, mode, repositoryRevision,
    worktree.branch, worktree.state, worktree.digest, JSON.stringify(worktree.files),
    JSON.stringify(specRefs), JSON.stringify(evidence),
    JSON.stringify(verification), JSON.stringify({ fixture: true }), researchId, now,
  );
  const research = checkpoints.saveDraft(db, {
    stage: 'research',
    scope: { baseline_id: id },
    payload: {
      mode: mode === 'brownfield' ? 'adoption' : 'full',
      summary: 'Complete fixture research provenance.',
    },
    evidence,
    diagnostics: [],
    idempotency_key: `${researchId}:draft`,
  });
  const acceptedResearch = checkpoints.acceptDraft(db, {
    id: research.id,
    idempotency_key: `${researchId}:accept`,
  });
  db.prepare('UPDATE baselines SET research_run_id = ? WHERE id = ?')
    .run(acceptedResearch.id, id);
  runtime.ensureProjectionJob(db, { tool_name: 'test.fixture' });
  runtime.processProjectionJobs(db, {
    rootDir,
    project: projector.projectAll,
    limit: 10,
  });
  return id;
}

module.exports = { seedReadyBaseline, seedCompletedWorkflowStructure };
