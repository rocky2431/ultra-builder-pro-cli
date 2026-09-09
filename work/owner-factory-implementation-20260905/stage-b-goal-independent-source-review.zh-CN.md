# Stage B UltraGoal 独立源码审查

2026-09-06。结论：**接受本次 Goal 分项改动，未发现需要阻塞合入的 P0/P1。** 这不是整个 Stage B、工厂三阶段或任何宿主无人值守生命周期的完成声明。

## 范围与基准

- 审查目录：`/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill`；基线 `21495b62a0fc81ac5c5bf7f71dea53ab5b4a57d3`。
- 已读取完整八文件 tracked diff、Kimi 交接及对应原始日志；对照[已接受方案第 107 行](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/docs/wip/owner-factory-debate-20260905/final-plan.zh-CN.md:107>)和[实际委派任务](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/work/owner-factory-implementation-20260905/stage-b-kimi-goal-mission.md:9>)，继续追踪实际校验与完成消费者。
- Codex 未修改 UltraGoal、测试、状态或原 checkout；唯一写入为本审查文件。没有重跑全量测试、安装或提交。

## 已闭合的行为与证据

1. **同厂商提示不再误拒附件；必需 Review 未被替代。** [validate_artifact.py:816](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/plugins/ultra-goal/skills/ultra-goal/scripts/validate_artifact.py:816)仅把 `SAME_VENDOR_REVIEW` 改为 advisory；角色字段、实际 target、分歧分类、轮次与 worker outcome 检查仍在。用 `rtk proxy python3 -B -` 分别在内存加载 `git show <base>:.../validate_artifact.py` 与当前文件，对同一已发布 delegation sample 将 critic target 从 kimi 替换为 codex，再调用实际 `check_delegation` 和 `Report.ok`，输出为：

   ```text
   baseline: [('SAME_VENDOR_REVIEW', 'error')] report.ok=False
   current:  [('SAME_VENDOR_REVIEW', 'advisory')] report.ok=True
   ```

   本检查未写任何 artifact 或测试文件。Kimi 的 [CLI 前后记录](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/docs/research/2026-09-06-factory-graph-correction/after-same-vendor-exit0.log:1)另外记录当前提示仍输出且 exit 0；[聚焦测试第 341 行](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/tests/test_validate_artifact.py:341)同时断言 severity、`report.ok`、CLI 退出码和提示 code，不只是删除旧断言。

2. **完成条件没有弱化。** [goal_contract.py:45](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/plugins/ultra-goal/skills/ultra-goal/scripts/goal_contract.py:45)仍要求每个 Acceptance ID 有明确覆盖；[第 157 行](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/plugins/ultra-goal/skills/ultra-goal/scripts/goal_contract.py:157)起仍检查允许的 verifier、不同于运行会话的 session、当前输入摘要、覆盖、pass 与逐项证据。[goal_stop.py:868](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/plugins/ultra-goal/skills/ultra-goal/scripts/goal_stop.py:868)继续实际调用 protection/review 检查；冻结规格、候选消费、当前 Anchor 及运行后复查路径均保留。四个核心文件与基线逐字相同，见下表。品牌 advisory 不是 required-review PASS，也没有新增作者自审分支。

3. **文档与样例的主要能力声明有实际对应。** Skill 入口、两个 reference 和 eval 9 已共同纠正 graph/loop 二分；成本倍数恢复为 [research-basis.md:101](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/plugins/ultra-goal/skills/ultra-goal/references/research-basis.md:101)所列具体工作负载与比较口径。未重复联网研究，也不把其论文数字视为本项目测量。[workflow-script.js:1](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/plugins/ultra-goal/skills/ultra-goal/assets/workflow-script.js:1)明确只是附件；[实际消费者第 379 行](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/plugins/ultra-goal/skills/ultra-goal/scripts/validate_artifact.py:379)检查 meta/phases/anchor，随后只有 `node --check`，没有引入执行引擎。`confirmed` 不被计为 Goal 完成。原 delegation attachment 已保留相同目标合同、独立 verifier 与证据保留，不需要为完成本任务重复重构。

4. **验证证据与其范围一致。** `rtk git diff --check <base>` 通过。Root 的[独立套件日志](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/.runtime/owner-factory-implementation-20260905/stage-b-goal-independent-tests.log>)结尾为 `Ran 441 tests in 31.033s / OK`；本 reviewer 读取确认，未重复运行。命名会话、cancel/close 的 0.2.0 声明与保存的 [命令面观测](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/docs/research/2026-09-06-factory-graph-correction/agent-delegate-0.2.0-capabilities.log:1)一致。交接明确没有真实跨厂商续跑或 workflow runtime 资格，因此不能从 help、结构校验或绿色套件推出这些能力已端到端验证。

## 比例适当的保留项

