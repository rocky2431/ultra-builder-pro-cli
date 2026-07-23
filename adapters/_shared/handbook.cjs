'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeAtomic } = require('./file-ops.cjs');

const BEGIN_MARKER = '<!-- ultra-builder-pro:handbook:start -->';
const END_MARKER = '<!-- ultra-builder-pro:handbook:end -->';
const LEGACY_HEADING = '## Ultra Builder Pro Runtime Contract';

const HOSTS = Object.freeze({
  claude: Object.freeze({
    name: 'Claude Code',
    handbook: ['.claude', 'CLAUDE.md'],
    invocation: '`/ultra-init`, `/ultra-research`, `/ultra-plan`, `/ultra-change`, `/ultra-dev`, `/ultra-test`, `/ultra-review`, and `/ultra-deliver`; diagnostics use `/ultra-status`, `/ultra-think`, and `/ultra-doctor`',
    collaboration: '`/codex-collab` is an explicitly requested read-only advisor',
    coordination: 'Claude Code task UI is host coordination; it does not replace Ultra task state',
  }),
  codex: Object.freeze({
    name: 'Codex',
    handbook: ['.codex', 'AGENTS.md'],
    invocation: '`$ultra-builder-pro:ultra-init`, `$ultra-builder-pro:ultra-research`, `$ultra-builder-pro:ultra-plan`, `$ultra-builder-pro:ultra-change`, `$ultra-builder-pro:ultra-dev`, `$ultra-builder-pro:ultra-test`, `$ultra-builder-pro:ultra-review`, and `$ultra-builder-pro:ultra-deliver`; diagnostics use `$ultra-builder-pro:ultra-status`, `$ultra-builder-pro:ultra-think`, and `$ultra-builder-pro:ultra-doctor`',
    collaboration: '`$ultra-builder-pro:cc-collab` is an explicitly requested read-only advisor',
    coordination: 'The Codex plan is turn-facing coordination; it does not replace Ultra task state',
  }),
  opencode: Object.freeze({
    name: 'OpenCode',
    handbook: ['.config', 'opencode', 'AGENTS.md'],
    invocation: '`/ultra-init`, `/ultra-research`, `/ultra-plan`, `/ultra-change`, `/ultra-dev`, `/ultra-test`, `/ultra-review`, and `/ultra-deliver`; diagnostics use `/ultra-status`, `/ultra-think`, and `/ultra-doctor`',
    collaboration: '`/cc-collab` and `/codex-collab` are explicitly requested read-only advisors',
    coordination: 'OpenCode session coordination does not replace Ultra task state',
  }),
  kimi: Object.freeze({
    name: 'Kimi Code',
    handbook: ['.kimi-code', 'AGENTS.md'],
    invocation: '`/ultra-builder-pro:ultra-init`, `/ultra-builder-pro:ultra-research`, `/ultra-builder-pro:ultra-plan`, `/ultra-builder-pro:ultra-change`, `/ultra-builder-pro:ultra-dev`, `/ultra-builder-pro:ultra-test`, `/ultra-builder-pro:ultra-review`, and `/ultra-builder-pro:ultra-deliver`; diagnostics use `/ultra-builder-pro:ultra-status`, `/ultra-builder-pro:ultra-think`, and `/ultra-builder-pro:ultra-doctor`',
    collaboration: '`/skill:cc-collab` and `/skill:codex-collab` are explicitly requested read-only advisors',
    coordination: 'Kimi `TodoList` and `Agent` / `AgentSwarm` are host coordination; they do not replace Ultra task state',
  }),
});

function host(runtime) {
  const value = HOSTS[runtime];
  if (!value) throw new Error(`unsupported handbook runtime: ${runtime}`);
  return value;
}

