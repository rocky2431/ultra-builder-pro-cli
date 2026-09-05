# Stage B 只读前置核对（尚未激活）

2026-09-05，Stage A 旅程期间只读核对。此记录不启动 Stage B、不消耗旧提案预算，也不代表 D1 接受。

- `delegate.cjs:833-835` 仍将所有 kill(pid,0) 异常归为 false；`outerWorkerView:537` 把 false 视为 stopped。聚合 P1 的根因在当前源码仍存在。
- 实际 detached spawn 位于 `delegate.cjs:1092-1099`，使用 `envViews.worker`；旧测试仅检查派生对象，尚缺此真实子进程入口的环境采样。需要最小 programmatic seam，不引入产品环境开关。
- 聚合 `.ultra/reviews/vnext-d1-aggregate-review-20260902` 的三个 P1 分别为 `review-tests-001`、`review-errors-001`、`review-spec-001`。Task 2 无条件 positive qualification 必须实测通过，不能把 negative 改成 not_applicable。既有 P2/P3 仍报告，不自动修。
- `agent-delegate-skill` 当前工作区干净，通用入口 `agent_delegate.py` 仍是 ACPX stateless run + 原始 receipt；事件输出在子进程退出后保留。通用连接不拥有 UBP writer/fence/semantic acceptance。后续仅添加实际 consumer 所需薄接口，不能用复用之名移除工厂约束。
- `ultra-goal-skill` 已有其他工作推进到 `c20356388581e86843222d984e829533ba6edd86`（2.15.1），早先 2.14/dirty 快照已过时。当前仅三个未跟踪 research 目录；`graph-topology.md` 仍把 graph 固定等同 author-time rigid、loop 等同 runtime adaptive，并把当前 wrapper 限制当跨供应商协议限制，故已接受修正仍适用。实施前再次读当前树，保留 2.15.1 新验收/恢复合同；使用隔离工作树避免与其他活跃 Goal 工作写入竞争。

执行顺序仍为 A 接受并 commit → 建立当前 Stage B 精确有限授权记录/mission → 实际 ZCode 修 D1 Task 1 → Codex 独立 Review/Evidence → Task 2 offline bridge 修正与真实资格 → aggregate → ACP 复用及独立 Goal 样例核对。旧 supplemental grant 文件是定位失败和技术入口的历史提案，不是新调用的授权凭证。

## 已安装 ACPX 公开边界补查

本机 ACPX 0.13.2 的 package exports 明确提供 `./runtime`（`createAcpRuntime`、`createRuntimeStore`、`createAgentRegistry` 等）与 `./flows`；CLI 提供 `--permission-policy`。这是当前安装源码/帮助的事实，不是工厂生命周期资格结论。

`dist/live-checkpoint-Gw2oGjhe.js` 的 `permissionMatchTokens` / `findPolicyRule` 只匹配 kind、rawKind、title、toolName（及标题首词）与 `*`，不检查 ToolCallLocation 或 writable roots。该 bundle SHA-256：`cd0a0a3df4d411464274c70715c8466ebeff7bd57e718e2d4c74acf011518f8c`。因此 CLI permission-policy 不能直接替换现有 UBP `permissionDecision` 的真实路径边界；复用应以保留 D1 等价行为为条件。公开 runtime 的事件/取消接口能否满足当前 consumer，需要后续实现者进一步验证，不在此预先选定或声明已合格。

## 2026-09-05 11:18 UTC：公开会话接口与精确限制

Codex 只读本机 `acpx@0.13.2` 的 `dist/runtime.d.ts` 与实际 JS：`ensureSession` 提供 persistent/oneshot 和 resumeSessionId；`startTurn` 分开返回 requestId、promptStarted、events、result、cancel。`runtime.js:915-935` 在 native client 可复用且没有未决 prompt 时保留连接，下一轮复用同一 owner；不必每轮重新启动 CLI。`result` 的声明和 `runRuntimeTurnTask` 均把 final persistence/cleanup 尝试放在完成信号之前。可作为薄连接/等待消费者的候选，但尚无本项目 live W2/W3/W4 资格。

