## Verdict

**No P0/P1 correctness defects found in the reviewed Pi integration.** Source wiring is fail-closed and preserves Pi’s native tools, including Bash and PowerShell, while applying the Ultra permission hook before execution.

### Verified

- Native inventory matches installed Pi `0.85.1`: `read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`, `ls`.
- `--no-builtin-tools` plus explicit policy extension preserves only the policy-restored native tools.
- Version/runtime/package identity is checked before launch.
- Permission configuration, policy source, runtime files, and tool-module path are bound into the launch spec.
- Writes/edits normalize Pi path spellings and use the same mutated path for authorization and native execution.
- Symlink escapes are rejected through existing-ancestor realpath checks.
- Denials require observed native error completions; terminal parsing requires normal Pi completion events.
- Sanitized environment policy is inherited consistently; `HOME` intentionally remains available.

### Lower-severity limitations

- Pi remains explicitly **unqualified/experimental**: `skills/ultra-delegate/scripts/host-profile.cjs:806-824`; no retained enforcement qualification exists.
- Read/search tools are allowed without location-envelope checks, inherited from shared `permissionDecision` behavior in `acp-driver.cjs:241-281`.
- Filesystem authorization has the usual check/use race if another process swaps symlinks concurrently.
- QA was source-only; no live `delegate run` probe or actual Pi model/tool execution was performed.
