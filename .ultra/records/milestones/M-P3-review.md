Reviewer: Claude reviewer subagent (Opus 5.5, fresh context; wrote none of the P3 engine, the method, or R's code)

## Exit clauses (RESULT §5 P3), checked against ledgers and git, not the transcript's prose

| Clause | Shown? | How I know |
|---|---|---|
| 每种变更都留下可见的差分和计划日志 | Yes | Each change has its own plan-log diff: line 6 (L1 add: `added`/`nodes_added`/`checks_added`), line 7 (L1 modify: `modified:[REQ-expire]`), line 8 (L2: `nodes_added:[N-store]`), line 9 (reduce: `removed`/`nodes_removed`/`checks_removed`). Each also has its own commit: `b9991f7`, `3f605fb`, `1ac4c94`, `706af53`. |
| 只有关联的节点重跑 | Yes (weakly for L2, see S2) | After the migration, `nodes.jsonl` has exactly four completions: N-expire (after the REQ-expire edit), N-store (new), N-delete (new), N-persist (after the REQ-persist edit). I replayed `status --json` with the P3 engine at 17 commits in a /tmp clone. The node and check states match every table in the transcript. |
| 其余检查保持全绿（棘轮） | Yes | I computed the engine's code hash for every commit and grouped `evidence.jsonl` by it. Each of the 8 code states after the migration has a clean-tree run of every check. The only green-to-red changes are C-expire at `3f605fb` and C-persist at `2960061`, both checks of requirements whose text was deliberately edited. No ratchet run was skipped. |
| 缩小在 Owner 批准之前被拦住 | Yes | Ledger order: approval at 16:23:15.626Z, then the removal record at 16:23:15.941Z; no removal appears before it. I reproduced the block in the clone by committing the same reduction with no approval. `gate` failed with both `reduction-unapproved` items and wrote no plan-log line. `milestone close` also refused (`plan-gate`), and so does `node done` (`completion.cjs:17`). The block is real, not advisory. |

## Findings

**Blocker:** none.

**should-fix S1 — The writer overlap is longer than its ruling says, and it is filed under the wrong layer.** Checked myself.
- Sources: R `.ultra/rulings.md:51`, `transcript.md:458`, `.ultra/.runtime/missions/N-expire-page.md`.
- The ruling describes about 15 minutes of overlap between two writers. The evidence shows more:
  - The N-expire-page writer (trailer `Claude`) committed `67f86c2` at 07:17, then committed again in `0c28691` at 08:14. It was alive for about an hour.
  - That covers the P3 migration (08:03) and all four injection commits (08:04–08:06). The controller was editing spec, plan and ledger in a tree where a writer was still running.
  - That writer's mission points `ubp` at the P2 engine (`ultra-builder-pro-cli-v6/bin/install.js`). The ledger was migrated to P3 underneath it.
  - `0c28691`'s message says it holds N-expire-page's lines. It actually carries the other writer's two C-expire runs.
- I found no damage. `0c28691` touches only `evidence.jsonl` (+2 lines). Every ledger record after 16:00Z has the P3 shape (`shared` present), so the P2 engine wrote nothing.
- Why it matters:
  - It breaks `method/ultra.md:123` ("One writer at a time") and the §8 exclusion "P4 之前做多写者并行".
  - L4 means "inside a node, does not go up", so it is the wrong layer for a controller breach of the contract.
  - The lesson ("wait for the completion notice") exists only in the uncommitted v6-p4 worktree (`method/ultra.md:123-126` there). It is not in the P3 method being accepted, although `transcript.md:458` says "P4 方法文本已加".

**should-fix S2 — The L2 injection was the mildest kind of L2, so L2 precision was hardly tested.** Checked by reading and replay.
- RESULT §3.1 says an L2 change invalidates "受影响模块的实现节点". The method's L2 row (`method/ultra.md:177`) instead says "new node, no other node turns stale". R did exactly that: a ruling plus N-store.
- As a result, the "only associated nodes" clause holds for L2 trivially: nothing existed that could have rerun.
- The engine has only two ways to invalidate for L2: none (a new node), or everything (`shared-changed`). The `shared-changed` path ran on R only through the migration (no hash → hash). Nobody edited `## Interface`; that path is covered only by `tests/engine-p3.test.cjs`.
- N-store covers REQ-expire only because every node must cover a requirement (`rulings.md:49`). Any future edit to REQ-expire will stale this unrelated refactor node.

**should-fix S3 — The engine does not check who approves.** Checked myself in the clone.
- `ubp approve M2/REQ-delete-page M2/C-delete-page --owner "ok"` with no `--proxy` recorded `proxy:false`, and `gate: pass` followed.
- Nothing cross-checks `approvals.jsonl` against `owner-touches.md`.
- The controller's check of a writer's work (`method/ultra.md:110-113`) does not look for approval lines added by writers.
- So the block catches reductions nobody noticed. It does not stop an agent that approves its own reduction.

**should-fix S4 — Reopening REQ-persist in closed M1 was a borderline narrowing, and the ruling says it narrows nothing.** Checked myself.
- Sources: R `.ultra/rulings.md:57`, `M2-review.md` nit 3.
- A data file with a repeated code used to start the server; now it makes the server exit. The method (`method/ultra.md:185-189`) says to treat such an edit as a reduction yourself and run `ubp approve` first. That was not done.
- The Owner's consent is a proxy answer folded into the M2 gate question, which asked two things although the method says one.
- The ruling is not wrong to classify it as an addition. But the sentence "没有缩小任何已有行为" is wrong, and an appended correction is owed.

**should-fix S5 — P4 work started before P3's exit was observed.** Checked by file mtimes; this is outside the P3 artifact.
- The v6-p4 worktree has `P4-engine-round1.md` (08:38) and `tests/engine-p4.test.cjs` (08:45). M2 on R closed at 08:48.
- RESULT §6.1 says "上一阶段的出口没有被观察到，下一阶段不开始".
- It does not taint R's evidence: R's missions use the v6-p3 engine, and every ledger shape matches P3. The Owner should still be told.

**nit N1 — The transcript's note on the reset understates it.** Checked via reflog. `transcript.md:351` mentions one commit. `git reset --soft 487e310` actually dropped two commits: `e098df4` (which held only the test deletion) and `3be74a9` ("record the ratchet after the reduction"). An amend `fd69a54→444e1a8` is not mentioned at all. Diffing shows `706af53` contains everything from both dropped commits, so nothing was lost. All of this is local and unpushed.

**nit N2 — Wording in the exit summary.**
- "7 条 change 记录" includes two migration artifacts (plan-log lines 4–5, both `shared:true`).
- "已绿的需求没有一次变红" should say "only requirements whose text changed went red".
- Headings 4a and 4b say "全量检查", but the `ubp check` shown ran only two checks. The full runs came from the writers' commands, and the ledger shows them.

**nit N3 — Method text vs practice.**
- `method/ultra.md:185-187` says that weakening a test file "passes the gate as a modification". In fact a test-file edit never reaches the plan log, because the check fingerprint covers only run/timeout/expect (`engine/loading.cjs:14`). This also means the acceptance strengthening after review round 1 (C-delete, C-expire) left no plan-log trace.
- The reduce row says ask, approve, then edit. The run did edit, gate fails, approve, gate. Both work.
- The M2 demo omits the journey log path and the count of `unplanned` touches (`method/ultra.md:158,205`).
- The accepting M2 review covers only the delta `0749540..c84cb17`.

**nit N4 — A stale engine copy in R.** `.ultra/.runtime/ubp-engine` is the P2 engine from 05:50. The M2 round-2 reviewer cited `FORMATS.md:476` from it. It did no harm here, but it is a trap.

**nit N5 — `depends` changes don't reach the plan-log diff.** The transcript already says so. This agrees with RESULT §3.1 L3 (the denominator did not change), and the change is in the ruling at `rulings.md:49` and in git.

## Does the method match what was done
- "Changes after 0→1": the add, modify and reduce rows were followed, and the engine behaved as each row says. The L2 row matches the run but departs from RESULT §3.1 (S2). The reduce step's order differs (N3).
- "Milestone gate": steps 1–5 were followed, with M2-review-1 revise, then rework, then M2-review accept, then `close --proxy`. Small departures are in N3.
- "One writer at a time" was broken once (S1).

## What must be said to the Owner at acceptance
1. All four "Owner messages" were written by the assistant. The reduction approval and both milestone gates (M1 and M2) were proxy answers under the Owner's delegation of 2026-11-01, and no demo was seen. Under §8, the P3 exit is "未经真实 Owner 验证".
2. The block covers structural reductions only: a dropped requirement, a dropped check, or narrowed coverage. Rewording, a weaker test, or a weaker `run`/`expect` passes the gate. It depends on the model classifying the edit itself; REQ-persist (S4) is a live example.
3. The engine cannot tell the Owner's approval from an agent's (S3).
4. L2 was shown only as "ruling plus a new node". Invalidating affected nodes after a design change is not implemented (S2).
5. The writer-overlap incident, its real length, and that the fix is not yet in the accepted method (S1). P4 also began before P3's exit was observed (S5).

## What I checked
- Read RESULT §3, §5, §6 and §8, and in R: `injections.md`, `transcript.md`, all five ledgers, `owner-touches.md`, the rulings added since `6869a38`, the M2 reviews and demo, the missions, and the reflog.
- Read P3 `method/ultra.md` in full, plus `engine/plan.cjs`, `states.cjs`, `git-state.cjs`, and the gate checks in `completion.cjs`/`milestone.cjs`.
- Computed the code hash at every commit and grouped evidence by it.
- Replayed `status --json` at 17 commits in a /tmp clone.
- Reproduced the unapproved reduction (gate fail, no plan-log write, close refused) and a self-approval with no `--proxy`.
- Ran `node --test tests/engine-p3.test.cjs`: 26 pass, 0 fail.
- `node bin/install.js status` in the P3 worktree prints `M-P3 · 3/3 绿 · 下一项 里程碑门 · 本里程碑计划变更 2 次`.
- The clone and scripts are removed. Neither repository was modified (the P3 worktree's `git status` is clean).

Verdict: accept
