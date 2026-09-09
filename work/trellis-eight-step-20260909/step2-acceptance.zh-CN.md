# 第二步验收：统一自然语言入口与相称路径

结论：**第二步在新增Pi原生入口范围内验收通过；Claude历史429与失败保持原判。** Codex实现的Pi启动/续接及共享用途澄清改动已在冻结candidate2上实际运行并独立QA核对。普通宿主聊天自动发现仍只作尽力支持。第四步的原测试删除失败单列，不以第二步通过覆盖。

授权与分工：统一入口决定在 `.ultra/decisions/2026-09-09-unified-ultra-entry.md`；后续由 Codex 亲自实现的最新要求在 `2026-09-09-root-independent-implementation.md`。Claude 的未完入口改动被取消后由 Codex 接完。这里的原生 Claude 会话是实际产品试用，不是委派它开发 Ultra。Codex 同时作操作验收，不声称作者与验收者独立。

## 最新 Pi 验收增量（2026-09-09）

Owner明确授权补Pi公共入口，见`pi-entry-authorization.md`。`ubp run --host pi`使用包内14个共享Skills，`--resume`映射到Pi原生`--session`；安装与ACP委派的六Host资格不变。Pi默认模型实际为openai-codex/gpt-5.6-luna，没有模型覆盖或凭据切换。

candidate1真实失败：只问输入方式，Owner回答手动录入后写骨架并停在建议Research，未问实质用途。candidate2只修共享入口和Init中的“来源不等于用途”“Init退出不等于产品完成”，保留模式与授权合同。F2真实默认交互在首个写入前询问用途，收到原样冻结答案后交付本地记账工具。Root实际浏览器验证月合计40.00、商家检索、重载持久化及换月100.00；无个人材料或外部连接。直接file URL被浏览器策略拒绝而未测，未规避该限制。既有会议记录D1已由未参与实现的Pi独立操作，本次收据浏览器操作由Root完成，独立QA另外检查接线，二者归属不混淆。

F1中文标题5/5，原断言逐字保留；D2范围26/26，原始方法AST全部保留，Root另测端点、新进程检索和日期。Pi独立QA在副本操作F1/D2并复核7个候选SHA、14项launcher检查，未发现对应P0/P1。该QA曾漏检D4删测试，已追加更正，Root不采纳原D4通过结论。

精确candidate2源码：764 Node、104 Hook、audit0、pack与Init Skill验证通过；真实HOME只读doctor仍既有degraded（exit2），没有安装。包内所需入口和Skills已核对。冻结源/patch、授权、独立QA和Root消费记录分别为`pi-entry-candidate2.*`、`pi-candidate2-qa.zh-CN.md`、`pi-candidate2-root-consumption.zh-CN.md`；原始操作及产物索引`pi-candidate1-evidence-index.json`、`pi-candidate2-evidence-index.json`。计费与模型记录见`pi-daily-runtime-metrics.json`：只记原生标价口径，非实付；Owner主动投入未知，不声称跨Claude/Pi的成本或生产率改善。

以下是此前Claude候选的历史过程与范围，保留原失败，不作为Pi等价性证明。

## 历史实际改变

- 既有 CLI 增加 `run` 子命令，解析所选受管插件并把生产入口说明与原样目标交给原生交互会话。当前启动面只承诺 Claude；六宿主既有安装支持不变。
- 原生 `--continue` / `--resume` 继续通过相同公共命令加载插件，stdio 和退出状态由宿主返回。没有新增语义调度器、后台服务、数据库或任务权威。
- 公共工作路径的可发现性由 adapter 正确表达；shared Skills 仍保留语义入口与授权判断。新产品先确认实质用途，已清楚的小改直接调查、实现、验证；个人真实材料和项目外效果不能用技术自主代答。
- 两种语言 README 给出目标语言用法、显式恢复与非交互限制。

## 当前证据

候选冻结、精确 source/installed manifest 和 native 2.1.263 的 SHA 见 `step2-candidate4.json`。CLI、路由及 Skill 字节在实际运行前冻结。最终源码仅在两个 README 增补已观察的运行限制，runtime 字节与实跑候选相同；精确最终 patch 与隔离源见 `step2-final-source-checkout.json`。

