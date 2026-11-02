# Decision (proxy): what the v6 package contains

Date: 2026-11-01. Decided by the assistant under the Owner's delegation of 2026-11-01
("你快速地全部做完之后，我来验收，这个中间应该不太需要我了"); not validated by the
Owner. Listed for the Owner's acceptance.

## Basis

- RESULT §4 (confirmed with the contract): one entry point (`/ultra` or `ubp`) that reads
  the state and decides the next step, "solving several Skills competing to inject the next
  step"; the method's stages are "internal stages of one product, not Skills that reference
  each other"; adapters for Claude Code and Codex first; Factory, six-host parity, six
  reviews per task, per-tool-call reinjection and the 8 MiB injection cap leave the main
  path.
- `.ultra/decisions/2026-10-31-ubp-v6-complete-version.md`: Claude Code and Codex only;
  Factory, W3 IPC, durable grants, wake-up and the OpenCode, Kimi, Grok and ZCode adapters
  leave the default path and the release gate, recoverable from Git history and 5.0.2.

## Decision

v6.0.0 installs, for Claude Code and Codex:

1. one Skill, `ultra`, whose body is the method (`method/ultra.md`), telling the model to
   drive the project through `ubp`;
2. the engine, reached as `ubp <command>` (the package's `bin`);
3. one SessionStart hook that prints the `ubp status` line when the project has
   `.ultra/spec.md`, and nothing otherwise.

Everything else of 5.x leaves the v6 branch: the fourteen 5.x Skills, the five 5.x hooks
and their Python support code, the four other host adapters, the `run`, `delegate` and
durable/wake/Pi/ACP machinery under `bin/` and `skills/ultra-delegate/`, the `.ultra-template`
skeleton, and the tests and package entries that cover only those. They are deleted rather
than kept unused, because unused code in the package would keep their hooks and Skills one
flag away from competing with `/ultra` again. Recovery: Git history (the last 5.x commit on
`main`) and the published 5.0.2.

## Why not keep the 5.x Skills next to `/ultra`

Two entry points that both claim the next step is the failure RESULT §4 names. A 5.x hook
injecting 5.x state into a v6 project would contradict `ubp status` on every session.

## Cost if this is wrong

The Owner loses the 5.x Skills inside v6 (for example research and domain modelling, which
the v6 method does not cover). Undo: restore the deleted paths from Git, or install 5.0.2
side by side in a different config directory.

## How to reverse

`git revert` of the packaging commit on `v6`; nothing is published.
