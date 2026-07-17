---
name: security-rules
description: Evaluate changed trust boundaries for exploitable input, authorization, secret, data-exposure, and supply-chain failures. Use only when an assigned review scope contains a security-relevant boundary.
---

# Review security-relevant changes

Follow data from an attacker-controlled or less-trusted source to a protected action,
secret, identity, or output. Report plausible exploit paths, not isolated pattern
matches.

## Review procedure

1. Identify trust boundaries, protected assets, principals, and state-changing actions
   in the diff.
2. Trace input validation, canonicalization, authorization, and output handling through
   the real call path.
3. Verify authorization is derived from trusted server state and applies to the
   requested resource, tenant, or object.
4. Inspect persistence and command boundaries for injection, unsafe deserialization,
   path traversal, and unbounded resource use.
5. Inspect logs, errors, telemetry, and client responses for secret or sensitive-data
   disclosure.
6. Inspect changed authentication, cryptography, dependency, file-upload, webhook, and
   cross-origin behavior when present.
7. Check the failure path: rate limits, replay or idempotency, partial writes, rollback,
   and audit evidence where the risk requires them.

## Finding threshold

Report only when the current code supports a triggering input and a meaningful impact.
Include the source-to-sink path, affected asset, exploit preconditions, and a bounded
fix. Distinguish a missing defense from a defense implemented elsewhere in the live
path.

Treat confirmed secret exposure, authorization bypass, injection with material impact,
and destructive cross-tenant access as blocking. Calibrate other issues from their
actual reachability and blast radius rather than a fixed pattern-to-severity table.
