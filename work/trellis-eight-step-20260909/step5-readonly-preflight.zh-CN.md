# 步骤 5（含保留的 Stage B 资格）只读前查

日期：2026-09-09。执行者：实际 Claude（delegation `452722586ef14f6e91aac94fb765285e`，caller codex，depth 1）。
性质：**只读**。本回合未修改任何产品源码、测试、`.ultra` 权威文件、registry、runtime、config，未创建工作树，
未跑 provider/model 资格，未跑全量套件，未启动 C/D/E，未 commit/安装。唯一写入文件是本文。

范围提醒：步骤 1–4 未全部验收前不得开始步骤 5 的资格/运行时执行。本文只把"恢复 Stage B 所需的当前事实"
落到可核对的路径与哈希上，供后续窄交接直接使用。**本文不是修复授权，也不改变当前状态或授权文档。**

---

## 1. 仓库与计划基线（已核对，无漂移）

| 项 | 值 | 核对方式 |
|---|---|---|
| Git root | `/Users/rocky243/Context Engineering/ultra-builder-pro-cli` | `git rev-parse --show-toplevel` |
| HEAD | `47f791102452769e2e8d163ee2dd8118a2f9d41b` | `git rev-parse HEAD` |
| 分支 | `codex/owner-factory-delivery-20260905` | git status |
| 脏路径 | 21 个 `M` + 大量 `??`（Stage B 保留改动），本回合未触碰 | `git status --porcelain` |
| 八步计划 | `thinking/trellis-direction-20260908/RESULT.md` SHA-256 `b92929fe3ec3122a4ac8349e3d58fd54b7aeb47306f534c633eddad1c5715b35` | `shasum -a 256`，**与接受时字节一致** |
| 步骤 5 正文 | RESULT.md:141–154 | 已读；两个出口（先 Stage B，再 Stage C / R2 Step 1）不变 |

Stage B 决策文件当前 SHA-256（供后续引用固定）：

- `.ultra/decisions/2026-09-06-stage-b-selected-host-delta.md` → `9f74a9ccd25c3761d2d56f9fa38d2f40b45d5576459ed0e02def506910782410`
- `.ultra/decisions/2026-09-06-stage-b-implementation-scope.md` → `181825b012c64ed1354a5f916f4029c7b5842e2b80129f592f410167c8c88f26`
- `.ultra/contexts/task-vnext-d1-host-enforcement-qualification.md` → `1b7ac29887f2bb830f1ee8042a270891a9482f2e62b149649a6854ae6b772b6d`

**D1Q-02R2 Acceptance section SHA 已复核通过**：状态文档记录的 `999f4e7bb49e848377b40a1be4acdc3c7bbb7ac12c9c2f79b1ce4f511be4e8ef`
等于当前 context 文件 `## Acceptance Criteria` 至 `## Definition of Drift` 之间正文按 `trimEnd() + "\n"` 归一化后的
SHA-256（另两种归一化分别为 `2a9111d8…`（保留尾空行）与 `f68df1f2…`（纯 trimEnd）——引用时必须注明归一化方式，
否则会被误判为漂移）。**验收判据本身没有被改动。**

---

## 2. 已安装 runtime 身份（实读，非文档转述）

| 组件 | 记录中的候选值 | 当前实读值 | 结论 |
|---|---|---|---|
| managed adapter `@agentclientprotocol/claude-agent-acp` | 0.75.1 | **0.75.1**（`require(...)/package.json`） | 一致 |
| adapter 绝对入口 | `/Users/rocky243/.local/share/agent-delegation/runtimes/20260905T215434Z-i6ha9hqc/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js` | 存在，4134 B，mtime 2026-09-06 05:54 | 一致 |
| native Claude SDK `@anthropic-ai/claude-agent-sdk` | 0.3.257 | **0.3.257** | 一致 |
| native Claude CLI | 2.1.261 | **`/Users/rocky243/.local/bin/claude` → `/Users/rocky243/.local/share/claude/versions/2.1.266`；`claude --version` = 2.1.266** | **不一致，见 §5-Q1** |
| 本机保留的 native 版本 | — | `2.1.260 / 2.1.261 / 2.1.263 / 2.1.266` 四个目录并存 | 2.1.261 未被删除，仍可显式绑定 |
| runtimes 目录 | 单一 `20260905T215434Z-i6ha9hqc` | 一致，无第二套 | 无 runtime fetch 迹象 |
| Node | — | v26.8.1 | 供窄验证记录 |
| ACPX public entry fixture | `f734ed38cce00f14aa3229a6b21f8c7a452d6f7c2ef46f6b362907ba6aacecbd` | `/tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs` **仍在且哈希一致** | 窄复验可原样重现 |

