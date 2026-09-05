# Stage A repair 2 独立前向检查

2026-09-05，Codex 独立子审查 `/root/stage_a_skill_forward_check`。审查读取冻结源码，没有读取 ZCode handover 或 live-findings 结论，没有改文件或调用 provider。这是模拟前向行为检查，不是实际产品验收。

| 输入条件 | 审查返回的动作 | 来源 |
|---|---|---|
| 只有初始需求和实施授权，新候选从未展示 | 返回草稿与一次自然语言接受问题；不产生接受记录；删去无 Owner 依据的禁止联网和未来必须新建 Change 限制；继续已有授权覆盖的工作 | Grilling 112–122、135–142；Research 146–153、174–183 |
| Owner 自然接受同一未变候选 | 复用“就按你这版做，存储格式你决定，不用数据库”，不要求魔法词或二次接受；无时间戳时不补造 | Grilling 21–25、112–115；Research 146–148；north-star-v2 29–35 |
| Owner 否决联网限制 | 删除限制的决定不再询问；展示修订差异，草稿不继承旧版接受；已有授权工作继续 | Grilling 112–122；Research 151–153、174–178；99-synthesis 28–35 |
| 委托选择存储格式，禁止数据库 | 不用数据库是 Owner 约束；JSON、目录与当前本机运行是模型技术选择，不产生新的接受门 | Research 111–115、180–183；route-contract 82–84 |
| 已有 active Change 上增加食材过滤 | 合理下一步为同一 change_id 的 reconcile，保留名字搜索，无强制归档前置；实际公共模式续行仍核对现有授权 | Change 17、20–24、35–37、50–52；execution-grant 21–23、41–48、80–83 |

审查未发现读取范围内迫使五例错误接受、重复接受、冻结全部授权工作或强制归档的直接矛盾。Research 公共检查点仍须完整 Route Card；以上短回复不能代替完整公共调用的验证。

九个读取源的前后 SHA-256 相同：

| 源路径 | SHA-256 |
|---|---|
| skills/ultra-grilling/SKILL.md | 1a637954c4aa95e2e4aab2daa89c97d0c8f5c7e289bf93db0266dd1fc70ed2a4 |
| skills/ultra-grilling/references/reframing.md | 97b3065ce4d58d1f1c162f87428fa66138033fb7c7f7cb4b8355ecb8e4ce646e |
| skills/ultra-research/SKILL.md | 820b0012d19a719b3d9d585e5c53ddee87222a93b33a386e0b265e2be83f3f17 |
| skills/ultra-research/references/north-star-v2.md | 9540dd5ff92318f255e37ca989cb68f05c477bda781e9066b9ea29286aa1ad1d |
| skills/ultra-research/references/99-synthesis.md | 3a719152f186ab00bcb6b72cf150b9f3e2fe933ba65e74f70f84eb045c79bfea |
| skills/ultra-change/SKILL.md | b29084f9781fc5a2351531a11adf6ba32f1d26dece012731daac90b04f427fd8 |
| skills/ultra-change/references/change-contract.md | b6430d27a75bd0308f3192d5affec21cf60abc13c07128421fa7a4e683600d7e |
| skills/ultra-change/references/execution-grant.md | e141bfef2b4d484cf04c22a5b9b7462a3572d47ea3c67628a968ad2f489c7a11 |
| skills/ultra-status/references/route-contract.md | 13fc5640fc9fe9f4bda610daffb040dd64a7648eb14a5e32b6561e23b6137067 |

结论：允许进入已授权的实际 provider 评估，不单独关闭 A-R5，不构成 Stage A 接受。

## 已完成 C 旅程的独立行为复核

同一独立审查者另行读取 baseline C 与 candidate2 C 已结束的真实对话和必要工具输出，没有读取 Codex 产品 verdict，也未重跑测试。

