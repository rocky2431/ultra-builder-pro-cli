# Ultra Builder Pro 5.0.2 — Owner 体验诊断

**日期**：2026-09-05
**对象**：`ultra-builder-pro-cli` 5.0.2（本仓库），对照 V1（`~/.claude` 的 git HEAD）
**状态**：诊断完成；改动未开始；有一个待 owner 裁决的问题（见 §7）

---

## 一句话结论

> V2 建了一整套围绕"完成"的制品体系——330 份 review、65 个 WORKER-PACKET、58 个 ADMISSION——
> 但"完成"本身是模型写进 `tasks.json` 的一个 `status` 字段。
> **系统里没有任何东西能反驳模型说"我做完了"。**

Owner 报告的三个症状（research 无终结点 / 不知道进行到哪 / 不确定产出是不是自己要的），
以及 V1 当年的死因（局部完善但整体断层、静默失败、五到七代后文档失配），
都可以从这一个缺失原语推导出来。

## 0. 这份文档的范围

**是**：对 5.0.2 当前 owner 体验的诊断，以及一份不需要重构的改动清单。
**不是**：vNext 架构评审（那个在 `ultra-builder-pro-vnext-independent-multi-agent-review-2026-08-31.zh-CN.md`），
也不是 graph / loop 的架构裁决，也不涉及与 `ultra-goal` skill 的合并——
**owner 已明确：两者分开，V2 独立成 CLI / 面向自动化软件工厂，只借鉴模式，不合并。**

本文所有数字都附可重跑命令，见 §9。区分标注：**事实**（工具输出）/ **推断**（我的解读）。

---

## 1. 缺失的原语

**事实。** `.ultra/tasks.json` 里一个 task 的全部字段：

```
id  title  type  priority  complexity  status  dependencies
context_file  trace_to  change_id
```

对 `anchor|command|verify|gate|check|cmd` 的 grep：**0 命中**。

于是：

| 字段 | 是什么 | 谁写的 |
|---|---|---|
| `status: completed` | 完成状态 | **模型** |
| `trace_to` | `.ultra/specs/product.md#artifact-lifecycle` | 指向**散文** |
| `context_file` | `.ultra/contexts/task-*.md` | 指向**更多散文** |

**task 里没有任何可执行的东西。** 没有一个命令，它的退出码能独立于模型裁决"这件事做到了没有"。

## 2. 证据

### 2.1 制品结构：审查压倒验证

**事实。** 本仓库自己的 `.ultra/`（1,274 个文件）构成：

| 制品 | 份数 |
|---|---|
| `review-spec` / `review-tests` / `review-errors` / `review-code` / `review-design` / `review-comments` | **330** |
| `WORKER-PACKET.json` | 65 |
| `SUMMARY.json` | 62 |
| `ADMISSION.json` | 58 |
| `evidence.json` | 43 |
| **`verification.log`** | **29** |

**330 : 29 ≈ 11.4 : 1。** 30 个 task，几乎每个配了 6 种模型生成的审查，
而真实验证日志只有 29 条。

**推断。** review 本身没问题，问题是它在**替代** anchor 而不是补充 anchor。
一份 review 是模型对模型声明的声明；它无法把 `status` 从"信念"变成"事实"。

### 2.2 装机状态

**事实。** `ubp --all --global -d` → **6/6 runtime 全部 degraded**：

| Runtime | 报告 |
|---|---|
| claude | `PROVENANCE_MISSING`、`PLUGIN_MANIFEST_MISSING`、`SKILL_MISSING` ×14、`HOOK_MISSING` ×6、`DELEGATION_RUNNER_MISSING`、`EXECUTION_DRIVER_INSPECTION_FAILED`、`HOST_PLUGIN_NOT_DISCOVERED` |
| opencode / codex / kimi / grok / zcode | `PACKAGE_VERSION_MISMATCH`（codex 另有 `HOST_PLUGIN_NOT_DISCOVERED`） |