补充：`/tmp` 下的 ACPX entry 是临时路径，任何 `/tmp` 清理都会让窄复验命令失效。若要跨机重启会话，需先重新
确认该文件存在，再跑 §6 命令。

---

## 3. 依赖工作树与依赖仓库（read-only 核对）

清单来源：`work/owner-factory-implementation-20260905/stage-b-worktrees.json`（记录时间 2026-09-05T17:14:43Z）。

| 条目 | 清单记录 | 当前实读 | 结论 |
|---|---|---|---|
| 隔离根 `/tmp/ubp-factory-stage-b-l7dd0y3s/` | 三个工作树 | **只剩 `agent-delegate-skill/` 与 `zcode-acp/`** | Goal 工作树缺失 |
| agent-delegation 隔离工作树 | 分支 `codex/ubp-stage-b-acpx-runtime` | HEAD `772929d491d3c6ecd1e38d5e0fd05c414c4033e0`，同分支，7 个脏项（`MM README.md`、`M scripts/install_user.py`、`tests/*`、`?? docs/`） | 在位，已审查版本保留 |
| agent-delegation 原 checkout `/Users/rocky243/Context Engineering/agent-delegate-skill` | 状态文档称"仍 772929d 且 clean" | **HEAD `0a817535f7a464dfdf6fc7bd32e3dc25b860e0fd`，分支 `main`，clean** | **已前进，见 §5-M1** |
| Goal 隔离工作树 `/tmp/.../ultra-goal-skill` | 分支 `codex/ubp-stage-b-goal-graph`，base `b477722` | **目录不存在；`git worktree list` 无该登记；分支 `codex/ubp-stage-b-goal-graph` 在 ultra-goal-skill 中已不存在；reflog 无该分支记录；`git stash list` 为空** | **已丢失，见 §5-M2** |
| Goal 原 checkout `/Users/rocky243/Context Engineering/ultra-goal-skill` | 状态文档称"仍 b477722 且有大量未提交改动（含 ultra-goal→ultragoal 重命名）" | **HEAD `7210d3a8cb22731e0471380c5de8e0355f5cd5ed`，分支 `main`，仅 4 个未跟踪 `docs/research/*`** | 大量改动已落地为提交，见 §5-M2 |
| bridge 源 checkout `/private/var/folders/cm/.../ultra-zcode-acp-audit.XXXXXX.6ueNA86gp4` | base `42fe149…`，旧脏不动 | 目录仍在 | 在位 |
| bridge 隔离工作树 `/tmp/.../zcode-acp` | 分支 `codex/ubp-stage-b-zcode-locations` | HEAD `42fe149d4b501469343c01f23ba3801832306d53`，同分支，8 个脏项（`Cargo.lock/Cargo.toml/src/acp_translator.rs/src/agent.rs/src/zcode/mod.rs` 等） | 在位 |

agent-delegation 原 checkout 的两个新提交（`772929d` 是 `0a81753` 的祖先，`git merge-base --is-ancestor` 通过）：

```
28d3c2b docs: rewrite README for mission delegation
0a81753 Carry source requirements and terminal evidence across delegation
```

Goal 原 checkout 自 `b477722` 起的六个提交（`b477722` 是 `7210d3a` 的祖先）：

```
0fbe3cf refactor: make UltraGoal plugin-only
ea2dfb0 fix(contract): correct graph and review semantics
a5f6f17 fix(release): repair Windows hooks and publish 2.15.6
6cfdb82 feat: audit goal work and confirm collaboration scope
a2575a3 feat(contract): make goal convergence owner-visible
7210d3a Reuse upstream handoffs while preserving standalone goal execution
```

