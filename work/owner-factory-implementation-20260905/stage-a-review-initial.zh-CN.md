# Stage A 初轮独立 Review

2026-09-05。结论：**REQUEST_CHANGES，4 个必须闭合的问题**。Writer 已退出，无并行实现写者。基线 `2e3273bf12f6493b3201fad3d9d1b802ae367a4f`；ZCode receipt `6bb80682600741a7b7948cdc08e9939f` 是成功交接，不是阶段验收。以下是初轮 Review，尚未消耗两次 P0/P1 delta Review。

## A-R1：ZCode 实际 adapter 丢弃纯提醒（P1）

- 位置：`hooks/adapters/zcode.py:100-122`，实际注册 consumer 是 `adapters/zcode.js` 的 PreToolUse recall。
- 复现：导入此 adapter，对 `adapt_output({"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"REVIEW_SENTINEL"}}, "PreToolUse")` 调用，返回 `{}`。当前 shared recall 正是这种没有 permissionDecision 的输出。
- 影响：新去重逻辑把提醒记为已送达，但 ZCode consumer 收不到首条提醒。这个旧适配缺陷是本阶段实际路径的阻塞，不能只测 shared Hook 后宣布有效。
- 证据：官方 https://zcode.z.ai/en/docs/hooks；本机 0.16.5 `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` SHA-256 `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`。其 PreToolUse schema 的 permissionDecision 可缺省；提取实际 `Oni` consumer 并执行后，context-only 输入进入 additionalContexts，未生成 permissionBehavior。完整过程见 `stage-a-review-observation-zcode-hook.md`。这是 native consumer 证据，尚非完整 Host 生命周期证明。
- 修正：透传 advisory context；不得凭空加 allow/ask/deny。覆盖实际 adapter 子进程路径，并保住现有 deny 语义。

## A-R2：恢复旧验收后漏提醒（P1）

- 位置：`hooks/mid_workflow_recall.py:148-151` 的历史数组 membership 判断。
- 冻结 SHA-256：`306761bf8d42c54be287c7aad130ef34a7319eed1028dafc6cd9dfb77976b0ac`。
- 复现：使用新测试的 `typed_project` / `recall` 创建真实临时项目；同一 session 依次写验收 A、B、A 并运行 Hook。输出依次为 exit 0 / 543 bytes、exit 0 / 547 bytes、exit 0 / **0 bytes**。
- 影响：验收确实从 B 变回 A，却沿用历史“已见过”记录。任务 A→B→A 同因；这不满足任务切换和验收变更重新提醒的已接受出口。
- 修正：只压掉对应会话中连续相同的当前上下文，保留短小、可弃的观察缓存。覆盖 A→B→A、task A→B→A，以及已有无身份/恢复/损坏缓存路径；不增加权威状态、数据库或 delivery ACK 协议。

## A-R3：默认紧凑 Status 在普通退出时不可达（P1，阶段出口缺口）

- 位置：`skills/ultra-status/references/route-contract.md:36,51-54`；`skills/ultra-status/SKILL.md:22-25`。
- 证据：候选只在 checkpoints 之间使用五行；一次普通 Status 请求的回答本身就是 Observable exit，因此仍强制输出完整十二字段卡。独立 Skill forward check 也明确遵循该冲突，见 `stage-a-independent-forward-check.zh-CN.md` 的 case 4。
- 影响：本阶段明确承诺的默认表达，用户调用 Status 时仍会被旧展开规则覆盖。内部字段与 authority 保留，并不要求每次都展示所有字段。
- 修正：默认紧凑表达也覆盖普通 entry/exit/已授权转换；未解决决定、重要边界变化、缺失授权等必须明确可见，确实需要解释或 Owner 请求时展开相应详情。不能删除 material decision、未完成事项、真实失败/unknown，也不能把每个普通测试失败都变成新的 Owner 审批。

## A-R4：评测入口无法在提交前合法运行（P1，阶段验收阻塞）

- 位置：`docs/evals/owner-journey-eval-2026-09-05.md:41,51,68-70`；`tests/evals/owner-journeys-2026-09-05.json:14,26`。
- 证据：doc 要求本阶段代码接受并提交后才做 provider 旅程；但阶段接受需要旅程结果，形成循环。JSON 又禁止任意 credential use、external spend、real-HOME write，连本次已授权的正常配置调用与 native session/receipt 缓存也会被判违例。
- 修正：以基线 SHA + 候选文件内容摘要冻结未提交候选，先验证再接受提交。记录实际加载路径/版本与新增 adapter 文件。既有配置 Agent 调用及正常 session/receipt 缓存允许；继续禁止购买/充值、身份/凭据改写或泄漏、真实 HOME 安装/配置修改、发布与生产效果。隔离 cwd 不能声称 OS sandbox。
- scripted Owner 输入来源与 actual provider 执行是两个轴，可以同时成立；真实 Owner 主动时间未知就保持未知。保留固定输入、失败、未完成的旅程和证据来源。结果区数字应对应当前实际输出（handover 718 Node，文档仍是 715）。

## 已通过与边界

Codex 独立运行：11 条新 Hook 测试、8 条 route tests、3 条 eval fixture tests 通过；四个修改 Skill 官方 validator 通过。四个内部语义 forward cases 支持条件澄清方向，但没有替代公开路由和产品旅程。独立基线最终是 **712 Node + 89 Hook 全绿**；早期长 TMPDIR 和 node_modules 软链造成的检查环境错误已排除，见 `baseline-verification.zh-CN.md`，请更正 handover 中仍只引用早期失败的基线说明。

未做候选独立全套 release/pack/Doctor 或实际三类旅程，均留在修正后。既有 adversarial-review 子运行器疑似空跑作为观察保留，本轮不扩大修复。没有 Stage A 提交，也没有进入 Stage B。
