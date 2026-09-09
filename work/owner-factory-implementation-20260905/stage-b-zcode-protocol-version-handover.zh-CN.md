# Stage B 运行时 Review 修复交接：真实协议版本协商（review-code-001 / review-tests-002）

- 作者：实际 ZCode（delegation `cc0b2147488e48ff8a84192ab4f03a38`，depth 1）
- 输入 Review：`.ultra/reviews/vnext-d1-runtime-stage-b-final-review-20260906/SUMMARY.json`，
  SHA-256 `c98b0afca0be149f86a8307342e277e57f4272a897222f54273fd38a6c31959b`，REQUEST_CHANGES。
- 修复的两个 P1（同一根因）：`review-code-001`（acp-driver 无协商证据地合成 protocolVersion 1）、
  `review-tests-002`（wrong-version 回归只靠 fake entry 自身的版本检查通过）。P2 均未自动修复。

## 根因与修法（最小公共消费面方案）

入口侧（真实 entry）：不加第二协议引擎、不碰 SDK。acpx 0.13.2 的公开
`AcpSessionStore`/`AcpSessionRecord.protocolVersion` 是协商版本唯一的公开观测点——
pinned manager 在 `ensureSession` 等待期间把 initialize 结果的 protocolVersion 写入
session record 并落盘。入口的内存 store 在 save 时捕获该数值；`ensureSession` 返回后、
`startTurn` 之前，若未实际观测到 stable v1（不支持或未证明）即以类型化失败拒绝：
`{code: "unsupported_protocol_version", phase: "ensure_session"}`，exit 1，不提交任何
prompt/工具/模型 turn。result 行新增可选兄弟字段 `protocolVersion`，仅在实际观测到时
携带，永不输出常量。

Driver 侧（UBP）：`observedProtocolVersion` 只从 result 行兄弟字段读取（number 才算），
三处原 `protocolVersion = ACP_PROTOCOL_VERSION` 合成点全部改为消费该观测；无观测即
`null`。delegate-worker 照旧发布 `acp_protocol_version`，conformance 的 `=== 1` 门由此
不再可能被假 v1 满足。

## 诚实限制（按任务要求明示）

- pinned manager 先 `session/new` 后落盘含版本的 record，因此拒绝时 agent 会话可能已创建
  （trace 可见 initialize + session/new），但绝不出现 `session/prompt`。
- 初始化失败（如 session/new 处 auth 失败）没有持久化任何 record，版本保持未观测
  （`null`），不是 v1；`acp_fallback.protocol_version` 由此从旧合成的 1 变为诚实的
  `null`。
- 会话 record 中的非数字 protocolVersion 视为违反公开 record 契约，保持未观测。

## 变更文件

agent-delegate-skill 独立工作树 `/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill`
（HEAD `0f456a0839cddeec7add09c09b4e10f202cc08ee`，保留独立 0.3.0 与既有 Kimi 修复）：

- `runtime/acpx_delegate_entry.cjs` — 修复本体；SHA-256
  `f734ed38cce00f14aa3229a6b21f8c7a452d6f7c2ef46f6b362907ba6aacecbd`
  （修复前 `99049a249b8bf719914601cb82869692379e5a8bba8fff1ad51d796fe5a4c6bb`）。
- `tests/test_acpx_delegate_entry.py` — fixture 增加
  `FIXTURE_PROTOCOL_VERSION`（int 或 `none`）；新增 unsupported/unproven 两个拒绝测试；
  happy 与 session-init auth 失败测试分别补充观测版本 / 未观测断言。
- `README.md` — 该公共边界描述补充协商观测、拒绝与 `protocolVersion` 兄弟字段。

UBP 主 checkout（未 commit，交 Root 审查后统一 commit）：

