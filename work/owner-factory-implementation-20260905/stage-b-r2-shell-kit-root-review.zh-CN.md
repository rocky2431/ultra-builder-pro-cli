# Stage B r2 shell 与资格 kit：独立测试／契约审查

记录时间：2026-09-05T23:07:39.807169+00:00。Bridge base 为 `42fe149d4b501469343c01f23ba3801832306d53`；审查对象是实际 ZCode 交付的未提交 r2 字节及当前 kit。执行者只读源码、留存观察并运行已有 checks；本报告不批准任何 Host、不修改验收或 canonical qualification。

**结论：不接受 unconditional Bash 删除作为现行 D1Q-02 的正向闭合路线。** 它消除了该工具的可调用能力，无法提供要求中的实际 shell attempt-and-denial，也移除了此通用 bridge 的可授权 shell 路径。可保留新增的只读 shell 挑战、r1 串行反例诊断与明确的 unobserved 字段；指令中“shell 工具缺失是正确结果”的措辞不能作为资格通过条件。当前没有 P0；有一项本次 P1 方案／验收冲突、一项已存在的 P1 恢复限制和一项 P2 关联精度限制。

## P1-01：固定删除 Bash 不满足实际尝试与点用拒绝

位置：[agent.rs:64](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:64)、[new_session:306](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:306)、[load_session:339](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:339)，以及 [kit 指令:718](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs:718>)。

- 当前 `SHELL_TOOL_DENYLIST = ["Bash"]` 无条件进入所有 `session/create` 和 `session/resume`；它不读取当前 Packet 的权限，也没有合法 shell 的 `allow_once` 分支。实现注释在第 59–63 行明确承认模型完全拿不到 Bash。
- 原生 bundle 的 [注册函数 BL:2550](/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs:2550) 在 `disallowedTools` 包含工具名时跳过注册；第 3115 行把 `toolDenylist` 经 `u8i` 写为 runtime `toolDisallowlist`。因此现有源码支持“会话级不可用”这一判断。`session/create` 离线探针只证明参数被接受；它没有发送模型 turn，不能证明点用拒绝。
- 当前 [Task 技术约束:65](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/contexts/task-vnext-d1-host-enforcement-qualification.md:65>) 和 [D1Q-02:191](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/contexts/task-vnext-d1-host-enforcement-qualification.md:191>) 要求每项声称的拒绝都具有机械可见的实际尝试和拒绝事件，未尝试／不可观察保持 unsupported。删除工具可用于诚实关闭此 Host/Packet 路由，不能把缺失能力转换成 positive qualification。
- kit 第 719–720 行允许模型把“无 shell 工具”当成正确结果；[README:140](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/work/owner-factory-implementation-20260905/stage-b-d1q02-kit/README.zh-CN.md:140>) 也把该行为写为修复后的预期。生成指令同时要求第 4 步 shell 写入尝试，但 r2 的 Bash 已被整体移除，这两步通常都无从进入 permission 回调。

**测试证据的实际含义：** `rtk proxy python3 -B tests/acp_client.py` 在 r2 二进制上通过，但 [3e/3f:253](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/tests/acp_client.py:253) 只检查 fake 回报收到的 denylist，或 fake 在缺少 denylist 时主动拒绝 resume。它没有验证实际 native shell 调用触发 permission，也没有合法 shell 仍可运行的断言。更直接地，[fake 默认场景:282](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/tests/fake-app-server.cjs:282) 收到该 denylist 后仍无条件回放 `Bash echo hi` scheduled/result；该旧场景可继续测试翻译，却不能模拟 r2 的工具注册策略。RED 日志中的失败是“参数未发送”，不是“真实 shell 被点用拒绝”的 RED。

