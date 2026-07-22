# Baseline reconciliation manifest

Write a JSON file inside `.ultra/changes/active/<change-id>/` with
`$schema: "ultra-baseline-reconciliation-v1"`.

Bind `change_id`, `baseline_id`, and `baseline_updates` exactly to the archive request.
Include:

- `semantic_changes`: stable id, `add` or `update`, project-relative `source_ref` using
  `path#anchor`, the prior baseline digest or `null`, and the current file digest;
- `resolved_gap_ids`: existing baseline gaps closed by this delivery;
- `resolved_unknowns`: exact existing unknown summaries closed by this delivery;
- `verification`: named checks with exact commands, `pass`, and bounded evidence;
- `semantic_no_change_reason`: an evidence-backed reason when `baseline_updates` is
  empty.

Every updated file needs a semantic change record and current anchor. The before digest
must match baseline authority and the after digest must match the file. Keep the
manifest with the change so archive recovery can replay the same transaction after an
interrupted filesystem move.
