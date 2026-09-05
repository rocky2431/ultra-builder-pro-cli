# Stage A 交付说明（ZCode → Codex review）— 2026-09-05

基线 commit `2e3273bf12f6493b3201fad3d9d1b802ae367a4f`，分支
`codex/owner-factory-delivery-20260905`。本文件是 Stage A 初版候选的诚实交接：
改了什么、为什么、验证证据、未完成项与复核建议。未执行任何 commit/push/安装/
发布；`docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md` 的
既有修改是 Codex 的协调内容，已原样保留。D1 两个 reopened task 与
`.ultra/decisions/` 授权记录未做任何改动。

## 一、改动清单（按主题）

### 1. Grilling 改为证据触发的澄清

- `skills/ultra-grilling/SKILL.md`（重写核心章节）
  - 删除无条件 reframe 义务（原文 "The reframe below was put to the owner … never
    skipped"）与无条件复述确认（原文 "Restate … and ask them to confirm the
    restatement"）。
  - 新增 "Before you start" 第 4 条：Owner 已显式给出的答案直接算已答，永不复述
    确认、永不再问、永不重新确认已表达的接受。
  - "Definition of done" 要求每次交互都有证据触发：复述仅当措辞歧义或记录缺失、
    reframe 仅当 reframing 触发条件成立、答后确认仅当答案是推断来的或来自他人。
  - "Reuse, clarify, then ask"：简单明确的交付按原样推进，默认不扩张成更大的产品，
    也不悄悄缩小；Owner 拒绝过 reframe 即确认其原框架，不再重复提出化妆式新解。
  - "When the owner decides" 明确：已答的实质决定保持关闭；推断（自己的或别的
    agent 的）永远不算 Owner 答案。
- `skills/ultra-grilling/references/reframing.md`
  - "When to reframe" 从 "Most first asks qualify" 收紧为四条证据触发。
  - 新增 "When not to reframe"（简单可验收的交付、已被拒绝的 reframe、帧内细节、
    只影响实现难度的重构interpretation 均不 reframe）。
  - 示例从 "briefing app → personal chief of staff"（放大式，恰是方案反对的默认
    扩张）换成收窄/重定型示例（digest → alert）；诚实规则新增 "Name the size and
    direction of the change"（放大或缩小都要说出口）。
- 保留既有护栏：一次一问、每问带推荐、framing 先于 detail、Resolved/Stalled/
  Unavailable 出口、fixed count 禁令（旧反模式断言全部继续通过）。

### 2. Research 暴露问题前沿

- `skills/ultra-research/SKILL.md`
  - 入口新增 "question frontier" 段：本轮问题、已记录的已知事实及来源、阻塞出口的
    Owner 决定、可安全推迟的未知、有用出口（停止条件达成时解锁的 caller 动作）；
    载体复用 run brief / Research Disposition，不建第二个注册表。
  - "Investigate, ask, and decide" 第 3 步收紧：只为当前出口依赖的决定问 Grilling；
    技术事实与方法选择由 agent 自查；阻塞决定解决后直接走向出口，不继续铺开。
- `skills/ultra-research/references/wayfinding.md`：brief 字段扩展（已知事实防重问、
  unknowns 拆分为阻塞/可推迟、增加 useful exit）。

### 3. 紧凑进度表达式

- `skills/ultra-status/references/route-contract.md` 新增 `### Compact progress
  expression`：默认五行（Goal / Verified result / Gap / Next action / Owner
  decision needed），是同一张 Route Card 的渲染规则，不是第二 schema、状态中心或
  强制 UI 格式；transport 返回、任务数、结构校验、旧证据永不充当 Verified result；
  计划是未来动作不是结果；unknown 不显示为成功；material checkpoint、暂停/阻塞/
  出口、公开切换与 Owner 询问时展示完整卡。
- `skills/ultra-status/SKILL.md`：默认输出改为紧凑表达式，完整卡按合同时点展示。
- `skills/ultra-change/SKILL.md`：普通进度汇报默认用紧凑表达式（一句话接入共享
  合同）。

### 4. mid_workflow_recall 提醒去重

