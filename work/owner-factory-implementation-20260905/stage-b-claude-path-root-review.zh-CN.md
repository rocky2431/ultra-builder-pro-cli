# Stage B Claude 路径初版 Root 审查

结论：REQUEST_CHANGES，不能执行真实资格、不能接受Stage B。实际作者ZCode10f28…success/end_turn1483.512s；完整交接已读。独立既有四套件在运行，绿色与否均不替代下列源码/官方合同缺口。

## P1：原生模式字段未被消费者读取，工具规则不完整

`work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs:408` 的renderClaudeSettings将defaultMode放在顶层，而本机adapter0.75.1的dist/acp-agent.js:5856实读settingsManager.getSettings().permissions?.defaultMode，并在:5981作为native query permissionMode。当前配置不能实现交接声称的压制用户层acceptEdits/bypass。配置枚举Task也未覆盖当前canonical Agent及可用MCP等effect工具。

证据命令：rg -n 'defaultMode|initialPermissionMode' 已安装adapter的dist/acp-agent.js和permissions/modes.js；sed -n '395,420p' 上述kit。官方 https://code.claude.com/docs/en/permissions 明文给出permissions.defaultMode、ask的工具名glob和ask优先级。

修复判据：实际作者按原生有效schema修正，并使用最小完整ask匹配保持工具可用；现有自检/回归证明正确字段及首调用配置来源。需要真实attempt-and-denial的边界仍由Root另跑，不以配置JSON存在或default/manual名称当成功。

## P1：所哈希native路径与最终实际消费路径可分离

`host-profile.cjs:765` 的runtimeFilePath、identityProbes和command/argv分别读取registry；`host-profile.cjs:583` 的delegateEnv还会在`delegate.cjs:1135`构造spec.env时再读一次。选择绑定A之后若普通registry更新到B，spec.execution_identity仍绑定A，但CLAUDE_CODE_EXECUTABLE可为B；worker只重新哈希A，再启动adapter，adapter读取env执行B。漂移检查因此没有支配实际消费者。env-injectable的hostProfile也未使该delegateEnv捕获相同选择。

证据命令：rg -n 'delegateEnv|runtimeFilePath|claudeInstalledAcp|execution_identity' host-profile.cjs / delegate.cjs / agent-execution-driver.cjs / acp-driver.cjs；本机adapterdist/acp-agent.js:6004附近实际使用CLAUDE_CODE_EXECUTABLE。未编写Root探针；由实际作者在既有缝隙补选择后registry变化的回归。

修复判据：一次确定的选择结果绑定adapter、argv、native实际路径及最终env；普通更新只能拒绝或继续执行原已绑定文件，不能哈希A执行B。复用现有共享launcher/spec绑定，不加全局锁或第二引擎。

## 未闭合的生产资格消费者（真实调用前需准备）

当前native settings的生成与SDK package身份只存在于work/下的kit；生产requiredExecutionIdentity/launch复核只消费adapter、native、publicentry和ACPX package。初版没有表达“只有同样的native权限配置和Claude SDK身份才能使用留存正向资格”的consumer。若后续只是补正向enforcement记录，换到缺少这些settings的普通worktree仍可能通过身份判断；SDK变更也未被生产复核覆盖。

这不等于今天已经发生越权——候选仍未qualified。它是原mission要求的下一步真实consumer缺口，必须在正向记录应用前闭合。实际作者应以最小现有profile/identity/launcher缝隙表达并验证这些必要输入；kit复用相同生产配置机制，bootstrap仍只除去该候选未合格记录，不能另加权限policy shim。无记录旧路径保持兼容。无需全node_modules证明，覆盖明确的native配置与已用SDK包元数据。未来记录只填观察事实，禁止预填PASS或猜哈希。

## 证据限制

作者报告55+65+8及相邻46+19通过，kit自检/fixture-smoke/离线Claude prepare通过；其中原plumbing attempts和worktrees被作者清理，原始失败应保留可找到的原生/命令日志；缺失的只能记缺失，不重跑冒充原证据。未消费Claude真实资格。先前ZCode两份负向与Kimi静态阻碍保持不变。普通Error不能被交接称为typed HostEnforcementUnavailableError。

Root独立四套件最终129/129、0skip、43.921s，10绑定源前后不变；日志SHA539a4c348827acae815effe760feb0bf73a9294651165ceb6c755f3994d7fc30，完整metadata见stage-b-root-claude-initial-narrow.json。绿色现有检查未覆盖以上两项消费者缺口，REQUEST_CHANGES保持。
