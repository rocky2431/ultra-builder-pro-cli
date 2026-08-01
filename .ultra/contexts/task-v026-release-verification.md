# Task v026-release-verification: Validate packaged Skills, plugin artifacts, and release gates

> **Status**: completed | **Priority**: P0 | **Complexity**: 5

## Context

**What**: Validate the exact packaged v0.26 product after all implementation and
artifact migration changes settle.

**Why**: Focused green tests do not prove Skill authoring, Codex plugin schema, tarball
contents, five-host isolation, dependency audit, or the complete release chain.

**Constraints**:
- Use temporary isolated config roots; do not install into the real HOME.
- Do not invoke authenticated providers or publish a package.
- Record exact commands and real results in `.ultra/test-report.json`.

## Implementation

**Target Files**: package lock if required, generated temporary artifacts, WIP
reconciliation, and `.ultra/test-report.json`.

**Layers touched**: source validators, installed artifacts, native metadata, tarball,
dependency graph, and final evidence.

**Pattern**: narrow validators first, isolated five-host install/Doctor/uninstall,
complete release gate, then exact tarball inspection.

## Acceptance Criteria

- [x] All fourteen Skills pass Skill Creator validation.
- [x] A generated Codex plugin passes Plugin Creator validation.
- [x] Isolated install and Doctor succeed for all five hosts without touching HOME.
- [x] `npm run verify:release`, package dry run, and artifact audit exit zero.

## Verification

- `npm run verify:release` exited 0: 106 Node tests passed, 8 Hook tests passed,
  and npm audit found 0 vulnerabilities.
- Skill Creator accepted all 14 Skills; Plugin Creator accepted the generated Codex
  plugin.
- An isolated five-host install, Doctor, reinstall, and uninstall reported 5/5
  healthy and left both the config root and sentinel HOME empty.
- `npm pack --dry-run --json` exited 0 and the exact current inventory is recorded in
  `.ultra/test-report.json`.

## Definition of Drift

- Reporting source tests as installed-host proof, omitting a host, or claiming a real
provider invocation that was not authorized and observed.

## Change Log

| Date | Classification | Change | Specs updated | Reason |
|---|---|---|---|---|
| 2026-08-01 | CORRECTION | Added explicit release evidence task | product | Separate implementation evidence from packaged delivery proof |

## Completion

- **Completed**: 2026-08-01
- **Commit**: not created; pending separate owner authorization
- **Summary**: Local source, packaged assets, native metadata, isolated lifecycle,
  aggregate review, release tests, audit, and tarball inspection all passed.

## Resume Note

Local delivery is closed and archived. Provider authentication, real-HOME upgrade,
commit, push, tag, publication, and release remain separately authorized effects.
