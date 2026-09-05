# Ultra Builder Pro vNext 三阶段交付状态

> - **状态**：`blocked — exact D1 supplemental grant remains proposed/inactive; both tasks remain reopened`
> - **开始日期**：`2026-09-01`
> - **目标架构**：[`vNext R2`](./ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md)
> - **Owner 当前指令**：完成 Step 1、Step 2、Step 3 的累积闭环；不是孤立 MVP。

## Objective and observable completion

交付一个运行在现有 Coding-Agent Harness 之上的生产级自动化 Coding-Agent 软件工厂。三个阶段都必须通过 R2 的真实 E2E、权限/effect、恢复、意图对齐、独立 Review、基线与 capability-tax 门槛；Step 3 还必须完成受治理的 self-evolution promote/reject 与 rollback-ready 证据。

## Roles

- ZCode：唯一代码写入者。
- Codex：工作协调、持续代码 Review、验证、修改意见和 Owner 交付；不写实现代码。
- Claude Code：每阶段架构/状态讨论；与 Codex 共同完成阶段大型 Review。
- Owner：material intent、风险、授权、外部 effect 与最终接受。

## Authority and gates

- 已授权：本地文档、实现代码、测试、只读检查，以及为本目标调用 ZCode 和 Claude Code。
- 仍需单独授权：commit、push、tag、publish、deploy、凭据/身份变更、生产数据或其他外部 effect。
- Provider/tool capability 不是 authority；Task State、status、memory 或 Agent 结论不能扩大授权。

## Current state and evidence

- Goal 已建立；R2 已定义完整 Target Architecture 与三阶段 exit gates。
- D0 已由 `.ultra/decisions/2026-09-01-vnext-r2-three-stage-goal.md` 记录；其
  当前 SHA-256 为 `95910b47c77d69ea1f8a17db4325b7a5ce2b6d0680e63575bf606ac5fa5e1af9`，
  精确绑定 R2 SHA-256
  `f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7`、
  HEAD、North Star blob 和 locally finalized 5.0.2 product digest。它把产品运行时
  Profile 与当前 repository work-package topology 分开；Core 不按 provider 品牌分支。
  初轮 Plan Review 发现原 grant 在第一个 task Review 后过早失效，因此当前 bytes 已将
  两个具名 D1 task 的 ZCode/Review budget 与 aggregate expiry 写成精确、互不借用的预算。
- 唯一 active Change 现在是
  `chg-ultra-vnext-d1-delegation-safety`。它只处理 descendant environment isolation、
  writer-tree truth/cancel/fencing、`outcome_unknown` 和 fail-closed Host effect
  qualification；Run Supervisor、wake 与 Step 1 factory implementation 仍不在 D1。
- D1 两个 task 曾完成本地实现、Task Review、Task Evidence v2 与 ledger close，但
  aggregate Review 发现三个当前 P1 后已按显式 reopen 协议全部退回 `in_progress`；
  Step 1 factory runtime 尚未开始。前置 Change
  `chg-ultra-5-0-2-authority-reconciliation` 已在 Owner 的 exact `ultra-deliver`
  调用下完成本地 evidence/ledger close、Test/Deliver consumption、finalization，并归档到
  `.ultra/changes/archive/chg-ultra-5-0-2-authority-reconciliation/`；当前唯一 active
  frontier 是 `chg-ultra-vnext-d1-delegation-safety`。
- 归档的 canonical evidence digest 是
  `45743f378a16fb1472f37d5a05d20a4578e84b5bb8484a51cbf627b5ef9d822a`；当前 aggregate
  Review digest 是 `b20ade69c9ede3dc1017af17e6e0ebb635e68e985691b28c42c17104c5295281`，
  verdict `APPROVE`，P0=0、P1=0、P2=2、P3=0；两个 P2 按 Owner 指令保留。
- closeout 真实暴露并修复了两个 evidence-lifecycle P1：先补齐
  `evidence.json`/`verification.log` 的精确 Planned Path Inventory，再按 repository
  sensor 的精确 Acceptance-section bytes 重绑 canonical evidence。最终
  `tests/project-artifacts.test.cjs` 80/80，全量 release gate 663/663 Node、89/89
  Hooks、0 vulnerabilities，5.0.2 dry-run package 为 141 entries。
