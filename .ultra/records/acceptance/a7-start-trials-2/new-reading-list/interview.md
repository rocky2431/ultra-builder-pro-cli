# Interview: reading list (2026-11-12)

**The Owner was not available for this session.** Every answer below was written by the
assistant on the Owner's behalf, as the Owner asked at the start of the session; each is
logged with `proxy: yes` in `.ultra/records/owner-touches.md`. None of it is Owner
validation. The Owner confirms or corrects it at Start step 4 (Confirm), where they see the
Direction and every `Done when` line in plain words.

Starting point: the request "a small command-line reading list for one person (add a link
with a title, list what is unread, mark one read)", the survey (an empty directory) and the
investigation, both in `.ultra/design.md`. Decisions made without asking are in
`.ultra/rulings.md`.

## Q1. North star

**Question:** Who is this reading list for, and what do they get from it?

**Recommended:** One person at a terminal on their own computer. They save a link with a
title in one command, see what is unread in one command, and mark an item read when they
finish it.
**What would change it:** several people or devices sharing one list (that needs sync or a
server, which is a different product), or a list used mainly from a phone or a browser.

**Answer (proxy, verbatim):** It's for me alone, on my own laptop, in the terminal. When I come across something I want to read, I save the link with a title in one command; when I have time, one command shows me what I haven't read yet; when I've read something, I mark it read and it drops off that list. No accounts, no sync, nothing to run in the background.

**Reading.**
- Facts: one user, one machine (a Mac), terminal only. Three actions: save with a title,
  show unread, mark read. No accounts, no sync, no background process.
- Decisions: the product is three commands over a local list, plus the README the method
  requires. No network access, no server, no background process (`design.md` Decisions).

## Q2. Success and abandon conditions

**Question:** How will you know it worked, and what would make you abandon it?

**Recommended:** Success: each action is one command that answers at once, the list
survives restarts, and the tool never loses or garbles a saved link, even when interrupted.
Abandon: keeping the list needs a database, an account or a network, or the data cannot be
a plain file the Owner can read and back up.
**What would change it:** an existing tool to migrate from (import would become a success
condition), or a hard speed target.

**Answer (proxy, verbatim):** It worked if saving, listing and marking read are each one short command that answers right away, the list is still there after I close the terminal or restart the laptop, and nothing I saved ever goes missing or gets garbled because of the tool, even if I hit Ctrl-C at the wrong moment. I'd drop it if keeping the list needed a database, an account or an internet connection, or if I couldn't open the data myself and back it up as a plain file.

**Reading.**
- Facts: the success bar is durability: the list survives restarts and is never lost or
  garbled, even after Ctrl-C. "Right away" carries no number. Abandon if a database,
  account or internet connection is needed, or if the data is not a plain file.
- Decisions:
  - One JSON file, written to a temporary file and then renamed over the list (L2 ruling;
    `design.md` Fact 4).
  - A data file the tool cannot read is never written: the command stops and names the file
    (L1 ruling). This is what the user sees when recovering, so it becomes a requirement of
    its own.
  - No speed requirement. The commands read and write one local file and use no network.
    A number the Owner did not give would be a decision dressed as acceptance.

## Q3. Boundary

**Question:** What is out of scope? (Nothing exists yet, so nothing has to stay the same.)

**Recommended:** Out: editing, deleting, un-marking, showing read items, tags, search,
sorting options, fetching titles or checking links online, import and export, sync, several
lists or users, a GUI or browser extension, platforms other than the Owner's Mac.
**What would change it:** if a mistaken entry must be removable rather than marked read,
delete comes in. That is the most likely pressure point.

**Answer (proxy, verbatim):** Out for now: editing or deleting entries, un-marking, showing what I've already read, tags, search, sorting options, fetching titles or checking links over the internet, import and export, sync, and any GUI or browser plugin. If I add something by mistake I'll just mark it read. It only has to work on my Mac with what's already installed.

**Reading.**
- Facts: the out list above. Marking read is also the workaround for a mistaken entry. It
  runs on the Owner's Mac with what is already installed (`design.md` Fact 1).
- Decisions:
  - Requirements will cover adding a link (a known link included), listing unread, marking
    read, an unreadable data file, and the README. Nothing else.
  - Node standard library, no npm dependency (L2 ruling).
  - Re-adding a read link puts it back on the unread list (Q5). That is the one way back;
    there is no un-mark command.

