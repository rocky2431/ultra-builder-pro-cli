# Deployment and operations

Use for workflow step `40-deployment`.

## Objective

Record how the system is built, configured, migrated, deployed, observed, recovered,
and rolled back across its actual environments.

## Evidence

- Inspect repository-native build and deployment configuration, environment contracts,
  migrations, health checks, and operational documentation.
- Use current provider documentation only when repository evidence is insufficient.
- Separate verified deployment behavior from intended delivery design.
- Never record secrets or fabricate infrastructure that has not been selected.

## Record

Update `architecture.md` with environments, topology, CI/CD entry points, configuration,
migrations, observability, rollback, recovery, cost constraints when relevant, and
unknowns.

Complete the step with file, runtime, or provider evidence and the updated output path.

## Report trace

In the area report, record `environment`, `entry_point`, `config_migration`,
`observation`, and `rollback_recovery`, then link the architecture heading.
