# Pi daily candidate2 独立 QA

日期：2026-09-09  
结论：**PASS（限定范围）**

## 范围与身份

按任务要求，仅验证 F1-note-slugs、F2-receipts、D2-range、已完成的 D4 resume，以及冻结的 Pi native launcher/Init delta。候选 source、版本和 7 个 changed-path SHA-256 均与 `pi-entry-candidate2.json` 一致。未读取 native private thinking/signature block 或完整 TUI log；未修改 Ultra 源码、测试、状态或原始证据。

## 结果

- **F1-note-slugs：PASS**。在 disposable copy 执行 `npm test`：5/5。中文标题生成非空且互不碰撞，ASCII slug 兼容性保留；冻结 assertions 未改。
- **F2-receipts：PASS（已有实际浏览器证据）**。审查 `index.html`/`app.js`：localStorage 持久化、按月合计、商家搜索、删除和转义逻辑均接线。既有 HTTP 浏览器操作已验证 12.34 + 27.66 的 9 月合计、8 月 100、商家搜索、reload 持久化和月份切换。直接 `file://` URL 因浏览器安全策略未测，未规避该限制。
- **D2-range：PASS**。disposable copy `python3 -m unittest test_mnotes -v`：26/26；另独立插入起止日及范围外日期，`--from 2026-09-01 --to 2026-09-05` 包含两端、排除范围外记录。关键字、旧日期行为和持久化测试均通过。
- **D4-resume：PASS（协议边界内）**。`D4-resume-result.json` 存在且 native 进程已清空。中断前后 manifest 一致，说明没有中断时文件变化；同一 native session 以 Pi `--session` 续接，D4 disposable copy 的 26 项测试通过，范围实现使用 `>= start` 与 `<= end`。这证明 active-turn recovery，不证明部分写入产品文件的恢复。
- **Launcher/Init：PASS**。`node --test tests/unified-entry.test.cjs`：14/14，覆盖 Pi packaged Skills、`--continue`、native named resume、`--config-dir` 拒绝、argv 保留及失败前不启动。

## 风险分级

- **P0/P1：无具体发现。** Delta 保留现有 mode/grant 校验与 scope；Pi 仅加载 portable Skills，不加载 Claude hooks，也没有新增委派资格。
- **P2/P3 / UNTESTED：** 直接文件 URL 未测（浏览器 URL policy 阻断）；D4 不能外推到“半写入产品文件恢复”。两项均为已记录边界，未修复、未规避。

详细命令、输出摘要和哈希见：`pi-candidate2-qa-evidence/qa-commands-and-results.txt`。

## 追加更正（candidate2 D4）

后续 Root 对 D4 结果逐一比较原始 `test_mnotes.py` 方法后确认：Agent 在增加范围覆盖时删除了原有方法 `TestAddAndFind.test_list_shows_newest_day_first`。因此 D4 的“原有检查保持不变”验收为 **FAIL**，此前本报告将 D4 判为 PASS 的结论在该项上更正为 FAIL。Root 在独立副本运行原有加新增套件得到 51 项通过，只证明该副本的运行结果，不弥补原始结果删除旧检查的问题。

另更正 F2 归属：浏览器中的 HTTP 操作由 Root 执行，本报告仅审查 F2 的实际产品文件和既有操作记录；不应表述为本 QA 独立执行浏览器操作。
