# Stage A — 两个发布验证竞态失败的定位与修复（Claude Code）

基线：`2e3273bf12f6493b3201fad3d9d1b802ae367a4f`。本轮只处理阻塞 Stage A 验收的两个具体失败，
未激活任何 Stage B/C 运行时工作。**未修改任何产品源码**，改动全部落在测试与测试 fixture。

## 结论先行

两个失败都不是 D1 运行时契约缺陷，而是测试的**观测点**与**调度假设**错误。产品行为经独立探针证实正确。

---

## 失败一：`tests/delegate.test.cjs:3058` — spawn_error 时 `run.lock` 仍存在

### 现象

`.ultra/.runtime/owner-factory-implementation-20260905/stage-a-repair-3-independent-verify-release.log`：
723/724 通过，`a missing host binary publishes a truthful releasable spawn_error` 在
`tests/delegate.test.cjs:3069` 断言 `true !== false`。

### 根因：发布终态与释放边界本就不是同一个时刻

`skills/ultra-delegate/scripts/delegate-worker.cjs`：

- 第 444 行 `if (!fs.existsSync(spec.result)) writeAtomic(spec.result, terminal);` —— 在 `try` 内发布终态；
- 第 446–472 行 `finally` 块中才依次做 `publishedFailureType()`（重新读取并解析 result.json）、
  `fs.unlinkSync(spec.lock)`（451）、`boundaryProof(spec, { waitMs: 1500 })`、`releaseWorktreeFence()`。

也就是说：**在 `result.json` 首次可读的那一刻，锁与 fence 按构造必然仍被持有。**
测试原来在 `waitFor(result.json)` 返回后立刻断言 `run.lock` 不存在、`heldFenceCount === 0`，
是用「窗口内的观测」去断言「窗口结束后的状态」。它此前能通过，只是因为 `waitFor` 每 20 ms 轮询一次，
通常晚 20 ms 才看到文件；并行 `node --test`（16 文件 / 16 核）负载下这点余量不够。

### 证据（一次性探针，未提交，位于 `/tmp/ubp-repro-spawn-error.cjs`）

以最高频率轮询真实委派运行：

| 观测点 | `run.lock` 存在 | 持有的 fence 数 |
| --- | --- | --- |
| `result.json` 首次可读 | 8/8 为 true | 8/8 为 1 |
| worker 进程退出后 | 0/8 为 true | 0/8 非零 |

结论明确：**worker 进程退出才是确定性的 finalization 信号**，`result.json` 只是终态证明。

### 为什么不改 `delegate-worker.cjs`

该顺序是有意设计，且没有消费者被误导：

- 同一 delegation id 重启：`delegate.cjs:876` 的 `if (fs.existsSync(result))` 先于锁检查生效，遗留锁不会造成假阻塞；
- `skills/ultra-delegate/scripts/delegate_wait.py` 以 1 s 间隔轮询并要求大小稳定，只校验 result 内容，
  不从中推断释放；
- fence 必须在 `boundaryProof` 之后释放，这正是「未证明停止就不释放」契约本身，不能提前。

因此这是测试缺陷，实质断言（锁已移除、fence 已释放）一条未删、未弱化。

### 修复

`tests/delegate.test.cjs`：新增 helper（第 184–194 行附近）

```js
function waitForWorkerFinalized(delegation, timeout = 15000) { ... }
```

读取 `receipt.json` 的 `worker_pid` 并等待其真实退出，然后在三处同类站点前插入调用：

- `tests/delegate.test.cjs:3080`（本次失败点，spawn_error）
- `tests/delegate.test.cjs:1178`（成功路径断言 `run.lock` 不存在）—— 同类潜伏缺陷
- `tests/delegate.test.cjs:2646`（`spec drift never blocks signalling a live worker` 断言 fence 已释放）—— 同类潜伏缺陷

后两处是顺着共享根因排查出来的同形态站点，未来会以同样方式随机失败，一并按同一模式修正。
其余出现 `run.lock` / `heldFenceCount` 的站点已逐一核对：属于「启动前拒绝」（无 worker）或
`spawnSync` 同步执行 worker（已退出），不存在该窗口。

---

## 失败二：`tests/acp-driver.test.cjs:197` — 等待 `child.pid` 超时

### 现象

`...-verify-release-retry.log`：第一个用例已通过，
`ACP timeout reaches terminal transport state and kills the process group`
报 `timed out waiting for /tmp/ubp-acp-driver-JafbsI/child.pid`。

### 根因：后代进程的创建被放进了它要触发的那个 deadline 的关键路径里

