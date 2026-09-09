# Stage B bridge 独立只读源码审查

2026-09-06。**当前快照需要修改：一项已证实的 P1——原生取消/失败被转换成普通 ACP `end_turn`。** 该缺陷继承自 bridge 基线，本次完整补丁尚未处理；它属于当前要求核对的终态真实性，不据此声称新增 locations 改动引入了回归。其他发现按当前消费者可达性保留为 P2。

## 范围与移动快照

- 工作树：`/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp`，HEAD/base 均为 `42fe149d4b501469343c01f23ba3801832306d53`。
- 审查完整八文件 diff、UBP [规范补丁](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch>)、现有 Rust/假 app-server/ACP client 测试，以及本机原生 bundle 中直接相关的工具 schema、权限选项和终态事件构造。
- 实际 ZCode 仍有独占写作任务。本 reviewer 开始读取时记录 S1，结束源码核对时于 `2026-09-05T18:44:33.168953+00:00` 记录 S2；以下 bridge 八文件与规范补丁的 S1/S2 哈希完全相同。结论只绑定该快照，不覆盖此后修改。
- 未调用 provider、未启动 Agent、未执行测试套件、未修改源码/测试/状态。唯一写入为本报告。下述反例是实际源码的确定数据流与本机原生事件构造，不能冒充已经运行的回归测试。

## P1：原生取消和失败失去非成功终态

**原生取消的可达反例：** 本机 [zcode.cjs:2664](/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs:2664)在取消路径明确执行 `createEvent(V.TurnComplete, {response:"", ..., resultType:"cancelled", ...})`；[第 3108 行](/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs:3108)把 `V.TurnComplete` 映射为 `turn.completed`。这不是从日志文字猜测取消。bridge 的 [TurnCompletedPayload:443](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/zcode/protocol.rs:443)未保留 `resultType`；[事件处理第 327 行](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/zcode/mod.rs:327)对所有 `turn.completed` 固定创建 `StopReason::EndTurn`；[prompt 第 466 行](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:466)据此返回 ACP `end_turn`。原生已经给出的 `cancelled` 因而被丢失。

**原生失败的确定反例：** 同一原生取消/失败处理函数的非取消分支创建 `V.TurnError`；第 3108 行映射为 `turn.failed`。bridge [mod.rs:338](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/zcode/mod.rs:338)读取该事件并产生 `TurnError::Failed(message)`，但 [agent.rs:467](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:467)将此错误仅转换成一条警告文本，然后返回 `Ok(PromptResponse::new(EndTurn))`。因此消费结构化结果的调用者只能看到正常完成的 ACP 回合，必须自行猜测正文才知道原生失败；目前没有必要这样丢失已有的失败事实。

**后果与反证：** `end_turn` 本身不证明产品完成，UBP 的独立产品验收也应继续保留；然而这不能修复 bridge 将已知取消/失败写成正常 terminal 的协议失真。桥内 timeout 分支会返回 `Cancelled`、上层也可能保留自己发起的取消，这些路径不等于上述原生事件分支已正确。问题不涉及从错误文本推断 quota、预算或其他未知分类。

**最小充分处理：** 由实际作者保留并使用原生已证明的 `resultType:"cancelled"`，将其映射为 ACP `cancelled`；使实际 `turn.failed` 使用明确的 ACP error/失败返回，保留原始错误上下文。正常 `resultType:"success"` 仍为 `end_turn`，包括两次拒绝后正常结束的回合；不需要在首次 deny 时取消，也不需要新增调度引擎。其他原生值按已查明的真实合同另行判断，本报告不提出猜测性 enum 映射。

**现有夹具可完成的最小验证：** 扩展 [fake-app-server.cjs](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/tests/fake-app-server.cjs:169)和 [acp_client.py](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/tests/acp_client.py:146)，分别让原生端发出 `turn.completed` 且 `resultType:"cancelled"`、真实形状的 `turn.failed`；断言前者得到 ACP `cancelled`、后者得到错误而非 `result.stopReason:end_turn`。保留原来的普通成功与两次独立拒绝后 `end_turn` 用例，并核对拒绝 ID；这些可以在假服务器中验证，不要求重新调用 provider。

**本次只读证明方式：** `rtk proxy python3 -B -` 读取本机 bundle，通过精确字符串 `resultType:"cancelled"` 与 `case V.TurnComplete:` 定位事件构造/映射，再对照上述 Rust 消费分支；该 bundle SHA-256 为 `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`。未运行 bundle。

## 已验证的补丁保留与局部修正

