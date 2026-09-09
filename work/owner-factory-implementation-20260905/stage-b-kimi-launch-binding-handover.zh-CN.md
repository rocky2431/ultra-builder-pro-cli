# Stage B 准入到启动共享绑定修复交接（实际 Kimi）

时间：2026-09-06。HEAD：`b765b55cca0e1eaacebc738a68de77906bb50756`（含 Stage B 未提交工作树；本轮回合在其上叠加）。权威：`.ultra/decisions/2026-09-05-owner-factory-implementation.md`；范围与 selected-Host delta：2026-09-06 两条决定。任务书：`work/owner-factory-implementation-20260905/stage-b-kimi-launch-binding-mission.md`。本文只覆盖任务书指定的三个缺口加派前确认的 `resolveAcpxPackage` realpath 缺口；bridge/canonical patch/kit/Goal 归实际 ZCode，未动。

**未做的事**：未提交、未推送、未安装/升级任何 runtime、未跑真实资格或 Provider 调用、未把任何 negative 记录转正、未填任何推测哈希、未改 `.ultra` 权威/证据/状态、未动 bridge/patch/kit/Goal/关联仓库源码、未写真实 HOME（registry 测试全部用隔离 `home` fixture）。未声明 Stage B 完成；Root 独立复核并跑最终门。

前置复核：前 Kimi 准入 writer（17b86b5a）的交接 `stage-b-kimi-admission-handover.zh-CN.md` 已读，其真实改动（`delegate.cjs` fallback 准入支配、`host-profile.cjs` 纯函数绑定、选择/启动双层哈希缝、9 个准入测试）全部保留复用；installer schema 实读自 `/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/scripts/install_user.py:392`（`acpx_delegate_entry` = 所选 runtime generation 旁 entry 的绝对 resolved 路径；`config/registry.example.json` 无此键 = 旧安装无绑定）。任务书预告的 `stage-b-admission-root-source-review.zh-CN.md` 派前尚未落盘，本轮以任务书确认事实为准。

## 缺口 1：`resolveAcpEntry` 消费公开 registry 键

`agent-execution-driver.cjs`（`registryAcpEntry` 新增 + `resolveAcpEntry` 改写）：解析顺序为

1. 显式 `ULTRA_DELEGATE_ACPX_ENTRY` 覆盖：绝对且现存常规文件才采用；相对/缺失/非文件 → `null`（原 fail-closed 语义不变，且不再落到其他来源）。
2. registry `<home>/.config/agent-delegation/config.json` 的 `acpx_delegate_entry`：有绑定时为权威——绝对且现存常规文件 → 采用；相对/缺失/目录/非字符串 → `null`（安装器实际做过的选择坏了，绝不静默替换别的 runtime，不回落 legacy）。
3. 无绑定（文件缺失/不可读/非 JSON object/无此键或为 null）→ 合法 legacy 回落 `<home>/.local/share/agent-delegation/runtime/acpx_delegate_entry.cjs`（pre-registry 旧安装）；都没有 → `null`。

签名 `(env, {platform, home, exists})` 不变；kit 的 `resolveAcpEntry(process.env)` 调用兼容。回归用隔离 `home` fixture（`registryHome`），不写真实 HOME。

## 缺口 2：启动绑定实际 runtime 身份

- 选择缝（`selectExecutionDriver`）：`requiredExecutionIdentity(profile)` 提前计算；仅当有字符串匹配的留存资格时，`boundRuntimePath = identityFilePath(cliCommand, env)` 先解析，候选 argv 与身份探针全部改用该已解析路径构造（`candidateCliCommand`）——裸命令/相对拼写不会在选择与分离式启动之间解析到不同字节。`executionIdentity` 在四类内容摘要之外保留 `adapter_path` / `runtime_path` 两个本次启动级绝对路径（持久记录仍不含路径，路径不可移植；worker spec 本来就是启动级数据，与既有 `acp_entry {path, sha256}` 一致）。
- 启动缝（`acp-driver.cjs`）：spec 带 `execution_identity` 时，`agentCommand` 直接用绑定的 `adapter_path`（不再对 worker 的 PATH/cwd 重新解析 `spec.command`），`launchExecutionIdentityDrift(bound, {adapterPath, runtimePath, entryPath})` 在绑定路径上复核**全部**合格组件——adapter、runtime、entry、SDK package；绑定缺 `adapter_path`/`runtime_path` 视为畸形绑定（`execution_identity` 分量）fail closed。任何漂移仍在 `markWriterLaunching` 之前以 typed `acp_execution_identity_mismatch` 拒绝，无 Host/Worker 效果。无绑定的旧式手工 spec 维持 `resolveAcpEntry()` + `executablePath(spec.command, hostEnv)` 回退（既有测试/外部直接驱动缝不变）。
- 诚实范围：entry 文件 + SDK name/version/package.json 身份 + adapter/runtime 文件字节；不是全 node_modules 证明，不是抗恶意 OS 的逐系统调用 TOCTOU 防护。哈希到 spawn 之间仍有普通文件替换窗口——这是内容复核边界，不是内核级锁定。