**推断。** 这说明"跨 harness 协作"这个 V2 目标目前不成立：主力 host 上完全不在，
其余 5 个是陈旧安装。但 owner 实际是直接在项目的 `.ultra/` 上工作的，
所以**装机 degraded 不一定是体验痛点的主因**，不要把它当作首要修复项。

### 2.3 入口面

**事实。**

| | V1 | V2 5.0.2 |
|---|---|---|
| 入口 | 9 个 command | 14 个 skill |
| description 写明"只由其他 skill 调用"的 | — | **5 个**：`ultra-review` / `ultra-tdd` / `ultra-think` / `ultra-grilling` / `ultra-domain-modeling` |
| 设了 `disable-model-invocation` 的 | — | **0 个** |
| 指令重量 | — | 2,395 行 SKILL.md + 46 个 reference = 5,289 行 |

**推断。** 入口和子程序混在同一命名空间：模型可能在没有 caller 上下文时激活一个子程序；
owner 看到 14 个可敲命令而其中只有 9 个说得通。
**这是真实缺陷，但不是 owner 报告的痛点**，优先级低于 §6 的六条。

### 2.4 版本节奏

**事实。** `0.26.2`(2026-08-04) → `3.0.2`(08-18) → `5.0.0`(08-26)，**22 天两次大版本**。
5.0.2 发布之后，08-31 至 09-02 又产出 **124 KB**（126,856 bytes，三份）vNext 架构提案，
外加 24 KB 独立三方评审。
`docs/wip/` 当前有 5 个未收尾文件（本文档使其成为第 6 个）。

## 3. 一个洞如何产生全部症状

**推断（诊断链条）。**

| Owner 报告的症状 | 机制 |
|---|---|
| "完全不确定这是不是我要的" | 系统里没有能裁决它的东西。`status` 是模型声明，330 份 review 是模型对模型声明的声明 |
| "不知道开发推进到哪了" | 进度 = 那些 `status` 字段。模型写的字段反映**模型的信念**，不是环境的状态 |
| "research 阶段看不到终结点" | 终结点必须是对某个**可检查对象**的谓词。没有可检查对象 → 终结点只能是"模型觉得够了" |
| V1 的"局部完善但整体断层 + 静默失败" | 同一个根：`trace_to` 指向散文，**散文检测不出漂移**，局部完成永远汇总不成全局检查 |
| V1 的"五到七代后文档完全失配" | 每次 research 落 22 份编号散文文档，它们是行为的第二份副本，会随代际漂移而开始说谎 |

**先例（外部证据）。** 同一失败模式在本机 `ultra-goal` skill v2.8.0 里被逐字命名过：

> `Stop condition left to the agent's judgement | "Good enough" drifts toward whatever ends the turn | Anchor command plus a turn ceiling`

以及：

> *"The script or prompt is the only description of what the thing does; a second prose copy of it goes stale and starts lying."*

引用它是因为**这条失败模式已经被写下来过**，不是要把 `ultra-goal` 引入 V2。

## 4. Hook 污染：它是代偿，不是独立缺陷

**事实。** `hooks/mid_workflow_recall.py`（47 行）注册在 **PreToolUse**，
docstring 为 *"Recall current acceptance before a source-reading or editing tool call."*
核心逻辑：

```python
parts.append(f"Ultra task {task.get('id')} acceptance reminder:\n{sections['acceptance']}")
emit_context("PreToolUse", "\n\n".join(parts))
```

**每一次读文件或改文件都注入一遍完整 acceptance section**，没有预算、没有截断、没有去重、
没有 once-per-session 标记。

**事实。** `hooks/session_context.py`（741 行）与 `hooks/_common.py` 的注入上限：

| 常量 | 值 |
|---|---|
| `NORTH_STAR_SNAPSHOT_MAX_BYTES` | `8 * 1024 * 1024`（8 MiB） |
| `PROJECT_BRIEF_SNAPSHOT_MAX_BYTES` | 8 MiB |
| `TASK_LEDGER_SNAPSHOT_MAX_BYTES` | 8 MiB |
| `TASK_CONTEXT_SNAPSHOT_MAX_BYTES` | 8 MiB |
| `ACTIVE_CHANGE_INTENT_SNAPSHOT_MAX_BYTES` | 8 MiB |