- **规范补丁完整一致。** `git diff --binary <base>` 的完整输出与当前 UBP patch 字节相同。相对 Stage A commit `b765b55` 内原补丁，Cargo.lock、Cargo.toml、`src/zcode/mod.rs`、`src/zcode/protocol.rs` 四段完全相同；两个测试段为增量扩展，新增 translator/agent 段。原 runtime-preferences 默认值、启动阶段回复与运行中回复路径均保留。旧 patch SHA-256 为 `174dfd0feafe84320556a84b5ae08b10e44c5515fea4992fd1d58af54cee4e3d`。
- **原生单文件位置修正有对应来源。** 本机 bundle 的 Read/Write/Edit schema 都使用单个 `file_path`，名称分别为 `Read`、`Write`、`Edit`；当前 [extract_locations:148](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/acp_translator.rs:148)保留该精确字符串，并同时收集现有 `path`、`file`、`files` 中的字符串路径。Scheduled 与 permission 请求都调用此 helper；[agent.rs:672](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:672)把权限请求中的 locations 与原始 JSON 一起转发。没有以 raw input 解析替代权限 locations。多个受支持字段中的路径会全部输出，未发现只取首路径的实现，但当前新增测试只覆盖单路径，不能把它写成多路径实测 PASS。
- **多个拒绝保持可观察的桥内路径已存在。** [agent.rs:742](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:742)先发对应 toolCallId 的 failed update，再回送 deny，不结束 turn；[夹具第 76 行](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/tests/fake-app-server.cjs:76)在第一次拒绝后安排第二个请求。[client 第 189 行](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/tests/acp_client.py:189)检查两次请求和两条 bridge 拒绝记录，第 215 行检查 `end_turn`。本 reviewer 只检查了测试内容，未运行；计数仍可补成不同 ID 的断言，以直接证明两个拒绝而非同一更新重复。
- **产品终局汇总正在实施，尚不能用桥内测试替代。** S1 时 UBP 旧 [acp-driver.cjs:583](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/acp-driver.cjs:583>)首次 deny 即 `fatal.resolve`，因此可能在第二次请求前开始清理。Root 确认当前 writer 正在将旧 SDK engine 替换为 public entry，多次拒绝后再形成最终 `permission_denied` 是明确交付要求。本项记作“旧 consumer 未闭合、正在实施”，不是对尚未完成修改的最终判错；最终仍需检查新的必经 consumer。

## 保留 P2 与覆盖限制

1. **权限 kind 翻译不精确，但当前选择路径未证实越权。** 本机 [bundle:3107](/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs:3107)固定返回 `[allow_once, allow_project, deny]`，其中 `allow_project` 的 kind 是 `allow_always`，response 含 `permissionUpdates`。[translator:219](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/acp_translator.rs:219)丢弃原生 kind，[agent.rs:689](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:689)按 ID 推断，错误地将 `allow_project` 也标为 AllowOnce。反证决定当前严重度：实际 native 数组无条件先包含真正的 `allow_once`，当前 UBP/ACPX first-kind 选择器不会选中后面的 `allow_project`。故列 P2，不扩大本次自动修复。触发条件是消费者改为选择后续同 kind 选项，或上游改变顺序/省略首项；最小修正为精确保留/翻译原生 kind，保留 optionId 与原始 response。当前 fake 只有 `allow-once`/`deny-once`，没有覆盖真实 `allow_project`。
2. **恢复事件的位置可观察性不完整。** [translator:82](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/acp_translator.rs:82)的 first-seen Started fallback 没有附带 locations，即便 input 已含 file_path；Scheduled 分支及权限请求已正确携带。该分支降低漏掉 Scheduled 后的事件可观察性，但权限请求仍独立提供位置，未由此证明越权写入。新增 Rust 测试只测 Scheduled 和 permission 请求；多路径/Started 恢复不能声称已经验证。
3. **错误选项响应的拒绝记录仍有限。** [agent.rs:726](/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/src/agent.rs:726)对不存在的选项 ID 回送 deny，但第 729 行只按 ID 是否以 deny 开头决定是否记录拒绝。当前合法精确选项路径不会产生该输入，故不提升为 P1；不能把当前覆盖说成所有错误响应都有独立拒绝事件。
4. **工具 kind 覆盖边界。** 当前原生 Read/Write/Edit/Bash 与 Rust 映射一致；本机原生 `js` 等其他工具落入 `Other`。这是保守拒绝/能力范围残余，不能推广为全部原生工具已精确适配。未重新审查不相关的原生 helper，也未要求自动开放这些工具。

## S1 = S2 的 SHA-256

| bridge 文件 | SHA-256 |
|---|---|
| `Cargo.lock` | `60e1d689512cdc3399e7662fe32ae6ae66d2159bc3c8dee177ff1b0b3c7f0e57` |
| `Cargo.toml` | `22518b3ea913633639385e3d3792983d59ddc5ca7043ea331ba5b400534a2c7b` |
| `src/acp_translator.rs` | `fd00e801992d6badf339d2289a770d4aaaa4428734ba975c20b48edb48a25fe1` |
| `src/agent.rs` | `5e1a2bc626e0c9c8a7aa815c369df8de0e22edaa2dcfa87c5c8d180f9986e4be` |
| `src/zcode/mod.rs` | `58d793e17c66198ad7d334c8e81c8a97ff1ef3e5346ee91cab9fdf3546384c16` |
| `src/zcode/protocol.rs` | `660130c6cfd7208e15be98edc9e65e7670e7f0eee12cc135fc112ad07db5547e` |
| `tests/acp_client.py` | `175fcec90aa61a71e4ed86f7444d058d33f6fad96a61f854b472471de5aac66e` |
| `tests/fake-app-server.cjs` | `41ade3181ac0904cc7373537c55ecd061d64bbce8ad8e9e59d9700dedbc843e7` |

当前完整规范补丁 SHA-256：`69239647fd6daf876076a227f8613525e0683e0739c70095b35e99e442f9fe53`。
