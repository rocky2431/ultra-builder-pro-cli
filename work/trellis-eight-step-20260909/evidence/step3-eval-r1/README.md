# Step 3 评测材料 r1 留档

2026-09-09。Root 在任何模型试用之前预审 r1 草案，发现三处评测缺陷；r1 未运行过任何被评测会话。
本目录保留 r1 字节：评测附录、结构检查、fixture 全树（含位于项目种子内的 `session2-only/`）。
逐文件 SHA-256 见 `MANIFEST.sha256`。

r1 当时的结构检查为全绿（两个 Node 版本各 7/7），但绿不代表可用——三处缺陷使 r1 不适于模型试用：

1. 核对 oracle 漏算起点库存（`data/entries.jsonl` 的 2 条种子），导致验收总数错误。
2. 二期输入 `session2-only/` 位于项目种子内部，整目录复制后即进入会话可达范围，「无文件引用它」不等于扣留。
3. 模型可见的 README（及 package.json 描述、fixture 测试头注释）宣告评测身份、点名验收附录并提示什么算消费，构成对目标的 Coaching。

修正见 r2：`../../../step3-evaluation.zh-CN.md` 与 `../../../../../tests/trellis-knowledge-eval.test.cjs`、
`../../../../../tests/evals/fixtures/trellis-knowledge-20260909/`。
