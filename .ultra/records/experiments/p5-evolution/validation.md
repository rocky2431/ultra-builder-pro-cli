# 开跑前的检查验证（2026-11-01）

在 R 的临时克隆 `/tmp/p5/evo-ref`（`7177b6b`）上：

基线（只加检查，不改代码）——可见检查必须是红的：

| 文件 | 结果 |
|---|---|
| `edit.test.cjs` | pass 0 / fail 2 |
| `search.test.cjs` | pass 0 / fail 2 |
| `stats.test.cjs` | pass 0 / fail 2 |

参考实现（`store.retarget`、`PATCH`、`q` 过滤、搜索表单、`/api/stats`、三个总数）——全部必须通过：

| 文件 | 结果 |
|---|---|
| `edit.test.cjs` | pass 2 / fail 0 |
| `edit-hidden.test.cjs` | pass 6 / fail 0 |
| `search.test.cjs` | pass 2 / fail 0 |
| `search-hidden.test.cjs` | pass 6 / fail 0 |
| `stats.test.cjs` | pass 2 / fail 0 |
| `stats-hidden.test.cjs` | pass 4 / fail 0 |
| R 原有测试（9 个文件） | tests 27 / pass 27 / fail 0 |

参考实现的 diff 存为 `reference.diff`，只用于验证检查本身，不给任何写者看。
