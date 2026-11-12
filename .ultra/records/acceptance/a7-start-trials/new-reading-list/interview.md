# Interview: reading-list command-line tool

- Date: 2026-11-12
- Interviewer: Claude (controller, in the interviewer role)
- Owner: unavailable (headless trial). **Every answer below except the start request was
  given by the assistant by proxy (`proxy: yes`), as the Owner instructed. A proxy answer
  is the assistant's recommendation, not the Owner's validation.** The Owner should
  confirm or correct these answers when they read this file.

## The Owner's own words (not proxy)

The start request, verbatim:

> I am the Owner. I want a small command-line tool to keep my reading list: add a book,
> mark it read, and list what I have not read yet.

The delegation, verbatim, also logged as a `delegation` touch:

> This is a headless trial and I am not available to answer questions. Answer every
> question the method would put to me by proxy yourself, choosing your recommended answer,
> and record each one in .ultra/records/owner-touches.md with proxy: yes.

## What the survey and investigation settled first

These points shaped the questions. Details and sources are in `.ultra/design.md` under
`## Facts`.

- The repository is empty, so nothing exists that must stay unchanged.
- Node.js v25.7.0 and npm are installed. Node can parse arguments and run tests with no
  dependency, and npm can install a command without `sudo`.
- On this Node version, a test count alone does not prove tests ran (Fact 5). This affects
  how checks are written later, not what the Owner is asked.

## Q1. North star

**Question.** Who is this tool for, and what should they get from it?

**Recommended answer.** It is for you alone, on your own computer, in a terminal. You get a
place to note a book the moment you hear of it, and a quick way to see what is still
waiting to be read. *What would change it:* sharing the list with someone else, or using it
from a phone. That needs sync or a server, which makes it a different product from a small
command-line tool.

**Answer (proxy: yes, verbatim).**

> It is for me alone, on my own computer, in the terminal. I want to write a book down the
> moment I hear about it, and later see at a glance what I still have not read.

**Reading.**
- Facts: one user, one machine, used through a terminal.
- Decisions: no accounts, no network and no concurrent users. "At a glance" means the
  unread list must be short and plain to read.

## Q2. Success and abandon conditions

**Question.** How will you know this worked, and what would make you stop using it?

**Recommended answer.** It worked if you keep your real list in it, each of the three
actions is one short command, and weeks later the list is exactly what you left. You would
stop using it if it ever lost or scrambled your list, or if it needed more than Node.js
(already on this machine) to install and run. *What would change it:* if you would accept
setup steps such as a database or package downloads, there would be more storage choices.

**Answer (proxy: yes, verbatim).**

> It worked if I keep my real reading list in it and every book I added is still there
> weeks later, marked the way I left it, with each of add, mark read and list being one
> short command. I would stop using it if it ever lost or scrambled my list, or if it
> needed anything installed besides Node.js.

**Reading.**
- Facts: there are two ways to fail, data loss and installation burden.
- Decisions (see `.ultra/rulings.md`):
  - built-in Node.js modules only, with no npm dependency;
  - each change of the list is written whole to a temporary file and renamed into place,
    so a crash cannot leave half a list;
  - the list lasts across runs. This is part of each behavior's acceptance, not a feature
    of its own.

## Q3. Boundary

**Question.** What is out of this tool? (There is no existing code, so nothing must stay
unchanged.)

**Recommended answer.** These are out:
- sharing, syncing or other users;
- a web or phone version;
- ratings, reviews, notes, tags and priorities;
- looking books up online;
- importing from other services;
- editing or deleting a book;
- listing books already read.

If you mistype a title, you fix the data file by hand, so the instructions must say where
it is. *What would change it:* if you expect to mistype often, deleting a book comes in.
If you want a record of what you have read, a "list read books" command comes in.

**Answer (proxy: yes, verbatim).**

> Out: sharing, syncing or other users; any web or phone version; ratings, reviews, notes,
> tags or priorities; looking books up online; importing from other services; editing or
> deleting a book, and listing the books I have already read. If I mistype something I can
> fix the data file by hand, as long as the instructions tell me where it is.

**Reading.**
- Facts: the product is exactly add, mark read and list unread.
- Decisions:
  - The data file must be plain text a person can read and edit.
  - The README must name its location, how to move it (`READING_LIST_FILE`), and how to
    fix a mistake by hand. This is the "recovers" part of the README requirement.
  - Unmarking a book is also out. It is the same kind of fix-by-hand case.

## Q4. What "elegant" means here

**Question.** What does "elegant" mean for this tool?

**Recommended answer.**
- One command with three plain verbs.
- Output you can read at a glance.
- A mistake gets a one-line message saying what to type instead, and the list stays
  untouched.
