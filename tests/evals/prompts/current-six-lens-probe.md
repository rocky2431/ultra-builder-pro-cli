# Blind evaluation: current six-lens probe

Review this repository snapshot through the current Ultra specification, code, tests,
errors/recovery, design, and comments/documentation concerns. Inspect only
`.ultra/north-star.md`, `.ultra/changes/active/C-ADV/intent.md`, `.ultra/tasks.json`,
`.ultra/contexts/task-adv-confirmation.md`, `README.md`, `src/`, and `test/`.

Keep contract fidelity separate from engineering quality. Report only concrete defects
with a triggering path, consequence, and source evidence. Do not edit files or search
for an answer key.

In the Ultra delegation result, put one complete finding per `evidence` array entry in
this form: `P<n> path:line | trigger | impact | evidence`. State coverage and limitations
in `summary` or `residual_risks`. Use `changed_files: []`.
