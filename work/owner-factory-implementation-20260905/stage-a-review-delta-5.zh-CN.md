# Stage A delta 5 — 源修正通过，实际旅程待验证

实际 CC repair5 `2580757d6b074d8fad4e8c7cbc7540c2` success/end_turn，1521.151s，0 protocol error。Codex 与独立只读 reviewer 已核对新增 Plan→Dev 调用选择、pending 激活与共享覆盖默认；这次源 diff 未发现新增 P0/P1 或实质 P2。既有冲突恢复、最终独立 Review、Owner 来源和已经授权的效果保留。

Codex 接受本轮最小清理竞态修正：`tests/delegate.test.cjs` 取消后等待锁中已验证的 claimed.pid 退出，再断言 fence 为空。该失败 seam 可能尚无完整 receipt，故不能盲用 receipt helper。完整故障两次实际复现，4行沿用现有等待函数，无断言削弱；属于 Owner 完整实施与必要验证修复范围，无需另问授权。不是 runtime 变化。

独立正常 `TMPDIR=/tmp npm run verify:release` exit0：728 Node +104 Hook，0 vulnerabilities，152.513s；Node26.8.1/npm11.19.0/Python3.12.10。6个官方Skill validators、pack142、diff check均通过。原始日志 `stage-a-repair5-independent-*`。没有用反复重跑替修正；CC两次727/728的原失败日志保留，第三次在修正后绿色，Root另一次独立绿色。

修正交接中的历史判断：A-R7新评测隔离早已独立资格通过；旧HOME事件前态仍未知，不能写成恢复已证明。Doctor为只读，六Host degraded不能统称「从未安装」：实际ZCode有5.0.1，Codex/Kimi等具体差异保留原始JSON。此轮未改安装器/真实HOME，无理由再安装或把旧degraded作为本次源修正回归。

candidate4保留prepared-not-launched。新candidate5绑定173源文件、108安装文件；source manifest `6bc2b19d1fc7db0f19166ff0bcae482e7ac25685eebbfa3a7a62173ddb224c09`，install manifest `0498581308d8e3d14a705f00c772919eca94c6ac80bb240dfc25429dc51dca65`。原生discovery证实启用隔离5.0.2/14Skills，真实HOME5.0.1禁用。A/C启动时间与session见结构化观察；原始Owner脚本未改变。

上述仅为源和包检查通过。Stage A尚未验收、未commit；真实新候选A/B/C仍待完成，后续B/C/D/E完整实施不被此报告替代。