- Nothing to install, and the data kept in one plain file.
- No code or option the three actions do not need.

*What would change it:* if you would rather pick from an interactive menu than type verbs.

**Answer (proxy: yes, verbatim).**

> One command with three plain verbs, output I can read at a glance, and when I get
> something wrong a one-line message that tells me what to type instead and leaves my list
> as it was. Nothing extra to install, my list kept in one plain file I could read myself,
> and no features I did not ask for.

**Reading.**
- Facts: the Owner wants verbs, not menus, and minimal surface.
- Decisions for the spec's Direction:
  - Every refused input exits non-zero.
  - It prints one line saying what to type instead.
  - It leaves the data file byte-for-byte unchanged.

## Q5. How you would tell each behavior is done

**Question.** How would you tell that adding a book, marking it read and listing what is
unread each work?

**Recommended answer.**
- **Add.** You add a book by title, with the author if you like, and the next list shows
  it. Adding the same book again says it is already there and adds no copy.
- **List.** The list shows only unread books, in the order you added them, each with a
  number, its title and its author. When nothing is left, it says so.
- **Mark read.** You mark a book read by the number the list shows, and it disappears. The
  other books keep their numbers. A number not on your list gets a clear message and
  changes nothing.
- **Lasting.** Everything is still there after you close the terminal.
- **Instructions.** Following the README from scratch, you can install the tool and do all
  of this.

*What would change it:* if you would rather mark a book read by typing its title, the
number would go.

**Answer (proxy: yes, verbatim).**

> I add a book by its title, with the author if I want, and the next list shows it; adding
> the same book twice tells me it is already there instead of adding a copy. The list shows
> only the books I have not read, in the order I added them, each with a number, its title
> and its author; when nothing is left it says so. I mark a book read by the number the list
> shows, and it no longer appears; the other books keep their numbers, and a number that is
> not on my list gets a clear message and changes nothing. Everything is still there after I
> close the terminal and come back. And following the README from scratch, I can install it
> and do all of this.

**Reading.**
- Facts:
  - Title is required and author is optional.
  - A book is identified by a number that stays the same while other books are marked
    read. So the number is assigned when the book is added, not taken from its position
    in the list.
  - The list is in the order books were added.
  - An empty list gets a plain message.
- Decisions left to the spec step. Each will be logged as a ruling when it is made:
  - **Duplicate rule.** Recommended: "the same book" means the same title and the same
    author, ignoring letter case and surrounding spaces, among books **not yet read**. A
    book already read can then be added again to re-read it. The Owner's "already there"
    is about what they see on the list.
  - **Marking a number that is already read.** Recommended: it is refused, like an unknown
    number, because it is "not on my list".
  - **Numbers are never reused.**
  - **An empty or blank title is refused.**

## Decided instead of asked

- **Milestone split.** One milestone, M1: add, mark read, list unread and the README, with
  one journey through the real command. This is a ruling, logged in `.ultra/rulings.md` on
  2026-11-12. The three actions are one small delivery, and add without list or mark read
  is not yet a usable reading list. Asking about it would have been a sixth question about
  a decision the planner can make.

## Left for the specification step

- The command's name and exact syntax, for example `<name> add "<title>" [--author
  "<author>"]`, `<name> read <number>` and `<name> list`.
- The exact wording of messages.
- The interface checks rely on: `READING_LIST_FILE`, the data file's JSON shape, and exit
  codes.
- The oldest Node.js version the README promises (an open unknown in `.ultra/design.md`).

## Why the interview stops here

Each requirement the spec step is expected to write has an Owner sentence behind it. Those
sentences come from the start request, which is real, and from the answers above, which are
proxy.

| Expected requirement | Owner sentence behind it |
|---|---|
| Add a book (title, optional author, no duplicate) | start request "add a book"; Q5 "I add a book by its title, with the author if I want … adding the same book twice tells me it is already there" |
| List unread books (numbered, in added order, empty message) | start request "list what I have not read yet"; Q5 "The list shows only the books I have not read …" |
| Mark a book read by its number | start request "mark it read"; Q5 "I mark a book read by the number the list shows …" |
| The list lasts across runs and is never half-written | Q2 "every book I added is still there weeks later … stop using it if it ever lost or scrambled my list"; Q5 "Everything is still there after I close the terminal" |
| README: install, use, where the data lives, fix by hand | Q5 "following the README from scratch, I can install it and do all of this"; Q3 "as long as the instructions tell me where it is" |

The next step under the method is "Confirm". The spec and checks are written, then the
Direction and every `Done when` line are shown to the Owner for confirmation. That step was
not started, as the Owner instructed.