- 当前 HEAD 仍是 `adb7bfe89f40e107d0c9c490076a6e74294b9337`；5.0.2 是未提交、未发布的
  local candidate。本次没有 commit、push、tag、publish、deploy、真实 HOME 安装或
  其他外部 effect。
- 为取得纯 5.0.2 completion subject 暂时隔离的 9 个 vNext WIP/work 文件已按原路径
  恢复并逐项匹配隔离前 SHA-256；本文件此后的状态更新属于下一阶段 WIP，不回写或
  伪造已归档的 5.0.2 Test product digest。
- ZCode live read-only lifecycle smoke 在 56.967 秒正常 terminal，临时 worktree 零改动；
  transport 可用但 maturity 仍为 `experimental`。
- Claude Code Stage 0 讨论返回了有效只读分析，但 transport 终态为 error：
  `Permission prompt unavailable in non-interactive mode`。其结论只作为讨论输入。
- fresh Claude Code Step 1 只读讨论 `061674da405c4fd582f198bb1d7cbff4`
  已在 479.368 秒 terminal success，`changed_files=[]`，并完成 22/22 delegate baseline。
  Codex 已用当前源码核实 environment、outer/inner writer、false cancel 与 worktree fence
  finding；原 mission 绑定的是预算修订前 decision digest，因此只保留为 advisory input。
- D1 已拆为两个顺序 task。初轮 admitted Plan Review
  `vnext-d1-plan-review-20260901` 的 summary digest 为
  `8d05e55f9b4e62d9946c1aafb1058efd5bf72f19deede35878692d2138c7502f`，
  verdict `REQUEST_CHANGES`，P0=0、P1=9、P2=3。P1 已映射到授权有效期、role-scoped
  environment、canary evidence、timeout/physical-root fence、独立 denial observation、
  pre-dispatch call reservation 和 Task 2 packet inventory；这些修订已进入唯一一次
  Plan delta subject，尚未向 ZCode 派发实现任务。三个 P2 仍保留在父 Review 中。
- 唯一一次 Plan delta Review `vnext-d1-plan-review-delta-1-20260901` 已完成，summary
  digest 为 `1a8a663ea061b97552d293f0d423eedb93a1ee42cc9ee39f93a10a3eb75dc0e1`，
  verdict `REQUEST_CHANGES`，P0=0、P1=1。tests/errors/design 三个 lens 均为零 finding；
  唯一 P1 是 canonical durable grant 使用了“两个具名 D1 task”但没有在 grant bytes
  中逐字列出 `vnext-d1-runtime-safety-boundary` 与
  `vnext-d1-host-enforcement-qualification`。现有 grant 的唯一 Plan delta budget 已耗尽，
  因此进入 Owner checkpoint；不得自动改 grant、再开 Review 或派发 ZCode。
- Owner 已明确接受该 checkpoint：canonical grant 现在逐字列出两个 task id，并授权
  一次只处理 direct-parent `review-spec-001` 的最终 delta。语义 scope 仍是 spec-only；
  strict Review v4 要求两个 axis 才能形成 complete verdict，因此只增加同一 grant bytes
  上的最小 `review-design` witness，不扩大 repair scope。Owner 同时要求任何可恢复意外
  都继续诊断与恢复；未授权外部 effect 和安全/权限 hard stop 仍保持不变。
- 最终 bounded Plan delta `vnext-d1-plan-review-delta-2-20260901` 已正式
  `APPROVE`，summary digest 为
  `67685cc5f099539b7147db0ea8332d8d9e0fcbb73416d05b225e2951c148178d`，
  P0/P1/P2/P3 均为 0。Task 1 的十个允许实现路径在派发前均相对 HEAD clean，
  pre-attempt SHA、dirty-worktree inventory 与 ZCode mission 已冻结在
  `work/vnext-d1-zcode-runtime-safety-boundary.md`；ledger 已进入 `in_progress`。
