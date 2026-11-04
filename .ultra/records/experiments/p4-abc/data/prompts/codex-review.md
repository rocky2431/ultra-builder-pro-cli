# Read-only review of one change

Do not modify, create, delete or commit any file in this repository. Return findings only.

Repository: the current directory, a small Node HTTP server (`src/server.cjs`, `src/store.cjs`). The specification is `.ultra/spec.md`. A writer has just implemented this requirement:

{REQ}

Review `git diff {BASE}..HEAD -- src` against that requirement and against the existing requirements in `.ultra/spec.md` it must not break. You may run `node --test test/*.test.cjs`; your sandbox may not allow a server to listen on a port, in which case reason from the code.

For each finding give: the concrete input (request or data file), what the specification says should happen, what the code does, the file and line, and your confidence. Leave out style and anything the specification does not ask for. If you find nothing, say `No findings.`
