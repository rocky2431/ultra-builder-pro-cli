# Stage A final delta Review — REQUEST_CHANGES

2026-09-05。审查者 Codex；实现者为实际 ZCode。审查对象是基线 `2e3273bf12f6493b3201fad3d9d1b802ae367a4f` 上的 repair 2 未提交候选。冻结安装清单 SHA-256 为 `d5f908825e62703af0fd491b880c8f85230c5151eed2b91689e379396dbf0d93`。本轮包含源码验证、独立前向检查和真实 provider 旅程，不把它们分拆成新的修复预算。

**阶段 A 未通过，不能作阶段提交，也不能进入阶段 B。** 初轮加两次 delta Review 已用完；语义结论是 REQUEST_CHANGES，执行状态另记 `owner checkpoint / budget_exhausted`。预算本身不产生质量结论，也不抹掉已完成工作。

## 结论与剩余阻断

| Finding | 级别与状态 | 观察 | 下一步 |
|---|---|---|---|
| A-R1 至 A-R4 | 已闭合 | 原生提醒输出、连续去重、普通进度表达和评测入口已修正；本轮未观察到这些源码修复回退 | 保留既有证据，不重复修复 |
| A-R5 | P1，部分修复，仍 open | candidate2 A/C 不再伪造新 North Star 采纳；但 A 仍把模型选定的“不联网”记为 `owner-set` | 修正事实来源与技术选择的实际写入入口，不把技术默认变成新的 Owner 门槛 |
| A-R6 | P1，new | 新会话已有本次实施授权，仍把旧 Grant、未采纳 North Star 与旧 Change 收尾扩大为停止新功能的条件 | 对齐当前显式请求与跨步骤自动续行的授权语义，沿实际 Change/Grant/Route 调用路径修复 |
| A-R7 | P1，评测边界缺口 | A 红测试实际写入并删除真实 HOME 数据文件；最终产品 guard 已修，但失败测试本身没有独立隔离，恢复原状的说法无前状态证据 | 下一次运行前先证明失败测试也不能触及真实 HOME；保留事故及前状态未知，不修饰为无事故 |
| A-R8 | P2，记录而非自动修复 | 冻结的标签/分组 probe 未问，也未找到明确推迟理由 | 记录 `missing_necessary_decisions=1`；不为追求零遗漏把所有小工具都变成强制问卷 |

## A-R5：采纳没有再伪造，但约束来源仍失真

candidate2 A 的 `.ultra/north-star.md` 保持 `unresearched` / 接受来源 `none`，旁边候选保持草稿。第二轮展示 v1 范围后，第三轮“继续，把它做完”可以作为该已展示范围的自然接受，不应再次索要魔法词。candidate2 C 的明确 bug 请求被投影为 accepted Change、session-local Grant，也不能仅因产生内部文档就判为伪造采纳。

但 A 的 `.ultra/specs/product.md:126` 把“plain file, no database, no network I/O”整组标为 `owner-set`。冻结原话仅有单人、终端、先记录/查找、名字部分匹配、存储格式由 Agent 选择、不要数据库；禁止联网没有 Owner 来源。第 110 行还把同步等能力描述为与单人本地框架矛盾，这比“当前不实现”的技术/范围选择更强。未发布 accepted North Star 降低了影响，不能使错误归属变真。

证明：读取 `candidate2-A-final-artifacts/.ultra/specs/product.md:100-128`，对照 `tests/evals/owner-journeys-2026-09-05.json:59-67`。前者在下述原始证据根中保留原 bytes。本轮独立 reviewer 同样指出来源问题；Codex 以实际文件裁决，未以模型一致代替证据。

## A-R6：当前请求被旧流程关口阻断

实际 candidate2 B 首轮 delegation `58a79097bba34a05a97ae13a96d52a06`，native session `sess_f621ee15-dcb0-4ebb-9adf-c1c586e06e63`，547.442s，`success/end_turn`。输入 `candidate2-B-turn1.md:3` 明确授权当前项目的实现与非破坏性本地验证，第 11 行是新增食材过滤的当前 Owner 请求。Agent 却把新功能列为“全部待授权后进行”，要求先接受旧的名字搜索 North Star、重新激活旧 ledger，再单独批准归档。源码、原 A 测试和 README 均与输入 HEAD 完全相同，食材过滤没有实现。

最强反证也成立：旧 session-local Grant 确实不能跨会话继承（`skills/ultra-change/references/execution-grant.md:11-15`），正式 Task Review 确实需要 accepted North Star（`skills/ultra-review/scripts/review_wait.py:914-917`），回复也提供了“并入 v1”的备选。故不能把问题写成“唯一允许归档”，也不能通过关闭真正的采纳/归档关口来修复。

问题是旧自动续行权限与**当前显式请求的执行授权**混在一起。Research `SKILL.md:174-183` 已允许有界授权实现继续，但实际 B 只调用 Change，并读取 Grilling、Grant、Route、Review、Deliver；未调用或读取 Research 的这段说明。Change `SKILL.md:28-37,50-52`、Grant `references/execution-grant.md:39-52` 与其消费路径需要共同说明何时是当前请求，何时是依赖旧 Grant 的自动续行。只在 Research 再增加一段提醒不足以修复这个入口。

现有记录没有结构化食材字段，询问“如何表示食材”有实际产品依据。可暂停依赖该答案的动作；不能把这个合理问题排到旧流程全部批准之后。Codex 没有给冻结输入补答案。

