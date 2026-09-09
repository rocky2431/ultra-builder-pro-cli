# Stage B D1Q-02 kit 最终修复 handover（实际 Kimi → Root/Codex）

2026-09-06（本会话内完成）。本 handover 汇报「finish the actual qualification observation kit」任务
的实际处理，对应 Root 初审 `stage-b-d1q02-kit-initial-source-review.zh-CN.md` 末节「真实 launcher
改写后的观察生命周期复查」与任务书 `stage-b-kimi-kit-final-repair-mission.md`。不宣称 D1 关闭、
不宣称 kit 已被验收、不宣称任何维度合格；真实 ZCode qualification 由 Root 在最终源码审查后独自
执行并发布 canonical attempt/receipt/verdict。

## 一、交付物与哈希

| 文件 | SHA-256 |
|---|---|
| `work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs` | `1b286e06c7af68313a4a8836ec9b3d32760c5ed55a4c91a23099becac776948d` |
| `work/owner-factory-implementation-20260905/stage-b-d1q02-kit/README.zh-CN.md` | `59abf3a77984595f320203eea9c76ee12a10da95bfacd80f3511daa8eb5db212` |

改动仅限上述 kit 目录与本 handover；UBP 产品源码/测试、bridge、Goal、agent-delegation 源均零改动
（只读使用 `delegate.cjs run()`、`host-profile.cjs`、`agent-execution-driver.cjs` 导出）。检查产物
全部在任务自有范围 `.ultra/.runtime/owner-factory-implementation-20260905/stage-b-kimi-kit-*`。

## 二、四项遗留缺陷的处理（对照任务书编号）

1. **sink 观察窗口**：execute 不再于 launcher 调用的 finally 里 `sink.close()`；sink 在整个
   detached Worker 窗口内保持服务，仅在终态观察完成或早期错误 unwind 时由统一 finally 无条件关闭
   （`closeServer`）。同步 `Atomics.wait` 改为事件循环友好的 `waitForFileAsync`（100ms 轮询 +
   deadline）。窗口内协调进程向 `…/coordinator-liveness` 发一次自身 liveness 请求：被回答且被
   sink 记录（`coordinator_liveness.recorded===true`）才继续，否则拒绝产出观察；observation 中
   `loopback_sink_hits` 只含 Worker probe 路径 `…/probe`，与 liveness 严格分列。拒绝维度仍只由
   各自互异的 permission attempt+reject 事件支持，absence 永不单独成立（沿用并保留上轮推导）。
2. **prepare/execute 合同**：新增 `assertExecutableDispatch` 准入门——状态必须恰为 `prepared`
   （dispatched/observed/未知/id 或 profile 不匹配全拒，绝不成为第二个未消费运行）；显式且不同的
   `--timeout-seconds` 拒绝（prepared timeout 不可静默重置；重述相同值可接受，execute 一律使用
   prepared 值）。prepare 绑定：外部 attempt id、有限 timeout、instruction/permission 精确 digest、
   `result_schema` 与指令内嵌 result 模板 digest、六份 UBP 执行源 digest、经 canonical
   `resolveAcpEntry` 解析的 entry（路径+digest）、entry 实际加载的 acpx 包元数据（见第 4 项）、
   真实 bridge（路径+digest）、App-bundled native CLI（存在性+digest）、canonical patch（profile
   声明 digest 与文件实际 digest 不一致即拒绝 prepare）、live profile 的 declared candidate
   identity。execute 逐项核对全部绑定（含 bundled CLI/patch/源文件/candidate identity，上轮未比
   对项已补齐）；loopback 占位 URL 的确定性一次性替换仍在 dispatch 前记录、保留前后两个精确
   digest，且在全部其他漂移核对之后执行，不能豁免它们。已有 dispatch 记录的 attempt id 拒绝重新
   prepare。profile 输入核验先于 worktree 副作用（RED-7 曾暴露先建 worktree 后拒的顺序问题，已修）。
3. **最终 Host 环境观察**：保留现有 wrapper 实测路径不动（`env | cut -d= -f1 | sort` 直接枚举
   键名，绝不保留值；已实测 dump 无任何 `=`）。canary 只注入隔离 kit 进程 `process.env`，过滤由
   生产 launcher 完成。canary 扫描从 5 个文件扩到**全部保留 artifact**：delegation 目录 13 个文件
   （instruction/permission/result/result-schema/worker-spec/receipt/writer/run.lock/events/stdout/
   stderr/host-result/cancel.request）+ kit 侧 dispatch.json、wrapper、env dump、agent-config.json，
   值与键名均记录；写盘后另对 observation 做值级扫描（泄漏即 kit defect 抛错）。不构造手工过滤
   env 对象替代实测。
4. **公开 runtime 版本/路径绑定**：`resolveAcpxPackage(entry)` 按实际布局
   `dirname(entry)/node_modules/acpx` 解析（修正旧稿多退一层的错误路径），记录 name/version/
   package.json digest/realpath；zcode profile 缺失即拒绝 prepare（派发前指出）。README 的 Root
   命令已实测可运行（见下），并注明：`$RUNTIME` 目录在 prepare→execute 间必须保持不变（entry
   路径被绑定）；已安装 `agent-delegate` 可执行仍报告 0.2.0（源/Skill 已 0.3.0），不得假设 PATH
   上有 submit/wait；bridge/profile identity 由 kit 在 prepare 时实际读取。

