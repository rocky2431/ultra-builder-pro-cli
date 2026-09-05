# Stage A repair 1 交付说明（ZCode → Codex delta review 1）— 2026-09-05

基线 commit `2e3273bf12f6493b3201fad3d9d1b802ae367a4f`（源 HEAD 未变），分支
`codex/owner-factory-delivery-20260905`。针对初轮 Review
（`stage-a-review-initial.zh-CN.md`，REQUEST_CHANGES，4 个 P1）逐项修复。未执行任何
commit / push / 真实 HOME 安装 / 发布 / 生产效果 / provider 旅程；未触碰冻结 Owner
消息、`.ultra/decisions/` 授权、D1 状态与 Codex 协调文档
（`docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md` 原样保留）。
英文用于实现、测试与 model-facing Skill，符合任务要求。

## 一、逐项修复

### A-R1：ZCode adapter 丢弃纯提醒（已修复）

- `hooks/adapters/zcode.py::adapt_output` 的 PreToolUse 分支新增 context-only 投影：
  无 `permissionDecision` 且无顶层 `block` 时，`additionalContext` 原样透传为
  `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": ...}}`，
  不凭空制造 allow/ask/deny。decision 分支与 block→deny 分支保持在前、语义未动，
  deny 行为不减弱。该形状与 Review 引用的官方文档及 0.16.5 `zcode.cjs` 实机 consumer
  证据一致（两个属性彼此独立可选）。
- 新回归 `hooks/tests/test_v026_hooks.py::test_zcode_adapter_preserves_advisory_pretooluse_context`：
  走**实际 adapter 子进程路径**（`python zcode.py mid_workflow_recall.py`，camelCase
  wire payload 含 `sessionId`）——断言首条提醒以 additionalContext 可见、
  `permissionDecision` 不存在；同一 wire 下重复提醒仍被去重（stdout 空）；同一路径
  的 `block_dangerous_commands.py` 危险命令仍投影 `permissionDecision: "deny"`。

### A-R2：验收 A→B→A 漏提醒（已修复）

- `hooks/mid_workflow_recall.py`：删除历史数组 membership 判断
  （旧 `delivered` 列表 + `key in previous_entries`），替换为**每会话最近一次送达记录**
  `last_delivered: {session_id: key}`（schema 升为
  `ultra-mid-workflow-recall-state-v2`）。仅当新 key 与该会话**最近一次**送达完全相同
  才抑制；A→B→A、任务 A→B→A 都会重新送达。记录仍是一次性可弃观察：最多 32 个会话
  （再插入即淘汰最久未送达会话）、64 KiB 上限、读不到/异 schema/畸形 ⇒ 本轮直接送达。
- 未新增机制类 Machinery：状态文件更小（每会话一条而非历史目录），读取/写入路径与
  fallback 行为结构不变。
- 测试（`hooks/tests/test_mid_workflow_recall_dedup.py`，11→14 条）：
  新增 `test_acceptance_reverting_to_an_earlier_value_is_delivered_again`（复现 Review
  的 A 显 / B 显 / A 静 序列并断言恢复送达）、
  `test_task_reverting_to_an_earlier_task_is_delivered_again`（任务 A→B→A）、
  `test_legacy_v1_history_state_never_suppresses`（即使 v1 文件里存在完全匹配的 key
  也不抑制——旧 membership 语义不得存活）；重写边界测试为 40 会话进出、保留最近 32。
  既有无身份/畸形身份/异 schema/诊断透传路径测试全部保留并通过。
- 文档同步：`hooks/README.md`、`.ultra/specs/architecture.md` Hook Boundary 行改为
  "仅压掉与会话最近一次送达完全相同的提醒"；`research-distillate.md` 的 architecture
  blob hash 已刷新（`7b314022165a87f88caabd4e057c4d8b94376347`）。

### A-R3：默认紧凑 Status 在普通退出时不可达（已修复）

- `skills/ultra-status/references/route-contract.md`（同一共享合同，非第二 schema）：
  - Route Card 段明确卡的**默认渲染是紧凑表达式**，完整字段集只留给列举的时点；
  - 紧凑段改为"默认覆盖 entry、普通进度、普通 exit、已接受边界覆盖的转换——包括
    普通 Status 回答本身（它就是一次只读路由的 entry 与 exit）"；完整卡时点收窄为
    material checkpoint、暂停/阻塞、Owner 询问 route/grant/authority 详情（删除
    "or exiting" 与无条件 "before moving to another public Skill" 的完整卡强制）；
  - 新增"压缩不隐藏实质"段：未解决决定、重要边界变化、缺失授权必须在
    `Owner decision needed` / `Gap` / `Verified result` 中可见，五行装不下真相时展开
    相应字段；真实失败/unknown 如实呈报、绝不渲染为成功；**已授权修复边界内的普通
    检查失败只更新 Verified result 与 Gap，不制造新的 Owner 决定**。
