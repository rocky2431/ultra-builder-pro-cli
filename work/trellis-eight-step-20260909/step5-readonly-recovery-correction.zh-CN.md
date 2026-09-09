# Step 5 只读恢复补查

2026-09-09。仅准备后续恢复，不执行 B 资格或 C/D/E。

旧工作树缺失不等于旧源不可恢复：`git cat-file -t ff9aa2a12e253801d3949036c20938ca8da16718` 返回 commit。它正是上次2.15.4整合记录中的具名备份，原差分已复制到 `step5-goal-backup-recovered.patch`，无需修改 Goal checkout 或创建新分支。

更关键的是，Goal 当前 HEAD 7210d3a 的上游提交 `ea2dfb0 fix(contract): correct graph and review semantics` 已触及原八个对应路径（重命名后为 plugins/ultra-goal/skills/ultragoal）。实读当前 `validate_artifact.py:852-869` 仍以 advisory 处理 SAME_VENDOR_REVIEW；当前测试第330行起检查 advisory、CLI成功与原提示保留；graph-topology 已有固定/动态、成本口径与命名会话说明。因此“必须重建旧工作树并重写此功能”不是当前结论。第五步真正恢复时只需核对现行合同消费与相关验证，不能直接用旧447项数字认证当前版本。

agent-delegation 从772929d到0a81753的9文件差异已读。installer、runtime package/lock、agent_delegate.py 的运行相关差异仅0.4.0→0.4.1版本号，另有README及Skill/任务包文案更新；既有锁定runtime依赖未改变。后续整合仍应保留这些新版本及指令，不重新发明安装修复。

所有精确HEAD、状态、diff与patch SHA见配套JSON。此处不判任何Host/Profile合格、不启动测试或模型资格、不修改独立仓库。原preflight中“无法定位副本”的说法仅代表该作者当时未找到，已由本次具名Git对象与上游提交补充；其他真实失败原样保留。