function renderHandbook(runtime) {
  const value = host(runtime);
  return [
    BEGIN_MARKER,
    '## Ultra Builder Pro Runtime Contract',
    '',
    `Ultra Builder Pro is installed as a native ${value.name} plugin. Keep general engineering`,
    'policy in this handbook and detailed Ultra procedures in the plugin skills.',
    '',
    `- Workflow entry points: ${value.invocation}.`,
    `- Collaboration boundary: ${value.collaboration}. The current host remains primary and owns final verification.`,
    `- Coordination boundary: ${value.coordination}.`,
    '- Authority: `.ultra/state.db` is the only durable Ultra authority for baselines, changes, decision threads, tasks, sessions, events, incidents, projection state, telemetry, and review evidence. Generated JSON and Markdown are projections or workflow artifacts.',
    '- Baseline boundary: `task.init_project` classifies greenfield or brownfield work and records repository scope. Projection-only prior state uses the exact supported backup-first import returned by the authority check; migrated compatibility rows require explicit brownfield re-adoption. `baseline.record` owns evidence, verification, repository snapshot, and the gap ledger; `baseline.converge` requires explicit owner approval. New ordinary changes require a healthy ready baseline. Existing active work may continue with warnings, but baseline readiness blocks change convergence; normal drift reconciliation is health-checked atomically at archive. Only an explicitly approved incident break-glass may start without baseline readiness, and its archive creates a blocking reconciliation gap.',
    '- Decision boundary: project-bound owner choices use one resumable DB-backed decision thread. The host resolves observable facts autonomously, presents only the earliest unresolved decision with evidence and a recommendation, waits for the owner, and records the normalized decision rather than prompts or transcripts. A linked workflow cannot advance until blocking decisions are resolved and its owner-approved checkpoint is current.',
    '- Context Spine boundary: `change.context` compiles role/gate readiness, required references, a fresh-context budget, public seam, verification command, Change/task authority digests, allowed transitions, and any unique hard-recovery transition. File, token, and context-share budgets are advisory attention signals, not refusal gates. The host owns semantic recommendations. Hooks inject only the DB-derived `change.breadcrumb`; missing required evidence or stale execution context must be recompiled.',
    '- Specification learning boundary: stable implementation discoveries use approval-gated propose/approve-or-reject/apply transitions. Unresolved learning blocks convergence; review requires independent specification-fidelity and engineering-standards evidence.',
    '- Memory and graph boundary: Ultra Builder Pro does not capture prompts, transcripts, observations, summaries, cross-session memory, or code-graph content. Separately installed providers own that data; Ultra may store only their metadata references in a change context manifest.',
    '- Hook boundary: Ultra hooks observe workflow/change lifecycle only. Health/context may run when `.ultra/state.db` exists; advisory warnings never reject work, and an incomplete workflow never traps session stop. Direct projection protection remains authoritative; compact and subagent recovery stays active-workflow scoped. Generic command blocking and post-edit policy stay in user or repository governance.',
    '- Installation boundary: `ubp --doctor` is the read-only authority for installed asset provenance, content hashes, and host entry-point wiring. Project `system.doctor` diagnoses state and performs only authorized backup-first schema, projection, session, and archive-journal recovery; it never approves a baseline.',
    '- Agent boundary: the bundled review and debugging agents are bounded workers. They use the current checkout and parent-supplied context, do not own private persistent state, and never replace the primary agent.',
    '- Package boundary: only the twelve Ultra workflows, four internal review-rule skills, host-specific collaboration companions, and the minimal host bootstrap belong to this plugin. General browser, deployment, discovery, and framework skills must be installed from their owners.',
    END_MARKER,
  ].join('\n');
}

function markerCount(text, marker) {
  return text.split(marker).length - 1;
}

function replaceManagedBlock(existing, block) {
  const beginCount = markerCount(existing, BEGIN_MARKER);
  const endCount = markerCount(existing, END_MARKER);
  if (beginCount !== endCount || beginCount > 1) {
    throw new Error('handbook contains malformed or duplicate Ultra managed markers');
  }
  if (beginCount === 0) return null;

  const start = existing.indexOf(BEGIN_MARKER);
  const end = existing.indexOf(END_MARKER, start) + END_MARKER.length;
  return existing.slice(0, start) + block + existing.slice(end);
}

function replaceLegacyCodexSection(existing, block) {
  const heading = new RegExp(`^${LEGACY_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*$`, 'm');
  const match = heading.exec(existing);
  if (!match) return null;

  const start = match.index;
  const remainder = existing.slice(start + match[0].length);
  const nextHeading = /^##\s+/m.exec(remainder);
  const end = nextHeading ? start + match[0].length + nextHeading.index : existing.length;
  const before = existing.slice(0, start).trimEnd();
  const after = existing.slice(end).trimStart();
  return `${before}${before ? '\n\n' : ''}${block}${after ? `\n\n${after}` : '\n'}`;
}

function mergeHandbook(existing, runtime) {
  host(runtime);
  const current = typeof existing === 'string' ? existing : '';
  const block = renderHandbook(runtime);
  const managed = replaceManagedBlock(current, block);
  if (managed !== null) return managed;

  if (runtime === 'codex') {
    const migrated = replaceLegacyCodexSection(current, block);
    if (migrated !== null) return migrated;
  }

  const before = current.trimEnd();
  return `${before}${before ? '\n\n' : ''}${block}\n`;
}

function resolveHandbookFile(runtime, { homeDir = os.homedir() } = {}) {
  return path.join(homeDir, ...host(runtime).handbook);
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function applyHandbook({ runtime, file, homeDir, now = timestamp() }) {
  const target = path.resolve(file || resolveHandbookFile(runtime, { homeDir }));
  const exists = fs.existsSync(target);
  const existing = exists ? fs.readFileSync(target, 'utf8') : '';
  const merged = mergeHandbook(existing, runtime);
  if (merged === existing) return { runtime, file: target, changed: false, backup: null };

  let backup = null;
  if (exists) {
    backup = `${target}.ubp-backup-${now}`;
    if (fs.existsSync(backup)) throw new Error(`handbook backup already exists: ${backup}`);
    writeAtomic(backup, existing);
  }
  writeAtomic(target, merged);
  return { runtime, file: target, changed: true, backup };
}

module.exports = {
  BEGIN_MARKER,
  END_MARKER,
  HOSTS,
  applyHandbook,
  mergeHandbook,
  renderHandbook,
  resolveHandbookFile,
};
