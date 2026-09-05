# Delegated mission

## Goal

Act as Claude Code architecture collaborator for Stage 0 of the Ultra Builder Pro vNext three-stage delivery goal. Review the current target architecture and current repository gate, then advise the Codex reviewer on the safest and most capable path into Step 1.

## Requirements and boundaries

- Read `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md`, `docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md`, `.ultra/changes/active/chg-ultra-5-0-2-authority-reconciliation/intent.md`, and `.ultra/contexts/task-v502-authority-reconciliation.md`.
- Evaluate whether the current sequencing preserves No isolated MVP, ZCode sole-writer authority, Primary/Supervisor separation, model-specific capability, effect enforcement, recovery, intent alignment, and bounded review.
- Identify the smallest prerequisite that must finish before Step 1, the first Step 1 packet boundary, and observable stage-gate evidence.
- Challenge assumptions rather than merely agreeing.
- Do not edit any file, invoke another Agent, or perform external effects.

## Authority already granted

- Read-only repository inspection and architecture reasoning.
- The Owner explicitly requested Claude Code discussion at every stage.

## Commit gates

- Any edit, commit, push, publish, deploy, login, credential change, installation, or external message is outside this mission.

## Done

- Return a concise architecture discussion with P0/P1/P2 risks, recommended Stage 0 → Step 1 sequence, and measurable Step 1 exit evidence.
- Distinguish current repository facts from proposals and unknowns.
