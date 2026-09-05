# R2 Primary 唤醒路径：只读前置勘察

> 2026-09-05。只读设计/取证任务。本文只做本地 CLI/协议 schema 勘察与官方一手文档核对，**没有**实现 Stage B/C/D/E，没有启动任何 provider、模型回合、Agent、session、daemon 或回调，没有改动代码、安装、登录或发布。除本文件外未写入任何路径。
>
> 本文**不宣称** W2/W3/W4 已资格验证。资格只能由后续单独派发的 live lifecycle 实施/验证步骤给出。

## 0. 结论先说

**推荐路线：以 Codex CLI `0.150.1` 的 app-server JSON-RPC 协议作为唯一 wake adapter，且 app-server 由 run-scoped supervisor 自己拉起、监听 run 私有 unix socket；Primary thread 建在这个 app-server 里，Owner 用 `codex --remote unix://<path>` 附着 TUI 观察/接管。**

理由是它唯一同时提供了 R2 §6.5 需要的三件事，且都是本机可读的公开协议：

| R2 要求 | Codex app-server 对应 | 证据强度 |
|---|---|---|
| delivery ack | `thread/queue/add` → `QueuedSubmission{id, clientUserMessageId}` | 本地 schema 事实 |
| dedupe key（client 侧拥有） | `clientUserMessageId`（required，client 提供） | 本地 schema + 官方文档事实 |
| consume ack（语义已应用一次） | `thread/queue/start` → `Turn{id}`；turn 内 `userMessage` item 回显 `clientId` | schema 事实 + 官方文档事实 |
| 取消 | `turn/interrupt{threadId,turnId}`、`thread/queue/delete` | 本地 schema 事实 |
| 并发防重 | `turn/steer.expectedTurnId`（"Required active turn id precondition"）；`thread/queue/start` 在 active thread 上返回 invalid-request | 本地 schema + 官方文档事实 |
| session identity / 存活 | `thread/loaded/list`、`thread/status/changed`、`ThreadStatus{notLoaded/idle/active/systemError}` | 本地 schema + 官方文档事实 |

**备选（仅在必须让 Claude Code 当 Primary 时）：Claude Code `2.1.261` 的 per-session inbox socket（`CLAUDE_CODE_MESSAGING_SOCKET` + `CLAUDE_CODE_MESSAGING_TOKEN`）。** 它是官方明文支持"脚本或 hook 向 session 投递"的机械通道，且投递语义（idle → 起新 turn）正是 W2/W3；但它**没有**面向投递方的 delivery/consume 回执，去重是"短窗口内丢弃相同内容"的内容级行为，且我在官方一手文档里**找不到消息行的 JSON 结构**。因此它只能做降级路线，且 at-most-one 必须由 Ultra 侧 consumed 标记 + Primary 自查来兜底（语义兜底，不是机械保证）。

**明确否定的两条路：**
- Codex 的**共享本地 daemon**（`codex app-server daemon start`）：本机装的是 npm 管理版，二进制里明写该命令要求 standalone 安装；而且它是 host-global 常驻件，与 R2 §18"不采用 Codex-only tracker daemon"的取向相反。
- Claude Code **channels**：官方标注 research preview、需 allowlist 插件、需 Bun、`--channels` 不在 `--help` 中、"协议合同可能变更"。不能作为 Step 1 依赖。

---

## 1. 本机已装 Host 实测清单

命令：逐个 `--version`（`/Users/rocky243/Context Engineering/ultra-builder-pro-cli`，2026-09-05）。

| Host | 版本 | 路径 | 是否有面向"机械进程"的 live session 投递 API |
|---|---|---|---|
| Claude Code | `2.1.261` | `/Users/rocky243/.local/bin/claude` | 有（inbox socket，官方文档；无回执） |
| Codex CLI | `codex-cli 0.150.1` | `/Users/rocky243/.local/bin/codex` → `~/.local/lib/node_modules/@openai/codex` | **有（app-server JSON-RPC，含 ack + dedupe key）** |
| Kimi Code | `0.41.0` | `/Users/rocky243/.kimi-code/bin/kimi` | 无（`kimi acp` 是 stdio ACP server，属 Worker 传输；`kimi web` 无公开投递合同） |
| OpenCode | `1.18.21` | `/Users/rocky243/.opencode/bin/opencode` | 部分（`opencode serve` headless server + `opencode attach <url>`，本次未核对其公开 API 合同） |
| Grok Build | `1.0.5 (5115b46bc909)` | `/Users/rocky243/.local/bin/grok` | 未见 |
| ZCode | CLI 不在 PATH；App 内置 `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` 存在 | — | 未见；仓库内其 transport maturity 已标 `experimental`（`skills/ultra-delegate/scripts/host-profile.cjs:33`） |
| acpx | `0.13.2` | `/Users/rocky243/.local/bin/acpx` | 与本议题无关（连接层） |

