<!-- Subagent research report (UBP problem catalog), saved verbatim 2026-10-31. Model output: [D] documented, [I] inference. -->

UBP problem catalog (read-only; no files edited). [D] = documented in a source; [I] = my inference.

**Sources.** V1 = `git --git-dir=/Users/rocky243/.claude/backups/ubp-git-20261018/.git` (HEAD, commit bodies, CHANGELOG). V2 = `/Users/rocky243/Context Engineering/ultra-builder-pro-cli`. 3S = `/Users/rocky243/Context Engineering/{deepthink-skill,plan-with-flie-skill,ultra-goal-skill}`. SK = `/Users/rocky243/Context Engineering/Excellent-skill-Marketplace`. diag = V2 `docs/wip/ultra-builder-pro-5.0-owner-experience-diagnosis.zh-CN.md`.

**Owner summary check [D].** V1's strengths were order, a visible endpoint and smooth first delivery. Its weakness was drift, "locally perfect, globally fragmented", under iteration (V2 `docs/wip/owner-factory-debate-20260905/00-codex-position.zh-CN.md:14`). The sources support your summary.

**Corrections to diag (re-checked 2026-10-31).**
- §4 "no dedup" is stale. b765b55 (2026-09-06) added per-session dedup keyed on session, change, task and acceptance hash (`hooks/mid_workflow_recall.py:1-60`). The file is 177 lines, not 47. The 8 MiB caps remain (`hooks/session_context.py:29-30`, `hooks/_common.py:22-24`).
- §1 "nothing can refute done" overstates. Archived acceptance tables carry executable commands (`.ultra/changes/archive/chg-converge/intent.md:21-27`), and ultra-dev defines Converged/Stalled/Unreachable exits (`skills/ultra-dev/SKILL.md:170-190`, from fa931df). Still true: no task has an anchor key, and semantic disposition stays with the model.
- §2.1 recount with the same method: 375 review-*.json and 125 verification.log (diag: 330 and 29). Git-tracked: 110 and 17.
- §5 "~10 owner-side mentions" does not reproduce. Now about 559 execution-term hits versus 62 owner-side. 收敛 (22) and 进度 (38) are not clearly owner-legibility, but the imbalance holds.
- §3 "22 numbered research docs per run": the one full research folder has 6 numbered docs plus brief and snapshot. Not reproduced.

**A. Problem table.** Gen: V1 (4.1 to 7.4.2), CLI (V2), 3S.

