# ZCode repair packet — v502 Review round 1

## Mission

Repair one current-evidence contradiction in the accepted Change
`chg-ultra-5-0-2-authority-reconciliation`. You are the sole product/documentation
implementation writer for this packet. Codex is the read-only reviewer.

## Owner authority and grant

- Owner selected ZCode as the implementation writer and Codex as reviewer for the
  current Goal.
- Durable closeout grant:
  `.ultra/decisions/2026-09-01-v502-zcode-closeout-grant.md`
- Expected grant SHA-256:
  `c7bc58e853c0883f4cbbe32471391a81bb468c648432387f556b11d8442778d1`
- No commit, push, tag, publish, deploy, real-HOME install, credential/identity change,
  purchase, or production/external effect is authorized.

## Verified finding — P1

`.ultra/specs/research-distillate.md:104` labels its real-HOME Doctor observation
"Current" and says the source-tree Doctor degraded *only* for the expected
5.0.2-versus-5.0.1 package mismatch. A fresh 2026-09-01 read-only command:

```text
node bin/install.js --all --global --doctor --json
```

reported all six installed packages at 5.0.1 and all six selected ACP with
`fallback_reason: null`, but Codex also reported `HOST_PLUGIN_NOT_DISCOVERED` in
addition to `PACKAGE_VERSION_MISMATCH`. Codex Hook activation remained
`host_managed` with `observable: false`; ZCode remained `experimental`.

The documentation must not rewrite the 2026-08-26 snapshot as if it had observed a
later fact, must not claim the Host issue was caused or fixed by this Change, and must
not hide the current limitation.

## Writable files — exact

- `.ultra/specs/research-distillate.md`
- `.ultra/contexts/task-v502-authority-reconciliation.md`

Do not edit any other file. Preserve every pre-existing tracked and untracked change,
including all `docs/wip/**`, `work/**`, runtime source, tests, package metadata, and the
active intent/grant.

## Acceptance

1. The evidence register makes the 2026-08-26 real-HOME observation explicitly dated
   rather than current.
2. It records the fresh 2026-09-01 read-only observation exactly: six expected version
   mismatches plus the Codex `HOST_PLUGIN_NOT_DISCOVERED` limitation; all six ACP
   selections and fallback reasons remain accurately stated.
3. The task Resume Note/verification status records the same current limitation and
   does not claim formal Review, Deliver, installation, or repair of the Host issue.
4. No runtime, test, public product, vNext WIP, or release behavior changes.
5. Run the smallest structural checks that cover these edits, at minimum
   `git diff --check -- <the two writable files>` and a readback/diff inspection.

## Stop conditions

Stop without editing further if the grant digest differs, either writable file changed
after your initial snapshot, the repair would require another file, or any external
effect/owner decision is needed. Report the exact blocker; do not broaden scope.

## Return

Report changed paths, the exact wording-level correction, commands and exit results,
and remaining limitations. A zero exit or transport receipt is not semantic approval.
