# Stage B D1Q-02 kit 反馈处理 handover（实际 ZCode → Root/Codex）

2026-09-05T20:05Z。本 handover 汇报排队跟进任务「Stage B qualification kit feedback」的实际处理，
对应 Root 报告 `stage-b-d1q02-kit-initial-source-review.zh-CN.md`。不宣称 D1 关闭或 Stage B 验收；
真实 D1 qualification 由 Root 在最终源码审查后独自执行。

## 一、对照 review 的发现清点（先核实现状，再做增量）

| Review 发现 | 上轮后现状 | 本轮处理 |
|---|---|---|
| P1 局部合成 env 未被实际消费；env_keys 含禁止键名；进程内 spawn spy 在解构导入后无效；最终 Host spawn 在后代进程 | **部分残留**：canary 已移出 env_keys，但 spy 因 require 顺序永不触发（`observedHostEnvKeys` 恒 null），spec 仍是手工构造 | **已重写**：改走真实 launcher + wrapper 实测（见下） |
| P1 linked worktree 的 git config 写共享 repo 身份 | 上轮已删除 | 无冗余改动；本轮重写中保持不写任何身份 |
| P1 缺调用前持久 attempt；marker 缺失被写成已拒绝 | 上轮部分修复（stdout 行 + 事实字段） | **补全**：持久 dispatch.json 两阶段 + 机械拒绝推导（见下） |

## 二、kit 重写内容（`work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs`，SHA-256 前 16 位 `fb42283e bffa09ed…`）

1. **真实生产路径 + 唯一 override**：kit 调用真实 `delegate.cjs run()`（`resolveHostProfile`
   返回删除 enforcement 记录的 zcode profile——这是唯一 override，逐字记录在
   dispatch/observation 的 `admission_override`）。环境过滤（`descendantEnvViews`）、fence、
   worker-spec digest、detached delegate-worker spawn、入口式 ACP driver、`permissionDecision`、
   boundaryProof、typed result 全部是被测生产代码。
2. **最终 Host 环境实测**：kit 生成 `host-boundary-wrapper.sh` 并把 `ULTRA_ZCODE_ACP_COMMAND`
   指向它；wrapper 在 exec 真实 bridge 前记录**键名**（绝不记录值）。观察点即入口把环境复制
   给 Host 的真实进程边界（ACPX `{...process.env}` 复制语义已在源码核实）。canary 只注入 kit
   进程 `process.env`（launcher 会过滤），任何出现在 wrapper dump / worker-spec `env_keys` /
   保留 artifacts 中的 canary 键名或值都记为泄漏。旧的进程内 spy 已删除。
3. **prepare→execute 两阶段 + 持久 dispatch**：`--prepare-only` 建隔离 worktree（不写任何 git
   身份）、scaffold、`dispatch.json`（外部绑定 `--attempt-id`、instruction/permission/bridge/
   entry/patch/bundled-CLI SHA-256、product HEAD、deadline），在 provider 调用前退出。
   `--execute` 先逐项核对绑定（任何漂移硬拒绝；loopback 占位 URL 的一次性替换记录前置 hash），
   在 metered 调用**之前**持久化 `state:'dispatched'`；生命周期 `prepared→dispatched→observed`
   只是记录文件，不是第二状态机。崩溃后可从 durable 记录恢复。
4. **机械拒绝推导**：`deriveDenialObservations` 只从 events.jsonl 的 permission 事件推导——
   每维度要求其互异的 tool-kind 请求被观测且决策为 reject（按 sequence 各自可寻址）；
   marker 缺失与 sink 0 命中仅作为 absence 事实呈现；`mechanically_attempted_and_rejected`
   是推导不是判定，verdict 归 Root。

## 三、RED/GREEN 与验证证据（`.ultra/.runtime/owner-factory-implementation-20260905/`）

- `stage-b-d1q02-kit-selfcheck.log`：`--self-check` 双向——空 journal 一律 unattempted
  （旧缺陷：absence 曾被写成 denied）；三个互异拒绝事件各自观测到 attempt+rejection。
- `stage-b-d1q02-kit-fixture-smoke-green.log`：`--profile fixture-smoke` 全链路
  （真实 launcher → worker → fixture entry → wrapper → fake agent，无 provider 调用）：
  三维度 `mechanically_attempted_and_rejected:true`、终局 `permission_denied`（stop
  `end_turn`）、`env_key_leaks:[]`、launcher `env_keys` 与 wrapper 实测键名均无 canary。
- `stage-b-d1q02-kit-immutability-red.log`：prepare 后篡改 instruction，execute 以
  「instruction drifted from the dispatch binding…start a new attempt id」硬拒绝，exit 1。
  （该 RED 同时暴露并修复了一个真实缺陷：占位 URL 分支曾绕过漂移核对；另修复拒绝路径
  的 sink 句柄泄漏——不可变性核对已移到任何 live handle 之前。）
- zcode profile 负向核对：缺 `UBP_D1Q02_REAL_BRIDGE` 时 prepare 即拒绝（exit 1）。
- 清理：全部 smoke worktree 已移除并 prune，无遗留测试进程；`delegate.cjs`/`acp-driver.cjs`
  等产品源码本轮零改动（`d29b2d0a…`/`72f46e16…` 与上轮一致），故未重跑产品 suite。

## 四、Root 执行命令（最终源码审查后；与 kit README 一致）

```bash
cd "/Users/rocky243/Context Engineering/ultra-builder-pro-cli"
RUNTIME=$(mktemp -d /tmp/ubp-d1q02-acpx-XXXX)
mkdir -p "$RUNTIME/runtime/node_modules"
cp /tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs "$RUNTIME/runtime/"
ln -s /Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx "$RUNTIME/runtime/node_modules/acpx"
export UBP_D1Q02_REAL_BRIDGE=/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/target/debug/zcode-acp
export ULTRA_DELEGATE_ACPX_ENTRY="$RUNTIME/runtime/acpx_delegate_entry.cjs"
node work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs \
  --prepare-only --attempt-id d1q02-<slug> \
  --output .ultra/.runtime/owner-factory-implementation-20260905/stage-b-d1q02-observation.json
# …Root 记录具名 attempt 后…
node work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs \
  --execute --attempt-id d1q02-<slug> \
  --output .ultra/.runtime/owner-factory-implementation-20260905/stage-b-d1q02-observation.json
```

（bridge 二进制 `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/target/debug/zcode-acp`，
SHA-256 `2ca338e8d62bfca9…`；patch `628b38d8…`；均为上轮产物，未动。）

## 五、未证实/边界

- 真实 ZCode qualification **未运行**（归 Root）；fixture-smoke 只证明 kit 管路，不构成任何
  维度证据。历史 negative qualification 与原 Acceptance 未动。
- 上轮保留的 P2 不在本轮范围（Node engines、bridge allow_project 标注、live conformance
  重跑决策等），未自动扩大。
- Kimi 对 agent-delegate-skill 的独占写权限保持；本轮只读取其 entry 公开 schema，未编辑。
- kit 的 `--profile fixture-smoke` 明确标注 test-only 并记录在 dispatch 中，不可冒充资格。
