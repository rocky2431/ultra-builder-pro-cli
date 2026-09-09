# Stage B 协议版本修复：Codex 独立核对

记录时间：2026-09-05T21:39:36.097918+00:00。这是源码与已执行检查的核对，不是正式 Task Review 或 Stage B 完成声明。两个 D1 任务保持 in_progress；原失败 SUMMARY 的两项 P1 需由 fresh delta Review 裁定。

实际 ZCode 回合 cc0b2147488e48ff8a84192ab4f03a38 已结束，success/end_turn、1307.582s、0 rpc/tool/protocol errors；receipt SHA d767eda6234d31b05eff3cd8549fe101b97280135d547a62500e64c81def77f8。Root未编写实现或测试。tests/delegate.test.cjs 的旧合成版本断言属于该缺陷的直接消费者，已按完整Owner指令记录范围澄清；未扩大到P2自动修复。

## 实际改变

公开entry仅通过已有createAcpRuntime的sessionStore.save读取公开AcpSessionRecord.protocolVersion。ensureSession返回后、startTurn之前拒绝非v1或未观察版本；result行可选protocolVersion来自该观察。UBP从这个字段消费版本，初始化未观察成功时为null，未从终态或错误文案合成v1。旧SDK、通用协议层、权限决策、writer fence及已修UTF8/取消/close/drain行为保持对应源和回归保护。

公开SDK会先创建会话再保存record，因此session/new可能已发生；修复保证的是拒绝提交session/prompt，不能声称初始化没有会话效果。该record只经过本entry的内存store，不意味着写入持久语义状态。

最终entry源及Root独立副本SHA均为f734ed38cce00f14aa3229a6b21f8c7a452d6f7c2ef46f6b362907ba6aacecbd；Root副本为/tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs，解析既有SDK0.13.2。旧/tmp/ubp-acpx-runtime-ppTQ/runtime/acpx_delegate_entry.cjs及其99049…失败字节保留。

## 独立执行的证据

- node --test tests/delegate.test.cjs tests/acp-driver.test.cjs tests/acp-conformance.test.cjs tests/acpx-entry.test.cjs，显式UBP_TEST_ACPX_ENTRY为Root新副本：105/105，0失败/跳过，38.193s，源码前后相同；raw SHA 604389585f541cd46d82e6a3e2634f0b3d5a87c819f446e6098c6e46bfdbb00c。
- agent-delegate-skill工作树HEAD0f456a0839cddeec7add09c09b4e10f202cc08ee，带既有SDK/runtime opt-in的unittest discover：58/58，0失败/跳过，63.817s，四个任务源文件前后SHA相同；raw SHA 0fcdb1ecbbb36af6172e5d528ce7fa16921c86d16d0e091a39f111276364b84d。
- 新真实AcpDriver回归使用最终公开entry和现有wrong-version Agent，断言实际版本2、typed acp_turn_failed/ensure_session、无session/prompt、无host_output和成功terminal事件。Python入口检查另断言未观察版本拒绝、v1正常以及auth失败版本缺省。
- pack --dry-run：142 files，version5.0.2；官方Skill validator通过，diff --check通过。真实HOME只读Doctor沿用当前已留存degraded观察，不声称安装已更新。

## 必须保留的失败和局限

首次本轮完整release为737 tests中736 pass/1fail，exit1，98.022s，raw SHA1aa74db5aeb2929ce196b744da15a1f023d302d813cc31fc22a3bc77301c5685；失败在project-artifacts.test.cjs:1021，Root新增raw未全部列入Planned Path Inventory。已有检查同时要求canonical task evidence为平铺普通文件，Root因此将分组wrong-version持久副本移到work/owner-factory-implementation-20260905/evidence/stage-b-wrong-version-review，字节完全不变。原Review使用的runtime raw路径不变；搬迁映射见.ultra/evidence/vnext-d1-runtime-safety-boundary/stage-b-wrong-version-relocation.json。Root补全精确raw清单，单独重跑该project-artifacts检查1/1通过；Acceptance完整段落SHA仍为5d8cda45a87088bd082e74dc84230333fad8567d5b022212000cf16157a9cb5e。未修改实现/测试来修此归档错误。完整release重跑结果另见stage-b-root-protocol-release-after-evidence-reconciliation.json及raw log，当前报告不预判其结果。

作者observation.json中的observed_at=2026-09-06T05:55:00Z与真实launch2026-09-05T21:07:58Z及1307.582s时长不符；保留作者原数据，但不作为freshness。采用Root实际command时间及源码快照。作者fixture/provider_calls=0仅指诊断运行，没有抹去其编码回合自身的metered调用。

原三项P2仍非阻塞：新bridge .r1的旧release/Provider文案归因、客户端能力广告行为等价尚未证明、其余真实entry+driver组合回归尚未正式加入。没有因此自动改写这些范围。真实ZCode权限资格尚未执行，当前测试的Agent均为本地fixture；不能以绿色结果关闭Task2或全部工厂。

后续完整release（stage-b-root-protocol-release-after-evidence-reconciliation）仍exit1：737 tests=736pass/1fail，104.345s，raw SHA ad3c61ac016935204e7affb2d43b28d36f6b907d578dfe662846c2a92d67abda。归档用例通过；唯一失败为review-wait.test.cjs:1062，子进程status为null而非预期1，整例6597.909ms。源码的子进程watchdog为5000ms、当前Node默认文件并行度16；这符合超时可能，但原输出没有error/signal，不能确认原故障根因或称之为无害。相同源码、相同断言的定向回放1/1通过（298.578ms用例），raw SHA2d25de563f1a071702cd869531da6d4e1ea168d7a95bb251a2aff253024b10a1。现在仅重试完整门一次，保留以上负面证据，不改代码、不提高超时、不关闭任何断言。

最终完整release（stage-b-root-protocol-release-final）实际exit0：737 Node +104 Hook，0失败/跳过，audit0，133.639s。raw SHA cce32146954c41a2fd5fe5e4221b2a471d0eb3448245be5d880a3276afcabeb5；172个所测源/独立entry观察前后相同，默认并行/断言未改。该绿色不重新归因或删除旧null退出失败；正向Host资格尚未执行。command前实际freshness为HEAD b765b55…、digest c1eee1175d5ca50ca45672b1ff4a53ed43a68a37a7305df6d9fdcb098f09e58e、2026-09-05T21:43:03.275226+00:00；后续Review/完成元数据另行捕获，不能伪装成测试前已有字节。

## 当前 Task2 记录结构纠正 — 2026-09-05T23:33:08.700939+00:00

实际 Kimi 的后续全量 Node 检查758项中757通过，唯一失败为project-artifacts.test.cjs:1188：Task2缺少当前Task Review标题。原因是Root之前整理恢复文档时，把旧Review降为Historical而没有保留当前待审段。这是Root记录整理缺陷，不归给Kimi源码。Root只补回实际Grant/父级Summary/未闭合finding/Retention的当前待审段；没有改测试或制造APPROVE，也没有覆盖原失败日志stage-b-launch-binding-full-node.log。后续定向结果见stage-b-root-task2-record-repair.log。
