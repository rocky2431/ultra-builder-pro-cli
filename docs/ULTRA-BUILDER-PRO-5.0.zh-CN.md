# Ultra Builder Pro 5.0：可感知、可委派、可恢复的交付协议

> **状态**：产品范围已由 Owner 接受；本文件是 5.0 的版本化设计与验收合同。
> **宪法来源**：`.ultra/north-star.md` revision `north-star-v2-r3`。
> **范围决定**：`.ultra/decisions/2026-08-25-ultra-5-0-scope.md`。

## 1. North Star

Ultra 5.0 让 Owner 能在任意支持的 Host 上启动、理解、继续或委派一个真实
工作包，并始终准确知道：为什么做、接受了什么、现在在哪里、真实完成了
什么、下一步是什么。即使切换会话、Agent 或传输失败，也能仅从文件与 Git
恢复；任何 Agent 都不能偷偷扩大权限、伪造完成或制造无限流程。

5.0 不替换 3.0 的六条长期原则。它把 `NS-01` 的认知对齐要求投射到每个
实际 Skill 入口、转换、暂停和终止点。`Route Card` 是认知界面，不是 stage
marker；ACP 是执行 transport，不是项目状态或语义 authority。

## 2. 已确认的产品问题

| 症状 | 当前根因 | 5.0 合同 |
|---|---|---|
| Research 看起来永远进行中 | selected lenses、exit condition 和 return route 没有成为统一 owner surface | Research 必须声明 Mode、selected coverage、observable exit 和 return route |
| Change、Research、Plan 顺序显得反常 | Change 的 Intake / Evidence Needed / Accepted 三种语义没有显式命名 | Change 先界定日常请求；scoped Research 回到同一 Change；Plan 只消费 accepted Change |
| 每个 Skill 独立合理，整体路线模糊 | 八项 checkpoint 语义只存在于 authority 文档，没有成为 Skill 输出合同 | 所有 public Skills 使用同一 Route Contract |
| public Skill 是否可隐式继续互相矛盾 | adapter policy、兼容文档与 Execution Grant 使用不同二元分类 | 区分 explicit entry、grant continuation 和 model discipline |
| clean npx 安装后 delegation 不可达 | installed Skill 调用没有被安装到 `PATH` 的裸 `ubp delegate` | runner 位于 installed `ultra-delegate/scripts`，按加载后的绝对路径调用 |
| “对方正在做”与“任务完成”混在一起 | CLI 只有粗粒度状态；ACP 事件容易被误当语义进度 | execution events 与 semantic route 分层显示，事件永不决定完成 |
| Owner 反悔、拒绝选项或回看决定不顺畅 | 项目 authority 可恢复，但 owner-side event 没有统一表达 | draft 可修订、accepted decision 用 superseding record、Status 可按需汇总历史 |
| 长会话消耗大量上下文 | recovery 存在，但 fresh host session 的推荐时机与恢复入口不可见 | Route Card/Resume 明示 fresh-session 建议与 cheapest resume path |
| 很久没有 runnable increment | Walking Skeleton 只是容易被忽略的 Plan prose | Plan 必须命名 earliest observable slice；journey eval 验证，而非僵硬计数器 |
| 失败时只看到不能继续 | route 只列 next 或 health，缺少 reason/escape path | 每个 unavailable route 显示事实原因及 repair/retry/cancel/abandon 路径 |

历史 `FIELD-ISSUES` 来自已删除的 MCP/SQLite runtime。5.0 继承这些用户症状，
不恢复旧状态机或照搬旧 transition 代码。

## 3. Route Contract

每个 public Skill 在开始、material checkpoint、暂停、结束，以及准备转换到
另一个 public Skill 前，显示一张简短 `UBP Route Card`：

```text
UBP Route Card
Route: <public Skill or idle>
Mode: <mode defined by that Skill>
Why: <current problem>
Outcome: <owner-visible result>
Accepted boundary: <accepted scope and exclusions>
Position: <artifact-derived navigation, never semantic percent>
Exit condition: <observable evidence or owner decision that ends this route>
Delta: <material change since the prior card>
Reality: <live path, fakes, unknowns, and verification state>
Decision needed: <one material owner decision, or none>
Next: <smallest covered or recommended public route>
Not done: <remaining obligation at a stop>
```

规则：

- `Position` 可以报告 `3/5 selected lenses have reports`、`2 tasks remain`、
  `ACP session waiting_permission` 等机械事实；不得把它们表达为产品完成百分比。
- Card 从 canonical artifacts、Git 和当前运行观察推导，不写新的 route ledger。
- `.ultra/.runtime/`、`.ultra/progress/`、Research brief 和 ACP event journal 都是
  disposable observation；丢失后从 canonical files 恢复，不升级为 authority。
