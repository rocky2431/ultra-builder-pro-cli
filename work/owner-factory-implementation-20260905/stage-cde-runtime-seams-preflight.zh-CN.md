# 工厂三个阶段的现有消费者与实际退出条件

2026-09-05，Stage A 修复等待期间的只读准备。此文件不表示 C/D/E 已开始或通过；来源为当前 R2 与实际源码，仍以阶段开始时 live tree 为准。

C 的最小入口是在 `ultra-delegate/scripts/` 复用 `delegate.cjs` 的 run/status/cancel 和 fence，增加被 Skill/CLI 真正调用的有限 slice admission、进程内 barrier 与一次原子 Attention。现有 delegate_wait.py 只等一个 result，不能充当 slice身份、barrier或去重。先整份验证，再启动不可变 attempts；不要写通用 DAG/表达式引擎。D 继续同一 runner 增加 Primary 签发的下一片段、版本化 Profile、有限并发与原生 Git worktree 生命周期。E 只在这些既有合同外包 run-scoped durable lifecycle/wake；不另建语义状态中心。

三个不可遗漏的消费者：

1. Execution Grant 当前是文档/模型合同，尚无通用运行时 grant_ref/grant_sha256 consumer。C 需要在 slice admission 机械核对精确输入和适用授权；E 每次重启/唤醒复用。它不能解析自由文本自动授予权限，也不能给普通当前 Owner 请求新增批准门。
2. host-profile.cjs 的旧 delegation admission 在无 enforcement record 时仍 admitted，不等于工厂资格。Factory 仅接收对当前 Packet 有正向 exact Host/transport资格的选择，不因此全局禁用旧委派。
3. 复用现有 Review packet/history、Task Evidence v2、worktree digest 和 Deliver。strict Review的worktree_digest当前为null，不能声称已对dirtytree形成不存在的密码学绑定；最终集成提交与实际独立审查分别留证。新增runner同步plugin-core的明确打包清单和bin/install CLI入口。

实际资格不能以 fixture/帮助/退出码代替：C 必须 W1零idleturn、W2真实新turn投递/消费/重复/sessiondeath、两个Worker真实重叠、fresh Challenger/Reviewer、实际产品失败→修复→当前集成E2E→delivery_ready。D 必须两个taskshapes和两个Profiles重复比较，包含正确Solo、多wave受限修复和W3丢失/重复/sessiondeath。E 必须Primary与Supervisor都结束后的fresh W4，expiry/revoke/invalidation/dedupe/fencing以及unknown writer和机器/网络丢失的诚实恢复。

C/D/E均保留旧步骤的已通过路径。等待由机械控制器完成，语义拆分、路由、集成及下一步仍归Primary。不得用hash、receipt、schema、模拟通知或既有对话恢复掩盖实际未运行的Host路径。

未来必须具体交给Owner的是持久候选的promote/reject决定：先完成候选、baseline、held-out和rollback-ready证据，最终对具体版本作决定；全部拒绝也是合法结果。现在的完整实施授权足够准备与验证，不把未知未来候选自动晋升。发布/安装仍是分开的效果。
