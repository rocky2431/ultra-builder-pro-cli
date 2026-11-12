I've finished Start up to and including the interview record, and stopped before the specification. Because you weren't available, I gave every Owner answer myself. Each one is logged with `proxy: yes` and is not Owner validation; you confirm or correct them at Start step 4, before any code is written.

**What was done**
1. **Survey:** I ran `git init` and made an empty first commit (`126c021`), since the directory was empty. With no code, there were no tests to keep passing and no behavior to preserve.
2. **Investigation:** four quick probes, recorded in `.ultra/design.md` with their source and date:
   - **Tools on this Mac:** Node 25.7, npm 11.10, Python 3.13, Git 2.50.
   - **Test output:** when no test file matches, Node's test runner still exits 0 and prints `ℹ pass 0`. So checks must match a named test line, not just a pass count.
   - **Links:** `new URL()` accepts `javascript:`, `file:` and `mailto:` links. The tool has to check for `http`/`https` itself.
   - **Safe saving:** macOS rename(2) guarantees the file always exists, even after a crash. So writing a temporary file and renaming it over the list can't leave a half-written list.
3. **Interview:** five questions, in the method's order: who it's for, success and abandon conditions, what's out of scope, what "elegant" means, and how you'd tell each behavior is done. I didn't ask about splitting the work into milestones; I decided on one milestone and logged that as a ruling. Every requirement still to be written now traces back to one of the five answers.

**Decisions I made without asking** (six, in `.ultra/rulings.md`):
- The tool uses Node's standard library only, with no npm packages.
- The list is one JSON file, `~/.reading-list.json` by default; the `READING_LIST_FILE` environment variable points it elsewhere. Every save writes a temporary file and renames it over the list.
- A link must be `http` or `https`. Two links count as the same when they match after normalizing (for example, letter case in the domain is ignored).
- Each entry keeps the number it got when added; numbers are never reused or renumbered.
- If the data file can't be read, the tool never overwrites it; it stops and names the file.
- Everything ships as one milestone.

**`ubp status`**
```
/private/tmp/a7r2/reading-list has not started: .ultra/spec.md does not exist. Start it with the ultra Skill.
```
(exit 2, which is expected until the spec exists)

**Files written**
- `.ultra/design.md`
- `.ultra/rulings.md`
- `.ultra/records/interview.md`
- `.ultra/records/owner-touches.md`

The empty first commit contains no files. The four files above aren't committed yet: the method commits them only after the plan check passes, and the engine doesn't count them as uncommitted work. Still left for Start step 4: the spec, the checks, and your confirmation of the goals and every acceptance line in plain words.
