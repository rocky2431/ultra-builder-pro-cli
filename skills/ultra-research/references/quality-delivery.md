# Quality and delivery research

Read this reference when acceptance depends on operational risk, security, migration,
deployment, recovery, or release constraints.

## Risk-driven quality

Identify failures that would materially affect users, data, authorization, money,
availability, or recoverability. For each relevant risk, record:

- trigger and affected boundary;
- expected behavior and observable signal;
- prevention, detection, and recovery;
- verification method and owner.

Apply security, performance, accessibility, and resilience checks according to the
actual product surface. Do not impose generic categories or coverage percentages when
they do not define acceptance.

## Delivery path

Capture the environments, configuration authority, migration order, compatibility
window, health and readiness checks, observability, rollout, rollback, and operator
actions needed for this product.

Prefer existing repository and platform workflows. Add a new service, dependency, or
deployment mechanism only when the accepted architecture requires it.

## Record the result

Update the architecture and product specifications with testable quality scenarios,
delivery constraints, failure behavior, recovery evidence, and release acceptance.
Keep exact volatile commands in the repository's runbook when they are operational
procedure rather than durable architecture.
