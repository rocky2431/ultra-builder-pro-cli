# Stage E 实施中的独立边界

Owner 最新指令：“继续完成啊 还缺什么吗？”沿用全部八步、Codex 独占实现与测试、Pi 仅 QA 或隔离产品试验的授权。没有新的发布、真实 HOME 安装或生产授权；未知策略候选也没有自动采用或拒绝。

第六步尚未通过收益验收，但它已验证的 RunSlice/W3 合同可以支持第七步的独立开发。此前将第六步全部性能验收理解为不得编写第七步代码，阻止了可独立推进的工作；现纠正这项执行安排，不降低任何退出条件。主仓库仍只有 D active Change；本文件记录 E 的独立实施边界，正式 E Change/Task/Review/Test/Deliver 在完整集成时分别记录，不将 E 实验纳入 D 已通过条件。

## 当前实现

- `durable-run.cjs`：明确注册一个 run/slice 检查点；单次 fresh Primary 预算、精确 owner/intent/task/packet/permission 引用、expiry/revoke、Git base 和当前机器身份核验。
- 非一次性的 activation/event claim 保存在 `.ultra/evidence/durable/`；`.runtime` 丢失不等于从未运行。它们仅记录发生过的事实，不授予权限。
- 独立生命周期进程启动有限 Supervisor，等待 Supervisor 与旧 Primary 停止，然后对已结束且结果仍匹配的 Worker 生成一次新 Pi 输入。发送前持久记录 unknown；没有成功证明不自动重投。旧 W2/W3 delivery 一旦存在便拒绝挪作 fresh 重投。
- `pi-durable-primary.cjs`：保留八个原生工具，每次工具效果前检查同一 grant、claim、源码和写入边界，每次 provider 请求前检查授权。仅允许明确本地写入目录；现有 Bash 等越界请求仍被拒绝。该版本不扩大 Worker 的权限。
- 只支持一个明确的长期检查点：旧工作完成后，新 Primary 读取结果并处理授权内的本地输出。没有无限续跑、默认后台服务、新通知账户、自动归档或自动发布；后续检查点需要其本身的明确预算与授权。

## 验收仍需完成

实际 native 注册→旧会话和 Supervisor 退出→fresh session→真实消费；跨进程重复 claim；注册前后 expiry/revoke/input drift；发送前后死亡及 unknown；旧 writer 未知；Host/机器身份改变；结果替换与 runtime 丢失；范围内有效工作与越界拒绝；当前安装/Skill/完整检查及独立审查。真实机器重启未经观察时不得声称验证过物理重启。

首批测试先以缺失模块失败，再通过普通授权、expiry、revoke、输入漂移、可写权威文件及丢失恢复历史的拒绝反例。原 W1/W2/W3 六项检查继续通过。原生首次实验保留完整原始记录，未结束前不修改它已绑定的产品源。

## 当前可复核结果（2026-09-10）

最新源码普通 native W4：zBL41n 完成旧 Primary 结束、Supervisor 结束、新 Pi Sol 会话、读取两个原 Worker 结果、写真实 output/decision.json、精确 consumed。重复 wake 不增发 Worker，原 receipt 不变；完整源码绑定和原始索引在 stage-e-current-native-index.json。较长双 QA 的 R60vX2 成功消费发生于最后三项 P1 修复之前，不替代当前修复验证。保护路径修复有新 Pi 原生资格 x1g7Nn 的七项拒绝及独立 APPROVE，公开 gate wYI41n 正常准入。

当前隔离 Codex 安装 134 资产 healthy、两个 validator 与 pack 通过；HOME doctor exit 2 为原有安装状态。机械及原生成功均不把第七步标为完整验收。三轮源码 QA 已用尽初始加两次 delta，尚未有最终 canonical aggregate/Test/Deliver。物理重启与完整断网未经观察；不得通过另开评审名称绕过预算。第六步重复收益与第八步 Owner reject/promote 分别保持原退出条件。

Owner 后续允许一次最终评审，现已结束，原结论 INCOMPLETE，未报告新 P0/P1。原生报告写出但 Bash 哈希请求被拒绝，typed result 保持 failed/permission_denied；一项旧哈希和当前 W4 的表述另有逐项核对。见 stage-e-final-review-disposition.zh-CN.md。新增预算已用完，无自动修复或重评。
