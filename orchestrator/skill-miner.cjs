'use strict';

// Phase 7.3 — Heuristic skill miner.
//
// Scans a completed session's event stream for "solved something
// non-trivial" signals. Each signal produces a skills/learned/
// <ts>_<sid>_unverified.md draft the operator can promote to a proper
// skill by removing the _unverified suffix and filling in reuse notes.
//
// No LLM call. The heuristic is deliberately coarse so the feature ships
// zero-API-cost; signal quality is explicitly marked "unverified" in the
// frontmatter.

const fs = require('node:fs');
const path = require('node:path');

const ops = require('../mcp-server/lib/state-ops.cjs');

const LEARNED_DIR = 'learned';

// Event type → draft kind + description template.
const SIGNALS = Object.freeze({
  task_completed: {
    kind: 'task-completion',
    describe: (task) => `Shipped task ${task.id} (${task.title}). Heuristic draft — fill reuse notes before removing _unverified.`,
  },
  task_circuit_broken: {
    kind: 'debug-pattern',
    describe: (task, e) => `Task ${task.id} (${task.title}) tripped the breaker after ${e.payload && e.payload.threshold} failures. Inspect the failure stream for a recurring debug pattern.`,
  },
  session_crashed: {
    kind: 'recovery-pattern',
    describe: (task) => `Session on task ${task.id} (${task.title}) crashed. Record the recovery path once investigated.`,
  },
});

function sanitizeForFilename(s) {
  return String(s).replace(/[^\w.-]/g, '_').slice(0, 80);
}

function renderDraft({ task, session, signalType, kind, description, events }) {
  const ts = new Date().toISOString();
  const evIds = events.map((e) => e.id).slice(0, 20);
  const lines = [
    '---',
    `name: ${sanitizeForFilename(task.id + '_' + session.sid)}_unverified`,
    `description: "Heuristic draft from session ${session.sid}, task ${task.id}"`,
    `kind: ${kind}`,
    `source_session: ${session.sid}`,
    `source_task: ${task.id}`,
    `signal: ${signalType}`,
    `ts: ${ts}`,
    'unverified: true',
    '---',
    '',
    '## Problem',
    '',
    `${task.title}${task.trace_to ? ` (trace: ${task.trace_to})` : ''}`,
    '',
    '## Signal',
    '',
    description,
    '',
    '## Evidence',
    '',
    `- events: [${evIds.join(', ')}]`,
    `- runtime: ${session.runtime}`,
    `- final task status: ${task.status}`,
    '',
    '## Suggested reuse',
    '',
    '[human: fill in before removing the `_unverified` suffix]',
    '',
  ];
  return lines.join('\n');
}

function existingDraftsForSession(learnedDir, sid) {
  if (!fs.existsSync(learnedDir)) return [];
  return fs.readdirSync(learnedDir).filter((f) => f.includes(sid) && f.endsWith('_unverified.md'));
}

function mineSession(db, { sid, skillsRoot } = {}) {
  if (!sid || !skillsRoot) return { drafts: [] };
  const session = ops.readSession(db, sid);
  if (!session) return { drafts: [] };

  const learnedDir = path.join(skillsRoot, LEARNED_DIR);
  fs.mkdirSync(learnedDir, { recursive: true });

  // Idempotency: skip if a draft already exists for this sid.
  if (existingDraftsForSession(learnedDir, sid).length > 0) {
    return { drafts: [] };
  }

  const task = ops.readTask(db, session.task_id);
  if (!task) return { drafts: [] };

  const { events } = ops.subscribeEventsSince(db, {
    since_id: 0,
    task_id: session.task_id,
    limit: 500,
  });
  const sessionEvents = events.filter((e) => e.session_id === sid);

  // Pick the first matching signal (most specific one per session — we don't
  // want one session producing three drafts).
  for (const e of sessionEvents) {
    const sig = SIGNALS[e.type];
    if (!sig) continue;
    const content = renderDraft({
      task,
      session,
      signalType: e.type,
      kind: sig.kind,
      description: sig.describe(task, e),
      events: sessionEvents,
    });
    const filename = `${Date.now()}_${sanitizeForFilename(sid)}_unverified.md`;
    const target = path.join(learnedDir, filename);
    fs.writeFileSync(target, content);
    return { drafts: [target] };
  }

  return { drafts: [] };
}

module.exports = {
  mineSession,
  SIGNALS,
  // exposed for tests
  _internal: { renderDraft, existingDraftsForSession, sanitizeForFilename },
};
