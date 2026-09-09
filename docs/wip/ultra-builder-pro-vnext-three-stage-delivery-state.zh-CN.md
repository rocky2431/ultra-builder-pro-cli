# Ultra Builder Pro 工厂交付状态

状态：**全部八步继续。步骤1–5完成；Stage B/C已通过独立Task及aggregate Review、实际产品验证和canonical交付。步骤6（D）实施中，步骤7（E）实施中，第八步评测已结束待Owner决定。**

## 当前授权与分工

Owner接受八步计划并要求“每完成一个部分 commit，并且更新文档留下证据”。Codex独占代码和测试实现；Pi可以作独立QA或实际委派试验参与者。原话见`.ultra/decisions/2026-09-09-eight-step-implementation.md`、`2026-09-09-root-independent-implementation.md`。原暂停及旧作者分工已被覆盖，历史失败仍保留。

当前范围允许在相关源码仓库本地修改、检查、提交，以及使用既有认证进行有限模型试验。没有push、tag、发布、部署、真实HOME安装或binary替换、凭据修改、生产数据变更。未知策略候选的promote/reject仍由Owner明确决定。

## 八步进度

| 步骤 | 状态 | 当前证据 |
|---|---|---|
| 1 行为基线与真实缺口 | done | step1-acceptance.zh-CN.md，47f7911 |
| 2 自然语言与相称工作路径 | done | step2-acceptance.zh-CN.md；Pi公共入口实际用途澄清和交付 |
| 3 上下文与知识往返 | done | step3-acceptance.zh-CN.md；实际导出、维护、全新会话读回和导入 |
| 4 日常完整体验 | done | step4-acceptance.zh-CN.md，2ce287a；显式恢复与新任务切换 |
| 5 合格委派与首条工厂 | done | Stage B c8eb8a2、C dea1da2；C Task/aggregate APPROVE，实际canonical产品与公平Solo，step5-acceptance.zh-CN.md及C归档 |
| 6 可运营工厂 | in_progress | D机制与原生W3已验证；固定V2十次比较结束，重复成功/收益条件未通过 |
| 7 跨会话持续运行 | in_progress | 原生W4与撤销已观察；公共入口/文档/隔离安装已检查；独立QA修复和较长任务闭环验证中 |
| 8 经评测的策略改进 | in_progress | 24次比较及独立盲审结束；建议拒绝候选，等待Owner明确决定 |

以上验收文件均在`work/trellis-eight-step-20260909/`。Stage A历史接受commit为b765b55，原旅程、失败、反馈和证据不重做。

## Stage B当前结果

- Task1 runtime safety completed，v2 SHA `61b076aa5d9541511cc8b8c3587ff726280cf765fc97b1117eaf3c85c40bf6ac`。覆盖实际probe/worker/ACP/CLI环境边界、进程生命周期、fence、协议观察与恢复。
- Task2 Pi native qualification completed，v2 SHA `c8f1f3647f6f943f9e936420d6a9b798bf6edd63a79c03cd699285efc5a852b7`。Pi 0.85.1使用既有permissionDecision与CLI消费者，保留八个真实工具。D1Q-02R3精确决定与同强度效果说明见`2026-09-09-stage-b-pi-native-selection.md`。
- `ubp-pi-product-NcFFGD`实际允许in-root write/read；五项禁止工具请求被原生拒绝，独立文件及网络sink无效果，writer stopped。`ubp-pi-product-7XeasI`通过未移除资格门槛的公共入口并finished。原agent_settled解析失败、旧ZCode失败、Claude未证明与OpenCode401保持原结论。
- Task2三份独立Pi Review APPROVE，P0/P1=0、P2=1。aggregate `vnext-d1-aggregate-stage-b-delta-20260909`三份独立Pi镜头逐项确认原review-spec-001、review-tests-001、review-errors-001已解决；SUMMARY SHA `52e5e04d366e1ae62e6123a4cd53a5c68b5bdddac7c6cd7fa54e78f4a7f9c296`。这次delta没有新增finding；父级P2/P3并未自动修复或消失。
- 当前源码完整检查804 Node、104 Hook、audit0；pack、Skill验证与隔离安装检查通过。真实HOME Doctor exit2为既有degraded，不代表本次安装成功。
- agent-delegation 0.5.0共享ACPX入口已在隔离分支通过72项检查，提交`705734c`并快进合入原main；六个限定路径保留0.5.0/Pi已有行为，entry SHA f734ed38不变。未安装。Goal已有对应上游修复，当前126项相关检查通过，无重复改动。

## Stage C 已完成

