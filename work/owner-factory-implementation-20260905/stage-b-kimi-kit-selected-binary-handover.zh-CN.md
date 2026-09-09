# Stage B D1Q-02 kit：实际选中 native CLI 的绑定修复 handover（实际 Kimi → Root/Codex）

2026-09-06（紧接上轮 final repair 的同命名会话）。本 handover 汇报一项独立追踪的身份绑定缺陷的
最小修复，对应任务书「bind the actual selected native CLI」。`stage-b-kit-final-source-review.zh-CN.md`
在修复时**尚未可用**（已核对不存在）；缺陷由任务书完整追踪给定。不宣称 kit 验收、不宣称任何维度
合格；真实 ZCode qualification 仍由 Root 在最终源码审查后独自执行。

## 一、缺陷与修复

**缺陷**：kit prepare 只绑定 `ZCODE_BUNDLED_CLI` digest，而生产 `delegate.cjs`
`selectedBinary`（735–736 行）与 `run`（868 行）采用 `process.env.UBP_DELEGATE_ZCODE_BIN` override。
一个广告相同版本号的不同 native CLI 可因此被实际选中，而观察记录的仍是 App-bundled CLI 的
digest。当前 Root 环境无此 override；这是可达输入绑定缺陷，不声称曾发生错 CLI 运行。

**修复（拒绝式，按任务书偏好）**，仅改 kit：

- 新增 `NATIVE_CLI_OVERRIDE_ENV` 常量与 `assertNativeCliOverrideAbsent`：truthy
  `UBP_DELEGATE_ZCODE_BIN` 即拒（空串等同于生产 `|| fallback` 语义，不拒）。
- prepare（zcode profile）在**任何副作用之前**调用该检查（先于 bridge/entry 校验与 worktree
  创建），并在 dispatch 记录 `native_cli_override_env`/`native_cli_override_value: null` 绑定。
- execute 把 `native_cli_override_value` 作为 zcode 漂移核对列表**第一行**复核：prepare→execute
  之间引入 override 在 dispatch/launch 前按普通漂移拒绝。旧格式记录（无该绑定字段）遇 override
  同样拒绝（`bound undefined/null ≠ 当前值`），向后兼容。
- fixture-smoke profile 从不选择 native CLI（binary 是 Node runtime 本身），不适用该门禁，行为不变。
- 唯一 enforcement bootstrap override（删除 zcode enforcement qualification 记录）与真实生产
  launcher 路径原样保留；产品源码/测试/bridge/Goal/公开 ACPX entry 零改动。

## 二、交付物哈希

| 文件 | SHA-256 |
|---|---|
| `stage-b-d1q02-kit/run-d1q02-observation.cjs` | `fef81238a601eb056d398a8f8121d42053afeb5a8ba27d0c77444e4269f4b2ac` |
| `stage-b-d1q02-kit/README.zh-CN.md` | `d3cda4f3c9d584a658f37417ad09f9a2b6450cc7be77267d3f7e5d8cded7ce41` |

（上轮 final repair 的 kit 哈希为 `1b286e06…`；本轮仅增量上述门禁。）

## 三、本地 RED/GREEN 证据（`.ultra/.runtime/owner-factory-implementation-20260905/`）

- `stage-b-kimi-kit-selfcheck-final.log`：`--self-check` PASS（exit 0），新增段：truthy override
  拒绝、unset/空串放行；既有各段（sink 窗口双向、准入门、acpx 元数据、canary 扫描、拒绝推导）
  全部保留并通过。
- `stage-b-kimi-kit-red-native-cli.log`：
  - RED-A：`UBP_DELEGATE_ZCODE_BIN=/bin/echo` 下 zcode prepare 即拒（exit 1），**无任何副作用**——
    无 attempt 目录、无 worktree 注册。
  - RED-B：对已 prepared 的 zcode attempt `d1q02-kitcheck-006` 在 execute 时引入 override →
    `native_cli_override_value` 漂移拒绝（exit 1），attempt 保持 `prepared` 未消费，无 launch
    artifact、无 provider 调用。
- `stage-b-kimi-kit-green-native-cli.log`：
  - GREEN-1：修复后 zcode prepare（override 未设）成功，绑定
    `native_cli_override_env=UBP_DELEGATE_ZCODE_BIN / value=null`，bundled CLI digest `e9f1868c…`，
    live identity `zcode-acp 0.1.0+ultra.zcode.0.16.5.r1`（attempt `d1q02-kitcheck-009`）。
  - GREEN-2：fixture-smoke 全链路在 override 存在的环境中不受影响（`d1q02-kitcheck-010`：
    三维度 attempt+reject、`permission_denied`/`end_turn`、`coordinator_liveness_recorded:true`、
    零 canary 泄漏）。
- 清理：本轮全部 worktree（009/010）已 remove+prune；无 delegate-worker/fake-acp/kit 进程残留；
  既有 self-check 与失败日志全部保留。

## 四、P2 证据边界（已写入 README「P2 证据边界」节，不扩大机制）

- env-key wrapper 在 identity `--version` 探测时同样执行并覆盖式重写 dump；wrapper dump 单独不
  证明最终 Host 启动，最终 Host 启动事实须由 Root 结合 events.jsonl 的 initialize/session 流量、
  driver 终局与 receipt 共同核对。
- acpx 观察绑定 entry 文件 + 其解析的 package 元数据（name/version/package.json digest/realpath），
  不覆盖已安装 SDK 的每一个字节。
- 其余 review P2（Node engines、allow_project 标注、live conformance 重跑等）不在本 kit 范围，
  未自动修复。

## 五、未运行项

- 真实 ZCode qualification（zcode profile execute 半程）未运行，归 Root；009 只做 prepare。
- 产品 suite 未重跑（产品源码零改动）；未运行 npm pack/install/doctor；未提交、未安装、未改动
  profile 支持状态；历史 negative D1 证据原样未动。
- Root 命令与上轮 handover（`stage-b-kimi-kit-final-repair-handover.zh-CN.md` 第四节）一致，新增
  前提：环境中不得设置 truthy `UBP_DELEGATE_ZCODE_BIN`。