---

## 2. Codex app-server：本地可核实的事实

### 2.1 协议 schema 是本机生成的，不是猜的

```bash
codex app-server generate-json-schema --experimental --out /tmp/codex-appserver-schema
```

产出 `ClientRequest.json`（153 个方法）、`ServerNotification.json`（79 个）、`ServerRequest.json`（11 个）、`ClientNotification.json`（1 个）、`codex_app_server_protocol.v2.schemas.json`（724 个定义）。以下都是从这批文件里读出的**事实**。

**唤醒相关的最小方法集：**

```text
initialize                     （每条连接必须先发，params.capabilities.experimentalApi = true）
initialized                    （client notification，握手确认）
thread/start | thread/resume   （建立 / 恢复 Primary thread）
thread/loaded/list             （当前"内存中已加载"的 threadId 列表 = live session identity）
thread/queue/add               （投递一条 Attention；required clientUserMessageId）
thread/queue/list              （投递不确定时的 reconcile 读）
thread/queue/start             （thread idle 时起 exactly one turn）
thread/queue/delete            （撤回未消费的 Attention）
turn/start                     （直接起 turn，用于 W4 fresh turn）
turn/steer                     （required expectedTurnId 前置条件）
turn/interrupt                 （取消，需 threadId + turnId）
thread/turns/list | thread/read（消费证据 / 恢复读）
```

**关键 schema 片段（原文）：**

- `ThreadQueueAddParams`：`{"required": ["clientUserMessageId", "input", "threadId"]}`
- `ThreadQueueAddResponse`：`{"queuedSubmission": QueuedSubmission}`；`QueuedSubmission` = `{"required": ["clientUserMessageId","id","input"]}`
- `ThreadQueueStartParams`：`{"queuedSubmissionId": string|null, "threadId": string}`，返回 `{"turn": Turn}`
- `Turn.id`："Identifier for this turn. Codex-generated turn IDs are UUIDv7."
- `TurnStatus`：`["completed","interrupted","failed","inProgress"]`
- `TurnSteerParams.expectedTurnId`："Required active turn id precondition. The request fails when it does not match the currently active turn."
- `ThreadStatus`：`notLoaded | idle | systemError | active{activeFlags: waitingOnApproval|waitingOnUserInput}`
- `ThreadLoadedListResponse.data`："Thread ids for sessions currently loaded in memory."
- `ErrorNotification`：`{"required": ["error","threadId","turnId","willRetry"]}`
- `InitializeCapabilities.experimentalApi`："Opt into receiving experimental API methods and fields."（default false）
- `ThreadResumeParams` 描述原文："If thread_id identifies a running thread, app-server rejoins that thread and treats a non-empty path as a consistency check against the active rollout path."

### 2.2 官方一手文档核对（补本地 schema 说不清的语义）

来源：<https://developers.openai.com/codex/app-server>（308 → <https://learn.chatgpt.com/docs/app-server>）与官方仓库 README <https://raw.githubusercontent.com/openai/codex/main/codex-rs/app-server/README.md>。

