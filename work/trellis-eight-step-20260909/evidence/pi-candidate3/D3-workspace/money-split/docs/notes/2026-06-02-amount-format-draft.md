# 草稿：金额格式（已废弃）

状态：superseded by `docs/decisions/2026-08-24-integer-minor-units.md`（2026-08-24）。
仅作历史记录保留，不得作为实现依据。

早期设想是把金额存成两位小数字符串（例如 `"12.34"`），计算时先 `parseFloat` 再四舍五入到分。
按人数平摊时用 `parseFloat(total) / n`，尾差忽略不计。
