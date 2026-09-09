# Stage C 产品闭环与 Solo 对照

状态：原始两组、20分钟补验和Factory最终续接均已冻结；原Factory路径未获资格接受。新的canonical起点两组已正常完成，独立复核通过；Stage C待正式Task Review及Test/Deliver。

## 实验边界

同一无依赖 Node CLI 产品任务：合成银行 CSV 导入本地 JSON 账本，按月、币种和分类汇总。共同需求与只读验收在 `product-fixture/GOAL.md`、`product-fixture/acceptance.cjs`。两组从相同 Git baseline `d27f6f65f8063377df30ec0075d84ce499888c7f` 开始，Primary 均为既有原生 Pi 的 `gpt-5.6-sol`、medium，保持 native read/write/edit/bash 工具。每组总墙钟预算20分钟、最多两次修复；Factory最多五个有限slice、两个同时Worker。已有provider使用得到授权。

Factory由模型选择实际分解和接口，先fresh read-only Challenger，再真实并行Luna/Terra Worker，Primary串行集成，最后fresh read-only Reviewer。Solo由相同Primary模型完成完整任务及self-review，没有独立Reviewer。这个审查拓扑差异是处理组本身的一部分，不把Solo self-review称为独立审查。原始goal、验收、baseline和全部模型用量保留，Factory开销包括挑战、准备packet/worktree、全部Worker、集成和Review。

夹具的 `Math.trunc(Number(value) * 100)` 是Codex明确植入的可复现初始缺陷；1.13金额测试会失败。它验证明确失败后的修复，不是自然发现的Agent错误。若实现期间另外出现真实失败，另列原始日志与修复。不会把缺少CLI造成的初始失败误算成Agent回归。

8组只读验收覆盖金额、Unicode/CSV quoting/CRLF/BOM、重复导入、零值/退款、月份/币种分类汇总、冲突和无效数据不部分写入、坏账本保留与CLI错误。通过这些检查不等于穷尽所有输入；最终会结合源码检查和Review确定意图忠实度。

当前生产模块SHA（两组相同）：RunSlice `0b828abad9c8718172bc4b1bbd9950afa66a6a2028cd6e32f6b73d56dda38da1`；Pi extension `b898173c387ad085f77f17799819a2e289bc876fb2ed63c699087eb3b5efb0cc`。采用当前路径别名拒绝修正，不沿用修正前controller证明。

## 初始运行

- Factory：`ubp-product-factory-3oCjh9`，session `01a08569-7ea4-7002-95dd-1670a69b3809`。
- Solo：`ubp-product-solo-SH5sSx`，session `01a08569-7f9b-728c-9ac2-ff8d7315cd6e`。
- Root只创建夹具、验收与外部观察脚本；sample产品的实际写入来自标明身份的实验参与者。Ultra源码与测试仍全部由Codex实现。

两组同时启动，可能共享provider负载，因此单次墙钟差异不能推广为稳定性能收益。Stage C只要求公平记录成本且不降低意图忠实度；重复收益仍属于Stage D的独立退出条件。

## 首轮实际结果与缺口

| 指标 | Factory | Solo |
|---|---|---|
| 墙钟 | 1032.780秒 | 330.604秒 |
| 共同验收 | 8/8 | 8/8 |
| 相同事后补充检查 | 3/3 | 2/3 |
| 全部角色model calls | 71 | 19 |
| Pi原生估算成本（非账单） | 2.47381948 | 0.498438 |

Factory确有两个Worker重叠70.571秒，Primary串行读回/集成。一项Primary清理CSV代码留下未定义变量的真实失败导致2/8，修复后8/8。fresh Reviewer第一次因evidence数组格式错误被拒绝；第二次有效Review找到末尾换行正则绕过和报告中间溢出两项问题，Primary完成第二次修复和最终revision E2E。但它没有对最终修复进行独立delta Review，因而首轮自报delivery_ready不能接受。W1错误调用W2消费确认也如实保留；有限slice文档已澄清W1不调用ack。