## 缺口 3：共享 launcher 边界一次性强制必需绑定

- `delegate.cjs`：紧跟选中 transport 的 admission 闸门之后、fence/spec/worker 之前——driver 为 `acp` 时必须带合法 `acpEntry`（绝对路径 + 64hex 摘要），否则抛出「no launch-bound public ACPX entry」；`requiredExecutionIdentity(profile)` 非空时必须带 `executionIdentity`，否则抛出「verified execution identity」。两者都在任何 Host 效果之前失败。worker spec 的 `acp_entry` 由此变为保证存在（条件展开改为直接绑定；`execution_identity` 仍在有记录绑定时才存在）。旧 zcode 注入 chooser 测试（无 `acpEntry`）仍先被 admission 的 version_mismatch typed 拒绝，断言不变。
- `acp-conformance.cjs`：bootstrap chooser 现在用 `resolveAcpEntry(env)` + 内容摘要绑定 `acpEntry`（无记录 profile 不需要 `executionIdentity`，显式无记录 bootstrap 保持有效）。entry 不可解析时 chooser 不带绑定，launcher 的 typed 拒绝快速触发。未来带指纹转正记录的 profile 若经此 override 路径运行，将因缺 `executionIdentity` 在 launcher 被拒——command/args override 绕过绑定的实际通道被关闭，且未新建第二个执行引擎。
- 调用方全量追踪：`delegate.cjs`（默认 `selectExecutionDriver`）、`acp-conformance.cjs`（override chooser，已修）、`tests/delegate.test.cjs:1006` 注入 chooser（经 admission 先拒，不变）、`adapters/_shared/plugin-core.cjs`（只读 inspect，不启动，不变）、worker `runExecutionDriver`（消费 digest 绑定 spec，不变）。

## 派前确认缺口：`resolveAcpxPackage` 与 Node 一致的 SDK 解析

`agent-execution-driver.cjs`：先 `fs.realpathSync(entryFile)`（主模块无 `--preserve-symlinks-main`，符号链接 entry 解析到真实路径），再 `require.resolve('acpx/package.json', {paths: [dirname(realEntry)]})`（从 entry 真实目录向上走 node_modules 层级，与 entry 运行时 `require('acpx/runtime')` 同一算法），最后对解析到的 package.json 再 realpath 并哈希。任何一步失败 → `null`（unobserved，调用方 fail closed）。当前普通文件 entry 无观察到的错配；符号链接 entry 不再误绑 symlink 旁的兄弟 SDK。公共 entry 源 f734 与 SDK 0.13.2 未动。

## 测试与实测输出

新增 12 个回归（全部复用既有 fake fixture/隔离 home 缝；live negative profile 未被断为正向），并扩展 2 个既有断言（gated spec 的 `adapter_path`/`runtime_path`；launch 复验三 fixture 补路径字段）：

- `tests/acp-driver.test.cjs`：`byte-bound selection builds the candidate argv over the resolved runtime path`（裸命令经 PATH 解析一次，argv 携带绝对路径）；`byte-bound selection resolves a relative runtime command once, at selection`；`entry resolver consumes the managed registry binding before the legacy location`（registry 优先、无键/坏 JSON/无文件回落 legacy、全无 → null）；`explicit entry override keeps priority and fails closed over the registry`；`broken registry binding fails closed instead of substituting another runtime`（相对/缺失/目录/非字符串绑定 → null，不回落）；`SDK package resolution follows the entry realpath like Node does`（symlink entry 绑真实旁包）；`SDK package resolution walks up node_modules exactly like the entry require`；`ordinary runtime update between selection and the detached launch refuses`（runtime 漂移 → `acp_execution_identity_mismatch` /runtime/，无 events，not_started 保持）；`launch consumes the selection-bound adapter path instead of re-resolving`（`spec.command` 故意不可解析仍随绑定路径启动成功）；`bound execution identity without the resolved paths fails closed`。
- `tests/delegate.test.cjs`：`launcher refuses an ACP selection that carries no launch-bound public entry`（无 fence/spec/lock/任何 artifact）；`launcher refuses an ACP selection without the execution identity a string-matching qualification binds`（带 `acpEntry` 缺 `executionIdentity` 的 override chooser 被拒）。

原始日志（`.ultra/.runtime/owner-factory-implementation-20260905/`；最终源码 SHA-256 与运行索引见同目录 `stage-b-launch-binding-hashes.json`）：