- `hooks/mid_workflow_recall.py`
  - 仅当 payload 携带可用 `session_id`（非空、非全空白、≤256 字节、无控制字符）
    才参与去重；键 = (session_id, change_id, task_id, acceptance 文本 SHA-256)。
  - 任务切换、验收内容变更、新会话 ⇒ 重新送达；身份缺失/畸形 ⇒ 永不抑制（宁重复
    勿丢失）；诊断永远原样透传，不受去重影响。
  - 送达记录为 `.ultra/.runtime/mid-workflow-recall-state.json`（上限 64 KiB、保留
    最近 32 条、schema 标识），一次性可弃，永不权威：读不到/畸形/异 schema ⇒ 本轮
    直接送达；写入失败只影响后续去重，不影响本次送达。
- `hooks/_common.py`：`_normalized_derived_path` 的 runtime 白名单从单文件扩展为
  `compact-snapshot.md` + `mid-workflow-recall-state.json`（progress 路径规则不变）。
- `hooks/README.md`、`.ultra/specs/architecture.md` Hook Boundary 行同步（架构行
  保留原有 pinned 短语并追加去重边界说明）；`.ultra/specs/research-distillate.md`
  的 architecture blob hash 已刷新（`e10d2a78…`），project-artifacts 测试恢复绿。

### 5. 真实旅程评测入口

- `docs/evals/owner-journey-eval-2026-09-05.md`：入口文档（四类证据分离、环境冻结、
  指标、append-only 结果区、诚实边界）。
- `tests/evals/owner-journeys-2026-09-05.json`：冻结规格（A 模糊想法→首个可用本地
  产品；B 既有项目小改动→跨模块迭代；C 棕地接管→复现修 bug；每旅程含逐轮
  owner_messages、duplicate_probe、missing_probes、验收清单）。
- `tests/evals/fixtures/journey-c-brownfield/`：带种子缺陷的棕地样例（按月筛选把
  下月第一天计入当月；导出模块共享同一筛选逻辑）；冻结测试当前为红。
- `tests/owner-journeys-eval.test.cjs`：规格结构校验 + 样例保持可复现红的守卫。

## 二、验证证据（本机实际运行）