Stage C `chg-ultra-vnext-c-finite-slice`归档；Task `vnext-c-finite-slice` completed，v2 SHA `bfdc2663755b9084091bcac90e7536897fd24ee49480554ab027c82a00f52fdd`。Task Review三个fresh Pi上下文APPROVE，SUMMARY `78c0bf057ab6c5d630e0acf9115f840770538e8b5772839f898c57201b59b259`；aggregate三个fresh Pi上下文APPROVE，SUMMARY `9bf0c4d80acece6130c48b75a5ca1a882941101a9e713c481b18e0d6ce32c4d7`。两者零记录finding，errors aggregate自述只保留阻塞项的限制原样保留。

有限RunSlice整批准入后并行启动，取消/reconcile不自动重启未知writer；原生Pi W1同turn返回，W2分别绑定input/message/ack并保持sticky consumed，无空闲model轮询。正常W1/W2、重复、确认前后死亡均有实际原生证据。新增permission helper导出改变指纹后已重新做同强度Pi资格OfQaaa；原Stage B资格记录未重写。

当前canonical匹配产品实验：Factory两个disjoint Worker重叠69.663秒，fresh Challenger，Primary实际集成、真实溢出复现、一次修复、最终E2E、fresh independent Task QA及canonical Evidence/aggregate/Test/archived Deliver。Factory/Solo均35分钟内正常完成，原验收8/8、补充3/3、独立边界7/7。Factory1912.134秒，Solo1597.568秒；估算成本6.02371972/5.141262。Factory本次慢19.69%、成本高17.16%，无效率收益主张。

初始两组、20分钟补验和旧Factory越界续接保持失败/拒绝；新canonical实验不覆盖旧结果，也不称held-out。JavaScript末尾换行误报已由实际反例否定；Reviewer原始输出保留。详见stage-c-product-comparison.zh-CN.md及全部SHA原始归档。

当前检查：808 Node通过、四项可选单独opt-in通过、104 Hook通过、audit0；最后窄检查36/36、artifact80/80、Skill和pack通过。HOME只读doctor exit2保持既有degraded，未安装。当前源指纹、native效果、Review、Task Evidence与Test/Deliver的消费链见C归档及stage-c-final-audit.json。

## Stage D 当前实施

当前唯一active Change为chg-ultra-vnext-d-operational，task vnext-d-operational。Codex独占实现；复用RunSlice与delegate，加入Git工作树登记/保留/清理、模型草稿的机械digest编译，以及独立有限控制进程到原生Pi的专用IPC消息。真实Git已证明dirty/ignored/fence/substituted目录拒绝，保留未合并commit；无强制删除、语义调度或新依赖。

1VrMEG真实W1/W2/W3均通过，W3控制器PID97124与Primary88250不同，双Worker重叠、正确结果与实际ack、重复不增加turn、空闲3秒零模型轮询。d8JQ58确认前死亡unknown；ZjOszE确认后死亡consumed；2rZZTT丢失控制器后无自动turn，显式同session reconcile消费原结果，零重复worker。初次丢失通道观察脚本失败EGMbUa原样保留。精确证据在stage-d-native-w3-raw-index.json。

当前完整release已通过817 Node、104 Hook、audit0；pack与Skill通过，HOME只读doctor仍为既有degraded。紧耦合样本实际选择Solo、未委派、原验收6/6。v1五组保留：expense Factory正式交付（1910.254秒、6.64152768估算成本），Solo/Step1源代码通过但收据无效；两个manifest样本受Root误用fs.symlink的固定夹具错误影响，不能算产品结果。原夹具、失败、一次明确停止和全部原始字节保留。

修正四处同步API调用且不改断言后，夹具14/14通过并仍拒绝原始缺陷。第一次只读handoff探针因外部路径越界正确blocked；第二次使用树内日志、指令内精确事实和raw JSON，39.076秒完成且原receipt sensor通过。现有文档据此澄清交接，不改权限或校验器。新v2独立冻结十次比较已结束：源码验收10/10，正式交付链9/10，原生Primary正常结束8/10。Manifest Factory第一轮缺收据超时，第二轮完成；Manifest Solo第二轮在watchdog前19.685秒已完成最终交付提交，但Primary仍超时，两个事实均保留。Expense Factory两次都慢于Solo，相对手工Step1的时间/成本优势没有重复。D-04重复Profile成功未满足，D-05重复收益未建立；fresh Review和D canonical交付未完成。详见stage-d-product-v2-comparison.zh-CN.md、逐次audit与SHA原始归档，不覆盖v1，不称held-out，不宣称D完成。

## E 的独立实施

新增一次性 durable grant、原生注册、新会话效果边界、expiry/revoke、持久去重及可选 macOS 通知。原生较长双 QA 的前三次旅程均保留：首次 fresh 180 秒超时；第二次输出存在但 decision 类型错误，消费未确认；第三次 R60vX2 两份实际 QA 加 fresh 汇总成功 consumed。QA 发现的执行依赖绑定、protected-path 大小写／symlink、最终消费前授权检查及 runtime claim 丢失的状态真值缺陷已由 Codex 修复，原反例和三轮报告保留。conductor 死亡漏通知有真实失败 nQKQo2 和修复后通过 LPyuky；unknown 不重投，通知仅证明 OS 接受请求。