- 握手："Clients must send a single `initialize` request per transport connection before invoking any other method on that connection, then acknowledge with an `initialized` notification."
- queue 全族是实验 API："All queue operations require `capabilities.experimentalApi = true`."
- `thread/queue/add`："persist a follow-up while a turn is running. Each thread can queue up to 100 messages"；"A queued submission contains its user input and a required, client-provided `clientUserMessageId`."
- `thread/queue/start`："Start the queue head or a selected queued submission when the thread is idle. **An idle thread starts a new turn and returns it; an active thread returns an invalid-request error**."
- **消费证据**："when supplied, the corresponding `userMessage` item echoes it as `clientId`" —— 这条是 R2 `consumed` 状态的机械依据：`(run_id, slice_id, event_id)` 编码进 `clientUserMessageId`，再在 `thread/turns/list` 里按 `clientId` 反查，就能证明"这一条 Attention 已被恰好一次语义应用"。
- `thread/loaded/list`："returns thread ids currently loaded in memory. This is useful when you want to check which sessions are active"
- 卸载计时器："the server keeps the thread loaded and unloads it only after it has had no subscribers and no thread activity for 60 seconds by default"，可用 `config.toml` 的 `thread_unload_delay_secs` 调整。
- unix socket 默认路径："`codex app-server proxy` opens exactly one raw stream connection to `$CODEX_HOME/app-server-control/app-server-control.sock` by default."
- 过载错误码：JSON-RPC `-32001`，"Server overloaded; retry later."
- WebSocket 传输："Websocket transport is currently experimental and unsupported. Do not rely on it for production workloads." → **不采用 ws，只用 unix socket。**

### 2.3 本机否定的事实：共享 daemon 走不通，也不该走

- `codex app-server daemon version` 实测返回：
  `Error: failed to connect to /Users/rocky243/.codex/app-server-control/app-server-control.sock` / `No such file or directory (os error 2)`。同时确认了**本机默认控制 socket 的确切路径**，且当前没有 daemon 在跑。
- 本机 Codex 是 npm 管理安装（`bin/codex.js` 里 `CODEX_MANAGED_BY_NPM` / `CODEX_MANAGED_PACKAGE_ROOT`，`~/.local/lib/node_modules/@openai/codex/bin/codex.js:182-195`）。而原生二进制里明写：

  > `managed standalone Codex install not found at ` / `This command requires the standalone install managed by the Codex installer, because the daemon starts and updates app-server from that fixed path.` / `Install it with:` `curl -fsSL https://chatgpt.com/codex/install.sh | sh`

  （`~/.local/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`，`strings` 第 446833–446838 行）

  **推断**（未实测，因为不允许启动 daemon）：`codex app-server daemon start/bootstrap` 在本机会因缺少 standalone 安装而拒绝。这条要么被 smoke 推翻，要么就意味着"共享 daemon + Owner 普通 TUI 即 Primary"这条路在本机需要一次新的安装授权。
- 另外，`codex queue --thread <THREAD> --message <TEXT>` 这条 CLI **不足以**作为 wake adapter：
  - 它只暴露 exit code，不把 `QueuedSubmission.id`、`Turn.id` 或 `clientUserMessageId` 交回调用方，等于丢掉 R2 需要的全部 ack/dedupe 面；
  - 二进制里存在字符串 `cannot queue through an embedded app server while a local app-server daemon is running; remove configuration overrides or use --remote` —— **推断**：无 daemon 时 `codex queue` 会起一个 embedded app-server 并从磁盘 rollout 加载 thread，那不是"叫醒活着的 session"，而是**第二个 writer 打开同一条 thread**。这正是任务书说的"CLI resume 命令本身不能证明 live acknowledged wake"。

### 2.4 本地 feature flag 现状（`codex features list`）

`tui_app_server = removed/true`、`steer = removed/true`、`goals = stable/true`、`multi_agent = stable/true`、`remote_control = removed/false`、`send_async_message = removed/false`、`enable_fanout = removed/false`。

**推断**：`removed/true` 表示该开关已下线且行为常开（即 TUI 常驻在 app-server 之上、steer 常开）。`remote_control = removed/false` 与 `codex remote-control` 子命令仍然存在这一点相互矛盾，本次不据此下结论；无论如何 remote control 需要 ChatGPT 认证（二进制字符串："remote control requires ChatGPT authentication; API key auth is not supported"），且是跨机控制面，**不进入本方案**。

---

## 3. 推荐架构：run-scoped app-server，一套协议覆盖 W1–W4

```text
Ultra run supervisor（非模型、run 生命周期、无常驻）
  ├─ spawn: codex app-server --listen unix://<run-private-dir>/app-server.sock
  ├─ connect: initialize{capabilities.experimentalApi=true} → initialized
  ├─ thread/start  → Primary threadId（写入 .ultra/.runtime/runs/<run-id>/delivery-state）
  ├─ Owner 视图: codex --remote unix://<run-private-dir>/app-server.sock   （TUI 附着，不产生语义 turn）
  └─ barrier 到达 → 形成 attention.json → 一次 wake
```