- `Decision needed: none` 时不要制造确认问题。

## 4. Public workflow ownership

### 4.1 Init

- Mode：`create` 或 `recover`。
- 只创建/恢复 skeleton 和 raw Project Brief。
- Exit：brief 可供 Research 使用，已存在 authority 保持 byte-identical。
- Next：baseline 不存在时为 baseline Research；不得直接建立 North Star 或 Change。

### 4.2 Research

- `baseline`：从 Project Brief 建立首次 accepted North Star、domain language、
  product/architecture baseline。
- `change-scoped`：只回答 active Change 的一个记录问题，生成 named exit evidence，
  然后返回同一 Change reconciliation。
- 多 lens run 必须有 derived brief：entry question、selected lenses、omissions、
  dependencies、sources、checkpoints、observable stop condition 和 return route。
- 不采用固定全量覆盖、固定步数或 `research_complete` bit。

### 4.3 Change

- `intake`：新请求的 bounded work-package draft；不是开始 coding。
- `evidence-needed`：记录一个 load-bearing question 和 exit evidence，路由 scoped Research。
- `reconcile`：将 Research 或实现证据归回同一 stable `change_id`。
- `accepted`：Owner 已接受 outcome/boundary，Research Disposition 满足，可进入 Plan。
- 只有 `open` 新 Change、接受/缩减 boundary、abandon 或变更 canonical writer
  必须停在 Owner；同一 accepted Change 内的非 material reconciliation 可由有效
  Execution Grant 继续。

### 4.4 Plan

- 只分解 accepted Change，不直接重新打开 product Research。
- 若 product/contract evidence 不足，返回 Change，由 Change 决定 Research Disposition。
- ordinary technical uncertainty 由模型解决，或写成 bounded spike/tracer task。
- 第一个 executable slice 必须命名真实 consumer、real data path 和 owner 可观察结果。

### 4.5 Dev、Test、Deliver

- Dev 一次只执行一个 ready task，任务完成由 acceptance evidence 与 Review 支撑。
- Test 做 whole-system audit，不设置对自己 findings 的自动 convergence loop。
- Deliver-reconcile 可在 grant 内准备报告；finalization、版本决定、archive 和外部
  release effects 始终需要当前显式 Owner invocation。

### 4.6 Status

- 默认输出当前 Route Card 和一个推荐 route。
- 按 Owner 请求展开 reason、decision history、installation、delegation 或 recovery。
- degraded authority 不得关闭 read-only diagnosis；Status/Review 能报告问题及安全替代。

## 5. Material checkpoint

以下变化必须停下：

1. 新的或减少的 North Star / specification / Change commitment；
2. active Change outcome、acceptance、non-goal 或 public seam 的 material delta；
3. evidence 使可行方向或 product boundary 发生实质变化；
4. Execution Grant 的 scope、effects、budget、expiry 或 provider topology 扩大；
5. canonical writer 的 primary transfer；
6. unresolved P0/P1、风险接受或三次同根失败；
7. finalization、archive、commit、push、tag、publish、deploy、real install、credentials、
   provider spend 或其他 external/irreversible effect。

命名、内部 abstraction、task decomposition、ordinary technical choice、covered local
edits/tests、以及不会改变 accepted commitment 的 evidence reconciliation 由模型决定。

## 6. Invocation policy

5.0 使用三类能力，而不是含混的 `user-invoked` 二元开关：

| 类别 | 显式入口 | 有效 Grant 下继续 | 说明 |
|---|---:|---:|---|
| `explicit-entry` | yes | no | Init、打开/接受/abandon Change、Delegate、Deliver finalization |
| `grant-continuable` | yes | yes | scoped Research、same-Change reconcile、Plan、Dev、Test、Deliver-reconcile |
| `model-discipline` | no | yes | Grilling、Domain Modeling、TDD、Review、Think |
| `router` | yes | no | Status 由 Owner 显式请求；其他 Skill 直接使用共享 Route Contract，不产生 continuation authority |

Host metadata 只能表达较粗的 implicit bit。Skill 自身必须重新验证 Mode 和 Grant；
没有等价 routing bit 的 Host 依赖 discriminating description 与相同 runtime guard，
不得伪造 Host capability。

## 7. Delegation and Agent execution

```text
Owner / primary Agent
  -> immutable instruction + permission envelope + isolated Git worktree
  -> installed ultra-delegate/scripts runner
  -> AgentExecutionDriver
       -> AcpDriver  (preferred only after Host conformance)
       -> CliDriver  (compatible fallback)
  -> target Agent
  -> derived events + terminal result
  -> primary Agent verifies diff/evidence and decides integration
```