`onPermissionRequest` 接收原始 `RequestPermissionRequest`，包含 locations，因此编程入口比 CLI 文本匹配更有可能复用 UBP 的精确 permissionDecision。不过不能只接上 callback 就宣称边界等价：

- `live-checkpoint-Gw2oGjhe.js:4974-5003` 在 callback 抛错/未返回决策后回退到 permissionMode；默认 approve-all 会扩大授权，受约束路径必须验证 fail-closed fallback。
- 同 bundle `FileSystemHandlers`（2056 起）与 `TerminalManager`（3426 起）直接处理客户端 fs/terminal；它们不走上述原始 permission callback，而有各自 mode 判定。公开 `AcpRuntimeOptions` 没有暴露 client fs/terminal flags，不能把 TypeScript 未声明的键当已生效配置。UBP 当前禁用客户端 fs/terminal 的行为也要覆盖到迁移验证中。
- 底层 process/session/control 环境、writer 身份、停止核对、原始事件与冻结结果仍由工厂边界负责。会话句柄或 requestId 并不提供产品接受或效果幂等。

CC 的 `cc-wake-api-preflight.zh-CN.md` 是另一条原生 Host 候选的只读证据：Codex app-server 0.150.1 有 run-scoped socket 和 queue API。它的 clientId 回显只证明输入/turn 关联，不能证明语义决定恰好应用一次；0700 socket 目录不能挡住同 UID Worker。选择时比较现有 ACPX persistent Primary 与特定 Host API 的实际消费者和失败行为；不同时预建两套架构，也不把帮助/API schema 当生命周期资格。实际 CLI 版本另已核对：CC 2.1.261、Kimi 0.41.0；registry 广告的旧版本不用于新的资格记录。

## 2026-09-05 12:53 UTC：关联仓库并发更新

本节更新此前 clean/版本观察，不覆盖其他任务的工作。`agent-delegate-skill` HEAD 仍为 `4026dff5`，现在 wrapper、installer 与对应测试四份文件有未提交修改；实际另一个任务“排查 agent-delegate 限制”获 Owner 授权，正在实现命名 session/cancel/close、流式结果保留、错误分类与过宽限制整改。新的草稿接口不是当前安装已验收能力；Stage B 应等待/核对稳定结果再复用，避免第二份连接代码和并发写入。

`ultra-goal-skill` HEAD 已到 `8cb9c9d651ceae88fa0fe3a0728c2fe204860ed8`，docs/usage 双语、goal-run、Skill、delegation/goal-package、agent-modes 和测试正在独立修改，并新增委派审计。此前 `c203563` + 仅三个 research 目录的观察已过时。实施本方案的 graph-topology/样例修正前必须重新核对这些修改，只补实际未覆盖差异，不能把它们当我们本阶段的实现或擅自提交。

实际 `agent-delegate` 入口仍指向 `~/.local/share/agent-delegation/skill/scripts/agent_delegate.py`，与仓库中的正在修改文件为不同路径；后续资格仍核对真实执行字节。未修改上述两个仓库、全局 wrapper、配置或 runtime。

## 独立 ACPX 公开边界复核（只读）

Codex 独立子审查绑定已安装 ACPX 0.13.2 和冻结 `candidate3-source`，没有 provider 调用/源码变更。结论支持继续复用 ACPX，保留工厂边界：