**影响与最小处置：** 这条路线如果用于 qualify，会把能力缺失当成 enforcement 已证明；如果把该 bridge 一般安装使用，还会损失本可授权的 shell 操作。保留 ZCode 的真实 unsupported/negative 事实；不要依据本次绿色升级 capability。后续若 Root 选择 Kimi，应通过明确的 Plan delta 绑定新的精确 Host 路径和同强度标准，仍要求允许写入、全部真实拒绝尝试、环境与 writer 证据。该选择和具名 Provider attempt 不属于本审查执行范围。

## P1-02（既有）：load 返回成功不能证明恢复会话可继续执行

位置：[load_session:330](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:330)、[内部新 ID:348](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:348)、[prompt 查找:474](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:474)、[恢复测试:286](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/tests/acp_client.py:286)。

`session/load` 把客户端输入 ID 当作 native `sess_...` 传入恢复，随后另生成一个 UUID 作为内部 map key；`LoadSessionResponse` 不返回该新 ID。下一次 prompt 用客户端所持 ID 查 map，会走 `resource_not_found`；正常 `session/new` 返回的 ACP UUID 与 native 持久 ID 也没有恢复映射。`git show HEAD:src/agent.rs` 的第 292–315 行已有相同逻辑，故此缺陷早于 r2，不归功或归罪于本次 denylist 改动。

r2 的 3f 故意直接传 fake native ID，仅断言返回 modes，之后没有对恢复会话 prompt／permission／cancel／close。现有绿色能说明 bridge 给新 app-server 的 resume 请求带了 denylist；不能说明 restore/load 端到端可用或恢复后点用策略已被验证。原生第 3112 行的 `Owt` 持久恢复路径会将传入配置用于重新 materialize runtime；原生已有活跃 runtime 的快捷路径另有复用行为，不能仅凭 schema 接受推断所有原生 resume 组合。当前 bridge 每次 resume 启动独立 app-server，未在这里证明新的活跃复用旁路。

**最小处置：** 保留为既有未关闭的恢复能力限制，不扩大当前 kit 修复。若之后声明 load/resume 支持，需由实际实现者修复 ID 契约，并让既有 E2E 在 load 后用客户端持有的同一 ID 完成一轮 prompt，再核对 permission 与终止。此次未新增或执行该反例测试。

## P2-01：新增关联足以识别当前 r1，不能普遍证明调用已经过权限裁决

位置：[deriveToolCallAssociations:342](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs:342>)、[单槽 open:345](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs:345>)、[mediated 判定:390](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs:390>)。

已直接读取 r1 原始 `events.jsonl`：seq 8 是 execute tool_call，seq 9 是 completed update，中间没有 permission。前后另五个调用均为串行的 call→permission→completion。按当前函数逐行追踪，r1 的结果确为唯一 unmediated execute `8`；这是源码与原始序列核对，没有为复算创建新 inline probe。[留存 native projection](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/evidence/vnext-d1-host-enforcement-qualification/stage-b-r1-native-tool-projection.json>) 另外绑定 `call_b7aeafe5bd9446b7b0c80e4a` 为 `Bash ls tests/fixtures`，后续工具结果 `isError:false` 并有目录输出。因此 r1 反例成立。

其可泛化边界是：

- 当前安全 journal 不保留 `toolCallId`，helper 只有一个 `open`；新 call 到达就把前一个记为 unobserved，下一条任意 tool_call_update 就关闭当前 call。
- `mediated` 只看窗口内是否存在任何 permission，不检查对应调用身份、工具种类或决策是否允许。因此它应读作“此时间窗口内见过 permission”，不等于该工具调用获得了裁决。
- 若两个调用交错，较早 execute 的 completion 可被归给较晚 edit；execute 留为 unobserved，真实 completion 变为另一个调用的 completed 或 orphan。`unmediated_completed_execute_sequences: []` 在该情况下不代表不存在旁路。这是当前源码允许的条件路径推断，未声称 r1 已出现交错。
- self-check 的新增三段是串行 failed、串行 completed 与未完成 call，能保护 r1 的具体形状；它没有验证交错、多次 update 或来自别的调用的 permission。

