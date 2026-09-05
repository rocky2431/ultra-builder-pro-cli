# Stage A repair 2 交付说明（ZCode → Codex delta review 2）— 2026-09-05

基线 commit `2e3273bf12f6493b3201fad3d9d1b802ae367a4f`（源 HEAD 未变），分支
`codex/owner-factory-delivery-20260905`。对象是 delta Review 1 live 发现
**A-R5 / P1**（`stage-a-review-delta-1-live-findings.zh-CN.md`）：候选 A 在 Owner
尚未见过其新撰 North Star 候选时发布 accepted R1、把初始 intake 填入
`Exact raw owner acceptance`、以"无实时问答通道"为由把常设实施授权当作候选采纳，
并把模型自选的"无联网/无账号/仅本机"默认提升为宣称的 Owner 硬约束。

未执行任何 commit / push / tag / 发布 / 真实 HOME 安装 / 生产效果；未启动 Stage B；
未触碰冻结 repair-1 源
（`.ultra/.runtime/owner-factory-implementation-20260905/stage-a-repair-1-source/`）、
被评测的样例项目、delegation runtime、installer、release 版本、provider registry、
本仓库 accepted North Star、D1 状态与 Codex 协调文档
（`docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md` 原样）。
初轮四项修复（A-R1…A-R4）的源改动原样保留，本轮只做增量。

## 一、对诊断的独立判断（含一点异议）

诊断成立：journey A 的委托设置明确允许返回问题、禁止发明 Owner 答案
（`/private/tmp/ubp-owner-journeys-ynsz0724/candidate-A-turn1.md`），而产物
`candidate-A-premature-acceptance.md` 写"会话中没有实时问答通道"——该声称与冻结
输入相悖；根因是 repair-1 引入的"复用已答/已接受"缺少另一半边界：**什么不是
新候选的采纳来源**。schema/hash validator 只观测结构，确实发现不了这类语义冒充。

一点补充（非异议）：我认为这不是"问得不够多"的问题——旅程中唯一必须到 Owner 的
决定（候选采纳）实际上**一次都没有被提出**，就被"常设授权"替代了。因此本轮修的是
**采纳来源的判定**与**缺失时的诚实动作**，不是增加确认次数；同时按要求保持
"已答事实直接复用、真实既有采纳不再重问"不回退。

## 二、逐项修复（最小共享缝隙，7 个文件）

### A-R5 语义修复：已答事实 ≠ 新候选采纳（Grilling / Research / wayfinding）

- `skills/ultra-grilling/SKILL.md`（3 处）：
  - 步骤 4 收紧为 "re-confirm an acceptance **of a candidate the owner already
    accepted as displayed**"（原 "an acceptance the owner already expressed" 语义过宽）；
  - `## When the owner decides` 新增一段：候选采纳 = Owner 对**所展示候选本身**的回应
    （自然语言接受/修订/拒绝；无魔法词、无需二次审批）；同一未变候选的真实既有采纳
    直接复用；**原始请求、实施指令、工作流许可、问答通道不可用、Agent 自认"语义
    溯源自 Owner 原话"都不构成该决定的问或答**；缺失时交回 draft / 上一真实采纳
    修订、用自然语言一次性点名该候选决定、caller 继续其授权已覆盖的工作；
    被拒绝/修订的候选不继承旧采纳；
  - `Unavailable` 结局补一句：**通道不可用或问题未答本身绝不是 Owner 答案**
    （直接封死 journey A 的"无实时问答通道⇒视为接受"路径）。
- `skills/ultra-research/SKILL.md`（3 处）：
  - 入口问题前沿段加一句：Owner 已述事实原样复用；**本轮撰写的候选的采纳是另一个
    开放决定**，直到 Owner 接受所展示的该候选；
  - `## Synthesize` 在既有 "Only after the owner accepts the candidate, atomically
    replace …" 之后（合同原句未动）补：该采纳 = Owner 对所展示候选的回应；同一未变
    候选的既有采纳复用不再批；Project Brief / 建造请求 / 工作流许可 / 问答通道不可用 /
    Agent 自认溯源**都不是**你撰写的候选的采纳；缺失时让 draft 与上一真实采纳修订
    并存、用自然语言一次性呈报该开放采纳决定，而不是发布采纳记录；
  - `## When the owner decides` 补两段：**(1) 缺失采纳不停工**——当前边界内的实现与
    验证照常进行，缺失采纳如实报为开放的 workflow closeout，与真实产品进度分开表述，
    不冒充完成、不一刀切停工；修订/被拒候选从自己的采纳起步，不继承旧的。
    **(2) 技术默认保持 model-owned**——授权范围内的存储布局、匹配规则、本机优先等
    选择如实记录为模型选择，不提升为 Owner 已接受的硬约束，琐碎实现选择不制造
    新的采纳门。
- `skills/ultra-research/references/wayfinding.md`（1 处）：run brief 的
  "owner decisions that block the exit" 字段扩展——把"Owner 已述事实（可复用输入）"
  与"本轮撰写候选的采纳（Owner 接受所展示候选前保持开放）"分开记录。