Goal 当前形态：版本 **2.16.0**（`.claude-plugin/marketplace.json` 与 `plugins/ultra-goal/.claude-plugin/plugin.json`），
仓库根已无 `skills/` 目录，改为 `plugins/ultra-goal/` 单插件布局。

---

## 4. 最新作者改动：已验收 vs 仍需独立复验

### 4.1 当前脏树的实际归属（已逐字节确认）

`work/owner-factory-implementation-20260905/stage-b-zcode-claude-repair-handover.zh-CN.md` 声明的 9 个源 SHA-256，
**与当前工作树逐一完全一致**：

| 文件 | SHA-256 | 对比 |
|---|---|---|
| `skills/ultra-delegate/scripts/host-profile.cjs` | `b85184c90a6ae56d6c3a90f84fe76971345c5649cacd22a859a2ebb76357ca5b` | 一致 |
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `f6fb6b8a8bf158522f29de157125cac4d45f58f86bdb7b5adbb9963d58bcf289` | 一致 |
| `skills/ultra-delegate/scripts/delegate.cjs` | `f15ec7a1255eb4e71a8c91e9f1d6d5deca2097484aef8272bbe30e75c419b50b` | 一致 |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `8e5fb511f0b5834d6e1fcef998a6d3e14d64f3c2ae3d0e74ee199fcceb839059` | 一致 |
| `skills/ultra-delegate/SKILL.md` | `c4857bf545102746abedc62ee9f19bcde7192c19adad1c1d731321e73007ee1e` | 一致 |
| `skills/ultra-delegate/references/delegation-contract.md` | `c6fc807d5d880a2a6ea555fbf78920618767d3a1e3d33ab775d8525ed8e94605` | 一致 |
| `docs/RUNTIME-COMPAT-MATRIX.md` | `9c19ace37b54a9f98694a66061e72db01948a46d7ba5f7c9d0587474712a1e72` | 一致 |
| `tests/acp-driver.test.cjs` | `a4cdff5e69c5c0ca1febd7afe14f6db58cbff9d26be07f3749317291fbadc039` | 一致 |
| `work/.../stage-b-d1q02-kit/run-d1q02-observation.cjs` | `55586266b571929e6b9187a95597992bbbb70b94da04dc5c09ec90c73ac1cfc6` | 一致 |

结论：**当前 UBP 脏树就是 ZCode Claude 路径修复回合的产物，此后没有任何作者继续改动它。**

### 4.2 该回合的真实终态（读 run receipt，非交接自述）

Receipt 目录 `/Users/rocky243/.local/state/agent-delegation/runs/20260906T002146Z-4c7065bddd2b45cf9d65e5e6b486f2b2`：

- `result.json`：`status = success`、`stop_reason = end_turn`、`terminal = true`、`exit_code = 0`、
  `duration_seconds = 1388.058`、`parsed_event_count = 2323`、`unparsed_event_count = 0`、
  `protocol_errors = []`、`rpc_errors = []`、`tool_errors = []`、`launch_error = null`、`target = zcode`。
- **`state.json` 仍停在 `status: "running"` / `terminal: false` / `worker_pid: 16637`**；`ps -p 16637` 无进程，
  `worker.lock` 为 0 字节。即：进程确已结束、结果确为 terminal，但**状态文件是过期的非终态记录**。
  这是需要在恢复时显式 disposition 的事实，本回合不修改它。
- 当前机器上仍活跃的 agent-delegation worker 只有步骤 2 作者 `729580a7e0bb4a4cabbffaac8f356eee`
  与本回合自身 `452722586ef14f6e91aac94fb765285e`，**没有任何 Stage B writer 在运行**。

### 4.3 已有独立审查（视为已产出结论，不重开）

按 mtime 排序的 Root 侧审查/验收产物（均在 `work/owner-factory-implementation-20260905/`）：

