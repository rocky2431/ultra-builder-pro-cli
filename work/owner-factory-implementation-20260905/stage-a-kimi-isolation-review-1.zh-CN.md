# A-R7 隔离初稿独立审查 — 需要修正

Codex 已先回读代码并独立运行 `verify-isolation.sh`，13 项预期通过；日志在 `.ultra/.runtime/owner-factory-implementation-20260905/stage-a-kimi-isolation-independent-initial.log`，初始三个文件及哈希冻结于同目录 `isolation-initial/`。内核路径规范化、子进程继承和符号链接拒绝已有实际无害证据，不重复否定这些结果。

剩余两项直接影响真实运行：

1. 默认放行整个 `~/.zcode` 不是“必要 session/log/tmp 窄例外”。已只读列举该目录：含 `security`、`skills`、`hooks`、`cli/config.json`、`cli/plugins`、`cli/memories`、其他工作区等。未实际调用 provider，不能声称整体放行因必要性已被证明。应优先使用 Host 已有独立 storage/log 路径，或仅放行有来源的具体缓存子目录；真实配置、权限和插件写入必须继续拒绝。
2. README 声称默认可包 `agent-delegate run`，但该 wrapper 在 provider 前会写自己的 run/request receipt，位置由 `_new_receipt_dir` 决定；它不在 `.zcode`。当前 profile 会拒绝这条正常启动路径。应提供可实际使用的临时 receipt/store 配置或准确且足够窄的缓存例外；未做实际 provider 资格前，启动说明只能称待资格。

源码线索：`agent-delegate-skill/.../agent_delegate.py:43-54,437-451` 支持 `AGENT_DELEGATION_HOME/CONFIG` 并在调用 ACPX 前创建 receipt；ZCode bundle 出现 `ZCODE_STORAGE_DIR`、`ZCODE_LOG_DIR`，共享 credential store 的 base 另由 `ZCODE_DATA_BASE_DIR` 参与解析。这些只证明有入口，不证明改变它们仍可使用现有认证；须读实际消费者，不复制/打印凭据，不重开整个 Host 根目录来掩盖缺口。

修正保持现有小包装器，不新增全局 daemon/身份/安装。无害验证须证明缓存写允许，而配置/skills/security 等相邻目录仍拒绝；provider 由 Codex 在源码核对后独立运行。每次真实运行记录实际 profile，不能将当前初稿 PASS 提升为 agent-delegate 或 native provider 资格。

## 修复后独立验收 — 2026-09-05

两项缺口已闭合。Kimi repair 1 回执 `d6ef467927234bdebaa08f11d572c468` 交回后，Codex 完整回读包装器与 metadata-only registry 生成器，并独立执行 24 项无害期待，exit 0。具名 7 个会话缓存可写；相邻配置、插件、安全路径、子进程、HOME 缺失后的系统回退、符号链接与别名路径均按预期处理。日志 `stage-a-kimi-isolation-independent-repair-1.log` 保留。测试中的“receipt-first launch”是形状检查，单独不作 provider 资格。

随后 Codex 以默认 profile 包住真实 `agent-delegate run --to zcode --caller codex`，正常使用原配置的 ZCode 0.16.5。回执 `b21bc13eddd640ad9ff2c4e4b7baa554` success/end_turn、50.278s；实际 Terminal 在临时 cwd 创建并读回 `native-launch-marker.txt`，Codex 再独立读回 `native-launch-ok`。wrapper receipt 确实写入临时 registry 指定位置，日志通过 ZCODE_LOG_DIR 转移。该调用没有触碰真实 HOME 写入探针。实际 profile、receipt、stderr 与 marker 均在 `/tmp/ubp-owner-journeys-ynsz0724/isolation*` 保存。

验收限于 A-R7 所需的评测启动隔离：仅覆盖经包装启动的进程及子进程对 HOME 的写入，含 7 个明确缓存例外；读、网络和其他可写系统路径不在本证明范围。它不宣称通用沙箱、任意 Host 效果资格或产品正确。旧 HOME 事故的未知前态仍是未知，不能由新隔离倒推完全恢复。包装器 SHA-256 `37099f574336b7b303b161cbe49a9130534c1787b71653ecba348de42a040813`；registry 生成器 `8f18c1c4ec76bcfa42cdea45fd78dfbf55a715fb6bef5b6a8dbe0ed680bb603b`。