未改动：`99-synthesis.md` 与 `north-star-v2.md` 的发布合同（发布仅凭 Owner 接受）
原样保留并由新回归 pin 住——按任务要求不弱化该合同；`route-contract.md` 与
`ultra-change/SKILL.md` 经核对 live 调用链（init→research/baseline→synthesis）后
**无需改动**（material checkpoint 第 1 条与技术选择 model-owned 段落已一致）。

### 评测协议对齐真实打包消费者（双清单）

- `tests/evals/owner-journeys-2026-09-05.json`：
  - `candidate_freeze` 改为**两份绑定清单**：候选文件原始内容摘要 + 由该冻结源经
    canonical adapter 生成的**预期安装摘要**（adapter 安装时对 SKILL.md frontmatter
    规范化重序列化——`adapters/_shared/plugin-core.cjs::copySkills` 只变换 SKILL.md，
    references 与 hooks 逐字复制——安装件 SKILL.md 与原始源字节不同属预期差异）；
  - `record_before_each_run` 的 hash 清单条目改为按双清单判定：逐字复制文件
    （references、hooks）必须等于冻结源摘要；SKILL.md 必须等于该 Host adapter 由
    冻结源生成的预期安装摘要；
  - `abort_rules[0]` 改为：与冻结生成清单**意外不匹配**（两份预期摘要都不符）才中止
    并记录漂移；frontmatter 规范化这一已知生成差异绝不中止。
  - 冻结 Owner 消息、fixture 引用、旅程验收标准、指标、append-only 结果策略
    **逐字未动**。
- `docs/evals/owner-journey-eval-2026-09-05.md`：环境冻结段同步双清单语义（与
  `stage-a-live-eval-setup.zh-CN.md` 中实际旅程已采用的双清单做法一致）；新增
  "A-R5 独立前向案例"表（四案例，供 Codex 冻结 repair 2 后的独立前向评估与真实
  provider 旅程使用）；"当前状态"追加 repair 2 增量与实测数字。结果表保持
  "尚无运行"。
- `tests/owner-journeys-eval.test.cjs`：新增第 5 条测试 "installed-copy comparison
  binds the frozen dual manifest, not raw-source bytes"，pin 双清单措辞并反向断言
  旧的单清单"与冻结源不一致即中止"规则已删除。

### 源级/语义回归（四前向案例的源级 pin）

- `tests/route-contract.test.cjs` 新增 2 条（8→10）：
  - "answered owner facts are reused while acceptance of a newly composed candidate
    is a separate owner act"——按四案例组织断言：(1) 复用面（已答事实、同一未变
    候选的真实既有采纳、无魔法词/无二次审批、前沿事实/采纳分类）；(2) 非采纳来源
    枚举（原始请求+实施指令+工作流许可+通道不可用+Agent 推理；通道不可用≠Owner
    答案）；(3) 缺失动作（draft 并存/交回、一次性自然语言点名、caller 继续已授权
    工作、不停工、closeout 与进度分开）；(4) 不继承 + 技术默认不升格为 Owner 硬
    约束/不造新门；另加机械门禁反向断言（无问题计数、无 acceptance-state 注册表、
    无必需咒语、无 stop all work）。
  - "the publish-only-after-owner-acceptance North Star contract is not weakened
    by the clarification"——pin SKILL/99-synthesis/north-star-v2 三处发布合同原句
    与"后续修订不继承采纳"，防本修复反向弱化合同。

## 三、验证证据（本机实际运行，短 TMPDIR）

