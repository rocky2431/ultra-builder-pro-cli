I've finished Start through the interview and stopped there. Nothing was written for the specification, the checks or the code. Everything is committed locally as `4ece4b5`; nothing was pushed.

**Progress line:** there isn't one yet. `ubp status` exits 2 because `.ultra/spec.md` doesn't exist, which is expected until the spec is written.

**Survey.** The repository was empty: no commits, no files, no remote. This machine has Node.js v25.7.0, npm 11.10.1 and Python 3.13.5. The notes are in `.ultra/design.md`.

**Investigation.** I ran small test scripts in a temporary folder, outside the repository. One finding changes how checks must be written. On Node v25.7.0, the engine's suggested `expect` of `pass [1-9]` does not prove any tests ran. A name filter that matches nothing, or a test file with no tests, still prints `ℹ pass 1` and exits 0. Checks will need to name the tests they rely on. The engine's FORMATS.md example says the opposite, so I've noted this as a possible fix to the method rather than editing it. Other findings: the tool can read its command-line options using only what comes with Node. Checks can safely test the default data location by pointing `HOME` at a temporary folder. npm can install a command here without `sudo`, though I didn't run the install.

**Interview: five questions, all answered by me on your behalf.** Each is logged with `proxy: yes`, so none of them is your own confirmation. In short:
1. **Who it's for:** you alone, in your terminal: note a book quickly, then see at a glance what's still unread.
2. **Success and abandon:** success is that your list survives for weeks, each action is one short command, and only Node.js is needed. You'd stop using it if it ever lost or scrambled the list.
3. **Out of scope:** sharing, sync, web or phone versions, ratings, notes, online lookup, imports, editing or deleting books, and listing read books. You fix typos by hand, so the README must say where the data file is.
4. **"Elegant":** three plain commands, output you can read at a glance, and one-line error messages that leave the list unchanged.
5. **How you'd tell it's done:**
   - The title is required and the author is optional.
   - The list shows only unread books, in the order added, each with a number.
   - You mark a book read by its number, and the other books keep their numbers.
   - Adding the same book twice is refused, and so is a number that isn't on your list.
   - The list is still there in a new session.
   - The README gets a new user from install to all of this.

**Decided without asking, and logged in `.ultra/rulings.md`:**
- Node.js with no added packages.
- One JSON data file at `~/.reading-list.json`, movable with `READING_LIST_FILE`, saved in a way that a crash can't leave half a list.
- Everything ships in a single milestone. I treated this as my call, so I didn't ask about how to split the work into stages.

**Beyond the four files:** I also committed the method's `.gitignore` and `.gitattributes` setup lines, because the engine needs at least one commit to run.

**Left for the spec step,** listed in `.ultra/records/interview.md`: the command's name and syntax, the exact rule for duplicates, message wording, and the oldest Node version the README will promise.

The next step under the method is "Confirm": write the spec and checks, then show you the direction and every "done when" line to approve or correct.