Solo在330.604秒完成且共同验收8/8；独立补充检查发现坏账本date数组被隐式转换后接受，实际完整意图仍有缺口。其自审不能写成独立Review。

首轮可复核证据：stage-c-product-initial-raw-index.json及两份initial-raw.tar.gz；包含原生session、worker结果、精确Git历史、原始失败、最终源码、共同检查和补充检查。初始数据未被后续补验覆盖。当前Factory用时约3.12倍、估算成本约4.96倍，不能宣称此任务的速度或成本收益；补充质量检查存在差异，但单次不能推广为稳定优势。

## 规范交付补验

两个已有Primary由显式前台指令继续，分别给予20分钟交付整理预算，追加成本单独列明；这不是W4。Factory只补当前修复的独立delta及实际canonical Task Evidence/Test/Deliver，不再扩大原两次源码修复预算。Solo修复已证实的date类型遗漏并补独立QA，再完成相同canonical消费者。原始实验缺少canonical交付记录属于夹具覆盖缺口，不能用原自定义DELIVERY.json替代验收。精确指令在stage-c-product-closeout-mission.md。


## 补验上限结果

两组均到达1200秒，由实验控制器SIGKILL，未产生正常agent_end或正式Deliver。Factory追加69次model calls、Pi估算5.1338；Solo追加77次、估算5.100349。累计Factory140次/7.60761948，Solo96次/5.598787。以上包括所有独立QA原生session，成本仍为配置价格估算，不是账单。

Factory已取得最终代码的真实独立修复Review和reviewer原始receipt，但尚未写成Task Evidence v2，Test仍为模板。Solo Task Evidence结构校验有效，并已产生aggregate，但Test/Deliver未消费完成；QA保留末尾换行finding，后续实际反例已否定该项；结构Approve本身仍不证明完整产品意图。两组共同功能检查仍8/8。`stage-c-product-closeout-raw-index.json`与两份closeout归档冻结了这些失败及额外成本。

观察到的收尾负担包括：初始夹具未建canonical项目导致事后adoption；reviewer绑定仍要写Completion的context；为保存中间证据反复commit使HEAD发生变化，需重新绑定。当前有限slice文档补充先建档、固定reviewed contract的顺序；未修改权限、schema或验证要求。后续若继续，必须另列阶段和成本，不覆盖两次已冻结结果。


## 独立核对Review findings的纠正

Root对两个当前样本实际执行date/amount/currency/月参数的末尾换行反例，均4/4正确拒绝。当前Node v26.8.1实证 `/^[A-Z]{3}$/` 对 `USD\n` 为false，只有加m标志才为true。因此Factory先前E1与Solo `ledger-review-001` 的JavaScript正则判断不成立；原Reviewer输出不改写，本文明确驳回，Factory为此改绝对末尾条件属于实际但不必要的返工。证据见 `stage-c-product-format-observation.json`。此前Root沿用finding作事实的文字判断已纠正。

另一个独立反例使用合法safe-integer逐笔金额 `[MAX_SAFE_INTEGER,1,-1]`，最终总额仍可表示。Factory报告正确总额，Solo因中间和溢出退出1；该行为差异保存在 `stage-c-product-sum-observation.json`。这与被否定的正则finding无关；不因一个finding错误而否定其余实际证据。


## 停止原Factory续接与新匹配实验

Factory第三阶段在723.843秒被Root主动停止：Git证实canonical-closeout在3af6680增加了一个原指令只允许Solo添加的date类型检查，当前Completion又把这项Factory越界写作“authorized defensive source correction”。旧Factory在补验前已有外层类型检查，3/3补充检查本已通过；新增内层guard是冗余源码变化，不是原两次修复内的工作。它虽已有有效Task Evidence和标明sequential-shared-context的aggregate结构，仍不能证明零权限扩大。`stage-c-product-final-reconcile-raw-index.json`冻结停止原因、原始错误表述与追加成本；Root未替其改写canonical记录或Reviewer结论。