- `skills/ultra-delegate/scripts/acp-driver.cjs` — 消费真实观测，去掉三处合成。
- `tests/acp-driver.test.cjs` — 新增 opt-in（`UBP_TEST_ACPX_ENTRY`）真实 entry + 真实
  AcpDriver 的 wrong-version 回归：断言 `acp_turn_failed` + `failurePhase
  ensure_session` + `protocolVersion === 2`、trace 无 `session/prompt`、无 host_output、
  无 terminal 成功事件。
- `tests/fixtures/fake-acpx-entry.cjs` — 镜像新契约：观测点移到 session/new 之后、
  同形拒绝、result 行带观测版本。
- `skills/ultra-delegate/SKILL.md`、`skills/ultra-delegate/references/delegation-contract.md`
  — 仅更新协商观测/refusal/acp_protocol_version 语义的契约描述（wire 观测已变）。
- **范围说明**：`tests/delegate.test.cjs:594` 原断言 auth 回退记录
  `acp_fallback.protocol_version === 1`，编码的是被修复的合成行为；按公开契约改为
  `null`（并补 `acp_protocol_version === null`）。该文件不在任务列出的可写清单内，
  但它是变更后公共契约的直接活消费者，此一处断言更新是使 focused 套件保持真实所必需，
  请 Root 审查确认。

## 本地验证（全部命令与 raw 输出保留在
`.ultra/.runtime/owner-factory-implementation-20260905/stage-b-protocol-version-zcode-20260906/`）

任务自有 runtime 副本 = 最终 entry 字节（cmp 相同）+
`node_modules -> /Users/rocky243/.local/share/agent-delegation/runtime/node_modules`
（即已安装 acpx 0.13.2 的符号链接）。Node v26.8.1。

1. RED（未改 entry，SHA 99049a24…）：wrong-version 下 exit 0、completed/end_turn、
   trace 含 session/prompt（复现 Review 事实；保留的 Review RED 证据未动）。
2. 最终 GREEN 拒绝（entry SHA f734ed38…）：exit 1、
   `unsupported_protocol_version`/`ensure_session`、result 行 `protocolVersion: 2`、
   trace 仅 initialize + session/new、无 prompt、无事件流。
   日志 `final-green-refusal.log`。
3. `UBP_TEST_ACPX_ENTRY=<scratch>/runtime/acpx_delegate_entry.cjs node --test
   tests/acpx-entry.test.cjs` — 4 pass。
4. `node --test tests/acp-driver.test.cjs` — 35 pass + 1 skip（opt-in 未设）；
   同命令加 `UBP_TEST_ACPX_ENTRY` — 36 pass（新回归运行）。
5. `node --test tests/delegate.test.cjs tests/acp-conformance.test.cjs
   tests/install.test.cjs` — 79 pass（conformance happy 门经真实观测 1 仍通过）。
6. `AGENT_DELEGATION_TEST_RUNTIME=/Users/rocky243/.local/share/agent-delegation/runtime
   python3 -m unittest tests.test_acpx_delegate_entry` — 18 pass，OK
   （UTF8/分帧、EOF waiter、粘性取消、close/drain、失败 phase 等 Kimi 修复全部保留）。

保留行为核对：version1 正常执行（含真实 entry 直连 completed/end_turn +
protocolVersion 1）、ensure-session auth 失败与 CLI 回退（版本诚实为 null）、取消
（初始化期取消与活跃 turn 取消）、迟期失败 phase 语义、fixture 隔离
（测试不再于 repo 根产生一次性文件）。

## 未运行 / 边界

- 未运行完整 `npm run verify:release` / 736 项全套与 `npm pack`（Root 将在最终字节上运行）。
- 未运行 `tests/ultra-5-journeys.test.cjs`（无版本断言依赖，交由 Root 全套覆盖）。
- 未做真实 Provider qualification、未晋升任何 support 状态、未安装/替换已安装
  agent-delegation runtime 或 SDK、未 commit/push。
- 所有任务自有子进程（entry、fake agent、python fixture）均已退出，无残留。
- `tests/acpx-entry.test.cjs` 无需改动（其 opt-in 用例原样通过）。
