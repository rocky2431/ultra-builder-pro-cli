---
task_id: task-3
title: Rate limiter
status: blocked
priority: P2
type: feature
---

# task-3 — Rate limiter

## Goal
Token-bucket rate limit per API key.

## Notes
- intentionally drifted: tasks.json says pending, this header says blocked.
  Migration must keep tasks.json's value (pending) and emit a warning.