| 时间(2026-09-06) | 文档 | 性质 |
|---|---|---|
| 01:51 | `stage-b-goal-independent-source-review.zh-CN.md` | Goal 源码审查 |
| 01:57 | `stage-b-runtime-initial-source-review.zh-CN.md` | Runtime 初版 |
| 02:47 | `stage-b-bridge-independent-source-review.zh-CN.md` | bridge |
| 03:15 | `stage-b-entry-final-source-review.zh-CN.md` | entry 终版 |
| 03:57 / 04:48 | `stage-b-d1q02-kit-initial-source-review` / `stage-b-kit-final-source-review` | kit |
| 04:56 | `stage-b-goal-acceptance.zh-CN.md` | Goal 验收（对 2.15.4 布局） |
| 06:54 | `stage-b-host-substitution-plan-review.zh-CN.md` | Host 替换一致性 |
| 07:02 | `stage-b-entry-acceptance.zh-CN.md` | entry 验收 |
| 07:07 | `stage-b-r2-shell-kit-root-review.zh-CN.md` | r2 shell kit |
| 07:33 | `stage-b-protocol-version-root-review.zh-CN.md` | 协议版本轮（对应 verify:release 737 Node +104 Hook） |
| 07:48 | `stage-b-launch-binding-root-delta-review.zh-CN.md` | launch binding delta |
| 08:12 | `stage-b-claude-native-settings-root-review.zh-CN.md` | native settings 补查 |
| **08:21:46** | **`stage-b-claude-path-root-review.zh-CN.md`** | **最新的 Root 审查，结论 REQUEST_CHANGES** |
| **08:44:36** | **`stage-b-zcode-claude-repair-handover.zh-CN.md`** | **最新的作者产物** |

### 4.4 明确缺口：最新作者改动尚无任何独立复验

最新 Root 审查（08:21:46）针对的是 Claude 路径**初版**（ZCode `10f28c0195a64f44aed7bc5fd0776065`），
结论 REQUEST_CHANGES；它比修复交接**早 23 分钟**，`find -newer` 确认此后该目录再无新文件。因此：

**尚未独立复验的三项**（作者声称已修，Root 未验证）：

1. **P1 原生 settings schema**：`renderClaudeNativePermissionSettings()` 提升为生产合同，产出
   `permissions.defaultMode: "default"`（去掉顶层 `defaultMode`）+ `permissions.ask: ["*"]` + 顶层
   `disableAllHooks: true`；kit 改为复用生产函数。原审查依据是本机 adapter 0.75.1 `dist/acp-agent.js:5856`
   实读 `settings.permissions?.defaultMode`。
2. **P1 所哈希 native 路径与实际消费路径可分离**：`claudeAcpSelection()` 返回 `{command, args, installed}`；
   `selectExecutionDriver` 每次启动只解析一次 override/registry 并贯穿 command/argv/identityProbes/
   runtimeFilePath；`delegate.cjs` 用 `profile.delegateEnv(opts, {selection})` 构造 `spec.env`。
   需要验证的正是"普通 registry 更新只能维持原绑定或类型化拒绝，不能哈希 A 执行 B"。
3. **生产资格 consumer 缺口**：claude profile 声明
   `executionIdentityBindings: ['native_settings', 'claude_sdk_package']`，`requiredExecutionIdentity`
   额外要求 `qualified_identity.native_settings_sha256` 与 `qualified_identity.claude_sdk_package`
   （缺则 `missing_binding` 拒绝）。

作者自测数据（**未经 Root 复验，不得当作验收**）：RED 54 pass/4 fail → GREEN 十套件 **193/193、0 skip、0 fail**；
kit `--self-check` PASS；kit `--profile fixture-smoke` 两阶段真跑三拒绝维度均 attempt-and-rejection；
kit `--profile claude --prepare-only` 离线绑定成功，新增
`claude_native_settings_sha256 = db62bc6ad00fea5f…`、`claude_sdk_package = @anthropic-ai/claude-agent-sdk@0.3.257:f92d513a…`。
该 prepared attempt **从未 dispatch，不是资格 attempt**。

**同时过期**：`npm run verify:release`（脚本实为 `npm run test:all && npm audit --omit=dev --audit-level=high`）
最后一次绿是 07:33 协议版本轮的 737 Node + 104 Hook / audit 0；此后 9 个文件已改，全量门当前状态未知。

### 4.5 已解决、不必再作为未决项