且 `session_context.py:654` 明写 `"SessionStart ceiling; semantic truncation is forbidden."`

8 MiB 是文件大小的合理性检查，**不是 context 预算**。

**推断，且这一条改变了修复顺序。**
这些注入是**代偿**：当系统里没有任何机械可判的东西时，唯一还能压住质量的杠杆就是不停提醒模型。
**先删提醒、不补 anchor，质量会掉**，而且会被误读成"删错了"。

正确顺序：**先补 anchor → 提醒失去存在理由 → 再删。**

**推断（方向错误）。** 注入的方向也是反的：
**模型每次工具调用都被推送状态；owner 必须手动敲 `ultra-status` 才能拉到状态。**
焦虑的一方拿不到信息，不焦虑的一方被灌满。

## 5. 与 vNext 设计的关系

**事实。** 三份 vNext 提案（124 KB：`target-architecture-r2`、`agentic-software-factory-candidate`、
`three-stage-delivery-state`）加那份独立评审的术语密度。
**测量范围排除本诊断文档本身**——它也谈这些词，算进去会污染这张表：

| 执行层 | 次数 | | owner 可读性 | 次数 |
|---|---|---|---|---|
| Supervisor | 103 | | 认知负荷 | **0** |
| Attention | 93 | | 终结点 | **0** |
| grant | 74 | | legibility | **0** |
| worktree | 50 | | convergence | **0** |
| wake | 49 | | "how many" | **0** |
| ACP | 35 | | 收敛 | 4 |
| Run Slice | 25 | | 进度 | 2 |

`terminal` 出现 49 次，但抽样核实全部是执行态语义
（`terminal success`、`typed terminal result`、`wave_terminal`、`terminal result.json`），
**不是 owner 意义上的终结点**。

**推断。** 约 380 处在讲机器怎么跑，约 10 处涉及 owner 能否看见自己在哪。
三次架构迭代没有解决 owner 的痛，是因为**三次都没有瞄准它**。
本文的六条改动与 vNext 不冲突——它们在 schema 和 CLI 输出层，vNext 在执行层。

## 6. 改动清单（按依赖排序，均不需要重构）

### ① 给 task 加一个可运行的 anchor 字段 —— 唯一的地基

```jsonc
{
  "id": "...",
  "anchor": "<shell command>",   // 新增
  ...
}
```

语义**只看退出码**：

| 退出码 | 含义 |
|---|---|
| `0` | 这条行为为真 |
| 非 0 | 不为真 |
| 命令不存在 / 跑不起来 | **`unknown`，不算绿** |

最后一行是防静默失败的关键：当前系统里"没测到"和"测过了"长得一样。

一次性解决三件事：终结点（绿了就是完）、进度（几条绿 / 共几条）、静默失败（`unknown` ≠ `green`）。

### ② `status` 改为派生量，模型不得直接写

现状 `status: completed` 是模型声明。改为 anchor 退出码的投影。

依据：**退出码是 fact，"我觉得做完了"是 meaning。当前实现正好把两者搞反。**

治："完全不确定这是不是我要的"。

### ③ research 的终点 = 每条 acceptance 都有一条可运行的 anchor

不是"问完 N 题"，不是"产出 22 份文档"。
写不出 anchor 的 acceptance 不是 acceptance，是愿望——退回改写或丢弃，并记一行 decision。

**认知负荷的处理方式**：owner 只需回答"怎么算做到了"，
把它翻译成命令是模型的活。配套两条提问判据：

1. owner 答错了，系统会**错**，还是只是**不一样**？（只是不一样 → 模型自定，记为可回滚假设）
2. 模型能不能从仓库 / 依赖 / 官方文档查到？（能 → 必须自查，不得提问）

治："research 无休止 / 不知道还有几步"。

### ④ 一行 owner 可见的进度

V2 是 CLI，每个 skill 收尾打印一行即可，不进模型上下文：

```
[chg-converge] anchor 4/9 green · 2 unknown · decisions 12 (agent 5) · next: <一句>
```

治："不知道推进到哪了"带来的失控感。

