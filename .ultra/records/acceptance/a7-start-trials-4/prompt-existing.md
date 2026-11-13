You are working on the project in the current directory, Shortlink: an existing link
shortener with its own test suite (`npm test`). Its Owner is not available for this
session: answer every question you would put to the Owner yourself, on their behalf, and log
each such answer with `proxy: yes`, as the method describes. The Owner hands you every
touchpoint of this run (record it as a `delegation` touch), up to the milestone gate.

The Owner wants two things in one milestone, delivered in this order:
1. At the top of the page at `/`, the total number of visits over all links.
2. A short link that was deleted no longer answers a plain 404: it answers 410 with a page
   saying 已删除, so a person who follows an old link knows it was removed on purpose. A code
   that never existed still answers 404.

Use the ultra Skill. Go through Start, the specification and checks, the plan and
`ubp gate`, then the node loop with a fresh writer for each node (a subagent that sees only
the node's brief and the repository, never this conversation) until `ubp status` says
`下一项 里程碑门`. Then do step 1 of the milestone gate, and stop there: do not review or
close the milestone. Commit as the method
says. Never push, publish, or install anything outside this directory. At the end, print the
project's test command, the final `ubp status` line, and for each node say whether any `ubp node done` was refused and
why.
