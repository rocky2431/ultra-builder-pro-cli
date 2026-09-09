# 墨摘 — 读书笔记库存

把读书笔记存进本地库存，支持列出全部和按关键词搜索。

## 使用

- 运行测试：`npm test`
- 库存文件：`data/entries.jsonl`（每行一条 JSON 笔记）
- 代码：`src/store.js`，导出 `appendEntry` / `listEntries` / `searchEntries`

## 项目文档

- 存储决定：`docs/decisions/2026-08-20-append-only-jsonl.md`（追加式 JSONL、id 由 store 分配、历史不改写）
- 工程事实记录：`docs/tech-notes.md`（项目级事实，每条带日期与出处）
- 历史笔记：`docs/notes/`
