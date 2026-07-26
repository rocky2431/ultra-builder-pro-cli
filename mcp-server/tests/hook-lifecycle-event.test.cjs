'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const { appendHookLifecycleEvent } = require('../server.cjs');

test('subagent hook writes minimal lifecycle metadata only to authoritative events', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-hook-event-'));
  fs.mkdirSync(path.join(rootDir, '.ultra'), { recursive: true });
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES ('active-change', 'Active change', 'standard', 'active', 'Ship behavior.',
               '.ultra/changes/active/active-change')`,
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, title, type, priority, status, stale, change_id, created_at, updated_at)
       VALUES ('active-task', 'Active task', 'feature', 'P1', 'in_progress', 0,
               'active-change', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO workflow_runs
       (id, kind, subject, status, current_step, change_id, task_id)
       VALUES ('wf-hook-event', 'review', 'Review lifecycle', 'active', 'run-review',
               'active-change', 'active-task')`,
    ).run();
  } finally {
    closeStateDb(db);
  }

  try {
    const result = appendHookLifecycleEvent({
      rootDir,
      action: 'stop',
      hookInput: {
        agent_id: 'agent-1',
        agent_type: 'review-code',
        session_id: 'host-session',
        agent_transcript_path: '/secret/transcript.jsonl',
        last_assistant_message: 'private output',
      },
    });
    assert.equal(result.recorded, true);
    assert.equal(result.change_id, 'active-change');
    assert.equal(result.task_id, 'active-task');

    const reopened = initStateDb(path.join(rootDir, '.ultra', 'state.db')).db;
    try {
      const row = reopened.prepare(
        "SELECT type, change_id, task_id, payload_json FROM events WHERE type = 'subagent_stopped'",
      ).get();
      assert.equal(row.change_id, 'active-change');
      assert.equal(row.task_id, 'active-task');
      const payload = JSON.parse(row.payload_json);
      assert.deepEqual(payload, {
        agent_id: 'agent-1', agent_type: 'review-code', host_session_id: 'host-session',
      });
      assert.doesNotMatch(row.payload_json, /transcript|private output|secret/);
    } finally {
      closeStateDb(reopened);
    }
    assert.equal(fs.existsSync(path.join(rootDir, '.ultra', 'runtime', 'subagent-log.jsonl')), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('subagent hook is a no-op when no active change owns lifecycle evidence', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-hook-event-idle-'));
  fs.mkdirSync(path.join(rootDir, '.ultra'), { recursive: true });
  const init = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  closeStateDb(init.db);
  try {
    const result = appendHookLifecycleEvent({ rootDir, action: 'start', hookInput: {} });
    assert.deepEqual(result, { recorded: false, reason: 'NO_ACTIVE_WORKFLOW' });
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('subagent hook is a no-op when an active change has no active workflow', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-hook-event-no-workflow-'));
  fs.mkdirSync(path.join(rootDir, '.ultra'), { recursive: true });
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES ('idle-change', 'Idle change', 'quick', 'active', 'Wait for invocation.',
               '.ultra/changes/active/idle-change')`,
    ).run();
  } finally {
    closeStateDb(db);
  }
  try {
    const result = appendHookLifecycleEvent({ rootDir, action: 'start', hookInput: {} });
    assert.deepEqual(result, { recorded: false, reason: 'NO_ACTIVE_WORKFLOW' });
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
