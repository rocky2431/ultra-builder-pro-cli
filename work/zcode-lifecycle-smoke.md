# Delegated mission

## Goal

Prove the current registered ZCode transport can complete one bounded coding-repository analysis turn in an isolated clean checkout.

## Requirements and boundaries

- Inspect the checkout and report the package name, package version, and the canonical installed delegation runtime entry.
- Do not edit, create, delete, move, or format any file.
- Do not start browser login, change identity, install dependencies, or invoke another Agent.
- Do not infer semantic product completion from transport success.

## Context

- This is a lifecycle smoke before ZCode is assigned sole implementation-writing authority for the Ultra Builder Pro vNext goal.
- Relevant starting points are `package.json` and `skills/ultra-delegate/SKILL.md`.

## Authority already granted

- Read the isolated checkout and use ordinary local analysis tools.
- No repository mutation or external effect is granted.

## Commit gates

- Any edit, commit, push, publish, deploy, login, credential, install, or external message requires new Owner authorization and must not occur in this smoke.

## Done

- Return the three requested facts with file references.
- State whether the turn reached a normal terminal result.
- State that changed files are empty; otherwise report the exact unexpected change and stop.