## Q4. What "elegant" means here

**Question:** What does "elegant" mean for this tool?

**Recommended:** Three memorable commands, output readable at a glance, and error messages
that say what to do. No third-party packages, one small readable data file, and code small
enough to read in one sitting.
**What would change it:** a preference for a single compiled binary, or for colour or an
interactive interface.

**Answer (proxy, verbatim):** Three commands I can remember without looking anything up, output I can read at a glance, and messages that tell me what to do when I get something wrong. Under the hood: no third-party packages, one small readable data file, and code small enough to read in one sitting.

**Reading.**
- Facts: memorable commands, output readable at a glance, error messages that help, no
  third-party packages, one readable data file, small code.
- Decisions:
  - "No third-party packages" is a rule a machine can check. It is a candidate invariant
    for the spec stage (`package.json` declares no dependencies).
  - Errors go to standard error with a non-zero exit. The spec's interface will pin the
    exact codes.
  - "Small enough to read in one sitting" stays guidance in the Direction. No size
    invariant unless the code starts to grow (judged at cleanup and at the gate).

## Milestone split: not asked

Ruled instead (L3, `.ultra/rulings.md`): one milestone holds every requirement, and its
journey walks add → list → mark read → list through the real command. Three small
behaviors that are only useful together make one deliverable.

## Q5. How the Owner tells each behavior is done

**Question:** For each thing you can do with it (add, list unread, mark read, and getting started), how would you tell, trying it yourself, that it is done?

**Recommended:** one sentence per behavior, as in the answer below.
**What would change it:** marking items by link instead of number, or listing newest first.

**Answer (proxy, verbatim):** Adding: I give it a link and a title, it says it's saved and shows the number it got, and the next list shows it; a link that isn't an http or https web address, or a missing title, is refused with a message that says what's wrong, and nothing is saved; adding a link that's already in my list doesn't make a second entry: it tells me it's already there and its number, and if I had already read it, it goes back on my unread list. Listing: I see only what I haven't read, oldest first, each with its number, title and link, and a plain message when there's nothing left. Marking read: I give the number from the list, it says which item it marked, and that item is gone from the next list; a number that doesn't exist or is already read gets a clear message and changes nothing. Getting started: following only the README on a fresh copy, I can install it, save a link, list, mark it read, and find out where my list is kept and how to use another file.

**Reading.**
- Facts: the acceptance sentences for adding, listing, marking read and getting started,
  quoted above.
- Decisions:
  - Link rule: an `http:` or `https:` URL with a host, stored in its normalized form. Two
    links are the same when their normalized forms are equal (L1 ruling; `design.md`
    Fact 3).
  - Numbers are given when an entry is added and are never reused or renumbered.
    Re-adding a read link keeps its number and its stored title (L1 ruling).
  - "Oldest first" means ascending number.
  - The README's `Done when` names the data file's default place and `READING_LIST_FILE`.
- No conflict: "each add gives a number" and "adding a known link makes no second entry"
  are reconciled by the answer itself. Only a new link gets a new number.

## Owner sentences behind the requirements to come

| Requirement (to be written) | Owner sentence (proxy) |
|---|---|
| Direction (north star, success, abandon, boundary, elegance) | Q1, Q2, Q3, Q4 |
| Add a link with a title | Q5 "Adding: I give it a link and a title, it says it's saved and shows the number it got…" |
| Adding a link already in the list | Q5 "adding a link that's already in my list doesn't make a second entry…" |
| List unread | Q5 "Listing: I see only what I haven't read, oldest first…" |
| Mark one read | Q5 "Marking read: I give the number from the list…" |
| A data file the tool cannot read is left untouched | Q2 "nothing I saved ever goes missing or gets garbled because of the tool" |
| README: install, use, where the list is kept | Q5 "Getting started: following only the README on a fresh copy…" |

Every requirement about to be written has a sentence behind it, so the interview stops
here.

Left for the spec stage, as interface (L2): the command's name and argument syntax (a title
with spaces included), message wording, exit codes and the layout of `list` output.

Not done in this session, as the Owner asked: Start step 4 (spec, checks and the Owner's
confirmation of the Direction and every `Done when` line).