新实验把已接受的canonical项目/任务记录放在实现前，两组共用Git基线f27f9ec7ffdf4744a8e8c32f318d33fa05579e75、同一GOAL/只读acceptance/种子源码、Pi Sol Primary和35分钟完整预算；两组都需实际独立Pi Task QA和同一canonical消费者。Factory另有Challenger与两个实现Worker，Solo由Primary独立实现。各自prompt不包含另一组的条件式修复指令。全部Role/RunSlice/权限源码digest与旧实验相同，仅实验起点与指令范围已明确改变。它不是未见样本，不用来证明泛化收益；只检验纠正后的当前完整产品路径。新两组证据独立存储，不能覆盖前面失败。基线authority已由canonical North Star validator检验；未由Root实现任何sample产品代码。


## 当前canonical匹配实验：完成与独立复核

| 指标 | Factory | Solo |
|---|---|---|
| 完整墙钟 | 1912.134秒 | 1597.568秒 |
| 正常native终止 | agent_settled | agent_settled |
| 原验收 / 相同补充 / 独立边界检查 | 8/8、3/3、7/7 | 8/8、3/3、7/7 |
| 全部角色model calls | 107 | 84 |
| 输入 / 输出tokens | 216740 / 54932 | 155977 / 42690 |
| cache read tokens | 6550784 | 5619712 |
| Pi原生估算成本（非账单） | 6.02371972 | 5.14126200 |
| 源码修复次数 / 限额 | 1 / 2 | 1 / 2 |
| Task Evidence / 独立Task QA / aggregate / Test / archived Deliver | 全部完成 | 全部完成 |
| 最终本地revision | 60a401734eb42cc055e3cb77f1a06a571ac15650 | 26d99710313f6d982348907e9288316074af9dee |

Factory的fresh Challenger使用Sol；两个实际Worker使用Luna/Terra，写入src/csv与src/ledger，重叠69.663秒；Primary集成后fresh Astra Reviewer发现真实的Number中间和溢出。Primary先复现、一次源码修复，再取得最终revision的独立delta APPROVE，共使用四个有限slice（限额五个）。Root未在启动后发送纠正指令，未改sample源码。

Solo同样完成独立Astra Task QA。初始QA遇到权限/receipt格式问题，第二轮指出真实的currency数组隐式转换与正号金额拒绝；Primary一次源码修复，最终QA APPROVE并保留一项P2：其currency回归测试使用无效CSV，未真正执行账本guard。Root以合法CSV独立复核该guard及其余类型字段，均拒绝并保留账本原字节。原P2没有被自动修复。Solo残留parseCsv孤立导出也不作为已交付的公共library；本实验交付为CLI，无release package。

两组aggregate均明确为sequential-shared-context，不能称作独立aggregate；实际独立Task QA另有原生session与external receipt。Root从实际Reviewer result.evidence解码得到的回执字节与published receipt完全相同，reviewer read_only=true，native base与receipt subject匹配。源码/README在Task QA后至aggregate和最终提交均未变化。Task Evidence原始输入hash、独立QA回执、aggregate传输、只读GOAL/acceptance/Owner决定/North Star不变与Change归档均经独立核对。

全部当前观测、命令输出、session身份、源码指纹、原始档案文件列表及SHA保存在stage-c-product-canonical-observation.json；两份stage-c-product-canonical-{factory,solo}-raw.tar.gz冻结原生事件、Git历史、源码与canonical记录。Reviewer缺少时钟而blocked、误列scope、report限制复制错误均保留，不写成第一次成功。针对两组共同出现的只读QA元数据问题，有限slice文档补充由Primary在启动前提供真实身份/请求时刻/subject并以普通JSON字符串回传receipt；未改变权限或schema。

当前Factory墙钟约高19.69%、估算成本约高17.16%。该任务没有速度或成本收益，不把单次质量合格推广为稳定优势。初始失败与追加尝试的沉没成本留在前文；此表只比较同起点35分钟的完整新实验。当前证据支持C的完整路径，D仍须另外证明两个task shapes、两个qualified Profiles、重复适用收益及正确Solo选择。