- 状态文档记录的"独立旧双文件检查 104pass/**1fail**，唯一失败是已拒绝 r2 patch 与 r1 profile SHA 暂不一致"：
  当前 `skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch` 实测 SHA-256
  `8c127dba648720121da9326cae721141785f03ef72bdfae2201f50e59bb9cb36`，与 `host-profile.cjs:28` 的绑定值
  **完全一致**。该不一致已随 ZCode 恢复 exact r1 patch 消除。

### 4.6 未被本回合触碰、继续保留的失败事实

r1 `d1q02-r1-20260905t220538-5d954643` 的 native Bash ls 无 permission 却完成（D1Q-02 失败）、两份不可变负向
receipt、被拒绝的 ZCode r2 无条件删 Bash 修复（源保留在 `work/.../evidence/stage-b-r2-rejected-source/`）、
Kimi 0.41.0 + public SDK 0.13.2 静态不可表达合法 Write 的前查结论、Root 证据归档 inventory 缺失、
review-wait 一个 `status:null` 根因未确认——全部原样保留，本文不改判其中任何一项。
任何 Host/Profile 目前均**未** qualified。

---

## 5. 当前不确定性（按决策关键度排序）

### M1（事实错配，中）agent-delegation 原 checkout 已前进 2 个提交

状态文档 line 54 称"agent-delegation 原 checkout 仍 772929d 且 clean"，实际为 `0a81753`（main，clean）。
`772929d` 是其祖先，无冲突风险，但 Stage B 已复验的 installer 0.4.0 整合（70/70）是对 `772929d` 做的。
恢复时须重核 `28d3c2b`/`0a81753` 是否触及 installer/委派表面，再决定是否重跑该 70 项。
本回合未读这两个提交的 diff（超出只读前查的必要范围，且属 Root 判断）。

### M2（事实错配，高）Goal 隔离工作树与其分支已不存在

状态文档 line 54 称"Goal 基于独立 2.15.4/b477722……隔离工作树保留已审查版本，待该独立提交后再适配"。
实际：`/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill` 目录不在，`codex/ubp-stage-b-goal-graph` 分支
在 `ultra-goal-skill` 中不存在（worktree 登记、branch、reflog、stash 四处均无）。
同时上游 main 已推进 6 个提交至 `7210d3a`、版本 2.16.0、`0fbe3cf refactor: make UltraGoal plugin-only`
把 `skills/` 目录整体移除。

后果：`stage-b-goal-acceptance.zh-CN.md`（04:56）所验收的"Kimi 八路径修改 + 447 检查（446 pass/1 Windows-only skip）"
是对 2.15.4 `skills/ultra-goal` 布局做的，**该布局在上游已不存在**，且被审查的那份字节目前没有可定位的副本。
这不影响 UBP 仓内的 D1Q-02R2 资格路径（Goal 是独立仓），但直接影响"Stage B 整体验收"能否把 Goal 部分算作有效交付。

**这是本前查发现的第一个决策关键错配，按任务约定在此停下，不自行修复、不重建工作树。**

### Q1（未决源问题，高）native Claude 候选版本与当前默认解析不一致

`.ultra/decisions/2026-09-06-stage-b-selected-host-delta.md:21` 冻结的候选是
"managed adapter 0.75.1 / native SDK 0.3.257 / **Claude native 2.1.261**"，并给出
`native 为 /Users/rocky243/.local/bin/claude，realpath /Users/rocky243/.local/share/claude/versions/2.1.261`。
当前该 symlink 指向 **2.1.266**。2.1.261 目录仍在本机。

D1Q-02R2 要求"同强度、精确版本"的具名 prepare（context:84–88、193–197 要求绑定 exact 版本/hash/config/entry/SDK）。
两条路互斥，需要 Root（必要时 Owner）明确选一条：

- **A（推荐）**：显式把候选 pin 在已冻结的 `…/versions/2.1.261`，走 `CLAUDE_CODE_EXECUTABLE`/override 路由，
  不依赖 `.local/bin/claude` 的当前解析。优点：决策文档字节、既有前查与 adapter/SDK 组合全部保持有效，
  无需新的一致性审查。代价：资格结论只覆盖 2.1.261，日常用户实际跑的是 2.1.266，须在 compat matrix 如实注明。
