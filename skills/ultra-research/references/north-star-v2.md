# North Star v2 contract

Use this contract when Research proposes the first steering authority or a replacement
revision. Init creates only the packaged `unresearched` placeholder.

## Agency boundary

Research selects evidence, synthesizes causal propositions, and proposes language. The
owner accepts the problem boundary, `FP-*`, `NS-*`, `HC-*`, exclusions, and material
uncertainty. The validator observes headings, fields, IDs, and references; it never
decides whether a proposition is true, an outcome is valuable, or a constraint is wise.

Keep the last accepted file current while a replacement is drafted. Validation failure
returns diagnostics and leaves the draft mutable. Only explicit owner acceptance permits
an atomic replacement of `.ultra/north-star.md`.

## Exact top-level headings

1. `## Acceptance and Revision`
2. `## Problem Reality`
3. `## First-Principle Propositions`
4. `## Value Causal Chain`
5. `## North Star Outcomes`
6. `## Hard Constraints`
7. `## Explicit Exclusions`
8. `## Uncertainties and Revisit Triggers`
9. `## Research Trace`

`Acceptance and Revision` records `Schema`, `Status`, `Revision`, `Owner acceptance
source`, `Acceptance time`, and `Supersedes`. Do not invent a timestamp: use
`not-recorded` when the authoritative owner source has none. `Status` is exactly
`unresearched` for the empty Init placeholder, `draft` for a mutable candidate, or
`accepted` after owner acceptance. A draft may define semantic IDs but must use
`Owner acceptance source: none`; every First-Principle Proposition in an accepted
revision has `Status: accepted`.

The `unresearched` form is one exact packaged byte sequence, not a looser shape. Its
title, authority and adoption preamble, all six acceptance fields, all eight later
sentinel bodies, interstitial whitespace, and trailing newline must match
`.ultra-template/north-star.md`. Any mutation is invalid and Init stops before publication
with an `ultra-init-error-v1` payload: `code: north_star_template_invalid`, plus the full
canonical validator `diagnostics`, including `invalid_unresearched_placeholder` for an
exact-byte mismatch. This checksum-backed grammar prevents Init from becoming a hidden
semantic writer; it does not judge any researched proposition.

## Stable semantic entries

Define accepted entries with level-three headings. IDs are stable within project
history, unique, and never silently recycled.

```markdown
### FP-1 — Short name
- Proposition:
- Evidence:
- Causal consequence:
- Falsifier or revisit trigger:
- Status: `accepted`

### NS-1 — Short name
- Outcome:
- Observation method:
- Baseline:
- Target or expected change:
- Horizon:
- Anti-metric:

### HC-1 — Short name
- Protected value or threat:
- Constraint:
- Authority or evidence:
- Revisit condition:
```

Do not impose a maximum count. Prefer the smallest set that explains the accepted
boundary, but let Research and the owner decide semantic sufficiency.

The Value Causal Chain references definitions instead of repeating them:

```text
FP-* -> capability -> observable behavior -> NS-*
```

In a draft or accepted revision every pipe-delimited causal-chain row has exactly five
cells. Header and separator rows use that same width; each data row carries a `VC-*`, a
resolving `FP-*`, nonempty capability and behavior, and a resolving `NS-*`. A malformed
row remains invalid even when another row is valid. Every one of the nine required
sections is nonempty for accepted publication; these are exact structural observations,
not a mechanical claim that the content is semantically sufficient.

Supporting product behavior, actors, requirements, measurements, and architecture stay
in specifications. Shared vocabulary stays in `CONTEXT.md`. Change-local outcome,
non-goals, acceptance, risk, and recovery stay in the active intent.

## Validation and adoption

Callers that already own a bounded stable no-symlink snapshot pass those exact bytes
through stdin while identifying the canonical absolute path:

```bash
node <ultra-research-skill-dir>/scripts/validate_north_star.cjs --stdin --path <canonical-absolute-path>
```

Research and manual callers may instead use the direct path entry:

```bash
node <ultra-research-skill-dir>/scripts/validate_north_star.cjs <candidate-path>
```

Path mode applies the same 8 MiB ceiling itself. It requires a regular non-symlink file,
opens with `O_NONBLOCK` and `O_NOFOLLOW`, binds the pre-read `lstat` to the open
descriptor, and rechecks descriptor/path identity, size, and the retained-byte digest
after the bounded read. An oversized file, symlink, special file, read failure, or
observable ordinary replacement returns `input_too_large`, `input_symlink`,
`input_not_regular`, `read_error`, or `input_changed`; preserve the current path and
retry after cooperative workspace writes settle. No typed input failure is a semantic
judgment or a promise to defeat a malicious operating-system-level writer.

Every verdict over a completed byte snapshot carries `input.path`, `input.byte_length`,
and `input.sha256` for those bytes. A capture failure keeps the same keys but uses null
for any byte length or digest it could not safely observe. Markdown headings, grammar
fields, causal rows, and decision-record fields count only rendered lines outside
backtick or tilde fences; acceptance binding still hashes the exact raw bytes.
SessionStart applies the same 8 MiB stable no-symlink snapshot limit and validates those
same bytes, rather than reopening a different path snapshot.

The command emits `ultra-north-star-validation-v1`. The actual v0.26 shape containing
`Project Direction`, `North Star Outcome`, and `Hard Constraints`, and the older
`## One-line` form, are reported as `legacy_unadopted` with an advisory. A candidate
combining v2 markers with a legacy semantic heading is reported with
`kind: "north-star-v2"`, its parsed v2 `status`, `classification: "mixed"`, and
`valid: false`; appending a legacy heading cannot bypass v2 validation. Other malformed
shapes are `unknown` and invalid. Research must migrate legacy input through an
owner-accepted replacement rather than mutating it in place.

Init consumes a preserved North Star from the same stable descriptor/path identity and
SHA-256 snapshot used for classification, and rechecks that snapshot before staging,
before publication, and before success. Under the cooperative-workspace contract, any
observable authority-path or byte drift preserves the current bytes and returns the
typed retryable `preserved_north_star_changed` diagnostic. Other preserved or newly
published Init paths use the same recovery rule and the typed retryable
`initialization_snapshot_changed` diagnostic. This is detectable-drift protection, not
a promise that Node filesystem calls can defend against a malicious operating-system-
level replacement.

For an accepted replacement:

1. preserve the current accepted file while drafting and validating the candidate;
2. challenge premise, falsifiers, causal chain, proxy failure, exclusions, and hard
   constraints independently;
3. show the owner the semantic delta and unresolved contradictions;
4. preserve a stable decision record with the owner's exact words, conversation scope,
   the model's responsibility for final wording, and a rule that future revisions do not
   inherit acceptance; record no timestamp the owner source did not provide;
5. atomically replace the canonical file;
6. record that dependent active Change traces are stale observations until Change
   reconciliation maps old `FP/NS/HC` references to the new revision.

The cited decision fragment resolves exactly one rendered Markdown heading outside fenced
code. That section carries each of these list fields exactly once with a nonempty value:
`Conversation scope`, `Exact raw owner acceptance`, `Agency boundary`, `Time boundary`,
and `Revision boundary`. The validator observes only their anchored presence, uniqueness,
and nonempty bytes. It does not decide whether the quoted acceptance is genuine,
sufficiently informed, or semantically adequate; those judgments remain with the owner
and model.

Never delete old task, review, Test, or delivery evidence because of supersession. Git
preserves the old North Star revision; canonical consumers retain their historical
revision and digest while current execution waits for explicit reconciliation.