`codex --help` 的 `--remote <ADDR>` 明确接受 `unix://PATH`（本地实测 help 文本），因此 Owner 仍有一个真实可看、可接管的 Primary 界面；这条把"run-scoped app-server"从纯后台机制变成 Owner 可用的路径，也是它比 daemon 方案更可交付的原因。

### 3.1 四级唤醒各自怎么落

| 级别 | 实现 | 已可确认 | 未资格 |
|---|---|---|---|
| **W1** | 不变：沿用现有 delegation 的前台阻塞等待（`skills/ultra-delegate/scripts/delegate_wait.py`、`delegate.cjs`），等待期间 Primary 0 个 idle model turn | 不需要新 API | 只需回归 |
| **W2** | thread idle 时：`thread/queue/add`（clientUserMessageId = `run:slice:event`）→ `thread/queue/start` → 得到 `Turn.id` | 三段 ack 全部有 schema | 必须 live smoke |
| **W3** | 同一条 run 私有 unix socket 就是 "live session inbox"：`thread/loaded/list` 给 identity，`thread/status/changed` / `turn/started` / `turn/completed` / `thread/queue/changed` 给事件，`thread/unsubscribe` + `thread_unload_delay_secs`（默认 60s）给 loss 语义 | 方法与通知名、卸载计时器均有官方文档 | **订阅面未证明**：官方文档没有写"未发起该 thread 的第二条连接是否收得到 turn/completed"；收不到就退化为 supervisor 侧机械轮询 `thread/turns/list`（仍然是 0 个 Primary model turn，符合 R2 §8.4，但要在报告里如实说明） |
| **W4** | 旧 app-server 进程消失后：新起 run-scoped app-server → `thread/resume{threadId}` → `turn/start{clientUserMessageId}` | `ThreadResumeParams` 有"running thread 则 rejoin"的明确描述，可用于防重复 writer | durable Grant、expiry/revocation、fencing 全部未做 |

**这套设计的一个重要性质**：W2/W3/W4 不是三种传输，而是**同一套协议下 thread 存活状态的三种取值**（`idle` / `active` / `notLoaded`+进程已消失）。adapter 只有一个，级别差异来自 `thread/loaded/list` + `thread/status/changed` 的观测结果。这直接满足 R2 §12.1"只增加能力、不转移语义权威、不制造一次性接口"。

### 3.2 unknown 边界与取消/对账

| 观测 | R2 状态 | 机械动作 |
|---|---|---|
| `thread/queue/add` 有响应 | `delivered` | 记 `QueuedSubmission.id` |
| `thread/queue/start` 返回 `Turn{id}` | `consumed`（待回显确认） | 记 `Turn.id`；随后用 `thread/turns/list` 校验该 turn 的 `userMessage.clientId == clientUserMessageId` |
| add 超时/断连，无响应 | `delivery_unknown` | 先 `thread/queue/list` 按 `clientUserMessageId` 反查；命中则视为 `delivered`，**不得重发** |
| start 超时/断连 | `delivery_unknown` | `thread/turns/list` 按 `clientId` 反查；命中即 `consumed` |
| 两处都查不到，且 app-server 进程存活 | `delivery_unknown` | 交还 Owner；禁止盲目再发 |
| app-server 进程消失且无 terminal turn | `outcome_unknown`（R2 §6.7） | 冻结 worktree/roots，禁止自动 relaunch |
| 需要撤销未起 turn 的 Attention | — | `thread/queue/delete` |
| 需要中止在跑的 turn | — | `turn/interrupt{threadId,turnId}` → 期望 `TurnStatus=interrupted` |
| 需要向在跑的 turn 追加而不新起 turn | — | `turn/steer{expectedTurnId}`；`expectedTurnId` 不匹配即失败（天然 CAS 围栏） |