- 两组没有重问已知 bug 症状；冻结 `missing_probes=[]` 对应遗漏计数均为 0，但不表示所有正式流程决定已解决。两组均保留红 2/4、绿 4/4 原始输出，未发现产品层面的错误完成或误拒；formal closeout 均未完成。
- baseline C 的 `.ultra/decisions/2026-09-05-baseline-north-star.md:8` 明说采纳来自 delegation grant、不是逐检查点确认；第 15 行将初始修复请求填为 `Exact raw owner acceptance`，随后 North Star 被标 accepted。candidate2 C 则保留 North Star `unresearched`、接受来源 `none`，无新接受记录。
- candidate2 C 走直接 Change 修复路径，因此该样本并未覆盖所有新候选采纳路径，也没有触发 JSON/联网等技术默认选择。不能据此宣布所有语义问题消失。
- 两组都如实说明 unborn HEAD 与 Worker 禁 commit 阻断了正式凭证链。candidate2 的 `test-report.json` 仍是初始化占位，不能当完成报告；“外部评审人即可解决”也没有证明能消除 HEAD 身份缺口。

Codex 裁决：candidate2 C 的 Change `status: accepted` 本身不构成错误。已读该 intent：它直接复用 Owner 明确的边界修复请求，限定本次源码与验证，Grant 为 session-local；没有引入跨会话授权或把新战略当已接受。不能要求 Owner 为每份内部投影重新逐字审批。新合成 North Star 的采纳仍必须另有对应依据。

定位：测试根 `/tmp/ubp-owner-journeys-ynsz0724`，两组 `*-C-turn1-receipt.json:assistant_text` 与 `*-C-turn2-raw.jsonl:type=result/response`；candidate2 原始一致性工具输出在 turn2 JSONL 第 556 行，baseline 在第 835 行。行为复核与 Codex 独立最终 4/4 产品检查分别保留。

## 已完成 A 及 B 首轮的独立实际行为复核

同一 reviewer 继续只读检查已结束的 candidate2 A 和 B 首轮，不写代码、不启动 provider。以下是真实产物复核，不再使用前向模拟作为通过依据。

- A 没有重问单人、名字部分匹配、无数据库；第三轮“继续，把它做完”回应已展示范围，是有效的自然接受。canonical North Star 未接受，草稿仍 draft/none，产品交付后才另问新 North Star，未再次伪造采纳。
- A 标签/分组仍在 project-brief 的问题列表中；product.md 仅排除标签搜索，未明确处置是否记录标签/分组。该冻结 probe 记遗漏 1。product.md:126 仍把包含“不联网”的 guardrail 记成 `owner-set`，约束来源问题未全部闭合。
- A HOME 事故的最终产品 guard 有证据；但 `test_recipes.py:283` 的负面测试本身没有独立隔离。task context:89 的“此前不存在／完全恢复”缺运行前证据，应追加更正并保留原始记录，不能无限要求重建不可证明的过去。旧 load/append 实现与单条合成记录限制了历史状态可能性，不能由此声称精确恢复。
- B 反方向证据：旧 session-local Grant 确实到期、accepted North Star 是正式 Review 要求，且回复提供了并入 v1 的备选，所以不能描述成“只能先归档”。但当前输入已经明确授权本次实现；把新功能全部列为待授权，仍是把旧正式流程缺口扩展成全局停止条件。
- B 现有记录没有食材字段，结构化字段与自由文本识别会得到不同结果，问食材如何表示合理。当前回复把这个产品问题推迟到旧流程批准之后。可暂停依赖真实答案的动作，不应要求先接受旧 North Star、完成旧 Change 全部收尾。

Codex 已逐一回读文件、当前输入、receipt 与实际工具调用，采纳上述有证据的结论。B 源码、旧测试、README 与其输入 HEAD bytes 相同，食材功能未实现；有新增 Python cache `.gitignore`，不称零文件写入。最终裁决见 `stage-a-review-delta-2.zh-CN.md`。
