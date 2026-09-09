# Stage B：ACPX 集成修复分项源码审查

这是最终冻结检查前的分项源码审查，范围限于前次保留的两个 P1，以及同一消费路径的文档事实。当前源码已消除这两个原失败路径，本轮没有发现这两项修复中的新 P0/P1；仍有两处文档保留旧引擎的提前事件缓冲承诺，按 P2 记录。**本报告不作 Stage B 或严格最终 Review 的 verdict。**

只读检查实际 consumer、真实/fake entry 与既有测试，没有运行测试、Provider、安装或启动 Agent，只新增本报告。Root 告知 Kimi 最终 entry 已独立通过 54 tests；本轮核对了该源码哈希及有关测试内容，没有把该记录描述成本轮复跑。已撤回的普通 internal status P1 保持撤回，未重新提出；不扩修其他 P2。

## 受检快照

UBP 根目录：`/Users/rocky243/Context Engineering/ultra-builder-pro-cli`。外部 entry 根目录：`/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill`。以下九个文件分别在读取前、读取后运行 SHA-256 核对，**本轮两次值一致**。ZCode 仍在修改其他工作内容；这只证明本轮读到的这些文件一致，不代表整个工作区冻结。最终组合冻结时若这些文件变化，应按变化增量复核。

| 文件 | 读前 = 读后 SHA-256 |
| --- | --- |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `72f46e166b39f468ecabcfd92dc994ab31b912bf0d4c1b4b74a9b509d35f87db` |
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `f564d8f4f7b15e5c95ed27df35d8f8daca7ad6839412cb814256335e0b598ed4` |
| `skills/ultra-delegate/references/delegation-contract.md` | `dba5ec4ac1cd42080d559d52fd6ce97ab147fbce84aeb5b145d2f9435775c944` |
| `skills/ultra-delegate/SKILL.md` | `82d44021e401d94c079a1b89e03f7047fbd70c7e57fb743964e4cb6f3c839ccb` |
| `tests/fixtures/fake-acpx-entry.cjs` | `4b972d76018d626a5bb0dbb765d61fc49b7542f44150ef56e7d0c1cb0473924c` |
| `tests/acp-driver.test.cjs` | `a6e9a43efdab19375483772f3467cc4e94752c8a2fee3e559b5f645e98d32f95` |
| `tests/delegate.test.cjs` | `27de679c6bb36ea74f72191cc86174e1f2e64063bb023e636f62899b8c9eda47` |
| `tests/acpx-entry.test.cjs` | `c4cb2d6fdabbbde3d28a095d736c45ec6fc300c7150573b909893cf0bad2acf5` |
| 外部 `runtime/acpx_delegate_entry.cjs` | `99049a249b8bf719914601cb82869692379e5a8bba8fff1ad51d796fe5a4c6bb` |

## 原 P1-02：认证回退已保留提交前证明

真实 [entry:323](</tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:323>) 用局部 `startTurnReached` 表达事实：ensureSession 的等待发生在该值为 false 时；336 在调用 startTurn 之前置 true。catch（379–380）据此标记 `ensure_session` 或 `turn`，不从错误文本推断阶段。已提交 turn 通过 resolved `turn.result` 返回 failed 时，373–376 同样强制标 `turn`，覆盖了此前容易遗漏的非 throw 路径。ensureSession 期间取消返回 cancelled，不伪装成认证失败。

[acp-driver.cjs:353](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/acp-driver.cjs:353>) 只把精确的 `error.phase === 'ensure_session'` 投影为 `failurePhase`（364–375），并在结果中保留该机械证据（683–685）。错误文本/code 仍可用于分类 `acp_auth_required`，但分类本身已不再触发回退。

实际 [CLI fallback consumer:673](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/agent-execution-driver.cjs:673>) 同时要求认证 failureType、精确的 ensure_session phase 和已绑定 CLI 参数。之后仍检查第一位 writer 已停止并成功回到 not_started，才启动 CLI；`prompt_sent:false` 只在这个分支内写入（712–719）。因此：

| 输入 | 当前消费者行为 |
| --- | --- |
| `ensure_session` + 认证错误 + 已证明停止 | 保留原来的一次 CLI fallback |
| `ensure_session` + 非认证错误 | 保持失败，不回退 |
| `turn` + 认证错误 | 保持 ACP 失败，不回退、不写 prompt_sent 声明 |
| phase 缺失、未知或非字符串 + 认证错误 | 同上；不把错误正文当阶段证明 |
| 合法提交前认证错误，但 writer alive/unknown | outcome_unknown，保留停止边界，不启动 CLI |

