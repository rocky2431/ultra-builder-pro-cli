Node N-custom-code is done: `ubp node done N-custom-code` printed `node N-custom-code: pass` with exit 0, and the working tree is clean on `main`. I escalated nothing.

**Commits** (local, on `main` in `/tmp/abc/T1-B`)
- `d43459b feat(custom-code): choose the short code (REQ-custom-code)` changes `src/server.cjs` and `src/store.cjs`.
- `d55b8fd docs(ultra): hand off N-custom-code and record its rulings` adds the handoff and three rulings.
- `c8bc57a chore(ultra): record N-custom-code evidence and completion` holds the engine's ledger output. It includes the controller's earlier uncommitted red-run lines.

**What changed**
- `POST /api/links` accepts an optional `code`, using exactly `/^[A-Za-z0-9]{4,10}$/` after a `typeof === 'string'` check.
- A present `code` that fails answers 400 with `BAD_CODE`, including `null`, numbers, `_` and a trailing newline.
- A stored `code` answers 409 with `TAKEN`. These checks run after `expires_in`.
- `store.add(url, seconds, code)` skips the random draw when given a code.
- The 409 is decided in the route with `store.get`, since `add` returns null only for a failed save.

**Checks**, all run through the engine on the committed tree; the ledger shows `dirty=false` and one code hash for all nine.

| Command | Result | Exit |
|---|---|---|
| `ubp check C-custom-code` | pass | 0 |
| `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete` | all 8 pass | 0 |
| `ubp node done N-custom-code` | `node N-custom-code: pass` | 0 |

- `C-custom-code` was red before the change (201 where 409 and 400 were expected, a random code where `docs` was expected).
- A plain `npm test` run before the code commit gave 30 of 30 passing. I did not capture its exit code.

**Hand probe, not part of the repo.** The script is `/tmp/probe-custom-code-scripts/probe.cjs`, with data in temp directories, and its two servers were stopped by PID.
- It passed all 11 groups:
  - both ends of the length range;
  - 25 refused values, with the file left byte-identical;
  - `docs` and `Docs` as two links;
  - the order of the checks;
  - 30 parallel creations of one code giving one 201 and 29 409s;
  - an expired link keeping its code, and `DELETE` freeing it;
  - restart;
  - a read-only data directory giving 500 and leaving the code free.
- It fails on two broken copies of `src/`: one without the `typeof` check, one with `\w`.

**Rulings** (`.ultra/rulings.md`, lines 61–63)
- **L2:** a present `code` is validated even when `null`, as for `expires_in`. It is used as written, with no trim and no case folding.
- **L2:** an expired link still holds its code. `add` trusts the route's prior `get`, so a caller that skips it would overwrite a link.
- **L4:** no reserved words. A custom code `links` makes `GET /links` redirect; `POST /links`, the form, still answers 303. Refusing it would narrow the requirement, so it needs the Owner.

**Not verified or not done** (also in `.ultra/records/handoffs/N-custom-code.md`)
- No check pins the probed behaviors beyond the four bad values in `C-custom-code`; checks and `test/` are outside my scope.
- The web form has no `code` field, because the spec covers `POST /api/links` only.
- I did not run it in a real browser, and no markup changed.

The handoff is at `/tmp/abc/T1-B/.ultra/records/handoffs/N-custom-code.md`.
