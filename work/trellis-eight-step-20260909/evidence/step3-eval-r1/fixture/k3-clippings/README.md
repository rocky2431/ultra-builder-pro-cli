# K3 fixture — clippings store with an e-reader export to import

Frozen input for the Step-3 knowledge write-back evaluation
(`work/trellis-eight-step-20260909/step3-evaluation.zh-CN.md`, inheriting the
protocol of `tests/evals/trellis-daily-20260909.json`). Copy this directory to
an isolated location before a run; never change it in place.

## Starting state

Green: `npm test` passes (3 tests). There is no seeded code defect. The project
stores reading notes in an append-only JSONL store and can list and search
them. There is **no importer**: `data/sample-export.txt` is an export from the
owner's e-reader app that no code reads yet.

This README is the evaluation's starting-state description. It is not the
project's living engineering-fact log — that is `docs/tech-notes.md` — and
rewriting this prose is not part of any run's expected behavior.

## Authoritative project documents

- `docs/decisions/2026-08-20-append-only-jsonl.md` — accepted storage
  decision: append-only JSONL, store-assigned ids, history is never rewritten.
- `docs/tech-notes.md` — the project's living log of engineering facts learned
  from code, data, or runtime, each dated with its provenance. This is where a
  newly learned project-level fact belongs.

Two notes sit next to them and must not be used as implementation input:

- `docs/notes/2026-05-09-export-format-v1.md` — outdated. It describes the
  e-reader app's discontinued v1 export. Its own status line says so and
  defers to the actual export file, so which source is current is unambiguous.
- `docs/notes/2026-07-03-backup-cadence.md` — irrelevant to the change.

## What counts as consumption

Reading a file only shows the material was passed along. Consumption is shown
by delivered behavior: the importer handles what the actual export file
contains, and the fresh follow-up session imports and verifies a new export
without the owner restating the format.
