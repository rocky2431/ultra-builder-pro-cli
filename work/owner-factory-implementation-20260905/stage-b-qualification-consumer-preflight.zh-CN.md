# Stage B 资格消费者前查

只读源码观察时间：2026-09-05T22:19:17Z；HEAD：`b765b55cca0e1eaacebc738a68de77906bb50756`，包含当前 Stage B 工作树。本文是交给实际作者的条件清单，不是 Task 2 Review 或实施记录。Task 1 已完成；其三项 P2 不重开。

**当前 attempt 不得转正。** Root 在本前查期间报告 `d1q02-r1-20260905t220538-5d954643` 于 135.809 秒正常结束：指定允许 Write 以及 outside Write / Shell printf / WebFetch 三项拒绝均实际观察，但另有 events sequence 8 的 execute 在 sequence 9 变为 completed，期间没有 permission。Root 只读提取 native rollout `/Users/rocky243/.zcode/cli/rollout/model-io-sess_0e646b49-a1ca-4afa-9453-2baf46d5cc9d.jsonl` 的 `response.toolCalls` 后，确定第 2 行的 Bash `rtk ls tests/fixtures` 被拒绝，第 3 行的 Bash `ls tests/fixtures` 未询问便完成；模型为 GLM-5.2。这是 Root 的真实执行及定位反馈，本文没有另跑资格或读取整份 native transcript。shell / point-of-use 全边界因此未成立，旧 negative 和本次真实 raw 均须保留。

以下所有“正向观察成立后”均只适用于实际作者修复该 native 自动通过 Shell 缺口、Root 后续具名真实验证成立的情况；不表示当前 attempt 可以标 pass，也不授权自动重试。

**不能只把五项维度改成 supported。** 若后续具名真实资格全部成立，仍须接好两个实际消费者：未资格 CLI 的认证回退，以及普通委派路径上的精确 adapter/runtime/entry 身份核对。前者是源码已展示的条件可达路径；后者目前只有资格 kit 做到了字节绑定，普通 admission 没有消费这些字节身份。本文没有创建或执行探针来复现它们。

## 1. 新资格记录的最小字段