### 7.1 Driver contract

所有 Driver 必须提供相同机械行为：

- capability probe and honest maturity;
- start against one registered isolated worktree;
- strict permission envelope and `.ultra/**` write denial;
- bounded stdout/stderr/event capture;
- progress observations without hidden reasoning;
- cancel/timeout to one terminal result and no orphan process;
- exact final result schema, instruction/permission digests, base/final HEAD and Git diff;
- cleanup/retry under a fresh delegation id.

### 7.2 ACP boundary

- 以 negotiated `protocolVersion` 和 capabilities 为准，不以 SDK/package version
  推断 wire compatibility。
- 5.0 target 为 stable ACP v1；unstable v2 feature 不进入 required contract。
- `session/update`、tool calls、plans、usage、permission 和 cancellation 都是运行观察。
- permission request 只有落在已有 envelope 内才能由 policy 处理；任何 scope widening
  返回 `blocked`，不在运行中产生新 grant。
- 需要 Owner 的语义问题返回 bounded `blocked` result；Owner 决定后使用新 packet/id。
- ACP session 不成为可恢复项目状态。canonical result 必须独立通过 Ultra result/diff
  validation；失去 session 时从 files/Git + fresh packet 恢复。

### 7.3 Delegate versus primary transfer

- Delegate 是 auxiliary bounded worker，不写 canonical `.ultra`，不自动 merge。
- Primary transfer 改变 canonical writer，必须走 OFFER → verified ACK → sole writer →
  frozen RESULT/CLOSEOUT。
- 两条路径互斥；ACP transport 不提供 authority upgrade。

### 7.4 ZCode

- 使用 installed ZCode Desktop runtime；不重新分发私有 app bytes，不包装完整 TUI。
- bridge 必须先通过 capability/version probe、read-only、cancel/no-orphan、cwd/diff、
  credential-redaction，再允许 bounded write。
- 在真实 provider drill 通过前保持 honest maturity，不把本地 binary existence 当 support。

## 8. Migration and installation

- `npx ultra-builder-pro-cli` 只负责 install/update/doctor/uninstall。
- normal runtime 从 installed Skills 进入；`ubp delegate` 仅作为一个版本周期的兼容路径。
- 3.x `.ultra` artifacts 原样可读；升级不自动重写 accepted North Star、spec、Change、
  decision、evidence 或 task history。
- installer 原子发布 Skill-local runner；uninstall 只删除 Ultra-owned bytes。
- Doctor 分开报告 package integrity、Skill discovery、runner reachability、ACP capability、
  active default driver、fallback reason、Hook activation 和 ZCode maturity。

## 9. 5.0 acceptance journeys

| Journey | Observable success |
|---|---|
| Greenfield | Init → baseline Research → first Change → Plan；每次转换有 Route Card，Research 有 stop condition |
| Existing project | 新请求 → Change intake → bounded Research → same Change reconcile → Plan |
| Micro edit | 不使 specification 失真的修改走 ordinary TDD，不制造 Change lifecycle |
| Owner revision | draft 可改；accepted decision 以 superseding record 修订；旧 authority 仍可读 |
| Fresh session | 仅从 repo 恢复 goal/boundary/position/reality/next，不重跑已完成 Research |
| Early value | 第一个 Plan slice 穿过真实 consumer 和 data path，产出可运行观察 |
| Degraded state | Status/Review 仍可读，说明 route unavailable 的原因和最便宜恢复路径 |
| Clean install delegation | isolated npx install 后无需 global `ubp` 即可启动 Skill-local runner |
| ACP happy path | negotiate → session → progress → terminal result；事件与 Route Card 分层 |
| Permission denial | envelope 外请求被拒并返回 reachable blocked/failed result，其他 reasoning 不受阻 |
| Cancellation | cancel/timeout 终止 target、释放 lock、无 orphan、结果可重试 |
| CLI fallback | Host ACP conformance 未通过时诚实使用 CliDriver，结果合同不变 |
| ZCode bridge | installed runtime capability probe 与 read-only/cancel drill 通过后才提升 maturity |
| 3.x migration | 旧项目 authority byte-identical，new Skill/Doctor surface 可用，uninstall 可恢复 |

## 10. Deliberately absent

- no semantic workflow database, stage state machine, route ledger, daemon, or ACP service;
- no completion score, fake percentage, fixed Research catalog, or automatic stage advancer;
- no Team Pack, remote asset registry, Team Marketplace, or Hook/MCP auto-activation;
- no cross-machine task service in 5.0; future remote execution evaluates A2A separately;
- no automatic merge, self-approval, scope widening, provider spend, release, or installation.
