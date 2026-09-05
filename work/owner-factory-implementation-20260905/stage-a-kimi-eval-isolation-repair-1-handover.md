# A-R7 隔离修复 1 交接 — 按真实原生启动消费者收窄（Kimi）

委派：`d6ef467927234bdebaa08f11d572c468`（codex → kimi，terminal）。前序首个回执为 success/end_turn（delegation `90c506b1e1364063a983b57333f7e9cc`）。本回修 `stage-a-kimi-isolation-review-1.zh-CN.md` 的两项启动缺口；Codex 独立复现的 13 项无害预期证据保留，初始三文件冻结于 `.ultra/.runtime/owner-factory-implementation-20260905/isolation-initial/`（哈希已与 source-manifest.json 复核一致，未触碰）。

## 改动文件（我所有的写入范围，此外无其他写入）

- `work/owner-factory-implementation-20260905/eval-isolation/ubp-eval-sandbox.sh` — 收窄默认放行
- `work/owner-factory-implementation-20260905/eval-isolation/prepare-delegation-config.py` — 新增：隔离委派注册表生成器
- `work/owner-factory-implementation-20260905/eval-isolation/verify-isolation.sh` — 扩展同一可运行验证
- `work/owner-factory-implementation-20260905/eval-isolation/README.md` — 同步语义、启动合同与精确限制
- 本交接文件

未改动 ZCode 的产品源路径、CC 的 wake API 报告、任何旧 handover/证据/评审文件；未 commit；未安装包；未运行任何 provider 或新 agent；未重跑旧危险 HOME 测试；未写真实 HOME 数据或配置。

## 缺口 1：整个 `~/.zcode` 放行 → 七个有来源的会话缓存子目录

读了已安装 ZCode 0.16.5 bundle（`/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`）的实际消费者，并用 2026-09-05 真实 headless 会话的文件 mtime 交叉验证。默认 profile 现在是：deny 整个规范化 `$HOME`，仅放行七个具名缓存（last-match-wins 已验证）：

| 放行子路径 | bundle 消费者（偏移） | 必要性证据 |
|---|---|---|
| `.zcode/cli/rollout` | `SCo()` 硬编码 homedir（6869016） | 活跃会话 18:41 写 `model-io-sess_*.jsonl`；原生 `--resume` 续轮依赖 |
| `.zcode/cli/db` | `Q9e()` 硬编码 homedir（882501） | 18:41 写 `db.sqlite`/`-wal`（会话 store） |
| `.zcode/cli/exec` | `qK()`（1527271） | 18:41 写 `exec/sess_*`、`bash-startup`（Terminal 工具 shell 快照） |
| `.zcode/cli/artifacts` | `artifactStore` rootDir（11953323） | 18:32 写 `artifacts/sess_*`（工具输出/artifact 持久化） |
| `.zcode/cli/{image,pdf,video}-cache` | 同一 callsite 的缓存根（11953323） | 同一 pipeline 的媒体缓存根 |

继续拒绝（review 点名的相邻类）：`cli/config.json`（配置类，读不受影响）、`cli/plugins/**`（插件安装/注册；评测插件在测试根经项目 `plugins.dirs` 装载）、`.zcode/v2/**`（共享凭据 `resolveSharedZCodeCredentialsPath()`=`<ZCODE_DATA_BASE_DIR‖home>/.zcode/v2/credentials.json`，7175126；凭据读保留、刷新写拒绝——凭据变更属 Owner 未授权效果；telemetry 写失败被 CLI 容忍，`.catch` 回退，4686477）、`security/skills/hooks/agents/agent-memory/tmp/cache/clipboard/projects/workspace*/computer-use/logs`、`cli/sessions`（workflow 脚本，`lcn` 11926342）、`cli/debug`。`cli/context-mode` 与 `cli/agents` 今天虽被写，但在 headless bundle 中无任何路径字面量（桌面 App 状态），不放行；若资格验证证明另有必需缓存，用 `--allow-under-deny` 加单次来源说明，禁止回到裸 `.zcode`。

`ZCODE_STORAGE_DIR` 刻意不用：它会一并搬走 `agents`/`agent-memory`/`data` 的读取（3107、553210），改变评测须保持一致的 Host 能力；具名缓存是更小改动。

## 缺口 2：agent-delegate 先写 receipt 被默认 profile 阻断 → 现有 receipt/log 重定向设置

