-- Invalid INSERT fixtures. validate-state-db.cjs runs each block separately
-- and asserts every one is REJECTED. Each statement violates a distinct
-- constraint declared in state-db.sql.
--
-- Format: one statement per line, lines starting with `--EXPECT_REJECT:`
-- annotate the constraint that should fire.

--EXPECT_REJECT: type CHECK
INSERT INTO tasks (id, title, type, priority) VALUES ('bad-1', 'wrong type', 'epic', 'P0');

--EXPECT_REJECT: priority CHECK
INSERT INTO tasks (id, title, type, priority) VALUES ('bad-2', 'wrong prio', 'feature', 'P9');

--EXPECT_REJECT: complexity range
INSERT INTO tasks (id, title, type, priority, complexity) VALUES ('bad-3', 'oob', 'feature', 'P1', 99);

--EXPECT_REJECT: status CHECK
INSERT INTO tasks (id, title, type, priority, status) VALUES ('bad-4', 'wrong status', 'feature', 'P1', 'doing');

--EXPECT_REJECT: NOT NULL title
INSERT INTO tasks (id, type, priority) VALUES ('bad-5', 'feature', 'P1');

--EXPECT_REJECT: sessions.task_id FK violation
INSERT INTO sessions (sid, task_id, runtime, worktree_path, artifact_dir, lease_expires_at) VALUES ('bad-ses-1', 'no-such-task', 'claude', '/tmp/wt', '/tmp/art', '2099-01-01T00:00:00.000Z');

--EXPECT_REJECT: sessions.runtime CHECK
INSERT INTO sessions (sid, task_id, runtime, worktree_path, artifact_dir, lease_expires_at) VALUES ('bad-ses-2', 'task-001', 'gpt-5', '/tmp/wt', '/tmp/art', '2099-01-01T00:00:00.000Z');

--EXPECT_REJECT: migration_history.direction CHECK
INSERT INTO migration_history (from_version, to_version, direction, status) VALUES ('4.4', '4.5', 'sideways', 'success');