| 运行 | 命令 | 结果 | 日志 |
|---|---|---|---|
| RED（实现前） | `node --test --test-name-pattern "registry binding\|entry override\|broken registry\|SDK package resolution\|byte-bound selection\|ordinary runtime update\|selection-bound adapter path\|without the resolved paths\|launcher refuses\|ACP-only positive qualification" tests/acp-driver.test.cjs tests/delegate.test.cjs` | exit 1；13 测 1 过 12 败（唯一过的是设计上前后皆绿的显式覆盖优先级用例） | `stage-b-launch-binding-red.log` |
| 聚焦对（无 entry env） | `node --test tests/acp-driver.test.cjs tests/delegate.test.cjs` | exit 0；118 测 117 过 0 败 1 跳过（跳过为 `UBP_TEST_ACPX_ENTRY` 条件守卫） | `stage-b-launch-binding-focused.log` |
| 聚焦对（真实 entry） | `UBP_TEST_ACPX_ENTRY=/tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs node --test tests/acp-driver.test.cjs tests/delegate.test.cjs` | exit 0；118 测全过 0 跳过 | `stage-b-launch-binding-focused-final.log` |
| 四套件（真实 entry） | 同上 env + `tests/acp-conformance.test.cjs tests/acpx-entry.test.cjs` | exit 0；126 测全过 0 跳过（真实公共 entry 的 4 个条件守卫测试实际运行） | `stage-b-launch-binding-real-entry.log` |
| 邻近套件 | 同上 env + `tests/install.test.cjs tests/ultra-5-journeys.test.cjs tests/v026-adapters.test.cjs tests/v026-contract.test.cjs` | exit 0；133 测全过 | `stage-b-launch-binding-adjacent.log` |
| 全量 node | 同上 env，`node --test adapters/_shared/tests/*.test.cjs tests/*.test.cjs` | 758 测 757 过 0 跳过；**1 败为预先存在的 `.ultra` 工作流状态断言**：`tests/project-artifacts.test.cjs:1188` 要求在飞任务 context 带 `## Task Review` 体，而 `.ultra/contexts/task-vnext-d1-host-enforcement-qualification.md` 是 Root 工作流中途状态（本轮及本测试文件均未触碰；不在我可写范围） | `stage-b-launch-binding-full-node.log` |
| hooks | `pytest hooks/tests -q` | 104 全过 | `stage-b-launch-binding-hooks.log` |

`git diff --check` 干净；所有改动文件 `node --check` 通过。任务书预告的「双文件套件 104 过 1 败（canonical r2 patch 哈希错配）」本轮未复现：当前 patch 文件内容 SHA-256 实测 `8c127dba648720121da9326cae721141785f03ef72bdfae2201f50e59bb9cb36`，与 r1 断言一致（ZCode 已退回 exact r1），故聚焦对 0 败；未为掩盖该错配改动任何哈希断言。既有 negative ZCode 记录、两份 receipt、kit 观察脚本全部未动。

## 改动路径与最终 SHA-256

| 路径 | SHA-256 |
|---|---|
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `8fb7c0d4e224e9ae69b37199adbcb679777eeb1553d64b21d4f24d6e03cc35c1` |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `06e29390d372fe9a8c6f2a81cedc218f98da7a3e9a908dda56e8e76452bc56f9` |
| `skills/ultra-delegate/scripts/delegate.cjs` | `ec3028a82e73c566c021e9656d7a385ee1b3e2e3345d6a76a5e1c879b78ea9cc` |
| `skills/ultra-delegate/scripts/acp-conformance.cjs` | `c6c280135eede3dbb79dde724776f5e71a8d5c807c5901bbf47a054c2519be60` |
| `skills/ultra-delegate/SKILL.md` | `98d76065220a278bbee46f71d45bec7f56352bca11dc2b66fa6080bb4ea5b1ea` |
| `skills/ultra-delegate/references/delegation-contract.md` | `1523caa44e86451ed96d1c30ec758aa11da7d2561e81be0cd59bee7f84aa111a` |
| `tests/acp-driver.test.cjs` | `a1b3548258189f465652f4d2165a4b3b5a425d0520e3ac20219cc09b30efec0f` |
| `tests/delegate.test.cjs` | `b11c79164163935f3eb93e0cf16147a1b1cc2b8be18c053f6a864493cd2c364c` |

`host-profile.cjs`、`delegate-worker.cjs`、bridge/patch/kit/Goal/关联仓库：本轮未动。文档只同步实际改变的行为（entry 解析顺序、路径绑定与启动复核、launcher 必需绑定强制、conformance bootstrap 边界），无任何转正声明。

## 残留限制

- 绑定的是内容身份 + 本次启动级路径，不是全 `node_modules`  attest；启动哈希与 spawn 之间存在普通文件替换窗口（非恶意 OS 逐系统调用防护，与任务书范围一致）。
- `execution_identity` 缺路径字段的旧式 spec 现在 fail closed（畸形绑定）；仅有内容摘要的历史 spec 不再可启动——该类 spec 只存在于本轮之前的测试 fixture，已全部同步更新。
- 字符串不匹配的记录在选择层仍不做哈希（该路由由纯准入层以 `version_mismatch` 拒绝）；刻意保留的既有语义。
- 无记录 Host 的旧行为与 conformance 的显式无记录 bootstrap 保持有效；未来指纹转正后的 profile 不能再经 conformance `--command/--args-json` override 运行（launcher fail closed），其资格观察需走产品选择缝或新的具名 bootstrap。
- 全量套件那 1 个 `.ultra` 工作流状态失败由 Root 在 Stage B 闭合流程中处理；Stage B 是否接受由 Root 独立复核与最终集成门决定，本轮不作任何完成声明。
