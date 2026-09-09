# Stage D 运行边界预检

这是只读预检，不是 Stage D 启动或验收。C 的当前正式闭环和公平比较尚未接受；R2 §13 D5 要求其通过后，才在新的 Change 中实现 D。

已核对的复用点：

- `run-slice.cjs` 已有显式 begin/status/cancel/resume、整体准入、同一 run/slice create-once 以及原委派的 writer 观察；多轮仍应由 Primary 选择下一片段，不能在脚本里选择修复。
- `pi-primary.cjs` 已有同一原生 session 内的 input 去重、实际 message_start 送达、显式 ack 与粘性 consumed。W3 需要增加外部 live 通道，不能把已有 W2 改名。
- 本机 Pi 0.85.1 `dist/core/extensions/types.d.ts` 明确 `session_shutdown` 会在 quit/reload/new/resume/fork 前触发，可结束旧 session 的通道；普通 `sendUserMessage` 仍须观察真实输入/消费，不因函数返回就宣称已完成。
- R2 §12.3 要求两种 task shapes、两个 qualified Profiles 的重复成功及适用任务收益；一次旧 CSV 实验更慢或更贵必须保留，不能靠更多 Agent 推导收益。

实现前尚需在新 D Change 内证明：一种由当前会话显式启用的最小 live inbox/socket 接入，绑定真实 session 与已注册 slice；丢失/重复/错误 session/结束后的通知不能开启重复语义轮次或 writer；工作树生命周期复用现有 Git/fence，并保留已成功产物。具体通道、权限与最小反例将在 D 授权范围内落地，此处不预先声称资格。

本预检未启动新 Host、socket、后台服务、W3/W4 或安装效果。Stage E 的 fresh-turn、耐久授权和机器丢失边界仍独立未验证。
