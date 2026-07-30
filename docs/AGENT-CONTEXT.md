# Ultra Builder Pro agent context contract

This is the shared runtime contract for Claude Code, Codex, OpenCode, Kimi Code,
and Grok Build.

## Ownership

Ultra owns:

- eleven explicit workflow Skills: `ultra-init`, `ultra-research`, `ultra-think`,
  `ultra-change`, `ultra-plan`, `ultra-dev`, `ultra-test`, `ultra-review`,
  `ultra-deliver`, `ultra-status`, and `ultra-doctor`;
- four internal worker-rule Skills;
- bounded review/debug workers;
- deterministic workflow Hooks;
- exactly seven public MCP tools;
- `.ultra` project authority, team sync, recovery, and the portable installer.

Ultra does not own general memory, code graphs, browser or deployment providers,
framework guidance, global user instructions, or unrelated Skills.

## Runtime model

```text
explicit Skill
  -> canonical Context Envelope
  -> host model reasoning and owner interaction
  -> typed ultra.record
  -> mutable Stage Checkpoint draft
  -> accepted immutable revision
  -> evidence / team sync / archive
```

The host model recommends semantic routes. The user selects material intent and
external effects. MCP persists facts and enforces mechanical safety. A Hook may
observe or inject context, but cannot create a decision or accept a checkpoint.

## Seven public tools

| Tool | Use |
|---|---|
| `ultra.context` | Read bounded current authority without mutation |
| `ultra.record` | Persist typed facts, decisions, tasks, artifacts, outcomes, and observations |
| `ultra.checkpoint` | Save or accept a stage-level revision |
| `ultra.sync` | Inspect, migrate, import, or publish the Git checkpoint |
| `ultra.session` | Acquire/release execution authority and create a Worker Packet |
| `ultra.archive` | Perform recoverable local delivery convergence |
| `ultra.doctor` | Diagnose or backup-first repair mechanical health |

Retired operation names are not callable. Semantic incompleteness is returned as
diagnostics and leaves the draft editable. Hard errors are limited to corruption,
unsafe paths, digest/CAS/lease conflicts, missing runtime prerequisites, permissions,
and irreversible external effects.

## Context Envelope

Every Skill begins by reading `ultra.context` for the relevant stage and scope. The
same content-addressed generator supplies Hook breadcrumbs, compact recovery, Session
handoff, and Worker Packets. It includes:

- project/host identity and health;
- Git head, scope digest, and drift classification;
- accepted baseline and evidence references;
- current Change and Task contracts;
- accepted normalized Decision Records;
- typed evidence references and freshness;
- current execution lease/worktree/packet;
- warnings, `needs_attention`, and hard conflicts.

Summary output stays within 16 KiB. Selected full output stays within 64 KiB. Large
file bodies remain lazy references. Identical authority must reuse one digest and
snapshot.

## Interaction

```text
inspect -> suggest -> host-native ask when needed -> normalize
       -> persist -> apply -> read back
```

Do not ask again when the current user message already resolves the decision. Persist
only the normalized question, recommendation, selection, effects, non-goals,
provenance, applied references, status, digest, and supersession. Never persist raw
conversation, chain-of-thought, full prompts, or UI receipts.

Host question surfaces:

- Claude Code and Kimi Code: `AskUserQuestion`;
- Codex: `request_user_input` when available;
- OpenCode: `question`;
- Grok Build: its native structured question surface when available, otherwise one
  concise conversational question.

If the host mode forbids interaction, leave the decision unresolved.

## Stage Checkpoints

Skills describe adaptive evidence expectations and decide semantic sufficiency;
SQLite does not authorize a fixed step sequence or reinterpret the supplied verdict.
A stage has a mutable draft and immutable accepted revisions:

```text
draft N -> accepted N -> superseded by accepted N+1
```

Warnings and semantic gaps do not reject explicit acceptance. Structural, digest,
path, publication, and concurrency conflicts leave the draft mutable. An accepted
revision can be replaced by a later accepted revision without rewriting history.

## Worker handoff

Every worker must receive one immutable Worker Packet generated from current authority.
The packet binds:

- role, runtime, Change/Task scope, and output schema;
- Context Envelope path/digest;
- accepted Decision Records and digest;
- Git head/diff/changed files;
- Task contract, acceptance, and digest;
- evidence references;
- exact output path;
- `packet_digest`.

Workers may inspect and write only the declared output. They do not write SQLite,
accept checkpoints, modify another worker's result, or decide final delivery. Output
must echo `packet_digest`; the primary host verifies and records it.

## Hook boundary

The canonical Hook bundle uses `context_envelope.py`, not a parallel context reader.
Hooks may:

- report health and inject a compact envelope;
- protect MCP-owned team checkpoints and generated projections;
- save/restore minimal compact recovery state;
- append minimal lifecycle identifiers;
- report an advisory Stop summary.

Hooks may not select a route, manufacture a semantic record, capture prompts or
transcripts, block ordinary work for semantic incompleteness, or claim an ignored
stdout channel was injected. Every Skill still reads authoritative Context at entry.

## Five host presentations

| Host | Entry | Worker surface | Context behavior |
|---|---|---|---|
| Claude Code | `/ultra-builder-pro:ultra-*` | native agents | SessionStart compact + Skill full |
| Codex | `$ultra-builder-pro:ultra-*` | managed TOML agents | session/prompt compact + Skill full |
| OpenCode | `/ultra-*` | native agents | system transform + Skill full |
| Kimi Code | `/ultra-builder-pro:ultra-*` | Agent/AgentSwarm templates | native compact where supported + Skill full |
| Grok Build | native Ultra commands/Skills | plugin agent templates | Skill full is authoritative; Hook stdout limitations are explicit |

Adapters own only translation and wiring. The active host remains primary; optional
cross-host collaboration is explicit and read-only.

## Storage

Tracked `.ultra` files carry inspectable intent, specifications, plans, Decision
Records, test/review/delivery evidence, and archives. `.ultra/tasks/tasks.json` is a
digest-chained team checkpoint. `.ultra/.runtime/` is ignored and contains SQLite,
generated projections, Sessions, worktrees, recovery, backups, telemetry, and debug
state.

Every semantic file must have one writer, owner, consumer, digest, promotion gate, and
archive rule as defined in `ARTIFACT-AUTHORITY.md`.