源码语义（`~/.claude/skills/agent-delegation/scripts/agent_delegate.py`）：`AGENT_DELEGATION_CONFIG` 改变注册表路径（48-54）；注册表 `receipt_root` 决定 `_new_receipt_dir`（255-265）；`run` 在调用 ACPX 之前写 `request.json`（438-456）。全局注册表内容纯元数据（schema_version、acpx 路径、receipt_root、runtime 固定、targets argv/版本），无任何凭据字段。修法：`prepare-delegation-config.py` 复制已安装注册表、只改写 `receipt_root` 到评测隔离根、0600 原子写出，并拒绝任何疑似秘密字段（token/secret/password/credential/api-key 命名）；启动合同导出 `AGENT_DELEGATION_CONFIG` 指向该隔离副本，全局注册表不变。日志经 `ZCODE_LOG_DIR`（`Jb()`，6933679，完整 log 目录覆盖）重定向到隔离根。两条都是 review 优先的“现有隔离设置”路径，不需要任何 HOME 例外。

## 平台观察与验证结果（全部无害）

- `verify-isolation.sh` 最终状态：**PASS，24 项预期全过**（decoy 父目录内：项目根允许；deny 根直写/嵌套 sh/node 子进程/missing-HOME fallback 形写全拒绝；5a 七个具名缓存允许；5b 相邻 config/plugins/security/skills/hooks/credentials 写全拒绝且预置文件内容不变；符号链接逃逸与“允许缓存内符号链接蹦床”全拒绝；/tmp 别名拼写拒绝；根外读允许；无沙箱负对照；profile 形状守卫：无裸 `.zcode`、恰 7 条 allow、deny 在 allow 前；隔离注册表端到端（改写 receipt_root、保留 targets、0600、秘密字段拒绝）；启动形状：receipt 先于 provider 形写，重定向 receipt/log 根 + 具名会话缓存全通）。真实 HOME 仅做一次只读 pwd fallback 解析打印。
- 真实形状证据（已清理的 /tmp 临时目录内完成）：生产 profile 实际生成为 deny `/Users/rocky243` + 上述七条 allow；对真实全局注册表运行生成器，与全局注册表 diff 仅 `receipt_root` 一行，输出 0600、receipt 目录 0700。

## 支持的启动路径（Codex 操作员）

```bash
EVAL=/tmp/ubp-owner-journeys-<id>; ISO="$EVAL/isolation"
python3 .../eval-isolation/prepare-delegation-config.py --receipt-root "$ISO/receipts" --out "$ISO/agent-delegation.config.json"
export AGENT_DELEGATION_CONFIG="$ISO/agent-delegation.config.json" ZCODE_LOG_DIR="$ISO/zcode-logs"
.../eval-isolation/ubp-eval-sandbox.sh --profile-out "$ISO/eval-sandbox-profile.sb" -- agent-delegate run --to zcode --caller codex ...
# 原生续轮（已验证续传 transport）：同一 wrapper -- node zcode.cjs --resume <session-id>
```

## 精确限制（不声称 live 资格）

- 只覆盖经 wrapper 启动的进程及其子进程；已在运行的进程和单独启动的 ZCode.app GUI 不在内。
- 只阻断 deny 根（默认真实 HOME，减七个具名缓存）下的写；读、网络、Keychain 刻意不受影响——不是读/网络 containment，不得如此声称；HOME 外可写路径不在 A-R7 事故类内，不限制。
- 凭据刷新写（`~/.zcode/v2`）按设计拒绝：运行前刷新 provider 凭据；中途刷新会以 EPERM 失败该次运行。telemetry 写拒绝被 CLI 容忍（源码 `.catch`）。
- `cli/config.json` 写按设计拒绝；CLI 若中途尝试配置迁移/修改会暴露 EPERM（评测排除配置变更的意图行为）。
- 插件 runtime data（`ZCODE_PLUGIN_DATA`，如 `~/.zcode/cli/plugins/data/...`）保持拒绝；随附 UBP hooks 只观察、写项目内。若资格验证证明需要，单次加 `--allow-under-deny "$HOME/.zcode/cli/plugins/data"` 并记录理由。
- 每次真实运行须记录实际使用的 profile（`--profile-out`）；本 PASS 不提升为 agent-delegate 或 native provider 资格——provider 由 Codex 读最终代码与无害验证后独立资格验证。
- `sandbox-exec` 已被 Apple 标弃用但在本机（macOS 15.6.1）验证可用；若未来 macOS 静默失效，最便宜替代是评测专用一次性本地用户（未建，因为原生机制可用且未授权新身份）。

## 后续

Codex：读最终代码 + 独立重跑 `verify-isolation.sh`，再按上述启动合同对真实 provider 做资格验证并记录实际 profile。
