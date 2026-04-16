-- Valid INSERT fixtures for state-db.sql. validate-state-db.cjs creates the
-- schema in-memory and applies these; failure here means the schema rejects
-- legitimate data.

INSERT INTO tasks (id, title, type, priority, complexity, status, tag)
VALUES ('task-001', 'Phase 1 — three-layer interface contracts', 'architecture', 'P0', 6, 'in_progress', 'main');

INSERT INTO tasks (id, title, type, priority, status)
VALUES ('task-002', 'Phase 2 — state.db', 'architecture', 'P0', 'pending');

INSERT INTO sessions (sid, task_id, runtime, pid, worktree_path, artifact_dir, lease_expires_at)
VALUES ('ses_test_001', 'task-001', 'claude', 12345, '.ultra/worktrees/task-001',
        '.ultra/sessions/ses_test_001', '2099-01-01T00:00:00.000Z');

INSERT INTO events (type, task_id, session_id, runtime, payload_json)
VALUES ('task_started', 'task-001', 'ses_test_001', 'claude', '{"by":"user"}');

INSERT INTO events (type, task_id, payload_json)
VALUES ('task_completed', 'task-001', '{"commit":"b1b5257"}');

INSERT INTO telemetry (session_id, event_type, tokens_input, tokens_output, tool_name)
VALUES ('ses_test_001', 'tool_call', 1200, 340, 'task.create');

INSERT INTO specs_refs (spec_file, section, anchor)
VALUES ('spec/mcp-tools.yaml', 'task.create', '#task.create');

INSERT INTO migration_history (from_version, to_version, direction, status, notes)
VALUES ('4.4', '4.5', 'forward', 'success', 'initial migration test');
