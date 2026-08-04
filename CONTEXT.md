# Ultra Builder Pro Domain Language

## Language

| Term | Canonical meaning | Not this |
|---|---|---|
| Owner | The person who supplies intent, acceptance, material trade-offs, risk acceptance, and authorization for external or irreversible effects. | A generic model role or a workflow state. |
| Host model | The active coding model that interprets intent, chooses strategy, edits within authority, evaluates evidence, and writes the final expression. | An Ultra workflow engine. |
| Owner-invoked workflow | One complete, explicit route selected through a host's native Skill surface. | A subroutine that another public workflow launches automatically. |
| Model-invoked discipline | A focused reusable reasoning method that the host model selects only inside the currently authorized task. | A user command, autonomous background agent, or private authority holder. |
| Project Brief | The raw owner intake and broad outline captured by `ultra-init` before evidence-backed maturation. | The accepted North Star, a product baseline, or a transcript that later workflows rewrite. |
| North Star | The accepted steering contract established by `ultra-research`: project direction, one outcome or metric when justified, hard constraints, exclusions, and evidence trace. | The owner's unprocessed first sentence or a duplicate of the product specification. |
| Research lens | One focused evidence question inside `ultra-research` that updates a mapped canonical specification section. | A public Skill, a generic reasoning method, or an independently authoritative document. |
| Wayfinding | An optional Research method that maps knowns, unknowns, lens dependencies, evidence sources, checkpoints, and a stop condition. | A workflow state machine, new public Skill, or semantic authority. |
| Router | The read-only `ultra-status` Skill that infers the smallest next route from files, Git, and install health. | A persisted workflow state machine. |
| Hook | A deterministic lifecycle sensor or narrow effect guard registered by a host adapter. | A semantic completion judge. |
| Canonical artifact | The single owner-readable file that carries one class of accepted semantic truth. | A cache, transcript, generated projection, or database row. |
| Derived artifact | Disposable observation or navigation under `.ultra/.runtime/`, `.ultra/progress/`, `.ultra/reviews/`, or `.ultra/research/<run-id>/brief.md`. | Product intent, accepted specification, or task authority. |
| Delegate | A bounded invocation of another supported CLI in an isolated registered Git worktree. | A new workflow owner or an authority-escalation channel. |
| Worker Packet | Immutable, digest-bound input that fixes a review or delegation worker's scope and output path. | Mutable shared conversation state. |
| Permission envelope | A strict declaration of writable worktree roots and external effects; v0.26 accepts no external-effect grant. | A promise that can override the host's native sandbox. |
| Receipt | A terminal, mechanically validated record of what a delegated process observed and changed. | Proof that the semantic result is correct or accepted. |

## Relationships

- The owner selects a workflow; the host model may use model-invoked disciplines inside
  that workflow; the workflow writes canonical artifacts.
- Init writes the Project Brief and an empty skeleton. Research consumes that seed and
  establishes the North Star, shared language, and specification baseline; Change owns
  only the bounded delta against that baseline.
- Hooks may read canonical artifacts and write derived observations. Derived artifacts
  never flow back into authority without model interpretation and an authorized writer.
- A delegate reads an immutable instruction and permission envelope, changes only its
  registered worktree, and returns a receipt. The primary host inspects and integrates
  the diff.
- Git binds every artifact and receipt to observable source state and supplies recovery.

## Flagged ambiguities

- Do not call model-invoked disciplines “background agents”; they are methods and may
  run sequentially when a host has no subagent surface.
- Do not call `tasks.json` a projection; in v0.26 it is the canonical task ledger.
- Do not call a Hook or Doctor result “workflow truth”; it is an observation.