当前权威代码行是 [host-profile.cjs:182](../../skills/ultra-delegate/scripts/host-profile.cjs#L182) 的 `HOST_ENFORCEMENT_QUALIFICATION.zcode`。下列值必须取自 Root 冻结的新真实 receipt，不能由作者从期望结果填充。

| 当前字段/位置 | 正向观察成立后的最小更新 | 不能顺带改变的内容 |
|---|---|---|
| `attempt_id`、`observed_at`、`evidence`、`receipt_sha256`，host-profile.cjs:185–188 | 后续成功 attempt id、真实观测时间、独立新 receipt 路径及精确原始字节 SHA-256。现有 inventory 的 `host-enforcement-receipt-stage-b-r1.json` 属于本次失败记录；后续正向须另取具名文件并纳入 inventory | 不覆盖最初 `host-enforcement-receipt.json`、本次失败 receipt/raw 或任一原 attempt；不把准备时间当完成时间 |
| `qualified_identity`，192–195 | 使用后续实际受测身份；本次失败组合是 `zcode-acp 0.1.0+ultra.zcode.0.16.5.r1` / `0.16.5`。若修复改变 binary/patch/argv，必须重新绑定，不能复制当前字符串冒充新观察；下文列出尚缺的字节身份消费者 | 原无后缀 marker 仍是旧负例，本次失败 r1 也不能凭三项指定拒绝翻成正向 |
| `transports['acp-stdio'].dimensions.writable_scope`，224–228 | 只有确实发生了被授权的 in-root 写入，路径、内容、Git delta 与许可一致，才同时设 `observation` / `admission` 为 `supported`；`basis` 指向本次事实 | 一个 allow 决定或 Agent 的“已写入”文本不是文件写入证据 |
| `outside_root_denial` / `shell_tool_denial` / `agent_tool_network_denial`，229–243 | 每项分别有对应原生请求、实际 rejection 和无相应效果的前后观察，才同时设两值为 `supported`；逐项填写 basis | marker 不存在、sink 零命中、总权限数、一个笼统拒绝都不能代替独立 attempt-and-denial |
| `point_of_use_effect_boundary`，244–248 | Root 综合本次各项请求在效果发生前确实被拒绝的证据后填写；kit 没有替 Root 生成该复合裁决 | 不能因为其余三项字段被填成 supported 而自动宣布通过 |
| `adapter_preinstallation` / `env_key_isolation` / `credential_value_redaction` / `receipt_truth`，205–223 | 即使状态保持 supported，也须将 basis 中旧 `371` 扫描数、旧零 changed files 等改为本次真实范围和结果 | 不照搬旧跑次数字；不扩大到 HOME 文件凭据隔离或通用脱敏 |
| `provider_transport_admission`，198 | 保持 `separately_authorized_only`；provider 事实留在独立字段，不进入 Packet 五维 | Provider 网络不是 Worker Web/shell/业务效果授权 |
| `disposition`，252–257 | 若仅 ACP 五维成立，更新为与新 receipt 一致的 ACP 条件准入 route/reason；保持 `silent_fallback:false`、`maturity_change:false` | `disposition.route` 本身不是执行 gate；实际 gate 只看 identity 与 required dimensions |

**CLI 仍不列入 `transports`。** `requiredPacketEnforcementDimensions` 在 host-profile.cjs:168–179 要求写 Packet 五项、只读 Packet 四项。`enforcementAdmission` 在 309–320 仅接受 `observation === 'supported' && admission === 'supported'`；缺项、不明或身份不匹配继续拒绝。不要删除 record 来放行，record 缺失在 273–279 会走 `gate:null` 的原有无资格声明路径。

旧负向证据只读核对仍为：receipt SHA `936c77949630c52a7ca128c0f780cc98b2f3a046e5ff8d500bb41cd145bdde01`；attempt SHA `87b71b641d204907b8368b834db2093fb3cbb384e6023f8181c236d7972e0897`。历史文件保持原字节；当前 profile 转而引用新的正向记录，无需增加历史记录数据库。

## 2. 必须接好的两个实际执行消费者

### 2.1 ACP 正向资格不能隐式资格化 CLI

精确调用链：

1. `delegate.cjs:976–989` 分别计算 ACP / CLI 的 pre-admission。只要 ACP 正向，整体便不再是 all-unavailable。
2. `delegate.cjs:1002–1009` 当前仅凭初选 ACP 和存在 `delegateArgv` 构造 `cliFallback`，没有要求 CLI 的 admission 成立；1058 将其写进 digest-bound worker spec。
3. `delegate.cjs:1020–1028` 只检验初选 transport，正常 ACP 可通过。
4. `agent-execution-driver.cjs:673–703` 在 `acp_auth_required`、`failurePhase:ensure_session`、首个 writer 已停止时直接 `new CliDriver(...).run()`，没有再检验 CLI 资格。worker 在 `delegate-worker.cjs:355–364` 原样消费其结果。

因此，若本次只资格化 ACP 后有一次初始化认证失败，已有源码允许进入仍无资格的 CLI。写后 diff 验证不能撤销已发生的原生 CLI 效果。

**最小建议：** 在 launcher 现有 `enforcementAdmission` 调用处重用该 Packet 的 required dimensions，仅在 CLI 也 `admitted` 时构造 `cli_fallback`；ACP 可照常启动。CLI 未资格时不提供 fallback，保留 ACP 原始 typed auth failure。不要资格化 CLI，不新增 brand 分支、运行时 receipt 解释器或第二套权限引擎。已资格的 CLI 与无记录 Host 的既有回退语义继续由现有 gate 决定。

### 2.2 资格 kit 的字节绑定尚未接入普通 admission

| 身份事实 | 普通产品路径目前实际检查 | 本次资格 kit 检查 |
|---|---|---|
| bridge marker / runtime version | host-profile.cjs:281–288 比较 **profile 中声明的两个字符串**；505–516 的 identity probes 配合 agent-execution-driver.cjs:483–547 验证实际两次 `--version` stdout | 还绑定实际二进制 / App 文件 SHA |
| adapter 二进制 SHA | admission / selection 未与 receipt 的 `host.adapter_sha256` 比较；patch SHA 是源码/测试绑定，不等于启动 binary 字节检查 | kit:645–646、835–836 |
| runtime 文件 SHA | 仅验证 `0.16.5` 文本，不消费 `host.runtime_sha256` | kit:650–651、837 |
| public entry SHA / 实际路径 | `resolveAcpEntry`（agent-execution-driver.cjs:630–650）仅选择绝对覆盖路径或默认文件；602 仅把存在性变成 boolean。AcpDriver 在 392 和 445 再解析/启动它 | kit:647–648、824–825；prepare/execute 之间有精确比较 |
| ACPX package | AcpDriver:481–488 的 `started` 行只验证 PID，不验证 `acpx_version`；选择过程未检验 entry 实际加载 SDK 的元数据 | kit:225–241、649、826–827 绑定实际解析 package 的 name/version/package.json SHA |

**事实结论：** 当前普通委派只能声称“两字符串匹配并通过原生版本探测”，不能声称“按本次 adapter/runtime/entry 精确字节组合准入”。在 receipt 追加 SHA 字段、或只让 `qualified_identity` 与另一个静态声明对象比较更多键，均不能补上实际消费者。

**最小建议：** 由实际作者扩展既有 selection / launch identity seam，以已经解析的 adapter 可执行文件、实际选中的 native runtime、`resolveAcpEntry` 返回的实际 entry 计算身份，与本次 qualification 绑定比较。可在现有 `qualified_identity` 增加 `adapter_sha256`、`runtime_sha256`、`acpx_entry_sha256`，不用另造 registry；具体字段需与最终 receipt 一一映射。保留两个原生版本值。若将 SDK 元数据纳入本次资格组合，也必须消费实际解析的 name/version/package.json SHA，而非把 `0.13.2` 常量写进说明。

维度的纯 precheck 仍先执行，避免在已知全不准入时启动任何版本探测。随后真实身份应在 fence/spec/worker 之前核对，并让已有 digest-bound worker spec 绑定所核对的解析结果；AcpDriver 应使用这份已验证结果，普通文件/路径漂移应拒绝，不能重新解析出另一份 entry 后仍宣称沿用之前资格。路径可以变、内容身份不能悄悄变；不要把 `/tmp` 路径字符串本身当可移植身份。无需扫描秘密、执行新 Provider call 或新增通用 attestation 服务。

该建议覆盖合作工作区中的可观察漂移，不宣称击败恶意 OS writer 的逐系统调用 TOCTOU；package.json 身份也不证明整个 node_modules 的任意字节从未被改动。准入文案必须与实际做到的核对范围一致。

## 3. 实际作者的最小源码、测试和文档消费者

| 文件与当前行号 | 必要处理 |
|---|---|
| `skills/ultra-delegate/scripts/host-profile.cjs:182–257,281–288,505–516` | 新资格记录与维度 basis；将真实执行身份接到原有身份检查。`TRANSPORT_MATURITY.zcode` 仍 `experimental`，candidate marker 必须与后续修复后的受测构建一致，不增加 CLI 资格 |
| `skills/ultra-delegate/scripts/delegate.cjs:976–1028,1058` | CLI fallback 的 transport admission；绑定真实选择身份，保留 all-unavailable 的无进程前置拒绝 |
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs:483–650` 及 `acp-driver.cjs:392–445` | 复用现有解析、身份探测和启动边界，实际消费资格指纹；不要只改 metadata。现有 fallback 执行函数 663–723 可继续消费 launcher 已限定的 spec，无须重写通用协议引擎 |
| `tests/acp-driver.test.cjs:667–731` | 当前写死旧 receipt、旧 marker、二者不等。改为验证新 live record 的精确新 receipt 绑定，并单独保留旧 receipt 的历史负向事实和原 SHA；非 Packet 四项 basis 也与新 receipt 一致 |
| `tests/acp-driver.test.cjs:733–802,804–891,893–964` | 当前 live ACP 正向/只读正向；CLI 无资格应是 `missing`，不能继续断言 live identity 为 `version_mismatch`。保留 missing/unknown/旧 marker/缺身份拒绝及 provider-neutral 同事实同决定。补入真实选择身份与 entry 替换/同版本不同字节的隔离回归，复用现有 fixture/probe seam |
| `tests/delegate.test.cjs:789–976,978–1058` | 当前 ACP 负例、all-unavailable-before-probe 都依赖 live profile 默认负向。把这些负例明确注入旧/不完整资格输入，保留原“无探测、无 fence、无 worker”断言；当前正向 profile 的正常 consumer 单独验。不能删掉拒绝断言来让新 profile 变绿 |
| `tests/delegate.test.cjs:549–651` | 复用现有 pre-session auth 与 late-auth fixture。补“ACP 五维支持、CLI 未列”的 case：无 CLI marker、无 `acp_fallback`、保留 ACP typed failure；已有允许回退的 case 继续通过。由实际作者实现，不由本前查编写内联测试 |
| `tests/delegate.test.cjs:1060` 起 | 强制 CLI 的两公开 process-boundary typed refusal 仍应有效；该回归通常无需改变行为，必要时更新 evidence 指向新 live record。兼容 `bin/install.js` 不需因记录转正改动传播逻辑 |
| `tests/v026-contract.test.cjs:1594–1640` | 当前文案断言写死旧 writable unsupported / unobserved / unavailable。保留旧记录的历史声明，同时断言新 ACP 有限资格、CLI 无资格、精确身份、experimental 和 Provider 分离；不能只删除这些契约断言 |
| `skills/ultra-delegate/SKILL.md:125–142,198–201` | 当前“两个 transport 全部 unavailable”需更新为新 ACP 的精确条件与 CLI 继续不可用；历史 negative 仍有明确旧身份。保留 `--ack-experimental` |
| `skills/ultra-delegate/references/delegation-contract.md:149–172` | 同步资格状态、receipt 路径、身份/运输边界；认证回退段 187–192 应明确 destination CLI 必须也通过该 Packet 的 admission |
| `docs/RUNTIME-COMPAT-MATRIX.md:240–258` | 当前 old negative / 新 r1 未资格的运行状态需按真实新 receipt 更新；保留历史日期与旧记录，区分 ACP 与 CLI |
| `.ultra/specs/product.md:121–124`、`.ultra/specs/architecture.md:216–221,234`、`docs/ARCHITECTURE.md:235–246` | 三处都写着双 transport 全部 unavailable，必须一起更新；只描述真实证据支持的 current route |
| `.ultra/specs/research-distillate.md:78–79` | 两份 canonical spec 修改后，用其最终 `git hash-object` 刷新对应 source revision，不改不相关历史表格 |

`docs/ARTIFACT-AUTHORITY.md:216–222` 是通用事实/权限边界，未写死本次 ZCode 正负结论，当前无需修改。适配器 re-export、安装逻辑、结果 schema、North Star、Task 1 P2 文案不是此次转正的自动修改目标。新 receipt 与 raw inventory、Task 2 Review、evidence v2、任务状态/readback 由 Root 在真实验证后维护；实际作者不得制造完成记录。

实施后复用 Task 2 已定义的 narrow gate：`node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/v026-contract.test.cjs`，再完成仓库要求的 release / pack / changed-Skill 验证与只读 Doctor；加入身份消费所触及的既有测试也须覆盖。它们是后续验收清单，**本次前查没有运行这些测试**。任何新的真实 Provider/资格调用仍由 Root 具名决定，失败或未知不自动重试。

## 4. 正向观察不能推出的宣传结论

- 成立的范围是本次明确身份、许可和 native tool 请求的 ACP point-of-use 路径；不是任意 Host、版本、transport、所有工具排列或通用每 root OS sandbox。CLI 和另外五个 Host 不继承本次资格。
- Kit 的 `deriveDenialObservations`（323–345）只从 permission 记录筛选指定 kind 的拒绝，不能发现没有进入 permission 的 native execute。当前 Root 发现的自动通过 `Bash ls` 正是这个边界：三项指定拒绝字段为真，仍不能推出 shell / point-of-use 全边界通过。后续裁定还须核对实际 tool-call/completion 与权限路径，不能只读取三个布尔值。
- Kit 在 `resolveProfile`（746–772）为唯一 bootstrap observation 删除了 enforcement record。因此即使本次真实效果全部符合预期，也不证明普通产品的 record-driven admission 已闭合；需要上面的消费者实施和无 override 的隔离回归。
- 发生计划内拒绝时，真实 result 保持 `failed` / `permission_denied` 可以是正确的资格证据；不能改成 `finished`。写入正例、三种拒绝、实际 changed paths、writer stopped、canary 扫描要分开核对。
- 只在 `end_turn` 或 cancel ack 后看到零效果，不能推出 writer 已停止、没有未知后代或可安全重试。`outcome_unknown`、fence 的既有语义不变。
- HOME 中的认证文件仍可达；env key/合成 canary 通过不证明所有文件秘密隔离或任意 Agent 输出脱敏。Provider transport 必须与 Worker Web/业务效果分开。
- 一次正向资格不提升 `experimental`，不等于公共稳定 headless 契约、真实 HOME 已安装新 entry/binary、release build 成功、全部恢复 drill 完成或整个 Stage B/工厂完成。Task 1 已保留的三项 P2 不因本文自动修复或重新审查。

本文唯一新增文件就是本说明；只执行了现有 read-only 文件、搜索、Git 身份和哈希命令，没有修改实现、测试、临时/内联 Agent、探针、旧证据，也没有 Provider、资格执行或提交。
