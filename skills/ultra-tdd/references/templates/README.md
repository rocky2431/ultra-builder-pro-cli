# Enabling templates

These runnable examples make the real integration path cheaper than a fake. Read this
index when `ultra-tdd` reaches a database, feature flag, or multi-layer seam, then copy
only the smallest relevant file into the project and adapt it to repository conventions.

| Template | When to copy |
|---|---|
| [testcontainer-postgres.ts](testcontainer-postgres.ts) | A TypeScript/Node test needs real Postgres instead of an internal Repository mock |
| [testcontainer-postgres.py](testcontainer-postgres.py) | A pytest test needs real Postgres instead of a `MagicMock` Repository |
| [vertical-slice.ts](vertical-slice.ts) | One test must prove HTTP → use case → database → response |
| [persistence-real.ts](persistence-real.ts) | A Repository needs real storage rather than an in-memory `Map` |
| [feature-flag-default-audit.sh](feature-flag-default-audit.sh) | A Change must surface default-off flags that could hide unfinished work |

The templates travel with the `ultra-tdd` skill; they are rule-side examples, not
project authority. Do not copy this directory wholesale into `.ultra/`.

Each template must remain runnable after its documented dependencies are installed,
name the exact verification command in its header, stay short enough to inspect before
use, and state which Ultra principle makes the example preferable.
