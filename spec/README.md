# Contract specifications

This directory is the single source for machine-readable Ultra contracts. Runtime
implementations and host adapters consume these files rather than redefining fields or
enums in prompts.

## Contents

```text
spec/
  mcp-tools.yaml
  cli-protocol.md
  command-template.md
  schemas/
    state-db.sql
    tasks.v4.5.schema.json
    context-file.v4.5.schema.json
    skill-manifest.schema.json
    command-manifest.schema.json
  fixtures/
    valid/
    invalid/
  scripts/
    test-all.cjs
    validate-json-schemas.cjs
    validate-mcp-tools.cjs
    validate-state-db.cjs
    validate-skills.cjs
    validate-commands.cjs
    validate-runtime-references.cjs
    check-cli-mapping.cjs
```

The versioned task and context schemas describe compatibility projections. They do not
make those projections authoritative; `.ultra/state.db` remains the state source.

## Validation

```bash
npm run test:spec
```

Exit zero means every available schema, fixture, source Skill, command launcher,
runtime reference, and CLI mapping passed. A non-zero result is a release blocker.

## Change rules

- Change a contract here before changing its producers and consumers.
- Add valid and invalid fixtures for every schema change.
- Keep portable Skill and command prompt metadata separate from host runtime metadata.
- Do not edit generated task or context projections as an authority fallback.
