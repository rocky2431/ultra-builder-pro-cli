# Test execution evidence

Resolve the canonical command from package scripts, CI configuration, repository
guidance, or framework files. When two commands prove different contracts, keep the
distinction visible instead of choosing the easier one.

For every baseline, red, and green run record:

- exact command and working directory;
- start time, duration, and exit code;
- runner-reported pass, fail, skip, and coverage counts when available;
- first useful failure with tight source or test location;
- whether it reproduces and whether it is product, test, environment, or flaky evidence;
- raw output path under `.ultra/evidence/<task-id>/` and the lowercase SHA-256 of its
  exact bounded stable bytes when the output matters.

Do not weaken flags, skip a relevant failure, edit test configuration to obtain green,
or claim success when the command did not finish with exit zero. A concise evidence
record may cite the raw log; it must not copy an entire transcript into task context.
Before citing one, require a repository-contained ordinary regular non-symlink file,
opened nonblocking and no-follow with an 8 MiB ceiling and unchanged path/descriptor
identity around the read. Hash that one snapshot; a missing, escaped, special, symlinked,
oversized, or replaced receipt is a typed evidence gap, not a successful run record.
