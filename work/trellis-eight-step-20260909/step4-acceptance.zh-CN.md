# 第四步验收：日常开发与显式恢复

结论：**步骤4在已记录的Claude/Pi日常路径与明确限制内通过。** 本次最终源码是`c0371d2`的Pi入口/用途修正加candidate3的普通工作收尾差异核对。没有未处理的已证实P0/P1。原失败和人工操作纠正保持原判；不是所有Host/所有任务的可靠性认证，也不是后台自动运行资格。

## 完成证据

| 路径 | 本次可核对的结果 | 独立操作与限制 |
|---|---|---|
| 新项目F2 | Pi默认交互先问用途，再交付月合计/商家找回的本地收据工具；Root真实HTTP浏览器确认40.00、跨月100、搜索、reload保存 | 浏览器由Root操作；Pi只独立审阅该app。直接file URL被策略拒绝，未测、未绕过。先前会议记录D1已由独立Pi按README在副本录入、跨进程找回及显示日期 |
| 明确小改F1 | 中文标题修复5/5，原冻结断言逐字保持 | Pi QA独立运行并核对ASCII兼容；原Claude可写fixture修正及失败保留 |
| 连续修改F3与知识K3 | 前序两fresh会话、整数分与知识四环证据已接受；本次未再造知识机制 | Step3独立证据及旧F3回合继续有效，不声称它们在Pi上重新全跑 |
| 既有工具D2 | Pi新增包含端点的日期范围查询；26项通过，全部原方法AST不变；Root与独立QA另行操作范围、关键词、日期和新进程保存 | 新Pi运行独立于旧Claude；不混算公平收益 |
| 任务切换D3 | 最终candidate3同原生会话三轮，先会议→分账→会议；26/17项通过；每轮改动在正确产品范围；回到会议时重读文件并实跑两边 | 独立QA实际录入两日记录、查序、新进程读回；0人明确中文RangeError，1000分/3得到334/333/333；冻结money测试SHA不变 |
| 显式中断D4新确认 | candidate3冻结后由独立QA另选“更正已保存记录日期”请求；首次成功read后10秒，活跃进程组收到一次SIGINT；Node和Pi均退出，确认无writer后同session续接；99.363秒完成 | 独立QA按README操作两条记录，只改目标日期，跨新进程show/find/list保持；非法真实日期exit2、未知ID exit1且DB SHA不变。28项通过、原29个方法AST全部保持、仅一个更新路径 |

D4新确认中断时没有产品文件变化，因此证据只到**执行中回合的意图/会话恢复**。原P1协议允许首个实际工具完成，不要求必须已写文件；不能据此声称半写文件、机器重启、后台唤醒或W4通过。

## 失败、修正和验收边界

candidate2的D4虽然同会话恢复了范围功能，却在新增测试时删除旧测试；该次为FAIL。Root独立原始加新套件51项通过不改变删除事实。QA起初漏检并误判PASS，现有报告已append-only更正。candidate3只在既有自然语言入口补收尾比较起始文件、保留相关旧检查；不加门禁、状态、语义调度器。新确认请求在源冻结后选择，和旧范围案例不同，不反复刷同一请求。QA首个新请求把实际数据更正与新增产品能力混淆，运行前纠正，两份原案保留；源未随评测输入调整。

QA日期操作第一次误用另一D2版本的`--from/--to`，改用该基线README已有list接口；D3第一次遗漏`MONEY_JS`环境变量在加载前失败。均有实际原始操作日志，属于验收操作纠正，不冒充产品失败或无帮助结果。Root核对了原始QA bash输出，而非只接受其报告。

原Claude429与所有早期purpose/entry失败不改判。Pi0.85.1、实际默认openai-codex/gpt-5.6-luna均有原生session记录；没有手工模型覆盖或凭据切换。使用脚本化Owner消息，非真人可用性研究；Owner主动投入未知。原Claude与新Pi的Host/模型条件不同，不声称公平耗时、价格或生产率改善；原生标价记账见`pi-daily-runtime-metrics.json`，不是实付账单。D3三轮分别61.820、54.962、42.738秒；新D4停止点16.379秒与恢复99.363秒只作本次绝对观察。

## 精确版本与工程检查

`pi-entry-candidate3.json/.patch`绑定7个源SHA；除`bin/unified-entry.md`新增收尾段落外，其余6源和candidate2相同。候选3真实运行前冻结，运行及最终QA后SHA仍保持。

- 最终隔离`npm run verify:release`：764 Node、104 Hook、audit0，exit0。
- `npm pack --dry-run --json`：通过，入口、模板与Init Skill实际在包清单中。
- Init Skill Creator校验：通过；没有manifest/marketplace改动。
- 真实HOME六Host只读doctor：既有degraded/exit2，完整报告保留；没有修改HOME安装。既有安装兼容检查包含在release中，不把六Host安装支持当六Host live等价。
- 最小回归是实际candidate2失败及冻结candidate3新恢复确认；没有加入措辞匹配伪测试。

日志：`pi-entry3-checks.json`与各检查日志。产物与原生文本/工具操作索引：`pi-candidate3-evidence-index.json`；原始思考/signature不入Git。独立报告：`pi-candidate3-recovery-qa.zh-CN.md`、`pi-candidate3-d3-qa.zh-CN.md`，实际bash输入输出已存入各自evidence目录。仅提交本步源码与证据，原StageB变更继续保留且未混入。

下一步是第五步：先对当前依赖复验StageB和同强度真实Host资格，接受后才进入StageC；此处不声称软件工厂、耐久运行或策略晋升完成。