- **B**：把候选重新冻结到 2.1.266，写一条新的候选记录（含前一记录 SHA），重跑 adapter 0.75.1 与
  2.1.266 的 native settings/permission 前查。优点：资格结论与用户实际路径一致。
  代价：`stage-b-claude-native-settings-root-review.zh-CN.md`（针对 2.1.261 的官方 permissions 行为前查）
  需要重新确认是否仍成立，多一轮只读前查。

**最便宜的判别检查**：对比 `…/versions/2.1.261` 与 `…/versions/2.1.266` 中 permission/settings 相关代码是否有差异；
无差异则 A 与 B 的观察强度等价，直接选 A；有差异则必须选 B 或在 A 中明确记录版本局限。
本回合未做该对比（属实现前查，不在本次只读边界内）。

### Q2（记录问题，低）修复回合 run 状态文件停在非终态

`…/runs/20260906T002146Z-4c7065bddd2b45cf9d65e5e6b486f2b2/state.json` 为 `running`/`terminal:false`，
而 `result.json` 为 `success`/`end_turn`/`terminal:true`/exit 0，pid 16637 已不存在。
恢复时按 result.json 认定终态并显式记录该 disposition；不要因状态文件而认为仍有 writer 在跑，
也不要据此重启该 writer。

---

## 6. 有界的下一步动作

前置：步骤 1–4 全部验收之前，**不得**执行任何 D1Q-02R2 的 prepare/dispatch/资格调用。以下只是"恢复 Stage B
复验"的第一个窄动作，由 Root 在拿到 §5 的裁决后执行。

**第一动作（唯一推荐）：先裁决 M2 与 Q1，再跑窄复验。** M2 决定 Stage B 的 Goal 部分算不算数，
Q1 决定资格要绑哪个 native 版本；两者都不需要跑任何命令，只需要 Root/Owner 的一次判断。

裁决后，对 §4.4 三项未复验改动的独立窄验证，使用**已存在**的非破坏性命令（全部已确认文件存在）：

```bash
cd "/Users/rocky243/Context Engineering/ultra-builder-pro-cli"
export UBP_TEST_ACPX_ENTRY=/tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs
node --test tests/acp-driver.test.cjs tests/acpx-entry.test.cjs tests/delegate.test.cjs \
  tests/skill-authoring.test.cjs tests/route-contract.test.cjs tests/package-smoke.test.cjs \
  tests/v026-adapters.test.cjs tests/acp-conformance.test.cjs tests/install.test.cjs \
  tests/ultra-5-journeys.test.cjs
node work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs \
  --self-check --output /tmp/d1q02-selfcheck-observation.json
```

跑前先确认 `UBP_TEST_ACPX_ENTRY` 指向的文件仍是 `f734ed38…`（本回合已确认在位）。
这两条只重现作者自测的 193/193 与 kit self-check，**不构成源码审查**——三项 P1 的判据（尤其 P1-2 的
"registry 更新只能维持原绑定或类型化拒绝"）仍需 Root 读源码判定，绿测试不替代。

窄复验通过后才轮到全量门 `npm run verify:release` / `npm pack --dry-run --json` / `git diff --check`，
再进入 Task2 strictReview → v2/readback → aggregate disposition（三个旧 aggregate P1 仍未 disposition）→
Test/Deliver 真实 consumer → Root 提交 Stage B。**这些都在步骤 1–4 验收之后。**

---

## 7. 本回合明确未做（not-done）

- 未读步骤 2 的独立 checkout、未读新日常评测 spec/fixtures 及其预留材料（任务明令排除）。
- 未读 `28d3c2b`/`0a81753` 与 Goal 六个提交的具体 diff；只确认了祖先关系、提交标题与当前布局/版本。
- 未对比 native 2.1.261 与 2.1.266 的 permission/settings 实现差异（Q1 的判别检查）。
- 未运行 §6 任何命令，未运行任何测试、门禁、doctor、pack。
- 未修改 `state.json`、registry、runtime、config、任何产品源码或测试。
- 未创建/删除/修复任何工作树，未尝试找回 Goal 的 `codex/ubp-stage-b-goal-graph`。
- 未更新 `docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md`——§5 的 M1/M2 应由 Root
  在裁决后写回该文档，本文只作为证据来源。
- 未再委派。