| 命令 | 结果 |
|---|---|
| `TMPDIR=/tmp/ubp-stagea-tmp npm run verify:release` | Node 718/718，hooks pytest 100/100，`npm audit --omit=dev` 0 漏洞 |
| `TMPDIR=/tmp/ubp-stagea-tmp node --test tests/route-contract.test.cjs` | 8/8（含 3 条新合同回归） |
| `TMPDIR=/tmp/ubp-stagea-tmp python -m pytest hooks/tests/test_mid_workflow_recall_dedup.py -q`（anaconda python） | 11/11 新去重回归 |
| 官方 Skill Creator `quick_validate.py`（anthropic-agent-skills 副本） | ultra-grilling / ultra-research / ultra-status / ultra-change 全部 "Skill is valid!" |
| `npm pack --dry-run --json` | 142 文件；新增 `docs/evals/owner-journey-eval-2026-09-05.md` 如预期入包，tests/** 按既有规则排除 |
| `git diff --check` | 干净 |
| `python -m py_compile hooks/mid_workflow_recall.py hooks/_common.py` | 通过 |

基线对照：Codex 冻结基线 712 测试 10 失败（长 TMPDIR socket EINVAL）；本轮短
TMPDIR 下全绿，且新增 6 条测试（3 Node 合同 + 11 pytest 中净增计入总数的变化以
实际输出为准：Node 715→718 为新增 3 条 eval 守卫，pytest 89→100 为新增 11 条）。

## 三、关键设计决定（供 Review 挑战）

1. **去重只发生在 host 提供会话身份时**。当前六个 adapter 的注册 payload 都不带
   `session_id`；Claude Code 等原生 hook 通道自带。没有身份就保持旧行为（每次
   送达）——宁可重复，不可让新会话丢失首条提醒。这意味着去重的实际收益取决于
   各 Host 原生 payload；未验证的 Host 不受影响。
2. **身份可用性判据**：非空、非全空白、≤256 字节、无控制字符。超出即视为身份
   不可用（不去重），而非尽力而为地用脏身份去重。
3. **诊断不去重**：diagnostics 反映实时账本状态（如 `task_in_progress_ambiguous`），
   属于待修复问题的可达可见性，不是"重复提醒"消费者。
4. **紧凑表达式是渲染规则不是 schema**：五行的每个字段都映射到既有 Route Card
   字段，卡仍从 canonical 文件+Git+当前 run 派生；避免新增状态中心或强制 UI 格式
   （方案红线）。
5. **reframe 触发收窄但未禁绝**：四条证据触发保留（两读法 materially 不同 build、
   解未附问题、字面不可行/远小于所求、竞品描述）；删除了"named an artifact"这一
   单独足以触发几乎一切请求的条件。示例换成收窄式，并要求 reframe 声明规模与方向。
6. **样例测试保持红**：journey-c-brownfield 的边界断言是冻结验收；仓库级守卫断言
   其保持红，防止评测样例被顺手"修好"。

## 四、未完成、已知边界与复核建议

- **真实旅程未跑**：scripted replay、live provider run、live human observation 均
  未运行（provider-effect 边界，等 Codex 冻结候选后协调）。Owner 主动时间/成本
  未知。不得据小样本宣称效率提升。
- **ZCode 实机去重未验证**：本仓库 dogfood 状态下任务选择 ambiguous（D1 两个
  in_progress），live hook 一直走"仅诊断"路径，未产生 state 文件；因此 ZCode
  PreToolUse payload 是否携带 session_id 未被实测。单元测试覆盖了有/无身份两条
  路径。建议在旅程评测环境实测一次。
- **既有表面观测（本轮未改）**：`tests/adversarial-review-eval.test.cjs` 用
  `spawnSync(node, ['--test'], {cwd: fixture})` 断言 fixture 退出 0；在
  `node --test` 父进程内，子运行器会因 `NODE_TEST*` 环境递归保护跳过执行并同样
  退出 0——该断言可能空转通过。我的新守卫测试剥离了该环境变量并显式断言无递归
  警告。建议 Codex 决定是否开一个独立小修（属 Stage A 外）。
- **未运行真实 HOME 安装**：`bin/install.js --all --global` 属真实 HOME 效果，
  按 Stage A 门禁跳过；安装行为由既有隔离配置测试覆盖。
- **Plugin Creator 校验**：无 manifest/marketplace 变更，按 AGENTS 条件不适用。
- `docs/evals/owner-journey-eval-2026-09-05.md` 结果区为空表（append-only），首行
  即"尚无运行"。

## 五、冻结指纹（评测环境记录用）

源 HEAD：`2e3273bf12f6493b3201fad3d9d1b802ae367a4f`（改动尚未提交，评测应在
Codex 提交后以提交哈希重新记录）。当前工作区改动文件 blob hash：

```
360257d06fa5a123934a3687866511d7c31f2991  skills/ultra-grilling/SKILL.md
b239855b1cf7ec82933b7d7a516f751ac961a070  skills/ultra-grilling/references/reframing.md
2e7fdf8efaef8b18a50d2fa6ff3c20f306b013be  skills/ultra-research/SKILL.md
cde15798f98e8e272d3bb755f51052e0bbd1c8c9  skills/ultra-research/references/wayfinding.md
5401deb015a572f50b6af0e0278b0d1309e40c8d  skills/ultra-status/SKILL.md
cc7501fa268e65127d846b5025e810a4f2915354  skills/ultra-status/references/route-contract.md
2b69e96748546a71bfd7409369c4a310adf5ab95  skills/ultra-change/SKILL.md
409eb451759034a4871128c80870589a36aa3c49  hooks/mid_workflow_recall.py
31f55bf40dff909af1414b1e56bde99533475da2  hooks/_common.py
```

冻结规格 `tests/evals/owner-journeys-2026-09-05.json` SHA-256 前缀：`016c2aec9fdba9d1`。

Stage A 初版候选到此为止；等待 Codex review。transport `end_turn` 不构成阶段验收。
