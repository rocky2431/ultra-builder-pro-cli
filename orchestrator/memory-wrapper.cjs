'use strict';

// Phase 7.1 — Wrapper hooks that glue session lifecycle to memory-store.
//
//   • autoRecallOnSpawn(db, {task_id, artifact_dir}) runs before the child
//     process starts so prefetch.md is there when the agent reads UBP_ARTIFACT_DIR.
//   • autoRetainOnClose(db, sid) runs after session closes — walks the session's
//     event stream and retains facts the next run would want to remember.
//
// Neither function calls an LLM; heuristics are purely event-type driven so
// the feature ships zero-API-cost. Phase 7.3 skill-miner runs adjacent on
// the same event stream to produce skill drafts.

const fs = require('node:fs');
const path = require('node:path');

const ops = require('../mcp-server/lib/state-ops.cjs');
const memory = require('../mcp-server/lib/memory-store.cjs');

function buildRecallQuery(task) {
  return [task.title, task.trace_to].filter(Boolean).join(' ').trim();
}

function renderPrefetch(task, hits) {
  const lines = [
    `# Prefetch for task ${task.id} (${task.title})`,
    '',
    `> Auto-recalled ${hits.length} relevant memory entries. Source: orchestrator/memory-wrapper.cjs`,
    '',
  ];
  for (const h of hits) {
    lines.push(`## ${h.kind} — ${h.ts}`);
    if (h.source) lines.push(`*source: ${h.source}*`);
    lines.push('');
    lines.push(h.content);
    lines.push('');
  }
  return lines.join('\n');
}

function autoRecallOnSpawn(db, { task_id, artifact_dir, limit = 5 } = {}) {
  if (!task_id || !artifact_dir) return { recalled: 0 };
  const task = ops.readTask(db, task_id);
  if (!task) return { recalled: 0 };

  const query = buildRecallQuery(task);
  const hits = memory.recall(db, {
    query,
    tag: task.tag || null,
    limit,
  });
  if (hits.length === 0) return { recalled: 0 };

  fs.mkdirSync(artifact_dir, { recursive: true });
  const target = path.join(artifact_dir, 'prefetch.md');
  fs.writeFileSync(target, renderPrefetch(task, hits));
  return { recalled: hits.length, path: target };
}

// Heuristic mapping: event type → {kind, content template}
function facsExtractedFromEvent(e, task) {
  const tag = task ? task.tag : null;
  const taskLabel = task ? `${task.id} (${task.title})` : (e.task_id || 'unknown');
  switch (e.type) {
    case 'task_completed':
      return { kind: 'decision', content: `Task ${taskLabel} completed`, tag };
    case 'task_circuit_broken': {
      const threshold = e.payload && e.payload.threshold;
      return { kind: 'error_fix', content: `Circuit broken on task ${taskLabel} (threshold=${threshold})`, tag };
    }
    case 'session_crashed':
      return { kind: 'pattern', content: `Session crashed on task ${taskLabel}`, tag };
    case 'task_stale_marked':
      return { kind: 'fact', content: `Task ${taskLabel} marked stale by spec change`, tag };
    default:
      return null;
  }
}

function autoRetainOnClose(db, sid) {
  if (!sid) return { retained: 0 };
  const session = ops.readSession(db, sid);
  if (!session) return { retained: 0 };
  const task = ops.readTask(db, session.task_id);

  const { events } = ops.subscribeEventsSince(db, {
    since_id: 0,
    task_id: session.task_id,
    limit: 500,
  });
  const sessionEvents = events.filter((e) => e.session_id === sid);

  const ids = [];
  for (const e of sessionEvents) {
    const fact = facsExtractedFromEvent(e, task);
    if (!fact) continue;
    const out = memory.retain(db, {
      task_id: session.task_id,
      session_id: sid,
      tag: fact.tag,
      kind: fact.kind,
      content: fact.content,
      source: `event:${e.type}:${e.id}`,
    });
    ids.push(out.id);
  }
  return { retained: ids.length, ids };
}

module.exports = {
  autoRecallOnSpawn,
  autoRetainOnClose,
  // exposed for tests
  _internal: { buildRecallQuery, renderPrefetch, facsExtractedFromEvent },
};
