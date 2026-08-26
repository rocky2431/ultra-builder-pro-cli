# Skill authoring contract

Ultra Skills are portable model-facing methods. They describe outcomes, evidence, and
owner boundaries; host-specific discovery and invocation policy belong in adapters.

## Role selection

Choose exactly one role before writing:

- **public workflow**: an owner-invocable workflow with one or more declared modes and
  a durable outcome;
- **model-invoked**: a reusable discipline used by at least two canonical workflows;
- **router**: read-only diagnosis that recommends the smallest next public route.

Every public mode is `explicit-entry` or `grant-continuable`. A public workflow may
continue to another public mode only when a currently valid Execution Grant covers the
same Change, exact mode, effects, and stop conditions, and only after showing the Route
Card. Otherwise it stops and recommends the owner-invoked route. Host metadata never
substitutes for that in-Skill check. A discipline with only one real caller should be
inlined.

## Portable frontmatter

Source `SKILL.md` frontmatter contains only:

```yaml
---
name: lower-case-hyphen-name
description: What this produces and the concrete situations that trigger it.
---
```

Adapters generate Claude/Grok/Kimi invocation flags, Codex `agents/openai.yaml`, and
ZCode-native plugin metadata.
Do not put host paths, dependency declarations, plugin policy, or release history in
source frontmatter.

## Required shape

Every Skill has one outcome-led title and these semantic sections:

```text
## Before you start
## Definition of done
## <workflow-specific process>
## When the owner decides
## References
```

Every public workflow and router also has `## Route modes` with a `Mode | Entry |
Observable exit | Next` table and references the canonical
`ultra-status/references/route-contract.md`. Shared card fields, material checkpoints,
continuation, and degraded recovery live only in that reference; each Skill owns only
its modes and workflow-specific facts.

User workflows first resolve at most one active `change_id`, then read only matching
rows from `.ultra/tasks.json`, the frontier task's `context_file` and Resume Note,
`CONTEXT.md`, and relevant decisions. Historical or abandoned rows never become current
from status alone. They name the files they write and read them back. Completion
criteria must be observable without a semantic validator.

Use positive leading words consistently: tracer bullet, seam, deep module, red,
frontier, and research boundary. Explain a branch by its checkable result, not the
model's reason for choosing it.

## Progressive disclosure

Keep resident `SKILL.md` short enough to load on every invocation. Move focused detail
into `references/` and deterministic validation or waiting into `scripts/`.

- Load one research step or review lens at a time.
- Keep Research's semantic lenses and optional Wayfinding map inside
  `ultra-research/references/`; they are stages of that public workflow, not reusable
  model-invoked Skills.
- Keep one canonical copy of grilling, TDD, review, domain language, and autonomy rules.
- Cross-reference another model-invoked Skill by relative path.
- Do not hide the primary workflow in a script.
- A script may check paths, schemas, counts, hashes, process status, or other mechanical
  facts; it may not decide semantic completeness.

Rule-side executable examples live with the consuming Skill. They are never copied
wholesale into project authority.

## Language and host neutrality

Model-facing Skills, references, scripts, comments, and identifiers are English.
Shared Skills never mention `.claude`, `.codex`, `.opencode`, `.kimi`, `.grok`, `.zcode`, or a
host-only question surface. Use “host-native question surface” and put the translation
in the adapter.

## Safety boundary

The owner decides intent, acceptance, reductions, material risk, irreversible actions,
and external effects. The model owns investigation, design, decomposition, evidence
interpretation, reversible implementation detail, and final expression.

Semantic gaps are diagnostics. A Skill must not invent a hard gate based on counters,
regexes, similarity, context estimates, or workflow position. Every real hard effect
guard names its invariant, authoritative input, blocked effect, and reachable repair.

## Validation

For every changed Skill:

1. run the Skill Creator validator;
2. resolve every relative reference in the source and installed artifact;
3. verify its role metadata on all six hosts;
4. test the accepted workflow with representative valid and adversarial inputs;
5. confirm no retired runtime vocabulary or host-specific path entered portable text.
6. run the Route Contract structural test and inspect the applicable owner journey.

The repository's `tests/skill-authoring.test.cjs` and
`tests/v026-contract.test.cjs` mechanize the portable parts of this contract.
