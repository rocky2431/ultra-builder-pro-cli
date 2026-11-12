# Interview, 2026-11-12

The Owner was not available for this session and handed every touchpoint up to the milestone
gate to the assistant (see `owner-touches.md`, the `delegation` line). Every answer below
except the Owner's request itself was given by the assistant for the Owner (`proxy: yes`); it
is not Owner validation.

## The Owner's request (verbatim, relayed in the session brief)

> The Owner wants two things in one milestone, delivered in this order:
> 1. At the top of the page at `/`, the total number of visits over all links.
> 2. A short link that was deleted no longer answers a plain 404: it answers 410 with a page
>    saying 已删除, so a person who follows an old link knows it was removed on purpose. A code
>    that never existed still answers 404.

Reading: one milestone (M4, after the M1–M3 the existing tests name), two requirements, total
first. Milestone split settled by the Owner's words; not asked again.

## Q1 North star

Q: For whom is this milestone, and what do they get?

A (proxy): The people who run and use Shortlink: whoever looks after the page at `/` sees at a
glance how much the links are used in total, and a person who follows an old short link that
was deleted learns it was removed on purpose instead of meeting a plain "Not found".

Reading: two audiences, the page's reader and the follower of a short link. No new audience.

## Q2 Success and abandon

Q: What makes the milestone a success, and what would make you abandon it?

A (proxy): Success: both behaviors hold through the real server, after a restart too, and every
behavior the existing 49 tests pin still holds. Abandon (and come back to me): if remembering
deleted codes needed an npm dependency, a database or a second data file.

Reading (decision): deletions are remembered in the existing data file. Fact: today a deletion
leaves no trace (`store.remove` drops the record), so links deleted before this version answer
404; nothing can recover them.

## Q3 Boundary and elegance

Q: What is out of this milestone, what must not change, and what does "elegant" mean here?

A (proxy): Out: a delete button on the page, restoring a deleted link, showing where a deleted
link went, visit history over time. Must not change: the JSON API (a deleted code is still 404
there), choosing a deleted code again, the 已过期 page of an expired link, the 404 page of an
unknown code, and one data file into which existing data files still load. Elegant: no
dependency, one data file, one place that decides each answer, code that reads like the code
around it.

Reading (decision): only `GET /<code>` changes for a deleted code. Fact: choosing a deleted
code again and "a deleted link is never given back" are pinned by existing tests
(`test/custom-code.test.cjs`, `test/dedupe.test.cjs`).

## Q4 What the total counts

Q: "The total number of visits over all links": the sum of the visit counts of the links the
page lists now (expired links included; a deleted link's visits leave with its row), or every
visit ever made, deleted links included?

Recommended: the listed sum, since anyone can verify it against the 点击次数 column and it needs
no new stored counter. What would change it: wanting lifetime traffic that survives deletions.

A (proxy): The sum of the counts of the links the page lists now, expired ones included. Anyone
can check it by adding up the 点击次数 column; a deleted link's visits leave the total with its
row.

## Q5 How the Owner tells it is done

Q: How will you tell each behavior is done?

A (proxy): Total: I open `/`, see 总访问次数 and the number at the top, before the form; I open
a short link, come back, and it is one higher. Deleted: I delete a link through the API and
open its old short link: 410 with a page saying 已删除 that does not show where the link went,
also after a restart; a code I make up still answers 404.

Reading (decision): the 已删除 page shows no original link (a link is often deleted because its
target was wrong). A visit to a deleted link redirects nowhere, so nothing is counted.
