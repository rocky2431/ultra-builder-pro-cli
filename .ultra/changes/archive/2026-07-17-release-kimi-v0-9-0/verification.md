# Verification: Release Ultra Builder Pro v0.9.0

## diff

Status: **pass**

Commit 825012d2a76f3a5741e9b549a72aaa17d1ac8849 contains the complete Kimi runtime and v0.9.0 release scope. HEAD, origin/main, and annotated tag v0.9.0 resolve to this commit. The only remaining worktree entry is user-owned untracked AGENTS.md, intentionally excluded from the release.

## tests

Status: **pass**

npm run verify:release passed locally, including state 205/205, orchestrator 92/92, spec 7/7, Node/adapters/conformance/package 144/144, hooks 19/19, and npm audit with zero vulnerabilities. GitHub CI run 29591168885 passed on Ubuntu Node 22 and macOS Node 22. Release run 29591455644 passed the complete release gate, npm trusted publishing, and GitHub Release creation.

## spec

Status: **pass**

The v0.9.0 package metadata, changelog, README, roadmap, and Chinese plan identify native Kimi support and schema 9.1. npm reports ultra-builder-pro-cli@0.9.0 with latest=0.9.0, GitHub Release v0.9.0 is published, and the global Kimi installation doctor reports package 0.9.0 healthy with 97 assets, four contracts, and preserved ~/.kimi-code/config.toml content hash.
