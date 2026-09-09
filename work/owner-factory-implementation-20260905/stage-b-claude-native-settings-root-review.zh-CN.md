# Claude 原生配置读取：Root 官方证据补查

2026-09-06，Stage B Claude作者28122586…实现期间只读补查，不构成qualification。

官方当前 permissions 文档说明：ask优先于allow，匹配ask时PreToolUse返回allow仍不能跳过；内置只读Shell通常不问，但可由ask规则要求确认；bare deny会删掉工具。因此本任务必须保留工具并观察ask回调，不再采用ZCode r2删工具方案。来源：https://code.claude.com/docs/en/permissions （Rules、Read-only commands、Extend permissions with hooks）。

官方当前 settings 文档有实际重要区别：从v2.1.211起，linked worktree的settings.local.json通常读写主checkout根；旧启动目录local仍可能同时读取，两处权限规则合并，root标量优先。SDK resolveSettings辅助器则总从启动目录读local。因此只在linked worktree写settings.local并用SDK helper回读，并不足以证明native CLI最终相同配置；须观察原生消费者。隔离的普通git仓库无此主checkout歧义；shared settings.json从主要工作目录读取。来源：https://code.claude.com/docs/en/settings （Where Claude Code keeps the local file in a git repository）。

官方 hooks文档说明：各层Hook会合并；disableAllHooks可关闭普通Hooks，命令行settings可覆盖项目/local，但低层级设置不能关闭managed Hooks。只有managed层可关闭其自己的Hook。不应为了资格修改真实管理策略；若当前存在不可隔离effect，应诚实不可用。来源：https://code.claude.com/docs/en/hooks （Configuration与Disable or remove hooks）。

本机managed adapter0.75.1 index.js仅为薄启动器；实际query构造在dist/acp-agent.js:5930–6010，默认settingSources=[user,project,local]，会合并userProvidedOptions；实际native executable由CLAUDE_CODE_EXECUTABLE提供。请勿将之前摘要中acp-agent.js:5273/5962误写作index.js行号；没有观察到该文件版本漂移。此处确认的是公开文档和已安装源码，仍须真实首次tool和允许Write/各个拒绝探针的观察。

当前ACP adapter提供_meta.claudeCode.options并不代表public ACPX runtime把它暴露给entry；禁止为了使用options另写ACP客户端或注入私有API。若现有文件配置能完成合同，优先用现有机制。

## 实现中增量观察（尚非最终finding）

Root在实际ZCode10f28…正在编写时读到host-profile.cjs:580–590的delegateEnv重新调用claudeInstalledAcp(process.env)，而selector此前已经通过runtimeFilePath观察/哈希另一次registry读取的native路径。若registry在选择和spec.env构造之间被普通runtime更新改变，可能出现execution_identity绑定A、实际CLAUDE_CODE_EXECUTABLE为B；启动复核A也不能证明adapter执行A。这是需要在最终版本复查的具体链路风险，不能仅凭当前中间源码宣布最终实现有缺陷。

最小解决方向由实际作者决定：复用选择所得的那一次runtime绑定来构造spec.env，启动消费同一绑定；不要另建全局registry锁或逐调用policy引擎。需已有测试缝覆盖选择后registry变化时拒绝或仍执行原绑定A。所有生产相关函数应共享同一个实际选择结果，避免同一registry在command/argv/probe/runtimeFilePath/delegateEnv之间各自读取形成混合选择。

另一项实现中观察：kit renderClaudeSettings当前把defaultMode放在JSON顶层；官方文档和已装adapter读取的是permissions.defaultMode。它还枚举Task但当前native canonical工具名为Agent，现有MCP等可用effect工具也不由这个有限名单覆盖。最终版本需由实际作者核对原生规则语法、可用工具及首调用行为。官方当前文档已提供ask工具名glob（"*"匹配所有工具，EndConversation例外），可评估其是否为此Packet最小完整native ask配置，不能把默认模式或手工枚举名单当全效果证明。以上是中间源码观察，等最终作者产物再判定，Root不写配置实现。
