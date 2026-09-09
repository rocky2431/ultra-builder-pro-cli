# Owner decision: unified Ultra entry

Date: 2026-09-09 (Asia/Shanghai).

## Question presented

> 需要你决定一个产品入口边界：三个候选在普通宿主聊天里都未自动进入 Ultra；显式进入后已能先澄清用途。我的建议是实现统一入口（例如 `ubp run "自然语言目标"`），进入后由 Agent 自己选择流程，普通宿主聊天里的自动发现只作尽力支持。是否接受？这是对原计划“普通对话自动进入”的承诺调整，所以不能由我自行降低验收标准。

## Exact owner answer

> 接受统一 Ultra 入口，内部流程由 Agent 决定（推荐）

## Effect

The formal product entry accepts the natural-language goal and lets the host model select internal workflows. Ordinary native-host chat discovery remains best-effort. `ubp run` is the proposed public shape; exact command design follows the existing CLI. The owner does not select internal modes.

This updates Step 2's entry boundary in the accepted eight-step plan; it does not retroactively pass any failed plain-host trial. Freeze and record the real public entry for future runs; preserve the same task outcomes, material-purpose questions, scope, working artifacts, and recovery requirements. Explicit Skill diagnostics are diagnostic evidence, not proof that the unified CLI exists or works.

All eight steps and existing author roles/effect exclusions remain in force under `2026-09-09-eight-step-implementation.md`. Bring forward only the thin natural-language entry needed for Step 2; factory run/observe/stop/resume qualifications remain in Steps 5-8. No new global always-active hooks, renamed Skills by default, paid product purchase, host installation, or credentials mutation is authorized by this decision.

Evidence: `work/trellis-eight-step-20260909/step2-candidate3-observations.zh-CN.md` and `step2-entry-mechanism-diagnosis.zh-CN.md`. The latter is an independent diagnosis; its broad claim that loading has only one possible lever is not a proof against the newly authorized public entry.