- `skills/ultra-status/SKILL.md`：`route` 模式可观察出口改为"artifact-derived route
  answer（默认紧凑表达式）"；默认输出段写明该默认覆盖普通 `route` 回答的 entry/exit，
  完整卡时点同步删去 "exit"；Definition of done 改为默认紧凑、合同要求时才完整卡。
  其余 Skill（ultra-change/research 等）只引用共享合同的卡面/转换时点，渲染归合同
  管，未再各自定义，未改动。
- 回归（`tests/route-contract.test.cjs`，8/8）：新增断言 pin 住 "default at entry…
  ordinary exit"、"including an ordinary Status answer"、"transitions covered by the
  accepted boundary"、"Compaction never hides substance"、"without manufacturing a new
  owner decision"，并反向断言旧的 "pausing, blocked, or exiting" 强制已不存在。
- ultra-status 与 ultra-change 官方 `quick_validate.py` 均通过。

### A-R4：评测入口无法在提交前合法运行（已修复）

- 冻结语义改为**未提交候选内容清单**：`tests/evals/owner-journeys-2026-09-05.json`
  新增 `common_environment.candidate_freeze`（基线 `git rev-parse HEAD` + 未提交候选
  文件内容 hash；旅程在阶段验收前运行，**阶段提交跟随验收、绝不反过来**）；
  `docs/evals/owner-journey-eval-2026-09-05.md` 的"回放机制"与"环境冻结"同步改写，
  消除"验收需要旅程、旅程需要提交"的循环。
- 效果边界修正（JSON `abort_rules` + `isolation`，doc 同步）：允许**已配置授权
  provider 的正常执行**（认证调用、计量使用、原生 session/receipt 缓存——均属正常
  runtime 行为而非违例）；继续禁止购买/充值、身份或凭据改写、凭据泄漏、真实 HOME
  安装/配置修改、发布与生产效果；明确隔离 cwd **不构成 OS sandbox 声明**。
- 两个正交轴显式化（JSON `evidence_classes` + doc 证据类别表重排为"轴"表）：
  scripted Owner 输入（输入来源轴）与 actual provider 执行（执行种类轴）可同时成立，
  一次真实 provider 运行可完全由冻结脚本输入驱动；真人观察不可被脚本替代；真实
  Owner 主动时间实测前保持 unknown。
- 记录面补齐：内容清单加入 `hooks/adapters/zcode.py`（九个文件→十个）；基线 HEAD
  措辞改为"基线 commit（候选未提交）"。
- 过期数字更正：doc"当前状态"改为本轮实测 **Node 719/719、hooks pytest 104/104**
  （注明不沿用旧数字，715 系初轮已指出的过期值）；补记初轮 Review 要求的基线更正——
  基线 `2e3273bf` 独立验证为 **712 Node + 89 Hook 全绿**，早期 10 失败是长 TMPDIR
  socket EINVAL 与 node_modules 软链检查环境问题（引用
  `baseline-verification.zh-CN.md`）。
- 新增回归 `tests/owner-journeys-eval.test.cjs` 第 4 条测试："the protocol is runnable
  before stage acceptance and commit"，pin 住 candidate_freeze 措辞、清单含 adapter、
  provider 允许/排除措辞（含反向断言旧的 "credential use, external spend" 一刀切已
  删除）、两轴证据类别定义。
- 本任务未运行任何 provider 旅程（遵守边界）；冻结输入、失败样例保持红、未完成
  旅程与 append-only 结果区全部保留。

## 二、验证证据（本机实际运行，短 TMPDIR）

