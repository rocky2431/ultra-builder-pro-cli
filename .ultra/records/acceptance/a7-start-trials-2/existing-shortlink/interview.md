# Interview: M4 (total visits, deleted links answer 410)

Date: 2026-11-12. The Owner was not available for this session and handed every touchpoint
of this run up to the milestone gate to the assistant (a `delegation` touch). Every answer
below was given by the assistant on the Owner's behalf (`proxy: yes`): it is not the Owner's
validation, and the milestone gate must say so.

The Owner's request, verbatim from the session:

> 1. At the top of the page at `/`, the total number of visits over all links.
> 2. A short link that was deleted no longer answers a plain 404: it answers 410 with a page
>    saying 已删除, so a person who follows an old link knows it was removed on purpose. A
>    code that never existed still answers 404.

## Q1. For whom, and what do they get?

Recommended: the operator gets one number for how much all links are used; a person
following an old link learns it was removed on purpose. Would change if the total were meant
for visitors, or the 410 for API clients.

Answer (proxy): "For the person who runs Shortlink: one number at the top of / tells how much
all links are used. For anyone who follows an old short link: a page that says 已删除 instead
of a plain Not found, so they know it was removed on purpose."

Reading: decision. The total lives on the page only; the 410 concerns `GET /<code>`, not the
JSON API.

## Q2. Which visits does the total add up?

Recommended: the visits of the links the page lists, so the total equals the sum of the
点击次数 column. Would change if the Owner wanted visits ever made, deleted links included.

Answer (proxy): "The links the page lists: the total must equal the sum of the 点击次数
column, so I can check it by eye. A deleted link's visits leave the total with it."

Reading: decision. Expired links stay listed, so their visits count. A visit is what the
per-link count already counts (a redirecting open); 404 and 410 answers count nothing (fact,
from the code and `test/count.test.cjs`, `test/expire.test.cjs`).

## Q3. What must not change? May a deleted code be chosen again?

Recommended: nothing the existing suite pins changes; a deleted code stays free to choose
again (the suite pins it today) and then opens its new link. Would change if the Owner wanted
old links never to lead anywhere new; that refuses an input that works today, a reduction.

Answer (proxy): "Nothing the existing tests pin may change. A deleted code stays free to
choose again; once chosen it opens its new link. Refusing it would take away something that
works today. Generated codes should not land on a deleted code."

Reading: decision; no reduction. Fact: `test/custom-code.test.cjs` pins the reuse.

## Q4. How long does a deleted link answer 410, and what may the page show?

Recommended: for good, across restarts, until the code is chosen again; the page says 已删除
and shows nothing of where the link went. Would change if a short grace period were enough.

Answer (proxy): "For good, also after the server restarts, until the code is chosen again.
The page says 已删除 and does not show where the link used to go. A code that never existed
stays a plain 404. No total in the API, no undelete, no delete button: not now."

Reading: decisions. Deleted codes must be saved in the data file; the old url is not kept.
Out of scope: API total, undelete, delete button, the deletion time or reason.

## Q5. Milestone split, and how will you tell it is done?

Recommended: one milestone, the total first, then the deleted page, as the Owner ordered.

Answer (proxy): "One milestone, the total first, then the deleted page. Done when I open / and
see 总访问次数 at the top matching the 点击次数 column, going up when I open a link and down
when I delete one; and when a deleted link I open says 已删除 with 410, also after a restart,
while a made-up code gives 404."

Reading: decision. Milestone M4 with two nodes in the Owner's order; these sentences are the
`Done when` lines.

## Elegance (not asked; decided, see `.ultra/rulings.md`)

From `package.json` ("A zero-dependency link shortener") and the code: no npm dependency,
the change stays in the two existing modules with their current ownership (store owns data,
server owns HTTP), the smallest code that meets the checks, every data text through `esc`.

## Confirmation

After the spec and checks were written, the Direction and both `Done when` lines were
confirmed by proxy ("Confirmed as written.").