| 命令 | 结果 |
|---|---|
| `TMPDIR=/tmp node --test tests/route-contract.test.cjs tests/owner-journeys-eval.test.cjs` | 15/15（route-contract 10、eval 5） |
| `TMPDIR=/tmp node --test --test-concurrency=1 adapters/_shared/tests/*.test.cjs tests/*.test.cjs` | **Node 722/722 全绿**（串行；含本轮 +3） |
| `TMPDIR=/tmp node --test tests/delegate.test.cjs`（×3） | 58/58 ×3（隔离稳定） |
| `TMPDIR=/tmp/ubp-stagea-repair2 npm run test:hooks` | **pytest 104/104**（本轮未改 hooks） |
| `TMPDIR=/tmp npm audit --omit=dev --audit-level=high` | 0 漏洞 |
| 官方 `quick_validate.py`（`~/.codex/skills/.system/skill-creator`） | ultra-grilling、ultra-research 均 "Skill is valid!"（本轮仅这两个 Skill 正文变更；wayfinding 是 reference 非独立 Skill） |
| `TMPDIR=/tmp npm pack --dry-run --json` | 142 entries（与 repair-1 持平）；eval doc 在包内；tests/**、work/** 按既有规则排除 |
| `git diff --check` | 干净 |

**已知的并行 flakes（与本轮改动无关，需 Codex 知悉）**：默认并发下完整
`npm run test:node` 三次运行中两次出现 `tests/delegate.test.cjs` 的**不同**计时敏感
断言偶发失败（"proven-safe fence" / "post-spawn launcher loss … receipt-write"）；
`delegate.test.cjs` 对本轮 7 个改动文件零引用，隔离运行 3/3 全绿，串行全量
722/722 全绿。repair-1 报告的 719/719 全绿可能同样含运气成分；建议 Codex 复核时
以串行或 delegate 隔离运行为准，此 flake 属 Stage A 之外的既有表面，本轮未动。

## 四、本轮改动路径（相对 repair-1 候选的增量，7 个文件）

- Skill 正文：`skills/ultra-grilling/SKILL.md`、`skills/ultra-research/SKILL.md`、
  `skills/ultra-research/references/wayfinding.md`。
- 评测面：`tests/evals/owner-journeys-2026-09-05.json`、
  `docs/evals/owner-journey-eval-2026-09-05.md`。
- 测试：`tests/route-contract.test.cjs`（+2）、`tests/owner-journeys-eval.test.cjs`
  （+1）。

## 五、冻结指纹（未提交候选内容清单，供评测环境记录）

```
3c935e6d996290109278c6def28dcf64788e5174  skills/ultra-grilling/SKILL.md        ← 本轮变更
b239855b1cf7ec82933b7d7a516f751ac961a070  skills/ultra-grilling/references/reframing.md
3ba420aac0b47881795452326e94a36fe34d565c  skills/ultra-research/SKILL.md         ← 本轮变更
96a23811afc99f004f94b6f79a934049a0524bee  skills/ultra-research/references/wayfinding.md ← 本轮变更
b0f416487de152337e3bebce63cb2b0e77de00f5  skills/ultra-status/SKILL.md
7ee68b71e19ca7981ffb4976a85a8adbb1d2f43d  skills/ultra-status/references/route-contract.md
2b69e96748546a71bfd7409369c4a310adf5ab95  skills/ultra-change/SKILL.md
dde2bea9a663251b2382a38a53fc6d3cccccc29e  hooks/mid_workflow_recall.py
31f55bf40dff909af1414b1e56bde99533475da2  hooks/_common.py
011c350ddf3eb5ce9faf5ff4dea4e018a9ff36cc  hooks/adapters/zcode.py
528df922d5af1fe558ea3cce7f13b5ecedd18334  hooks/tests/test_mid_workflow_recall_dedup.py
d6ea4ceb79948f9736c7d6f3930cffb64a0bc744  hooks/tests/test_v026_hooks.py
e83d3421cde36baf7c59aea8e6a3d0c29ab0b21d  tests/route-contract.test.cjs          ← 本轮变更
ad12c219e0ad6e19b91ea6d7b55327a7d00824bf  tests/owner-journeys-eval.test.cjs     ← 本轮变更
cc6190244269b70a50292684d6144ba9ef5a116a  tests/evals/owner-journeys-2026-09-05.json ← 本轮变更
86fa7f26b66238eee94df2fbec0b711fa49d1ddb  docs/evals/owner-journey-eval-2026-09-05.md ← 本轮变更
13c32b6682f73ea01b9728fc17597a810415b253  hooks/README.md
7b314022165a87f88caabd4e057c4d8b94376347  .ultra/specs/architecture.md
c28be6373bdaab72caea0f3ad9ce2602fc448323  .ultra/specs/research-distillate.md
```

冻结规格 `tests/evals/owner-journeys-2026-09-05.json` SHA-256 前缀：`200f8023985a3dee`
（repair-1 为 `9132122166405a7d`，本轮双清单编辑后已变，以本清单为准）。
按新冻结语义，Codex 冻结候选时还需由该源经对应 Host adapter 生成并记录
**预期安装摘要**（SKILL.md 五个；references 与 hooks 直接用上表源摘要）。

## 六、未完成、边界与复核建议

- **Provider 旅程未运行**：本轮零 provider 旅程、零 nested agent；四条前向案例已
  写入 eval doc 供 Codex 冻结 repair 2 后独立执行；journey A/C 及接续 B 的重放
  属 Codex 职责。原失败样本 `candidate-A-premature-acceptance.md` 原样保留，未覆盖。
- **`bin/install.js --all --global --doctor` 未运行**：真实 HOME 效果，按任务边界
  跳过（repair-1 同）；安装行为由 722 内的隔离配置测试覆盖。
- **语义修复的实效需旅程验证**：本轮是 Skill 文本合同 + 源级 pin；"真实旅程不再
  伪造采纳"只能由 Codex 的前向案例与真实 provider 旅程证明，文本断言不能替代。
  三个 SKILL.md 改动点在安装面会经 adapter frontmatter 规范化——对照新双清单即可，
  不属漂移。
- **delegate 并行 flake**：见第三节，建议 Codex 决定是否另立问题处理（本轮未动，
  避免超范围）。
- 本轮未改 `.ultra/decisions/`、共享任务状态、D1 记录；英文用于实现、测试与
  model-facing Skill。

Stage A repair 2 到此为止；等待 Codex delta review 2、独立前向评估与阶段提交。
transport `end_turn` 不构成阶段验收。