## 三、本地 RED/GREEN 证据（原始日志，均在 `.ultra/.runtime/owner-factory-implementation-20260905/`）

- `stage-b-kimi-kit-selfcheck-final.log`：`--self-check` PASS。新增：sink 窗口缺陷双向复现
  （launcher 返回即关 sink → 连接被拒；`Atomics.wait` 等待 → 在途请求 300ms 内不被服务、阻塞结束
  后才完成）与修复后 GREEN（模拟 Worker result 挂起期间 liveness 被实际回答并记录）；准入门五项
  拒绝 + prepared/同值 timeout 放行；acpx 元数据合成布局解析与缺失 null；canary 扫描命中/豁免。
- `stage-b-kimi-kit-prepare.log` / `stage-b-kimi-kit-execute.log`：fixture-smoke（管路，非资格）
  全链路 GREEN（attempt `d1q02-kitcheck-001`）：三维度 `mechanically_attempted_and_rejected:true`、
  终局 `permission_denied`（`end_turn`）、`coordinator_liveness_recorded:true`、probe 命中 0、
  `env_key_leaks:[]`、全部保留 artifact 无 canary 值/键名。observation：
  `stage-b-kimi-kit-check-observation.json`。
- `stage-b-kimi-kit-fixture-green2.log`：重排后的第二次全链路 GREEN（`d1q02-kitcheck-007`，
  execute 显式重述相同 timeout 900 被接受）。
- `stage-b-kimi-kit-red-state.log`：RED-1 已 observed attempt 再 execute 拒绝；RED-2 同 id 重新
  prepare 拒绝；RED-3 未知 attempt 拒绝。
- `stage-b-kimi-kit-red-drift.log`：RED-4 漂移 timeout 拒绝；RED-5 篡改 instruction 拒绝；RED-6
  篡改绑定的 UBP 源 digest 拒绝；RED-7 zcode 缺 bridge/entry 环境即拒绝（且不再留下 worktree）。
- `stage-b-kimi-kit-red-entry.log`：RED-8 zcode execute 缺绑定的 entry 环境 → `acpx_entry` 漂移
  拒绝（任何 launch 之前）；attempt 保持 `prepared` 未消费。
- `stage-b-kimi-kit-zcode-prepare.log`：**zcode profile 的 prepare 半程按 README 命令实测 GREEN**
  （`d1q02-kitcheck-006`，mktemp 隔离 runtime `/tmp/ubp-d1q02-acpx-KglF`）：entry digest 实为
  `99049a249b8bf719914601cb82869692379e5a8bba8fff1ad51d796fe5a4c6bb`；acpx 经符号链接实际解析
  0.13.2；native CLI digest `e9f1868c…`；patch 声明与实际一致 `8c127dba…`。**注意**：prepare 时
  live profile 的 declared identity 已是 `zcode-acp 0.1.0+ultra.zcode.0.16.5.r1`（并行 ZCode 的
  build-identity 修复已落地），临时 bridge binary 实为 `ebc2932b0d1c6c78efe133aea68d1e6616615eed8e2c5c229a41f3ba81ca9eba`
  （与上午的 `2ca338e8…` 不同；其 `--version` 报告 `.r1`）。kit 全部实际读取，无硬编码 marker。
- 清理：全部 kitcheck worktree 已 `git worktree remove --force` + prune（`git worktree list` 无
  残留）；`ps` 无 delegate-worker/fake-acp/kit 进程残留；durable 记录（dispatch/delegation/wrapper/
  env dump）保留于 `stage-b-kimi-kit-runtime/<attempt>/`。

## 四、Root 就绪命令（与 kit README 一致；execute 半程归 Root）

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
# …Root 记录具名 attempt 后（同一 $RUNTIME、同一 --attempt-id/--output、不另传 --timeout-seconds）…
node work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs \
  --execute --attempt-id d1q02-<slug> \
  --output .ultra/.runtime/owner-factory-implementation-20260905/stage-b-d1q02-observation.json
```

## 五、限制与未运行项

- 真实 ZCode qualification（zcode profile 的 **execute**）**未运行**——归 Root；`d1q02-kitcheck-006`
  只做了 prepare 半程且留在任务自有 runtime-base，不是 canonical attempt。
- fixture-smoke 仅为管路证明，不构成任何维度证据；`allowed_written:false` 是 fixture 预期（fake
  agent 不解析指令文件）。历史 negative qualification（`d1q-61ca5157911e4f61866cff5452bc942d`）与
  旧 D1 证据原样未动；profile 维度状态未做任何翻转。
- 未重跑产品 suite（产品源码零改动，无触发理由）；未运行 `npm pack`/install/doctor。
- `--runtime-base` 是 kit 自测 seam；Root 的 canonical 运行用默认 `.ultra/.runtime/stage-b-d1q02`。
- 已知边界沿用 README：公开 ACPX runtime 广告能力但 entry deny-all；cancel 语义不变；transport
  maturity 仍 experimental；admission fail-closed 是正确行为，单点 bootstrap override 不改变产品代码。
- 并行 ZCode 正在进行的 bridge 身份/文案修复由其拥有；若其在 Root prepare 后再次变更 identity，
  execute 将按漂移拒绝——重新 prepare 即可，这是设计行为。
