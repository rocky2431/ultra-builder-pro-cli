# Interview: link expiry (M4), 2026-11-12

The Owner's request, verbatim:

> I want to add link expiry: when I create a short link I can say how long it should live,
> and once that time has passed it stops redirecting.

The Owner also wrote, verbatim: "This is a headless trial and I am not available to answer
questions. Answer every question the method would put to me by proxy yourself, choosing your
recommended answer, and record each one in .ultra/records/owner-touches.md with proxy: yes
(the confirmation step included)."

So every answer below was given by the assistant for the Owner (proxy: yes). It is the
recommended answer, and it is not the Owner's validation.

## What the survey and investigation settled before any question (facts)

- The behavior the Owner asked for already exists and passes its tests. `POST /api/links` and
  the form on `/` take `expires_in` (whole seconds). Every link reports `expires_at` (ISO
  time, or `null` for never). Once that time has passed, opening the short link answers 410
  with a page saying 已过期 and counts nothing. Sources: `src/store.cjs` and `src/server.cjs`
  at 8de0e2c, and `test/expire.test.cjs` and `test/journey-m2.test.cjs` (green).
- It keeps working across a server restart (probe, 2026-11-12). No test pinned that.
- It was delivered as M2 under an earlier UBP state, and M2 was closed by proxy: the Owner
  never saw its demo. That explains why the Owner asks for it now.
- No README exists. A new user learns that a lifetime can be set, and that its unit is
  seconds, only from the form's placeholder text.

## Q1 (north star): what should this work give you?

Question: Link expiry already exists: the API and the page take `expires_in` in seconds, the
link reports `expires_at`, and after that time opening it shows a 410 已过期 page. It was
delivered before but closed without you seeing it. Should this work (a) keep it as it is,
confirm it against your words and make it usable by someone who has only the README, or
(b) rebuild or change how it works? Recommended: (a). What would change it: trying it and
finding that it is not what you meant, for example an end date instead of a duration, or a
number of visits instead of a time.

Answer (proxy): "(a). Keep the existing expiry as it is, confirm it against my words, and
make it usable from the README alone. Do not rebuild it."

Reading: the north star stays the project's (one person or a small team runs Shortlink on
their own machine). This work's part of it is the Owner's sentence, met by the code that
exists. The work is acceptance and documentation, not a mechanism.

## Q2 (success and abandon)

Question: Success: following only the README, you start Shortlink, create a link that lives a
time you chose from the page and through the API, it redirects until then and stops after,
also across a restart, and everything that passes today still passes. Abandon: if meeting
your sentence needs an npm dependency, a second process, or a change of the data file format.
Recommended: as stated. What would change it: accepting a dependency or a background cleaner.

Answer (proxy): "Agreed as stated."

Reading: "also across a restart" is the assistant's reading of "once that time has passed it
stops redirecting". The Owner runs Shortlink on their own machine, where restarts are
ordinary.

## Q3 (boundary): in which unit do you say "how long", and what is out?

Question: Today a lifetime is whole seconds only. Recommended: keep seconds on the page and in
the API, so no contract changes, and put common values in the README (one hour 3600, one day
86400, seven days 604800). Out of this work: other units or a date picker, changing or
removing a lifetime after creation, deleting expired links automatically, and showing a live
link's end time on the page. Must not change: everything the 49 existing tests pin, the API's
field names and messages, and the data file format. What would change it: setting lifetimes by
hand on the page often enough that seconds get in the way. That would add a unit choice to the
form as a new requirement.

Answer (proxy): "Keep seconds; put common values in the README. The rest is out, as listed,
and nothing that works today may change."

Reading: decision. The README carries the conversion and the API stays as it is. The list of
what is out goes into the Direction's boundary.

## Q4 (elegance and the milestone split)

Question: Elegance here stays zero npm dependencies, `npm start`, one JSON data file and code
readable in one sitting. For this work it also means writing no product code when the existing
code already does what you said: the README and the checks are the change. One milestone, M4,
with one node that writes the README. Recommended: as stated. What would change it: wanting the
rebuild or the units, which would add nodes.

Answer (proxy): "Agreed: one milestone, no product code unless a check finds a gap."

Reading: decision. M4 holds REQ-expire, REQ-expire-page and REQ-readme. The milestone ID
follows M1–M3 in the history, so the journey files' names (`journey-m1` to `journey-m3`) keep
their meaning.

## Q5 (how you would tell each behavior is done)

Question: Recommended acceptance sentences:
- API: "I create a short link through the API saying how long it should live; it redirects
  until then, and once that time has passed it stops redirecting, also after the server
  restarted."
- Page: "On the page I create a short link and say how long it should live; it redirects
  until then, and once that time has passed it stops redirecting and the page marks it 已过期."
- README: "Following only the README, a new user starts Shortlink, creates a short link that
  lives for a time they chose, from the page and through the API, and knows what a visitor
  sees once that time has passed."
What would change them: a behavior you would check differently by hand.

Answer (proxy): "Those three sentences."

Reading: they are the `Done when` lines of REQ-expire, REQ-expire-page and REQ-readme, word
for word.

## Confirmation

The Direction and the three `Done when` lines, in plain words, were put to the Owner for
confirmation and confirmed by proxy (see `.ultra/records/owner-touches.md`).
