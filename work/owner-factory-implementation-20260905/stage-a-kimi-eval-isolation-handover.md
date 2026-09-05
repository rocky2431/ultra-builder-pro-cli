# Stage A · A-R7 评测隔离修复交接（Kimi → Codex）

2026-09-05。写入者 Kimi；范围为 A-R7 评测隔离的局部修复，仅评测辅助代码，不是阶段 B 工厂实现。未启动任何 provider 或 nested agent；未触碰真实 HOME 业务数据、旧评测样例、事故证据或产品源码。

## 变更文件（全部新增，仅限授权路径）

- `work/owner-factory-implementation-20260905/eval-isolation/ubp-eval-sandbox.sh` — 启动包装器：生成 seatbelt profile 并经 `sandbox-exec` 执行评测命令。
- `work/owner-factory-implementation-20260905/eval-isolation/verify-isolation.sh` — 无害自验证：全部写入目标位于脚本自建临时父目录内，拒绝语义对 decoy home 证明，真实 HOME 不作为写入目标。
- `work/owner-factory-implementation-20260905/eval-isolation/README.md` — 英文操作说明、启动命令与精确限制。

未改动任何既有文件。

## 机制与平台观察（macOS 15.6.1，sandbox-exec 实测可用）

- `(deny default)` 烟雾测试：`execvp` 被拒（exit 71），证明本机 sandbox 非空转。
- 关键坑：首轮探测 profile 用 `/tmp/...` 字面路径时拒绝完全不生效——seatbelt 按内核规范化路径比较，`/tmp` 是 `/private/tmp` 的符号链接。修复为对所有 profile 路径做 `pwd -P` 规范化；最终验证 case 7 证明 alias 拼写同样被拒。
- 规则序：后匹配生效（deny 之后的 narrow allow 精确重开 `~/.zcode`），实测成立。
- 内核强制且子进程继承：嵌套 `sh`、`node`（评测真实运行时族）、`python3` 写入均 EPERM。
- 从允许根经符号链接逃逸到拒绝根：被拒（内核解析链接后比较）。
- 生成的生产 profile 形状（默认）：`(allow default)` + `deny file-write* (subpath "/Users/rocky243")` + `allow file-write* (subpath "/Users/rocky243/.zcode")`。包含关系不依赖 HOME 环境变量，因此覆盖 A-R7 的 pwd 回退机制（`env -u HOME` 下 `Path.home()` 实测仍解析为 `/Users/rocky243`，只读打印，无写入）。

## 验证结果（Codex 可独立复跑）

- `verify-isolation.sh`：exit 0，13 项期望全部 PASS——允许项目写入；拒绝根直写、嵌套 sh 子进程、node 子进程、缺 HOME 回退形状写入（目标为 decoy）、符号链接逃逸、/tmp alias 拼写均被拒且事后文件不存在；`.zcode` 窄例外写入成功；越根读取成功；无沙箱负对照写入成功（证明拒绝归因于沙箱）；decoy 根全局零散落文件。临时父目录已自动清理。
- 生产默认 profile 烟雾：eval 根（/tmp 下）写入成功；`--profile-out` 留存 profile 内容如上文；stderr 横幅记录 deny root/例外/命令，可作启动证据。
- 全程未以真实 HOME 为写入目标，未做哨兵探测；唯一真实 HOME 交互是只读 pwd 解析打印。

## 支持的启动路径（Codex 操作者）

```bash
# A. 包 agent-delegate 桥（其 node zcode.cjs 子进程继承沙箱）：
eval-isolation/ubp-eval-sandbox.sh \
  --profile-out /tmp/ubp-owner-journeys-<id>/eval-sandbox-profile.sb -- \
  agent-delegate run --to zcode --caller codex ...

# B. 直接包原生 CLI（如 native --resume 续轮）：
eval-isolation/ubp-eval-sandbox.sh \
  --profile-out /tmp/ubp-owner-journeys-<id>/eval-sandbox-profile.sb -- \
  /Users/rocky243/.hermes/node/bin/node \
  /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs --resume <session-id>
```

评测项目根与隔离插件 configDir 仍在 `/tmp/ubp-owner-journeys-<id>` 下，位于拒绝根之外，产品写入不受影响；provider 凭据读取保持默认允许。

## 限制（如实声明）

- 仅覆盖经包装器启动的进程树；已在运行的进程或单独启动的 ZCode.app GUI 不在覆盖内。
- 只拒绝对拒绝根（默认真实 HOME，扣除 `~/.zcode` 例外）的写入；读、网络、Keychain 不受影响。HOME 之外用户可写路径（如个别系统路径）不限制——超出 A-R7 事故类别，不声称更广覆盖。
- `~/.zcode` 因原生 session/log/tmp 缓存需要而重开；如需连 `~/.zcode/security` 写入也拒（凭据轮换保护），可在 allow 行后追加一行 deny，README 已给出——非默认，因为刷新写被拒会中断评测。
- 失败测试在沙箱下以 `Operation not permitted` 失败且不留文件；沙箱是测试外的纵深防御，不替代已修复的产品 HOME guard。
- 若未来 macOS 使 sandbox-exec 失效，最便宜备选是评测专用一次性本地用户账户（未构建：本机原生机制可用，且未获新身份授权）。

## 建议下一步

Codex 独立运行 `verify-isolation.sh` 并审查 profile 生成代码；通过后在包装器下进行真实 provider 资格运行，并把 `--profile-out` 留存的 profile 与 stderr 横幅作为该次启动的隔离证据归档。A-R7 的事故记录与前状态未知披露保持不变，本修复不修饰历史。