| 任务 | 实际结果 | 边界 |
|---|---|---|
| F1 可写工作副本 | 修复后5/5；公共命令原生resume追加英文兼容约束，仍5/5；Root复核冻结断言未改 | 旧F1-res README 禁止原地修复的输入缺陷单独留档，此次不冒充旧运行 |
| F2 默认交互入口 | 写代码前调用正确Init并用原生AskUserQuestion问实质用途；按冻结答案继续；交付可录入、关键词找回、显示日期的真实SQLite工具，25项测试通过 | 个人历史来源未知，未访问Notion或猜个人目录；Other文本输入受PTY交互限制，改由原生聊天输入逐字答案，过程保留 |
| F2 独立进程操作 | 按README在干净副本录入一条；两个新进程均找回关键词和日期；真实SQLite路径无mock/stub | Codex自验，非第三方盲验；脚本化答案，不是真人可用性研究 |
| F3 两个fresh session | 第一轮平摊，第二轮仅继承项目文件；17/17，原money断言未改；1000分得到334/333/333，摘要走formatAmount | 旧材料已被现任实现者看过，只作当前确认，不声称blind held-out |
| K3 | 两次新会话的知识回写四环通过 | 第三步单独给出明细，不凭入口验收代替知识验收 |

原始批处理调用与产物：`step2-candidate4-batch-evidence-index.json`；交互调用、无效PTY尝试及F3：`step2-candidate4-interactive-f3-evidence-index.json`。均含逐文件SHA与可恢复归档，原始请求、实际提示、回合、产物和Root命令输出可复核。

## 必须保留的失败与限制

candidate4 的F2批处理调用虽加载了正确Init，仍先构建后问数据来源、漏掉实质用途，**失败**。native print 没有交互提问工具；插件参考Read被workingDir权限拒绝。真实默认交互模式在同一候选上先问用途并完成交付，但它与批处理不是相同条件，不能作同条件改善或因果归因。README明确用途待回答时用交互终端，不声称print/piped输入能完成交互澄清。默认宿主可能要求只读访问所选插件参考文件；本次逐一批准四个明确参考文件，不授予个人数据访问。

首个PTY误把operator heredoc经stdin附入了首条消息，已中断并标无效；重新从文件runner启动的调用没有该污染。两次都保留。原生自己显示自动更新可用，但实际固定启动和回合版本仍为2.1.263，未人为替换HOME安装。

D3后续发现F2样例工具把不同日期、相同正文的手记判重，这是**样例产品的已知限制**，在冻结切换序列中仅报告未修；不能泛化为所有会议记录都可靠。当前验收只覆盖已执行的用途链。这里没有真人投入测量；费用均为provider标价记账，交互native cost-state为2.5291855美元（含原生标题辅助模型0.002917美元），不是实付账单，也不与第一步混算生产率。

## 发布检查与提交边界

最终隔离源 `5c2031e + candidate4最终patch + 新F1工作副本/K3检查` 的 `npm run verify:release`：**760 Node通过、104 Hook通过、audit0，exit0**。日志 `step2-final-release-verified.log`。`npm pack --dry-run --json`通过。两处改动Skill的validator在冻结源上通过；最终对应字节相同。真实HOME只读Doctor仍为既有degraded（exit2），没有安装；实际隔离生成插件Doctor healthy。

前两次最终全套只因operator漏拷K3测试所引用的评测文档，各759/760；第二次拷贝又因cwd错误到达太迟，均保留原日志。补齐现有文档并先8/8窄验证后，最终全套760/760。没有改断言或产品代码换绿。

提交仅包含第二步产品patch、F1可写工作副本和对应证据；原Stage B修改继续留在工作区。共享测试文件的Stage B注入行已逐字保留且不入本提交。第三步、第四步及后续工厂仍分段验收提交。

## 最终candidate5与实际阻断

candidate5只在native prompt前加`--`，修复最后一个`--allowedTools <tools...>`吞掉目标的真实错误；原生help明确plugin-dir是单值，不能把错误泛化到它。新增及更新argv窄检查红→11/11绿。运行后目标原样出现在native会话，继而因周额度429停止；F2-res尚未验收，第二步整体仍未完成。

最终candidate5隔离全套：**761 Node / 104 Hook / audit0，exit0**；pack通过，日志step2-candidate5-release.log、step2-candidate5-pack.json。此前760检查与失败日志仍是candidate4历史。此次提交是完成的入口实现单元，非第二步整体验收通过。额度恢复后续接F2-res；不购买额度、不静默换provider凑通过。

## Pi 独立 QA 补充（2026-09-09）

Pi只负责验证，未写Ultra实现或测试。独立在归档产物的副本上操作，会议记录25项、时间范围35项、分账21项既有检查通过，并实际验证新进程持久化、关键词和日期、范围端点、整数分守恒。报告`pi-step2-4-qa.zh-CN.md`及对应证据保留了第一次把D2接口用于D1的操作错误；不计为产品失败。Root核对操作日志与源码/冻结断言hash一致。未发现确定的P0/P1产品缺陷。此结果补独立操作证据，不替代F2-res的新产品用途澄清，也不把Claude429改为通过。
