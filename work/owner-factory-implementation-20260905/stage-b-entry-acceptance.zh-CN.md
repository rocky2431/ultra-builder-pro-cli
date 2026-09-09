# Stage B 公共 ACPX 入口分项验收

Codex 于 2026-09-05T19:21:18.599990+00:00 接受现有 agent-delegation/ACPX 公共入口的四文件分项。Stage B 的 UBP glue、bridge 非成功终态、真实 Host 资格和严格 Task/aggregate Review 尚未闭合，不能从本分项推导整个工厂完成；未 commit、未安装、未 push/发布。

实际作者是初稿 ZCode 与后续 Kimi。Kimi 修复回合 fd6e4a3b4b954aa5bdfc605eaf06fe7a success/end_turn，1456.832s；补充失败阶段回合795bfbfdd5e940f1a7536fd60b10ec91 success/end_turn，650.266s；两 shell 均收取exit0，当前无该工作树writer。分别151与72个tool-scoped错误、0protocol错误留在原始回执，不以错误总数冒充产物失败或零错误。工作树 `/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill` 基线 f9dc8b50fb24a1d83e7ad77dedaeda4bdc5c5166，保留独立0.2.1安装修正与具名stash备份。

已接受的行为：单一持久UTF-8/NDJSON reader、fragmented permission/EOF/abort待决收尾；初始化取消后不再提交prompt，活动取消保留canonical cancelled；真实爆发输出不再被process.exit截断，进程内oneshot关闭不再为丢弃不存在的持久状态额外启动Host。最后两项原为P2，作者用本地假Host与真实pinned ACPX的定向RED明确复现当前验收失败后做最小修复。原始红绿证据在该工作树的 `docs/research/2026-09-06-acpx-consumer-repair/`。

公开v1仅增加optional `result.error.phase`：ensure_session只表示ensureSession失败且startTurn从未被调用，turn表示已跨过startTurn边界；后者不证明工具已执行，missing/unknown不证明before-prompt。此处不自行触发fallback；UBP消费者必须核对该事实才可保留原合法pre-prompt auth fallback。精确原始权限信息经IPC供调用者决定，runtime按kind第一项选择，文档已收窄这一限制。

Root独立完整命令 `python3 -m unittest discover -s tests -v`，指定已安装runtime与ACPX测试路径，54项全部通过、0skip、exit0、40.419s。日志SHA-256 f5a09f5649b5d7bb9fa9f2f0069331c47334c9ba71529a5e31043f57feadc34d；`stage-b-root-final-entry-tests.json/.log` 留在UBP ignored runtime。四源测试前后哈希不变；diff check通过。独立只读源码报告 `stage-b-entry-final-source-review.zh-CN.md` SHA-256 5d437daceb61f84b531e6d65a9ae24767b77282227684c63cdb9420e2df81682：无P0/P1，原七项断言保留，README冲突双边内容与installer当前消费者正确。

| 文件 | 最终SHA-256 |
|---|---|
| README.md | 923f7df2d0d189f608cae7962ccdc9767f180005fe4cb950b2c9444c6e445ff8 |
| scripts/install_user.py | f4aeecb60816c74e362ee0e8d630fafc02fee86801f1756503bbf25bc74ec557 |
| runtime/acpx_delegate_entry.cjs | 99049a249b8bf719914601cb82869692379e5a8bba8fff1ad51d796fe5a4c6bb |
| tests/test_acpx_delegate_entry.py | a1a76492c878b061a74ed67d03bbd003dacfbf64ecdf4b2ccdd75c757a31a949 |

保留边界：drain和close各有10秒界限，不能把交接的“整体10秒”视作总时限；ensureSession公开API没有abort入口；cancel/result不证明全部后代已停止，UBP继续掌握writer/fence；新的pinned SDK按连接owner处理permission/update，未保留旧driver的严格sessionId等值检查，尚无当前跨session破坏反例；必须把模型文案改准确，不因此添加第二协议engine。未执行真实Provider/Host资格，未证明六Host或Windows默认路径等价，当前HOME仍未安装新入口。

