# Rulings

Decisions a model made without asking the Owner, one line each. The Owner reads this log
at milestone gates instead of being asked along the way.

- 2026-10-31 L2 裁决：.ultra/ 下除引擎自有文件以外的已提交文档继续算代码（关闭核对 N4 保持保守） — 因为 v5 的测试会读取 .ultra/ 下的文档，它们是检查的输入，划为引擎自有会让改动之后的旧证据仍然算绿 — 如果判断错了，代价是 改一份文档也要多跑一次全量回归
- 2026-10-31 L2 裁决：合并门推迟到 P4 — 因为 P2、P3 只有一个写者在同一工作树上，node done 已经要求在干净、已提交的树上全绿；合并门只有在并行写者出现时才有作用对象 — 如果判断错了，代价是 P4 要补一个合并门，P2 和 P3 的结果不受影响
- 2026-10-31 L2 裁决：P2 的进度视图只用 ubp status，不安装状态栏或 SessionStart hook — 因为 执行合同禁止修改 ~/.claude 配置和在真实 HOME 安装，而 ubp status 随时可查 — 如果判断错了，代价是 Owner 要自己敲命令看进度，直到 P5 交付时再接入宿主视图
- 2026-11-01 L2 裁决：样本 R 的写者从 Codex 改为 Claude implementer 子代理；Codex 写的 N-api 由控制者在沙箱外跑检查后记完成 — 因为 Codex 沙箱禁止监听本地端口（listen EPERM），写者跑不了自己的检查就走不完节点循环，合同规定 Codex 不可用时改用 implementer — 如果判断错了，代价是 多用 Claude 额度；P4 的 A/B/C 实验要把写者所在的沙箱当成一个变量
- 2026-11-01 L2 裁决：引擎修复期间，样本 R 用评审过的 P2 引擎冻结副本（fb8ec70 加 p2.diff，放在 R 的 .ultra/.runtime/ubp-engine/）推进；里程碑关闭改用修复后的引擎 — 因为 两边并行可以省等待时间，而写者跑到一半时引擎文件被改会得到错误的结果 — 如果判断错了，代价是 R 的节点证据出自修复前的引擎；账本格式没变，修复后的引擎照样能读
