# 知识回写链 K3：真实观察通过，最终日常版本尚待入口修复

在冻结candidate2上，两次native Claude2.1.263 / claude-opus-5[1m]完成了K3。会话1实际检查v2导出，维护既有docs/tech-notes.md的现行格式、撤销条目和续行规则，注明日期与数据/源码出处；会话2使用唯一新目录名、全新session，只继承项目文件和随后放入的新导出。其Bash工具实际cat了更新后的tech-notes、accepted决定和废弃v1笔记，再完成导入核对，未要求Owner重述这些事实。

Root在两份交付副本各跑已有9项测试，全绿，原3项seed测试字节未变；第二份库存7条：夜晚的潜水艇4、遥远的向日葵地2、俗世奇人1。两条撤销未入库，两条多行笔记保留换行；原2条种子与会话1的4行前缀均逐字节保持。仓内全部11个fixture/operator输入SHA未变。完整记录与工具ID在step3-k3-observation.json，运行输入与双manifest在step3-k3-freeze.json及其candidate2引用。

这条路径没有Skill调用，证明当前Host能通过已有项目文档完成选材、维护、筛选和后续正确使用；它不证明新自动注入、跨Agent材料交付或统计生产率收益。计划允许已有正确路径不改，因此不为第三步强制新增Hook、知识库或第二份manifest。后续工厂仍须验证分工时的真实消费。

步骤2候选仍未接受，不能据这条链宣布日常里程碑完成。知识路径观察保留，后续只针对影响此路径的实际源变化补验证；未经变化影响分析，不把candidate2的版本标成后续版本。本次是scripted-owner-replay + live-provider-run，非真人操作时间测量。