- Task 1 initial attempt `c7d26aef645042179a500ca58b6eeeb5` 与 Repair 1
  `8a6c9cac7b484cf2b438e89ad977bc55` 均已 terminal；Repair 1 后 ZCode/Codex
  targeted suite 均为 75/75。第二次也是 grant 内最后一次 P0/P1 repair attempt
  `145ed685bc1f4eb192f4e8615f09bc0c` 在精确 7200 秒上限 terminal timeout：它先取得
  有效 RED `89 tests / 71 pass / 19 fail`，并完成 writer phase、unobserved-start、
  spawn-error 与 fallback gate 的 shared-root 修复；Codex 对安全保留的 partial diff
  独立得到 `89 tests / 78 pass / 11 fail`。进一步只读审计确认九个测试已到达真实
  产品缺口，另有 missing `spawn` import 和未生效的独立 launcher fault seam 两个测试
  夹具事故；后者仍掩盖一个真实 post-spawn recovery 缺口。当前十路径 hashes、
  零越界漂移和精确 continuation 已冻结在
  `work/vnext-d1-zcode-runtime-safety-boundary-repair-2-timeout-handoff.md`，其 SHA-256 为
  `f2a192dc00d6eabb7a3c052d5fbec3afea7bf050f2c01c775c87d5fa691996da`。
- Owner 已以「接受啊 任何意外都不要停止任务」明确授权单个累计不超过 7200 active
  provider seconds 的 `repair-2-timeout-continuation`。精确授权已记录在
  `.ultra/decisions/2026-09-01-vnext-d1-repair-2-timeout-continuation-grant.md`，SHA-256
  `2a789557172bead69f84000ff423798cbc63eb0d1d5b40b0e435c0f19c2109ce`；可恢复事故可在
  同一累计预算剩余时间内恢复，但不产生第二份预算或外部 effect authority。
- 该 continuation 的首段 ZCode 调用 `e3c55e45222941a9a4f0bb684985e007` 已在
  `1499.904` active provider seconds 后 terminal success；ZCode 与 Codex 均得到
  targeted `89/89`、`git diff --check` clean，十路径与 50 个 outside-scope 基线无漂移。
  该结果不是 Task Review approval；累计 continuation 尚余最多 `5700.096` 秒。
- Codex 随后用两个独立 fixture 复现一个仍在 Repair 2 原 scope 内的 P1：post-spawn
  `pid:null` 和 live-but-unavailable/unsupported start identity 都会被布尔
  `outerWorkerView` 折叠为 stopped，使 `cancel` 在 worker 仍可运行时生成
  `cancelled`、删除 lock 并释放 fence。正式初次 Task Review
  `vnext-d1-runtime-safety-initial-review-20260901` 已验证为 `REQUEST_CHANGES`，summary
  SHA-256 `4bed8a428078d50bb21a29846876526ab666dc97750fa72895bfe73f03140cc7`，
  P0=0、P1=6；六条 finding 是同一根因及 lock-claim identity readback 缺口在五个 lens
  下的不可丢失记录，不是六个互不相关的设计扩建。
- 同一 continuation 的 bounded delta `4d4b239c257d47fc8e496aef206ddc6a` 在
  `1164.908` active provider seconds 后 terminal success；累计 7200 秒预算尚余
  `4535.188` 秒且未继续消耗。ZCode 先取得四个有效 RED，再只修改
  `delegate.cjs`、`delegate-worker.cjs` 与 `tests/delegate.test.cjs`。Codex 独立重放
  `92/92`、三个 syntax check、scoped diff check、69-entry frozen-scope audit 与 process
  cleanup observation，全部通过。
- direct-parent delta Task Review
  `vnext-d1-runtime-safety-delta-1-review-20260901` 已正式 `APPROVE`，summary SHA-256
  `65ce7b939327267ad84c1eb05ec41908e98a8452ca06be5be0118e42703a2a3c`，无 current
  P0/P1/P2/P3。Task Evidence v2 SHA-256 为
  `6c3801b1f46e14bb0dc02c183ea4a4f376dadb1c8b5387528d915a1febab8891`，ledger 已把
  `vnext-d1-runtime-safety-boundary` 置为 `completed`。三个产品级 P2 继续保留并路由到
  Task 2 或后续平台工作，未自动扩建。
