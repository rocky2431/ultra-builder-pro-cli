# Stage A 最终阶段验收

2026-09-06（北京时间）。Codex 判定：**体验机制整改与有辅助反馈恢复通过，可以提交 Stage A 并进入 Stage B。** 当前 UBP 源码没有未处置 P0/P1；本结论不是全部工厂完成、正式样例 Change 收尾或无人干预可靠性认证。

## 实际改动与问题闭合

- Grilling 按材料歧义触发重述，Research 围绕当前行动依赖的决定收敛；分清已答事实、模型技术默认、新战略候选及真正的 Owner 接受。保持自然语言采纳，不制造魔法词或第二次批准。
- Change、Plan、Dev 与 shared route 贯通当前 Owner 请求：旧 Grant 和未完成正式收尾不阻挡本次已授权实现；模型选择的精确任务 id 不冒充 Owner 输入。顺序依赖以当前实现证据核对，保留所有真实未完成行及必需 Review。
- 默认进度压缩为目标、验证结果、缺口、下一步和真实 Owner 决定。Hook 按 session 与连续相同 acceptance/任务状态去重，切换、恢复和验收变化仍重新提供相关信息；ZCode 原生提醒载体已修复。
- 保留真实检查失败并修正测试清理时序：等待 writer 结束与 fence 释放，不削弱原始断言。默认技术选择不能默许交付代码覆盖用户既有数据。

## 独立验证

| 范围 | 结果与证据 |
|---|---|
| UBP 当前源码 | 正常完整 `TMPDIR=/tmp npm run verify:release` exit0，729 Node +104 Hook，audit0 vulnerabilities；日志 `stage-a-repair6-independent-release.*`，当前三份最后修改源摘要仍相同 |
| 安装件与结构 | 六个改动 Skill 均通过官方 validator；repair6重验最后两项；pack142files；diff/新增JSON解析通过；无 manifest 改动 |
| A 产品与归因 | 原始产品15tests及真实记录/名字搜索/浏览/查看/持久化通过；原始A仍保留来源与候选身份错误。独立反馈副本的实际接受、来源拆分、展示候选身份及当前绑定已审查通过，未改产品字节 |
| 顺序恢复 | 从原A1中断现场，真实恢复T002后补完原任务要求的下一pending激活；T003实现与15tests通过。第一次提前停止保留，第二轮为纠正续跑；无伪造completed或Owner精确id |
| B 原始三轮 | B2超时保留，B3确认原功能；独立反例证明覆盖默认/显式已有目标及源数据，隔离测试37/38。因此原始B仍为REQUEST_CHANGES |
| B 反馈产品 | 实际ZCode38526cb9…修复后，Root独立40/40与15项检查通过：普通查询/导出/help、列一致、已有默认/显式文件、源数据及硬/软链接、旧临时名、无匹配和写失败。原15+10tests、46份旧evidence、Owner原话与ledger保留；最终源码与受测字节一致 |
| C | 原始月边界红→4绿；export共用同一筛选函数，原断言与其他产品文件保留；微修复路线没有伪造NorthStar/正式Review接受 |

独立核验日志位于 `.ultra/.runtime/owner-factory-implementation-20260905/`。旅程原件索引 `stage-a-journey-evidence-index.json` 当前1550files/96,690,265bytes；输入、实际中断、原始失败、反馈副本和当前检查分别记录，不互相覆盖。输入来源是冻结Owner脚本，执行是真实provider，两者不是同一维度。

## 限制与未自动修复项

- 原始A/B不能回填无辅助PASS。B反馈副本仍继承A3错误归因记录；A反馈副本的纠正不代表B字节已纠正。B的产品修复没有追认这些记录。旧样例欠下的PlanReview、T001–T004/T006正式收尾与A无HEAD限制均继续可见；不把样例产品PASS写成整个Change完成。
- P2：A标签/分组probe存在遗漏；B反馈 `recipe.py` 泛OSError清理未区分创建前后，handover的全面“不误删”保证过宽，当前验证只覆盖具名碰撞与写失败场景；T006头部仍留旧overwrite文字而正文已纠正。保留报告，不增加StageA门槛或自动扩展样例修复。
- 仅实测ZCode0.16.5/GLM-5.2旅程；不同冻结源/安装及隔离、wrapper版本差异已披露。Owner主动时间、真实费用和普遍生产率收益未知；零重复提问不能推导普遍交互改善幅度。
- 真实HOME只读Doctor exit2/degraded，是既有安装漂移，未安装或替换Host。早期HOME样例事故前状态未知，不能声称已经证明原样恢复；后续已使用实际资格通过的HOME写入隔离。
- 全部工厂尚未完成。StageB仍需现有agent-delegation/ACPX复用及D1真实正向资格；C/D/E仍需完整运行、W1–W4恢复、反复比较和受治理候选流程。未来具体候选持久晋升需Owner对该版本作promote/reject决定。

实现及测试由实际ZCode/Kimi/Claude Code完成；Codex负责协调、独立验证、上述验收与本地详细提交。未push、发布、部署或进行真实HOME安装。