本次只运行既有验证、写验收文档；Root没有实现或测试代码写入。分项等待完整Stage B gate后由Root统一提交并安全合入原checkout。

## 独立 0.3.0 更新后的整合复验

原 checkout 已独立推进到 `0f456a0839cddeec7add09c09b4e10f202cc08ee`。Root 仅对 README/installer 具名 stash、fast-forward 后恢复，无冲突，保留独立 async submit/wait 与 0.3.0 安装版本更新。入口和测试两个 untracked 文件全程未移除、未改变字节，不影响正在使用它们的 ZCode 读者；备份 `90b60acd56a833330096422bc34145b728ac429e` 保留。

Root 独立整合全量复验 56 tests/0 skip，exit0，66.197s，四个受检文件前后 SHA 相同；日志 SHA-256 `08efa11e13c6fad9197f262189bdd77d220a5ac66cfface8cc5bf327b81dc2c2`。入口仍为 `99049a249b8bf719914601cb82869692379e5a8bba8fff1ad51d796fe5a4c6bb`。操作记录 `stage-b-entry-0.3.0-integration.json`，测试 `stage-b-entry-0.3.0-integrated-tests.json` / `.log` 位于 UBP ignored runtime。分项接受有效；这些独立版本更新不归功本任务。Stage B 整体仍未验收，尚未 commit/合入原 checkout或安装。

## 后续真实版本反例使 Runtime 接受暂不成立

2026-09-06正式runtime Review vnext-d1-runtime-stage-b-final-review-20260906已返回REQUEST_CHANGES（SUMMARY SHA c98b0afca0be149f86a8307342e277e57f4272a897222f54273fd38a6c31959b）：review-code-001与review-tests-002指向同一个真实协议版本缺口。最终entry99049a…+ACPX0.13.2+现有wrong-version fixture收到v2后仍调用session/new和session/prompt并completed/end_turn；UBP随后常量填v1。此前56项通过及分项审查均为真实记录，但没有覆盖这个实际public-runtime反例，不能再作为完整协议兼容接受。原始数据已保留到runtime Task evidence/stage-b-wrong-version-review。实际ZCode正按stage-b-zcode-protocol-version-mission.md修entry及UBP真实消费与回归；现有源码分项等待该P1关闭，不重写旧日志、不让旧接受取代新失败。

## 协议P1修复后独立核对（正式delta Review尚待裁定）

实际ZCode cc0b214…已结束；entry最终f734ed38cce00f14aa3229a6b21f8c7a452d6f7c2ef46f6b362907ba6aacecbd通过公开sessionStore观察真实版本并在startTurn前拒绝unsupported/unproven，UBP不再合成v1。Root独立105/105委派检查与58/58关联源码测试通过，最终完整737 Node+104 Hook/audit0通过，源码未变。真实wrong-version无prompt、版本2；session可能先被创建，auth未观察版本为null。原99049…反例和旧绿色保留，新事实与两个后续完整run失败/处置均见stage-b-protocol-version-root-review.zh-CN.md。当前仍不将这份分项核对当作Task2资格或StageB完成。

## 独立 0.4.0 整合复验 — 2026-09-05T23:02:35.387844+00:00

实际 Kimi b653c69f13794a9f8b0b9e5a85f47d36 已 success/end_turn，723.213s execution（216 个 tool-scope RPC errors 与同一批 216 tool_errors，0 protocol errors，不能相加为432次故障）。本次 installer/README/测试整合保留独立 base772929d；入口f734及既有 entry tests不变。Root读最终diff并独立运行现有70项全套，70通过/0失败，81.8895s，6个源文件前后SHA稳定，git diff --check通过。原始日志/元数据：.ultra/.runtime/owner-factory-implementation-20260905/stage-b-entry-0.4-root-tests.{log,json}；日志SHA8b8ce2b573fbb8ddc8973ec0cb1420c4e93310bb47064dc3673600a5c249a262。新安装消费者将入口放在选中runtime generation旁，并在registry acpx_delegate_entry公开绝对路径；UBP仍须由实际作者接通该发现消费者。这里的通过不接受Stage B，也不授权实际HOME安装。
