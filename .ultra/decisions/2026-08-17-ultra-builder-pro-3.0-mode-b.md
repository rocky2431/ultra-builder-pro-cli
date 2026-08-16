# Decision: Ultra Builder Pro 3.0 Mode B durable work-package grant

> **Status**: accepted / active for local implementation
> **Grant ID**: `ubp3-mode-b-2026-08-17`
> **Date**: `2026-08-17`
> **Repository**: `/Users/rocky243/Context Engineering/ultra-builder-pro-cli`
> **Base HEAD**: `fc055021bcfeee3e8c6781b9545d267f5eb73cbd`

## 1. Owner record

Owner 原话：

> 「我接受这个建议先改文档，然后我们按照模式 B 把这个落地。」
>
> 「就是说，这个工作允许 Zcode 在本地完成，完了之后你 Codex 就负责检验和验收，我们可以试验一下」

这两句话明确接受：

1. `Ultra Core Protocol` 作为 Ultra Builder Pro 3.0 的协议核心命名；
2. 默认模式 A `session-local` 与显式模式 B `durable work-package` 的双模式授权；
3. 本轮选择模式 B，由 ZCode 在本地完成实施，Codex 在实施冻结后只读检验和验收；
4. 该分工是本 work package 的 topology，不是 ZCode 或 Codex 的永久产品角色。

## 2. Accepted design binding

- Accepted forward-design authority: `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md`
- Accepted SHA-256: `a91b563a48889909f80fc61f608a8198edec86c073a9b039ee57788b38483c1f`
- Dynamic implementation handoff: `docs/wip/ultra-builder-pro-3.0-implementation.md`
- Historical v0.27 documents, tasks, evidence and Review receipts remain evidence inputs; they do
  not override this accepted forward design or enlarge this grant.

Any change to the accepted design bytes requires an explicit owner reconciliation and a new binding.
Implementation code, tests, evidence and progress changing inside the accepted design do not by
themselves invalidate this grant.

## 3. Exact work package

### Outcome

Implement the accepted Ultra Builder Pro 3.0 design as one coherent local work package so that:

- owner–Agent cognitive alignment is the primary outcome;
- `Ultra Core Protocol` remains provider-neutral and file-first without a required daemon, MCP,
  database, Graph engine or semantic state machine;
- owner chooses single/multi-agent and provider topology at every stage; the unspecified default is
  the current single Agent with no automatic spawn or delegation;
- session-local and durable grants are explicit and mechanically distinguishable without inferring
  permission from ordinary prose, status, progress, Hook output or Resume notes;
- Review, recovery and self-hosting terminate under the accepted three-round/P0-P1 contract rather
  than chasing zero findings;
- optional Graph/Loop integration owns only coordination observations and effects, never product
  meaning or acceptance;
- the current primary user path works end to end on the shipped Host surfaces, with truthful
  limitations and no undisclosed live-path fake.

The ordered D0–D5 milestones in the accepted design belong to this one work package. They are not
permission to create recursive sub-packages or fresh Reviews.

### Allowed writer and topology

- Sole repository implementation writer: **ZCode**.
- ZCode works as one Agent in the current local checkout. It must not automatically spawn or delegate
  to additional Agents; a topology change returns to the owner.
- Reviewer/acceptor after frozen implementation: **Codex root, read-only**.
- Codex must not write implementation code, tests, Skills, Hooks, Adapters, CLI or implementation
  support docs after this grant is handed to ZCode.

### Allowed local effects

ZCode may, when traceable to the accepted design:

- read the repository and current dirty worktree;
- edit, add or delete repository files required to implement D0–D5, including canonical/public docs,
  `.ultra` templates and current projections, Skills, Hooks, Adapters, CLI, tests and package metadata;
- delete obsolete self-loop mechanisms and duplicate semantic mirrors after updating their live
  consumers and recovery paths;
- run local tests, builds, linters, validators, package dry-runs and isolated Doctor/install probes;
- update the single implementation WIP by replacing current progress rather than appending an
  unbounded transcript;
- use the owner's already available ZCode entitlement for this implementation.

The existing dirty worktree is protected input. ZCode must identify and preserve unrelated owner
changes, must not reset or overwrite them, and must stop if it cannot separate them safely.

### Effects not authorized

This grant does **not** authorize:

- commit, push, force-push, tag, npm publish, GitHub Release, deployment or production mutation;
- installation into a real user HOME or global Host configuration outside an isolated temporary
  verification directory;
- new paid plan, top-up, purchase or additional provider spend beyond the already available ZCode
  entitlement;
- credential, secret, PII, billing or external-account changes;
- adding a mandatory daemon, database, MCP server, Graph engine, hidden executor or semantic state
  machine;
- changing the accepted North Star, owner outcome, material trade-offs, risk acceptance, topology or
  effect boundary without a new owner decision;
- using the changing local `ultra-review` implementation to approve its own 3.0 repair.

## 4. Durability, budget and invalidation

- This is an exact **Mode B durable work-package grant**. It survives ZCode session/Host handoff after
  stable verification of this file, the accepted design binding, repository identity and current
  work-package status.
- It does not schedule work, wake an Agent, create a daemon or choose a successor. It only permits a
  selected ZCode session to continue the same work package without asking the owner to repeat the
  same authorization.
- There is no arbitrary active-time completion cap. Resource limits protect physical safety and
  existing entitlement; they are observations, not semantic completion verdicts.
- The grant expires when Codex accepts the local implementation, the owner revokes or replaces it, or
  the work package reaches a terminal stop below.

The grant becomes invalid and ZCode must stop for owner direction when:

1. the accepted design identity no longer matches and no newer owner acceptance exists;
2. outcome, scope, material risk, topology, cost boundary or external-effect boundary must change;
3. an external or irreversible effect is required;
4. the same subject or protected dirty-worktree input cannot be verified safely;
5. three materially different failed fixes reveal an architectural problem;
6. the Codex Review budget is exhausted with a remaining P0/P1;
7. the owner revokes, pauses, supersedes or abandons the work.

Normal implementation bytes, tests, evidence, WIP updates and reviewer P2/P3 observations do not
invalidate or enlarge the grant.

## 5. Execution, handoff and Review contract

1. ZCode reads the accepted design, this grant, implementation WIP and current repository facts.
2. ZCode establishes the real baseline, then implements D0–D5 with deletion-first discipline and TDD
   for new behavior or reproduced bugs.
3. ZCode may continue locally across sessions without Codex supervision. It returns early only for an
   invalidation condition, a material owner decision, an external blocker or an unauthorized effect.
4. When locally complete, ZCode freezes one final diff/evidence subject and reports exact commands,
   results, changed paths, deletions, remaining fakes/limitations and all not-done items.
5. Only then does Codex review. The budget for this coherent package is one initial Review plus at most
   two P0/P1 delta Reviews. There is no automatic fourth round.
6. Only P0/P1 block. P2/P3 are reported to the owner and do not automatically create fixes or another
   Review. Zero findings is not a completion condition.
7. Codex approval ends local implementation. Commit, push, publication, installation or deployment
   remain separately unauthorized effects.

## 6. Terminal outcomes

This grant ends in exactly one of:

- `local-accepted`: ZCode implementation is locally complete and Codex accepts the frozen subject;
- `owner-decision`: a material design/scope/risk/topology/effect decision is required;
- `external-blocked`: a real dependency outside the authorized local boundary prevents completion;
- `review-budget-stop`: Round 3 still has a P0/P1 and the choice returns to the owner;
- `revoked` or `abandoned`: the owner stops the package.

No terminal outcome implies authorization for a release effect.