`skills/ultra-delegate/scripts/acp-driver.cjs:614` 在 `spawn()` 之后立即
`setTimeout(() => requestTermination('timeout'), spec.timeout_ms)`。而 `hang` fixture 原本只在
处理 `session/prompt` 时才 `startGrandchild()`。因此 180 ms 的预算必须容纳：
fake agent 的 Node 进程启动 + `initialize` / `session/new` / `session/prompt` 三次 JSON-RPC 往返。
预算一旦被超过，驱动在任何后代存在之前就终止，`child.pid` 永远不会写出。

### 证据（探针 `/tmp/ubp-repro-acp-hang.cjs`）

- `child.pid` 出现时刻：空载 28–55 ms；14 路 node 进程风暴下 31–98 ms —— 对 180 ms 预算只有约 2 倍余量。
- 将 `timeout_ms` 设为 25 ms：3/3 次 `termination === 'timeout'` **仍然正确**，但后代从未被创建。

这正是把生命周期行为与调度假设区分开的判据：**超时终态本身没有问题，出问题的是「此时一定已有后代」这个假设。**

### 修复

1. `tests/fixtures/fake-acp-agent.cjs`：`hang` 场景改为在**进程启动时**创建后代
   （文件末尾 `if (scenario === 'hang') startGrandchild();`），把三次协议往返移出关键路径；
   `cancel` 场景保持在 `session/prompt` 内创建，以保留「取消一个中途派生了写者的 turn」这一覆盖。
2. `tests/acp-driver.test.cjs:201`：`hang` 的 deadline 由 180 ms 提高到 1000 ms。
   剩余需要落入预算的只有单次进程启动（实测上限 72 ms），余量约 13 倍，并留出测试端 20 ms 粒度轮询
   与存活断言的时间。
3. 断言一条未删：`processAlive(childPid) === true` → `outcome.termination === 'timeout'` →
   `waitForExit(childPid)` → `processAlive(childPid) === false` 全部保留；
   `waitForFile` 作为**非空覆盖闸门**：若后代从未创建，测试是响亮失败而不是静默通过。

---

## 验证

| 命令 | 结果 |
| --- | --- |
| `TMPDIR=/tmp node --test tests/acp-driver.test.cjs` | 36/36 pass |
| `TMPDIR=/tmp node --test tests/delegate.test.cjs` | 58/58 pass |
| ACP 超时用例 × 6 轮（14 路 node 进程风暴负载下） | 6/6 轮全通过 |
| spawn_error 用例 × 8 轮（同负载） | 8/8 轮全通过 |
| `TMPDIR=/tmp npm run verify:release` | **exit 0**；node 724/724 pass、fail 0；pytest 104 passed；`found 0 vulnerabilities` |

完整日志：`.ultra/.runtime/owner-factory-implementation-20260905/stage-a-cc-verification-races-verify-release.log`
回执：`.ultra/.runtime/owner-factory-implementation-20260905/stage-a-cc-verification-races-receipt.json`

## 改动清单

- `tests/delegate.test.cjs`（+14 −0）
- `tests/acp-driver.test.cjs`（+9 −1）
- `tests/fixtures/fake-acp-agent.cjs`（+11 −1）

未触碰 `skills/ultra-delegate/scripts/delegate-worker.cjs` 及任何其他产品源码；
未触碰 Skill/hook 产品文件与 eval 隔离文件。工作区中 `tests/route-contract.test.cjs`、
`skills/**`、`hooks/**` 的既有改动为本次会话开始前已存在，未被修改。

## 残留限制（未做 / 无法证明的部分）

1. **ACP 超时用例仍含不可消除的时钟假设。** deadline 由驱动在 `spawn()` 处武装，测试无法在
   观测到后代之后再重设它；因此「一次进程启动落入 1000 ms」这一假设无法结构性消除。
   已把它压缩到最小（单次启动，实测 31–72 ms）并保证失败时响亮而非静默。
2. **单次 `verify:release` 绿色不构成「无其他竞态」的证明。** 该类失败是概率性的；本次仅一次通过运行。
3. **同类观测点缺陷只审计了 delegate 与 ACP driver 两个套件。** 其余测试文件未做同形态排查。
4. **未复现原始 flake 本身。** 采用的是更强的机制性证明（探针直接测出窗口与调度失效），
   而非靠反复跑到失败；这一点在上文证据表中如实标注。
5. 本次运行的 `verify:release` 用时约 211 s，高于记录中的 ~115 s，属本机负载差异，未进一步归因。
