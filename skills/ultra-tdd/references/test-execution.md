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
- raw output path under `.ultra/evidence/<task-id>/` when the output matters.

Do not weaken flags, skip a relevant failure, edit test configuration to obtain green,
or claim success when the command did not finish with exit zero. A concise evidence
record may cite the raw log; it must not copy an entire transcript into task context.
