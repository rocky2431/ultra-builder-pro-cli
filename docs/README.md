# Documentation

[English overview](../README.md) · [中文介绍](../README.zh-CN.md)

## Start here

| You want to | Read |
|---|---|
| Install Ultra, start work, or resume a task | [Usage guide](USAGE.md) |
| Check a host's capabilities and limitations | [Runtime compatibility](RUNTIME-COMPAT-MATRIX.md) |
| See what changed between releases | [Changelog](../CHANGELOG.md) |

## Understand the design

| Document | What it explains |
|---|---|
| [Architecture](ARCHITECTURE.md) | How the host, Skills, project files, hooks, and delegation fit together |
| [Philosophy](PHILOSOPHY.md) | The failures Ultra is designed to address and the principles behind its constraints |
| [Workflow lifecycle](WORKFLOW-LIFECYCLE.md) | Entry, exit, and recovery rules for each workflow |
| [Artifact authority](ARTIFACT-AUTHORITY.md) | Which files hold facts, who writes them, and what happens when records conflict |
| [Plugin isolation](PLUGIN-ISOLATION-CONTRACT.md) | Managed installation, ownership, and behavior outside an active Ultra project |
| [Skill authoring](SKILL-AUTHORING.md) | How to change a portable Skill and its supporting files |
| [Design decisions](DECISIONS.md) | The rationale and provenance of accepted product decisions |

## Work with other agents

- [Delegation](../skills/ultra-delegate/SKILL.md): send one bounded task and inspect its result.
- [Finite batches](../skills/ultra-delegate/references/finite-run-slice.md): run an authorized wave of workers.
- [Factory operation](../skills/ultra-delegate/references/operational-factory.md): prepare worktrees, choose a profile, integrate results, and handle partial failure.
- [Durable checkpoints](../skills/ultra-delegate/references/durable-checkpoint.md): allow one explicitly authorized fresh Pi turn.
- [Primary transfer](../skills/ultra-change/references/primary-transfer.md): transfer responsibility for the work package to another agent.

## Evaluation and design records

Evaluations describe the specific source, inputs, and environments that were
tested. Their outcomes are evidence for those conditions, not universal host or
product guarantees.

- [Journey evaluation](evals/ultra-5-0-journey-results.md)
- [Adversarial review evaluation](evals/adversarial-review-2026-08-14.md)
- [ZCode automation evaluation](evals/zcode-automation-2026-08-14.md)
- [Current development and acceptance record](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md)
- [Accepted product design](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md)
- [Founding design](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md) and its [accepted revision](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md)

Accepted designs and dated evaluations retain their original text for reference.
For current usage, start with the guide above. Keep release history in the
changelog rather than adding update sections to usage or reference pages.
