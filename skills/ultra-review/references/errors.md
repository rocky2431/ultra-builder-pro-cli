# Error lens

Trace changed exceptions, error results, retries, fallbacks, cancellation, timeouts and
asynchronous work from trigger to caller-visible state. Find swallowed required
failures, false success, lost diagnostic context, unsafe retry, sensitive detail leaks
and inconsistent recovery state.

Confirm the language and framework propagation contract before reporting. Empty
catches, null fallbacks, optional chaining, fire-and-forget work and generic messages
are signals only. Severity follows reachable impact. Use `axis:
engineering_standards` and the shared findings schema.

The worker is read-only. Its only write is the assigned JSON artifact.