- **P2，概念更正后的遗留措辞。** [README.md:151](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/README.md:151)、[中文 README:108](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/README.zh-CN.md:108)仍用运行时 loop / 提前路由 graph 简述两个例子；[ACCEPTANCE_ORDERED 提示第 642 行](/tmp/ubp-factory-stage-b-l7dd0y3s/ultra-goal-skill/plugins/ultra-goal/skills/ultra-goal/scripts/validate_artifact.py:642)仍说 author-time decomposition 属于 graph。它们可能重新带入已经纠正的二分。反证与影响界限：README 同段说明共享合同和宿主执行；校验分支只匹配 `## Acceptance` 中的 numbered list，而 Goal 本来就要求带唯一 ID 的 checklist，未据此发现合法动态图或确定循环被拒绝。最小后续是同步措辞，不放宽 Acceptance schema，不新增运行机制；不作为本次源码合入阻塞。
- **独立性的真实边界仍由宿主承担。** `goal_contract.py:139–144,199` 已明确 verifier/session 是声明字段，摘要和引文不认证实际身份、输入隔离或语义正确性。本次 checks 未改，新增“contract checks”措辞应按这一原有界限阅读；不能推广为独立性已由本地 JSON 自动证明。
- **现有 Skill Creator 兼容性残余。** Root 报告官方 validator 拒绝既存 `when_to_use`。本 reviewer 逐字比较本次基线和当前 SKILL frontmatter，确认完全相同；这不是本次图与 Review 修正引入的回归，也不应升级为无关重构门槛。
- **并发版本整合不在本快照的证明范围内。** Root 另行处理原 Goal checkout 的 2.15.2 安装路径修正；以下哈希绑定 Kimi 冻结基线上的版本。整合时保留新的 metadata/安装修正，不能用本文哈希冒充整合后字节。原有真实宿主生命周期限制和工厂后续资格仍保留。

## 审查绑定 SHA-256

路径相对于本次 UltraGoal worktree；左右为基线字节和本次审查字节。

| 文件 | 基线 SHA-256 | 审查 SHA-256 |
|---|---|---|
| `plugins/ultra-goal/skills/ultra-goal/SKILL.md` | `95dbf1526de1bc9bd53bf0ec16876e9d78c3fe51e209bc6b7a6b1dab7a4c82e2` | `f3f6a4c4276456143fc6ebc077d5c76785d1851827b306e9e44c0daae68ad45e` |
| `plugins/ultra-goal/skills/ultra-goal/assets/workflow-script.js` | `a14fb068ef37711499339e92eae27e4703e515f4d04c7a44853abaa238a9f689` | `371cc3aa6b01af416db6b005f5a215ade62086b71f2e36638420328efdf60d9e` |
| `plugins/ultra-goal/skills/ultra-goal/evals/evals.json` | `e9d34042d2906eec02049c26bfe0c6acc2368f2ad71c399beea0f5120fc4744b` | `5a4f93950841e1058cf5efea887f1ce9613c4c771363d8c81f8e04adf2c2e561` |
| `plugins/ultra-goal/skills/ultra-goal/references/agent-modes.md` | `8f2c39d856966b613dc18022eecfa68d50226b862a42d246be63ec5a87232dd6` | `9b80faf1a3dfa941d67e762a34ff8df391b655e37a2dd446ac9f16b14d4bfb20` |
| `plugins/ultra-goal/skills/ultra-goal/references/graph-topology.md` | `70f5d8727f59cf062b689605e0658bdb90cb1c50ca2b2480a644bba5ba5c091f` | `c25acd4af4948340190abde47bd08530a244ce3c7baf6aff22131659962cf565` |
| `plugins/ultra-goal/skills/ultra-goal/scripts/validate_artifact.py` | `c7ec13d0794e3c25a30ee4620f5b039e327cc573edeb90231d7c73db0a60ad08` | `fe19994860bdd566a76a3e00ababa58cd42bf2164c25717f367db3c2ad781b68` |
| `tests/test_package_surface.py` | `46da8fbfc42bdcfdb718cc4aac5f26d5d213cd37be64cdcfb0a8de7a8f0380bd` | `b75b250e9ff8b0aea4539229f67196d38ce340da0a270f9630ccd7e8e456bf2c` |
| `tests/test_validate_artifact.py` | `71f688d7a1b03e4b30159aefd8ff6d806473614e24da596fbfce75bfcaa7fc12` | `d7c1b73e72bcb76cdd78d29b7487617705e311a363b7202286ee46f58f44a0f9` |

未改变的完成与恢复消费者（基线 = 当前）：

| 文件，均在 Skill 的 `scripts/` 下 | SHA-256 |
|---|---|
| `goal_contract.py` | `2249dd868994d36ce3f1d00becc012b012223189d0196c2d359ff27748bce4ee` |
| `goal_stop.py` | `5e6b7298c57dac4dc2d7dec5184a72189745f79d4b804f8cf80f8ec5727610de` |
| `goal_hooks.py` | `e280bc31b337648a33859740fc6719724a842e5ebef5926819f3b5db464f0386` |
| `goal_run.py` | `1e00bdb302854b438a44a7bf507515d2566e8ae37f0f2cce770f5f62b29e4c95` |
