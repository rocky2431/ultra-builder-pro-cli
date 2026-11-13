# Interview, 2026-11-12

The Owner was not available for this session and handed every touchpoint up to the milestone
gate to the assistant (see `owner-touches.md`, `delegation`). Every answer below was given by
the assistant on the Owner's behalf (`proxy: yes`). None of them is Owner validation.

The Owner's own words, relayed in the session request:

> 1. At the top of the page at `/`, the total number of visits over all links.
> 2. A short link that was deleted no longer answers a plain 404: it answers 410 with a page
>    saying 已删除, so a person who follows an old link knows it was removed on purpose. A
>    code that never existed still answers 404.
> Two things in one milestone, delivered in this order.

## Q1. North star, success and abandon

Q: Who is this for, and what do they get? When is it a success, and when should we stop?
Recommended: the person who runs Shortlink sees at a glance how much its links are used, and
a visitor who follows a removed link learns it was removed on purpose. Success means both are
live and every existing test still passes. Stop and ask if remembering deleted codes would
need a dependency or a second data file. What would change it: an Owner who meant an
analytics view rather than a single number.

A (proxy): "As recommended: the total is for whoever runs Shortlink, the 已删除 page is for
anyone following an old link. Success is both behaviors live with the existing suite green.
Stop and ask before adding a dependency or a second data file."

Reading: facts — no dependency exists today and the store writes one file atomically.
Decision — keep both of those.

## Q2. What the total counts

Q: Which visits does the total count? Recommended: the sum of the visit counts of the links
the page lists, expired links included. A deleted link is no longer listed, so its visits
leave the total. Only a visit that redirects counts, as for each link's count; 404 and 410
answers add nothing. It goes above the form, labelled 总访问次数, in plain digits. What would
change it: an Owner who wants every visit ever made, deleted links included.

A (proxy): "The sum of the counts the page lists, so I can check it against the column.
Expired links count, deleted ones leave the total, and only redirects are visits. Put it above
the form as 总访问次数."

Reading: decision. The total always equals the sum of the `data-clicks` column on the same
page.

## Q3. What a deleted short link shows

Q: What exactly does a deleted short link answer, and for how long? Recommended: 410 with an
HTML page saying 已删除 and a short sentence that it was removed on purpose. It never shows the
old destination, counts no visit, and redirects nowhere. It keeps answering this after a
restart. A deleted link that had expired says 已删除 too, since deletion came later. A deleted
code that is chosen again opens the new link, as it does today, and says 已删除 once that one
is deleted. The JSON API keeps its answers: the list leaves the link out, and the detail and a
second DELETE answer 404. What would change it: an Owner who wants the API to report deleted
codes, or the code to stay reserved forever.

A (proxy): "As recommended. It must still say 已删除 after a restart, it must not reveal where
the link went, a code that never existed stays 404, and the API does not change."

Reading: facts — links deleted before this change were not kept anywhere, so they will answer
404; that cannot be repaired. Decision — keep deleted codes as tombstones in the same data file.

## Q4. Boundary, elegance and the split

Q: What is out of scope, what must not change, what does "elegant" mean here, and how is the
work split? Recommended: one milestone (M4) with two nodes in the Owner's order, first the
total and then 已删除. Out of scope: any change to the JSON API's answers, a delete button on
the page, restoring a deleted link, and a README (the project has none). Nothing the existing
suite pins may change. Elegant means no npm dependency, one data file written through the
store, the store knowing nothing of HTTP, and a small diff in the existing style. What would
change it: an Owner who wants a README now.

A (proxy): "One milestone, total first, then 已删除. No README, no API change, no delete
button. Keep it zero-dependency and keep the store and the server as they are split today."

Reading: decision. With no user documentation in the project, M4 has no documentation
requirement (ruling of 2026-11-12).

## Q5. How the Owner tells it is done

Q: How will you tell each behavior is done? Recommended: open `/` and see the total at the
top. It equals the counts below it and rises by one per visit. Then delete a link and follow
its old short link: 410 and 已删除, also after a restart, while a made-up code is still 404.

A (proxy): "Exactly that."

Reading: these become the two `Done when` lines.

## Confirmation

Shown by proxy: the Direction and the two `Done when` lines of `.ultra/spec.md`, in plain
words.

A (proxy): "Confirmed as written."
