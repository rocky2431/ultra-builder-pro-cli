# Stage B 资格准入消费者修复交接（实际 Kimi）

时间：2026-09-06。HEAD：`b765b55cca0e1eaacebc738a68de77906bb50756`（含 Stage B 未提交工作树）。权威：`.ultra/decisions/2026-09-05-owner-factory-implementation.md`。本文只覆盖任务书指定的两个 UBP 消费者缺口；bridge/canonical patch/资格 kit 归实际 ZCode，未动。

**未做的事**：未提交、未推送、未安装、未跑真实资格/Provider 调用、未把当前 negative 资格转正、未改 `.ultra` 权威/状态/receipt。两份 receipt 字节不变（已复核 SHA：`936c7794…de01`、`04c53544…6846e`）。未跑全量 release（ZCode 正在改 bridge/patch/kit；最终集成门由 Root 跑）。

## 缺口 1：认证回退现在由目标 transport 准入支配

- `delegate.cjs:1010-1024`：`cli_fallback` 不再仅凭初选 ACP + `delegateArgv` 构造；复用 launcher 既有 precheck 已算出的同一 Packet required dimensions 的 CLI `enforcementAdmission` 决定，仅当 CLI transport 本身 `admitted` 才绑定进 worker spec。ACP-only 正向记录不再绑定 fallback：`acp_auth_required` typed failure 独立保留，无 CLI 进程/标记。无记录 Host 的 `gate:null` 旧行为与 CLI 已资格的回退不变。
- `agent-execution-driver.cjs` 的既有 fallback 执行段（原 663-723）不改，继续消费 launcher 已限定的 spec：spec 无 `cli_fallback` 即无第二次启动。

## 缺口 2：真实执行身份接入资格

- `host-profile.cjs:183-272`：新增纯函数 `requiredExecutionIdentity(profile)` 与 `executionIdentityDrift(required, observed)`（及 `EXECUTION_IDENTITY_FILE_FIELDS`）。仅当 retained `qualified_identity` 的两个声明字符串与 profile 声明的 `candidateIdentity` 精确相等时，才要求指纹绑定；字符串不等返回 null（纯准入层照旧以 `version_mismatch` 拒绝，任何文件哈希都不会发生）。绑定字段：`adapter_sha256` / `runtime_sha256` / `acpx_entry_sha256` / `acpx_package{name,version,package_json_sha256}`，与 kit receipt bindings 的 `real_bridge_sha256` / `bundled_cli_sha256` / `acpx_entry_sha256` / `acpx_package` 一一映射；不含任何绝对路径。
- `agent-execution-driver.cjs:140-211`：新增 `fileSha256` / `identityFilePath` / `resolveAcpxPackage`（镜像 kit 的 `dirname(entry)/node_modules/acpx/package.json` 解析）/ `observeExecutionIdentity` / `launchExecutionIdentityDrift`，全部 stdlib。
- 选择缝（同文件 691-749）：`selectExecutionDriver` 在既有 `--version` 身份探针通过后，(a) 把 `resolveAcpEntry` 实际解析的 entry 以 `{path, sha256}` 绑定进选择结果（所有 ACP 选择，含无记录 Host；entry 不可读即 typed `acp_entry_unavailable`）；(b) 指纹被要求时，对**实际文件**计算四类摘要并与记录比较——缺绑定/不可读 → `acp_candidate_identity_unavailable`，字节漂移 → `acp_candidate_identity_mismatch`，`candidate_identity_reason` 携带组件名。无记录 Host 与字符串不匹配的记录完全不触发哈希（既有断言保持）。
- `delegate.cjs:1070-1079`：worker spec 摘要绑定 `acp_entry` 与（已核验时的）`execution_identity`。
- `acp-driver.cjs:391-449`：launch 消费 spec 绑定的 entry——用内容哈希复核，**不再重新解析**另一个 entry；spec 带 `execution_identity` 时复核本 driver 直接交给 OS 的组件（adapter 可执行文件、entry 字节、entry 旁加载的 SDK package name/version/package.json SHA）。任何漂移在 `markWriterLaunching` 之前以 typed `acp_execution_identity_mismatch` 拒绝，无 Host/Worker 效果。无绑定的旧式 spec 维持原 `resolveAcpEntry()` 行为。