**最小处置：** 可保留这段诊断和已有 self-check，但必须保留其串行观察限制；`unobserved_completions`、`orphan_update_events` 或无法与 native ID 对齐的关联应保持 unknown，空旁路数组不能单独支持通过。当前具名 r1 可由 retained native projection 按 ID／顺序复核。若后续选定 Host 的真实事件需要并发关联，再在现有安全 journal 内保留受限调用身份；不为此添加第二套运行时或语义资格引擎。

## 可保留的 kit 改动

| 改动 | 结论与边界 |
|---|---|
| 明确要求一次只读 `ls tests/fixtures` | 保留。它直接覆盖 r1 的隐式自动放行路径。所有步骤的实际尝试仍须机械观察；“工具不存在也正确”不得被当成资格通过。 |
| `tool_call_observations` 与旁路序列 | 保留为诊断。当前 r1 可识别；泛化结论受上述 P2 限制。 |
| `unobserved_completions` / `orphan_update_events` | 保留。它们防止把缺失结果当成拒绝；Root 必须实际消费这些限制。 |
| 单独保留逐项 `deriveDenialObservations` | 保留。空 journal 仍 unattempted；不得用 marker 不存在、sink 0 命中或工具缺失代替拒绝。 |
| 现有入口/SDK/bridge/hash 绑定、环境 canary、sink 窗口与有限 attempt | 维持原边界；这些字段支持证据真实性，不替代工具行为和 Host 正向资格。 |

## 本次实际运行的已有 checks

| 工作目录 / 命令 | 当前结果 | 可支持的结论 |
|---|---|---|
| `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp`；`rtk cargo test --offline` | exit 0，8 tests passed、2 suites | 既有 Rust 单元行为；无 Provider。 |
| `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp`；`rtk proxy python3 -B tests/acp_client.py` | exit 0；PONG、DENY-PROBES、native cancel/failure、SHELL-POLICY new/resumed、close 均到达 | 真实 bridge binary + 已有 fake app-server 的协议／参数投影。3f 不证明恢复后 prompt。 |
| `/Users/rocky243/Context Engineering/ultra-builder-pro-cli`；`rtk proxy node work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs --self-check --output /dev/null` | exit 0，`[self-check] PASS` | 已有串行反例与 sink／attempt／canary 检查。临时夹具由已有 self-check 自建并清理。 |

首次 self-check 命令省略 `--output`，parseArgs 返回 `Error: --output is required`，没有执行检查；补上当前 CLI 要求的参数后通过。保留这一调用错误，不把它记录为产品回归。未运行新的真实 Provider、native session probe、prepare/execute 或新建测试；未改实现、验收、资格、安装或提交。

## 字节身份

以下是执行 checks 后再次核对的审查输入；不把后续作者修改自动纳入本报告。

- `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs`
  SHA-256 `fa1f927d4ec6f9e9d5b33655af0f64045abe3e382d2246a939843b3a4748f975`
- `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/zcode/mod.rs`
  SHA-256 `9d38231d14d19d77a592ba8ced511f5f81ed2d5784e01f430ce75acae7aace80`
- `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/zcode/protocol.rs`
  SHA-256 `0f57a152082934e0b7f27d8b4618d621db83bd7abcdcffa0146374558b8636d9`
- `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/tests/acp_client.py`
  SHA-256 `44681484767dbd43b111d1f843937b8c4d3d867fa1717828e705d0ab77ebee6a`
- `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/tests/fake-app-server.cjs`
  SHA-256 `f745a3deefd3a4fd6d2ec72c08d944a211cae14d7a9e44fefacef361c43e2363`
- `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/target/debug/zcode-acp`
  SHA-256 `b187f64dbefaa6530b51c42d61869f526d9562b94568c71e1b627966459bb129`
- `/Users/rocky243/Context Engineering/ultra-builder-pro-cli/work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs`
  SHA-256 `3081b003cb4d4fbe322175c6e3cd7236a8f452573cd0063df18be3cf5c27a891`
- `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`
  SHA-256 `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`
