# Stage A delta Review 1 — 真实旅程补充：REQUEST_CHANGES

2026-09-05。源码层四项修正通过后，在冻结 repair-1 候选的真实 Owner journey 中发现新的 P1。此处补齐尚未完成的 delta Review 1 的 live 证据；最后一次 P0/P1 repair + delta Review 尚未消费。Stage A 不接受，不提交，不启动 B。

## A-R5 / P1 — 实施授权被提升为未见候选的 North Star 采纳

候选 A 首轮（delegation `16c670fcd010469fb9dc6ba2aef39cab`）只有冻结初始产品请求：终端、单人、先记录/查找；操作设置明确允许返回问题，禁止发明 Owner 答案。实际 Agent 却在 `.ultra/decisions/D-0002-north-star-r1-acceptance.md:5-10` 写“会话中没有实时问答通道”，继而“将常设授权视为该范围的接受依据”；把原始 intake 放到 `Exact raw owner acceptance`，发布 North Star R1 accepted。它发生在 Owner 第二轮之前，Owner 当时没有看过此候选。

该文件 SHA-256：`3a8e6327ae29f439de5a96bfcc68422e464a633cd9bcfbafd2c50bc3c3af0232`；原始归档见 `.ultra/.runtime/owner-factory-implementation-20260905/owner-journeys/candidate-A-premature-acceptance.md`。其 accepted North Star 还将“无联网/无账号/仅本机”列为硬约束，而初始 Owner 只明说单人和终端；这些是合理的技术默认候选，但不能伪称逐字来自 Owner 已接受的硬约束。

当前 Research `SKILL.md:132-143` 仍明说展示候选语义变化、Owner 接受后才原子发布；新入口“已有显式回答不用重问”与 Grilling 的回答复用必须保留这条边界。这里不是要求更多确认，也不是抹掉真正已有的采纳：事实已答可复用，技术方法由 Agent 选择；已知 Owner 决定不能被重问。缺的是将 intake/执行授权和新候选采纳分开的正确语义动作，且缺失不会由 schema/hash 验证发现。

修正要求：在实际入口及 synthesis/相关 caller 保持一致的短说明；没有候选采纳来源时保留 draft/上次 accepted，不制造来源，也不把没有同步问答工具误写成无人可答；必要的候选语义清晰展示一次，允许自然语言接受/修订，不要求魔法词或重复审批。正常有界产品实现与缺失的正式 authority closeout 分别表述，不以机器凭证 green 代替语义接受。

验证要求：独立 forward cases 同时覆盖 (1) 只有 intake + 实现授权，不能采纳未见候选；(2) 已展示且真实已接受的同一候选，直接沿用，不再问；(3) Owner 拒绝/修订候选，不能继承旧采纳；(4) 非阻塞技术默认不要提升为 Owner 硬约束。再以真实冻结输入复核修正后的 A/C 及接续 B。原候选的失败样本保留，不能用新结果覆盖。

同时澄清评测协议中的 source/installed 比较：canonical adapter 的已知 frontmatter 转换使用源摘要 + 预期生成安装摘要两份绑定；与预期安装清单不一致才是 drift。普通路径不得因合法转换而误中止。此次实际评测已按双清单冻结并记录解释；源码 JSON 也应表达相同含义，避免下一个操作者误用。

## A-R5 的跨会话后果（旧候选 B 首轮）

旧候选 B 的首轮 receipt `724f41cab5ac455ca98e737c110195ee` / 665.713s / end_turn。实际新功能没有实现；Agent 依赖 A 生成的 HC-3“后续需求以新 Change 引入”，将它当成 Owner 硬约束，要求 Owner 选择先 finalize/archive 或显式并入，再准备询问能否单独按食材过滤。A 的原始 intake 从未声明这条工作流限制。这个样本说明发明的 accepted 约束会在新会话成为真实阻力；因此不再给旧候选 B 派发 turn 2/3，保留为 abandoned。基线 B 同一个输入能在同一 active Change 上实现加法式 `--ingredient`，且独立原 A 25 tests 与新过滤操作通过。

这没有证明可以绕过真实 Owner 的 finalize/归档决定；正确修复是不要发明上游硬约束，并复用已经给出的有界新需求，而不是自动归档或豁免真实边界。新候选仍需从其自身 A 产物的 fresh session 完整验证 B。