| 命令 | 结果 |
|---|---|
| `TMPDIR=/tmp/ubp-stagea-repair1 npm run verify:release` | Node 719/719，hooks pytest 104/104，`npm audit --omit=dev` 0 漏洞 |
| `TMPDIR=/tmp node --test tests/route-contract.test.cjs` | 8/8（含 A-R3 新断言） |
| `TMPDIR=/tmp node --test tests/owner-journeys-eval.test.cjs` | 4/4（含新协议可运行性测试；旅程 C 样例保持红） |
| `python -m pytest hooks/tests/test_mid_workflow_recall_dedup.py -q` | 14/14（A→B→A 双场景、v1 legacy、边界） |
| `python -m pytest hooks/tests/test_v026_hooks.py::test_zcode_adapter_preserves_advisory_pretooluse_context -q` | 1/1（adapter 子进程路径） |
| 官方 `quick_validate.py` | ultra-status、ultra-change "Skill is valid!"（本轮实际改动面） |
| `python -m py_compile`（4 个改动 .py） | 通过 |
| `npm pack --dry-run --json` | 142 entries；eval doc 入包；tests/**、work/** 按既有规则排除 |
| `git diff --check` | 干净 |

## 三、本轮改动路径（相对初版候选的增量）

- 源码：`hooks/adapters/zcode.py`（A-R1 context-only 投影）、
  `hooks/mid_workflow_recall.py`（A-R2 last_delivered v2）。
- 测试：`hooks/tests/test_v026_hooks.py`（+1 adapter 回归）、
  `hooks/tests/test_mid_workflow_recall_dedup.py`（重写去重断言 +3 净增）、
  `tests/route-contract.test.cjs`（A-R3 断言）、
  `tests/owner-journeys-eval.test.cjs`（+1 协议回归）、
  `tests/evals/owner-journeys-2026-09-05.json`（冻结语义/两轴/边界）。
- 文档/Skill：`skills/ultra-status/references/route-contract.md`、
  `skills/ultra-status/SKILL.md`（A-R3）、
  `docs/evals/owner-journey-eval-2026-09-05.md`（A-R4）、
  `hooks/README.md`、`.ultra/specs/architecture.md`、
  `.ultra/specs/research-distillate.md`（hash 刷新）。

## 四、冻结指纹（未提交候选内容清单，供评测环境记录）

```
360257d06fa5a123934a3687866511d7c31f2991  skills/ultra-grilling/SKILL.md
b239855b1cf7ec82933b7d7a516f751ac961a070  skills/ultra-grilling/references/reframing.md
2e7fdf8efaef8b18a50d2fa6ff3c20f306b013be  skills/ultra-research/SKILL.md
cde15798f98e8e272d3bb755f51052e0bbd1c8c9  skills/ultra-research/references/wayfinding.md
b0f416487de152337e3bebce63cb2b0e77de00f5  skills/ultra-status/SKILL.md
7ee68b71e19ca7981ffb4976a85a8adbb1d2f43d  skills/ultra-status/references/route-contract.md
2b69e96748546a71bfd7409369c4a310adf5ab95  skills/ultra-change/SKILL.md
dde2bea9a663251b2382a38a53fc6d3cccccc29e  hooks/mid_workflow_recall.py
31f55bf40dff909af1414b1e56bde99533475da2  hooks/_common.py
011c350ddf3eb5ce9faf5ff4dea4e018a9ff36cc  hooks/adapters/zcode.py
528df922d5af1fe558ea3cce7f13b5ecedd18334  hooks/tests/test_mid_workflow_recall_dedup.py
d6ea4ceb79948f9736c7d6f3930cffb64a0bc744  hooks/tests/test_v026_hooks.py
47287acaf60ab5fd33c84425a220c2b1e3efed21  tests/route-contract.test.cjs
06265fb77a1c2cb9638ecbeaa8984027c0539207  tests/owner-journeys-eval.test.cjs
8b3f219f87f818ffede77134b8d6c291f989ca3a  tests/evals/owner-journeys-2026-09-05.json
e1a22337e7fac2f8370c2f842a631570deacbd95  docs/evals/owner-journey-eval-2026-09-05.md
13c32b6682f73ea01b9728fc17597a810415b253  hooks/README.md
7b314022165a87f88caabd4e057c4d8b94376347  .ultra/specs/architecture.md
c28be6373bdaab72caea0f3ad9ce2602fc448323  .ultra/specs/research-distillate.md
```

冻结规格 `tests/evals/owner-journeys-2026-09-05.json` SHA-256 前缀：`9132122166405a7d`
（初版候选为 `016c2aec9fdba9d1`，本轮 A-R4 编辑后已变，以本清单为准）。

## 五、未完成、已知边界与复核建议

- **Provider 旅程未运行**：scripted replay、live provider run、live human observation
  均未运行（任务边界；等 Codex 冻结本候选后独立协调）。Owner 主动时间/成本未知。
  A-R1 的证据等级仍是"shared adapter 直接执行 + 已知 Host source/consumer 证据"，
  尚非完整 Host 生命周期冒烟——评测旅程中实测 ZCode PreToolUse 提醒首条可见性即可
  补上这一环。
- **ZCode 实机 session_id 仍未实测**：本仓库 dogfood 状态下任务选择 ambiguous
  （D1 两个 in_progress），live hook 走"仅诊断"路径；去重的有/无身份两条路径由单元
  与 adapter 子进程测试覆盖。
- **既有 adversarial-review 空转观测保留**：初轮 Review 明确本轮不扩大修复，
  `tests/adversarial-review-eval.test.cjs` 子运行器疑似空转的观察原样留给 Codex 决定。
- **未运行真实 HOME 安装/Doctor**：`bin/install.js --all --global` 属真实 HOME 效果，
  按任务边界跳过；安装行为由既有隔离配置测试覆盖（719/719 内）。
- **Plugin Creator 校验不适用**：manifest/marketplace 面未变。
- A-R3 属 Skill 文本合同修改：结构回归与官方 validator 均过，但"普通 Status 回答
  默认五行"的真实体验效果要靠旅程 A/B 的 Owner 可见输出验证，不能由文本断言替代。

Stage A repair 1 到此为止；等待 Codex delta review 1 与独立验证。transport `end_turn`
不构成阶段验收。
