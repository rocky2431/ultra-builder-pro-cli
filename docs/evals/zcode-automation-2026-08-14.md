# ZCode 自动编码与双向委派实测 — 2026-08-14

## 结论

当前实现已经证明两条不同的 live path：ZCode 可以作为第六个目标 Host 被 Ultra
委派，也可以作为发起 Host 调用另一个 CLI；在 owner 明确激活的 Change-scoped
Autonomy Envelope 内，它还可以在同一会话连续完成 Plan、Dev/TDD 和 Test，而不需要
daemon、数据库、MCP 或语义状态机。

这不是无限授权。实测 envelope 只覆盖一个任务、零次委派、零 external effects，并在
through-test stop condition 后停止；Deliver finalization、archive、commit、push、publish
和 deploy 都没有获得授权，也没有发生。

## ZCode 原生插件

- ZCode CLI: `0.16.3`
- Managed plugin: `ultra-builder-pro@inline`
- Native inventory: 14 Skills、5 Hooks、0 Commands、0 MCP
- Activation: managed local marketplace 加 owner-configured `plugins.dirs` entry
- Hook bridge: `hooks/adapters/zcode.py`

安装后 `zcode plugins list` 报告插件 enabled，并能枚举全部十四个 qualified Skills。
一次真实 no-op Bash tool call 在修复 hook transport 后以 exit 0 完成；无动作 adapter
现在不再把 `{}` 发送给 ZCode 的 strict hook parser，而是保持 stdout 为空。

## 同会话自动编码

- Fixture: `/tmp/ubp-zcode-autonomy-20260814`
- Seed HEAD: `7292d7654d228ac3dc7f9b07b2e28d226c6f6104`
- Change: `C-AUTO`
- Task: `T-AUTO-1`
- ZCode session: `sess_49caffcb-1d8e-44be-825d-ec607d21b1e3`
- Envelope: through-test、max tasks 1、max repairs 2、review budgets 1 each、delegations 0

ZCode 读取 accepted intent 和 exact North Star revision 后完成：

1. 写入一个 tracer-bullet task，并生成 Plan review；
2. 通过 public seam 写出可发现的 failing test，再做最小实现修复；
3. 生成 task review 和六维 evidence；
4. 运行 whole-change Test、真实 consumer E2E 和 aggregate review；
5. 写入 fresh `.ultra/test-report.json`，然后按 envelope 停止。

独立复核命令 `npm test` exit 0，3 tests、3 pass、0 skipped。三份
`SUMMARY.json` 都通过当前 `review_wait.py` 校验：Plan 为 APPROVE/0 findings，Task 和
aggregate Change 均为 APPROVE/1 P3。Test 报告保留两个 P3 residual risk：finite-number
合同缺少非整数例子，以及作为 library 的 export 没有仓内非测试 consumer。

原会话第一次在所有产品工作完成后，因 no-op hook 把 `{}` 写到 stdout 而在最后一个
benign Bash 验证上 exit 1。修复 adapter 并重装插件后，先独立复现该 Bash 为 exit 0，
再 resume 同一个 session 做只读终检；resume exit 0，HEAD 仍是 seed commit，未生成
commit。这条失败没有被隐藏，它直接产生了当前 hook 修复。

## ZCode 作为目标 Host

对抗性 fixture seed HEAD 为 `37c07dc8596cda64a93aac260917b3c091ad1b58`。一次
`--to zcode` 的 read-only delegation 通过 instruction、permission、output-schema
digest、空 diff 和 terminal-result 校验，并找到五类 hidden seed。terminal result
SHA-256 为：

`f9409cdd62a5e41a5b183cbed155e25e097ec9a27d0d0bfae0f9e74d87468956`

语义评测与 six-lens 决定见 `docs/evals/adversarial-review-2026-08-14.md`。

随后又专门验证了当前 macOS 上 `zcode` 不在 `PATH` 的默认路径。未设置
`UBP_DELEGATE_ZCODE_BIN`，共享 profile 自动选择
`/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`。第一次调用真实完成审查但
省略 `$schema`；原因是共享 prompt 先要求该字段、随后列举“exact fields”时又漏掉它。
launcher 按设计发布 `failed/missing_result`，没有把不合约输出算作成功。补上 prompt
contract 回归并重新安装后，以新 delegation id 再跑：

- Delegation id: `spec-zcode-default-fallback-2`
- ZCode session: `sess_a985dc31-0eb5-4521-988d-97e92bee2c9a`
- Selected command: `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`
- Override: absent
- Result: `finished`、5 findings、empty diff、exit 0、stderr 为空
- Result SHA-256: `71d973723b9317fe2ad31d3216a4f65e933d8ac18a8275244c94b84623dae852`

这把“ZCode 可以作为 target”从手工 binary override 提升为当前安装形态下的默认真实
路径，并同时验证了不合约结果的可恢复失败路径。

## ZCode 作为发起 Host

同一 fixture 上，ZCode session `sess_3ba3e9b2-6e3a-492d-876e-5e1a5e817d77`
执行 `ubp delegate run --to claude`，等待 terminal artifact，再读取并汇报结果。Claude
worker 只读定位到 `timeout-after-charge` 后无幂等键重试造成重复扣款的缺陷；worktree
保持空 diff，result status 为 `finished`，exit code 0。

- Delegation id: `zcode-to-claude-2`
- Result SHA-256: `f2a9d9d88def969a0dc52ce494f0226e4c0f17f48c049c301e01241d449890da`
- Instruction digest: `0d4a958db8c903eb6f5da6b8a6e6932a67398ad520424b32c8e4f83972618dd4`
- Permission digest: `96f7f8ed4ddb77e4569519d8d20d2e29595c74a06b119d0dee8f3a7dd2cb`
- Schema digest: `723230a485136ef52d0ef6f6fcbe804fc9b13544a11b93aefb2a75fe7ce3887d`

这证明的是 ZCode→Ultra launcher→Claude 的真实 source path，不只是“ZCode 能被别的
Host 调用”。第一次尝试也如实暴露了隔离 `HOME` 隐藏 Claude 登录的问题；第二次仅把
已授权的真实 `HOME` 交给 nested launcher，未复制或打印任何凭据。

## 六目标 Host 当前边界

Claude、Codex、OpenCode、Kimi 和 ZCode 均完成了 schema-valid read-only target run。
Grok Build 1.0.3 多轮 exit 0 但 terminal output 截断或畸形，launcher 正确发布
`failed/missing_result`；其 partial text 不计入 findings。这个残余是当前 Grok 输出
conformance ceiling，不能通过放松 result contract 来伪造成成功。