- `deny-all + onPermissionRequest` 先消费明确 callback 决定，可以允许经 UBP 原始判定的 Host native edit；ACPX 客户端 fs/read、fs/write、terminal/create 各自被 deny-all 拒绝。实际位置：`dist/live-checkpoint-Gw2oGjhe.js:4918,2114,2172,3619`。
- 不能只映射 allowed 布尔值。ACPX `allow_once` 缺少该 option 时会回退 `allow_always`（2441–2450），UBP `permissionDecision` 当前严格检查 option、原始 kind/locations/session 和路径。保留完整判定，不使用 inferredKind，也不加 permissionPolicy.autoApprove（policy 在 mode 前，callback 异常会回退）。
- 公开 runtime 缺 fs/terminal 协商选项（runtime.d.ts:300；runtime.js:1054,1378），initialize 默认广告 true（bundle:4333）。deny-all 能拒绝效果，不能证明 Host 不会因广告改用必拒的代理工具。补齐前只能实测限定仍使用 native tools 的 Profile，不能声称六 Host 与原 false 协商等价；不借 testOptions/internal hash 模块冒充公开 API。
- runtime 以完整 process.env 合并 sessionOptions.env 并持久化后者（bundle:3138）。保留外层 worker，从 `descendantSpawnEnv(spec)` 启动受观察的有限 runtime 子进程；不可把 worker 控制键带入或把 secret 值存 sessionOptions。cancel 为请求，close 主要终止 adapter PID（runtime:1657；bundle:4756），不能替代整个 writer tree 停止核对。
- 最小实际 consumer 是 existing agent-delegation 的公开 runtime 入口，复用 createAcpRuntime/createRuntimeStore/fixed argv registry，传递原始 permission 与 events/result/cancel；UBP 保留 env/fence/typed result/停止核对。是否需补公开能力，以正常/失败路径资格结果决定，不预建第二套 transport。

实际安装 wrapper 与 HEAD `4026dff` 完全相同，SHA-256 `735ce4b01420dd4620950fd1a338b971f807e47569a50ca60a3ac030b7d4aa04`、29,290 bytes，非仓库同 inode。当前真实调用仍是旧 stateless 版；其他任务的新命名 session/流式实现未审查、未安装。

## 当前 Goal 独立只读核对（HEAD 21495b62）

其他Owner任务已提交可选portable委派，tracked树干净，四处未跟踪研究资产保留。`delegation-package.md` 已使用可选native/现有agent-delegation、发现真实target、显式caller及嵌套chain；必需独立Review和调用结束不等于Goal完成的边界都已在位。本阶段不重复迁移这些内容。

剩余最小消费者：`references/graph-topology.md:3,11-20,74,85-88,103` 的graph/loop刚性二分、跨厂商只能阻塞/不可观察及保证独立、Stop仅看anchor退出码的陈旧断言；`agent-modes.md:130` 同步二分；`assets/workflow-script.js:1,57` 需明确特定runtime附件和结果非Goal验收（当前真实consumer validate_artifact.py:441仅node --check）。沿用已接受研究证据及research-basis.md的适用范围，不再做新研究/新增运行引擎。

另一个实际consumer P2：`validate_artifact.py:809` 同target reviewer/critic产生默认error SAME_VENDOR_REVIEW，结构校验因而exit1，虽然真实独立会话可能符合Owner批准身份与当前input绑定。需在明确graph/delegation修正范围内把品牌相同当advisory，现有test_validate_artifact.py:329调整；不得削弱goal_contract.py:138的Owner身份、独立session、digest、acceptance covers和Review要求。该点只影响附件显式校验，不等于所有Goal activation都会失败。

agent-delegate-skill仍在另一Owner任务内修改至0.2.0草稿（新session/cancel/close/流式及错误分类），当前安装wrapper仍sha735ce4b0，实际ACPX0.13.2。它尚未提供编程permission callback消费者；Stage B以稳定实际接口为准，保留路径/环境/进程证明边界。

## 2026-09-05T13:57:01.258863+00:00：通用委派独立工作已提交并更新安装

`agent-delegate-skill` HEAD `49309b202907f97f29f121f894d8b031a73bb7bd`，tracked tree clean，0.2.0；commit记录37 tests含实际ACPX+隔离local fixture及Skill/plugin验证。当前安装wrapper sha55774e39aa61f1486951b286397f479cbb43ab80e7430982330fff2a12111b72 /38,636bytes；ACPX仍0.13.2。版本更换由另一Owner任务执行，本任务没有安装或写该仓库。后续Stage B复用这个已稳定公开CLI/配置界线，需要的原始permission编程消费者仍独立验证。candidate5 A/C已运行的是旧wrapper映像，原request/v1/无stream files事实保留；原native session继续，不重发。后续调用记录实际wrapper版本；不把跨wrapper时间差当prompt效果。