### ⑤ 然后才删 `hooks/mid_workflow_recall.py`（47 行纯删）

**必须在 ①②③ 落地之后**，理由见 §4。
同时把 `session_context.py` 的注入从 8 MiB 文件上限改为真正的 context 预算。

### ⑥ 330 份 review 降为按需

有了 anchor 之后，review 该审的是 **anchor 证明不了的东西**，
从"每个 task 六种"降到"anchor 绿了但仍有风险时才做"。

### 不在本清单内（已知缺陷，但不是 owner 报告的痛点）

- 5 个子程序 skill 缺 `disable-model-invocation`（§2.3）
- 6/6 runtime degraded（§2.2）
- 14 → 9 个入口的命名空间整理

## 7. 待决：anchor 挂在 task 级还是 acceptance 级

| 选项 | 改动量 | 进度粒度 | 风险 |
|---|---|---|---|
| **task 级** | `tasks.json` 加一个字段 | "30 个 task 里 12 个绿" | 一个 task 标绿但其下某条 acceptance 从未被测到——**这正是 V1"局部完善但整体断层"的机器形态** |
| **acceptance 级** | schema 改动更大，且要求 research 阶段就把 acceptance 拆到可测粒度 | "9 条 acceptance 里 4 条绿" | 若 task 平均只对应一条 acceptance，则是多余精度 |

**推荐：acceptance 级。** 它直接产出 owner 要的"还差几步"，
而 task 级只能告诉 owner"这个 task 模型认为完了"。

**会改变推荐的证据**：统计 `.ultra/contexts/task-*.md` 里每个 task 的 acceptance 条数；
若普遍为 1，则 task 级足够。**此统计尚未执行。**

## 8. 刻意未做

- **未写任何代码。** 本文档只是诊断与计划，等 §7 裁决后才动 schema。
- **未统计 acceptance 条数**（§7 的判据），因为它只在 owner 倾向 task 级时才需要。
- **未处理 6/6 degraded 装机**，理由见 §2.2。
- **未整理 14 → 9 入口命名空间**，它是真实缺陷但优先级低于本清单六条。
- **未触碰 vNext 三份提案**，本文与它们正交。
- **未做 V1 ↔ V2 的 A/B eval。** "V2 比 V1 差"目前仍是 owner 的体验报告，没有基线数据支撑。
  本文的诊断是从制品结构推出的，不是从 eval 推出的。
- **`docs/wip/` 现有 6 个文件**（含本文）。按 owner 手册，空的 `docs/wip/` 才代表无遗留。

## 9. 复查方法

所有数字可用以下命令重跑（工作目录为本仓库根）：

```bash
# §1 task schema 无可运行字段
python3 -c "import json;d=json.load(open('.ultra/tasks.json'));print(len(d['tasks']));print(sorted(d['tasks'][0].keys()))"
grep -coE '"[a-z_]*(anchor|command|verify|gate|check|cmd)[a-z_]*"' .ultra/tasks.json

# §2.1 review vs verification
find .ultra -name "review-*.json" | wc -l
find .ultra -name "verification.log" | wc -l
find .ultra -type f | wc -l

# §2.2 装机状态
ubp --all --global -d

# §2.3 入口面
ls -1 skills/
grep -rl "disable-model-invocation" skills/ | wc -l
wc -l skills/*/SKILL.md | tail -1

# §2.4 版本节奏
grep -E "^##? \[?[0-9]+\.[0-9]+" CHANGELOG.md | head -12
ls -lt docs/wip/

# §4 hook 注入
cat hooks/mid_workflow_recall.py
grep -nE "MAX_BYTES|truncation" hooks/session_context.py hooks/_common.py

# §5 vNext 术语密度 —— 必须排除本诊断文档，否则数字被自身污染
for k in Supervisor Attention grant worktree wake ACP "Run Slice" \
         认知负荷 终结点 legibility convergence "how many" 收敛 进度; do
  printf "%-13s %s\n" "$k" \
    "$(grep -ri --exclude='*owner-experience-diagnosis*' "$k" docs/wip/ | wc -l)"
done
```
