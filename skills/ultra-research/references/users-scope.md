# Users, behavior, and scope

Read this reference when actors, workflows, acceptance, boundaries, or success signals
are unclear.

## Actors and scenarios

Model only actors supported by evidence. Prefer roles and jobs over fictional persona
biographies. For each material scenario, capture:

- trigger and preconditions;
- actor goal;
- main flow and system response;
- important failure or recovery path;
- observable completion signal.

## Acceptance and scope

Turn scenarios into testable behavior. Each requirement should name the observable
outcome, relevant constraints, and how success can be verified.

Define:

- included behavior required for the accepted outcome;
- explicit non-goals;
- dependencies and assumptions;
- deferred work only when a real sequencing decision exists.

Avoid arbitrary release buckets or a fixed number of stories. Scope follows the
validated outcome and delivery constraint.

## Success signals

Choose metrics only when they will guide a decision. Define the event, population,
window, source, owner, and interpretation. Do not invent target values; record a
baseline, a user-approved target, or the experiment needed to establish one.

Update the product specification with actors, scenarios, acceptance, scope, non-goals,
and decision-relevant success signals. Keep business facts in their source system and
link them rather than copying volatile datasets into the specification.