当前权限源码重新资格 x1g7Nn 已获独立 QA APPROVE；公开入口 wYI41n 未移除 qualification 即完成真实合法 write/read 与 typed result。最新源码的普通 W4 zBL41n 已实际完成：旧 Primary 与 Supervisor 停止后，fresh Pi Sol 读取两个 Worker 的原结果并写出正确的 6+4=10，精确消费回执 consumed；重复 wake 返回原结果、零重复 Worker、原 receipt 散列不变。源码与试验完整绑定在 stage-e-current-native-index.json；它是普通生命周期证明，不是再次源码 Review 或整个 E 验收。

最新隔离 Codex 安装 healthy（134 资产）、Skill 与 Plugin Creator 校验及 pack 通过；真实 HOME doctor 仍为既有旧版/缺失，未安装。最终全量检查见 stage-e-release-current.json。D 的收益缺口仍在，E 正式 canonical Task/aggregate/Test/Deliver 尚未完成；Owner 已追加一次独立最终评审，该轮返回 INCOMPLETE、未报告新 P0/P1；单次 Bash 哈希请求被拒绝，生产回执保持 failed/permission_denied。报告一项旧哈希及对当前 W4 的证据表述已单独核对，未改写原报告；追加预算已用完，不自动继续修复评审。详见 stage-e-final-review-disposition.zh-CN.md。真实物理重启和完整离线网络故障未经观察。
D 的命令帮助修复单独提交 51ab562，共享保护路径及 Pi 重新资格单独提交 c5a7fe2；两者不代表重复性能收益。

W4 Host API预检已观察旧Primary与W3 controller均退出后，全新Pi会话读取原结果并产生一次正确语义处理，零重复Worker，原收据字节不变。这是明确另行授权的Host API预检，不是delivery_unknown自动重投资格，也不是durable Grant/撤销/机器重启的产品证明。完整待验证边界见stage-e-durable-preflight.zh-CN.md；第七步已开始独立实现，见stage-e-implementation.zh-CN.md；完整产品验收仍未通过。

第八步从真实Pi typed-result失败产生一个单行候选：传入已有canonical schema；与当前行为、仅说明数组类型的简单方案做固定24次开发/held-out比较。独立Pi QA提供数据，Codex独占候选/评测代码；首版提示泄露答案在执行前被拒绝并由QA修正。“服务名单/服务数量”的评分歧义已由独立盲审核对，24份文本事实均正确；原分数和原字节均保留，权限拒绝与格式失败仍计入。current/candidate/simpler有效结果为2/8、5/8、1/8，但candidate开发组未改善，未满足冻结资格，建议拒绝两个候选。当前源码未采用候选；隔离patch/reverse已证明rollback-ready，Owner reject尚待明确决定。完整结果见stage-e8-comparison.zh-CN.md与SHA原始归档。

## 待继续的产品退出条件

- D：两个task shapes和两个qualified Profiles重复；multiwave与worktrees；W3丢失/重复/session death；正确Solo选择；可量化且重复的适用任务收益。
- E：Primary与Supervisor均结束后的fresh W4；durable Grant expiry/revoke/invalidation/dedupe/fencing/machine-loss；候选baseline/held-out完成后交Owner promote/reject，保留rollback-ready。

当前实现仍受已接受计划`thinking/trellis-direction-20260908/RESULT.md`及R2架构约束。模型负责分解、路由、集成与完成判断，机械代码不拥有语义计划。Stage B通过不等于完整软件工厂已运行。

## 历史与恢复

此前长状态记录原字节保存在`work/trellis-eight-step-20260909/step5-pre-closure-state-history.zh-CN.md`及Git历史；其中“当前”“下一步”、旧授权和旧writer均是历史快照，不是新执行指令。

已结束native流与旧QA解压缓存移至`.ultra/.runtime/trellis-eight-step-20260909/`；逐字节索引与可移植归档在`step5-native-traces-index.json`、`step5-native-traces.tar.gz`。此调整未提高物理snapshot的256文件/16MiB限制，未改product排除规则。真实资格原始归档独立冻结。当前独立Review raw流另存`step5-aggregate-qa-raw.tar.gz`。


最新独立反例纠正：两组对date/amount/currency/月参数末尾换行均正确拒绝，Reviewer所称JavaScript `$` 绕过不成立；原finding保留并在比较报告中驳回。Factory为该误报做了不必要返工。另一个真实总额反例 `[MAX_SAFE_INTEGER,1,-1]` 在Factory成功、Solo因中间溢出失败。不能将Review输出直接当产品事实。