**最大的 at-most-one 风险（必须由 smoke 判定）**：二进制里存在 `StartIfIdle`、`StartOrSteer`、`PendingTriggerTurn`、`NotIdle`、`ExpectedTurnMismatch`、`NoActiveTurn` 等内部标识，但这些**不在公开 schema 里**。**推断**：app-server 内部可能在 thread 转 idle 时自动起 queue head。如果为真，supervisor 再调 `thread/queue/start` 就可能造成同一 Attention 被应用两次，或者 start 报 invalid-request 而 supervisor 误判为投递失败。这是本路线唯一的架构级未知，S3 smoke 必须先于任何实现结论。

### 3.3 不得进入实施 Worker 的控制面环境变量

现状：`skills/ultra-delegate/scripts/host-profile.cjs:41` 的 `BASE_ENV_KEYS` 保留了 `HOME` 与 `TMPDIR`，`:63` 给 Codex Worker 授予 `OPENAI_API_KEY` 与 **`CODEX_HOME`**。

**由此得到一条本次新发现的具体风险**：Codex 的默认控制 socket 就在 `$CODEX_HOME/app-server-control/app-server-control.sock`。任何拿到 `CODEX_HOME` 的 Codex Worker，都能顺着这个路径连上控制面并向 Primary thread 注入 turn。因此：

1. run-scoped socket **必须放在 `CODEX_HOME` 之外**、且不在任何 Worker 的 writable roots 内的 0700 私有目录里；
2. socket 路径**只存在于 supervisor 的进程内存/run 私有 state**，不得作为环境变量下发；
3. 下列 key 必须既不在 `BASE_ENV_KEYS`、也不在任何 Host 的 `envDiscovery` 里（当前多数确实不在，此处是待写入实现的显式排除清单）：

```text
Ultra 控制面（新增，禁止外泄）：
  ULTRA_RUN_ID  ULTRA_SLICE_ID  ULTRA_ATTENTION_EVENT_ID
  ULTRA_PRIMARY_THREAD_ID  ULTRA_WAKE_SOCKET  ULTRA_WAKE_*

Codex 控制面/凭据（本地二进制 strings 实证存在）：
  CODEX_ACCESS_TOKEN  CODEX_API_KEY  CODEX_CONNECTORS_TOKEN
  CODEX_GITHUB_PERSONAL_ACCESS_TOKEN  CODEX_ESCALATE_SOCKET
  CODEX_EXEC_SERVER_URL  CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN
  CODEX_APP_SERVER_CHATGPT_BASE_URL  CODEX_APP_SERVER_LOGIN_CLIENT_ID
  CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED
  CODEX_INTERNAL_ORIGINATOR_OVERRIDE  CODEX_ROLLOUT_TRACE_ROOT
  以及 --remote-auth-token-env 指定的那个变量名

Claude Code 控制面（若 Claude 参与）：
  CLAUDE_CODE_MESSAGING_SOCKET  CLAUDE_CODE_MESSAGING_TOKEN
  CLAUDE_CONFIG_DIR
```

**诚实边界**：以上只阻断"通过环境变量顺手发现控制面"和误注入。同 uid 进程本来就能读 `HOME`，这不是 OS 级隔离，不得声称为沙箱。

---

## 4. 备选路线：Claude Code 2.1.261 inbox socket

官方文档 <https://code.claude.com/docs/en/cross-session-messaging>（"The session's inbox socket" 一节）确认：

- 每个启用了跨 session 消息的 session 会 bind 一个 unix domain socket（Windows 为 named pipe）；该节开头即写明适用场景包含 "**when you want a script or hook to post into a session**"。
- 路径通过 `CLAUDE_CODE_MESSAGING_SOCKET` 导出给 hooks 与 Bash 命令，"In a session that starts with messaging on, Claude Code exports the variable before any hook runs, including `SessionStart`"；`/status` 的 `Peer address` 行也显示（`uds:` 前缀）。
- 同时导出 per-session token `CLAUDE_CODE_MESSAGING_TOKEN`；脚本可用 `{"type":"auth","token":"<token>"}` 作为连接第一行（macOS/Linux 可选，原生 Windows 必需）。
- **投递语义正是 W2/W3**："The receiving Claude reads the message between tool calls during an active turn, so a running tool is never interrupted. When the receiving session is idle, Claude Code starts a new turn with the message."
- 丢失行为有明文：三态 `Delivered / Held / Refused`；`crossSessionInbound` 三值；`dialogExpiry` 默认 5 分钟；held 上限 100 条；接受队列上限 50 条；单条约 100 万字符上限；突发被发送侧拒绝；"drops identical repeats arriving within a short window"。
- 私有目录 `/tmp/cc-socks-<uid>`，socket 限本 OS 用户。
- `claude agents --json` 可脚本化列出活动 session（本地 `claude agents --help` 实测："Print active sessions (interactive and background) as a JSON array and exit (for scripting; does not require a TTY)"）。

