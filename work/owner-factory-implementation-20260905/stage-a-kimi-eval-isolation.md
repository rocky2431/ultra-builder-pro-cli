# Make the actual Owner-journey evaluation safe even when product tests fail

## Mission and authority

The Owner explicitly authorized the complete accepted factory plan, all necessary in-scope repairs/reviews, and chose ZCode, Kimi or Claude Code as implementation/test writers; Codex only coordinates, reviews, verifies and commits. You own a bounded independent Stage A A-R7 repair. Read root AGENTS.md, its RTK reference and the latest section of `.ultra/decisions/2026-09-05-owner-factory-implementation.md`.

Write ONLY under `work/owner-factory-implementation-20260905/eval-isolation/` and `work/owner-factory-implementation-20260905/stage-a-kimi-eval-isolation-handover.md`. ZCode concurrently edits the product Skill/contract/test seams for A-R5/A-R6. Do not edit product sources, existing evaluation specifications, authority/state/review files, or any old evaluated sample. You may read all necessary context and choose the smallest working solution.

## Reproduced problem

Read A-R7 in `work/owner-factory-implementation-20260905/stage-a-review-delta-2.zh-CN.md`. During actual ZCode CLI evaluation a failing test unset HOME and RECIPES_FILE, then executed add. Python Path.home resolved the real OS user home, writing `/Users/rocky243/.recipes.json`; the worker later removed it. Final product guard is fixed, but the test is not independently isolated. There is no before-state proof and no authorization to touch that real business-data path. Do NOT rerun the old dangerous test or probe a real HOME data file, even as a supposed safe sentinel.

The evaluator uses actual ZCode 0.16.5 / GLM-5.2 with an isolated plugin installed through adapters/zcode.js, and native same-session CLI resume. Node is `/Users/rocky243/.hermes/node/bin/node`; CLI `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`. The registered agent-delegate bridge is available. `/tmp/ubp-owner-journeys-ynsz0724/operator-setup.md` and `stage-a-live-eval-setup.zh-CN.md` describe the existing boundary. Temporary cwd/config and native yolo are not OS isolation. Preserve ordinary configured provider auth reads and necessary native session/receipt caches; do not copy or print credentials.

## Required result

Provide the smallest usable local launch/isolation method for subsequent actual ZCode evaluation such that product writes and failed tests cannot escape the selected evaluation project/temp roots into real HOME business data. Prefer an existing native mechanism such as the installed platform sandbox if it works; do not install dependencies, alter global settings, add a daemon, or design a general factory runtime here. Setting HOME alone does not contain pwd-based fallback. If a mechanism cannot cover native file tools/child processes, say so precisely rather than claiming sandbox coverage.

Before attempting any provider call, demonstrate permitted project writes and denied out-of-scope writes using ONLY harmless paths that you create inside a dedicated temporary parent. Include a child-process case and a missing-HOME/fallback-shaped case without naming real HOME as a write target. A test that fails must itself remain safe. Provide one runnable verification and a practical command/API the Codex operator can invoke. Exact path declarations may distinguish evaluator product roots from narrowly named native cache roots; do not turn semantic shell text into an allowlist or disable ordinary exploration because it is easier.

Do not launch providers/nested agents in this mission. Codex will inspect the implementation, independently run your harmless verification, then qualify the actual provider under it. Do not patch old sample tests or clear old incident evidence. If no available mechanism is adequate, return the cheapest concrete alternative and its limits, with observed evidence, within this same mission.

## Done and boundaries

Write code/tests/instructions in English, owner handover in Chinese at the named handover path. Report exact changed files, platform observations, verification results, supported launch path, and limitations. Use RTK for shell commands and proxy for raw evidence. At most 3600 active provider seconds. No commit/push/publication/deploy/install/login/credential mutation/real-HOME configuration or business-data writes/production effects. You have current authority for this local repair; the old review-count stop is superseded. This is evaluation-only code under work, not an accepted Stage B factory implementation.
