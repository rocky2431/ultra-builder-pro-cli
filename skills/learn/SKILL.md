---
name: learn
description: Extract one verified reusable workflow from completed work into a portable user skill after explicit approval. Use when the user asks to preserve a repeatable method that does not belong in project guidance or ordinary documentation.
---

# Capture a reusable skill

Create a focused workflow from evidence in the current task. Do not capture prompts,
transcripts, private memory, or one-off incident details.

## Placement gate

Before drafting, decide whether the material belongs in a skill:

- durable repository convention: update the nearest project guidance instead;
- product or architecture fact: update project documentation instead;
- external live data or action: use an MCP integration instead;
- repeatable procedure with non-obvious steps, references, or scripts: create a skill.

Stop when the candidate is a typo fix, transient outage, generic advice, unsupported
hypothesis, or a duplicate of an existing skill.

## Workflow

1. Identify one coherent procedure that succeeded in the current work. Preserve the
   trigger, decisive steps, non-obvious failure modes, inputs, outputs, and validation
   command; remove task-specific names, dates, branches, and conclusions.
2. Search the current host's user skill directory for overlap. Extend an existing
   skill only when its job and trigger remain coherent.
3. Draft a portable skill directory:

   ```text
   <skill-name>/
     SKILL.md
     scripts/       # only deterministic reusable helpers
     references/    # only conditional detailed guidance
     assets/        # only reusable templates or resources
   ```

4. Keep `SKILL.md` focused on the procedure. Its frontmatter contains only `name` and
   `description`; the description states both what the skill does and when to use it.
   Move detailed schemas, long examples, and optional branches into focused resources
   and say exactly when to load them.
5. Present the proposed name, trigger, file inventory, and concise draft to the user.
   Write nothing until the user approves.
6. Write to the current host's user skill directory without overwriting an unrelated
   skill. Add host-specific UI or invocation metadata outside `SKILL.md` when the host
   supports it.
7. Run the available Agent Skills validator and at least one positive and one negative
   trigger check. Report any behavior that remains unverified.

## Quality gate

The captured skill must be reusable without the original conversation, grounded in
observed evidence, concise enough to compete safely for context, and explicit about
validation. Create one skill per coherent job, not one skill per fact.

This workflow never modifies Ultra state and never runs automatically at task close.