**为什么只能当备选：**

1. **没有 delivery/consume 回执给投递方。** 文档描述的 held/delivered/refused 通知是发给"另一个 Claude Code 发送方 session"的，不是发给裸脚本的。R2 §6.5 要求的 `delivered → consumed` 机械 lifecycle 无从建立。
2. **去重是内容级的**："drops identical repeats arriving within a short window"。这对 Attention 是双向危险：重发可能被静默吞掉（造成永久 `delivery_unknown`），窗口外重发又可能被应用两次。没有 client 提供的幂等键。
3. **消息行的 JSON 结构在官方一手文档中查不到**（该页只给了 auth 行的形状）。我在官方域内检索也没找到。按任务约束不得猜 API，因此这条路线在拿到官方消息行合同之前**不可实现**。
4. 该 socket 的路径来自 `CLAUDE_CODE_MESSAGING_SOCKET`，是 Claude Code 自己导出给子进程的——也就是说，任何由 Primary 派生的 Worker 天然就有能力向 Primary 注入 turn。要用它就必须在 delegation 边界显式剥除这两个变量。

若最终必须用它，at-most-one 只能靠 Ultra 侧：`attention.json` 写 `consumed` 标记 + Primary 在被唤醒的 turn 里先自查该 `(run_id, slice_id, event_id)` 是否已消费。这是**语义兜底而非机械保证**，只能声明 W2 的弱形式，W3 的 "dedupe 通过 live smoke" 条件按现状无法满足。

**Claude Code 其余两条路已排除：**
- **Agent SDK streaming input**（<https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode>）：确实支持一个长驻 session 内多次投喂 user message，但输入是**父进程持有的 async generator**。这要求 supervisor 是 Primary 的父进程，与 R2"Primary 编译 slice、supervisor 由 run 派生"的控制方向相反；且没有跨进程投递面。
- **channels**（<https://code.claude.com/docs/en/channels>）：官方原文 "Channels are a research preview feature... the `--channels` flag syntax and protocol contract may change based on feedback"；需 allowlist 插件、需 Bun、需 claude.ai/Console 认证、`--channels` 不出现在 `--help`。按 R2 §10.4"未通过 exact-version smoke 的能力必须降级"，不能进 Step 1。

---

## 5. 能把"真跑通"和"只是搭好了"区分开的 live smoke

以下每条都必须产生可核验的 artifact（原始 JSON-RPC 往返 + `thread/turns/list` 快照）。**没有 S2/S3/S6，就不得声称 W2/W4；没有 S1/S5/S8，就不得声称 W3。**

