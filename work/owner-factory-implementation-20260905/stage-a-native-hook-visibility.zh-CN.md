# Stage A 真实 ZCode Hook 可见性

2026-09-05，candidate A 原生 session `sess_0e91fc64-8cd5-4d3d-ac9b-fb01ce90c160`。源码冻结于 repair 1 的候选安装件。对该唯一 session 的原生 SQLite 使用 mode=ro 读取非 reasoning tool parts；不读取其他项目或凭据。

实际 native tool 结果记录到三次 acceptance reminder：

| Task | Native tool call | 实际模型可见载体 | 全字段值 SHA-256 |
|---|---|---|---|
| CH-0001-T1 | Write `call_b14e423869c74ef2a214b90e` | `state.output` 中 `[Hook additional context]` | `a7c0b859163c51ecf579ccd767df48c64e7a6dc4343be50e5bf969b8e61a1eaf` |
| CH-0001-T2 | Edit `call_a462b2142b974e9995c56f06` | 原始 Edit 失败结果的 `state.metadata.modelContent` 中 `[Hook additional context]` | `d049656eb8cc7de3113ec049028ca6caee6477ff27c9e2045ffd9adf107fa31a` |
| CH-0001-T3 | Edit `call_31a19939c1424c7da31519e1` | `state.output` 中 `[Hook additional context]` | `39e9d455da678d994454cd2c52a2a460fd0deecd782dbde4e458de17fbe9ffae` |

三次均包含相应 Task 的实际验收表；不是只凭 derived cache 推断。原始 Hook output→实际 adapter→native consumer→tool result 的可见性链已在所选 ZCode 版本的真实任务中获得证据。T2 的工具错误没有吞掉提醒。摘要及短摘录在测试根 `candidate-A-native-hook-observations.json`，完整输出仍留于 Host 原生会话库。

这证明该 native 模型上下文载体确实收到了提醒，不证明模型理解或遵守了每一条验收，也不宣称其他 Host 已资格化。A→B→A→A、验收改变/恢复、普通聊天和坏 identity 另有独立实际 Hook 子进程回归；同一缓存记录本身仍不具语义权威。
