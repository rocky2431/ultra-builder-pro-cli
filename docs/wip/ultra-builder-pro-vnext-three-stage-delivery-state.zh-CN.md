# Ultra Builder Pro 工厂交付状态

状态：**全部八步继续。步骤1–5完成；Stage B/C已通过独立Task及aggregate Review、实际产品验证和canonical交付。步骤6（D）接续，步骤7–8（E）待实施。**

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
| 5 合格委派与首条工厂 | done | Stage B c8eb8a2；C Task/aggregate APPROVE，实际canonical产品与公平Solo，step5-acceptance.zh-CN.md及C归档 |
| 6 可运营工厂 | pending | Stage D全部退出条件 |
| 7 跨会话持续运行 | pending | Stage E耐久恢复和W4 |
| 8 经评测的策略改进 | pending | baseline、held-out、Owner promote/reject与rollback-ready |

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

## 待继续的产品退出条件

- D：两个task shapes和两个qualified Profiles重复；multiwave与worktrees；W3丢失/重复/session death；正确Solo选择；可量化且重复的适用任务收益。
- E：Primary与Supervisor均结束后的fresh W4；durable Grant expiry/revoke/invalidation/dedupe/fencing/machine-loss；候选baseline/held-out完成后交Owner promote/reject，保留rollback-ready。

当前实现仍受已接受计划`thinking/trellis-direction-20260908/RESULT.md`及R2架构约束。模型负责分解、路由、集成与完成判断，机械代码不拥有语义计划。Stage B通过不等于完整软件工厂已运行。

## 历史与恢复

此前长状态记录原字节保存在`work/trellis-eight-step-20260909/step5-pre-closure-state-history.zh-CN.md`及Git历史；其中“当前”“下一步”、旧授权和旧writer均是历史快照，不是新执行指令。

已结束native流与旧QA解压缓存移至`.ultra/.runtime/trellis-eight-step-20260909/`；逐字节索引与可移植归档在`step5-native-traces-index.json`、`step5-native-traces.tar.gz`。此调整未提高物理snapshot的256文件/16MiB限制，未改product排除规则。真实资格原始归档独立冻结。当前独立Review raw流另存`step5-aggregate-qa-raw.tar.gz`。


最新独立反例纠正：两组对date/amount/currency/月参数末尾换行均正确拒绝，Reviewer所称JavaScript `$` 绕过不成立；原finding保留并在比较报告中驳回。Factory为该误报做了不必要返工。另一个真实总额反例 `[MAX_SAFE_INTEGER,1,-1]` 在Factory成功、Solo因中间溢出失败。不能将Review输出直接当产品事实。