| # | Smoke | 通过判据 | 它排除的"setup-only 假象" |
|---|---|---|---|
| S0 | 在 npm 安装下 `codex app-server --listen unix://<tmp>/s.sock` 能起、能 `initialize`、能 `thread/start` | 拿到真实 threadId，且 `thread/loaded/list` 含它 | 排除"daemon 的 standalone 限制其实也卡住普通 app-server" |
| S1 | 断开 supervisor 连接再重连，观察 `thread_unload_delay_secs` 前后 | 60s 内仍 loaded，之后 `notLoaded` | "socket 存在" ≠ "session 还活着" |
| S2 | thread idle 后，**另一个进程、另一条连接**做 `queue/add` → `queue/start` | 恰好一个 `turn/started` + 一个 `turn/completed`；该 turn 的 `userMessage.clientId == clientUserMessageId`；两次 barrier 之间 Primary 的 turn 计数增量 = 1 | "exit 0" / "queue 里有条目" ≠ 语义被应用一次 |
| S3 | 模拟 ack 丢失后重放同一 `clientUserMessageId`（含 add 与 start 各重放一次） | `thread/turns/list` 中该 `clientId` 的 turn 恰好 1 个；第二次 `queue/start` 返回 invalid-request 而非起第二个 turn | **这条同时判定 §3.2 的自动 start 未知**；不过这条就不能声称 at-most-one |
| S4 | turn 在跑时调 `queue/start`；用过期 `expectedTurnId` 调 `turn/steer` | 前者 invalid-request；后者失败且不产生新 turn | 排除"围栏只是文档说法" |
| S5 | turn 中途杀掉 supervisor 连接；重连后读终态；再验 queue 中未 start 的条目在 unload 后是否仍在 | 终态可从 `thread/turns/list` 恢复；未 start 条目的存活行为被如实记录 | 排除把"没报错"当作"没丢" |
| S6 | 杀掉整个 app-server 进程 → 新起 → `thread/resume` → `turn/start` | 得到一个 fresh turn；对 running thread 调 `thread/resume` 走 rejoin 而非复制 writer | 排除"resume 出一个能打字的界面"就算 W4 |
| S7 | `turn/interrupt` 与 `thread/queue/delete` | `TurnStatus=interrupted` 且无后续 item；被删条目不再出现在 `queue/list`，也从未有 turn 带该 `clientId` | 排除"取消发出去了"当成"取消生效了" |
| S8 | 经现有 delegation 边界起一个 Worker，dump 其 env 与可达路径 | §3.3 清单中的 key 一个不在；socket 路径不可从 env 推出 | 排除"隔离规则写在文档里"当成"隔离已生效" |
| S9 | `codex --remote unix://<sock>` 附着 TUI | Owner 能看到 Primary thread；附着/断开本身不产生语义 turn | 排除"Owner 其实看不见 Primary" |
| S10 | 全程 Primary idle model turn 计数 | 等待期间为 0（R2 §12.2 exit gate） | 排除用模型轮询伪装成机械等待 |

---

## 6. 仍然未合格的部分（不得在实施前当作已知）

1. **W2/W3/W4 全部未资格验证。** 本文只证明"存在具备 ack 与 dedupe 键的公开本地协议"，没有跑过任何 live lifecycle。
2. **§3.2 的自动 start 行为未知**，这是唯一可能推翻整条推荐路线的机制性未知（S3）。
3. **第二条连接的订阅面未知**：官方文档没写非发起方连接是否收得到 `turn/completed` / `thread/queue/changed`。收不到只是退化为 supervisor 机械轮询，不影响 R2 §8.4，但必须写进能力声明。
4. **queue 全族是 experimental API**（官方明文），意味着跨版本可能变更。实现必须把 `initialize` 返回的 server 版本与 `codex-cli 0.150.1` 绑定成 exact-version 资格，版本一变即失效重测。
5. **npm 安装下 app-server 是否可用未实测**（S0）；daemon 路径本机基本可判定不可用，但也未实测。
6. **认证行为未测**：`thread/start` 需要 `CODEX_HOME` 下的既有认证；本次没有读取、没有触碰任何凭据文件，也没有验证在 sanitized 环境里认证是否仍然可用。
7. **Claude Code inbox socket 的消息行合同缺失**，备选路线在拿到官方合同前不可实现。
8. **OpenCode `serve` 的公开 API 合同本次未核对**；如果 Codex 路线在 S0/S3 被推翻，它是第三顺位候选，需要另做一次同等勘察。
9. 本文没有涉及 durable Grant、expiry/revocation、writer fencing、worktree 隔离与 effect enforcement 资格（R2 §10.2/§10.3）——这些是 W4 的其余前置，全部未做。

## 7. 本次限制

- 严格只读：未启动 Codex daemon、app-server、TUI、任何 Host session 或模型回合；未读取任何凭据/配置密文（`~/.codex` 只做目录列举）；未改动仓库；唯一写入是本文件。
- 唯一的落盘副作用是把协议 schema 生成到 `/tmp/codex-appserver-schema/`（仓库外临时目录，可随时删除）。
- 网络检索只用了 openai.com / learn.chatgpt.com / raw.githubusercontent.com（openai/codex 官方仓库）/ code.claude.com 官方域；未采信任何非官方技术来源。
- 文中每条都标注了「本地实测事实 / 官方文档事实 / 推断」；标为推断的，都给出了对应的判定 smoke。
