# Pi candidate3 D3 独立 QA

结论：**PASS（限定范围）**

## 会议记录

在 disposable DB 中新增 2026-09-01 与 2026-09-05 两条同关键词记录。新的进程分别执行 `find 决定`、`list -n 20`，结果均按日期从新到旧；另一新进程直接读取 SQLite，仍得到 `[(2, '2026-09-05', ...), (1, '2026-09-01', ...)]`。**PASS**。

## 分账

按产品接口调用 `splitAmount`：

- `splitAmount(1000, 0)` 返回清晰中文 `RangeError`：人数必须是大于 0 的整数。
- `splitAmount(1000, 3)` 得到 `[334, 333, 333]`，合计 1000 分；格式化为 3.34、3.33、3.33。**PASS**。

首次操作因 QA 命令未设置 `MONEY_JS` 环境变量，Node 在加载产品前报 `ERR_INVALID_ARG_TYPE`；未修改任何文件。随后补上该环境变量重跑，结果如上。该操作修正已记录。

## 保留与隔离

- `D3-root-checks.json` 报告会议原有方法保持不变，26/17 Root 检查通过。
- `money-split/test/money.test.js` 与 `D3-before.json` 的冻结 SHA-256 完全一致：
  `e31293a0332d84e523edc94dceae948087c37597c15f24f92cced448e758a428`。
- hash 对比显示会议变更仅在会议产品范围内，分账变更仅在 `src/money.js` 与 `test/split.test.js` 的预期范围内；权威决策、无关 notes、package、冻结 money 测试及另一产品实现未被交叉修改。

详细命令、实际输出、hash 和限制见：
`pi-candidate3-d3-qa-evidence/qa-commands-and-results.txt`。