| Symptom | Documented root cause | Gen | Evidence | Later status |
|---|---|---|---|---|
| **Intent / research** | | | | |
| Research has no endpoint; repeated intent alignment | No checkable object defines done [D diag §3]; "repeated intent alignment, oversized progress output" [D] | CLI | diag §3; b765b55 | Partly: grilling made conditional, research bounded by current decisions. No anchor-based endpoint: tasks.json has no such key |
| Per-round 4-star research gate; 5 rounds | "LLM attention was diluted across 5 Rounds" [D] | V1 | 4fbce92; 55eb0d6; CHANGELOG v6.8.0 | Replaced by 17 step files; gate absent at HEAD. Why the gate was dropped is not stated [I] |
| **Spec** | | | | |
| Specs stale when requirements change mid-dev | Specs updated only at deliver [D] | V1 | 742298a; HEAD `commands/ultra-dev.md:403-425` | Dual-Write with EXPANSION/CORRECTION/REDUCTION; REDUCTION needs owner approval |
| Requirement drift shipped silently ("VIP free shipping" shipped as "50% off") | Drift surfaced only at review [D] | V1 | CHANGELOG v7.1.0; 5c5191f | AC-drift reviewer, review time only |
| Acceptance cannot refute "done" | Status model-written; none of 32 tasks has an anchor key [D] | CLI | diag §1; fa931df | Executable acceptance commands; exits in SKILL.md:170-190; no task-level anchor |
| **Plan** | | | | |
| Plan never checked against north star; no audit before dev | "No independent semantic audit existed between plan and dev" [D] | V1 | a3ec512 | Constitution Check and /ultra-analyze added |
| **Execution** | | | | |
| Task marked done on model judgment; evidence scores placeholder | Score "always-zero for a year"; Step-4 gate read 0/6 [D] | V1, CLI | a3ec512; fa931df | V1: three AUTO sensors. CLI: three exits |
| Blocking hooks made agents edit tests/specs to escape; stop loops | "Agents would edit tests / specs / assertions to escape blocks" [D]; "MAX_STOP_BLOCKS=2 smoking gun" [D] | V1 | 4f712ed; 7451312; b3647ad | Recoverable checks made advisory; blocks kept for irreversible ops |
| Repair loops with no ceiling, judged by pass counts | "no total round ceiling" [D] | CLI | 350bf09 | Three-round cap; best-ever evidence set |
| Goals that could never finish | Zero/negative holdout reading made audits unknown; free retries forever [D] | 3S | 8ac9244; 7944d25 | Fixed in those commits |
| Silent failure: "every failure exits 0 silently"; north-star capture hook deleted, placeholder kept ~1 month | Hook removed without migrating its job; nothing detected it [D] | V1, 3S | fd2f4be; V1 v7.3.0 | north_star_capture.py restored; registration sentinel (4e009eb) |
| **Verification** | | | | |
| Reviews outnumber verification records (330 vs 29 on 09-05) | Review stands in for anchor [I] | CLI | diag §2.1; recount 375 vs 125 | Not addressed; review demotion (diag §6) not built |
| Transport "success" read as acceptance | Send success = turn ended normally [D]; Kimi run had 595 protocol errors and was still counted [D] | CLI, 3S | SK RESULT §1.2; vNext review §2 | Distinction documented; no enforcement found [I] |
| **Context / docs drift** | | | | |
| Always-loaded rules name a missing skill; trimmed handbook never committed | Uncommitted work and nonexistent skill name [D] | V1 | 47f0970 | Fixed in 47f0970 |
| "Abandon" path unrunnable; template lacks its directory | Instruction and template out of step [D] | CLI | e45c102 | Fixed |
| **Owner visibility** | | | | |
| Owner must run status; model is pushed state on every tool call | Injection direction inverted [D diag §4] | CLI | diag §4; b765b55 | Per-session dedup; no owner progress line found [I] |
| Recovery silent when the record is not selected; progress belongs to host/task | Real session wrote a record never selected [D]; Task State is recovery only [D] | 3S | 0270963; fd2f4be; SK RESULT §1.2 | Reminders (0.8.0); one-time post-compaction prompt (0.9.0) |
| **Multi-agent / delegation** | | | | |
| Factory showed no repeatable benefit | 10 fixed runs: source 10/10, delivery 9/10, natural end 8/10; "repeat benefit not established" [D] | CLI | stage-d-product-v2-comparison.zh-CN.md:3; stage-e-acceptance-state.zh-CN.md:15 | Step 6 not passed. Drop-Supervisor fallback written into candidate (factory-candidate.zh-CN.md:891) |
| Verifier false positives (6 legitimate reports) made parent interrogate subagents | Advisory tone [D] | V1 | v7.4.0; 3527c5a | Corpus tests; advisory made FYI-only |
| Delegated workers inherit full process.env | Control variables can reach other hosts [D] | CLI | vNext review §1, §6.1 | Named as prerequisite fix; status unverified [I] |
| Skills inject conflicting next steps at one SessionStart | No arbitration across modules [D] | 3S | SK RESULT §1.3 | 2026-09-14 validation covered 7 combinations; arbitration not shown [I] |
| **Scope / meta-work** | | | | |
| Installer grew into "automated coding factory"; six-plus tools adopted | "4-5w → 11-13w" [D] | CLI | dc695e0 | Reversed: MCP, SQLite, daemon, orchestrator removed in 0.26.0 (CHANGELOG 444-446; d330236) |
| Eight-step plan: steps 6-8 never closed | Step 6 benefit unproven; step 7 final review INCOMPLETE; step 8 owner decision pending [D] | CLI | stage-e-acceptance-state.zh-CN.md:3; stage-e-final-review-original.md:7-17; acceptance files only for steps 1-5 | Open |
| Churn: 0.26.2 → 3.0.2 → 5.0.0 in 22 days; ultra-goal v0.1 → v2.8 in two days; V1 hooks removed, then re-added | No stability criterion stated [I] | all | CHANGELOG headings; git log; 539750e, 4f712ed | Ongoing [I] |

