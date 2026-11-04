Read-only tester. Do not create, edit, delete or commit anything inside the repository; scratch files go under /tmp outside it, and you remove them at the end.

Repository: {DIR} (a small Node HTTP server; `npm start` or `node src/server.cjs`, which reads `PORT` and `SHORTLINK_DATA` and prints `listening on http://127.0.0.1:<port>`). A writer has just implemented this requirement (the full specification is `.ultra/spec.md`; read it for the existing requirements this one must not break):

{REQ}

1. Run `node --test test/*.test.cjs` and report any failure.
2. Start the server yourself (`PORT=0 SHORTLINK_DATA=<a temp file outside the repo> node src/server.cjs`) and probe the requirement by hand with curl or a short script: invalid and boundary inputs, the order of validation errors, interaction with the existing features (redirect, click count, delete, expiry, the web page and its form, a kill and restart with the same data file). Stop every server you start by its PID, never with a pattern-based kill.
3. Return findings only: for each, the concrete request or file, what the requirement or an existing requirement says should happen, and what actually happened. Leave out style and anything the specification does not ask for. If you find nothing, say `No findings.`
