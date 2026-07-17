# Removal evidence

Read this reference only when the proposed change deletes or retires code, a contract,
configuration, data, or a dependency.

## Prove reachability and ownership

Search static references, registrations, dynamic loading, reflection, generated code,
configuration, feature flags, scripts, documentation, and external interfaces that may
consume the item. Distinguish no evidence of use from evidence of no use.

## Determine the safe action

Record:

- exact item and owner;
- current consumers and supporting evidence;
- compatibility, data, deployment, and operator impact;
- prerequisites for removal when a consumer or migration remains;
- focused deletion steps, verification, monitoring, and rollback.

Do not assign urgency from age, naming, or deprecation text alone. Severity follows the
cost of retaining an actual hazard or deleting a reachable contract. When evidence is
incomplete, report the missing proof instead of declaring the item safe to remove.