测试证据的范围也已明确：`tests/delegate.test.cjs:559–598` 保留提交前正向路径；601–648 的提交后 auth-late 路径检查真实 CLI marker 未生成、结果仍为 ACP failed 且无 acp_fallback。当前 fake entry 的提交后通用 catch 不附 phase（330–336），所以这个反向用例实际保护“已提交且 phase 缺失”的路径。真实 entry 的 `tests/test_acpx_delegate_entry.py:346–366` 分别检查 ensure_session 没有 session/prompt，以及认证失败已经经过 session/prompt 后必须是 turn。显式 turn/unknown 的 UBP 组合未在本轮运行；对其不回退的本轮结论来自上述精确相等检查，不能冒称已有四类组合的实际运行记录。

原先“任何 auth 字样都可能重跑已部分完成任务并伪造 prompt_sent:false”的源码路径已关闭。

## 原 P1-03：raw IPC 先落 stdout 的路径已删除

[acp-driver.cjs:420](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/acp-driver.cjs:420>) 不再创建 protocolStdout capture；464 起的 consumeLine 仅在内存里解析，不先 append 原始行。正常与失败 finally 统一把 `stdout.log` 写为空（692–699），launch observation 失败的早退也不落原始 stdout（448–459）。

对原始字段逐个追到产品写入点：

- thought 在 295 丢弃，不进入派生 journal 或 `agentOutput`；tool_call 投影只保留 kind/status/location count（302–313），不保留正文、rawInput、rawOutput 或 title。
- permission request 的 raw 仅交现有 `permissionDecision`，回送 optionId 后只记录 decision/kind/scope（494–510）。
- `host_output` 在 631 写入的只是输出流的 agent 文本；原始 tool payload 没有被拼接进该文本。`DerivedEventJournal` 仍通过固定安全形状写入。
- `delegate-worker.cjs:355–364` 只把 driver 的机械结果字段接入观察；397 的失败结果使用分类后的 failureSummary，不接收事件数组。启动前形成的 worker-spec/receipt 也没有接收原始事件的写回入口。
- stderr 仍是既有的进程诊断 capture，driver 自己只附固定 failureType 诊断（691）；此次被报告的 raw IPC 转存路径已不再进入它或其他产品产物。此结论针对原始事件字段的传递，不把它扩大成对任意 Host 自行输出内容的通用脱敏保证。

`tests/acp-driver.test.cjs:139–148` 现在同时检查派生 events 无既有 thought/raw canary、host_output 与预期结果相等（119），以及 stdout.log 精确为空（148）。已有全产物枚举见 `tests/delegate.test.cjs:142–164`；该 helper 的环境 canary 检查与 thought/raw 内容检查是不同证据，不能互相冒充。本轮没有运行全部 retained artifacts 的内容扫描，因此不宣称已取得最终组合的动态无残留证明；源码里未找到这次 raw event 新增通道的其他落盘出口。

## 同一路径文档事实

认证阶段和 raw 日志规则已同步到 [delegation-contract.md:165](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/references/delegation-contract.md:165>) 的 165–179，以及 [SKILL.md:141](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/SKILL.md:141>) 的 141–163。公共 entry、客户端 deny-all、native permission callback、拒绝后继续收集后续探测及 typed terminal 的描述已写入同一路径。

两处仍是 **P2 文档事实残留**：

- [delegation-contract.md:119](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/references/delegation-contract.md:119>) 的 119–124 承诺由 Ultra 缓冲最多 32 条/256 KiB 创建期 metadata，并逐条核验 sessionId 后回放。
- [SKILL.md:164](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/SKILL.md:164>) 的 164–167 重复这套旧 driver 行为。

当前 acp-driver 已移除旧提前事件队列，消费的是不带 sessionId 的 ACPX 公共事件。ACPX `dist/runtime.js:805–832、865–866、1450–1453` 的 owner/事件处理也不是这套 32 条/256 KiB、逐 ID 核验保证。最小修正是删改这两处不再成立的承诺，描述当前实际 runtime 边界；**不要求补回旧通用引擎、加新 gate 或扩大源码范围**。Root 已把这一文案事实修正放入既有 ZCode 反馈队列；它们变化后，最终冻结检查应核对新哈希和措辞。

本轮分项结论到此为止。相关测试的实际完成记录、最终冻结组合、安装/打包路径和 Host qualification 由 Root 的后续检查合并判断，不能由这份只读源码报告代替。
