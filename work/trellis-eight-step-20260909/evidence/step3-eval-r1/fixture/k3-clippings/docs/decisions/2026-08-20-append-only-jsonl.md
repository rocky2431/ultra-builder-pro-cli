# 决定：库存一律追加式 JSONL

状态：accepted（2026-08-20）。

- 库存文件 `data/entries.jsonl` 每行一条 JSON 笔记，只追加，不改写或删除已有行。
- 笔记 id 由 `src/store.js` 在写入时分配（`entry-0001` 递增），写入方不得自带 id。
- 任何更正都以新行表达；历史行保持原样。