诚实范围：entry 文件 + SDK name/version/package.json 身份；不是全 node_modules 证明，不是抗恶意 OS 的逐系统调用 TOCTOU 防护。native runtime 的 launch 复核不在内（runtime 以 adapter argv 由 entry 消费，argv 解析属 brand 策略）；其指纹为准入时核验。公共 ACPX 消费者与已接受的 protocolVersion 行为未动。

## 测试与实测输出

新增 9 个回归（全部复用既有 fake fixture/探针缝；live negative profile 未被断为正向）：

- `tests/delegate.test.cjs`：`an ACP-only positive qualification binds no CLI fallback…`（ACP 五维 supported、CLI 未列：无 CLI marker、无 `cli_fallback`、保留 typed `acp_auth_required`）；`a CLI-admitted qualification keeps the bounded pre-session auth fallback`（CLI 同记录资格时回退照常）。既有 559 行 legacy 无记录回退测试原样通过。
- `tests/acp-driver.test.cjs`：选择层正向绑定核验；同版本不同字节的 entry/adapter/runtime/SDK package 逐一 fail closed；缺/半缺指纹绑定 fail closed；字符串不匹配的记录不触发哈希；launch 层复用绑定 entry（resolver 被指向不存在路径仍成功）；绑定 entry 漂移/adapter 漂移/SDK package 漂移均在 launch 前拒绝（`not_started` 保持、无 events）。

原始日志（`.ultra/.runtime/owner-factory-implementation-20260905/`）：

| 运行 | 命令 | 结果 | 日志 |
|---|---|---|---|
| RED（实现前） | `node --test --test-name-pattern "…" tests/delegate.test.cjs tests/acp-driver.test.cjs` | exit 1；9 测 1 过 8 败（唯一过的是设计上前后皆绿的 CLI 已资格回退保持用例） | `stage-b-admission-repair-red.log` |
| 聚焦门（实现后） | `node --test tests/delegate.test.cjs tests/acp-driver.test.cjs` | exit 0；106 测 105 过 0 败 1 跳过（基线为 96 过 1 跳过） | `stage-b-admission-repair-focused.log` |
| 相邻面 | `node --test tests/acp-conformance.test.cjs tests/acpx-entry.test.cjs tests/v026-contract.test.cjs` | exit 0；108 测 105 过 0 败 3 跳过（3 个跳过为 acpx-entry 既有 `UBP_TEST_ACPX_ENTRY` 条件守卫） | `stage-b-admission-repair-collateral.log` |
| Stage B 触及的邻近套件 | `node --test tests/install.test.cjs tests/ultra-5-journeys.test.cjs tests/v026-adapters.test.cjs` | exit 0；33 测全过 | `stage-b-admission-repair-adjacent.log` |

`git diff --check` 干净。最终源码 SHA-256 与运行汇总：`.ultra/.runtime/owner-factory-implementation-20260905/stage-b-admission-repair-hashes.json`。

文档同步（机制描述，不含任何转正声明，既有 negative 表述与 v026 契约断言全部保持）：`skills/ultra-delegate/SKILL.md`（准入段新增观察身份绑定段；认证回退句补 CLI 准入条件）与 `references/delegation-contract.md`（Host enforcement admission 段 + Recovery 的 `acp_auth_required` 条目）。

## 转正时还缺的最终数据消费者

本轮未收到修复后 bridge 的最终身份，故 live 记录/marker 原样保留。后续真实正向 receipt 落地后，`host-profile.cjs` 的 zcode 记录 `qualified_identity` 需在保留两字符串的同时填入四个指纹字段（`adapter_sha256` ← receipt `bindings.real_bridge_sha256`，`runtime_sha256` ← `bundled_cli_sha256`，`acpx_entry_sha256` ← `acpx_entry_sha256`，`acpx_package{name,version,package_json_sha256}` ← `acpx_package` 去路径化），CLI transport 仍不列入 `transports`；随后按前查 §3 更新公共/spec 状态面并跑完整门。若 receipt 字段更名，消费者字段需同步更名以保持一一映射。

## 残留限制

- launch 层不复核 native runtime 文件（见上）；entry 加载 SDK 的 package.json 身份不证明 node_modules 其余字节。
- 字符串不匹配的记录在选择层不做哈希（该路由由纯准入层以 `version_mismatch` 拒绝）；这是保留既有语义的刻意设计。
- 旧式手工 spec（无 `acp_entry` 绑定）维持 resolver 回退路径，供既有测试/外部直接驱动使用。
- Task 1 三项 P2 未触碰；Stage B 是否接受由 Root 复核与最终集成门决定。
