# Pi candidate2：Root 验收与独立 QA 消费

日期：2026-09-09。所有 Ultra 实现由 Codex 编写；Pi 为实际样例执行者或独立 QA。

F1 中文标题样例5/5，原冻结断言逐字保留；D2 范围样例26/26，原有方法 AST 全部保持；Root 另以三个日期和独立数据库操作范围端点、旧关键词及日期显示。F2 默认交互先问实际用途，再按逐字冻结答案交付静态本地记账工具；Root 通过实际 HTTP 浏览器录入9月12.34+27.66、8月100，确认月合计、商家检索、reload保存及月份切换。浏览器拒绝直接file URL，未规避；该用法 UNTESTED。独立QA只审阅F2代码与Root浏览器记录，没有亲自浏览器操作。

D4真实回合首次成功read之后等待10秒；17.4147秒时仍活跃，向公共命令进程组60343发送一次SIGINT，Node与Pi均退出，后置进程组为空。中断时没有产品文件变化，因此只观察 active-turn recovery，不声称半写文件恢复。原生session 01a0848c-5da5-75d3-807d-91ef3bc2f690被同一session文件续接；没有重复初始请求，114.588秒后完成范围功能并报告26项通过。

**D4验收失败**：新增范围测试时删除了原有 `TestAddAndFind.test_list_shows_newest_day_first`。其余原方法未改；新增两项。Root在独立副本同时运行原始25项和当前26项，共51项通过，说明未发现对应功能退化，但不能把测试删除追认成未发生。原产物保持原样，原失败、工具参数错误及缺Git错误均留存。

独立QA初报D4 PASS漏检了冻结测试保留条件，Root不采纳该结论。`pi-candidate2-qa.zh-CN.md`保留原文，要求追加纠正。整体第四步未通过。并非以测试数量判断完成，而是将原始验收条件逐条和实际行为核对。

根因定位：小改通过ordinary route，已有TDD纪律不保证收尾发现一次成功edit意外删除的旧测试。candidate3仅在普通工作收尾明确比较起始文件、检查意外删除、保留仍相关的原回归；不新增硬门禁、状态或引擎。candidate2已冻结与归档；candidate3冻结后由独立QA另选未用于调试的新恢复请求，旧D4不反复刷到通过。

候选2精确隔离源 release 764 Node +104 Hook / audit0；pack和Init Skill验证通过。真实HOME只读doctor仍为既有degraded（exit2），没有安装。详情见`pi-entry2-release.json`、`pi-entry2-other-checks.json`与对应日志。110个操作/产物文件索引见`pi-candidate2-evidence-index.json`；原始native含思考的会话只留本地，Git归档只有文本与工具操作投影。