**B. Good things lost.**
- V1 Dual-Write audit folder (`changes/task-{id}/proposal.md`) was deleted in 703017c as "redundant with contexts/". The process survived (HEAD ultra-dev.md:403); the audit trail moved into per-task context files [D].
- V1 4-star research gate (4fbce92: "Each round requires ≥4 stars") was dropped in 55eb0d6 with the step-file split. The commit gives no separate reason for dropping the gate [D/I].
- V1 context archive and session recovery were removed in 4638f36 ("no longer in use"), then rebuilt as workflow-state checkpoints (8d51666) and PreCompact (v5.9.1) [D].
- V1 TAS anti-fake gate (listed as preserved in 539750e) has no matching wording at HEAD (phrase search). The removing commit was not identified [D/I].
- V2 lifecycle wayfinding was lost in 0.26.0 (d330236) and recorded as lost in 8be6f6d [D].
- V2 team checkpoints (2813619, 0.22.0) and the SQLite projector (10c26fd) were removed with MCP/SQLite in 0.26.0 for being "brittle" and blocking portable recovery (d330236). Team handoff now rests on files plus Git [D].

**C. 1→100: changes after first delivery.**
- V1 mechanisms: Dual-Write (742298a) with classified changes and an owner gate on REDUCTION; AC-drift check at review (v7.1.0); /ultra-analyze between plan and dev (v7.4.0) [D].
- V1 breaks [D unless marked]: change records split away from specs (703017c); north-star capture lost for about a month without detection, affecting every ultra-init project (v7.3.0); "a month of unlanded fixes" and 55 files of git-status noise (v7.3.0); doc-sync removed as "no automatic doc syncing" (34f4bdc), after which the contract table went stale (v7.3.0). The causal link is [I].
- V2 mechanisms: Change lifecycle (intent, plan, dev, review, deliver, archive with delivery.md); entry and exit reconciliation (0a02eb7); archive read before opening a Change (da3290b), motivated by "compatibility-sprawl" [D]. Direction changes were recorded as superseding decisions (`.ultra/decisions/2026-09-09-eight-step-implementation.md`) [D]. 0.25.0 added a successor path for immutable archived Changes (CHANGELOG:508); whether file-first 0.26+ keeps it was not verified.
- V2 breaks: 5 of 11 archived Changes lack delivery.md (legacy format), so the archive read finds less [D count, impact I]. The abandon path was unrunnable until e45c102. The BASELINE_HEAD_STALE treadmill and a second bookkeeping commit were fixed in 0.22.0 (CHANGELOG:674) [D]. The north star was revised r1→r3 in two days (decisions 2026-08-15, 08-17) [D], but I found no mechanism that re-runs affected acceptance when a north star changes [I].
- Answer to "spec or something else?" [I]: the sources put the failure in the link between intent, spec, acceptance and code. V1 changed the spec; V2 changed the Change and north star. The two-level design calls earlier context "dead": written once, loaded whole, detached from code changes (`docs/wip/ultra-builder-pro-two-level-loop-design.zh-CN.md:13-24`) [D quote]. The object to make live is the acceptance-to-code link, with spec as one part.

**Not read or limited.** V1 history starts at 4.1.0 (4f991fd, 2025-11-17); earlier generations are not in the repo. Read in part only: docs/PLAN.md at 8ec8585 (section list only), the two-level design (§0 and headings), vNext target-r2 and factory candidate (targeted greps), THOUGHTS.md (headings and some sections). docs/research 2026-10-06 and 2026-10-14 were not read. `ubp --all --global -d` was not re-run, so the 6/6 degraded install (diag §2.2) is as of 09-05.