证明：`candidate2-B-turn1-receipt.json:assistant_text`、`candidate2-B-relevant-tool-observations.json`、`candidate2-B-independent-disposition.json`。可用下列只读命令重新检查当前产物是否变化：

```bash
git -C /tmp/ubp-owner-journeys-ynsz0724/candidate2-B diff HEAD -- recipes.py test_recipes.py README.md
```

B2/B3 未运行：已确认 wrong refusal，且评测隔离缺口未闭合，因此该候选运行记 `abandoned_after_turn1`。这不证明后续回合不可能恢复；食材/导出/help/第三轮回归的最终产品结果仍为未完成，不能填 PASS。B 出现一个仅忽略 Python cache 的 `.gitignore`，所以也不声称全程零文件写入。

## A-R7：真实 HOME 事故与测试边界

A 的 T3 红测试去掉 `HOME` 和 `RECIPES_FILE` 后执行实际 `add 随便`。旧实现使用 `Path.home()`，通过系统用户目录回退写入 `/Users/rocky243/.recipes.json`。原生调用 `call_060720569db2479383ddd332` 显示一个 156 bytes、仅含合成菜谱的文件；随后 `call_85ee6ac090e34c118b137e77` 删除该文件。当前不存在，最终产品缺 HOME guard 已独立验证为 exit 1。

**没有运行前的文件存在性/内容记录，不能证明完全恢复原状。** 源写入历史显示旧实现会读取并追加已有有效集合；观察到单条合成记录限制了可能的历史状态，未发现非空菜谱丢失的证据，但不能排除此前存在空集合文件。因此不升级为“已证实数据丢失”，也不降级为“恢复已证实”。本事故已向 Owner 报告。

两个尚未解决的问题：

- `candidate2-A/test_recipes.py:283-288` 在测试失败时仍可能再次命中系统 HOME；`tmp_path` 参数未用于该命令的独立约束。最终实现的 guard 不能充当测试隔离。不要重新执行危险的红版本。
- `.ultra/contexts/task-v1-t3-contract-docs.md:89` 声称此前不存在且完全恢复，证据不足。本报告及评测结果追加更正；原会话、原任务文档作为证据不覆盖。若以后恢复使用该样例，应先把更正带入消费路径。

Codex 操作者也承担评测环境选择责任：临时 cwd 和配置、native `--mode yolo` 都没有建立 OS 文件写入边界。修正应先以无害临时目标证明有效隔离，再运行候选；不得拿真实 HOME 文件作哨兵，不增加新守护进程或假装改 HOME 环境变量就能隔离系统用户目录回退。冻结的旧样例不补代码冒充原候选通过。

证明：`candidate2-A-home-incident-commands.json`、`candidate2-A-source-write-history.json`、`candidate2-A-final-artifacts/.ultra/evidence/v1-t3-contract-docs/red-t3.txt:30`、`candidate2-A-independent-product-final.json`。

## 独立验证与限制

- repair 2 第一次 `TMPDIR=/tmp npm run verify:release` exit 1：718/722 Node，3 个实际失败加父级计数；受影响的 delegate/runtime/test bytes 与基线相同。独立基线同命令 exit 0，712 Node +89 Hook。
- candidate 原命令再跑时 722 Node +104 Hook 全过，最后 npm audit TLS 建连失败使命令 exit 1；仅重试 audit 后 exit 0 /0 vulnerabilities。不能写成该次完整命令 exit 0，也未彻底定位首次计时/锁失败。
- 4 个累计变更 Skill 的官方 validator、diff check、pack dry-run 通过；142 个 package entries，不含 work/WIP/runtime。六 Host 的只读 Doctor 仍 degraded，issue 集合与基线一致；没有真实 HOME 安装修复。
- candidate2 A：18 tests 与实际 add/find/list/help、跨进程 JSON 持久化通过。C：4/4 tests，冻结断言与 export/README/package 未改。A/C 产品可用不等于正式工作流 closeout，unborn HEAD 与未完成采纳仍分别披露。
- baseline B：42 tests、原 A 25 tests、过滤和导出功能通过，但默认覆盖已有导出文件，必要决定 probe 失败。旧 candidate A 伪造采纳、首轮 timeout 与旧 B 提前退出全部保留。
- 运行均为冻结脚本输入 + 实际 ZCode 0.16.5 / GLM-5.2 provider。小样本不支持普遍生产率、Owner 主动时间或费用收益；后两项仍 unknown。原生 CLI resume 不能宣称 ACP resume 资格通过。

原始证据根：`.ultra/.runtime/owner-factory-implementation-20260905/owner-journeys/`。可提交的摘要与 102 份证据文件哈希在 `stage-a-journey-evidence-index.json`；源码验证汇总在 `.ultra/.runtime/owner-factory-implementation-20260905/stage-a-repair-2-independent-verification.json`。原始流为 ignored 本地证据，不发布。

## 收敛处置

当前采用的预算来自仓库 `skills/ultra-review/SKILL.md:181-201`：初轮加至多两次 P0/P1 delta；剩余阻断须返回 Owner，不能自行续预算。Owner 已授权完整方案的实施和阶段提交，未给本阶段另一个确切 Review 上限；这里不能把 Codex 自己的 task-state 当新授权。也不能通过把同一缺陷换名成阶段 B 来逃避本阶段验收。

具体追加方案已写为 `stage-a-additional-repair-proposal.zh-CN.md`，但没有激活 Writer。它处理已观察到的入口冲突和评测隔离，不重做三轮研究、不扩大产品工厂范围。当前代码保留待审；只有阶段通过后才由 Codex 创建详细 commit。