- timeout 后没有残留 active writer。恢复审计另发现 4 个早于本 attempt、cwd 精确位于
  已删除 `ubp-delegate-*`/`ubp-codex-acp-conformance-*` 临时 worktree 的测试孤儿
  `node -e setInterval(...)`；Codex 仅向四个已核实 PID 发送 TERM，均已退出，未删除
  额外文件或触碰其他进程。
- 当前真实 HOME Doctor 除预期的 5.0.2/5.0.1 version mismatch 外，Codex 还报告
  `HOST_PLUGIN_NOT_DISCOVERED`；只读 Doctor 仍显示六 Host 选择 ACP、fallback 为 null。
  这不是 vNext 阻断，也不授权真实 HOME 修复。
- D1 aggregate Review `vnext-d1-aggregate-review-20260902` 已严格验证完成，summary
  SHA-256 为
  `1ce9dfed3700a1d743cdfdac6ac3dad562cf5d44fe7902cbd3f68767a064b558`，verdict
  `REQUEST_CHANGES`，P0=0、P1=3、P2=8、P3=1：
  - Task 1 `review-tests-001`：缺少真实 detached delegate-worker 环境捕获；
  - Task 1 `review-errors-001`：outer-worker `kill(0)` 的 `EPERM` 被错误当成 stopped；
  - Task 2 `review-spec-001`：negative qualification 被错误标成 `not_applicable`
    并关闭非条件 `D1Q-02`。
- 两个 task context 已先记录 reopen 原因，ledger 随后回到 `in_progress`；原 canonical
  completion evidence 已按 artifact contract 移到各自的
  `evidence-reopen-20260902.json` raw record，不再占用 `evidence.json` 完成位。两份
  reopen record 均通过 Task Evidence v2 结构校验并把对应 criterion/spec trace 记为
  `gap`。当前 SHA-256 分别是 Task 1
  `a5009b75c0f5e100348494d4b2df278557b508eb164a6808b6cc7a33705bb2c4` 与 Task 2
  `640412cf281819b89e0a370efc82f30a98314860356d13ccf18d23a5e5bb0ac7`。
- 当前没有 repository delegation 或近期 Agent-delegation `run.lock`，没有可观察的
  active ZCode writer。Task 1 已消费 initial、Repair 1、Repair 2/continuation 以及
  initial + 两次 delta Task Review；Task 2 的唯一 live qualification call 已消费且
  retry authority 为 none。Owner 的“可恢复意外继续”保证仍有效，但明确不产生新的
  repair、Review 或 provider-call budget。
- Task 2 的只读根因诊断已经收敛：本机仍保留 exact `zcode-acp` source checkout，HEAD
  `42fe149d4b501469343c01f23ba3801832306d53`；bridge 的 `extract_locations` 没有识别
  ZCode native tool 的 `file_path`，permission translation 又没有把任何 locations 送进
  ACP `RequestPermissionRequest`，因此 retained run 的 edit 是 `location_count: 0`。
  Ultra `acp-driver` 的 fail-closed 拒绝是正确行为，不能改成从 `rawInput` 猜 authority。
  进一步只读 trace 还确认 `acp-driver` 在任一 reject 后立即 resolve `fatal`；虽然 denial
  已被安全记录，session 会在后续 shell/Web probes 前被取消，因此单次 call 目前也无法
  完成 D1Q-02 的全部独立 denial observations。最小修复必须继续返回 reject、保留每个
  denial event，但让受界 Host turn 走到 terminal，最后仍投影
  `failure_type: permission_denied`；绝不能执行被拒操作或把 denial 变成 success。
  最小修复需要 ZCode 在 fresh isolated local bridge worktree 中补齐映射和 regression，
  同步 canonical bridge patch 与 digest，并为 `acp-driver` 加一个 multi-denial
  regression；构建出的临时 binary 可通过
  `ULTRA_ZCODE_ACP_COMMAND` 完成一次 qualification，不需要真实 HOME 安装或替换现有
  `/Users/rocky243/.local/bin/zcode-acp`。
