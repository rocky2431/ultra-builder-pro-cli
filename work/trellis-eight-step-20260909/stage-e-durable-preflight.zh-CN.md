# Stage E 耐久恢复预检与待实现边界

2026-09-09。只读设计准备，未创建 E Change、未实现 conductor、未接受 D 或宣称 E 通过。依据已接受八步计划第七步、R2 第 8.3、10、12.4、D6 节，以及当前 `run-slice.cjs`、`pi-primary.cjs`、`slice-channel.cjs`。

## 已观察的 Host 能力

`stage-e-w4-host-api-observation.json` 记录旧 Primary 与 W3 controller 实际退出后，以现有 Pi 0.85.1 RPC 启动全新 Sol session。新会话读取原始两个结果 6 与 4，实际执行一轮语义处理并写出 10；没有新 Worker，原 Worker receipt 与旧 delivered-but-unconsumed receipt 字节不变。原始归档及 SHA 见该观察文件。

这是另行明确授权的 Host API 预检。它没有证明旧 delivery_unknown 可以自动重投，更没有证明 durable Grant、重启后撤销、机器重启或产品级 exactly-once。新进程和 session identity 可获得；产品尚无合格 W4 路径。

## 最小复用边界

- 沿用 RunSlice packet、Attention、delegate result、writer fence 与 canonical refs；fresh Primary 自己决定读哪些结果、是否需要下一 slice 以及何时停止。
- 现有 `prepare` 校验 session、输入 digest、有限预算和已资格 Profile；`resume` 只观察已有 attempts。E 不得把旧 packet 的 session 改成新 session 后当作新任务重跑。
- 现有 W2/W3 在 native send 前写 `delivery_unknown`，用实际 input/message/ack 更新状态。E 必须尊重这条不确定性边界；缺少 ACK 不等于未产生过语义动作。
- 只增加 run-scoped lifecycle/wake 观察；已有 Git、文件和原生 Host API 能解决的部分不新增数据库、语义队列或通用调度器。

## 必须用反例验证的边界

| 威胁或故障 | 所需行为和可观察出口 |
|---|---|
| 普通当前会话授权被当作耐久授权 | 缺少明确 durable mode 的 exact owner grant 时，fresh launch 被拒绝；普通当前工作保持可用 |
| Grant 到期、撤销、Change/intent/task 输入变化 | 注册、重启、派发及实际 effect 消费前重新核对同一权威引用；不自动续期或扩大范围 |
| 两个 conductor 同时恢复一个 event | 原子持久 claim/fence；最多一个进程进入 native prompt；失败进程不通过删除 claim 重试 |
| 写出 delivery_unknown 后崩溃，或 prompt 已接受但网络回应丢失 | 保留 unknown，核对原 session/事件证据；没有明确未交付证明时禁止新语义轮次 |
| 原 event 已 consumed 或新 turn 已应用但 ACK 未落盘 | consumed 不重放；ACK 缺失保留 unknown，不把未确认当作安全重试 |
| 旧 Primary、Supervisor 或 Worker 仍活跃或无法证明已停 | 不启动竞争 Primary/writer；从既有 receipt、host/process identity 与 fence 解释所缺证明 |
| 机器重启、PID 重用、网络隔离或 Host 不可用 | PID 本身不证明身份或死亡；boot/host identity 和 lease 不充分时 truthful unknown，不擅自清锁 |
| 原始 attention/result/ref 被替换或路径为 symlink | 使用同一 local/ref/digest 边界拒绝；不修改原始结果来迁就恢复 |
| Runtime 目录丢失或不完整 | 可从 canonical refs 和可信原始事实重建观察；无法重建 delivery history 时不能据“无文件”推断未执行 |
| 超过预算或恢复后永不结束 | 有限 turn/deadline/attempt 预算与清晰停止事实；续预算必须新 owner authority |
| Worker 伪造唤醒消息、内文暗示新权限 | 只接收绑定 run/slice/event 的机械 attention；不把内容、记忆或 evaluator 结论当授权 |
| 无变化的重复唤醒与通知 | 没有 idle model polling；重复事件不产生新 turn；完成、失败、需要 Owner 决定才产生有意义通知 |

## 产品验证顺序

先验证明确未投递的 event：授权在旧会话活跃时登记，旧 Primary 与 Supervisor 都已结束，Worker 结果结束且停止可证明，然后由独立的授权 lifecycle 触发一次 fresh native turn。再验证重复、到期、撤销、输入漂移、发送前后死亡、unknown writer、Host 不可用和机器身份变化。模拟故障只能支持对应机制；实际 machine restart 没有观测时必须标为未验证。最终还需真实长任务的受控续跑、canonical Review/Test/Deliver 与文档，不以 Host API 预检代替。

Stage D 的固定比较完成后再依据实际验收结果推进 E。当前没有新的默认策略、权限扩大或安装效果。
