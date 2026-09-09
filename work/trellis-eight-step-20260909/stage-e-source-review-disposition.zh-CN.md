# Stage E 首次独立源码 QA 的核实

试验根：`/private/var/folders/cm/zpwxmr512rq1qz4_0_ryz8t80000gn/T/ubp-durable-native-Gfz2s0`。两名 Pi Sol QA 已完成，原文是各 worktree 的 `src/value.json` 和原生 typed result。它们没有编写 Ultra 产品代码或测试，也没有实际执行所述攻击／故障反例。fresh Sol 已开始新会话读取实际报告，但在 180 秒自身期限退出（code 2），没有输出汇总或消费成功。旧 Primary、Supervisor、conductor、fresh Primary 均已核实停止。系统接受了明确授权的 macOS 通知请求，用户是否看到未经观察。本次有用输入的完整 W4 旅程未通过。

输入夹具遗漏了 worktree 中的 interface.md 和部分依赖，两个 QA 都主动报告了这一限制。原文不修补；下一版夹具纳入完整已绑定执行依赖和真实 interface 文件。下面是 Codex 对原始意见的核实，不是代写 Reviewer 的结论，也不是正式 Review APPROVE。

| 原始意见 | 核实和处置 |
| --- | --- |
| sourceHashes 漏了 delegate / execution driver 等执行依赖 | **确认缺陷并修复**。在隔离源码副本中注册后改变 execution driver，原实现未报 durable_source_changed；新增反例先红后绿。绑定扩展到当前本地执行依赖及兼容 profile 文件，operate 启动 Supervisor 前也核验。 |
| activation 或 supervisor claim 写入后、下条记录前死亡，无法自动重试 | 拒绝未知效果的重放是已接受合同，不将缺失 PID/记录解释为从未启动；不能通过删除 claim 恢复。原意见正确指出可用性损失，此限制保留并公开，不添加推断性重试。缺失观察应作为 unknown／需 Owner 处理，不能包装成可恢复成功。 |
| PID 重用令旧进程判断等待 | 保守等待确实可能产生假阳性，但不是无限等待：operate 每 250ms 校验 grant，expiry 会停止。未发生自动误杀或重放的证据。保留同机 PID 重用的可用性限制，不为它新增进程租约服务。 |
| base_revision 没有绑定所有未引用的脏文件 | HEAD 绑定与精确引用只覆盖所声明的输入，不能宣称整个工作树已冻结。Owner/model 必须把任务实际依赖的输入纳入精确引用。现有 task_refs 可承载额外必要输入；文档需明确选材责任。不增加推断任务语义的全仓冻结器。 |
| path 许可检查与原生工具打开文件之间存在同用户进程替换目录的 race | 共享许可当前核对真实祖先 containment，仍不是 OS 级文件系统隔离。QA 没有执行 race；此为既有 Host 工具边界限制，不宣称抗本地恶意同用户进程。不能借本轮引入替代原生工具而伪称原生资格不变。 |
| 机械 grant 校验不理解 owner.md 中“Pi 不得实现代码” | 不采纳为机械解析器缺陷。模型负责解释 Owner 意图和 scope，显式 grant/envelope 只能投影现有授权，不能自行产生它。当前所有参与 Pi 仅写 QA 报告；产品架构禁止把语义授权交给新状态机。保留原意见以供 Owner 审阅。 |

另一个实际需核对的边界是：显式启用通知后，conductor 死亡而 fresh 进程因自身期限退出时，是否仍能产生需处理通知。已启动单独有限原生故障试验；结果未到前不声称覆盖。

## 第二次较长旅程与复核

`ubp-durable-native-h75oUZ` 的两份 QA 与 fresh 汇总文件均已产出；native final 的 event_key/claim_nonce 正确，但 decision 为对象而非合同规定的字符串，所以当前校验正确拒绝为 consumption_unconfirmed。保留原始失败和已有输出，不修补该次回执，不重投同一事件。发送提示此前只说“decision (your factual outcome and remaining work)”而未给出字段类型；已加入精确 JSON 示例和字符串说明，不改变校验条件。第三次预先有界的新夹具仍只测同一完整用途，不以补考覆盖前两次失败。

第二次 QA 对“所有读被限制到 worktree”的批评揭示 **D 文档的一处真实过度承诺**：operational-factory 原文称 filesystem boundary 为 worktree，而共享 delegation-contract 明确只定义 writable_roots，read/search/think 可被允许，且拒绝 readable_roots 扩展字段。已修正文档为真实的工作目录／写入范围与明确授权的输入；没有把能力当授权，也没有改写已验证的 Pi 权限或宣称 OS read sandbox。

第二次恢复 QA 指出：首次 operator_attention 固定后，后续 terminal 状态不会替换那份 attention。这是当前 finite RunSlice 单事件、不可变首个 attention 的保守边界；不自动复用未知事件作为 fresh 启动资格。原报告的可用性风险保留。另指出 event claim 已落盘而派生 claim.json 丢失时，status 只显示 registered；实际 wake 仍拒绝重放。这项观察一致性限制作为非阻塞风险保留，不按 P2 自动修复。

conductor 死亡漏通知已在 `ubp-durable-native-nQKQo2` 复现（notification=macos，但无请求）；fresh exit 的补充记录／通知后，`ubp-durable-native-LPyuky` 同场景通过：unknown、不重投、fresh 停止、attention 留存、OS 请求接受。原始版本、结果和散列索引均保留。

## 第三次旅程及最终 P1 修复

`ubp-durable-native-R60vX2` 实际保留两份 QA 报告和 fresh 汇总，返回字符串 decision 的精确消费回执，最终为 consumed；重复 wake 返回原结果，原 Worker 回执散列不变。本次源版本早于下列修复，不把它描述为最新源码的通过证明。三次源码 QA 已达到本轮初始加两次 delta 的预算，不通过重命名试验再启动第四轮源码评审。

- **P1：protected authority 的路径别名。** 原共享 ACP canonical 检查未拒绝工作树内指向 `.ultra` 的 symlink；macOS 上普通 `realpathSync` 还保留输入 `.ULTRA` 大小写。两项真实文件系统反例先红后绿，修复集中在共享边界，使用 native realpath 核对实际 protected ancestor。当前 Pi 原生资格已用全部八个原生工具重测：合法 write/read 完成，七项实际越界调用均在效果前拒绝，独立 QA 为 APPROVE，精确回执在 `.ultra/evidence/vnext-d-operational/native-qualification.json`。资格范围仅覆盖这次权限修复。
- **P1：最终消费的授权检查。** fresh native terminal 校验之后、发布 outcome 之前重新核验当前 grant/revoke/expiry 和 fresh deadline；撤权、到期和超时反例均拒绝写 consumed。此前工具效果前的检查不能替代这一最后边界。
- **P1：派生 claim 丢失时的状态真值。** 上轮把它作为 P2 留存是不完整判断：持久 event claim 已存在而 runtime claim mirror 丢失时，registered 会隐去 delivery_unknown。现复用按绑定 grant 计算的持久 event claim，status 明确 unknown；原拒绝重投语义不变。删除镜像的先红后绿反例覆盖它。

对 Owner 自然语言必须由机械解析器解释的意见，第三次 QA 读到完整架构后明确撤回。模型仍负责意图和授权解释，不增设语义授权引擎。PID 重用可能延误异常通知、同用户恶意目录替换 race、首次 attention 不自动改写等 P2/既有能力限制继续保留；不宣称 OS 沙箱或无限恢复能力。最新源码仍需要当前版本的普通 native 生命周期、安装及全量检查；这些验证不会替代尚未形成的正式 E aggregate acceptance。
