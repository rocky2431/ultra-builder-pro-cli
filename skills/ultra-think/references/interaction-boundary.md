# Owner interaction boundary

Use this reference only when a material choice remains after inspecting current
authority and observable facts. Ultra does not require a ceremonial question before
every write.

## Responsibility split

- The owner controls product intent, acceptance, non-goals, material tradeoffs, risk
  acceptance, irreversible actions, external effects, and real-money commitments.
- The host model investigates facts, recommends a direction, makes reversible
  implementation judgments, and explains uncertainty.
- Use the host-native question surface when one exists; prefer its structured form.
- `.ultra/decisions/*.md` stores only a normalized durable result and bounded
  provenance. Git supplies history and recovery.

## Interaction sequence

1. Read `.ultra/north-star.md`, resolve at most one active `change_id`, then read only
   matching `.ultra/tasks.json` rows and the current task context, plus relevant
   specifications, Changes, decisions, and evidence.
2. Inspect source, runtime, tests, and primary documentation for observable facts.
3. Reuse an explicit choice already present in the current request or an accepted
   decision file.
4. Decide a reversible delegated detail without asking.
5. When owner authority is still required, ask one unresolved owner choice at a time
   with the recommendation, discriminating evidence, meaningful failure mode, and what
   changes under each viable answer.
6. Write a qualifying durable result to `.ultra/decisions/<id>.md` with question,
   status, selected answer, effects, non-goals, owner, date, evidence, consequences,
   and a supersession link when applicable.
7. Read that file back before relying on it.

Never persist raw transcripts, hidden reasoning, full prompts, UI receipts, or copied
provider payloads.

## Revisions and interruptions

Accepted decisions are append-only history. A changed answer creates a new file that
supersedes the prior decision. A cancelled question writes nothing. If the answer
cannot be obtained, keep the issue open in the active task context and stop only the
effect that requires that authority; unrelated work remains available.
