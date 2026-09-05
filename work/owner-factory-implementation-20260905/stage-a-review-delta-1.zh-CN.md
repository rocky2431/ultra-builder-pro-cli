# Stage A delta Review 1 — 源码修正核对

2026-09-05。ZCode repair 1 receipt：`ec3f068afb154557959994ab2c476d8f`，1439.843 秒，end_turn。**初轮四项修正已由独立证据核对闭合；Stage A 最终验收仍等待真实旅程。** 尚有一次 P0/P1 delta Review 预算，没有阶段 commit。

## 初轮发现的处置

| ID | Codex 独立核对 | 结论 |
|---|---|---|
| A-R1 | 同样的 context-only adapter 输入现在输出 PreToolUse additionalContext，未新增 permissionDecision；实际 adapter 子进程回归保住危险命令 deny | 源码缺陷闭合；真实 Host 提醒可见性仍须旅程记录 |
| A-R2 | 相同真实 Hook 子进程复现 A→B→A→A：543/547/543/0 bytes，四次 exit 0；恢复 A 已可见，连续相同 A 被抑制；任务切换回归通过 | 闭合 |
| A-R3 | 普通 entry/exit 与已授权转换默认紧凑；独立语义 forward check 的普通 Status 产生五行、E2E 失败如实呈现、无虚构审批；授权未知场景展开并保持只读；业务选项未知没有替 Owner 作答 | 指定冲突闭合；语义样例不替代真实旅程 |
| A-R4 | 当前协议允许提交前按基线 SHA + 候选内容冻结后运行；已配置 Agent 调用与正常缓存明确允许，实际禁止效果保留；输入/执行两轴明确；原输入与红样例未改 | 闭合；安装件由 canonical adapter 转换后的摘要另行绑定，见环境记录 |

## 独立验证

- `TMPDIR=/tmp npm run verify:release`：exit 0；719 Node tests、104 Hook tests、0 audit vulnerabilities。测试日志已保存并摘要绑定。
- 15 条针对 Hook 的检查，以及 12 条 route/eval tests 通过；四个修改 Skill 用官方 `quick_validate.py` 校验通过。
- `npm pack --dry-run --json`：exit 0，142 entries；411978 bytes packed / 1458875 unpacked；不含 work/WIP/.ultra。`git diff --check` 通过。
- `node bin/install.js --all --global --doctor --json`：exit 2 / degraded。六 Host 的问题代码与缺失目标和基线一致；五组完全相同，Claude 仅 require stack 中的源码目录从隔离基线变为当前目录。这没有证明真实 HOME 安装健康，也没有执行安装或修复配置。
- 结果 JSON：`.ultra/.runtime/owner-factory-implementation-20260905/stage-a-independent-verification.json`。完整日志同目录，原始 receipt 保留。

## 独立语义复核

原 native Codex forward-check reviewer 仅读当前 Status 和共享合同，未读取本 Review 或 ZCode handover、未写代码、未调用外部 provider。它复核并在结束时再次校验：

- Status SHA-256 `e47f48984435c4dd23c8ab5a85e955105cd72b6f5243f82914ed1220104b390e`。
- Route Contract SHA-256 `13fc5640fc9fe9f4bda610daffb040dd64a7648eb14a5e32b6561e23b6137067`。

普通 Status 的实际脚本输出：目标为确认整合版本是否完成；已验证结果为尚未完成、组合 E2E 失败；缺口为最终修订尚未验证；下一步建议当前已授权修复再验证；Owner 决策为无。它没有把五个 worker 返回当完成，也没有声称只读 Status 启动了修复。

保留一个非本轮新增的文案歧义作为观察：Status 对 `session-local` 的“requiring fresh owner activation”未在该句限定跨会话；被引用的 `execution-grant.md:11-15,50-52` 则明确以会话/Host 切换或 activation 丢失为条件。当前有效会话授权不能据此被抹掉。本轮脚本未复现由该句造成的误拒，不扩张为自动修复；实际旅程若出现误拒需保留证据并再判定。

## 尚未交付

候选安装件已冻结在 `/tmp/ubp-owner-journeys-ynsz0724/candidate-config/`，生成/实际加载的完整摘要与版本已记录。基线与候选的实际 A/B/C 旅程、首次可用产物、完成声明和真实 Hook 可见性仍在核对。此次 Review 的源码闭合不是 Stage A 接受，不启动 B。