- 精确补充授权已冻结为 inactive proposal：
  `work/vnext-d1-aggregate-p1-supplemental-grant-proposal.md`，SHA-256
  `301b9a32d07a6da5ec2e5a3f67eb8b64c99e24836d5efb257efee5c3473fdff7`。它逐项绑定
  Task 1 的单次 repair/review、Task 2 现有 Repair 2 的最小 inventory extension、offline
  bridge build 与单次 qualification call；该文件明确不是 authority。exact bridge
  checkout 的 canonical compatibility diff 与产品 patch 同为
  `174dfd0feafe84320556a84b5ae08b10e44c5515fea4992fd1d58af54cee4e3d`，当前离线
  `cargo test` 6/6。
- 同一个 Owner-authority checkpoint 已连续经过三个 goal turns；第三次 live revalidation
  仍确认 proposal SHA 未漂移、两个 D1 task 都是 `in_progress`、没有 repository 或近期
  Agent-delegation `run.lock`，也没有新的 Owner activation。Goal 因此正式标记
  `blocked`，但完整三阶段 objective、现有 evidence 和后续顺序全部保留；Owner 接受该
  exact proposal 后应恢复同一 Goal，而不是另建 Change 或重做已完成诊断。

## Next action

1. 取得一个精确的 Owner 补充 grant，只覆盖：一次新的 Task 1 P1-only ZCode repair、
   一次新的 Task 1 delta Review、Task 2 Repair 2 的 bridge/ACP-driver path-inventory
   extension，
   以及一次新的 exact selected-Host no-production qualification call；Task 2 仍只可使用
   其现有剩余 Repair 2 与 delta Review，aggregate 仍只可使用现有 P0/P1 delta Review。
   bridge 只可在 isolated local worktree 离线构建并以 env override 使用，不安装或替换
   真实 HOME binary；Owner 可按上述 proposal path 与 SHA-256 精确接受，不得把该 grant
   推导成 Step 1 或其他外部 effect。
2. ZCode 先关闭 Task 1 的两个 P1；Codex 独立验证真实 delegate-worker env seam 与
   `EPERM => unprovable` 的 lock/fence 行为，完成 fresh Task 1 Review/evidence。
3. 保持 `D1Q-02` 的正向标准，由 ZCode 在 Task 2 Repair 2 内修复 bridge 的
   `file_path -> ACP locations` 与 permission-location 传递，同步 canonical patch/digest，
   并让已拒绝的 ACP request 在保持 fail-closed 的前提下不提前终止剩余 probes；随后只
   执行一次新授权的 exact Host qualification。不得自动 retry、fallback、安装 binary
   或升级 maturity。
4. Task 2 fresh delta Review/evidence 通过后运行 aggregate D1 delta Review；只有
   `APPROVE` 才运行 aggregate Test 和 Deliver reconciliation。当前 grant 不含
   finalization/archive，进入 Step 1 前仍需独立 Owner authority。
5. commit、push、tag、publish、deploy、凭据/身份、真实 HOME 安装或其他外部 effect
   仍需各自单独授权；可恢复意外继续在既有精确预算内诊断和恢复。

## Not done and do not redo

- Step 1、Step 2、Step 3 均未开始运行时代码实现或阶段验收；D1 是 Step 1 前置安全 Change。
- 不把 R1 vertical-slice wording 恢复成当前方向。
- 不让 Codex 或 Claude Code 写实现代码，不让 ZCode 自行扩大 scope/authority。
- 不在未验证 ZCode transport 时重复创建无人值守任务；先检查真实 lifecycle。
- 不把当前 aggregate `REQUEST_CHANGES`、旧 Task Review `APPROVE` 或绿色测试误写成
  D1 closure；不在补充 grant 前唤醒新的 implementation writer 或重试 provider call。
