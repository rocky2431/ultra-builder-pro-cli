# Stage B：Task 1 环境与存活状态初次源码 Review

2026-09-06。只读审查当前未提交 diff；唯一写入为本报告。基线 HEAD：`b765b55cca0e1eaacebc738a68de77906bb50756`。实际 ZCode 尚在继续 ACPX 迁移，本文不是 Stage B 最终验收。

**结论：保留一个 P1，即原 `review-tests-001` / `D1R-01` 的真实 worker 环境回归保护仍未闭合。`review-errors-001` 的 EPERM 根因在当前源码和新增测试路径中已得到修正；本轮没有重跑测试。**

## P1 — 环境观测仍位于 launcher 输入侧，macOS 会漏掉实际 spawn 回退

- 主位置：`tests/delegate.test.cjs:1641-1653`，`tests/delegate.test.cjs:1687-1695`。
- 实际消费：`skills/ultra-delegate/scripts/delegate.cjs:843-851`。
- 对应验收：`.ultra/contexts/task-vnext-d1-runtime-safety-boundary.md:122`，以及 aggregate `review-tests.json:29-40` 中已经命名的触发场景。

新增测试确实完成一次真实 detached worker 运行，但 `capturedLaunch` 记录的是传入 `launchDelegateWorker` 的 `env` 参数。`Object.keys(env)` 和 canary 检查均发生在调用该函数之前；函数内部才构造最终 `child_process.spawn` options。它不是最终 OS-launch 参数的观测点。

当前生产实现第 850 行直接使用这个净化后的 `env`，没有观察到实际环境泄漏。缺口是测试能否阻止原问题再次出现。源级反例很具体：若第 850 行回退为 `env: { ...process.env, ...env }`，Primary/unrelated canary 会进入真实 worker，但传入函数的原始 `env` 对象没有改变，因此第 1661-1675 行的全部观测仍然干净。worker spec 在 `delegate.cjs:1083-1089` 单独保存最终 Host 的允许键名；`agent-execution-driver.cjs:119-126` 再按这些键名过滤，当前 `acp-driver.cjs:432-436` 使用这份重新过滤的环境。所以最终 Host 的捕获及产物字节扫描不能反向证明 worker 没收到被过滤掉的秘密。

唯一实际读取父进程环境的路径是 `tests/fixtures/fake-acp-agent.cjs:22-28` 的 `/proc/${process.ppid}/environ`。读取失败被忽略，测试只在输出文件存在时才检查。本机只读核对结果为 `{"platform":"darwin","procEnvironAvailable":false}`，因此该观测在 macOS 被跳过。以上是源码消费链反例，未修改源码或执行 mutation test。

这仍是原 P1 的未完成回归保护，不是为普通委派新增门槛，也不是要求证明 Node/OS 的标准环境传递机制。

**最小修复与结案证据：**将可观测缝隙移到实际 `child_process.spawn` 调用的最终 options，记录其环境键名并继续调用真实 spawn；或者由真实 delegate-worker 进程直接报告键名。前一种已经是足够的 OS-launch seam，不必增加产品环境采集开关、强制 `/proc` 或另造隔离设施。关键是证明上述重新合并 `process.env` 的回退会使该窄用例失败，而正确实现通过，并保持真实 worker 完成、选定 Host auth 存在、worker-local packet keys 不下传及 canary 值不落盘。

## ACPX 迁移对当前父进程假设的影响

`fake-acp-agent.cjs:19-21` 当前明确假设 ACP Host 由 delegate-worker 直接启动，`process.ppid` 因而代表 worker。当前直接 spawn 源码支持这个假设；不能沿用它替新增进程后的链路背书。若最终链路变为 worker → ACPX runner → ACP Host，读到的是中间 runner：其环境应没有三个 worker-local packet keys，现有第 1689-1690 行反而可能拒绝正确实现。

迁移后的观测应绑定已经返回的 `receipt.worker_pid` 或最终 worker spawn 本身，不能靠固定父子层数猜身份。本文不把尚未完成的 ACPX 代码另报为缺陷；只要求同一个 P1 修复不要依赖将被迁移改变的关系。

## EPERM / 未知存活状态：当前源码反馈

- `agent-execution-driver.cjs:394-410` 将 `ESRCH`、`EPERM`、其他错误分别映射为 `dead`、`alive`、`unknown`，布尔兼容 consumer 只有 `dead` 返回 false。
- `delegate.cjs:535-554` 的 outer-worker view 直接消费三态结果；未知信号不会成为 `stopped`。`status:1202` 及 `cancel:1287` 均使用该路径；终态恢复的 fence release（第 1305-1306 行）和合成终态分支（第 1345 行）仍要求 outer boundary 已证明停止。
- `tests/delegate.test.cjs:2942-3001` 检查 EPERM/其他未知错误不会合成终态、删除 lock 或释放 fence，并保留 ESRCH 正向控制。
- `acp-conformance.cjs:77-83` 的 exit waiter 已复用同一保守 helper；实际 consumer 在第 193 行。顺带读取的 `tests/acp-conformance.test.cjs:190-201` 已覆盖 ESRCH 为 true、EPERM 与其他未知错误为 false。

在本次限定范围内，没有找到该 EPERM 修复的剩余 P0/P1。这里的结论是源码和断言路径已覆盖根因；作者报告的通过数量尚未由本 reviewer 重跑，也不代表最终 ACPX descendant 生命周期已经通过资格。

## 核对方式与版本边界

执行了指定五文件 `git diff`、带行号源码/测试读取、原 aggregate finding 读取、Host 环境生成与 liveness consumer 检索，以及只输出平台和 `/proc` 可用性的 Node 查询。未运行完整或窄测试套件，未调用 provider，未读取或输出凭据值，未改产品源码、测试、配置或其他文档。

记录本轮读取后的五文件 SHA-256，供最终 writer 退出后识别需重新核对的变化：

| 文件 | SHA-256 |
|---|---|
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `92ef8443fae127975935df9b734d0081d253879e21ee0881717e8c4d2b71fc9f` |
| `skills/ultra-delegate/scripts/delegate.cjs` | `d29b2d0aad5815ec3da71b844bab2875f882dfb0f031078d91318590e0615639` |
| `skills/ultra-delegate/scripts/acp-conformance.cjs` | `ea189ce5e985831b3b9c8faae60b82bbbc4495c0b96dfd539535c4bb238009df` |
| `tests/delegate.test.cjs` | `190a77f23ebc7a1047f583e50a3f0a6003e394431d3ab103af973a8caeba399a` |
| `tests/fixtures/fake-acp-agent.cjs` | `4275f32239e10c855ab5cd06de3e0a5def0d558330ef6d8bdb988ce6cb146590` |
